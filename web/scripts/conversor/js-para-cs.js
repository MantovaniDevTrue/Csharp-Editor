// ---------- Conversor de código: JavaScript do Bunny antigo → C# ----------
// Lê token por token e troca o que tem equivalente direto. O que não tem vira uma nota,
// marcada no próprio código com "// Revisar:", para o compilador e a pessoa acharem.
const CS_GENERIC_CALLS = new Set(["GetModPlayer", "GetGlobalItem", "GetGlobalNPC", "GetGlobalProjectile", "GetGlobalTile", "GetModSystem", "GetInstance", "InModBiome", "HasBuff"]);
const CS_TYPE_CALLS = new Set(["ItemType", "ProjectileType", "NPCType", "BuffType", "TileType", "WallType", "DustType", "GoreType", "MountType", "PrefixType", "RarityType"]);
const CS_TYPE_BY_NAME = { ModItem: "ItemType", ModNPC: "NPCType", ModProjectile: "ProjectileType", ModBuff: "BuffType", ModTile: "TileType", ModWall: "WallType" };
const CS_MATH = { floor: "(int)Math.Floor", ceil: "(int)Math.Ceiling", round: "(int)Math.Round", max: "Math.Max", min: "Math.Min", abs: "Math.Abs", sqrt: "MathF.Sqrt", sin: "MathF.Sin", cos: "MathF.Cos", tan: "MathF.Tan", atan2: "MathF.Atan2", pow: "MathF.Pow", sign: "Math.Sign", PI: "MathHelper.Pi", random: "Main.rand.NextFloat" };
// Ganchos com outro nome em C#.
const CS_RENAMED_HOOKS = { UpdatePlayer: "Update", UpdateNPC: "Update" };

function splitCsParams(text) {
  const out = [];
  let depth = 0, cur = "";
  for (const ch of text) {
    if (ch === "<" || ch === "(" || ch === "[") depth++;
    else if (ch === ">" || ch === ")" || ch === "]") depth--;
    if (ch === "," && !depth) { out.push(cur.trim()); cur = ""; } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out.map((p) => {
    const plain = p.replace(/\s*=\s*.+$/, "");
    const m = /^((?:ref|out|in|params|this)\s+)?(.+?)\s+([A-Za-z_]\w*)$/.exec(plain);
    return m ? { mod: (m[1] || "").trim(), type: m[2], name: m[3] } : { mod: "", type: "object", name: plain };
  });
}
// O método de C# que corresponde a um método da classe em JS.
function csHookFor(root, jsName, jsParams) {
  const csName = root === "ModBuff" && CS_RENAMED_HOOKS[jsName] ? CS_RENAMED_HOOKS[jsName] : jsName;
  const options = membersOf(root).filter((m) => m.k === "m" && m.n === csName && (m.v || m.a));
  if (!options.length) return null;
  const scored = options.map((m) => {
    const params = splitCsParams(m.p || "");
    const extra = jsParams.length - params.length;
    let score = extra === 0 || extra === 1 ? 2 : extra < 0 ? 1 : 0;
    const guess = JS_PARAM_TYPES[jsParams[0]];
    const firstType = params[0]?.type.replace(/^.*\./, "");
    if (guess && firstType === guess) score += 1;
    if (jsName === "UpdateNPC" && firstType === "NPC") score += 3;
    if (jsName === "UpdatePlayer" && firstType === "Player") score += 3;
    return { m, params, extra, score };
  }).sort((a, b) => b.score - a.score);
  return scored[0];
}
function csLiteralType(tokens) {
  const first = tokens[0];
  if (!first) return "object";
  if (first.v === "true" || first.v === "false") return "bool";
  if (first.t === "num") return /[.eE]/.test(first.v) ? "float" : "int";
  if (first.v === "-" && tokens[1]?.t === "num") return /[.eE]/.test(tokens[1].v) ? "float" : "int";
  if (first.t === "str") return "string";
  if (first.v === "new" && tokens[1]?.t === "id") return tokens[1].v;
  if (first.t === "id" && tokens[1]?.v === "." && tokens[2]?.v === "new") return first.v;
  return "object";
}
function csString(token) {
  const v = token.v;
  if (v.startsWith("`")) {
    const inner = v.slice(1, -1);
    let out = "", i = 0;
    while (i < inner.length) {
      if (inner[i] === "$" && inner[i + 1] === "{") {
        let depth = 1, j = i + 2;
        while (j < inner.length && depth) { if (inner[j] === "{") depth++; else if (inner[j] === "}") depth--; j++; }
        out += "{" + inner.slice(i + 2, j - 1).replace(/\bthis\./g, "") + "}";
        i = j; continue;
      }
      const ch = inner[i];
      out += ch === "{" ? "{{" : ch === "}" ? "}}" : ch === '"' ? '\\"' : ch === "\n" ? "\\n" : ch === "\\" && inner[i + 1] === "`" ? "" : ch;
      i++;
    }
    return '$"' + out + '"';
  }
  if (v.startsWith("'")) return '"' + v.slice(1, -1).replace(/\\'/g, "'").replace(/(^|[^\\])"/g, '$1\\"') + '"';
  return v;
}

function convertJsSource(text, ctx) {
  const tokens = lexJs(text).tokens;
  const sigIdx = [];
  tokens.forEach((t, i) => { if (t.t !== "ws" && t.t !== "com") sigIdx.push(i); });
  const posOf = new Map(sigIdx.map((ti, k) => [ti, k]));
  const sig = (k) => tokens[sigIdx[k]];
  const out = [];
  const notes = [];
  let csLine = 1, pending = [];
  const usings = ctx.usings;
  const skip = new Set(), replaceAt = new Map();
  const note = (msg, token) => {
    const jsLine = token ? text.slice(0, token.s).split("\n").length : 0;
    if (!pending.includes(msg)) pending.push(msg);
    notes.push({ jsLine, csLine, msg });
  };
  const emit = (str) => {
    if (!str) return;
    const nl = str.indexOf("\n");
    if (nl >= 0 && pending.length) { str = str.slice(0, nl) + " // Revisar: " + pending.join(" ") + str.slice(nl); pending = []; }
    out.push(str);
    csLine += (str.match(/\n/g) || []).length;
  };
  const matchClose = (k) => {
    const open = sig(k).v, close = { "(": ")", "[": "]", "{": "}" }[open];
    let depth = 0;
    for (let j = k; j < sigIdx.length; j++) { if (sig(j).v === open) depth++; else if (sig(j).v === close && --depth === 0) return j; }
    return sigIdx.length - 1;
  };
  // Pula de k até o fim do comando (;) e devolve o texto original, comentado.
  const commentOut = (k, why) => {
    let j = k, depth = 0;
    for (; j < sigIdx.length; j++) {
      const v = sig(j).v;
      if ("([{".includes(v)) depth++;
      else if (")]}".includes(v)) { depth--; if (!depth && v === "}" && sig(j + 1)?.v !== ";" && sig(j + 1)?.v !== "," && sig(j + 1)?.v !== ")" && sig(j + 1)?.v !== ".") break; }
      else if (v === ";" && !depth) break;
    }
    const startTok = sig(k), endTok = sig(Math.min(j, sigIdx.length - 1));
    note(why, startTok);
    emit("// " + text.slice(startTok.s, endTok.e).replace(/\n/g, "\n// "));
    for (let t = sigIdx[k]; t <= sigIdx[Math.min(j, sigIdx.length - 1)]; t++) skip.add(t);
  };
  const indentOf = (token) => { const start = text.lastIndexOf("\n", token.s - 1) + 1; return /^[ \t]*/.exec(text.slice(start))[0]; };
  const stack = [];
  const frame = () => stack[stack.length - 1];
  const inClass = () => stack.slice().reverse().find((f) => f.type === "class");
  let pendingFrame = null, field = false, staticNext = false, forOf = false;
  const hoisted = [];

  for (let ti = 0; ti < tokens.length; ti++) {
    if (skip.has(ti)) continue;
    const t = tokens[ti];
    // A chave de uma classe ou de um método abre o bloco dele.
    if (t.v === "{" && t.t === "op" && pendingFrame) {
      emit(replaceAt.get(ti) ?? "{");
      if (pendingFrame.type === "class" && hoisted.length) { const ind = indentOf(t) + "    "; emit(hoisted.map((h) => "\n" + ind + h).join("") + "\n"); }
      stack.push(pendingFrame); pendingFrame = null; continue;
    }
    if (replaceAt.has(ti)) { emit(replaceAt.get(ti)); continue; }
    if (t.t === "ws") { emit(t.v); continue; }
    if (t.t === "com") { emit(t.v); continue; }
    const k = posOf.get(ti);
    const next = sig(k + 1), next2 = sig(k + 2), prev = sig(k - 1);
    const top = frame();
    const where = !top ? "top" : top.type === "class" && !field ? "member" : "code";

    // ----- Topo do arquivo -----
    if (where === "top") {
      if (t.v === "import") {
        let j = k;
        while (j < sigIdx.length && sig(j).t !== "str") j++;
        const spec = sig(j)?.v.slice(1, -1) || "";
        const target = resolveJsImport(ctx.path, spec);
        if (target && ctx.nsOfJs(target) && ctx.nsOfJs(target) !== ctx.ns) usings.add(ctx.nsOfJs(target));
        if (sig(j + 1)?.v === ";") j++;
        for (let s = sigIdx[k]; s <= sigIdx[j]; s++) skip.add(s);
        continue;
      }
      if ((t.v === "export" && (next?.v === "class" || (next?.v === "default" && next2?.v === "class"))) || (t.v === "default" && prev?.v === "export" && next?.v === "class")) {
        if (tokens[ti + 1]?.t === "ws") skip.add(ti + 1);
        continue;
      }
      if (t.v === "class") {
        const name = next.v;
        let j = k + 2, base = null;
        if (sig(j)?.v === "extends") { base = sig(j + 1).v; j += 2; while (sig(j)?.v === ".") { base = sig(j + 1).v; j += 2; } }
        const root = base ? jsRootOf(base) : null;
        if (base && root && !T[root]) note(`${root} não existe em C#; procure a classe equivalente.`, t);
        emit(`public class ${name}${base ? " : " + base : ""}`);
        for (let s = ti + 1; s < sigIdx[j]; s++) skip.add(s);
        pendingFrame = { type: "class", name, root, entity: root ? jsEntityOf(root) : null, own: ctx.ownMembers.get(name) || new Set() };
        // A chave da classe vai para a linha de baixo, como no tModLoader.
        replaceAt.set(sigIdx[j], "\n" + indentOf(t) + "{");
        continue;
      }
      if (["const", "let", "var"].includes(t.v)) {
        // const { ItemID, TileID } = Terraria.ID;  const Main = Terraria.Main;  const X = Tipo['assinatura'];
        let j = k + 1;
        const names = [];
        if (sig(j).v === "{") { const end = matchClose(j); for (let s = j + 1; s < end; s++) if (sig(s).t === "id" && sig(s + 1)?.v !== ":") names.push(sig(s).v); j = end + 1; }
        else { names.push(sig(j).v); j++; }
        const startsPath = (v) => ["Terraria", "Microsoft", "System", "ReLogic"].includes(v) || ctx.aliases.get(v)?.kind === "type" || !!T[v];
        if (sig(j)?.v === "=" && sig(j + 1)?.t === "id" && startsPath(sig(j + 1).v) && sig(j + 2) && (sig(j + 2).v === "." || sig(j + 2).v === "[" || sig(j + 2).v === ";")) {
          let e = j + 1, path = [];
          while (sig(e)?.t === "id") { path.push(sig(e).v); if (sig(e + 1)?.v === ".") e += 2; else { e++; break; } }
          let method = null;
          if (sig(e)?.v === "[" && sig(e + 1)?.t === "str" && sig(e + 2)?.v === "]") { method = /([\w.]+)\s*\(/.exec(sig(e + 1).v)?.[1] || null; e += 3; }
          const endsHere = !sig(e) || sig(e).v === ";" || text.slice(sig(e - 1).e, sig(e).s).includes("\n");
          const known = method || T[path[path.length - 1]] || isJsNamespace(path.join(".")) || ctx.aliases.get(path[0])?.kind === "type" && path.length === 1;
          if (endsHere && known) {
            if (ctx.aliases.get(path[0])?.kind === "type") path[0] = ctx.aliases.get(path[0]).name;
            const last = path[path.length - 1];
            const isType = !!T[last] || (/^[A-Z]/.test(last) && !isJsNamespace(path.join(".")));
            const nsPath = isType ? path.slice(0, -1).join(".") : path.join(".");
            if (isType && !nsPath && T[last]?.ns) usings.add(T[last].ns);
            if (nsPath) usings.add(nsPath);
            if (method && names.length === 1) {
              ctx.aliases.set(names[0], { kind: "method", type: last, method });
              if (method === ".ctor") note(`${names[0]} chama um construtor pela assinatura; em C# use new ${last}(...).`, t);
            } else if (names.length === 1 && isType && names[0] !== last) ctx.aliases.set(names[0], { kind: "type", name: last });
            const end = sig(e)?.v === ";" ? e : e - 1;
            for (let s = sigIdx[k]; s <= sigIdx[end]; s++) skip.add(s);
            continue;
          }
        }
        // const VELOCIDADE = 10; vira uma constante dentro de cada classe do arquivo.
        if (names.length === 1 && sig(j)?.v === "=") {
          let e = j + 1;
          const value = [];
          while (e < sigIdx.length && sig(e).v !== ";" && !text.slice(sig(e - 1).e, sig(e).s).includes("\n")) { value.push(sig(e)); e++; }
          if (value.length && value.every((x) => x.t === "num" || x.t === "str" && !x.v.startsWith("`") || "+-*/()".includes(x.v))) {
            const type = value.some((x) => x.t === "str") ? "string" : value.some((x) => x.t === "num" && /[.eE]/.test(x.v)) ? "float" : "int";
            hoisted.push(`const ${type} ${names[0]} = ${value.map((x) => (x.t === "str" ? csString(x) : x.t === "num" && /^\d*\.\d+$/.test(x.v) ? x.v + "f" : x.v)).join(" ").replace(/\( /g, "(").replace(/ \)/g, ")")};`);
            const end = sig(e)?.v === ";" ? e : e - 1;
            for (let s2 = sigIdx[k]; s2 <= sigIdx[end]; s2++) skip.add(s2);
            if (tokens[sigIdx[end] + 1]?.t === "ws" && /^[ \t]*\/\//.test(text.slice(sig(end).e)) === false) { /* mantém a quebra de linha */ }
            continue;
          }
        }
        commentOut(k, "Valor fora de uma classe: em C# ele precisa ir para dentro de uma classe, como um campo static.");
        continue;
      }
      if (t.v === "export") { commentOut(k + 1, "Export de algo que não é classe: passe para dentro de uma classe."); skip.add(ti); continue; }
      if (t.v === ";") continue;
      commentOut(k, "Código fora de uma classe não existe em C#.");
      continue;
    }

    // ----- Corpo da classe -----
    if (where === "member") {
      if (t.v === "}") { stack.pop(); emit("}"); continue; }
      if (t.v === "static") { staticNext = true; continue; }
      if (t.v === ";") continue;
      const cls = top;
      const isAccessor = (t.v === "get" || t.v === "set") && next?.t === "id" && next2?.v === "(";
      const nameTok = isAccessor ? next : t;
      const name = nameTok.v.replace(/^#/, "_");
      const afterName = isAccessor ? k + 2 : k + 1;
      if (sig(afterName)?.v === "(") {
        const close = matchClose(afterName);
        const jsParams = [];
        for (let s = afterName + 1; s < close; s++) if (sig(s).t === "id" && (sig(s - 1).v === "(" || sig(s - 1).v === ",")) jsParams.push(sig(s).v);
        const frameInfo = { type: "method", renames: new Map(), refs: new Set(), extraClose: false };
        let header;
        if (nameTok.v === "constructor") {
          header = `public ${cls.name}(${jsParams.map((p) => "object " + p).join(", ")})`;
          note("Construtor: confira os tipos dos parâmetros.", t);
        } else if (isAccessor) {
          const prop = cls.root ? membersOf(cls.root).find((m) => m.n === name && m.k === "p") : null;
          const ind = indentOf(t);
          header = `public ${staticNext ? "static " : prop && (prop.v || prop.a) ? "override " : ""}${prop ? prop.t : "object"} ${name}\n${ind}{\n${ind}    ${t.v}`;
          frameInfo.indent = ind;
          frameInfo.extraClose = true;
          if (!prop) note(`Propriedade ${name}: confira o tipo.`, t);
        } else {
          const hook = !staticNext && cls.root ? csHookFor(cls.root, nameTok.v, jsParams) : null;
          if (hook) {
            const csParams = hook.params;
            let js = jsParams;
            // O primeiro parâmetro do JS costuma ser a entidade, que em C# é a propriedade da classe.
            if (hook.extra >= 1 && (hook.extra === 1 || JS_PARAM_TYPES[jsParams[0]] === cls.entity || jsParams[0] === "proj")) {
              if (cls.entity) frameInfo.renames.set(jsParams[0], cls.entity);
              else note(`O parâmetro ${jsParams[0]} não existe em C#: use a propriedade da classe.`, t);
              js = jsParams.slice(1);
            }
            const sameCount = js.length === csParams.length;
            if (!sameCount) {
              // Parâmetros soltos que em C# vêm dentro de outro, como hitDirection em hit.HitDirection.
              const hitParam = csParams.find((p) => /HitInfo$/.test(p.type));
              for (const name of js.slice(csParams.length > 0 ? 0 : js.length)) {
                if (csParams.some((p) => p.name === name)) continue;
                const field = hitParam && { hitDirection: "HitDirection", damage: "Damage", crit: "Crit", knockBack: "Knockback", knockback: "Knockback" }[name];
                if (field) frameInfo.renames.set(name, `${hitParam.name}.${field}`);
              }
              if (js.some((name) => !csParams.some((p) => p.name === name) && !frameInfo.renames.has(name))) note(`${name} tem outros parâmetros em C#: ${hook.m.p}.`, t);
            }
            const list = csParams.map((p, i) => {
              const pname = sameCount && /^[A-Za-z_]\w*$/.test(js[i]) ? js[i] : p.name;
              if (p.mod === "ref" || p.mod === "out") frameInfo.refs.add(pname);
              return `${p.mod ? p.mod + " " : ""}${p.type} ${pname}`;
            });
            header = `public override ${hook.m.t} ${hook.m.n}(${list.join(", ")})`;
          } else {
            header = `public ${staticNext ? "static " : ""}void ${name}(${jsParams.map((p) => "object " + p).join(", ")})`;
            if (!cls.own.has(nameTok.v) || cls.root) note(`${name} não é um método de ${cls.root || "C#"}: confira o retorno e os tipos dos parâmetros.`, t);
          }
        }
        staticNext = false;
        emit(header);
        const open = close + 1;
        for (let s = ti + 1; s < sigIdx[open]; s++) skip.add(s);
        replaceAt.set(sigIdx[open], "\n" + indentOf(nameTok.v === "get" || nameTok.v === "set" ? t : t) + (frameInfo.extraClose ? "    {" : "{"));
        pendingFrame = frameInfo;
        continue;
      }
      if (t.t === "id" && (next?.v === "=" || next?.v === ";")) {
        let e = k + 2;
        const value = [];
        let depth = 0;
        while (e < sigIdx.length && (depth || sig(e).v !== ";")) { if ("([{".includes(sig(e).v)) depth++; else if (")]}".includes(sig(e).v)) depth--; value.push(sig(e)); e++; }
        const type = next.v === ";" ? "object" : csLiteralType(value);
        if (type === "object") note(`Campo ${name}: confira o tipo.`, t);
        emit(`public ${staticNext ? "static " : ""}${type} ${name}`);
        staticNext = false;
        if (next.v === ";") { emit(";"); skip.add(sigIdx[k + 1]); continue; }
        field = true;
        continue;
      }
      emit(t.v);
      continue;
    }

    // ----- Código: dentro de métodos e campos -----
    if (t.v === "{") {
      emit(replaceAt.get(ti) ?? "{");
      if (pendingFrame) { stack.push(pendingFrame); pendingFrame = null; } else stack.push({ type: "block" });
      continue;
    }
    if (t.v === "}") {
      const f = stack.pop();
      emit("}");
      if (f?.type === "method" && f.extraClose) emit("\n" + f.indent + "}");
      continue;
    }
    if (field && t.v === ";" && stack.length && frame().type === "class") { field = false; emit(";"); continue; }
    const method = stack.slice().reverse().find((f) => f.type === "method") || {};
    const cls = inClass() || {};
    if (t.t === "str") { emit(csString(t)); continue; }
    if (t.t === "num") { emit(/^\d*\.\d+$|^\d+\.\d*$/.test(t.v) ? t.v + "f" : t.v.replace(/n$/, "")); continue; }
    if (t.t === "re") { note("Expressão regular: em C# use System.Text.RegularExpressions.Regex.", t); emit('"' + t.v.replace(/"/g, '\\"') + '"'); continue; }
    if (t.v === "===") { emit("=="); continue; }
    if (t.v === "!==") { emit("!="); continue; }
    if (t.v === "**" || t.v === ">>>") { note(`O operador ${t.v} não existe em C#.`, t); emit(t.v); continue; }
    if (t.t === "id" && prev?.v !== "." && prev?.v !== "?.") {
      if (t.v === "const" || t.v === "let" || t.v === "var") {
        // const Main = Terraria.Main; e const { ItemID } = Terraria.ID; só davam nome a uma classe do jogo.
        let j = k + 1;
        const names = [];
        if (sig(j)?.v === "{") { let s2 = j + 1; for (; s2 < sigIdx.length && sig(s2).v !== "}"; s2++) if (sig(s2).t === "id" && sig(s2 + 1)?.v !== ":") names.push(sig(s2).v); j = s2 + 1; }
        else if (sig(j)?.t === "id") { names.push(sig(j).v); j++; }
        if (sig(j)?.v === "=" && ["Terraria", "Microsoft", "System", "ReLogic"].includes(sig(j + 1)?.v)) {
          let e = j + 1;
          const path = [];
          while (sig(e)?.t === "id") { path.push(sig(e).v); if (sig(e + 1)?.v === ".") e += 2; else { e++; break; } }
          if (sig(e)?.v === ";" && (T[path[path.length - 1]] || isJsNamespace(path.join(".")))) {
            const last = path[path.length - 1];
            const isType = !!T[last];
            const nsPath = isType ? path.slice(0, -1).join(".") : path.join(".");
            if (nsPath) usings.add(nsPath);
            if (names.length === 1 && isType && names[0] !== last) ctx.aliases.set(names[0], { kind: "type", name: last });
            for (let s2 = sigIdx[k]; s2 <= sigIdx[e]; s2++) skip.add(s2);
            continue;
          }
        }
        if (next?.v === "{" || next?.v === "[") note("Desestruturação não existe em C#: declare uma variável por vez.", t);
        if (forOf) { emit("var"); continue; }
        emit("var"); continue;
      }
      if (t.v === "for" && next?.v === "(" && ["const", "let", "var"].includes(next2?.v) && sig(k + 4)?.v === "of") { emit("foreach"); forOf = true; continue; }
      if (t.v === "of" && forOf) { emit("in"); forOf = false; continue; }
      if (t.v === "undefined") { emit("null"); continue; }
      if (t.v === "instanceof") { emit("is"); continue; }
      if (["typeof", "function", "await", "async", "delete", "yield"].includes(t.v)) { note(`${t.v} não existe assim em C#.`, t); emit(t.v); continue; }
      if (t.v === "this" && next?.v === "." && (next2?.v === "SetDefaultWeaponStyle" || next2?.v === "SetShopValues") && sig(k + 3)?.v === "(") {
        const close = matchClose(k + 3);
        const args = [];
        let cur = [], depth = 0;
        for (let s2 = k + 4; s2 < close; s2++) { const v = sig(s2).v; if ("([{".includes(v)) depth++; else if (")]}".includes(v)) depth--; if (v === "," && !depth) { args.push(cur); cur = []; } else cur.push(sig(s2)); }
        if (cur.length) args.push(cur);
        const arg = (i, fallback) => (args[i] ? args[i].map((x) => (x.t === "num" && /^\d*\.\d+$/.test(x.v) ? x.v + "f" : x.v)).join("").replace(/^this\./, "") : fallback);
        const ind = indentOf(t);
        if (next2.v === "SetShopValues") emit(`Item.rare = ${arg(0, "0")};\n${ind}Item.value = ${arg(1, "0")}`);
        else {
          const style = /\.shoot\s*=/.test(text) && !/\.melee\s*=\s*true|DamageClass\.Melee/.test(text) ? "Shoot" : "Swing";
          usings.add("Terraria.ID");
          emit(`Item.useTime = ${arg(0, "30")};\n${ind}Item.useAnimation = ${arg(0, "30")};\n${ind}Item.autoReuse = ${arg(1, "false")};\n${ind}Item.useStyle = ItemUseStyleID.${style}`);
        }
        for (let s2 = ti + 1; s2 <= sigIdx[close]; s2++) skip.add(s2);
        continue;
      }
      if (t.v === "ModNPC" && next?.v === "." && next2?.v === "NPCValue") { emit("Item.buyPrice"); skip.add(sigIdx[k + 1]); skip.add(sigIdx[k + 2]); continue; }
      if (t.v === "this") {
        if (next?.v === "." && next2?.t === "id") {
          skip.add(sigIdx[k + 1]);
          const member = next2.v;
          const own = cls.own?.has(member) || cls.own?.has("#" + member.replace(/^#/, ""));
          if (!own && cls.root && member !== cls.entity && !membersOf(cls.root).some((m) => m.n === member) && cls.entity && membersOf(cls.entity).some((m) => m.n === member)) emit(cls.entity + ".");
          else if (!own && cls.root && member !== cls.entity && !membersOf(cls.root).some((m) => m.n === member) && T[cls.root]) note(`${member} não existe em ${cls.root} no C#.`, next2);
          continue;
        }
        emit("this"); continue;
      }
      if (method.renames?.has(t.v)) { emit(method.renames.get(t.v)); continue; }
      if (method.refs?.has(t.v) && next?.v === "." && next2?.v === "value") { emit(t.v); skip.add(sigIdx[k + 1]); skip.add(sigIdx[k + 2]); continue; }
      if (t.v === "print" && next?.v === "(") { emit("Main.NewText"); usings.add("Terraria"); continue; }
      if (t.v === "bl" && next?.v === ".") {
        const fn = next2?.v;
        skip.add(sigIdx[k + 1]); skip.add(sigIdx[k + 2]);
        if (fn === "log" || fn === "error") { emit(fn === "log" ? "Mod.Logger.Info" : "Mod.Logger.Error"); continue; }
        note(`bl.${fn} só existe no Bunny com JavaScript.`, t);
        emit(`bl.${fn}`); continue;
      }
      if (t.v === "Math" && next?.v === "." && CS_MATH[next2?.v]) {
        skip.add(sigIdx[k + 1]); skip.add(sigIdx[k + 2]);
        emit(CS_MATH[next2.v]);
        if (next2.v === "random") usings.add("Terraria");
        if (next2.v === "PI") usings.add("Microsoft.Xna.Framework");
        continue;
      }
      if (t.v === "Ref" && prev?.v === "new") { note("Ref é do JavaScript: em C#, passe a variável com ref ou out.", t); emit(t.v); continue; }
      const alias = ctx.aliases.get(t.v);
      if (alias?.kind === "method") {
        if (next?.v === "." && next2?.v === "hook" && sig(k + 3)?.v === "(") {
          const close = matchClose(k + 3);
          emit(`On_${alias.type}.${alias.method} += `);
          for (let s = sigIdx[k + 1]; s <= sigIdx[k + 3]; s++) skip.add(s);
          let depth = 0;
          for (let s = k + 4; s < close; s++) { const v = sig(s).v; if ("([{".includes(v)) depth++; else if (")]}".includes(v)) depth--; else if (v === "," && !depth) { note("As opções do hook não existem em C#.", sig(s)); break; } }
          skip.add(sigIdx[close]);
          continue;
        }
        emit(`${alias.type}.${alias.method}`); continue;
      }
      if (alias?.kind === "type") { emit(alias.name); continue; }
      // Terraria.ID.ItemID.X vira ItemID.X, com o using no começo.
      if (["Terraria", "Microsoft", "System", "ReLogic"].includes(t.v) && next?.v === ".") {
        let path = t.v, j = k + 1;
        while (sig(j)?.v === "." && sig(j + 1)?.t === "id" && isJsNamespace(path + "." + sig(j + 1).v)) { path += "." + sig(j + 1).v; j += 2; }
        if (sig(j)?.v === "." && sig(j + 1)?.t === "id") {
          usings.add(path);
          for (let s = ti + 1; s <= sigIdx[j]; s++) skip.add(s);
          continue;
        }
      }
      if (t.v === "ModContent" && next?.v === "." && CS_TYPE_CALLS.has(next2?.v) && sig(k + 3)?.v === "(" && sig(k + 5)?.v === ")") {
        const arg = sig(k + 4);
        const cls2 = arg.t === "str" ? arg.v.slice(1, -1) : arg.v;
        emit(`ModContent.${next2.v}<${cls2}>()`);
        for (let s = sigIdx[k + 1]; s <= sigIdx[k + 5]; s++) skip.add(s);
        continue;
      }
      if (CS_TYPE_BY_NAME[t.v] && next?.v === "." && next2?.v === "getTypeByName" && sig(k + 3)?.v === "(" && sig(k + 5)?.v === ")") {
        const arg = sig(k + 4);
        emit(`ModContent.${CS_TYPE_BY_NAME[t.v]}<${arg.t === "str" ? arg.v.slice(1, -1) : arg.v}>()`);
        for (let s = sigIdx[k + 1]; s <= sigIdx[k + 5]; s++) skip.add(s);
        continue;
      }
      if (t.v === "ModItem" && next?.v === "." && next2?.v === "CommonMaxStack") { emit("Item"); continue; }
    }
    if (t.v === "." && next?.t === "id") {
      // .GetModPlayer(X) vira .GetModPlayer<X>()
      if (CS_GENERIC_CALLS.has(next.v) && next2?.v === "(" && sig(k + 3)?.t === "id" && sig(k + 4)?.v === ")") {
        emit(`.${next.v}<${sig(k + 3).v}>()`);
        for (let s = sigIdx[k + 1]; s <= sigIdx[k + 4]; s++) skip.add(s);
        continue;
      }
      // Cor.new(1, 2, 3) vira new Cor(1, 2, 3)
      if (next.v === "new" && next2?.v === "(") {
        const owner = out.pop();
        csLine -= (owner.match(/\n/g) || []).length;
        emit(`new ${owner}`);
        skip.add(sigIdx[k + 1]);
        continue;
      }
      if (next.v === "length") { emit(".Length"); skip.add(sigIdx[k + 1]); continue; }
      if (next.v === "hook" && next2?.v === "(") note("Hook pela ponte do JavaScript: em C# use On_Classe.Metodo += (orig, self, ...) => { ... };", t);
    }
    // Chamada pela assinatura: Main['void NewText(...)'](a) vira Main.NewText(a)
    if (t.v === "[" && next?.t === "str" && /\(/.test(next.v) && next2?.v === "]") {
      const m = /([\w.]+)\s*\(/.exec(next.v);
      if (m && m[1] !== ".ctor") { emit("." + m[1]); skip.add(sigIdx[k + 1]); skip.add(sigIdx[k + 2]); continue; }
      note("Construtor chamado pela assinatura: em C# use new Tipo(...).", t);
    }
    // Lista: [1, 2] vira new[] { 1, 2 }
    if (t.v === "[" && (!prev || ["=", "(", ",", "return", ":", "=>", "?"].includes(prev.v))) {
      const close = matchClose(k);
      if (close === k + 1) { note("Lista vazia: em C# diga o tipo, como new int[0] ou new List<int>().", t); emit("[]"); skip.add(sigIdx[close]); continue; }
      emit("new[] { ");
      replaceAt.set(sigIdx[close], " }");
      continue;
    }
    emit(t.v.startsWith("#") ? "_" + t.v.slice(1) : t.v);
  }
  let cs = out.join("");
  cs = cs.replace(/\b(Item|Projectile)\.(melee|ranged|magic|summon|thrown)\s*=\s*true\b/g, (_, e, c) => `${e}.DamageType = DamageClass.${c === "thrown" ? "Throwing" : c[0].toUpperCase() + c.slice(1)}`);
  cs = cs.replace(/\{\s*X:\s*([^,{}\n]+?),\s*Y:\s*([^,{}\n]+?)\s*\}/g, (_, x, y) => { usings.add("Microsoft.Xna.Framework"); return `new Vector2(${x}, ${y})`; });
  return { cs, notes };
}
