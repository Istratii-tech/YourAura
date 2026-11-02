# "YourAura" in Roboto 800 as Android vector paths, gradient like the site logo (120deg #ff5fcf, #b45cff 55%, #6d5cff).
# Run: python3 tools/icon.py Roboto-Regular.ttf app/src/main/res/drawable   (needs fonttools; Roboto is Apache 2.0, e.g. /system/fonts of any Android)
import math, sys
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.boundsPen import BoundsPen

font_path, out_dir = sys.argv[1], sys.argv[2]
f = instantiateVariableFont(TTFont(font_path), {'wght': 800, 'wdth': 100, 'ital': 0})
gs, cmap, hmtx = f.getGlyphSet(), f.getBestCmap(), f['hmtx']
upm = f['head'].unitsPerEm
TEXT, TRACK = 'YourAura', -0.02 * upm

# lay out in font units, then measure the ink box
names = [cmap[ord(c)] for c in TEXT]
xs, x = [], 0
for n in names:
    xs.append(x); x += hmtx[n][0] + TRACK
bp = BoundsPen(gs)
for n, ox in zip(names, xs):
    gs[n].draw(TransformPen(bp, (1, 0, 0, 1, ox, 0)))
x0, y0, x1, y1 = bp.bounds

V, WIDTH = 108, 64          # viewport (dp) and text width: inside the 66dp safe zone of every mask
s = WIDTH / (x1 - x0)
h = (y1 - y0) * s
ox, oy = (V - WIDTH) / 2 - x0 * s, (V + h) / 2 + y0 * s   # y flips: font y up, vector y down
sp = SVGPathPen(gs, ntos=lambda v: f'{v:.2f}')
for n, gx in zip(names, xs):
    gs[n].draw(TransformPen(sp, (s, 0, 0, -s, ox + gx * s, oy)))
path = sp.getCommands()

# CSS linear-gradient(120deg) over the text box
bx0, by0, bw, bh = (V - WIDTH) / 2, (V - h) / 2, WIDTH, h
a = math.radians(120)
dx, dy = math.sin(a), -math.cos(a)
half = (abs(bw * dx) + abs(bh * dy)) / 2
cx, cy = bx0 + bw / 2, by0 + bh / 2
sx, sy, ex, ey = cx - dx * half, cy - dy * half, cx + dx * half, cy + dy * half

head = '<?xml version="1.0" encoding="utf-8"?>\n'
fg = head + f'''<!-- «YourAura» шрифтом Roboto 800, градиент как у логотипа на сайте; собрано android/tools/icon.py -->
<vector xmlns:android="http://schemas.android.com/apk/res/android" xmlns:aapt="http://schemas.android.com/aapt"
    android:width="108dp" android:height="108dp" android:viewportWidth="108" android:viewportHeight="108">
    <path android:pathData="{path}">
        <aapt:attr name="android:fillColor">
            <gradient android:type="linear" android:startX="{sx:.2f}" android:startY="{sy:.2f}" android:endX="{ex:.2f}" android:endY="{ey:.2f}">
                <item android:offset="0" android:color="#ff5fcf" />
                <item android:offset="0.55" android:color="#b45cff" />
                <item android:offset="1" android:color="#6d5cff" />
            </gradient>
        </aapt:attr>
    </path>
</vector>
'''
mono = head + f'''<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="108dp" android:height="108dp" android:viewportWidth="108" android:viewportHeight="108">
    <path android:fillColor="#ffffff" android:pathData="{path}" />
</vector>
'''
open(f'{out_dir}/ic_launcher_fg.xml', 'w').write(fg)
open(f'{out_dir}/ic_launcher_mono.xml', 'w').write(mono)
print(f'text {WIDTH}x{h:.1f}dp, path {len(path)} chars')
