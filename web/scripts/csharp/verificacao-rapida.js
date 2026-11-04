function quickCheck(files, only = null) {
  const problems = [];
  const add = (sev, path, at, src, code, msg, hint) => {
    const pos = at == null || !src ? { line: 0, col: 0 } : lineCol(src, at);
    const problem = { sev, path, line: pos.line, col: pos.col, code, msg, hint: hint || HINTS[code] || "" };
    problems.push(problem);
    return problem;
  };
  const paths = Object.keys(files);
  const scans = [];
  let totalBytes = 0, csCount = 0;

  // manifest.json
  for (const problem of manifestProblems(files)) problems.push(problem);

  for (const path of paths) {
    const value = files[path];
    if (!isSource(path) || typeof value !== "string") continue;
    if (only && path !== only) continue; // os outros arquivos vêm do índice do projeto
    csCount++;
    scans.push(scanFile(path, value));
  }
  const entry = precompiledEntry(files);
  if (csCount === 0 && !only && !entry && !packTypeOf(files)) add("error", "manifest.json", null, null, "limite", "O mod não tem nenhum arquivo .cs.");
  if (csCount > 0 && !only && entry) add("warn", entry, null, null, "pacote", `O Bunny carrega ${entry} e ignora os arquivos .cs deste mod.`, "Para o Bunny usar o código daqui, apague a DLL da raiz do mod.");

  const projectTypes = new Map();
  const globals = new Set();
  for (const f of scans) {
    f.globals.forEach((g) => globals.add(g));
    for (const c of f.classes) if (!projectTypes.has(c.name)) projectTypes.set(c.name, c);
    // Tipos não-classe também contam para não acusar falso "falta using".
    f.sig.forEach((t, i) => { if (["struct", "enum", "interface", "record", "delegate"].includes(t.v) && f.sig[i + 1]?.t === "id") { const j = t.v === "delegate" ? null : i + 1; if (j) projectTypes.set(f.sig[j].v, projectTypes.get(f.sig[j].v) || { name: f.sig[j].v }); } });
  }

  if (only) {
    for (const c of projectIndex().values()) if (!projectTypes.has(c.name)) projectTypes.set(c.name, c);
    for (const t of projectExtras.types) if (!projectTypes.has(t)) projectTypes.set(t, { name: t });
    projectExtras.globals.forEach((g) => globals.add(g));
  }

  const seen = new Map();
  for (const f of scans) {
    const { src, sig } = f;
    for (const e of f.errors) add("error", f.path, e.at, src, "sintaxe", e.msg);
    // Equilíbrio de delimitadores.
    const stack = [], pair = { ")": "(", "]": "[", "}": "{" };
    for (const t of sig) {
      if (t.t !== "op") continue;
      if ("([{".includes(t.v)) stack.push(t);
      else if (")]}".includes(t.v)) {
        const top = stack.pop();
        if (!top || top.v !== pair[t.v]) { add("error", f.path, t.s, src, "sintaxe", `"${t.v}" sem par correspondente.`); stack.length = 0; break; }
      }
    }
    for (const t of stack.slice(-3)) add("error", f.path, t.s, src, "sintaxe", `"${t.v}" aberto e nunca fechado.`);

    // Using ausente (os mods não têm implicit usings).
    const hasUsing = (ns) => f.usings.has(ns) || globals.has(ns) || f.ns === ns || f.ns.startsWith(ns + ".");
    const reported = new Set();
    sig.forEach((t, i) => {
      if (t.t !== "id" || sig[i - 1]?.v === "." || reported.has(t.v) || projectTypes.has(t.v)) return;
      // Só onde não existe outra leitura: Item, dentro de um ModItem, é a propriedade e não o tipo.
      const prevV = sig[i - 1]?.v, nextT = sig[i + 1]?.v;
      const needsType = (prevV === ":" && sig[i - 3]?.v === "class") || prevV === "[" || (/ID$/.test(t.v) && nextT === ".") || (t.v === "ModContent" && nextT === ".");
      if (needsType && T[t.v]?.ns && !hasUsing(T[t.v].ns)) {
        reported.add(t.v);
        add("error", f.path, t.s, src, "CS0246", `"${t.v}" precisa de using ${T[t.v].ns};`).fix = { kind: "using", ns: T[t.v].ns };
      }
      for (const ns in NEEDS_USING) {
        if (!NEEDS_USING[ns].includes(t.v) || hasUsing(ns)) continue;
        const nextV = sig[i + 1]?.v;
        // "void Action(...)" é a declaração de um método com esse nome, e não o tipo.
        if (nextV === "(" && ["id", "kw"].includes(sig[i - 1]?.t) && !["new", "return", "await", "in", "case"].includes(sig[i - 1].v)) continue;
        if (nextV === "." || nextV === "<" || nextV === "(" || sig[i - 1]?.v === "new" || sig[i + 1]?.t === "id") {
          reported.add(t.v);
          add("error", f.path, t.s, src, "CS0103", `"${t.v}" precisa de using ${ns}; os mods não têm usings implícitos.`).fix = { kind: "using", ns };
        }
      }
    });
    for (const c of f.classes) {
      const enclosing = f.classes.find((o) => o !== c && o.open < c.open && c.close <= o.close);
      const key = (f.ns || "") + "." + (enclosing ? enclosing.name + "." : "") + c.name;
      if (seen.has(key) && !c.mods.has("partial") && !seen.get(key).mods.has("partial"))
        add("error", f.path, c.at.s, src, "CS0101", `"${c.name}" já foi declarada em ${seen.get(key).file.path}.`);
      else seen.set(key, c);

      const members = classMembers(f, c);
      // Regras só onde a base é um tipo do SDK.
      if (T[c.base]) {
        const inherited = membersOf(c.base);
        // Sem a DLL do Bunny o índice é parcial: quem decide é o Roslyn.
        if (sdkComplete) for (const o of members.overrides) {
          const options = inherited.filter((m) => m.n === o.name);
          if (!options.length) { add("error", f.path, o.tok.s, src, "CS0115", `${c.base} não tem "${o.name}" para sobrescrever.`); continue; }
          const methods = options.filter((m) => m.k === "m");
          if (o.count !== null && methods.length && !methods.some((m) => paramsCountOf(m.p) === o.count)) {
            const sigs = methods.map((m) => `${m.n}(${m.p})`).join(" ou ");
            add("error", f.path, o.tok.s, src, "CS0115", `Parâmetros de "${o.name}" não batem com ${c.base}: ${sigs}.`);
          }
        }
        if (sdkComplete && !c.mods.has("abstract") && !c.mods.has("partial")) {
          // Só o que nenhuma classe do meio já implementou.
          const done = new Set(), pending = [];
          for (const type of chain(c.base)) for (const m of type.members) { if (m.a && !done.has(m.n)) pending.push(m); else if (!m.a) done.add(m.n); }
          for (const m of pending) {
            if (!members.overrides.some((o) => o.name === m.n))
              add("error", f.path, c.at.s, src, "CS0534", `"${c.name}" precisa implementar ${m.t} ${m.n}(${m.p || ""}) de ${c.base}.`).fix = { kind: "abstract", cls: c.name, member: m };
          }
        }
        // A textura vem do namespace mais o nome da classe; sem ela o Bunny desenha um substituto.
        if (["ModItem", "ModProjectile", "ModNPC", "ModBuff", "ModTile", "ModWall"].includes(c.base) && !members.overrides.some((o) => o.name === "Texture") && f.ns) {
          const png = f.ns.split(".").slice(1).concat(c.name).join("/") + ".png";
          if (files[png] === undefined && files[f.ns.replace(/\./g, "/") + "/" + c.name + ".png"] === undefined)
            add("warn", f.path, c.at.s, src, "textura", `"${c.name}" espera a textura ${png}, que não está no mod.`, "O Bunny vai desenhar um substituto. Envie o PNG ou sobrescreva Texture.");
        }
      }
    }
  }
  return only ? problems.filter((p) => p.path === only && p.line) : problems;
}

