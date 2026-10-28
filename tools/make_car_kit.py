"""Build the car sample kit from real Comic Sans glyphs, the same way as make_comic_kit.py.

A car facing right on the same 1000x1000 board: body from y 150 to 660, wheels below it
touching the ground at y 820, windows on the cabin, lights at the front. Writes
kits/auto-comic-sans/<layer>/*.svg and kit.js, and prints the glyph table for the README.

    python tools/make_car_kit.py [path/to/font.ttf]
"""
import sys
from pathlib import Path

from make_comic_kit import g, write_kit

KIT = Path(__file__).resolve().parent.parent / "kits" / "auto-comic-sans"

WHEEL_Y, WINDOW_Y, LIGHT = 745, 330, (775, 590)


def wheels(char, h):
    return [g(char, 300, WHEEL_Y, h=h), g(char, 700, WHEEL_Y, h=h)]


def windows(char, **kw):
    return [g(char, 435, WINDOW_Y, **kw), g(char, 595, WINDOW_Y, **kw)]


PIECES = {
    "1-carrozzeria": {
        "berlina": [g("[", 150, 560, h=200), g("]", 850, 560, h=200), g("_", 500, 655, w=720, h=26),
                    g("D", 500, 310, h=540, w=310, rot=-90)],
        "maggiolino": [g("D", 500, 405, h=780, w=510, rot=-90)],
        "furgone": [g("U", 500, 430, w=740, h=460, rot=180), g("_", 500, 655, w=760, h=26)],
        "squadrata": [g("[", 150, 440, h=440), g("]", 850, 440, h=440), g("_", 500, 222, w=720, h=26), g("_", 500, 655, w=720, h=26)],
        "sportiva": [g("U", 500, 565, w=780, h=190, rot=180), g("D", 500, 345, h=540, w=270, rot=-90)],
    },
    "2-ruote": {
        "tonde": wheels("o", 180),
        "grandi": wheels("O", 180),
        "ovali": wheels("0", 180),
        "chiocciole": wheels("@", 180),
        "stelle": wheels("*", 180),
    },
    "3-finestrini": {
        "quadrati": [g("[", 390, WINDOW_Y, h=110), g("]", 480, WINDOW_Y, h=110),
                     g("[", 550, WINDOW_Y, h=110), g("]", 640, WINDOW_Y, h=110)],
        "archi": windows("n", h=110),
        "conche": windows("u", h=110),
        "righe": windows("=", w=110),
        "oblo": windows("O", h=110),
    },
    "4-fari": {
        "punto": [g(".", *LIGHT, h=75)],
        "tondo": [g("o", *LIGHT, h=85)],
        "stella": [g("*", *LIGHT, h=90)],
        "raggio": [g(">", 930, 600, h=90)],
        "lampeggio": [g("!", 935, 600, h=110, rot=90)],
    },
    "5-extra": {
        "fumo": [g("~", 75, 620, w=130), g("~", 55, 535, w=100)],
        "vento": [g("-", 60, 360, w=80), g("-", 40, 440, w=80), g("-", 60, 520, w=80)],
        "croce": [g("+", 690, 575, h=120)],
        "allarme": [g("!", 850, 170, h=190)],
        "dubbio": [g("?", 850, 170, h=190)],
    },
}

if __name__ == "__main__":
    write_kit(KIT, "auto", PIECES, sys.argv[1] if len(sys.argv) > 1 else None)
