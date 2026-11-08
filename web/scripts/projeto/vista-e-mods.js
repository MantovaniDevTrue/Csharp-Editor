// ---------- Vista e mods ----------
const VIEW_ORDER = ["files", "code", "snips", "out"];
function setView(view) {
  // A tela nova entra pelo lado para onde a pessoa está indo.
  document.documentElement.style.setProperty("--from", (VIEW_ORDER.indexOf(view) >= VIEW_ORDER.indexOf(state.view) ? 14 : -14) + "px");
  state.view = view;
  document.body.dataset.view = view;
  document.querySelectorAll(".tabs button").forEach((b) => { if (b.dataset.view === view) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current"); });
  if (view === "code" && state.uid && typeof files()[state.active] === "string") requestAnimationFrame(() => { measure(); syncScroll(); });
}
function renderModSelect() { if (state.uid) $("modSelectName").textContent = manifestOf(mod()).name || "Mod sem nome"; }
const modOrder = () => Object.values(state.mods).sort((a, b) => (a.order ?? -a.updated) - (b.order ?? -b.updated));
function reorderMod(uid, delta) {
  const list = modOrder();
  const i = list.findIndex((m) => m.uid === uid), j = i + delta;
  if (j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
  list.forEach((m, k) => { m.order = k; store.put(m); });
  haptic("tap");
  renderModsWindow();
}
function renderModsWindow() {
  const box = $("modsBody");
  const list = modOrder();
  const head = document.createElement("div");
  head.className = "sheethead";
  head.innerHTML = `<h2>Meus mods<small>${plural(list.length, "mod", "mods")} neste aparelho</small></h2><button class="closex" aria-label="Fechar" id="modsClose">✕</button>`;
  const rows = document.createElement("div");
  rows.className = "modlist";
  list.forEach((m, i) => {
    const info = manifestOf(m), status = manifestStatus(m);
    const csFiles = Object.keys(m.files).filter((p) => p.endsWith(langOf(m.files) === "js" ? ".js" : ".cs")).length;
    const row = document.createElement("div");
    row.className = "modrow" + (m.uid === state.uid ? " on" : "");
    row.style.animationDelay = Math.min(i, 10) * 18 + "ms";
    const main = document.createElement("button");
    main.type = "button"; main.className = "main";
    main.innerHTML = `<b>${esc(info.name || "Mod sem nome")}</b><small class="${status.ok ? "" : "bad"}">${esc(status.ok ? `${info.id} · v${info.version} · ${csFiles} ${langOf(m.files) === "js" ? ".js" : ".cs"}` : status.missing ? "sem manifest.json: abra para recriar" : "manifest.json com problema")}</small>`;
    main.addEventListener("click", async () => { $("mods").close(); if (m.uid !== state.uid) { await switchMod(m.uid); setView("files"); } haptic("tap"); });
    onLongPress(main, () => modMenu(m), row);
    const control = (label, text, className, action, disabled) => {
      const b = document.createElement("button");
      b.type = "button"; b.className = "ctl " + className; b.innerHTML = icon(text); b.setAttribute("aria-label", `${label} ${info.name || ""}`); b.disabled = !!disabled;
      b.addEventListener("click", action);
      return b;
    };
    row.append(main,
      control("Subir", "up", "", () => reorderMod(m.uid, -1), i === 0),
      control("Descer", "down", "", () => reorderMod(m.uid, 1), i === list.length - 1),
      control("Mais opções para", "dots", "", () => modMenu(m)),
      control("Apagar", "close", "x", () => deleteMod(m)));
    rows.append(row);
  });
  const foot = document.createElement("div");
  foot.className = "modfoot";
  foot.innerHTML = '<button class="btn" id="modsNew">+ Novo mod</button><button class="btn" id="modsImport">Importar .bl</button>';
  const top = rows.scrollTop;
  box.replaceChildren(head, rows, foot);
  rows.scrollTop = top;
  $("modsClose").addEventListener("click", () => $("mods").close());
  $("modsNew").addEventListener("click", () => { $("mods").close(); newMod(); });
  $("modsImport").addEventListener("click", () => { $("mods").close(); $("importInput").click(); });
}
function openModsWindow() { renderModsWindow(); $("mods").showModal(); }
async function deleteMod(m) {
  const info = manifestOf(m);
  const r = await ask({ title: "Apagar este mod?", text: `"${info.name || m.uid}" e todos os arquivos dele saem deste aparelho. Exporte o .bl antes se quiser guardar.`, ok: "Apagar", danger: true });
  if (!r) return;
  delete state.mods[m.uid];
  await store.remove(m.uid);
  if (m.uid === state.uid) {
    if (!Object.keys(state.mods).length) { const fresh = starterMod(); state.mods[fresh.uid] = fresh; store.put(fresh); }
    await switchMod(modOrder()[0].uid);
  }
  haptic("confirm");
  if ($("mods").open) renderModsWindow();
  toast("Mod apagado.");
}
async function duplicateMod(m) {
  const copy = { uid: newUid(), updated: Date.now(), files: {}, lastManifest: null };
  for (const [path, value] of Object.entries(m.files)) copy.files[path] = typeof value === "string" ? value : value.slice();
  repairManifest(copy.uid === m.uid ? m : Object.assign(copy, {}));
  const info = { ...manifestOf(m), uid: copy.uid };
  info.name = `${info.name || "Mod"} (cópia)`;
  info.id = `${(info.id || "mod").slice(0, 42)}_copia`;
  copy.files["manifest.json"] = JSON.stringify(info, null, 2) + "\n";
  copy.lastManifest = copy.files["manifest.json"];
  state.mods[copy.uid] = copy;
  await store.put(copy);
  if ($("mods").open) renderModsWindow();
  toast("Mod duplicado.");
}
function modMenu(m) {
  const info = manifestOf(m);
  openSheet({ title: info.name || "Mod sem nome", subtitle: info.id || "", items: [
    { glyph: "▶", label: "Abrir", action: async () => { $("mods").open && $("mods").close(); await switchMod(m.uid); setView("files"); } },
    { glyph: "✎", label: "Editar dados", action: async () => { if (m.uid !== state.uid) await switchMod(m.uid); await editModData(); if ($("mods").open) renderModsWindow(); } },
    { glyph: "⧉", label: "Duplicar", action: () => duplicateMod(m) },
    { glyph: "⇪", label: "Exportar .bl", action: async () => { if (m.uid !== state.uid) await switchMod(m.uid); await exportMod(); } },
    { glyph: "✕", label: "Apagar mod", danger: true, action: () => deleteMod(m) },
  ] });
}
// Folha de opções que sobe da base, igual em arquivos, pastas e mods.
function openSheet({ title, subtitle, items }) {
  const dlg = $("sheet"), box = $("sheetBody");
  const head = document.createElement("div");
  head.className = "sheethead";
  const h = document.createElement("h2");
  h.textContent = title;
  if (subtitle) { const small = document.createElement("small"); small.textContent = subtitle; h.append(small); }
  const close = document.createElement("button");
  close.className = "closex"; close.type = "button"; close.innerHTML = icon("close"); close.setAttribute("aria-label", "Fechar");
  close.addEventListener("click", () => dlg.close());
  head.append(h, close);
  box.replaceChildren(head, ...items.map((item) => {
    const b = document.createElement("button");
    b.type = "button"; b.className = "sheetitem" + (item.danger ? " danger" : "");
    b.innerHTML = `<span class="g">${sheetGlyph(item.glyph)}</span><span>${esc(item.label)}</span>`;
    b.addEventListener("click", () => { dlg.close(); haptic("tap"); item.action(); });
    return b;
  }));
  dlg.showModal();
}
// Segurar: vibra e abre o menu. Rolar a lista cancela; o clique seguinte não abre o item.
function onLongPress(el, action, marker = el) {
  let timer = 0, startX = 0, startY = 0, fired = false;
  const cancel = () => { clearTimeout(timer); marker.classList.remove("pressing"); };
  el.addEventListener("pointerdown", (e) => {
    if (e.button) return;
    fired = false; startX = e.clientX; startY = e.clientY;
    timer = setTimeout(() => { fired = true; marker.classList.remove("pressing"); haptic("long"); action(); }, 430);
    marker.classList.add("pressing");
  });
  el.addEventListener("pointermove", (e) => { if (Math.abs(e.clientX - startX) > 9 || Math.abs(e.clientY - startY) > 9) cancel(); });
  for (const type of ["pointerup", "pointercancel", "pointerleave"]) el.addEventListener(type, cancel);
  el.addEventListener("click", (e) => { if (fired) { e.preventDefault(); e.stopImmediatePropagation(); fired = false; } }, true);
  el.addEventListener("contextmenu", (e) => { e.preventDefault(); e.stopPropagation(); if (!fired) { cancel(); fired = true; action(); setTimeout(() => { fired = false; }, 400); } });
}
function fileMenu(path) {
  const isManifest = path === "manifest.json";
  const items = [{ glyph: "▶", label: "Abrir", action: () => { openFile(path); setView("code"); } }];
  if (/\.png$/i.test(path)) items.unshift({ glyph: "✎", label: "Editar textura", action: () => openTexture(path) });
  if (isManifest) items.push({ glyph: "✎", label: "Editar dados do mod", action: editModData });
  else {
    items.push({ glyph: "✎", label: "Renomear", action: () => renameFile(path) });
    items.push({ glyph: "⧉", label: "Duplicar", action: () => duplicateFile(path) });
    items.push({ glyph: "⇥", label: "Mover para outra pasta", action: () => moveFile(path) });
  }
  items.push({ glyph: "⎘", label: "Copiar caminho", action: () => copyText(path.replace(/^content\//, "")) });
  if (!isManifest) items.push({ glyph: "✕", label: "Apagar", danger: true, action: () => deleteFile(path) });
  openSheet({ title: path.split("/").pop(), subtitle: path, items });
}
function folderMenu(prefix) {
  const count = Object.keys(files()).filter((p) => p.startsWith(prefix)).length;
  openSheet({ title: prefix.slice(0, -1).split("/").pop() + "/", subtitle: `${prefix} · ${plural(count, "arquivo", "arquivos")}`, items: [
    { glyph: "+", label: "Novo arquivo aqui", action: () => newFile(prefix + "NovoArquivo.cs") },
    { glyph: "✎", label: "Renomear pasta", action: () => renameFolder(prefix) },
    { glyph: "⎘", label: "Copiar caminho", action: () => copyText(prefix.replace(/^content\//, "")) },
    { glyph: "✕", label: "Apagar pasta", danger: true, action: () => deleteFolder(prefix) },
  ] });
}
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); toast("Caminho copiado."); }
  catch { toast(text); }
}
function uniquePath(path) {
  if (files()[path] === undefined) return path;
  const dot = path.lastIndexOf(".");
  const stem = dot > path.lastIndexOf("/") ? path.slice(0, dot) : path, ext = dot > path.lastIndexOf("/") ? path.slice(dot) : "";
  for (let i = 2; ; i++) if (files()[`${stem}${i}${ext}`] === undefined) return `${stem}${i}${ext}`;
}
function duplicateFile(path) {
  const value = files()[path];
  const target = uniquePath(path);
  const name = (p) => p.split("/").pop().replace(/\.cs$/, "");
  files()[target] = typeof value === "string"
    ? (path.endsWith(".cs") ? value.replace(new RegExp(`\\bclass\\s+${name(path)}\\b`), `class ${name(target)}`) : value)
    : value.slice();
  scheduleSave(); openFile(target); setView("code");
  toast("Arquivo duplicado.");
}
async function moveFile(path) {
  const folder = path.split("/").slice(0, -1).join("/");
  const r = await ask({ title: "Mover arquivo", text: path.split("/").pop(), fields: [{ name: "folder", label: "Pasta de destino", value: folder }], ok: "Mover" });
  if (!r) return;
  const dir = cleanPath(r.folder || "x") && r.folder.trim().replace(/^\/+|\/+$/g, "");
  if (!dir) { toast("Pasta inválida."); return; }
  const target = `${dir}/${path.split("/").pop()}`;
  if (target === path) return;
  if (files()[target] !== undefined) { toast("Já existe um arquivo com esse nome lá."); return; }
  files()[target] = files()[path]; delete files()[path];
  scheduleSave();
  if (state.active === path) openFile(target); else renderTree();
  toast("Arquivo movido.");
}
async function renameFolder(prefix) {
  const r = await ask({ title: "Renomear pasta", fields: [{ name: "path", label: "Novo caminho", value: prefix.slice(0, -1) }], ok: "Renomear" });
  if (!r) return;
  const next = cleanPath(r.path);
  if (!next || next + "/" === prefix) return;
  const moves = Object.keys(files()).filter((p) => p.startsWith(prefix));
  if (moves.some((p) => files()[next + "/" + p.slice(prefix.length)] !== undefined)) { toast("Essa pasta já tem arquivos com os mesmos nomes."); return; }
  for (const p of moves) { files()[next + "/" + p.slice(prefix.length)] = files()[p]; delete files()[p]; }
  state.open = state.open.map((p) => (p.startsWith(prefix) ? next + "/" + p.slice(prefix.length) : p));
  scheduleSave();
  if (state.active?.startsWith(prefix)) openFile(next + "/" + state.active.slice(prefix.length)); else renderTree();
}
async function deleteFolder(prefix) {
  const moves = Object.keys(files()).filter((p) => p.startsWith(prefix));
  const r = await ask({ title: "Apagar pasta?", text: `${prefix} tem ${plural(moves.length, "arquivo", "arquivos")}, que serão apagados.`, ok: "Apagar", danger: true });
  if (!r) return;
  for (const p of moves) delete files()[p];
  scheduleSave();
  if (state.active?.startsWith(prefix)) openFile(Object.keys(files()).find((p) => p.endsWith(".cs")) || "manifest.json"); else renderTree();
}
