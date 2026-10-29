"""Zips Emoji Kit for editor.p5js.org into dist/.

emoji-kit-studenti.zip: only the four files the page needs, no kit: it starts empty.
emoji-kit-demo.zip: the same four files plus the two sample kits in kits/ (menu, ?demo, ?kit=).

    python tools/make_editor_zip.py
"""
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "dist"
FILES = ["index.html", "sketch.js", "style.css", "kit-tools.js"]
KITS = ["comic-sans", "auto-comic-sans"]


def make(name, kits):
    paths = [ROOT / f for f in FILES]
    for k in kits:
        paths += sorted(p for p in (ROOT / "kits" / k).rglob("*") if p.is_file())
    out = DIST / name
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
        for p in paths:
            z.write(p, p.relative_to(ROOT).as_posix())
    return out


def main():
    DIST.mkdir(exist_ok=True)
    for out in [make("emoji-kit-studenti.zip", []), make("emoji-kit-demo.zip", KITS)]:
        with zipfile.ZipFile(out) as z:
            print(f"{out.relative_to(ROOT).as_posix()}: {len(z.namelist())} file, {out.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
