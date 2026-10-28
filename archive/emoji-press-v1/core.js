// Emoji Press core: primitives -> outlined shapes. No p5 here, so the same
// geometry feeds the canvas and the SVG export.
// Emoji coordinates: a box from -0.5 to 0.5, y pointing down, angles in degrees.

const PRIMS = [
  { key: 'weight', label: 'Spessore (stelo / maiuscola)', min: 0.03, max: 0.3, step: 0.001, def: 0.122 },
  { key: 'contrast', label: 'Contrasto', min: 0, max: 0.9, step: 0.01, def: 0 },
  { key: 'axis', label: 'Asse del contrasto (°)', min: -60, max: 60, step: 1, def: 0 },
  { key: 'terminal', label: 'Terminali', options: ['tondo', 'tagliato', 'obliquo'], def: 'tondo' },
  { key: 'squareness', label: 'Squadratura dei tondi', min: 2, max: 6, step: 0.05, def: 2.3 },
  { key: 'aperture', label: 'Apertura', min: 0, max: 1, step: 0.01, def: 0.5 },
  { key: 'counters', label: 'Controforme (occhi, finestre)', min: 0.5, max: 1.6, step: 0.01, def: 1 },
  { key: 'radius', label: 'Raggio degli angoli', min: 0, max: 0.12, step: 0.005, def: 0.03 },
  { key: 'width', label: 'Larghezza', min: 0.7, max: 1.3, step: 0.01, def: 1 },
  { key: 'slant', label: 'Inclinazione (°)', min: -20, max: 20, step: 0.5, def: 0 },
  { key: 'wobble', label: 'Irregolarità della mano', min: 0, max: 0.03, step: 0.001, def: 0.006 },
  { key: 'hand', label: 'Seme della mano', min: 1, max: 99, step: 1, def: 7 },
];

function defaultPrims() {
  return Object.fromEntries(PRIMS.map(p => [p.key, p.def]));
}

function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

const RAD = Math.PI / 180;

// --- local shape builders -------------------------------------------------

function superellipse(cx, cy, rx, ry, n, steps = 96) {
  const pts = [];
  for (let i = 0; i < steps; i++) {
    const t = 2 * Math.PI * i / steps, c = Math.cos(t), s = Math.sin(t);
    pts.push([cx + rx * Math.sign(c) * Math.abs(c) ** (2 / n), cy + ry * Math.sign(s) * Math.abs(s) ** (2 / n)]);
  }
  return pts;
}

function arcPts(cx, cy, rx, ry, a0, a1, steps = 40) {
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const a = (a0 + (a1 - a0) * i / steps) * RAD;
    pts.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
  }
  return pts;
}

// Round every corner of a polyline with a quadratic curve of tangent length r.
function fillet(pts, r, closed) {
  if (r <= 0 || pts.length < 3) return pts;
  const out = [], n = pts.length;
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    if (!closed && (i === 0 || i === n - 1)) { out.push(p); continue; }
    const a = pts[(i - 1 + n) % n], b = pts[(i + 1) % n];
    const la = Math.hypot(a[0] - p[0], a[1] - p[1]), lb = Math.hypot(b[0] - p[0], b[1] - p[1]);
    const d = Math.min(r, la / 2, lb / 2);
    const s = [p[0] + (a[0] - p[0]) * d / la, p[1] + (a[1] - p[1]) * d / la];
    const e = [p[0] + (b[0] - p[0]) * d / lb, p[1] + (b[1] - p[1]) * d / lb];
    for (let k = 0; k <= 8; k++) {
      const t = k / 8, u = 1 - t;
      out.push([u * u * s[0] + 2 * u * t * p[0] + t * t * e[0], u * u * s[1] + 2 * u * t * p[1] + t * t * e[1]]);
    }
  }
  return out;
}

// Split long straight segments so the hand wobble can bend them.
function subdivide(pts, closed, maxLen = 0.03) {
  const out = [], n = pts.length, segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    const k = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / maxLen));
    for (let j = 0; j < k; j++) out.push([a[0] + (b[0] - a[0]) * j / k, a[1] + (b[1] - a[1]) * j / k]);
  }
  if (!closed) out.push(pts[n - 1]);
  return out;
}

// --- the pen: turns local strokes into filled outlines in cell pixels ------

class Pen {
  constructor(P, cx, cy, size, seed) {
    this.P = P; this.cx = cx; this.cy = cy; this.size = size;
    this.rng = mulberry32(seed);
    this.shapes = []; // each shape is a list of rings filled with the nonzero rule; shapes are painted one over the other
  }

  toScreen(pts) {
    const { width, slant } = this.P, sh = Math.tan(slant * RAD);
    return pts.map(([x, y]) => [this.cx + (x * width - y * sh) * this.size, this.cy + y * this.size]);
  }

  // Smooth deterministic hand: two sines per axis with phases from the seed (as in the prototype).
  jitter(pts, amp) {
    const r = this.rng, ph = [r(), r(), r(), r()].map(v => v * 2 * Math.PI);
    const k1 = 1 + Math.floor(r() * 3), k2 = 4 + Math.floor(r() * 4);
    if (amp <= 0) return pts;
    const n = pts.length;
    return pts.map(([x, y], i) => {
      const u = 2 * Math.PI * i / n;
      return [x + amp * (0.7 * Math.sin(k1 * u + ph[0]) + 0.3 * Math.sin(k2 * u + ph[1])),
              y + amp * (0.7 * Math.sin(k1 * u + ph[2]) + 0.3 * Math.sin(k2 * u + ph[3]))];
    });
  }

  stroke(pts, closed = false) {
    const P = this.P;
    const Q = this.jitter(this.toScreen(subdivide(pts, closed)), P.wobble * this.size);
    const n = Q.length, w = Math.max(0.6, P.weight * 0.62 * this.size); // head ~ cap height x 0.84, as in the prototype
    const L = [], R = [], T = [], H = [];
    for (let i = 0; i < n; i++) {
      const hasPrev = closed || i > 0, hasNext = closed || i < n - 1;
      const p = Q[i], a = Q[(i - 1 + n) % n], b = Q[(i + 1) % n];
      const d1 = hasPrev ? unit(p[0] - a[0], p[1] - a[1]) : null;
      const d2 = hasNext ? unit(b[0] - p[0], b[1] - p[1]) : null;
      let t = d1 && d2 ? unit(d1[0] + d2[0], d1[1] + d2[1]) : (d1 || d2);
      if (!t) t = d2 || d1 || [1, 0];
      const nrm = [-t[1], t[0]];
      const ref = d2 || d1, cosHalf = ref ? nrm[0] * -ref[1] + nrm[1] * ref[0] : 1;
      const miter = 1 / Math.max(0.5, cosHalf); // past 2x the corner is cut, not spiked
      // contrast: strokes running along the axis direction get thin
      const f = 1 - P.contrast * Math.abs(Math.cos(Math.atan2(t[1], t[0]) - P.axis * RAD));
      const hw = w / 2 * f;
      L.push([p[0] + nrm[0] * hw * miter, p[1] + nrm[1] * hw * miter]);
      R.push([p[0] - nrm[0] * hw * miter, p[1] - nrm[1] * hw * miter]);
      T.push(t); H.push(hw);
    }
    if (this.isTight(Q, H, closed)) { this.beads(Q, H, closed); return; }
    if (closed) { this.shapes.push([forwardOnly(L, T, true), forwardOnly(R, T, true).reverse()]); return; }
    const ring = [];
    const cap = (i, forward) => {
      const p = Q[i], t = T[i], hw = H[i], nrm = [-t[1], t[0]], s = forward ? 1 : -1;
      if (P.terminal === 'tondo') {
        const pts = [];
        for (let k = 1; k < 12; k++) {
          const a = Math.PI * k / 12, c = Math.cos(a), sn = Math.sin(a);
          pts.push([p[0] + hw * s * (nrm[0] * c + t[0] * sn), p[1] + hw * s * (nrm[1] * c + t[1] * sn)]);
        }
        return pts;
      }
      if (P.terminal === 'obliquo') {
        const k = 0.6, l = [p[0] + hw * (nrm[0] + t[0] * k), p[1] + hw * (nrm[1] + t[1] * k)];
        const r = [p[0] - hw * (nrm[0] + t[0] * k), p[1] - hw * (nrm[1] + t[1] * k)];
        if (forward) { L[i] = l; R[i] = r; } else { L[0] = l; R[0] = r; }
      }
      return [];
    };
    const endCap = cap(n - 1, true), startCap = cap(0, false);
    ring.push(...forwardOnly(L, T), ...endCap, ...forwardOnly(R, T).reverse(), ...startCap);
    this.shapes.push([ring]);
  }

  // A curve tighter than the stroke (a wink, a closed eye) has no clean outline: the
  // inner side folds. Such a stroke is painted as segments plus a disc on each vertex.
  isTight(Q, H, closed) {
    const n = Q.length;
    for (let i = closed ? 0 : 1; i < (closed ? n : n - 1); i++) {
      const a = Q[(i - 1 + n) % n], p = Q[i], b = Q[(i + 1) % n];
      const turn = Math.abs(Math.atan2((p[0] - a[0]) * (b[1] - p[1]) - (p[1] - a[1]) * (b[0] - p[0]),
        (p[0] - a[0]) * (b[0] - p[0]) + (p[1] - a[1]) * (b[1] - p[1])));
      const len = (Math.hypot(p[0] - a[0], p[1] - a[1]) + Math.hypot(b[0] - p[0], b[1] - p[1])) / 2;
      if (turn > 1e-6 && len / turn < H[i] * 1.2) return true;
    }
    return false;
  }

  beads(Q, H, closed) {
    const n = Q.length, round = closed || this.P.terminal === 'tondo', rings = [];
    for (let i = 0; i < (closed ? n : n - 1); i++) {
      const p = Q[i], q = Q[(i + 1) % n], d = unit(q[0] - p[0], q[1] - p[1]);
      if (!d) continue;
      const a = H[i], b = H[(i + 1) % n];
      rings.push([[p[0] - d[1] * a, p[1] + d[0] * a], [q[0] - d[1] * b, q[1] + d[0] * b],
        [q[0] + d[1] * b, q[1] - d[0] * b], [p[0] + d[1] * a, p[1] - d[0] * a]]);
    }
    for (let i = round ? 0 : 1; i < (round ? n : n - 1); i++) rings.push(arcPts(Q[i][0], Q[i][1], H[i], H[i], 0, 360, 16));
    // all turning the same way, so nonzero fills their union as one shape
    this.shapes.push(rings.map(r => (area(r) < 0 ? r.reverse() : r)));
  }

  fill(pts) {
    this.shapes.push([this.jitter(this.toScreen(pts), this.P.wobble * this.size * 0.5)]);
  }
}

// On the inside of a curve tighter than the stroke, the offset runs backwards and folds;
// dropping the backward points removes the fold (and the holes nonzero would leave).
function forwardOnly(side, T, closed = false) {
  const out = [side[0]], n = side.length;
  for (let i = 1; i < n; i++) {
    const q = out[out.length - 1], p = side[i];
    if ((p[0] - q[0]) * T[i][0] + (p[1] - q[1]) * T[i][1] > 0 || (!closed && i === n - 1)) out.push(p);
  }
  return out;
}

function area(r) {
  let a = 0;
  for (let i = 0; i < r.length; i++) { const p = r[i], q = r[(i + 1) % r.length]; a += p[0] * q[1] - q[0] * p[1]; }
  return a / 2;
}

function unit(x, y) {
  const l = Math.hypot(x, y);
  return l > 1e-9 ? [x / l, y / l] : null;
}

// --- shared parts: what every emoji is built from ---------------------------
// The kind names are the students' vocabulary, so they stay in Italian.

let pen = null; // the pen of the emoji being drawn

const sweep = () => 1.3 - 0.6 * pen.P.aperture; // open curves close in (0) or open up (1)
function openArc(cx, cy, rx, ry, a0, a1, steps) {
  const mid = (a0 + a1) / 2, half = (a1 - a0) / 2 * sweep();
  pen.stroke(arcPts(cx, cy, rx, ry, mid - half, mid + half, steps));
}
const dot = (x, y, r) => { const c = r * pen.P.counters; pen.fill(superellipse(x, y, c, c * 1.25, pen.P.squareness)); };

const EYES = {
  punti: (g, y) => { for (const x of [-0.15, 0.15]) dot(x, y, 0.045 * g); },
  grandi: (g, y) => { for (const x of [-0.15, 0.15]) dot(x, y, 0.06 * g); },
  chiusi: (g, y) => { for (const x of [-0.15, 0.15]) openArc(x, y + 0.04, 0.07 * g, 0.06 * g, 200, 340); },
  occhiolino: (g, y) => { dot(-0.15, y, 0.045 * g); openArc(0.15, y + 0.02, 0.06 * g, 0.03 * g, 200, 340); },
  lenti: (g, y) => {
    const c = pen.P.counters * g;
    for (const x of [-0.14, 0.14]) pen.fill(superellipse(x, y + 0.01, 0.11 * c, 0.08 * c, pen.P.squareness * 1.5));
    pen.stroke([[-0.04, y - 0.02], [0.04, y - 0.02]]);
  },
};

const MOUTHS = {
  sorriso: a => openArc(0, 0.05, 0.2 * a, 0.15, 20, 160),
  triste: a => openArc(0, 0.28, 0.17 * a, 0.12, 200, 340),
  smorfia: a => openArc(0, 0.27, 0.12 * a, 0.07, 200, 340),
  aperta: a => pen.stroke(arcPts(0, 0.06, 0.2 * a, 0.2, 0, 180), true),
  o: a => pen.stroke(superellipse(0, 0.17, 0.07 * a * pen.P.counters, 0.09 * pen.P.counters, pen.P.squareness), true),
  piatta: a => pen.stroke([[-0.15 * a, 0.16], [0.15 * a, 0.16]]),
};

const BROWS = {
  arrabbiate: () => { pen.stroke([[-0.25, -0.22], [-0.08, -0.15]]); pen.stroke([[0.25, -0.22], [0.08, -0.15]]); },
  tristi: () => { pen.stroke([[-0.25, -0.15], [-0.08, -0.22]]); pen.stroke([[0.25, -0.15], [0.08, -0.22]]); },
  alzate: () => { for (const x of [-0.15, 0.15]) openArc(x, -0.17, 0.08, 0.04, 200, 340); },
};

function pick(table, kind, what) {
  const f = table[kind];
  if (!f) throw new Error(`${what}: tipo "${kind}" sconosciuto (${Object.keys(table).join(', ')})`);
  return f;
}

// The recipe API: the words a recipe can use. Italian, because students write them.
const API = {
  testa: () => pen.stroke(superellipse(0, 0, 0.42, 0.42, pen.P.squareness), true),
  occhi: (tipo = 'punti', grandezza = 1, y = -0.08) => pick(EYES, tipo, 'occhi')(grandezza, y),
  bocca: (tipo = 'sorriso', ampiezza = 1) => pick(MOUTHS, tipo, 'bocca')(ampiezza),
  sopracciglia: (tipo = 'arrabbiate') => pick(BROWS, tipo, 'sopracciglia')(),
  linea: (...pts) => pen.stroke(fillet(pts, pen.P.radius, false)),
  poligono: (...pts) => pen.stroke(fillet(pts, pen.P.radius, true), true),
  arco: (cx, cy, rx, ry, a0, a1) => openArc(cx, cy, rx, ry, a0, a1, 24),
  tondo: (cx, cy, rx, ry = rx) => pen.stroke(superellipse(cx, cy, rx, ry, pen.P.squareness), true),
  punto: (x, y, r) => dot(x, y, r),
  rettangolo: (cx, cy, w, h) => API.poligono([cx - w / 2, cy - h / 2], [cx + w / 2, cy - h / 2], [cx + w / 2, cy + h / 2], [cx - w / 2, cy + h / 2]),
  finestre: (colonne, righe, larghezza, altezza, cy = 0) => {
    const dx = colonne > 1 ? larghezza / (colonne - 1) : 0, dy = righe > 1 ? altezza / (righe - 1) : 0;
    const s = Math.min(dx || dy, dy || dx) * 0.27 * pen.P.counters, r = Math.min(pen.P.radius, s * 0.9);
    for (let i = 0; i < colonne; i++) for (let j = 0; j < righe; j++) {
      const x = -larghezza / 2 + i * dx, y = cy - altezza / 2 + j * dy;
      pen.fill(fillet([[x - s, y - s * 1.1], [x + s, y - s * 1.1], [x + s, y + s * 1.1], [x - s, y + s * 1.1]], r, true));
    }
  },
  porta: (x = 0, base = 0.4, w = 0.14, h = 0.2) => API.linea([x - w / 2, base], [x - w / 2, base - h], [x + w / 2, base - h], [x + w / 2, base]),
  tenda: (x0, x1, y0, y1, quante = 4) => {
    const step = (x1 - x0) / quante, pts = [[x0, y0]];
    for (let i = 0; i < quante; i++) pts.push(...arcPts(x0 + step * (i + 0.5), y1, step / 2, step * 0.37, 180, 0, 16));
    pts.push([x1, y0]);
    pen.stroke(pts);
  },
};
const API_NAMES = Object.keys(API);

// Draw one compiled recipe into a cell; an error stays inside its cell.
function drawEmoji(fn, P, cx, cy, size, seed) {
  pen = new Pen(P, cx, cy, size, seed);
  try {
    fn(...API_NAMES.map(k => API[k]));
    return { shapes: pen.shapes };
  } catch (e) {
    return { shapes: [], error: e.message || String(e) };
  } finally {
    pen = null;
  }
}
