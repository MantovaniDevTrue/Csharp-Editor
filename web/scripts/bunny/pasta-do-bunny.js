// ---------- Pasta do Bunny (ModSources) ----------
const bridge = { pending: new Map(), seq: 0, status: "not_installed", connected: false, onConnect: null };
function refreshBridge() {
  if (!window.BunnyAndroid?.bridgeStatus) return;
  try { Object.assign(bridge, JSON.parse(window.BunnyAndroid.bridgeStatus())); } catch { /* segue sem a ponte */ }
}
function bridgeCall(op, args = {}) {
  const id = ++bridge.seq;
  return new Promise((resolve) => {
    bridge.pending.set(id, resolve);
    window.BunnyAndroid.bridgeCall(id, op, JSON.stringify(args));
  });
}
const BRIDGE_TEXT = {
  ready: "O Bunny aceita este app. Dá para abrir, salvar e instalar direto.",
  wrong_signature: "O Bunny só libera a instalação direta para apps assinados com a chave dele. Você ainda pode tentar escolher a pasta ModSources; depois, instale pelo Bunny.",
  outdated: "Este Bunny ainda não tem a conexão com editores. Você pode tentar escolher a pasta ModSources, ou atualizar o Bunny.",
  not_installed: "O Bunny Loader não está instalado neste aparelho.",
};
function connectBunny() {
  return new Promise((resolve) => {
    bridge.onConnect = (ok) => { renderModCard(); resolve(ok); };
    window.BunnyAndroid.connectBunny();
  });
}
async function ensureConnected() {
  refreshBridge();
  if (bridge.connected) return true;
  if (bridge.status === "not_installed") { toast(BRIDGE_TEXT.not_installed); return false; }
  const r = await ask({ title: "Conectar à pasta do Bunny", text: `${BRIDGE_TEXT[bridge.status]} Se o Android pedir, escolha a pasta ModSources do Bunny Loader.`, ok: "Conectar" });
  if (!r) return false;
  const ok = await connectBunny();
  if (!ok) toast("A pasta escolhida não é a ModSources do Bunny Loader.");
  return ok;
}
const b64Of = (bytes) => { let t = ""; for (let i = 0; i < bytes.length; i += 0x8000) t += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(t); };
function folderPayload(all) {
  const out = {};
  for (const [path, value] of Object.entries(all)) out[path] = typeof value === "string" ? { t: value } : { b: b64Of(value) };
  return out;
}
// Grava o mod em ModSources/<id>. Quando o Bunny permite, também instala.
async function saveToBunnyFolder(install = false) {
  if (!manifestStatus(mod()).ok) { setView("files"); toast("Corrija o manifest.json antes de salvar."); return false; }
  if (!(await ensureConnected())) return false;
  const name = manifestOf(mod()).id;
  toast("Salvando na pasta do Bunny…");
  const saved = await bridgeCall("write", { name, files: folderPayload(files()) });
  if (!saved.ok) { toast("Não foi possível salvar: " + saved.error); return false; }
  if (!install) { toast(`Salvo em ModSources/${name}.`); return true; }
  if (bridge.status === "ready") {
    const done = await bridgeCall("install", { name });
    if (done.ok) { toast(`${name} instalado no Bunny.`); return true; }
    toast("O Bunny não instalou: " + done.error);
    return false;
  }
  await ask({ title: "Salvo na pasta do Bunny", text: `O projeto está em ModSources/${name}. No Bunny, abra ModSources e toque em compilar e instalar.`, ok: "Abrir o Bunny" });
  window.BunnyAndroid.openBunny();
  return true;
}
function filesFromFolder(reply) {
  const out = {};
  for (const [path, value] of Object.entries(reply.files)) out[path] = value.t !== undefined ? value.t : b64ToBytes(value.b);
  return out;
}
async function openFromBunnyFolder() {
  if (!(await ensureConnected())) return;
  const list = await bridgeCall("list");
  if (!list.ok) { toast(list.error); return; }
  if (!list.projects.length) { toast("A pasta ModSources está vazia."); return; }
  openSheet({ title: "Abrir da pasta do Bunny", subtitle: "ModSources", items: list.projects.map((name) => ({ glyph: "▶", label: name, action: () => loadBunnyProject(name) })) });
}
async function loadBunnyProject(name) {
  const reply = await bridgeCall("read", { name });
  if (!reply.ok) { toast(reply.error); return; }
  const loaded = filesFromFolder(reply);
  let uid = "";
  try { uid = JSON.parse(loaded["manifest.json"]).uid; } catch { /* sem manifest */ }
  uid = uid || newUid();
  if (state.mods[uid]) {
    const r = await ask({ title: "Substituir a cópia daqui?", text: `"${name}" já está aberto neste app. Abrir da pasta troca os arquivos pela versão do Bunny.`, ok: "Substituir", danger: true });
    if (!r) return;
  }
  state.mods[uid] = { uid, updated: Date.now(), files: loaded };
  await switchMod(uid);
  scheduleSave();
  toast(`${name} aberto da pasta do Bunny.`);
}
