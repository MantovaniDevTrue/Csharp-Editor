// ---------- Mods em JavaScript (Bunny até a 0.4.0 da tag js-final) ----------
// O pacote fica como o Bunny daquela versão lê: manifest.json e icon.png na raiz, e o resto em content/.
const JS_ID_RE = /^[a-z0-9][a-z0-9._-]*$/;
const JS_VERSION_RE = /^\d+(\.\d+)*([-+][0-9A-Za-z.]+)?$/;
const JS_BL_VERSION = 2;
// A última versão do Bunny que carrega JavaScript.
const JS_LAST_BUNNY = "0.4.0";

function langOf(all) {
  let data = null;
  try { data = JSON.parse(all["manifest.json"]); } catch { /* sem manifest legível, decide pelos arquivos */ }
  if (data && typeof data === "object" && (data.type === "texture" || data.type === "font")) return null;
  if (data && typeof data.entry === "string" && data.entry.endsWith(".js")) return "js";
  return Object.keys(all).some((p) => /^content\/.+\.js$/.test(p)) ? "js" : "cs";
}
const isJsProject = () => !!(state.uid && state.mods[state.uid]) && langOf(files()) === "js";
const isJsSource = (path) => /^content\/.+\.js$/.test(path);
const jsEntryPath = (all) => {
  try { const entry = JSON.parse(all["manifest.json"]).entry; if (typeof entry === "string" && entry) return "content/" + entry; } catch { /* padrão */ }
  return "content/main.js";
};
const jsLocPath = (lang = "pt-BR") => `content/Localization/${lang}.json`;
const jsModClassSource = (id) => `// A classe do mod. As classes exportadas em Content/ e Common/ entram sozinhas no jogo.
export default class ${pascal(id)} extends Mod {
    Load() {
    }
}
`;

function starterJsMod(id, name) {
  const uid = newUid();
  const manifest = { uid, id, name, version: "0.1.0", authors: [{ name: "Seu nome", role: "Autor" }], category: "Itens", summary: "", license: "MIT", blVersion: JS_BL_VERSION, gameVersion: [301720, 301720], entry: "main.js", dependencies: [] };
  return { uid, updated: Date.now(), files: {
    "manifest.json": JSON.stringify(manifest, null, 2) + "\n",
    "content/main.js": jsModClassSource(id),
    "content/Content/Items/StarterMaterial.js": `const { ItemID, TileID } = Terraria.ID;

// Um material simples, feito com terra na bancada.
export class StarterMaterial extends ModItem {
    SetDefaults() {
        this.Item.width = 20;
        this.Item.height = 20;
        this.Item.maxStack = ModItem.CommonMaxStack;
        this.Item.value = Terraria.Item.buyPrice(0, 0, 5, 0);
        this.Item.rare = ItemRarityID.Blue;
    }

    AddRecipes() {
        this.CreateRecipe()
            .AddIngredient(ItemID.DirtBlock, 5)
            .AddTile(TileID.WorkBenches)
            .Register();
    }
}
`,
    "content/Content/Items/StarterMaterial.png": b64ToBytes(STARTER_PNG),
    [jsLocPath("pt-BR")]: JSON.stringify({ ItemName: { StarterMaterial: "Material inicial" }, ItemTooltip: { StarterMaterial: "Um material, uma receita." } }, null, 2) + "\n",
    [jsLocPath("en-US")]: JSON.stringify({ ItemName: { StarterMaterial: "Starter Material" }, ItemTooltip: { StarterMaterial: "One material, one recipe." } }, null, 2) + "\n",
  } };
}

// As regras com que o Bunny js-final aceita um pacote (BlPackage.kt e ModRepository.kt daquela versão).
function jsManifestProblems(all, data, text, add) {
  const lineOf = (key) => { const i = text.indexOf(`"${key}"`); return i < 0 ? 0 : text.slice(0, i).split("\n").length; };
  const field = (key, title, why, example, value) => add({ title, line: lineOf(key), col: 1, msg: title, why, good: example, fix: value === undefined ? null : { kind: "manifest", key, value } });
  if (!data.uid) field("uid", 'Falta o campo "uid"', "O UID identifica o mod. Sem ele, o Bunny recusa a importação.", '"uid": "dfac5a5e-dd9a-4e57-a306-4147d34693cd"', newUid());
  else if (typeof data.uid !== "string" || !UID_RE.test(data.uid)) field("uid", 'O "uid" não está no formato certo', `"${data.uid}" não é um UUID minúsculo.`, '"uid": "dfac5a5e-dd9a-4e57-a306-4147d34693cd"', newUid());
  if (typeof data.id !== "string" || !data.id) field("id", 'Falta o campo "id"', "O id é o apelido curto do mod.", '"id": "meu_mod"', "meu_mod");
  else if (!JS_ID_RE.test(data.id)) {
    const fixed = data.id.toLowerCase().replace(/[^a-z0-9._-]+/g, "_").replace(/^[^a-z0-9]+/, "") || "meu_mod";
    field("id", 'O "id" precisa ser minúsculo, sem espaço', `"${data.id}" não passa: no Bunny com JavaScript o id usa só letras minúsculas, números, ponto, hífen e _.`, `"id": "${fixed}"`, fixed);
  }
  if (typeof data.name !== "string" || !data.name.trim()) field("name", 'Falta o campo "name"', "É o nome que aparece no Bunny.", '"name": "Meu Mod"', "Meu Mod");
  if (typeof data.version !== "string" || !JS_VERSION_RE.test(data.version)) field("version", 'A "version" precisa ser do tipo 1.2.0', "O Bunny recusa uma versão fora desse formato.", '"version": "1.0.0"', "1.0.0");
  if (data.blVersion !== JS_BL_VERSION) field("blVersion", `O "blVersion" de um mod em JavaScript é ${JS_BL_VERSION}`, `O Bunny com JavaScript só carrega o formato ${JS_BL_VERSION}. O formato 3 é o dos mods em C#.`, `"blVersion": ${JS_BL_VERSION}`, JS_BL_VERSION);
  if (data.entry !== undefined && (typeof data.entry !== "string" || !data.entry.endsWith(".js"))) field("entry", 'O "entry" precisa ser um arquivo .js', "É o arquivo com a classe do mod, dentro de content/.", '"entry": "main.js"', "main.js");
  const entry = jsEntryPath(all);
  if (typeof all[entry] !== "string") add({ title: `Falta o arquivo ${entry}`, msg: "Arquivo de entrada ausente.", why: "O Bunny procura a classe do mod nesse arquivo e recusa o pacote sem ele.", good: jsModClassSource(data.id || "meu_mod"), fix: { kind: "jsentry", path: entry, id: data.id || "meu_mod" } });
  if (data.gameVersion !== undefined && !(Array.isArray(data.gameVersion) && data.gameVersion.every(Number.isInteger))) field("gameVersion", 'O "gameVersion" precisa ser uma lista de números', "Texto aqui faz o Bunny não ler o manifest.", '"gameVersion": [301720, 301720]', [301720, 301720]);
  if (data.dependencies !== undefined && !(Array.isArray(data.dependencies) && data.dependencies.every((d) => typeof d === "string"))) field("dependencies", 'O "dependencies" precisa ser uma lista de textos', "Sem dependências, use uma lista vazia.", '"dependencies": []', []);
}
function repairJsManifest(m) {
  let previous = {};
  try { const parsed = JSON.parse(m.files["manifest.json"]); if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) previous = parsed; } catch { /* usa os padrões */ }
  if (!Object.keys(previous).length && m.lastManifest) try { previous = JSON.parse(m.lastManifest); } catch { /* segue */ }
  const id = JS_ID_RE.test(previous.id || "") ? previous.id : String(previous.id || "meu_mod").toLowerCase().replace(/[^a-z0-9._-]+/g, "_").replace(/^[^a-z0-9]+/, "") || "meu_mod";
  const fixed = {
    authors: [{ name: "Autor", role: "Autor" }], category: "Itens", summary: "", license: "MIT", gameVersion: [301720, 301720], dependencies: [],
    ...previous,
    uid: UID_RE.test(previous.uid || "") ? previous.uid : UID_RE.test(m.uid) ? m.uid : newUid(),
    id, name: typeof previous.name === "string" && previous.name ? previous.name : "Mod recuperado",
    version: JS_VERSION_RE.test(previous.version || "") ? previous.version : "0.1.0",
    blVersion: JS_BL_VERSION, entry: typeof previous.entry === "string" && previous.entry.endsWith(".js") ? previous.entry : "main.js",
  };
  m.files["manifest.json"] = JSON.stringify(fixed, null, 2) + "\n";
  m.lastManifest = m.files["manifest.json"];
}

// Nome e descrição no jogo: content/Localization/pt-BR.json, com ItemName, ItemTooltip...
const JS_LOC_KEYS = { Items: ["ItemName", "ItemTooltip"], Projectiles: ["ProjectileName"], NPCs: ["NPCName"], Buffs: ["BuffName", "BuffDescription"] };
function addTranslationJs(category, cls) {
  const keys = JS_LOC_KEYS[category];
  if (!keys) return;
  const path = jsLocPath();
  let data = {};
  try { data = JSON.parse(files()[path] || "{}"); } catch { return; } // um JSON quebrado fica para a pessoa arrumar
  if (data[keys[0]]?.[cls] !== undefined) return;
  data[keys[0]] = { ...(data[keys[0]] || {}), [cls]: cls.replace(/([a-z0-9])([A-Z])/g, "$1 $2") };
  if (keys[1]) data[keys[1]] = { ...(data[keys[1]] || {}), [cls]: "" };
  files()[path] = JSON.stringify(data, null, 2) + "\n";
  scheduleSave(); renderTree();
}
function jsTranslation(cls, key) {
  let data = {};
  try { data = JSON.parse(files()[jsLocPath()] || "{}"); } catch { return ""; }
  const section = key === "DisplayName" ? ["ItemName", "NPCName", "ProjectileName", "BuffName"] : ["ItemTooltip", "BuffDescription"];
  for (const s of section) if (typeof data[s]?.[cls] === "string") return data[s][cls];
  return "";
}

// O Bunny instalado ainda carrega JavaScript?
function compareVersions(a, b) {
  const pa = String(a).split(/[^0-9]+/).filter(Boolean).map(Number), pb = String(b).split(/[^0-9]+/).filter(Boolean).map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) { const d = (pa[i] || 0) - (pb[i] || 0); if (d) return Math.sign(d); }
  return 0;
}
function bunnyRunsJs() {
  let info = {};
  try { info = JSON.parse(window.BunnyAndroid?.bunnyInfo?.() || "{}"); } catch { /* sem informação */ }
  if (!info.installed || !info.version) return { known: false };
  return { known: true, version: info.version, ok: compareVersions(info.version, JS_LAST_BUNNY) <= 0 };
}
