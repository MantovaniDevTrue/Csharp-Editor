// ---------- Inicialização ----------
$("compile").addEventListener("click", runCompile);
$("exportBtn").addEventListener("click", exportMod);
$("newMod").addEventListener("click", newMod);
$("newFile").addEventListener("click", () => newFile());
$("newTexture").addEventListener("click", () => newTexture());
$("fontBtn").addEventListener("click", pickFontFile);
$("saveFolder").addEventListener("click", () => saveToBunnyFolder(false));
$("openFolder").addEventListener("click", openFromBunnyFolder);
setupPixelEditor();
refreshBridge();
$("editMod").addEventListener("click", editModData);
if (window.BunnyAndroid) {
  $("sendBunny").hidden = false;
  $("sendBunny").addEventListener("click", sendToBunny);
  $("sendBunny2").addEventListener("click", sendToBunny);
}
$("fileSearch").addEventListener("input", renderTree);
$("menuBtn").addEventListener("click", openDrawer);
$("drawerClose").addEventListener("click", closeDrawer);
$("drawerScrim").addEventListener("click", closeDrawer);
$("undoBtn").addEventListener("pointerdown", (e) => e.preventDefault());
$("redoBtn").addEventListener("pointerdown", (e) => e.preventDefault());
$("undoBtn").addEventListener("click", () => { src.focus(); document.execCommand("undo"); onEdit(); });
$("redoBtn").addEventListener("click", () => { src.focus(); document.execCommand("redo"); onEdit(); });
$("findBtn").addEventListener("click", () => toggleFind());
$("findClose").addEventListener("click", () => toggleFind(false));
$("findPrev").addEventListener("click", () => stepFind(-1));
$("findBar").addEventListener("submit", (e) => { e.preventDefault(); stepFind(1); });
$("findInput").addEventListener("input", () => { src.setSelectionRange(0, 0); stepFind(1); });
$("outlineBtn").addEventListener("click", showOutline);
$("importBtn").addEventListener("click", () => $("importInput").click());

$("importInput").addEventListener("change", async (e) => { await importFiles([...e.target.files]); e.target.value = ""; });
$("modSelect").addEventListener("click", () => { haptic("tap"); openModsWindow(); });
$("settingsBtn").addEventListener("click", () => { haptic("tap"); renderSettings(); $("settings").showModal(); });
// Toque fora fecha as folhas, como nas de um app.
for (const id of ["sheet", "mods"]) $(id).addEventListener("click", (e) => { if (e.target === $(id)) $(id).close(); });
document.addEventListener("contextmenu", (e) => { if (!e.target.closest("textarea, input, pre.log, pre.preview")) e.preventDefault(); });
document.addEventListener("dragstart", (e) => e.preventDefault());
$("snipSearch").addEventListener("input", renderSnippets);
$("snipHere").addEventListener("click", () => { src.focus(); showCompletions(true); });
$("dlDll").addEventListener("click", async () => {
  if (!state.dll) return;
  const m = manifestOf(mod());
  if (downloads) { toast("Baixe o .dll pela versão publicada: esta visualização só salva .zip."); return; }
  await saveFile(`${m.id || "mod"}.dll`, state.dll);
});
document.querySelectorAll(".tabs button").forEach((b) => b.addEventListener("click", () => { if (b.dataset.view !== state.view) haptic("tap"); setView(b.dataset.view); }));
document.addEventListener("keydown", (e) => { if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); runCompile(); } });
$("ed").addEventListener("dragover", (e) => e.preventDefault());
$("ed").addEventListener("drop", (e) => { e.preventDefault(); if (e.dataTransfer?.files?.length) importFiles([...e.dataTransfer.files]); });
if (document.fonts?.ready) document.fonts.ready.then(() => { measure(); queueRender(); });
let fullHeight = window.innerHeight;
window.addEventListener("resize", () => {
  fullHeight = Math.max(fullHeight, window.innerHeight);
  // Com o teclado aberto, a barra de abas devolve o espaço ao código.
  document.body.classList.toggle("kb", window.innerHeight < fullHeight * 0.75 && document.activeElement === src);
  drawScene(); measure(); syncScroll();
  if (document.activeElement === src) keepCaretVisible();
});
window.addEventListener("orientationchange", () => { fullHeight = 0; });
function keepCaretVisible() {
  const before = src.value.slice(0, src.selectionStart);
  const y = before.split("\n").length * lineH;
  if (y > src.scrollTop + src.clientHeight - lineH || y < src.scrollTop + lineH) src.scrollTop = Math.max(0, y - src.clientHeight / 2);
  syncScroll();
}

(async function start() {
  scene.start();
  applySettings();
  measure();
  setView("code");
  renderSnippets();
  const records = await store.all();
  for (const r of records) state.mods[r.uid] = r;
  if (!records.length) { const m = starterMod(); state.mods[m.uid] = m; }
  for (const m of Object.values(state.mods)) if (manifestStatus(m).ok) m.lastManifest = m.files["manifest.json"];
  const remembered = memoGet("bunny-studio-current");
  await switchMod(state.mods[remembered] ? remembered : Object.values(state.mods).sort((a, b) => b.updated - a.updated)[0].uid);
  $("saved").textContent = (await store.open()) ? "Salvo neste aparelho" : "Sem armazenamento: exporte o .bl";
  await detectEngine();
  if (window.BunnyAndroid) loadSdkIndex();
  if ($("outHead").dataset.state === "idle") showOutput("idle", "Nada compilado ainda.", idleOutput);
  setTimeout(inviteTour, 700);
  if (location.hash === "#rendercrash") {
    setView("out");
    showOutput("crash", "O compilador ficou sem memória", (out) => out.append(para("O Android encerrou a tela do compilador e o app reabriu. Os arquivos salvos continuam aqui. Feche outros apps e tente de novo.")));
  }
  if (window.BunnyAndroid && location.hash === "#autocompile") selfTest();
  if (window.BunnyAndroid && location.hash === "#autostress") stressSelfTest();
  if (window.BunnyAndroid && location.hash === "#autoerrors") errorSelfTest();
})();

// Cada caso é um engano comum: o Roslyn real reclama, o app explica, a correção precisa compilar.
const ERROR_CASES = (() => {
  const item = (body, tail = "") => `using System;\nusing Terraria;\nusing Terraria.ID;\nusing Terraria.ModLoader;\nnamespace T;\npublic class Caso : ModItem\n{\n    public override void SetDefaults()\n    {\n        ${body}\n    }\n${tail}}\n`;
  return {
    pontoVirgula: item("Item.width = 20\n        Item.height = 20;"),
    nomeErrado: item("Item.widht = 20;"),
    semItem: item("width = 20;"),
    decimal: item("Item.shootSpeed = 1.5;"),
    textoNumero: item('Item.value = "10";'),
    floatInt: item("Item.value = 1.5f;"),
    metodoErrado: item("CreateRecipe().AddIngrediente(ItemID.DirtBlock, 1).Register();"),
    overrideNome: item("Item.width = 20;", "    public override void AddRecipe() { }\n"),
    faltaUsing: "namespace T;\npublic class Caso : ModItem\n{\n}\n",
    faltaSystem: "using Terraria;\nusing Terraria.ModLoader;\nnamespace T;\npublic class Caso : ModItem\n{\n    public override void SetDefaults() { Item.value = Math.Max(1, 2); }\n}\n",
    faltaChave: "using Terraria;\nusing Terraria.ModLoader;\nnamespace T;\npublic class Caso : ModItem\n{\n    public override void SetDefaults()\n    {\n        Item.width = 20;\n    }\n",
    textoAberto: 'using Terraria;\nusing Terraria.ModLoader;\nnamespace T;\npublic class Caso : ModItem\n{\n    public override void AddRecipes()\n    {\n        string a = "A;\n    }\n}\n',
    parentese: item("Item.value = (1 + 2;"),
    tipoErrado: "using Terraria;\nusing Terraria.ModLoader;\nnamespace T;\npublic class Caso : ModIten\n{\n}\n",
    apiAntiga: "using Terraria;\nusing Terraria.ModLoader;\nnamespace T;\npublic class Caso : BunnyItem\n{\n}\n",
  };
})();
async function errorSelfTest() {
  console.log("BUNNY_ERRORS_START");
  await new Promise((resolve) => setTimeout(resolve, 2500));
  if (warming) await warming;
  await loadSdkIndex();
  await loadRoslynPt();
  // Um erro sem explicação própria precisa sair em português, pela tradução oficial.
  const rare = await sendCompile({ entry: "T.cs", files: { "T.cs": "using Terraria.ModLoader;\nnamespace T;\npublic class T : Mod { void F() { int[] a = new int[1, 2]; goto fim; } }\n" } });
  const rareProblems = parseRoslyn((rare.errors || []).join("\n"));
  rareProblems.forEach((p) => explainProblem(p, ""));
  console.log(`BUNNY_PT tabela=${Object.keys(roslynPt || {}).length} ${rareProblems.map((p) => `${p.code}=${p.title}`).join(" | ").slice(0, 400)}`);
  let failed = roslynPt && rareProblems.length && rareProblems.every((p) => p.known) ? 0 : 1;
  for (const [name, original] of Object.entries(ERROR_CASES)) {
    let text = original, title = "", good = "", steps = 0, ok = false, unknown = "";
    try {
      for (; steps < 5; steps++) {
        const result = await sendCompile({ entry: "T.cs", files: { "T.cs": "using Terraria.ModLoader;\nnamespace T;\npublic class T : Mod { }\n", "Caso.cs": text } });
        if (result.code > 0) { ok = true; break; }
        const problems = parseRoslyn((result.errors || []).join("\n")).filter((p) => p.path === "Caso.cs");
        if (!problems.length) { unknown = "sem diagnóstico: " + String(result.diagnostics).slice(0, 300); break; }
        for (const p of problems) explainProblem(p, text);
        const offender = problems.find((p) => !p.known);
        if (offender) { unknown = `${offender.code} ${offender.msg}`; break; }
        if (!title) { title = problems[0].title; good = problems[0].good; }
        const fixable = problems.find((p) => p.fix);
        if (!fixable) { unknown = `sem correção: ${problems[0].code} ${problems[0].msg}`; break; }
        text = fixedText(text, fixable.fix);
      }
    } catch (error) { unknown = "exceção: " + (error?.message ?? error); }
    const passed = ok && steps > 0;
    if (!passed) failed++;
    console.log(`BUNNY_ERROR ${passed ? "ok" : "FALHOU"} ${name} passos=${steps} :: ${title} :: ${String(good).split("\n")[0].trim()} ${unknown ? ":: " + unknown : ""}`);
  }
  console.log(`BUNNY_ERRORS_DONE casos=${Object.keys(ERROR_CASES).length} falhas=${failed}`);
}
async function stressSelfTest() {
  // Primeiro 1000 com o runtime frio, como no uso real; depois os tamanhos crescentes.
  // Espera o aquecimento, como quem abre o app e demora alguns segundos para compilar.
  await new Promise((resolve) => setTimeout(resolve, 2500));
  if (warming) await warming;
  let last = "ok";
  for (const count of [1000, 100, 300, 600, 1000]) {
    console.log(`BUNNY_STRESS n=${count} gerando`);
    const m = stressMod(count);
    state.mods[m.uid] = m;
    await switchMod(m.uid);
    console.log(`BUNNY_STRESS n=${count} aberto`);
    const started = performance.now();
    const beat = setInterval(() => console.log(`BUNNY_STRESS n=${count} rodando ${Math.round((performance.now() - started) / 1000)}s engine=${engine.status}`), 60000);
    console.log(`BUNNY_STRESS n=${count} compilando engine=${engine.status}`);
    await runCompile();
    clearInterval(beat);
    last = $("outHead").dataset.state;
    console.log(`BUNNY_STRESS n=${count} state=${last} total=${Math.round((performance.now() - started) / 1000)}s :: ${$("outState").textContent}`);
    console.log(`BUNNY_STRESS_DETAIL n=${count} :: ${(/stats [^\n]*/.exec($("output").textContent) || [""])[0].slice(0, 200)} :: ${(/ASSEMBLY_EXEC_OK classes=\d+/.exec($("output").textContent) || [""])[0]}`);
    delete state.mods[m.uid];
    if (last !== "ok") { console.log("BUNNY_STRESS detalhe :: " + $("output").innerText.slice(0, 900)); break; }
  }
  console.log(`BUNNY_STRESS_DONE state=${last}`);
}

// Prova, no aparelho ou emulador, que o APK compila e também recusa código quebrado.
async function selfTest() {
  await runCompile();
  const first = $("outHead").dataset.state;
  console.log("BUNNY_SMOKE first=" + first + " :: " + $("output").innerText.slice(0, 1500));
  const original = src.value;
  window.bunnyStudio.appendToActive("\nnao compila");
  await runCompile();
  const second = $("outHead").dataset.state;
  console.log("BUNNY_SMOKE second=" + second + " :: " + $("output").innerText.slice(0, 800));
  src.value = original; src.dispatchEvent(new Event("input"));
  const pkg = await buildZip(files());
  let pkgText = "";
  for (let i = 0; i < pkg.length; i += 0x8000) pkgText += String.fromCharCode.apply(null, pkg.subarray(i, i + 0x8000));
  console.log("BUNNY_SMOKE pacote=" + window.BunnyAndroid.saveToDownloads("smoke-test.bl", btoa(pkgText)));
  if (engine.bunny?.stub) {
    console.log("BUNNY_SMOKE_DONE first=" + first + " second=" + second + " models=skip");
    return;
  }
  const probe = snippetProbeMod();
  state.mods[probe.uid] = probe;
  await switchMod(probe.uid);
  await runCompile();
  const models = $("outHead").dataset.state;
  console.log("BUNNY_SMOKE modelos=" + models + " :: " + $("outState").textContent + " :: " + $("output").textContent.slice(-900));
  delete state.mods[probe.uid];
  console.log(`BUNNY_SMOKE_DONE first=${first} second=${second} models=${models}`);
}

// Usado pelos testes automatizados.
window.bunnyStudio = {
  onBridge(id, json) { const done = bridge.pending.get(id); if (done) { bridge.pending.delete(id); done(JSON.parse(json)); } },
  onBunnyConnected(ok) { refreshBridge(); const done = bridge.onConnect; bridge.onConnect = null; done?.(ok); },
  openTexture, newTexture, buildFontPack, fontCodes, packTypeOf, starterPack, px, pxSetColor, pxSetTool, pxLayerAction, pxAddFrame, pxTransform, savePixel,
  onSdkIndex: loadSdkIndex, setRoslynPt(t) { roslynPt = t; }, translateRoslyn, openDrawer, closeDrawer, startTour, endTour, explainProblem, migrateMod, fixedText, manifestProblems, scene, settings, manifestStatus, stressMod, snippetProbeMod, editContext, fileOutline, classBodyFor, lex, quickCheck, expandSnippet, buildZip, readZip, filesFromZip, parseRoslyn, snippets: ALL_SNIPPETS, sdk: SDK,
  completionsAt(text, at, path = "Content/x.cs", force = true) { const prev = state.active; state.active = path; src.value = text; src.setSelectionRange(at, at); const r = completions(force); state.active = prev; return r; },
  appendToActive(text) { src.value += text; src.dispatchEvent(new Event("input")); },
  onNativeCompile(id, json) {
    const done = engine.pending.get(id);
    if (!done) return;
    engine.pending.delete(id);
    done(JSON.parse(json));
  },
  onNativeSave(status, name) {
    if (status === "saved") toast(`${name} salvo.`);
    else if (status === "failed") toast("Não foi possível salvar o arquivo.");
  },
  onBack() {
    if (tourIndex >= 0) { endTour(); return true; }
    if ($("dlg").open) { $("dlg").close("cancel"); return true; }
    if ($("pixel").open) { closePixel(); return true; }
    if (closeDrawer()) return true;
    if ($("dlg").open) { $("dlg").close("cancel"); return true; }
    for (const id of ["sheet", "mods", "settings"]) if ($(id).open) { $(id).close(); return true; }
    if (!pop.hidden) { closePopup(); return true; }
    if (!$("findBar").hidden) { toggleFind(false); return true; }
    if (state.view !== "code") { setView("code"); return true; }
    return false;
  },
};
