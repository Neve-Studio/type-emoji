"""End-to-end check of Emoji Kit in a real headless browser (Edge via Playwright).

Opens the page from file:// and from a static server. With the faces kit: cycles pieces with
the arrows (through "nessuno") and the keyboard, presses Random 3000 times (the lowest layer is
never "nessuno"), exports PNG, JSON and the grid of 100. Switches to the car kit with the
selector. On an empty kit loads an old zip with the five unnumbered folders, then a zip whose
numbered layers are not in alphabetical order (checked by pixels). Back on the faces, adds a
"4-naso" layer from loose files with the name field and replaces the eyes with a "2-occhi"
folder. Then applies afternoon examples of sketch.js to a copy of the project. No console
errors allowed. Saves dark screenshots in docs/screens/.

    python test/kit_test.py

With a URL it runs the same checks on the published page instead and saves 07-online.png:

    python test/kit_test.py --online https://neve-studio.github.io/type-emoji/
"""
import base64
import functools
import http.server
import io
import json
import re
import shutil
import sys
import tempfile
import threading
import zipfile
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
KIT = ROOT / "kits" / "comic-sans"
SCREENS = ROOT / "docs" / "screens"
FACES = {"faccia": 3, "occhi": 6, "sopracciglia": 3, "bocca": 5, "accessori": 4}
CAR = {"carrozzeria": 5, "ruote": 5, "finestrini": 5, "fari": 5, "extra": 5}
COMIC = "C:/Windows/Fonts/comic.ttf"


def open_page(ctx, url):
    page = ctx.new_page()
    page.errors = []
    page.on("console", lambda m: m.type in ("error", "warning") and page.errors.append(f"{m.type}: {m.text}"))
    page.on("pageerror", lambda e: page.errors.append(f"pageerror: {e}"))
    page.goto(url)
    wait_rows(page, 5)
    return page


def wait_rows(page, n, ready="kit.accessori?.length"):
    page.wait_for_function(f"() => {ready} && document.querySelectorAll('.row').length === {n}", timeout=20000)
    page.wait_for_timeout(300)


def state(page):
    return page.evaluate("() => ({combo: {...combo}, selected, layers: [...layers], names: layers.map(l => nameOf(l)),"
                         " counts: Object.fromEntries(layers.map(l => [l, kit[l].length])),"
                         " rows: [...document.querySelectorAll('.row .name')].map(e => e.textContent),"
                         " rowLayers: [...document.querySelectorAll('.row .layer')].map(e => e.textContent),"
                         " status: document.getElementById('status').textContent})")


def row(page, layer):
    return page.locator(f'.row[data-layer="{layer}"]')


def status_has(page, text):
    page.wait_for_function(f"() => document.getElementById('status').textContent.includes({json.dumps(text)})", timeout=20000)
    page.wait_for_timeout(200)


def set_combo(page, names):
    """Pick pieces by name ({'occhi': 'tondi', 'accessori': None}); layers not named stay as they are."""
    page.evaluate("""(names) => { for (const [l, n] of Object.entries(names))
        combo[l] = n === null ? -1 : kit[l].findIndex(p => p.name === n); updatePanel(); }""", names)
    page.wait_for_timeout(200)


def canvas(page):
    shot = page.evaluate("() => document.querySelector('#stage canvas').toDataURL('image/png')")
    return Image.open(io.BytesIO(base64.b64decode(shot.split(",")[1]))).convert("RGB")


def png_size(path):
    with Image.open(path) as im:
        return im.size, len(set(im.convert("L").resize((50, 50)).getdata()))


def download(page, button, out):
    with page.expect_download() as d:
        page.click(button)
    path = out / d.value.suggested_filename
    d.value.save_as(path)
    return path


def glyph_png(path, char, xy, size):
    """A transparent 1000x1000 PNG piece: one Comic Sans glyph drawn at xy."""
    im = Image.new("RGBA", (1000, 1000), (0, 0, 0, 0))
    ImageDraw.Draw(im).text(xy, char, font=ImageFont.truetype(COMIC, size), fill=(29, 29, 27, 255), anchor="mm")
    im.save(path)


def make_legacy_zip(folder):
    """The faces kit as it was before free layers (five folders without numbers) under a root
    folder, plus macOS junk, a readme, a transparent PNG piece drawn with comic.ttf, and one
    SVG stripped of width/height like Illustrator's responsive export."""
    kit = folder / "mio-kit"
    shutil.copytree(KIT, kit, ignore=shutil.ignore_patterns("kit.js"))
    for d in kit.iterdir():
        d.rename(kit / d.name.split("-", 1)[1])
    svg = kit / "occhi" / "tondi.svg"
    svg.write_text(re.sub(r' (width|height)="1000"', "", svg.read_text(encoding="utf-8")), encoding="utf-8")
    glyph_png(kit / "accessori" / "asterisco.png", "*", (870, 160), 220)
    (kit / "LEGGIMI.txt").write_text("not a piece", encoding="utf-8")
    zpath = folder / "mio-kit.zip"
    with zipfile.ZipFile(zpath, "w") as z:
        for f in sorted(kit.rglob("*")):
            z.write(f, f.relative_to(folder).as_posix())
        z.writestr("__MACOSX/mio-kit/occhi/._tondi.svg", b"junk")
    return kit, zpath


def make_prefixed_zip(folder):
    """Three numbered layers whose order is not the alphabetical one: 01_zeta (red, whole board)
    under '2 alfa' (green square) under 3-mezzo (blue small square). No root folder."""
    zpath = folder / "strati.zip"
    with zipfile.ZipFile(zpath, "w") as z:
        for layer, colour, box in [("01_zeta", (220, 30, 30), (0, 0, 1000, 1000)),
                                   ("2 alfa", (30, 170, 60), (200, 200, 800, 800)),
                                   ("3-mezzo", (40, 60, 220), (400, 400, 600, 600))]:
            im = Image.new("RGBA", (1000, 1000), (0, 0, 0, 0))
            ImageDraw.Draw(im).rectangle(box, fill=colour + (255,))
            buf = io.BytesIO()
            im.save(buf, "PNG")
            z.writestr(f"{layer}/quadrato.png", buf.getvalue())
    return zpath


def check_random(page, never_empty):
    """3000 Random: every index in range, the lowest layer never "nessuno", the others sometimes."""
    stats = page.evaluate("""() => { const r = {bad: 0, none: {}, closedTear: 0};
        for (let i = 0; i < 3000; i++) { const c = randomCombo();
          for (const l of layers) { if (c[l] < -1 || c[l] >= kit[l].length) r.bad++; if (c[l] === -1) r.none[l] = (r.none[l] || 0) + 1; }
          if (nameOf('occhi', c) === 'chiusi' && nameOf('accessori', c) === 'lacrima') r.closedTear++; }
        return r; }""")
    assert stats["bad"] == 0 and never_empty not in stats["none"], stats
    return stats


def run(page, out, tmp, shots):
    s = state(page)
    assert s["layers"] == list(FACES) and s["counts"] == FACES, s
    assert s["rowLayers"] == list(FACES) and "faccine" in s["status"], s

    # arrows on screen: occhi forward, faccia back; every layer passes through "nessuno" (-1)
    before = s["combo"]
    row(page, "occhi").locator("button").nth(1).click()
    row(page, "faccia").locator("button").nth(0).click()
    s = state(page)
    assert s["combo"]["occhi"] == (before["occhi"] + 2) % 7 - 1, (before, s)
    assert s["combo"]["faccia"] == (before["faccia"] + 4) % 4 - 1, (before, s)
    assert s["rows"][1] == (s["names"][1] or "nessuno"), s
    for layer, n in [("accessori", 4), ("faccia", 3)]:  # the lowest layer too, with the arrows
        seen = set()
        for _ in range(n + 1):
            row(page, layer).locator("button").nth(1).click()
            seen.add(state(page)["rows"][list(FACES).index(layer)])
        assert "nessuno" in seen and len(seen) == n + 1, (layer, seen)
    counts = [e.split("/") for e in page.locator(".row .count").all_inner_texts()]
    assert [int(t) for _, t in counts] == list(FACES.values()), counts

    # clicking a row selects it; keyboard: down three times wraps to sopracciglia, right
    # changes it, left puts it back, up goes to occhi, space randomizes
    assert state(page)["selected"] == 0
    row(page, "accessori").locator(".label").click()
    assert state(page)["selected"] == 4
    page.mouse.click(5, 795)  # focus the page, not a button
    for _ in range(3):
        page.keyboard.press("ArrowDown")
    s = state(page)
    assert s["selected"] == 2, s
    assert "selected" in row(page, "sopracciglia").get_attribute("class")
    page.keyboard.press("ArrowRight")
    s2 = state(page)
    assert s2["combo"]["sopracciglia"] == (s["combo"]["sopracciglia"] + 2) % 4 - 1, (s, s2)
    page.keyboard.press("ArrowLeft")
    assert state(page)["combo"]["sopracciglia"] == s["combo"]["sopracciglia"]
    page.keyboard.press("ArrowUp")
    assert state(page)["selected"] == 1
    combos = set()
    for _ in range(12):
        page.keyboard.press(" ")
        combos.add(json.dumps(state(page)["combo"], sort_keys=True))
    assert len(combos) > 3, combos
    assert page.evaluate("() => window.scrollY") == 0

    # Random button, and 3000 random combos
    page.click("#random")
    stats = check_random(page, "faccia")
    assert all(stats["none"].get(l, 0) > 200 for l in list(FACES)[1:]) and stats["closedTear"] > 20, stats
    set_combo(page, {"faccia": "tonda", "occhi": "felici", "sopracciglia": "onda", "bocca": "risata", "accessori": "lacrima"})
    if shots:
        page.screenshot(path=SCREENS / "01-emoji-grande.png")

    # exports: "nessuno" goes in the JSON as null
    png = download(page, "#png", out)
    size, tones = png_size(png)
    assert png.name == "emoji.png" and size == (1000, 1000) and tones > 2, (png, size, tones)
    set_combo(page, {"sopracciglia": None})
    data = json.loads(download(page, "#json", out).read_text(encoding="utf-8"))
    assert data == {"faccia": "tonda", "occhi": "felici", "sopracciglia": None, "bocca": "risata", "accessori": "lacrima"}, data
    grid = download(page, "#grid", out)
    size, tones = png_size(grid)
    assert size == (2000, 2000) and tones > 2, (size, tones)
    if shots:
        with Image.open(grid) as im:
            im.convert("RGB").resize((1200, 1200), Image.LANCZOS).save(SCREENS / "02-griglia-100.png", optimize=True)

    # the car kit from the selector: five layers of five pieces, arrows and keyboard work
    page.select_option("#sampleKit", "auto-comic-sans")
    wait_rows(page, 5, "kit.carrozzeria?.length")
    s = state(page)
    assert s["layers"] == list(CAR) and s["counts"] == CAR and "auto" in s["status"], s
    assert s["combo"]["carrozzeria"] >= 0, s
    seen = set()
    for _ in range(6):
        row(page, "ruote").locator("button").nth(1).click()
        seen.add(state(page)["rows"][1])
    assert seen == {"tonde", "grandi", "ovali", "chiocciole", "stelle", "nessuno"}, seen
    page.mouse.click(5, 795)  # the ruote row is selected: its arrows were clicked
    before = state(page)["combo"]["ruote"]
    page.keyboard.press("ArrowRight")
    assert state(page)["combo"]["ruote"] == (before + 2) % 6 - 1
    check_random(page, "carrozzeria")
    set_combo(page, {"carrozzeria": "berlina", "ruote": "tonde", "finestrini": "quadrati", "fari": "stella", "extra": "fumo"})
    if shots:
        page.screenshot(path=SCREENS / "08-auto-grande.png")
    grid = download(page, "#grid", out)
    assert png_size(grid)[0] == (2000, 2000)
    if shots:
        with Image.open(grid) as im:
            im.convert("RGB").resize((1200, 1200), Image.LANCZOS).save(SCREENS / "09-griglia-100-auto.png", optimize=True)

    # an empty kit, then an old zip: five folders without numbers keep the faces order
    page.select_option("#sampleKit", "")
    wait_rows(page, 0, "true")
    assert "Kit vuoto" in state(page)["status"]
    kit, zpath = make_legacy_zip(tmp)
    page.set_input_files("#zipFile", str(zpath))
    status_has(page, "mio-kit.zip")
    s = state(page)
    assert s["layers"] == list(FACES) and s["counts"] == {**FACES, "accessori": 5}, s
    sizes = page.evaluate("() => kit.occhi.map(p => [p.name, p.img.width, p.img.height])")
    assert all(w == 1000 and h == 1000 for _, w, h in sizes), sizes
    set_combo(page, {"faccia": "tonda", "occhi": "tondi", "sopracciglia": "dritte", "bocca": "sorriso", "accessori": "asterisco"})
    assert state(page)["names"][4] == "asterisco"
    if shots:
        page.screenshot(path=SCREENS / "04-zip-caricato.png")

    # numbered layers in a non-alphabetical order: zeta under alfa under mezzo, checked by pixels
    page.select_option("#sampleKit", "")
    wait_rows(page, 0, "true")
    page.set_input_files("#zipFile", str(make_prefixed_zip(tmp)))
    status_has(page, "strati.zip")
    s = state(page)
    assert s["layers"] == ["zeta", "alfa", "mezzo"] and s["rowLayers"] == ["zeta", "alfa", "mezzo"], s
    set_combo(page, {"zeta": "quadrato", "alfa": "quadrato", "mezzo": "quadrato"})
    im = canvas(page)
    w = im.width
    px = {k: im.getpixel((int(w * x), int(w * x))) for k, x in [("zeta", 0.1), ("alfa", 0.3), ("mezzo", 0.5)]}
    assert px["zeta"][0] > 180 and px["alfa"][1] > 140 and px["mezzo"][2] > 180, px
    check_random(page, "zeta")

    # back to the faces: a new layer "4-naso" from loose files and the name field
    page.select_option("#sampleKit", "comic-sans")
    wait_rows(page, 5)
    noses = []
    for name, char, xy in [("punta", "v", (500, 560)), ("gancio", "J", (500, 545))]:
        noses.append(tmp / f"{name}.png")
        glyph_png(noses[-1], char, xy, 170)
    page.fill("#layerName", "")
    page.set_input_files("#layerFiles", [str(f) for f in noses])
    assert "nome del livello" in state(page)["status"] and len(state(page)["layers"]) == 5
    page.fill("#layerName", "4-naso")
    page.set_input_files("#layerFiles", [str(f) for f in noses])
    status_has(page, "livello 4-naso")
    s = state(page)
    assert s["layers"] == ["faccia", "occhi", "sopracciglia", "bocca", "naso", "accessori"], s
    assert s["rowLayers"][4] == "naso" and s["counts"]["naso"] == 2, s
    set_combo(page, {"faccia": "tonda", "occhi": "tondi", "sopracciglia": "onda", "bocca": "sorriso", "naso": "gancio", "accessori": None})
    if shots:
        page.screenshot(path=SCREENS / "10-faccina-con-naso.png")

    # a "2-occhi" folder replaces the eyes, keeps the nose
    eyes = tmp / "2-occhi"
    eyes.mkdir()
    for f in ["tondi.svg", "croce.svg"]:
        shutil.copy(KIT / "2-occhi" / f, eyes / f)
    folder = "not tried"
    try:
        page.set_input_files("#folder", str(eyes))
        status_has(page, "Caricato: 2-occhi")
        s = state(page)
        assert s["counts"]["occhi"] == 2 and s["layers"][1] == "occhi" and len(s["layers"]) == 6, s
        page.set_input_files("#folder", str(kit))  # a whole kit folder, the old layout
        status_has(page, "Caricato: mio-kit")
        assert state(page)["counts"] == {**FACES, "accessori": 5, "naso": 2}
        folder = "ok"
    except Exception as e:  # older Playwright cannot set a directory on an input
        folder = f"not tried: {e}"
    assert not page.errors, page.errors
    return {"folder": folder, "random_none_faces": stats["none"]}


def afternoon(ctx, tmp):
    """A copy of the project with afternoon examples switched on: closed eyes never with the
    tear, every face gives its colour to the whole emoji, the car always has wheels (a rule
    that does nothing on the faces, which have no wheels)."""
    proj = tmp / "pomeriggio"
    shutil.copytree(ROOT, proj, ignore=shutil.ignore_patterns(".git", "archive", "docs", "test", "tools"))
    sk = proj / "sketch.js"
    src = sk.read_text(encoding="utf-8")
    for line in ["if (nameOf('occhi', c) === 'chiusi'", "const colors = {", "return colors[", "if (kit.ruote && nameOf('ruote', c)"]:
        assert f"// {line}" in src, line
        src = src.replace(f"// {line}", line)
    sk.write_text(src, encoding="utf-8")
    page = open_page(ctx, (proj / "index.html").as_uri())
    tears = page.evaluate("""() => { let n = 0; for (let i = 0; i < 3000; i++) { const c = randomCombo();
        if (nameOf('occhi', c) === 'chiusi' && nameOf('accessori', c) === 'lacrima') n++; } return n; }""")
    assert tears == 0, tears
    colours = {}
    for face, hexcol in [("tonda", "#2e86ab"), ("ovale", "#d1495b"), ("parentesi", "#3b8b5a")]:
        set_combo(page, {"faccia": face, "occhi": "tondi", "sopracciglia": "dritte", "bocca": "stupita", "accessori": "stupore"})
        rgb = tuple(int(hexcol[i:i + 2], 16) for i in (1, 3, 5))
        px = list(canvas(page).getdata())
        near = lambda c, ref: sum(abs(a - b) for a, b in zip(c, ref)) < 30
        colours[face] = {"ink": sum(near(c, rgb) for c in px), "black": sum(near(c, (29, 29, 27)) for c in px)}
        assert colours[face]["ink"] > 5000 and colours[face]["black"] == 0, (face, colours)
        if face == "ovale":
            page.screenshot(path=SCREENS / "05-pomeriggio-regole-e-colori.png")
    page.select_option("#sampleKit", "auto-comic-sans")
    wait_rows(page, 5, "kit.carrozzeria?.length")
    no_wheels = page.evaluate("() => { let n = 0; for (let i = 0; i < 3000; i++) if (randomCombo().ruote === -1) n++; return n; }")
    assert no_wheels == 0, no_wheels
    assert not page.errors, page.errors
    return {"closed_with_tear_in_3000": tears, "car_without_wheels_in_3000": no_wheels, "pixels": colours}


def kit_sheet(ctx, folder, out):
    """A sample kit on one dark page, every piece over the first piece of the lowest layer."""
    data = json.loads(re.search(r'\] = (\{.*\});', (ROOT / "kits" / folder / "kit.js").read_text(encoding="utf-8")).group(1))
    base = next(iter(data["pieces"].values()))[0]["svg"]
    uri = lambda svg: "data:image/svg+xml;charset=utf-8," + re.sub(r"[#%<>\"]", lambda m: f"%{ord(m.group()):02X}", svg)
    cells = []
    for i, (layer, pieces) in enumerate(data["pieces"].items()):
        for p in pieces:
            under = "" if i == 0 else f'<img src="{uri(base)}" style="opacity:.35">'
            cells.append(f'<figure>{under}<img src="{uri(p["svg"])}"><figcaption>{layer.split("-", 1)[1]} / <b>{p["name"]}</b></figcaption></figure>')
    page = ctx.new_page()
    page.set_content("<style>body{margin:0;padding:24px;background:#0c0c09;color:#abab9c;font:13px system-ui,'Segoe UI',sans-serif;"
                     "display:grid;grid-template-columns:repeat(7,1fr);gap:14px}figure{margin:0;position:relative;aspect-ratio:1/1.15}"
                     "img{position:absolute;inset:0;width:100%;aspect-ratio:1;background:transparent}figure::before{content:'';position:absolute;"
                     "inset:0;bottom:auto;aspect-ratio:1;background:#f4efe4;border-radius:10px}figcaption{position:absolute;bottom:0}"
                     "b{color:#fbfbf9}</style>" + "".join(cells))
    page.wait_for_timeout(500)
    page.screenshot(path=SCREENS / out, full_page=True)


def online(url):
    with tempfile.TemporaryDirectory() as t, sync_playwright() as p:
        tmp = Path(t)
        browser = p.chromium.launch(channel="msedge")
        ctx = browser.new_context(viewport={"width": 1280, "height": 800}, color_scheme="dark", accept_downloads=True)
        probe = ctx.new_page()
        status = probe.goto(url).status
        assert status == 200, status
        probe.close()
        page = open_page(ctx, url)
        assert page.evaluate("() => location.protocol") == "https:"
        (tmp / "out").mkdir(), (tmp / "kit").mkdir()
        result = run(page, tmp / "out", tmp / "kit", False)
        page.goto(url)
        wait_rows(page, 5)
        set_combo(page, {"faccia": "ovale", "occhi": "stelle", "sopracciglia": "dritte", "bocca": "risata", "accessori": None})
        page.screenshot(path=SCREENS / "07-online.png")
        assert not page.errors, page.errors
        print(json.dumps({"url": url, "status": status, **result}), flush=True)
        try:
            browser.close()
        except Exception:
            pass


def main():
    SCREENS.mkdir(parents=True, exist_ok=True)
    if sys.argv[1:2] == ["--online"]:
        return online(sys.argv[2])

    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a):
            pass

    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(Quiet, directory=str(ROOT)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    report = {}
    with tempfile.TemporaryDirectory() as t, sync_playwright() as p:
        tmp = Path(t)
        browser = p.chromium.launch(channel="msedge")
        ctx = browser.new_context(viewport={"width": 1280, "height": 800}, color_scheme="dark", accept_downloads=True)
        for name, url, shots in [("file", (ROOT / "index.html").as_uri(), True),
                                 ("http", f"http://127.0.0.1:{server.server_port}/index.html", False)]:
            out, work = tmp / f"out-{name}", tmp / f"kit-{name}"
            out.mkdir(), work.mkdir()
            report[name] = run(open_page(ctx, url), out, work, shots)
        report["afternoon"] = afternoon(ctx, tmp)
        kit_sheet(ctx, "comic-sans", "03-kit-di-esempio.png")
        kit_sheet(ctx, "auto-comic-sans", "11-kit-auto.png")
        phone = browser.new_context(viewport={"width": 393, "height": 852}, device_scale_factor=2, color_scheme="dark")
        page = open_page(phone, (ROOT / "index.html").as_uri())
        page.screenshot(path=SCREENS / "06-telefono.png")
        assert not page.errors, page.errors
        print(json.dumps(report, indent=1), flush=True)
        try:
            browser.close()
        except Exception:  # Edge sometimes drops the driver connection on close; the checks are done
            pass
    server.shutdown()


if __name__ == "__main__":
    main()
