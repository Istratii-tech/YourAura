package io.github.istratiitech.youraura;

import android.Manifest;
import android.app.Activity;
import android.content.ClipData;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.media.AudioManager;
import android.media.projection.MediaProjectionConfig;
import android.media.projection.MediaProjectionManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.webkit.ConsoleMessage;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.webkit.WebViewAssetLoader;

import org.json.JSONObject;

// The whole interface is the site (public/), served from the APK's assets at an https origin so that
// IndexedDB, WebRTC and crypto.subtle work as on GitHub Pages. The page keeps running with the screen off:
// the WebView is never paused, and HubService keeps the process alive while the phone hosts a room.
// While it hosts, LanServer also serves the room to the Wi-Fi network, like the desktop hub (server.mjs).
public class MainActivity extends Activity {
    static final String TAG = "YourAura";
    static final String HOST = "appassets.androidplatform.net";
    private static final int PICK_FILES = 1, CONSENT = 2, MIC = 3;

    private WebView web;
    private ValueCallback<Uri[]> picked;
    // The room outlives an activity: the launcher may replace a just-started one, and the hub, its Wi-Fi server
    // and a broadcast must not stop or move to another port because of that. So they belong to the process.
    private static String hosting = "";
    private static volatile LanServer lan;
    private static volatile MainActivity current;   // the activity on screen; the page there gets the messages
    private boolean destroyed;
    private final Handler main = new Handler(Looper.getMainLooper());
    private boolean inCall;
    private int volume = -1;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        current = this;
        WebView.setWebContentsDebuggingEnabled((getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0);
        web = new WebView(this);
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);

        WebViewAssetLoader assets = new WebViewAssetLoader.Builder()
                .addPathHandler("/media/", new WebViewAssetLoader.InternalStoragePathHandler(this, LanServer.mediaDir(this)))
                .addPathHandler("/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();
        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return assets.shouldInterceptRequest(request.getUrl());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                if (!request.isForMainFrame() || HOST.equals(request.getUrl().getHost())) return false;
                try { startActivity(new Intent(Intent.ACTION_VIEW, request.getUrl())); } catch (Exception ignored) {}
                return true;   // other sites (the app's release page, YouTube) open in the browser
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (picked != null) picked.onReceiveValue(null);
                picked = callback;
                Intent i = params.createIntent();
                i.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, params.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE);
                try {
                    startActivityForResult(i, PICK_FILES);
                } catch (Exception e) {
                    picked = null;
                    return false;
                }
                return true;
            }

            @Override
            public boolean onConsoleMessage(ConsoleMessage m) {
                Log.d(TAG, m.message() + " (" + m.sourceId() + ":" + m.lineNumber() + ")");
                return true;
            }
        });
        web.addJavascriptInterface(new AppBridge(this), "YourAuraApp");
        web.loadUrl("https://" + HOST + "/index.html");
        onShare(getIntent());
        watchCalls();
        Broadcast.setOnChange(() -> toPage("__yaApp.broadcast && __yaApp.broadcast(" + Broadcast.isOn() + ")"));
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        onShare(intent);
    }

    // «Поделиться» → YourAura: the page adds the link as if it were pasted.
    private void onShare(Intent intent) {
        if (intent == null || !Intent.ACTION_SEND.equals(intent.getAction())) return;
        String text = intent.getStringExtra(Intent.EXTRA_TEXT);
        if (text != null) js("__yaApp.share(" + JSONObject.quote(text) + ")");
    }

    // A call (or ringing, or a messenger call) is on while the audio mode says so. Polling works on every
    // Android version and costs nothing; the page decides what to do (see __yaApp.call in app.js).
    // The same loop tells the page the phone's media volume (shown during a broadcast).
    private void watchCalls() {
        AudioManager audio = getSystemService(AudioManager.class);
        main.postDelayed(new Runnable() {
            @Override
            public void run() {
                int mode = audio.getMode();
                boolean call = mode == AudioManager.MODE_RINGTONE || mode == AudioManager.MODE_IN_CALL
                        || mode == AudioManager.MODE_IN_COMMUNICATION || mode == AudioManager.MODE_CALL_SCREENING;
                if (call != inCall) {
                    inCall = call;
                    js("__yaApp.call(" + call + ")");
                }
                int v = mediaVolume(audio);
                if (v != volume) {
                    volume = v;
                    js("__yaApp.volume && __yaApp.volume(" + v + ")");
                }
                if (web != null) main.postDelayed(this, 1000);
            }
        }, 1000);
    }

    // Media volume of the phone in percent, for the output in use now (speaker, headphones, Bluetooth).
    static int mediaVolume(AudioManager audio) {
        int max = audio.getStreamMaxVolume(AudioManager.STREAM_MUSIC);
        return max > 0 ? Math.round(100f * audio.getStreamVolume(AudioManager.STREAM_MUSIC) / max) : 0;
    }

    // Called by the page through AppBridge: a room code while this phone hosts a room, "" when it stops.
    // The Wi-Fi hub is up before this returns, so the page can tell its address right away.
    void setHosting(String code) {
        synchronized (MainActivity.class) {
            // The page of a closed activity can still call in (the launcher may replace a just-started one).
            if (destroyed || code.equals(hosting)) return;
            hosting = code;
            if (code.isEmpty()) {
                Broadcast.stop();
                if (lan != null) lan.stop();
                lan = null;
                HubService.stop(this);
                return;
            }
            if (lan == null) {   // one Wi-Fi hub for whatever room the page hosts
                lan = new LanServer(getApplicationContext());
                lan.start();
            }
        }
        runOnUiThread(() -> {
            if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 0);
            }
        });
        startForegroundService(new Intent(this, HubService.class).putExtra(HubService.EXTRA_CODE, code));
    }

    static LanServer lan() {
        return lan;
    }

    // Script for the page on screen, from anywhere (LanServer, Broadcast, downloads).
    static void toPage(String code) {
        MainActivity a = current;
        if (a != null) a.js(code);
    }

    // Broadcast mode, from the page's button: the microphone permission (Android requires it for playback
    // capture, nothing is recorded from the mic), then the system's screen-sharing prompt, then HubService.
    void setBroadcast(boolean on) {
        if (!on) {
            Broadcast.stop();
            return;
        }
        if (hosting.isEmpty() || Broadcast.isOn()) return;
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, MIC);
            return;
        }
        MediaProjectionManager pm = getSystemService(MediaProjectionManager.class);
        Intent ask = Build.VERSION.SDK_INT >= 34
                ? pm.createScreenCaptureIntent(MediaProjectionConfig.createConfigForDefaultDisplay())   // the whole phone, not one app
                : pm.createScreenCaptureIntent();
        startActivityForResult(ask, CONSENT);
    }

    @Override
    public void onRequestPermissionsResult(int request, String[] permissions, int[] results) {
        if (request != MIC) return;
        if (results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED) setBroadcast(true);
        else js("__yaApp.broadcast && __yaApp.broadcast(false, 'mic')");
    }

    // Script for the page, from any thread; quiet if the page has not defined __yaApp yet.
    void js(String code) {
        main.post(() -> {
            if (web != null) web.evaluateJavascript("window.__yaApp && " + code, null);
        });
    }

    @Override
    protected void onActivityResult(int request, int result, Intent data) {
        if (request == CONSENT) {
            if (result == RESULT_OK && data != null) {
                startForegroundService(new Intent(this, HubService.class)
                        .putExtra(HubService.EXTRA_CONSENT, data).putExtra(HubService.EXTRA_RESULT, result));
            } else {
                js("__yaApp.broadcast && __yaApp.broadcast(false, 'cancel')");
            }
            return;
        }
        if (request != PICK_FILES || picked == null) {
            super.onActivityResult(request, result, data);
            return;
        }
        Uri[] uris = null;
        if (result == RESULT_OK && data != null) {
            ClipData clip = data.getClipData();
            if (clip != null) {
                uris = new Uri[clip.getItemCount()];
                for (int i = 0; i < uris.length; i++) uris[i] = clip.getItemAt(i).getUri();
            } else if (data.getData() != null) {
                uris = new Uri[]{data.getData()};
            }
        }
        picked.onReceiveValue(uris);
        picked = null;
    }

    // Back leaves the room playing: the app goes to the background instead of closing.
    @Override
    public void onBackPressed() {
        if (hosting.isEmpty()) super.onBackPressed();
        else moveTaskToBack(true);
    }

    @Override
    protected void onDestroy() {
        synchronized (MainActivity.class) {
            destroyed = true;
            if (current == this) {   // not replaced by a new activity: the room ends with it
                current = null;
                Broadcast.stop();
                if (lan != null) lan.stop();
                lan = null;
                hosting = "";
                HubService.stop(this);
            }
        }
        main.removeCallbacksAndMessages(null);
        web.destroy();
        web = null;
        super.onDestroy();
    }
}
