// Service code for Emoji Kit: loading pieces (sample kits, zip, folder, one layer),
// the layer panel, the buttons, and recolouring. Students do not need to touch this file.
// It talks to sketch.js through its globals: layers, kit, combo, selected,
// nameOf(), nextPiece(), randomize(), savePNG(), saveCombo(), saveGrid().

const BOARD = 1000; // SVGs are rasterised at this size, the board of the README convention
// Kits made before free layers had these five folders without numbers: they keep this order.
const LEGACY = ['faccia', 'occhi', 'sopracciglia', 'bocca', 'accessori'];
let order = {}; // layer name -> the number in front of its folder (Infinity = none: alphabetical, on top)
const $ = (id) => document.getElementById(id);

function setStatus(text, isError = false) {
  $('status').textContent = text;
  $('status').classList.toggle('error', isError);
}

// '1-carrozzeria', '01_carrozzeria', '1 carrozzeria' -> [1, 'carrozzeria']; 'ruote' -> [Infinity, 'ruote'].
function splitPrefix(folder) {
  const m = folder.trim().match(/^(\d+)[-_ .]+(.+)$/);
  return m ? [Number(m[1]), m[2].toLowerCase()] : [Infinity, folder.trim().toLowerCase()];
}

// The sample kits come as data (kits/*/kit.js), so they also load from file://.
// key '' starts from an empty kit.
async function loadSampleKit(key = $('sampleKit').value) {
  kit = {};
  combo = {};
  order = {};
  layers = [];
  selected = 0;
  if (!key) {
    updatePanel();
    return setStatus('Kit vuoto: carica i tuoi livelli dalla colonna di destra.');
  }
  const sample = window.SAMPLE_KITS?.[key];
  if (!sample) return setStatus(`Kit di esempio non trovato: manca kits/${key}/kit.js`, true);
  const files = [];
  for (const [layer, pieces] of Object.entries(sample.pieces)) {
    for (const p of pieces) files.push({ path: `${layer}/${p.name}.svg`, blob: async () => new Blob([p.svg]) });
  }
  await useFiles(files, `kit di esempio «${sample.label}»`);
}

// files: [{ path: '2-occhi/tondi.svg', blob: async () => Blob }]. The layer is the first folder
// of the path (inside a single root folder, if there is one), or oneLayer for loose files.
// A loaded layer replaces the one with the same name; the others stay.
async function useFiles(files, label, oneLayer) {
  const found = [];
  for (const f of files) {
    const dirs = f.path.split('/');
    const file = dirs.pop();
    if (!/\.(svg|png)$/i.test(file) || file.startsWith('.') || dirs.some((d) => d.toLowerCase() === '__macosx')) continue;
    found.push({ ...f, file, dirs });
  }
  // A zip of the kit folder, or the kit folder itself: its layers are one level down.
  const root = found[0]?.dirs[0];
  if (!oneLayer && found.every((f) => f.dirs[0] === root) && found.some((f) => f.dirs.length > 1)) {
    found.forEach((f) => f.dirs.shift());
  }
  const groups = {};
  for (const f of found) {
    const folder = oneLayer ?? f.dirs[0];
    if (!folder) continue; // a loose file next to the layer folders
    const [num, layer] = splitPrefix(folder);
    (groups[layer] ||= { num, files: [] }).files.push(f);
  }
  const names = Object.keys(groups);
  if (!names.length) {
    return setStatus(`${label}: non ho trovato ${oneLayer ? 'file .svg o .png' : 'cartelle con file .svg o .png'}.`, true);
  }
  const legacy = names.every((n) => LEGACY.includes(n) && groups[n].num === Infinity);
  const skipped = [];
  for (const layer of names) {
    const pieces = [];
    for (const f of groups[layer].files) {
      try {
        pieces.push({ name: f.file.replace(/\.\w+$/, ''), img: await toImage(await f.blob(), f.file) });
      } catch (err) {
        skipped.push(f.file);
      }
    }
    if (!pieces.length) continue;
    kit[layer] = pieces.sort((a, b) => a.name.localeCompare(b.name, 'it', { numeric: true }));
    combo[layer] = 0;
    const num = groups[layer].num;
    // Without a number, a reloaded layer keeps its place.
    order[layer] = num !== Infinity ? num : order[layer] ?? (legacy ? LEGACY.indexOf(layer) + 1 : Infinity);
  }
  layers = Object.keys(kit).sort((a, b) => order[a] - order[b] || a.localeCompare(b, 'it', { numeric: true }));
  selected = Math.min(selected, Math.max(layers.length - 1, 0));
  updatePanel();
  const counts = layers.map((l) => `${l} ${kit[l].length}`).join(' · ');
  setStatus(`Caricato: ${label}. Livelli: ${counts}.` + (skipped.length ? ` Non letti: ${skipped.join(', ')}.` : ''), skipped.length > 0);
}

// A Blob of an SVG or PNG becomes a p5.Image. SVGs exported without width and height
// (Illustrator's "responsive") would rasterise at 300x150: give them the board size first.
async function toImage(blob, file) {
  if (/\.svg$/i.test(file)) {
    const svg = new DOMParser().parseFromString(await blob.text(), 'image/svg+xml').documentElement;
    if (svg.nodeName !== 'svg') throw new Error(`${file} is not an SVG`);
    if (!svg.getAttribute('viewBox')) {
      svg.setAttribute('viewBox', `0 0 ${parseFloat(svg.getAttribute('width')) || BOARD} ${parseFloat(svg.getAttribute('height')) || BOARD}`);
    }
    const [, , w, h] = svg.getAttribute('viewBox').trim().split(/[\s,]+/).map(Number);
    svg.setAttribute('width', BOARD);
    svg.setAttribute('height', Math.round((BOARD * h) / w));
    blob = new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' });
  } else {
    blob = new Blob([blob], { type: 'image/png' });
  }
  const url = URL.createObjectURL(blob);
  try {
    return await loadImage(url);
  } finally {
    URL.revokeObjectURL(url);
  }
}

// A copy of the piece in one flat colour, keeping its transparency. Cached per colour.
function inked(img, color) {
  img.inks ||= {};
  if (!img.inks[color]) {
    const g = createGraphics(img.width, img.height);
    g.pixelDensity(1);
    g.image(img, 0, 0);
    g.drawingContext.globalCompositeOperation = 'source-in';
    g.noStroke();
    g.fill(color);
    g.rect(0, 0, img.width, img.height);
    img.inks[color] = g;
  }
  return img.inks[color];
}

// One row per layer, in drawing order (the first row is the bottom layer): arrow left,
// layer and piece name, piece number, arrow right.
function updatePanel() {
  const panel = $('panel');
  panel.innerHTML = layers.length ? '' : '<p class="muted">Nessun livello: carica un kit dalla colonna di destra.</p>';
  layers.forEach((layer, i) => {
    const row = document.createElement('div');
    row.className = 'row' + (i === selected ? ' selected' : '');
    row.dataset.layer = layer;
    row.innerHTML = `<button class="arrow">‹</button>
      <span class="label"><span class="layer"></span><span class="name"></span></span>
      <span class="count">${combo[layer] + 1}/${kit[layer].length}</span>
      <button class="arrow">›</button>`;
    // Folder and file names go in as text, never as HTML.
    row.querySelector('.layer').textContent = layer;
    row.querySelector('.name').textContent = nameOf(layer) ?? 'nessuno';
    const [prev, next] = row.querySelectorAll('button');
    prev.setAttribute('aria-label', `${layer}: pezzo prima`);
    next.setAttribute('aria-label', `${layer}: pezzo dopo`);
    prev.onclick = () => nextPiece(layer, -1);
    next.onclick = () => nextPiece(layer, 1);
    row.onclick = () => { selected = i; updatePanel(); };
    panel.append(row);
  });
}

// Files from a folder picker keep their path in webkitRelativePath.
const fromInput = (input) => [...input.files].map((f) => ({ path: f.webkitRelativePath || f.name, blob: async () => f }));

window.addEventListener('DOMContentLoaded', () => {
  // A clicked button keeps the focus, and then the space bar would click it again.
  document.addEventListener('click', (e) => e.target.closest('button')?.blur());
  $('random').onclick = () => randomize();
  $('png').onclick = () => savePNG();
  $('json').onclick = () => saveCombo();
  $('grid').onclick = () => saveGrid();
  // Typing a layer name or choosing a kit with the keyboard must not move the pieces.
  for (const id of ['layerName', 'sampleKit']) $(id).addEventListener('keydown', (e) => e.stopPropagation());
  $('sampleKit').onchange = async (e) => {
    await loadSampleKit();
    randomize();
    e.target.blur(); // or the arrow keys would change the kit instead of the pieces
  };
  $('zipFile').onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const zip = await JSZip.loadAsync(file);
      const files = Object.values(zip.files).filter((z) => !z.dir).map((z) => ({ path: z.name, blob: () => z.async('blob') }));
      await useFiles(files, file.name);
    } catch (err) {
      setStatus(`${file.name}: non riesco ad aprirlo come zip (${err.message}).`, true);
    }
    e.target.value = '';
  };
  $('folder').onchange = async (e) => {
    const files = fromInput(e.target);
    await useFiles(files, files[0]?.path.split('/')[0] ?? 'cartella');
    e.target.value = '';
  };
  $('layerFiles').onchange = async (e) => {
    const name = $('layerName').value.trim();
    if (!name) setStatus('Scrivi prima il nome del livello, per esempio 4-naso, poi scegli i file.', true);
    else await useFiles(fromInput(e.target), `${e.target.files.length} file nel livello ${name}`, name);
    e.target.value = '';
  };
});
