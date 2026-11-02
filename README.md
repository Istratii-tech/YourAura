# YourAura

[![Telegram](https://img.shields.io/badge/Telegram-2CA5E0?style=for-the-badge&logo=telegram&logoColor=white)](https://t.me/istratii_tech ) [![Discord](https://img.shields.io/badge/Discord-5865F2?style=for-the-badge&logo=discord&logoColor=white)](https://discord.gg/5HWuRWdKwt)

**Music at the same moment on every device** — phones, tablets and computers play one track together, to the
millisecond. The other devices only open a page in a browser: an iPhone, an Android phone, any computer. The hub
keeps the library and the shared clock: an Android phone with the YourAura app (it also broadcasts whatever the
phone plays), a browser tab, or a small server on a computer.

MADE WITH CLAUDE CODE

Repository: `https://github.com/Istratii-tech/YourAura`. Site: https://istratii-tech.github.io/YourAura/
Requests and questions: issues of this repository or `https://t.me/istratii_tech`.

## Instructions

Инструкция: как пользоваться YourAura

**Приложение для Android** — лучший вариант: телефон становится хабом, интернет не нужен.

1. Скачайте `YourAura-ВЕРСИЯ.apk` из Releases этого репозитория и установите (Android 10 и новее, 64-битный телефон).
2. Нажмите «Создать комнату».
3. На других устройствах в той же сети Wi-Fi наведите камеру на QR-код или наберите адрес под ним.
   Из другой сети — код комнаты на https://istratii-tech.github.io/YourAura/
4. На каждом устройстве нажмите «Включить звук» (или «Только пульт»).
5. Добавьте музыку: «＋ Добавить музыку» — файлы с любого устройства; ссылка на YouTube или «Поделиться → YourAura»
   в приложении YouTube — звук скачается на телефон.
6. **Трансляция.** «Транслировать звук телефона» — всё, что играет на телефоне (любое приложение, видео, игры),
   зазвучит на устройствах комнаты на секунду позже. Звук на самом телефоне уберите. Остановить — той же кнопкой
   или из уведомления.
7. Экран телефона-хаба можно выключить, звонок ставит комнату на паузу. На iPhone экран сам не гаснет, пока играет
   музыка; не блокируйте его и не сворачивайте Safari.
8. Если устройство звучит позже остальных (часто это Bluetooth-колонки), сдвиньте его задержку в «Синхронизации»
   или включите «Калибровку щелчками».

**Без приложения.** Откройте сайт и нажмите «Создать комнату»: эта вкладка станет хабом, не закрывайте её.
YouTube на сайте играет через плеер YouTube на каждом устройстве.

**Хаб на компьютере.** `node server.mjs` (Node 18+): адрес и QR-код появятся в окне. Для YouTube нужен yt-dlp:
`pip install -U "yt-dlp[default]"`.

How to use YourAura

**The Android app** — the best way: the phone becomes the hub, no internet needed.

1. Download `YourAura-VERSION.apk` from this repository's Releases and install it (Android 10 or newer, a 64-bit phone).
2. Tap “Create a room”.
3. On the other devices on the same Wi-Fi, point the camera at the QR code or type the address under it.
   From another network, use the room code at https://istratii-tech.github.io/YourAura/
4. On each device, tap “Play sound on this device” (or “Remote only”).
5. Add music: “＋ Add music” takes files from any device; a YouTube link, or Share → YourAura in the YouTube app,
   downloads the sound to the phone.
6. **Broadcast.** “Broadcast the phone’s sound” sends whatever plays on the phone (any app, videos, games) to the
   room’s devices, a second later. Turn the sound down on the phone itself. Stop it with the same button or from
   the notification.
7. The hub phone’s screen can be off, and a call pauses the room. On an iPhone the screen stays on while music plays;
   don’t lock it or leave Safari.
8. If a device sounds later than the others (Bluetooth speakers often do), move its delay under “Sync” or use
   “Click calibration”.

**Without the app.** Open the site and tap “Create a room”: that tab becomes the hub, keep it open. On the site,
YouTube plays in YouTube’s own player on each device.

**A hub on a computer.** `node server.mjs` (Node 18+): the address and the QR code appear in the window. YouTube needs
yt-dlp: `pip install -U "yt-dlp[default]"`.

## What is *not* here

* **No music.** Neither the release nor this repository ships any tracks. You bring your own files and links.
* **No accounts and no servers of ours.** Music and commands go between your own devices. Rooms over the internet find
  each other through public Nostr relays; only a handshake, encrypted with the room code, passes through them.
* **No telemetry.** Nothing is sent anywhere else.

## Building

```bash
node server.mjs                              # the computer hub, no dependencies
cd android && ./gradlew assembleRelease      # the Android app: JDK 17+, the Android SDK
```

The site is the `public/` folder as it is.

## Licences

* **YourAura's own code** — **GNU Affero General Public License v3.0** (`LICENSE`): if you change it and distribute it
  or let people use it over a network, you must publish your changes under the same licence.
* **qrcode-generator** and **Trystero** (`public/vendor/`) — MIT (`public/vendor/LICENSES.md`).
* **The Android app** also contains youtubedl-android (GPL-3.0) with Python (PSF), yt-dlp (Unlicense) and QuickJS
  (MIT), and AndroidX, Jackson, Commons IO and Kotlin (Apache-2.0). The icon is drawn with Roboto (Apache-2.0).

## Trademarks

YouTube and Android are trademarks of Google LLC. All other product names, logos and brands are property of their
respective owners. This project is independent and is not affiliated with, endorsed by, or sponsored by any of them.

## Contact

`https://github.com/Istratii-tech/YourAura` (issues), `https://t.me/istratii_tech`
