// YourAura hub: the shared brain of a room — library, queue, playback timeline, remembered devices.
// The same code runs in Node (server.mjs, devices talk to it over HTTP + SSE) and in a browser tab
// that hosts a room (devices talk to it over WebRTC). Everything that depends on where it runs —
// storage, sending, media files, downloads — comes in through `env`.
//
// env = {
//   now(): number              shared timeline in ms (monotonic)
//   tracks: [], devices: {}    what was saved last time
//   saveTracks(tracks), saveDevices(devices)
//   send(clientId, event, data)   event: 'snapshot' | 'identify'
//   extra(): object            merged into every snapshot (connection links, storage info…)
//   removeMedia(track)         a track was deleted from the library
//   retryDownload(track)       optional: «Скачать ещё раз» for a YouTube track
// }

export const START_LEAD_MS = 1200;   // запас между нажатием Play и реальным стартом
export const YT_LEAD_MS = 2500;      // то же для плеера YouTube: ему нужно перемотать и забуферизовать
export const WAIT_READY_MS = 20000;  // сколько ждать, пока все устройства загрузят трек
export const PREP_NEXT_MS = 6000;    // за сколько до конца трека назначать старт следующего (бесшовно)

const FP_KEYS = ['os', 'browser', 'kind', 'model', 'screen', 'dpr'];
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, Number(v) || 0));
const randomId = () => Math.random().toString(16).slice(2, 10);

export function cleanFingerprint(raw) {
  if (!raw || typeof raw !== 'object') return null;
  return Object.fromEntries(FP_KEYS.map((k) => [k, String(raw[k] ?? '').slice(0, 60)]));
}

export function createHub(env) {
  const now = env.now;
  const tracks = env.tracks || [];
  const devices = env.devices || {};   // key -> { key, name, latency, muted, volume, fp, ip, lastSeen }
  const clients = new Map();           // id (вкладка) -> { rec, recognized, joined, ready, failed, errors, loading, rtt }
  const track = (id) => tracks.find((t) => t.id === id);
  const saveTracks = () => env.saveTracks(tracks);
  let devicesTimer = null;
  const saveDevices = () => {
    clearTimeout(devicesTimer);
    devicesTimer = setTimeout(() => env.saveDevices(devices), 400);
  };

  // playing: startAt — время, когда звучала бы позиция 0; position — откуда стартовали/где пауза.
  // next: следующий трек, уже назначенный на точное время (все устройства его загрузили) — бесшовный переход.
  const state = {
    trackId: tracks[0]?.id ?? null, playing: false, waiting: false, startAt: 0, position: 0,
    next: null, upNext: null, calibrate: null, resync: 0, masterVolume: 1,
    live: false,   // трансляция: устройства играют звук телефона-хаба (net.mjs live), а не треки
  };
  let queue = [];   // [{ qid, trackId }] — «далее», после неё библиотека играет по порядку
  let waitTimer = null, endTimer = null, prepTimer = null, endAt = 0;

  // ---------- устройства ----------
  // Хаб помнит устройства между подключениями. Ключ хранится в браузере устройства; если браузер его
  // потерял, устройство узнаётся по признакам (система, модель, экран, браузер) и IP, если он известен.
  const sameDevice = (a, b) => !!a && !!b && FP_KEYS.every((k) => a[k] === b[k]);

  function uniqueName(base) {
    const taken = new Set(Object.values(devices).map((d) => d.name));
    if (!taken.has(base)) return base;
    for (let i = 2; ; i++) if (!taken.has(`${base} ${i}`)) return `${base} ${i}`;
  }

  function deviceFor(key, fp, ip) {
    if (devices[key]) return { rec: devices[key], recognized: false };
    const online = new Set([...clients.values()].map((c) => c.rec.key));
    const match = Object.values(devices).find((d) => (d.ip || null) === (ip || null) && sameDevice(d.fp, fp) && !online.has(d.key));
    if (match) {
      delete devices[match.key];
      match.key = key;
      devices[key] = match;
      return { rec: match, recognized: true };
    }
    devices[key] = { key, name: uniqueName(fp?.model || 'Устройство'), latency: null, muted: false, volume: null };
    return { rec: devices[key], recognized: false };
  }

  function connect(id, { key, fp, ip } = {}) {
    clients.delete(id);   // та же вкладка переподключилась: старое соединение больше не «онлайн»
    fp = cleanFingerprint(fp);
    const { rec, recognized } = deviceFor(String(key || id).slice(0, 40), fp, ip);
    Object.assign(rec, { fp: fp || rec.fp, ip: ip || undefined, lastSeen: Date.now() });
    saveDevices();
    clients.set(id, { rec, recognized, joined: false, ready: [], failed: [], errors: {}, loading: null, rtt: null });
    settle();
  }

  function disconnect(id) {
    if (!clients.delete(id)) return;
    if (state.waiting && allReady(state.trackId)) startNow();
    settle();
  }

  // ---------- снимок для устройств ----------
  function snapshot() {
    return {
      state,
      queue,
      tracks: tracks.map(({ id, kind, videoId, author, name, size, duration, hash, pending, progress, dlError }) => ({ id, kind, videoId, author, name, size, duration, hash, pending, progress, dlError })),
      clients: [...clients].map(([id, c]) => ({
        id, key: c.rec.key, name: c.rec.name, kind: c.rec.fp?.kind || 'computer', ip: c.rec.ip, recognized: c.recognized,
        joined: c.joined, ready: c.ready, failed: c.failed, errors: c.errors, loading: c.loading, rtt: c.rtt, diag: c.diag,
        latency: c.rec.latency, muted: c.rec.muted, volume: c.rec.volume,
      })),
      ...(env.extra ? env.extra() : {}),
    };
  }

  function broadcast() {
    const s = snapshot();
    for (const id of clients.keys()) env.send(id, 'snapshot', s);
  }

  // ---------- воспроизведение ----------
  const positionNow = () => (state.playing ? (now() - state.startAt) / 1000 : state.position);
  const curKey = () => `${state.trackId}|${state.startAt}`;

  function upNextId() {
    if (queue.length) return queue[0].trackId;
    const i = tracks.findIndex((t) => t.id === state.trackId);
    return tracks[i + 1]?.id ?? null;
  }
  const consume = (id) => { if (queue[0]?.trackId === id) queue.shift(); };

  // Готовы ли все устройства со звуком играть трек id.
  function allReady(id) {
    for (const c of clients.values()) if (c.joined && !c.ready.includes(id) && !c.failed.includes(id)) return false;
    return true;
  }

  // После любого изменения: пересчитать «что дальше», таймеры конца трека и разослать состояние.
  function settle() {
    state.upNext = upNextId();
    if (state.next && (!state.playing || state.next.after !== curKey() || state.next.trackId !== state.upNext)) state.next = null;
    scheduleEnd();
    broadcast();
  }

  function scheduleEnd() {
    clearTimeout(endTimer);
    clearTimeout(prepTimer);
    const d = track(state.trackId)?.duration;
    if (!state.playing || !d) return;
    endAt = state.startAt + d * 1000;
    if (!state.next) prepTimer = setTimeout(prepNext, Math.max(0, endAt - PREP_NEXT_MS - now()));
    endTimer = setTimeout(onEnd, Math.max(0, endAt - now() + 30));
  }

  function prepNext() {
    if (!state.playing || state.next || !state.upNext || !allReady(state.upNext) || now() > endAt - 300) return;
    state.next = { trackId: state.upNext, startAt: endAt, after: curKey() };
    broadcast();
  }

  function onEnd() {
    const n = state.next;
    if (n) {
      consume(n.trackId);
      Object.assign(state, { trackId: n.trackId, startAt: n.startAt, position: 0, next: null });
    } else {
      const id = state.upNext;
      Object.assign(state, { playing: false, position: 0, next: null });
      if (id) {
        consume(id);
        state.trackId = id;
        requestPlay();
      }
    }
    settle();
  }

  function startNow() {
    clearTimeout(waitTimer);
    Object.assign(state, { waiting: false, playing: true, calibrate: null, next: null });
    const lead = track(state.trackId)?.kind === 'youtube' ? YT_LEAD_MS : START_LEAD_MS;
    state.startAt = now() + lead - state.position * 1000;
  }

  function requestPlay() {
    if (!state.trackId || state.live) return;
    clearTimeout(waitTimer);
    const t = track(state.trackId);
    if (t?.duration && state.position >= t.duration - 0.05) state.position = 0;
    if (!t?.pending && allReady(state.trackId)) return startNow();
    Object.assign(state, { playing: false, waiting: true, calibrate: null, next: null });
    // Пока трек скачивается с YouTube, ждём без таймаута: старт даст конец загрузки.
    if (!t?.pending) waitTimer = setTimeout(() => { startNow(); settle(); }, WAIT_READY_MS);
  }

  function stop() {
    clearTimeout(waitTimer);
    if (state.playing) state.position = clamp(positionNow(), 0, track(state.trackId)?.duration ?? Infinity);
    Object.assign(state, { playing: false, waiting: false, next: null });
  }

  // Перейти к треку id: играть сразу, если сейчас играет, иначе просто выбрать.
  function jump(id) {
    const resume = state.playing || state.waiting;
    stop();
    Object.assign(state, { trackId: id, position: 0 });
    if (resume) requestPlay();
  }

  // ---------- библиотека ----------
  function addTrack(t) {
    tracks.push(t);
    saveTracks();
    if (!state.trackId) state.trackId = t.id;
    settle();
  }

  // Новый трек из ссылки: ничего не играет — выбираем его, иначе в конец очереди.
  function offer(id) {
    if (state.playing || state.waiting) queue.push({ qid: randomId(), trackId: id });
    else jump(id);
    settle();
    return { queued: state.trackId !== id };
  }

  // Скачанный звук оказался уже в библиотеке: всё, что ссылалось на from, теперь на into.
  function mergeTrack(from, into) {
    const i = tracks.findIndex((t) => t.id === from);
    if (i >= 0) tracks.splice(i, 1);
    queue = queue.map((q) => (q.trackId === from ? { ...q, trackId: into } : q));
    if (state.trackId === from) state.trackId = into;
    saveTracks();
  }

  // Трек стал играбельным (например, скачался): если ждали именно его — запускаем.
  function trackReady(id) {
    saveTracks();
    if (state.waiting && state.trackId === id) requestPlay();
    settle();
  }

  // ---------- команды с пультов ----------
  function command(b) {
    const c = b.id && clients.get(b.id);
    switch (b.action) {
      case 'select':
        if (!track(b.trackId)) return;
        jump(b.trackId);
        break;
      case 'play':
        if (!state.playing && !state.waiting) requestPlay();
        break;
      case 'pause':
        stop();
        break;
      case 'seek':
        state.position = clamp(b.position, 0, track(state.trackId)?.duration ?? Infinity);
        if (state.playing) startNow();
        break;
      case 'next': {
        const id = state.upNext;
        if (!id) return;
        consume(id);
        jump(id);
        break;
      }
      case 'prev': {
        const i = tracks.findIndex((t) => t.id === state.trackId);
        if (positionNow() > 3 || i <= 0) {
          state.position = 0;
          if (state.playing) startNow();
        } else jump(tracks[i - 1].id);
        break;
      }
      case 'enqueue':
        if (!track(b.trackId)) return;
        queue[b.first ? 'unshift' : 'push']({ qid: randomId(), trackId: b.trackId });
        break;
      case 'dequeue':
        queue = queue.filter((q) => q.qid !== b.qid);
        break;
      case 'move': {
        const i = queue.findIndex((q) => q.qid === b.qid), j = i + (b.dir < 0 ? -1 : 1);
        if (i < 0 || j < 0 || j >= queue.length) return;
        [queue[i], queue[j]] = [queue[j], queue[i]];
        break;
      }
      case 'clearQueue':
        queue = [];
        break;
      case 'retryDownload': {   // «Скачать ещё раз»: YouTube иногда пускает со второй попытки
        const t = track(b.trackId);
        if (!t || t.kind !== 'youtube' || t.pending || !env.retryDownload) return;
        env.retryDownload(t);
        break;
      }
      case 'remove': {
        const i = tracks.findIndex((t) => t.id === b.trackId);
        if (i < 0) return;
        const [t] = tracks.splice(i, 1);
        saveTracks();
        env.removeMedia?.(t);
        queue = queue.filter((q) => q.trackId !== t.id);
        if (state.trackId === t.id) {
          stop();
          Object.assign(state, { trackId: (tracks[i] ?? tracks[0])?.id ?? null, position: 0 });
        }
        break;
      }
      case 'device': {  // настройки конкретного устройства с пульта
        if (!c) return;
        const r = c.rec;
        if ('name' in b) {
          const n = String(b.name ?? '').trim().slice(0, 40);
          if (n) r.name = n;
        }
        if ('muted' in b) r.muted = !!b.muted;
        if ('volume' in b) r.volume = clamp(b.volume, 0, 1);
        if ('latency' in b) r.latency = Math.round(clamp(b.latency, -300, 800));
        saveDevices();
        break;
      }
      case 'identify':   // устройство показывает своё имя на весь экран и звенит
        if (c) env.send(b.id, 'identify', {});
        return;
      case 'volumeAll':  // общий ползунок выравнивает громкость на всех устройствах
        state.masterVolume = clamp(b.volume, 0, 1);
        for (const x of clients.values()) x.rec.volume = state.masterVolume;
        saveDevices();
        break;
      case 'calibrate':
        if (b.on) {
          stop();
          state.calibrate = { startAt: now() + 800 };
        } else state.calibrate = null;
        break;
      case 'resync':
        state.resync++;
        break;
      default:
        return;
    }
    settle();
  }

  // ---------- отчёты устройств ----------
  function status(b) {
    const c = clients.get(b.id);
    if (!c) return;
    c.joined = !!b.joined;
    c.ready = Array.isArray(b.ready) ? b.ready.slice(0, 8) : [];
    c.failed = Array.isArray(b.failed) ? b.failed.slice(0, 50) : [];
    c.errors = Object.fromEntries(Object.entries(b.errors && typeof b.errors === 'object' ? b.errors : {})
      .slice(0, 10).map(([id, m]) => [String(id).slice(0, 40), String(m).slice(0, 160)]));
    c.loading = b.loading && typeof b.loading.id === 'string' ? { id: b.loading.id, progress: clamp(b.loading.progress, 0, 1) } : null;
    c.rtt = b.rtt == null ? null : Math.round(clamp(b.rtt, 0, 10000));
    // Clock diagnostics of the device (numbers, plus its user agent), for checks from a console.
    c.diag = b.diag && typeof b.diag === 'object' ? Object.fromEntries(Object.entries(b.diag).slice(0, 16)
      .map(([k, v]) => [String(k).slice(0, 20), typeof v === 'number' ? v : String(v ?? '').slice(0, 200)])) : null;
    if (b.settings) {   // новое устройство сообщает свои настройки из браузера
      c.rec.latency = Math.round(clamp(b.settings.latency, -300, 800));
      c.rec.muted = !!b.settings.muted;
      c.rec.volume = clamp(b.settings.volume, 0, 1);
      saveDevices();
    }
    for (const [id, d] of Object.entries(b.durations || {})) {
      const t = track(id);
      if (t && !t.duration && d > 0) {
        t.duration = Number(d);
        saveTracks();
      }
    }
    if (state.waiting && allReady(state.trackId)) startNow();
    else if (state.playing && !state.next && endAt && now() >= endAt - PREP_NEXT_MS) prepNext();
    settle();
  }

  // Трансляцию включает и выключает только сам хаб (Android-приложение), не команда с устройства.
  function setLive(on) {
    if (state.live === !!on) return;
    if (on) stop();
    state.live = !!on;
    settle();
  }

  state.upNext = upNextId();
  return {
    tracks, state, track, connect, disconnect, command, status, snapshot, broadcast, settle,
    addTrack, offer, mergeTrack, trackReady, setLive, hasClient: (id) => clients.has(id),
  };
}

// ---------- YouTube links ----------
const YT_ID = /^[A-Za-z0-9_-]{11}$/;
export function youtubeId(input) {
  // «Поделиться» на телефоне часто вставляет ссылку вместе с текстом — берём из него саму ссылку.
  const raw = String(input || '').trim();
  const s = raw.match(/https?:\/\/\S*youtu\S*/i)?.[0] || raw;
  if (YT_ID.test(s)) return s;
  let u;
  try { u = new URL(s.includes('://') ? s : 'https://' + s); } catch { return null; }
  const host = u.hostname.replace(/^(www|m|music)\./, '');
  let id = null;
  if (host === 'youtu.be') id = u.pathname.split('/')[1];
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    id = u.searchParams.get('v') || (u.pathname.match(/^\/(?:shorts|embed|live|v)\/([^/?#]+)/) || [])[1];
  }
  return id && YT_ID.test(id) ? id : null;
}

// Название и автор видео (oEmbed). status: 'ok' | 'missing' (видео нет или закрыто) | 'noembed' | 'offline'.
export async function youtubeInfo(videoId) {
  const url = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent('https://www.youtube.com/watch?v=' + videoId)}`;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (r.status === 401 || r.status === 403) return { status: 'noembed' };
    if (r.status === 404 || r.status === 400) return { status: 'missing' };
    if (!r.ok) return { status: 'offline' };
    const j = await r.json();
    return { status: 'ok', title: j.title ? String(j.title).slice(0, 200) : null, author: j.author_name ? String(j.author_name).slice(0, 100) : null };
  } catch {
    return { status: 'offline' };   // нет интернета или браузер не пустил запрос — добавим без названия
  }
}
