// Languages of the interface. The site is written in Russian; EN maps each Russian phrase to English.
// L('Отправка {i}/{n}…', { i, n }) — a phrase from the code; translatePage() — the static text of index.html.
// Messages that come from a hub (errors of downloads and uploads) are translated the same way when shown:
// they are the same fixed phrases. Whitespace inside a phrase does not matter (multi-line templates).
// The language follows the browser (Russian for ru/uk/be/kk) until chosen in «Это устройство».

const EN = {
  // index.html
  'Комната': 'Room',
  'Музыка звучит одновременно на всех устройствах в комнате. Создай комнату на одном устройстве, остальные подключатся по QR-коду или коду комнаты.':
    'Music plays at the same moment on every device in the room. Create a room on one device, the others join with the QR code or the room code.',
  'Создать комнату': 'Create a room',
  'Код комнаты': 'Room code',
  'Войти': 'Join',
  'Добро пожаловать': 'Welcome',
  'Музыка звучит одновременно на всех устройствах, которые открыли эту страницу.': 'Music plays at the same moment on every device that opened this page.',
  'Включить звук на этом устройстве': 'Play sound on this device',
  'Только пульт, без звука': 'Remote only, no sound',
  'нет связи': 'offline',
  'Браузер приостановил звук на этом устройстве.': 'The browser paused the sound on this device.',
  'Вернуть звук': 'Resume sound',
  'Это устройство заглушено с пульта.': 'This device was muted from a remote.',
  'Включить звук': 'Unmute',
  'Сохранять треки на этом устройстве?': 'Keep tracks on this device?',
  'Трек, который уже звучал, в следующий раз не будет скачиваться заново: старт быстрее, трафика меньше. Треки хранятся в памяти браузера для этого сайта. Посмотреть и удалить их можно в разделе «Это устройство» внизу.':
    'A track that has played once won’t be downloaded again: faster start, less traffic. Tracks are kept in this browser’s storage for this site. See and delete them under “This device” below.',
  'Сохранять': 'Keep',
  'Не нужно': 'No thanks',
  'Сейчас играет': 'Now playing',
  'Нажми на видео, чтобы YouTube разрешил звук': 'Tap the video so YouTube allows sound',
  'Позиция': 'Position',
  'Назад': 'Previous',
  'Играть': 'Play',
  'Следующий': 'Next',
  'Очередь': 'Queue',
  'Очистить': 'Clear',
  'Библиотека': 'Library',
  'Вставь ссылку на YouTube': 'Paste a YouTube link',
  'Ссылка на YouTube': 'YouTube link',
  'Добавить': 'Add',
  '＋ Добавить музыку': '＋ Add music',
  'Громкость': 'Volume',
  'Все устройства': 'All devices',
  'Громкость на всех устройствах': 'Volume on all devices',
  'Нет подключённых устройств': 'No devices connected',
  'Общий ползунок выставляет всем одинаковую громкость. Ползунок устройства меняет только его.':
    'The common slider sets the same volume everywhere. A device’s slider changes only that device.',
  'Синхронизация': 'Sync',
  'Нет устройств со звуком': 'No devices with sound',
  'Если устройство звучит позже остальных, сдвигай его задержку вправо. Bluetooth-колонкам обычно нужно +150…250 мс.':
    'If a device sounds later than the others, move its delay to the right. Bluetooth speakers usually need +150…250 ms.',
  'Калибровка щелчками': 'Click calibration',
  'Пересинхронизировать все': 'Resync all',
  'Только это устройство': 'This device only',
  'Все устройства щёлкают в такт, на каждом четвёртом щелчке звук выше. Встань между двумя устройствами, остальные заглуши в блоке «Громкость». Сдвигай задержку одного из них, пока два щелчка не сольются в один. Потом по очереди подстрой остальные устройства.':
    'All devices click in time, every fourth click is higher. Stand between two devices and mute the rest under “Volume”. Move the delay of one of them until the two clicks merge into one. Then tune the other devices one by one.',
  'Готово': 'Done',
  'Подключить устройство': 'Connect a device',
  'Выйти из комнаты': 'Leave the room',
  'Это устройство': 'This device',
  'Имя. Хаб запоминает устройство, а если браузер забудет, узнает его по IP, модели и экрану.':
    'Name. The hub remembers the device, and if the browser forgets, recognises it by IP, model and screen.',
  'Имя устройства': 'Device name',
  'Показать имя': 'Show name',
  'Сохранять треки на этом устройстве': 'Keep tracks on this device',
  'Скачать всю библиотеку': 'Download the whole library',
  'Удалить все': 'Delete all',
  'Язык': 'Language',

  // app.js
  'МБ': 'MB',
  'мс': 'ms',
  'Android-планшет': 'Android tablet',
  'Android-телефон': 'Android phone',
  'Компьютер': 'Computer',
  'формат не поддерживается': 'format not supported',
  'Узнал это устройство: «{name}». Имя, громкость и задержка восстановлены.': 'Recognised this device: “{name}”. Name, volume and delay restored.',
  'YouTube недоступен, нет интернета?': 'YouTube is unreachable. No internet?',
  'в этом браузере': 'in this browser',
  'в {browser}': 'in {browser}',
  'YouTube не открылся {where}: правообладатель ограничил показ (код {code})': 'YouTube did not open {where}: the rights holder restricted playback (code {code})',
  'YouTube не открылся {where}: не принял адрес страницы (код {code})': 'YouTube did not open {where}: it rejected the page address (code {code})',
  'видео удалено или закрыто (код 100)': 'the video was removed or made private (code 100)',
  'плеер YouTube не работает {where} (код 5)': 'the YouTube player does not work {where} (code 5)',
  'YouTube не открылся {where}, код {code}': 'YouTube did not open {where}, code {code}',
  'QR-код {url}': 'QR code {url}',
  'Найти: устройство покажет своё имя и прозвенит': 'Find: the device shows its name and rings',
  'Найти устройство': 'Find the device',
  'Переименовать': 'Rename',
  'Громкость устройства': 'Device volume',
  'Минус 1 мс': 'Minus 1 ms',
  'Плюс 1 мс': 'Plus 1 ms',
  'Задержка устройства': 'Device delay',
  'Телефон': 'Phone',
  'Планшет': 'Tablet',
  'это': 'this one',
  'пульт': 'remote',
  'не открылся трек': 'track did not open',
  'готово': 'ready',
  'загрузка {p}%': 'loading {p}%',
  'ждём': 'waiting',
  'Заглушить': 'Mute',
  'Или поставь приложение YourAura для Android: оно скачивает звук с YouTube и раздаёт его всем устройствам, синхрон точный и запреты встраивания не мешают.':
    'Or install the YourAura app for Android: it downloads the sound from YouTube and serves it to every device, with exact sync and no embedding restrictions.',
  'Скачать приложение': 'Get the app',
  'YouTube не открылся в этом браузере': 'YouTube did not open in this browser',
  'Открой YourAura в другом браузере, например в {other}:': 'Open YourAura in another browser, for example {other}:',
  'Попробовать здесь ещё раз': 'Try here again',
  'В браузере такое видео не сыграть.': 'A browser can’t play this video.',
  'Хаб не скачал звук с YouTube.': 'The hub could not download the sound from YouTube.',
  'Трек играет через плеер YouTube на каждом устройстве, синхрон там чуть грубее.': 'The track plays in YouTube’s player on every device, the sync is a little rougher there.',
  'Скачать ещё раз': 'Download again',
  'заглушено': 'muted',
  'звук включён': 'sound on',
  'на связи': 'online',
  'ищу хаб комнаты…': 'looking for the room’s hub…',
  'Этот iPhone — хаб комнаты. Не блокируй экран и не сворачивай браузер: иначе iPhone остановит музыку на всех устройствах.':
    'This iPhone is the room’s hub. Don’t lock the screen or leave the browser, or the iPhone stops the music on every device.',
  'На iPhone не блокируй экран и не сворачивай браузер, пока играет музыка: иначе iPhone остановит звук.':
    'On an iPhone, don’t lock the screen or leave the browser while music plays, or the iPhone stops the sound.',
  'Нет трека — добавь музыку ниже': 'No track — add music below',
  'Далее: {name}': 'Next: {name}',
  'Не удалось открыть трек: {err}': 'Could not open the track: {err}',
  'Распаковка…': 'Decoding…',
  'Загрузка {p}%': 'Loading {p}%',
  'Скачиваю с YouTube на хаб: {p}%': 'Downloading from YouTube to the hub: {p}%',
  ', потом включу': ', then it plays',
  'Ждём, пока все устройства загрузят трек…': 'Waiting for every device to load the track…',
  'Подстрой задержки в разделе «Устройства»': 'Tune the delays under “Sync”',
  'Играет на устройствах': 'Playing on the devices',
  ' (здесь звук выключен)': ' (no sound here)',
  'Нажми на видео: YouTube на этом устройстве ждёт касания': 'Tap the video: YouTube on this device waits for a tap',
  'YouTube: подстраиваюсь…': 'YouTube: syncing…',
  'Играет синхронно': 'Playing in sync',
  'Выше': 'Up',
  'Ниже': 'Down',
  'Убрать': 'Remove',
  'Пусто. Добавь треки кнопкой ＋ в библиотеке': 'Empty. Add tracks with ＋ in the library',
  'Когда очередь кончится, библиотека играет дальше по порядку.': 'When the queue ends, the library plays on in order.',
  'Сохранён на этом устройстве': 'Kept on this device',
  'Не скачалось, играет через плеер YouTube: {err}': 'Not downloaded, plays in YouTube’s player: {err}',
  'Скачать на хаб ещё раз': 'Download to the hub again',
  'Играть следующим': 'Play next',
  'В конец очереди': 'Add to the end of the queue',
  'В очередь': 'To the queue',
  'Удалить с сервера': 'Delete from the hub',
  'Удалить': 'Delete',
  'Пока пусто. Добавь файлы с этого устройства': 'Empty so far. Add files from this device',
  'Остановить калибровку': 'Stop calibration',
  'Наведи камеру телефона на QR или набери адрес в браузере: так подключаются устройства в той же Wi-Fi сети, интернет не нужен.':
    'Point a phone’s camera at the QR code or type the address in a browser: that is how devices on the same Wi-Fi join, no internet needed.',
  'Из любой сети — код комнаты': 'From any network — the room code',
  'Наведи камеру телефона на QR или открой ссылку. Лучше, когда все в одной Wi-Fi сети: музыка дойдёт быстрее.':
    'Point a phone’s camera at the QR code or open the link. It works best when everyone is on the same Wi-Fi: the music arrives faster.',
  'Наведи камеру телефона на QR или набери адрес в браузере. Устройства должны быть в той же Wi-Fi сети.':
    'Point a phone’s camera at the QR code or type the address in a browser. The devices must be on the same Wi-Fi.',
  'Это устройство — хаб комнаты: библиотека хранится здесь. Не закрывай эту вкладку, иначе музыка остановится у всех.':
    'This device is the room’s hub: the library is kept here. Don’t close this tab, or the music stops for everyone.',
  'Ты в комнате. Хаб — устройство, которое её создало.': 'You are in the room. The hub is the device that created it.',
  'Треки сохраняются в памяти браузера (IndexedDB) для адреса {origin}. Это не обычные файлы: в «Файлах» их не видно, но они переживают перезапуск. С другого адреса или в другом браузере память своя. Удалить их можно здесь или очисткой данных сайта.':
    'Tracks are kept in the browser’s storage (IndexedDB) for {origin}. They aren’t ordinary files: the Files app doesn’t show them, but they survive a restart. Another address or another browser has storage of its own. Delete them here or by clearing the site’s data.',
  'Оригиналы лежат на компьютере-хабе в {dir}.': 'The originals are on the hub computer in {dir}.',
  'Библиотека комнаты хранится в браузере устройства-хаба, отдельно от этой памяти.': 'The room’s library is kept on the hub device, apart from this storage.',
  'Удалить с устройства': 'Delete from this device',
  'На этом устройстве ничего не сохранено': 'Nothing is kept on this device',
  'Всего: {n} · {size}': 'Total: {n} · {size}',
  'Часы ±{clock} мс · вывод звука {out} мс · ': 'Clock ±{clock} ms · audio output {out} ms · ',
  'расхождение YouTube ': 'YouTube offset ',
  'точность расписания ': 'schedule accuracy ',
  'Задержку самих динамиков браузер не видит, её подстраивают на слух: «Калибровка щелчками».':
    'The browser can’t see the delay of the speakers themselves; tune it by ear with “Click calibration”.',
  'Удалить «{name}» с сервера?': 'Delete “{name}” from the hub?',
  'Как назвать это устройство?': 'What should this device be called?',
  'Отправка {i}/{n}…': 'Sending {i}/{n}…',
  'Отправка {i}/{n}: {p}%': 'Sending {i}/{n}: {p}%',
  'Не отправились: {list}': 'Not sent: {list}',
  'Добавляю…': 'Adding…',
  '«{name}» скачивается на хаб и встанет в очередь': '“{name}” is downloading to the hub and will join the queue',
  '«{name}» скачивается на хаб и выбрано': '“{name}” is downloading to the hub and is selected',
  '«{name}» встанет в очередь': '“{name}” will join the queue',
  '«{name}» выбрано': '“{name}” is selected',
  'Не получилось добавить': 'Could not add it',
  'Удалить все сохранённые треки с этого устройства? На компьютере-хабе они останутся.': 'Delete all kept tracks from this device? They stay on the hub.',
  'Скачиваю {i}/{n}: {p}%': 'Downloading {i}/{n}: {p}%',
  'Создаю комнату…': 'Creating the room…',
  'Подключаюсь…': 'Connecting…',
  'Не получилось: {err}': 'Did not work: {err}',
  'Закрыть комнату? Музыка остановится на всех устройствах.': 'Close the room? The music stops on every device.',

  // broadcast
  'Транслировать звук телефона': 'Broadcast the phone\u2019s sound',
  'Остановить трансляцию': 'Stop broadcasting',
  'Трансляция с телефона': 'Broadcast from the phone',
  'Этот телефон транслирует свой звук на устройства комнаты': 'This phone broadcasts its sound to the room\u2019s devices',
  'Убери звук на этом телефоне: здесь всё звучит на секунду раньше, чем на остальных устройствах. Этот телефон только транслирует звук другим, трансляция от громкости не зависит.':
    'Turn the sound down on this phone: everything sounds here a second earlier than on the other devices. This phone only broadcasts the sound to the others; the broadcast doesn\u2019t depend on its volume.',
  'Трансляция идёт на устройствах': 'Broadcasting to the devices',
  'Играет звук телефона-хаба, с задержкой {d} с': 'Playing the hub phone\u2019s sound, {d} s behind',
  'Всё, что играет на этом телефоне, — музыка из любого приложения, видео, игры — зазвучит на всех устройствах комнаты. Android попросит разрешение на запись экрана: записывается только звук.':
    'Whatever plays on this phone \u2014 music from any app, videos, games \u2014 will sound on every device in the room. Android asks for permission to record the screen: only the sound is recorded.',
  'Без разрешения на запись звука Android не даёт транслировать': 'Without the permission to record audio Android doesn\u2019t allow broadcasting',
  'Трансляция отменена': 'Broadcast cancelled',
  'Сейчас аппаратная громкость {p}%': 'Hardware volume now {p}%',

  // messages from hubs (net.mjs, server.mjs, core/hub.mjs, the Android app)
  'не отправился': 'not sent',
  'файл не сохранился': 'the file was not saved',
  'файл больше 500 МБ': 'the file is larger than 500 MB',
  'Это не похоже на ссылку YouTube': 'This doesn’t look like a YouTube link',
  'Видео не найдено или закрыто': 'The video was not found or is private',
  'Владелец видео запретил встроенный показ': 'The owner of the video doesn’t allow embedding',
  'Владелец видео запретил воспроизведение вне YouTube': 'The owner of the video doesn’t allow playback outside YouTube',
  'трек не найден': 'track not found',
  'это не аудиофайл': 'this is not an audio file',
  'слишком большой запрос': 'request too large',
  'пустой файл': 'empty file',
  'YouTube отдаёт это видео только после входа (адрес хаба похож на VPN или хостинг)':
    'YouTube gives this video only after sign-in (the hub’s address looks like a VPN or hosting)',
  'YouTube отдаёт это видео только после входа (адрес телефона похож на VPN или хостинг)':
    'YouTube gives this video only after sign-in (the phone’s address looks like a VPN or hosting)',
  'yt-dlp не сказал, куда сохранил файл': 'yt-dlp did not say where it saved the file',
  'Устройство': 'Device',
  'не тот id видео': 'wrong video id',
  'нужен id': 'id required',
  'нельзя': 'not allowed',
};

const norm = (s) => String(s).replace(/\s+/g, ' ').trim();
const TABLE = new Map(Object.entries(EN).map(([ru, en]) => [norm(ru), en]));
const RU_LANGS = /^(ru|uk|be|kk)\b/i;

let saved = null;
try { saved = localStorage.getItem('ya-lang'); } catch {}
export const lang = saved === 'ru' || saved === 'en' ? saved
  : RU_LANGS.test((navigator.languages && navigator.languages[0]) || navigator.language || '') ? 'ru' : 'en';

export function setLang(l) {
  try { localStorage.setItem('ya-lang', l); } catch {}
  location.reload();
}

// A phrase in this device's language; {name} parts are filled from vars (already escaped where it matters).
export function L(ru, vars) {
  let s = lang === 'ru' ? ru : TABLE.get(norm(ru)) ?? ru;
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
  return s;
}

// The static text of the page: text nodes and the attributes people read.
export function translatePage(root = document.body) {
  document.documentElement.lang = lang;
  if (lang === 'ru') return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (n.parentElement.closest('script, style, code')) continue;
    const text = norm(n.nodeValue);
    if (text && TABLE.has(text)) n.nodeValue = n.nodeValue.replace(/\S[\s\S]*\S|\S/, TABLE.get(text));
  }
  for (const el of root.querySelectorAll('[placeholder], [title], [aria-label], [data-empty]')) {
    for (const a of ['placeholder', 'title', 'aria-label', 'data-empty']) {
      const v = el.getAttribute(a);
      if (v && TABLE.has(norm(v))) el.setAttribute(a, TABLE.get(norm(v)));
    }
  }
}
