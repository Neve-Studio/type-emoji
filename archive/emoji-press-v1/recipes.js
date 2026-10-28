// Emoji Press recipes: the day-1 subset as editable text, and the seed that
// invents new faces from the same parts. Recipe words are listed in core.js API.

const DEFAULT_RECIPES = {
  sorriso: `testa();\nocchi('punti');\nbocca('sorriso');`,
  risata: `testa();\nocchi('chiusi');\nbocca('aperta');`,
  triste: `testa();\nocchi('punti');\nbocca('triste');`,
  occhiolino: `testa();\nocchi('occhiolino');\nbocca('sorriso');`,
  sorpreso: `testa();\nocchi('grandi');\nbocca('o');`,
  arrabbiato: `testa();\nocchi('punti', 1, -0.04);\nsopracciglia('arrabbiate');\nbocca('smorfia');`,
  neutro: `testa();\nocchi('punti');\nbocca('piatta');`,
  occhiali: `testa();\nocchi('lenti');\nbocca('sorriso', 0.75);`,
  casa: `rettangolo(0, 0.13, 0.6, 0.54);\nlinea([-0.38, -0.12], [0, -0.42], [0.38, -0.12]);\nporta(0, 0.4);`,
  palazzo: `rettangolo(0, 0.02, 0.48, 0.8);\nfinestre(2, 4, 0.18, 0.48, 0.02);`,
  grattacielo: `rettangolo(0, 0.07, 0.3, 0.7);\nlinea([0, -0.28], [0, -0.44]);\nfor (const y of [-0.12, 0.02, 0.16, 0.3]) linea([-0.06, y], [0.06, y]);`,
  negozio: `rettangolo(0, 0.16, 0.68, 0.48);\nlinea([-0.38, -0.22], [0.38, -0.22]);\ntenda(-0.38, 0.38, -0.22, -0.1, 4);\nporta(0, 0.4, 0.14, 0.18);`,
  gatto: `tondo(0, 0.08, 0.36, 0.3);\nlinea([-0.3, -0.1], [-0.25, -0.4], [-0.08, -0.22]);\nlinea([0.3, -0.1], [0.25, -0.4], [0.08, -0.22]);\nocchi('punti', 0.9, 0.02);\narco(-0.04, 0.14, 0.04, 0.04, 0, 180); arco(0.04, 0.14, 0.04, 0.04, 0, 180);\nlinea([-0.14, 0.12], [-0.44, 0.08]); linea([0.14, 0.12], [0.44, 0.08]);`,
  pesce: `tondo(-0.06, 0, 0.3, 0.2);\npoligono([0.24, 0], [0.42, -0.16], [0.42, 0.16]);\npunto(-0.2, -0.04, 0.035);\narco(0.02, 0, 0.06, 0.12, -60, 60);`,
};

// Compile a recipe body into a function of the API words; a syntax error is returned, not thrown.
function compileRecipe(src) {
  try {
    return { fn: new Function(...API_NAMES, src) };
  } catch (e) {
    return { fn: null, error: e.message };
  }
}

// 14 new faces from one seed: same parts, new combinations, same number -> same faces.
function newFaces(seed, count = 14) {
  const r = mulberry32(seed * 7919 + 13);
  const choice = a => a[Math.floor(r() * a.length)];
  const eyes = Object.keys(EYES), mouths = Object.keys(MOUTHS), brows = Object.keys(BROWS);
  const seen = new Set(), out = [];
  for (let tries = 0; out.length < count && tries < 500; tries++) {
    const e = choice(eyes), m = choice(mouths), b = e !== 'lenti' && r() < 0.35 ? choice(brows) : null;
    const amp = (6 + Math.floor(r() * 5)) / 10;
    const key = `${e}|${m}|${b}`;
    if (seen.has(key)) continue;
    seen.add(key);
    // brows need the eyes a little lower, as in the 'arrabbiato' recipe
    const lines = ['testa();', b ? `occhi('${e}', 1, -0.04);` : `occhi('${e}');`];
    if (b) lines.push(`sopracciglia('${b}');`);
    lines.push(m === 'o' ? `bocca('o');` : `bocca('${m}', ${amp});`);
    out.push(lines.join('\n'));
  }
  return out;
}
