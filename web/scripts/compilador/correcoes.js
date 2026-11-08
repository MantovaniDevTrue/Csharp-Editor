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
  if (fix.kind === "jsentry") { files()[fix.path] = jsModClassSource(fix.id); afterStructureFix(); return; }
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
