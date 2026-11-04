// ---------- Barra lateral ----------
function openDrawer() {
  $("drawerTitle").textContent = manifestOf(mod()).name || "Arquivos";
  $("drawerBody").append($("explorer"));
  $("drawerScrim").hidden = false;
  $("drawer").classList.add("open");
  $("drawer").setAttribute("aria-hidden", "false");
  haptic("tap");
  renderTree();
  requestAnimationFrame(() => document.querySelector("#tree .row.file.on")?.scrollIntoView({ block: "center" }));
}
function closeDrawer() {
  if (!$("drawer").classList.contains("open")) return false;
  $("drawer").classList.remove("open");
  $("drawer").setAttribute("aria-hidden", "true");
  $("drawerScrim").hidden = true;
  // Volta para a aba Projeto, que mostra a mesma árvore.
  $("filesPane").append($("explorer"));
  return true;
}
function renderModCard() {
  const showBridge = !!window.BunnyAndroid?.bridgeStatus;
  $("saveFolder").hidden = !showBridge; $("openFolder").hidden = !showBridge;
  $("fontBtn").hidden = packTypeOf(files()) !== "font";
  const m = manifestOf(mod());
  const status = manifestStatus(mod());
  $("modName").textContent = m.name || "Mod sem nome";
  const iconBytes = files()["icon.png"];
  $("modIcon").hidden = !iconBytes;
  if (iconBytes) $("modIcon").src = pngUrl(iconBytes);
  $("modMeta").textContent = `${m.id || "sem id"} · v${m.version || "?"}`;
  $("modSummary").textContent = m.summary || "";
  $("modSelectName").textContent = m.name || "Mod sem nome";
  const alert = $("modAlert");
  alert.hidden = status.ok;
  if (status.ok) { alert.replaceChildren(); return; }
  alert.innerHTML = `<b>${status.missing ? "manifest.json sumiu" : "manifest.json com problema"}</b>${esc(status.error)}<div class="acts"><button class="btn small" id="fixManifest">${mod().lastManifest ? "Restaurar última versão boa" : "Recriar manifest.json"}</button>${status.missing ? "" : '<button class="btn small" id="openManifest">Abrir e corrigir</button>'}</div>`;
  $("fixManifest").addEventListener("click", () => {
    if (!manifestStatus(mod()).ok && mod().lastManifest) mod().files["manifest.json"] = mod().lastManifest;
    repairManifest();
    scheduleSave(); renderModCard(); renderTree();
    if (state.active === "manifest.json") { src.value = files()["manifest.json"]; render(); }
    toast("manifest.json restaurado.");
    haptic("confirm");
  });
  $("openManifest")?.addEventListener("click", () => { openFile("manifest.json"); setView("code"); });
}
async function editModData() {
  repairManifest();
  const m = manifestOf(mod());
  const author = m.authors?.[0]?.name || "";
  let icon = null;
  const r = await ask({ title: "Dados do mod", text: "Grava no manifest.json. O UID não muda, para o Bunny reconhecer as atualizações.", decorate: (form) => { icon = iconRow(form, files()["icon.png"] || null); }, fields: [
    { name: "name", label: "Nome", value: m.name || "" },
    { name: "version", label: "Versão", value: m.version || "0.1.0" },
    { name: "author", label: "Autor", value: author },
    { name: "summary", label: "Descrição", value: m.summary || "" },
  ], ok: "Salvar" });
  if (!r) return;
  if (!r.name || r.name.length > 100) { toast("Dê um nome de até 100 caracteres."); return; }
  m.name = r.name; m.version = r.version || m.version; m.summary = r.summary;
  m.authors = [{ ...(m.authors?.[0] || { role: "Autor" }), name: r.author || author }, ...(m.authors || []).slice(1)];
  files()["manifest.json"] = JSON.stringify(m, null, 2) + "\n";
  if (state.active === "manifest.json") { src.value = files()["manifest.json"]; render(); }
  scheduleSave(); renderModCard(); renderModSelect();
  await applyIcon(icon);
  renderModCard();
}

// Diálogos próprios: o visualizador não exibe prompt() nem confirm().
function ask({ title, text, fields = [], ok = "Confirmar", danger, extra, preview, decorate }) {
  return new Promise((resolve) => {
    const dlg = $("dlg"), form = $("dlgForm");
    form.innerHTML = `<h2>${esc(title)}</h2>${text ? `<p>${esc(text)}</p>` : ""}` +
      (preview ? `<pre class="preview">${esc(preview)}</pre>` : "") +
      fields.map((f) => `<label>${esc(f.label)}<input id="fld_${f.name}" name="${f.name}" value="${esc(f.value ?? "")}" autocapitalize="off" autocomplete="off" spellcheck="false"></label>`).join("") +
      `<div class="acts">${extra ? `<button class="btn" value="extra" type="submit" id="dlgExtra" style="margin-right:auto">${esc(extra)}</button>` : ""}<button class="btn" value="cancel" type="submit">Cancelar</button><button class="btn primary" value="ok" type="submit" id="dlgOk">${esc(ok)}</button></div>`;
    if (danger) $("dlgOk").style.cssText = "background:var(--life);border-color:var(--life);color:var(--bg)";
    dlg.addEventListener("close", function done() {
      if (dlg.open) return; // aviso atrasado do diálogo anterior
      dlg.removeEventListener("close", done);
      if (dlg.returnValue === "extra") { resolve({ extra: true }); return; }
      if (dlg.returnValue !== "ok") { resolve(null); return; }
      const out = {};
      for (const f of fields) out[f.name] = $("fld_" + f.name).value.trim();
      resolve(out);
    });
    decorate?.(form);
    dlg.returnValue = "cancel";
    dlg.showModal();
    const first = fields.length && $("fld_" + fields[0].name);
    if (first) { first.focus(); first.select(); }
  });
}
function cleanPath(path) {
  const clean = path.trim().replace(/\\/g, "/").replace(/^\/+/, "");
  if (!clean || clean.split("/").some((p) => !p || p === "." || p === "..")) return null;
  return clean;
}
async function newFile(suggested = "Content/Items/NovoItem.cs") {
  const r = await ask({ title: "Novo arquivo", text: "Caminho dentro do mod. Itens e texturas costumam ficar em Content/, e sistemas em Common/.", fields: [{ name: "path", label: "Caminho", value: suggested }], ok: "Criar" });
  // O arquivo começa vazio: digitar "espada" ou "asas" já traz a classe inteira.
  if (!r) return;
  const path = cleanPath(r.path);
  if (!path) { toast("Caminho inválido."); return; }
  if (files()[path] !== undefined) { toast("Esse arquivo já existe."); return; }
  files()[path] = "";
  scheduleSave(); openFile(path); setView("code");
}
async function renameFile(path) {
  if (path === "manifest.json") { toast("O manifest.json precisa manter esse nome para o Bunny encontrá-lo."); return; }
  const r = await ask({ title: "Renomear", fields: [{ name: "path", label: "Novo caminho", value: path }], ok: "Renomear" });
  if (!r) return;
  const next = cleanPath(r.path);
  if (!next || next === path) return;
  if (files()[next] !== undefined) { toast("Esse arquivo já existe."); return; }
  files()[next] = files()[path]; delete files()[path];
  scheduleSave(); openFile(state.active === path ? next : state.active);
}
async function deleteFile(path) {
  if (path === "manifest.json") { toast("O manifest.json não pode ser apagado: sem ele o Bunny recusa o mod."); return; }
  const r = await ask({ title: "Apagar arquivo?", text: path, ok: "Apagar", danger: true });
  if (!r) return;
  delete files()[path];
  scheduleSave();
  if (state.active === path) openFile(Object.keys(files()).find((p) => p.endsWith(".cs")) || "manifest.json");
  else renderTree();
}

