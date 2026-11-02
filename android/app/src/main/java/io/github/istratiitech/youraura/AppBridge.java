package io.github.istratiitech.youraura;

import android.webkit.JavascriptInterface;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.regex.Pattern;

// window.YourAuraApp in the page (see `app` in net.mjs). Every frame of the page can reach it,
// so each argument is checked before it touches anything.
final class AppBridge {
    private static final Pattern VIDEO_ID = Pattern.compile("[A-Za-z0-9_-]{11}");
    private static final Pattern CODE = Pattern.compile("[A-Z0-9]{0,12}");
    private static final Pattern HASH = Pattern.compile("[0-9a-f]{16}");
    private static final Pattern CLIENT = Pattern.compile("[A-Za-z0-9_-]{1,64}");
    private static final Pattern EVENT = Pattern.compile("[a-z]{1,20}");

    private final MainActivity activity;
    // commons-io inside youtubedl-android needs a context class loader, which pool threads lack on Android.
    private final ExecutorService downloads = Executors.newSingleThreadExecutor((r) -> {
        Thread t = new Thread(r, "yt-dlp");
        t.setContextClassLoader(AppBridge.class.getClassLoader());
        return t;
    });

    AppBridge(MainActivity activity) {
        this.activity = activity;
    }

    @JavascriptInterface
    public void hosting(String code) {
        if (code != null && CODE.matcher(code).matches()) activity.setHosting(code);
    }

    // Broadcast mode on or off (the page's button); the answer comes as __yaApp.broadcast(on, error).
    @JavascriptInterface
    public void broadcast(boolean on) {
        activity.runOnUiThread(() -> activity.setBroadcast(on));
    }

    @JavascriptInterface
    public boolean broadcasting() {
        return Broadcast.isOn();
    }

    // The phone's media volume in percent; changes come as __yaApp.volume(percent).
    @JavascriptInterface
    public int volume() {
        return MainActivity.mediaVolume(activity.getSystemService(android.media.AudioManager.class));
    }

    // The hub's clock, shared with /api/time of the Wi-Fi hub.
    @JavascriptInterface
    public double now() {
        return LanServer.now();
    }

    // { port, token, urls } of the Wi-Fi hub while the phone hosts a room, else {}.
    @JavascriptInterface
    public String lan() {
        LanServer lan = MainActivity.lan();
        if (lan == null || lan.port() == 0) return "{}";
        try {
            return new JSONObject().put("port", lan.port()).put("token", lan.token).put("urls", new JSONArray(lan.urls())).toString();
        } catch (Exception e) {
            return "{}";
        }
    }

    // A hub event for a device connected over Wi-Fi.
    @JavascriptInterface
    public void send(String clientId, String event, String data) {
        LanServer lan = MainActivity.lan();
        if (lan != null && clientId != null && CLIENT.matcher(clientId).matches() && event != null && EVENT.matcher(event).matches()
                && data != null && !data.contains("\n")) {
            lan.send(clientId, event, data);
        }
    }

    // The page's answer to a question of the Wi-Fi hub (an upload, a YouTube link).
    @JavascriptInterface
    public void answer(int id, String json) {
        LanServer lan = MainActivity.lan();
        if (lan != null && json != null) lan.answer(id, json);
    }

    // Which file each track plays, so the Wi-Fi hub can serve /media/<track id>.
    @JavascriptInterface
    public void tracks(String json) {
        LanServer lan = MainActivity.lan();
        if (lan != null && json != null) lan.setTracks(json);
    }

    @JavascriptInterface
    public void dropFile(String hash) {
        if (hash == null || !HASH.matcher(hash).matches()) return;
        //noinspection ResultOfMethodCallIgnored
        new File(LanServer.mediaDir(activity), hash).delete();
    }

    // Answers with __yaApp.reply(id, { hash, size, ext, title, uploader, duration } | { error }).
    @JavascriptInterface
    public void download(int id, String videoId) {
        if (videoId == null || !VIDEO_ID.matcher(videoId).matches()) {
            reply(id, error("не тот id видео"));
            return;
        }
        downloads.execute(() -> {
            JSONObject r;
            try {
                r = YouTubeAudio.download(activity, videoId, (p) -> MainActivity.toPage("__yaApp.progress(" + id + "," + p + ")"));
            } catch (Throwable e) {   // a broken download must never take the room down with it
                r = error(YouTubeAudio.explain(e));
            }
            reply(id, r);
        });
    }

    private void reply(int id, JSONObject r) {
        MainActivity.toPage("__yaApp.reply(" + id + "," + r + ")");
    }

    private static JSONObject error(String message) {
        try {
            return new JSONObject().put("error", message);
        } catch (Exception e) {
            return new JSONObject();
        }
    }
}
