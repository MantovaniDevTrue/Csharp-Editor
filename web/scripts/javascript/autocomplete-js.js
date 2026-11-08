// ---------- Autocomplete de JavaScript ----------
const JS_PARAM_TYPES = { player: "Player", npc: "NPC", target: "NPC", item: "Item", weapon: "Item", ammo: "Item", proj: "Projectile", projectile: "Projectile", tile: "Tile" };
const JS_GAME_ROOTS = ["Terraria", "Microsoft", "System", "ReLogic"];
const JS_WORDS = ["export", "class", "extends", "const", "let", "return", "import", "from", "this", "true", "false", "null", "undefined", "if", "else", "for", "of", "while", "switch", "case", "break", "new", "static", "async", "await", "function", "typeof", "instanceof"];

function jsEnclosingClass(text, at) {
  let found = null;
  for (const m of text.slice(0, at).matchAll(/\bclass\s+([\w$]+)(?:\s+extends\s+([\w$.]+))?/g)) found = { name: m[1], base: (m[2] || "").split(".").pop() };
  return found;
}
// Sobe pelas classes do mod até uma classe do Bunny (MinhaArma extends ArmaBase extends ModItem).
function jsRootOf(base) {
  let name = base;
  for (let hops = 0; name && hops < 8; hops++) {
    if (JSI.classes[name]) return name;
    let next = null;
    for (const [path, text] of Object.entries(files())) {
      if (!isJsSource(path) || typeof text !== "string") continue;
      const m = new RegExp(`\\bclass\\s+${name}\\s+extends\\s+([\\w$.]+)`).exec(text);
      if (m) { next = m[1].split(".").pop(); break; }
    }
    name = next;
  }
  return null;
}
function jsEditContext(text, at) {
  const stack = [];
  let pending = [];
  for (const t of lexJs(text.slice(0, at)).tokens) {
    if (t.t === "ws" || t.t === "com") continue;
    if (t.v === "{" && t.t === "op") {
      // Corpo de classe só quando o { vem logo depois do cabeçalho "class X extends Y".
      stack.push(pending.includes("class") && !pending.includes("=>") && !pending.includes("(") ? "class" : "code");
      pending = [];
    } else if (t.v === "}" && t.t === "op") { stack.pop(); pending = []; }
    else if (t.v === ";" && t.t === "op") pending = [];
    else if (t.t === "str" && t.v.startsWith("`") && t.v.includes("${")) pending = [];
    else pending.push(t.v);
  }
  const top = stack[stack.length - 1];
  return !top ? "top" : top === "class" ? "member" : "code";
}
function jsLocalNames(text, at) {
  const out = new Set();
  const before = text.slice(Math.max(0, at - 8000), at);
  for (const m of before.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g)) out.add(m[1]);
  for (const m of before.matchAll(/\b(?:const|let|var)\s*\{([^}]*)\}/g)) for (const name of m[1].split(",")) { const n = name.split(":").pop().trim(); if (/^[A-Za-z_$][\w$]*$/.test(n)) out.add(n); }
  for (const m of before.matchAll(/^\s*(?:async\s+)?[A-Za-z_$][\w$]*\s*\(([^)]*)\)\s*\{/gm)) for (const p of m[1].split(",")) { const n = p.split("=")[0].trim(); if (/^[A-Za-z_$][\w$]*$/.test(n)) out.add(n); }
  for (const m of before.matchAll(/\bimport\s*\{([^}]*)\}/g)) for (const p of m[1].split(",")) { const n = p.split(/\s+as\s+/).pop().trim(); if (n) out.add(n); }
  return [...out];
}
// Nomes declarados no topo como atalho para uma classe do jogo: const { ItemID } = Terraria.ID; const Main = Terraria.Main.
function jsAliasType(name, text) {
  if (new RegExp(`\\bconst\\s*\\{[^}]*\\b${name}\\b[^}]*\\}\\s*=\\s*(?:Terraria|Microsoft)[\\w.]*`).test(text) && T[name]) return name;
  const m = new RegExp(`\\bconst\\s+${name}\\s*=\\s*((?:Terraria|Microsoft)(?:\\.\\w+)+)\\s*;`).exec(text);
  if (m) { const last = m[1].split(".").pop(); if (T[last]) return last; }
  return null;
}
function jsItemsFromType(type, isStatic, word) {
  const low = word.toLowerCase(), seen = new Set();
  return membersOf(type)
    .filter((m) => T[type]?.kind === "enum" || (isStatic ? m.s : !m.s))
    .filter((m) => m.n.toLowerCase().startsWith(low) && !seen.has(m.n) && seen.add(m.n))
    .map(memberItem);
}
function jsStaticItems(cls, word) {
  const low = word.toLowerCase(), seen = new Set();
  return jsMembers(cls).filter((m) => ["s", "sg", "ss"].includes(m.k) && m.n.toLowerCase().startsWith(low) && !seen.has(m.n) && seen.add(m.n))
    .map((m) => ({ label: m.k === "s" ? `${m.n}(${m.p})` : m.n, insert: m.k === "s" ? `${m.n}(${m.p ? "" : ")"}` : m.n, closeParen: m.k === "s" && !!m.p, kind: m.k === "s" ? "ƒ" : "P", detail: m.d || cls, name: m.n }));
}
function jsDotCompletions(chainText, word, text, at, root) {
  const parts = chainText.split(".").map((p) => p.replace(/\(.*\)$/, "()").replace(/\?$/, ""));
  const start = at - word.length;
  const done = (items) => (items.length ? { start, end: at, items: items.slice(0, 60) } : null);
  const low = word.toLowerCase();
  if (parts[0] === "bl") {
    const prefix = parts.slice(1).join(".");
    const names = [...new Set(JSI.bl.filter((n) => (prefix ? n.startsWith(prefix + ".") : true)).map((n) => n.slice(prefix ? prefix.length + 1 : 0).split(".")[0]))];
    return done(names.filter((n) => n.toLowerCase().startsWith(low)).map((n) => ({ label: n, insert: n, kind: "ƒ", detail: "bl", name: n })));
  }
  let type = null, isStatic = false, i = 1;
  if (parts[0] === "this") {
    const entity = root && jsEntityOf(root);
    if (parts.length === 1) {
      const items = [];
      if (entity) items.push({ label: entity, insert: entity, kind: "P", detail: "a entidade do jogo", name: entity });
      const seen = new Set(items.map((x) => x.name));
      if (root) for (const m of jsMembers(root)) {
        if (m.hook || ["s", "sg", "ss", "c", "x"].includes(m.k) || seen.has(m.n) || !m.n.toLowerCase().startsWith(low)) continue;
        seen.add(m.n);
        items.push(m.k === "i" ? { label: `${m.n}(${m.p})`, insert: `${m.n}(${m.p ? "" : ")"}`, closeParen: !!m.p, kind: "ƒ", detail: m.d || m.owner, name: m.n } : { label: m.n, insert: m.n, kind: "P", detail: m.d || m.owner, name: m.n });
      }
      const cls = jsEnclosingClass(text, at);
      if (cls) {
        const body = text.slice(text.lastIndexOf("class " + cls.name, at));
        for (const m of body.matchAll(/^\s+(?:static\s+)?([A-Za-z_$][\w$]*)\s*=/gm)) if (!seen.has(m[1]) && m[1].toLowerCase().startsWith(low)) { seen.add(m[1]); items.push({ label: m[1], insert: m[1], kind: "V", detail: "campo", name: m[1] }); }
        for (const m of body.matchAll(/\bthis\.([A-Za-z_$][\w$]*)\s*=/g)) if (!seen.has(m[1]) && m[1].toLowerCase().startsWith(low)) { seen.add(m[1]); items.push({ label: m[1], insert: m[1], kind: "V", detail: "campo", name: m[1] }); }
      }
      return done(items.filter((x) => x.name.toLowerCase().startsWith(low)));
    }
    if (entity && parts[1] === entity) { type = entity; i = 2; }
    else return null;
  } else if (JS_GAME_ROOTS.includes(parts[0])) {
    let path = parts[0];
    for (; i < parts.length && isJsNamespace(path + "." + parts[i]); i++) path += "." + parts[i];
    if (i === parts.length) {
      const { spaces, types } = jsNamespaceChildren(path);
      return done([...spaces.map((n) => ({ label: n, insert: n, kind: "N", detail: "namespace", name: n })), ...types.map((n) => ({ label: n, insert: n, kind: "T", detail: T[n].kind, name: n }))].filter((x) => x.name.toLowerCase().startsWith(low)));
    }
    if (T[parts[i]]) { type = parts[i]; isStatic = true; i++; } else return null;
  } else if (JSI.classes[parts[0]] && parts.length === 1) {
    const items = jsStaticItems(parts[0], word);
    if (T[parts[0]]) items.push(...jsItemsFromType(parts[0], true, word).filter((x) => !items.some((y) => y.name === x.name)));
    return done(items);
  } else if (T[parts[0]] && (JSI.globals.includes(parts[0]) || jsAliasType(parts[0], text))) {
    type = parts[0]; isStatic = true;
    if (parts.length === 1 && ["Color", "Vector2", "Rectangle", "Point16"].includes(type) && "new".startsWith(low)) {
      const ctor = { label: "new(…)", insert: "new(", closeParen: true, kind: "ƒ", detail: "cria um " + type, name: "new" };
      return done([ctor, ...jsItemsFromType(type, true, word)]);
    }
  } else if (jsAliasType(parts[0], text)) {
    type = jsAliasType(parts[0], text); isStatic = true;
  } else if (JS_PARAM_TYPES[parts[0]]) {
    type = JS_PARAM_TYPES[parts[0]];
  } else return null;
  for (; type && i < parts.length; i++) {
    const name = parts[i].replace(/\(\)$/, "");
    const m = membersOf(type).find((x) => x.n === name);
    type = m ? m.t.replace(/\?$/, "").replace(/\[\]$/, "") : null;
    isStatic = false;
  }
  if (!type || !T[type]) return null;
  return done(jsItemsFromType(type, isStatic, word));
}
function jsHookSnippet(m) {
  return `${m.n}(${m.p.replace(/\s*=\s*[^,]+/g, "")}) {\n    «0»\n}`;
}
function completionsJs(force = false) {
  const text = src.value, at = src.selectionStart;
  if (src.selectionEnd !== at) return null;
  const tokens = lexJs(text.slice(0, at)).tokens;
  const last = tokens[tokens.length - 1];
  if (last?.t === "com" || ((last?.t === "str" || last?.t === "re") && last.e === at)) return null;
  const before = text.slice(Math.max(0, at - 240), at);
  const cls = jsEnclosingClass(text, at);
  const root = cls?.base ? jsRootOf(cls.base) : null;
  // extends: as classes do Bunny e as do próprio mod.
  const ext = /\bextends\s+([\w$]*)$/.exec(before);
  if (ext) {
    const low = ext[1].toLowerCase();
    const own = Object.entries(files()).filter(([p, v]) => isJsSource(p) && typeof v === "string").flatMap(([, v]) => [...v.matchAll(/\bclass\s+([\w$]+)/g)].map((m) => m[1]));
    const names = [...new Set([...Object.keys(JSI.classes), ...own])].filter((n) => n.toLowerCase().startsWith(low));
    return names.length ? { start: at - ext[1].length, end: at, items: names.slice(0, 40).map((n) => ({ label: n, insert: n, kind: CLASS_ICON, detail: JSI.classes[n] ? "Bunny" : "do seu mod", name: n })) } : null;
  }
  const dot = /((?:[A-Za-z_$][\w$]*(?:\([^()]*\))?\s*\??\.\s*)+)([\w$]*)$/.exec(before);
  if (dot) return jsDotCompletions(dot[1].replace(/\s+/g, "").replace(/\??\.$/, ""), dot[2], text, at, root);
  const wordMatch = /[A-Za-z_$][\w$]*$/.exec(before);
  const word = wordMatch ? wordMatch[0] : "";
  if (!word && !force) return null;
  if (word.length < 2 && !force) return null;
  const low = normWord(word);
  const start = at - word.length;
  const lineBefore = before.slice(before.lastIndexOf("\n") + 1, before.length - word.length);
  const items = [];
  const seen = new Set();
  const push = (item) => { if (!seen.has(item.name) && item.name !== word) { seen.add(item.name); items.push(item); } };
  if (lineBefore.trim() === "") {
    const ctx = jsEditContext(text, start);
    for (const s of JS_SNIPPETS) {
      const where = s.where || (s.folder ? "top" : "code");
      if (where !== ctx || (s.bases && !(root && jsChain(root).some((n) => s.bases.includes(n))))) continue;
      const words = normWord(`${s.prefix} ${s.keys || ""} ${s.title}`).split(/[^a-z0-9]+/);
      if (low && !words.some((w) => (low.length < 3 ? w === low : w.startsWith(low)))) continue;
      push({ label: s.title, kind: "»", detail: s.prefix, name: s.prefix, snippetRef: s });
    }
    // No corpo da classe: os métodos que o jogo chama, já com os parâmetros.
    if (ctx === "member" && root && low.length >= 2) {
      for (const m of jsHooks(root)) if (normWord(m.n).startsWith(low)) push({ label: `${m.n}(${m.p})`, kind: "ƒ", detail: m.d || "gancho", name: m.n, snippet: jsHookSnippet(m) });
    }
  }
  const lowRaw = word.toLowerCase();
  for (const name of jsLocalNames(text, at)) if (name.toLowerCase().startsWith(lowRaw)) push({ label: name, insert: name, kind: "V", detail: "local", name });
  for (const name of JSI.globals) if (name.toLowerCase().startsWith(lowRaw)) push({ label: name, insert: name, kind: "G", detail: "global", name });
  for (const name of Object.keys(JSI.classes)) if (name.toLowerCase().startsWith(lowRaw)) push({ label: name, insert: name, kind: CLASS_ICON, detail: "Bunny", name });
  for (const name of JSI.objects) if (name.toLowerCase().startsWith(lowRaw)) push({ label: name, insert: name, kind: "T", detail: "Bunny", name });
  for (const kw of JS_WORDS) if (kw.startsWith(lowRaw)) push({ label: kw, insert: kw, kind: "k", detail: "", name: kw });
  return items.length ? { start, end: at, items: items.slice(0, 50) } : null;
}
