package io.github.istratiitech.youraura;

import android.content.Context;
import android.media.MediaCodec;
import android.media.MediaExtractor;
import android.media.MediaFormat;
import android.media.MediaMuxer;
import android.util.Log;

import com.yausername.youtubedl_android.YoutubeDL;
import com.yausername.youtubedl_android.YoutubeDLRequest;
import com.yausername.youtubedl_android.YoutubeDLResponse;

import org.json.JSONObject;

import java.io.File;
import java.io.FileInputStream;
import java.io.InputStream;
import java.nio.ByteBuffer;
import java.security.MessageDigest;
import java.util.regex.Pattern;

import kotlin.Unit;

// Sound from YouTube with yt-dlp (youtubedl-android: Python, yt-dlp and QuickJS for YouTube's
// JavaScript challenges). Same request as server.mjs; the file goes straight into the room's library (files/media).
final class YouTubeAudio {
    private static final Pattern FILE = Pattern.compile("dl-[A-Za-z0-9_-]{11}\\.(m4a|webm|opus|mp3)");

    interface Progress {
        void on(float part);
    }

    private static boolean ready;

    static File dir(Context c) {
        File d = new File(c.getCacheDir(), "yt");
        //noinspection ResultOfMethodCallIgnored
        d.mkdirs();
        return d;
    }

    // yt-dlp has to keep up with YouTube, so the copy inside the APK is brought up to date first
    // (once per start of the app; without internet the bundled one is tried anyway).
    private static synchronized void init(Context c) throws Exception {
        if (ready) return;
        YoutubeDL.getInstance().init(c);
        try {
            YoutubeDL.getInstance().updateYoutubeDL(c, YoutubeDL.UpdateChannel._STABLE);
        } catch (Throwable e) {
            Log.w(MainActivity.TAG, "yt-dlp update failed", e);
        }
        Log.i(MainActivity.TAG, "yt-dlp " + YoutubeDL.getInstance().versionName(c));
        ready = true;
    }

    static JSONObject download(Context c, String videoId, Progress progress) throws Exception {
        init(c);
        File dir = dir(c);
        YoutubeDLRequest r = new YoutubeDLRequest("https://www.youtube.com/watch?v=" + videoId);
        r.addOption("--no-playlist");
        r.addOption("--newline");
        r.addOption("--progress");
        r.addOption("--no-simulate");
        r.addOption("--no-warnings");
        r.addOption("-f", "bestaudio[ext=m4a]/bestaudio");   // m4a (AAC) распаковывают все браузеры, включая Safari
        r.addOption("-o", new File(dir, "dl-" + videoId + ".%(ext)s").getAbsolutePath());
        r.addOption("--print", "after_move:J%(.{title,uploader,duration,filepath,ext})j");
        YoutubeDLResponse res = YoutubeDL.getInstance().execute(r, "yt-" + videoId, (percent, eta, line) -> {
            if (percent >= 0) progress.on(Math.min(1f, percent / 100f));
            return Unit.INSTANCE;
        });
        JSONObject meta = null;
        for (String line : res.getOut().split("\n")) {
            if (line.startsWith("J{")) meta = new JSONObject(line.substring(1));
        }
        if (meta == null) throw new Exception("yt-dlp не сказал, куда сохранил файл");
        File file = new File(meta.getString("filepath"));
        if (!dir.equals(file.getParentFile()) || !FILE.matcher(file.getName()).matches()) throw new Exception("неожиданный файл " + file.getName());
        if (file.getName().endsWith(".m4a")) plainMp4(file);
        // Into the room's library under its hash, like any other file (the same sound twice is one file).
        String hash = hash(file);
        long size = file.length();
        File dest = new File(LanServer.mediaDir(c), hash);
        if (dest.exists() || !file.renameTo(dest)) {
            //noinspection ResultOfMethodCallIgnored
            file.delete();
        }
        return new JSONObject()
                .put("hash", hash)
                .put("size", size)
                .put("ext", meta.optString("ext"))
                .put("title", meta.optString("title", ""))
                .put("uploader", meta.optString("uploader", ""))
                .put("duration", meta.optDouble("duration", 0));
    }

    private static String hash(File f) throws Exception {
        MessageDigest sha = MessageDigest.getInstance("SHA-256");
        try (InputStream in = new FileInputStream(f)) {
            byte[] buf = new byte[1 << 16];
            int n;
            while ((n = in.read(buf)) > 0) sha.update(buf, 0, n);
        }
        return LanServer.hex(sha.digest()).substring(0, 16);
    }

    // YouTube's m4a is fragmented MP4 (DASH); not every browser decodes that. The desktop hub fixes it
    // with ffmpeg, here Android's own muxer rewrites it as a plain MP4 without touching the sound.
    private static void plainMp4(File file) {
        File tmp = new File(file.getPath() + ".tmp");
        MediaExtractor in = new MediaExtractor();
        MediaMuxer out = null;
        try {
            in.setDataSource(file.getPath());
            int track = -1;
            for (int i = 0; i < in.getTrackCount() && track < 0; i++) {
                String mime = in.getTrackFormat(i).getString(MediaFormat.KEY_MIME);
                if (mime != null && mime.startsWith("audio/")) track = i;
            }
            if (track < 0) return;
            in.selectTrack(track);
            MediaFormat format = in.getTrackFormat(track);
            out = new MediaMuxer(tmp.getPath(), MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4);
            int t = out.addTrack(format);
            out.start();
            ByteBuffer buf = ByteBuffer.allocate(format.containsKey(MediaFormat.KEY_MAX_INPUT_SIZE)
                    ? format.getInteger(MediaFormat.KEY_MAX_INPUT_SIZE) : 1 << 20);
            MediaCodec.BufferInfo info = new MediaCodec.BufferInfo();
            while ((info.size = in.readSampleData(buf, 0)) >= 0) {
                info.offset = 0;
                info.presentationTimeUs = in.getSampleTime();
                info.flags = (in.getSampleFlags() & MediaExtractor.SAMPLE_FLAG_SYNC) != 0 ? MediaCodec.BUFFER_FLAG_KEY_FRAME : 0;
                out.writeSampleData(t, buf, info);
                in.advance();
            }
            out.stop();
            if (!tmp.renameTo(file)) throw new Exception("rename");
        } catch (Exception e) {
            Log.w(MainActivity.TAG, "m4a kept as downloaded", e);   // the original still plays in most browsers
        } finally {
            in.release();
            if (out != null) try { out.release(); } catch (Exception ignored) {}
            //noinspection ResultOfMethodCallIgnored
            tmp.delete();
        }
    }

    // The last ERROR line of yt-dlp, in words for the page (same wording as server.mjs).
    static String explain(Throwable e) {
        String text = String.valueOf(e.getMessage()), err = null;
        for (String line : text.split("\n")) if (line.startsWith("ERROR")) err = line;
        if (err == null) err = text.length() > 200 ? text.substring(0, 200) : text;
        if (err.contains("not a bot") || err.contains("Sign in")) {
            return "YouTube отдаёт это видео только после входа (адрес телефона похож на VPN или хостинг)";
        }
        return err.replaceFirst("^ERROR:\\s*(\\[[^\\]]+\\]\\s*)*", "");
    }
}
