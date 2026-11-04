function parseRoslyn(text) {
  const problems = [];
  for (const line of String(text).split("\n")) {
    const m = /^(.+?)\((\d+),(\d+)\): (CS\d+): (.*)$/.exec(line.trim());
    if (m) problems.push({ sev: "error", path: m[1], line: +m[2], col: +m[3], code: m[4], msg: m[5], roslyn: true });
  }
  return problems;
}
// Traduções oficiais do Roslyn, extraídas no build. Carregam só no primeiro erro.
let roslynPt = null;
async function loadRoslynPt() {
  if (roslynPt) return;
  try { const r = await fetch("roslyn-pt.json"); if (r.ok) roslynPt = await r.json(); } catch { /* sem a tabela, fica o texto genérico */ }
}
function translateRoslyn(code, message) {
  const entry = roslynPt?.[code];
  if (!entry) return "";
  const pattern = entry.e.split(/(\{\d+\})/).map((part) => (/^\{\d+\}$/.test(part) ? "(.*?)" : part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))).join("");
  const order = [...entry.e.matchAll(/\{(\d+)\}/g)].map((m) => +m[1]);
  const hit = new RegExp(`^${pattern}$`, "s").exec(message);
  return entry.p.replace(/\{(\d+)\}/g, (_, n) => { const at = order.indexOf(+n); return hit && at >= 0 ? hit[at + 1] : "…"; });
}
// O detalhe técnico também em português: tira o relatório interno e traduz cada linha.
function readableReport(result) {
  const lines = [];
  if (result.ms !== undefined) lines.push(`Tempo: ${result.ms} ms · ${result.files ?? 0} arquivos · ${result.lines ?? 0} linhas`);
  for (const [label, list] of [["Erro", result.errors || []], ["Aviso", (result.warnings || []).filter((w) => !/: CS86\d\d:/.test(w))]]) {
    for (const line of list) {
      const m = /^(.+?\(\d+,\d+\)): (CS\d+): (.*)$/.exec(line);
      lines.push(m ? `${label} em ${m[1]} [${m[2]}]: ${translateRoslyn(m[2], m[3]) || m[3]}` : line);
    }
  }
  return lines.join("\n") || (result.code <= -100 ? String(result.diagnostics || "") : "");
}
const quoted = (msg, n = 0) => [...msg.matchAll(/'([^']*)'/g)][n]?.[1] ?? "";
const usingFor = (name) => T[name]?.ns || Object.keys(NEEDS_USING).find((ns) => NEEDS_USING[ns].includes(name));
const OLD_API = { BunnyItem: "ModItem", BunnyWeapon: "ModItem", BunnyAccessory: "ModItem", BunnyProjectile: "ModProjectile", BunnyBuff: "ModBuff", BunnyNPC: "ModNPC", BunnyTile: "ModTile", BunnyPlayer: "ModPlayer" };
const swapName = (line, col, from, to) => {
  const at = line.indexOf(from, Math.max(0, col - 2));
  const i = at >= 0 ? at : line.indexOf(from);
  return i < 0 ? line : line.slice(0, i) + to + line.slice(i + from.length);
};
// Assinaturas do SDK para um nome de método, para mostrar como a chamada deve ser.
function signaturesOf(name, owner) {
  const pool = owner && T[owner] ? membersOf(owner) : Object.values(T).flatMap((t) => t.members);
  const seen = new Set();
  return pool.filter((m) => m.k === "m" && m.n === name).map((m) => `${m.n}(${m.p})`).filter((sig) => (seen.has(sig) ? false : seen.add(sig)));
}
function explainProblem(p, fileText) {
  if (p.known) return p;
  const text = fileText ?? (state.uid ? files()[p.path] : "") ?? "";
  const lines = typeof text === "string" ? text.split("\n") : [];
  const line = lines[p.line - 1] ?? "";
  const col = p.col || 1;
  const offset = lines.slice(0, Math.max(0, p.line - 1)).join("\n").length + col;
  const base = typeof text === "string" ? enclosingBase(text, offset) : "";
  const set = (fields) => Object.assign(p, { known: true }, fields);
  const insert = (ch, title, why) => set({ title, why, good: line.slice(0, col - 1) + ch + line.slice(col - 1), fix: { kind: "insert", line: p.line, col, text: ch } });
  const rename = (from, to, title, why) => set({ title, why, good: swapName(line, col, from, to), fix: { kind: "line", line: p.line, text: swapName(line, col, from, to) } });
  const msg = p.msg;
  // Da verificação rápida, com a frase já em português.
  if (!p.roslyn) {
    if (p.fix?.kind === "abstract") return set({ title: `Falta o método ${p.fix.member.n} na classe ${p.fix.cls}`, why: `Toda classe que herda de ${p.fix.member.owner || "uma base do SDK"} precisa ter esse método.`, good: overrideBody(p.fix.member, true).replace(/«0(?::([^»]*))?»/g, (_, d) => d || "") });
    if (p.fix?.kind === "using") return set({ title: msg.replace(/;.*$/, ""), why: "Os mods do Bunny não têm usings automáticos: cada arquivo precisa declarar os seus, no começo.", good: `using ${p.fix.ns};` });
    return set({ title: msg, why: p.hint || "", hint: "" });
  }
  switch (p.code) {
    case "CS1002": return insert(";", "Falta um ponto e vírgula", "Em C#, toda instrução termina com ;. O erro costuma estar no fim da linha indicada.");
    case "CS1026": return insert(")", "Falta fechar um parêntese", "Todo ( precisa de um ) correspondente.");
    case "CS1003": { const ch = /'([^']+)' expected/.exec(msg)?.[1] || ","; return insert(ch, `Falta "${ch}" nesta linha`, "O C# esperava esse símbolo neste ponto."); }
    case "CS1513": return set({ title: "Falta fechar uma chave }", why: "Cada { de classe, método ou if precisa de um } correspondente. Normalmente, o que falta é o último do arquivo.", good: "}", fix: { kind: "end", text: "}" } });
    case "CS1514": return insert("{", "Falta abrir uma chave {", "Depois de declarar uma classe ou método, o corpo começa com {.");
    case "CS1010": {
      const closed = /;\s*$/.test(line) ? line.replace(/;(\s*)$/, '";$1') : line.trimEnd() + '"';
      return set({ title: "Texto sem aspas de fechamento", why: 'Todo texto começa e termina com aspas duplas ", na mesma linha.', good: closed, fix: { kind: "line", line: p.line, text: closed } });
    }
    case "CS1525": return set({ title: `"${quoted(msg)}" não pode ficar aqui`, why: "O C# esperava um valor neste ponto. Costuma ser um valor faltando depois do =, ou um parêntese ou vírgula a mais.", good: "Item.value = 100;" });
    case "CS0103": {
      const name = quoted(msg);
      const ns = usingFor(name);
      const owner = ENTITY_OF[base];
      if (owner && membersOf(owner).some((m) => m.n === name)) return rename(name, `${owner}.${name}`, `Em ${base}, use ${owner}.${name}`, `"${name}" é um campo de ${owner}, e não da classe ${base}. Por isso ele precisa do ${owner}. na frente.`);
      if (ns && (T[name] || Object.values(NEEDS_USING).flat().includes(name))) return set({ title: `Falta o using de ${name}`, why: "Os mods do Bunny não têm usings automáticos: cada arquivo precisa declarar os seus, no começo.", good: `using ${ns};`, fix: { kind: "using", ns } });
      const options = [...membersOf(base).map((m) => m.n), ...localNames(text, offset + 1), ...(state.uid ? classesOfKind("") : []), ...(owner ? membersOf(owner).map((m) => `${owner}.${m.n}`) : []), ...(Object.keys(T).length < 2000 ? Object.keys(T) : []), "Math", "MathF"];
      const best = nearestName(name, options);
      if (best) return rename(name, best, `"${name}" não existe. Você quis dizer "${best}"?`, best.toLowerCase() === name.toLowerCase() ? "O C# diferencia maiúsculas de minúsculas." : `Não existe nada com esse nome em ${base || "este arquivo"}, mas o nome é muito parecido com "${best}".`);
      return set({ title: `"${name}" não existe neste ponto do código`, why: "Confira a escrita. Se é uma variável, declare antes de usar, dentro do mesmo método." + (base ? ` Em ${base}, as propriedades mais comuns são: ${membersOf(base).filter((m) => m.w).slice(0, 6).map((m) => m.n).join(", ")}.` : ""), good: `var ${name} = 0;` });
    }
    case "CS0117": case "CS1061": {
      const owner = quoted(msg, 0).split(".").pop(), name = quoted(msg, 1);
      const options = T[owner] ? membersOf(owner).map((m) => m.n) : [];
      const best = nearestName(name, options);
      if (best) return rename(name, best, `${owner} não tem "${name}". Você quis dizer "${best}"?`, "O nome precisa ser escrito exatamente como está no SDK.");
      return set({ title: `${owner || "Esse tipo"} não tem "${name}"`, why: options.length ? `Membros disponíveis: ${[...new Set(options)].slice(0, 8).join(", ")}.` : "Esse membro não existe nesta versão do SDK.", good: "" });
    }
    case "CS0246": {
      const name = quoted(msg);
      const ns = usingFor(name);
      if (OLD_API[name]) return rename(name, OLD_API[name], `${name} é da API antiga. Use ${OLD_API[name]}`, "O C# do Bunny agora segue o tModLoader. Os campos também mudam, como Item.damage no lugar de Damage.");
      if (T[name] || Object.values(NEEDS_USING).flat().includes(name)) return set({ title: `Falta o using de ${name}`, why: "Os mods do Bunny não têm usings automáticos: cada arquivo precisa declarar os seus, no começo.", good: `using ${ns};`, fix: { kind: "using", ns } });
      const best = nearestName(name, [...Object.keys(T), ...(state.uid ? classesOfKind("") : [])]);
      if (best) return rename(name, best, `O tipo "${name}" não existe. Você quis dizer "${best}"?`, "Esse nome é muito parecido com um tipo que existe.");
      return set({ title: `O tipo "${name}" não existe`, why: "Confira o nome. Se a classe é sua, confira também o using do namespace dela.", good: "using Terraria.ModLoader;" });
    }
    case "CS0234": {
      const missing = quoted(msg, 0), parent = quoted(msg, 1);
      if (parent === "BunnyLoader" || missing === "Source") return set({ title: "BunnyLoader.Source é da API antiga", why: "O C# do Bunny agora segue o tModLoader.", good: "using Terraria;\nusing Terraria.ModLoader;", fix: { kind: "line", line: p.line, text: "using Terraria.ModLoader;" } });
      return set({ title: `O namespace ${parent} não tem "${missing}"`, why: "Confira a escrita do using, ou o nome depois do ponto.", good: "using Terraria.ModLoader;" });
    }
    case "CS0115": {
      const name = /\.(\w+)\(/.exec(quoted(msg))?.[1] || quoted(msg).split(".").pop();
      const methods = membersOf(base).filter((m) => m.k === "m" && (m.a || m.v));
      const same = methods.filter((m) => m.n === name);
      const target = same[0] || methods.find((m) => m.n === nearestName(name, methods.map((x) => x.n)));
      if (target) {
        const good = line.replace(new RegExp(`\\boverride\\s+.*?\\b${name}\\s*\\([^)]*\\)`), `override ${target.t} ${target.n}(${target.p.replace(/\s*=\s*[^,]+/g, "")})`);
        return set({ title: same.length ? `A assinatura de ${name} está diferente da do SDK` : `${base} não tem "${name}". Você quis dizer "${target.n}"?`, why: `O override precisa ter exatamente o mesmo nome, retorno e parâmetros. Assinaturas do tModLoader não valem aqui. O certo em ${base} é: ${[...new Set(same.length ? same.map((m) => `${m.t} ${m.n}(${m.p})`) : [`${target.t} ${target.n}(${target.p})`])].join(" ou ")}.`, good, fix: good !== line ? { kind: "line", line: p.line, text: good } : null });
      }
      return set({ title: `${base || "A classe base"} não tem "${name}" para sobrescrever`, why: `Métodos que dá para sobrescrever: ${methods.slice(0, 8).map((m) => m.n).join(", ")}.`, good: "public override void SetDefaults()" });
    }
    case "CS0534": {
      const cls = quoted(msg, 0).split(".").pop();
      const [owner, method] = quoted(msg, 1).replace(/\(.*$/, "").split(".").slice(-2);
      const member = (T[owner] ? membersOf(owner) : []).find((m) => m.n === method);
      if (member) return set({ title: `Falta o método ${method} na classe ${cls}`, why: `Toda classe que herda de ${owner} precisa ter esse método.`, good: overrideBody(member, true).replace(/«0(?::([^»]*))?»/g, (_, d) => d || ""), fix: { kind: "abstract", cls, member } });
      return set({ title: `Falta implementar ${quoted(msg, 1)}`, why: "Essa classe herda um método obrigatório.", good: "" });
    }
    case "CS0664": {
      const m = /^(.*?)(\d+\.\d+|\.\d+)(?![\d.fF])(.*)$/.exec(line.slice(Math.max(0, col - 1)));
      const good = m ? line.slice(0, Math.max(0, col - 1)) + m[1] + m[2] + "f" + m[3] : line;
      return set({ title: "Número decimal em uma propriedade float precisa de f", why: "Sem o f no final, 1.5 é um double, e ele não entra em um float sem conversão.", good, fix: good !== line ? { kind: "line", line: p.line, text: good } : null });
    }
    case "CS0029": case "CS0266": {
      const from = quoted(msg, 0), to = quoted(msg, 1);
      const tail = line.slice(Math.max(0, col - 1));
      if (from === "string" && /^(int|float|double|long|uint)$/.test(to)) {
        const m = /^"(-?[\d.]+)"/.exec(tail);
        const good = m ? line.slice(0, col - 1) + m[1] + (to === "float" ? "f" : "") + tail.slice(m[0].length) : "";
        return set({ title: `Este campo é um número (${to}), não um texto`, why: "Tire as aspas: número não fica entre aspas.", good: good || "Item.value = 100;", fix: good ? { kind: "line", line: p.line, text: good } : null });
      }
      if (to === "string" && /^(int|float|double|long|uint|bool)$/.test(from)) {
        const m = /^[-\d.fF\w]+/.exec(tail);
        const good = m ? line.slice(0, col - 1) + `"${m[0]}"` + tail.slice(m[0].length) : "";
        return set({ title: "Este campo é um texto e precisa de aspas", why: "Texto fica entre aspas duplas.", good: good || 'string nome = "Meu Item";', fix: good ? { kind: "line", line: p.line, text: good } : null });
      }
      if (to === "int" && /^(float|double)$/.test(from)) {
        const good = line.slice(0, col - 1) + "(int)" + tail;
        return set({ title: "Este campo aceita só números inteiros", why: "Use um número sem casas decimais, ou converta o valor com (int).", good, fix: { kind: "line", line: p.line, text: good } });
      }
      if (to === "float" && from === "double") {
        const good = line.slice(0, col - 1) + "(float)" + tail;
        return set({ title: "Este valor precisa ser float", why: "Coloque f no fim do número, como 1.5f, ou converta o valor com (float).", good, fix: { kind: "line", line: p.line, text: good } });
      }
      return set({ title: `Tipo errado: veio ${from}, mas aqui precisa de ${to}`, why: "O valor à direita do = precisa ser do mesmo tipo do campo.", good: "" });
    }
    case "CS1503": case "CS1501": case "CS7036": {
      const called = [...line.slice(0, col + 40).matchAll(/(\w+)\s*\(/g)].map((m) => m[1]).filter((n) => n !== "new" && n !== "nameof").pop() || quoted(msg, 0).split(".").pop().replace(/\(.*$/, "");
      const sigs = signaturesOf(called);
      const title = p.code === "CS1503" ? `Um argumento de ${called} está com o tipo errado` : `${called} recebeu a quantidade errada de argumentos`;
      return set({ title, why: p.code === "CS1503" ? `${/Argument (\d+)/.exec(msg)?.[1] ? `O argumento ${/Argument (\d+)/.exec(msg)[1]} ` : "O argumento "}veio como ${quoted(msg, 0)}, mas precisa ser ${quoted(msg, 1)}.` : "Confira os parâmetros que esse método pede.", good: sigs.slice(0, 3).join("\n") });
    }
    case "CS0161": return set({ title: "Este método precisa devolver um valor em todos os caminhos", why: "Métodos que não são void precisam terminar com return. Se há um if, o caminho sem if também precisa de return.", good: "return false;" });
    case "CS0165": return set({ title: `A variável "${quoted(msg)}" está sendo usada sem valor`, why: "Dê um valor a ela antes do primeiro uso.", good: `int ${quoted(msg)} = 0;` });
    case "CS0128": return set({ title: `A variável "${quoted(msg)}" já foi declarada neste método`, why: "Use outro nome, ou tire o tipo para só trocar o valor.", good: `${quoted(msg)} = 1;` });
    case "CS0101": return set({ title: `A classe "${quoted(msg, 1) || quoted(msg, 0)}" existe duas vezes`, why: "Dois arquivos declaram o mesmo nome no mesmo namespace. Renomeie uma ou apague a cópia.", good: "public class MeuItem2 : ModItem" });
    case "CS0111": return set({ title: `O método "${quoted(msg, 1)}" foi escrito duas vezes`, why: "Apague a cópia, ou mude o nome ou os parâmetros de um deles.", good: "" });
    case "CS0200": case "CS0272": {
      const name = quoted(msg).split(".").pop();
      if (name === "DisplayName" || name === "Tooltip") return set({ title: `${name} vem das traduções`, why: `O nome e a descrição ficam em Localization/pt-BR_Mods.${state.uid ? projectId() : "MeuMod"}.hjson. Apague esta linha e escreva lá, no bloco desta classe.`, good: "Items: {\n\tMeuItem: {\n\t\tDisplayName: Meu Item\n\t\tTooltip: Um item\n\t}\n}" });
      return set({ title: `"${name}" é só para leitura`, why: "O SDK calcula esse valor sozinho. Dá para ler, mas não atribuir. Apague essa linha.", good: "" });
    }
    case "CS0122": return set({ title: `"${quoted(msg)}" é privado no SDK`, why: "Esse membro não pode ser usado por mods. Procure uma propriedade pública com a mesma função.", good: "" });
    case "CS0120": return set({ title: `"${quoted(msg).split(".").pop()}" precisa de um objeto`, why: "Esse membro não é estático: não dá para chamar pelo nome da classe nem de dentro de um método static.", good: "var item = new MeuItem();\nitem.Metodo();" });
    case "CS0506": case "CS0505": return set({ title: "Esse membro não pode ser sobrescrito", why: "Só métodos virtual ou abstract aceitam override. Tire a palavra override, ou escolha outro método da classe base.", good: "" });
    case "CS0508": return set({ title: "O retorno do override está diferente do SDK", why: `Em ${quoted(msg, 0).split(".").pop()}, o retorno precisa ser ${quoted(msg, 2) || "o mesmo da classe base"}.`, good: "" });
    case "CS0116": case "CS8803": return set({ title: "Este código está fora de uma classe", why: "Métodos e campos precisam ficar entre as chaves de uma classe.", good: "public sealed class MinhaClasse\n{\n    // aqui\n}" });
    case "CS1519": case "CS1520": return set({ title: "Declaração inválida neste ponto", why: "No corpo da classe só entram métodos, propriedades e campos. Instruções como Item.damage = 10; ficam dentro de um método, como SetDefaults.", good: "public override void SetDefaults()\n{\n    Item.damage = 10;\n}" });
    case "CS1022": return set({ title: "Tem uma chave } a mais", why: "O arquivo fechou mais chaves do que abriu. Apague a sobrando nesta linha.", good: "" });
    case "CS0019": return set({ title: `O operador ${quoted(msg, 0)} não funciona entre ${quoted(msg, 1)} e ${quoted(msg, 2)}`, why: "Os dois lados precisam ser de tipos compatíveis. Converta um deles, ou compare valores do mesmo tipo.", good: "" });
    case "CS0030": return set({ title: `Não dá para converter ${quoted(msg, 0)} em ${quoted(msg, 1)}`, why: "Esses dois tipos não têm conversão, nem com (tipo) na frente.", good: "" });
    case "CS0119": return set({ title: `"${quoted(msg, 0)}" não pode ser usado assim`, why: "Esse nome é um tipo ou método, e aqui precisa de um valor. Faltou chamar o método, ou usar o nome de um campo?", good: "" });
    case "CS0131": return set({ title: "O lado esquerdo do = precisa ser uma variável", why: "Só dá para atribuir a um campo, propriedade ou variável.", good: "Item.width = 20;" });
    case "CS0136": return set({ title: `A variável "${quoted(msg)}" já existe neste método`, why: "Use outro nome. Variáveis de um bloco interno não podem repetir um nome de fora.", good: "" });
    case "CS0176": return set({ title: `"${quoted(msg).split(".").pop()}" é estático`, why: "Chame pelo nome da classe, e não por um objeto.", good: "Item.buyPrice(gold: 1)" });
    case "CS0201": return set({ title: "Esta linha não faz nada", why: "Toda instrução precisa atribuir, chamar um método ou criar algo. Faltou um = ou os parênteses do método?", good: "Item.width = 20;" });
    case "CS0428": return set({ title: `Faltam os parênteses em ${quoted(msg)}`, why: "Para chamar um método, escreva () depois do nome.", good: `${quoted(msg)}()` });
    case "CS0535": return set({ title: `${quoted(msg, 0).split(".").pop()} não implementa ${quoted(msg, 1)}`, why: "A classe declara essa interface, então precisa ter esse membro.", good: "" });
    case "CS0106": return set({ title: `A palavra ${quoted(msg, 0)} não vale aqui`, why: "Esse modificador não pode ser usado nesta declaração. Apague a palavra.", good: "" });
    case "CS0501": return set({ title: `${quoted(msg)} precisa de um corpo`, why: "Todo método normal precisa de { } depois dos parênteses.", good: "public override void AddRecipes()\n{\n}" });
    case "CS0621": return set({ title: "Membro virtual não pode ser privado", why: "Use public ou protected.", good: "public virtual void Metodo() { }" });
    case "CS1729": return set({ title: `${quoted(msg, 0)} não tem esse construtor`, why: "Confira a quantidade de argumentos dentro do new.", good: "" });
    case "CS1955": return set({ title: `${quoted(msg)} não é um método`, why: "Tire os parênteses: isso é um campo ou uma propriedade.", good: "" });
    case "CS0305": case "CS0308": return set({ title: `${quoted(msg, 0)} usa outra quantidade de tipos entre < >`, why: "Confira os tipos entre < >.", good: "ModContent.ItemType<MeuItem>()" });
    case "CS0411": return set({ title: `Diga o tipo de ${quoted(msg, 0).replace(/\(.*$/, "")} entre < >`, why: "O compilador não conseguiu descobrir o tipo sozinho.", good: "AddIngredient<MeuItem>()" });
    default: {
      const translated = translateRoslyn(p.code, msg);
      return set({ known: !!translated, title: translated || "O compilador encontrou um erro", why: translated ? "" : "Confira a linha indicada. O texto do compilador está abaixo.", good: "" });
    }
  }
}
function fixedText(text, fix) {
  if (fix.kind === "repair") return text;
  if (fix.kind === "using") return `using ${fix.ns};\n` + text;
  if (fix.kind === "text") return text.slice(0, fix.start) + fix.text + text.slice(fix.end);
  if (fix.kind === "end") return text.trimEnd() + "\n" + fix.text + "\n";
  const lines = text.split("\n");
  if (fix.kind === "line") { lines[fix.line - 1] = fix.text; return lines.join("\n"); }
  if (fix.kind === "insert") { const l = lines[fix.line - 1] ?? ""; lines[fix.line - 1] = l.slice(0, fix.col - 1) + fix.text + l.slice(fix.col - 1); return lines.join("\n"); }
  if (fix.kind === "manifest") { const data = JSON.parse(text); data[fix.key] = fix.value; return JSON.stringify(data, null, 2) + "\n"; }
  if (fix.kind === "abstract") {
    const scan = scanFile("x.cs", text);
    const cls = scan.classes.find((c) => c.name === fix.cls);
    if (!cls) return text;
    const at = scan.sig[cls.open].e;
    const body = overrideBody(fix.member, true).replace(/«0(?::([^»]*))?»/g, (_, d) => d || "").replace(/\n/g, "\n    ");
    return text.slice(0, at) + "\n    " + body + "\n" + text.slice(at).replace(/^[ \t]+(?=\})/, "");
  }
  return text;
}
// Corrige sozinho o que tem uma única resposta certa.
function applyFix(problem) {
  const path = problem.path, fix = problem.fix;
  if (fix.kind === "repair") repairManifest();
  if (fix.kind === "migrate") { migrateMod(mod()); afterStructureFix(); return; }
  if (fix.kind === "entry") { files()[fix.id + ".cs"] = modClassSource(fix.id); afterStructureFix(); return; }
  const text = fix.kind === "repair" ? files()["manifest.json"] : fixedText(files()[path], fix);
  files()[path] = text;
  if (state.active === path) { const top = src.scrollTop; src.value = text; src.scrollTop = top; }
  scheduleSave();
  state.problems = state.problems.filter((p) => p !== problem);
  toast("Corrigido. Compile de novo para confirmar.");
  haptic("confirm");
  if (path === "manifest.json") { renderModCard(); renderTree(); }
  $("output").querySelectorAll(".prob").forEach((row) => { if (row.problem === problem) row.remove(); });
  const errors = state.problems.filter((p) => p.sev === "error").length;
  $("badge").hidden = !errors; $("badge").textContent = errors;
  if (state.active === path) render();
}
function afterStructureFix() {
  scheduleSave(); renderModCard(); renderModSelect(); renderTree();
  openFile("manifest.json"); setView("out");
  toast("Corrigido. Compile de novo para confirmar.");
  haptic("confirm");
  $("output").querySelectorAll(".prob").forEach((row) => row.remove());
}
function renderProblems(list) {
  const frag = document.createDocumentFragment();
  let lastPath = null;
  for (const p of list) {
    explainProblem(p);
    if (p.path !== lastPath) {
      const h = document.createElement("div");
      h.className = "probfile"; h.textContent = p.path.replace(/^content\//, "");
      frag.append(h);
      lastPath = p.path;
    }
    const row = document.createElement("div");
    row.className = "prob " + p.sev;
    row.problem = p;
    const text = files()[p.path];
    const source = typeof text === "string" && p.line ? (text.split("\n")[p.line - 1] ?? "") : "";
    const b = document.createElement("button");
    b.type = "button"; b.className = "go";
    const head = document.createElement("span");
    head.className = "probtitle";
    head.textContent = p.title || p.msg;
    const where = document.createElement("span");
    where.className = "where";
    where.textContent = p.line ? `linha ${p.line} · toque para abrir` : "";
    b.append(head, where);
    b.addEventListener("click", () => {
      if (typeof files()[p.path] !== "string") return;
      setView("code");
      openFile(p.path, p.line ? { line: p.line, col: p.col } : null);
    });
    row.append(b);
    if (source.trim()) {
      const wrong = document.createElement("pre");
      wrong.className = "codebox wrong";
      wrong.innerHTML = `<small>Você escreveu</small>${esc(source.trim())}`;
      row.append(wrong);
    }
    if (p.why) { const why = document.createElement("p"); why.className = "why"; why.textContent = p.why; row.append(why); }
    if (p.good) {
      const right = document.createElement("pre");
      right.className = "codebox right";
      right.innerHTML = `<small>Como deveria ficar</small>${esc(p.good.trim())}`;
      row.append(right);
    }
    if (p.fix) {
      const fix = document.createElement("button");
      fix.type = "button"; fix.className = "btn small strong fix"; fix.textContent = "Corrigir agora";
      fix.addEventListener("click", () => applyFix(p));
      row.append(fix);
    }
    if (p.hint && !p.known) { const hint = document.createElement("p"); hint.className = "why"; hint.textContent = p.hint; row.append(hint); }
    if (p.code !== "manifest" && p.code !== "conteúdo" && /^CS\d+$/.test(p.code)) {
      const tech = document.createElement("details");
      tech.className = "origin";
      const summary = document.createElement("summary");
      summary.textContent = `Mensagem original (${p.code})`;
      const original = document.createElement("span");
      original.textContent = p.msg;
      tech.append(summary, original);
      row.append(tech);
    }
    frag.append(row);
  }
  return frag;
}
const TILE_LABELS = { ModItem: "Itens", ModProjectile: "Projéteis", ModNPC: "NPCs", ModBuff: "Buffs", ModTile: "Blocos", ModWall: "Paredes", ModPlayer: "Jogadores", ModSystem: "Sistemas", GlobalItem: "Globais", GlobalNPC: "Globais", GlobalProjectile: "Globais" };
function contentTiles() {
  const counts = {};
  const classes = projectIndex();
  for (const c of classes.values()) {
    const label = TILE_LABELS[rootBase(c, classes)];
    if (label && !c.abstract) counts[label] = (counts[label] || 0) + 1;
  }
  const entries = Object.entries(counts);
  if (!entries.length) return null;
  const box = document.createElement("div");
  box.className = "tiles";
  for (const [label, n] of entries) {
    const tile = document.createElement("div");
    tile.className = "tile";
    tile.innerHTML = `<b>${n}</b><span>${esc(label)}</span>`;
    box.append(tile);
  }
  return box;
}
function techDetails(text, open = false) {
  const d = document.createElement("details");
  d.className = "tech"; d.open = open;
  d.innerHTML = "<summary>Detalhes técnicos</summary>";
  d.append(logBlock(text));
  return d;
}
function idleOutput(out) {
  const p = document.createElement("div");
  p.className = "emptystate";
  p.innerHTML = engine.available
    ? "<b>Toque em Compilar</b> para checar o mod com o compilador e a API do Bunny instalado. Os erros aparecem aqui, e tocar em um deles leva à linha."
    : "<b>Toque em Verificar</b> para procurar erros comuns. Esta cópia não tem o compilador Roslyn.";
  out.append(p);
}
function showOutput(stateName, headline, build) {
  $("outHead").dataset.state = stateName;
  $("outState").textContent = headline;
  const out = $("output");
  out.replaceChildren();
  build?.(out);
  const errors = state.problems.filter((p) => p.sev === "error").length;
  $("badge").hidden = !errors;
  $("badge").textContent = errors;
  if (state.active && typeof files()[state.active] === "string") render();
}
const para = (text, cls = "note") => { const p = document.createElement("p"); p.className = cls; p.textContent = text; return p; };
const logBlock = (text) => { const d = document.createElement("pre"); d.className = "log"; d.textContent = text; return d; };
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

let compiling = false;
