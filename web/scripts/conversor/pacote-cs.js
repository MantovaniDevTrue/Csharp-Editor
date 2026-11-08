// ---------- Conversor de pacote: mod JavaScript → mod C# ----------
// Monta o mod novo no formato atual: manifest com blVersion 3, a classe Mod em <id>.cs,
// as pastas sem content/ e as traduções em Localization/<idioma>_Mods.<id>.hjson.
const CS_DEFAULT_USINGS = ["Terraria", "Terraria.ID", "Terraria.ModLoader"];
const CS_LOC_SECTIONS = { ItemName: ["Items", "DisplayName"], ItemTooltip: ["Items", "Tooltip"], NPCName: ["NPCs", "DisplayName"], ProjectileName: ["Projectiles", "DisplayName"], BuffName: ["Buffs", "DisplayName"], BuffDescription: ["Buffs", "Description"], PrefixName: ["Prefixes", "DisplayName"] };

const csFolderNs = (id, folders) => [id, ...folders.map((f) => pascal(f))].join(".");
function hjsonValue(value, indent) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const inner = Object.entries(value).map(([k, v]) => `${indent}\t${/^[A-Za-z_][\w.]*$/.test(k) ? k : JSON.stringify(k)}: ${hjsonValue(v, indent + "\t")}`).join("\n");
    return `{\n${inner}\n${indent}}`;
  }
  if (typeof value === "string") return value && !/^\s|\s$|[\n{}[\],:"#]|^\/\/|^\/\*/.test(value) ? value : JSON.stringify(value);
  return JSON.stringify(value);
}
function csLocalization(json) {
  let data;
  try { data = JSON.parse(json); } catch { return null; }
  const out = {};
  for (const [section, entries] of Object.entries(data || {})) {
    const map = CS_LOC_SECTIONS[section];
    if (map && entries && typeof entries === "object") {
      const [group, field] = map;
      out[group] = out[group] || {};
      for (const [cls, text] of Object.entries(entries)) out[group][cls] = { ...(out[group][cls] || {}), [field]: text };
    } else out[section] = entries;
  }
  return Object.entries(out).map(([k, v]) => `${k}: ${hjsonValue(v, "")}`).join("\n") + "\n";
}
// Nomes de métodos e campos de cada classe, para this.algo virar só algo.
function jsOwnMembers(all) {
  const map = new Map();
  for (const [path, text] of Object.entries(all)) {
    if (!isJsSource(path) || typeof text !== "string") continue;
    let ast;
    try { ast = acorn.parse(text, JS_PARSE); } catch { continue; }
    walkJs(ast, (node) => {
      if (node.type !== "ClassDeclaration" || !node.id) return;
      const names = new Set();
      for (const m of node.body.body) {
        if (m.key?.type === "Identifier") names.add(m.key.name);
        if (m.key?.type === "PrivateIdentifier") names.add("#" + m.key.name);
      }
      walkJs(node.body, (n) => { if (n.type === "AssignmentExpression" && n.left.type === "MemberExpression" && n.left.object.type === "ThisExpression" && n.left.property.type === "Identifier") names.add(n.left.property.name); });
      map.set(node.id.name, names);
    });
  }
  return map;
}
function convertJsMod(all) {
  let manifest = {};
  try { manifest = JSON.parse(all["manifest.json"]); } catch { /* usa os padrões */ }
  const id = MOD_ID_RE.test(manifest.id || "") ? manifest.id : pascal(manifest.id || "MeuMod");
  const entry = jsEntryPath(all);
  const ownMembers = jsOwnMembers(all);
  const filesOut = {}, report = [];
  const nsOfJs = (jsPath) => {
    if (!jsPath.startsWith("content/")) return null;
    const rel = jsPath.slice(8);
    if ("content/" + rel === entry) return id;
    return csFolderNs(id, rel.split("/").slice(0, -1));
  };
  const { entry: _entry, blVersion: _bl, type: _type, ...rest } = manifest;
  void _entry; void _bl; void _type;
  const uid = newUid();
  filesOut["manifest.json"] = JSON.stringify({ ...rest, uid, id, blVersion: 3 }, null, 2) + "\n";
  for (const [path, value] of Object.entries(all)) {
    if (path === "manifest.json") continue;
    if (!path.startsWith("content/")) { filesOut[path] = value; continue; }
    const rel = path.slice(8);
    if (/^Localization\/[^/]+\.json$/.test(rel) && typeof value === "string") {
      const lang = rel.split("/")[1].replace(/\.json$/, "");
      const hjson = csLocalization(value);
      const to = `Localization/${lang}_Mods.${id}.hjson`;
      if (hjson !== null) { filesOut[to] = hjson; report.push({ from: path, to, js: value, cs: hjson, notes: [] }); }
      else { filesOut[rel] = value; report.push({ from: path, to: rel, js: value, cs: value, notes: [{ jsLine: 1, csLine: 1, msg: "O JSON tem erro; o arquivo foi copiado como estava." }] }); }
      continue;
    }
    if (!isJsSource(path) || typeof value !== "string") { filesOut[rel] = value; continue; }
    const to = path === entry ? `${id}.cs` : rel.replace(/\.js$/, ".cs");
    const ns = nsOfJs(path);
    const usings = new Set();
    const ctx = { path, ns, nsOfJs, usings, aliases: new Map(), ownMembers };
    let converted;
    try { converted = convertJsSource(value, ctx); }
    catch (error) { converted = { cs: "// " + value.replace(/\n/g, "\n// "), notes: [{ jsLine: 1, csLine: 1, msg: "O conversor não conseguiu ler este arquivo: " + (error?.message || error) }] }; }
    // Tipos do jogo usados no código trazem o using deles.
    for (const m of converted.cs.matchAll(/\b([A-Z][A-Za-z0-9_]*)\b/g)) { const ns2 = T[m[1]]?.ns; if (ns2 && !ns2.startsWith(id)) usings.add(ns2); }
    if (/\bMath(F)?\./.test(converted.cs)) usings.add("System");
    for (const u of CS_DEFAULT_USINGS) usings.add(u);
    usings.delete(ns);
    const header = [...usings].filter((u) => u && !["Microsoft", "ReLogic"].includes(u)).sort().map((u) => `using ${u};`).join("\n");
    const leading = (/^(?:[ \t]*\n)*/.exec(converted.cs)[0].match(/\n/g) || []).length;
    const body = converted.cs.slice(/^(?:[ \t]*\n)*/.exec(converted.cs)[0].length);
    const offset = header.split("\n").length + 3 - leading;
    const cs = `${header}\n\nnamespace ${ns};\n\n${body.trimEnd()}\n`;
    filesOut[to] = cs;
    report.push({ from: path, to, js: value, cs, notes: converted.notes.map((n) => ({ ...n, csLine: n.csLine + offset })) });
  }
  if (typeof filesOut[`${id}.cs`] !== "string") filesOut[`${id}.cs`] = modClassSource(id);
  return { id, uid, files: filesOut, report, name: manifest.name || id };
}
