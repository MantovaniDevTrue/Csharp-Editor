// ---------- Prévia viva em JavaScript ----------
// Lê "class X extends ModItem { SetDefaults() { this.Item.damage = 50; } }" no mesmo formato da leitura de C#.
function liveParseJs(text, at) {
  const sig = jsSignificant(text);
  const options = [];
  for (let i = 0; i < sig.length; i++) {
    if (sig[i].v !== "class" || sig[i + 1]?.t !== "id") continue;
    let j = i + 2, base = null;
    if (sig[j]?.v === "extends") { base = sig[j + 1]?.v; j += 2; while (sig[j]?.v === "." && sig[j + 1]) { base = sig[j + 1].v; j += 2; } }
    if (sig[j]?.v !== "{") continue;
    let k = j, depth = 0;
    for (; k < sig.length; k++) { if (sig[k].v === "{") depth++; else if (sig[k].v === "}" && --depth === 0) break; }
    const root = base && jsRootOf(base);
    const kind = root && LIVE_KINDS[root];
    if (kind) options.push({ c: { name: sig[i + 1].v, open: j, close: Math.min(k, sig.length - 1), base: root }, kind });
  }
  if (!options.length) return null;
  const pick = options.find((x) => sig[x.c.open].s <= at && at <= sig[x.c.close].e) || options[0];
  const { c, kind } = pick;
  let body = null;
  for (let i = c.open + 1; i < c.close; i++) {
    if (sig[i].v !== "SetDefaults" || sig[i + 1]?.v !== "(" || sig[i - 1]?.v === ".") continue;
    let j = i + 1, depth = 0;
    do { if (sig[j].v === "(") depth++; else if (sig[j].v === ")") depth--; j++; } while (j < c.close && depth);
    if (sig[j]?.v !== "{") continue;
    let k = j; depth = 0;
    for (; k <= c.close; k++) { if (sig[k].v === "{") depth++; else if (sig[k].v === "}" && --depth === 0) break; }
    body = { open: j, close: k };
    break;
  }
  const values = {};
  if (body) for (let i = body.open + 1; i < body.close; i++) {
    if (sig[i].v !== "this" || sig[i + 1]?.v !== "." || sig[i + 2]?.v !== kind.entity || sig[i + 3]?.v !== "." || sig[i + 4]?.t !== "id" || sig[i + 5]?.v !== "=") continue;
    let e = i + 6, depth = 0;
    while (e < body.close && (depth || sig[e].v !== ";")) { if ("([{".includes(sig[e].v)) depth++; else if (")]}".includes(sig[e].v)) depth--; e++; }
    if (e === i + 6) continue;
    const start = sig[i + 6].s, end = sig[e - 1].e;
    values[sig[i + 4].v] = { text: text.slice(start, end), start, end };
  }
  return { c, kind, sig, body, values, ns: null, path: state.active, text, js: true };
}
