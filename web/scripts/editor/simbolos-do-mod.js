// ---------- Símbolos do próprio mod ----------
const scanCache = new Map();
const projectExtras = { types: new Set(), globals: new Set() };
function projectIndex() {
  const classes = new Map();
  projectExtras.types = new Set(); projectExtras.globals = new Set();
  const live = new Set();
  for (const [path, value] of Object.entries(files())) {
    if (!path.endsWith(".cs") || typeof value !== "string") continue;
    live.add(path);
    let hit = scanCache.get(path);
    if (!hit || hit.value !== value) {
      const scan = scanFile(path, value);
      const types = [];
      scan.sig.forEach((t, i) => { if (["struct", "enum", "interface", "record"].includes(t.v) && scan.sig[i + 1]?.t === "id") types.push(scan.sig[i + 1].v); });
      hit = { value, types, globals: [...scan.globals], classes: scan.classes.map((c) => ({ name: c.name, ns: scan.ns, base: c.base, abstract: c.mods.has("abstract"), isStatic: c.mods.has("static"), members: [...classMembers(scan, c).declared], path })) };
      scanCache.set(path, hit);
    }
    for (const c of hit.classes) if (!classes.has(c.name)) classes.set(c.name, c);
    hit.types.forEach((t) => projectExtras.types.add(t));
    hit.globals.forEach((g) => projectExtras.globals.add(g));
  }
  for (const key of scanCache.keys()) if (!live.has(key)) scanCache.delete(key);
  return classes;
}
function rootBase(cls, classes) {
  let cur = cls, hops = 0;
  while (cur && hops++ < 16) { if (T[cur.base]) return cur.base; cur = classes.get(cur.base); }
  return "";
}
function classesOfKind(base) {
  const classes = projectIndex();
  return [...classes.values()].filter((c) => !c.abstract && (!base || rootBase(c, classes) === base)).map((c) => c.name).sort();
}
const CLASS_ICON = "T";
function pickItems(names, word, insert = (n) => n, detail = "do seu mod") {
  const low = word.toLowerCase();
  return names.filter((n) => n.toLowerCase().includes(low)).slice(0, 40).map((n) => ({ label: n, insert: insert(n), kind: CLASS_ICON, detail, name: n }));
}
const NAMEOF_TARGETS = {};
const CONTENT_GENERICS = { ItemType: "ModItem", ProjectileType: "ModProjectile", NPCType: "ModNPC", BuffType: "ModBuff", TileType: "ModTile", WallType: "ModWall", AddIngredient: "ModItem", AddTile: "ModTile", GetModPlayer: "ModPlayer", GetInstance: "" };
function stringCompletions(before, at) {
  const line = before.slice(before.lastIndexOf("\n") + 1);
  const m = /\bTexture\s*=>\s*"([^"]*)$/.exec(line);
  if (m) {
    const id = projectId();
    const paths = Object.keys(files()).filter((p) => p.endsWith(".png")).map((p) => `${id}/${p.replace(/\.png$/, "")}`);
    const items = pickItems(paths, m[1], undefined, "textura");
    return items.length ? { start: at - m[1].length, end: at, items } : null;
  }
  return null;
}
// Valores depois do = e do nameof(, conforme o tipo da propriedade.
function valueCompletions(before, at, base) {
  const line = before.slice(before.lastIndexOf("\n") + 1);
  let m = /\bnameof\(\s*(\w*)$/.exec(line);
  if (m) {
    const owner = /\b(\w+)\s*=\s*nameof\(\s*\w*$/.exec(line);
    const items = pickItems(classesOfKind(owner && NAMEOF_TARGETS[owner[1]]), m[1]);
    return items.length ? { start: at - m[1].length, end: at, items } : null;
  }
  m = /^\s*(?:this\.)?([A-Z]\w*)\s*=\s*(\w*)$/.exec(line);
  if (m) {
    const [, prop, word] = m;
    const member = membersOf(base).find((x) => x.n === prop);
    if (!member) return null;
    if (NAMEOF_TARGETS[prop]) {
      const items = pickItems(classesOfKind(NAMEOF_TARGETS[prop]), word, (n) => `nameof(${n});`);
      return items.length ? { start: at - word.length, end: at, items } : null;
    }
    let values = null;
    if (T[member.t]?.kind === "enum") values = T[member.t].members.map((e) => `${member.t}.${e.n}`);
    else if (member.t === "bool") values = ["true", "false"];
    if (!values) return null;
    const low = word.toLowerCase();
    const items = values.filter((v) => v.toLowerCase().includes(low)).map((v) => ({ label: v, insert: v + ";", kind: "E", detail: "", name: v }));
    return items.length ? { start: at - word.length, end: at, items } : null;
  }
  return null;
}
// class Foo : Bunny... escolhe a base e já cria o corpo com o que ela exige.
function classHeaderCompletions(before, text, at) {
  const line = before.slice(before.lastIndexOf("\n") + 1);
  const m = /\bclass\s+(\w+)\s*:\s*(\w*)$/.exec(line);
  if (!m) return null;
  const [, name, word] = m;
  const hasBody = /^\s*\{/.test(text.slice(at));
  const low = word.toLowerCase();
  const items = [];
  for (const base of CONTENT_BASES) {
    if (!base.toLowerCase().includes(low)) continue;
    items.push(hasBody
      ? { label: base, insert: base, kind: CLASS_ICON, detail: "SDK", name: base }
      : { label: base, kind: CLASS_ICON, detail: "cria o corpo", name: base, snippet: classBodyFor(name, base), needsSdkUsing: true });
  }
  for (const n of classesOfKind("")) if (n !== name && n.toLowerCase().includes(low)) items.push({ label: n, insert: n, kind: CLASS_ICON, detail: "do seu mod", name: n });
  for (const c of projectIndex().values()) if (c.abstract && c.name.toLowerCase().includes(low) && !items.some((i) => i.name === c.name)) items.push({ label: c.name, insert: c.name, kind: CLASS_ICON, detail: "base do seu mod", name: c.name });
  return items.length ? { start: at - word.length, end: at, items: items.slice(0, 30) } : null;
}
function classBodyFor(name, base) {
  const entity = ENTITY_OF[base];
  const body = {
    ModItem: "public override void SetDefaults()\n{\n    Item.width = 20;\n    Item.height = 20;\n    «0»\n}",
    ModProjectile: "public override void SetDefaults()\n{\n    Projectile.width = 8;\n    Projectile.height = 8;\n    Projectile.friendly = true;\n    «0»\n}",
    ModNPC: "public override void SetDefaults()\n{\n    NPC.width = 36;\n    NPC.height = 36;\n    NPC.lifeMax = 25;\n    «0»\n}",
    ModBuff: "public override void Update(Player player, ref int buffIndex)\n{\n    «0»\n}",
    ModTile: "public override void SetStaticDefaults()\n{\n    Main.tileSolid[Type] = true;\n    «0»\n}",
    ModWall: "public override void SetStaticDefaults()\n{\n    Main.wallHouse[Type] = true;\n    «0»\n}",
    ModPlayer: "public override void PostUpdate()\n{\n    «0»\n}",
    ModSystem: "public override void AddRecipes()\n{\n    «0»\n}",
    GlobalItem: "public override void SetDefaults(Item item)\n{\n    «0»\n}",
    GlobalNPC: "public override void SetDefaults(NPC npc)\n{\n    «0»\n}",
    GlobalProjectile: "public override void SetDefaults(Projectile projectile)\n{\n    «0»\n}",
  }[base] || "«0»";
  return `${base}\n{\n    ${body.replace(/\n/g, "\n    ")}\n}`;
}
const BCL_STATIC = {
  Math: "Abs Clamp Max Min Pow Sqrt Round Floor Ceiling Sign Sin Cos Tan Atan2 PI".split(" "),
  MathF: "Abs Clamp Max Min Pow Sqrt Round Floor Ceiling Sign Sin Cos Tan Atan2 PI".split(" "),
  string: "IsNullOrEmpty IsNullOrWhiteSpace Join Format Concat".split(" "),
  float: "IsFinite IsNaN MaxValue MinValue".split(" "),
  Console: ["WriteLine"],
};
function localNames(text, at) {
  const out = new Set();
  for (const m of text.slice(Math.max(0, at - 6000), at).matchAll(/\b(?:var|int|float|bool|string|uint|double|long|Item|NPC|Player|Projectile|Vector2|Color|Rectangle)\s+([a-zA-Z_]\w*)\s*(?=[=;,)]|in\b)/g)) out.add(m[1]);
  return [...out];
}

function completions(force = false) {
  const text = src.value, at = src.selectionStart;
  if (!state.active?.endsWith(".cs") || src.selectionEnd !== at) return null;
  const before = text.slice(Math.max(0, at - 240), at);
  // Dentro de string ou comentário não sugere.
  const { tokens } = lex(text.slice(0, at));
  const last = tokens[tokens.length - 1];
  if (last?.t === "com") return null;
  const lexed = lex(text.slice(0, at));
  const inString = last?.t === "str" && lexed.errors.some((e) => e.at === last.s);
  if (inString) return stringCompletions(before, at);
  const base = enclosingBase(text, at);

  const header = classHeaderCompletions(before, text, at);
  if (header) return header;
  const generic = /\b(\w+)<(\w*)$/.exec(before);
  if (generic && generic[1] in CONTENT_GENERICS) {
    const items = pickItems(classesOfKind(CONTENT_GENERICS[generic[1]]), generic[2]);
    if (items.length) return { start: at - generic[2].length, end: at, items };
  }
  const value = valueCompletions(before, at, base);
  if (value) return value;
  const newExpr = /\bnew\s+(\w*)$/.exec(before);
  if (newExpr) {
    const low = newExpr[1].toLowerCase();
    const names = [...classesOfKind(""), ...["List", "Dictionary", "Vector2", "Color", "Rectangle"]].filter((n) => n.toLowerCase().startsWith(low));
    if (names.length) return { start: at - newExpr[1].length, end: at, items: names.slice(0, 30).map((n) => ({ label: n, insert: n, kind: CLASS_ICON, detail: "", name: n })) };
  }

  const over = /\boverride\s+(\w*)$/.exec(before);
  if (over) {
    const word = over[1];
    const start = at - word.length;
    const items = membersOf(base).filter((m) => m.k === "m" && (m.a || m.v) && m.n.toLowerCase().startsWith(word.toLowerCase()))
      .map((m) => ({
        label: `${m.n}(${m.p})`, kind: "ƒ", detail: m.t, name: m.n,
        snippet: overrideBody(m, false),
      }));
    return items.length ? { start, end: at, items } : null;
  }

  const dot = /((?:[A-Za-z_]\w*(?:\([^()]*\))?\s*\.\s*)+)(\w*)$/.exec(before);
  if (dot) {
    const word = dot[2];
    const chainText = dot[1].replace(/\s+/g, "").replace(/\.$/, "");
    if (BCL_STATIC[chainText]) {
      const items = BCL_STATIC[chainText].filter((n) => n.toLowerCase().startsWith(word.toLowerCase())).map((n) => ({ label: n, insert: n, kind: "ƒ", detail: chainText, name: n }));
      return items.length ? { start: at - word.length, end: at, items } : null;
    }
    const info = resolveChain(chainText, text, at, base);
    if (!info || !T[info.type?.replace(/\?$/, "")]) {
      // Membros de uma classe do próprio mod: Classe.Membro ou variável criada com new Classe().
      const classes = projectIndex();
      const owner = classes.get(chainText) || classes.get((new RegExp(`\\b${chainText}\\s*=\\s*new\\s+(\\w+)`).exec(text.slice(0, at)) || new RegExp(`\\b(\\w+)\\s+${chainText}\\b`).exec(text.slice(0, at)) || [])[1]);
      if (!owner) return null;
      const items = owner.members.filter((n) => n.toLowerCase().startsWith(word.toLowerCase())).slice(0, 40).map((n) => ({ label: n, insert: n, kind: "P", detail: owner.name, name: n }));
      return items.length ? { start: at - word.length, end: at, items } : null;
    }
    const type = info.type.replace(/\?$/, "");
    const seen = new Set();
    const items = membersOf(type)
      .filter((m) => info.both || T[type].partial || (info.isStatic ? m.s : !m.s) || T[type].kind === "enum")
      .filter((m) => m.n.toLowerCase().startsWith(word.toLowerCase()))
      .filter((m) => { const key = m.n + (m.p || ""); if (seen.has(key)) return false; seen.add(key); return true; })
      .map(memberItem);
    return items.length ? { start: at - word.length, end: at, items: items.slice(0, 60) } : null;
  }

  const wordMatch = /[\p{L}_][\p{L}\p{N}_]*$/u.exec(before);
  const word = wordMatch ? wordMatch[0] : "";
  if (!word && !force) return null;
  if (word.length < 2 && !force) return null;
  const low = word.toLowerCase();
  const lineBefore = before.slice(before.lastIndexOf("\n") + 1, before.length - word.length);
  // Blocos grandes só no começo da linha: assim não atrapalham quem está escrevendo uma expressão.
  const items = lineBefore.trim() === "" ? smartItems(word, editContext(text, at - word.length), base, force) : [];
  const seen = new Set();
  for (const it of items) seen.add(it.name);
  for (const m of membersOf(base)) {
    if (!m.n.toLowerCase().startsWith(low) || seen.has(m.n)) continue;
    seen.add(m.n); items.push(memberItem(m));
  }
  for (const name of localNames(text, at)) if (name.toLowerCase().startsWith(low) && name !== word && !seen.has(name)) { seen.add(name); items.push({ label: name, insert: name, kind: "V", detail: "local", name }); }
  for (const name of classesOfKind("")) if (name.toLowerCase().startsWith(low) && name !== word) items.push({ label: name, insert: name, kind: CLASS_ICON, detail: "do seu mod", name });
  for (const name of Object.keys(T)) if (name.toLowerCase().startsWith(low)) items.push({ label: name, insert: name, kind: "T", detail: T[name].kind, name });
  for (const kw of ["override", "public", "private", "return", "float", "string", "bool", "using", "namespace", "nameof", "class", "sealed"]) if (word && kw.startsWith(low) && kw !== low) items.push({ label: kw, insert: kw, kind: "k", detail: "", name: kw });
  return items.length ? { start: at - word.length, end: at, items: items.slice(0, 50) } : null;
}
function showCompletions(force = false) {
  const result = completions(force);
  if (!result) { closePopup(); return; }
  // Palavra já completa não abre lista: Enter continua sendo só uma quebra de linha.
  if (!force && result.items.length === 1 && result.items[0].insert === src.value.slice(result.start, result.end)) { closePopup(); return; }
  completion = { ...result, index: 0 };
  $("popList").replaceChildren(...result.items.map((item, i) => {
    const b = document.createElement("button");
    b.type = "button"; b.setAttribute("role", "option");
    b.innerHTML = `<span class="k">${esc(item.kind)}</span><span>${esc(item.label)}</span><span class="d">${esc(item.detail || "")}</span>`;
    b.addEventListener("pointerdown", (e) => e.preventDefault());
    b.addEventListener("click", () => { completion.index = i; acceptCompletion(); });
    return b;
  }));
  pop.hidden = false;
  highlightCompletion();
  placePopup();
}
function highlightCompletion() {
  const list = $("popList"), prev = $("popPrev");
  [...list.children].forEach((el, i) => el.classList.toggle("on", i === completion.index));
  list.children[completion.index]?.scrollIntoView({ block: "nearest" });
  const code = previewOf(completion.items[completion.index]);
  prev.hidden = !code;
  prev.textContent = code;
  prev.scrollTop = 0;
}
function placePopup() {
  const p = caretPoint();
  const edW = $("ed").clientWidth, edH = $("ed").clientHeight;
  const popW = pop.offsetWidth, popH = pop.offsetHeight;
  let x = p.x, y = p.y + lineH;
  if (x + popW > edW - 4) x = Math.max(4, edW - popW - 4);
  if (y + popH > edH - 4) y = Math.max(4, y - popH - lineH - 2);
  pop.style.left = x + "px"; pop.style.top = y + "px";
}
function acceptCompletion() {
  const { start, end, items, index } = completion;
  const item = items[index];
  closePopup();
  if (item.snippetRef) {
    smartInsert(item.snippetRef, start, end);
    return;
  }
  if (item.snippet) {
    let from = start, to = end;
    if (item.needsSdkUsing && !/\busing\s+Terraria\.ModLoader\s*;/.test(src.value)) {
      const line = "using Terraria;\nusing Terraria.ModLoader;\n";
      replaceRange(0, 0, line); from += line.length; to += line.length;
    }
    insertSnippet({ body: item.snippet }, from, to);
    return;
  }
  replaceRange(start, end, item.insert);
  if (item.closeParen) { const caret = src.selectionStart; replaceRange(caret, caret, ")"); src.setSelectionRange(caret, caret); }
  session = null;
}
function dirForFolder(folder) { return state.active?.endsWith(".cs") ? (state.active.split("/").slice(0, -1).join("/") || folder) : folder; }

