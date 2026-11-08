// ---------- Tela do conversor ----------
// Mostra cada arquivo em JavaScript e em C#, lado a lado (ou em abas no celular), com o que precisa de revisão.
const converter = { result: null, index: 0, side: "cs" };
function paintCode(text, js) {
  const { tokens } = js ? lexJs(text) : lex(text);
  const rows = [[]];
  tokens.forEach((t, i) => {
    const cls = js ? classifyJs(tokens, i) : classify(tokens, i);
    t.v.split("\n").forEach((piece, k) => {
      if (k > 0) rows.push([]);
      if (piece) rows[rows.length - 1].push(cls ? `<span class="${cls}">${esc(piece)}</span>` : esc(piece));
    });
  });
  return rows;
}
function renderCodePane(el, text, js, marked) {
  const rows = /\.(json|hjson)$/.test(el.dataset.path || "") ? text.split("\n").map((l) => [esc(l)]) : paintCode(text, js);
  el.innerHTML = rows.map((row, i) => `<span class="cvl${marked.has(i + 1) ? " mark" : ""}" data-line="${i + 1}"><i>${i + 1}</i>${row.join("") || " "}</span>`).join("");
}
function renderConverter() {
  const { result } = converter;
  const files = result.report;
  const item = files[converter.index] || files[0];
  const total = files.reduce((n, f) => n + f.notes.length, 0);
  $("cvInfo").textContent = `${files.length} ${files.length === 1 ? "arquivo convertido" : "arquivos convertidos"}${total ? ` · ${total} ${total === 1 ? "ponto para revisar" : "pontos para revisar"}` : ""}. O mod em JavaScript continua aqui, sem mudança.`;
  $("cvFiles").replaceChildren(...files.map((f, i) => {
    const b = document.createElement("button");
    b.type = "button"; b.setAttribute("aria-pressed", String(f === item));
    b.innerHTML = `${esc(f.from.replace(/^content\//, "").split("/").pop())}${f.notes.length ? `<b>${f.notes.length}</b>` : ""}`;
    b.addEventListener("click", () => { converter.index = i; renderConverter(); });
    return b;
  }));
  $("cvFiles").querySelector('[aria-pressed="true"]')?.scrollIntoView({ inline: "nearest", block: "nearest" });
  if (!item) { $("cvJs").textContent = ""; $("cvCs").textContent = ""; $("cvNotes").replaceChildren(); return; }
  $("cvFrom").textContent = item.from.replace(/^content\//, "");
  $("cvTo").textContent = item.to;
  $("cvJs").dataset.path = item.from; $("cvCs").dataset.path = item.to;
  renderCodePane($("cvJs"), item.js, true, new Set(item.notes.map((n) => n.jsLine)));
  renderCodePane($("cvCs"), item.cs, false, new Set(item.notes.map((n) => n.csLine)));
  $("cvPanes").dataset.side = converter.side;
  $("cvTabs").querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.side === converter.side)));
  const notes = $("cvNotes");
  notes.replaceChildren();
  if (!item.notes.length) { const p = document.createElement("p"); p.className = "cvok"; p.textContent = "Nada para revisar neste arquivo."; notes.append(p); return; }
  for (const n of item.notes) {
    const b = document.createElement("button");
    b.type = "button"; b.className = "cvnote";
    b.innerHTML = `<small>linha ${n.csLine} do C#</small>${esc(n.msg)}`;
    b.addEventListener("click", () => {
      const row = $("cvCs").querySelector(`[data-line="${n.csLine}"]`);
      converter.side = "cs"; $("cvPanes").dataset.side = "cs";
      $("cvTabs").querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.side === "cs")));
      row?.scrollIntoView({ block: "center" });
      row?.classList.remove("flash"); void row?.offsetWidth; row?.classList.add("flash");
    });
    notes.append(b);
  }
}
function openConverter() {
  if (!isJsProject()) { toast("Este mod já é em C#."); return; }
  closeDrawer?.();
  converter.result = convertJsMod(files());
  const report = converter.result.report;
  const withNotes = report.findIndex((f) => f.notes.length && f.from.endsWith(".js"));
  converter.index = withNotes >= 0 ? withNotes : Math.max(0, report.findIndex((f) => f.from === jsEntryPath(files())));
  converter.side = "cs";
  $("convert").showModal();
  renderConverter();
}
async function createConvertedMod() {
  const r = converter.result;
  if (!r) return;
  const m = { uid: r.uid, updated: Date.now(), files: r.files };
  state.mods[m.uid] = m;
  $("convert").close();
  await switchMod(m.uid);
  scheduleSave();
  renderModSelect?.();
  setView("files");
  const ok = await ask({ title: "Mod em C# criado", text: `"${r.name}" agora tem uma versão em C#, com um UID novo para os dois ficarem lado a lado aqui. Para o Bunny tratar como atualização do mod antigo, copie o uid do mod em JavaScript para o manifest.json deste. Compile para ver o que ainda falta.`, ok: "Compilar agora" });
  if (ok) runCompile();
}
$("cvClose").addEventListener("click", () => $("convert").close());
$("cvCreate").addEventListener("click", createConvertedMod);
$("cvTabs").addEventListener("click", (e) => {
  const side = e.target.closest("button")?.dataset.side;
  if (!side) return;
  converter.side = side;
  renderConverter();
});
