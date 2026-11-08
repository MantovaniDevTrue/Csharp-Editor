// ---------- Autocomplete ----------
const pop = $("pop");
let completion = null;
const closePopup = () => { pop.hidden = true; completion = null; };
function enclosingClass(text, at) {
  let name = "MinhaClasse";
  for (const m of text.slice(0, at).matchAll(/\bclass\s+(\w+)/g)) name = m[1];
  return name;
}
function enclosingBase(text, at) {
  const re = /\bclass\s+\w+[^:{;]*:\s*([\w.]+)/g;
  let m, base = "";
  while ((m = re.exec(text)) && m.index < at) base = m[1].split(".").pop();
  return base;
}
function typeOfName(name, text, at, base) {
  if (name === "this" || name === "base") return { type: base };
  // Variável com tipo conhecido: Player player, NPC target, Item item.
  const typed = [...text.slice(0, at).matchAll(new RegExp(`\\b(\\w+)\\s+${name}\\b`, "g"))].filter((m) => T[m[1]]).pop();
  if (typed) return { type: typed[1] };
  // Dentro de um ModItem, Item é a propriedade, e também dá acesso aos membros estáticos do tipo.
  const own = membersOf(base).find((x) => x.n === name && x.k !== "m");
  if (own && own.t === name) return { type: name, both: true };
  if (own) return { type: own.t };
  if (T[name]) return { type: name, isStatic: true };
  const m2 = [...text.slice(0, at).matchAll(new RegExp(`\\b${name}\\s*=\\s*new\\s+(\\w+)`, "g"))].pop();
  if (m2) return { type: m2[1] };
  return null;
}
function resolveChain(expr, text, at, base) {
  const parts = expr.replace(/\([^()]*\)/g, "()").split(".").filter(Boolean);
  if (!parts.length) return null;
  let cur = typeOfName(parts[0].replace(/\(\)$/, ""), text, at, base);
  if (!cur && /\(\)$/.test(parts[0])) {
    const m = membersOf(base).find((x) => x.n === parts[0].slice(0, -2));
    cur = m ? { type: m.t } : null;
  }
  for (let i = 1; cur && i < parts.length; i++) {
    const name = parts[i].replace(/\(\)$/, "");
    const m = membersOf(cur.type.replace(/\?$/, "")).find((x) => x.n === name);
    cur = m ? { type: m.t } : null;
  }
  return cur;
}
const normWord = (w) => w.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
// Onde o cursor está: fora de classe, no corpo da classe ou dentro de um método.
function editContext(text, at) {
  const { tokens } = lex(text.slice(0, at));
  const stack = [];
  let pending = [];
  for (const t of tokens) {
    if (t.t === "ws" || t.t === "com" || t.t === "pp") continue;
    if (t.v === "{" && t.t === "op") {
      stack.push(pending.some((v) => ["class", "struct", "record", "interface"].includes(v)) ? "class" : pending.includes("namespace") ? "ns" : "code");
      pending = [];
    } else if (t.v === "}" && t.t === "op") { stack.pop(); pending = []; }
    else if (t.v === ";" && t.t === "op") pending = [];
    else pending.push(t.v);
  }
  const top = stack[stack.length - 1];
  return !top || top === "ns" ? "top" : top === "class" ? "member" : "code";
}
function snippetFits(s, ctx, base) {
  const where = s.where || (s.folder ? "top" : "code");
  if (where !== ctx) return false;
  return !s.bases || chain(base).some((_, i) => { let t = base; for (let k = 0; k < i; k++) t = T[t].base; return s.bases.includes(t); });
}
function overrideBody(m, withHeader) {
  const fallback = { bool: "false", int: "0", float: "0f", string: '""' }[m.t];
  const inner = m.t === "void" ? "«0»" : `return «0:${fallback ?? "default"}»;`;
  const sig = `${m.t} ${m.n}(${(m.p || "").replace(/\s*=\s*[^,]+/g, "")})`;
  return `${withHeader ? "public override " : ""}${sig}\n{\n    ${inner}\n}`;
}
// Bloco que nasce de uma palavra: uma classe inteira, um método ou um trecho, conforme o contexto.
function smartItems(word, ctx, base, force) {
  const low = normWord(word);
  if (!force && low.length < 2) return [];
  const shortWord = low.length < 3;
  const items = [];
  for (const s of ALL_SNIPPETS) {
    if (!snippetFits(s, ctx, base)) continue;
    const words = normWord(`${s.prefix} ${s.keys || ""} ${s.title}`).split(/[^a-z0-9]+/);
    // Com duas letras, só a palavra exata ("if"): evita uma lista enorme a cada toque.
    if (low && !words.some((w) => (shortWord ? w === low : w.startsWith(low)))) continue;
    items.push({ label: s.title, kind: "»", detail: s.prefix, name: s.prefix, snippetRef: s });
  }
  if (ctx === "member" && T[base] && !shortWord) {
    const seen = new Set();
    for (const m of membersOf(base)) {
      if (m.k !== "m" || !(m.a || m.v) || !normWord(m.n).startsWith(low)) continue;
      const key = m.n + m.p;
      if (seen.has(key)) continue;
      seen.add(key);
      items.push({ label: `${m.n}(${m.p})`, kind: "ƒ", detail: "override", name: m.n, snippet: overrideBody(m, true) });
    }
  }
  // Dentro de SetDefaults e afins, a propriedade já vem com o = e o tipo certo de valor.
  if (ctx === "code" && T[base] && low) {
    const seen = new Set();
    for (const m of membersOf(base)) {
      if (m.k !== "p" || !m.w || !normWord(m.n).startsWith(low) || seen.has(m.n)) continue;
      seen.add(m.n);
      items.push({ label: m.n, kind: "P", detail: m.t, name: m.n, snippet: propertyStatement(m) });
    }
  }
  return items;
}
function propertyStatement(m) {
  if (m.t === "string") return `${m.n} = "«0»";`;
  if (m.t === "bool") return `${m.n} = «0:true»;`;
  if (m.t === "float") return `${m.n} = «0:1»f;`;
  if (m.t === "int") return `${m.n} = «0:1»;`;
  if (T[m.t]?.kind === "enum") return `${m.n} = ${m.t}.«0»;`;
  return `${m.n} = «0»;`;
}
// Ajusta o snippet ao arquivo aberto: sem repetir using nem namespace, e com o nome do arquivo na classe.
function prepareSnippet(s, start, end) {
  const dir = s.folder ? dirForFolder(s.folder) : "Content/Items";
  const vars = { NS: projectNamespace(dir), DIR: dir, CLASS: enclosingClass(src.value, start) };
  let body = s.body, addUsings = "";
  if (s.using && !new RegExp(`\\busing\\s+${s.using.replace(/\./g, "\\.")}\\s*;`).test(src.value)) addUsings = `using ${s.using};\n`;
  if (!s.folder) return { body, vars, addUsings };
  const text = src.value.slice(0, start) + src.value.slice(end); // sem a palavra que está sendo trocada
  const fileName = (state.active || "").split("/").pop().replace(/\.(cs|js)$/, "");
  if (!/\bclass\s/.test(text) && /^[A-Za-z_]\w*$/.test(fileName)) vars[1] = fileName;
  if (text.trim()) {
    const header = /^(?:using [^;]+;\n)+\nnamespace «NS»;\n\n/.exec(body);
    if (header) {
      body = (/\bnamespace\s/.test(text) ? "" : "namespace «NS»;\n\n") + body.slice(header[0].length);
      for (const line of header[0].split("\n")) {
        if (line.startsWith("using ") && !text.includes(line)) addUsings += line + "\n";
      }
    }
  }
  return { body, vars, addUsings };
}
function smartInsert(s, start, end) {
  const { body, vars, addUsings } = prepareSnippet(s, start, end);
  if (addUsings) { replaceRange(0, 0, addUsings); start += addUsings.length; end += addUsings.length; }
  insertSnippet({ body }, start, end, vars);
  if (s.texture && vars[1]) {
    const png = `${vars.DIR}/${vars[1]}.png`;
    if (files()[png] === undefined) { files()[png] = b64ToBytes(STARTER_PNG); scheduleSave(); renderTree(); toast("Textura provisória criada."); }
    if (s.loc) addTranslation(s.loc, vars[1]);
  }
}
// O nome que aparece no jogo vem das traduções: cada conteúdo novo já entra lá com o nome da classe.
function addTranslation(category, cls) {
  if (isJsProject()) { addTranslationJs(category, cls); return; }
  const path = `Localization/pt-BR_Mods.${projectId()}.hjson`;
  const name = cls.replace(/([a-z0-9])([A-Z])/g, "$1 $2");
  const text = typeof files()[path] === "string" ? files()[path] : "";
  if (new RegExp(`\\b${cls}\\s*:`).test(text)) return;
  const entry = `\t${cls}: {\n\t\tDisplayName: ${name}\n\t\tTooltip: ""\n\t}\n`;
  const open = new RegExp(`^${category}\\s*:\\s*\\{[ \\t]*\\n`, "m").exec(text);
  files()[path] = open ? text.slice(0, open.index + open[0].length) + entry + text.slice(open.index + open[0].length)
    : text + (text && !text.endsWith("\n") ? "\n" : "") + `${category}: {\n${entry}}\n`;
  scheduleSave(); renderTree();
}
function previewOf(item) {
  if (item.snippetRef) { const p = prepareSnippet(item.snippetRef, completion.start, completion.end); return expandSnippet(p.body, p.vars).text; }
  if (item.snippet) return expandSnippet(item.snippet, {}).text;
  return "";
}

function memberItem(m) {
  const kind = m.k === "m" ? "ƒ" : m.k === "e" ? "E" : m.k === "c" ? "C" : "P";
  const label = m.k === "m" ? `${m.n}(${m.p})` : m.n;
  return { label, insert: m.k === "m" ? `${m.n}(${m.p ? "" : ")"}` : m.n, closeParen: m.k === "m" && !!m.p, kind, detail: m.t === "enum" ? "" : m.t, name: m.n };
}
