// ---------- Editor de texturas: botões e painéis ----------
const PX_TOOLS = [
  ["pencil", "Lápis", "M11 1h2v1h1v1h1v2h-1v1h-1v1h-1v1h-1v1H9v1H8v1H7v1H6v1H1v-5h1v-1h1V9h1V8h1V7h1V6h1V5h1V4h1V3h1V2h1z"],
  ["eraser", "Borracha", "M9 2h3v1h1v1h1v1h1v3h-1v1h-1v1h-1v1h-1v1h-1v1H8v1H4v-1H3v-1H2v-1H1V8h1V7h1V6h1V5h1V4h1V3h3z"],
  ["fill", "Balde", "M7 1h2v1h1v1h1v1h1v1h1v1h1v2h-1v1h-1v1h-1v1H9v1H7v-1H6v-1H5v-1H4V9H3V7h1V6h1V5h1V2h1zM13 10h1v2h1v2h-3v-2h1z"],
  ["line", "Linha", "M12 2h2v2h-1v1h-1v1h-1v1h-1v1H9v1H8v1H7v1H6v1H5v1H4v1H2v-2h1v-1h1v-1h1V9h1V8h1V7h1V6h1V5h1V4h1V3h1z"],
  ["rect", "Retângulo", "M2 3h12v10H2zM4 5v6h8V5z"],
  ["ellipse", "Círculo", "M5 2h6v1h2v2h1v6h-1v2h-2v1H5v-1H3v-2H2V5h1V3h2zM6 4v1H5v1H4v4h1v1h1v1h4v-1h1v-1h1V6h-1V5h-1V4z"],
  ["select", "Seleção", "M2 2h3v2H4v1H2zM7 2h2v2H7zM11 2h3v3h-2V4h-1zM2 7h2v2H2zM12 7h2v2h-2zM2 11h2v1h1v2H2zM7 12h2v2H7zM12 11h2v3h-3v-2h1z"],
  ["picker", "Conta-gotas", "M11 1h3v1h1v3h-1v1h-1v1h-1V6h-1v1H9v1H8v1H7v1H6v1H5v1H4v1H3v1H1v-2h1v-1h1v-1h1v-1h1V9h1V8h1V7h1V6H7V5h1V4h1V3h1V2h1z"],
  ["hand", "Mão: mover a tela", "M6 1h2v5h1V2h2v5h1V4h2v7h-1v2h-1v2H6v-2H5v-1H4v-1H3V9H2V7h2v1h1v1h1z"],
];
const pxIcon = (d) => `<svg viewBox="0 0 16 16" aria-hidden="true" shape-rendering="crispEdges"><path fill="currentColor" fill-rule="evenodd" d="${d}"/></svg>`;
const pxCss = (c) => `rgba(${c[0]},${c[1]},${c[2]},${c[3] / 255})`;
const pxHex = (c) => "#" + c.slice(0, 3).map((v) => Number(v).toString(16).padStart(2, "0")).join("");
function pxSwatch(c, label, onPick) {
  const b = document.createElement("button");
  b.type = "button"; b.className = "swatch"; b.style.setProperty("--c", pxCss(c));
  b.setAttribute("aria-label", label || pxHex(c));
  b.addEventListener("click", () => onPick(c));
  return b;
}
function pxSetTool(tool) {
  if (px.tool !== tool) pxCommitFloat();
  if (tool !== "picker") px.last = tool; else if (px.tool !== "picker") px.last = px.tool;
  px.tool = tool;
  haptic("tap");
  renderPixelUi(); drawPixel();
}
function pxSetColor(c) {
  px.color = [...c];
  if (px.tool === "eraser" || px.tool === "picker" || px.tool === "hand" || px.tool === "select") { pxCommitFloat(); px.tool = px.last === "eraser" ? "pencil" : px.last; if (["hand", "select"].includes(px.tool)) px.tool = "pencil"; }
  renderPixelUi();
}
function renderPixelUi() {
  $("pxName").textContent = px.path.split("/").pop();
  document.querySelectorAll("#pxTools [data-tool]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.tool === px.tool)));
  $("pxUndo").disabled = !px.undo.length; $("pxRedo").disabled = !px.redo.length;
  $("pxFront").style.setProperty("--c", pxCss(px.color));
  $("pxBack").style.setProperty("--c", pxCss(px.back));
  // Só as opções que valem para a ferramenta atual.
  const t = px.tool, o = $("pxOptions");
  o.replaceChildren();
  const add = (label, pressed, action, aria) => {
    const b = document.createElement("button");
    b.type = "button"; b.className = "txbtn"; b.textContent = label;
    if (pressed !== null) b.setAttribute("aria-pressed", String(pressed));
    if (aria) b.setAttribute("aria-label", aria);
    b.addEventListener("click", action);
    o.append(b);
  };
  if (["pencil", "eraser", "line", "rect", "ellipse"].includes(t)) {
    add("−", null, () => { px.brush = Math.max(1, px.brush - 1); renderPixelUi(); }, "Pincel menor");
    const n = document.createElement("span"); n.className = "txvalue"; n.textContent = `${px.brush}px`; o.append(n);
    add("+", null, () => { px.brush = Math.min(16, px.brush + 1); renderPixelUi(); }, "Pincel maior");
  }
  if (t === "rect" || t === "ellipse") add("Preenchido", px.filled, () => { px.filled = !px.filled; renderPixelUi(); });
  if (["pencil", "eraser", "line", "rect", "ellipse"].includes(t)) {
    add("Espelho X", px.mirrorX, () => { px.mirrorX = !px.mirrorX; renderPixelUi(); drawPixel(); });
    add("Espelho Y", px.mirrorY, () => { px.mirrorY = !px.mirrorY; renderPixelUi(); drawPixel(); });
  }
  if (t === "select") {
    if (px.sel || px.float) {
      add("Copiar", null, () => pxCopy(false));
      add("Recortar", null, () => pxCopy(true));
      add("Apagar", null, pxDeleteSelection);
      add("Soltar", null, pxDeselect);
    } else {
      const n = document.createElement("span"); n.className = "txhint"; n.textContent = "Arraste para selecionar."; o.append(n);
    }
    if (px.clip) add("Colar", null, pxPaste);
  }
  if (t === "picker") { const n = document.createElement("span"); n.className = "txhint"; n.textContent = "Toque em uma cor da imagem."; o.append(n); }
  if (t === "hand") { const n = document.createElement("span"); n.className = "txhint"; n.textContent = "Arraste a tela. Dois dedos também movem e dão zoom."; o.append(n); }
  if (t === "fill") { const n = document.createElement("span"); n.className = "txhint"; n.textContent = "Pinta a área da mesma cor."; o.append(n); }
  // Quadros, quando existem.
  const strip = $("pxFrames");
  strip.hidden = px.count < 2;
  if (px.count > 1) {
    strip.replaceChildren();
    const play = document.createElement("button");
    play.type = "button"; play.className = "txbtn"; play.textContent = pxPlayTimer ? "Parar" : "Tocar";
    play.addEventListener("click", pxTogglePlay);
    strip.append(play);
    for (let i = 0; i < px.count; i++) {
      const b = document.createElement("button");
      b.type = "button"; b.className = "txframe"; b.textContent = i + 1; b.setAttribute("aria-pressed", String(i === px.frame)); b.setAttribute("aria-label", `Quadro ${i + 1}`);
      b.addEventListener("click", () => { pxCommitFloat(); px.frame = i; px.sel = null; pxInvalidate(); renderPixelUi(); });
      strip.append(b);
    }
    const onion = document.createElement("button");
    onion.type = "button"; onion.className = "txbtn"; onion.textContent = "Fantasma"; onion.setAttribute("aria-pressed", String(px.onion));
    onion.setAttribute("aria-label", "Mostrar o quadro anterior em transparência");
    onion.addEventListener("click", () => { px.onion = !px.onion; pxView.onion = null; renderPixelUi(); drawPixel(); });
    strip.append(onion);
  }
  renderPxPalette();
  renderPxPanel();
}
function renderPxPalette() {
  const seen = new Set();
  $("pxSwatches").replaceChildren(...[...px.recent, ...px.palette].filter((c) => { const k = c.join(); if (seen.has(k)) return false; seen.add(k); return true; }).map((c) => pxSwatch(c, null, pxSetColor)));
}
// ----- Painel de cor, em blocos de pixel.
const PX_STEPS = 24;
function rgbToHsv([r, g, b]) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d) h = max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: h * 60, s: max ? d / max : 0, v: max / 255 };
}
function hsvToRgb(h, s, v) {
  const f = (n) => { const k = (n + h / 60) % 6; return Math.round((v - v * s * Math.max(0, Math.min(k, 4 - k, 1))) * 255); };
  return [f(5), f(3), f(1)];
}
function pxPaintColorCanvases(hsv) {
  const sv = $("pxSV"), hue = $("pxHue");
  if (!sv) return;
  sv.width = sv.height = PX_STEPS; hue.width = PX_STEPS; hue.height = 1;
  const a = sv.getContext("2d"), b = hue.getContext("2d");
  for (let y = 0; y < PX_STEPS; y++) for (let x = 0; x < PX_STEPS; x++) { const c = hsvToRgb(hsv.h, x / (PX_STEPS - 1), 1 - y / (PX_STEPS - 1)); a.fillStyle = `rgb(${c})`; a.fillRect(x, y, 1, 1); }
  for (let x = 0; x < PX_STEPS; x++) { b.fillStyle = `rgb(${hsvToRgb(x / PX_STEPS * 360, 1, 1)})`; b.fillRect(x, 0, 1, 1); }
}
function pxColorPanel(box) {
  const hsv = rgbToHsv(px.color);
  box.innerHTML = `<h3>Cor</h3><div class="txpick"><canvas id="pxSV" aria-label="Saturação e brilho"></canvas><i class="txcursor" id="pxSVCursor" aria-hidden="true"></i><span class="txloupe" id="pxLoupe" aria-hidden="true" hidden></span></div><div class="txpick txpickhue"><canvas id="pxHue" aria-label="Matiz"></canvas><i class="txcursor" id="pxHueCursor" aria-hidden="true"></i></div>
    <div class="txrow"><label for="pxHex">Hex</label><input id="pxHex" maxlength="7" spellcheck="false" autocapitalize="off" value="${pxHex(px.color)}"><label for="pxAlpha">Opac.</label><input type="range" id="pxAlpha" min="0" max="255" value="${px.color[3]}"></div>
    <div class="txrow"><button class="txbtn" id="pxAddColor" type="button">Guardar na paleta</button><button class="txbtn" id="pxReplace" type="button">Trocar na camada</button></div>`;
  pxPaintColorCanvases(hsv);
  // O dedo cobre o ponto escolhido: a lupa mostra a cor acima dele, e os cursores marcam o lugar.
  const place = () => {
    const x = Math.max(0, Math.min(1, hsv.s)), y = Math.max(0, Math.min(1, 1 - hsv.v)), shown = `rgb(${hsvToRgb(hsv.h, hsv.s, hsv.v)})`;
    const sv = $("pxSVCursor"), hue = $("pxHueCursor"), loupe = $("pxLoupe");
    sv.style.left = `${(x * (PX_STEPS - 1) + .5) / PX_STEPS * 100}%`;
    sv.style.top = `${(y * (PX_STEPS - 1) + .5) / PX_STEPS * 100}%`;
    sv.style.setProperty("--c", shown);
    hue.style.left = `${Math.max(0, Math.min(1, ((hsv.h % 360) + 360) % 360 / 360)) * 100 + 50 / PX_STEPS}%`;
    hue.style.setProperty("--c", `rgb(${hsvToRgb(hsv.h, 1, 1)})`);
    loupe.style.setProperty("--c", shown);
    loupe.style.left = sv.style.left; loupe.style.top = sv.style.top;
    loupe.dataset.below = String(y < .3);
  };
  const drag = (el, apply, loupe) => {
    const run = (e) => { const r = el.getBoundingClientRect(); apply(Math.max(0, Math.min(.999, (e.clientX - r.left) / r.width)), Math.max(0, Math.min(.999, (e.clientY - r.top) / r.height))); place(); };
    const stop = () => { el.dataset.dragging = ""; if (loupe) $("pxLoupe").hidden = true; };
    el.addEventListener("pointerdown", (e) => { el.setPointerCapture(e.pointerId); el.dataset.dragging = "1"; if (loupe) $("pxLoupe").hidden = false; run(e); });
    el.addEventListener("pointermove", (e) => { if (el.dataset.dragging) run(e); });
    el.addEventListener("pointerup", stop);
    el.addEventListener("pointercancel", stop);
  };
  const commit = () => { px.color = [...hsvToRgb(hsv.h, hsv.s, hsv.v), px.color[3] || 255]; $("pxHex").value = pxHex(px.color); $("pxLoupe").textContent = pxHex(px.color); $("pxFront").style.setProperty("--c", pxCss(px.color)); };
  drag($("pxSV"), (x, y) => { hsv.s = Math.floor(x * PX_STEPS) / (PX_STEPS - 1); hsv.v = 1 - Math.floor(y * PX_STEPS) / (PX_STEPS - 1); commit(); }, true);
  drag($("pxHue"), (x) => { hsv.h = Math.floor(x * PX_STEPS) / PX_STEPS * 360; pxPaintColorCanvases(hsv); commit(); });
  $("pxHex").addEventListener("input", () => {
    const m = /^#?([0-9a-f]{6})$/i.exec($("pxHex").value.trim());
    if (!m) return;
    px.color = [parseInt(m[1].slice(0, 2), 16), parseInt(m[1].slice(2, 4), 16), parseInt(m[1].slice(4, 6), 16), px.color[3]];
    Object.assign(hsv, rgbToHsv(px.color)); pxPaintColorCanvases(hsv); place();
    $("pxFront").style.setProperty("--c", pxCss(px.color));
  });
  $("pxLoupe").textContent = pxHex(px.color);
  place();
  $("pxAlpha").addEventListener("input", () => { px.color[3] = Number($("pxAlpha").value); $("pxFront").style.setProperty("--c", pxCss(px.color)); });
  $("pxAddColor").addEventListener("click", () => { if (!px.palette.some((c) => c.join() === px.color.join())) px.palette.unshift([...px.color]); renderPxPalette(); });
  $("pxReplace").addEventListener("click", () => { pxPickReplacement(); });
}
// Trocar: usa a cor de trás como a que sai e a da frente como a que entra.
function pxPickReplacement() {
  pxReplaceColor(px.back, px.color);
  toast("Cor de trás trocada pela da frente nesta camada.");
}
// ----- Painel de camadas.
function pxLayersPanel(box) {
  box.innerHTML = `<h3>Camadas</h3><div id="pxLayerList"></div>
    <div class="txrow"><button class="txbtn" data-l="add" type="button">Nova</button><button class="txbtn" data-l="dup" type="button">Duplicar</button><button class="txbtn" data-l="up" type="button" aria-label="Subir">${icon("up")}</button><button class="txbtn" data-l="down" type="button" aria-label="Descer">${icon("down")}</button></div>
    <div class="txrow"><button class="txbtn" data-l="merge" type="button">Juntar abaixo</button><button class="txbtn" data-l="name" type="button">Renomear</button><button class="txbtn danger" data-l="del" type="button">Apagar</button></div>
    <div class="txrow"><label for="pxLayerOp">Opacidade</label><input type="range" id="pxLayerOp" min="0" max="255" value="${px.layers[px.active].opacity}"></div>`;
  const list = $("pxLayerList");
  for (let i = px.layers.length - 1; i >= 0; i--) {
    const l = px.layers[i], row = document.createElement("div");
    row.className = "txlayer"; row.setAttribute("aria-current", String(i === px.active));
    const eye = document.createElement("button");
    eye.type = "button"; eye.className = "txbtn"; eye.textContent = l.visible ? "Ver" : "Oculta"; eye.setAttribute("aria-pressed", String(l.visible));
    eye.addEventListener("click", () => { l.visible = !l.visible; px.dirty = true; pxInvalidate(); renderPixelUi(); });
    const pick = document.createElement("button");
    pick.type = "button"; pick.className = "txname"; pick.textContent = l.name;
    pick.addEventListener("click", () => { pxCommitFloat(); px.active = i; renderPixelUi(); });
    row.append(pick, eye);
    list.append(row);
  }
  box.querySelectorAll("[data-l]").forEach((b) => b.addEventListener("click", () => pxLayerAction(b.dataset.l)));
  let pushed = false;
  $("pxLayerOp").addEventListener("input", () => { if (!pushed) { pxPushDoc(); pushed = true; } px.layers[px.active].opacity = Number($("pxLayerOp").value); px.dirty = true; pxInvalidate(); });
}
async function pxLayerAction(kind) {
  pxCommitFloat();
  const a = px.active, layers = px.layers;
  if (kind === "name") {
    const r = await ask({ title: "Nome da camada", fields: [{ name: "name", label: "Nome", value: layers[a].name }], ok: "Salvar" });
    if (r?.name) { layers[a].name = r.name.slice(0, 32); renderPixelUi(); }
    return;
  }
  if (kind === "del" && layers.length < 2) { toast("A textura precisa de pelo menos uma camada."); return; }
  if (kind === "merge" && a === 0) { toast("Não há camada abaixo desta."); return; }
  if (kind === "up" && a === layers.length - 1) return;
  if (kind === "down" && a === 0) return;
  pxPushDoc();
  if (kind === "add") { layers.splice(a + 1, 0, { name: `Camada ${layers.length + 1}`, visible: true, opacity: 255, data: new Uint8ClampedArray(px.w * px.h * 4) }); px.active = a + 1; }
  if (kind === "dup") { layers.splice(a + 1, 0, { ...layers[a], name: layers[a].name + " cópia", data: new Uint8ClampedArray(layers[a].data) }); px.active = a + 1; }
  if (kind === "up") { [layers[a], layers[a + 1]] = [layers[a + 1], layers[a]]; px.active = a + 1; }
  if (kind === "down") { [layers[a], layers[a - 1]] = [layers[a - 1], layers[a]]; px.active = a - 1; }
  if (kind === "del") { layers.splice(a, 1); px.active = Math.max(0, a - 1); }
  if (kind === "merge") {
    const keep = px.layers;
    px.layers = [layers[a - 1], layers[a]];
    const merged = pxComposite(0, 0, px.w, px.h);
    px.layers = keep;
    layers[a - 1] = { ...layers[a - 1], opacity: 255, visible: true, data: merged };
    layers.splice(a, 1); px.active = a - 1;
  }
  px.dirty = true;
  pxInvalidate(); renderPixelUi();
}
// ----- Painel de quadros.
function pxFramesPanel(box) {
  box.innerHTML = `<h3>Quadros</h3><p class="txtext">Folhas do Terraria costumam ter os quadros um embaixo do outro.</p>
    <div class="txrow"><label for="pxFrameCount">Dividir em</label><input id="pxFrameCount" inputmode="numeric" value="${px.count}"><span class="txvalue">quadros</span></div>
    <div class="txrow"><button class="txbtn" id="pxDirV" type="button" aria-pressed="${px.dir === "v"}">Em coluna</button><button class="txbtn" id="pxDirH" type="button" aria-pressed="${px.dir === "h"}">Em linha</button></div>
    <div class="txrow"><button class="txbtn" id="pxSplit" type="button">Aplicar</button><button class="txbtn" id="pxAddFrame" type="button">+ Quadro vazio</button><button class="txbtn" id="pxDupFrame" type="button">Duplicar quadro</button></div>
    <div class="txrow"><label for="pxSpeed">Velocidade</label><input type="range" id="pxSpeed" min="1" max="30" value="${px.speed}"></div>`;
  let dir = px.dir;
  const showDir = () => { $("pxDirV").setAttribute("aria-pressed", String(dir === "v")); $("pxDirH").setAttribute("aria-pressed", String(dir === "h")); };
  $("pxDirV").addEventListener("click", () => { dir = "v"; showDir(); });
  $("pxDirH").addEventListener("click", () => { dir = "h"; showDir(); });
  $("pxSplit").addEventListener("click", () => {
    const n = Number($("pxFrameCount").value), side = dir === "v" ? px.h : px.w;
    if (!Number.isInteger(n) || n < 1 || n > 256 || side % n) { toast(`O lado de ${side} pixels precisa dividir certinho por esse número.`); return; }
    pxCommitFloat(); px.count = n; px.dir = dir; px.frame = 0; px.sel = null; px.dirty = true;
    pxLayout(); pxInvalidateAll(); fitPixel(); renderPixelUi();
  });
  $("pxAddFrame").addEventListener("click", () => pxAddFrame(false));
  $("pxDupFrame").addEventListener("click", () => pxAddFrame(true));
  $("pxSpeed").addEventListener("input", () => { px.speed = Number($("pxSpeed").value); if (pxPlayTimer) { pxTogglePlay(); pxTogglePlay(); } });
}
function pxAddFrame(copy) {
  const w = px.dir === "h" ? px.w + px.fw : px.w, h = px.dir === "v" ? px.h + px.fh : px.h;
  if (w > 4096 || h > 4096) { toast("A folha chegaria a mais de 4096 pixels."); return; }
  const from = pxOrigin(), oldW = px.w, oldH = px.h, dir = px.dir, fw = px.fw, fh = px.fh;
  pxResizeSheet(w, h, (l, next) => {
    for (let y = 0; y < oldH; y++) next.set(l.subarray(y * oldW * 4, (y + 1) * oldW * 4), y * w * 4);
    if (copy) for (let y = 0; y < fh; y++) {
      const tx = dir === "h" ? oldW : 0, ty = dir === "v" ? oldH : 0;
      next.set(l.subarray(((from.y + y) * oldW + from.x) * 4, ((from.y + y) * oldW + from.x + fw) * 4), ((ty + y) * w + tx) * 4);
    }
  });
  px.count += 1; px.frame = px.count - 1;
  pxLayout(); pxInvalidateAll(); renderPixelUi(); drawPixel();
}
function renderPxPanel() {
  const box = $("pxPanel"), name = px.panel;
  $("pxScrim").hidden = !name;
  box.hidden = !name;
  document.querySelectorAll("[data-panel]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.panel === name)));
  if (!name || box.dataset.showing === name) return;
  box.dataset.showing = name;
  if (name === "color") pxColorPanel(box);
  if (name === "layers") pxLayersPanel(box);
  if (name === "frames") pxFramesPanel(box);
}
function pxOpenPanel(name) {
  $("pxPanel").dataset.showing = "";
  px.panel = px.panel === name ? null : name;
  renderPixelUi();
}
function pxMoreMenu() {
  const area = px.sel ? "a seleção" : "o quadro";
  openSheet({ title: "Mais opções", subtitle: px.path.split("/").pop(), items: [
    { glyph: "↔", label: `Virar ${area} na horizontal`, action: () => pxTransform("flipH") },
    { glyph: "↕", label: `Virar ${area} na vertical`, action: () => pxTransform("flipV") },
    { glyph: "↻", label: `Girar ${area} 90°`, action: () => pxTransform("rotate") },
    { glyph: "▣", label: "Tamanho da folha", action: resizePixel },
    { glyph: "▦", label: px.grid ? "Esconder a grade" : "Mostrar a grade", action: () => { px.grid = !px.grid; drawPixel(); } },
    { glyph: "▫", label: px.preview ? "Esconder a prévia" : "Mostrar a prévia", action: () => { px.preview = !px.preview; drawPixel(); } },
    { glyph: "⛶", label: "Ajustar à tela", action: fitPixel },
  ] });
}
async function resizePixel() {
  const r = await ask({ title: "Tamanho da folha", text: "Aumentar deixa o novo espaço transparente. Diminuir corta a direita e a parte de baixo.", fields: [{ name: "w", label: "Largura", value: String(px.w) }, { name: "h", label: "Altura", value: String(px.h) }], ok: "Aplicar" });
  if (!r) return;
  const w = Number(r.w), h = Number(r.h);
  if (!Number.isInteger(w) || !Number.isInteger(h) || w < 1 || h < 1 || w > 4096 || h > 4096) { toast("Use de 1 a 4096 pixels."); return; }
  px.count = 1; px.frame = 0;
  pxResizeSheet(w, h);
  pxInvalidateAll(); renderPixelUi(); fitPixel();
}
function setupPixelEditor() {
  const c = $("pxCanvas");
  c.addEventListener("pointerdown", pxDown);
  c.addEventListener("pointermove", pxMove);
  c.addEventListener("pointerup", pxUp);
  c.addEventListener("pointercancel", pxUp);
  c.addEventListener("contextmenu", (e) => e.preventDefault());
  c.addEventListener("wheel", (e) => { e.preventDefault(); const r = c.getBoundingClientRect(); pxZoom(e.deltaY < 0 ? 1.25 : .8, e.clientX - r.left, e.clientY - r.top); }, { passive: false });
  $("pxTools").innerHTML = PX_TOOLS.map(([id, label, d]) => `<button class="txtool" type="button" data-tool="${id}" aria-label="${label}" title="${label}">${pxIcon(d)}</button>`).join("");
  document.querySelectorAll("#pxTools [data-tool]").forEach((b) => b.addEventListener("click", () => pxSetTool(b.dataset.tool)));
  $("pxUndo").addEventListener("click", () => pxStep(px.undo, px.redo));
  $("pxRedo").addEventListener("click", () => pxStep(px.redo, px.undo));
  $("pxSave").addEventListener("click", savePixel);
  $("pxClose").addEventListener("click", closePixel);
  $("pxFront").addEventListener("click", () => pxOpenPanel("color"));
  $("pxBack").addEventListener("click", () => { [px.color, px.back] = [px.back, px.color]; renderPixelUi(); });
  document.querySelectorAll("[data-panel]").forEach((b) => b.addEventListener("click", () => pxOpenPanel(b.dataset.panel)));
  $("pxScrim").addEventListener("click", () => { px.panel = null; renderPixelUi(); });
  $("pxMore").addEventListener("click", pxMoreMenu);
  $("pixel").addEventListener("cancel", (e) => { e.preventDefault(); closePixel(); });
  window.addEventListener("resize", () => { if ($("pixel").open) fitPixel(); });
}
