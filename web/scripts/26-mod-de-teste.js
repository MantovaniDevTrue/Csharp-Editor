// ---------- Mod de teste de carga ----------
// Conteúdo variado e válido, com referências entre arquivos, só para medir compilação.
function stressFile(i) {
  const n = String(i).padStart(4, "0");
  const head = "using Terraria;\nusing Terraria.ID;\nusing Terraria.ModLoader;\n\nnamespace StressMod.Content;\n\n";
  const kind = i % 4;
  if (kind === 1) return [`Projectiles/StressProjectile${n}.cs`, head + `public class StressProjectile${n} : ModProjectile
{
    public override void SetDefaults()
    {
        Projectile.width = ${8 + i % 8};
        Projectile.height = ${8 + i % 8};
        Projectile.friendly = true;
        Projectile.penetrate = ${1 + i % 5};
        Projectile.timeLeft = ${300 + i % 300};
    }
}
`];
  if (kind === 2) return [`Buffs/StressBuff${n}.cs`, head + `public class StressBuff${n} : ModBuff
{
    public override void Update(Player player, ref int buffIndex)
    {
        player.statDefense += ${1 + i % 10};
    }
}
`];
  const ingredient = i >= 4 ? `ModContent.ItemType<StressItem${String(i - 4 - (i % 4)).padStart(4, "0")}>()` : "ItemID.DirtBlock";
  return [`Items/StressItem${n}.cs`, head + `public class StressItem${n} : ModItem
{
    public override void SetDefaults()
    {
        Item.width = 20;
        Item.height = 20;
        Item.damage = ${5 + i % 50};
        Item.maxStack = Item.CommonMaxStack;
        Item.value = Item.buyPrice(silver: ${1 + i % 90});
    }

    public override void AddRecipes()
    {
        CreateRecipe()
            .AddIngredient(${ingredient}, ${1 + i % 9})
            .AddTile(TileID.WorkBenches)
            .Register();
    }
}
`];
}
function stressMod(count) {
  const m = starterMod("StressMod", `Teste de ${count} arquivos`);
  const manifest = JSON.parse(m.files["manifest.json"]);
  manifest.summary = "Mod gerado para medir compilação. Não use em um mundo de verdade.";
  const out = {
    "manifest.json": JSON.stringify(manifest, null, 2) + "\n",
    "StressMod.cs": modClassSource("StressMod"),
  };
  for (let i = 0; i < count - 1; i++) {
    const [path, text] = stressFile(i);
    out["Content/" + path] = text;
  }
  m.files = out;
  return m;
}
// Todos os modelos juntos em um mod, para compilar cada um de verdade contra a API do Bunny.
function snippetProbeMod() {
  const m = starterMod("SnippetProbe", "Modelos");
  const out = m.files;
  const head = "using System;\nusing System.Collections.Generic;\nusing Microsoft.Xna.Framework;\nusing Terraria;\nusing Terraria.ID;\nusing Terraria.ModLoader;\nusing SnippetProbe.Support;\nnamespace SnippetProbe.Probe;\n";
  out["Probe/Support.cs"] = "using Terraria.ModLoader;\nnamespace SnippetProbe.Support;\npublic class MeuProjetil : ModProjectile { }\n";
  for (const s of ALL_SNIPPETS) {
    const where = s.where || (s.folder ? "top" : "code");
    const cls = "Probe" + s.prefix[0].toUpperCase() + s.prefix.slice(1);
    const text = expandSnippet(s.body, { NS: "SnippetProbe.Probe", DIR: s.folder || "Content/Items", CLASS: cls, ...(s.folder ? { 1: cls } : {}) }).text;
    const baseName = s.bases?.[0] || "ModItem";
    const locals = "Player player = default; Microsoft.Xna.Framework.Vector2 velocity = default; int valor = 0; bool ativo = false; string texto = \"\"; int[] lista = null;\n";
    let code;
    if (s.folder) code = text;
    else if (where === "top") code = head + text + "\n";
    else if (where === "member") code = head + `public class ${cls} : ${baseName} {\n${text}\n}\n`;
    else code = head + `public class ${cls} : ${baseName} {\npublic void Probe() {\n${s.group === "C#" ? "" : locals}${text}\n}\n}\n`;
    out[`Probe/${s.prefix}.cs`] = code;
  }
  for (const base of CONTENT_BASES) {
    const name = "Body" + base;
    const body = expandSnippet(classBodyFor(name, base), { }).text;
    out[`Probe/Body/${name}.cs`] = head + `public class ${name} : ${body}\n`;
  }
  return m;
}
// Prova, no aparelho, que os modelos batem com a API do Bunny instalado.
async function testModels() {
  if (!engine.available) { toast("Isso só funciona no app para Android."); return; }
  setView("out");
  showOutput("running", "Testando os modelos…", (out) => out.append(para("Compila cada modelo com a API do Bunny instalado.")));
  const result = await compileWithRoslyn(payloadOf(snippetProbeMod().files, "SnippetProbe"));
  const errors = result.errors || [];
  if (result.code > 0) { showOutput("ok", `Os ${ALL_SNIPPETS.length} modelos compilam com este Bunny`, (out) => out.append(para(engine.bunny?.version ? `Bunny ${engine.bunny.version}.` : ""))); return; }
  if (result.code < -1 || !errors.length) { showOutput("fail", "Não deu para testar os modelos", (out) => out.append(para(String(result.diagnostics || "")))); return; }
  showOutput("fail", `${plural(errors.length, "erro", "erros")} nos modelos`, (out) => { out.append(para("Mande este resultado para quem cuida do app.")); out.append(logBlock(errors.join("\n"))); });
}
async function newStressMod() {
  const r = await ask({ title: "Mod de teste", text: "Gera itens, armas, projéteis, buffs e acessórios para medir a compilação. Não use esse mod em um mundo de verdade.", fields: [{ name: "count", label: "Arquivos .cs (o Bunny aceita até 4096)", value: "1000" }], ok: "Gerar" });
  if (!r) return;
  const count = Number(r.count);
  if (!Number.isInteger(count) || count < 2 || count > 4096) { toast("Use um número de 2 a 4096."); return; }
  const m = stressMod(count);
  state.mods[m.uid] = m;
  await switchMod(m.uid);
  scheduleSave();
  toast(`${count} arquivos gerados. Toque em Compilar.`);
}

