"""End-to-end check of Emoji Press in a real headless browser (Edge via Playwright).

Loads real fonts from C:/Windows/Fonts, moves sliders, breaks a recipe, exports SVG and
JSON, reloads the JSON, and saves dark screenshots in docs/screens/.

    python test/press_test.py [--out <folder for the exported files>]
"""
import argparse
import functools
import http.server
import json
import tempfile
import threading
import xml.etree.ElementTree as ET
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
SCREENS = ROOT / "docs" / "screens"
FONTS = Path("C:/Windows/Fonts")

CELLS = "() => layout(width).cells.map(c => { const r = cellResult(c); return {k: c.key || 'nuova ' + (c.index - 99), n: r.shapes.length, err: r.error || null}; })"


def wait_font(page, label):
    page.wait_for_function(f"() => state.fontLabel === {json.dumps(label)} && state.measures", timeout=20000)
    page.wait_for_timeout(300)


def set_range(page, key, value):
    page.evaluate("([k, v]) => { const e = document.getElementById('p-' + k); e.value = v; e.dispatchEvent(new Event('input')); }", [key, value])


def check_cells(page, expect_error=None):
    cells = page.evaluate(CELLS)
    assert len(cells) == 28, len(cells)
    for c in cells:
        if c["k"] == expect_error:
            assert c["err"] and c["n"] == 0, c
        else:
            assert c["err"] is None and c["n"] > 0, c
    return cells


def run(page, base_url, out):
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: m.type == "error" and errors.append(m.text))
    report = {}

    page.goto(base_url)
    page.wait_for_function("() => typeof state !== 'undefined' && state.measures", timeout=20000)
    page.wait_for_timeout(300)
    report["preset"] = page.evaluate("() => ({font: state.fontLabel, measures: state.measures, P: state.P})")
    check_cells(page)
    page.screenshot(path=SCREENS / "01-preset-comic-sans.png")

    for name, shot in (("comic", "02-font-comic-ttf.png"), ("times", "03-font-times-ttf.png")):
        page.set_input_files("#fontFile", str(FONTS / f"{name}.ttf"))
        wait_font(page, name)
        report[name] = page.evaluate("() => ({measures: state.measures, P: state.P})")
        check_cells(page)
        page.screenshot(path=SCREENS / shot)
    assert report["times"]["P"]["contrast"] > report["comic"]["P"]["contrast"] + 0.2, "Times should measure more contrast than Comic"

    # same parameters, same drawing: no flicker between two redraws
    a = page.evaluate("() => JSON.stringify(layout(width).cells.map(cellResult))")
    page.evaluate("() => redraw()")
    assert a == page.evaluate("() => JSON.stringify(layout(width).cells.map(cellResult))"), "drawing is not deterministic"

    set_range(page, "squareness", 4)
    set_range(page, "slant", 10)
    set_range(page, "wobble", 0.02)
    page.select_option("#p-terminal", "obliquo")
    P = page.evaluate("() => state.P")
    assert (P["squareness"], P["slant"], P["wobble"], P["terminal"]) == (4, 10, 0.02, "obliquo"), P
    assert page.evaluate("() => document.getElementById('v-slant').textContent") != ""
    check_cells(page)
    page.screenshot(path=SCREENS / "04-slider-mossi.png")

    # every primitive at both ends of its range (and every terminal) still draws all 28 cells
    bad = page.evaluate("""() => {
      const saved = {...state.P}, bad = [];
      for (const p of PRIMS) for (const v of p.options || [p.min, p.max]) {
        state.P = {...saved, [p.key]: v};
        for (const c of layout(width).cells) {
          const r = cellResult(c), flat = JSON.stringify(r.shapes);
          if (r.error || !r.shapes.length || flat.includes('null')) bad.push(`${p.key}=${v} ${c.key || c.index}`);
        }
      }
      state.P = saved;
      return bad;
    }""")
    assert not bad, bad[:10]

    page.fill("#seed", "42")
    page.dispatch_event("#seed", "change")
    faces42 = page.evaluate("() => newFaces(42)")
    assert page.evaluate("() => state.seed") == 42
    page.evaluate("() => setSeed(43)")
    assert page.evaluate("() => newFaces(43)") != faces42
    page.evaluate("() => setSeed(42)")
    assert page.evaluate("() => newFaces(42)") == faces42, "seed is not reproducible"
    report["faces42"] = faces42
    page.locator("#center").evaluate("e => e.scrollTop = e.scrollHeight")
    page.screenshot(path=SCREENS / "05-seme-42.png")
    page.locator("#center").evaluate("e => e.scrollTop = 0")

    original = page.evaluate("() => state.recipes.casa")
    page.fill("#t-casa", "testa();\nocchi('storti');")
    assert "occhi" in page.inner_text("#r-casa .err") and "bad" in page.get_attribute("#r-casa", "class")
    check_cells(page, expect_error="casa")
    page.fill("#t-casa", "testa(;")
    check_cells(page, expect_error="casa")
    page.locator("#r-casa").scroll_into_view_if_needed()
    page.screenshot(path=SCREENS / "06-ricetta-con-errore.png")
    report["recipe_error"] = page.inner_text("#r-casa .err")
    page.fill("#t-casa", original)
    check_cells(page)
    assert page.inner_text("#r-casa .err") == ""

    with page.expect_download() as d:
        page.click("#exportSvg")
    svg = out / d.value.suggested_filename
    d.value.save_as(svg)
    tree = ET.parse(svg)
    ns = "{http://www.w3.org/2000/svg}"
    groups = [g for g in tree.iter(ns + "g") if g.get("id")]
    assert len(groups) == 28, len(groups)
    text = svg.read_text(encoding="utf-8")
    assert "NaN" not in text and "Font: times" in text and "Inclinazione" in text
    report["svg"] = {"file": svg.name, "kb": round(svg.stat().st_size / 1024), "paths": text.count("<path")}

    with page.expect_download() as d:
        page.click("#exportJson")
    preset = out / d.value.suggested_filename
    d.value.save_as(preset)
    saved = json.loads(preset.read_text(encoding="utf-8"))
    set_range(page, "weight", 0.25)
    page.evaluate("() => { state.recipes.gatto = 'testa();'; setSeed(7); }")
    assert page.evaluate("() => state.P.weight") == 0.25
    page.set_input_files("#jsonFile", str(preset))
    page.wait_for_function("() => document.getElementById('status').textContent.startsWith('Preset caricato')")
    back = page.evaluate("() => ({P: state.P, recipes: state.recipes, seed: state.seed})")
    assert back["P"] == saved["primitives"], (back["P"], saved["primitives"])
    assert back["recipes"] == saved["recipes"] and back["seed"] == saved["seed"] == 42
    assert page.input_value("#t-gatto") == saved["recipes"]["gatto"]
    report["json"] = {"file": preset.name, "restored": True}

    view = out / "svg-view.html"
    view.write_text(f'<body style="margin:0;background:#0c0c09"><img src="{svg.name}" style="display:block;margin:20px auto">', encoding="utf-8")
    page.goto(view.as_uri())
    page.wait_for_function("() => document.images[0].complete")
    page.screenshot(path=SCREENS / "07-export-svg.png", full_page=True)

    assert not errors, errors
    return report


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", type=Path, default=Path(tempfile.mkdtemp(prefix="emoji-press-")))
    args = ap.parse_args()
    args.out = args.out.resolve()
    args.out.mkdir(parents=True, exist_ok=True)
    SCREENS.mkdir(parents=True, exist_ok=True)

    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a):
            pass

    handler = functools.partial(Quiet, directory=str(ROOT))
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()

    with sync_playwright() as p:
        browser = p.chromium.launch(channel="msedge")
        ctx = browser.new_context(viewport={"width": 1600, "height": 1000}, color_scheme="dark", accept_downloads=True)
        report = run(ctx.new_page(), (ROOT / "index.html").as_uri(), args.out)
        # the same page from a static server, as on a laptop with `python -m http.server`
        page = ctx.new_page()
        errs = []
        page.on("pageerror", lambda e: errs.append(str(e)))
        page.goto(f"http://127.0.0.1:{server.server_port}/index.html")
        page.wait_for_function("() => typeof state !== 'undefined' && state.measures", timeout=20000)
        check_cells(page)
        assert not errs, errs
        report["http_server"] = True
        report["out"] = str(args.out)
        print(json.dumps(report, indent=1, ensure_ascii=False), flush=True)
        try:
            browser.close()
        except Exception:  # Edge sometimes drops the driver connection on close; the checks are done
            pass
    server.shutdown()


if __name__ == "__main__":
    main()
