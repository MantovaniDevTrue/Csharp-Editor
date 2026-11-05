// ---------- Editor de texturas: documento ----------
// Uma textura é uma folha com camadas; os quadros são recortes dela, como nas folhas do Terraria.
const PX_PALETTE = ["#000000", "#222034", "#45283c", "#663931", "#8f563b", "#df7126", "#d9a066", "#eec39a", "#fbf236", "#99e550", "#6abe30", "#37946e", "#4b692f", "#323c39", "#3f3f74", "#306082", "#5b6ee1", "#639bff", "#5fcde4", "#cbdbfc", "#ffffff", "#9badb7", "#847e87", "#696a6a", "#ac3232", "#d95763", "#d77bba", "#8f974a"].map((hex) => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16), 255]);
const px = {
  path: "", w: 0, h: 0, layers: [], active: 0, count: 1, dir: "v", frame: 0, fw: 0, fh: 0,
  tool: "pencil", last: "pencil", color: [0, 0, 0, 255], back: [255, 255, 255, 255], brush: 1, filled: false, mirrorX: false, mirrorY: false,
  sel: null, float: null, clip: null, undo: [], redo: [], dirty: false, palette: [], recent: [],
  zoom: 8, ox: 0, oy: 0, grid: true, onion: false, preview: true, panel: null, speed: 8,
  pointers: new Map(), stroke: null, pinch: null,
  get data() { return this.layers[this.active].data; },
};
function pxHash(bytes) {
  let h = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) { h ^= bytes[i]; h = Math.imul(h, 16777619); }
  return h >>> 0;
}
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
function pxLayout() {
  px.count = Math.max(1, px.count);
  px.fw = px.dir === "h" ? Math.floor(px.w / px.count) : px.w;
  px.fh = px.dir === "v" ? Math.floor(px.h / px.count) : px.h;
  px.frame = Math.min(px.frame, px.count - 1);
}
const pxOrigin = (i = px.frame) => (px.dir === "h" ? { x: i * px.fw, y: 0 } : { x: 0, y: i * px.fh });
function topColors(data) {
  const counts = new Map();
  const step = Math.max(1, Math.floor(data.length / 4 / 40000));
  for (let i = 0; i < data.length; i += 4 * step) {
    if (!data[i + 3]) continue;
    const key = (data[i] << 24 | data[i + 1] << 16 | data[i + 2] << 8 | data[i + 3]) >>> 0;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 16).map(([k]) => [k >>> 24, k >>> 16 & 255, k >>> 8 & 255, k & 255]);
}
async function openTexture(path) {
  let image;
  try { image = await decodePng(files()[path]); }
  catch { toast("Não foi possível abrir essa imagem como PNG."); return; }
  const saved = mod().pixelDocs?.[path];
  const same = saved && saved.hash === pxHash(files()[path]) && saved.w === image.width && saved.h === image.height;
  Object.assign(px, { path, w: image.width, h: image.height, active: 0, frame: 0, sel: null, float: null, undo: [], redo: [], dirty: false, stroke: null, pinch: null, panel: null, tool: "pencil", last: "pencil" });
  px.pointers.clear();
  if (same) {
    px.layers = saved.layers.map((l) => ({ name: l.name, visible: l.visible, opacity: l.opacity, data: new Uint8ClampedArray(l.data) }));
    px.count = saved.count; px.dir = saved.dir; px.active = Math.min(saved.active || 0, px.layers.length - 1);
  } else {
    px.layers = [{ name: "Camada 1", visible: true, opacity: 255, data: new Uint8ClampedArray(image.data) }];
    px.count = 1; px.dir = "v";
  }
  pxLayout();
  const seen = new Set();
  px.palette = [...topColors(image.data), ...PX_PALETTE].filter((c) => { const k = c.join(); if (seen.has(k)) return false; seen.add(k); return true; });
  px.preview = px.w <= 256 && px.h <= 512;
  pxInvalidate();
  renderPixelUi();
  $("pixel").showModal();
  fitPixel();
  // A tela entra com animação: mede de novo quando ela termina.
  setTimeout(() => { if ($("pixel").open && !px.dirty) fitPixel(); }, 260);
}
// Junta as camadas visíveis em uma área da folha.
function pxComposite(x0, y0, w, h, out = new Uint8ClampedArray(w * h * 4)) {
  const visible = px.layers.filter((l) => l.visible && l.opacity);
  if (visible.length === 1 && visible[0].opacity === 255) {
    const d = visible[0].data;
    for (let y = 0; y < h; y++) out.set(d.subarray(((y0 + y) * px.w + x0) * 4, ((y0 + y) * px.w + x0 + w) * 4), y * w * 4);
    return out;
  }
  out.fill(0);
  for (const layer of visible) {
    const d = layer.data, op = layer.opacity / 255;
    for (let y = 0; y < h; y++) {
      let s = ((y0 + y) * px.w + x0) * 4, t = y * w * 4;
      for (let x = 0; x < w; x++, s += 4, t += 4) {
        const a = d[s + 3] / 255 * op;
        if (!a) continue;
        const under = out[t + 3] / 255, total = a + under * (1 - a);
        out[t] = (d[s] * a + out[t] * under * (1 - a)) / total;
        out[t + 1] = (d[s + 1] * a + out[t + 1] * under * (1 - a)) / total;
        out[t + 2] = (d[s + 2] * a + out[t + 2] * under * (1 - a)) / total;
        out[t + 3] = total * 255;
      }
    }
  }
  return out;
}
// Histórico: guarda a camada antes de cada traço, até 64 MB e no mínimo dois passos.
function pxCost(entry) { return entry.layers ? entry.layers.length * entry.w * entry.h * 4 : entry.data.length; }
function pxTrim() {
  let total = px.undo.reduce((sum, e) => sum + pxCost(e), 0);
  while (px.undo.length > 2 && total > 64 * 1024 * 1024) total -= pxCost(px.undo.shift());
}
function pxPushPixels() {
  px.undo.push({ layer: px.active, data: new Uint8ClampedArray(px.data) });
  px.redo = []; pxTrim();
}
function pxSnapshot() {
  return { w: px.w, h: px.h, count: px.count, dir: px.dir, frame: px.frame, active: px.active, layers: px.layers.map((l) => ({ ...l, data: new Uint8ClampedArray(l.data) })) };
}
function pxPushDoc() { px.undo.push(pxSnapshot()); px.redo = []; pxTrim(); }
function pxRestore(entry, other) {
  if (entry.layers) {
    other.push(pxSnapshot());
    Object.assign(px, { w: entry.w, h: entry.h, count: entry.count, dir: entry.dir, frame: entry.frame, active: entry.active, layers: entry.layers });
    pxLayout();
  } else {
    other.push({ layer: entry.layer, data: px.layers[entry.layer].data });
    px.layers[entry.layer].data = entry.data;
    px.active = entry.layer;
  }
}
function pxStep(from, to) {
  pxCommitFloat();
  if (!from.length) return;
  pxRestore(from.pop(), to);
  px.dirty = true;
  pxInvalidate(); renderPixelUi();
}
async function savePixel() {
  pxCommitFloat();
  const bytes = await encodePng(px.w, px.h, pxComposite(0, 0, px.w, px.h));
  files()[px.path] = bytes;
  const m = mod();
  m.pixelDocs = m.pixelDocs || {};
  // As camadas e os quadros ficam guardados no app; o mod leva só o PNG final.
  if (px.layers.length > 1 || px.count > 1) m.pixelDocs[px.path] = { hash: pxHash(bytes), w: px.w, h: px.h, count: px.count, dir: px.dir, active: px.active, layers: px.layers.map((l) => ({ name: l.name, visible: l.visible, opacity: l.opacity, data: new Uint8Array(l.data) })) };
  else delete m.pixelDocs[px.path];
  px.dirty = false;
  scheduleSave(); renderTree(); renderModCard();
  if (state.active === px.path) openFile(px.path);
  renderPixelUi();
  toast("Textura salva.");
  haptic("confirm");
}
async function closePixel() {
  pxCommitFloat();
  if (px.dirty) {
    const r = await ask({ title: "Salvar a textura?", text: "As mudanças ainda não foram salvas.", ok: "Salvar", extra: "Descartar" });
    if (!r) return;
    if (r.extra === true) px.dirty = false;
    else await savePixel();
  }
  clearInterval(pxPlayTimer);
  $("pixel").close();
}
