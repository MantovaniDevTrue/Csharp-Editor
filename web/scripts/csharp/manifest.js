// ---------- Verificação rápida (não substitui o Roslyn) ----------
const NEEDS_USING = {
  System: ["Math", "MathF", "Array", "Console", "Random", "DateTime", "TimeSpan", "Exception", "ArgumentException", "ArgumentOutOfRangeException", "InvalidOperationException", "Func", "Action", "Environment", "StringComparer", "Convert", "Tuple", "Guid", "BitConverter", "GC"],
  "System.Collections.Generic": ["List", "Dictionary", "HashSet", "Queue", "Stack", "IEnumerable", "KeyValuePair"],
};
const HINTS = {
  CS0115: "Confira nome, retorno e parâmetros do override.",
  CS0534: "Implemente os membros abstratos exigidos pela classe base.",
  CS0101: "Há uma declaração duplicada. Renomeie a classe ou apague a cópia.",
  CS0246: "Falta o using, ou o arquivo que declara esse tipo não está no mod.",
};

const UID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const MOD_ID_RE = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;
// Mesmas regras com que o Bunny aceita ou recusa um pacote (ModRepository.stage e ModManifest).
function packTypeOf(all) {
  try { const t = JSON.parse(all["manifest.json"]).type; return t === "texture" || t === "font" ? t : null; } catch { return null; }
}
function manifestProblems(all) {
  const out = [];
  const add = (fields) => out.push({ sev: "error", path: "manifest.json", line: 0, col: 0, code: "manifest", known: true, ...fields });
  const text = all["manifest.json"];
  if (typeof text !== "string") {
    add({ title: "O mod está sem manifest.json", msg: "O arquivo manifest.json não está no mod.", why: "O Bunny recusa um pacote sem esse arquivo, porque é nele que ficam o nome, o ID e o UID do mod.", good: '{\n  "uid": "…",\n  "id": "MeuMod",\n  "name": "Meu Mod",\n  "version": "1.0.0",\n  "blVersion": 3\n}', fix: { kind: "repair" } });
    return out;
  }
  let data;
  try { data = JSON.parse(text); }
  catch (error) { add(explainJsonError(text, error)); return out; }
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    add({ title: "O manifest.json precisa ser um objeto", msg: "O conteúdo não começa com { e termina com }.", why: "O Bunny lê os campos do mod de dentro de um único objeto JSON.", good: '{\n  "id": "MeuMod",\n  "name": "Meu Mod"\n}', fix: { kind: "repair" } });
    return out;
  }
  if (Object.keys(all).some((k) => k.startsWith("content/"))) {
    add({ title: "Este mod está no formato antigo do Bunny", msg: "O mod usa a pasta content/.", why: "O Bunny atual pede blVersion 3, a classe Mod em <id>.cs e as pastas Content/, Common/ e Assets/ na raiz. A conversão acerta as pastas e o manifest; o código feito com BunnyItem precisa ser reescrito com ModItem, porque a API mudou.", good: "public class MeuItem : ModItem", fix: { kind: "migrate" } });
    return out;
  }
  const lineOf = (key) => {
    const i = text.indexOf(`"${key}"`);
    return i < 0 ? 0 : text.slice(0, i).split("\n").length;
  };
  const field = (key, title, why, example, value) => add({ title, line: lineOf(key), col: 1, msg: title, why, good: example, fix: value === undefined ? null : { kind: "manifest", key, value } });
  if (!data.uid) field("uid", 'Falta o campo "uid"', "O UID identifica o mod. Sem ele, o Bunny não sabe se o pacote é uma atualização ou outro mod, e recusa a importação.", '"uid": "dfac5a5e-dd9a-4e57-a306-4147d34693cd"', newUid());
  else if (typeof data.uid !== "string" || !UID_RE.test(data.uid)) field("uid", 'O "uid" não está no formato certo', `"${data.uid}" não é um UUID. O Bunny exige 32 dígitos hexadecimais minúsculos, separados por hífens. Trocar o UID faz o Bunny tratar o mod como um mod novo.`, '"uid": "dfac5a5e-dd9a-4e57-a306-4147d34693cd"', newUid());
  for (const [key, example, label] of [["id", "meu_mod", "um ID curto"], ["name", "Meu Mod", "o nome que aparece no Bunny"], ["version", "1.0.0", "a versão do mod"]]) {
    if (typeof data[key] !== "string" || !data[key].trim()) {
      const given = data[key] !== undefined && typeof data[key] !== "string";
      field(key, given ? `O campo "${key}" precisa ser um texto entre aspas` : `Falta o campo "${key}"`, `Esse campo guarda ${label}. Sem um texto válido, o Bunny recusa o pacote.`, `"${key}": "${example}"`, given ? String(data[key]) : example);
    }
  }
  const pack = data.type === "texture" || data.type === "font" ? data.type : null;
  if (pack === "texture" && !Object.keys(all).some((k) => /^Images\/.*\.png$/i.test(k))) add({ title: "O pacote de texturas ainda não tem imagens", msg: "Sem PNG em Images/.", why: "O Bunny recusa um pacote de texturas sem nenhum PNG dentro de Images/. Crie uma textura ou importe um PNG.", good: "Images/Item_1.png" });
  if (pack === "font" && !Object.keys(all).some((k) => /^Fonts\/[^/]+\.json$/i.test(k))) add({ title: "O pacote de fontes ainda não tem fontes", msg: "Sem .json em Fonts/.", why: "O Bunny recusa um pacote de fontes sem nenhum .json dentro de Fonts/. Toque em Gerar fonte de um .ttf.", good: "Fonts/Mouse_Text.json" });
  if (!pack && typeof data.id === "string" && data.id && !MOD_ID_RE.test(data.id)) field("id", 'O "id" precisa ser um nome de classe C#', `"${data.id}" tem caracteres que o C# não aceita. Use letras, números e _, começando por letra. O id também dá nome ao arquivo principal, como MeuMod.cs.`, `"id": "${pascal(data.id)}"`, pascal(data.id));
  if (!Number.isInteger(data.blVersion)) field("blVersion", 'O "blVersion" precisa ser o número 3', "É a versão do formato de pacote do Bunny. Ela é um número, sem aspas.", '"blVersion": 3', 3);
  else if (data.blVersion !== 3) field("blVersion", `O "blVersion" ${data.blVersion} não é aceito`, "O Bunny atual só carrega o formato 3.", '"blVersion": 3', 3);
  if (!pack && typeof data.id === "string" && MOD_ID_RE.test(data.id) && typeof all[data.id + ".cs"] !== "string" && all[data.id + ".dll"] === undefined) {
    add({ title: `Falta o arquivo ${data.id}.cs na raiz do mod`, msg: "Arquivo de entrada ausente.", why: `O Bunny procura o arquivo com o mesmo nome do "id". Sem ele, recusa o pacote. Ele guarda a classe principal do mod.`, good: modClassSource(data.id), fix: { kind: "entry", id: data.id } });
  }
  if (data.gameVersion !== undefined && !(Array.isArray(data.gameVersion) && data.gameVersion.every(Number.isInteger))) field("gameVersion", 'O "gameVersion" precisa ser uma lista de números', "Texto ou aspas aqui fazem o Bunny não conseguir ler o manifest.", '"gameVersion": [301720, 301720]', [301720, 301720]);
  if (data.dependencies !== undefined && !(Array.isArray(data.dependencies) && data.dependencies.every((d) => typeof d === "string"))) field("dependencies", 'O "dependencies" precisa ser uma lista de textos', "Cada dependência é um texto entre aspas. Sem dependências, use uma lista vazia.", '"dependencies": []', []);
  for (const key of ["category", "summary", "license"]) if (data[key] !== undefined && typeof data[key] !== "string") field(key, `O campo "${key}" precisa ser um texto entre aspas`, "Outro tipo de valor aqui faz o Bunny não conseguir ler o manifest.", `"${key}": "Texto"`, String(data[key]));
  return out;
}
const modClassSource = (id) => `using Terraria.ModLoader;\n\nnamespace ${id};\n\npublic class ${id} : Mod\n{\n}\n`;
function explainJsonError(text, error) {
  const message = error.message;
  const position = /position (\d+)/.exec(message);
  const at = position ? +position[1] : text.length;
  const before = text.slice(0, at);
  const line = before.split("\n").length;
  const col = at - before.lastIndexOf("\n");
  const base = { title: "O manifest.json tem um erro de escrita", msg: message, line, col };
  const prevIndex = before.trimEnd().length - 1;
  const prev = text[prevIndex], cur = text[at];
  const row = (i) => text.slice(0, i).split("\n").length;
  const lineText = (n) => text.split("\n")[n - 1] ?? "";
  if (prev === "," && (cur === "}" || cur === "]")) {
    const n = row(prevIndex);
    return { ...base, line: n, title: "Tem uma vírgula sobrando no manifest.json", why: `O último item antes de "${cur}" não pode terminar com vírgula.`, good: lineText(n).replace(/,\s*$/, ""), fix: { kind: "text", start: prevIndex, end: prevIndex + 1, text: "" } };
  }
  if (cur === '"' && prev !== undefined && !",{[:".includes(prev)) {
    const n = row(prevIndex);
    return { ...base, line: n, title: "Falta uma vírgula no manifest.json", why: "Todo campo precisa de uma vírgula antes do próximo.", good: lineText(n).trimEnd() + ",", fix: { kind: "text", start: prevIndex + 1, end: prevIndex + 1, text: "," } };
  }
  if (cur === "'") return { ...base, title: "O manifest.json usa aspas simples", why: "JSON só aceita aspas duplas.", good: lineText(line).replace(/'/g, '"'), fix: { kind: "line", line, text: lineText(line).replace(/'/g, '"') } };
  if (cur === "“" || cur === "”" || /[“”]/.test(lineText(line))) return { ...base, title: "O manifest.json tem aspas curvas", why: "Alguns teclados trocam as aspas retas por “curvas”, e o JSON não aceita.", good: lineText(line).replace(/[“”]/g, '"'), fix: { kind: "line", line, text: lineText(line).replace(/[“”]/g, '"') } };
  if (at >= text.trimEnd().length) return { ...base, title: "O manifest.json terminou antes da hora", why: "Falta fechar um texto, uma lista ou o } final. O último caractere do arquivo precisa ser }.", good: "}", fix: null };
  return { ...base, why: `O Bunny não consegue ler o arquivo a partir da linha ${line}. Confira as aspas, os dois-pontos e as vírgulas dessa linha.`, good: '"name": "Meu Mod",', fix: null };
}
function nearestName(name, options) {
  if (!name || !options.length) return null;
  const low = name.toLowerCase();
  const same = options.find((o) => o.toLowerCase() === low);
  if (same) return same;
  const distance = (a, b) => {
    let row = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      const next = [i];
      for (let j = 1; j <= b.length; j++) next[j] = Math.min(row[j] + 1, next[j - 1] + 1, row[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      row = next;
    }
    return row[b.length];
  };
  let best = null, bestScore = Math.max(2, Math.floor(name.length / 3)) + 1;
  for (const option of options) {
    const score = distance(low, option.toLowerCase());
    if (score < bestScore) { best = option; bestScore = score; }
  }
  return best;
}

function lineCol(src, at) {
  let line = 1, last = -1;
  for (let i = src.indexOf("\n"); i >= 0 && i < at; i = src.indexOf("\n", i + 1)) { line++; last = i; }
  return { line, col: at - last };
}
function paramCount(sig, open) {
  let depth = 0, count = 0, any = false;
  for (let i = open; i < sig.length; i++) {
    const v = sig[i].v;
    if (v === "(" || v === "<" || v === "[") depth++;
    else if (v === ")" || v === ">" || v === "]") { depth--; if (depth === 0) return any ? count + 1 : 0; }
    else if (v === ">>") depth -= 2;
    else if (v === "," && depth === 1) count++;
    else any = true;
  }
  return 0;
}
function paramsCountOf(p) {
  if (!p) return 0;
  let depth = 0, c = 1;
  for (const ch of p) { if ("<([".includes(ch)) depth++; else if (">)]".includes(ch)) depth--; else if (ch === "," && depth === 0) c++; }
  return c;
}

// Levanta classes, usings e namespaces de um arquivo.
function scanFile(path, src) {
  const { tokens, errors } = lex(src);
  const sig = tokens.filter((t) => t.t !== "ws" && t.t !== "com" && t.t !== "pp");
  const file = { path, src, sig, errors, usings: new Set(), globals: new Set(), classes: [], ns: "" };
  for (let i = 0; i < sig.length; i++) {
    const tk = sig[i];
    if (tk.t !== "id") continue;
    if (tk.v === "using" && (i === 0 || [";", "}", "{", "global"].includes(sig[i - 1].v)) && sig[i + 1]?.t === "id") {
      let j = i + 1, name = "";
      while (sig[j] && sig[j].v !== ";" && sig[j].v !== "=" && j < i + 40) { name += sig[j].v; j++; }
      if (sig[j]?.v === ";") { file.usings.add(name.replace(/^static/, "")); if (sig[i - 1]?.v === "global") file.globals.add(name); }
    } else if (tk.v === "namespace" && sig[i + 1]?.t === "id") {
      let j = i + 1, name = "";
      while (sig[j] && (sig[j].t === "id" || sig[j].v === ".")) { name += sig[j].v; j++; }
      if (!file.ns) file.ns = name;
    } else if (tk.v === "class" && sig[i + 1]?.t === "id" && sig[i - 1]?.v !== ".") {
      const mods = new Set();
      for (let m = i - 1; m >= 0 && sig[m].t === "id" && KEYWORDS.has(sig[m].v); m--) mods.add(sig[m].v);
      let j = i + 2, angle = 0, base = "", baseAt = null;
      if (sig[j]?.v === "<") { angle = 1; j++; while (j < sig.length && angle) { if (sig[j].v === "<") angle++; else if (sig[j].v === ">") angle--; else if (sig[j].v === ">>") angle -= 2; j++; } }
      if (sig[j]?.v === "(") { let d = 0; do { if (sig[j].v === "(") d++; else if (sig[j].v === ")") d--; j++; } while (j < sig.length && d); }
      if (sig[j]?.v === ":") {
        j++;
        while (sig[j]?.t === "id" && sig[j + 1]?.v === ".") j += 2;
        if (sig[j]?.t === "id") { base = sig[j].v; baseAt = sig[j]; }
      }
      while (j < sig.length && sig[j].v !== "{" && sig[j].v !== ";") j++;
      if (sig[j]?.v !== "{") continue;
      let depth = 0, end = j;
      for (let k = j; k < sig.length; k++) { if (sig[k].v === "{") depth++; else if (sig[k].v === "}") { depth--; if (depth === 0) { end = k; break; } } end = k; }
      file.classes.push({ name: sig[i + 1].v, at: sig[i + 1], mods, base, baseAt, open: j, close: end, file });
    }
  }
  return file;
}

function classMembers(file, cls) {
  const sig = file.sig, overrides = [], declared = new Set(), bodies = {};
  let depth = 0;
  for (let i = cls.open + 1; i < cls.close; i++) {
    const v = sig[i].v;
    if (v === "{" || v === "(" || v === "[") { depth++; continue; }
    if (v === "}" || v === ")" || v === "]") { depth--; continue; }
    if (depth !== 0 || sig[i].t !== "id") continue;
    const next = sig[i + 1]?.v;
    if (["(", "{", "=", ";", "=>", ","].includes(next) && !KEYWORDS.has(v) && !PRIMITIVES.has(v)) {
      declared.add(v);
      if (next === "(") {
        let d = 0, k = i + 1;
        for (; k < cls.close; k++) { if (sig[k].v === "(") d++; else if (sig[k].v === ")") { d--; if (!d) break; } }
        if (sig[k + 1]?.v === "{") {
          let b = 0, e = k + 1;
          for (; e <= cls.close; e++) { if (sig[e].v === "{") b++; else if (sig[e].v === "}") { b--; if (!b) break; } }
          bodies[v] = bodies[v] || [k + 1, e];
        }
      }
    }
    if (v === "override") {
      let j = i + 1, angle = 0;
      for (; j < cls.close; j++) {
        const w = sig[j].v;
        if (w === "<") angle++; else if (w === ">") angle--; else if (w === ">>") angle -= 2;
        else if (!angle && ["(", "{", "=>", "=", ";"].includes(w)) break;
      }
      const nameTok = sig[j - 1];
      if (nameTok?.t === "id") overrides.push({ tok: nameTok, name: nameTok.v, count: sig[j].v === "(" ? paramCount(sig, j) : null });
    }
  }
  return { overrides, declared, bodies };
}

// O Bunny carrega <id>.dll antes de <id>.cs. Devolve o caminho da DLL, se o mod trouxer uma.
function precompiledEntry(all) {
  let id = "";
  try { id = JSON.parse(all["manifest.json"]).id; } catch { return null; }
  return typeof id === "string" && MOD_ID_RE.test(id) && all[id + ".dll"] !== undefined ? id + ".dll" : null;
}
