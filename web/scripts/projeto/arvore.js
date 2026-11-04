// ---------- Árvore de arquivos ----------
const pngUrls = new WeakMap();
function pngUrl(bytes) {
  let url = pngUrls.get(bytes);
  if (!url) { url = URL.createObjectURL(new Blob([bytes], { type: "image/png" })); pngUrls.set(bytes, url); }
  return url;
}
const collapsed = new Set();
const COLLAPSE_ABOVE = 40;
function buildTree(paths) {
  const root = { dirs: new Map(), files: [], count: 0 };
  for (const path of paths) {
    const parts = path.split("/");
    let node = root;
    node.count++;
    parts.slice(0, -1).forEach((part) => {
      if (!node.dirs.has(part)) node.dirs.set(part, { dirs: new Map(), files: [], count: 0, name: part });
      node = node.dirs.get(part);
      node.count++;
    });
    node.files.push(path);
  }
  return root;
}
function renderTree() {
  const tree = $("tree");
  const all = Object.keys(files());
  const q = normWord($("fileSearch").value.trim());
  const paths = q ? all.filter((p) => normWord(p).includes(q)) : all;
  const csCount = all.filter((p) => p.endsWith(".cs")).length;
  $("fileCount").textContent = `${csCount} .cs`;
  const rows = [];
  const activeFolder = state.active?.includes("/") ? state.active.split("/").slice(0, -1).join("/") : "";
  const fileRow = (path, depth) => {
    const parts = path.split("/");
    const row = document.createElement("div");
    row.className = "row file" + (path === state.active ? " on" : "");
    row.style.setProperty("--d", depth);
    const folder = parts.slice(0, -1).join("/");
    if (folder && activeFolder && folder === activeFolder) row.classList.add("incurrent");
    const open = document.createElement("button");
    open.className = "open"; open.type = "button";
    const value = files()[path];
    if (typeof value !== "string" && /\.png$/i.test(path)) {
      const img = document.createElement("img");
      img.alt = ""; img.loading = "lazy"; img.src = pngUrl(value);
      open.append(img);
    } else {
      const icon = document.createElement("i");
      const ext = (/\.(\w+)$/.exec(path)?.[1] || "").toLowerCase();
      icon.className = "fileicon " + (ext === "cs" ? "cs" : ext === "json" ? "json" : ext === "hjson" ? "loc" : "");
      icon.textContent = ext === "cs" ? "C#" : ext === "json" ? "{}" : ext === "hjson" ? "Aa" : "·";
      icon.setAttribute("aria-hidden", "true");
      open.append(icon);
    }
    const name = document.createElement("span");
    name.textContent = parts[parts.length - 1];
    open.append(name);
    open.addEventListener("click", () => { closeDrawer(); if (/\.png$/i.test(path) && typeof value !== "string") { openTexture(path); return; } openFile(path); setView("code"); });
    row.append(open);
    onLongPress(open, () => fileMenu(path), row);
    if (path === "manifest.json") {
      row.classList.add("pinned");
      if (!manifestStatus(mod()).ok) name.style.color = "var(--life)";
      const pin = document.createElement("span");
      pin.className = "pin"; pin.textContent = "dados do mod";
      row.append(pin);
    }
    const more = document.createElement("button");
    more.className = "more"; more.type = "button"; more.innerHTML = icon("dots"); more.setAttribute("aria-label", "Opções de " + name.textContent);
    more.addEventListener("click", () => { haptic("tap"); fileMenu(path); });
    row.append(more);
    return row;
  };
  const walk = (node, prefix, depth) => {
    // Na raiz os arquivos vêm primeiro: o manifest.json nunca fica enterrado depois de centenas de itens.
    if (depth === 0) for (const path of node.files.sort((a, b) => (a === "manifest.json" ? -1 : b === "manifest.json" ? 1 : a.localeCompare(b)))) rows.push(fileRow(path, 0));
    for (const dir of [...node.dirs.values()].sort((a, b) => a.name.localeCompare(b.name))) {
      const key = prefix + dir.name + "/";
      // Mod grande abre recolhido, menos o caminho do arquivo aberto.
      if (all.length > COLLAPSE_ABOVE && !state.touchedDirs.has(key) && !state.active?.startsWith(key) && depth > 0) collapsed.add(key);
      const closed = !q && collapsed.has(key) && (state.touchedDirs.has(key) || !state.active?.startsWith(key));
      const row = document.createElement("div");
      row.className = "row dir"; row.style.setProperty("--d", depth);
      if (state.active?.startsWith(key)) row.classList.add("inpath");
      if (activeFolder + "/" === key) row.classList.add("current");
      row.setAttribute("aria-expanded", String(!closed));
      const btn = document.createElement("button");
      btn.type = "button";
      btn.innerHTML = `<span class="caret">${icon("caret")}</span><svg class="foldericon" viewBox="0 0 16 16" aria-hidden="true" shape-rendering="crispEdges"><path fill="currentColor" d="M1 3h6v2h8v9H1z"/></svg><span class="name">${esc(dir.name)}</span><span class="n">${dir.count}</span>`;
      btn.addEventListener("click", () => {
        state.touchedDirs.add(key);
        if (closed) collapsed.delete(key); else collapsed.add(key);
        renderTree();
      });
      onLongPress(btn, () => folderMenu(key), row);
      row.append(btn);
      rows.push(row);
      if (!closed) walk(dir, key, depth + 1);
    }
    if (depth > 0) for (const path of node.files.sort((a, b) => a.localeCompare(b))) rows.push(fileRow(path, depth));
  };
  walk(buildTree(paths), "", 0);
  if (!rows.length) { const p = document.createElement("p"); p.className = "empty"; p.textContent = "Nenhum arquivo com esse nome."; rows.push(p); }
  tree.replaceChildren(...rows);
}
