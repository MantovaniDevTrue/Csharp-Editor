// ---------- Buscar e substituir no mod inteiro ----------
const modSearch = { caseSensitive: false, word: false, regex: false, timer: 0, results: [], total: 0, undo: null, error: "" };
const SEARCH_MATCH_LIMIT = 5000, SEARCH_ROW_LIMIT = 400;
function searchRegex(query) {
  const source = modSearch.regex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(modSearch.word ? `\\b(?:${source})\\b` : source, modSearch.caseSensitive ? "gu" : "giu");
}
// Devolve os arquivos com os trechos encontrados, ou lança o erro de uma expressão inválida.
function searchFiles(all, query) {
  const results = [];
  let total = 0;
  if (!query) return { results, total };
  const re = searchRegex(query);
  for (const [path, text] of Object.entries(all)) {
    if (typeof text !== "string") continue;
    const matches = [];
    re.lastIndex = 0;
    let lineStart = 0, line = 1, scanned = 0;
    for (let m = re.exec(text); m; m = re.exec(text)) {
      if (!m[0].length) { re.lastIndex++; continue; }
      for (let nl = text.indexOf("\n", scanned); nl >= 0 && nl < m.index; nl = text.indexOf("\n", nl + 1)) { line++; lineStart = nl + 1; }
      scanned = lineStart;
      const end = text.indexOf("\n", m.index);
      matches.push({ at: m.index, length: m[0].length, line, col: m.index - lineStart + 1, text: text.slice(lineStart, end < 0 ? text.length : end) });
      if (++total >= SEARCH_MATCH_LIMIT) break;
    }
    if (matches.length) results.push({ path, matches });
    if (total >= SEARCH_MATCH_LIMIT) break;
  }
  return { results, total };
}
// A substituição de texto puro não interpreta $1; a de expressão regular, sim.
function replaceText(text, query, replacement) {
  const re = searchRegex(query);
  return modSearch.regex ? text.replace(re, replacement) : text.replace(re, () => replacement);
}
function openModSearch(initial = "") {
  closeDrawer();
  $("modSearch").showModal();
  if (initial) $("msFind").value = initial;
  $("msFind").focus(); $("msFind").select();
  runModSearch();
}
function runModSearch() {
  const query = $("msFind").value;
  modSearch.error = "";
  try { Object.assign(modSearch, searchFiles(files(), query)); }
  catch { modSearch.results = []; modSearch.total = 0; modSearch.error = "Essa expressão regular tem um erro de escrita."; }
  renderModSearch();
}
function renderModSearch() {
  const list = $("msResults"), query = $("msFind").value, { total, results } = modSearch;
  $("msInfo").textContent = modSearch.error || (!query ? "Digite para procurar em todos os arquivos de texto do mod."
    : !total ? "Nada encontrado."
    : total >= SEARCH_MATCH_LIMIT ? `Mais de ${SEARCH_MATCH_LIMIT} resultados: refine a busca para substituir.`
    : `${plural(total, "resultado", "resultados")} em ${plural(results.length, "arquivo", "arquivos")}.`);
  $("msInfo").classList.toggle("error", !!modSearch.error);
  document.querySelectorAll("#modSearch [data-option]").forEach((b) => b.setAttribute("aria-pressed", String(modSearch[b.dataset.option])));
  $("msReplaceAll").disabled = !total || total >= SEARCH_MATCH_LIMIT;
  $("msReplaceAll").textContent = total ? `Substituir ${total}` : "Substituir";
  $("msUndo").hidden = !modSearch.undo || modSearch.undo.uid !== state.uid;
  const frag = document.createDocumentFragment();
  let rows = 0;
  for (const file of results) {
    if (rows >= SEARCH_ROW_LIMIT) break;
    const head = document.createElement("div");
    head.className = "msfile";
    head.textContent = file.path;
    const count = document.createElement("small"); count.textContent = file.matches.length; head.append(count);
    frag.append(head);
    for (const match of file.matches) {
      if (rows++ >= SEARCH_ROW_LIMIT) break;
      const row = document.createElement("div"); row.className = "msrow";
      const go = document.createElement("button");
      go.type = "button"; go.className = "msgo";
      const start = Math.max(0, match.col - 1 - 24), before = match.text.slice(start, match.col - 1).trimStart();
      go.innerHTML = `<i>${match.line}</i><code>${esc(before)}<mark>${esc(match.text.slice(match.col - 1, match.col - 1 + match.length))}</mark>${esc(match.text.slice(match.col - 1 + match.length, match.col + 80))}</code>`;
      go.addEventListener("click", () => { $("modSearch").close(); openFile(file.path, { line: match.line, col: match.col }); setView("code"); });
      const one = document.createElement("button");
      one.type = "button"; one.className = "btn small"; one.textContent = "Trocar";
      one.addEventListener("click", () => replaceOne(file.path, match));
      row.append(go, one);
      frag.append(row);
    }
  }
  if (rows >= SEARCH_ROW_LIMIT && total > SEARCH_ROW_LIMIT) { const more = document.createElement("p"); more.className = "msmore"; more.textContent = `Mostrando os primeiros ${SEARCH_ROW_LIMIT}. Substituir vale para todos.`; frag.append(more); }
  list.replaceChildren(frag);
}
function afterModReplace(paths) {
  scheduleSave(); renderTree();
  if (paths.includes("manifest.json")) { renderModCard(); renderModSelect(); }
  if (paths.includes(state.active)) openFile(state.active);
}
function replaceOne(path, match) {
  const text = files()[path], query = $("msFind").value, replacement = $("msReplace").value;
  const piece = text.slice(match.at, match.at + match.length);
  modSearch.undo = { uid: state.uid, before: { [path]: text } };
  files()[path] = text.slice(0, match.at) + replaceText(piece, query, replacement) + text.slice(match.at + match.length);
  afterModReplace([path]);
  haptic("tap");
  runModSearch();
}
async function replaceAllInMod() {
  const query = $("msFind").value, replacement = $("msReplace").value;
  const { results, total } = modSearch;
  if (!total) return;
  const r = await ask({ title: "Substituir em todo o mod?", text: `${plural(total, "trecho", "trechos")} em ${plural(results.length, "arquivo", "arquivos")} ${replacement ? `vão virar "${replacement}"` : "serão apagados"}. Depois você ainda pode desfazer.`, ok: "Substituir" });
  if (!r) return;
  const before = {};
  for (const { path } of results) { before[path] = files()[path]; files()[path] = replaceText(before[path], query, replacement); }
  modSearch.undo = { uid: state.uid, before };
  afterModReplace(Object.keys(before));
  toast(`${plural(total, "trecho substituído", "trechos substituídos")}.`);
  haptic("confirm");
  runModSearch();
}
function undoModReplace() {
  const undo = modSearch.undo;
  if (!undo || undo.uid !== state.uid) return;
  Object.assign(files(), undo.before);
  modSearch.undo = null;
  afterModReplace(Object.keys(undo.before));
  toast("Substituição desfeita.");
  runModSearch();
}
function setupModSearch() {
  $("msFind").addEventListener("input", () => { clearTimeout(modSearch.timer); modSearch.timer = setTimeout(runModSearch, 180); });
  document.querySelectorAll("#modSearch [data-option]").forEach((b) => b.addEventListener("click", () => { modSearch[b.dataset.option] = !modSearch[b.dataset.option]; runModSearch(); }));
  $("msClose").addEventListener("click", () => $("modSearch").close());
  $("msReplaceAll").addEventListener("click", replaceAllInMod);
  $("msUndo").addEventListener("click", undoModReplace);
  $("modSearchBtn").addEventListener("click", () => openModSearch());
  $("findInMod").addEventListener("click", () => { const q = $("findInput").value; toggleFind(false); openModSearch(q); });
}
