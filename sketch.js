// EMOJI KIT - TYPE&EMOJI, NABA, giorno 2
//
// Un'emoji è una pila di pezzi, uno per categoria, come nei generatori di NFT a tratti.
// I pezzi sono quelli disegnati il giorno 1 con i glifi del vostro carattere: si caricano
// dalla pagina (uno zip, una cartella o una categoria alla volta, vedi il README).
//
// Questo è il file da modificare. Il codice di servizio (caricare i pezzi, il pannello,
// i pulsanti) sta in kit-tools.js e non serve toccarlo.
// I punti per il pomeriggio sono tre, segnati così: ===== COLORI =====, ===== REGOLE =====
// e ===== ANIMAZIONI =====. Ognuno ha esempi pronti: basta togliere i // davanti.

// Le categorie, dal basso verso l'alto: la prima si disegna sotto a tutte le altre.
const CATEGORIES = ['faccia', 'occhi', 'sopracciglia', 'bocca', 'accessori'];
// Le categorie che possono anche restare vuote ("nessuno").
const OPTIONAL = ['accessori'];

let kit = {};     // i pezzi caricati, per categoria: kit.occhi = [{ name: 'tondi', img }, ...]
let combo = {};   // l'emoji di adesso: per ogni categoria il numero del pezzo (-1 = nessuno)
let selected = 0; // la categoria scelta con le frecce su e giù

async function setup() {
  createCanvas(600, 600).parent('stage');
  await loadStarterKit(); // il kit di esempio, kits/comic-sans
  randomize();
}

function draw() {
  drawEmoji(window, combo, width, frameCount); // window = la tela della pagina
}

// ===== COLORI =====
const PAPER = '#f4efe4'; // il fondo dell'emoji

// Di che colore si disegna un pezzo. null = com'è disegnato nel file.
function inkOf(cat, c) {
  // Esempio 1: gli occhi sono sempre rossi.
  // if (cat === 'occhi') return '#d1495b';

  // Esempio 2: ogni faccia ha il suo colore, e lo dà a tutta l'emoji.
  // const colors = { tonda: '#2e86ab', ovale: '#d1495b', parentesi: '#3b8b5a' };
  // return colors[nameOf('faccia', c)];

  return null;
}

// ===== REGOLE =====
// Il Random pesca un pezzo a caso per categoria, poi chiede qui se la combinazione va bene:
// true = va bene, false = si rifà. Una combinazione rara è una che si rifà quasi sempre.
function allowed(c) {
  // Esempio 1: gli occhi chiusi non escono mai con la lacrima.
  // if (nameOf('occhi', c) === 'chiusi' && nameOf('accessori', c) === 'lacrima') return false;

  // Esempio 2: gli occhi a croce sono rari: li tiene una volta su dieci.
  // if (nameOf('occhi', c) === 'croce' && random() > 0.1) return false;

  return true;
}

// Disegna la combinazione c su g (la tela della pagina, o una tela nascosta per l'export),
// in un quadrato grande size. t è il tempo in fotogrammi: 0 negli export, che restano fermi.
function drawEmoji(g, c, size, t = 0) {
  g.noStroke();
  g.fill(PAPER);
  g.rect(0, 0, size, size);
  for (const cat of CATEGORIES) {
    const piece = kit[cat]?.[c[cat]];
    if (!piece) continue; // categoria vuota, o "nessuno"

    // ===== ANIMAZIONI =====
    // Prima di disegnare un pezzo lo si può nascondere, spostare, ruotare, ingrandire.
    // Esempio 1: gli occhi sbattono: ogni 150 fotogrammi spariscono per 8.
    // if (cat === 'occhi' && t % 150 > 142) continue;
    g.push();
    // Esempio 2: la bocca respira, intorno al suo centro (0.65 = la sua altezza sulla tavola).
    // if (cat === 'bocca') { g.translate(size / 2, size * 0.65); g.scale(1 + 0.06 * sin(t * 0.08)); g.translate(-size / 2, -size * 0.65); }
    // Esempio 3: gli accessori dondolano su e giù.
    // if (cat === 'accessori') g.translate(0, size * 0.015 * sin(t * 0.1));

    const ink = inkOf(cat, c);
    g.image(ink ? inked(piece.img, ink) : piece.img, 0, 0, size, size);
    g.pop();
  }
}

// Il nome del pezzo scelto in una categoria (per esempio 'tondi'), o null se non c'è.
function nameOf(cat, c = combo) {
  return kit[cat]?.[c[cat]]?.name ?? null;
}

// Il primo numero possibile in una categoria: -1 ("nessuno") se è facoltativa.
function firstIndex(cat) {
  return OPTIONAL.includes(cat) ? -1 : 0;
}

// Un pezzo a caso per categoria, finché le REGOLE non dicono che va bene.
function randomCombo() {
  for (let tries = 0; tries < 1000; tries++) {
    const c = {};
    for (const cat of CATEGORIES) c[cat] = floor(random(firstIndex(cat), kit[cat]?.length ?? 0));
    if (allowed(c)) return c;
  }
  return { ...combo }; // nessuna combinazione permessa: le regole sono troppo strette
}

function randomize() {
  combo = randomCombo();
  updatePanel();
}

// Il pezzo dopo (dir = 1) o prima (dir = -1) in una categoria; in fondo si ricomincia.
function nextPiece(cat, dir) {
  const first = firstIndex(cat);
  const count = (kit[cat]?.length ?? 0) - first;
  if (count <= 0) return;
  combo[cat] = first + (combo[cat] - first + dir + count) % count;
  updatePanel();
}

// Tastiera: su e giù scelgono la categoria, sinistra e destra cambiano pezzo, spazio = Random.
function keyPressed() {
  const n = CATEGORIES.length;
  if (key === 'ArrowUp') selected = (selected + n - 1) % n;
  else if (key === 'ArrowDown') selected = (selected + 1) % n;
  else if (key === 'ArrowLeft') nextPiece(CATEGORIES[selected], -1);
  else if (key === 'ArrowRight') nextPiece(CATEGORIES[selected], 1);
  else if (key === ' ') randomize();
  else return;
  updatePanel();
  return false; // la pagina non scorre
}

// L'emoji di adesso in PNG, su una tavola da 1000 x 1000.
function savePNG() {
  const g = createGraphics(1000, 1000);
  g.pixelDensity(1);
  drawEmoji(g, combo, 1000);
  save(g, 'emoji.png');
  g.remove();
}

// Quali pezzi formano l'emoji di adesso, in un .json.
function saveCombo() {
  const names = {};
  for (const cat of CATEGORIES) names[cat] = nameOf(cat);
  saveJSON(names, 'emoji.json');
}

// La tavola per il libretto: 100 combinazioni casuali, 10 per riga, con le stesse REGOLE.
function saveGrid() {
  const cell = 200;
  const g = createGraphics(cell * 10, cell * 10);
  g.pixelDensity(1);
  for (let i = 0; i < 100; i++) {
    g.push();
    g.translate((i % 10) * cell, floor(i / 10) * cell);
    drawEmoji(g, randomCombo(), cell);
    g.pop();
  }
  save(g, 'griglia.png');
  g.remove();
}
