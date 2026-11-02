// Northern lights behind the page: three soft blobs and two ribbons, a still picture.
// They used to drift as CSS animations (five screen-sized blurred layers with blend modes): the browser composed
// the whole screen every frame, 60–120 times a second, and phones got warm. Now the picture is drawn once into
// a small canvas (1/6 of the screen; the browser's upscaling gives the softness) and again only when the window
// changes size or the music starts or stops (the ribbons glow brighter while it plays).
(() => {
  const K = 1 / 6, BG = '#050208';
  const canvas = document.querySelector('canvas.aurora');
  if (!canvas) return;
  const g = canvas.getContext('2d', { alpha: false });

  // Sizes in vmax (or vh for ribbon tops), timings in seconds — the same numbers the CSS had.
  const BLOBS = [
    { w: 75, h: 45, left: -25, top: -22, color: [255, 63, 191, 0.55], blur: 50, dur: 30, delay: 0 },
    { w: 70, h: 50, right: -30, top: -10, color: [139, 61, 255, 0.55], blur: 60, dur: 36, delay: -9 },
    { w: 80, h: 40, left: -10, bottom: -25, color: [193, 61, 255, 0.35], blur: 70, dur: 42, delay: -17 },
  ];
  const RIBBONS = [
    { w: 140, h: 12, left: -20, topVh: 14, stops: [[0.3, 'rgba(255, 111, 216, .55)'], [0.62, 'rgba(162, 107, 255, .55)']],
      blur: 34, alpha: [0.45, 0.75], dur: 24, reverse: false },
    { w: 120, h: 8, left: -10, topVh: 30, stops: [[0.4, 'rgba(160, 90, 255, .5)'], [0.7, 'rgba(255, 95, 207, .45)']],
      blur: 30, alpha: [0.3, 0.55], dur: 31, reverse: true },
  ];

  let W = 0, H = 0, vmax = 0, sprites = [];
  const ease = (x) => 0.5 - 0.5 * Math.cos(Math.PI * x);   // close to CSS ease-in-out
  const lerp = (a, b, x) => a + (b - a) * x;

  // Position 0..1 of an `infinite alternate` animation at time t.
  function phase(t, dur, delay, reverse) {
    const p = (t - delay) / dur, k = Math.floor(p);
    let f = p - k;
    if ((k % 2 !== 0) !== reverse) f = 1 - f;
    return f;
  }

  function sprite(w, h, paint) {
    const c = document.createElement('canvas');
    c.width = Math.max(2, Math.ceil(w * K));
    c.height = Math.max(2, Math.ceil(h * K));
    const s = c.getContext('2d');
    s.scale(c.width / w, c.height / h);
    paint(s);
    return c;
  }

  function build() {
    W = innerWidth;
    H = innerHeight;
    vmax = Math.max(W, H) / 100;
    canvas.width = Math.ceil(W * K);
    canvas.height = Math.ceil(H * K);
    sprites = [
      ...BLOBS.map((b) => {   // radial-gradient(closest-side) plus the spread of its blur
        const w = b.w * vmax + 2 * b.blur, h = b.h * vmax + 2 * b.blur;
        return sprite(w, h, (s) => {
          const [r, gr, bl, a] = b.color;
          s.translate(w / 2, h / 2);
          s.scale(w / 2, h / 2);
          const grad = s.createRadialGradient(0, 0, 0, 0, 0, 1);
          grad.addColorStop(0, `rgba(${r}, ${gr}, ${bl}, ${a})`);
          grad.addColorStop(0.5, `rgba(${r}, ${gr}, ${bl}, ${a * 0.6})`);
          grad.addColorStop(1, `rgba(${r}, ${gr}, ${bl}, 0)`);
          s.fillStyle = grad;
          s.fillRect(-1, -1, 2, 2);
        });
      }),
      ...RIBBONS.map((r) => {   // horizontal gradient, faded at the top and bottom like its blur did
        const w = r.w * vmax, h = r.h * vmax + 2 * r.blur;
        return sprite(w, h, (s) => {
          const across = s.createLinearGradient(0, 0, w, 0);
          across.addColorStop(0, 'rgba(0, 0, 0, 0)');
          for (const [at, c] of r.stops) across.addColorStop(at, c);
          across.addColorStop(1, 'rgba(0, 0, 0, 0)');
          s.fillStyle = across;
          s.fillRect(0, 0, w, h);
          const down = s.createLinearGradient(0, 0, 0, h);
          down.addColorStop(0, 'rgba(0, 0, 0, 0)');
          down.addColorStop(0.5, 'rgba(0, 0, 0, 1)');
          down.addColorStop(1, 'rgba(0, 0, 0, 0)');
          s.globalCompositeOperation = 'destination-in';
          s.fillStyle = down;
          s.fillRect(0, 0, w, h);
        });
      }),
    ];
  }

  function draw(t) {
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
    g.fillStyle = BG;
    g.fillRect(0, 0, canvas.width, canvas.height);
    g.globalCompositeOperation = 'screen';
    const v = vmax;
    BLOBS.forEach((b, i) => {
      // drift: 0% → 50% → 100% keyframes, each half eased on its own
      const f = phase(t, b.dur, b.delay, false), half = f < 0.5, x = ease(half ? f * 2 : f * 2 - 1);
      const tx = half ? lerp(0, 7, x) : lerp(7, -6, x), ty = half ? lerp(0, 5, x) : lerp(5, 9, x);
      const sc = half ? lerp(1, 1.15, x) : lerp(1.15, 0.95, x), rot = half ? lerp(0, 12, x) : lerp(12, -8, x);
      const w = b.w * v, h = b.h * v;
      const cx = (b.left != null ? b.left * v : W - b.right * v - w) + w / 2;
      const cy = (b.top != null ? b.top * v : H - b.bottom * v - h) + h / 2;
      const sp = sprites[i], sw = w + 2 * b.blur, sh = h + 2 * b.blur;
      g.setTransform(K, 0, 0, K, 0, 0);
      g.translate(cx + tx * v, cy + ty * v);
      g.rotate((rot * Math.PI) / 180);
      g.scale(sc, sc);
      g.globalAlpha = 1;
      g.drawImage(sp, -sw / 2, -sh / 2, sw, sh);
    });
    const playing = document.body.classList.contains('playing');
    RIBBONS.forEach((r, i) => {
      const x = ease(phase(t, r.dur, 0, r.reverse));
      const w = r.w * v, h = r.h * v, sh = h + 2 * r.blur;
      g.setTransform(K, 0, 0, K, 0, 0);
      g.translate(r.left * v + w / 2 + lerp(-8, 8, x) * v, (r.topVh * H) / 100 + h / 2);
      g.rotate((lerp(-14, -5, x) * Math.PI) / 180);
      g.transform(1, 0, Math.tan((lerp(-12, 12, x) * Math.PI) / 180), 1, 0, 0);
      g.globalAlpha = r.alpha[playing ? 1 : 0];
      g.drawImage(sprites[BLOBS.length + i], -w / 2, -sh / 2, w, sh);
    });
  }

  const T = 6;   // the moment of the old animation the picture shows
  build();
  draw(T);
  addEventListener('resize', () => { build(); draw(T); });
  let playing = document.body.classList.contains('playing');
  new MutationObserver(() => {
    if (document.body.classList.contains('playing') === playing) return;
    playing = !playing;
    draw(T);
  }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
})();
