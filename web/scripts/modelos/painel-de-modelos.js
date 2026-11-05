// ---------- Painel de snippets ----------
let snipGroup = "Tudo";
const GROUP_ORDER = ["Tudo", "Itens", "Combate", "Equipamento", "Efeitos", "C#", "Trechos"];
function renderSnippets() {
  $("snipChips").replaceChildren(...GROUP_ORDER.map((g) => {
    const b = document.createElement("button");
    b.type = "button"; b.textContent = g; b.setAttribute("aria-pressed", String(g === snipGroup));
    b.addEventListener("click", () => { snipGroup = g; renderSnippets(); });
    return b;
  }));
  const q = normWord($("snipSearch").value.trim());
  const box = $("snips");
  box.replaceChildren();
  const groups = new Map();
  for (const s of ALL_SNIPPETS) {
    if (snipGroup !== "Tudo" && s.group !== snipGroup) continue;
    if (q && !normWord(`${s.title} ${s.desc} ${s.prefix} ${s.keys || ""} ${s.group}`).includes(q)) continue;
    if (!groups.has(s.group)) groups.set(s.group, []);
    groups.get(s.group).push(s);
  }
  for (const group of GROUP_ORDER) {
    const list = groups.get(group);
    if (!list) continue;
    if (snipGroup === "Tudo") {
      const h = document.createElement("h3");
      h.textContent = group;
      box.append(h);
    }
    for (const s of list) {
      const b = document.createElement("button");
      b.type = "button"; b.className = "card"; b.dataset.prefix = s.prefix;
      const word = (s.keys || s.prefix).split(" ")[0];
      b.innerHTML = `<b>${esc(s.title)}</b><code>${esc(word)}</code><small>${esc(s.desc)}</small>`;
      b.addEventListener("click", () => useSnippet(s));
      box.append(b);
    }
  }
  if (!groups.size) { const p = document.createElement("p"); p.className = "empty"; p.textContent = "Nenhum modelo com esse termo."; box.append(p); }
}
async function useSnippet(s) {
  if (!s.folder) {
    const isCode = typeof files()[state.active] === "string" && state.active.endsWith(".cs");
    if (!isCode) { toast("Abra um arquivo .cs para inserir este modelo."); return; }
    const where = { top: "fora de uma classe", member: "no corpo de uma classe", code: "dentro de um método" }[s.where || "code"];
    const here = editContext(src.value, src.selectionStart);
    const text = expandSnippet(s.body, { NS: projectNamespace(), CLASS: enclosingClass(src.value, src.selectionStart) }).text;
    const r = await ask({ title: s.title, text: here === (s.where || "code") ? s.desc : `${s.desc} Este modelo costuma ir ${where}; confira a posição do cursor.`, preview: text, ok: "Inserir no cursor" });
    if (!r) return;
    setView("code");
    smartInsert(s, src.selectionStart, src.selectionEnd);
    return;
  }
  const r = await ask({ title: s.title, text: s.desc, preview: expandSnippet(s.body, { NS: projectNamespace(s.folder), DIR: s.folder, 1: s.cls }).text, fields: [{ name: "cls", label: "Nome da classe", value: s.cls }], ok: "Criar arquivo" });
  if (!r) return;
  if (!/^[A-Za-z_]\w*$/.test(r.cls)) { toast("Use um nome de classe C# válido."); return; }
  const path = `${s.folder}/${r.cls}.cs`;
  if (files()[path] !== undefined) { toast("Já existe um arquivo com esse nome."); return; }
  createFromModel(s, path);
}
// A pasta e o nome vêm do caminho: o namespace acompanha a pasta, e a textura fica ao lado da classe.
function createFromModel(s, path) {
  const parts = path.split("/"), cls = parts.pop().replace(/\.cs$/, ""), dir = parts.join("/");
  const { text, stops } = expandSnippet(s.body, { NS: projectNamespace(dir), DIR: dir, 1: cls });
  files()[path] = text;
  // Sem o PNG o mod carrega com textura quebrada: entra um provisório, fácil de trocar.
  if (s.texture) {
    const png = `${dir ? dir + "/" : ""}${cls}.png`;
    if (files()[png] === undefined) files()[png] = b64ToBytes(STARTER_PNG);
  }
  if (s.loc) addTranslation(s.loc, cls);
  scheduleSave();
  openFile(path);
  setView("code");
  beginSession(0, stops.filter((x) => x.n !== "1"));
  toast(s.texture ? "Arquivo criado com textura provisória. Tab avança os campos." : "Arquivo criado. Tab avança os campos.");
}

