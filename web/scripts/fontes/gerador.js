// ---------- Gerador de fontes ----------
// Mesmo formato e medidas de tools/mods/fonts.py do Bunny: cada fonte do jogo vira um blfont/1.
const FONT_TARGETS = {
  Mouse_Text: { cap: 14, baseline: 16, lineSpacing: 24, scale: 3 },
  Item_Stack: { cap: 12, baseline: 15, lineSpacing: 21, scale: 3 },
  Death_Text: { cap: 34, baseline: 41, lineSpacing: 59, scale: 2 },
  Combat_Text: { cap: 15, baseline: 21, lineSpacing: 26, scale: 3 },
  Combat_Crit: { cap: 19, baseline: 26, lineSpacing: 32, scale: 3 },
};
const FONT_PRESETS = {
  latin: "0020-007E,00A0-024F,2010-2027,2030-203A,20A0-20BF,2122",
  europe: "0020-007E,00A0-052F,2010-2027,2030-203A,20A0-20BF,2122,2190-21FF",
};
const FONT_FIELDS = "code,page,bx,by,bw,bh,cx,cy,cw,ch,leftBearing,width,rightBearing";
const FONT_PAGE = 2048;
// Os caracteres que a fonte realmente tem, para não desenhar letras de outra fonte do sistema.
function fontCodes(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (o) => String.fromCharCode(bytes[o], bytes[o + 1], bytes[o + 2], bytes[o + 3]);
  if (tag(0) === "wOFF" || tag(0) === "wOF2") throw new Error("Use um arquivo .ttf ou .otf.");
  const count = view.getUint16(4);
  let cmap = -1;
  for (let i = 0; i < count; i++) if (tag(12 + i * 16) === "cmap") cmap = view.getUint32(12 + i * 16 + 8);
  if (cmap < 0) throw new Error("A fonte não tem tabela de caracteres.");
  const out = new Set();
  const tables = view.getUint16(cmap + 2);
  for (let t = 0; t < tables; t++) {
    const platform = view.getUint16(cmap + 4 + t * 8), encoding = view.getUint16(cmap + 6 + t * 8);
    const o = cmap + view.getUint32(cmap + 8 + t * 8), format = view.getUint16(o);
    if (!(platform === 0 || (platform === 3 && (encoding === 1 || encoding === 10)))) continue;
    if (format === 4) {
      const seg = view.getUint16(o + 6) / 2;
      const ends = o + 14, starts = ends + seg * 2 + 2, deltas = starts + seg * 2, ranges = deltas + seg * 2;
      for (let i = 0; i < seg; i++) {
        const end = view.getUint16(ends + i * 2), start = view.getUint16(starts + i * 2), delta = view.getInt16(deltas + i * 2), range = view.getUint16(ranges + i * 2);
        for (let c = start; c <= end && c !== 0xffff; c++) {
          const glyph = range === 0 ? (c + delta) & 0xffff : view.getUint16(ranges + i * 2 + range + (c - start) * 2);
          if (glyph) out.add(c);
        }
      }
    } else if (format === 12) {
      const groups = view.getUint32(o + 12);
      for (let i = 0; i < groups; i++) {
        const start = view.getUint32(o + 16 + i * 12), end = view.getUint32(o + 20 + i * 12);
        for (let c = start; c <= end && c < 0x30000; c++) out.add(c);
      }
    }
  }
  if (!out.size) throw new Error("A fonte não tem caracteres Unicode.");
  return out;
}
function presetCodes(preset, available) {
  const ranges = FONT_PRESETS[preset];
  if (!ranges) return [...available].filter((c) => c >= 32).sort((a, b) => a - b);
  const out = [];
  for (const part of ranges.split(",")) {
    const [low, high] = part.split("-").map((v) => parseInt(v, 16));
    for (let c = low; c <= (high ?? low); c++) if (available.has(c)) out.push(c);
  }
  return out;
}
class FontPages {
  constructor(step, padding) { Object.assign(this, { step, padding, side: Math.floor(FONT_PAGE / step) * step, pages: 1, x: padding, y: padding, shelf: 0 }); }
  align(v) { return Math.ceil(v / this.step) * this.step; }
  place(w, h) {
    if (w + 2 * this.padding > this.side || h + 2 * this.padding > this.side) throw new Error("Um caractere é grande demais para a folha.");
    if (this.x + w + this.padding > this.side) { this.x = this.padding; this.y = this.align(this.y + this.shelf + this.padding); this.shelf = 0; }
    if (this.y + h + this.padding > this.side) { this.pages++; this.x = this.y = this.padding; this.shelf = 0; }
    const spot = { page: this.pages - 1, x: this.x, y: this.y };
    this.x = this.align(this.x + w + this.padding);
    this.shelf = Math.max(this.shelf, h);
    return spot;
  }
}
const round3 = (v) => Math.round(v * 1000) / 1000;
async function buildFontTarget(name, target, family, reference, codes, progress) {
  const { scale, cap, baseline, lineSpacing } = target;
  const size = (cap / reference) * scale;
  const cell = Math.ceil(size * 4) + 8, originX = Math.ceil(size), originY = Math.ceil(size * 2);
  const work = document.createElement("canvas");
  work.width = cell; work.height = cell;
  const ctx = work.getContext("2d", { willReadFrequently: true });
  ctx.font = `${size}px "${family}"`; ctx.textBaseline = "alphabetic"; ctx.fillStyle = "#fff";
  const glyphs = [], packer = new FontPages(scale, 2 * scale);
  for (let n = 0; n < codes.length; n++) {
    const code = codes[n], text = String.fromCodePoint(code);
    ctx.clearRect(0, 0, cell, cell);
    ctx.fillText(text, originX, originY);
    const advance = ctx.measureText(text).width / scale;
    const { data } = ctx.getImageData(0, 0, cell, cell);
    let l = cell, t = cell, r = -1, b = -1;
    for (let y = 0; y < cell; y++) for (let x = 0; x < cell; x++) if (data[(y * cell + x) * 4 + 3]) { if (x < l) l = x; if (x > r) r = x; if (y < t) t = y; if (y > b) b = y; }
    if (r < 0) { glyphs.push({ code, kerning: [0, 0, advance], crop: [0, 0, 0, lineSpacing] }); continue; }
    const left = Math.floor((l - originX) / scale), top = Math.floor((t - originY) / scale);
    const width = Math.ceil((r + 1 - originX) / scale) - left, height = Math.ceil((b + 1 - originY) / scale) - top;
    const w = width * scale, h = height * scale;
    const image = ctx.getImageData(originX + left * scale, originY + top * scale, w, h);
    const spot = packer.place(w, h);
    glyphs.push({ code, image, spot, w, h, crop: [0, baseline + top, width, lineSpacing], kerning: [left, width, advance - left - width] });
    if (n % 64 === 0) { progress?.(name, n, codes.length); await new Promise((resolve) => setTimeout(resolve)); }
  }
  const out = {}, pageNames = [];
  for (let page = 0; page < packer.pages; page++) {
    let used = scale;
    for (const g of glyphs) if (g.image && g.spot.page === page) used = Math.max(used, g.spot.y + g.h + packer.padding);
    const height = Math.min(packer.side, Math.ceil(used / scale) * scale);
    const sheet = document.createElement("canvas");
    sheet.width = packer.side; sheet.height = height;
    const sctx = sheet.getContext("2d");
    for (const g of glyphs) if (g.image && g.spot.page === page) sctx.putImageData(g.image, g.spot.x, g.spot.y);
    const fileName = `${name}.${page}.png`;
    out[`Fonts/${fileName}`] = await new Promise((resolve, reject) => sheet.toBlob(async (blob) => (blob ? resolve(new Uint8Array(await blob.arrayBuffer())) : reject(new Error("PNG"))), "image/png"));
    pageNames.push(fileName);
  }
  const records = glyphs.slice().sort((a, b) => a.code - b.code).map((g) => [g.code, g.image ? g.spot.page : 0, g.image ? g.spot.x / scale : 0, g.image ? g.spot.y / scale : 0, g.image ? g.w / scale : 0, g.image ? g.h / scale : 0, ...g.crop, round3(g.kerning[0]), round3(g.kerning[1]), round3(g.kerning[2])]);
  out[`Fonts/${name}.json`] = JSON.stringify({ format: "blfont/1", scale, lineSpacing, spacing: 0, pages: pageNames, fields: FONT_FIELDS, glyphs: records });
  return out;
}
// Medir H em tamanho grande: é a altura de maiúscula que as medidas do jogo usam.
async function buildFontPack(bytes, preset, only, progress) {
  const codes = presetCodes(preset, fontCodes(bytes));
  if (!codes.length) throw new Error("A fonte não tem nenhum caractere desse conjunto.");
  const family = "BunnyFonte" + Date.now();
  const face = new FontFace(family, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  await face.load();
  document.fonts.add(face);
  try {
    const probe = document.createElement("canvas").getContext("2d");
    probe.font = `1000px "${family}"`;
    const reference = (probe.measureText("H").actualBoundingBoxAscent || 700) / 1000;
    const out = {};
    for (const [name, target] of Object.entries(FONT_TARGETS)) {
      if (only && !only.includes(name)) continue;
      Object.assign(out, await buildFontTarget(name, target, family, reference, codes, progress));
    }
    return { files: out, glyphs: codes.length };
  } finally { document.fonts.delete(face); }
}
function pickFontFile() {
  const input = document.createElement("input");
  input.type = "file"; input.accept = ".ttf,.otf,font/ttf,font/otf,application/octet-stream";
  input.addEventListener("change", () => { if (input.files[0]) generateFontFrom(input.files[0]); });
  input.click();
}
function generateFontFrom(file) {
  openSheet({ title: "Quais caracteres?", subtitle: file.name, items: [
    { glyph: "A", label: "Latino (português, espanhol e afins)", action: () => runFontBuild(file, "latin") },
    { glyph: "Я", label: "Europa (com cirílico e setas)", action: () => runFontBuild(file, "europe") },
    { glyph: "∞", label: "Todos os da fonte (pode ficar pesado)", action: () => runFontBuild(file, "all") },
  ] });
}
async function runFontBuild(file, preset) {
  try {
    setView("out");
    showOutput("running", "Gerando a fonte…", (out) => out.append(para("Desenha cada caractere nas cinco fontes do jogo.")));
    const result = await buildFontPack(new Uint8Array(await file.arrayBuffer()), preset, null, (name, n, total) => { $("outState").textContent = `Gerando ${name}: ${n} de ${total}`; });
    for (const path of Object.keys(files())) if (path.startsWith("Fonts/")) delete files()[path];
    Object.assign(files(), result.files);
    scheduleSave(); renderTree(); renderModCard();
    showOutput("ok", "Fonte gerada", (out) => out.append(para(`${result.glyphs} caracteres nas 5 fontes do jogo. Toque em uma folha PNG, em Fonts/, para retocar as letras.`)));
  } catch (error) {
    showOutput("fail", "Não deu para gerar a fonte", (out) => out.append(para(String(error?.message ?? error))));
  }
}
