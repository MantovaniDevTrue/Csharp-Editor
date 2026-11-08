// ---------- Lexer de JavaScript ----------
// Mesmo formato de token do lexer de C# ({ t, s, e, v }), para o editor pintar e ler do mesmo jeito.
const JS_KEYWORDS = new Set("async await break case catch class const continue debugger default delete do else export extends false finally for from function get if import in instanceof let new null of return set static super switch this throw true try typeof undefined var void while with yield".split(" "));
const JS_OPERATORS = [">>>=", "...", "===", "!==", "**=", "<<=", ">>=", ">>>", "&&=", "||=", "??=", "=>", "==", "!=", "<=", ">=", "&&", "||", "??", "?.", "++", "--", "+=", "-=", "*=", "/=", "%=", "&=", "|=", "^=", "**", "<<", ">>"];

function lexJs(src) {
  const tokens = [], errors = [];
  const n = src.length;
  let i = 0;
  const push = (t, s, e) => tokens.push({ t, s, e, v: src.slice(s, e) });
  // Uma barra começa uma regex quando não vem depois de um valor.
  const regexAllowed = () => {
    for (let k = tokens.length - 1; k >= 0; k--) {
      const t = tokens[k];
      if (t.t === "ws" || t.t === "com") continue;
      if (t.t === "num" || t.t === "str" || t.t === "re") return false;
      if (t.t === "id") return JS_KEYWORDS.has(t.v) && !["this", "super", "null", "true", "false", "undefined"].includes(t.v);
      return !")]}".includes(t.v);
    }
    return true;
  };
  function skipQuoted(pos, quote) {
    let p = pos + 1;
    while (p < n) {
      const c = src[p];
      if (c === "\\") { p += 2; continue; }
      if (c === quote) return p + 1;
      if (c === "\n") break;
      p++;
    }
    errors.push({ at: pos, msg: "Texto sem aspas de fechamento." });
    return p;
  }
  // Template: `texto ${expressão} texto`, com templates e chaves dentro da expressão.
  function skipTemplate(pos) {
    let p = pos + 1;
    while (p < n) {
      const c = src[p];
      if (c === "\\") { p += 2; continue; }
      if (c === "`") return p + 1;
      if (c === "$" && src[p + 1] === "{") {
        p += 2;
        let depth = 1;
        while (p < n && depth) {
          const d = src[p];
          if (d === "'" || d === '"') { p = skipQuoted(p, d); continue; }
          if (d === "`") { p = skipTemplate(p); continue; }
          if (d === "{") depth++;
          else if (d === "}") depth--;
          p++;
        }
        continue;
      }
      p++;
    }
    errors.push({ at: pos, msg: "Template ` sem fechamento." });
    return n;
  }
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (c === "\n") { push("ws", i, ++i); continue; }
    if (c === " " || c === "\t" || c === "\r" || c === "﻿") { const s = i; while (i < n && " \t\r﻿".includes(src[i])) i++; push("ws", s, i); continue; }
    if (c === "/" && d === "/") { const s = i; while (i < n && src[i] !== "\n") i++; push("com", s, i); continue; }
    if (c === "/" && d === "*") {
      const s = i, end = src.indexOf("*/", i + 2);
      if (end < 0) { errors.push({ at: s, msg: "Comentário /* sem fechamento." }); i = n; } else i = end + 2;
      push("com", s, i); continue;
    }
    if (c === "'" || c === '"') { const s = i; i = skipQuoted(i, c); push("str", s, i); continue; }
    if (c === "`") { const s = i; i = skipTemplate(i); push("str", s, i); continue; }
    if (c === "/" && regexAllowed()) {
      let p = i + 1, inClass = false;
      while (p < n && src[p] !== "\n") {
        if (src[p] === "\\") { p += 2; continue; }
        if (src[p] === "[") inClass = true;
        else if (src[p] === "]") inClass = false;
        else if (src[p] === "/" && !inClass) break;
        p++;
      }
      if (src[p] === "/") { p++; while (p < n && /[a-z]/i.test(src[p])) p++; push("re", i, p); i = p; continue; }
    }
    if (/[0-9]/.test(c) || (c === "." && /[0-9]/.test(d || ""))) {
      const m = /^(0[xX][0-9a-fA-F_]+|0[bB][01_]+|0[oO][0-7_]+|[0-9_]*\.?[0-9_]+(?:[eE][+-]?[0-9_]+)?n?)/.exec(src.slice(i, i + 80));
      const size = m ? Math.max(m[0].length, 1) : 1; push("num", i, i + size); i += size; continue;
    }
    if (/[\p{L}_$#]/u.test(c)) { const s = i; i++; while (i < n && /[\p{L}\p{N}_$]/u.test(src[i])) i++; push("id", s, i); continue; }
    const op = JS_OPERATORS.find((o) => src.startsWith(o, i));
    if (op) { push("op", i, i + op.length); i += op.length; continue; }
    push("op", i, ++i);
  }
  return { tokens, errors };
}
function classifyJs(tokens, i) {
  const t = tokens[i];
  if (t.t === "com") return "com";
  if (t.t === "str" || t.t === "re") return "str";
  if (t.t === "num") return "num";
  if (t.t !== "id") return "";
  if (JS_KEYWORDS.has(t.v)) return "kw";
  let p = i - 1;
  while (tokens[p]?.t === "ws") p--;
  const afterDot = tokens[p]?.v === "." || tokens[p]?.v === "?.";
  if (!afterDot && (JSI.classes[t.v] || JSI.globals.includes(t.v))) return "sdk";
  let k = i + 1;
  while (tokens[k]?.t === "ws") k++;
  if (tokens[k]?.v === "(") return "fn";
  return /^[A-Z]/.test(t.v) ? "ty" : "";
}
// Os tokens que contam: sem espaço e sem comentário.
const jsSignificant = (text) => lexJs(text).tokens.filter((t) => t.t !== "ws" && t.t !== "com");
