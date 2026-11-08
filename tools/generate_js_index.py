#!/usr/bin/env python3
"""Gera web/data/js-index.json com a API JS do Bunny (tag js-final).

    BUNNY_JS_UPSTREAM=../bunny-loader-js-final python3 tools/generate_js_index.py

Le docs/referencia/metodos.json e docs/referencia/ponte-e-bl.md dessa versao.
"""
from __future__ import annotations

import json
import os
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
KINDS = {"Instance": "i", "Static": "s", "Getter": "g", "Static getter": "sg", "Constructor": "c", "Setter": "set", "Static setter": "ss", "Not implemented": "x"}
# Os globais do motor JS (ponte-e-bl.md, "JavaScript globals", e os do ModHelpers.js).
GLOBALS = ["Terraria", "Microsoft", "System", "ReLogic", "bl", "print", "performance", "Ref", "Color", "Vector2", "Rectangle", "Point16",
           "MathHelper", "Rand", "ItemRarityID", "NPCAIStyleID", "ProjAIStyleID", "NetmodeID", "ProjAI", "AnchorData", "GUIBuffs", "GUIInstance"]


def main() -> int:
    upstream = Path(os.environ.get("BUNNY_JS_UPSTREAM", ROOT.parent / "bunny-loader-js-final"))
    ref = upstream / "docs/referencia"
    data = json.loads((ref / "metodos.json").read_text(encoding="utf-8"))
    classes: dict[str, dict] = {}
    for c in data["classes"]:
        classes[c["name"]] = {"b": c["base"], "m": []}
    for r in data["rows"]:
        if r["inherited"] or r["class"] not in classes:
            continue
        sig = r["signature"]
        name = r["method"].replace("get ", "").replace("set ", "")
        params = sig[sig.find("(") + 1: sig.rfind(")")] if "(" in sig else ""
        desc = re.sub(r"\s+", " ", r["description"]).strip()
        if desc.startswith("See "):
            desc = ""
        hook = 1 if r["kind"] == "Instance" and r["native"] else 0
        classes[r["class"]]["m"].append([name, KINDS.get(r["kind"], "i"), params, hook, desc[:120]])
    bridge = (ref / "ponte-e-bl.md").read_text(encoding="utf-8")
    bl = sorted({m for m in re.findall(r"`bl\.([A-Za-z_][\w.]*)", bridge)})
    out = {"source": "js-final", "classes": classes, "objects": data["objects"], "globals": GLOBALS, "bl": bl}
    target = ROOT / "web/data/js-index.json"
    target.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print("JS_INDEX classes=%d members=%d bl=%d bytes=%d" % (len(classes), sum(len(c["m"]) for c in classes.values()), len(bl), target.stat().st_size))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
