import math, random, sys, os
from PIL import Image, ImageDraw, ImageFont

OUT = sys.argv[1]
FONT = r"C:/Windows/Fonts/comic.ttf"
LABEL = r"C:/Windows/Fonts/segoeui.ttf"
SS = 3


def black_bbox(im):
    return im.point(lambda v: 255 if v < 128 else 0).getbbox()


def measure():
    f = ImageFont.truetype(FONT, 400)
    def render(ch):
        im = Image.new('L', (700, 700), 255)
        ImageDraw.Draw(im).text((150, 50), ch, font=f, fill=0)
        return im
    h = render('H'); bb = black_bbox(h); cap = bb[3] - bb[1]
    l = render('l'); bb = black_bbox(l); y = (bb[1] + bb[3]) // 2
    stem = sum(1 for x in range(700) if l.getpixel((x, y)) < 128)
    o = render('o'); bb = black_bbox(o)
    ym = (bb[1] + bb[3]) // 2; xm = (bb[0] + bb[2]) // 2
    def run(coords):
        n = 0; started = False
        for c in coords:
            if o.getpixel(c) < 128: n += 1; started = True
            elif started: break
        return n
    side = run([(x, ym) for x in range(bb[0], bb[2])])
    top = max(1, run([(xm, y) for y in range(bb[1], bb[3])]))
    return {'cap': cap, 'stem': stem, 'stem_cap': stem / cap, 'o_side': side, 'o_top': top, 'contrast': side / top}


def jit(pts, amp, rng):
    if amp <= 0: return pts
    n = len(pts); ph = [rng.uniform(0, 6.28) for _ in range(4)]; k = [rng.randint(1, 3), rng.randint(4, 7)]
    out = []
    for i, (x, y) in enumerate(pts):
        u = i / n
        out.append((x + amp * (0.7 * math.sin(6.283 * k[0] * u + ph[0]) + 0.3 * math.sin(6.283 * k[1] * u + ph[1])),
                    y + amp * (0.7 * math.sin(6.283 * k[0] * u + ph[2]) + 0.3 * math.sin(6.283 * k[1] * u + ph[3]))))
    return out


def se(cx, cy, rx, ry, n, steps=90):
    pts = []
    for i in range(steps):
        t = 6.283185 * i / steps; c, s = math.cos(t), math.sin(t)
        pts.append((cx + rx * math.copysign(abs(c) ** (2 / n), c), cy + ry * math.copysign(abs(s) ** (2 / n), s)))
    return pts


def arc(cx, cy, rx, ry, a0, a1, steps=40):
    return [(cx + rx * math.cos(math.radians(a0 + (a1 - a0) * i / steps)), cy + ry * math.sin(math.radians(a0 + (a1 - a0) * i / steps))) for i in range(steps + 1)]


class Prim:
    def __init__(self, w, wob, n, tilt):
        self.w, self.wob, self.n, self.tilt = w, wob, n, tilt


class Pen:
    def __init__(self, d, cx, cy, size, p, rng):
        self.d, self.cx, self.cy, self.size, self.p, self.rng = d, cx, cy, size, p, rng
    def pt(self, x, y):
        a = math.radians(self.p.tilt)
        return (self.cx + (x * math.cos(a) - y * math.sin(a)) * self.size, self.cy + (x * math.sin(a) + y * math.cos(a)) * self.size)
    def stroke(self, pts, closed=False):
        P = jit([self.pt(x, y) for x, y in pts], self.p.wob * self.size, self.rng)
        if closed: P = P + [P[0]]
        w = max(1, int(self.p.w * self.size))
        self.d.line(P, fill=0, width=w, joint='curve')
        if not closed:
            r = w / 2
            for x, y in (P[0], P[-1]): self.d.ellipse((x - r, y - r, x + r, y + r), fill=0)
    def fill(self, pts):
        P = jit([self.pt(x, y) for x, y in pts], self.p.wob * self.size * 0.5, self.rng)
        self.d.polygon(P, fill=0)

# --- parts: the shared primitives, every emoji is built only from these ---
def head(q): q.stroke(se(0, 0, 0.42, 0.42, q.p.n), True)
def eyes_dots(q, r=0.045, y=-0.08):
    for x in (-0.15, 0.15): q.fill(se(x, y, r, r * 1.25, q.p.n))
def eyes_closed(q):
    for x in (-0.15, 0.15): q.stroke(arc(x, -0.04, 0.07, 0.06, 200, 340))
def eyes_wink(q):
    q.fill(se(-0.15, -0.08, 0.045, 0.056, q.p.n)); q.stroke(arc(0.15, -0.06, 0.06, 0.03, 200, 340))
def eyes_lenses(q):
    for x in (-0.14, 0.14): q.fill(se(x, -0.07, 0.11, 0.08, q.p.n * 1.5))
    q.stroke([(-0.04, -0.1), (0.04, -0.1)])
def eyes_big(q): eyes_dots(q, 0.06)
def mouth_smile(q): q.stroke(arc(0, 0.05, 0.2, 0.15, 20, 160))
def mouth_sad(q): q.stroke(arc(0, 0.28, 0.17, 0.12, 200, 340))
def mouth_open(q): q.stroke(arc(0, 0.06, 0.2, 0.2, 0, 180), True)
def mouth_o(q): q.stroke(se(0, 0.17, 0.07, 0.09, q.p.n), True)
def mouth_flat(q): q.stroke([(-0.15, 0.16), (0.15, 0.16)])
def brows(q):
    q.stroke([(-0.25, -0.22), (-0.08, -0.15)]); q.stroke([(0.25, -0.22), (0.08, -0.15)])

# --- the subset: 8 faces, 4 buildings, 2 animals ---
def sorriso(q): head(q); eyes_dots(q); mouth_smile(q)
def risata(q): head(q); eyes_closed(q); mouth_open(q)
def triste(q): head(q); eyes_dots(q); mouth_sad(q)
def occhiolino(q): head(q); eyes_wink(q); mouth_smile(q)
def sorpreso(q): head(q); eyes_big(q); mouth_o(q)
def arrabbiato(q): head(q); eyes_dots(q, y=-0.04); brows(q); q.stroke(arc(0, 0.27, 0.12, 0.07, 200, 340))
def neutro(q): head(q); eyes_dots(q); mouth_flat(q)
def occhiali(q): head(q); eyes_lenses(q); q.stroke(arc(0, 0.08, 0.15, 0.11, 30, 150))
def casa(q):
    hn = q.p.n * 2.2
    q.stroke(se(0, 0.13, 0.3, 0.27, hn), True)
    q.stroke([(-0.38, -0.12), (0, -0.42), (0.38, -0.12)])
    q.stroke([(-0.07, 0.4), (-0.07, 0.2), (0.07, 0.2), (0.07, 0.4)])
def palazzo(q):
    hn = q.p.n * 2.2
    q.stroke(se(0, 0.02, 0.24, 0.4, hn), True)
    for c in (-0.09, 0.09):
        for r in (-0.24, -0.08, 0.08, 0.24): q.fill(se(c, r, 0.04, 0.045, hn))
def grattacielo(q):
    hn = q.p.n * 2.2
    q.stroke(se(0, 0.07, 0.15, 0.35, hn), True)
    q.stroke([(0, -0.28), (0, -0.44)])
    for r in (-0.12, 0.02, 0.16, 0.3): q.stroke([(-0.06, r), (0.06, r)])
def negozio(q):
    hn = q.p.n * 2.2
    q.stroke(se(0, 0.16, 0.34, 0.24, hn), True)
    q.stroke([(-0.38, -0.22), (0.38, -0.22)])
    sc = []
    for i in range(4): sc += arc(-0.38 + 0.19 * i + 0.095, -0.1, 0.095, 0.07, 180, 0, 16)
    q.stroke([(-0.38, -0.22)] + sc + [(0.38, -0.22)])
    q.stroke([(-0.07, 0.4), (-0.07, 0.22), (0.07, 0.22), (0.07, 0.4)])
def gatto(q):
    q.stroke(se(0, 0.08, 0.36, 0.3, q.p.n), True)
    q.stroke([(-0.3, -0.1), (-0.25, -0.4), (-0.08, -0.22)]); q.stroke([(0.3, -0.1), (0.25, -0.4), (0.08, -0.22)])
    eyes_dots(q, 0.04, 0.02)
    q.stroke(arc(-0.04, 0.14, 0.04, 0.04, 0, 180, 12)); q.stroke(arc(0.04, 0.14, 0.04, 0.04, 0, 180, 12))
    for s in (-1, 1): q.stroke([(s * 0.14, 0.12), (s * 0.44, 0.08)])
def pesce(q):
    q.stroke(se(-0.06, 0, 0.3, 0.2, q.p.n), True)
    q.stroke([(0.24, 0), (0.42, -0.16), (0.42, 0.16)], True)
    q.fill(se(-0.2, -0.04, 0.035, 0.044, q.p.n))
    q.stroke(arc(0.02, 0, 0.06, 0.12, -60, 60, 12))

SUBSET = [sorriso, risata, triste, occhiolino, sorpreso, arrabbiato, neutro, occhiali, casa, palazzo, grattacielo, negozio, gatto, pesce]
EYES = [eyes_dots, eyes_closed, eyes_wink, eyes_lenses, eyes_big]
MOUTHS = [mouth_smile, mouth_sad, mouth_open, mouth_o, mouth_flat]


def new_face(seed):
    r = random.Random(seed)
    e, m, b = r.choice(EYES), r.choice(MOUTHS), r.random() < 0.35
    def f(q):
        head(q); e(q); m(q)
        if b and e is not eyes_lenses: brows(q)
    return f


def main():
    m = measure()
    base_w = m['stem_cap'] * 0.62  # stroke relative to the emoji box: head height ~ cap height x 0.84
    rows = [
        ('A. Comic Sans misurato: tratto %.3f del box, contrasto %.2f (quasi 0), mano lieve, tondi un po\' squadrati' % (base_w, m['contrast']), Prim(base_w, 0.006, 2.3, 0), SUBSET),
        ('B. stesso sistema, tratto x0,45', Prim(base_w * 0.45, 0.006, 2.3, 0), SUBSET),
        ('C. senza mano: wobble 0, cerchi perfetti (n=2): smette di essere Comic Sans', Prim(base_w, 0.0, 2.0, 0), SUBSET),
        ('D. piu\' Comic: tratto x1,4, mano forte, inclinato -4 gradi', Prim(base_w * 1.4, 0.016, 2.3, -4), SUBSET),
        ('E. faccine nuove dalla stessa famiglia, seme 1-14 (ricette mai disegnate)', Prim(base_w, 0.006, 2.3, 0), [new_face(s) for s in range(1, 15)]),
    ]
    cell, lab, head_h = 130, 34, 150
    W, H = len(SUBSET) * cell, head_h + len(rows) * (cell + lab)
    im = Image.new('L', (W * SS, H * SS), 255); d = ImageDraw.Draw(im)
    fc = ImageFont.truetype(FONT, 70 * SS); fl = ImageFont.truetype(LABEL, 15 * SS)
    d.text((20 * SS, 25 * SS), 'Aa Hamburgefonstiv', font=fc, fill=0)
    d.text((20 * SS, 120 * SS), 'Comic Sans: stelo / altezza maiuscole = %.3f, contrasto o (lato/sopra) = %.2f' % (m['stem_cap'], m['contrast']), font=fl, fill=0)
    for ri, (name, p, items) in enumerate(rows):
        y0 = head_h + ri * (cell + lab)
        d.text((10 * SS, (y0 + 6) * SS), name, font=fl, fill=0)
        rng = random.Random(7 + ri)
        for i, fn in enumerate(items):
            fn(Pen(d, (i * cell + cell / 2) * SS, (y0 + lab + cell / 2) * SS, cell * 0.92 * SS, p, rng))
    im = im.resize((W, H), Image.LANCZOS)
    im.save(OUT)
    print(m); print('base_w', round(base_w, 4)); print(OUT)


main()
