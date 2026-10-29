#!/usr/bin/env python3
"""Genera il set di favicon dal monogramma K (src/assets/logo/kuf-monogram.svg).

Uso: python3 scripts/build-favicons.py   (richiede Pillow e playwright per Python)
Scrive in public/: favicon.svg, favicon.ico (32), apple-touch-icon.png (180),
icon-192.png, icon-512.png, icon-maskable-512.png, site.webmanifest.
"""
import json
import re
from io import BytesIO
from pathlib import Path

from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "public"
INK, PAPER = "#141414", "#FBFAF7"

src = (ROOT / "src/assets/logo/kuf-monogram.svg").read_text()
vb = re.search(r'viewBox="([^"]+)"', src).group(1)
x, y, w, h = map(float, vb.split())
paths = "".join(re.findall(r'<path d="[^"]+"/>', src))


def icon_svg(radius: float, pad: float = 0.0) -> str:
    """K color carta su quadrato inchiostro; `pad` riduce la K (per le icone maskable)."""
    scale = 1 - 2 * pad
    cx, cy = x + w / 2, y + h / 2
    g = f'<g fill="{PAPER}" transform="translate({cx} {cy}) scale({scale}) translate({-cx} {-cy})">{paths}</g>'
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}">'
        f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{w * radius:.1f}" fill="{INK}"/>{g}</svg>\n'
    )


def render(svg: str, size: int) -> Image.Image:
    with sync_playwright() as p:
        b = p.chromium.launch()
        page = b.new_page(viewport={"width": size, "height": size})
        page.set_content(
            f'<html><body style="margin:0;background:transparent">'
            f'<div style="width:{size}px;height:{size}px">{svg.replace("<svg ", f"<svg width={size} height={size} ")}</div>'
            f"</body></html>"
        )
        png = page.screenshot(omit_background=True, clip={"x": 0, "y": 0, "width": size, "height": size})
        b.close()
    return Image.open(BytesIO(png)).convert("RGBA")


PUBLIC.mkdir(exist_ok=True)
rounded = icon_svg(0.18)
(PUBLIC / "favicon.svg").write_text(rounded)

render(rounded, 32).save(PUBLIC / "favicon.ico", sizes=[(32, 32)])
render(icon_svg(0), 180).save(PUBLIC / "apple-touch-icon.png")  # iOS arrotonda da solo
render(rounded, 192).save(PUBLIC / "icon-192.png")
render(rounded, 512).save(PUBLIC / "icon-512.png")
render(icon_svg(0, pad=0.12), 512).save(PUBLIC / "icon-maskable-512.png")

manifest = {
    "name": "Il Sito dei Kuf",
    "short_name": "Kuf",
    "lang": "it",
    "start_url": "/",
    "display": "browser",
    "background_color": PAPER,
    "theme_color": PAPER,
    "icons": [
        {"src": "/icon-192.png", "sizes": "192x192", "type": "image/png"},
        {"src": "/icon-512.png", "sizes": "512x512", "type": "image/png"},
        {"src": "/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable"},
    ],
}
(PUBLIC / "site.webmanifest").write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n")
print("ok:", sorted(p.name for p in PUBLIC.iterdir()))
