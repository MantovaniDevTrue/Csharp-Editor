// ---------- Verificação de mods em JavaScript ----------
// JavaScript não é compilado: o Bunny só acha um erro quando o jogo roda o código.
// Aqui o acorn lê cada arquivo (sintaxe), e o índice da API confere classes, métodos e campos.
// Campos que o jogo tem e a API de C# não lista, mas que a ponte do JavaScript lê.
const JS_ONLY_FIELDS = { Item: ["melee", "ranged", "magic", "summon", "thrown", "sentry"], Projectile: ["melee", "ranged", "magic", "minion", "thrown", "sentry"] };
const JS_PARSE = { ecmaVersion: 2022, sourceType: "module", locations: true, allowHashBang: true };

function jsSyntaxProblem(path, text, error) {
  const loc = error.loc || { line: 1, column: 0 };
  const line = loc.line, col = loc.column + 1;
  const lines = text.split("\n");
  const here = lines[line - 1] ?? "";
  const ch = here[loc.column] ?? "";
  const raw = String(error.message).replace(/\s*\(\d+:\d+\)$/, "");
  const base = { sev: "error", path, line, col, code: "js", known: true, msg: raw };
  const atEnd = error.pos >= text.trimEnd().length;
  let m;
  if (atEnd && /Unexpected token/.test(raw)) {
    const opens = (text.match(/[{(\[]/g) || []).length - (text.match(/[})\]]/g) || []).length;
    return { ...base, title: "O arquivo terminou antes da hora", why: opens > 0 ? `Sobrou ${opens === 1 ? "uma chave, parêntese ou colchete aberto" : opens + " chaves, parênteses ou colchetes abertos"}. Feche cada { com }, cada ( com ) e cada [ com ].` : "Falta fechar alguma coisa antes do fim do arquivo." };
  }
  if ((m = /^Unexpected token/.exec(raw))) {
    const prev = text.slice(0, error.pos).trimEnd().slice(-1);
    if (ch === "}" && prev === ",") return { ...base, title: "Tem uma vírgula sobrando", why: "Antes de } não pode haver vírgula em uma lista de argumentos." };
    if (/[\w)\]'"`]/.test(prev) && /[\w'"`]/.test(ch)) return { ...base, title: "Falta uma vírgula, um operador ou um ponto e vírgula", why: `Dois valores ficaram lado a lado sem nada entre eles, antes de "${ch}".` };
    return { ...base, title: ch ? `O JavaScript não esperava "${ch}" aqui` : "O JavaScript não esperava isto aqui", why: "Confira se falta vírgula, parêntese ou chave logo antes, ou se tem um sobrando." };
  }
  if ((m = /^Unexpected character '(.+)'/.exec(raw))) return { ...base, title: `O caractere "${m[1]}" não vale em JavaScript`, why: "Pode ser uma aspa curva copiada de outro app (“ ” ‘ ’). Troque por \" ou '." };
  if (/^Unterminated string constant/.test(raw)) return { ...base, title: "Um texto ficou sem aspas de fechamento", why: "Todo texto que abre com ' ou \" fecha com a mesma aspa, na mesma linha.", good: here.trimEnd() + (here.includes("'") ? "'" : '"'), fix: { kind: "line", line, text: here.trimEnd().replace(/(['"])([^'"]*)$/, "$1$2$1") } };
  if (/^Unterminated template/.test(raw)) return { ...base, title: "Um texto com ` ficou sem fechar", why: "Todo texto que abre com ` precisa fechar com outra `." };
  if (/^Unterminated comment/.test(raw)) return { ...base, title: "Um comentário /* ficou sem fechar", why: "Feche o comentário com */." };
  if (/^Unterminated regular expression/.test(raw)) return { ...base, title: "Uma barra / ficou sem par", why: "Uma barra sozinha começa uma expressão regular. Se era divisão, confira o que vem antes dela." };
  if ((m = /^Identifier '(.+)' has already been declared/.exec(raw))) return { ...base, title: `O nome ${m[1]} já foi declarado`, why: "Cada const, let ou class precisa de um nome que ainda não existe no mesmo bloco. Renomeie um dos dois." };
  if (/'return' outside of function/.test(raw)) return { ...base, title: "Um return ficou fora de um método", why: "Confira as chaves: provavelmente um } fechou o método antes da hora." };
  if ((m = /^Unexpected keyword '(.+)'/.exec(raw)) || (m = /^The keyword '(.+)' is reserved/.exec(raw))) return { ...base, title: `"${m[1]}" é uma palavra reservada aqui`, why: "Ela não pode ser usada como nome, e talvez falte algo antes dela." };
  if (/Assigning to rvalue/.test(raw)) return { ...base, title: "Este lado do = não recebe valor", why: "À esquerda do = vai um nome ou um campo, como this.Item.damage. Para comparar, use ===." };
  if (/Unexpected reserved word/.test(raw)) return { ...base, title: "Palavra reservada fora do lugar", why: "Um await, por exemplo, só vale dentro de uma função async." };
  if (/'import' and 'export' may only appear at the top level/.test(raw)) return { ...base, title: "import e export só valem no começo do arquivo", why: "Eles não podem ficar dentro de uma classe ou de um método. Confira se uma chave } ficou faltando antes." };
  if ((m = /^Duplicate export '(.+)'/.exec(raw))) return { ...base, title: `${m[1]} foi exportado duas vezes`, why: "Cada nome é exportado uma vez só por arquivo." };
  if (/Invalid regular expression/.test(raw)) return { ...base, title: "Expressão regular inválida", why: raw };
  return { ...base, title: "Erro de escrita no JavaScript", why: `O leitor de JavaScript parou aqui: ${raw}.` };
}
function walkJs(node, visit, parent = null) {
  if (!node || typeof node.type !== "string") return;
  visit(node, parent);
  for (const key in node) {
    if (key === "loc" || key === "start" || key === "end") continue;
    const value = node[key];
    if (Array.isArray(value)) { for (const child of value) if (child && typeof child.type === "string") walkJs(child, visit, node); }
    else if (value && typeof value.type === "string") walkJs(value, visit, node);
  }
}
function resolveJsImport(from, spec) {
  if (!spec.startsWith(".")) return null;
  const parts = from.split("/").slice(0, -1);
  for (const piece of spec.split("/")) {
    if (piece === "." || !piece) continue;
    if (piece === "..") parts.pop(); else parts.push(piece);
  }
  return parts.join("/");
}
// O que cada arquivo exporta e as classes que declara, para conferir import e extends entre arquivos.
function jsProjectShape(all) {
  const shape = new Map();
  for (const [path, text] of Object.entries(all)) {
    if (!isJsSource(path) || typeof text !== "string") continue;
    let ast;
    try { ast = acorn.parse(text, JS_PARSE); } catch { shape.set(path, { ast: null, exports: new Set(), classes: new Map() }); continue; }
    const exports = new Set(), classes = new Map();
    for (const node of ast.body) {
      const decl = node.type === "ExportNamedDeclaration" || node.type === "ExportDefaultDeclaration" ? node.declaration : node;
      if (node.type === "ExportDefaultDeclaration") exports.add("default");
      if (node.type === "ExportNamedDeclaration" && node.specifiers) for (const s of node.specifiers) exports.add(s.exported.name);
      if (!decl) continue;
      const exported = decl !== node;
      if (decl.type === "ClassDeclaration" && decl.id) {
        classes.set(decl.id.name, { node: decl, base: decl.superClass?.type === "Identifier" ? decl.superClass.name : decl.superClass?.type === "MemberExpression" ? null : "", exported });
        if (exported && node.type === "ExportNamedDeclaration") exports.add(decl.id.name);
      }
      if (decl.type === "VariableDeclaration" && exported) for (const d of decl.declarations) if (d.id.type === "Identifier") exports.add(d.id.name);
      if (decl.type === "FunctionDeclaration" && exported && decl.id) exports.add(decl.id.name);
    }
    shape.set(path, { ast, exports, classes });
  }
  return shape;
}
// A classe base de verdade de uma classe do mod, subindo por classes do próprio mod.
function jsRootBase(name, shape, seen = new Set()) {
  if (JSI.classes[name]) return name;
  if (seen.has(name)) return null;
  seen.add(name);
  for (const info of shape.values()) {
    const c = info.classes.get(name);
    if (c?.base) return jsRootBase(c.base, shape, seen);
  }
  return null;
}
function checkJs(all, only = null) {
  const out = [];
  const shape = jsProjectShape(all);
  const allClasses = new Set([...shape.values()].flatMap((info) => [...info.classes.keys()]));
  const entry = jsEntryPath(all);
  for (const [path, info] of shape) {
    if (only && path !== only) continue;
    const text = all[path];
    if (!info.ast) {
      try { acorn.parse(text, JS_PARSE); } catch (error) { out.push(jsSyntaxProblem(path, text, error)); }
      continue;
    }
    const lines = text.split("\n");
    const add = (node, fields) => out.push({ sev: "error", path, line: node.loc.start.line, col: node.loc.start.column + 1, code: "js", known: true, msg: fields.title, ...fields });
    const rename = (node, wrong, right) => {
      const line = lines[node.loc.start.line - 1] ?? "";
      const at = node.loc.start.column;
      const fixed = line.slice(0, at) + line.slice(at).replace(wrong, right);
      return { good: fixed.trim(), fix: { kind: "line", line: node.loc.start.line, text: fixed } };
    };
    const imported = new Set();
    // import: o arquivo existe e exporta o nome pedido.
    for (const node of info.ast.body) {
      if (node.type !== "ImportDeclaration") continue;
      for (const s of node.specifiers) imported.add(s.local.name);
      const target = resolveJsImport(path, node.source.value);
      if (target === null) continue;
      const other = shape.get(target);
      if (!other) { add(node, { title: `O arquivo ${node.source.value} não existe`, why: `O import procura ${target.replace(/^content\//, "")}. Confira a pasta, o nome e o .js no final; maiúsculas e minúsculas contam.` }); continue; }
      for (const s of node.specifiers) {
        const name = s.type === "ImportDefaultSpecifier" ? "default" : s.type === "ImportSpecifier" ? s.imported.name : null;
        if (name && !other.exports.has(name)) {
          const near = closestName(name, [...other.exports].filter((n) => n !== "default"));
          add(s, { title: name === "default" ? `${node.source.value} não tem export default` : `${node.source.value} não exporta ${name}`, why: near ? `Quis dizer ${near}?` : `Coloque export antes da declaração de ${name} no outro arquivo.`, ...(near ? rename(s, name, near) : {}) });
        }
      }
    }
    // Classes: a base existe, e os métodos com nome de gancho estão escritos certo.
    for (const [name, c] of info.classes) {
      const node = c.node;
      if (c.base && !JSI.classes[c.base] && !T[c.base] && !allClasses.has(c.base) && !imported.has(c.base) && !lines.some((l) => new RegExp(`\\b${c.base}\\b\\s*[,}=]`).test(l) && /\bconst\b/.test(l))) {
        const near = closestName(c.base, [...Object.keys(JSI.classes), ...allClasses]);
        if (near) add(node.superClass, { title: `A classe ${c.base} não existe`, why: `Quis dizer ${near}? As classes do Bunny têm os nomes do tModLoader, com maiúsculas.`, ...rename(node.superClass, c.base, near) });
        continue;
      }
      const root = c.base ? jsRootBase(c.base, shape) : null;
      if (!root) continue;
      const known = new Set(jsMembers(root).map((m) => m.n));
      const hooks = jsHooks(root).map((m) => m.n);
      for (const member of node.body.body) {
        if (member.type !== "MethodDefinition" || member.kind !== "method" || member.key.type !== "Identifier") continue;
        const method = member.key.name;
        if (known.has(method) || !/^[A-Z]/.test(method)) continue;
        const near = method.length >= 4 ? closestName(method, hooks.filter((h) => h.length >= 5)) : null;
        if (near) add(member.key, { sev: "warn", title: `${method} não é um método do ${root}`, why: `O jogo nunca chama ${method}. Quis dizer ${near}?`, ...rename(member.key, method, near) });
      }
      // Classes de conteúdo precisam de export para o Bunny registrar sozinho.
      const extended = [...shape.values()].some((other) => [...other.classes.values()].some((x) => x.base === name));
      const manual = node.body.body.some((m) => m.static && m.key?.name === "Autoload");
      if (!c.exported && !extended && !manual && path !== entry && /^content\/(Content|Common)\//.test(path) && /^(Mod|Global)/.test(root) && root !== "Mod") {
        const declared = lines[node.loc.start.line - 1] ?? "";
        add(node, { sev: "warn", title: `A classe ${name} não entra no jogo`, why: "O Bunny só registra sozinho as classes com export. Sem ele, a classe fica de fora, a não ser que você a registre à mão.", good: "export " + declared.trim(), fix: { kind: "line", line: node.loc.start.line, text: declared.replace(/^(\s*)class\b/, "$1export class") } });
      }
    }
    // this.Item.campo: o Bunny dá erro no jogo quando o campo não existe.
    if (sdkComplete) {
      walkJs(info.ast, (node) => {
        if (node.type !== "MemberExpression" || node.computed || node.property.type !== "Identifier") return;
        const obj = node.object;
        if (obj.type !== "MemberExpression" || obj.object.type !== "ThisExpression" || obj.computed || !["Item", "NPC", "Projectile", "Player"].includes(obj.property.name)) return;
        const type = obj.property.name, field = node.property.name;
        const members = membersOf(type).map((m) => m.n);
        if (!members.length || members.includes(field) || (JS_ONLY_FIELDS[type] || []).includes(field)) return;
        const near = closestName(field, members);
        if (near) add(node.property, { sev: "warn", title: `${type} não tem ${field}`, why: `No jogo isso vira "Member with name '${field}' is not found". Quis dizer ${near}?`, ...rename(node.property, field, near) });
      });
    }
    // A classe do mod, no arquivo de entrada.
    if (path === entry) {
      const def = info.ast.body.find((n) => n.type === "ExportDefaultDeclaration");
      const cls = def?.declaration;
      if (!cls || cls.type !== "ClassDeclaration") out.push({ sev: "error", path, line: 1, col: 1, code: "js", known: true, title: "Falta a classe do mod", msg: "Sem export default class.", why: "O arquivo de entrada precisa de export default class, que estende Mod. É por ela que o Bunny carrega o mod.", good: jsModClassSource(manifestOf(mod()).id || "meu_mod") });
      else if (cls.superClass?.type !== "Identifier" || jsRootBase(cls.superClass.name, shape) !== "Mod") add(cls, { title: "A classe do mod precisa estender Mod", why: "export default class Nome extends Mod.", good: `export default class ${cls.id?.name || "MeuMod"} extends Mod {` });
    }
  }
  // O mesmo nome de classe em dois arquivos registra duas vezes.
  if (!only) {
    const seen = new Map();
    for (const [path, info] of shape) for (const [name, c] of info.classes) {
      if (!c.exported) continue;
      // Um item e um bloco podem ter o mesmo nome: cada tipo de conteúdo tem a sua lista.
      const key = (c.base ? jsRootBase(c.base, shape) : "") + ":" + name;
      if (seen.has(key)) out.push({ sev: "error", path, line: c.node.loc.start.line, col: 1, code: "js", known: true, title: `A classe ${name} existe em dois arquivos`, msg: "Classe repetida.", why: `Ela também está em ${seen.get(key).replace(/^content\//, "")}. Renomeie uma das duas.` });
      else seen.set(key, path);
      continue;
      if (seen.has(name)) out.push({ sev: "error", path, line: c.node.loc.start.line, col: 1, code: "js", known: true, title: `A classe ${name} existe em dois arquivos`, msg: "Classe repetida.", why: `Ela também está em ${seen.get(name).replace(/^content\//, "")}. Renomeie uma das duas.` });
      else seen.set(name, path);
    }
  }
  return out;
}
