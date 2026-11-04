const ALL_SNIPPETS = [...FILE_SNIPPETS, ...INLINE_SNIPPETS, ...CSHARP_SNIPPETS];

// Expande os marcadores. Devolve texto e pontos de parada (offsets no texto final).
function expandSnippet(body, vars) {
  const defaults = {};
  body.replace(/«(\d+):([^»]*)»/g, (_, n, d) => { if (!(n in defaults)) defaults[n] = d; return ""; });
  let out = "";
  const stops = [];
  const re = /«([^»]*)»/g;
  let last = 0, m;
  while ((m = re.exec(body))) {
    out += body.slice(last, m.index);
    last = re.lastIndex;
    const raw = m[1];
    if (/^[A-Z]+$/.test(raw)) { out += vars[raw] ?? ""; continue; }
    const [n] = raw.split(":");
    const value = vars[n] ?? defaults[n] ?? "";
    stops.push({ n, start: out.length, end: out.length + value.length, primary: raw.includes(":") || n === "0" });
    out += value;
  }
  out += body.slice(last);
  return { text: out, stops };
}

