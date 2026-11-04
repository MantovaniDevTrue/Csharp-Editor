// ---------- Buscar e estrutura ----------
function findMatches() {
  const q = $("findInput").value;
  if (!q) return [];
  const hay = src.value.toLowerCase(), needle = q.toLowerCase(), out = [];
  for (let i = hay.indexOf(needle); i >= 0 && out.length < 5000; i = hay.indexOf(needle, i + needle.length)) out.push(i);
  return out;
}
function revealRange(start, end, refocus) {
  src.setSelectionRange(start, end);
  const line = src.value.slice(0, start).split("\n").length - 1;
  src.scrollTop = Math.max(0, line * lineH - src.clientHeight / 2);
  const col = start - (src.value.lastIndexOf("\n", start - 1) + 1);
  src.scrollLeft = Math.max(0, col * charW - src.clientWidth / 2);
  if (refocus) src.focus();
  syncScroll();
}
function stepFind(direction) {
  const matches = findMatches();
  if (!matches.length) { $("findCount").textContent = $("findInput").value ? "0" : ""; return; }
  const from = direction > 0 ? src.selectionEnd : src.selectionStart - 1;
  let i = direction > 0 ? matches.findIndex((m) => m >= from) : matches.length - 1 - [...matches].reverse().findIndex((m) => m <= from);
  if (i < 0 || i >= matches.length) i = direction > 0 ? 0 : matches.length - 1;
  revealRange(matches[i], matches[i] + $("findInput").value.length, false);
  $("findCount").textContent = `${i + 1}/${matches.length}`;
}
function toggleFind(open) {
  const bar = $("findBar");
  bar.hidden = open === undefined ? !bar.hidden : !open;
  if (!bar.hidden) {
    const selected = src.value.slice(src.selectionStart, src.selectionEnd);
    if (selected && !selected.includes("\n")) $("findInput").value = selected;
    $("findInput").focus(); $("findInput").select();
  } else src.focus();
}
function fileOutline(text) {
  const out = [];
  const lines = text.split("\n");
  lines.forEach((line, i) => {
    const cls = /\b(class|struct|enum|interface|record)\s+(\w+)(?:[^:{]*:\s*([\w.]+))?/.exec(line);
    if (cls && !/^\s*\/\//.test(line)) { out.push({ line: i + 1, label: `${cls[1]} ${cls[2]}${cls[3] ? " : " + cls[3] : ""}`, member: false }); return; }
    const method = /^\s*(?:public|private|protected|internal|static)[\w\s<>\[\],.?]*?\s+(\w+)\s*\(/.exec(line);
    if (method && !/\bnew\b/.test(line.split("(")[0])) out.push({ line: i + 1, label: line.trim().replace(/\s*\{?\s*$/, "").replace(/^public\s+|^private\s+|^protected\s+/, ""), member: true });
  });
  return out;
}
async function showOutline() {
  if (typeof files()[state.active] !== "string") return;
  const items = fileOutline(src.value);
  const dlg = $("dlg"), form = $("dlgForm");
  form.innerHTML = `<h2>Estrutura</h2><p>${esc(state.active.split("/").pop())}</p><div class="outline"></div><div class="acts"><button class="btn" value="cancel" type="submit">Fechar</button></div>`;
  const list = form.querySelector(".outline");
  if (!items.length) { const p = document.createElement("p"); p.textContent = "Nenhuma classe ou método neste arquivo."; list.append(p); }
  for (const item of items) {
    const b = document.createElement("button");
    b.type = "button"; b.textContent = item.label; b.className = item.member ? "member" : "";
    b.addEventListener("click", () => {
      dlg.close("cancel");
      const at = offsetOf(src.value, item.line, 1);
      revealRange(at, at, true);
    });
    list.append(b);
  }
  dlg.showModal();
}
function offsetOf(text, line, col) {
  let at = 0;
  for (let i = 1; i < line; i++) { const nl = text.indexOf("\n", at); if (nl < 0) return text.length; at = nl + 1; }
  return Math.min(text.length, at + Math.max(0, (col || 1) - 1));
}

