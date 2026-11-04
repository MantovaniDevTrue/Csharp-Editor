// ---------- ZIP (.bl) ----------
const CRC_TABLE = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(bytes) { let c = 0xFFFFFFFF; for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
async function streamBytes(bytes, Stream, format) {
  const stream = new Blob([bytes]).stream().pipeThrough(new Stream(format));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
async function buildZip(files) {
  const parts = [], central = [];
  let offset = 0;
  const canDeflate = typeof CompressionStream === "function";
  for (const path of Object.keys(files).sort()) {
    const value = files[path];
    const data = typeof value === "string" ? encoder.encode(value) : value;
    const name = encoder.encode(path);
    let method = 0, body = data;
    if (canDeflate && typeof value === "string" && data.length > 64) {
      const deflated = await streamBytes(data, CompressionStream, "deflate-raw");
      if (deflated.length < data.length) { method = 8; body = deflated; }
    }
    const crc = crc32(data);
    const header = new DataView(new ArrayBuffer(30));
    header.setUint32(0, 0x04034b50, true); header.setUint16(4, 20, true); header.setUint16(6, 0x0800, true);
    header.setUint16(8, method, true); header.setUint16(10, 0, true); header.setUint16(12, 0x21, true);
    header.setUint32(14, crc, true); header.setUint32(18, body.length, true); header.setUint32(22, data.length, true);
    header.setUint16(26, name.length, true);
    parts.push(new Uint8Array(header.buffer), name, body);
    const cd = new DataView(new ArrayBuffer(46));
    cd.setUint32(0, 0x02014b50, true); cd.setUint16(4, 20, true); cd.setUint16(6, 20, true); cd.setUint16(8, 0x0800, true);
    cd.setUint16(10, method, true); cd.setUint16(12, 0, true); cd.setUint16(14, 0x21, true);
    cd.setUint32(16, crc, true); cd.setUint32(20, body.length, true); cd.setUint32(24, data.length, true);
    cd.setUint16(28, name.length, true); cd.setUint32(42, offset, true);
    central.push(new Uint8Array(cd.buffer), name);
    offset += 30 + name.length + body.length;
  }
  const size = central.reduce((a, b) => a + b.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, central.length / 2, true); end.setUint16(10, central.length / 2, true);
  end.setUint32(12, size, true); end.setUint32(16, offset, true);
  const out = new Uint8Array(offset + size + 22);
  let at = 0;
  for (const part of [...parts, ...central, new Uint8Array(end.buffer)]) { out.set(part, at); at += part.length; }
  return out;
}
async function readZip(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 66000); i--) if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error("O arquivo não é um ZIP válido.");
  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  const entries = {};
  for (let i = 0; i < count; i++) {
    if (view.getUint32(p, true) !== 0x02014b50) throw new Error("Diretório do ZIP corrompido.");
    const method = view.getUint16(p + 10, true), compSize = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true), extra = view.getUint16(p + 30, true), comment = view.getUint16(p + 32, true);
    const local = view.getUint32(p + 42, true);
    const name = decoder.decode(bytes.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extra + comment;
    if (name.endsWith("/")) continue;
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    const raw = bytes.subarray(start, start + compSize);
    if (method === 0) entries[name] = raw.slice();
    else if (method === 8) {
      if (typeof DecompressionStream !== "function") throw new Error("Este navegador não abre ZIP comprimido.");
      entries[name] = await streamBytes(raw, DecompressionStream, "deflate-raw");
    } else throw new Error(`Método de compressão ${method} não suportado em ${name}.`);
  }
  return entries;
}
function filesFromZip(entries) {
  const names = Object.keys(entries);
  const manifest = names.filter((n) => n.split("/").pop() === "manifest.json").sort((a, b) => a.length - b.length)[0];
  if (!manifest) throw new Error("O pacote não tem manifest.json.");
  const prefix = manifest.slice(0, -"manifest.json".length);
  const files = {};
  for (const name of names) {
    if (!name.startsWith(prefix)) continue;
    const rel = name.slice(prefix.length);
    if (!rel || rel.includes("..") || rel.startsWith("/") || rel.includes("\\")) continue;
    files[rel] = isText(rel) ? decoder.decode(entries[name]) : entries[name];
  }
  return files;
}

