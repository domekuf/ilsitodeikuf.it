#!/usr/bin/env python3
"""Genera il logo KUF in SVG (geometria ricavata da img/logo-02.png del vecchio sito).

Uso: python3 scripts/build-logo.py  -> scrive src/assets/logo/*.svg
Le lettere sono forme piene (niente stroke), così scalano bene e si colorano con currentColor.
"""
import math
from pathlib import Path

H = 167.0  # altezza delle lettere (unità del disegno originale)
ARM = -1.36  # pendenza del braccio della K (dx/dy)
LEG = 1.07  # pendenza della gamba della K (dx/dy)


def f(n: float) -> str:
    s = f"{n + 0.0:.2f}".rstrip("0").rstrip(".")
    return "0" if s in ("-0", "") else s


def poly(points):
    return "M" + " L".join(f"{f(x)} {f(y)}" for x, y in points) + " Z"


def letter_k(x0: float, s: float):
    """K: asta, braccio (taglio orizzontale in alto) e gamba (taglio orizzontale in basso)."""
    width = 157.0
    arm_w = s * math.sqrt(1 + ARM**2)  # larghezza orizzontale del braccio
    leg_w = s * math.sqrt(1 + LEG**2)
    stem = poly([(x0, 0), (x0 + s, 0), (x0 + s, H), (x0, H)])
    # braccio: bordo esterno parte da (width - 7, 0) e scende fino all'asta
    ax_out = x0 + width - 7
    ax_in = ax_out - arm_w
    y_out = (ax_out - (x0 + s)) / -ARM
    y_in = (ax_in - (x0 + s)) / -ARM
    arm = poly([(ax_in, 0), (ax_out, 0), (x0 + s, y_out), (x0 + s, y_in)])
    # gamba: dal fondo fino al bordo inferiore del braccio
    lx_out = x0 + width
    lx_in = lx_out - leg_w

    def meet(xb):  # intersezione retta gamba (passante per (xb, H)) con bordo esterno del braccio
        y = (ax_out - xb + LEG * H) / (LEG - ARM)
        return xb - LEG * (H - y), y

    leg = poly([(lx_in, H), (lx_out, H), meet(lx_out), meet(lx_in)])
    return [stem, arm, leg], width


def letter_u(x0: float, s: float):
    width = 141.0
    r_out = width / 2
    r_in = r_out - s
    b = H - r_out
    d = (
        f"M{f(x0)} 0 H{f(x0 + s)} V{f(b)} A{f(r_in)} {f(r_in)} 0 0 0 {f(x0 + width - s)} {f(b)} "
        f"V0 H{f(x0 + width)} V{f(b)} A{f(r_out)} {f(r_out)} 0 0 1 {f(x0)} {f(b)} Z"
    )
    return [d], width


def letter_f(x0: float, s: float):
    width = 117.0
    mid = 78.5  # barra centrale un filo sopra il centro (correzione ottica, come nell'originale)
    return [
        poly([(x0, 0), (x0 + s, 0), (x0 + s, H), (x0, H)]),
        poly([(x0, 0), (x0 + width, 0), (x0 + width, s), (x0, s)]),
        poly([(x0, mid - s / 2), (x0 + 102, mid - s / 2), (x0 + 102, mid + s / 2), (x0, mid + s / 2)]),
    ], width


def wordmark(s: float, gap_ku: float, gap_uf: float):
    paths = []
    x = 0.0
    p, w = letter_k(x, s); paths += p; x += w + gap_ku
    p, w = letter_u(x, s); paths += p; x += w + gap_uf
    p, w = letter_f(x, s); paths += p; x += w
    return paths, x


def svg(paths, width, height, title, pad=0.0, extra=""):
    vb = f"{f(-pad)} {f(-pad)} {f(width + 2 * pad)} {f(height + 2 * pad)}"
    body = "".join(f'<path d="{d}"/>' for d in paths)
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}" role="img" aria-label="{title}" fill="currentColor">'
        f"<title>{title}</title>{extra}{body}</svg>\n"
    )


out = Path(__file__).resolve().parent.parent / "src/assets/logo"
out.mkdir(parents=True, exist_ok=True)

# 1. Wordmark completo: tratto sottile come l'originale, spaziatura ottica corretta (K-U era 6, U-F 20).
p, w = wordmark(12.5, 14, 18)
(out / "kuf-wordmark.svg").write_text(svg(p, w, H, "KUF"))

# 2. Wordmark compatto per l'header: tratto più pieno (si legge anche a 20-24 px) e più aria tra le lettere.
p, w = wordmark(17, 20, 24)
(out / "kuf-wordmark-compact.svg").write_text(svg(p, w, H, "KUF"))

# 3. Monogramma K per favicon: tratto pesante, centrato in un quadrato con area di rispetto.
p, w = letter_k(0, 24)
side = H + 2 * 34
pad_x = (side - w) / 2
mono = svg(p, w, H, "K", pad=0)
vb = f"{f(-pad_x)} {f(-34)} {f(side)} {f(side)}"
mono = mono.replace(f'viewBox="0 0 {f(w)} {f(H)}"', f'viewBox="{vb}"')
(out / "kuf-monogram.svg").write_text(mono)

print("ok:", sorted(x.name for x in out.iterdir()))
