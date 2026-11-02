package io.github.istratiitech.youraura;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.net.wifi.WifiManager;
import android.graphics.drawable.Icon;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.util.Log;

// While the phone hosts a room: a foreground service keeps the process (and the page in it) alive,
// the CPU awake with the screen off and Wi-Fi at full speed, so the other devices keep getting music.
// Its notification also tells about a broadcast and stops it for the whole room.
public class HubService extends Service {
    static final String EXTRA_CODE = "code";
    static final String EXTRA_STOP = "stop";
    static final String EXTRA_CONSENT = "consent", EXTRA_RESULT = "result";   // screen-sharing consent for Broadcast
    private static final String STOP_BROADCAST = "io.github.istratiitech.youraura.STOP_BROADCAST";   // notification button
    static volatile boolean foreground;   // startForeground has run (until onDestroy)
    private static final String CHANNEL = "hub";

    private PowerManager.WakeLock cpu;
    private WifiManager.WifiLock wifi;

    private static String code = "";
    private static volatile HubService running;

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && intent.getStringExtra(EXTRA_CODE) != null) code = intent.getStringExtra(EXTRA_CODE);
        @SuppressWarnings("deprecation")   // the typed form needs Android 13
        Intent consent = intent != null ? intent.getParcelableExtra(EXTRA_CONSENT) : null;
        running = this;
        if (intent != null && STOP_BROADCAST.equals(intent.getAction())) Broadcast.stop();
        // Capturing other apps' sound needs the media-projection type, and it must be in place before Broadcast starts.
        show(consent != null || Broadcast.isOn());
        foreground = true;
        if (consent != null) {
            try {
                Broadcast.start(this, intent.getIntExtra(EXTRA_RESULT, 0), consent);
            } catch (Exception e) {
                Log.w(MainActivity.TAG, "broadcast", e);
                Broadcast.stop();
            }
        }
        if (intent != null && intent.getBooleanExtra(EXTRA_STOP, false)) {   // see stop(); a newer start wins
            stopSelf(startId);
            return START_NOT_STICKY;
        }

        if (cpu == null) {
            cpu = getSystemService(PowerManager.class).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "YourAura:hub");
            cpu.acquire();
            wifi = getSystemService(WifiManager.class).createWifiLock(WifiManager.WIFI_MODE_FULL_LOW_LATENCY, "YourAura:hub");
            wifi.acquire();
        }
        return START_NOT_STICKY;   // without the page there is no room to keep alive
    }

    // The notification: the room, and while a broadcast runs, that it runs and a button to stop it for everyone.
    private void show(boolean broadcast) {
        NotificationManager nm = getSystemService(NotificationManager.class);
        nm.createNotificationChannel(new NotificationChannel(CHANNEL, getString(R.string.channel_hub), NotificationManager.IMPORTANCE_LOW));
        PendingIntent open = PendingIntent.getActivity(this, 0, new Intent(this, MainActivity.class), PendingIntent.FLAG_IMMUTABLE);
        Notification.Builder n = new Notification.Builder(this, CHANNEL)
                .setSmallIcon(R.drawable.ic_note)
                .setContentTitle(getString(broadcast ? R.string.hub_title_live : R.string.hub_title, code))
                .setContentText(getString(broadcast ? R.string.hub_text_live : R.string.hub_text))
                .setContentIntent(open)
                .setOngoing(true);
        if (broadcast) {
            PendingIntent stop = PendingIntent.getService(this, 1, new Intent(this, HubService.class).setAction(STOP_BROADCAST),
                    PendingIntent.FLAG_IMMUTABLE);
            n.addAction(new Notification.Action.Builder(Icon.createWithResource(this, R.drawable.ic_note),
                    getString(R.string.stop_broadcast), stop).build());
        }
        startForeground(1, n.build(), ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK
                | (broadcast ? ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION : 0));
    }

    // Broadcast started or stopped: the notification follows.
    static void refresh() {
        HubService s = running;
        if (s != null) new Handler(Looper.getMainLooper()).post(() -> {
            if (running == s) s.show(Broadcast.isOn());
        });
    }

    // A service asked to start must reach startForeground before it may stop, or Android kills the app.
    // Not foreground yet: the stop goes through onStartCommand, which goes foreground first.
    static void stop(Context c) {
        if (foreground) c.stopService(new Intent(c, HubService.class));
        else c.startForegroundService(new Intent(c, HubService.class).putExtra(EXTRA_STOP, true));
    }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        stopSelf();
    }

    @Override
    public void onDestroy() {
        foreground = false;
        running = null;
        Broadcast.stop();
        if (cpu != null) cpu.release();
        if (wifi != null) wifi.release();
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
