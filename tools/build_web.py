#!/usr/bin/env python3
"""Junta web/ em uma pagina so e coloca dentro dos assets do app.

    build_web.py
"""
from __future__ import annotations

import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / "web"


def join(folder: str) -> str:
    # ordem.txt define a sequencia: os scripts dividem o mesmo escopo, entao a ordem importa.
    base = WEB / folder
    names = [line.strip() for line in (base / "ordem.txt").read_text(encoding="utf-8").splitlines()]
    return "".join((base / name).read_text(encoding="utf-8") for name in names if name and not name.startswith("#"))


def page_html() -> str:
    sdk = (WEB / "data/sdk-index.json").read_text(encoding="utf-8")
    js_index = (WEB / "data/js-index.json").read_text(encoding="utf-8").strip()
    scripts = join("scripts").replace("/*SDK_INDEX*/", "/*SDK_INDEX_START*/" + sdk + "/*SDK_INDEX_END*/", 1).replace("/*JS_INDEX*/", js_index, 1)
    page = (WEB / "index.html").read_text(encoding="utf-8")
    return page.replace("<!-- build:styles -->\n", join("styles"), 1).replace("<!-- build:scripts -->\n", scripts, 1)


def stage(site: Path) -> None:
    if site.exists():
        shutil.rmtree(site)
    site.mkdir(parents=True)
    (site / "index.html").write_text(page_html(), encoding="utf-8")
    print("APP_STAGED path=" + str(site))


if __name__ == "__main__":
    stage(ROOT / "app/Assets/site")
