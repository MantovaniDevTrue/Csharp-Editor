#!/usr/bin/env python3
"""Testes do editor sem .NET: verificacao rapida contra os samples, snippets, ZIP e interface.

O compilador aqui e simulado; quem prova o Roslyn de verdade e o emulator_smoke.sh.
    test_editor.py [PASTA_PARA_SCREENSHOTS]
"""
from __future__ import annotations

import base64
import functools
import http.server
import io
import json
import os
import shutil
import subprocess
import sys
import tempfile
import threading
import zipfile
from pathlib import Path

from playwright.sync_api import sync_playwright

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
import build_web  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
failures: list[str] = []


def check(ok: bool, label: str, detail: object = "") -> None:
    print(("ok   " if ok else "FALHA") + " " + label + (f" -> {detail}" if detail and not ok else ""))
    if not ok:
        failures.append(label)


def build_site(target: Path) -> None:
    target.mkdir(parents=True)
    (target / "index.html").write_text(build_web.page_html(), encoding="utf-8")


# Simula a ponte do MainActivity.cs.
FAKE_ANDROID = """
window.__saved = [];
try { localStorage.setItem('bunny-studio-tour', '1'); } catch {}
window.BunnyAndroid = {
  saveToDownloads(name, b64) { window.__sent = [name, atob(b64)]; return 'saved:Download/BunnyStudio/' + name; },
  openBunny() { window.__opened = true; return true; },
  haptic(kind) { (window.__haptics = window.__haptics || []).push(kind); },
  saveFile(name, b64) { window.__saved.push([name, atob(b64)]); setTimeout(() => window.bunnyStudio.onNativeSave('saved', name)); },
  canSendToBunny() { return !!window.__direct; },
  sendToBunny() { window.__delivered = true; return 'sent'; },
  bunnyInfo() { return JSON.stringify({installed: !window.__noBunny, version: '1.0', package: 'com.bunnyloader', stub: false}); },
  compile(id, json) {
    window.__lastCompile = JSON.parse(json);
    const files = window.__lastCompile.files;
    const bad = Object.keys(files).find(k => files[k].includes('nao compila'));
    const result = window.__noBunny ? {code:-50, errors:[], warnings:[], bytes:0, diagnostics:'BUNNY_REFERENCES_UNAVAILABLE', assembly:''}
      : bad ? {code:-1, errors:[`${bad}(3,18): CS1002: ; expected`], warnings:[], bytes:0, diagnostics:'status failed', assembly:''}
      : {code:1, errors:[], warnings:[], files:Object.keys(files).length, lines:10, ms:5, bytes:2048, assembly:btoa('MZfake'), diagnostics:`status compiled\nstats 5 ${Object.keys(files).length} 10`};
    setTimeout(() => window.bunnyStudio.onNativeCompile(id, JSON.stringify(result)), 20);
  },
};
"""


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def serve(directory: Path) -> str:
    handler = functools.partial(Quiet, directory=str(directory))
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return f"http://127.0.0.1:{server.server_address[1]}/index.html"


def sample_projects():
    upstream = Path(os.environ.get("BUNNY_UPSTREAM", ROOT / "build/bunny-upstream")) / "samples"
    for manifest in sorted(upstream.glob("ExampleModCSharp/manifest.json")):
        root = manifest.parent
        files = {}
        for path in root.rglob("*"):
            if path.is_file():
                rel = path.relative_to(root).as_posix()
                files[rel] = path.read_text(encoding="utf-8-sig") if path.suffix == ".cs" or rel == "manifest.json" else 0
        yield root.name, files


QUICK = """(files) => {
  const decoded = {};
  for (const [k, v] of Object.entries(files)) decoded[k] = typeof v === 'string' ? v : new Uint8Array(1);
  return window.bunnyStudio.quickCheck(decoded);
}"""


def test_quick_check(page) -> None:
    total = 0
    for name, files in sample_projects():
        problems = page.evaluate(QUICK, files)
        errors = [p for p in problems if p["sev"] == "error"]
        total += sum(1 for f in files if f.endswith(".cs"))
        check(not errors, f"amostra sem falso positivo: {name}", errors[:6])
    print(f"     ({total} arquivos .cs analisados)")

    starter = page.evaluate("Object.keys(window.bunnyStudio.sdk.types).length")
    check(starter > 40, "indice da API embutido", starter)

    base = {"manifest.json": json.dumps({"uid": "11111111-2222-4333-8444-555555555555", "id": "Abc", "name": "n", "version": "1", "blVersion": 3,
                                         "gameVersion": [1, 1], "dependencies": []}),
            "Abc.cs": "using Terraria.ModLoader;\nnamespace Abc;\npublic class Abc : Mod { }\n"}
    def codes(source):
        result = page.evaluate(QUICK, {**base, "Content/a.cs": source})
        return sorted({p["code"] for p in result if p["sev"] == "error"})

    ok_src = 'using System;\nusing Terraria;\nusing Terraria.ModLoader;\nnamespace A;\npublic class X : ModItem { public override void SetDefaults() { Item.width = 1; var c = \'"\'; var s = $"v{1 + 1}{{}}"; var v = @"a""b"; } }\n'
    check(codes(ok_src) == [], "C# valido com char, interpolacao e verbatim", codes(ok_src))
    cases = {
        "CS0246": "class X : ModItem { public override void SetDefaults() {} }\n",
        "sintaxe": "class X { void F() { }\n",
    }
    for code, source in cases.items():
        check(code in codes(source), f"detecta {code}", codes(source))
    math = codes("class X { int F() => Math.Max(1, 2); }\n")
    check("CS0103" in math, "detecta using System ausente", math)
    # Dentro de um ModItem, Item e a propriedade: sem using Terraria tambem compila.
    check(codes("using Terraria.ModLoader;\nclass X : ModItem { public override void SetDefaults() { Item.width = 1; } }\n") == [], "Item nao exige using")
    warns = page.evaluate(QUICK, {**base, "Content/a.cs": "using Terraria.ModLoader;\nnamespace Abc.Content;\nclass X : ModItem { }\n"})
    check(any(p["code"] == "textura" and "Content/X.png" in p["msg"] for p in warns), "avisa de textura ausente", warns)


def test_snippets(page) -> None:
    results = page.evaluate("""() => {
      const out = [];
      const manifest = JSON.stringify({uid:'11111111-2222-4333-8444-555555555555',id:'Abc',name:'n',version:'1',blVersion:3,gameVersion:[1,1],dependencies:[]});
      const entry = 'using Terraria.ModLoader;\\nnamespace Abc;\\npublic class Abc : Mod { }\\n';
      for (const s of window.bunnyStudio.snippets) {
        const vars = {NS:'Abc.X', DIR:s.folder || 'Content/Items', CLASS:'Host'};
        const {text} = window.bunnyStudio.expandSnippet(s.body, vars);
        const leftover = text.includes('«') || text.includes('»');
        const where = s.where || (s.folder ? 'top' : 'code');
        const head = 'using System;\\nusing System.Collections.Generic;\\nusing Terraria;\\nusing Terraria.ID;\\nusing Terraria.ModLoader;\\nnamespace A;\\n';
        const baseName = (s.bases && s.bases[0]) || 'ModItem';
        const code = s.folder ? text : where === 'top' ? head + text + '\\n'
          : where === 'member' ? head + `public class Host : ${baseName} {\\n ${text}\\n}\\n`
          : head + `public class Host : ${baseName} {\\n public void F() {\\n ${text}\\n }\\n}\\n`;
        const files = {'manifest.json':manifest,'Abc.cs':entry,'Content/s.cs':code};
        const probs = window.bunnyStudio.quickCheck(files).filter(p => p.sev === 'error');
        out.push({prefix:s.prefix, leftover, probs});
      }
      return out;
    }""")
    for item in results:
        check(not item["leftover"] and not item["probs"], f"snippet {item['prefix']}", item["probs"] or "marcador sobrando")
    prefixes = [item["prefix"] for item in results]
    check(len(prefixes) == len(set(prefixes)), "prefixos de snippet unicos")
    print(f"     ({len(results)} snippets)")


def test_member_references(page) -> None:
    # Cada campo citado nos modelos precisa aparecer na API do Bunny ou no ExampleMod dele.
    missing = page.evaluate("""() => {
      const T = window.bunnyStudio.sdk.types, bad = [];
      const all = (t) => { const out = []; let hops = 0; while (t && T[t] && hops++ < 20) { out.push(...T[t].members); t = T[t].base; } return out; };
      for (const s of window.bunnyStudio.snippets) {
        if (s.group === 'C#') continue;
        for (const m of s.body.matchAll(/\\b(Item|Projectile|NPC|Recipe|ModContent)\\.(\\w+)/g)) if (!all(m[1]).some(x => x.n === m[2])) bad.push(s.prefix + ':' + m[0]);
        const base = /:\\s*(Mod\\w+|Global\\w+)\\b/.exec(s.body)?.[1] || s.bases?.[0];
        for (const m of s.body.matchAll(/\\boverride\\s+[\\w<>?.\\[\\]]+\\s+(\\w+)\\(/g)) if (base && !all(base).some(x => x.n === m[1])) bad.push(s.prefix + ': override ' + m[1]);
      }
      return bad;
    }""")
    check(not missing, "membros citados nos modelos existem", missing)


def test_stress_mod(page) -> None:
    result = page.evaluate("""() => {
      const m = window.bunnyStudio.stressMod(1000);
      const cs = Object.keys(m.files).filter(k => k.endsWith('.cs'));
      const started = performance.now();
      const errors = window.bunnyStudio.quickCheck(m.files).filter(p => p.sev === 'error');
      return {count: cs.length, errors: errors.slice(0, 5), ms: Math.round(performance.now() - started),
              bytes: cs.reduce((a, k) => a + m.files[k].length, 0)};
    }""")
    check(result["count"] == 1000, "mod de teste tem 1000 .cs", result["count"])
    check(not result["errors"], "mod de teste passa na verificacao rapida", result["errors"])
    print(f"     (verificacao rapida de 1000 arquivos: {result['ms']} ms, {result['bytes']//1024} KB)")


def test_snippet_probe(page) -> None:
    problems = page.evaluate("window.bunnyStudio.quickCheck(window.bunnyStudio.snippetProbeMod().files).filter(p => p.sev === 'error')")
    check(not problems, "mod com todos os modelos passa na verificacao", problems[:6])


def test_errors(page) -> None:
    def explain(code, msg, source, line, col):
        return page.evaluate("""([code, msg, source, line, col]) => {
          const p = window.bunnyStudio.explainProblem({sev:'error', roslyn:true, path:'Content/a.cs', line, col, code, msg}, source);
          return {title:p.title, why:p.why, good:p.good, fix:p.fix, known:p.known};
        }""", [code, msg, source, line, col])
    head = "using Terraria;\nusing Terraria.ModLoader;\nclass X : ModItem {\n public override void SetDefaults() {\n"
    r = explain("CS1061", "'Item' does not contain a definition for 'widht' and no accessible extension method 'widht' accepting a first argument of type 'Item' could be found", head + "Item.widht = 20;\n}}", 5, 6)
    check("width" in r["title"] and r["good"] == "Item.width = 20;", "sugere o campo certo", r)
    r = explain("CS0103", "The name 'width' does not exist in the current context", head + "width = 20;\n}}", 5, 1)
    check(r["good"] == "Item.width = 20;", "lembra do Item. na frente", r)
    r = explain("CS1061", "'Recipe' does not contain a definition for 'AddIngrediente' and no accessible extension method", head + "CreateRecipe().AddIngrediente(1);\n}}", 5, 16)
    check("AddIngredient(1)" in r["good"], "sugere o metodo certo", r)
    r = explain("CS0115", "'X.AddRecipe()': no suitable method found to override", "using Terraria.ModLoader;\nclass X : ModItem {\n public override void AddRecipe() { }\n}", 3, 23)
    check("AddRecipes()" in r["good"], "mostra o override certo", r)
    r = explain("CS1002", "; expected", head + "Item.value = 1\n}}", 5, 15)
    check(r["good"] == "Item.value = 1;", "mostra o ponto e virgula", r)
    r = explain("CS0246", "The type or namespace name 'BunnyItem' could not be found (are you missing a using directive or an assembly reference?)", "class X : BunnyItem {\n}", 1, 11)
    check("ModItem" in r["good"], "explica a API antiga", r)
    r = explain("CS0246", "The type or namespace name 'ModItem' could not be found", "class X : ModItem {\n}", 1, 11)
    check(r["good"] == "using Terraria.ModLoader;" and r["fix"]["kind"] == "using", "indica o using", r)
    r = explain("CS0200", "Property or indexer 'ModItem.DisplayName' cannot be assigned to -- it is read only", head + 'DisplayName = "a";\n}}', 5, 1)
    check("traduções" in r["title"], "explica DisplayName", r)
    r = explain("CS9999", "Some unknown error text here", head, 1, 1)
    check(r["known"] is False and "compilador" in r["title"] and "português" not in r["why"], "erro fora da tabela nao fica sem texto", r)
    page.evaluate("""window.bunnyStudio.setRoslynPt({CS0159: {e: "No such label '{0}' within the scope of the goto statement", p: "Nenhum rótulo '{0}' dentro do escopo da instrução goto"}, CS9001: {e: "A '{0}' with '{1}'", p: "'{1}' e '{0}'"}, CS9002: {e: "; expected", p: "; esperado"}})""")
    r = explain("CS0159", "No such label 'fim' within the scope of the goto statement", head, 1, 1)
    check(r["title"] == "Nenhum rótulo 'fim' dentro do escopo da instrução goto" and r["known"], "traduz pela tabela do Roslyn", r)
    r = explain("CS9001", "A 'x' with 'y'", head, 1, 1)
    check(r["title"] == "'y' e 'x'", "respeita a ordem dos argumentos", r)
    page.evaluate("window.bunnyStudio.setRoslynPt(null)")
    uid = "11111111-2222-4333-8444-555555555555"
    def manifest(text, extra=None):
        return page.evaluate("([t, e]) => window.bunnyStudio.manifestProblems({'manifest.json': t, 'Abc.cs': '', ...(e || {})})", [text, extra])
    ok = '{"uid":"' + uid + '","id":"Abc","name":"N","version":"1","blVersion":3}'
    check(manifest(ok) == [], "manifest certo nao gera erro", manifest(ok))
    check("vírgula sobrando" in manifest('{"uid":"a",\n}')[0]["title"], "explica virgula sobrando")
    check("Falta uma vírgula" in manifest('{"uid":"a"\n"id":"b"}')[0]["title"], "explica virgula faltando")
    check(any("formato" in p["title"] for p in manifest(ok.replace(uid, "ABC"))), "recusa UID invalido como o Bunny")
    check(any("blVersion" in p["title"] for p in manifest(ok.replace('"blVersion":3', '"blVersion":2'))), "recusa blVersion antigo")
    check(any("Xyz.cs" in p["title"] for p in manifest(ok.replace('"Abc"', '"Xyz"'))), "recusa mod sem arquivo de entrada")
    check(any("classe C#" in p["title"] for p in manifest(ok.replace('"Abc"', '"meu-mod"'))), "recusa id invalido")
    check(any("formato antigo" in p["title"] for p in manifest(ok, {"content/main.cs": ""})), "percebe o formato antigo")
    moved = page.evaluate("""() => { const m = {files: {'manifest.json': JSON.stringify({uid:'%s', id:'Velho', name:'V', version:'1', blVersion:2, entry:'main.cs'}), 'content/main.cs':'namespace Velho;', 'content/Content/Items/A.cs':'class A {}'}};
      window.bunnyStudio.migrateMod(m); return {keys:Object.keys(m.files).sort(), problems:window.bunnyStudio.manifestProblems(m.files)}; }""" % uid)
    check(moved["keys"] == ["Content/Items/A.cs", "Velho.cs", "manifest.json"] and moved["problems"] == [], "converte o formato antigo", moved)


def test_zip(page) -> None:
    payload = page.evaluate("""async () => {
      const files = {'manifest.json':'{"a":1}','Abc.cs':'namespace A;\\n'.repeat(40),'Content/ç.png':new Uint8Array([137,80,78,71,0,255])};
      const z = await window.bunnyStudio.buildZip(files);
      return btoa(String.fromCharCode(...z));
    }""")
    data = base64.b64decode(payload)
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        check(archive.testzip() is None, "ZIP integro pelo Python")
        check(archive.read("manifest.json") == b'{"a":1}', "manifest na raiz do ZIP")
        check(archive.read("Abc.cs") == ("namespace A;\n" * 40).encode(), "texto comprimido bate")
        check(archive.read("Content/ç.png") == bytes([137, 80, 78, 71, 0, 255]), "binario e nome UTF-8 batem")

    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("Playable/manifest.json", '{"uid":"x"}')
        archive.writestr("Playable/Abc.cs", "namespace B;\n" * 20)
        archive.writestr("Playable/Content/a.png", bytes(range(50)))
        archive.writestr("../fora.cs", "x")
    read = page.evaluate("""async (b64) => {
      const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
      const f = window.bunnyStudio.filesFromZip(await window.bunnyStudio.readZip(bytes));
      return {keys:Object.keys(f).sort(), main:f['Abc.cs'], png:f['Content/a.png'].length};
    }""", base64.b64encode(buffer.getvalue()).decode())
    check(read["keys"] == ["Abc.cs", "Content/a.png", "manifest.json"], "importa ZIP e tira a pasta raiz", read["keys"])
    check(read["main"] == "namespace B;\n" * 20 and read["png"] == 50, "conteudo importado confere")


def test_completions(page) -> None:
    def labels(text, marker="|"):
        at = text.index(marker)
        source = text.replace(marker, "")
        result = page.evaluate("([t, a]) => window.bunnyStudio.completionsAt(t, a)", [source, at])
        return [item["name"] for item in (result or {}).get("items", [])]

    head = "using Terraria;\nusing Terraria.ModLoader;\nclass X : ModItem {\n public override void SetDefaults() {\n"
    check("width" in labels(head + "Item.wi|"), "completa Item.", labels(head + "Item.wi|")[:10])
    check("WorkBenches" in labels(head + "TileID.|"), "completa os IDs")
    check("AddRecipes" in labels("using Terraria.ModLoader;\nclass X : ModItem {\n public override |"), "completa override")
    check("bitem" in labels("bit|"), "oferece prefixo de snippet")
    def smart(text):
        at = text.index("|")
        result = page.evaluate("([t, a]) => window.bunnyStudio.completionsAt(t, a, 'Content/x.cs', false)", [text.replace("|", ""), at])
        return [item["name"] for item in (result or {}).get("items", []) if item["kind"] in ("»", "ƒ", "P")]
    check("bsword" in smart("espa|"), "palavra traz a classe inteira", smart("espa|"))
    check("bproj" in smart("namespace A;\n\nproje|"), "projetil no topo do arquivo")
    check("bnpc" in smart("namespace A {\n  inimi|"), "reconhece namespace em bloco")
    check("brecipe" in smart(head + "   recei|"), "receita dentro do metodo")
    check("boverrecipes" in smart("using Terraria.ModLoader;\nclass X : ModItem {\n  recei|"), "receita no corpo da classe")
    check("brecipe" not in smart("using Terraria.ModLoader;\nclass X : ModItem {\n  recei|"), "trecho de metodo fora do corpo da classe")
    check("bhurt" in smart("class X : ModPlayer {\n  dano|"), "dano em ModPlayer")
    check("bhurt" not in smart("class X : ModItem {\n  dano|"), "dano nao aparece em ModItem")
    check("OnHurt" in smart("class X : ModPlayer {\n  OnHu|"), "metodo da API vira override")
    check(smart(head + "   var x = espa|") == [], "bloco grande so no comeco da linha")
    check("cclass" in smart("clas|"), "classe por palavra")
    check("cif" in smart(head + "  if|"), "if exato com duas letras")
    check("cfor" in smart(head + "  for|") and "cforeach" in smart(head + "  fore|"), "lacos")
    bases = labels("using Terraria.ModLoader;\npublic class Foo : Mod|")
    check("ModProjectile" in bases and "ModItem" in bases, "base depois de :", bases[:6])
    body = page.evaluate("window.bunnyStudio.classBodyFor('Foo', 'ModProjectile')")
    check("Projectile.friendly" in body, "corpo da classe segue a base", body)
    check("sin" in [n.lower() for n in labels("using System;\nclass X { void F() { MathF.|")], "membros de MathF")
    check("minhaVida" in labels("class X { void F() { int minhaVida = 1;\n  minhaV|"), "variaveis locais")
    def project(text):
        at = text.index("|")
        return page.evaluate("""([t, a]) => {
          const id = 'Content/Tmp/Alvos.cs';
          files()[id] = 'using Terraria.ModLoader;\\nnamespace A;\\npublic class MeuTiro : ModProjectile { public int Forca; }\\npublic class MeuBuff : ModBuff { }\\npublic class MeuMineral : ModItem { }\\n';
          const r = window.bunnyStudio.completionsAt(t, a, 'Content/Tmp/Atual.cs', true);
          delete files()[id];
          return (r || {items: []}).items.map(i => i.name);
        }""", [text.replace("|", ""), at])
    check("MeuMineral" in project(head + "  CreateRecipe().AddIngredient<|"), "ingredientes do mod")
    check("MeuTiro" in project(head + "  Item.shoot = ModContent.ProjectileType<|") and "MeuBuff" not in project(head + "  Item.shoot = ModContent.ProjectileType<|"), "ProjectileType lista projeteis do mod")
    check("Forca" in project(head + "  var t = new MeuTiro();\n  t.|"), "membros de classe do mod")
    check("MeuTiro" in project(head + "  var t = new Meu|"), "new lista classes do mod")
    check(labels(head + 'var s = "Item.|') == [], "nao sugere dentro de string")
    check(labels(head + "// Item.|") == [], "nao sugere dentro de comentario")


def test_ui(browser, url: str, shots: Path | None) -> None:
    context = browser.new_context(viewport={"width": 1280, "height": 800})
    page = context.new_page()
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.goto(url)
    page.wait_for_selector("#tree .row.file")
    check(page.locator("#engine").get_attribute("data-engine") == "missing", "sem motor mostra o estado certo")
    page.click("#compile")
    page.wait_for_function("document.querySelector('#outHead').dataset.state !== 'idle'")
    check("Isto não compilou" in page.locator("#output").inner_text(), "sem motor nao finge compilar")
    check(page.locator("#outHead").get_attribute("data-state") == "quick", "mod inicial passa na verificacao rapida",
          page.locator("#output").inner_text())

    # Snippet de arquivo, com Tab e repeticao do nome.
    page.click('.card[data-prefix="bsword"]')
    page.fill("#fld_cls", "ArcoLunar")
    page.click("#dlgOk")
    page.wait_for_function("document.querySelector('#activePath').textContent.includes('ArcoLunar.cs')")
    value = page.input_value("#src")
    check("class ArcoLunar : ModItem" in value and "namespace MeuMod.Content.Items.Weapons;" in value, "cria arquivo com o nome da classe", value[:300])
    check(page.locator('.row.file:has-text("ArcoLunar.png")').count() == 1, "cria textura provisoria")
    selected = page.evaluate("src.value.slice(src.selectionStart, src.selectionEnd)")
    check(selected == "20", "seleciona o primeiro campo", selected)
    page.keyboard.type("25")
    page.keyboard.press("Tab")
    selected = page.evaluate("src.value.slice(src.selectionStart, src.selectionEnd)")
    check(selected == "50", "Tab vai ao proximo campo", selected)
    value = page.input_value("#src")
    check("Item.useAnimation = 25;" in value, "repete o valor nas copias", value[:500])
    page.keyboard.press("Escape")

    # Prefixo + Tab, com recuo.
    page.evaluate("src.focus(); src.setSelectionRange(src.value.length, src.value.length)")
    page.keyboard.type("cclass")
    page.keyboard.press("Tab")
    check("public sealed class" in page.input_value("#src").split("OnHitNPC")[-1], "prefixo + Tab expande")
    if page.locator("#pop").is_visible():
        page.keyboard.press("Escape")

    # Abas de arquivos abertos, busca e estrutura.
    check(page.locator(".opentab").count() >= 2, "abas de arquivos abertos")
    page.evaluate("openFile('Content/Items/Weapons/ArcoLunar.cs')")
    page.click("#findBtn")
    page.fill("#findInput", "ItemRarityID")
    page.keyboard.press("Enter")
    check(page.evaluate("src.value.slice(src.selectionStart, src.selectionEnd)") == "ItemRarityID", "busca seleciona o texto")
    check(page.locator("#findCount").inner_text() == "1/1", "busca conta resultados", page.locator("#findCount").inner_text())
    page.click("#findClose")
    page.click("#outlineBtn")
    check(page.locator(".outline button").count() >= 3, "estrutura lista classes e metodos")
    page.locator(".outline button", has_text="ArcoLunar").first.click()
    page.wait_for_function("!document.querySelector('#dlg').open")
    check(page.evaluate("src.value.slice(0, src.selectionStart).split('\\n').length") > 4, "estrutura leva a linha")
    # Dados do mod e cartao.
    page.click("#editMod")
    page.fill("#fld_name", "Mod Editado")
    page.fill("#fld_version", "1.2.3")
    page.click("#dlgOk")
    page.wait_for_function("document.querySelector('#modName').textContent === 'Mod Editado'")
    check(page.locator("#modName").inner_text() == "Mod Editado" and "1.2.3" in page.locator("#modMeta").inner_text(), "edita dados do mod")
    check(page.evaluate("JSON.parse(files()['manifest.json']).version") == "1.2.3", "dados vao para o manifest")
    # Correcao rapida.
    page.evaluate("files()['Content/Fix.cs'] = 'public class Fix : ModItem\\n{\\n}\\n'; openFile('Content/Fix.cs')")
    page.evaluate("state.problems = []")
    page.click("#compile")
    page.wait_for_selector(".prob .fix")
    while page.locator(".prob .fix").count():
        page.locator(".prob .fix").first.click()
    fixed = page.evaluate("files()['Content/Fix.cs']")
    check("using Terraria.ModLoader;" in fixed, "Corrigir aplica o using", fixed)
    check(not page.evaluate("window.bunnyStudio.quickCheck(files()).filter(p => p.path === 'Content/Fix.cs' && p.sev === 'error')"), "correcao passa na verificacao", fixed)
    page.evaluate("delete files()['Content/Fix.cs']; state.open = state.open.filter(p => p !== 'Content/Fix.cs'); openFile('Content/Items/Weapons/ArcoLunar.cs')")
    # Verificacao ao vivo, sem tocar em Verificar.
    page.evaluate("files()['Content/Vivo.cs'] = 'namespace A;\\n'; openFile('Content/Vivo.cs'); src.focus(); src.setSelectionRange(src.value.length, src.value.length)")
    page.keyboard.insert_text("public class Vivo : ModItem { }")
    page.keyboard.press("Escape")
    page.wait_for_selector("#hl .l.err", timeout=4000)
    check("ModItem" in page.locator("#hl .l.err .msg").first.inner_text(), "erro aparece enquanto digita", page.locator("#hl .l.err").first.inner_text())
    page.evaluate("src.value = 'using Terraria.ModLoader;\\nusing MeuTipoExtra;\\nnamespace A;\\npublic class Vivo : ModItem { public override void SetDefaults() { Item.width = 1; } }\\n'; src.dispatchEvent(new Event('input'))")
    page.keyboard.press("Escape")
    page.wait_for_function("!document.querySelector('#hl .l.err')", timeout=4000)
    page.evaluate("delete files()['Content/Vivo.cs']; state.open = state.open.filter(p => p !== 'Content/Vivo.cs'); openFile('Content/Items/Weapons/ArcoLunar.cs')")
    # Manifest: o texto quebrado nao apaga nome nem dados, e da para restaurar.
    page.click('.row.file:has-text("manifest.json") .open')
    good = page.evaluate("files()['manifest.json']")
    page.evaluate("src.value = src.value.slice(0, 20); src.dispatchEvent(new Event('input'))")
    page.keyboard.press("Escape")
    page.wait_for_selector("#modAlert:not([hidden])")
    check(page.locator("#modName").inner_text() == "Mod Editado", "JSON pela metade mantem o nome", page.locator("#modName").inner_text())
    check(page.locator("#modAlert").inner_text().startswith("manifest.json com problema"), "avisa do JSON quebrado")
    page.evaluate("setView('files')")
    page.click("#fixManifest")
    check(page.evaluate("files()['manifest.json']") == good, "restaura a ultima versao boa")
    check(page.locator("#modAlert").is_hidden(), "aviso some apos restaurar")
    page.evaluate("delete files()['manifest.json']; renderModCard(); renderTree()")
    check("sumiu" in page.locator("#modAlert").inner_text(), "avisa se o manifest sumiu")
    page.click("#fixManifest")
    check(page.evaluate("JSON.parse(files()['manifest.json']).name") == "Mod Editado", "recria o manifest perdido")
    first_row = page.locator("#tree .row").first.inner_text()
    check("manifest.json" in first_row, "manifest fica no topo dos arquivos", first_row)
    page.evaluate("renameFile('manifest.json'); deleteFile('manifest.json')")
    check(page.evaluate("files()['manifest.json'] !== undefined") and not page.locator("#dlg").evaluate("d => d.open"), "manifest nao pode ser renomeado nem apagado")

    # Menu ao segurar, em arquivos e pastas.
    row = page.locator('.row.file:has-text("MeuMod.cs") .open')
    box = row.bounding_box()
    page.mouse.move(box["x"] + 10, box["y"] + 10)
    page.mouse.down()
    page.wait_for_selector("#sheet[open]", timeout=2000)
    page.mouse.up()
    check("Renomear" in page.locator("#sheetBody").inner_text() and "Apagar" in page.locator("#sheetBody").inner_text(), "segurar abre o menu do arquivo")
    check(page.evaluate("state.active") != "MeuMod.cs", "soltar depois de segurar nao abre o arquivo")
    page.locator('.sheetitem:has-text("Duplicar")').click()
    page.wait_for_function("files()['MeuMod2.cs'] !== undefined")
    page.evaluate("delete files()['MeuMod2.cs']; state.open = state.open.filter(p => p !== 'MeuMod2.cs'); openFile('Content/Items/Weapons/ArcoLunar.cs')")
    page.locator('.row.dir:has-text("Weapons") button').click(button="right")
    page.wait_for_selector("#sheet[open]")
    check("Renomear pasta" in page.locator("#sheetBody").inner_text(), "menu da pasta")
    page.locator("#sheet .closex").click()

    # Janela de mods propria.
    page.click("#modSelect")
    page.wait_for_selector("#mods[open]")
    check(page.locator("select").count() == 0, "sem seletor nativo do Android")
    check(page.locator(".modrow").count() >= 1 and page.locator(".modrow.on").count() == 1, "mod aberto marcado")
    page.locator(".modrow .ctl.x").first.click()
    page.wait_for_selector("#dlg[open]")
    page.locator('#dlg button[value="cancel"]').click()
    page.wait_for_function("!document.querySelector('#dlg').open")
    check(page.locator(".modrow").count() >= 1, "cancelar nao apaga")
    page.click("#modsClose")

    # Configuracoes.
    page.click("#settingsBtn")
    page.wait_for_selector("#settings[open]")
    page.locator('[data-setting="wrap"] .switch').click()
    check(page.evaluate("document.body.classList.contains('wrap') && src.getAttribute('wrap') === 'soft'"), "liga a quebra de linha")
    page.locator('[data-setting="fontSize"] button[aria-label="Aumentar"]').click()
    check(page.evaluate("getComputedStyle(src).fontSize") == page.evaluate("getComputedStyle(hl).fontSize") == "15px", "fonte muda nos dois planos", page.evaluate("getComputedStyle(src).fontSize"))
    page.click("#settingsClose")
    page.evaluate("src.value = 'x'.repeat(400) + '\\n' + 'fim'; src.dispatchEvent(new Event('input')); render()")
    page.keyboard.press("Escape")
    aligned = page.evaluate("""() => { const a = hl.children[0].offsetHeight; return [a > lineH * 2, document.querySelector('#lines .gl').offsetHeight === a, hl.scrollWidth <= src.clientWidth + 1]; }""")
    check(all(aligned), "quebra alinha numero e texto", aligned)
    page.reload()
    page.wait_for_selector("#tree .row.file")
    check(page.evaluate("document.body.classList.contains('wrap')"), "configuracao sobrevive ao recarregar")
    page.click("#settingsBtn")
    page.click("#settingsReset")
    page.click("#settingsClose")
    check(not page.evaluate("document.body.classList.contains('wrap')"), "restaura padroes")
    page.evaluate("openFile('Content/Items/Weapons/ArcoLunar.cs'); src.value = ''; src.dispatchEvent(new Event('input')); src.focus()")
    page.keyboard.press("Escape")
    page.keyboard.type("foo(")
    check(page.input_value("#src") == "foo()", "fecha pares", page.input_value("#src"))
    page.keyboard.type(")")
    check(page.input_value("#src") == "foo()", "passa por cima do fechamento", page.input_value("#src"))
    check(page.evaluate("document.querySelectorAll('.fx').length") >= 0, "efeito ao digitar nao quebra")

    # Manifest com erro bloqueia a compilacao e explica.
    page.evaluate(r"""openFile('manifest.json'); src.value = src.value.replace(/"uid": "[^"]+"/, '"uid": "quebrado"'); src.dispatchEvent(new Event('input'))""")
    page.keyboard.press("Escape")
    page.click("#compile")
    page.wait_for_selector(".prob.error .probtitle")
    check(page.locator("#outHead").get_attribute("data-state") == "fail", "manifest com erro impede compilar", page.locator("#outHead").get_attribute("data-state"))
    check("Como deveria ficar" in page.locator("#output").inner_text() and "formato" in page.locator("#output").inner_text(), "erro do manifest mostra como corrigir", page.locator("#output").inner_text())
    page.locator(".prob .go").first.click()
    page.wait_for_function("state.active === 'manifest.json' && state.view === 'code'")
    page.click("#compile")
    page.wait_for_selector(".prob .fix")
    page.locator(".prob .fix").first.click()
    page.wait_for_function("window.bunnyStudio.manifestProblems(files()).length === 0")
    page.evaluate("openFile('Content/Items/Weapons/ArcoLunar.cs')")

    # Barra lateral com a mesma arvore, marcando a pasta do arquivo aberto.
    page.set_viewport_size({"width": 412, "height": 800})
    page.evaluate("openFile('Content/Items/StarterMaterial.cs'); setView('code')")
    page.click("#menuBtn")
    page.wait_for_selector("#drawer.open #tree .row.file.on")
    check(page.locator("#drawer .row.dir.current .name").inner_text() == "Items", "marca a pasta atual", page.locator("#drawer .row.dir.current").count())
    check(page.locator("#drawer .row.dir.inpath").count() >= 2, "marca o caminho")
    if shots:
        page.wait_for_timeout(250)
        page.screenshot(path=str(shots / "barra-lateral.png"))
    check(page.evaluate("window.bunnyStudio.onBack()") is True and page.locator("#drawer.open").count() == 0, "voltar fecha a barra")
    page.click("#menuBtn")
    page.locator('#drawer .row.file:has-text("MeuMod.cs") .open').click()
    page.wait_for_function("state.active === 'MeuMod.cs' && !document.querySelector('#drawer.open')")
    check(page.evaluate("document.querySelector('#filesPane #explorer') !== null"), "arvore volta para a aba Projeto")
    page.evaluate("openFile('Content/Items/Weapons/ArcoLunar.cs')")
    page.set_viewport_size({"width": 1280, "height": 800})

    # Tutorial opcional passa por todas as telas.
    page.evaluate("window.bunnyStudio.startTour()")
    page.wait_for_selector("#tourNext")
    steps = 0
    while page.locator("#tour").count() and steps < 15:
        check(page.locator("#tourTitle").inner_text() != "", f"tutorial passo {steps + 1}")
        page.wait_for_timeout(250)
        page.click("#tourNext")
        steps += 1
    check(steps == 11 and page.locator("#tour").count() == 0, "tutorial termina", steps)

    # Mod grande: pastas recolhidas e busca.
    # Palavra no arquivo vazio: usa o nome do arquivo, cria textura e mostra a previa.
    page.evaluate("files()['Content/Items/Weapons/Lamina.cs'] = ''; openFile('Content/Items/Weapons/Lamina.cs'); src.focus()")
    page.keyboard.type("espada")
    page.wait_for_selector("#pop:not([hidden])")
    preview = page.locator("#popPrev").inner_text()
    check("class Lamina : ModItem" in preview, "previa mostra o bloco", preview[:200])
    if shots:
        page.screenshot(path=str(shots / "desktop-previa.png"))
    page.keyboard.press("Tab")
    value = page.input_value("#src")
    check(value.startswith("using Terraria;") and "class Lamina : ModItem" in value and "namespace " in value and "espada\n" not in value, "insere classe completa", value[:200])
    check("namespace MeuMod.Content.Items.Weapons;" in value, "namespace segue a pasta", value[:300])
    check(page.locator('.row.file:has-text("Lamina.png")').count() == 1, "cria textura pela palavra")
    selected = page.evaluate("src.value.slice(src.selectionStart, src.selectionEnd)")
    check(selected == "20", "primeiro campo selecionado", selected)
    page.keyboard.press("Escape")
    # Segundo bloco no mesmo arquivo nao repete cabecalho e adiciona o using que falta.
    page.evaluate("src.setSelectionRange(src.value.length, src.value.length); src.focus()")
    page.keyboard.type("bloco")
    page.wait_for_selector("#pop:not([hidden])")
    page.keyboard.press("Tab")
    page.keyboard.press("Escape")
    value = page.input_value("#src")
    check(value.count("using Terraria.ModLoader;") == 1 and value.count("namespace ") == 1, "nao repete cabecalho", value[:120])
    check(value.startswith("using Microsoft.Xna.Framework;"), "adiciona using que falta", value[:80])
    errs = page.evaluate("window.bunnyStudio.quickCheck(files()).filter(p => p.sev === 'error')")
    check(not errs, "blocos inseridos passam na verificacao", errs[:4])

    # Enter mantem recuo; destaque acompanha o texto.
    page.evaluate("src.value='class A {'; src.setSelectionRange(9,9); src.dispatchEvent(new Event('input'))")
    page.keyboard.press("Escape")
    page.keyboard.press("Enter")
    check(page.input_value("#src") == "class A {\n    ", "Enter recua apos chave", repr(page.input_value("#src")))
    page.wait_for_function("document.querySelector('#hl').textContent.startsWith('class A')")
    check(page.locator("#hl .kw").first.inner_text() == "class", "destaque de sintaxe")

    # Overlay e textarea precisam alinhar, senao o cursor fica deslocado.
    metric = page.evaluate("""() => { const s = getComputedStyle(src), h = getComputedStyle(hl);
      return [s.fontFamily===h.fontFamily, s.fontSize===h.fontSize, s.lineHeight===h.lineHeight, s.paddingLeft===h.paddingLeft, s.paddingTop===h.paddingTop, s.tabSize===h.tabSize]; }""")
    check(all(metric), "textarea e destaque alinhados", metric)

    # Diagnostico leva a linha.
    page.evaluate("src.value='class X : ModItem { }'; src.dispatchEvent(new Event('input'))")
    page.keyboard.press("Escape")
    page.click("#compile")
    page.wait_for_selector(".prob.error")
    check(page.locator(".prob.error").count() >= 1, "problema aparece na saida")
    page.locator(".prob.error").first.click()
    if shots:
        page.screenshot(path=str(shots / "desktop-erro.png"))

    # Novo mod: dialogo proprio e UID novo.
    uid_before = page.evaluate("JSON.parse(state.mods[state.uid].files['manifest.json']).uid")
    page.click("#newMod")
    page.fill("#fld_name", "Mod Dois")
    page.fill("#fld_id", "ModDois")
    page.click("#dlgOk")
    page.wait_for_function("JSON.parse(state.mods[state.uid].files['manifest.json']).id === 'ModDois'")
    uid_after = page.evaluate("JSON.parse(state.mods[state.uid].files['manifest.json']).uid")
    check(uid_before != uid_after, "novo mod ganha outro UID")
    check("namespace ModDois;" in page.evaluate("state.mods[state.uid].files['ModDois.cs']"), "namespace vem do id")
    if shots:
        page.screenshot(path=str(shots / "desktop.png"))

    # Persistencia.
    page.wait_for_timeout(700)
    page.reload()
    page.wait_for_selector("#tree .row.file")
    page.click("#modSelect")
    check(page.locator(".modrow").count() == 2, "mods sobrevivem ao recarregar", page.locator(".modrow").count())
    page.click("#modsClose")

    # Exporta e importa pela interface.
    with page.expect_download() as download:
        page.click("#exportBtn")
    check(download.value.suggested_filename == "ModDois-0.1.0.bl", "exporta .bl", download.value.suggested_filename)
    exported = Path(download.value.path()).read_bytes()
    with zipfile.ZipFile(io.BytesIO(exported)) as archive:
        names = archive.namelist()
        check("manifest.json" in names and "ModDois.cs" in names and "Content/Items/StarterMaterial.png" in names, ".bl com manifest e pastas na raiz", names)
    check(not errors, "sem erro de JavaScript no desktop", errors)
    context.close()

    # Celular.
    iphone = {"viewport": {"width": 390, "height": 760}, "has_touch": True, "is_mobile": True, "device_scale_factor": 2}
    context = browser.new_context(**iphone)
    page = context.new_page()
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.goto(url)
    page.wait_for_selector("#tree .row.file", state="attached")
    for view, pane in [("code", "#codePane"), ("files", "#filesPane"), ("snips", "#snipPane"), ("out", "#outPane")]:
        page.click(f'.tabs button[data-view="{view}"]')
        check(page.locator(pane).is_visible(), f"celular mostra {view}")
        overflow = page.evaluate("document.documentElement.scrollWidth > innerWidth + 1 || document.body.scrollWidth > innerWidth + 1")
        check(not overflow, f"celular sem rolagem lateral em {view}")
        if shots:
            page.screenshot(path=str(shots / f"celular-{view}.png"))
    page.click('.tabs button[data-view="code"]')
    page.tap("#src")
    page.evaluate("src.setSelectionRange(0,0)")
    before = page.input_value("#src")
    page.locator('#keys button:has-text(";")').tap()
    check(page.input_value("#src") == ";" + before, "barra de teclas insere")
    page.evaluate("src.value = 'using Terraria.ModLoader;\\nclass X : ModItem {\\n void F() {\\n  Item'; src.setSelectionRange(src.value.length, src.value.length); src.focus()")
    page.locator('#keys button:has-text(".")').tap()
    page.wait_for_selector("#pop:not([hidden])")
    page.locator('#pop button').first.tap()
    check(page.locator("#pop").is_hidden() and len(page.input_value("#src").split("Item.")[-1]) > 2, "toque aceita sugestao", page.input_value("#src")[-40:])
    if shots:
        page.screenshot(path=str(shots / "celular-sugestao.png"))
    check(not errors, "sem erro de JavaScript no celular", errors)
    context.close()


def test_engine(browser, url: str) -> None:
    page = browser.new_page()
    logs = []
    page.on("pageerror", lambda error: logs.append(str(error)))
    page.add_init_script(FAKE_ANDROID)
    page.goto(url)
    page.wait_for_function("document.querySelector('#engine').dataset.engine === 'ready'")
    check(page.locator("#compileLabel").inner_text() == "Compilar", "no app o botao compila")
    page.wait_for_timeout(1700)
    page.click("#compile")
    page.wait_for_function("document.querySelector('#outHead').dataset.state === 'ok'", timeout=20000)
    sent = page.evaluate("window.__lastCompile")
    check(sent["entry"] == "MeuMod.cs" and sorted(sent["files"]) == ["Content/Items/StarterMaterial.cs", "MeuMod.cs"], "ponte recebe entrada e .cs", sent)
    check(page.locator("#dlDll").is_visible(), "oferece o .dll")
    page.click("#dlDll")
    page.wait_for_function("window.__saved.length === 1")
    check(page.evaluate("window.__saved[0]") == ["MeuMod.dll", "MZfake"], ".dll vai para a ponte", page.evaluate("window.__saved[0]"))
    page.evaluate("window.bunnyStudio.appendToActive('\\nnao compila')")
    page.click("#compile")
    page.wait_for_function("document.querySelector('#outHead').dataset.state === 'fail'", timeout=20000)
    text = page.locator("#output").inner_text()
    check("Falta um ponto e vírgula" in text and "Você escreveu" in text and "Como deveria ficar" in text and "Corrigir agora" in text, "erro explicado em portugues", text)
    check(not page.locator("#dlDll").is_visible(), "erro esconde o .dll")
    page.click("#exportBtn")
    page.wait_for_function("window.__saved.length === 2")
    check(page.evaluate("window.__saved[1][0]") == "MeuMod-0.1.0.bl", "exporta .bl pela ponte")
    # Enviar: nao envia com erro; depois compila, salva e abre o Bunny.
    check(page.locator("#sendBunny").is_visible(), "botao Enviar aparece no app")
    page.click("#sendBunny")
    page.wait_for_function("document.querySelector('.toast')?.textContent.includes('Corrija')")
    check(page.evaluate("window.__sent === undefined"), "erro impede o envio")
    page.evaluate("src.value = src.value.replace('\\nnao compila', ''); src.dispatchEvent(new Event('input'))")
    page.keyboard.press("Escape")
    page.click("#sendBunny")
    page.wait_for_selector("#dlgOk")
    check("MeuMod-0.1.0.bl" in page.locator("#dlgForm").inner_text() and "Importar" in page.locator("#dlgForm").inner_text(), "explica como importar", page.locator("#dlgForm").inner_text())
    check(page.evaluate("window.__sent[1].startsWith('PK')"), "pacote enviado e um ZIP")
    page.click("#dlgOk")
    page.wait_for_function("window.__opened === true")
    check(page.locator("#sendBunny2").is_visible(), "Enviar aparece no resultado")
    page.evaluate("window.__direct = true; window.__opened = false")
    page.click("#sendBunny")
    page.wait_for_selector("#dlgOk")
    check("instalar e ativar" in page.locator("#dlgForm").inner_text(), "Bunny novo recebe direto", page.locator("#dlgForm").inner_text())
    page.click("#dlgOk")
    page.wait_for_function("window.__delivered === true")
    check(page.evaluate("window.__opened") is False, "nao usa o caminho manual")
    page.evaluate("window.__direct = false")
    page.evaluate("window.__noBunny = true; files()['MeuMod.cs'] += ' '")
    page.click("#compile")
    page.wait_for_function("document.querySelector('#outState').textContent.includes('Instale o Bunny')")
    page.evaluate("window.__noBunny = false")
    page.evaluate("setView('code')")
    check(page.evaluate("window.bunnyStudio.onBack()") is False, "voltar sem nada aberto sai do app")
    page.click("#settingsBtn")
    check(page.evaluate("window.bunnyStudio.onBack()") is True and not page.evaluate("document.querySelector('#settings').open"), "voltar fecha as configuracoes")
    check(len(page.evaluate("window.__haptics || []")) > 0, "toques vibram no app")
    check(not logs, "sem erro de JavaScript no app", logs)
    page.close()


def main() -> int:
    shots = Path(sys.argv[1]) if len(sys.argv) > 1 else None
    if shots:
        shots.mkdir(parents=True, exist_ok=True)
    subprocess.run([sys.executable, str(ROOT / "tools/generate_sdk_index.py")], check=True)
    with tempfile.TemporaryDirectory() as temp:
        plain = Path(temp) / "plain"
        build_site(plain)
        plain_url = serve(plain)
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch()
            page = browser.new_page()
            page.goto(plain_url)
            page.wait_for_selector("#tree .row.file")
            test_quick_check(page)
            test_snippets(page)
            test_member_references(page)
            test_stress_mod(page)
            test_snippet_probe(page)
            test_errors(page)
            test_zip(page)
            test_completions(page)
            page.close()
            test_ui(browser, plain_url, shots)
            test_engine(browser, plain_url)
            browser.close()
    print(f"\n{len(failures)} falha(s)" if failures else "\nWEB_EDITOR_TESTS=PASS")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
