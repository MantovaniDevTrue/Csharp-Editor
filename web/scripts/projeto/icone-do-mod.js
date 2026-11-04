// ---------- Ícone do mod ----------
// O Bunny usa o icon.png da raiz do mod, quadrado. Sem ele, mostra o ícone da categoria.
const ICON_SIZE = 80;
async function iconFromFile(file) {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = ICON_SIZE;
  const ctx = canvas.getContext("2d");
  // Imagem pequena é pixel art: aumenta sem borrar.
  ctx.imageSmoothingEnabled = side > ICON_SIZE;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, ICON_SIZE, ICON_SIZE);
  return new Promise((resolve, reject) => canvas.toBlob(async (blob) => (blob ? resolve(new Uint8Array(await blob.arrayBuffer())) : reject(new Error("PNG"))), "image/png"));
}
// Monta a linha do ícone no diálogo. As mudanças só valem ao salvar.
function iconRow(form, current) {
  const choice = { icon: current, changed: false, draw: false };
  const row = document.createElement("div");
  row.className = "iconrow";
  row.innerHTML = `<span class="iconbox" id="iconBox"></span><div class="iconacts"><b>Ícone</b><div><button class="btn small" type="button" id="iconPick">Escolher imagem</button><button class="btn small" type="button" id="iconDraw">Desenhar</button><button class="btn small" type="button" id="iconRemove">Remover</button></div></div>`;
  const label = form.querySelector("label");
  form.insertBefore(row, label);
  const show = () => {
    const box = row.querySelector("#iconBox");
    box.replaceChildren();
    if (choice.icon) { const img = document.createElement("img"); img.alt = "Ícone do mod"; img.src = pngUrl(choice.icon); box.append(img); }
    else box.textContent = "?";
    row.querySelector("#iconRemove").hidden = !choice.icon;
  };
  row.querySelector("#iconPick").addEventListener("click", () => {
    const input = document.createElement("input");
    input.type = "file"; input.accept = "image/png,image/jpeg,image/webp";
    input.addEventListener("change", async () => {
      if (!input.files[0]) return;
      try { choice.icon = await iconFromFile(input.files[0]); choice.changed = true; show(); }
      catch { toast("Não foi possível abrir essa imagem."); }
    });
    input.click();
  });
  row.querySelector("#iconRemove").addEventListener("click", () => { choice.icon = null; choice.changed = true; show(); });
  // Desenhar salva os dados e abre o editor de texturas no ícone.
  row.querySelector("#iconDraw").addEventListener("click", () => { choice.draw = true; $("dlg").close("ok"); });
  show();
  return choice;
}
async function applyIcon(choice) {
  if (choice.changed) {
    if (choice.icon) files()["icon.png"] = choice.icon; else delete files()["icon.png"];
    delete mod().pixelDocs?.["icon.png"];
  }
  if (choice.draw) {
    if (files()["icon.png"] === undefined) files()["icon.png"] = await encodePng(ICON_SIZE, ICON_SIZE, new Uint8ClampedArray(ICON_SIZE * ICON_SIZE * 4));
    await openTexture("icon.png");
  }
  if (choice.changed || choice.draw) { scheduleSave(); renderTree(); }
}
