// Font loading and measuring. Glyphs are rasterised on a canvas and scanned, as in
// the Python prototype: this also works for a system font (Comic Sans) that the
// browser can draw but cannot hand over as a file.

const MEASURE_PX = 400, MEASURE_CANVAS = 900;
const WIDTH_REF = 0.7; // average a-z advance / cap height that maps to larghezza 1.0

function measureFont(family) {
  const c = document.createElement('canvas');
  c.width = c.height = MEASURE_CANVAS;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.font = `${MEASURE_PX}px "${family}"`;
  ctx.textBaseline = 'alphabetic';

  const glyph = ch => {
    ctx.clearRect(0, 0, MEASURE_CANVAS, MEASURE_CANVAS);
    ctx.fillStyle = '#000';
    ctx.fillText(ch, 200, 600);
    const d = ctx.getImageData(0, 0, MEASURE_CANVAS, MEASURE_CANVAS).data;
    const ink = (x, y) => d[(Math.round(y) * MEASURE_CANVAS + Math.round(x)) * 4 + 3] > 127;
    let x0 = MEASURE_CANVAS, y0 = MEASURE_CANVAS, x1 = -1, y1 = -1;
    for (let y = 0; y < MEASURE_CANVAS; y++) for (let x = 0; x < MEASURE_CANVAS; x++) {
      if (d[(y * MEASURE_CANVAS + x) * 4 + 3] > 127) {
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
    if (x1 < 0) throw new Error(`il font non ha il glifo "${ch}"`);
    return { ink, x0, y0, x1, y1, xm: (x0 + x1) / 2, ym: (y0 + y1) / 2 };
  };
  // length of the first ink run met while walking from (x, y) in direction (dx, dy)
  const run = (g, x, y, dx, dy) => {
    let n = 0, started = false;
    for (let i = 0; i < MEASURE_CANVAS; i++, x += dx, y += dy) {
      if (x < 0 || y < 0 || x >= MEASURE_CANVAS || y >= MEASURE_CANVAS) break;
      if (g.ink(x, y)) { n++; started = true; } else if (started) break;
    }
    return n;
  };

  const H = glyph('H'), cap = H.y1 - H.y0 + 1;
  const l = glyph('l');
  let stem = 0;
  for (let x = l.x0; x <= l.x1; x++) if (l.ink(x, Math.round(l.ym))) stem++;

  const o = glyph('o');
  const side = run(o, o.x0, o.ym, 1, 0), top = Math.max(1, run(o, o.xm, o.y0, 0, 1));
  // stress axis: the direction (from vertical, clockwise) where a ray from the centre crosses the thinnest stroke
  let axis = 0, thinnest = Infinity;
  for (let a = -85; a <= 90; a += 5) {
    const dx = Math.sin(a * RAD), dy = -Math.cos(a * RAD);
    const t = run(o, o.xm, o.ym, dx, dy) + run(o, o.xm, o.ym, -dx, -dy);
    if (t < thinnest) { thinnest = t; axis = a; }
  }
  // squareness: where the outline crosses the bbox diagonal; a circle crosses at 0.707 (n = 2)
  let sum = 0;
  for (const [sx, sy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    let s = 1;
    while (s > 0.3 && !o.ink(o.xm + sx * s * (o.x1 - o.xm), o.ym + sy * s * (o.y1 - o.ym))) s -= 0.002;
    sum += s;
  }
  const squareness = -Math.LN2 / Math.log(sum / 4);

  const x = glyph('x');
  let adv = 0;
  for (const ch of 'abcdefghijklmnopqrstuvwxyz') adv += ctx.measureText(ch).width;

  return {
    stemCap: stem / cap,
    contrastRatio: side / top,
    axis,
    avgWidth: adv / 26 / cap,
    xHeight: (x.y1 - x.y0 + 1) / cap,
    squareness,
  };
}

// Measures become the starting values of the sliders.
function measuresToPrims(m) {
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const contrast = clamp(1 - 1 / m.contrastRatio, 0, 0.9);
  return {
    weight: +clamp(m.stemCap, 0.03, 0.3).toFixed(3),
    contrast: +contrast.toFixed(2),
    axis: contrast > 0.1 ? m.axis : 0,
    squareness: +clamp(m.squareness, 2, 6).toFixed(2),
    counters: +clamp(m.xHeight / 0.7, 0.5, 1.6).toFixed(2),
    width: +clamp(m.avgWidth / WIDTH_REF, 0.7, 1.3).toFixed(2),
  };
}

async function loadFontFile(file) {
  const family = 'EmojiPressUser' + Date.now();
  const face = new FontFace(family, await file.arrayBuffer());
  await face.load();
  document.fonts.add(face);
  return { name: file.name.replace(/\.(ttf|otf)$/i, ''), family };
}

// Comic Sans if the system has it, otherwise Comic Neue from Google Fonts (linked in index.html).
async function presetFont() {
  const ctx = document.createElement('canvas').getContext('2d');
  const w = f => { ctx.font = f; return ctx.measureText('mmmmmmmmmmiiiiiwwww').width; };
  if (w('40px "Comic Sans MS", monospace') !== w('40px monospace')) return { name: 'Comic Sans MS', family: 'Comic Sans MS' };
  await document.fonts.load('40px "Comic Neue"');
  return { name: 'Comic Neue (al posto di Comic Sans)', family: 'Comic Neue' };
}
