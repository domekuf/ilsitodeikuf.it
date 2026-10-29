#!/usr/bin/env python3
"""Prepara i loghi scaricabili del press kit (public/press/loghi/) e lo zip kuf-loghi.zip.

Uso: python3 scripts/build-press-logos.py   (richiede playwright per Python)
Da rilanciare ogni volta che cambia il logo (scripts/build-logo.py).
"""
import re
import zipfile
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public/press/loghi"
OUT.mkdir(parents=True, exist_ok=True)

COLORS = {"nero": "#141414", "bianco": "#FFFFFF"}
SOURCES = {
    "kuf-logo": ROOT / "src/assets/logo/kuf-wordmark.svg",
    "kuf-monogramma": ROOT / "src/assets/logo/kuf-monogram.svg",
}
PNG_WIDTH = 2000

files = []
with sync_playwright() as p:
    browser = p.chromium.launch()
    for base, src in SOURCES.items():
        svg = src.read_text()
        _, _, w, h = map(float, re.search(r'viewBox="([^"]+)"', svg).group(1).split())
        for name, color in COLORS.items():
            colored = svg.replace('fill="currentColor"', f'fill="{color}"')
            svg_path = OUT / f"{base}-{name}.svg"
            svg_path.write_text(colored)
            width = PNG_WIDTH if base == "kuf-logo" else 1024
            height = round(width * h / w)
            page = browser.new_page(viewport={"width": width, "height": height})
            page.set_content(
                '<html><body style="margin:0;background:transparent">'
                + colored.replace("<svg ", f'<svg width="{width}" height="{height}" ')
                + "</body></html>"
            )
            png_path = OUT / f"{base}-{name}.png"
            page.screenshot(path=str(png_path), omit_background=True, clip={"x": 0, "y": 0, "width": width, "height": height})
            page.close()
            files += [svg_path, png_path]
    browser.close()

zip_path = ROOT / "public/press/kuf-loghi.zip"
with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as z:
    for f in sorted(files):
        z.write(f, f"Kuf - loghi/{f.name}")
# peso dei file scaricabili, mostrato in /press
import json  # noqa: E402


def human(n: int) -> str:
    kb = n / 1024
    return f"{kb / 1024:.1f} MB".replace(".", ",") if kb > 1024 else f"{round(kb)} KB"


sizes = {
    f"/press/{name}": human((ROOT / "public/press" / name).stat().st_size)
    for name in ("scheda-tecnica.pdf", "stage-plan.pdf", "kuf-loghi.zip")
}
(ROOT / "src/content/press-files.json").write_text(json.dumps(sizes, indent=2) + "\n")
print("ok:", [f.name for f in sorted(OUT.iterdir())], zip_path.stat().st_size)
