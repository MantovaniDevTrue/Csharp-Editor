// ---------- Novo arquivo ----------
const EMPTY_CLASS = { title: "Classe C#", body: `using Terraria;
using Terraria.ModLoader;

namespace «NS»;

public class «1:MinhaClasse»
{
    «0»
}
` };
const MODEL_ICONS = { Itens: "edit", Combate: "send", Mundo: "grid", Sistemas: "size" };
const EMPTY_JS_CLASS = { title: "Classe", body: `export class «1:MinhaClasse» {
    «0»
}
` };
function jsFileKinds() {
  const groups = new Map();
  for (const s of JS_FILE_SNIPPETS) {
    if (!groups.has(s.group)) groups.set(s.group, []);
    groups.get(s.group).push({ id: s.prefix, title: s.title, desc: s.desc, icon: MODEL_ICONS[s.group] || "edit", model: s, folder: s.folder, name: s.cls + ".js" });
  }
  const others = [
    { id: "class", title: "Classe JavaScript", desc: "Uma classe vazia, para organizar o seu código. Use export para importar em outro arquivo.", icon: "path", model: EMPTY_JS_CLASS, folder: "content/Common", name: "MinhaClasse.js" },
    { id: "texture", title: "Textura", desc: "Abre o editor de texturas.", icon: "texture", action: "texture" },
    { id: "lang", title: "Tradução", desc: "Nomes e descrições que aparecem no jogo.", icon: "fonte", folder: "content/Localization", name: "pt-BR.json", locked: true },
    { id: "blank", title: "Arquivo em branco", desc: "Qualquer tipo. Em um .js vazio, digite espada ou npc para a classe aparecer.", icon: "copy", folder: "content/Content", name: "NovoArquivo.js" },
  ];
  return [...groups].map(([name, items]) => ({ name, items })).concat({ name: "Outros", items: others });
}
function fileKinds() {
  if (isJsProject()) return jsFileKinds();
  const pack = packTypeOf(files());
  const blank = { id: "blank", title: "Arquivo em branco", desc: "Qualquer tipo. Em um .cs vazio, digite espada ou asas para a classe aparecer.", icon: "copy", folder: "", name: "NovoArquivo.cs" };
  const texture = { id: "texture", title: "Textura", desc: "Abre o editor de texturas.", icon: "texture", action: "texture" };
  if (pack) return [{ name: "Arquivos", items: [texture, blank] }];
  const fromModels = new Map();
  for (const s of FILE_SNIPPETS) {
    if (!s.folder) continue;
    if (!fromModels.has(s.group)) fromModels.set(s.group, []);
    fromModels.get(s.group).push({ id: s.prefix, title: s.title, desc: s.desc, icon: MODEL_ICONS[s.group] || "edit", model: s, folder: s.folder, name: s.cls + ".cs" });
  }
  const others = [
    { id: "class", title: "Classe C#", desc: "Uma classe vazia, para organizar o seu código.", icon: "path", model: EMPTY_CLASS, folder: "Common", name: "MinhaClasse.cs" },
    texture,
    { id: "lang", title: "Tradução", desc: "Nomes e descrições que aparecem no jogo.", icon: "fonte", folder: "Localization", name: `pt-BR_Mods.${projectId()}.hjson`, locked: true },
    blank,
  ];
  return [...fromModels].map(([name, items]) => ({ name, items })).concat({ name: "Outros", items: others });
}
async function newFile(suggested) {
  const groups = fileKinds();
  const all = groups.flatMap((g) => g.items);
  const here = suggested ? suggested.split("/").slice(0, -1).join("/") : null; // pasta escolhida na árvore
  const pathOf = (kind) => { const dir = here !== null && !kind.locked ? here : kind.folder; return (dir ? dir + "/" : "") + kind.name; };
  let kind = suggested ? all.find((k) => k.id === "blank") : all.find((k) => k.name);
  let goTexture = false, input, note;
  const describe = () => {
    const value = cleanPath(input.value) || "";
    const png = value.replace(/\.(cs|js)$/, ".png");
    note.textContent = kind?.model?.texture ? `Também cria ${png}, uma textura provisória para você desenhar.` : kind?.model ? "Só o arquivo de código." : "";
    note.hidden = !note.textContent;
  };
  const r = await ask({
    title: "Novo arquivo",
    text: "O que você quer criar? O caminho se ajusta sozinho, e você pode mudar a pasta e o nome.",
    focus: false,
    fields: [{ name: "path", label: "Caminho", value: pathOf(kind) }],
    ok: "Criar",
    decorate: (form) => {
      input = form.querySelector("#fld_path");
      note = mountNote(form);
      mountPicker(form, groups, kind, (next) => {
        if (next.action === "texture") { goTexture = true; $("dlg").close("cancel"); return; }
        kind = next; input.value = pathOf(next); delete input.dataset.tapped; describe();
      });
      input.addEventListener("input", describe);
      selectStemOnTap(input);
      describe();
    },
  });
  if (goTexture) { await newTexture(); return; }
  if (!r) return;
  let path = cleanPath(r.path);
  if (!path) { toast("Caminho inválido."); return; }
  const ext = isJsProject() ? ".js" : ".cs";
  if (kind?.model && !path.endsWith(ext)) path += ext;
  if (files()[path] !== undefined) { if (kind?.locked) { openFile(path); setView("code"); } else toast("Esse arquivo já existe."); return; }
  if (kind?.model) {
    const cls = path.split("/").pop().replace(/\.(cs|js)$/, "");
    if (!/^[A-Za-z_]\w*$/.test(cls)) { toast("O nome vira o nome da classe: use letras, números ou _, sem espaços."); return; }
    createFromModel(kind.model, path);
    return;
  }
  // O arquivo começa vazio: digitar "espada" ou "asas" já traz a classe inteira.
  files()[path] = "";
  scheduleSave(); openFile(path); setView("code");
}
