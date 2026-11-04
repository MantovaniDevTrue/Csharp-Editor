"""Verificacao rapida, modelos, erros, pacotes, ZIP e autocomplete."""
from __future__ import annotations

from support import *  # noqa: F403


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
    # No Bunny, Color fica em Microsoft.Xna.Framework.Graphics (ProxyGen/types.txt); o ExampleMod usa assim.
    wrong = page.evaluate("""() => window.bunnyStudio.snippets.filter(s => s.body.includes('new Color(') && !s.body.includes('using Microsoft.Xna.Framework.Graphics;')).map(s => s.prefix)""")
    check(not wrong, "modelos com Color usam o namespace certo", wrong)
    check(page.evaluate("window.bunnyStudio.sdk.types.Color.ns") == "Microsoft.Xna.Framework.Graphics", "indice sabe o using de Color")


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


def test_packs(page) -> None:
    result = page.evaluate("""() => { const s = window.bunnyStudio;
      const t = s.starterPack('texture', 'Pack', 'P'), f = s.starterPack('font', 'Fonte', 'F');
      return {type: s.packTypeOf(t.files), empty: s.manifestProblems(t.files).map(p => p.title), emptyFont: s.manifestProblems(f.files).map(p => p.title),
        filled: s.manifestProblems({...t.files, 'Images/Item_1.png': new Uint8Array(1)}), quick: s.quickCheck({...t.files, 'Images/Item_1.png': new Uint8Array(1)}).filter(p => p.sev === 'error')}; }""")
    check(result["type"] == "texture" and "imagens" in result["empty"][0] and "fontes" in result["emptyFont"][0], "pacote vazio explica o que falta", result)
    check(result["filled"] == [] and result["quick"] == [], "pacote de texturas nao pede .cs", result)
    # Mesmo formato do Bunny, com uma fonte real, comparado com a amostra dele.
    ttf = next((p for p in [*Path("/usr/share/fonts").rglob("*.ttf")] if "Regular" in p.name or "DejaVuSans.ttf" == p.name), None)
    if ttf is None:
        print("     (sem .ttf no sistema: gerador de fonte nao testado aqui)")
        return
    built = page.evaluate("""async (b64) => {
      const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
      const r = await window.bunnyStudio.buildFontPack(bytes, 'latin', ['Mouse_Text']);
      const meta = JSON.parse(r.files['Fonts/Mouse_Text.json']);
      const png = r.files['Fonts/Mouse_Text.0.png'];
      const bmp = await createImageBitmap(new Blob([png], {type:'image/png'}));
      return {keys:Object.keys(r.files), meta:{...meta, glyphs:meta.glyphs.filter(g => [32,65,233].includes(g[0]))}, count:meta.glyphs.length, w:bmp.width, h:bmp.height, sig:Array.from(png.slice(0,4))};
    }""", base64.b64encode(ttf.read_bytes()).decode())
    meta = built["meta"]
    check(built["keys"] == ["Fonts/Mouse_Text.0.png", "Fonts/Mouse_Text.json"] and meta["format"] == "blfont/1" and meta["scale"] == 3 and meta["lineSpacing"] == 24 and meta["pages"] == ["Mouse_Text.0.png"], "fonte gera os arquivos do Bunny", {k: built[k] for k in ("keys", "count")})
    check(meta["fields"] == "code,page,bx,by,bw,bh,cx,cy,cw,ch,leftBearing,width,rightBearing" and all(len(g) == 13 for g in meta["glyphs"]), "glifos com os campos do Bunny", meta["glyphs"][:2])
    space, letter = meta["glyphs"][0], meta["glyphs"][1]
    check(space[0] == 32 and space[4] == 0 and space[12] > 0, "espaco so avanca", space)
    check(letter[0] == 65 and letter[5] >= 10 and letter[9] == 24 and letter[7] >= 0, "maiuscula na altura do jogo", letter)
    check(built["w"] % 3 == 0 and built["h"] % 3 == 0 and built["sig"] == [137, 80, 78, 71], "folha PNG multipla da escala", built["w"])


def test_mod_search(page) -> None:
    result = page.evaluate("""() => {
      const s = window.bunnyStudio, o = s.modSearch;
      const all = {'a.cs': 'Item.width = 1;\\nitem.Width = 2;\\nWidthBonus = 3;', 'b.cs': 'nada', 'c.png': new Uint8Array(4), 'd.cs': 'x width'};
      const run = (q, opts = {}) => { Object.assign(o, {caseSensitive: false, word: false, regex: false}, opts); const r = s.searchFiles(all, q); return {t: r.total, files: r.results.map(f => f.path), first: r.results[0]?.matches[0]}; };
      const out = {plain: run('width'), caseOn: run('Width', {caseSensitive: true}), word: run('width', {word: true}), regex: run('wid.h', {regex: true}), dollar: null, literal: null};
      Object.assign(o, {caseSensitive: false, word: false, regex: false});
      out.literal = s.replaceText('a.b axb', 'a.b', '$1');
      Object.assign(o, {regex: true});
      out.dollar = s.replaceText('Item.width', '(\\\\w+)\\\\.width', '$1.height');
      let bad = false; try { s.searchFiles(all, '('); } catch { bad = true; }
      out.bad = bad; out.empty = s.searchFiles(all, '').total; out.zero = s.searchFiles({f: 'abc'}, 'x*').total;
      Object.assign(o, {regex: false});
      return out;
    }""")
    check(result["plain"]["t"] == 4 and result["plain"]["files"] == ["a.cs", "d.cs"], "busca em todos os arquivos de texto", result["plain"])
    check(result["plain"]["first"]["line"] == 1 and result["plain"]["first"]["col"] == 6, "busca acha linha e coluna", result["plain"]["first"])
    check(result["caseOn"]["t"] == 2, "diferencia maiusculas", result["caseOn"])
    check(result["word"]["t"] == 3, "so a palavra inteira", result["word"])
    check(result["regex"]["t"] == 4, "expressao regular", result["regex"])
    check(result["literal"] == "$1 axb", "texto puro nao interpreta $ nem .", result["literal"])
    check(result["dollar"] == "Item.height", "regex usa os grupos", result["dollar"])
    check(result["bad"] and result["empty"] == 0 and result["zero"] == 0, "regex invalida, vazia e de tamanho zero", result)


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
