// ---------- Tutorial opcional ----------
const TOUR = [
  { view: "files", target: "#modSelect", title: "Seus mods", text: "Toque aqui para trocar de mod, criar outro, mudar a ordem ou apagar um mod." },
  { view: "files", target: ".modcard", title: "Dados do mod", text: "Nome, versão e autor ficam aqui, sem precisar mexer no JSON. Também é aqui que você importa, exporta e envia para o Bunny." },
  { view: "code", target: "#menuBtn", title: "Barra lateral", text: "Os três traços abrem os arquivos em qualquer tela. A pasta do arquivo aberto fica marcada em dourado." },
  { view: "files", target: "#tree", title: "Arquivos", text: "O manifest.json fica sempre no topo. Toque em um arquivo para abrir, ou segure em um arquivo ou pasta para ver mais opções." },
  { view: "files", target: "#modSearchBtn", title: "Buscar no mod", text: "Procura e substitui em todos os arquivos de texto, com opção de desfazer. Tocar em um resultado abre o arquivo naquela linha." },
  { view: "files", target: "#newTexture", title: "Editor de texturas", text: "Toque em um PNG ou em + Textura e escolha para que ela serve. Tem lápis, formas, seleção, espelho, camadas e quadros de animação. Dois dedos movem a tela e dão zoom." },
  { view: "files", target: "#newMod", title: "Texturas e fontes", text: "Em Novo mod, escolha um pacote de texturas ou de fontes. No de fontes, Gerar fonte de um .ttf cria as cinco fontes do jogo, e dá para retocar as letras tocando nas folhas PNG." },
  { view: "snips", target: "#snips", title: "Modelos prontos", text: "Espadas, armas, armaduras, NPCs e C# comum, no estilo do tModLoader. Toque em um para ver o código antes de usar." },
  { view: "code", target: "#ed", title: "O editor", text: "Em um arquivo vazio, digite uma palavra como espada ou receita no começo da linha. A classe inteira aparece em uma prévia. Toque para inserir." },
  { view: "code", target: "#live", fallback: "#ed", title: "Prévia viva", text: "Em um item, NPC ou projétil, esta faixa mostra como ele fica no jogo. Abra e arraste um controle: o número muda no código na mesma hora." },
  { view: "code", target: "#keys", title: "Teclas de código", text: "Símbolos que dão trabalho no teclado do celular. O Tab insere o que está sugerido e pula para o próximo campo de um modelo." },
  { view: "code", target: "#compile", title: "Compilar", text: "Compila com o Roslyn e a API do Bunny instalado. Enquanto você digita, erros comuns já aparecem na própria linha." },
  { view: "out", target: "#outPane", title: "Erros explicados", text: "Cada erro mostra o que você escreveu, o motivo e como deveria ficar. Quando há uma única resposta certa, o botão Corrigir agora resolve." },
  { view: "files", target: "#sendBunny", fallback: "#exportBtn", title: "Enviar para o Bunny", text: "Salva o pacote e abre o Bunny. Lá, toque em Importar e escolha o arquivo." },
  { view: "files", target: "#settingsBtn", title: "Configurações", text: "Quebra de linha, tamanho da fonte, clima do cenário, animações e vibração. Este tutorial também fica lá." },
];
let tourIndex = -1, tourBox = null;
const tourSeen = () => { try { return !!localStorage.getItem("bunny-studio-tour"); } catch { return true; } };
const markTourSeen = () => { try { localStorage.setItem("bunny-studio-tour", "1"); } catch { /* conveniência */ } };
function endTour() {
  tourIndex = -1;
  tourBox?.remove(); tourBox = null;
  markTourSeen();
  window.removeEventListener("resize", drawTour);
}
function startTour() {
  closePopup();
  closeDrawer();
  for (const id of ["sheet", "mods", "settings"]) if ($(id).open) $(id).close();
  tourIndex = 0;
  tourBox = document.createElement("div");
  tourBox.id = "tour";
  tourBox.innerHTML = '<div class="tourhole"></div><div class="tourcard" role="dialog" aria-live="polite"><small id="tourStep"></small><h2 id="tourTitle"></h2><p id="tourText"></p><div class="touracts"><button class="btn small" id="tourSkip" type="button">Sair</button><span class="spacer"></span><button class="btn small" id="tourBack" type="button">Voltar</button><button class="btn small strong" id="tourNext" type="button">Próximo</button></div></div>';
  document.body.append(tourBox);
  $("tourSkip").addEventListener("click", endTour);
  $("tourBack").addEventListener("click", () => { if (tourIndex > 0) { tourIndex--; drawTour(); } });
  $("tourNext").addEventListener("click", () => { haptic("tap"); if (tourIndex >= TOUR.length - 1) { endTour(); toast("Pronto! O tutorial fica em Configurações."); } else { tourIndex++; drawTour(); } });
  window.addEventListener("resize", drawTour);
  drawTour();
}
function drawTour() {
  if (tourIndex < 0) return;
  const step = TOUR[tourIndex];
  setView(step.view);
  const visible = (sel) => { const el = sel && document.querySelector(sel); return el && !el.hidden && el.getClientRects().length ? el : null; };
  const target = visible(step.target) || visible(step.fallback) || visible(".work");
  $("tourStep").textContent = `${tourIndex + 1} de ${TOUR.length}`;
  $("tourTitle").textContent = step.title;
  $("tourText").textContent = step.text;
  $("tourBack").disabled = tourIndex === 0;
  $("tourNext").textContent = tourIndex === TOUR.length - 1 ? "Concluir" : "Próximo";
  // Em tela pequena o alvo pode estar fora da área visível.
  target.scrollIntoView({ block: "nearest" });
  // Mede depois que a tela nova terminou de entrar.
  requestAnimationFrame(() => setTimeout(() => {
    if (tourIndex < 0) return;
    const r = target.getBoundingClientRect();
    const hole = tourBox.querySelector(".tourhole"), card = tourBox.querySelector(".tourcard");
    const pad = 4;
    const top = Math.max(0, r.top - pad), bottom = Math.min(innerHeight, r.bottom + pad);
    hole.style.cssText = `left:${Math.max(0, r.left - pad)}px;top:${top}px;width:${Math.min(innerWidth, r.width + pad * 2)}px;height:${bottom - top}px`;
    const cardH = card.offsetHeight;
    const below = innerHeight - bottom, above = top;
    // Fica onde há mais espaço; se o alvo ocupa a tela, sobrepõe a parte de baixo dele.
    const y = below >= cardH + 16 ? bottom + 10 : above >= cardH + 16 ? top - cardH - 10 : Math.max(10, innerHeight - cardH - 90);
    card.style.top = Math.max(6, Math.min(y, innerHeight - cardH - 6)) + "px";
  }, settings.anims ? 220 : 0));
}
function inviteTour() {
  if (tourSeen() || !window.BunnyAndroid || location.hash) return;
  openSheet({ title: "Quer um tour rápido?", subtitle: "Leva menos de um minuto. Fica também em Configurações.", items: [
    { glyph: "▶", label: "Ver o tutorial", action: startTour },
    { glyph: "✕", label: "Agora não", action: markTourSeen },
  ] });
  $("sheet").addEventListener("close", markTourSeen, { once: true });
}

