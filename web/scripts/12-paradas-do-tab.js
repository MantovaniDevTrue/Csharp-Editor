// ---------- Paradas do Tab ----------
let session = null;
function insertSnippet(snippet, start, end, vars = {}) {
  const fixed = Object.keys(vars).filter((k) => /^\d+$/.test(k)); // nomes já decididos não viram parada do Tab
  const lineStart = src.value.lastIndexOf("\n", start - 1) + 1;
  const indent = /^[ \t]*/.exec(src.value.slice(lineStart, start))[0];
  const body = indent ? snippet.body.replace(/\n/g, "\n" + indent) : snippet.body;
  const { text, stops } = expandSnippet(body, { NS: projectNamespace(), DIR: vars.DIR ?? "Content/Items", ...vars });
  const firstLine = src.value.slice(0, start).split("\n").length - 1;
  state.flash = { from: firstLine, to: firstLine + text.split("\n").length - 1, until: performance.now() + 650 };
  replaceRange(start, end, text);
  beginSession(start, stops.filter((x) => !fixed.includes(x.n)));
}
function beginSession(base, stops) {
  const ordered = stops.map((s) => ({ ...s, start: s.start + base, end: s.end + base }));
  const numbers = [...new Set(ordered.map((s) => s.n))].filter((n) => n !== "0").sort((a, b) => a - b);
  if (ordered.some((s) => s.n === "0")) numbers.push("0");
  session = numbers.length ? { stops: ordered, order: numbers, index: 0, length: src.value.length } : null;
  if (session) selectStop(); else src.focus();
}
function selectStop() {
  const primary = session.stops.find((s) => s.n === session.order[session.index] && s.primary) || session.stops.find((s) => s.n === session.order[session.index]);
  src.focus();
  src.setSelectionRange(primary.start, primary.end);
  session.current = primary;
  session.length = src.value.length;
}
function trackSession() {
  if (!session) return;
  const delta = src.value.length - session.length;
  session.length = src.value.length;
  if (!delta) return;
  const cur = session.current;
  const caret = src.selectionStart;
  if (caret < cur.start || caret > cur.end + delta) { session = null; return; }
  cur.end += delta;
  for (const s of session.stops) if (s !== cur && s.start >= cur.start) { s.start += delta; s.end += delta; }
}
// Ao sair da parada, repete o valor nas cópias de mesmo número.
function applyMirrors() {
  const cur = session.current;
  const value = src.value.slice(cur.start, cur.end);
  const mirrors = session.stops.filter((s) => s !== cur && s.n === cur.n).sort((a, b) => b.start - a.start);
  for (const m of mirrors) {
    const delta = value.length - (m.end - m.start);
    if (src.value.slice(m.start, m.end) === value) continue;
    src.setRangeText(value, m.start, m.end, "preserve");
    m.end = m.start + value.length;
    for (const s of session.stops) if (s !== m && s.start >= m.start) { s.start += delta; s.end += delta; }
  }
  session.length = src.value.length;
  onEdit();
}
function nextStop(direction = 1) {
  applyMirrors();
  session.index += direction;
  if (session.index >= session.order.length || session.index < 0) {
    const caret = session.current.end;
    session = null;
    src.setSelectionRange(caret, caret);
    return;
  }
  selectStop();
}

