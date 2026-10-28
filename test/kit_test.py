"""End-to-end check of Emoji Kit in a real headless browser (Edge via Playwright).

Opens the page from file:// and from a static server; cycles pieces with the arrows and the
keyboard; presses Random; loads a zip built from the sample kit (with a PNG piece and an SVG
without width/height), a folder and one category; exports PNG, JSON and the grid of 100.
Then applies two afternoon examples of sketch.js (a rule and the face colours) to a copy of
the project and checks they work. No console errors allowed. Saves dark screenshots in
docs/screens/.

    python test/kit_test.py
"""
import base64
import functools
import http.server
import io
import json
import re
import shutil
import tempfile
import threading
import zipfile
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
KIT = ROOT / "kits" / "comic-sans"
SCREENS = ROOT / "docs" / "screens"
CATS = ["faccia", "occhi", "sopracciglia", "bocca", "accessori"]
COUNTS = {"faccia": 3, "occhi": 6, "sopracciglia": 3, "bocca": 5, "accessori": 4}


def open_page(ctx, url):
    page = ctx.new_page()
    page.errors = []
    page.on("console", lambda m: m.type in ("error", "warning") and page.errors.append(f"{m.type}: {m.text}"))
    page.on("pageerror", lambda e: page.errors.append(f"pageerror: {e}"))
    page.goto(url)
    page.wait_for_function("() => kit.accessori?.length && document.querySelectorAll('.row').length === 5", timeout=20000)
    page.wait_for_timeout(300)
    return page


def state(page):
    return page.evaluate("() => ({combo: {...combo}, selected, names: CATEGORIES.map(c => nameOf(c)),"
                         " counts: Object.fromEntries(CATEGORIES.map(c => [c, kit[c]?.length ?? 0])),"
                         " rows: [...document.querySelectorAll('.row .name')].map(e => e.textContent),"
                         " status: document.getElementById('status').textContent})")


def row(page, cat):
    return page.locator(f'.row[data-cat="{cat}"]')


def png_size(path):
    with Image.open(path) as im:
        return im.size, len(set(im.convert("L").resize((50, 50)).getdata()))


def download(page, button, out):
    with page.expect_download() as d:
        page.click(button)
    path = out / d.value.suggested_filename
    d.value.save_as(path)
    return path


def make_test_kit(folder):
    """The sample kit under a root folder, plus macOS junk, a readme, a transparent PNG piece
    drawn with comic.ttf, and one SVG stripped of width/height like Illustrator's responsive export."""
    kit = folder / "mio-kit"
    shutil.copytree(KIT, kit, ignore=shutil.ignore_patterns("kit.js"))
    svg = kit / "occhi" / "tondi.svg"
    svg.write_text(re.sub(r' (width|height)="1000"', "", svg.read_text(encoding="utf-8")), encoding="utf-8")
    im = Image.new("RGBA", (1000, 1000), (0, 0, 0, 0))
    ImageDraw.Draw(im).text((870, 160), "*", font=ImageFont.truetype("C:/Windows/Fonts/comic.ttf", 220), fill=(29, 29, 27, 255), anchor="mm")
    im.save(kit / "accessori" / "asterisco.png")
    (kit / "LEGGIMI.txt").write_text("not a piece", encoding="utf-8")
    zpath = folder / "mio-kit.zip"
    with zipfile.ZipFile(zpath, "w") as z:
        for f in sorted(kit.rglob("*")):
            z.write(f, f.relative_to(folder).as_posix())
        z.writestr("__MACOSX/mio-kit/occhi/._tondi.svg", b"junk")
    return kit, zpath


def run(page, out, tmp, shots):
    s = state(page)
    assert s["counts"] == COUNTS, s
    assert "comic-sans" in s["status"], s

    # arrows on screen: occhi forward, faccia back, both wrap around
    before = s["combo"]
    row(page, "occhi").locator("button").nth(1).click()
    row(page, "faccia").locator("button").nth(0).click()
    s = state(page)
    assert s["combo"]["occhi"] == (before["occhi"] + 1) % 6, (before, s)
    assert s["combo"]["faccia"] == (before["faccia"] - 1) % 3, (before, s)
    assert s["rows"][1] == s["names"][1], s

    # accessories cycle through "nessuno" (-1) as well: 4 pieces + nothing = 5 steps
    seen = set()
    for _ in range(5):
        row(page, "accessori").locator("button").nth(1).click()
        seen.add(state(page)["rows"][4])
    assert "nessuno" in seen and len(seen) == 5, seen

    # clicking a row selects it; keyboard: down three times wraps to sopracciglia, right
    # changes it, left puts it back, up goes to occhi, space randomizes
    assert state(page)["selected"] == 4
    page.mouse.click(5, 795)  # focus the page, not a button
    for _ in range(3):
        page.keyboard.press("ArrowDown")
    s = state(page)
    assert s["selected"] == 2, s
    assert "selected" in row(page, "sopracciglia").get_attribute("class")
    page.keyboard.press("ArrowRight")
    s2 = state(page)
    assert s2["combo"]["sopracciglia"] == (s["combo"]["sopracciglia"] + 1) % 3, (s, s2)
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

    # Random button, and many random combos stay in range; accessories come out empty sometimes
    page.click("#random")
    stats = page.evaluate("""() => { const r = {none: 0, bad: 0, closedTear: 0};
        for (let i = 0; i < 3000; i++) { const c = randomCombo();
          if (c.accessori === -1) r.none++;
          for (const k of CATEGORIES) if (c[k] < firstIndex(k) || c[k] >= kit[k].length) r.bad++;
          const n = k => kit[k][c[k]]?.name; if (n('occhi') === 'chiusi' && n('accessori') === 'lacrima') r.closedTear++; }
        return r; }""")
    assert stats["bad"] == 0 and stats["none"] > 300 and stats["closedTear"] > 30, stats
    page.evaluate("() => { combo = {faccia: 2, occhi: 2, sopracciglia: 2, bocca: 1, accessori: 1}; updatePanel(); }")
    page.wait_for_timeout(200)
    if shots:
        page.screenshot(path=SCREENS / "01-emoji-grande.png")

    # exports
    png = download(page, "#png", out)
    size, tones = png_size(png)
    assert png.name == "emoji.png" and size == (1000, 1000) and tones > 2, (png, size, tones)
    js = download(page, "#json", out)
    data = json.loads(js.read_text(encoding="utf-8"))
    assert data == {"faccia": "tonda", "occhi": "felici", "sopracciglia": "onda", "bocca": "risata", "accessori": "lacrima"}, data
    grid = download(page, "#grid", out)
    size, tones = png_size(grid)
    assert size == (2000, 2000) and tones > 2, (size, tones)
    if shots:
        with Image.open(grid) as im:
            im.convert("RGB").resize((1200, 1200), Image.LANCZOS).save(SCREENS / "02-griglia-100.png", optimize=True)

    # zip built from the sample kit
    kit, zpath = make_test_kit(tmp)
    page.set_input_files("#zipFile", str(zpath))
    page.wait_for_function("() => document.getElementById('status').textContent.includes('mio-kit.zip')", timeout=20000)
    s = state(page)
    assert s["counts"] == {**COUNTS, "accessori": 5}, s
    sizes = page.evaluate("() => kit.occhi.map(p => [p.name, p.img.width, p.img.height])")
    assert all(w == 1000 and h == 1000 for _, w, h in sizes), sizes
    page.evaluate("() => { combo.accessori = kit.accessori.findIndex(p => p.name === 'asterisco'); combo.occhi = kit.occhi.findIndex(p => p.name === 'tondi'); updatePanel(); }")
    page.wait_for_timeout(200)
    assert state(page)["names"][4] == "asterisco"
    if shots:
        page.screenshot(path=SCREENS / "04-zip-caricato.png")

    # one category: two mouths replace the five
    page.select_option("#catSelect", "bocca")
    page.set_input_files("#catFiles", [str(KIT / "bocca" / "sorriso.svg"), str(KIT / "bocca" / "triste.svg")])
    page.wait_for_function("() => kit.bocca.length === 2", timeout=20000)
    s = state(page)
    assert s["counts"]["bocca"] == 2 and s["counts"]["occhi"] == 6 and s["names"][3] == "sorriso", s

    # a whole folder (webkitdirectory)
    folder = "not tried"
    try:
        page.set_input_files("#folder", str(kit))
        page.wait_for_function("() => document.getElementById('status').textContent.includes('Caricato: mio-kit')", timeout=20000)
        assert state(page)["counts"] == {**COUNTS, "accessori": 5}
        folder = "ok"
    except Exception as e:  # older Playwright cannot set a directory on an input
        folder = f"not tried: {e}"
    assert not page.errors, page.errors
    return folder


def afternoon(ctx, tmp):
    """A copy of the project with two afternoon examples switched on: closed eyes never with
    the tear, and every face gives its colour to the whole emoji."""
    proj = tmp / "pomeriggio"
    shutil.copytree(ROOT, proj, ignore=shutil.ignore_patterns(".git", "archive", "docs", "test", "tools"))
    sk = proj / "sketch.js"
    src = sk.read_text(encoding="utf-8")
    for line in ["if (nameOf('occhi', c) === 'chiusi'", "const colors = {", "return colors["]:
        assert f"// {line}" in src, line
        src = src.replace(f"// {line}", line)
    sk.write_text(src, encoding="utf-8")
    page = open_page(ctx, (proj / "index.html").as_uri())
    tears = page.evaluate("""() => { let n = 0; for (let i = 0; i < 3000; i++) { const c = randomCombo();
        if (kit.occhi[c.occhi].name === 'chiusi' && kit.accessori[c.accessori]?.name === 'lacrima') n++; } return n; }""")
    assert tears == 0, tears
    colours = {}
    for face, hexcol in [("tonda", "#2e86ab"), ("ovale", "#d1495b"), ("parentesi", "#3b8b5a")]:
        page.evaluate(f"() => {{ combo = {{faccia: kit.faccia.findIndex(p => p.name === '{face}'), occhi: 1, sopracciglia: 0, bocca: 3, accessori: 2}}; updatePanel(); }}")
        page.wait_for_timeout(200)
        rgb = tuple(int(hexcol[i:i + 2], 16) for i in (1, 3, 5))
        shot = page.evaluate("() => document.querySelector('#stage canvas').toDataURL('image/png')")
        with Image.open(io.BytesIO(base64.b64decode(shot.split(",")[1]))) as im:
            px = list(im.convert("RGB").getdata())
        near = lambda c, ref: sum(abs(a - b) for a, b in zip(c, ref)) < 30
        colours[face] = {"ink": sum(near(c, rgb) for c in px), "black": sum(near(c, (29, 29, 27)) for c in px)}
        assert colours[face]["ink"] > 5000 and colours[face]["black"] == 0, (face, colours)
        if face == "ovale":
            page.screenshot(path=SCREENS / "05-pomeriggio-regole-e-colori.png")
    assert not page.errors, page.errors
    return {"closed_with_tear_in_3000": tears, "pixels": colours}


def kit_sheet(ctx):
    """The sample kit on one dark page, every piece over the round face."""
    data = json.loads(re.search(r"window\.STARTER_KIT = (.*);", (KIT / "kit.js").read_text(encoding="utf-8")).group(1))
    face = data["pieces"]["faccia"][0]["svg"]
    uri = lambda svg: "data:image/svg+xml;charset=utf-8," + re.sub(r"[#%<>\"]", lambda m: f"%{ord(m.group()):02X}", svg)
    cells = []
    for cat in CATS:
        for p in data["pieces"][cat]:
            under = "" if cat == "faccia" else f'<img src="{uri(face)}" style="opacity:.35">'
            cells.append(f'<figure>{under}<img src="{uri(p["svg"])}"><figcaption>{cat} / <b>{p["name"]}</b></figcaption></figure>')
    page = ctx.new_page()
    page.set_content("<style>body{margin:0;padding:24px;background:#0c0c09;color:#abab9c;font:13px system-ui,'Segoe UI',sans-serif;"
                     "display:grid;grid-template-columns:repeat(7,1fr);gap:14px}figure{margin:0;position:relative;aspect-ratio:1/1.15}"
                     "img{position:absolute;inset:0;width:100%;aspect-ratio:1;background:transparent}figure::before{content:'';position:absolute;"
                     "inset:0;bottom:auto;aspect-ratio:1;background:#f4efe4;border-radius:10px}figcaption{position:absolute;bottom:0}"
                     "b{color:#fbfbf9}</style>" + "".join(cells))
    page.wait_for_timeout(500)
    page.screenshot(path=SCREENS / "03-kit-di-esempio.png", full_page=True)


def main():
    SCREENS.mkdir(parents=True, exist_ok=True)

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
            report[name] = {"folder": run(open_page(ctx, url), out, work, shots)}
        report["afternoon"] = afternoon(ctx, tmp)
        kit_sheet(ctx)
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
