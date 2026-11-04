#!/usr/bin/env python3
"""Gera o indice inicial da API usado no autocomplete e na verificacao rapida.

Le as classes escritas a mao do Bunny Loader (Terraria/ModLoader e afins), no checkout indicado por
BUNNY_UPSTREAM. Os tipos gerados do jogo (Item, Player, ItemID...) nao estao no repositorio dele: deles
entra so o que o ExampleMod usa, marcado "parcial". No aparelho, o app troca este indice pelo que le do
BunnyLoader.dll instalado.
    BUNNY_UPSTREAM=../bunny-loader python3 tools/generate_sdk_index.py
Sem o checkout, mantem o web/data/sdk-index.json atual.
"""
from __future__ import annotations

import json
import os
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
UPSTREAM = Path(os.environ.get("BUNNY_UPSTREAM", ROOT / "build/bunny-upstream"))
API_DIR = UPSTREAM / "app/src/main/csharp/BunnyLoader/Terraria"
SAMPLES = UPSTREAM / "samples/ExampleModCSharp"
TARGET = ROOT / "web/data/sdk-index.json"

TYPE_RE = re.compile(
    r"\b(public)\s+((?:(?:abstract|sealed|static|readonly|partial)\s+)*)"
    r"(class|struct|enum|interface)\s+(\w+)(?:<[^>{]*>)?\s*(?::\s*([\w.]+))?")
DELEGATE_RE = re.compile(r"\bpublic\s+delegate\s+[^;]+;")
MEMBER_RE = re.compile(
    r"^(public|protected)\s+((?:(?:static|virtual|abstract|override|sealed|readonly|const|new|unsafe|extern)\s+)*)"
    r"([\w.]+(?:<[^()]*?>)?(?:\[\])?\??)\s+(\w+)\s*(\()?")


def blank_comments_and_strings(text: str) -> str:
    """Troca comentarios e o conteudo de strings por espacos, preservando offsets."""
    out = list(text)
    i, n = 0, len(text)
    while i < n:
        c = text[i]
        pair = text[i:i + 2]
        if pair == "//":
            while i < n and text[i] != "\n":
                out[i] = " "
                i += 1
        elif pair == "/*":
            end = text.find("*/", i + 2)
            end = n if end < 0 else end + 2
            for j in range(i, end):
                if text[j] != "\n":
                    out[j] = " "
            i = end
        elif pair == '@"':
            i += 2
            while i < n:
                if text[i:i + 2] == '""':
                    out[i] = out[i + 1] = " "
                    i += 2
                elif text[i] == '"':
                    i += 1
                    break
                else:
                    out[i] = " "
                    i += 1
        elif c == '"':
            i += 1
            while i < n and text[i] not in '"\n':
                if text[i] == "\\":
                    out[i] = " "
                    i += 1
                out[i] = " "
                i += 1
            i += 1
        elif c == "'" and re.match(r"'(\\.[^']*|[^\\'])'", text[i:i + 12]):
            size = re.match(r"'(\\.[^']*|[^\\'])'", text[i:i + 12]).end()
            for j in range(i + 1, i + size - 1):
                out[j] = " "
            i += size
        else:
            i += 1
    return "".join(out)


def matching_brace(text: str, opening: int) -> int:
    depth = 0
    for i in range(opening, len(text)):
        if text[i] == "{":
            depth += 1
        elif text[i] == "}":
            depth -= 1
            if depth == 0:
                return i
    return len(text)


def member_statements(body: str):
    """Fatia o corpo do tipo em declaracoes de primeiro nivel."""
    depth, start = 0, 0
    i = 0
    while i < len(body):
        c = body[i]
        if c in "{([":
            depth += 1
        elif c in "})]":
            depth -= 1
            if depth == 0 and c == "}":
                yield body[start:i + 1].strip()
                start = i + 1
                # "{ get; set; } = valor;" pertence a declaracao anterior
                rest = re.match(r"\s*=[^;]*;", body[start:])
                if rest:
                    start += rest.end()
                    i = start - 1
        elif c == ";" and depth == 0:
            yield body[start:i].strip()
            start = i + 1
        i += 1


def parse_params(statement: str, opening: int) -> str:
    depth = 0
    for i in range(opening, len(statement)):
        if statement[i] == "(":
            depth += 1
        elif statement[i] == ")":
            depth -= 1
            if depth == 0:
                return " ".join(statement[opening + 1:i].split())
    return ""


def parse_members(body: str) -> list[dict]:
    members = []
    for statement in member_statements(body):
        statement = re.sub(r"^(\[[^\]]*\]\s*)+", "", statement)
        statement = re.sub(r"^((?:public|protected)\s+(?:\w+\s+)*?)ref\s+(?:readonly\s+)?", r"\1", statement, count=1)
        match = MEMBER_RE.match(statement)
        if not match or match.group(3) in {"class", "struct", "enum", "interface", "delegate"}:
            continue
        mods = match.group(2).split()
        item = {"n": match.group(4), "t": match.group(3)}
        if match.group(5):
            item["k"] = "m"
            item["p"] = parse_params(statement, match.end() - 1)
        else:
            item["k"] = "c" if "const" in mods else "p"
            accessors = statement[match.end():]
            if re.search(r"\bset\b", accessors) and not re.search(r"\bprivate\s+set\b", accessors):
                item["w"] = 1
        if "static" in mods or "const" in mods:
            item["s"] = 1
        if "abstract" in mods:
            item["a"] = 1
        if "virtual" in mods:
            item["v"] = 1
        members.append(item)
    return members


def parse_enum(body: str) -> list[dict]:
    out = []
    for part in body.split(","):
        name = part.split("=")[0].strip()
        if re.fullmatch(r"\w+", name):
            out.append({"n": name, "t": "enum", "k": "e", "s": 1})
    return out


# Tipos gerados do jogo: membros so conhecidos pelo uso no ExampleMod.
GENERATED = {"Item": "Terraria", "Projectile": "Terraria", "NPC": "Terraria", "Player": "Terraria", "Main": "Terraria",
             "Dust": "Terraria", "Vector2": "Microsoft.Xna.Framework", "Color": "Microsoft.Xna.Framework",
             "Rectangle": "Microsoft.Xna.Framework", "MathHelper": "Microsoft.Xna.Framework"}
ID_CLASSES = ("ItemID", "TileID", "BuffID", "ProjectileID", "NPCID", "DustID", "SoundID", "ItemUseStyleID",
              "ItemRarityID", "ProjAIStyleID", "NPCAIStyleID", "WallID", "AmmoID", "NPCHitSound")


def sources() -> list[Path]:
    return sorted(path for path in API_DIR.rglob("*.cs") if "Core" not in path.relative_to(API_DIR).parts)


def build_index() -> dict:
    types: dict[str, dict] = {}
    for source in sources():
        text = blank_comments_and_strings(source.read_text(encoding="utf-8-sig"))
        ns = re.search(r"\bnamespace\s+([\w.]+)", text)
        for match in TYPE_RE.finditer(text):
            opening = text.find("{", match.end())
            terminator = text.find(";", match.end())
            if opening < 0 or (0 <= terminator < opening):
                continue
            closing = matching_brace(text, opening)
            body = text[opening + 1:closing]
            kind, name = match.group(3), match.group(4)
            entry = types.setdefault(name, {"kind": kind, "members": []})
            if ns:
                entry["ns"] = ns.group(1)
            base = match.group(5)
            if base and base.split(".")[-1] != name:
                entry["base"] = base.split(".")[-1]
            if "abstract" in match.group(2):
                entry["abstract"] = 1
            entry["members"].extend(parse_enum(body) if kind == "enum" else parse_members(body))
    sample = "\n".join(p.read_text(encoding="utf-8-sig") for p in SAMPLES.rglob("*.cs"))
    used: dict[str, set[str]] = {}
    for owner, member in re.findall(r"\b([A-Z]\w*)\.([A-Za-z_]\w*)", sample):
        if owner in GENERATED or owner in ID_CLASSES:
            used.setdefault(owner, set()).add(member)
    for owner, members in used.items():
        ns = GENERATED.get(owner, "Terraria.ID")
        entry = types.setdefault(owner, {"kind": "class", "members": [], "ns": ns})
        entry["partial"] = 1
        known = {m["n"] for m in entry["members"]}
        for member in sorted(members - known):
            entry["members"].append({"n": member, "t": "", "k": "p", "w": 1, **({"s": 1} if owner in ID_CLASSES else {})})
    return {"types": dict(sorted(types.items()))}


def main() -> int:
    if not API_DIR.is_dir():
        print("SDK_INDEX mantido: sem checkout em", UPSTREAM)
        return 0
    index = build_index()
    payload = json.dumps(index, ensure_ascii=False, separators=(",", ":"))
    TARGET.write_text(payload, encoding="utf-8")
    print(f"SDK_INDEX types={len(index['types'])} bytes={len(payload)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
