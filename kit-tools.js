// Service code for Emoji Kit: loading pieces (sample kit, zip, folder, one category),
// the category panel, the buttons, and recolouring. Students do not need to touch this file.
// It talks to sketch.js through its globals: CATEGORIES, kit, combo, selected,
// nextPiece(), randomize(), savePNG(), saveCombo(), saveGrid().

const BOARD = 1000; // SVGs are rasterised at this size, the board of the README convention
const $ = (id) => document.getElementById(id);

function setStatus(text, isError = false) {
  $('status').textContent = text;
  $('status').classList.toggle('error', isError);
}

// The sample kit comes as data (kits/comic-sans/kit.js), so it also loads from file://.
async function loadStarterKit() {
  $('catSelect').innerHTML = CATEGORIES.map((c) => `<option>${c}</option>`).join('');
  const starter = window.STARTER_KIT;
  if (!starter) return setStatus('Kit di esempio non trovato: manca kits/comic-sans/kit.js', true);
  const files = [];
  for (const [cat, pieces] of Object.entries(starter.pieces)) {
    for (const p of pieces) files.push({ path: `${cat}/${p.name}.svg`, blob: async () => new Blob([p.svg]) });
  }
  await useFiles(files, null, `kit di esempio «${starter.name}»`);
}

// files: [{ path: 'occhi/tondi.svg', blob: async () => Blob }]. The category is the folder
// named like one of CATEGORIES anywhere in the path, unless onlyCat forces it.
async function useFiles(files, onlyCat, label) {
  const groups = {};
  for (const f of files) {
    const parts = f.path.split('/');
    const file = parts.pop();
    const folders = parts.map((p) => p.toLowerCase());
    if (!/\.(svg|png)$/i.test(file) || file.startsWith('.') || folders.includes('__macosx')) continue;
    const cat = onlyCat || CATEGORIES.find((c) => folders.includes(c));
    if (cat) (groups[cat] ||= []).push({ ...f, file });
  }
  const cats = Object.keys(groups);
  if (!cats.length) {
    const want = onlyCat ? 'file .svg o .png' : `cartelle ${CATEGORIES.map((c) => c + '/').join(' ')} con file .svg o .png`;
    return setStatus(`${label}: non ho trovato ${want}.`, true);
  }
  const skipped = [];
  for (const cat of cats) {
    const pieces = [];
    for (const f of groups[cat]) {
      try {
        pieces.push({ name: f.file.replace(/\.\w+$/, ''), img: await toImage(await f.blob(), f.file) });
      } catch (err) {
        skipped.push(f.file);
      }
    }
    if (!pieces.length) continue;
    kit[cat] = pieces.sort((a, b) => a.name.localeCompare(b.name, 'it', { numeric: true }));
    combo[cat] = 0;
  }
  updatePanel();
  const counts = CATEGORIES.map((c) => `${c} ${kit[c]?.length ?? 0}`).join(' · ');
  setStatus(`Caricato: ${label}. Pezzi: ${counts}.` + (skipped.length ? ` Non letti: ${skipped.join(', ')}.` : ''), skipped.length > 0);
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

// One row per category: arrow left, category and piece name, arrow right.
function updatePanel() {
  const panel = $('panel');
  panel.innerHTML = '';
  CATEGORIES.forEach((cat, i) => {
    const n = kit[cat]?.length ?? 0;
    const name = n ? (nameOf(cat) ?? 'nessuno') : 'vuota';
    const row = document.createElement('div');
    row.className = 'row' + (i === selected ? ' selected' : '');
    row.dataset.cat = cat;
    row.innerHTML = `<button class="arrow" aria-label="${cat}: pezzo prima">‹</button>
      <span class="label"><span class="cat">${cat}</span><span class="name">${name}</span></span>
      <span class="count">${n ? combo[cat] + 1 + '/' + n : ''}</span>
      <button class="arrow" aria-label="${cat}: pezzo dopo">›</button>`;
    const [prev, next] = row.querySelectorAll('button');
    prev.onclick = () => nextPiece(cat, -1);
    next.onclick = () => nextPiece(cat, 1);
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
  $('zipFile').onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const zip = await JSZip.loadAsync(file);
      const files = Object.values(zip.files).filter((z) => !z.dir).map((z) => ({ path: z.name, blob: () => z.async('blob') }));
      await useFiles(files, null, file.name);
    } catch (err) {
      setStatus(`${file.name}: non riesco ad aprirlo come zip (${err.message}).`, true);
    }
    e.target.value = '';
  };
  $('folder').onchange = async (e) => {
    const files = fromInput(e.target);
    await useFiles(files, null, files[0]?.path.split('/')[0] ?? 'cartella');
    e.target.value = '';
  };
  $('catFiles').onchange = async (e) => {
    const cat = $('catSelect').value;
    await useFiles(fromInput(e.target), cat, `${e.target.files.length} file in ${cat}`);
    e.target.value = '';
  };
});
