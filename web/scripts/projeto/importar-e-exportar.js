// ---------- Importar e exportar ----------
let downloads = null;
if (window.claude?.use) window.claude.use("downloads").then((d) => { downloads = d; setExportLabel(); }).catch(() => {});
function setExportLabel() { $("exportBtn").querySelector("span").textContent = downloads ? "Exportar .zip" : "Exportar .bl"; }

async function saveFile(filename, bytes) {
  if (window.BunnyAndroid) {
    let text = "";
    for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    window.BunnyAndroid.saveFile(filename, btoa(text));
    return "pending"; // o Android abre o seletor e avisa em onNativeSave
  }
  if (downloads) {
    try { await downloads.save({ filename, data: bytes.slice() }); return true; }
    catch (error) {
      if (error?.code === "declined") return false;
      toast(error?.message || "Não foi possível salvar o arquivo."); return false;
    }
  }
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/octet-stream" }));
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  return true;
}
async function exportMod() {
  if (!manifestStatus(mod()).ok) { setView("files"); toast("Corrija o manifest.json antes de exportar."); return; }
  const m = manifestOf(mod());
  const base = `${m.id || "mod"}-${m.version || "0"}`;
  const bytes = await buildZip(files());
  if (downloads) {
    if (await saveFile(`${base}.zip`, bytes)) toast("Renomeie o .zip para .bl antes de importar no Bunny.");
  } else if ((await saveFile(`${base}.bl`, bytes)) === true) toast("Pacote exportado.");
}
// O Bunny não recebe arquivos de outros apps: o pacote vai para Downloads e o Bunny abre pronto para importar.
async function sendToBunny() {
  if (!manifestStatus(mod()).ok) { setView("files"); toast("Corrija o manifest.json antes de enviar."); return; }
  await runCompile();
  if ($("outHead").dataset.state !== "ok") {
    setView("out");
    toast("Corrija os erros antes de enviar.");
    return;
  }
  // Com a pasta do Bunny conectada, o mod vai direto para ModSources.
  refreshBridge();
  if (bridge.connected) { await saveToBunnyFolder(true); return; }
  const m = manifestOf(mod());
  const filename = `${m.id || "mod"}-${m.version || "0"}.bl`;
  const bytes = await buildZip(files());
  let text = "";
  for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  const saved = window.BunnyAndroid.saveToDownloads(filename, btoa(text));
  if (saved === "unsupported") { await saveFile(filename, bytes); }
  else if (saved.startsWith("failed:")) { toast("Não foi possível salvar: " + saved.slice(7)); return; }
  const where = saved === "unsupported" ? "na pasta que você escolher" : `em ${saved.slice(6)}`;
  // O Bunny novo recebe o pacote direto; o que ainda não sabe disso só abre, e a importação é manual.
  const direct = saved !== "unsupported" && window.BunnyAndroid.canSendToBunny?.();
  const r = direct
    ? await ask({ title: "Pronto para o Bunny", text: `${filename} foi salvo ${where}. O Bunny vai abrir e perguntar se pode instalar e ativar o mod.`, ok: "Abrir o Bunny" })
    : await ask({ title: "Pronto para o Bunny", text: `${filename} foi salvo ${where}. Esta versão do Bunny ainda não recebe o mod direto: toque em Importar, escolha esse arquivo e ligue o mod na lista.`, ok: "Abrir o Bunny" });
  if (!r) return;
  const sent = direct ? window.BunnyAndroid.sendToBunny() : (window.BunnyAndroid.openBunny() ? "opened" : "none");
  if (sent === "none") toast("Não encontrei o Bunny neste aparelho. Abra-o manualmente e importe o arquivo.");
}
async function importFiles(list) {
  const added = [];
  for (const file of list) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (/\.(bl|bmod|zip)$/i.test(file.name)) {
      try {
        const imported = filesFromZip(await readZip(bytes));
        const manifest = (() => { try { return JSON.parse(imported["manifest.json"]); } catch { return {}; } })();
        const uid = manifest.uid || newUid();
        if (state.mods[uid]) {
          const r = await ask({ title: "Substituir este mod?", text: `"${manifest.name || uid}" já está aberto aqui com o mesmo UID. Importar troca os arquivos dele.`, ok: "Substituir", danger: true });
          if (!r) continue;
        }
        state.mods[uid] = { uid, updated: Date.now(), files: imported };
        await switchMod(uid);
        scheduleSave();
        toast(`${manifest.name || "Mod"} importado.`);
      } catch (error) { toast(error.message); }
    } else {
      // Um manifest.json importado é o do mod: fica na raiz, e só depois de conferir o JSON.
      if (file.name === "manifest.json") {
        const incoming = decoder.decode(bytes);
        try { JSON.parse(incoming); } catch (error) { toast("Esse manifest.json está inválido: " + error.message); continue; }
        const r = await ask({ title: "Substituir manifest.json?", text: "O manifest atual deste mod será trocado pelo arquivo escolhido.", ok: "Substituir", danger: true });
        if (!r) continue;
        files()["manifest.json"] = incoming;
        added.push("manifest.json");
        continue;
      }
      const folder = state.active ? state.active.split("/").slice(0, -1).join("/") : "";
      const target = (folder ? folder + "/" : "") + file.name;
      files()[target] = isText(file.name) ? decoder.decode(bytes) : bytes;
      added.push(target);
    }
  }
  if (added.length) { scheduleSave(); renderModCard(); renderTree(); openFile(added[0]); toast(`${plural(added.length, "arquivo adicionado", "arquivos adicionados")} em ${added[0].split("/").slice(0, -1).join("/")}.`); }
}

