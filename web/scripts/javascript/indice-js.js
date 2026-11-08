// ---------- API JavaScript do Bunny (tag js-final) ----------
// Gerado por tools/generate_js_index.py a partir de docs/referencia/metodos.json.
const JSI = /*JS_INDEX*/;
// Cada membro: [nome, tipo, parâmetros, gancho (1 = método que o jogo chama), descrição].
function jsChain(cls) {
  const out = [];
  let name = cls, hops = 0;
  while (name && JSI.classes[name] && hops++ < 12) { out.push(name); name = JSI.classes[name].b; }
  return out;
}
function jsMembers(cls) {
  return jsChain(cls).flatMap((name) => JSI.classes[name].m.map(([n, k, p, hook, d]) => ({ n, k, p, hook: !!hook, d, owner: name })));
}
const jsHooks = (cls) => jsMembers(cls).filter((m) => m.hook);
// A propriedade com a entidade do jogo, como this.Item em um ModItem.
const JS_ENTITY = { ModItem: "Item", GlobalItem: "Item", ModNPC: "NPC", GlobalNPC: "NPC", ModProjectile: "Projectile", GlobalProjectile: "Projectile", ModPlayer: "Player" };
function jsEntityOf(base) {
  for (const name of jsChain(base)) if (JS_ENTITY[name]) return JS_ENTITY[name];
  return JS_ENTITY[base] || null;
}
// Árvore de namespaces do jogo (Terraria.ID.ItemID), montada a partir do índice de C#.
function jsNamespaceChildren(path) {
  const prefix = path + ".";
  const spaces = new Set(), types = [];
  for (const [name, type] of Object.entries(T)) {
    const ns = type.ns || "";
    if (ns === path) types.push(name);
    else if (ns.startsWith(prefix)) spaces.add(ns.slice(prefix.length).split(".")[0]);
  }
  return { spaces: [...spaces].sort(), types: types.sort() };
}
function isJsNamespace(path) {
  return Object.values(T).some((type) => type.ns === path || (type.ns || "").startsWith(path + "."));
}
// Distância de edição curta, para sugerir "damage" a quem escreveu "damge".
function closestName(word, names, limit = 2) {
  const low = word.toLowerCase();
  let best = null, bestScore = limit + 1;
  for (const name of names) {
    const other = name.toLowerCase();
    if (other === low) return name;
    if (Math.abs(other.length - low.length) > limit) continue;
    const row = Array.from({ length: other.length + 1 }, (_, j) => j);
    for (let i = 1; i <= low.length; i++) {
      let prev = row[0]; row[0] = i;
      for (let j = 1; j <= other.length; j++) {
        const tmp = row[j];
        row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (low[i - 1] === other[j - 1] ? 0 : 1));
        prev = tmp;
      }
    }
    if (row[other.length] < bestScore) { bestScore = row[other.length]; best = name; }
  }
  return best;
}
