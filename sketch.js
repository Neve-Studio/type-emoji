// Emoji Press: p5 sketch and interface. Geometry is in core.js, recipes in
// recipes.js, font measuring in font.js.

const BG = '#141410', INK = '#fbfbf9', MUTED = '#abab9c', ERR = '#e0705a';
const COLS = 7;
const $ = id => document.getElementById(id);

const state = {
  P: defaultPrims(),
  recipes: { ...DEFAULT_RECIPES },
  compiled: {},
  seed: 1,
  faces: [],
  font: null,
  fontLabel: '',
  measures: null,
};
let board = null, ready = false;

async function setup() {
  createCanvas($('board').clientWidth, 400).parent('board');
  noLoop();
  buildPrimControls();
  buildRecipeEditors();
  bindUI();
  setSeed(1);
  ready = true;
  await useFont(await presetFont());
}

function windowResized() { refresh(); }

// --- board layout, shared by the canvas and the SVG export ------------------

function layout(W) {
  const pad = 18, cell = (W - pad * 2) / COLS, labelH = 20, cells = [], texts = [];
  let y = pad;
  const section = (title, entries) => {
    texts.push({ x: pad, y: y + 10, size: 13, text: title, strong: true });
    y += 26;
    entries.forEach((e, i) => {
      const x = pad + (i % COLS) * cell, cy = y + Math.floor(i / COLS) * (cell + labelH);
      cells.push({ ...e, x, y: cy, cell });
      texts.push({ x: x + cell / 2, y: cy + cell + 6, size: 11, text: e.label, center: true });
    });
    y += Math.ceil(entries.length / COLS) * (cell + labelH) + 16;
  };
  section(`Subset · ${state.fontLabel}`, Object.keys(DEFAULT_RECIPES).map((k, i) => ({ key: k, label: k, compiled: state.compiled[k], index: i })));
  section(`Famiglia · seme ${state.seed}`, state.faces.map((c, i) => ({ label: `nuova ${i + 1}`, compiled: c, index: 100 + i })));
  return { cells, texts, W, H: y };
}

function cellResult(c) {
  if (!c.compiled.fn) return { shapes: [], error: c.compiled.error };
  return drawEmoji(c.compiled.fn, state.P, c.x + c.cell / 2, c.y + c.cell / 2, c.cell * 0.86, state.P.hand * 1000 + c.index);
}

function refresh() {
  if (!ready) return;
  const W = $('board').clientWidth;
  board = layout(W);
  if (width !== W || height !== Math.ceil(board.H)) resizeCanvas(W, Math.ceil(board.H), true);
  redraw();
}

function draw() {
  if (!board) return;
  background(BG);
  noStroke();
  textFont('system-ui');
  for (const t of board.texts) {
    fill(t.strong ? INK : MUTED);
    textSize(t.size);
    textAlign(t.center ? CENTER : LEFT, CENTER);
    text(t.text, t.x, t.y);
  }
  const ctx = drawingContext, errors = {};
  for (const c of board.cells) {
    const r = cellResult(c);
    if (r.error) {
      if (c.key) errors[c.key] = r.error;
      fill(ERR); textSize(11); textAlign(LEFT, TOP);
      text('Errore: ' + r.error, c.x + 6, c.y + 8, c.cell - 12, c.cell - 16);
      continue;
    }
    ctx.fillStyle = INK;
    for (const rings of r.shapes) {
      ctx.beginPath();
      for (const ring of rings) {
        ring.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
        ctx.closePath();
      }
      ctx.fill('nonzero');
    }
  }
  for (const k of Object.keys(DEFAULT_RECIPES)) {
    const box = $('r-' + k);
    box.classList.toggle('bad', !!errors[k]);
    box.querySelector('.err').textContent = errors[k] ? 'Errore: ' + errors[k] : '';
  }
}

// --- controls ---------------------------------------------------------------

const fmt = v => typeof v === 'string' ? v : v.toLocaleString('it-IT', { maximumFractionDigits: 3 });

function buildPrimControls() {
  for (const p of PRIMS) {
    const row = document.createElement('div');
    row.className = 'prim';
    row.innerHTML = `<div class="lab"><span>${p.label}</span><b id="v-${p.key}"></b></div>`;
    let input;
    if (p.options) {
      input = document.createElement('select');
      input.innerHTML = p.options.map(o => `<option>${o}</option>`).join('');
    } else {
      input = document.createElement('input');
      Object.assign(input, { type: 'range', min: p.min, max: p.max, step: p.step });
    }
    input.id = 'p-' + p.key;
    input.addEventListener('input', () => {
      state.P[p.key] = p.options ? input.value : Number(input.value);
      $('v-' + p.key).textContent = fmt(state.P[p.key]);
      refresh();
    });
    row.appendChild(input);
    $('prims').appendChild(row);
  }
  setPrims(state.P);
}

function setPrims(P) {
  state.P = { ...state.P, ...P };
  for (const p of PRIMS) {
    $('p-' + p.key).value = state.P[p.key];
    $('v-' + p.key).textContent = fmt(state.P[p.key]);
  }
  refresh();
}

function buildRecipeEditors() {
  for (const k of Object.keys(DEFAULT_RECIPES)) {
    const box = document.createElement('div');
    box.className = 'recipe';
    box.id = 'r-' + k;
    box.innerHTML = `<label for="t-${k}">${k}</label><textarea id="t-${k}" spellcheck="false"></textarea><div class="err"></div>`;
    $('recipes').appendChild(box);
    box.querySelector('textarea').addEventListener('input', e => setRecipe(k, e.target.value));
    setRecipe(k, state.recipes[k], true);
  }
}

function setRecipe(k, src, updateEditor = false) {
  state.recipes[k] = src;
  state.compiled[k] = compileRecipe(src);
  if (updateEditor) {
    const t = $('t-' + k);
    t.value = src;
    t.rows = src.split('\n').length + 1;
  }
  refresh();
}

function setSeed(s) {
  state.seed = Math.max(1, Math.floor(Number(s)) || 1);
  $('seed').value = state.seed;
  state.faces = newFaces(state.seed).map(compileRecipe);
  refresh();
}

async function useFont(f) {
  state.font = f;
  state.fontLabel = f.name;
  $('sample').style.fontFamily = `"${f.family}"`;
  $('fontName').textContent = f.name;
  try {
    state.measures = measureFont(f.family);
    setPrims(measuresToPrims(state.measures));
    status(`Misure prese da ${f.name}.`);
  } catch (e) {
    state.measures = null;
    status(`Non riesco a misurare ${f.name}: ${e.message}`);
  }
  showMeasures();
  refresh();
}

function showMeasures() {
  const m = state.measures;
  if (!m) { $('measures').innerHTML = ''; return; }
  const rows = [
    ['Stelo / altezza maiuscole', fmt(+m.stemCap.toFixed(3))],
    ['Contrasto della o (lato / sopra)', fmt(+m.contrastRatio.toFixed(2))],
    ['Asse della o', `${m.axis}°`],
    ['Larghezza media (a-z / maiuscola)', fmt(+m.avgWidth.toFixed(3))],
    ['Altezza x / maiuscola', fmt(+m.xHeight.toFixed(3))],
    ['Squadratura della o (n)', fmt(+m.squareness.toFixed(2))],
  ];
  $('measures').innerHTML = rows.map(([a, b]) => `<dt>${a}</dt><dd>${b}</dd>`).join('');
}

function status(msg) { $('status').textContent = msg; }

function bindUI() {
  $('fontFile').addEventListener('change', e => e.target.files[0] && openFile(e.target.files[0]));
  $('jsonFile').addEventListener('change', e => e.target.files[0] && openFile(e.target.files[0]));
  $('seed').addEventListener('change', e => setSeed(e.target.value));
  $('newSeed').addEventListener('click', () => setSeed(1 + Math.floor(Math.random() * 9999)));
  $('reapply').addEventListener('click', () => state.measures && setPrims(measuresToPrims(state.measures)));
  $('exportSvg').addEventListener('click', () => download(exportSvg(), 'image/svg+xml', 'svg'));
  $('exportJson').addEventListener('click', () => download(JSON.stringify(presetJson(), null, 2), 'application/json', 'json'));
  addEventListener('dragover', e => { e.preventDefault(); document.body.classList.add('dragging'); });
  addEventListener('dragleave', () => document.body.classList.remove('dragging'));
  addEventListener('drop', e => {
    e.preventDefault();
    document.body.classList.remove('dragging');
    if (e.dataTransfer.files[0]) openFile(e.dataTransfer.files[0]);
  });
}

async function openFile(file) {
  try {
    if (/\.json$/i.test(file.name)) applyPreset(JSON.parse(await file.text()));
    else if (/\.(ttf|otf)$/i.test(file.name)) await useFont(await loadFontFile(file));
    else status('Serve un .ttf, un .otf o un preset .json.');
  } catch (e) {
    status(`Non riesco ad aprire ${file.name}: ${e.message}`);
  }
}

// --- presets ----------------------------------------------------------------

function presetJson() {
  return {
    app: 'emoji-press',
    version: 1,
    font: state.fontLabel,
    measures: state.measures,
    primitives: state.P,
    seed: state.seed,
    recipes: state.recipes,
  };
}

function applyPreset(j) {
  if (!j || j.app !== 'emoji-press' || typeof j.primitives !== 'object') throw new Error('non è un preset di Emoji Press');
  const P = {};
  for (const p of PRIMS) {
    const v = j.primitives[p.key];
    if (p.options ? p.options.includes(v) : Number.isFinite(v)) P[p.key] = p.options ? v : Math.min(p.max, Math.max(p.min, v));
  }
  setPrims(P);
  for (const k of Object.keys(DEFAULT_RECIPES)) if (typeof j.recipes?.[k] === 'string') setRecipe(k, j.recipes[k], true);
  if (Number.isFinite(j.seed)) setSeed(j.seed);
  if (j.font && j.font !== state.fontLabel) state.fontLabel = `${j.font} (dal preset)`;
  status(`Preset caricato${j.font ? ': ' + j.font : ''}.`);
  refresh();
}

// --- export -----------------------------------------------------------------

function download(text, type, ext) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = `emoji-press-${state.fontLabel.replace(/[^\w-]+/g, '_')}-seme${state.seed}.${ext}`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// A real vector board for the printed booklet: black on white, primitives and font underneath.
function exportSvg() {
  const W = 980, L = layout(W), out = [];
  const txt = (x, y, size, s, opts = '') =>
    out.push(`<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-size="${size}" dominant-baseline="middle" ${opts}>${esc(s)}</text>`);
  for (const t of L.texts) txt(t.x, t.y, t.size, t.text, (t.center ? 'text-anchor="middle" ' : '') + `fill="${t.strong ? '#000' : '#555'}"`);
  for (const c of L.cells) {
    const r = cellResult(c);
    if (r.error) { txt(c.x + 6, c.y + 14, 10, 'Errore: ' + r.error, 'fill="#b00"'); continue; }
    // one path per shape, as on the canvas: overlapping shapes add up instead of cancelling
    const paths = r.shapes.map(rings => `<path d="${rings.map(ring => 'M' + ring.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join('L') + 'Z').join('')}"/>`);
    out.push(`<g id="${esc(c.key || 'nuova-' + (c.index - 99))}">${paths.join('')}</g>`);
  }
  let y = L.H + 6;
  txt(18, y, 13, `Font: ${state.fontLabel}`, 'fill="#000"');
  y += 22;
  PRIMS.forEach((p, i) => txt(18 + (i % 2) * 470, y + Math.floor(i / 2) * 18, 11, `${p.label}: ${fmt(state.P[p.key])}`, 'fill="#333"'));
  y += Math.ceil(PRIMS.length / 2) * 18 + 6;
  const m = state.measures;
  if (m) {
    txt(18, y, 11, `Misure: stelo/maiuscola ${fmt(+m.stemCap.toFixed(3))} · contrasto o ${fmt(+m.contrastRatio.toFixed(2))} · asse ${m.axis}° · larghezza ${fmt(+m.avgWidth.toFixed(3))} · x/maiuscola ${fmt(+m.xHeight.toFixed(3))} · squadratura ${fmt(+m.squareness.toFixed(2))}`, 'fill="#555"');
    y += 18;
  }
  txt(18, y, 10, 'Emoji Press · TYPE&EMOJI · NABA 2026', 'fill="#888"');
  const H = Math.ceil(y + 20);
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="SF Pro Text, Helvetica, Arial, sans-serif">
<rect width="${W}" height="${H}" fill="#fff"/>
<g fill="#000">
${out.join('\n')}
</g>
</svg>
`;
}
