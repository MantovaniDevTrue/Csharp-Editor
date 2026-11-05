// ---------- Lista de escolhas dentro de um diálogo ----------
// Grupos em abas e uma linha por opção, como em "Novo arquivo" e "Nova textura".
function pickerRow(item, active, onPick) {
  const b = document.createElement("button");
  b.type = "button"; b.className = "pickrow"; b.setAttribute("aria-pressed", String(item === active));
  b.dataset.kind = item.id;
  b.innerHTML = `<span class="pickicon">${icon(item.icon || "texture")}</span><span class="picktext"><b>${esc(item.title)}</b><small>${esc(item.desc || "")}</small></span>`;
  b.addEventListener("click", () => { haptic("tap"); onPick(item); });
  return b;
}
function mountPicker(form, groups, initial, onPick) {
  const box = document.createElement("div");
  box.className = "picker";
  const tabs = document.createElement("div");
  tabs.className = "picktabs"; tabs.setAttribute("role", "group"); tabs.setAttribute("aria-label", "Categoria");
  const list = document.createElement("div");
  list.className = "picklist";
  let group = groups.find((g) => g.items.includes(initial)) || groups[0];
  let active = initial;
  const draw = () => {
    tabs.hidden = groups.length < 2;
    tabs.replaceChildren(...groups.map((g) => {
      const b = document.createElement("button");
      b.type = "button"; b.textContent = g.name; b.setAttribute("aria-pressed", String(g === group));
      b.addEventListener("click", () => { group = g; draw(); });
      return b;
    }));
    list.replaceChildren(...group.items.map((item) => pickerRow(item, active, (next) => { active = next; onPick(next); draw(); })));
    list.scrollTop = 0;
    tabs.querySelector('[aria-pressed="true"]')?.scrollIntoView({ inline: "nearest", block: "nearest" });
  };
  draw();
  box.append(tabs, list);
  form.querySelector("label")?.before(box);
  return { clear() { active = null; draw(); } };
}
// Selecionar só o nome facilita trocar o que importa sem apagar a pasta.
function selectStem(input) {
  const value = input.value, slash = value.lastIndexOf("/") + 1, dot = value.lastIndexOf(".");
  input.setSelectionRange(slash, dot > slash ? dot : value.length);
}
function selectStemOnTap(input) {
  input.addEventListener("click", () => { if (!input.dataset.tapped) { input.dataset.tapped = "1"; selectStem(input); } });
}
function mountNote(form) {
  const note = document.createElement("p");
  note.className = "picknote"; note.id = "pickNote";
  form.querySelector(".acts").before(note);
  return note;
}
