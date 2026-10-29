#!/usr/bin/env python3
"""Ricrea puliti gli zip dei dischi a partire da quelli del vecchio sito.

Uso: python3 scripts/build-album-zips.py <cartella con Pigna.zip e ViaTrieste.zip> <cartella di uscita>
Richiede: mutagen, Pillow.

Cosa fa:
- tiene solo gli mp3 (via __MACOSX/, il file "Icon\\r" e le cartelle vuote);
- nomi dei file in Unicode NFC con il flag UTF-8 (niente "Chissa╠Ç" su Windows);
- tag ID3 riscritti in v2.3 (letti ovunque, anche da Esplora risorse) con titoli dalla tracklist ufficiale,
  artista, album, anno, numero di traccia e copertina incorporata;
- aggiunge cover.jpg; cartella interna "Kuf - <Disco> (<anno>)".
Gli zip escono in <cartella di uscita> e si caricano su R2 con scripts/upload-downloads.sh.
"""
import io
import sys
import unicodedata
import zipfile
from pathlib import Path

from mutagen.id3 import APIC, ID3, TALB, TDRC, TIT2, TPE1, TPE2, TRCK
from PIL import Image

ALBUMS = {
    "Pigna.zip": {
        "title": "Pigna",
        "year": "2017",
        "cover": "src/assets/covers/pigna.jpg",
        "tracks": [
            "Agosto", "Fin qui tutto bene", "Matite", "Tenco e Pasolini", "Per farti più male",
            "Milano non esiste", "Neve", "Divani", "La tempesta", "Nebbia",
        ],
    },
    "ViaTrieste.zip": {
        "title": "Via Trieste",
        "year": "2015",
        "cover": "src/assets/covers/via-trieste.jpg",
        "tracks": [
            "Chissà chi verrà", "Fuori da qui", "Walden", "Via Trieste", "L'unico centro è il confine",
            "Verranno a prenderci", "Atto pubblico", "Motosega", "La sindrome di Notredame",
            "Contare gli inverni", "Lo sappiamo da vent'anni", "La fine",
        ],
    },
}

ROOT = Path(__file__).resolve().parent.parent


def cover_jpeg(path: Path, size: int) -> bytes:
    im = Image.open(path).convert("RGB")
    im.thumbnail((size, size), Image.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, "JPEG", quality=90, optimize=True)
    return buf.getvalue()


def safe(name: str) -> str:
    return unicodedata.normalize("NFC", name.replace("/", "-").replace(":", " -"))


def zinfo(name: str, year: str) -> zipfile.ZipInfo:
    info = zipfile.ZipInfo(unicodedata.normalize("NFC", name), date_time=(int(year), 1, 1, 0, 0, 0))
    info.compress_type = zipfile.ZIP_DEFLATED
    return info


def build(src_zip: Path, out_dir: Path, meta: dict) -> Path:
    folder = f"Kuf - {meta['title']} ({meta['year']})"
    out = out_dir / f"{folder}.zip"
    art_tag = cover_jpeg(ROOT / meta["cover"], 1000)  # incorporata negli mp3: leggera
    art_file = cover_jpeg(ROOT / meta["cover"], 1600)  # cover.jpg nello zip

    with zipfile.ZipFile(src_zip) as zin:
        mp3s = sorted(
            (i for i in zin.infolist() if i.filename.lower().endswith(".mp3") and "__MACOSX" not in i.filename),
            key=lambda i: i.filename,
        )
        if len(mp3s) != len(meta["tracks"]):
            raise SystemExit(f"{src_zip.name}: {len(mp3s)} mp3 ma {len(meta['tracks'])} titoli in tracklist")

        with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as zout:
            total = len(mp3s)
            for n, (info, title) in enumerate(zip(mp3s, meta["tracks"]), start=1):
                data = io.BytesIO(zin.read(info))
                tags = ID3(data)
                tags.delall("APIC")
                tags.delall("PIC")
                tags.setall("TIT2", [TIT2(encoding=1, text=title)])
                tags.setall("TPE1", [TPE1(encoding=1, text="Kuf")])
                tags.setall("TPE2", [TPE2(encoding=1, text="Kuf")])
                tags.setall("TALB", [TALB(encoding=1, text=meta["title"])])
                tags.setall("TRCK", [TRCK(encoding=1, text=f"{n}/{total}")])
                tags.setall("TDRC", [TDRC(encoding=1, text=meta["year"])])
                tags.add(APIC(encoding=0, mime="image/jpeg", type=3, desc="Cover", data=art_tag))
                tags.save(data, v2_version=3)
                name = f"{folder}/" + safe(f"{n:02d} {title}.mp3")
                zout.writestr(zinfo(name, meta["year"]), data.getvalue())
                print(f"  {name}")
            zout.writestr(zinfo(f"{folder}/cover.jpg", meta["year"]), art_file)
    return out


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    src_dir, out_dir = Path(sys.argv[1]), Path(sys.argv[2])
    out_dir.mkdir(parents=True, exist_ok=True)
    for zip_name, meta in ALBUMS.items():
        print(zip_name)
        out = build(src_dir / zip_name, out_dir, meta)
        print(f"-> {out} ({out.stat().st_size / 1e6:.1f} MB)")


if __name__ == "__main__":
    main()
