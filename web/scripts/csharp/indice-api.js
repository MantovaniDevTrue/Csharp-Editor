// ---------- Índice do SDK ----------
let sdkComplete = false;
const T = SDK.types;
function chain(typeName) { const out = []; let t = typeName, hops = 0; while (t && T[t] && hops++ < 24) { out.push(T[t]); t = T[t].base === t ? null : T[t].base; } return out; }
// Partes do mod: o que pode ser compilado e o arquivo de entrada.
const isSource = (path) => path.endsWith(".cs") && !/^(bin|obj)\//.test(path);
const ENTITY_OF = { ModItem: "Item", GlobalItem: "Item", ModProjectile: "Projectile", ModNPC: "NPC", ModPlayer: "Player" };
const membersOf = (typeName) => chain(typeName).flatMap((t) => t.members);
const CONTENT_BASES = new Set(["ModItem", "ModProjectile", "ModNPC", "ModBuff", "ModTile", "ModWall", "ModPlayer", "GlobalItem", "GlobalNPC", "GlobalProjectile", "ModSystem"]);

