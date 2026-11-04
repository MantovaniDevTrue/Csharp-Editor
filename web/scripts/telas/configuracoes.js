// ---------- Tela de configurações ----------
const SETTINGS_UI = [
  { group: "Editor" },
  { key: "wrap", type: "switch", label: "Quebra de linha", hint: "Mostra linhas longas inteiras, sem rolar para o lado." },
  { key: "fontSize", type: "stepper", min: 11, max: 22, label: "Tamanho da fonte", hint: "Tamanho do texto do código." },
  { key: "indent", type: "seg", options: [[2, "2 espaços"], [4, "4 espaços"]], label: "Recuo", hint: "Usado no Tab e ao quebrar a linha." },
  { key: "lineNumbers", type: "switch", label: "Números de linha", hint: "Coluna com o número de cada linha." },
  { key: "currentLine", type: "switch", label: "Destacar a linha atual", hint: "Marca a linha onde o cursor está." },
  { key: "autoPairs", type: "switch", label: "Fechar pares", hint: "Ao digitar ( [ { ou aspas, já insere o fechamento." },
  { group: "Ajuda ao escrever" },
  { key: "suggest", type: "switch", label: "Sugestões automáticas", hint: "Abre a lista enquanto digita. O botão Sugerir continua funcionando." },
  { key: "live", type: "switch", label: "Checar enquanto digita", hint: "Marca erros comuns na linha, sem precisar compilar." },
  { key: "warm", type: "switch", label: "Aquecer o compilador", hint: "Prepara o Roslyn ao abrir o app. A primeira compilação fica mais rápida." },
  { group: "Aparência" },
  { key: "scene", type: "switch", label: "Cenário animado", hint: "Céu, nuvens e clima em movimento. Desligar gasta menos bateria." },
  { key: "weather", type: "seg", options: [["auto", "Muda sozinho"], ["clear", "Limpo"], ["clouds", "Nublado"], ["rain", "Chuva"], ["storm", "Tempestade"], ["snow", "Neve"], ["wind", "Vento"]], label: "Clima" },
  { key: "cycle", type: "seg", options: [["clock", "Pelo relógio"], ["day", "Sempre dia"], ["night", "Sempre noite"]], label: "Hora do cenário" },
  { key: "typeFx", type: "seg", options: [["off", "Nenhum"], ["glow", "Brilho"], ["sparks", "Faíscas"]], label: "Efeito ao digitar" },
  { key: "anims", type: "switch", label: "Animações", hint: "Transições de telas, botões e listas." },
  { key: "haptics", type: "switch", label: "Vibração", hint: "Resposta leve ao tocar e ao segurar." },
];
function renderSettings() {
  const box = $("settingsBody");
  const head = document.createElement("div");
  head.className = "sheethead";
  head.innerHTML = '<h2>Configurações</h2><button class="closex" id="settingsClose" aria-label="Fechar">' + icon("close") + '</button>';
  const wrap = document.createElement("div");
  wrap.className = "setwrap";
  const update = (key, value) => { settings[key] = value; saveSettings(); applySettings(); haptic("tap"); renderSettings(); };
  for (const item of SETTINGS_UI) {
    if (item.group) { const h = document.createElement("h3"); h.textContent = item.group; wrap.append(h); continue; }
    const row = document.createElement("div");
    row.className = "setrow" + (item.type === "seg" ? " stack" : "");
    row.dataset.setting = item.key;
    const tx = document.createElement("div");
    tx.className = "tx";
    tx.innerHTML = `<b>${esc(item.label)}</b>${item.hint ? `<small>${esc(item.hint)}</small>` : ""}`;
    row.append(tx);
    if (item.type === "switch") {
      const b = document.createElement("button");
      b.type = "button"; b.className = "switch"; b.setAttribute("role", "switch"); b.setAttribute("aria-checked", String(settings[item.key])); b.setAttribute("aria-label", item.label);
      b.addEventListener("click", () => update(item.key, !settings[item.key]));
      row.append(b);
    } else if (item.type === "stepper") {
      const box2 = document.createElement("div");
      box2.className = "stepper";
      box2.innerHTML = `<button type="button" aria-label="Diminuir">−</button><span>${settings[item.key]}</span><button type="button" aria-label="Aumentar">+</button>`;
      box2.children[0].addEventListener("click", () => update(item.key, Math.max(item.min, settings[item.key] - 1)));
      box2.children[2].addEventListener("click", () => update(item.key, Math.min(item.max, settings[item.key] + 1)));
      row.append(box2);
    } else {
      const seg = document.createElement("div");
      seg.className = "seg";
      for (const [value, label] of item.options) {
        const b = document.createElement("button");
        b.type = "button"; b.textContent = label; b.setAttribute("aria-pressed", String(settings[item.key] === value));
        b.addEventListener("click", () => update(item.key, value));
        seg.append(b);
      }
      row.append(seg);
    }
    wrap.append(row);
  }
  const h = document.createElement("h3"); h.textContent = "Sobre"; wrap.append(h);
  const about = document.createElement("div");
  about.className = "setrow stack";
  about.innerHTML = '<div class="tx"><b>Tutorial</b><small>Mostra para que serve cada parte do app.</small></div><button class="btn strong" id="settingsTour" type="button">Ver o tutorial</button></div><div class="setrow stack"><div class="tx"><b>Pasta do Bunny</b><small id="bridgeText"></small></div><button class="btn" id="settingsBridge" type="button">Conectar</button></div><div class="setrow stack"><div class="tx"><b>Testar os modelos</b><small>Compila todos os modelos com o Bunny instalado.</small></div><button class="btn" id="settingsProbe" type="button">Testar</button></div><div class="setrow stack"><div class="tx"><b>Bunny C# Studio</b><small>Ferramenta não oficial feita para o Bunny Loader, que é um projeto de Jonata Oliveira. O app compila com o mesmo código C# do Bunny.</small></div><button class="btn" id="settingsReset" type="button">Restaurar padrões</button>';
  wrap.append(about);
  const top = box.parentElement.scrollTop;
  box.replaceChildren(head, wrap);
  box.parentElement.scrollTop = top;
  $("settingsClose").addEventListener("click", () => $("settings").close());
  refreshBridge();
  $("bridgeText").textContent = bridge.connected ? "Conectada à pasta ModSources. " + (BRIDGE_TEXT[bridge.status] || "") : BRIDGE_TEXT[bridge.status] || "Disponível só no app para Android.";
  $("settingsBridge").textContent = bridge.connected ? "Reconectar" : "Conectar";
  $("settingsBridge").disabled = !window.BunnyAndroid?.bridgeStatus;
  $("settingsBridge").addEventListener("click", async () => { $("settings").close(); const ok = await connectBunny(); toast(ok ? "Pasta do Bunny conectada." : "A pasta escolhida não é a ModSources do Bunny Loader."); });
  $("settingsTour").addEventListener("click", startTour);
  $("settingsProbe").addEventListener("click", () => { $("settings").close(); testModels(); });
  $("settingsReset").addEventListener("click", () => { Object.assign(settings, SETTING_DEFAULTS); saveSettings(); applySettings(); renderSettings(); toast("Padrões restaurados."); });
}
async function switchMod(uid) {
  state.uid = uid;
  state.problems = []; state.dll = null; state.open = []; state.openOrder = []; state.touchedDirs = new Set(); collapsed.clear();
  $("fileSearch").value = "";
  $("dlDll").hidden = true; $("sendBunny2").hidden = true;
  memoSet("bunny-studio-current", uid);
  renderModSelect();
  const paths = Object.keys(files());
  const first = paths.find((p) => /Content\/Items\/.+\.cs$/.test(p)) || paths.find((p) => p.endsWith(".cs")) || "manifest.json";
  openFile(first);
  showOutput("idle", "Nada compilado ainda.", idleOutput);
  renderModCard();
}
function newMod() {
  openSheet({ title: "O que você quer criar?", items: [
    { glyph: "C#", label: "Mod em C#", action: () => askNewProject(null) },
    { glyph: "▦", label: "Pacote de texturas", action: () => askNewProject("texture") },
    { glyph: "Aa", label: "Pacote de fontes", action: () => askNewProject("font") },
  ] });
}
async function askNewProject(type) {
  const r = await ask({ title: "Novo mod", text: "O UID é gerado agora; mantenha o mesmo UID nas atualizações do mod.", fields: [{ name: "name", label: "Nome", value: "Meu Mod" }, { name: "id", label: "ID (letras minúsculas, números e _)", value: "meu_mod" }], ok: "Criar", extra: "Mod de teste" });
  if (!r) return;
  if (r.extra) { await newStressMod(); return; }
  if (!MOD_ID_RE.test(r.id)) { toast("O ID vira o nome da classe do mod: use letras, números ou _, começando por letra."); return; }
  if (!r.name || r.name.length > 100) { toast("Dê um nome de até 100 caracteres."); return; }
  const m = type ? starterPack(type, r.id, r.name) : starterMod(r.id, r.name);
  state.mods[m.uid] = m;
  await switchMod(m.uid);
  scheduleSave();
}

