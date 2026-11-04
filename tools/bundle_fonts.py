#!/usr/bin/env python3
"""Coloca as fontes dentro do site para o APK funcionar sem internet.

    bundle_fonts.py SITE_DIR
"""
from __future__ import annotations

import re
import subprocess
import sys
import tarfile
import tempfile
from pathlib import Path

# Pacotes OFL do Fontsource; a subset latin cobre o portugues.
FONTS = {
    "Atkinson Hyperlegible": ("atkinson-hyperlegible", (400, 700)),
    "JetBrains Mono": ("jetbrains-mono", (400, 600)),
    "Pixelify Sans": ("pixelify-sans", (500, 700)),
}


def main(site: Path) -> int:
    target = site / "fonts"
    target.mkdir(exist_ok=True)
    faces = []
    with tempfile.TemporaryDirectory() as temp:
        for family, (slug, weights) in FONTS.items():
            subprocess.run(["npm", "pack", "--silent", f"@fontsource/{slug}", "--pack-destination", temp], check=True, stdout=subprocess.DEVNULL)
            archive = next(Path(temp).glob(f"fontsource-{slug}-*.tgz"))
            with tarfile.open(archive) as tar:
                for weight in weights:
                    name = f"{slug}-latin-{weight}-normal.woff2"
                    data = tar.extractfile(f"package/files/{name}")
                    (target / name).write_bytes(data.read())
                    faces.append(f'@font-face{{font-family:"{family}";font-weight:{weight};font-display:swap;src:url("fonts/{name}") format("woff2")}}')
    index = site / "index.html"
    html = index.read_text(encoding="utf-8")
    html, removed = re.subn(r'<link rel="(?:preconnect|stylesheet)" href="https://fonts\.[^>]*>\n?', "", html)
    if removed != 2:
        raise SystemExit("Links de fonte esperados nao encontrados: " + str(removed))
    index.write_text(html.replace("<style>", "<style>\n" + "\n".join(faces) + "\n", 1), encoding="utf-8")
    print("FONTS_BUNDLED faces=" + str(len(faces)))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(Path(sys.argv[1])))
