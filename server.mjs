#!/usr/bin/env node
// YourAura hub for a computer in the home network: devices open its page and talk to it over HTTP + SSE.
// The room logic is shared with the browser-hosted rooms (public/core/hub.mjs); this file adds files on disk,
// YouTube downloads through yt-dlp and the HTTP side.
// Запуск: node server.mjs [порт] (по умолчанию 80, если занят — 8600)
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { createHub, youtubeId, youtubeInfo } from './public/core/hub.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(ROOT, 'public');
const MEDIA = path.resolve(process.env.YOURAURA_MEDIA || path.join(ROOT, 'media'));
const PORTS = process.argv[2] || process.env.PORT ? [Number(process.argv[2] || process.env.PORT)] : [80, 8600];
const MDNS_HOST = 'youraura.local';
const MAX_UPLOAD = 500 * 1024 * 1024;

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.mp4': 'video/mp4', '.md': 'text/plain; charset=utf-8' };
const AUDIO_MIME = { '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.opus': 'audio/ogg', '.flac': 'audio/flac', '.webm': 'audio/webm' };

// Часы хаба — единая шкала времени для всех устройств (мс, монотонные).
const now = () => performance.timeOrigin + performance.now();

// ---------- библиотека и устройства на диске ----------
fs.mkdirSync(MEDIA, { recursive: true });
const INDEX = path.join(MEDIA, 'index.json');
const DEVICES = path.join(MEDIA, 'devices.json');
const fileHash = (fp) => crypto.createHash('sha256').update(fs.readFileSync(fp)).digest('hex').slice(0, 16);
const readJsonFile = (f, fallback) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return fallback; } };

// Трек — либо файл в MEDIA, либо видео YouTube (kind: 'youtube', играет через плеер YouTube на каждом устройстве).
const savedTracks = readJsonFile(INDEX, []).filter((t) => t.kind === 'youtube' || fs.existsSync(path.join(MEDIA, t.file)));
for (const t of savedTracks) if (t.file) t.hash ??= fileHash(path.join(MEDIA, t.file));   // хэш = ключ локальной памяти устройств

const streams = new Map();   // id вкладки -> ответ SSE
let links = { primary: null, urls: [], mdns: null };

const hub = createHub({
  now,
  tracks: savedTracks,
  devices: readJsonFile(DEVICES, {}),
  saveTracks: (tracks) => fs.writeFileSync(INDEX, JSON.stringify(tracks, null, 1)),
  saveDevices: (devices) => fs.writeFile(DEVICES, JSON.stringify(devices, null, 1), () => {}),
  send: (id, event, data) => streams.get(id)?.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
  extra: () => ({ links, mediaDir: MEDIA, hubKind: 'server' }),
  removeMedia: (t) => { if (t.file) fs.rm(path.join(MEDIA, t.file), { force: true }, () => {}); },
  retryDownload: (t) => enqueueDownload(t),
});
hub.tracks.length && fs.writeFileSync(INDEX, JSON.stringify(hub.tracks, null, 1));

// ---------- HTTP ----------
function send(res, code, obj) {
  if (res.headersSent) return res.end();
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}

async function readJson(req) {
  let raw = '';
  for await (const ch of req) {
    raw += ch;
    if (raw.length > 65536) throw Object.assign(new Error('слишком большой запрос'), { status: 413 });
  }
  return raw ? JSON.parse(raw) : {};
}

function events(req, res, url) {
  const id = url.searchParams.get('id');
  if (!id) return send(res, 400, { error: 'нужен id' });
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
  res.write('retry: 1500\n\n');
  req.socket.setNoDelay(true);
  streams.get(id)?.end();
  streams.set(id, res);
  let fp = null;
  try { fp = JSON.parse(url.searchParams.get('fp') || 'null'); } catch {}
  hub.connect(id, { key: url.searchParams.get('key'), fp, ip: (req.socket.remoteAddress || '').replace(/^::ffff:/, '') });
  req.on('close', () => {
    if (streams.get(id) !== res) return;
    streams.delete(id);
    hub.disconnect(id);
  });
}

async function upload(req, res, url) {
  const name = (url.searchParams.get('name') || 'track').slice(0, 200);
  const ext = path.extname(name).toLowerCase().replace(/[^.a-z0-9]/g, '') || '.bin';
  const tmp = path.join(MEDIA, crypto.randomBytes(6).toString('hex') + '.part');
  const h = crypto.createHash('sha256');
  let size = 0;
  try {
    await pipeline(req, async function* (src) {
      for await (const ch of src) {
        size += ch.length;
        if (size > MAX_UPLOAD) throw Object.assign(new Error('файл больше 500 МБ'), { status: 413 });
        h.update(ch);
        yield ch;
      }
    }, fs.createWriteStream(tmp));
  } catch (e) {
    await fsp.rm(tmp, { force: true });
    throw e;
  }
  const hash = h.digest('hex').slice(0, 16);
  const dup = hub.tracks.find((t) => t.hash === hash);
  if (!size || dup) {
    await fsp.rm(tmp, { force: true });
    return size ? send(res, 200, { id: dup.id, hash, duplicate: true }) : send(res, 400, { error: 'пустой файл' });
  }
  const file = hash + ext;
  await fsp.rename(tmp, path.join(MEDIA, file));
  const type = req.headers['content-type'];
  hub.addTrack({
    id: hash, hash, name: name.replace(/\.[^.]+$/, '') || name, file, size,
    type: type?.startsWith('audio/') || type?.startsWith('video/') ? type : AUDIO_MIME[ext] || 'application/octet-stream',
  });
  send(res, 200, { id: hash, hash });
}

// ---------- YouTube ----------
// Звук с YouTube скачивается на хаб через yt-dlp и дальше играет как обычный файл: точный синхрон,
// бесшовные переходы, локальная память устройств. Если yt-dlp нет или YouTube не отдал файл,
// трек остаётся «встроенным»: каждое устройство играет его в плеере YouTube.
const YTDLP = process.env.YOURAURA_YTDLP || 'yt-dlp';
let ytdlpArgs = null;   // null — yt-dlp не найден
try {
  const help = execFileSync(YTDLP, ['--help'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 15000 });
  ytdlpArgs = help.includes('--js-runtimes') ? ['--js-runtimes', 'node'] : [];   // новым версиям нужен JS-движок
} catch {}

const dlQueue = [];
let dlBusy = false;

function enqueueDownload(t) {
  if (!ytdlpArgs || dlQueue.includes(t)) return;
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
    if (hub.track(t.id) === t) await download(t);
  } catch (e) {
    // Не вышло — остаёмся на встроенном плеере YouTube.
    Object.assign(t, { kind: 'youtube', pending: false, dlError: String(e.message || e).slice(0, 200) });
    delete t.progress;
    for (const f of await fsp.readdir(MEDIA)) if (f.startsWith(`dl-${t.videoId}.`)) await fsp.rm(path.join(MEDIA, f), { force: true });
    console.log(`YouTube ${t.videoId}: не скачалось — ${t.dlError}`);
  }
  hub.trackReady(t.id);
  dlBusy = false;
  pumpDownloads();
}

function download(t) {
  const out = path.join(MEDIA, `dl-${t.videoId}.%(ext)s`);
  const args = [
    '--no-playlist', '--newline', '--progress', '--no-simulate', '--no-warnings', ...ytdlpArgs,
    '-f', 'bestaudio[ext=m4a]/bestaudio',   // m4a (AAC) распаковывают все браузеры, включая Safari
    '-o', out,
    '--progress-template', 'download:P %(progress.downloaded_bytes)s %(progress.total_bytes)s %(progress.total_bytes_estimate)s',
    '--print', 'after_move:J%(.{title,uploader,duration,filepath})j',
    'https://www.youtube.com/watch?v=' + t.videoId,
  ];
  return new Promise((ok, fail) => {
    const p = spawn(YTDLP, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let meta = null, errText = '', lastBroadcast = 0, buf = '';
    p.stdout.on('data', (ch) => {
      buf += ch;
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (line.startsWith('J{')) { try { meta = JSON.parse(line.slice(1)); } catch {} }
        const m = line.match(/^P (\d+) (\S+) (\S+)/);
        if (m) {
          const total = Number(m[2]) || Number(m[3]);
          if (total) t.progress = Math.min(1, Number(m[1]) / total);
          if (Date.now() - lastBroadcast > 500) { lastBroadcast = Date.now(); hub.broadcast(); }
        }
      }
    });
    p.stderr.on('data', (ch) => { errText = (errText + ch).slice(-4000); });
    p.on('error', fail);
    p.on('close', async (code) => {
      if (code !== 0 || !meta?.filepath) {
        const err = errText.split('\n').filter((l) => l.startsWith('ERROR')).pop() || `yt-dlp завершился с кодом ${code}`;
        return fail(new Error(/not a bot|Sign in/i.test(err)
          ? 'YouTube отдаёт это видео только после входа (адрес хаба похож на VPN или хостинг)'
          : err.replace(/^ERROR:\s*(\[[^\]]+\]\s*)*/, '')));
      }
      try {
        if (hub.track(t.id) !== t) {   // трек удалили, пока он скачивался
          await fsp.rm(meta.filepath, { force: true });
          return ok();
        }
        const hash = fileHash(meta.filepath);
        const ext = path.extname(meta.filepath).toLowerCase();
        const dup = hub.tracks.find((x) => x.hash === hash && x !== t);
        if (dup) {   // тот же звук уже есть в библиотеке
          await fsp.rm(meta.filepath, { force: true });
          hub.mergeTrack(t.id, dup.id);
        } else {
          const file = hash + ext;
          await fsp.rename(meta.filepath, path.join(MEDIA, file));
          Object.assign(t, {
            kind: 'file', file, hash, size: fs.statSync(path.join(MEDIA, file)).size, type: AUDIO_MIME[ext] || 'audio/mp4', pending: false,
            name: t.name.startsWith('YouTube ') && meta.title ? String(meta.title).slice(0, 200) : t.name,
            author: t.author || (meta.uploader ? String(meta.uploader).slice(0, 100) : undefined),
            duration: meta.duration > 0 ? Number(meta.duration) : t.duration,
          });
          delete t.progress;
        }
        ok();
      } catch (e) { fail(e); }
    });
  });
}

async function addYoutube(req, res) {
  const videoId = youtubeId((await readJson(req)).url);
  if (!videoId) return send(res, 400, { error: 'Это не похоже на ссылку YouTube' });
  const id = 'yt-' + videoId;
  let t = hub.track(id);
  if (!t) {
    const info = await youtubeInfo(videoId);
    // Встраивание запрещено — без yt-dlp такое видео не сыграть.
    if (info.status === 'noembed' && !ytdlpArgs) return send(res, 400, { error: 'Владелец видео запретил воспроизведение вне YouTube' });
    if (info.status === 'missing') return send(res, 400, { error: 'Видео не найдено или закрыто' });
    t = { id, kind: 'youtube', videoId, name: info.title || 'YouTube ' + videoId, author: info.author || undefined, size: 0 };
    hub.addTrack(t);
    enqueueDownload(t);
  }
  const { queued } = hub.offer(id);
  send(res, 200, { id, name: t.name, queued, downloading: !!t.pending });
}

function media(res, id) {
  const t = hub.track(id);
  if (!t || !t.file) return send(res, 404, { error: 'трек не найден' });
  res.writeHead(200, { 'Content-Type': t.type, 'Content-Length': t.size, 'Cache-Control': 'private, max-age=31536000, immutable' });
  fs.createReadStream(path.join(MEDIA, t.file)).pipe(res);
}

async function staticFile(res, p) {
  const fp = path.join(PUBLIC, path.normalize(p));
  if (!fp.startsWith(PUBLIC + path.sep)) return send(res, 404, { error: 'not found' });
  try {
    const data = await fsp.readFile(fp);
    res.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  } catch {
    send(res, 404, { error: 'not found' });
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://local');
  const p = url.pathname;
  try {
    if (p === '/api/time') return send(res, 200, { t: now() });
    if (p === '/api/events') return events(req, res, url);
    if (p === '/api/cmd' && req.method === 'POST') { hub.command(await readJson(req)); return send(res, 200, { ok: true }); }
    if (p === '/api/status' && req.method === 'POST') { hub.status(await readJson(req)); return send(res, 200, { ok: true }); }
    if (p === '/api/upload' && req.method === 'POST') return await upload(req, res, url);
    if (p === '/api/youtube' && req.method === 'POST') return await addYoutube(req, res);
    if (p.startsWith('/media/')) return media(res, p.slice(7));
    return await staticFile(res, p === '/' ? '/index.html' : p);
  } catch (e) {
    send(res, e.status || 500, { error: String(e.message || e) });
  }
});

// Держим SSE-соединения живыми (роутеры и мобильные браузеры рвут тихие соединения).
setInterval(() => { for (const s of streams.values()) s.write(': ping\n\n'); }, 15000);

// ---------- адреса для подключения ----------
function lanAddresses() {
  const rank = (ip) => (ip.startsWith('192.168.') ? 0 : ip.startsWith('10.') ? 1 : ip.startsWith('172.') ? 2 : 3);
  return Object.entries(os.networkInterfaces())
    .filter(([name]) => !/^(utun|ipsec|ppp|tun|tap|bridge|vmnet|vboxnet|docker)/.test(name))
    .flatMap(([, list]) => list || [])
    .filter((i) => i.family === 'IPv4' && !i.internal)
    .map((i) => i.address)
    .sort((a, b) => rank(a) - rank(b));
}

// Короткое имя youraura.local через Bonjour (на macOS — встроенный dns-sd, живёт пока живёт сервер).
function advertise(port, ip) {
  if (process.platform !== 'darwin' || !ip || process.env.YOURAURA_MDNS === '0') return null;
  const p = spawn('dns-sd', ['-P', 'YourAura', '_http._tcp', 'local', String(port), MDNS_HOST, ip], { stdio: 'ignore' });
  p.on('error', () => {});
  process.on('exit', () => { try { p.kill(); } catch {} });
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => process.exit());
  return `http://${MDNS_HOST}${port === 80 ? '' : ':' + port}`;
}

function listen(ports) {
  const [port, ...rest] = ports;
  const onError = (e) => {
    if (rest.length && (e.code === 'EADDRINUSE' || e.code === 'EACCES')) return listen(rest);
    throw e;
  };
  server.once('error', onError);
  server.listen(port, '0.0.0.0', () => {
    server.off('error', onError);
    const suffix = port === 80 ? '' : ':' + port;
    const ips = lanAddresses();
    links = { primary: ips[0] ? `http://${ips[0]}${suffix}` : null, urls: ips.map((ip) => `http://${ip}${suffix}`), mdns: advertise(port, ips[0]) };
    console.log('YourAura запущен. Открой на устройствах в той же Wi-Fi сети:');
    for (const u of [links.mdns, ...links.urls].filter(Boolean)) console.log(`  ${u}`);
    console.log(`  http://localhost${suffix}  (на этом компьютере)`);
    console.log(`Треки лежат в ${MEDIA}`);
  });
}

// Встроенные YouTube-треки (добавленные без yt-dlp или когда загрузка не вышла) пробуем скачать снова.
for (const t of hub.tracks) if (t.kind === 'youtube') enqueueDownload(t);
listen(PORTS);
