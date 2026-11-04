// ---------- Editor de texturas: ferramentas ----------
// x e y aqui são da folha inteira; o traço fica preso ao quadro atual e à seleção.
function pxBounds() {
  const o = pxOrigin();
  if (px.sel) return { x0: o.x + px.sel.x, y0: o.y + px.sel.y, x1: o.x + px.sel.x + px.sel.w, y1: o.y + px.sel.y + px.sel.h };
  return { x0: o.x, y0: o.y, x1: o.x + px.fw, y1: o.y + px.fh };
}
function pxSet(x, y, c) {
  const b = pxBounds();
  if (x < b.x0 || y < b.y0 || x >= b.x1 || y >= b.y1) return;
  const i = (y * px.w + x) * 4, d = px.data;
  d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = c[3];
  pxMark(x, y);
}
// Pincel quadrado, com os espelhos ligados. Recebe posição dentro do quadro.
function pxStamp(fx, fy, c) {
  const o = pxOrigin(), size = px.brush, half = Math.floor((size - 1) / 2);
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
    const x = fx - half + i, y = fy - half + j;
    pxSet(o.x + x, o.y + y, c);
    const mx = px.fw - 1 - x, my = px.fh - 1 - y;
    if (px.mirrorX) pxSet(o.x + mx, o.y + y, c);
    if (px.mirrorY) pxSet(o.x + x, o.y + my, c);
    if (px.mirrorX && px.mirrorY) pxSet(o.x + mx, o.y + my, c);
  }
}
function pxLine(a, b, c) {
  let { x, y } = a;
  const dx = Math.abs(b.x - x), dy = -Math.abs(b.y - y), sx = x < b.x ? 1 : -1, sy = y < b.y ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    pxStamp(x, y, c);
    if (x === b.x && y === b.y) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x += sx; }
    if (e2 <= dx) { err += dx; y += sy; }
  }
}
function pxRect(a, b, c) {
  const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x), y0 = Math.min(a.y, b.y), y1 = Math.max(a.y, b.y);
  if (px.filled) { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) pxStamp(x, y, c); return; }
  for (let x = x0; x <= x1; x++) { pxStamp(x, y0, c); pxStamp(x, y1, c); }
  for (let y = y0; y <= y1; y++) { pxStamp(x0, y, c); pxStamp(x1, y, c); }
}
function pxEllipse(a, b, c) {
  const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x), y0 = Math.min(a.y, b.y), y1 = Math.max(a.y, b.y);
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, rx = (x1 - x0) / 2 + .5, ry = (y1 - y0) / 2 + .5;
  for (let y = y0; y <= y1; y++) {
    const t = (y - cy) / ry, half = rx * Math.sqrt(Math.max(0, 1 - t * t));
    const left = Math.max(x0, Math.ceil(cx - half)), right = Math.min(x1, Math.floor(cx + half));
    if (px.filled) { for (let x = left; x <= right; x++) pxStamp(x, y, c); continue; }
    if (left <= right) { pxStamp(left, y, c); pxStamp(right, y, c); }
  }
  if (px.filled) return;
  for (let x = x0; x <= x1; x++) {
    const t = (x - cx) / rx, half = ry * Math.sqrt(Math.max(0, 1 - t * t));
    const top = Math.max(y0, Math.ceil(cy - half)), bottom = Math.min(y1, Math.floor(cy + half));
    if (top <= bottom) { pxStamp(x, top, c); pxStamp(x, bottom, c); }
  }
}
function pxFill(fx, fy, c) {
  const o = pxOrigin(), b = pxBounds(), w = px.w, d = px.data;
  const sx = o.x + fx, sy = o.y + fy;
  if (sx < b.x0 || sy < b.y0 || sx >= b.x1 || sy >= b.y1) return false;
  const start = (sy * w + sx) * 4;
  const from = [d[start], d[start + 1], d[start + 2], d[start + 3]];
  if (from.every((v, i) => v === c[i])) return false;
  const same = (p) => d[p] === from[0] && d[p + 1] === from[1] && d[p + 2] === from[2] && d[p + 3] === from[3];
  const stack = [sy * w + sx];
  while (stack.length) {
    const at = stack.pop(), p = at * 4;
    if (!same(p)) continue;
    d[p] = c[0]; d[p + 1] = c[1]; d[p + 2] = c[2]; d[p + 3] = c[3];
    const x = at % w, y = (at - x) / w;
    if (x > b.x0) stack.push(at - 1);
    if (x < b.x1 - 1) stack.push(at + 1);
    if (y > b.y0) stack.push(at - w);
    if (y < b.y1 - 1) stack.push(at + w);
  }
  pxInvalidate();
  return true;
}
function pxPick(fx, fy) {
  if (fx < 0 || fy < 0 || fx >= px.fw || fy >= px.fh) return null;
  const o = pxOrigin();
  return [...pxComposite(o.x + fx, o.y + fy, 1, 1)];
}
// ----- Seleção: os pixels levantados flutuam até serem soltos.
function pxCopyRegion(sel, layer = px.data) {
  const o = pxOrigin(), out = new Uint8ClampedArray(sel.w * sel.h * 4);
  for (let y = 0; y < sel.h; y++) out.set(layer.subarray(((o.y + sel.y + y) * px.w + o.x + sel.x) * 4, ((o.y + sel.y + y) * px.w + o.x + sel.x + sel.w) * 4), y * sel.w * 4);
  return out;
}
function pxClearRegion(sel) {
  const o = pxOrigin();
  for (let y = 0; y < sel.h; y++) px.data.fill(0, ((o.y + sel.y + y) * px.w + o.x + sel.x) * 4, ((o.y + sel.y + y) * px.w + o.x + sel.x + sel.w) * 4);
  pxInvalidate();
}
function pxLift() {
  if (px.float || !px.sel) return;
  pxPushPixels();
  px.float = { x: px.sel.x, y: px.sel.y, w: px.sel.w, h: px.sel.h, data: pxCopyRegion(px.sel) };
  pxClearRegion(px.sel);
  px.dirty = true;
}
function pxCommitFloat() {
  const f = px.float;
  if (!f) return;
  px.float = null;
  const o = pxOrigin(), d = px.data;
  for (let y = 0; y < f.h; y++) for (let x = 0; x < f.w; x++) {
    const sx = f.x + x, sy = f.y + y;
    if (sx < 0 || sy < 0 || sx >= px.fw || sy >= px.fh) continue;
    const s = (y * f.w + x) * 4;
    if (!f.data[s + 3]) continue;
    const t = ((o.y + sy) * px.w + o.x + sx) * 4;
    d[t] = f.data[s]; d[t + 1] = f.data[s + 1]; d[t + 2] = f.data[s + 2]; d[t + 3] = f.data[s + 3];
  }
  px.sel = { x: Math.max(0, f.x), y: Math.max(0, f.y), w: Math.min(f.w, px.fw - Math.max(0, f.x)), h: Math.min(f.h, px.fh - Math.max(0, f.y)) };
  if (px.sel.w < 1 || px.sel.h < 1) px.sel = null;
  px.dirty = true;
  pxInvalidate();
}
function pxDeselect() { pxCommitFloat(); px.sel = null; renderPixelUi(); drawPixel(); }
function pxCopy(cut) {
  if (!px.sel) return;
  pxCommitFloat();
  px.clip = { w: px.sel.w, h: px.sel.h, data: pxCopyRegion(px.sel) };
  if (cut) { pxPushPixels(); pxClearRegion(px.sel); px.dirty = true; }
  toast(cut ? "Recortado." : "Copiado.");
  renderPixelUi(); drawPixel();
}
function pxPaste() {
  if (!px.clip) return;
  pxCommitFloat();
  pxPushPixels();
  px.float = { x: 0, y: 0, w: px.clip.w, h: px.clip.h, data: new Uint8ClampedArray(px.clip.data) };
  px.sel = { x: 0, y: 0, w: Math.min(px.clip.w, px.fw), h: Math.min(px.clip.h, px.fh) };
  px.tool = "select"; px.dirty = true;
  renderPixelUi(); drawPixel();
}
function pxDeleteSelection() {
  if (!px.sel) return;
  if (px.float) { px.float = null; px.sel = null; px.dirty = true; renderPixelUi(); drawPixel(); return; }
  pxPushPixels(); pxClearRegion(px.sel); px.dirty = true;
  renderPixelUi(); drawPixel();
}
// Virar ou girar: a seleção, ou o quadro inteiro nesta camada.
function pxTransform(kind) {
  pxCommitFloat();
  const area = px.sel || { x: 0, y: 0, w: px.fw, h: px.fh };
  if (kind === "rotate" && area.w !== area.h) { toast("Para girar, a área precisa ser quadrada."); return; }
  pxPushPixels();
  const src = pxCopyRegion(area), o = pxOrigin(), d = px.data;
  for (let y = 0; y < area.h; y++) for (let x = 0; x < area.w; x++) {
    const [tx, ty] = kind === "flipH" ? [area.w - 1 - x, y] : kind === "flipV" ? [x, area.h - 1 - y] : [area.h - 1 - y, x];
    const s = (y * area.w + x) * 4, t = ((o.y + area.y + ty) * px.w + o.x + area.x + tx) * 4;
    d[t] = src[s]; d[t + 1] = src[s + 1]; d[t + 2] = src[s + 2]; d[t + 3] = src[s + 3];
  }
  px.dirty = true;
  pxInvalidate(); renderPixelUi();
}
// Troca uma cor por outra em toda a camada.
function pxReplaceColor(from, to) {
  pxPushPixels();
  const d = px.data;
  for (let i = 0; i < d.length; i += 4) if (d[i] === from[0] && d[i + 1] === from[1] && d[i + 2] === from[2] && d[i + 3] === from[3]) { d[i] = to[0]; d[i + 1] = to[1]; d[i + 2] = to[2]; d[i + 3] = to[3]; }
  px.dirty = true;
  pxInvalidate(); renderPixelUi();
}
// Muda o tamanho da folha: cada camada copia a parte que ainda cabe.
function pxResizeSheet(w, h, place = (l, next) => {
  for (let y = 0; y < Math.min(h, px.h); y++) next.set(l.subarray(y * px.w * 4, (y * px.w + Math.min(w, px.w)) * 4), y * w * 4);
}) {
  pxCommitFloat();
  pxPushDoc();
  for (const layer of px.layers) { const next = new Uint8ClampedArray(w * h * 4); place(layer.data, next); layer.data = next; }
  px.w = w; px.h = h; px.sel = null; px.dirty = true;
  pxLayout();
}
