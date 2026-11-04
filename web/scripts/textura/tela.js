// ---------- Editor de texturas: tela ----------
const pxView = { canvas: null, image: null, dirty: null, onion: null, checker: null };
function pxMark(x, y) {
  const d = pxView.dirty;
  if (!d) { pxView.dirty = { x0: x, y0: y, x1: x, y1: y }; return; }
  if (x < d.x0) d.x0 = x; if (x > d.x1) d.x1 = x; if (y < d.y0) d.y0 = y; if (y > d.y1) d.y1 = y;
}
function pxInvalidate() { const o = pxOrigin(); pxView.dirty = { x0: o.x, y0: o.y, x1: o.x + px.fw - 1, y1: o.y + px.fh - 1 }; pxView.onion = null; drawPixel(); }
function pxFlush() {
  if (!pxView.canvas || pxView.canvas.width !== px.fw || pxView.canvas.height !== px.fh) {
    pxView.canvas = document.createElement("canvas");
    pxView.canvas.width = Math.max(1, px.fw); pxView.canvas.height = Math.max(1, px.fh);
    pxInvalidateAll();
  }
  const d = pxView.dirty;
  if (!d) return;
  pxView.dirty = null;
  const o = pxOrigin(), x0 = Math.max(o.x, d.x0), y0 = Math.max(o.y, d.y0), x1 = Math.min(o.x + px.fw - 1, d.x1), y1 = Math.min(o.y + px.fh - 1, d.y1);
  if (x1 < x0 || y1 < y0) return;
  const w = x1 - x0 + 1, h = y1 - y0 + 1;
  pxView.canvas.getContext("2d").putImageData(new ImageData(pxComposite(x0, y0, w, h), w, h), x0 - o.x, y0 - o.y);
}
function pxInvalidateAll() { const o = pxOrigin(); pxView.dirty = { x0: o.x, y0: o.y, x1: o.x + px.fw - 1, y1: o.y + px.fh - 1 }; }
function pxFrameCanvas(i) {
  const o = pxOrigin(i), c = document.createElement("canvas");
  c.width = px.fw; c.height = px.fh;
  c.getContext("2d").putImageData(new ImageData(pxComposite(o.x, o.y, px.fw, px.fh), px.fw, px.fh), 0, 0);
  return c;
}
function fitPixel() {
  const c = $("pxCanvas"), box = c.parentElement.getBoundingClientRect();
  c.width = Math.max(1, Math.round(box.width)); c.height = Math.max(1, Math.round(box.height));
  px.zoom = Math.max(1 / 4, Math.min(64, Math.min((c.width - 16) / px.fw, (c.height - 16) / px.fh)));
  if (px.zoom > 1) px.zoom = Math.floor(px.zoom);
  px.ox = Math.round((c.width - px.fw * px.zoom) / 2); px.oy = Math.round((c.height - px.fh * px.zoom) / 2);
  drawPixel();
}
function pxChecker(ctx) {
  if (!pxView.checker) {
    const t = document.createElement("canvas"); t.width = t.height = 16;
    const g = t.getContext("2d");
    g.fillStyle = "#8c9bad"; g.fillRect(0, 0, 16, 16);
    g.fillStyle = "#5a6b7f"; g.fillRect(0, 0, 8, 8); g.fillRect(8, 8, 8, 8);
    pxView.checker = t;
  }
  return ctx.createPattern(pxView.checker, "repeat");
}
function drawPixel() {
  const c = $("pxCanvas");
  if (!c || !px.layers.length) return;
  pxFlush();
  const ctx = c.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, c.width, c.height);
  const sw = px.fw * px.zoom, sh = px.fh * px.zoom;
  ctx.save();
  ctx.translate(Math.round(px.ox), Math.round(px.oy));
  ctx.fillStyle = pxChecker(ctx);
  ctx.fillRect(0, 0, sw, sh);
  ctx.restore();
  if (px.onion && px.frame > 0) {
    pxView.onion = pxView.onion || pxFrameCanvas(px.frame - 1);
    ctx.globalAlpha = .3; ctx.drawImage(pxView.onion, px.ox, px.oy, sw, sh); ctx.globalAlpha = 1;
  }
  ctx.drawImage(pxView.canvas, px.ox, px.oy, sw, sh);
  if (px.float) {
    const f = px.float, t = document.createElement("canvas");
    t.width = f.w; t.height = f.h;
    t.getContext("2d").putImageData(new ImageData(f.data, f.w, f.h), 0, 0);
    ctx.drawImage(t, px.ox + f.x * px.zoom, px.oy + f.y * px.zoom, f.w * px.zoom, f.h * px.zoom);
  }
  if (px.grid && px.zoom >= 8) {
    ctx.strokeStyle = "#ffffff1f"; ctx.lineWidth = 1; ctx.beginPath();
    for (let x = 0; x <= px.fw; x++) { const v = Math.round(px.ox + x * px.zoom) + .5; ctx.moveTo(v, px.oy); ctx.lineTo(v, px.oy + sh); }
    for (let y = 0; y <= px.fh; y++) { const v = Math.round(px.oy + y * px.zoom) + .5; ctx.moveTo(px.ox, v); ctx.lineTo(px.ox + sw, v); }
    ctx.stroke();
  }
  ctx.strokeStyle = "#62e0c8"; ctx.lineWidth = 1;
  if (px.mirrorX) { const v = Math.round(px.ox + sw / 2) + .5; ctx.beginPath(); ctx.moveTo(v, px.oy); ctx.lineTo(v, px.oy + sh); ctx.stroke(); }
  if (px.mirrorY) { const v = Math.round(px.oy + sh / 2) + .5; ctx.beginPath(); ctx.moveTo(px.ox, v); ctx.lineTo(px.ox + sw, v); ctx.stroke(); }
  ctx.strokeRect(Math.round(px.ox) - .5, Math.round(px.oy) - .5, sw + 1, sh + 1);
  const area = px.float || px.sel;
  if (area) {
    ctx.setLineDash([4, 4]); ctx.strokeStyle = "#fff";
    ctx.strokeRect(Math.round(px.ox + area.x * px.zoom) + .5, Math.round(px.oy + area.y * px.zoom) + .5, area.w * px.zoom - 1, area.h * px.zoom - 1);
    ctx.lineDashOffset = 4; ctx.strokeStyle = "#000";
    ctx.strokeRect(Math.round(px.ox + area.x * px.zoom) + .5, Math.round(px.oy + area.y * px.zoom) + .5, area.w * px.zoom - 1, area.h * px.zoom - 1);
    ctx.setLineDash([]); ctx.lineDashOffset = 0;
  }
  $("pxInfo").textContent = `${px.fw}×${px.fh}${px.count > 1 ? ` · quadro ${px.frame + 1}/${px.count}` : ""} · ${px.zoom >= 1 ? Math.round(px.zoom * 10) / 10 : px.zoom.toFixed(2)}x${px.dirty ? " · não salvo" : ""}`;
  drawPxPreview();
}
let pxPlayTimer = null, pxPlayFrame = 0;
function drawPxPreview(frameCanvas) {
  const p = $("pxPreview");
  p.hidden = !px.preview;
  if (!px.preview || !px.fw) return;
  const scale = Math.max(1, Math.min(3, Math.floor(72 / Math.max(px.fw, px.fh))));
  if (p.width !== px.fw * scale || p.height !== px.fh * scale) { p.width = px.fw * scale; p.height = px.fh * scale; }
  const ctx = p.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, p.width, p.height);
  ctx.drawImage(frameCanvas || pxView.canvas, 0, 0, p.width, p.height);
}
function pxTogglePlay() {
  if (pxPlayTimer) { clearInterval(pxPlayTimer); pxPlayTimer = null; drawPixel(); renderPixelUi(); return; }
  px.preview = true;
  pxPlayFrame = px.frame;
  pxPlayTimer = setInterval(() => { pxPlayFrame = (pxPlayFrame + 1) % px.count; drawPxPreview(pxFrameCanvas(pxPlayFrame)); }, 1000 / px.speed);
  renderPixelUi();
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
const pxInside = (a, p) => a && p.x >= a.x && p.y >= a.y && p.x < a.x + a.w && p.y < a.y + a.h;
function pxSelFrom(a, b) {
  const x0 = Math.max(0, Math.min(a.x, b.x)), y0 = Math.max(0, Math.min(a.y, b.y)), x1 = Math.min(px.fw - 1, Math.max(a.x, b.x)), y1 = Math.min(px.fh - 1, Math.max(a.y, b.y));
  return x1 < x0 || y1 < y0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}
function pxRemember(color) {
  const key = color.join();
  px.recent = [color.slice(), ...px.recent.filter((c) => c.join() !== key)].slice(0, 8);
}
function pxDown(e) {
  e.preventDefault();
  $("pxCanvas").setPointerCapture(e.pointerId);
  px.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (px.pointers.size === 2) {
    // Dois dedos: desfaz o traço que tinha começado e vira zoom.
    if (px.stroke?.painted) { const entry = px.undo.pop(); px.layers[entry.layer].data = entry.data; px.dirty = px.stroke.wasDirty; pxInvalidate(); }
    px.stroke = null;
    const [a, b] = [...px.pointers.values()];
    px.pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    return;
  }
  const p = pxPoint(e), tool = px.tool;
  if (tool === "hand") { px.stroke = { pan: { x: e.clientX, y: e.clientY } }; return; }
  if (tool === "picker") {
    const c = pxPick(p.x, p.y);
    if (c && c[3]) { px.color = c; pxRemember(c); haptic("tap"); }
    px.tool = px.last; renderPixelUi();
    return;
  }
  if (tool === "select") {
    const area = px.float || px.sel;
    if (pxInside(area, p)) {
      pxLift();
      px.stroke = { drag: p, from: { x: px.float.x, y: px.float.y } };
    } else {
      pxCommitFloat();
      px.sel = null;
      px.stroke = { selecting: p };
    }
    renderPixelUi(); drawPixel();
    return;
  }
  if (!pxActiveLayerOk()) return;
  const c = tool === "eraser" ? [0, 0, 0, 0] : e.button === 2 ? px.back : px.color;
  if (tool !== "eraser") pxRemember(c);
  const wasDirty = px.dirty;
  pxPushPixels();
  if (tool === "fill") {
    if (!pxFill(p.x, p.y, c)) px.undo.pop(); else px.dirty = true;
    renderPixelUi();
    return;
  }
  px.dirty = true;
  px.stroke = { start: p, last: p, color: c, tool, painted: true, wasDirty };
  if (tool === "pencil" || tool === "eraser") pxStamp(p.x, p.y, c);
  renderPixelUi(); drawPixel();
}
function pxActiveLayerOk() {
  if (px.layers[px.active].visible) return true;
  toast("Esta camada está oculta."); return false;
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
  const s = px.stroke;
  if (!s) return;
  if (s.pan) {
    px.ox += e.clientX - s.pan.x; px.oy += e.clientY - s.pan.y;
    s.pan = { x: e.clientX, y: e.clientY };
    drawPixel();
    return;
  }
  const p = pxPoint(e);
  if (s.selecting) { px.sel = pxSelFrom(s.selecting, p); drawPixel(); return; }
  if (s.drag) {
    px.float.x = s.from.x + p.x - s.drag.x; px.float.y = s.from.y + p.y - s.drag.y;
    px.sel = { x: Math.max(0, px.float.x), y: Math.max(0, px.float.y), w: px.float.w, h: px.float.h };
    drawPixel();
    return;
  }
  if (p.x === s.last.x && p.y === s.last.y) return;
  if (s.tool === "pencil" || s.tool === "eraser") { pxLine(s.last, p, s.color); s.last = p; drawPixel(); return; }
  // Formas: volta à camada de antes e redesenha até o dedo sair.
  px.data.set(px.undo[px.undo.length - 1].data);
  if (s.tool === "line") pxLine(s.start, p, s.color);
  if (s.tool === "rect") pxRect(s.start, p, s.color);
  if (s.tool === "ellipse") pxEllipse(s.start, p, s.color);
  s.last = p;
  pxInvalidate();
}
function pxUp(e) {
  px.pointers.delete(e.pointerId);
  if (px.pointers.size < 2) px.pinch = null;
  if (px.pointers.size) return;
  const s = px.stroke;
  if (s && !s.pan && !s.selecting && !s.drag && ["line", "rect", "ellipse"].includes(s.tool) && s.last === s.start) {
    if (s.tool === "line") pxLine(s.start, s.start, s.color);
    if (s.tool === "rect") pxRect(s.start, s.start, s.color);
    if (s.tool === "ellipse") pxEllipse(s.start, s.start, s.color);
    pxInvalidate();
  }
  px.stroke = null;
  renderPixelUi();
}
