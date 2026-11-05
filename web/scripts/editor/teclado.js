// ---------- Teclado ----------
function indentSelection(outdent) {
  const value = src.value;
  let s = src.selectionStart, e = src.selectionEnd;
  const lineStart = value.lastIndexOf("\n", s - 1) + 1;
  if (e > s && value[e - 1] === "\n") e--;
  const block = value.slice(lineStart, e);
  const next = block.split("\n").map((l) => outdent ? l.replace(new RegExp(`^( {1,${settings.indent}}|\\t)`), "") : indentUnit() + l).join("\n");
  replaceRange(lineStart, e, next);
  src.setSelectionRange(lineStart, lineStart + next.length);
}
function toggleComment() {
  const value = src.value;
  const s = src.selectionStart, e = src.selectionEnd;
  const lineStart = value.lastIndexOf("\n", s - 1) + 1;
  let lineEnd = value.indexOf("\n", e); if (lineEnd < 0) lineEnd = value.length;
  const block = value.slice(lineStart, lineEnd).split("\n");
  const all = block.every((l) => !l.trim() || /^\s*\/\//.test(l));
  const next = block.map((l) => !l.trim() ? l : all ? l.replace(/^(\s*)\/\/ ?/, "$1") : l.replace(/^(\s*)/, "$1// ")).join("\n");
  replaceRange(lineStart, lineEnd, next);
  src.setSelectionRange(lineStart, lineStart + next.length);
}
function smartEnter() {
  const value = src.value, at = src.selectionStart;
  const lineStart = value.lastIndexOf("\n", at - 1) + 1;
  const indent = /^[ \t]*/.exec(value.slice(lineStart, at))[0];
  const prev = value.slice(lineStart, at).trimEnd().slice(-1);
  const nextChar = value[src.selectionEnd];
  if (prev === "{") {
    if (nextChar === "}") {
      replaceRange(at, src.selectionEnd, `\n${indent}${indentUnit()}\n${indent}`);
      const caret = at + indent.length + settings.indent + 1;
      src.setSelectionRange(caret, caret);
    } else replaceRange(at, src.selectionEnd, `\n${indent}${indentUnit()}`);
    return;
  }
  replaceRange(at, src.selectionEnd, "\n" + indent);
}
function pressTab() {
  if (completion) { acceptCompletion(); return; }
  if (session) { nextStop(1); return; }
  const at = src.selectionStart;
  const word = /[a-z]+$/.exec(src.value.slice(Math.max(0, at - 24), at));
  const hit = word && src.selectionEnd === at && state.active?.endsWith(".cs") && ALL_SNIPPETS.find((s) => s.prefix === word[0]);
  if (hit) { smartInsert(hit, at - word[0].length, at); return; }
  if (src.selectionStart !== src.selectionEnd) { indentSelection(false); return; }
  replaceRange(at, at, indentUnit());
}
src.addEventListener("keydown", (e) => {
  const mod = e.ctrlKey || e.metaKey;
  if (mod && e.key === "Enter") { e.preventDefault(); runCompile(); return; }
  if (mod && (e.key === "s" || e.key === "S")) { e.preventDefault(); scheduleSave(); toast("Salvo neste aparelho."); return; }
  if (mod && e.key === " ") { e.preventDefault(); showCompletions(true); return; }
  if (mod && e.key === "/") { e.preventDefault(); toggleComment(); return; }
  if (mod && (e.key === "f" || e.key === "F")) { e.preventDefault(); toggleFind(true); return; }
  if (completion) {
    if (e.key === "ArrowDown") { e.preventDefault(); completion.index = (completion.index + 1) % completion.items.length; highlightCompletion(); return; }
    if (e.key === "ArrowUp") { e.preventDefault(); completion.index = (completion.index - 1 + completion.items.length) % completion.items.length; highlightCompletion(); return; }
    if (e.key === "Enter") { e.preventDefault(); acceptCompletion(); return; }
    if (e.key === "Escape") { e.preventDefault(); closePopup(); return; }
  }
  if (e.key === "Tab") { e.preventDefault(); if (e.shiftKey) { if (session) nextStop(-1); else indentSelection(true); } else pressTab(); return; }
  if (e.key === "Escape") { session = null; }
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); smartEnter(); return; }
  if (e.key === "}") {
    const at = src.selectionStart, lineStart = src.value.lastIndexOf("\n", at - 1) + 1, typed = src.value.slice(lineStart, at);
    if (typed.length >= settings.indent && /^\s+$/.test(typed) && at === src.selectionEnd) { e.preventDefault(); replaceRange(lineStart, at, typed.slice(settings.indent) + "}"); return; }
  }
});
const PAIRS = { "(": ")", "[": "]", "{": "}", '"': '"' };
function autoPair(e) {
  if (!settings.autoPairs || session || !state.active?.endsWith(".cs") || e.inputType !== "insertText" || !e.data || e.data.length !== 1) return;
  const at = src.selectionStart, next = src.value[at] || "", typed = e.data;
  // Digitar o fechamento que já está na frente só passa por cima dele.
  if (")]}\"".includes(typed) && next === typed) {
    src.setRangeText("", at, at + 1, "end");
    return;
  }
  if (PAIRS[typed] && (!next || /[\s)\]};,]/.test(next))) {
    if (typed === '"' && /[\p{L}\p{N}_"\\]/u.test(src.value[at - 2] || "")) return;
    src.setRangeText(PAIRS[typed], at, at, "preserve");
    src.setSelectionRange(at, at);
  }
}
src.addEventListener("input", (e) => {
  autoPair(e);
  trackSession();
  onEdit();
  if (e.inputType === "insertText" && e.data) typingFx(e.data);
  if (e.inputType && e.inputType.startsWith("delete") && !completion) return;
  if (!settings.suggest) { closePopup(); return; }
  const ch = src.value[src.selectionStart - 1] || "";
  if (/[\p{L}\p{N}_."(:=\s]/u.test(ch) && ch !== "\n") showCompletions(false);
  else closePopup();
});
src.addEventListener("scroll", syncScroll, { passive: true });
src.addEventListener("click", () => { closePopup(); updateCurLine(); });
src.addEventListener("keyup", updateCurLine);
document.addEventListener("selectionchange", () => { if (document.activeElement === src) { updateCurLine(); renderLive(); } });
src.addEventListener("blur", () => setTimeout(() => { if (document.activeElement !== src) closePopup(); }, 120));

// Teclas de atalho no celular: o foco fica no editor.
const KEYS = [["Tab", () => pressTab()], ["{", "{"], ["}", "}"], ["(", "("], [")", ")"], [";", ";"], ["=", "="], ['"', '"'], [".", "."], ["<", "<"], [">", ">"], ["[", "["], ["]", "]"], ["//", () => toggleComment()], ["↤", () => indentSelection(true)]];
for (const [label, action] of KEYS) {
  const b = document.createElement("button");
  b.type = "button"; b.textContent = label;
  if (label === "↤") b.setAttribute("aria-label", "Reduzir recuo");
  b.addEventListener("pointerdown", (e) => e.preventDefault());
  b.addEventListener("click", () => {
    if (typeof action === "function") { action(); return; }
    const s = src.selectionStart, end = src.selectionEnd;
    replaceRange(s, end, action);
    trackSession();
    if (action === ".") showCompletions(false);
  });
  $("keys").append(b);
}

