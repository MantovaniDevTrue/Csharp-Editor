function parseRoslyn(text) {
  const problems = [];
  for (const line of String(text).split("\n")) {
    const m = /^(.+?)\((\d+),(\d+)\): (CS\d+): (.*)$/.exec(line.trim());
    if (m) problems.push({ sev: "error", path: m[1], line: +m[2], col: +m[3], code: m[4], msg: m[5], roslyn: true });
  }
  return problems;
}
// Traduções oficiais do Roslyn, extraídas no build. Carregam só no primeiro erro.
let roslynPt = null;
async function loadRoslynPt() {
  if (roslynPt) return;
  try { const r = await fetch("roslyn-pt.json"); if (r.ok) roslynPt = await r.json(); } catch { /* sem a tabela, fica o texto genérico */ }
}
function translateRoslyn(code, message) {
  const entry = roslynPt?.[code];
  if (!entry) return "";
  const pattern = entry.e.split(/(\{\d+\})/).map((part) => (/^\{\d+\}$/.test(part) ? "(.*?)" : part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))).join("");
  const order = [...entry.e.matchAll(/\{(\d+)\}/g)].map((m) => +m[1]);
  const hit = new RegExp(`^${pattern}$`, "s").exec(message);
  return entry.p.replace(/\{(\d+)\}/g, (_, n) => { const at = order.indexOf(+n); return hit && at >= 0 ? hit[at + 1] : "…"; });
}
// O detalhe técnico também em português: tira o relatório interno e traduz cada linha.
function readableReport(result) {
  const lines = [];
  if (result.ms !== undefined) lines.push(`Tempo: ${result.ms} ms · ${result.files ?? 0} arquivos · ${result.lines ?? 0} linhas`);
  for (const [label, list] of [["Erro", result.errors || []], ["Aviso", (result.warnings || []).filter((w) => !/: CS86\d\d:/.test(w))]]) {
    for (const line of list) {
      const m = /^(.+?\(\d+,\d+\)): (CS\d+): (.*)$/.exec(line);
      lines.push(m ? `${label} em ${m[1]} [${m[2]}]: ${translateRoslyn(m[2], m[3]) || m[3]}` : line);
    }
  }
  return lines.join("\n") || (result.code <= -100 ? String(result.diagnostics || "") : "");
}
const quoted = (msg, n = 0) => [...msg.matchAll(/'([^']*)'/g)][n]?.[1] ?? "";
const usingFor = (name) => T[name]?.ns || Object.keys(NEEDS_USING).find((ns) => NEEDS_USING[ns].includes(name));
const OLD_API = { BunnyItem: "ModItem", BunnyWeapon: "ModItem", BunnyAccessory: "ModItem", BunnyProjectile: "ModProjectile", BunnyBuff: "ModBuff", BunnyNPC: "ModNPC", BunnyTile: "ModTile", BunnyPlayer: "ModPlayer" };
const swapName = (line, col, from, to) => {
  const at = line.indexOf(from, Math.max(0, col - 2));
  const i = at >= 0 ? at : line.indexOf(from);
  return i < 0 ? line : line.slice(0, i) + to + line.slice(i + from.length);
};
// Assinaturas do SDK para um nome de método, para mostrar como a chamada deve ser.
function signaturesOf(name, owner) {
  const pool = owner && T[owner] ? membersOf(owner) : Object.values(T).flatMap((t) => t.members);
  const seen = new Set();
  return pool.filter((m) => m.k === "m" && m.n === name).map((m) => `${m.n}(${m.p})`).filter((sig) => (seen.has(sig) ? false : seen.add(sig)));
}
