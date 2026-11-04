// ---------- Editor ----------
const src = $("src"), hl = $("hl"), linesEl = $("lines");
let charW = 8.1, lineH = 21;
function measure() {
  const probe = document.createElement("span");
  probe.style.cssText = `position:absolute;visibility:hidden;white-space:pre;font:${getComputedStyle(src).font}`;
  probe.textContent = "M".repeat(100);
  document.body.append(probe);
  charW = probe.getBoundingClientRect().width / 100 || 8.1;
  probe.remove();
  lineH = parseFloat(getComputedStyle(src).lineHeight) || 21;
}
function classify(tokens, i) {
  const t = tokens[i];
  if (t.t === "com") return "com";
  if (t.t === "str") return "str";
  if (t.t === "num") return "num";
  if (t.t === "pp") return "pp";
  if (t.t !== "id") return "";
  if (KEYWORDS.has(t.v) || PRIMITIVES.has(t.v)) return "kw";
  if (T[t.v]) return "sdk";
  let n = i + 1;
  while (tokens[n]?.t === "ws") n++;
  if (tokens[n]?.v === "(") return "fn";
  return /^[A-Z]/.test(t.v) ? "ty" : "";
}
function render() {
  const text = src.value;
  const path = state.active;
  const isCs = path && path.endsWith(".cs");
  const byLine = new Map();
  for (const p of [...state.problems, ...state.live]) {
    if (p.path !== path || !p.line) continue;
    const list = byLine.get(p.line) || [];
    list.push(p); byLine.set(p.line, list);
  }
  const rows = [[]];
  if (isCs) {
    const { tokens } = lex(text);
    tokens.forEach((t, i) => {
      const cls = classify(tokens, i);
      const pieces = t.v.split("\n");
      pieces.forEach((piece, k) => {
        if (k > 0) rows.push([]);
        if (piece) rows[rows.length - 1].push(cls ? `<span class="${cls}">${esc(piece)}</span>` : esc(piece));
      });
    });
  } else {
    text.split("\n").forEach((line, k) => { if (k > 0) rows.push([]); rows[rows.length - 1].push(esc(line)); });
  }
  const flash = state.flash && performance.now() < state.flash.until ? state.flash : null;
  let html = "", gutter = "";
  rows.forEach((row, i) => {
    const list = byLine.get(i + 1);
    const hasErr = list?.some((p) => p.sev === "error");
    const cls = (list ? (hasErr ? "l err" : "l warnl") : "l") + (flash && i >= flash.from && i <= flash.to ? " flash" : "");
    const msg = list ? `<span class="msg">${esc(list[0].title || list[0].msg)}</span>` : "";
    html += `<span class="${cls}">${row.join("") || " "}${msg}</span>`;
    gutter += (list ? (hasErr ? `<b>${i + 1}</b>` : `<u>${i + 1}</u>`) : i + 1) + "\n";
  });
  hl.innerHTML = html;
  linesEl.innerHTML = gutter;
  if (settings.wrap) {
    // Linha quebrada ocupa mais de uma altura: cada número acompanha a sua.
    const labels = gutter.split("\n");
    linesEl.innerHTML = labels.slice(0, rows.length).map((label, i) => `<span class="gl" style="height:${hl.children[i]?.offsetHeight || lineH}px">${label}</span>`).join("");
  }
  syncScroll();
}
// Posição do cursor dentro do editor, com ou sem quebra de linha.
function caretPoint() {
  const at = src.selectionStart;
  const before = src.value.slice(0, at);
  const line = before.split("\n").length - 1;
  const col = at - (before.lastIndexOf("\n") + 1);
  const gutterW = settings.lineNumbers ? document.querySelector(".gutter").offsetWidth : 0;
  if (settings.wrap) {
    const cols = Math.max(1, Math.floor((src.clientWidth - 20) / charW));
    const top = (hl.children[line]?.offsetTop ?? 8 + line * lineH) + Math.floor(col / cols) * lineH;
    return { line, col, x: gutterW + 10 + (col % cols) * charW, y: top - src.scrollTop, top };
  }
  return { line, col, x: gutterW + 10 + col * charW - src.scrollLeft, y: 8 + line * lineH - src.scrollTop, top: 8 + line * lineH };
}
function updateCurLine() {
  if (!settings.currentLine || !state.active || typeof files()[state.active] !== "string") return;
  const row = hl.children[caretPoint().line];
  const bar = $("curLine");
  bar.style.height = (row?.offsetHeight || lineH) + "px";
  bar.style.transform = `translateY(${(row?.offsetTop ?? 8) - src.scrollTop}px)`;
}
function typingFx(text) {
  if (settings.typeFx === "off" || !settings.anims || !text.trim()) return;
  const ed = $("ed");
  if (ed.querySelectorAll(".fx, .spark").length > 22) return;
  const p = caretPoint();
  const x = p.x - charW, y = p.y;
  if (x < 0 || y < -lineH || y > ed.clientHeight) return;
  const remove = (el) => el.addEventListener("animationend", () => el.remove());
  const ch = document.createElement("span");
  ch.className = "fx"; ch.textContent = text.slice(-1); ch.style.left = x + "px"; ch.style.top = y + "px";
  remove(ch); ed.append(ch);
  if (settings.typeFx === "sparks") for (let i = 0; i < 4; i++) {
    const s = document.createElement("i");
    s.className = "spark"; s.style.left = x + charW / 2 + "px"; s.style.top = y + lineH / 2 + "px";
    s.style.setProperty("--dx", (Math.random() * 28 - 14 | 0) + "px"); s.style.setProperty("--dy", (Math.random() * -22 | 0) + "px");
    s.style.background = ["#f4c04a", "#7fd8e0", "#62cf52"][i % 3];
    remove(s); ed.append(s);
  }
}
function burstConfetti() {
  if (!settings.anims) return;
  const box = $("compile").getBoundingClientRect();
  for (let i = 0; i < 18; i++) {
    const c = document.createElement("i");
    c.className = "confetti";
    c.style.left = box.left + box.width / 2 + "px"; c.style.top = box.top + box.height / 2 + "px";
    c.style.background = ["#f4c04a", "#7fd8e0", "#62cf52", "#ff9fc4"][i % 4];
    c.style.setProperty("--dx", (Math.random() * 190 - 95 | 0) + "px"); c.style.setProperty("--dy", (-40 - Math.random() * 140 | 0) + "px");
    c.addEventListener("animationend", () => c.remove());
    document.body.append(c);
  }
}
function fabEffect(name) {
  const fab = $("compile");
  fab.classList.remove("okpulse", "failshake");
  void fab.offsetWidth;
  fab.classList.add(name);
  setTimeout(() => fab.classList.remove(name), 700);
}
function countUp(root) {
  if (!settings.anims) return;
  root.querySelectorAll(".tile b").forEach((el) => {
    const end = +el.textContent, started = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - started) / 480);
      el.textContent = Math.round(end * (1 - (1 - t) ** 3));
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}
function syncScroll() {
  hl.style.transform = `translate(${-src.scrollLeft}px, ${-src.scrollTop}px)`;
  linesEl.style.transform = `translateY(${-src.scrollTop}px)`;
  updateCurLine();
  if (!$("pop").hidden) placePopup();
}
let renderQueued = false;
function queueRender() { if (renderQueued) return; renderQueued = true; requestAnimationFrame(() => { renderQueued = false; render(); }); }

function replaceRange(start, end, text) {
  src.focus();
  src.setSelectionRange(start, end);
  let done = false;
  try { done = text ? document.execCommand("insertText", false, text) : document.execCommand("delete"); } catch { done = false; }
  if (!done || src.value.slice(start, start + text.length) !== text) {
    if (src.value.slice(start, start + text.length) !== text) src.setRangeText(text, start, end, "end");
  }
  onEdit();
}
let liveTimer = 0;
function onEdit() {
  if (state.active && typeof files()[state.active] === "string") {
    files()[state.active] = src.value;
    scheduleSave();
    // As linhas mudaram: os avisos deste arquivo agora vêm da checagem ao vivo.
    state.problems = state.problems.filter((p) => p.path !== state.active);
    state.live = [];
    if (state.active === "manifest.json") renderModCard();
    clearTimeout(liveTimer);
    if (settings.live) liveTimer = setTimeout(liveCheck, 1000);
  }
  queueRender();
}
function liveCheck() {
  const path = state.active;
  if (path === "manifest.json") { state.live = manifestProblems(files()).filter((p) => p.line); queueRender(); return; }
  if (!path || !isSource(path) || typeof files()[path] !== "string") return;
  // Enquanto se escolhe uma sugestão ou se preenche um modelo, o código ainda está pela metade.
  if (completion || session) { liveTimer = setTimeout(liveCheck, 1000); return; }
  state.live = quickCheck(files(), path);
  queueRender();
}

function openFile(path, position) {
  closePopup(); session = null;
  clearTimeout(liveTimer); state.live = [];
  state.active = path;
  const value = files()[path];
  const isImage = typeof value !== "string";
  $("codeWrap").hidden = isImage;
  document.querySelector(".gutter").hidden = isImage;
  $("imgview").hidden = !isImage;
  $("activePath").textContent = "‎" + (path || "");
  state.open = [path, ...state.open.filter((p) => p !== path && files()[p] !== undefined)].slice(0, 6);
  renderOpenTabs();
  if (isImage) {
    const img = $("imgview");
    img.replaceChildren();
    if (/\.png$/i.test(path)) {
      const el = document.createElement("img");
      el.alt = path; el.src = URL.createObjectURL(new Blob([value], { type: "image/png" }));
      img.append(el);
    }
    const caption = document.createElement("p");
    caption.textContent = `${path.split("/").pop()} · ${value.length} bytes`;
    img.append(caption);
  } else {
    src.value = value;
    src.scrollTop = src.scrollLeft = 0;
    render();
    if (position) {
      const offset = offsetOf(value, position.line, position.col);
      src.focus(); src.setSelectionRange(offset, offset);
      src.scrollTop = Math.max(0, (position.line - 4) * lineH);
      syncScroll();
    }
  }
  renderTree();
}
function renderOpenTabs() {
  const box = $("openTabs");
  const order = state.openOrder = (state.openOrder || []).filter((p) => state.open.includes(p));
  for (const p of state.open) if (!order.includes(p)) order.push(p);
  box.replaceChildren(...order.map((path) => {
    const tab = document.createElement("div");
    tab.className = "opentab" + (path === state.active ? " on" : "");
    const go = document.createElement("button");
    go.type = "button"; go.textContent = path.split("/").pop(); go.title = path; go.setAttribute("role", "tab");
    go.addEventListener("click", () => { if (path !== state.active) openFile(path); });
    tab.append(go);
    if (order.length > 1) {
      const x = document.createElement("button");
      x.type = "button"; x.className = "x"; x.innerHTML = icon("close"); x.setAttribute("aria-label", "Fechar " + go.textContent);
      x.addEventListener("click", () => {
        state.open = state.open.filter((p) => p !== path);
        if (path === state.active) openFile(state.open[0]); else renderOpenTabs();
      });
      tab.append(x);
    }
    return tab;
  }));
  box.querySelector(".on")?.scrollIntoView({ inline: "nearest", block: "nearest" });
}
