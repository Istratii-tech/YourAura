package io.github.istratiitech.youraura;

import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.media.AudioFormat;
import android.media.AudioPlaybackCaptureConfiguration;
import android.media.AudioRecord;
import android.media.projection.MediaProjection;
import android.media.projection.MediaProjectionManager;
import android.os.Handler;
import android.os.Looper;
import android.os.Process;
import android.util.Log;

import java.nio.ByteBuffer;
import java.nio.ByteOrder;

// Broadcast mode: what other apps on the phone play (music, video, games) is captured and sent to the room,
// where every device plays it at the same moment. Android 10+ playback capture, allowed by the user through
// the screen-sharing prompt. This app itself is left out, or the room's own sound would come back round.
//
// Each packet: float64 hub time of its first sample (ms, see LanServer.now), int32 sample frames, then
// 16-bit little-endian stereo PCM at 48 kHz. LanServer sends packets to the devices (/api/live).
final class Broadcast {
    static final int RATE = 48000, CHANNELS = 2, CHUNK_MS = 50;
    private static final int FRAMES = RATE * CHUNK_MS / 1000;

    interface Sink {
        void packet(byte[] p);
    }

    private static volatile Sink sink;
    private static volatile Runnable onChange;
    private static MediaProjection projection;
    private static AudioRecord record;
    private static volatile boolean on;
    static volatile float level;   // peak of the last second, 0..1

    static void setSink(Sink s) {
        sink = s;
    }

    static void setOnChange(Runnable r) {
        onChange = r;
    }

    static boolean isOn() {
        return on;
    }

    // Called by HubService once it runs as a media-projection service (Android requires that order).
    static synchronized void start(Context c, int resultCode, Intent consent) {
        stop();
        MediaProjectionManager pm = c.getSystemService(MediaProjectionManager.class);
        projection = pm.getMediaProjection(resultCode, consent);
        projection.registerCallback(new MediaProjection.Callback() {
            @Override
            public void onStop() {   // the user stopped sharing from the status bar
                stop();
            }
        }, new Handler(Looper.getMainLooper()));
        AudioPlaybackCaptureConfiguration config = new AudioPlaybackCaptureConfiguration.Builder(projection)
                .addMatchingUsage(AudioAttributes.USAGE_MEDIA)
                .addMatchingUsage(AudioAttributes.USAGE_GAME)
                .addMatchingUsage(AudioAttributes.USAGE_UNKNOWN)
                .excludeUid(Process.myUid())
                .build();
        AudioFormat format = new AudioFormat.Builder()
                .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                .setSampleRate(RATE)
                .setChannelMask(AudioFormat.CHANNEL_IN_STEREO)
                .build();
        int min = AudioRecord.getMinBufferSize(RATE, AudioFormat.CHANNEL_IN_STEREO, AudioFormat.ENCODING_PCM_16BIT);
        //noinspection MissingPermission — MainActivity asks for RECORD_AUDIO before the screen-sharing prompt
        record = new AudioRecord.Builder()
                .setAudioFormat(format)
                .setBufferSizeInBytes(Math.max(min, FRAMES * CHANNELS * 2 * 8))
                .setAudioPlaybackCaptureConfig(config)
                .build();
        record.startRecording();
        on = true;
        AudioRecord r = record;
        new Thread(() -> pump(r), "broadcast").start();
        changed();
    }

    static synchronized void stop() {
        if (!on && projection == null) return;
        on = false;
        if (record != null) {
            try { record.stop(); } catch (Exception ignored) {}
            record.release();
            record = null;
        }
        if (projection != null) {
            projection.stop();
            projection = null;
        }
        changed();
    }

    private static void changed() {
        HubService.refresh();
        Runnable r = onChange;
        if (r != null) r.run();
    }

    private static void pump(AudioRecord r) {
        Process.setThreadPriority(Process.THREAD_PRIORITY_URGENT_AUDIO);
        short[] pcm = new short[FRAMES * CHANNELS];
        long frames = 0;
        double t0 = -1;
        float peak = 0;
        long peakSince = System.currentTimeMillis();
        while (on) {
            int got = 0;
            while (got < pcm.length && on) {
                int n = r.read(pcm, got, pcm.length - got);
                if (n < 0) return;
                got += n;
            }
            if (!on) return;
            // The chunk began CHUNK_MS before it was read; timestamps follow the sample count and are
            // re-anchored to the hub clock only if the two drift apart.
            double start = LanServer.now() - CHUNK_MS, bySamples = t0 + frames * 1000.0 / RATE;
            if (t0 < 0 || Math.abs(bySamples - start) > 20) {
                t0 = start - frames * 1000.0 / RATE;
                bySamples = start;
            }
            frames += FRAMES;
            ByteBuffer b = ByteBuffer.allocate(12 + pcm.length * 2).order(ByteOrder.LITTLE_ENDIAN);
            b.putDouble(bySamples).putInt(FRAMES);
            for (short v : pcm) {
                b.putShort(v);
                float a = Math.abs(v / 32768f);
                if (a > peak) peak = a;
            }
            if (System.currentTimeMillis() - peakSince >= 1000) {
                level = peak;
                Log.d(MainActivity.TAG, "broadcast level " + peak);
                peak = 0;
                peakSince = System.currentTimeMillis();
            }
            Sink s = sink;
            if (s != null) s.packet(b.array());
        }
    }
}
