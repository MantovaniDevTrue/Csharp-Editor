// ---------- Nova textura ----------
// Mod em C#: a textura acompanha uma classe nova. Pacote de texturas: troca o que já existe no jogo.
const MOD_TEXTURES = {
  ModItem: { label: "Item", w: 32, h: 32, folder: "Content/Items", name: "MeuItem", desc: "Arma, ferramenta, acessório ou material." },
  ModNPC: { label: "NPC", w: 40, h: 40, folder: "Content/NPCs", name: "MeuInimigo", desc: "Inimigo ou personagem. Os quadros ficam um embaixo do outro." },
  ModProjectile: { label: "Projétil", w: 16, h: 16, folder: "Content/Projectiles", name: "MeuProjetil", desc: "Flecha, magia ou tiro." },
  ModBuff: { label: "Buff", w: 32, h: 32, folder: "Content/Buffs", name: "MeuBuff", desc: "O ícone do efeito." },
  ModTile: { label: "Bloco", w: 288, h: 270, folder: "Content/Tiles", name: "MeuBloco", desc: "Folha com as variações do bloco." },
  ModWall: { label: "Parede", w: 468, h: 180, folder: "Content/Walls", name: "MinhaParede", desc: "Folha com as variações da parede." },
};
const GAME_TEXTURES = [
  { id: "Item", title: "Item do jogo", desc: "Item_1 é a Picareta de Cobre.", w: 32, h: 32, path: "Images/Item_1.png" },
  { id: "NPC", title: "NPC ou chefe", desc: "NPC_4 é o Olho de Cthulhu.", w: 110, h: 166, path: "Images/NPC_4.png" },
  { id: "Projectile", title: "Projétil", desc: "Projectile_1 é a Flecha de Madeira.", w: 14, h: 32, path: "Images/Projectile_1.png" },
  { id: "Tiles", title: "Bloco", desc: "Tiles_0 é a terra.", w: 288, h: 270, path: "Images/Tiles_0.png" },
  { id: "Wall", title: "Parede", desc: "Wall_1 é a Parede de Pedra.", w: 468, h: 180, path: "Images/Wall_1.png" },
  { id: "Buff", title: "Buff", desc: "Buff_1 é a Pele de Obsidiana.", w: 32, h: 32, path: "Images/Buff_1.png" },
  { id: "Armor", title: "Armadura", desc: "Armor_Head_1, Armor_Body_1 e Armor_Legs_1.", w: 40, h: 1120, path: "Images/Armor_Head_1.png" },
  { id: "Other", title: "Outra imagem", desc: "O caminho precisa ser igual ao do jogo.", w: 32, h: 32, path: "Images/UI/MinhaImagem.png" },
];
// O caminho que o Bunny procura: o namespace sem o id do mod, mais o nome da classe.
function textureOfClass(c) {
  if (c.ns) return c.ns.split(".").slice(1).concat(c.name).join("/") + ".png";
  return c.path.replace(/\.cs$/, ".png");
}
function declaredSize(c) {
  const text = files()[c.path];
  const read = (prop) => Number((new RegExp(`\\b(?:Item|NPC|Projectile)\\.${prop}\\s*=\\s*(\\d+)\\s*;`).exec(typeof text === "string" ? text : "") || [])[1]) || 0;
  return { w: read("width"), h: read("height") };
}
function classesWithoutTexture() {
  const classes = projectIndex();
  return [...classes.values()].flatMap((c) => {
    const base = rootBase(c, classes), kind = MOD_TEXTURES[base];
    if (!kind || c.abstract || c.members.includes("Texture")) return [];
    const path = textureOfClass(c);
    if (files()[path] !== undefined) return [];
    const size = declaredSize(c);
    return [{ id: "missing-" + c.name, title: c.name, desc: `${kind.label} do seu mod, ainda sem imagem.`, icon: "edit", path, w: size.w || kind.w, h: size.h || kind.h }];
  });
}
function textureChoices(pack) {
  if (pack === "font") return [{ name: "Fonte", items: [{ id: "sheet", title: "Folha da fonte", desc: "Imagem usada pelo .json da fonte.", path: "Fonts/NovaFolha.png", w: 256, h: 256 }] }];
  if (pack === "texture") return [{ name: "Trocar no jogo", items: GAME_TEXTURES }];
  const missing = classesWithoutTexture();
  const fresh = Object.entries(MOD_TEXTURES).map(([base, k]) => ({ id: base, title: k.label + " novo", desc: k.desc, path: `${k.folder}/${k.name}.png`, w: k.w, h: k.h }));
  const extras = [{ id: "loose", title: "Imagem solta", desc: "Para usar pelo caminho no código.", path: "Assets/MinhaImagem.png", w: 32, h: 32 }];
  if (files()["icon.png"] === undefined) extras.unshift({ id: "icon", title: "Ícone do mod", desc: "Aparece na lista de mods do Bunny.", path: "icon.png", w: 80, h: 80 });
  return [missing.length && { name: `Sem textura (${missing.length})`, items: missing }, { name: "Conteúdo novo", items: fresh }, { name: "Outras", items: extras }].filter(Boolean);
}
const TEXTURE_TEXT = {
  texture: "Este projeto é um pacote de texturas: ele só troca imagens que já existem no jogo. Para um item novo, com textura própria, use um mod em C#.",
  font: "Este projeto é um pacote de fontes. Em um mod em C#, as texturas podem ser de itens e NPCs novos.",
  code: "Para que é a textura? Ela precisa ter o mesmo nome e a mesma pasta da classe: é assim que o jogo a encontra.",
};
async function newTexture(suggested, size) {
  const pack = packTypeOf(files());
  const groups = textureChoices(pack);
  const all = groups.flatMap((g) => g.items);
  let kind = suggested ? all.find((k) => k.path === suggested) || null : all[0];
  const first = kind || { path: suggested, w: 32, h: 32 };
  let input, note;
  const describe = () => {
    const stem = (cleanPath(input.value) || "").split("/").pop().replace(/\.png$/i, "");
    note.textContent = pack ? "" : kind?.id?.startsWith("missing-") ? `É a imagem que a classe ${stem} procura.` : kind && MOD_TEXTURES[kind.id] ? `A classe precisa se chamar ${stem} e ficar nesta mesma pasta.` : "";
    note.hidden = !note.textContent;
  };
  const r = await ask({
    title: "Nova textura",
    text: TEXTURE_TEXT[pack] || TEXTURE_TEXT.code,
    focus: false,
    fields: [{ name: "path", label: "Caminho", value: first.path }, { name: "w", label: "Largura", value: String(size?.w || first.w) }, { name: "h", label: "Altura", value: String(size?.h || first.h) }],
    ok: "Criar",
    extra: pack === "texture" ? "Mod em C#" : undefined,
    decorate: (form) => {
      input = form.querySelector("#fld_path");
      note = mountNote(form);
      mountPicker(form, groups, kind, (next) => {
        kind = next; input.value = next.path; delete input.dataset.tapped;
        form.querySelector("#fld_w").value = next.w; form.querySelector("#fld_h").value = next.h;
        describe();
      });
      input.addEventListener("input", describe);
      selectStemOnTap(input);
      describe();
    },
  });
  if (!r) return;
  if (r.extra) { await askNewProject(null); return; }
  let path = cleanPath(r.path);
  if (!path) { toast("Caminho inválido."); return; }
  if (!/\.png$/i.test(path)) path += ".png";
  if (files()[path] !== undefined) { toast("Esse arquivo já existe."); return; }
  const w = Number(r.w), h = Number(r.h);
  if (!Number.isInteger(w) || !Number.isInteger(h) || w < 1 || h < 1 || w > 4096 || h > 4096) { toast("Use de 1 a 4096 pixels."); return; }
  files()[path] = await encodePng(w, h, new Uint8ClampedArray(w * h * 4));
  scheduleSave(); renderTree(); renderModCard();
  await openTexture(path);
}
