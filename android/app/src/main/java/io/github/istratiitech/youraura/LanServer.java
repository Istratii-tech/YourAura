package io.github.istratiitech.youraura;

import android.content.Context;
import android.content.res.AssetManager;
import android.os.SystemClock;
import android.util.Log;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.NetworkInterface;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.Base64;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

// The room's hub for devices in the same Wi-Fi network: the same HTTP + SSE API as server.mjs, so any browser
// can open http://<phone>:8600 without internet or GitHub. The hub itself (core/hub.mjs) stays in the page;
// this server only carries requests to it (__yaApp.lan in net.mjs) and its events back to the devices.
// Music files of the room live in files/media/<hash>: the page reads them at /media/, devices here.
// In broadcast mode /api/live carries the captured sound (Broadcast.java) to the devices and the page.
// Both streams work as WebSockets too: some VPNs, proxies and traffic filters hold any streamed HTTP answer
// until it ends, so a device behind one never hears from the hub; they let WebSockets through.
final class LanServer {
    private static final int[] PORTS = {8600, 8601, 8602, 8603, 8604};
    private static final long MAX_UPLOAD = 500L * 1024 * 1024;
    private static final Map<String, String> MIME = new HashMap<>();
    static {
        MIME.put("html", "text/html; charset=utf-8");
        MIME.put("js", "text/javascript; charset=utf-8");
        MIME.put("mjs", "text/javascript; charset=utf-8");
        MIME.put("css", "text/css; charset=utf-8");
        MIME.put("svg", "image/svg+xml");
        MIME.put("json", "application/json; charset=utf-8");
        MIME.put("png", "image/png");
        MIME.put("mp4", "video/mp4");
    }

    // Hub clock: one monotonic timeline (ms, epoch-like) for the page and for /api/time.
    private static final double CLOCK_BASE = System.currentTimeMillis() - SystemClock.elapsedRealtimeNanos() / 1e6;

    static double now() {
        return CLOCK_BASE + SystemClock.elapsedRealtimeNanos() / 1e6;
    }

    static File mediaDir(Context c) {
        File d = new File(c.getFilesDir(), "media");
        //noinspection ResultOfMethodCallIgnored
        d.mkdirs();
        return d;
    }

    private final Context context;
    private final AssetManager assets;
    private final File media;
    final String token;   // the page's own requests (/app/put) carry it
    private ServerSocket server;
    private final ExecutorService pool = Executors.newCachedThreadPool();
    private final Map<String, Sink> streams = new ConcurrentHashMap<>();   // client id -> its events
    private final Map<Integer, CompletableFuture<String>> waits = new ConcurrentHashMap<>();
    private final java.util.Set<Listener> listeners = ConcurrentHashMap.newKeySet();   // /api/live

    // A device's open stream: SSE in HTTP chunks, or a WebSocket.
    private static final class Sink {
        final OutputStream out;
        final boolean ws;

        Sink(OutputStream out, boolean ws) {
            this.out = out;
            this.ws = ws;
        }
    }

    private static final class Listener {
        final java.util.concurrent.ArrayBlockingQueue<byte[]> queue = new java.util.concurrent.ArrayBlockingQueue<>(40);   // 2 s
        final OutputStream out;
        final boolean ws;
        volatile boolean closed;

        Listener(OutputStream out, boolean ws) {
            this.out = out;
            this.ws = ws;
        }
    }
    private final AtomicInteger seq = new AtomicInteger();
    private volatile Map<String, JSONObject> tracks = Collections.emptyMap();   // track id -> { hash, type, size }
    private List<String> urls = Collections.emptyList();
    private long urlsAt;

    LanServer(Context context) {
        this.context = context;
        this.assets = context.getAssets();
        this.media = mediaDir(context);
        byte[] b = new byte[12];
        new SecureRandom().nextBytes(b);
        StringBuilder t = new StringBuilder();
        for (byte x : b) t.append(String.format("%02x", x));
        token = t.toString();
    }

    void start() {
        for (int port : PORTS) {
            try {
                server = new ServerSocket();
                server.setReuseAddress(true);   // the port of the last run is free again right away
                server.bind(new java.net.InetSocketAddress(port));
                break;
            } catch (IOException ignored) {
                server = null;
            }
        }
        if (server == null) {
            Log.w(MainActivity.TAG, "no free port for the LAN hub");
            return;
        }
        Log.i(MainActivity.TAG, "LAN hub on port " + server.getLocalPort());
        Broadcast.setSink(this::packet);
        pool.execute(() -> {
            while (!server.isClosed()) {
                try {
                    Socket s = server.accept();
                    pool.execute(() -> handle(s));
                } catch (IOException e) {
                    if (!server.isClosed()) Log.w(MainActivity.TAG, "accept", e);
                }
            }
        });
        pool.execute(() -> {   // routers and phones drop quiet connections
            while (!server.isClosed()) {
                SystemClock.sleep(15000);
                for (Map.Entry<String, Sink> e : streams.entrySet()) deliver(e.getKey(), e.getValue(), null, null);
            }
        });
    }

    void stop() {
        Broadcast.setSink(null);
        for (Listener l : listeners) endLive(l.out);
        try { if (server != null) server.close(); } catch (IOException ignored) {}
        for (Sink s : streams.values()) try { s.out.close(); } catch (IOException ignored) {}
        streams.clear();
        pool.shutdownNow();
    }

    int port() {
        return server == null ? 0 : server.getLocalPort();
    }

    // http://<address>:<port>/ for each network the phone shares with other devices (Wi-Fi, its own hotspot),
    // home-network addresses first. Mobile data and VPN interfaces are left out: nobody can reach those.
    synchronized List<String> urls() {
        if (SystemClock.elapsedRealtime() - urlsAt < 5000) return urls;
        urlsAt = SystemClock.elapsedRealtime();
        List<String> ips = new ArrayList<>();
        try {
            for (NetworkInterface ni : Collections.list(NetworkInterface.getNetworkInterfaces())) {
                String name = ni.getName();
                if (!ni.isUp() || ni.isLoopback() || name.matches("(rmnet|ccmni|tun|ppp|dummy|ipsec|v4-rmnet|clat).*")) continue;
                for (InetAddress a : Collections.list(ni.getInetAddresses())) {
                    if (a instanceof Inet4Address && a.isSiteLocalAddress()) ips.add(a.getHostAddress());
                }
            }
        } catch (Exception ignored) {}
        ips.sort((a, b) -> rank(a) - rank(b));
        List<String> out = new ArrayList<>();
        for (String ip : ips) out.add("http://" + ip + ":" + port() + "/");
        return urls = out;
    }

    private static int rank(String ip) {
        return ip.startsWith("192.168.") ? 0 : ip.startsWith("10.") ? 1 : 2;
    }

    // ---------- from the page ----------
    void send(String clientId, String event, String data) {
        Sink s = streams.get(clientId);
        if (s != null) deliver(clientId, s, event, data);
    }

    void setTracks(String json) {
        Map<String, JSONObject> m = new HashMap<>();
        try {
            JSONArray a = new JSONArray(json);
            for (int i = 0; i < a.length(); i++) {
                JSONObject t = a.getJSONObject(i);
                if (t.has("hash")) m.put(t.getString("id"), t);
            }
        } catch (Exception ignored) {}
        tracks = m;
    }

    void answer(int id, String json) {
        CompletableFuture<String> w = waits.remove(id);
        if (w != null) w.complete(json);
    }

    // Asks the page (__yaApp.lan[method](id, arg)) and waits for its AppBridge.answer.
    private JSONObject ask(String method, Object arg, long timeoutMs) throws Exception {
        int id = seq.incrementAndGet();
        CompletableFuture<String> w = new CompletableFuture<>();
        waits.put(id, w);
        MainActivity.toPage("__yaApp.lan." + method + "(" + id + "," + (arg instanceof String ? JSONObject.quote((String) arg) : arg) + ")");
        try {
            return new JSONObject(w.get(timeoutMs, TimeUnit.MILLISECONDS));
        } finally {
            waits.remove(id);
        }
    }

    // ---------- HTTP ----------
    private static final class Request {
        String method, path;
        Map<String, String> query = new HashMap<>(), headers = new HashMap<>();
        InputStream body;
        long length;
        String ip;
        boolean loopback;
    }

    private void handle(Socket s) {
        try {
            s.setTcpNoDelay(true);
            InputStream in = new BufferedInputStream(s.getInputStream());
            OutputStream out = s.getOutputStream();
            Request r = parse(in);
            if (r == null) { s.close(); return; }
            r.ip = s.getInetAddress().getHostAddress().replaceFirst("^::ffff:", "");
            r.loopback = s.getInetAddress().isLoopbackAddress();   // IPv4 arrives as ::ffff:127.0.0.1 too
            if (route(r, out)) {   // events or live sound: open until the device goes away
                if (isWs(r)) drainWs(in);
                else //noinspection StatementWithEmptyBody
                    while (in.read() >= 0) {}
                if (r.path.equals("/api/live")) endLive(out);
                else gone(r.query.get("id"), out);
            } else {
                out.flush();
            }
            s.close();
        } catch (Exception e) {
            try { s.close(); } catch (IOException ignored) {}
        }
    }

    private static Request parse(InputStream in) throws IOException {
        ByteArrayOutputStream head = new ByteArrayOutputStream();
        int c, last = 0;
        while ((c = in.read()) >= 0) {   // up to the empty line after the headers
            head.write(c);
            last = (last << 8) | c;
            if (last == 0x0d0a0d0a || (last & 0xffff) == 0x0a0a) break;
            if (head.size() > 16384) return null;
        }
        if (c < 0) return null;
        String[] lines = head.toString("ISO-8859-1").split("\r?\n");
        String[] first = lines[0].split(" ");
        if (first.length < 2) return null;
        Request r = new Request();
        r.method = first[0];
        String target = first[1];
        int q = target.indexOf('?');
        r.path = URLDecoder.decode(q < 0 ? target : target.substring(0, q), "UTF-8");
        if (q >= 0) {
            for (String kv : target.substring(q + 1).split("&")) {
                int e = kv.indexOf('=');
                if (e > 0) r.query.put(URLDecoder.decode(kv.substring(0, e), "UTF-8"), URLDecoder.decode(kv.substring(e + 1), "UTF-8"));
            }
        }
        for (int i = 1; i < lines.length; i++) {
            int e = lines[i].indexOf(':');
            if (e > 0) r.headers.put(lines[i].substring(0, e).trim().toLowerCase(Locale.ROOT), lines[i].substring(e + 1).trim());
        }
        String len = r.headers.get("content-length");
        r.length = len == null ? 0 : Long.parseLong(len);
        r.body = in;
        return r;
    }

    private boolean route(Request r, OutputStream out) throws Exception {
        String p = r.path;
        try {
            if (p.startsWith("/app/")) return own(r, out);
            if (r.method.equals("OPTIONS")) {   // the app's page (another origin) asks before reading /api/live
                out.write(("HTTP/1.1 204 No Content\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Headers: Content-Type\r\n"
                        + "Access-Control-Allow-Private-Network: true\r\nContent-Length: 0\r\nConnection: close\r\n\r\n").getBytes(StandardCharsets.UTF_8));
                return false;
            }
            if (p.equals("/api/live")) return live(r, out);
            if (p.equals("/api/time")) json(out, 200, new JSONObject().put("t", now()));
            else if (p.equals("/api/events")) return events(r, out);
            else if (p.equals("/api/cmd") && r.method.equals("POST")) { MainActivity.toPage("__yaApp.lan.cmd(" + small(r) + ")"); ok(out); }
            else if (p.equals("/api/status") && r.method.equals("POST")) { MainActivity.toPage("__yaApp.lan.status(" + small(r) + ")"); ok(out); }
            else if (p.equals("/api/upload") && r.method.equals("POST")) upload(r, out);
            else if (p.equals("/api/youtube") && r.method.equals("POST")) {
                JSONObject res = ask("youtube", new JSONObject(small(r)).optString("url"), 20000);
                json(out, res.has("error") ? 400 : 200, res);
            } else if (p.startsWith("/media/")) mediaFile(p.substring(7), out);
            else asset(p.equals("/") ? "index.html" : p.substring(1), out);
        } catch (Exception e) {
            json(out, 500, new JSONObject().put("error", String.valueOf(e.getMessage())));
        }
        return false;
    }

    private static String small(Request r) throws Exception {
        if (r.length > 65536) throw new Exception("слишком большой запрос");
        byte[] b = new byte[(int) r.length];
        int got = 0;
        while (got < b.length) {
            int n = r.body.read(b, got, b.length - got);
            if (n < 0) break;
            got += n;
        }
        String s = new String(b, 0, got, StandardCharsets.UTF_8);
        new JSONObject(s.isEmpty() ? "{}" : s);   // only JSON reaches the page
        return s.isEmpty() ? "{}" : s;
    }

    private boolean events(Request r, OutputStream out) throws Exception {
        String id = r.query.get("id");
        if (id == null || !id.matches("[A-Za-z0-9_-]{1,64}")) {
            json(out, 400, new JSONObject().put("error", "нужен id"));
            return false;
        }
        boolean ws = isWs(r);
        if (ws) wsAccept(r, out);
        else {
            out.write(("HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nCache-Control: no-store\r\nConnection: keep-alive\r\n"
                    + "Transfer-Encoding: chunked\r\n\r\n").getBytes(StandardCharsets.UTF_8));
            chunk(out, "retry: 1500\n\n".getBytes(StandardCharsets.UTF_8));
        }
        Sink old = streams.put(id, new Sink(out, ws));
        if (old != null) try { old.out.close(); } catch (IOException ignored) {}
        JSONObject who = new JSONObject().put("key", r.query.containsKey("key") ? r.query.get("key") : JSONObject.NULL).put("ip", r.ip);
        try { who.put("fp", new JSONObject(r.query.get("fp"))); } catch (Exception ignored) {}
        MainActivity.toPage("__yaApp.lan.connect(" + JSONObject.quote(id) + "," + who + ")");
        return true;
    }

    // One event to a device (a keep-alive ping when event is null). Over a WebSocket: {"e": event, "d": data}.
    private void deliver(String id, Sink s, String event, String data) {
        try {
            synchronized (s) {
                if (s.ws && event == null) frame(s.out, 0x9, new byte[0]);
                else if (s.ws) frame(s.out, 0x1, ("{\"e\":" + JSONObject.quote(event) + ",\"d\":" + data + "}").getBytes(StandardCharsets.UTF_8));
                else chunk(s.out, (event == null ? ": ping\n\n" : "event: " + event + "\ndata: " + data + "\n\n").getBytes(StandardCharsets.UTF_8));
            }
        } catch (IOException e) {
            gone(id, s.out);
        }
    }

    private static boolean isWs(Request r) {
        return "websocket".equalsIgnoreCase(r.headers.get("upgrade")) && r.headers.containsKey("sec-websocket-key");
    }

    private static void wsAccept(Request r, OutputStream out) throws Exception {
        String accept = Base64.getEncoder().encodeToString(MessageDigest.getInstance("SHA-1")
                .digest((r.headers.get("sec-websocket-key") + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").getBytes(StandardCharsets.ISO_8859_1)));
        out.write(("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: " + accept
                + "\r\n\r\n").getBytes(StandardCharsets.ISO_8859_1));
        out.flush();
    }

    // A WebSocket frame from the hub (never masked): 0x1 text, 0x2 binary, 0x9 ping.
    private static void frame(OutputStream out, int opcode, byte[] b) throws IOException {
        int n = b.length, h = n < 126 ? 2 : n < 65536 ? 4 : 10;
        byte[] f = new byte[h + n];
        f[0] = (byte) (0x80 | opcode);
        if (n < 126) f[1] = (byte) n;
        else if (n < 65536) {
            f[1] = 126;
            f[2] = (byte) (n >> 8);
            f[3] = (byte) n;
        } else {
            f[1] = 127;
            for (int i = 0; i < 8; i++) f[2 + i] = (byte) ((long) n >> (56 - 8 * i));
        }
        System.arraycopy(b, 0, f, h, n);
        out.write(f);
        out.flush();
    }

    // Frames from the device (pongs, its close) are read and dropped until it closes.
    private static void drainWs(InputStream in) throws IOException {
        for (;;) {
            int b0 = in.read(), b1 = in.read();
            if (b0 < 0 || b1 < 0) return;
            long len = b1 & 0x7f;
            if (len == 126) len = (in.read() << 8) | in.read();
            else if (len == 127) {
                len = 0;
                for (int i = 0; i < 8; i++) len = (len << 8) | in.read();
            }
            if ((b1 & 0x80) != 0) len += 4;   // the mask
            for (long i = 0; i < len; i++) if (in.read() < 0) return;
            if ((b0 & 0x0f) == 0x8) return;
        }
    }

    // Streams (events, live sound) go out in HTTP/1.1 chunks. A body with neither a length nor chunks ends only when
    // the connection closes, and proxies or traffic filters on a device may hold all of it until then: the device
    // then never hears from the hub while it is open.
    private static void chunk(OutputStream out, byte[] b) throws IOException {
        if (b.length == 0) return;   // an empty chunk would end the stream
        byte[] size = (Integer.toHexString(b.length) + "\r\n").getBytes(StandardCharsets.ISO_8859_1);
        byte[] c = new byte[size.length + b.length + 2];
        System.arraycopy(size, 0, c, 0, size.length);
        System.arraycopy(b, 0, c, size.length, b.length);
        c[c.length - 2] = '\r';
        c[c.length - 1] = '\n';
        out.write(c);
        out.flush();
    }

    // Broadcast packets for one device while it listens. A device that falls behind loses the oldest packets
    // instead of holding up the others.
    private boolean live(Request r, OutputStream out) throws Exception {
        boolean ws = isWs(r);
        if (ws) wsAccept(r, out);
        else {
            out.write(("HTTP/1.1 200 OK\r\nContent-Type: application/octet-stream\r\nCache-Control: no-store\r\n"
                    + "Access-Control-Allow-Origin: *\r\nTransfer-Encoding: chunked\r\nConnection: close\r\n\r\n").getBytes(StandardCharsets.UTF_8));
            out.flush();
        }
        Listener l = new Listener(out, ws);
        listeners.add(l);
        pool.execute(() -> {
            try {
                while (!l.closed) {
                    byte[] p = l.queue.take();
                    if (!l.ws) chunk(out, p);
                    else if (p.length > 0) frame(out, 0x2, p);   // one packet per message
                }
            } catch (Exception ignored) {
            } finally {
                l.closed = true;
                listeners.remove(l);
            }
        });
        return true;
    }

    private void packet(byte[] p) {
        for (Listener l : listeners) {
            if (!l.queue.offer(p)) {
                l.queue.poll();
                l.queue.offer(p);
            }
        }
    }

    private void endLive(OutputStream out) {
        for (Listener l : listeners) {
            if (l.out != out) continue;
            l.closed = true;
            l.queue.offer(new byte[0]);   // wakes its writer
            listeners.remove(l);
        }
    }

    // The device went away (unless it has reconnected with a new stream meanwhile).
    private void gone(String id, OutputStream out) {
        Sink s = id == null ? null : streams.get(id);
        if (s != null && s.out == out && streams.remove(id, s)) MainActivity.toPage("__yaApp.lan.disconnect(" + JSONObject.quote(id) + ")");
    }

    // A device adds a file: it is stored under its hash, the page adds the track (or finds it is there already).
    private void upload(Request r, OutputStream out) throws Exception {
        if (r.length <= 0) { json(out, 400, new JSONObject().put("error", "пустой файл")); return; }
        if (r.length > MAX_UPLOAD) { json(out, 413, new JSONObject().put("error", "файл больше 500 МБ")); return; }
        String hash = receive(r, null);
        String name = r.query.containsKey("name") ? r.query.get("name") : "track";
        if (name.length() > 200) name = name.substring(0, 200);
        String type = r.headers.get("content-type");
        JSONObject info = new JSONObject().put("hash", hash).put("name", name).put("size", r.length)
                .put("type", type == null ? "application/octet-stream" : type);
        JSONObject res = ask("upload", info, 15000);
        json(out, res.has("error") ? 400 : 200, res);
    }

    // The page's own files (its uploads, files from devices in the internet room): only from this phone, with the token.
    private boolean own(Request r, OutputStream out) throws Exception {
        boolean preflight = r.method.equals("OPTIONS");
        String cors = "Access-Control-Allow-Origin: https://" + MainActivity.HOST + "\r\nAccess-Control-Allow-Headers: Content-Type\r\n"
                + "Access-Control-Allow-Methods: POST\r\nAccess-Control-Allow-Private-Network: true\r\n";
        if (!r.loopback) { json(out, 403, new JSONObject().put("error", "нельзя")); return false; }
        if (preflight) {
            out.write(("HTTP/1.1 204 No Content\r\n" + cors + "Content-Length: 0\r\nConnection: close\r\n\r\n").getBytes(StandardCharsets.UTF_8));
            return false;
        }
        String hash = r.query.get("hash");
        int code = 200;
        String body;
        if (!r.path.equals("/app/put") || !token.equals(r.query.get("token")) || hash == null || !hash.matches("[0-9a-f]{16}")
                || r.length <= 0 || r.length > MAX_UPLOAD) {
            code = 400;
            body = "{\"error\":\"нельзя\"}";
        } else {
            try {
                body = new JSONObject().put("ok", hash.equals(receive(r, hash))).toString();
            } catch (Exception e) {   // the page must see the reason, so the answer keeps the CORS headers
                code = 500;
                body = new JSONObject().put("error", String.valueOf(e.getMessage())).toString();
            }
        }
        byte[] b = body.getBytes(StandardCharsets.UTF_8);
        out.write(("HTTP/1.1 " + code + " OK\r\n" + cors + "Content-Type: application/json\r\nContent-Length: " + b.length
                + "\r\nConnection: close\r\n\r\n").getBytes(StandardCharsets.UTF_8));
        out.write(b);
        return false;
    }

    // Body → media/<sha256[0..16]>; returns that hash. `expect`: what the page computed (the file is kept only if it matches).
    private String receive(Request r, String expect) throws Exception {
        File tmp = File.createTempFile("upload", ".part", media);
        MessageDigest sha = MessageDigest.getInstance("SHA-256");
        try (FileOutputStream f = new FileOutputStream(tmp)) {
            byte[] buf = new byte[1 << 16];
            long left = r.length;
            while (left > 0) {
                int n = r.body.read(buf, 0, (int) Math.min(buf.length, left));
                if (n < 0) throw new IOException("обрыв");
                sha.update(buf, 0, n);
                f.write(buf, 0, n);
                left -= n;
            }
        } catch (Exception e) {
            //noinspection ResultOfMethodCallIgnored
            tmp.delete();
            throw e;
        }
        String hash = hex(sha.digest()).substring(0, 16);
        File dest = new File(media, hash);
        if ((expect != null && !expect.equals(hash)) || dest.exists() || !tmp.renameTo(dest)) {
            //noinspection ResultOfMethodCallIgnored
            tmp.delete();
        }
        return hash;
    }

    static String hex(byte[] b) {
        StringBuilder s = new StringBuilder();
        for (byte x : b) s.append(String.format("%02x", x));
        return s.toString();
    }

    private void mediaFile(String id, OutputStream out) throws Exception {
        JSONObject t = tracks.get(id);
        File f = t == null ? null : new File(media, t.optString("hash"));
        if (f == null || !t.optString("hash").matches("[0-9a-f]{16}") || !f.isFile()) {
            json(out, 404, new JSONObject().put("error", "трек не найден"));
            return;
        }
        out.write(("HTTP/1.1 200 OK\r\nContent-Type: " + t.optString("type", "application/octet-stream") + "\r\nContent-Length: " + f.length()
                + "\r\nCache-Control: private, max-age=31536000, immutable\r\nConnection: close\r\n\r\n").getBytes(StandardCharsets.UTF_8));
        try (InputStream in = new FileInputStream(f)) {
            byte[] buf = new byte[1 << 16];
            int n;
            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
        }
    }

    // The site itself, from the APK (same files the page runs).
    private void asset(String path, OutputStream out) throws Exception {
        if (path.contains("..")) { json(out, 404, new JSONObject().put("error", "not found")); return; }
        byte[] data;
        try (InputStream in = assets.open(path)) {
            ByteArrayOutputStream b = new ByteArrayOutputStream();
            byte[] buf = new byte[1 << 16];
            int n;
            while ((n = in.read(buf)) > 0) b.write(buf, 0, n);
            data = b.toByteArray();
        } catch (IOException e) {
            json(out, 404, new JSONObject().put("error", "not found"));
            return;
        }
        String ext = path.substring(path.lastIndexOf('.') + 1);
        String type = MIME.containsKey(ext) ? MIME.get(ext) : "application/octet-stream";
        out.write(("HTTP/1.1 200 OK\r\nContent-Type: " + type + "\r\nContent-Length: " + data.length
                + "\r\nCache-Control: no-cache\r\nConnection: close\r\n\r\n").getBytes(StandardCharsets.UTF_8));
        out.write(data);
    }

    private static void ok(OutputStream out) throws Exception {
        json(out, 200, new JSONObject().put("ok", true));
    }

    private static void json(OutputStream out, int code, JSONObject body) throws IOException {
        byte[] b = body.toString().getBytes(StandardCharsets.UTF_8);
        out.write(("HTTP/1.1 " + code + " " + (code < 400 ? "OK" : "Error") + "\r\nContent-Type: application/json; charset=utf-8\r\n"
                + "Cache-Control: no-store\r\nContent-Length: " + b.length + "\r\nConnection: close\r\n\r\n").getBytes(StandardCharsets.UTF_8));
        out.write(b);
    }
}
