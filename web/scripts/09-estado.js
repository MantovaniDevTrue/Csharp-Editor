// ---------- Estado e persistência ----------
const state = { mods: {}, uid: null, active: null, problems: [], dll: null, view: "code", touchedDirs: new Set(), open: [], live: [] };
const mod = () => state.mods[state.uid];
const files = () => mod().files;

function starterMod(id = "MeuMod", name = "Meu Mod") {
  const uid = newUid();
  const manifest = {
    uid, id, name, version: "0.1.0",
    authors: [{ name: "Seu nome", role: "Autor" }],
    category: "Itens", summary: "Mod C# para o Bunny Loader.", license: "MIT",
    blVersion: 3, gameVersion: [301720, 301720], dependencies: [],
  };
  return { uid, updated: Date.now(), files: {
    "manifest.json": JSON.stringify(manifest, null, 2) + "\n",
    [id + ".cs"]: modClassSource(id),
    "Content/Items/StarterMaterial.cs": `using Terraria;
using Terraria.ID;
using Terraria.ModLoader;

namespace ${id}.Content.Items;

public class StarterMaterial : ModItem
{
    public override void SetDefaults()
    {
        Item.width = 20;
        Item.height = 20;
        Item.maxStack = Item.CommonMaxStack;
        Item.value = Item.buyPrice(silver: 1);
    }

    public override void AddRecipes()
    {
        CreateRecipe()
            .AddIngredient(ItemID.DirtBlock, 10)
            .AddTile(TileID.WorkBenches)
            .Register();
    }
}
`,
    "Content/Items/StarterMaterial.png": b64ToBytes(STARTER_PNG),
    [`Localization/pt-BR_Mods.${id}.hjson`]: "Items: {\n\tStarterMaterial: {\n\t\tDisplayName: Material inicial\n\t\tTooltip: Um material, uma receita.\n\t}\n}\n",
    [`Localization/en-US_Mods.${id}.hjson`]: "Items: {\n\tStarterMaterial: {\n\t\tDisplayName: Starter Material\n\t\tTooltip: One material, one recipe.\n\t}\n}\n",
  } };
}
// Traz um mod do formato antigo para a estrutura atual. O código com BunnyItem não muda sozinho.
function migrateMod(m) {
  let previous = {};
  try { previous = JSON.parse(m.files["manifest.json"]); } catch { /* usa o padrão */ }
  const id = MOD_ID_RE.test(previous.id || "") ? previous.id : pascal(previous.id || "MeuMod");
  const next = {};
  for (const [path, value] of Object.entries(m.files)) {
    if (path === "content/" + (previous.entry || "main.cs") && typeof value === "string" && !/\bclass\s/.test(value)) continue;
    next[path.startsWith("content/") ? path.slice(8) : path] = value;
  }
  if (typeof next[id + ".cs"] !== "string") next[id + ".cs"] = modClassSource(id);
  const { entry, ...rest } = previous;
  next["manifest.json"] = JSON.stringify({ ...rest, id, blVersion: 3 }, null, 2) + "\n";
  m.files = next;
}

const store = {
  db: null,
  async open() {
    if (this.db !== null) return this.db;
    this.db = await new Promise((resolve) => {
      try {
        const req = indexedDB.open("bunny-studio", 1);
        req.onupgradeneeded = () => req.result.createObjectStore("mods", { keyPath: "uid" });
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(false);
        req.onblocked = () => resolve(false);
      } catch { resolve(false); }
    });
    return this.db;
  },
  async all() {
    const db = await this.open();
    if (!db) return [];
    return new Promise((resolve) => {
      const req = db.transaction("mods").objectStore("mods").getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });
  },
  async remove(uid) {
    const db = await this.open();
    if (!db) return false;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction("mods", "readwrite");
        tx.objectStore("mods").delete(uid);
        tx.oncomplete = () => resolve(true);
        tx.onerror = tx.onabort = () => resolve(false);
      } catch { resolve(false); }
    });
  },
  async put(record) {
    const db = await this.open();
    if (!db) return false;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction("mods", "readwrite");
        tx.objectStore("mods").put(record);
        tx.oncomplete = () => resolve(true);
        tx.onerror = tx.onabort = () => resolve(false);
      } catch { resolve(false); }
    });
  },
};
const memoGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const memoSet = (k, v) => { try { localStorage.setItem(k, v); } catch { /* conveniência */ } };

let saveTimer = 0;
const dirty = new Set();
function scheduleSave() {
  mod().updated = Date.now();
  dirty.add(state.uid);
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flushSaves, 400);
}
async function flushSaves() {
  const pending = [...dirty];
  dirty.clear();
  const results = await Promise.all(pending.map((uid) => (state.mods[uid] ? store.put(state.mods[uid]) : true)));
  $("saved").textContent = results.every(Boolean) ? "Salvo neste aparelho" : "Não salvo: exporte o .bl";
}
window.addEventListener("pagehide", () => { if (dirty.size) flushSaves(); });
// O texto salvo a cada toque pode estar pela metade: nome e ID vêm da última versão que estava válida.
function manifestStatus(m) {
  const first = manifestProblems(m.files)[0];
  let data = null;
  try { data = JSON.parse(m.files["manifest.json"]); } catch { /* o problema já descreve */ }
  if (data && (typeof data !== "object" || Array.isArray(data))) data = null;
  if (!first) return { ok: true, data };
  return { ok: false, missing: typeof m.files["manifest.json"] !== "string", data, error: first.title + ". " + first.why };
}
const manifestOf = (m) => {
  const status = manifestStatus(m);
  if (status.ok) { m.lastManifest = m.files["manifest.json"]; return status.data; }
  try { return { ...(m.lastManifest ? JSON.parse(m.lastManifest) : {}), ...(status.data || {}) }; } catch { return status.data || {}; }
};
function repairManifest(m = mod()) {
  if (Object.keys(m.files).some((k) => k.startsWith("content/"))) { migrateMod(m); m.lastManifest = m.files["manifest.json"]; return; }
  const status = manifestStatus(m);
  if (status.ok) return;
  const previous = manifestOf(m);
  const fixed = {
    authors: [{ name: "Autor", role: "Autor" }], category: "Itens", summary: "", license: "MIT",
    gameVersion: [301720, 301720], dependencies: [],
    ...previous,
    uid: UID_RE.test(previous.uid || "") ? previous.uid : UID_RE.test(m.uid) ? m.uid : newUid(),
    id: MOD_ID_RE.test(previous.id || "") ? previous.id : pascal(previous.id || "MeuMod"),
    name: typeof previous.name === "string" && previous.name ? previous.name : "Mod recuperado",
    version: typeof previous.version === "string" && previous.version ? previous.version : "0.1.0",
    blVersion: 3,
  };
  delete fixed.entry;
  m.files["manifest.json"] = JSON.stringify(fixed, null, 2) + "\n";
  if (typeof m.files[fixed.id + ".cs"] !== "string") m.files[fixed.id + ".cs"] = modClassSource(fixed.id);
  m.lastManifest = m.files["manifest.json"];
}
function projectId() { return MOD_ID_RE.test(manifestOf(mod()).id || "") ? manifestOf(mod()).id : "MeuMod"; }
// O namespace segue a pasta: é dele que o Bunny tira o caminho da textura.
function projectNamespace(dir = "") {
  const parts = dir.split("/").filter((p) => /^[A-Za-z_]\w*$/.test(p));
  return [projectId(), ...parts].join(".");
}

