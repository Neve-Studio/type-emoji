// EMOJI KIT - TYPE&EMOJI, NABA, giorno 2
//
// Un'emoji è una pila di pezzi, uno per livello, come nei generatori di NFT a tratti.
// I livelli sono le cartelle del kit (faccia, occhi... o carrozzeria, ruote...), in ordine
// col numero davanti al nome: '1-faccia' sta sotto a '2-occhi'. I pezzi sono quelli disegnati
// il giorno 1 con i glifi del vostro carattere: si caricano dalla pagina (vedi il README).
//
// Questo è il file da modificare. Il codice di servizio (caricare i pezzi, il pannello,
// i pulsanti) sta in kit-tools.js e non serve toccarlo.
// I punti per il pomeriggio sono tre, segnati così: ===== COLORI =====, ===== REGOLE =====
// e ===== ANIMAZIONI =====. Ognuno ha esempi pronti: basta togliere i // davanti.

let layers = [];  // i nomi dei livelli, dal basso verso l'alto: li riempie il kit caricato
let kit = {};     // i pezzi caricati, per livello: kit.occhi = [{ name: 'tondi', img }, ...]
let combo = {};   // l'emoji di adesso: per ogni livello il numero del pezzo (-1 = nessuno)
let selected = 0; // il livello scelto con le frecce su e giù

async function setup() {
  createCanvas(600, 600).parent('stage');
  await loadSampleKit(); // il kit di esempio scelto nella pagina: all'inizio le faccine
  randomize();
}

function draw() {
  drawEmoji(window, combo, width, frameCount); // window = la tela della pagina
}

// ===== COLORI =====
const PAPER = '#f4efe4'; // il fondo dell'emoji

// Di che colore si disegna un pezzo del livello layer. null = com'è disegnato nel file.
function inkOf(layer, c) {
  // Esempio 1: gli occhi sono sempre rossi.
  // if (layer === 'occhi') return '#d1495b';

  // Esempio 2: ogni faccia ha il suo colore, e lo dà a tutta l'emoji.
  // const colors = { tonda: '#2e86ab', ovale: '#d1495b', parentesi: '#3b8b5a' };
  // return colors[nameOf('faccia', c)];

  return null;
}

// ===== REGOLE =====
// Il Random pesca un pezzo a caso per livello, poi chiede qui se la combinazione va bene:
// true = va bene, false = si rifà. Una combinazione rara è una che si rifà quasi sempre.
// Le regole sui livelli che il kit non ha non fanno niente: nameOf dà null.
function allowed(c) {
  // Esempio 1: gli occhi chiusi non escono mai con la lacrima.
  // if (nameOf('occhi', c) === 'chiusi' && nameOf('accessori', c) === 'lacrima') return false;

  // Esempio 2: gli occhi a croce sono rari: li tiene una volta su dieci.
  // if (nameOf('occhi', c) === 'croce' && random() > 0.1) return false;

  // Esempio 3: l'auto ha sempre le ruote (ogni livello, a parte il primo, può uscire "nessuno").
  // if (kit.ruote && nameOf('ruote', c) === null) return false;

  return true;
}

// Disegna la combinazione c su g (la tela della pagina, o una tela nascosta per l'export),
// in un quadrato grande size. t è il tempo in fotogrammi: 0 negli export, che restano fermi.
function drawEmoji(g, c, size, t = 0) {
  g.noStroke();
  g.fill(PAPER);
  g.rect(0, 0, size, size);
  for (const layer of layers) {
    const piece = kit[layer][c[layer]];
    if (!piece) continue; // "nessuno"

    // ===== ANIMAZIONI =====
    // Prima di disegnare un pezzo lo si può nascondere, spostare, ruotare, ingrandire.
    // Esempio 1: gli occhi sbattono: ogni 150 fotogrammi spariscono per 8.
    // if (layer === 'occhi' && t % 150 > 142) continue;
    g.push();
    // Esempio 2: la bocca respira, intorno al suo centro (0.65 = la sua altezza sulla tavola).
    // if (layer === 'bocca') { g.translate(size / 2, size * 0.65); g.scale(1 + 0.06 * sin(t * 0.08)); g.translate(-size / 2, -size * 0.65); }
    // Esempio 3: gli accessori dondolano su e giù.
    // if (layer === 'accessori') g.translate(0, size * 0.015 * sin(t * 0.1));
    // Esempio 4: l'auto sobbalza sulle ruote ferme.
    // if (kit.ruote && layer !== 'ruote') g.translate(0, size * 0.006 * sin(t * 0.5));

    const ink = inkOf(layer, c);
    g.image(ink ? inked(piece.img, ink) : piece.img, 0, 0, size, size);
    g.pop();
  }
}

// Il nome del pezzo scelto in un livello (per esempio 'tondi'), o null se è "nessuno" o il livello non c'è.
function nameOf(layer, c = combo) {
  return kit[layer]?.[c[layer]]?.name ?? null;
}

// Il primo numero che il Random può pescare: il livello più basso non resta mai vuoto,
// gli altri possono uscire -1, "nessuno".
function firstIndex(layer) {
  return layer === layers[0] ? 0 : -1;
}

// Un pezzo a caso per livello, finché le REGOLE non dicono che va bene.
function randomCombo() {
  for (let tries = 0; tries < 1000; tries++) {
    const c = {};
    for (const layer of layers) c[layer] = floor(random(firstIndex(layer), kit[layer].length));
    if (allowed(c)) return c;
  }
  return { ...combo }; // nessuna combinazione permessa: le regole sono troppo strette
}

function randomize() {
  combo = randomCombo();
  updatePanel();
}

// Il pezzo dopo (dir = 1) o prima (dir = -1) in un livello, passando da "nessuno" (-1);
// in fondo si ricomincia.
function nextPiece(layer, dir) {
  if (!kit[layer]) return;
  const count = kit[layer].length + 1;
  combo[layer] = (combo[layer] + 1 + dir + count) % count - 1;
  updatePanel();
}

// Tastiera: su e giù scelgono il livello, sinistra e destra cambiano pezzo, spazio = Random.
function keyPressed() {
  const n = max(layers.length, 1);
  if (key === 'ArrowUp') selected = (selected + n - 1) % n;
  else if (key === 'ArrowDown') selected = (selected + 1) % n;
  else if (key === 'ArrowLeft') nextPiece(layers[selected], -1);
  else if (key === 'ArrowRight') nextPiece(layers[selected], 1);
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
  for (const layer of layers) names[layer] = nameOf(layer);
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
