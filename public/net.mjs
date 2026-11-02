// How this page talks to the room's hub. Three kinds of link, one interface:
//   server — a YourAura hub on a computer in the home network (server.mjs), over HTTP + SSE;
//   host   — this tab is the hub of a room: the hub logic (core/hub.mjs) runs right here;
//   guest  — this tab joined a room hosted by another device, over WebRTC (peer to peer).
// Rooms need no server of ours: devices find each other through public Nostr relays (Trystero),
// then everything — commands, the clock, the music files — goes directly between them.
//
// link = {
//   kind, open({ snapshot, identify, online }), time() → hub clock (ms), status(body), cmd(action, extra),
//   media(track, onProgress) → ArrayBuffer, upload(file, onProgress) → { id, hash }, youtube(url) → result,
//   live(onPacket) → stop(): the broadcast's sound while the hub is in broadcast mode (packets, see parsePacket),
// }
import { createHub, youtubeId, youtubeInfo } from './core/hub.mjs?v=2026.11.03';

const APP_ID = 'youraura-1';
const MAX_FILE = 500 * 1024 * 1024;

// ---------- Android app ----------
// The app (android/) shows this same site from its own files and adds what a browser can't do (AppBridge.java).
// Slow calls answer later: Java calls __yaApp.progress(id, p) and __yaApp.reply(id, result).
export const app = globalThis.YourAuraApp || null;
const SITE = 'https://istratii-tech.github.io/YourAura/';   // guests of a room hosted by the app open it here
const appWaits = new Map();
let appSeq = 0;
function appCall(method, arg, onProgress) {
  const id = ++appSeq;
  return new Promise((ok, fail) => {
    appWaits.set(id, { ok, fail, onProgress });
    app[method](id, arg);
  });
}
if (app) {
  globalThis.__yaApp = Object.assign(globalThis.__yaApp || {}, {
    progress(id, p) { appWaits.get(id)?.onProgress?.(p); },
    reply(id, r) {
      const w = appWaits.get(id);
      appWaits.delete(id);
      if (w) r?.error ? w.fail(new Error(r.error)) : w.ok(r);
    },
  });
}

// ---------- broadcast ----------
// The Android app captures what the phone plays (Broadcast.java) and sends packets: float64 hub time of the
// first sample (ms), int32 sample frames, 16-bit stereo PCM at 48 kHz.
export function parsePacket(p) {
  const v = new DataView(p.buffer, p.byteOffset, p.byteLength);
  const frames = v.getInt32(8, true);
  return { t: v.getFloat64(0, true), frames, pcm: new Int16Array(p.buffer.slice(p.byteOffset + 12, p.byteOffset + 12 + frames * 4)) };
}

// A byte stream cut back into packets.
function packetSplitter(onPacket) {
  let buf = new Uint8Array(0);
  return (chunk) => {
    const all = new Uint8Array(buf.length + chunk.length);
    all.set(buf);
    all.set(chunk, buf.length);
    let at = 0;
    while (all.length - at >= 12) {
      const size = 12 + new DataView(all.buffer, at + 8, 4).getInt32(0, true) * 4;
      if (all.length - at < size) break;
      onPacket(all.subarray(at, at + size));
      at += size;
    }
    buf = all.slice(at);
  };
}

// The hub's /api/live, reconnecting while wanted.
function readLive(url, onPacket) {
  const ctl = new AbortController();
  let stopped = false;
  (async () => {
    while (!stopped) {
      try {
        const r = await fetch(url, { signal: ctl.signal, cache: 'no-store' });
        const reader = r.body.getReader(), feed = packetSplitter(onPacket);
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          feed(value);
        }
      } catch {}
      if (!stopped) await new Promise((ok) => setTimeout(ok, 1000));
    }
  })();
  return () => { stopped = true; ctl.abort(); };
}

// ---------- server (HTTP) ----------
export async function hasServer() {
  try {
    const r = await fetch('api/time', { cache: 'no-store' });
    return r.ok && typeof (await r.json()).t === 'number';
  } catch { return false; }
}

export function serverLink({ clientId, deviceKey, fingerprint }) {
  const post = (path, body) => fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return {
    kind: 'server',
    open(on) {
      const es = new EventSource(`api/events?id=${clientId}&key=${deviceKey}&fp=${encodeURIComponent(JSON.stringify(fingerprint))}`);
      es.addEventListener('snapshot', (e) => on.snapshot(JSON.parse(e.data)));
      es.addEventListener('identify', () => on.identify());
      es.onopen = () => on.online(true);
      es.onerror = () => on.online(false);
    },
    async time() { return (await (await fetch('api/time', { cache: 'no-store' })).json()).t; },
    status(body) { post('api/status', body).catch(() => {}); },
    cmd(action, extra) { return post('api/cmd', { action, ...extra }).catch(() => {}); },
    async media(track, onProgress) {
      const r = await fetch('media/' + track.id);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return readWithProgress(r, Number(r.headers.get('Content-Length')) || track.size, onProgress);
    },
    upload(file, onProgress) {
      return new Promise((ok, fail) => {
        const x = new XMLHttpRequest();
        x.open('POST', 'api/upload?name=' + encodeURIComponent(file.name));
        x.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
        x.upload.onprogress = (ev) => { if (ev.lengthComputable) onProgress(ev.loaded / ev.total); };
        x.onloadend = () => (x.status === 200 ? ok(JSON.parse(x.responseText)) : fail(new Error('не отправился')));
        x.send(file);
      });
    },
    async youtube(url) {
      const r = await post('api/youtube', { url });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      return j;
    },
    live: (onPacket) => readLive('api/live', onPacket),
  };
}

async function readWithProgress(r, total, onProgress) {
  if (!(r.body && r.body.getReader && total)) return r.arrayBuffer();
  const reader = r.body.getReader(), chunks = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    got += value.length;
    onProgress(got / total);
  }
  const all = new Uint8Array(got);
  let o = 0;
  for (const ch of chunks) { all.set(ch, o); o += ch.length; }
  return all.buffer;
}

// ---------- rooms ----------
// Room codes avoid letters that are easy to mix up when typed from another screen.
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function newRoomCode() {
  const b = crypto.getRandomValues(new Uint8Array(6));
  return [...b].map((x) => CODE_CHARS[x % CODE_CHARS.length]).join('');
}
export const cleanRoomCode = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
export const roomUrl = (code) => `${app ? SITE : location.origin + location.pathname}#r=${code}`;

let trystero = null;
const loadTrystero = () => (trystero ??= import('./vendor/trystero-nostr.js?v=2026.11.03'));

async function joinRoom(code) {
  const { joinRoom: join } = await loadTrystero();
  return join({ appId: APP_ID, password: code, maxReceiveBytes: MAX_FILE + 1024 * 1024 }, code);
}

// The host keeps the room's library and remembered devices in this browser.
function hubStore() {
  let p = null;
  const db = () => (p ??= new Promise((ok, fail) => {
    const r = indexedDB.open('youraura-hub', 1);
    r.onupgradeneeded = () => { r.result.createObjectStore('kv'); r.result.createObjectStore('files'); };
    r.onsuccess = () => ok(r.result);
    r.onerror = () => fail(r.error);
  }));
  const run = async (store, mode, fn) => {
    const d = await db();
    return new Promise((ok, fail) => {
      const tx = d.transaction(store, mode), req = fn(tx.objectStore(store));
      tx.oncomplete = () => ok(req?.result);
      tx.onerror = tx.onabort = () => fail(tx.error);
    });
  };
  return {
    get: (k) => run('kv', 'readonly', (s) => s.get(k)),
    set: (k, v) => run('kv', 'readwrite', (s) => s.put(v, k)),
    file: (hash) => run('files', 'readonly', (s) => s.get(hash)),
    putFile: (hash, data) => run('files', 'readwrite', (s) => s.put(data, hash)),
    dropFile: (hash) => run('files', 'readwrite', (s) => s.delete(hash)),
  };
}

const sha16 = async (buf) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', buf))].slice(0, 8)
  .map((b) => b.toString(16).padStart(2, '0')).join('');

const AUDIO_EXT = /\.(mp3|m4a|aac|wav|ogg|opus|flac|webm)$/i;
// Trystero hands binary payloads over as Uint8Array; decodeAudioData and the stores want an ArrayBuffer.
const toArrayBuffer = (d) => (d instanceof ArrayBuffer ? d : d.buffer.slice(d.byteOffset, d.byteOffset + d.byteLength));

// In the app the room's files live on the phone's disk (files/media): the page reads them at media/,
// and the app's Wi-Fi hub serves the same files to the devices of the home network.
function appFiles(store) {
  return {
    ...store,
    async file(hash) {
      try {
        const r = await fetch('media/' + hash);
        return r.ok ? await r.arrayBuffer() : undefined;
      } catch { return undefined; }
    },
    async putFile(hash, data) {
      const { port, token } = JSON.parse(app.lan());
      const r = await fetch(`http://127.0.0.1:${port}/app/put?hash=${hash}&token=${token}`, { method: 'POST', body: data });
      if (!(r.ok && (await r.json()).ok)) throw new Error('файл не сохранился');
    },
    async dropFile(hash) { app.dropFile(hash); },
  };
}

// This tab is the hub: the room's library lives here and every other device connects to it.
// In the Android app devices of the home network can also connect straight to the phone (LanServer.java).
export async function hostLink({ code, clientId, deviceKey, fingerprint }) {
  const store = app ? appFiles(hubStore()) : hubStore();
  const room = await joinRoom(code);
  const now = app ? () => app.now() : () => performance.timeOrigin + performance.now();
  const peers = new Map();   // peerId -> clientId
  const peerOf = (cid) => [...peers].find(([, c]) => c === cid)?.[0];
  const lanClients = new Set();   // devices connected to the app's Wi-Fi hub
  let local = null;          // this tab's own handlers
  const tellFiles = (tracks) => app?.tracks(JSON.stringify(tracks.filter((t) => t.hash).map(({ id, hash, type, size }) => ({ id, hash, type, size }))));

  const evt = room.makeAction('evt');
  const hub = createHub({
    now,
    tracks: (await store.get('tracks')) || [],
    devices: (await store.get('devices')) || {},
    saveTracks: (tracks) => { tellFiles(tracks); store.set('tracks', JSON.parse(JSON.stringify(tracks))).catch(() => {}); },
    saveDevices: (devices) => store.set('devices', JSON.parse(JSON.stringify(devices))).catch(() => {}),
    send(cid, event, data) {
      if (cid === clientId) return local && (event === 'snapshot' ? local.snapshot(data) : local.identify());
      if (lanClients.has(cid)) return app.send(cid, event, JSON.stringify(data));
      const peer = peerOf(cid);
      if (peer) evt.send({ event, data }, { target: peer }).catch(() => {});
    },
    extra() {
      // The app's Wi-Fi address goes first: it needs neither internet nor GitHub. The room code works from anywhere.
      const urls = (app && JSON.parse(app.lan()).urls) || [];
      return { hubKind: app ? 'android' : 'browser', room: { code, url: roomUrl(code) }, links: { primary: urls[0] || roomUrl(code), urls, mdns: null } };
    },
    removeMedia: (t) => { if (t.hash && !hub.tracks.some((x) => x.hash === t.hash)) store.dropFile(t.hash).catch(() => {}); },
    retryDownload: app ? (t) => download(t) : undefined,
  });
  app?.hosting(code);   // the app keeps the phone awake and opens its Wi-Fi hub while the room is hosted
  tellFiles(hub.tracks);
  const liveOut = room.makeAction('live');   // broadcast packets for devices in the internet room
  let onBroadcast = null;
  if (app) {
    // The app reports the broadcast starting or stopping (error: 'mic' | 'cancel' when the user said no).
    globalThis.__yaApp.broadcast = (on, error) => { hub.setLive(on); onBroadcast?.(on, error); };
    if (app.broadcasting()) hub.setLive(true);   // the page was reloaded during a broadcast
  }
  if (app) {
    globalThis.__yaApp.lan = {   // requests of devices connected to the Wi-Fi hub
      connect(cid, who) { lanClients.add(cid); hub.connect(cid, who); },
      disconnect(cid) { lanClients.delete(cid); hub.disconnect(cid); },
      cmd: (b) => hub.command(b || {}),
      status: (b) => hub.status(b || {}),
      upload: (id, f) => app.answer(id, JSON.stringify(addStored(f))),   // LanServer has stored the file already
      async youtube(id, url) {
        app.answer(id, JSON.stringify(await addYoutube(url).catch((e) => ({ error: e.message }))));
      },
    };
  }

  async function addFile(data, name, type) {
    data = toArrayBuffer(data);
    if (data.byteLength > MAX_FILE) throw new Error('файл больше 500 МБ');
    const hash = await sha16(data);
    if (!hub.tracks.some((t) => t.hash === hash)) await store.putFile(hash, data);
    return addStored({ hash, name, size: data.byteLength, type: type || 'application/octet-stream' });
  }

  function addStored({ hash, name, size, type }) {
    const dup = hub.tracks.find((t) => t.hash === hash);
    if (dup) return { id: dup.id, hash, duplicate: true };
    hub.addTrack({ id: hash, hash, name: String(name).replace(/\.[^.]+$/, '') || name, size, type });
    return { id: hash, hash };
  }

  // Without a downloader the browser can only play YouTube through YouTube's own player on every device.
  // The Android app downloads the sound (yt-dlp) and then it is an ordinary file of the room.
  async function addYoutube(url) {
    const videoId = youtubeId(url);
    if (!videoId) throw new Error('Это не похоже на ссылку YouTube');
    const id = 'yt-' + videoId;
    let t = hub.track(id);
    if (!t) {
      const info = await youtubeInfo(videoId);
      if (info.status === 'missing') throw new Error('Видео не найдено или закрыто');
      t = { id, kind: 'youtube', videoId, name: info.title || 'YouTube ' + videoId, author: info.author || undefined, size: 0,
        dlError: info.status === 'noembed' && !app ? 'Владелец видео запретил встроенный показ' : undefined };
      hub.addTrack(t);
      download(t);
    }
    return { id, name: t.name, ...hub.offer(id), downloading: !!t.pending };
  }

  const dlQueue = [];
  let dlBusy = false;
  function download(t) {
    if (!app || dlQueue.includes(t)) return;
    Object.assign(t, { pending: true, progress: 0 });
    delete t.dlError;
    dlQueue.push(t);
    pumpDownloads();
  }

  async function pumpDownloads() {
    if (dlBusy || !dlQueue.length) return;
    dlBusy = true;
    const t = dlQueue.shift();
    try {
      if (hub.track(t.id) === t) await appDownload(t);
    } catch (e) {
      // Не вышло — остаёмся на встроенном плеере YouTube.
      Object.assign(t, { kind: 'youtube', pending: false, dlError: String(e.message || e).slice(0, 200) });
      delete t.progress;
    }
    hub.trackReady(t.id);
    dlBusy = false;
    pumpDownloads();
  }

  async function appDownload(t) {
    let shown = 0;
    const meta = await appCall('download', t.videoId, (p) => {
      t.progress = p;
      if (Date.now() - shown > 500) { shown = Date.now(); hub.broadcast(); }
    });
    // The app has put the file into the room's library (files/media/<hash>).
    const { hash } = meta;
    if (hub.track(t.id) !== t) {   // трек удалили, пока он скачивался
      if (!hub.tracks.some((x) => x.hash === hash)) app.dropFile(hash);
      return;
    }
    const dup = hub.tracks.find((x) => x.hash === hash && x !== t);
    if (dup) return hub.mergeTrack(t.id, dup.id);   // тот же звук уже есть в библиотеке
    Object.assign(t, {
      kind: 'file', hash, size: meta.size, type: meta.ext === 'webm' ? 'audio/webm' : 'audio/mp4', pending: false,
      name: t.name.startsWith('YouTube ') && meta.title ? String(meta.title).slice(0, 200) : t.name,
      author: t.author || (meta.uploader ? String(meta.uploader).slice(0, 100) : undefined),
      duration: meta.duration > 0 ? Number(meta.duration) : t.duration,
    });
    delete t.progress;
  }
  for (const t of hub.tracks) if (t.kind === 'youtube') download(t);   // interrupted or failed last time

  async function fileOf(id) {
    const t = hub.track(id);
    const data = t?.hash && (await store.file(t.hash));
    if (!data) throw new Error('трек не найден');
    return toArrayBuffer(data);
  }

  room.makeAction('hello', { onMessage: (m, { peerId }) => {
    if (!m || typeof m.clientId !== 'string') return;
    peers.set(peerId, m.clientId);
    hub.connect(m.clientId, { key: m.key, fp: m.fp });
  } });
  room.makeAction('status', { onMessage: (b, { peerId }) => { if (peers.has(peerId)) hub.status({ ...b, id: peers.get(peerId) }); } });
  room.makeAction('cmd', { kind: 'request', onRequest: (b) => { hub.command(b || {}); return { ok: true }; } });
  room.makeAction('time', { kind: 'request', onRequest: () => ({ t: now() }) });
  room.makeAction('media', { kind: 'request', onRequest: (b) => fileOf(b?.id) });
  room.makeAction('upload', { kind: 'request', onRequest: async (data, { metadata }) => {
    try { return await addFile(data, String(metadata?.name || 'track'), String(metadata?.type || '')); } catch (e) { return { error: e.message }; }
  } });
  room.makeAction('youtube', { kind: 'request', onRequest: async (b) => {
    try { return await addYoutube(b?.url); } catch (e) { return { error: e.message }; }
  } });
  const iam = room.makeAction('host');
  room.onPeerJoin = (peerId) => iam.send({ code }, { target: peerId }).catch(() => {});
  room.onPeerLeave = (peerId) => {
    const cid = peers.get(peerId);
    peers.delete(peerId);
    if (cid) hub.disconnect(cid);
  };

  return {
    kind: 'host',
    code,
    open(on) {
      local = on;
      on.online(true);
      hub.connect(clientId, { key: deviceKey, fp: fingerprint });
    },
    async time() { return now(); },
    status(body) { hub.status(body); },
    async cmd(action, extra) { hub.command({ action, ...extra }); },
    async media(track) { return fileOf(track.id); },
    async upload(file, onProgress) {
      if (!AUDIO_EXT.test(file.name) && !file.type.startsWith('audio/')) throw new Error('это не аудиофайл');
      const r = await addFile(await file.arrayBuffer(), file.name, file.type);
      onProgress(1);
      return r;
    },
    youtube: addYoutube,
    // The page reads the app's stream from the phone itself and passes every packet on to the internet room.
    live(onPacket) {
      if (!app) return () => {};
      return readLive(`http://127.0.0.1:${JSON.parse(app.lan()).port}/api/live`, (p) => {
        liveOut.send(p).catch(() => {});
        onPacket(p);
      });
    },
    canBroadcast: !!app,
    broadcast: (on) => app?.broadcast(on),
    set onBroadcast(fn) { onBroadcast = fn; },
    leave: () => { app?.hosting(''); return room.leave(); },
  };
}

// This tab joined a room hosted by another device.
export async function guestLink({ code, clientId, deviceKey, fingerprint }) {
  const room = await joinRoom(code);
  let host = null, on = null;
  const pending = [];   // resolvers waiting for the host
  const whenHost = () => (host ? Promise.resolve(host) : new Promise((ok) => pending.push(ok)));

  const hello = room.makeAction('hello');
  const status = room.makeAction('status');
  const cmd = room.makeAction('cmd', { kind: 'request' });
  const time = room.makeAction('time', { kind: 'request' });
  const media = room.makeAction('media', { kind: 'request' });
  const upload = room.makeAction('upload', { kind: 'request' });
  const youtube = room.makeAction('youtube', { kind: 'request' });
  let onLive = null;
  room.makeAction('live', { onMessage: (p, { peerId }) => { if (peerId === host && onLive) onLive(new Uint8Array(toArrayBuffer(p))); } });
  room.makeAction('evt', { onMessage: (m, { peerId }) => {
    if (peerId !== host || !on || !m) return;
    if (m.event === 'snapshot') on.snapshot(m.data);
    if (m.event === 'identify') on.identify();
  } });
  room.makeAction('host', { onMessage: (m, { peerId }) => {
    if (m?.code !== code) return;
    host = peerId;
    hello.send({ clientId, key: deviceKey, fp: fingerprint }, { target: peerId }).catch(() => {});
    on?.online(true);
    for (const ok of pending.splice(0)) ok(host);
  } });
  room.onPeerLeave = (peerId) => { if (peerId === host) { host = null; on?.online(false); } };

  const ask = async (action, data, opts = {}) => action.request(data, { target: await whenHost(), timeoutMs: 15000, ...opts });
  return {
    kind: 'guest',
    code,
    open(handlers) { on = handlers; on.online(!!host); },
    async time() { return (await ask(time, {}, { timeoutMs: 4000 })).t; },
    status(body) { if (host) status.send(body, { target: host }).catch(() => {}); },
    cmd(action, extra) { return ask(cmd, { action, ...extra }).catch(() => {}); },
    async media(track, onProgress) {
      return toArrayBuffer(await ask(media, { id: track.id }, { timeoutMs: 120000, onProgress: (p) => onProgress(p) }));
    },
    async upload(file, onProgress) {
      if (file.size > MAX_FILE) throw new Error('файл больше 500 МБ');
      const r = await ask(upload, await file.arrayBuffer(), { timeoutMs: 300000, metadata: { name: file.name, type: file.type }, onProgress: (p) => onProgress(p) });
      if (r?.error) throw new Error(r.error);
      return r;
    },
    async youtube(url) {
      const r = await ask(youtube, { url }, { timeoutMs: 20000 });
      if (r?.error) throw new Error(r.error);
      return r;
    },
    live(onPacket) { onLive = onPacket; return () => { onLive = null; }; },
    leave: () => room.leave(),
  };
}
