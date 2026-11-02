// YourAura client.
// Link: the hub is a computer in the home network (HTTP) or a browser tab that hosts a room (WebRTC), see net.mjs.
// Clock: NTP-style pings of the hub's clock give the offset between performance.now() and hub time.
// Audio: tracks are decoded into AudioBuffers and started at exact AudioContext times; a corrector
// nudges playbackRate (or restarts the source) when this device drifts. The next track is decoded
// in advance and scheduled right at the end of the current one, so transitions are gapless.

import { hasServer, serverLink, hostLink, guestLink, newRoomCode, cleanRoomCode, parsePacket } from './net.mjs?v=2026.11.03';
import { L, lang, setLang, translatePage } from './i18n.mjs?v=2026.11.03';

const APP_URL = 'https://github.com/Istratii-tech/YourAura/releases/latest';   // the Android app
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (sec) => {
  if (!isFinite(sec) || sec < 0) sec = 0;
  return `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
};
const mb = (bytes) => (bytes / 1048576).toFixed(1) + ' ' + L('МБ');
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
};
const randomId = () => Math.random().toString(36).slice(2, 10);

const ICON = {
  play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.4-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z"/></svg>',
  pause: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4.2" height="14" rx="1.2"/><rect x="13.8" y="5" width="4.2" height="14" rx="1.2"/></svg>',
  next: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M5 6.2v11.6a.9.9 0 0 0 1.4.75l8.3-5.8a.9.9 0 0 0 0-1.5L6.4 5.45A.9.9 0 0 0 5 6.2z"/><rect x="16.5" y="5.5" width="2.6" height="13" rx="1"/></svg>',
  prev: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 6.2v11.6a.9.9 0 0 1-1.4.75l-8.3-5.8a.9.9 0 0 1 0-1.5l8.3-5.8A.9.9 0 0 1 19 6.2z"/><rect x="4.9" y="5.5" width="2.6" height="13" rx="1"/></svg>',
  add: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  playNext: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h10M4 12h7M4 17h7"/><path d="M15 11v8l5-4z" fill="currentColor"/></svg>',
  del: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  up: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 15l6-6 6 6"/></svg>',
  down: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>',
  sound: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/></svg>',
  muted: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor"/><path d="M16 9.5l5 5M21 9.5l-5 5"/></svg>',
  retry: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12a7 7 0 1 1-2.05-4.95"/><path d="M19 4.5V9h-4.5"/></svg>',
  bell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z" fill="currentColor" fill-opacity=".25"/><path d="M10 20.5a2.2 2.2 0 0 0 4 0"/></svg>',
  pencil: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15.5 5.5l3 3L9 18l-4 1 1-4z" fill="currentColor" fill-opacity=".25"/><path d="M13.5 7.5l3 3"/></svg>',
  phone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="7" y="2.5" width="10" height="19" rx="2.2" fill="currentColor" fill-opacity=".18"/><path d="M10.5 18.5h3" stroke-linecap="round"/></svg>',
  tablet: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="4" y="2.5" width="16" height="19" rx="2.2" fill="currentColor" fill-opacity=".18"/><circle cx="12" cy="18.6" r=".9" fill="currentColor"/></svg>',
  computer: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><rect x="3.5" y="4.5" width="17" height="11.5" rx="1.5" fill="currentColor" fill-opacity=".18"/><path d="M1.5 19.5h21l-2-3.5h-17z"/></svg>',
  spkLow: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 9.5h3.5L14 5.5v13l-4.5-4H6z"/></svg>',
  spkHigh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 9.5h3.5L11 5.5v13l-4.5-4H3z" fill="currentColor"/><path d="M14.5 9a4 4 0 0 1 0 6M17 6.5a7.5 7.5 0 0 1 0 11M19.5 4a11 11 0 0 1 0 16"/></svg>',
};

// Per-tab id (sessionStorage), so two tabs of one browser count as two devices.
const clientId = (() => {
  try {
    let v = sessionStorage.getItem('ya-id');
    if (!v) sessionStorage.setItem('ya-id', (v = randomId()));
    return v;
  } catch { return randomId(); }
})();

// Persistent device key: the hub remembers name and settings under it.
const deviceKey = (() => {
  let v = store.get('ya-key');
  if (!v) store.set('ya-key', (v = randomId() + randomId()));
  return v;
})();

// iPhone models by screen size in points (portrait) and pixel ratio; browsers on plain http don't expose the model.
// Several models share a screen, so a name covers all of them (✎ renames the device).
const IPHONES = {
  '320x568': 'iPhone SE', '375x667': 'iPhone 6–8 / SE', '414x736': 'iPhone 6–8 Plus', '375x812': 'iPhone X / XS / 11 Pro / mini',
  '414x896@2': 'iPhone XR / 11', '414x896@3': 'iPhone XS Max / 11 Pro Max', '390x844': 'iPhone 12–14', '428x926': 'iPhone 12–13 Pro Max / 14 Plus',
  '393x852': 'iPhone 14 Pro–16', '430x932': 'iPhone 14 Pro Max–16 Plus', '402x874': 'iPhone 16 Pro / 17', '420x912': 'iPhone Air',
  '440x956': 'iPhone 16–17 Pro Max',
};

// Traits used to recognise the device if the browser loses its key (cleared site data, private tab).
function fingerprint() {
  const ua = navigator.userAgent, w = Math.min(screen.width, screen.height), h = Math.max(screen.width, screen.height);
  const dpr = String(Math.round((window.devicePixelRatio || 1) * 100) / 100);
  const ipadOs = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
  const os = /iPhone|iPad|iPod/.test(ua) || ipadOs ? 'iOS' : /Android/.test(ua) ? 'Android'
    : /Mac OS X/.test(ua) ? 'macOS' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : 'other';
  const browser = /YaBrowser/.test(ua) ? 'Yandex' : /SamsungBrowser/.test(ua) ? 'Samsung' : /Edg\//.test(ua) ? 'Edge'
    : /OPR\//.test(ua) ? 'Opera' : /Firefox|FxiOS/.test(ua) ? 'Firefox' : /Chrome|CriOS/.test(ua) ? 'Chrome' : /Safari/.test(ua) ? 'Safari' : 'other';
  const kind = /iPad/.test(ua) || ipadOs || (os === 'Android' && !/Mobile/.test(ua)) ? 'tablet'
    : os === 'iOS' || os === 'Android' ? 'phone' : 'computer';
  let model;
  if (os === 'iOS') model = kind === 'tablet' ? 'iPad' : IPHONES[`${w}x${h}@${Math.round(dpr)}`] || IPHONES[`${w}x${h}`] || 'iPhone';
  else if (os === 'Android') {
    const m = ua.match(/Android [^;)]+; ([^;)]+?)(?: Build|\))/);
    model = m && m[1] !== 'K' ? m[1].trim() : kind === 'tablet' ? L('Android-планшет') : L('Android-телефон');
  } else model = { macOS: 'Mac', Windows: 'Windows', Linux: 'Linux' }[os] || L('Компьютер');
  return { os, browser, kind, model, screen: `${w}x${h}`, dpr };
}
let extraLatency = Number(store.get('ya-latency')) || 0;   // ms, how late this device's speaker is
let volume = store.get('ya-volume') == null ? 1 : Number(store.get('ya-volume'));
let muted = false;
let inCall = false;        // the Android app says a phone call is on: this device stays silent
const silent = () => muted || inCall;

let link = null;          // the way to the hub, see net.mjs
let snap = null;          // last snapshot from the hub
let online = false;
let joined = false;       // this device plays sound
let remoteOnly = false;   // this device is only a remote
let settingsPushed = false;
let lastResync = null;
let lastLocalChange = 0;  // ignore echoes of our own settings while a slider is moving

// ---------- clock ----------
let offset = 0, rtt = Infinity, bestRtt = Infinity;
const serverNow = () => performance.now() + offset;

async function measure(n) {
  const samples = [];
  for (let i = 0; i < n; i++) {
    const t0 = performance.now();
    const t = await link.time();
    const t1 = performance.now();
    samples.push({ rtt: t1 - t0, off: t - (t0 + t1) / 2 });
  }
  samples.sort((a, b) => a.rtt - b.rtt);
  const best = samples.slice(0, Math.max(1, Math.ceil(n / 4))).sort((a, b) => a.off - b.off);
  return { rtt: samples[0].rtt, off: best[best.length >> 1].off };
}

async function syncClock(n) {
  try {
    const m = await measure(n);
    // A measurement over a congested link is worse than the one we have — keep the old offset.
    if (!isFinite(bestRtt) || m.rtt <= bestRtt * 2 + 5) {
      if (isFinite(rtt)) diag.offsetStep = m.off - offset;
      offset = m.off;
      rtt = m.rtt;
    }
    bestRtt = Math.min(m.rtt, bestRtt * 1.2);
  } catch {}
}

// ---------- audio ----------
const AC = window.AudioContext || window.webkitAudioContext;
const ctx = new AC();
const gain = ctx.createGain();
gain.gain.value = volume;
gain.connect(ctx.destination);

const applyGain = () => gain.gain.setTargetAtTime(silent() ? 0 : volume, ctx.currentTime, 0.03);
const outLatencyMs = () => Math.round(((ctx.outputLatency || 0) + (ctx.baseLatency || 0)) * 1000);

// Server time (ms) at which a frame scheduled for context time c is heard = anchor + c * 1000.
// Without getOutputTimestamp (Safari 16) only currentTime is left, and Safari moves it a whole hardware buffer
// at a time: performance.now() - currentTime is a sawtooth tens of ms high. Its low points (right after each
// step) are the true value, so the anchor uses the minimum of the last two seconds (40 samples while playing).
const ctSamples = [];
function sampleCt() {
  const now = performance.now();
  ctSamples.push({ now, v: now - ctx.currentTime * 1000 });
  while (now - ctSamples[0].now > 2000) ctSamples.shift();
  let min = Infinity;
  for (const x of ctSamples) if (x.v < min) min = x.v;
  return min;
}
// getOutputTimestamp, when it agrees with the other two clocks. Safari 16 reports a contextTime that hardly moves:
// trusting it, a device restarts its sound twice a second.
let otsLag = null;   // ms between currentTime and the stamp's contextTime, for the diagnostics
function hasOts() {
  const ts = ctx.getOutputTimestamp ? ctx.getOutputTimestamp() : null;
  if (!(ts && ts.performanceTime > 0 && ts.contextTime > 0)) return null;
  const lag = ctx.currentTime - ts.contextTime;
  otsLag = Math.round(lag * 1000);
  return lag > -0.05 && lag < (ctx.outputLatency || 0) + 0.15 && Math.abs(performance.now() - ts.performanceTime) < 250 ? ts : null;
}
setInterval(() => { if (players.size && ctx.state === 'running' && !hasOts()) sampleCt(); }, 50);   // only while something plays

function audioAnchor() {
  const ts = hasOts();
  const a = ts ? ts.performanceTime - ts.contextTime * 1000 : sampleCt() + outLatencyMs();
  return a + offset + extraLatency;
}

const buffers = new Map();   // trackId -> AudioBuffer (current + next only)
const failed = new Set();    // trackIds this device cannot decode
const loadErrors = new Map();
let loading = null;          // { id, progress, decoding, cached }
const players = new Map();   // key -> { src, w, buf, ctxStart, posStart, rate } | { done: true }
let anchor = 0;
let lastErr = null;
// How this browser keeps time, sent to the hub with the status (read from any remote: __ya.snap.clients[i].diag).
// Drifts are ms per second between performance.now() and the audio clock; 0 means they keep pace.
const diag = { restarts: 0, behind: 0, ahead: 0, offsetStep: null, ctDrift: null, otsDrift: null, first: null, anchorResets: 0, maxJump: 0, since: 0 };
function clockDrift() {
  const now = performance.now(), ct = now - ctx.currentTime * 1000;
  const ts = ctx.getOutputTimestamp ? ctx.getOutputTimestamp() : null;
  const ots = ts && ts.performanceTime > 0 ? ts.performanceTime - ts.contextTime * 1000 : null;
  if (!diag.first || ctx.state !== 'running') { diag.first = { now, ct, ots }; return; }
  const sec = (now - diag.first.now) / 1000;
  diag.since = Math.round(sec);
  if (sec < 5) return;
  diag.ctDrift = (ct - diag.first.ct) / sec;
  if (ots != null && diag.first.ots != null) diag.otsDrift = (ots - diag.first.ots) / sec;
}

const decode = (ab) => new Promise((ok, fail) => {
  const p = ctx.decodeAudioData(ab, ok, (e) => fail(e || new Error(L('формат не поддерживается'))));
  if (p && p.then) p.then(ok, (e) => fail(e || new Error(L('формат не поддерживается'))));
});

let clickBuf = null;
// Calibration loop: 4 clicks per 2 s, the first one higher.
function clickBuffer() {
  if (clickBuf) return clickBuf;
  const sr = ctx.sampleRate, b = ctx.createBuffer(1, sr * 2, sr), d = b.getChannelData(0);
  for (let k = 0; k < 4; k++) {
    const f = k ? 1600 : 2600, o = Math.round((k * sr) / 2);
    for (let i = 0; i < sr * 0.03; i++) d[o + i] = Math.sin((2 * Math.PI * f * i) / sr) * Math.exp(-i / (sr * 0.004)) * 0.9;
  }
  return (clickBuf = b);
}

// What should be sounding right now according to the server.
function desired() {
  const st = snap.state, out = [];
  if (st.calibrate) out.push({ key: 'cal|' + st.calibrate.startAt, buf: clickBuffer(), startAt: st.calibrate.startAt, from: 0, loop: true });
  else if (st.playing) {
    out.push({ key: `${st.trackId}|${st.startAt}`, buf: buffers.get(st.trackId), startAt: st.startAt, from: st.position });
    if (st.next) out.push({ key: `${st.next.trackId}|${st.next.startAt}`, buf: buffers.get(st.next.trackId), startAt: st.next.startAt, from: 0 });
  }
  return out.filter((w) => w.buf);
}

function stopPlayer(key) {
  const p = players.get(key);
  players.delete(key);
  if (!p || p.done) return;
  try { p.src.stop(); } catch {}
  p.src.disconnect();
}

function startPlayer(w) {
  const a = audioAnchor();
  if (anchor && Math.abs(a - anchor) > 40) diag.anchorResets++;
  if (!anchor || Math.abs(a - anchor) > 40) anchor = a;
  let c = ctx.currentTime + 0.08;
  let pos = (anchor + c * 1000 - w.startAt) / 1000;
  if (pos < w.from) { c += w.from - pos; pos = w.from; }   // its start is still ahead: wait for it
  if (!w.loop && pos >= w.buf.duration) { players.set(w.key, { done: true }); return; }
  const src = ctx.createBufferSource();
  src.buffer = w.buf;
  src.loop = !!w.loop;
  src.connect(gain);
  src.start(c, w.loop ? pos % w.buf.duration : pos);
  players.set(w.key, { src, w, buf: w.buf, ctxStart: c, posStart: pos, rate: 1 });
}

function syncPlayers() {
  const want = snap && joined && ctx.state === 'running' ? desired() : [];
  const keys = new Set(want.map((w) => w.key));
  for (const k of [...players.keys()]) if (!keys.has(k)) stopPlayer(k);
  for (const w of want) if (!players.has(w.key)) startPlayer(w);
}

function restartAll() {
  for (const k of [...players.keys()]) stopPlayer(k);
  anchor = 0;
  syncPlayers();
}

// Compare where each source is with where it should be; small errors are closed by a
// barely audible rate change (±0.4 %), large ones by restarting the source.
function correct() {
  clockDrift();
  if (!players.size) { lastErr = null; return; }
  const a = audioAnchor();
  diag.maxJump = Math.max(diag.maxJump, Math.abs(a - anchor));
  if (Math.abs(a - anchor) > 40) diag.anchorResets++;
  anchor = Math.abs(a - anchor) > 40 ? a : anchor + (a - anchor) * 0.15;
  const c = ctx.currentTime, restart = [];
  for (const [key, p] of players) {
    if (p.done) continue;
    if (c < p.ctxStart) {   // scheduled, not started yet: keep its start time exact
      if (Math.abs((p.w.startAt + p.posStart * 1000 - anchor) / 1000 - p.ctxStart) > 0.002) restart.push(p.w);
      continue;
    }
    const actual = p.posStart + (c - p.ctxStart) * p.rate;
    if (!p.w.loop && actual > p.buf.duration) continue;
    const err = (actual - (anchor + c * 1000 - p.w.startAt) / 1000) * 1000;   // ms, > 0: ahead
    lastErr = err;
    if (Math.abs(err) > 35) {
      diag.restarts++;
      diag[err < 0 ? 'behind' : 'ahead']++;
      restart.push(p.w);
      continue;
    }
    const rate = Math.abs(err) < 2 ? 1 : 1 - Math.max(-0.004, Math.min(0.004, err / 3000));
    if (rate !== p.rate) {
      Object.assign(p, { posStart: actual, ctxStart: c, rate });
      p.src.playbackRate.setValueAtTime(rate, c);
    }
  }
  for (const w of restart) { stopPlayer(w.key); startPlayer(w); }
}

async function resync() {
  bestRtt = Infinity;
  await syncClock(24);
  restartAll();
  sendStatus();
  render();
}

// ---------- local library (IndexedDB: works on plain http, unlike Cache Storage/OPFS) ----------
let dbPromise = null;
function db() {
  return (dbPromise ??= new Promise((ok, fail) => {
    const r = indexedDB.open('youraura', 1);
    r.onupgradeneeded = () => {
      r.result.createObjectStore('meta', { keyPath: 'hash' });
      r.result.createObjectStore('files');
    };
    r.onsuccess = () => ok(r.result);
    r.onerror = () => fail(r.error);
  }));
}
async function idb(stores, mode, fn) {
  const d = await db();
  return new Promise((ok, fail) => {
    const tx = d.transaction(stores, mode);
    const req = fn(tx);
    tx.oncomplete = () => ok(req && req.result);
    tx.onerror = tx.onabort = () => fail(tx.error);
  });
}
let cacheMeta = [];   // [{ hash, name, size, savedAt }]
let cacheJob = false; // «Скачать всю библиотеку» is running
const cacheOn = () => store.get('ya-cache') === 'on';
const cachedHashes = () => new Set(cacheMeta.map((m) => m.hash));

async function refreshCache() {
  try { cacheMeta = (await idb('meta', 'readonly', (tx) => tx.objectStore('meta').getAll())) || []; } catch { cacheMeta = []; }
  render();
}
const cacheGet = (hash) => idb('files', 'readonly', (tx) => tx.objectStore('files').get(hash)).catch(() => null);
async function cachePut(t, data) {
  await idb(['meta', 'files'], 'readwrite', (tx) => {
    tx.objectStore('files').put(data, t.hash);
    return tx.objectStore('meta').put({ hash: t.hash, name: t.name, size: data.byteLength, savedAt: Date.now() });
  });
  refreshCache();
}
async function cacheDelete(hash) {
  await idb(['meta', 'files'], 'readwrite', (tx) => {
    tx.objectStore('files').delete(hash);
    return tx.objectStore('meta').delete(hash);
  });
  refreshCache();
}

// ---------- loading tracks (current first, then the next one) ----------
async function load(t) {
  loading = { id: t.id, progress: 0, decoding: false, cached: false };
  sendStatus();
  render();
  try {
    let data = cacheOn() && t.hash ? await cacheGet(t.hash) : null;
    if (data) loading.cached = true;
    else {
      let lastReport = 0;
      data = await link.media(t, (p) => {
        loading.progress = p;
        if (performance.now() - lastReport > 400) { lastReport = performance.now(); sendStatus(); render(); }
      });
      if (cacheOn() && t.hash) cachePut(t, data.slice(0)).catch(() => {});   // decode() detaches data
    }
    loading.progress = 1;
    loading.decoding = true;
    render();
    buffers.set(t.id, await decode(data));
  } catch (e) {
    failed.add(t.id);
    loadErrors.set(t.id, String((e && e.message) || e));
  }
  loading = null;
  sendStatus();
  syncPlayers();
  render();
}

async function pump() {
  if (loading || !joined || !snap) return;
  const st = snap.state;
  const isFile = (id) => snap.tracks.find((t) => t.id === id)?.kind !== 'youtube';   // YouTube plays in its own player
  const want = [...new Set([st.trackId, st.next?.trackId, st.upNext].filter((id) => id && isFile(id)))];
  for (const k of [...buffers.keys()]) if (!want.includes(k)) buffers.delete(k);   // decoded audio is big
  const id = want.find((x) => !buffers.has(x) && !failed.has(x));
  const t = id && snap.tracks.find((x) => x.id === id);
  if (!t) return;
  await load(t);
  pump();
}

// ---------- server link ----------
function sendStatus(withSettings) {
  const durations = {}, ready = [...buffers.keys()];
  for (const [id, b] of buffers) durations[id] = b.duration;
  if (yt.cued && yt.trackId) {
    ready.push(yt.trackId);
    const d = yt.player?.getDuration?.();
    if (d > 0) durations[yt.trackId] = d;
  }
  const body = {
    id: clientId,
    joined,
    ready,
    failed: [...failed],
    errors: Object.fromEntries([...loadErrors].filter(([id]) => failed.has(id)).slice(-10)),   // shown on every remote
    loading: loading && { id: loading.id, progress: loading.progress },
    durations,
    rtt: isFinite(rtt) ? Math.round(rtt) : null,
    diag: { restarts: diag.restarts, behind: diag.behind, ahead: diag.ahead, err: lastErr, offsetStep: diag.offsetStep,
      anchorResets: diag.anchorResets, maxJump: diag.maxJump, since: diag.since, ots: !!hasOts(), otsLag,
      ctDrift: diag.ctDrift, otsDrift: diag.otsDrift, sampleRate: ctx.sampleRate, outputLatency: ctx.outputLatency,
      wake: wakeState(), ua: navigator.userAgent.slice(0, 120) },
  };
  if (withSettings) body.settings = { latency: extraLatency, muted, volume };
  link?.status(body);
}

const cmd = (action, extra) => link?.cmd(action, extra);

const throttles = new Map();
// At most one call per `ms` for a given key; the last value always gets through.
function throttled(key, ms, fn) {
  let t = throttles.get(key);
  if (!t) throttles.set(key, (t = { last: 0, timer: null, fn: null }));
  t.fn = fn;
  const wait = ms - (performance.now() - t.last);
  if (wait <= 0) { t.last = performance.now(); fn(); }
  else if (!t.timer) t.timer = setTimeout(() => { t.timer = null; t.last = performance.now(); t.fn(); }, wait);
}

// Settings of this device can be changed from any remote; the server copy wins.
function adoptSettings(me) {
  if (!me) return;
  if (me.latency == null) {   // server does not know us yet (it restarted) — tell it
    if (!settingsPushed) { settingsPushed = true; sendStatus(true); }
    return;
  }
  if (performance.now() - lastLocalChange < 800) return;
  if (me.latency !== extraLatency) { extraLatency = me.latency; store.set('ya-latency', extraLatency); }
  if (typeof me.volume === 'number' && me.volume !== volume) { volume = me.volume; store.set('ya-volume', volume); }
  if (me.muted !== muted) muted = me.muted;
  applyGain();
}

function setMine(patch) {
  lastLocalChange = performance.now();
  if ('volume' in patch) { volume = patch.volume; store.set('ya-volume', volume); }
  if ('latency' in patch) { extraLatency = patch.latency; store.set('ya-latency', extraLatency); }
  if ('muted' in patch) muted = patch.muted;
  applyGain();
  render();
  throttled('dev-' + clientId, 80, () => cmd('device', { id: clientId, latency: extraLatency, volume, muted }));
}

let greeted = false;
// ---------- broadcast ----------
// While the Android hub broadcasts, every device plays the phone's sound LIVE_DELAY ms after it was captured:
// time for packets to cross Wi-Fi or the internet room. Packets go on the same audio clock as tracks
// (audioAnchor) back to back; a small drift of the clocks is taken up by playing a packet up to 0.5 % faster
// or slower, a large one (a gap in the stream) by placing the next packet where it belongs.
const LIVE_DELAY = 1000;
let live = null;   // { stop, next, packets, late }
// The hub phone itself never plays the broadcast: whatever it captures sounds there already, a second earlier.
// It only sends the sound on; its own speaker is best turned down (capture doesn't depend on the volume).
const isAppHub = () => link?.kind === 'host' && !!link.canBroadcast;
let phoneVolume = globalThis.YourAuraApp?.volume?.() ?? null;   // % of the hub phone's media volume

function onLivePacket(p) {
  if (!live) return;
  live.packets++;
  if (!joined || ctx.state !== 'running' || isAppHub()) { live.next = 0; return; }
  const { t, frames, pcm } = parsePacket(p);
  const a = audioAnchor();
  anchor = !anchor || Math.abs(a - anchor) > 40 ? a : anchor + (a - anchor) * 0.15;
  const ideal = (t + LIVE_DELAY - anchor) / 1000;
  const err = live.next ? ideal - live.next : Infinity;   // s, > 0: the packets run early
  const at = Math.abs(err) < 0.05 ? live.next : ideal;
  if (at < ctx.currentTime + 0.005) { live.next = 0; live.late++; return; }   // came too late: skip it
  const rate = Math.abs(err) < 0.05 ? 1 - Math.max(-0.005, Math.min(0.005, err / 2)) : 1;
  const buf = ctx.createBuffer(2, frames, 48000);
  const l = buf.getChannelData(0), r = buf.getChannelData(1);
  for (let i = 0; i < frames; i++) { l[i] = pcm[2 * i] / 32768; r[i] = pcm[2 * i + 1] / 32768; }
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.playbackRate.value = rate;
  src.connect(gain);
  src.start(at);
  live.next = at + frames / 48000 / rate;
}

// Listen while the hub broadcasts. The hub phone listens even when silent: it passes the sound on.
function syncLive() {
  const want = !!(snap?.state.live && link?.live);
  if (want && !live) {
    live = { next: 0, packets: 0, late: 0 };
    live.stop = link.live(onLivePacket);
  }
  if (!want && live) {
    live.stop();
    live = null;
  }
}

function apply(s) {
  snap = s;
  const me = s.clients.find((c) => c.id === clientId);
  adoptSettings(me);
  if (me?.recognized && !greeted) toast(L('Узнал это устройство: «{name}». Имя, громкость и задержка восстановлены.', { name: me.name }));
  if (me) greeted = true;
  if (lastResync !== null && s.state.resync !== lastResync && joined) resync();
  lastResync = s.state.resync;
  pump();
  syncPlayers();
  syncLive();
  render();
}

function connect() {
  link.open({
    snapshot: apply,
    identify,
    online(on) {
      if (on && !online) { settingsPushed = false; sendStatus(); }
      online = on;
      render();
    },
  });
}

// ---------- device ----------
let wakeLock = null;
async function keepAwake() {
  try {
    if ('wakeLock' in navigator && document.visibilityState === 'visible' && !wakeLock) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    }
  } catch {}
}

// A playing video keeps a phone's screen on — that is how YouTube does it. Where the Wake Lock API can't
// (iOS before 16.4, plain-http pages such as the Wi-Fi hubs), a tiny black video with a silent sound track loops,
// unseen, while this device plays. On iOS before 17 (no audioSession) its sound also takes the page out of the
// mute switch's reach. Safari plays <video> only from servers that answer Range requests, ours don't: the video
// is fetched once and played from memory. No `loop`: Safari lets the screen sleep during looping media, so the
// video is wound back by hand before it ends.
// Not in the Android app: a hub phone is meant to work with its screen off.
const needVideo = () => !globalThis.YourAuraApp
  && (!('wakeLock' in navigator && window.isSecureContext) || (!navigator.audioSession && fingerprint().os === 'iOS'));
let awakeVideo = null;
fetch('keepawake.mp4').then((r) => (r.ok ? r.blob() : null)).then((b) => {
  if (!b) return;
  const v = document.createElement('video');
  v.src = URL.createObjectURL(new Blob([b], { type: 'video/mp4' }));
  v.addEventListener('timeupdate', () => { if (v.currentTime > v.duration - 1) v.currentTime = 0.5; });
  v.addEventListener('ended', () => { v.currentTime = 0; playAwakeVideo(); });
  v.playsInline = true;
  v.setAttribute('playsinline', '');
  v.disableRemotePlayback = true;
  v.setAttribute('aria-hidden', 'true');
  v.style.cssText = 'position:fixed;left:0;bottom:0;width:1px;height:1px;opacity:.01;pointer-events:none';
  document.body.append(v);
  awakeVideo = v;
}).catch(() => {});
let awakeErr = '';
const playAwakeVideo = () => {
  if (awakeVideo && needVideo() && awakeVideo.paused) awakeVideo.play().then(() => { awakeErr = ''; }, (e) => { awakeErr = e.name || String(e); });
};
// For the diagnostics: what keeps this screen on.
const wakeState = () => (needVideo()
  ? (awakeVideo ? `video ${awakeVideo.paused ? 'paused' : 'playing'} t=${awakeVideo.currentTime.toFixed(1)} ${awakeErr}`.trim() : 'video missing')
  : wakeLock ? 'wakelock' : 'none');

// Must run inside a tap: browsers only allow sound after a user gesture.
function unlockAudio() {
  try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch {}   // iOS: ignore the mute switch
  playAwakeVideo();
  const p = ctx.resume();
  const s = ctx.createBufferSource();
  s.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
  s.connect(ctx.destination);
  s.start();
  return p;
}

async function join() {
  unlockAudio();
  joined = true;
  remoteOnly = false;
  $('#joinbox').classList.add('hide');
  keepAwake();
  await syncClock(16);
  sendStatus();
  if (snap) apply(snap);
}

ctx.onstatechange = () => {
  if (ctx.state === 'running') restartAll();
  render();
};

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  keepAwake();
  if (joined) { ctx.resume().catch(() => {}); playAwakeVideo(); syncClock(8); }
});

// ---------- YouTube ----------
// The video plays in YouTube's own iframe player, so it can't be scheduled sample-accurately like Web Audio.
// Instead: seek a little ahead while paused, press play at the right moment (learning this device's start lag),
// then hold it in place with small playback-rate nudges, or a fresh seek if it drifts far (ads, buffering).
const YTS = { UNSTARTED: -1, ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 };
const yt = {
  player: null, ready: false, creating: false, videoId: null, trackId: null, cued: false, state: YTS.UNSTARTED,
  jumping: false, lastJump: 0, rate: 1, rates: [1], err: null, posFor: null, needTap: false, vol: null, muted: null,
  lag: Number(store.get('ya-ytlag')) || 0.15,   // seconds between playVideo() and the picture actually moving
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(cond, ms) {
  for (const end = performance.now() + ms; performance.now() < end; await sleep(40)) if (cond()) return true;
  return cond();
}

let ytApi = null;
function loadYtApi() {
  return (ytApi ??= new Promise((ok, fail) => {
    if (window.YT && window.YT.Player) return ok();
    window.onYouTubeIframeAPIReady = ok;
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.onerror = () => { ytApi = null; fail(new Error(L('YouTube недоступен, нет интернета?'))); };
    document.head.appendChild(s);
  }));
}

function ytFail(id, message) {
  if (!id) return;
  failed.add(id);
  loadErrors.set(id, message);
  sendStatus();
  render();
}

async function ytEnsure(t) {
  if (yt.player || yt.creating) return;
  yt.creating = true;
  try { await loadYtApi(); } catch (e) { yt.creating = false; return ytFail(t.id, e.message); }
  yt.player = new YT.Player('ytplayer', {
    width: '100%',
    height: '100%',
    playerVars: { playsinline: 1, controls: 0, disablekb: 1, rel: 0, fs: 0, iv_load_policy: 3, modestbranding: 1 },
    events: {
      onReady: () => {
        yt.ready = true;
        yt.rates = yt.player.getAvailablePlaybackRates?.() || [1];
      },
      onStateChange: (e) => {
        yt.state = e.data;
        if (e.data === YTS.PLAYING) { yt.needTap = false; }
        if (!yt.cued && [YTS.CUED, YTS.PLAYING, YTS.PAUSED, YTS.BUFFERING].includes(e.data)) { yt.cued = true; sendStatus(); }
      },
      onError: (e) => {
        // Phrased for every remote's device list: «YouTube не открылся в Firefox …» says where the problem is.
        const code = e.data, where = fingerprint().browser === 'other' ? L('в этом браузере') : L('в {browser}', { browser: fingerprint().browser });
        const msg = code === 101 || code === 150 ? L('YouTube не открылся {where}: правообладатель ограничил показ (код {code})', { where, code })
          : code === 152 || code === 153 ? L('YouTube не открылся {where}: не принял адрес страницы (код {code})', { where, code })
          : code === 100 ? L('видео удалено или закрыто (код 100)')
          : code === 5 ? L('плеер YouTube не работает {where} (код 5)', { where }) : L('YouTube не открылся {where}, код {code}', { where, code });
        ytFail(yt.trackId, msg);
      },
    },
  });
}

// Where the video should be right now (s), including this device's output and speaker latency.
function ytExpected() {
  return (serverNow() + outLatencyMs() + extraLatency - snap.state.startAt) / 1000;
}

async function ytJump() {
  const p = yt.player, startAt = snap.state.startAt;
  yt.jumping = true;
  yt.lastJump = performance.now();
  try {
    const ahead = snap.state.position - ytExpected();
    const target = ahead > 0.8 ? snap.state.position : Math.max(0, ytExpected() + 1.6);
    p.mute();
    p.seekTo(target, true);
    if (yt.state !== YTS.PAUSED) {
      // From cued/playing/ended seekTo starts playback: let it buffer, then hold it paused at the target.
      await waitFor(() => yt.state === YTS.PLAYING, 4000);
      p.pauseVideo();
      p.seekTo(target, true);
    }
    await sleep(250);
    const wait = (target - yt.lag - ytExpected()) * 1000;
    if (wait < 0) return;   // buffering took too long; the next tick tries again
    await sleep(wait);
    if (snap.state.startAt !== startAt || !snap.state.playing) return;
    if (!silent()) p.unMute();
    p.playVideo();
    if (!(await waitFor(() => yt.state === YTS.PLAYING, 3000))) { yt.needTap = true; render(); return; }
    await sleep(800);
    // Started late (err < 0) → press play earlier next time.
    const err = p.getCurrentTime() - ytExpected();
    if (Math.abs(err) < 1) { yt.lag = Math.max(0, Math.min(1, yt.lag - err * 0.6)); store.set('ya-ytlag', yt.lag.toFixed(3)); }
  } finally {
    yt.muted = null;   // ytTick re-applies mute/volume
    yt.jumping = false;
  }
}

function ytTick() {
  if (!snap) return;
  // A video still downloading to the hub will play as a file; only failed downloads use YouTube's player.
  const st = snap.state, t = curTrack(), isYt = t?.kind === 'youtube' && !t.pending;
  const show = isYt && joined && !failed.has(t.id);
  $('#ytwrap').hidden = !show;
  $('#yttap').hidden = !(show && yt.needTap);
  const thumb = $('#ytthumb');
  thumb.hidden = !(isYt && !show);
  if (isYt && !show && thumb.dataset.v !== t.videoId) { thumb.dataset.v = t.videoId; thumb.src = `https://i.ytimg.com/vi/${encodeURIComponent(t.videoId)}/hqdefault.jpg`; }
  if (!joined) return;
  if (!isYt || st.calibrate) {
    if (yt.ready && (yt.state === YTS.PLAYING || yt.state === YTS.BUFFERING)) yt.player.pauseVideo();
    return;
  }
  if (failed.has(t.id)) return;
  ytEnsure(t);
  if (!yt.ready) return;
  const p = yt.player;
  if (yt.videoId !== t.videoId) {
    Object.assign(yt, { videoId: t.videoId, trackId: t.id, cued: false, state: YTS.UNSTARTED, posFor: null, rate: 1, needTap: false });
    p.cueVideoById({ videoId: t.videoId, startSeconds: st.playing ? 0 : st.position });
    return;
  }
  const v = Math.round(volume * 100);
  if (yt.vol !== v) { p.setVolume(v); yt.vol = v; }
  if (yt.muted !== silent() && !yt.jumping) { if (silent()) p.mute(); else p.unMute(); yt.muted = silent(); }
  if (yt.jumping) return;

  if (!st.playing) {
    yt.err = null;
    if (yt.state === YTS.PLAYING || yt.state === YTS.BUFFERING) p.pauseVideo();
    // Seeking while paused keeps it paused; from other states it would start playing.
    if (yt.state === YTS.PAUSED && yt.posFor !== st.position) { p.seekTo(st.position, true); yt.posFor = st.position; }
    return;
  }
  yt.posFor = null;
  const expected = ytExpected();
  if (t.duration && expected > t.duration - 0.3) return;
  if (yt.state !== YTS.PLAYING) {
    if (!yt.needTap && performance.now() - yt.lastJump > 4000) ytJump();
    return;
  }
  const err = (p.getCurrentTime() - expected) * 1000;   // ms, > 0: ahead
  yt.err = err;
  const up = yt.rates.find((r) => r > 1 && r <= 1.1), down = [...yt.rates].reverse().find((r) => r < 1 && r >= 0.9);
  const far = up && down ? 300 : 120;   // without fine rates only a seek can fix drift
  if (Math.abs(err) > far) {
    if (performance.now() - yt.lastJump > 4000) ytJump();
    return;
  }
  let rate = yt.rate;
  if (up && down) rate = err < -25 ? up : err > 25 ? down : Math.abs(err) < 8 ? 1 : yt.rate;
  if (rate !== yt.rate) { p.setPlaybackRate(rate); yt.rate = rate; }
}

// ---------- find a device ----------
function chime() {
  if (ctx.state !== 'running') return;
  const t0 = ctx.currentTime + 0.05;
  [880, 1175, 1568, 880, 1175, 1568].forEach((f, i) => {
    const at = t0 + i * 0.16 + (i > 2 ? 0.5 : 0), o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.value = f;
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(0.3, at + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, at + 0.6);
    o.connect(g).connect(ctx.destination);   // past the device gain: a muted device still answers
    o.start(at);
    o.stop(at + 0.65);
  });
}

let identifyTimer = null;
function identify() {
  const me = snap?.clients.find((c) => c.id === clientId);
  $('#idname').textContent = me?.name || L('Это устройство');
  $('#idkind').innerHTML = ICON[me?.kind] || ICON.computer;
  $('#identify').hidden = false;
  chime();
  clearTimeout(identifyTimer);
  identifyTimer = setTimeout(() => { $('#identify').hidden = true; }, 5000);
}

let toastTimer = null;
function toast(text) {
  $('#toast').textContent = text;
  $('#toast').classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('#toast').classList.remove('show'), 4500);
}

// ---------- UI ----------
const curTrack = () => snap?.tracks.find((t) => t.id === snap.state.trackId);
const trackName = (id) => snap?.tracks.find((t) => t.id === id)?.name ?? '—';

function positionNow() {
  const st = snap.state;
  return st.playing ? (serverNow() - st.startAt) / 1000 : st.position;
}

// Range inputs: the gradient fill follows --p, and values from the server don't fight a finger on the slider.
function paintRange(el) {
  const p = ((el.value - el.min) / (el.max - el.min || 1)) * 100;
  el.style.setProperty('--p', p + '%');
}
function setRange(el, v) {
  if (el.dataset.hold) return;
  el.value = v;
  paintRange(el);
}
document.addEventListener('input', (e) => { if (e.target.type === 'range') paintRange(e.target); });
document.addEventListener('pointerdown', (e) => { if (e.target.type === 'range') e.target.dataset.hold = '1'; }, true);
const releaseRanges = () => setTimeout(() => document.querySelectorAll('input[type=range][data-hold]').forEach((el) => delete el.dataset.hold), 300);
window.addEventListener('pointerup', releaseRanges, true);
window.addEventListener('pointercancel', releaseRanges, true);

let qrFor = null;
function renderQr(url) {
  if (!url || url === qrFor || typeof qrcode !== 'function') return;
  qrFor = url;
  const q = qrcode(0, 'M');
  q.addData(url);
  q.make();
  const n = q.getModuleCount();
  let d = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += `M${c} ${r}h1v1h-1z`;
  $('#qr').innerHTML = `<svg viewBox="-3 -3 ${n + 6} ${n + 6}" shape-rendering="crispEdges" role="img" aria-label="${esc(L('QR-код {url}', { url }))}">
    <rect x="-3" y="-3" width="${n + 6}" height="${n + 6}" fill="#fff"/><path d="${d}" fill="#1b0833"/></svg>`;
}

const VOL_ROW = `
  <div class="devhead"><span class="kind"></span><span class="who"><span class="name"></span><span class="sub"></span></span>
    <button class="icon" data-act="find" title="${L('Найти: устройство покажет своё имя и прозвенит')}" aria-label="${L('Найти устройство')}">${ICON.bell}</button>
    <button class="icon" data-act="rename" title="${L('Переименовать')}" aria-label="${L('Переименовать')}">${ICON.pencil}</button>
    <button class="icon" data-act="mute"></button></div>
  <div class="slide"><span class="spk">${ICON.spkLow}</span><input type="range" min="0" max="1" step="0.01" data-act="vol" aria-label="${L('Громкость устройства')}"><span class="spk">${ICON.spkHigh}</span></div>`;
const LAT_ROW = `
  <div class="devhead"><span class="kind"></span><span class="who"><span class="name"></span></span><span class="readout"></span></div>
  <div class="slide"><button data-act="lat" data-d="-1" aria-label="${L('Минус 1 мс')}">−1</button><input type="range" min="-200" max="500" step="1" data-act="latr" aria-label="${L('Задержка устройства')}"><button data-act="lat" data-d="1" aria-label="${L('Плюс 1 мс')}">+1</button></div>`;
const KIND_TITLE = { phone: L('Телефон'), tablet: L('Планшет'), computer: L('Компьютер') };
function setKind(li, c) {
  const k = li.querySelector('.kind');
  if (k.dataset.k === c.kind) return;
  k.dataset.k = c.kind;
  k.innerHTML = ICON[c.kind] || ICON.computer;
  k.title = KIND_TITLE[c.kind] || '';
}
const volRows = new Map(), latRows = new Map();
const fmtLat = (v) => `${v > 0 ? '+' : ''}${v} ${L('мс')}`;
const devName = (c) => esc(c.name) + (c.id === clientId ? ` <span class="mut">(${L('это')})</span>` : '');

// Rows are kept and patched in place, so a slider being dragged is not replaced under the finger.
function keyedRows(ul, rows, items, template, update) {
  const seen = new Set();
  items.forEach((c, i) => {
    seen.add(c.id);
    let li = rows.get(c.id);
    if (!li) {
      li = document.createElement('li');
      li.className = 'dev';
      li.dataset.id = c.id;
      li.innerHTML = template;
      rows.set(c.id, li);
    }
    if (ul.children[i] !== li) ul.insertBefore(li, ul.children[i] || null);
    update(li, c);
  });
  for (const [id, li] of rows) if (!seen.has(id)) { li.remove(); rows.delete(id); }
}

function renderDevices() {
  const st = snap.state;
  keyedRows($('#volrows'), volRows, snap.clients, VOL_ROW, (li, c) => {
    let state;
    if (!c.joined) state = `<span class="mut">${L('пульт')}</span>`;
    else if (c.failed.includes(st.trackId)) state = `<span class="bad">${esc(L(c.errors?.[st.trackId] || 'не открылся трек'))}</span>`;
    else if (c.ready.includes(st.trackId) || !st.trackId) state = `<span class="ok">${L('готово')}</span>`;
    else if (c.loading) state = `<span class="warn">${L('загрузка {p}%', { p: Math.round(c.loading.progress * 100) })}</span>`;
    else state = `<span class="warn">${L('ждём')}</span>`;
    setKind(li, c);
    li.querySelector('.sub').title = li.querySelector('.sub').textContent;
    li.querySelector('.name').innerHTML = devName(c);
    li.querySelector('.sub').innerHTML = state + (c.ip ? ` · ${esc(c.ip)}` : '') + (c.rtt != null ? ` · ${esc(c.rtt)} ${L('мс')}` : '');
    const mute = li.querySelector('[data-act=mute]');
    mute.innerHTML = c.muted ? ICON.muted : ICON.sound;
    mute.classList.toggle('on', !!c.muted);
    mute.title = c.muted ? L('Включить звук') : L('Заглушить');
    mute.hidden = !c.joined;
    li.querySelector('.slide').hidden = !c.joined;
    setRange(li.querySelector('[data-act=vol]'), c.volume ?? 1);
  });
  // Remotes have no speaker, so there is nothing to delay.
  keyedRows($('#latrows'), latRows, snap.clients.filter((c) => c.joined), LAT_ROW, (li, c) => {
    setKind(li, c);
    li.querySelector('.name').innerHTML = devName(c);
    li.querySelector('.readout').textContent = fmtLat(c.latency ?? 0);
    setRange(li.querySelector('[data-act=latr]'), c.latency ?? 0);
  });
}

// A YouTube track that plays through YouTube's own player (the hub could not download it):
// if that player failed in this browser, the fix is another browser; otherwise just explain the fallback.
function renderYtHelp(t) {
  const box = $('#ythelp');
  if (!(t?.kind === 'youtube' && !t.pending && (t.dlError || failed.has(t.id)))) { box.hidden = true; box.dataset.for = ''; return; }
  const browser = fingerprint().browser;
  const other = browser === 'Chrome' ? (fingerprint().os === 'iOS' || fingerprint().os === 'macOS' ? 'Safari' : 'Firefox') : 'Chrome';
  // A room hosted in a browser can't download from YouTube at all; the Android app can.
  const app = snap.hubKind === 'browser' ? `<div class="applink">${L(`Или поставь приложение YourAura для Android: оно скачивает звук с YouTube
    и раздаёт его всем устройствам, синхрон точный и запреты встраивания не мешают.`)}
    <a class="btn primary" href="${APP_URL}" target="_blank" rel="noopener">${L('Скачать приложение')}</a></div>` : '';
  let html;
  if (joined && failed.has(t.id)) {
    html = `<b>${esc(loadErrors.get(t.id) || L('YouTube не открылся в этом браузере'))}.</b><br>
      ${L('Открой YourAura в другом браузере, например в {other}:', { other })} <code>${esc(location.href)}</code>${app}
      <div class="actions"><button data-ytagain="${esc(t.id)}">${L('Попробовать здесь ещё раз')}</button></div>`;
  } else if (snap.hubKind === 'browser') {
    html = `<b>${esc(L(t.dlError))}.</b> ${L('В браузере такое видео не сыграть.')}${app}`;
  } else {
    html = `<b>${L('Хаб не скачал звук с YouTube.')}</b> ${esc(L(t.dlError))}.<br>
      ${L('Трек играет через плеер YouTube на каждом устройстве, синхрон там чуть грубее.')}
      <div class="actions"><button data-retry="${esc(t.id)}">${L('Скачать ещё раз')}</button></div>`;
  }
  if (box.dataset.for !== t.id + html) { box.innerHTML = html; box.dataset.for = t.id + html; }
  box.hidden = false;
}

function render() {
  $('#conn').className = 'dot' + (online ? ' on' : '');
  $('#conntext').textContent = L(online ? (joined ? (muted ? 'заглушено' : 'звук включён') : remoteOnly ? 'пульт' : 'на связи')
    : link?.kind === 'guest' ? 'ищу хаб комнаты…' : 'нет связи');
  // iPhone stops a page's sound when the screen locks or Safari goes to the background.
  const ios = fingerprint().os === 'iOS';
  $('#iosbanner').classList.toggle('show', ios && joined);
  $('#iosbanner p').textContent = L(link?.kind === 'host'
    ? 'Этот iPhone — хаб комнаты. Не блокируй экран и не сворачивай браузер: иначе iPhone остановит музыку на всех устройствах.'
    : 'На iPhone не блокируй экран и не сворачивай браузер, пока играет музыка: иначе iPhone остановит звук.');
  $('#resume').classList.toggle('show', joined && ctx.state !== 'running');
  $('#mutedbanner').classList.toggle('show', joined && muted);
  $('#cacheask').classList.toggle('show', joined && store.get('ya-cache') == null);
  if (!snap) return;
  const st = snap.state, t = curTrack(), cached = cachedHashes();
  document.body.classList.toggle('playing', st.playing);

  $('#title').textContent = st.live ? L('Трансляция с телефона') : st.calibrate ? L('Калибровка щелчками') : t ? t.name : L('Нет трека — добавь музыку ниже');
  $('#upnext').textContent = st.upNext && !st.calibrate ? L('Далее: {name}', { name: trackName(st.upNext) }) : '';
  $('#play').innerHTML = st.playing || st.waiting ? ICON.pause : ICON.play;
  $('#play').disabled = !t || st.live;
  $('#prev').disabled = st.live;
  $('#seek').hidden = st.live;
  $('#next').disabled = !st.upNext;

  let s = '';
  const err = loadErrors.get(st.trackId);
  if (joined && err && failed.has(st.trackId) && t?.kind !== 'youtube') s = `<span class="bad">${L('Не удалось открыть трек: {err}', { err: esc(L(err)) })}</span>`;   // YouTube: see #ythelp
  else if (joined && loading && loading.id === st.trackId) s = loading.decoding ? L('Распаковка…') : L('Загрузка {p}%', { p: Math.round(loading.progress * 100) });
  else if (t?.pending) s = L('Скачиваю с YouTube на хаб: {p}%', { p: Math.round((t.progress || 0) * 100) }) + (st.waiting ? L(', потом включу') : '');
  else if (st.waiting) s = L('Ждём, пока все устройства загрузят трек…');
  else if (st.calibrate) s = L('Подстрой задержки в разделе «Устройства»');
  else if (st.playing && !joined) s = L('Играет на устройствах') + (remoteOnly ? '' : L(' (здесь звук выключен)'));
  else if (t?.kind === 'youtube' && yt.needTap) s = `<span class="warn">${L('Нажми на видео: YouTube на этом устройстве ждёт касания')}</span>`;
  else if (t?.kind === 'youtube' && st.playing && yt.state !== YTS.PLAYING) s = L('YouTube: подстраиваюсь…');
  else if (st.playing) s = `<span class="ok">${L('Играет синхронно')}</span>`;
  if (st.live) {
    s = !joined ? L('Трансляция идёт на устройствах')
      : isAppHub() ? L('Этот телефон транслирует свой звук на устройства комнаты')
      : `<span class="ok">${L('Играет звук телефона-хаба, с задержкой {d} с', { d: LIVE_DELAY / 1000 })}</span>`;
  }
  $('#status').innerHTML = s;
  renderYtHelp(t);
  renderLive(st);

  $('#queue').innerHTML = snap.queue.length
    ? snap.queue.map((q, i) => `<li data-qid="${esc(q.qid)}">
        <span class="num">${i + 1}</span><span class="name">${esc(trackName(q.trackId))}</span>
        <button class="icon" data-q="up" aria-label="${L('Выше')}" ${i ? '' : 'disabled'}>${ICON.up}</button>
        <button class="icon" data-q="down" aria-label="${L('Ниже')}" ${i < snap.queue.length - 1 ? '' : 'disabled'}>${ICON.down}</button>
        <button class="icon" data-q="del" aria-label="${L('Убрать')}">${ICON.del}</button></li>`).join('')
    : `<li class="empty">${L('Пусто. Добавь треки кнопкой ＋ в библиотеке')}</li>`;
  $('#clearq').hidden = !snap.queue.length;
  $('#after').textContent = snap.tracks.length ? L('Когда очередь кончится, библиотека играет дальше по порядку.') : '';

  $('#tracks').innerHTML = snap.tracks.length
    ? snap.tracks.map((tr) => `<li data-id="${esc(tr.id)}" class="${tr.id === st.trackId ? 'cur' : ''}">
        ${cached.has(tr.hash) ? `<span class="saved" title="${L('Сохранён на этом устройстве')}"></span>` : ''}
        <span class="name" data-t="play">${esc(tr.name)}</span>
        ${tr.videoId ? `<span class="badge${tr.kind === 'youtube' && !tr.pending ? ' embed' : ''}" title="${esc(tr.dlError
          ? L('Не скачалось, играет через плеер YouTube: {err}', { err: L(tr.dlError) }) : tr.author || 'YouTube')}">YouTube</span>` : ''}
        <span class="meta">${tr.pending ? `↓ ${Math.round((tr.progress || 0) * 100)}%` : tr.duration ? fmt(tr.duration) : tr.size ? mb(tr.size) : ''}</span>
        ${tr.dlError ? `<button class="icon" data-t="retry" title="${L('Скачать на хаб ещё раз')}" aria-label="${L('Скачать ещё раз')}">${ICON.retry}</button>` : ''}
        <button class="icon" data-t="next" title="${L('Играть следующим')}" aria-label="${L('Играть следующим')}">${ICON.playNext}</button>
        <button class="icon" data-t="queue" title="${L('В конец очереди')}" aria-label="${L('В очередь')}">${ICON.add}</button>
        <button class="icon" data-t="del" title="${L('Удалить с сервера')}" aria-label="${L('Удалить')}">${ICON.del}</button></li>`).join('')
    : `<li class="empty">${L('Пока пусто. Добавь файлы с этого устройства')}</li>`;

  renderDevices();
  setRange($('#master'), st.masterVolume);
  $('#calib').textContent = L(st.calibrate ? 'Остановить калибровку' : 'Калибровка щелчками');
  $('#caltip').classList.toggle('show', !!st.calibrate);

  const l = snap.links;
  renderQr(l.primary);
  // A room hosted by the Android app has both: its Wi-Fi address (the QR) and the room code for any network.
  const lanLinks = l.urls.map((u, i) => `<a class="${i ? 'alt' : ''}" href="${esc(u)}">${esc(u.replace('http://', ''))}</a>`).join('');
  $('#links').innerHTML = snap.room && l.urls.length
    ? `${lanLinks}<div class="hint" style="margin-top:6px">${L(`Наведи камеру телефона на QR или набери адрес в браузере: так подключаются
      устройства в той же Wi-Fi сети, интернет не нужен.`)}</div>
      <div class="hint" style="margin-top:10px">${L('Из любой сети — код комнаты')}</div><div class="roomcode">${esc(snap.room.code)}</div>
      <a class="alt" href="${esc(snap.room.url)}">${esc(snap.room.url.replace(/^https?:\/\//, ''))}</a>`
    : snap.room
    ? `<div class="hint">${L('Код комнаты')}</div><div class="roomcode">${esc(snap.room.code)}</div>
      <a class="alt" href="${esc(snap.room.url)}">${esc(snap.room.url.replace(/^https?:\/\//, ''))}</a>
      <div class="hint" style="margin-top:6px">${L('Наведи камеру телефона на QR или открой ссылку. Лучше, когда все в одной Wi-Fi сети: музыка дойдёт быстрее.')}</div>`
    : (l.mdns ? `<a href="${esc(l.mdns)}">${esc(l.mdns.replace('http://', ''))}</a>` : '')
      + l.urls.map((u, i) => `<a class="${l.mdns || i ? 'alt' : ''}" href="${esc(u)}">${esc(u.replace('http://', ''))}</a>`).join('')
      + `<div class="hint" style="margin-top:6px">${L('Наведи камеру телефона на QR или набери адрес в браузере. Устройства должны быть в той же Wi-Fi сети.')}</div>`;
  $('#roomrole').hidden = !snap.room;
  $('#roomrole span').textContent = L(link?.kind === 'host'
    ? 'Это устройство — хаб комнаты: библиотека хранится здесь. Не закрывай эту вкладку, иначе музыка остановится у всех.'
    : 'Ты в комнате. Хаб — устройство, которое её создало.');

  $('#cacheon').checked = cacheOn();
  $('#where').innerHTML = L(`Треки сохраняются в памяти браузера (IndexedDB) для адреса {origin}.
    Это не обычные файлы: в «Файлах» их не видно, но они переживают перезапуск. С другого адреса или в другом браузере память своя.
    Удалить их можно здесь или очисткой данных сайта.`, { origin: `<code>${esc(location.origin)}</code>` }) + ' '
    + (snap.mediaDir ? L('Оригиналы лежат на компьютере-хабе в {dir}.', { dir: `<code>${esc(snap.mediaDir)}</code>` })
      : L('Библиотека комнаты хранится в браузере устройства-хаба, отдельно от этой памяти.'));
  const total = cacheMeta.reduce((a, m) => a + m.size, 0);
  $('#cached').innerHTML = cacheMeta.length
    ? cacheMeta.map((m) => `<li><span class="saved"></span><span class="name">${esc(m.name)}</span><span class="meta">${mb(m.size)}</span>
        <button class="icon" data-c="${esc(m.hash)}" aria-label="${L('Удалить с устройства')}">${ICON.del}</button></li>`).join('')
    : `<li class="empty">${L('На этом устройстве ничего не сохранено')}</li>`;
  if (!cacheJob) $('#cacheinfo').textContent = cacheMeta.length ? L('Всего: {n} · {size}', { n: cacheMeta.length, size: mb(total) }) : '';
  $('#cacheall').hidden = !cacheOn();
  $('#cacheclear').hidden = !cacheMeta.length;
  tick();
}

let seeking = false;
function tick() {
  if (!snap) return;
  const t = curTrack();
  const dur = t?.duration || (t && buffers.get(t.id)?.duration) || 0;
  const pos = Math.min(Math.max(0, positionNow()), dur || Infinity);
  const seek = $('#seek');
  seek.max = dur || 0;
  seek.disabled = !dur || !!snap.state.calibrate;
  if (!seeking) setRange(seek, pos);
  $('#cur').textContent = fmt(seeking ? Number(seek.value) : pos);
  $('#dur').textContent = dur ? fmt(dur) : '–:––';
  const err = t?.kind === 'youtube' ? yt.err : lastErr;
  $('#debug').textContent = joined
    ? L('Часы ±{clock} мс · вывод звука {out} мс · ', { clock: isFinite(rtt) ? (rtt / 2).toFixed(1) : '?', out: outLatencyMs() })
      + L(t?.kind === 'youtube' ? 'расхождение YouTube ' : 'точность расписания ')
      + `${err == null ? '–' : Math.abs(err).toFixed(1) + ' ' + L('мс')}. `
      + L('Задержку самих динамиков браузер не видит, её подстраивают на слух: «Калибровка щелчками».')
    : '';
  const me = snap.clients.find((c) => c.id === clientId);
  if (me && document.activeElement !== $('#name')) $('#name').value = me.name;
}

// The hub phone's broadcast controls (only in the Android app).
let liveMsg = '';
function renderLive(st) {
  $('#livebox').hidden = !isAppHub();
  if (!isAppHub()) return;
  $('#livebtn').textContent = L(st.live ? 'Остановить трансляцию' : 'Транслировать звук телефона');
  $('#livebtn').classList.toggle('primary', !st.live);
  $('#livehint').textContent = liveMsg || L(st.live
    ? 'Убери звук на этом телефоне: здесь всё звучит на секунду раньше, чем на остальных устройствах. Этот телефон только транслирует звук другим, трансляция от громкости не зависит.'
    : 'Всё, что играет на этом телефоне, — музыка из любого приложения, видео, игры — зазвучит на всех устройствах комнаты. Android попросит разрешение на запись экрана: записывается только звук.');
  const vol = $('#livevol');
  vol.hidden = !st.live || phoneVolume == null;
  vol.textContent = L('Сейчас аппаратная громкость {p}%', { p: phoneVolume });
  vol.className = 'hint livevol ' + (phoneVolume ? 'warn' : 'ok');
}

// ---------- events ----------
translatePage();
$('#livebtn').onclick = () => {
  liveMsg = '';
  if (!snap?.state.live) unlockAudio();   // the tap also allows this phone's own sound later
  link?.broadcast(!snap?.state.live);
  render();
};

for (const b of document.querySelectorAll('[data-lang]')) {
  b.classList.toggle('primary', b.dataset.lang === lang);
  b.onclick = () => { if (b.dataset.lang !== lang) setLang(b.dataset.lang); };
}
$('#prev').innerHTML = ICON.prev;
$('#next').innerHTML = ICON.next;
$('#join').onclick = join;
$('#remote').onclick = () => { remoteOnly = true; $('#joinbox').classList.add('hide'); render(); };
$('#resumebtn').onclick = () => { unlockAudio(); };
$('#unmutebtn').onclick = () => setMine({ muted: false });

$('#play').onclick = () => {
  const st = snap?.state;
  if (!st) return;
  if (!joined && !remoteOnly) join();
  cmd(st.playing || st.waiting ? 'pause' : 'play');
};
$('#next').onclick = () => cmd('next');
$('#prev').onclick = () => cmd('prev');

$('#seek').addEventListener('input', () => { seeking = true; tick(); });
$('#seek').addEventListener('change', () => { seeking = false; cmd('seek', { position: Number($('#seek').value) }); });

$('#tracks').onclick = (e) => {
  const el = e.target.closest('[data-t]'), li = e.target.closest('li[data-id]');
  if (!el || !li) return;
  const t = snap.tracks.find((x) => x.id === li.dataset.id);
  if (!t) return;
  if (el.dataset.t === 'play') cmd('select', { trackId: t.id });
  if (el.dataset.t === 'queue') cmd('enqueue', { trackId: t.id });
  if (el.dataset.t === 'retry') cmd('retryDownload', { trackId: t.id });
  if (el.dataset.t === 'next') cmd('enqueue', { trackId: t.id, first: true });
  if (el.dataset.t === 'del' && confirm(L('Удалить «{name}» с сервера?', { name: t.name }))) cmd('remove', { trackId: t.id });
};

$('#queue').onclick = (e) => {
  const b = e.target.closest('[data-q]'), li = e.target.closest('li[data-qid]');
  if (!b || !li) return;
  const qid = li.dataset.qid;
  if (b.dataset.q === 'del') cmd('dequeue', { qid });
  else cmd('move', { qid, dir: b.dataset.q === 'up' ? -1 : 1 });
};
$('#clearq').onclick = () => cmd('clearQueue');

function setLatency(li, c, v) {
  v = Math.max(-300, Math.min(800, Math.round(v)));
  c.latency = v;   // so quick repeated taps add up before the server answers
  li.querySelector('.readout').textContent = fmtLat(v);
  setRange(li.querySelector('[data-act=latr]'), v);
  if (c.id === clientId) setMine({ latency: v });
  else throttled('lat-' + c.id, 80, () => cmd('device', { id: c.id, latency: v }));
}

function rowTarget(e) {
  const li = e.target.closest('li[data-id]');
  return li && { li, c: snap.clients.find((x) => x.id === li.dataset.id) };
}

$('#volrows').addEventListener('click', (e) => {
  const r = rowTarget(e), act = e.target.closest('[data-act]')?.dataset.act;
  if (!r?.c) return;
  if (act === 'mute') {
    if (r.c.id === clientId) setMine({ muted: !r.c.muted });
    else cmd('device', { id: r.c.id, muted: !r.c.muted });
  }
  if (act === 'find') cmd('identify', { id: r.c.id });
  if (act === 'rename') {
    const name = prompt(L('Как назвать это устройство?'), r.c.name);
    if (name && name.trim()) cmd('device', { id: r.c.id, name: name.trim() });
  }
});
$('#volrows').addEventListener('input', (e) => {
  const r = rowTarget(e);
  if (!r?.c || e.target.dataset.act !== 'vol') return;
  const v = Number(e.target.value);
  if (r.c.id === clientId) setMine({ volume: v });
  else throttled('vol-' + r.c.id, 80, () => cmd('device', { id: r.c.id, volume: v }));
});
$('#latrows').addEventListener('click', (e) => {
  const r = rowTarget(e), b = e.target.closest('[data-act=lat]');
  if (r?.c && b) setLatency(r.li, r.c, (r.c.latency ?? 0) + Number(b.dataset.d));
});
$('#latrows').addEventListener('input', (e) => {
  const r = rowTarget(e);
  if (r?.c && e.target.dataset.act === 'latr') setLatency(r.li, r.c, Number(e.target.value));
});
$('#master').addEventListener('input', (e) => {
  const v = Number(e.target.value);
  if (joined) { lastLocalChange = performance.now(); volume = v; store.set('ya-volume', v); applyGain(); }
  for (const li of volRows.values()) setRange(li.querySelector('[data-act=vol]'), v);
  throttled('master', 80, () => cmd('volumeAll', { volume: v }));
});
document.querySelectorAll('.spk[data-icon]').forEach((el) => { el.innerHTML = el.dataset.icon === 'low' ? ICON.spkLow : ICON.spkHigh; });
$('#resyncall').onclick = () => cmd('resync');
$('#calib').onclick = () => cmd('calibrate', { on: !snap?.state.calibrate });
$('#calstop').onclick = () => cmd('calibrate', { on: false });

$('#file').onchange = async (e) => {
  const files = [...e.target.files];
  e.target.value = '';
  const errors = [];
  for (const [i, f] of files.entries()) {
    $('#upinfo').textContent = L('Отправка {i}/{n}…', { i: i + 1, n: files.length });
    const res = await link.upload(f, (p) => {
      $('#upinfo').textContent = L('Отправка {i}/{n}: {p}%', { i: i + 1, n: files.length, p: Math.round(p * 100) });
    }).catch(() => null);
    if (!res) errors.push(f.name);
    // The file is already here — keep it in the local library without downloading it back.
    else if (cacheOn() && !cachedHashes().has(res.hash)) {
      cachePut({ hash: res.hash, name: f.name.replace(/\.[^.]+$/, '') }, await f.arrayBuffer()).catch(() => {});
    }
  }
  $('#upinfo').textContent = errors.length ? L('Не отправились: {list}', { list: errors.join(', ') }) : '';
};

$('#name').onchange = () => {
  const name = $('#name').value.trim();
  if (name) cmd('device', { id: clientId, name });
};
$('#findme').onclick = identify;
$('#ythelp').addEventListener('click', (e) => {
  const retry = e.target.closest('[data-retry]'), again = e.target.closest('[data-ytagain]');
  if (retry) cmd('retryDownload', { trackId: retry.dataset.retry });
  if (again) {   // forget this browser's failure and cue the video again
    failed.delete(again.dataset.ytagain);
    loadErrors.delete(again.dataset.ytagain);
    yt.videoId = null;
    sendStatus();
    render();
  }
});

$('#ytform').onsubmit = async (e) => {
  e.preventDefault();
  const url = $('#yturl').value.trim();
  if (!url) return;
  $('#ytinfo').textContent = L('Добавляю…');
  try {
    const j = await link.youtube(url);
    $('#yturl').value = '';
    $('#ytinfo').textContent = L(`«{name}» ${j.downloading ? 'скачивается на хаб и ' : ''}${j.queued ? 'встанет в очередь' : 'выбрано'}`, { name: j.name });
  } catch (err) {
    $('#ytinfo').textContent = L(err.message || 'Не получилось добавить');
  }
};
// Pasting a YouTube link adds it right away, no extra tap.
$('#yturl').addEventListener('paste', () => setTimeout(() => { if (/youtu\.?be/.test($('#yturl').value)) $('#ytform').requestSubmit(); }, 0));
$('#resync').onclick = () => { if (joined) resync(); };

const setCache = (on) => { store.set('ya-cache', on ? 'on' : 'off'); render(); };
$('#cacheyes').onclick = () => setCache(true);
$('#cacheno').onclick = () => setCache(false);
$('#cacheon').onchange = () => setCache($('#cacheon').checked);
$('#cached').onclick = (e) => {
  const b = e.target.closest('[data-c]');
  if (b) cacheDelete(b.dataset.c).catch(() => {});
};
$('#cacheclear').onclick = async () => {
  if (!confirm(L('Удалить все сохранённые треки с этого устройства? На компьютере-хабе они останутся.'))) return;
  for (const m of [...cacheMeta]) await cacheDelete(m.hash).catch(() => {});
};
$('#cacheall').onclick = async () => {
  if (cacheJob || !snap) return;
  cacheJob = true;
  const todo = snap.tracks.filter((t) => t.hash && !cachedHashes().has(t.hash));
  for (const [i, t] of todo.entries()) {
    try {
      const data = await link.media(t, (p) => { $('#cacheinfo').textContent = L('Скачиваю {i}/{n}: {p}%', { i: i + 1, n: todo.length, p: Math.round(p * 100) }); });
      await cachePut(t, data);
    } catch {}
  }
  cacheJob = false;
  render();
};

// ---------- start: a hub at this address, or a room between browsers ----------
const ROOM_HOST = 'ya-host-room';   // code of the room this browser hosts, so a reload keeps the room alive
const roomFromUrl = () => cleanRoomCode(new URLSearchParams(location.hash.slice(1)).get('r'));

function begin(l) {
  link = l;
  if (l.canBroadcast) {
    l.onBroadcast = (on, error) => {
      liveMsg = error === 'mic' ? L('Без разрешения на запись звука Android не даёт транслировать')
        : error === 'cancel' ? L('Трансляция отменена') : '';
      render();
    };
  }
  if (sharedLink) setTimeout(() => addShared(sharedLink), 0);
  if (l.kind === 'host' && roomFromUrl() !== l.code) history.replaceState(null, '', '#r=' + l.code);
  $('#roombox').classList.add('hide');
  $('#joinbox').classList.remove('hide');
  connect();
  syncClock(16).then(() => sendStatus());
  render();
}

async function enterRoom(code, asHost) {
  $('#roominfo').textContent = L(asHost ? 'Создаю комнату…' : 'Подключаюсь…');
  const base = { clientId, deviceKey, fingerprint: fingerprint(), code };
  try {
    if (asHost) store.set(ROOM_HOST, code);
    begin(asHost ? await hostLink(base) : await guestLink(base));
  } catch (e) {
    $('#roominfo').textContent = L('Не получилось: {err}', { err: L(e.message || String(e)) });
    $('#roombox').classList.remove('hide');
  }
}

async function start() {
  refreshCache();
  setInterval(tick, 250);
  setInterval(ytTick, 200);
  setInterval(correct, 500);
  setInterval(() => { if (link) { syncClock(8); sendStatus(); } }, 20000);
  if (await hasServer()) return begin(serverLink({ clientId, deviceKey, fingerprint: fingerprint() }));
  // No hub at this address (GitHub Pages): a browser tab hosts the room.
  const code = roomFromUrl(), hosted = store.get(ROOM_HOST);
  if (code) return enterRoom(code, code === hosted);
  if (hosted) return enterRoom(hosted, true);
  $('#roombox').classList.remove('hide');
}

// ---------- Android app: phone calls, links shared to the app ----------
// During a call a phone that hosts the room pauses it for everyone (and plays on after), any other phone goes quiet.
let callPaused = false, sharedLink = '';
const addShared = (text) => {
  sharedLink = '';
  $('#yturl').value = text;
  $('#ytform').requestSubmit();
};
globalThis.__yaApp = Object.assign(globalThis.__yaApp || {}, {
  call(on) {
    if (on === inCall) return;
    inCall = on;
    if (on && link?.kind === 'host' && (snap?.state.playing || snap?.state.waiting)) { callPaused = true; cmd('pause'); }
    if (!on && callPaused) { callPaused = false; cmd('play'); }
    applyGain();
  },
  share(text) { if (link) addShared(text); else sharedLink = text; },
  volume(p) { phoneVolume = p; render(); },
});

$('#newroom').onclick = () => enterRoom(newRoomCode(), true);
$('#joinroom').onsubmit = (e) => {
  e.preventDefault();
  const code = cleanRoomCode($('#roomcode').value);
  if (code.length >= 4) location.hash = 'r=' + code;
};
$('#leaveroom').onclick = async () => {
  const host = link?.kind === 'host';
  if (host && !confirm(L('Закрыть комнату? Музыка остановится на всех устройствах.'))) return;
  if (host) localStorage.removeItem(ROOM_HOST);
  await link?.leave?.().catch(() => {});
  location.hash = '';
  location.reload();
};
window.addEventListener('hashchange', () => { if (roomFromUrl() !== (link?.code || '')) location.reload(); });

// For checks from the browser console.
window.__ya = { get snap() { return snap; }, get link() { return link; }, players, buffers, failed, yt, get lastErr() { return lastErr; }, get offset() { return offset; }, get rtt() { return rtt; } };

start();
