#!/usr/bin/env python3
"""Ricava dalla carta maculata del vecchio sito (img/bground.jpg) una texture leggera e ripetibile.

Uso: python3 scripts/build-paper.py <percorso di bground.jpg>
Scrive src/assets/textures/paper.webp: macchie d'inchiostro su trasparente, da sovrapporre al bianco caldo.
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

TILE = 800
src = Image.open(sys.argv[1]).convert("L")
# zona con macchie ben distribuite (in alto a sinistra la carta è più pulita)
crop = src.crop((700, 900, 700 + TILE, 900 + TILE))
a = np.asarray(crop).astype(float)
# togli le ombre larghe della fotografia, tieni solo le macchie
base = np.asarray(crop.filter(ImageFilter.GaussianBlur(24))).astype(float)
ink = np.clip(base - a, 0, 255)
# macchie più rade: soglia alta, poi opacità bassa
alpha = np.clip((ink - 22) * 4.0, 0, 255)
alpha = alpha * 0.32

# rendi la tessera ripetibile: dissolvenza con una copia spostata di mezza tessera
shifted = np.roll(np.roll(alpha, TILE // 2, 0), TILE // 2, 1)
ramp = 1 - np.abs(np.linspace(-1, 1, TILE))
w = np.clip(np.outer(ramp, ramp) * 2.2, 0, 1)
tile = alpha * w + shifted * (1 - w)

rgba = np.zeros((TILE, TILE, 4), dtype=np.uint8)
rgba[..., :3] = (20, 20, 20)  # inchiostro #141414
rgba[..., 3] = np.clip(tile, 0, 255).astype(np.uint8)
out = Path(__file__).resolve().parent.parent / "src/assets/textures/paper.webp"
Image.fromarray(rgba, "RGBA").save(out, "WEBP", quality=70, method=6)
print(out, out.stat().st_size, "byte")
