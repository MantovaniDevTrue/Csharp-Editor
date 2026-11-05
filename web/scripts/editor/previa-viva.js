// ---------- Prévia viva ----------
// Lê o SetDefaults da classe onde está o cursor, mostra o resultado como no jogo
// e devolve para o código o que for mudado nos controles. O código continua sendo a fonte da verdade.
const LIVE_RARITIES = [["Gray", -1, "#828282"], ["White", 0, "#ffffff"], ["Blue", 1, "#9696ff"], ["Green", 2, "#96ff96"], ["Orange", 3, "#ffc896"], ["LightRed", 4, "#ff9696"], ["Pink", 5, "#ff96ff"], ["LightPurple", 6, "#d2a0ff"], ["Lime", 7, "#96ff0a"], ["Yellow", 8, "#ffff0a"], ["Cyan", 9, "#05c8ff"], ["Red", 10, "#ff2864"], ["Purple", 11, "#b428ff"]];
const LIVE_DAMAGE = [["Melee", "Corpo a corpo", "corpo a corpo"], ["Ranged", "Distância", "à distância"], ["Magic", "Mágico", "mágico"], ["Summon", "Lacaio", "de lacaio"], ["Generic", "Geral", ""]];
const LIVE_KINDS = {
  ModItem: { entity: "Item", label: "Item", stats: [
    { p: "damage", label: "Dano", max: 500, def: 10 },
    { p: "crit", label: "Crítico extra", max: 100, def: 6, unit: "%" },
    { p: "useTime", label: "Tempo de uso", min: 1, max: 60, def: 20 },
    { p: "useAnimation", label: "Animação", min: 1, max: 60, def: 20 },
    { p: "knockBack", label: "Repulsão", max: 20, step: .5, def: 4, float: true },
    { p: "defense", label: "Defesa", max: 100, def: 2 },
    { p: "mana", label: "Mana", max: 100, def: 5 },
    { p: "maxStack", label: "Pilha", min: 1, max: 9999, def: 99 },
    { p: "width", label: "Largura", min: 1, max: 128, def: 20 },
    { p: "height", label: "Altura", min: 1, max: 128, def: 20 },
  ] },
  ModNPC: { entity: "NPC", label: "NPC", stats: [
    { p: "lifeMax", label: "Vida", min: 1, max: 20000, def: 100 },
    { p: "damage", label: "Dano", max: 500, def: 10 },
    { p: "defense", label: "Defesa", max: 200, def: 5 },
    { p: "knockBackResist", label: "Sofre repulsão", max: 1, step: .05, def: .5, float: true },
    { p: "width", label: "Largura", min: 1, max: 256, def: 36 },
    { p: "height", label: "Altura", min: 1, max: 256, def: 36 },
  ] },
  ModProjectile: { entity: "Projectile", label: "Projétil", stats: [
    { p: "penetrate", label: "Atravessa", min: -1, max: 30, def: 1 },
    { p: "timeLeft", label: "Duração", min: 1, max: 1800, def: 600 },
    { p: "width", label: "Largura", min: 1, max: 128, def: 8 },
    { p: "height", label: "Altura", min: 1, max: 128, def: 8 },
  ] },
};
let liveScan = { text: null, scan: null };
let liveDraft = {};
let liveShown = "";
function liveNumber(text) {
  return /^-?\d+(\.\d+)?[fFdDmM]?$/.test(text) ? parseFloat(text) : null;
}
function liveCopper(text) {
  const plain = liveNumber(text);
  if (plain !== null) return plain;
  const call = /\b(buyPrice|sellPrice)\s*\(([^)]*)\)/.exec(text);
  if (!call) return null;
  const order = ["platinum", "gold", "silver", "copper"], worth = { platinum: 1000000, gold: 10000, silver: 100, copper: 1 };
  let total = 0;
  call[2].split(",").map((a) => a.trim()).filter(Boolean).forEach((arg, i) => {
    const named = /^(\w+)\s*:\s*(\d+)$/.exec(arg);
    if (named && worth[named[1]]) total += worth[named[1]] * Number(named[2]);
    else if (/^\d+$/.test(arg) && order[i]) total += worth[order[i]] * Number(arg);
  });
  return call[1] === "sellPrice" ? total * 5 : total;
}
function liveCoins(copper) {
  const parts = [[1000000, "platina"], [10000, "ouro"], [100, "prata"], [1, "cobre"]];
  let left = Math.floor(copper);
  const out = [];
  for (const [unit, name] of parts) { const n = Math.floor(left / unit); if (n) { out.push(`${n} ${name}`); left -= n * unit; } }
  return out.join(", ");
}
function liveParse(text, at) {
  if (liveScan.text !== text || liveScan.path !== state.active) liveScan = { text, path: state.active, scan: scanFile(state.active, text) };
  const scan = liveScan.scan, sig = scan.sig, known = projectIndex();
  const options = scan.classes.map((c) => ({ c, kind: LIVE_KINDS[c.base] || LIVE_KINDS[rootBase({ base: c.base }, known)] })).filter((x) => x.kind && !x.c.mods.has("abstract"));
  if (!options.length) return null;
  const pick = options.find((x) => sig[x.c.open].s <= at && at <= sig[x.c.close].e) || options[0];
  const { c, kind } = pick;
  let body = null;
  for (let i = c.open + 1; i < c.close; i++) {
    if (sig[i].v !== "SetDefaults" || sig[i + 1]?.v !== "(") continue;
    let j = i + 1, depth = 0;
    do { if (sig[j].v === "(") depth++; else if (sig[j].v === ")") depth--; j++; } while (j < c.close && depth);
    if (sig[j]?.v !== "{") continue;
    let k = j; depth = 0;
    for (; k <= c.close; k++) { if (sig[k].v === "{") depth++; else if (sig[k].v === "}" && --depth === 0) break; }
    body = { open: j, close: k };
    break;
  }
  const values = {};
  if (body) for (let i = body.open + 1; i < body.close; i++) {
    if (sig[i].v !== kind.entity || sig[i + 1]?.v !== "." || sig[i + 2]?.t !== "id" || sig[i + 3]?.v !== "=") continue;
    let e = i + 4, depth = 0;
    while (e < body.close && (depth || sig[e].v !== ";")) { if ("([{".includes(sig[e].v)) depth++; else if (")]}".includes(sig[e].v)) depth--; e++; }
    if (e === i + 4 || sig[e]?.v !== ";") continue;
    const start = sig[i + 4].s, end = sig[e - 1].e;
    values[sig[i + 2].v] = { text: text.slice(start, end), start, end };
  }
  return { c, kind, sig, body, values, ns: scan.ns, path: state.active, text };
}
function liveValue(info, stat) {
  if (stat.p in liveDraft) return liveDraft[stat.p];
  return info.values[stat.p] ? liveNumber(info.values[stat.p].text) : null;
}
function liveFormat(stat, n) {
  if (!stat.float || Number.isInteger(n)) return String(n);
  return `${Number(n.toFixed(2))}f`;
}
function liveRarity(info) {
  const text = info.values.rare?.text;
  if (text === undefined) return LIVE_RARITIES[1];
  const named = /ItemRarityID\.(\w+)/.exec(text);
  const n = liveNumber(text);
  return LIVE_RARITIES.find((r) => (named ? r[0] === named[1] : r[1] === n)) || LIVE_RARITIES[1];
}
function liveDamageClass(info) {
  return /DamageClass\.(\w+)/.exec(info.values.DamageType?.text || "")?.[1] || "";
}
function liveTranslation(cls, key) {
  const text = files()[`Localization/pt-BR_Mods.${projectId()}.hjson`];
  if (typeof text !== "string") return "";
  const block = new RegExp(`\\b${cls}\\s*:\\s*\\{([^}]*)\\}`).exec(text);
  const value = block && new RegExp(`\\b${key}\\s*:\\s*(.+)`).exec(block[1]);
  return value ? value[1].trim().replace(/^"(.*)"$/, "$1") : "";
}
function liveSpeed(n) {
  return [[8, "Velocidade insana"], [20, "Muito rápida"], [25, "Rápida"], [30, "Velocidade média"], [35, "Lenta"], [45, "Muito lenta"], [55, "Extremamente lenta"]].find(([limit]) => n <= limit)?.[1] || "Lentíssima";
}
function liveKnockback(n) {
  return [[0, "Sem repulsão"], [1.5, "Repulsão mínima"], [3, "Repulsão muito fraca"], [4, "Repulsão fraca"], [6, "Repulsão média"], [7, "Repulsão forte"], [9, "Repulsão muito forte"], [11, "Repulsão extrema"]].find(([limit]) => n <= limit)?.[1] || "Repulsão insana";
}
// As linhas do cartão, na ordem em que o jogo costuma mostrar.
function liveLines(info) {
  const read = (p) => { const s = info.kind.stats.find((x) => x.p === p); return s ? liveValue(info, s) : null; };
  const lines = [];
  if (info.kind.entity === "Item") {
    const damage = read("damage"), crit = read("crit"), anim = read("useAnimation"), kb = read("knockBack"), def = read("defense"), mana = read("mana"), stack = read("maxStack");
    const type = LIVE_DAMAGE.find((d) => d[0] === liveDamageClass(info));
    if (damage !== null && damage > 0) {
      lines.push(`${damage} de dano${type?.[2] ? " " + type[2] : ""}`);
      lines.push(`${(crit || 0) + 4}% de chance de crítico`);
    }
    if (anim !== null && damage > 0) lines.push(liveSpeed(anim));
    if (kb !== null && damage > 0) lines.push(liveKnockback(kb));
    if (def) lines.push(`${def} de defesa`);
    if (mana) lines.push(`Usa ${mana} de mana`);
    if (stack > 1) lines.push(`Pilha de até ${stack}`);
    const tip = liveTranslation(info.c.name, "Tooltip");
    if (tip) lines.push(tip);
    const price = info.values.value ? liveCopper(info.values.value.text) : null;
    if (price) lines.push(`Venda: ${liveCoins(price / 5) || "1 cobre"}`);
  } else if (info.kind.entity === "NPC") {
    const life = read("lifeMax"), damage = read("damage"), def = read("defense"), resist = read("knockBackResist");
    if (life !== null) lines.push(`${life} de vida`);
    if (damage) lines.push(`${damage} de dano por toque`);
    if (def) lines.push(`${def} de defesa`);
    if (resist !== null) lines.push(resist === 0 ? "Não sofre repulsão" : `Sofre ${Math.round(resist * 100)}% da repulsão`);
  } else {
    const pen = read("penetrate"), time = read("timeLeft");
    if (pen !== null) lines.push(pen < 0 ? "Atravessa tudo" : pen <= 1 ? "Some ao acertar" : `Acerta ${pen} vezes`);
    if (time !== null) lines.push(`Dura ${Math.round(time / 6) / 10} s`);
    const w = read("width"), h = read("height");
    if (w !== null && h !== null) lines.push(`Área de ${w}×${h}`);
  }
  return lines;
}
function liveTexturePath(info) {
  return textureOfClass({ ns: info.ns, name: info.c.name, path: info.path });
}
function liveHasCustomTexture(info) {
  const { c, sig } = info;
  for (let i = c.open; i < c.close; i++) if (sig[i].v === "Texture" && sig[i - 1]?.t === "id" && sig[i + 1]?.v === "=>") return true;
  return false;
}
function liveDrawCard(info) {
  const rarity = info.kind.entity === "Item" ? liveRarity(info)[2] : "#ffffff";
  const name = liveTranslation(info.c.name, "DisplayName") || info.c.name.replace(/([a-z0-9])([A-Z])/g, "$1 $2");
  const lines = liveLines(info);
  $("liveName").textContent = name;
  $("liveName").style.color = rarity;
  $("liveSummary").textContent = lines[0] || info.kind.label;
  $("liveTip").innerHTML = `<b style="color:${rarity}">${esc(name)}</b>` + (lines.length ? lines.map((l) => `<span>${esc(l)}</span>`).join("") : `<span class="livemuted">Sem atributos ainda. Adicione abaixo.</span>`);
}
function liveDrawSprite(info) {
  const path = liveTexturePath(info), bytes = files()[path], custom = liveHasCustomTexture(info);
  const thumb = $("liveThumb"), sprite = $("liveSprite");
  if (bytes && typeof bytes !== "string") {
    const url = pngUrl(bytes);
    thumb.innerHTML = `<img alt="" src="${url}">`;
    sprite.innerHTML = `<img alt="" src="${url}">`;
    sprite.setAttribute("aria-label", "Editar a textura");
    sprite.onclick = () => openTexture(path);
    sprite.disabled = false;
  } else {
    thumb.innerHTML = icon("texture");
    sprite.innerHTML = custom ? icon("texture") : `${icon("plus")}<small>Textura</small>`;
    sprite.setAttribute("aria-label", custom ? "A textura está definida no código" : "Criar a textura");
    sprite.disabled = custom;
    const size = { w: liveNumber(info.values.width?.text || "") || 32, h: liveNumber(info.values.height?.text || "") || 32 };
    sprite.onclick = custom ? null : () => newTexture(path, size);
  }
}
function liveDrawControls(info) {
  const box = $("liveStats");
  box.replaceChildren();
  const missing = [];
  for (const stat of info.kind.stats) {
    const entry = info.values[stat.p];
    if (!entry) { missing.push(stat); continue; }
    const value = liveNumber(entry.text);
    const row = document.createElement("div");
    row.className = "livestat";
    const label = document.createElement("button");
    label.type = "button"; label.textContent = stat.label; label.title = "Ver no código"; label.className = "livelabel";
    label.addEventListener("click", () => liveGo(entry.start));
    row.append(label);
    if (value === null) {
      const code = document.createElement("code"); code.textContent = entry.text; row.append(code);
    } else {
      const min = Math.min(stat.min ?? 0, value), max = Math.max(stat.max, Math.ceil(value * 2) || stat.max);
      const range = document.createElement("input");
      range.type = "range"; range.min = min; range.max = stat.max >= value ? stat.max : max; range.step = stat.step || 1; range.value = value;
      range.setAttribute("aria-label", stat.label); range.dataset.stat = stat.p;
      const shown = document.createElement("output");
      shown.textContent = value + (stat.unit || "");
      range.addEventListener("input", () => {
        const n = Number(range.value);
        liveDraft[stat.p] = n; shown.textContent = n + (stat.unit || "");
        liveDrawCard(liveCurrent());
      });
      range.addEventListener("change", () => { const n = Number(range.value); delete liveDraft[stat.p]; liveWrite(stat.p, liveFormat(stat, n)); haptic("tap"); });
      row.append(range, shown);
    }
    box.append(row);
  }
  if (info.kind.entity === "Item") {
    const current = liveRarity(info)[0];
    const rare = document.createElement("div");
    rare.className = "livepicks"; rare.setAttribute("role", "group"); rare.setAttribute("aria-label", "Raridade");
    rare.append(Object.assign(document.createElement("small"), { textContent: "Raridade" }));
    for (const [id, , color] of LIVE_RARITIES) {
      const b = document.createElement("button");
      b.type = "button"; b.className = "liverare"; b.style.setProperty("--c", color); b.setAttribute("aria-label", id); b.title = id;
      b.setAttribute("aria-pressed", String(!!info.values.rare && id === current));
      b.addEventListener("click", () => liveWrite("rare", `ItemRarityID.${id}`, "Terraria.ID"));
      rare.append(b);
    }
    box.append(rare);
    const type = document.createElement("div");
    type.className = "livepicks"; type.setAttribute("role", "group"); type.setAttribute("aria-label", "Tipo de dano");
    type.append(Object.assign(document.createElement("small"), { textContent: "Dano" }));
    for (const [id, label] of LIVE_DAMAGE) {
      const b = document.createElement("button");
      b.type = "button"; b.className = "livechip"; b.textContent = label; b.setAttribute("aria-pressed", String(id === liveDamageClass(info)));
      b.addEventListener("click", () => liveWrite("DamageType", `DamageClass.${id}`));
      type.append(b);
    }
    box.append(type);
  }
  if (missing.length) {
    const add = document.createElement("div");
    add.className = "livepicks"; add.setAttribute("role", "group"); add.setAttribute("aria-label", "Adicionar");
    add.append(Object.assign(document.createElement("small"), { textContent: "Adicionar" }));
    for (const stat of missing) {
      const b = document.createElement("button");
      b.type = "button"; b.className = "livechip"; b.textContent = "+ " + stat.label;
      b.addEventListener("click", () => liveWrite(stat.p, liveFormat(stat, stat.def)));
      add.append(b);
    }
    box.append(add);
  }
}
function liveCurrent() {
  if (!state.active?.endsWith(".cs") || typeof files()[state.active] !== "string") return null;
  return liveParse(src.value, src.selectionStart);
}
function renderLive() {
  const box = $("live");
  const info = settings.livePreview ? liveCurrent() : null;
  if (!info) { box.hidden = true; liveShown = ""; return; }
  // Enquanto um controle é arrastado, ele não pode ser refeito.
  if (Object.keys(liveDraft).length) return;
  const entries = Object.entries(info.values).map(([k, v]) => k + "=" + v.text).join(";");
  const texture = files()[liveTexturePath(info)];
  const signature = [state.active, info.c.name, entries, settings.liveOpen, texture ? pngUrl(texture) : "", liveTranslation(info.c.name, "DisplayName"), liveTranslation(info.c.name, "Tooltip")].join("|");
  box.hidden = false;
  if (signature === liveShown) return;
  liveShown = signature;
  $("liveBar").setAttribute("aria-expanded", String(settings.liveOpen));
  $("liveBody").hidden = !settings.liveOpen;
  if (settings.liveOpen) $("liveBody").style.setProperty("--live-room", Math.max(120, $("codePane").getBoundingClientRect().bottom - $("liveBar").getBoundingClientRect().bottom - 4) + "px");
  liveDrawCard(info);
  liveDrawSprite(info);
  if (settings.liveOpen) {
    const scroll = $("liveBody").scrollTop;
    liveDrawControls(info);
    $("liveBody").scrollTop = scroll;
  }
}
function toggleLive() {
  settings.liveOpen = !settings.liveOpen;
  saveSettings();
  haptic("tap");
  renderLive();
}
// Muda o código sem abrir o teclado e sem tirar o cursor do lugar.
function liveReplace(start, end, text) {
  const focused = document.activeElement === src, top = src.scrollTop, left = src.scrollLeft;
  const from = src.selectionStart, to = src.selectionEnd;
  const fix = (p) => (p >= end ? p + text.length - (end - start) : Math.min(p, start));
  if (!focused) src.inputMode = "none";
  replaceRange(start, end, text);
  closePopup();
  src.setSelectionRange(fix(from), fix(to));
  if (!focused) { src.blur(); src.removeAttribute("inputmode"); }
  src.scrollTop = top; src.scrollLeft = left;
  syncScroll();
}
function liveShowLine(at) {
  const line = src.value.slice(0, at).split("\n").length - 1;
  state.flash = { from: line, to: line, until: performance.now() + 650 };
  const y = 8 + line * lineH;
  if (y < src.scrollTop || y > src.scrollTop + src.clientHeight - lineH * 2) { src.scrollTop = Math.max(0, y - src.clientHeight / 2); syncScroll(); }
  queueRender();
}
function liveWrite(prop, value, needsUsing) {
  const info = liveCurrent();
  if (!info) return;
  const entry = info.values[prop], ent = info.kind.entity, text = src.value;
  let at;
  if (entry) {
    liveReplace(entry.start, entry.end, value);
    at = entry.start;
  } else if (info.body) {
    const close = info.sig[info.body.close].s, lineStart = text.lastIndexOf("\n", close - 1) + 1, before = text.slice(lineStart, close);
    if (!before.trim()) {
      const line = `${before}${indentUnit()}${ent}.${prop} = ${value};\n`;
      liveReplace(lineStart, lineStart, line);
      at = lineStart;
    } else {
      liveReplace(close, close, ` ${ent}.${prop} = ${value}; `);
      at = close;
    }
  } else {
    const open = info.sig[info.c.open].e, unit = indentUnit();
    const block = `\n${unit}public override void SetDefaults()\n${unit}{\n${unit}${unit}${ent}.${prop} = ${value};\n${unit}}\n`;
    liveReplace(open, open, block);
    at = open + block.indexOf(ent + ".");
  }
  if (needsUsing && !new RegExp(`\\busing\\s+${needsUsing.replace(/\./g, "\\.")}\\s*;`).test(src.value)) {
    const add = `using ${needsUsing};\n`;
    liveReplace(0, 0, add);
    at += add.length;
  }
  liveShowLine(at);
}
function liveGo(at) {
  src.setSelectionRange(at, at);
  liveShowLine(at);
}
