// ---------- Compilador ----------
const engine = { available: !!window.BunnyAndroid, pending: new Map(), seq: 0, status: "missing" };
function setEngine(status, text, title) {
  engine.status = status;
  $("engine").dataset.engine = status;
  $("engineText").textContent = text;
  $("engine").title = title || text;
  $("engine").setAttribute("aria-label", text);
}
async function detectEngine() {
  updateCompileLabel();
  if (engine.available) {
    let info = {};
    try { info = JSON.parse(window.BunnyAndroid.bunnyInfo?.() || "{}"); } catch { /* segue sem a informação */ }
    engine.bunny = info;
    if (info.installed) {
      setEngine("ready", info.version ? `Bunny ${info.version}` : "Bunny pronto", "Compila com o Roslyn do Bunny e a API do Bunny instalado.");
      if (settings.warm) setTimeout(warmCompiler, 1500);
    } else setEngine("missing", "Bunny não instalado", "O app compila com a API do Bunny Loader instalado no aparelho.");
  } else setEngine("missing", "Sem compilador aqui", "Esta cópia só faz a verificação rápida. O Roslyn roda no app para Android.");
}
// Depois de ler a DLL do Bunny instalado, o autocomplete conhece o jogo inteiro.
async function loadSdkIndex() {
  try {
    const response = await fetch("/api/sdk.json");
    if (!response.ok) return;
    const data = await response.json();
    Object.assign(T, data.types);
    sdkComplete = true;
    console.log(`BUNNY_SDK tipos=${Object.keys(data.types).length} item=${(T.Item?.members || []).length}`);
  } catch (error) { console.warn("Índice da API falhou:", error?.message ?? error); }
}
// O JIT guarda o que já executou: compilar um mod pequeno ao abrir o app encurta a primeira compilação real.
let warming = null;
function warmCompiler() {
  if (compiling) return;
  const started = performance.now();
  const sources = payloadOf(stressMod(100).files, "StressMod");
  warming = sendCompile(sources)
    .then(() => console.log(`BUNNY_WARM ${Math.round(performance.now() - started)}ms`))
    .catch((error) => console.warn("Aquecimento falhou:", error?.message ?? error))
    .finally(() => { warming = null; });
}
function payloadOf(all, id) {
  const sources = {};
  for (const [path, value] of Object.entries(all)) if (isSource(path) && typeof value === "string") sources[path] = value;
  return { entry: id + ".cs", files: sources };
}
async function compileWithRoslyn(sources) {
  if (warming) await warming;
  return sendCompile(sources);
}
function sendCompile(sources) {
  const id = ++engine.seq;
  return new Promise((resolve, reject) => {
    // Um SetDefaults com laço infinito prende a fila: avisa em vez de esperar para sempre.
    const timer = setTimeout(() => {
      engine.pending.delete(id);
      reject(new Error("A compilação passou de 15 minutos. Procure laços infinitos em SetDefaults ou nos construtores, feche o app e abra de novo."));
    }, 15 * 60 * 1000);
    engine.pending.set(id, (result) => { clearTimeout(timer); resolve(result); });
    window.BunnyAndroid.compile(id, JSON.stringify(sources));
  });
}
// Mod em JavaScript não compila: o botão só verifica.
function updateCompileLabel() {
  $("compileLabel").textContent = engine.available && !(state.uid && isJsProject()) ? "Compilar" : "Verificar";
}
