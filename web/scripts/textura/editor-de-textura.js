// ---------- Editor de texturas ----------
const PX_COLORS = ["#000000", "#ffffff", "#7f7f7f", "#c0392b", "#e67e22", "#f5c24c", "#27ae60", "#2980b9", "#8e44ad", "#6d4c2f", "#f8c9a0", "#00000000"];
const px = { path: "", w: 0, h: 0, data: null, zoom: 8, ox: 0, oy: 0, tool: "pencil", color: [0, 0, 0, 255], undo: [], redo: [], grid: true, dirty: false, recent: [], view: null, pointers: new Map(), stroke: null, pinch: null };
function pxBytes() { return px.w * px.h * 4; }
async function decodePng(bytes) {
  const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/png" }), { premultiplyAlpha: "none", colorSpaceConversion: "none" });
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width; canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0);
  return ctx.getImageData(0, 0, bitmap.width, bitmap.height);
}
function encodePng(width, height, data) {
  const canvas = document.createElement("canvas");
  canvas.width = width; canvas.height = height;
  canvas.getContext("2d").putImageData(new ImageData(new Uint8ClampedArray(data), width, height), 0, 0);
  return new Promise((resolve, reject) => canvas.toBlob(async (blob) => (blob ? resolve(new Uint8Array(await blob.arrayBuffer())) : reject(new Error("PNG"))), "image/png"));
}
async function openTexture(path) {
  let image;
  try { image = await decodePng(files()[path]); }
  catch { toast("Não foi possível abrir essa imagem como PNG."); return; }
  Object.assign(px, { path, w: image.width, h: image.height, data: new Uint8ClampedArray(image.data), undo: [], redo: [], dirty: false, tool: "pencil", stroke: null, pinch: null });
  px.pointers.clear();
  px.recent = topColors();
  renderPixelUi();
  $("pixel").showModal();
  fitPixel();
  // A tela entra com animação: mede de novo quando ela termina.
  setTimeout(() => { if ($("pixel").open && !px.dirty) fitPixel(); }, 260);
}
function topColors() {
  const counts = new Map(), d = px.data;
  const step = Math.max(1, Math.floor(d.length / 4 / 40000));
  for (let i = 0; i < d.length; i += 4 * step) {
    if (!d[i + 3]) continue;
    const key = (d[i] << 24 | d[i + 1] << 16 | d[i + 2] << 8 | d[i + 3]) >>> 0;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k]) => [k >>> 24, k >>> 16 & 255, k >>> 8 & 255, k & 255]);
}
function fitPixel() {
  const c = $("pxCanvas"), box = c.parentElement.getBoundingClientRect();
  c.width = Math.max(1, Math.round(box.width)); c.height = Math.max(1, Math.round(box.height));
  px.zoom = Math.max(1 / 4, Math.min(64, Math.min((c.width - 16) / px.w, (c.height - 16) / px.h)));
  if (px.zoom > 1) px.zoom = Math.floor(px.zoom);
  px.ox = Math.round((c.width - px.w * px.zoom) / 2); px.oy = Math.round((c.height - px.h * px.zoom) / 2);
  drawPixel();
}
function drawPixel() {
  const c = $("pxCanvas"), ctx = c.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, c.width, c.height);
  const sw = px.w * px.zoom, sh = px.h * px.zoom;
  // Fundo xadrez: mostra o que é transparente.
  ctx.save(); ctx.beginPath(); ctx.rect(px.ox, px.oy, sw, sh); ctx.clip();
  const cell = 8;
  for (let y = Math.max(0, px.oy); y < Math.min(c.height, px.oy + sh); y += cell)
    for (let x = Math.max(0, px.ox); x < Math.min(c.width, px.ox + sw); x += cell) {
      ctx.fillStyle = ((Math.floor((x - px.ox) / cell) + Math.floor((y - px.oy) / cell)) & 1) ? "#5a6b7f" : "#8c9bad";
      ctx.fillRect(x, y, cell, cell);
    }
  ctx.restore();
  if (!px.view || px.view.width !== px.w || px.view.height !== px.h) { px.view = document.createElement("canvas"); px.view.width = px.w; px.view.height = px.h; }
  px.view.getContext("2d").putImageData(new ImageData(px.data, px.w, px.h), 0, 0);
  ctx.drawImage(px.view, px.ox, px.oy, sw, sh);
  if (px.grid && px.zoom >= 8) {
    ctx.strokeStyle = "#ffffff22"; ctx.lineWidth = 1; ctx.beginPath();
    for (let x = 0; x <= px.w; x++) { const v = px.ox + x * px.zoom + .5; ctx.moveTo(v, px.oy); ctx.lineTo(v, px.oy + sh); }
    for (let y = 0; y <= px.h; y++) { const v = px.oy + y * px.zoom + .5; ctx.moveTo(px.ox, v); ctx.lineTo(px.ox + sw, v); }
    ctx.stroke();
  }
  ctx.strokeStyle = "#f5c24c"; ctx.lineWidth = 1; ctx.strokeRect(px.ox - .5, px.oy - .5, sw + 1, sh + 1);
  $("pxInfo").textContent = `${px.w}×${px.h} · ${px.zoom >= 1 ? px.zoom : px.zoom.toFixed(2)}x${px.dirty ? " · não salvo" : ""}`;
}
const pxHex = (c) => "#" + c.slice(0, 3).map((v) => v.toString(16).padStart(2, "0")).join("");
function renderPixelUi() {
  document.querySelectorAll("#pxTools [data-tool]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.tool === px.tool)));
  $("pxName").textContent = px.path.split("/").pop();
  $("pxColor").value = pxHex(px.color);
  $("pxAlpha").value = px.color[3];
  $("pxUndo").disabled = !px.undo.length; $("pxRedo").disabled = !px.redo.length;
  const swatches = [...px.recent.map((c) => c), ...PX_COLORS.map(parsePxColor)];
  const seen = new Set();
  $("pxSwatches").replaceChildren(...swatches.filter((c) => { const k = c.join(); if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 24).map((c) => {
    const b = document.createElement("button");
    b.type = "button"; b.className = "swatch"; b.style.setProperty("--c", `rgba(${c[0]},${c[1]},${c[2]},${c[3] / 255})`);
    b.setAttribute("aria-label", c[3] ? pxHex(c) : "Transparente");
    b.addEventListener("click", () => { px.color = [...c]; if (px.tool === "eraser" || px.tool === "picker") px.tool = "pencil"; renderPixelUi(); });
    return b;
  }));
}
function parsePxColor(hex) {
  const n = hex.slice(1);
  return [parseInt(n.slice(0, 2), 16), parseInt(n.slice(2, 4), 16), parseInt(n.slice(4, 6), 16), n.length > 6 ? parseInt(n.slice(6, 8), 16) : 255];
}
function pxPushUndo() {
  px.undo.push(new Uint8ClampedArray(px.data));
  // Até 64 MB de histórico, com pelo menos dois passos: uma folha de fonte é grande.
  while (px.undo.length > 2 && px.undo.length * pxBytes() > 64 * 1024 * 1024) px.undo.shift();
  px.redo = [];
}
function pxSet(x, y, c) {
  if (x < 0 || y < 0 || x >= px.w || y >= px.h) return;
  const i = (y * px.w + x) * 4;
  px.data[i] = c[0]; px.data[i + 1] = c[1]; px.data[i + 2] = c[2]; px.data[i + 3] = c[3];
}
function pxLine(a, b, c) {
  let { x, y } = a;
  const dx = Math.abs(b.x - x), dy = -Math.abs(b.y - y), sx = x < b.x ? 1 : -1, sy = y < b.y ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    pxSet(x, y, c);
    if (x === b.x && y === b.y) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x += sx; }
    if (e2 <= dx) { err += dx; y += sy; }
  }
}
function pxFill(x, y, c) {
  if (x < 0 || y < 0 || x >= px.w || y >= px.h) return;
  const d = px.data, w = px.w, h = px.h, start = (y * w + x) * 4;
  const from = [d[start], d[start + 1], d[start + 2], d[start + 3]];
  if (from.every((v, i) => v === c[i])) return;
  const same = (p) => d[p] === from[0] && d[p + 1] === from[1] && d[p + 2] === from[2] && d[p + 3] === from[3];
  const stack = [y * w + x];
  while (stack.length) {
    const at = stack.pop(), p = at * 4;
    if (!same(p)) continue;
    d[p] = c[0]; d[p + 1] = c[1]; d[p + 2] = c[2]; d[p + 3] = c[3];
    const cx = at % w;
    if (cx > 0) stack.push(at - 1);
    if (cx < w - 1) stack.push(at + 1);
    if (at >= w) stack.push(at - w);
    if (at < w * (h - 1)) stack.push(at + w);
  }
}
function pxPoint(e) {
  const r = $("pxCanvas").getBoundingClientRect();
  return { x: Math.floor((e.clientX - r.left - px.ox) / px.zoom), y: Math.floor((e.clientY - r.top - px.oy) / px.zoom) };
}
function pxZoom(factor, cx, cy) {
  const next = Math.max(1 / 4, Math.min(64, px.zoom * factor));
  px.ox = cx - (cx - px.ox) * (next / px.zoom); px.oy = cy - (cy - px.oy) * (next / px.zoom);
  px.zoom = next;
  drawPixel();
}
function pxDown(e) {
  e.preventDefault();
  $("pxCanvas").setPointerCapture(e.pointerId);
  px.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (px.pointers.size === 2) {
    // Dois dedos: cancela o traço que tinha começado, e vira zoom.
    if (px.stroke?.changed) { px.data = px.undo.pop(); drawPixel(); }
    px.stroke = null;
    const [a, b] = [...px.pointers.values()];
    px.pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    return;
  }
  const p = pxPoint(e);
  if (px.tool === "move") { px.stroke = { pan: { x: e.clientX, y: e.clientY } }; return; }
  if (px.tool === "picker") {
    if (p.x >= 0 && p.y >= 0 && p.x < px.w && p.y < px.h) { const i = (p.y * px.w + p.x) * 4; px.color = [...px.data.slice(i, i + 4)]; px.tool = "pencil"; renderPixelUi(); haptic("tap"); }
    return;
  }
  pxPushUndo();
  const c = px.tool === "eraser" ? [0, 0, 0, 0] : px.color;
  if (px.tool === "fill") { pxFill(p.x, p.y, c); px.dirty = true; px.stroke = null; renderPixelUi(); drawPixel(); return; }
  pxSet(p.x, p.y, c);
  px.dirty = true;
  px.stroke = { last: p, changed: true, color: c };
  renderPixelUi(); drawPixel();
}
function pxMove(e) {
  if (!px.pointers.has(e.pointerId)) return;
  e.preventDefault();
  px.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (px.pinch && px.pointers.size >= 2) {
    const [a, b] = [...px.pointers.values()];
    const r = $("pxCanvas").getBoundingClientRect();
    const dist = Math.hypot(a.x - b.x, a.y - b.y), x = (a.x + b.x) / 2, y = (a.y + b.y) / 2;
    px.ox += x - px.pinch.x; px.oy += y - px.pinch.y;
    pxZoom(dist / (px.pinch.dist || 1), x - r.left, y - r.top);
    px.pinch = { dist, x, y };
    return;
  }
  if (px.stroke?.pan) {
    px.ox += e.clientX - px.stroke.pan.x; px.oy += e.clientY - px.stroke.pan.y;
    px.stroke.pan = { x: e.clientX, y: e.clientY };
    drawPixel();
    return;
  }
  if (!px.stroke?.last) return;
  const p = pxPoint(e);
  if (p.x === px.stroke.last.x && p.y === px.stroke.last.y) return;
  pxLine(px.stroke.last, p, px.stroke.color);
  px.stroke.last = p;
  drawPixel();
}
function pxUp(e) {
  px.pointers.delete(e.pointerId);
  if (px.pointers.size < 2) px.pinch = null;
  if (!px.pointers.size) px.stroke = null;
}
function pxStep(from, to) {
  if (!from.length) return;
  to.push(new Uint8ClampedArray(px.data));
  px.data = from.pop();
  px.dirty = true;
  renderPixelUi(); drawPixel();
}
async function savePixel() {
  files()[px.path] = await encodePng(px.w, px.h, px.data);
  px.dirty = false;
  scheduleSave(); renderTree();
  if (state.active === px.path) openFile(px.path);
  drawPixel();
  toast("Textura salva.");
  haptic("confirm");
}
async function closePixel() {
  if (px.dirty) {
    const r = await ask({ title: "Salvar a textura?", text: "As mudanças ainda não foram salvas.", ok: "Salvar", extra: "Descartar" });
    if (r?.extra === true) { px.dirty = false; }
    else if (!r) return;
    else await savePixel();
  }
  $("pixel").close();
}
async function resizePixel() {
  const r = await ask({ title: "Tamanho da textura", text: "Aumentar deixa o novo espaço transparente. Diminuir corta a direita e a parte de baixo.", fields: [{ name: "w", label: "Largura", value: String(px.w) }, { name: "h", label: "Altura", value: String(px.h) }], ok: "Aplicar" });
  if (!r) return;
  const w = Number(r.w), h = Number(r.h);
  if (!Number.isInteger(w) || !Number.isInteger(h) || w < 1 || h < 1 || w > 4096 || h > 4096) { toast("Use de 1 a 4096 pixels."); return; }
  pxPushUndo();
  const next = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < Math.min(h, px.h); y++) next.set(px.data.subarray(y * px.w * 4, (y * px.w + Math.min(w, px.w)) * 4), y * w * 4);
  Object.assign(px, { w, h, data: next, dirty: true });
  px.undo = []; px.redo = [];
  renderPixelUi(); fitPixel();
}
async function newTexture(suggested) {
  const fallback = suggested || (packTypeOf(files()) === "texture" ? "Images/Item_1.png" : "Content/Items/NovaTextura.png");
  const r = await ask({ title: "Nova textura", text: packTypeOf(files()) === "texture" ? "Em Images/, o nome diz o que ela troca: Item_1 é a Picareta de Cobre, NPC_4 é o Olho de Cthulhu e Tiles_0 é a terra." : "No mod, o caminho segue o namespace e o nome da classe.", fields: [{ name: "path", label: "Caminho", value: fallback }, { name: "w", label: "Largura", value: "32" }, { name: "h", label: "Altura", value: "32" }], ok: "Criar" });
  if (!r) return;
  let path = cleanPath(r.path);
  if (!path) { toast("Caminho inválido."); return; }
  if (!/\.png$/i.test(path)) path += ".png";
  if (files()[path] !== undefined) { toast("Esse arquivo já existe."); return; }
  const w = Number(r.w), h = Number(r.h);
  if (!Number.isInteger(w) || !Number.isInteger(h) || w < 1 || h < 1 || w > 4096 || h > 4096) { toast("Use de 1 a 4096 pixels."); return; }
  files()[path] = await encodePng(w, h, new Uint8ClampedArray(w * h * 4));
  scheduleSave(); renderTree(); renderModCard();
  await openTexture(path);
}
function setupPixelEditor() {
  const c = $("pxCanvas");
  c.addEventListener("pointerdown", pxDown);
  c.addEventListener("pointermove", pxMove);
  c.addEventListener("pointerup", pxUp);
  c.addEventListener("pointercancel", pxUp);
  c.addEventListener("wheel", (e) => { e.preventDefault(); const r = c.getBoundingClientRect(); pxZoom(e.deltaY < 0 ? 1.25 : .8, e.clientX - r.left, e.clientY - r.top); }, { passive: false });
  document.querySelectorAll("#pxTools [data-tool]").forEach((b) => b.addEventListener("click", () => { px.tool = b.dataset.tool; haptic("tap"); renderPixelUi(); }));
  $("pxUndo").addEventListener("click", () => pxStep(px.undo, px.redo));
  $("pxRedo").addEventListener("click", () => pxStep(px.redo, px.undo));
  $("pxSave").addEventListener("click", savePixel);
  $("pxClose").addEventListener("click", closePixel);
  $("pxZoomIn").addEventListener("click", () => pxZoom(1.5, c.width / 2, c.height / 2));
  $("pxZoomOut").addEventListener("click", () => pxZoom(1 / 1.5, c.width / 2, c.height / 2));
  $("pxFit").addEventListener("click", fitPixel);
  $("pxGrid").addEventListener("click", () => { px.grid = !px.grid; drawPixel(); });
  $("pxSize").addEventListener("click", resizePixel);
  $("pxColor").addEventListener("input", () => { const a = px.color[3] || 255; px.color = [...parsePxColor($("pxColor").value).slice(0, 3), a]; if (px.tool === "eraser" || px.tool === "picker") px.tool = "pencil"; renderPixelUi(); });
  $("pxAlpha").addEventListener("input", () => { px.color[3] = Number($("pxAlpha").value); });
  $("pixel").addEventListener("cancel", (e) => { e.preventDefault(); closePixel(); });
  window.addEventListener("resize", () => { if ($("pixel").open) fitPixel(); });
}
