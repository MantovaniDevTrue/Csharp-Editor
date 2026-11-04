// ---------- Lexer de C# 12 ----------
const KEYWORDS = new Set("abstract as base break case catch checked class const continue default delegate do else enum event explicit extern false finally fixed for foreach get goto if implicit in init interface internal is lock namespace new null operator out override params partial private protected public readonly record ref required return sealed set sizeof stackalloc static struct switch this throw true try typeof unchecked unsafe using value var virtual void volatile when where while with yield nameof global".split(" "));
const PRIMITIVES = new Set("bool byte char decimal double float int long nint nuint object sbyte short string uint ulong ushort dynamic".split(" "));
const OPERATORS = ["<<=", ">>=", "??=", "=>", "==", "!=", "<=", ">=", "&&", "||", "++", "--", "+=", "-=", "*=", "/=", "%=", "&=", "|=", "^=", "??", "?.", "::", "<<", ">>"];
const isIdStart = (c) => /[\p{L}_@]/u.test(c);
const isIdPart = (c) => /[\p{L}\p{N}_]/u.test(c);

function lex(src) {
  const tokens = [], errors = [];
  const n = src.length;
  let i = 0;
  const push = (t, s, e) => tokens.push({ t, s, e, v: src.slice(s, e) });

  // Pula strings a partir de i (aponta para as aspas ou prefixos). Devolve fim.
  function skipString(pos, start) {
    let p = pos, verbatim = false, interp = false;
    while (src[p] === "$" || src[p] === "@") { if (src[p] === "$") interp = true; else verbatim = true; p++; }
    let quotes = 0;
    while (src[p + quotes] === '"') quotes++;
    if (quotes >= 3) { // string bruta
      const dollars = pos === p ? 0 : (src.slice(pos, p).match(/\$/g) || []).length;
      p += quotes;
      const close = '"'.repeat(quotes);
      while (p < n) {
        if (src.startsWith(close, p)) { p += quotes; while (src[p] === '"') p++; return p; }
        if (interp && src[p] === "{") {
          let run = 0; while (src[p + run] === "{") run++;
          if (run >= dollars) { p = skipInterp(p + run, Math.max(dollars, 1), start); continue; }
          p += run; continue;
        }
        p++;
      }
      errors.push({ at: start, msg: "String bruta sem fechamento." });
      return n;
    }
    p += 1;
    while (p < n) {
      const c = src[p];
      if (verbatim) {
        if (c === '"') { if (src[p + 1] === '"') { p += 2; continue; } return p + 1; }
      } else {
        if (c === "\\") { p += 2; continue; }
        if (c === '"') return p + 1;
        if (c === "\n" && !interp) break;
        if (c === "\n") break;
      }
      if (interp && c === "{") {
        if (src[p + 1] === "{") { p += 2; continue; }
        p = skipInterp(p + 1, 1, start); continue;
      }
      if (interp && c === "}" && src[p + 1] === "}") { p += 2; continue; }
      p++;
    }
    errors.push({ at: start, msg: "String sem aspas de fechamento." });
    return p;
  }
  // Expressão dentro de {} interpolado, com strings aninhadas.
  function skipInterp(pos, closers, start) {
    let p = pos, depth = 0;
    while (p < n) {
      const c = src[p];
      if (c === '"' || (c === "$" && /["@$]/.test(src[p + 1] || "")) || (c === "@" && src[p + 1] === '"')) { p = skipString(p, start); continue; }
      if (c === "'" ) { const m = /^'(\\.[^']*|[^\\'\n])'/.exec(src.slice(p, p + 12)); if (m) { p += m[0].length; continue; } }
      if (c === "(" || c === "[" || c === "{") depth++;
      else if (c === ")" || c === "]") depth--;
      else if (c === "}") {
        if (depth === 0) { let q = p; let k = 0; while (src[q] === "}" && k < closers) { q++; k++; } return q; }
        depth--;
      }
      p++;
    }
    return n;
  }

  let lineStart = true;
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (c === "\n") { push("ws", i, ++i); lineStart = true; continue; }
    if (c === " " || c === "\t" || c === "\r" || c === "﻿") { const s = i; while (i < n && " \t\r﻿".includes(src[i])) i++; push("ws", s, i); continue; }
    if (c === "#" && lineStart) { const s = i; while (i < n && src[i] !== "\n") i++; push("pp", s, i); continue; }
    lineStart = false;
    if (c === "/" && d === "/") { const s = i; while (i < n && src[i] !== "\n") i++; push("com", s, i); continue; }
    if (c === "/" && d === "*") {
      const s = i, end = src.indexOf("*/", i + 2);
      if (end < 0) { errors.push({ at: s, msg: "Comentário /* sem fechamento." }); i = n; } else i = end + 2;
      push("com", s, i); continue;
    }
    if (c === '"' || (c === "$" && /["@$]/.test(d || "")) || (c === "@" && (d === '"' || (d === "$" && src[i + 2] === '"')))) {
      const s = i; i = skipString(i, s); push("str", s, i); continue;
    }
    if (c === "'") {
      const m = /^'(\\(?:u[0-9a-fA-F]{4}|U[0-9a-fA-F]{8}|x[0-9a-fA-F]{1,4}|.)|[^\\'\n])'/.exec(src.slice(i, i + 14));
      if (m) { push("str", i, i + m[0].length); i += m[0].length; continue; }
      errors.push({ at: i, msg: "Literal de caractere inválido." });
      push("op", i, ++i); continue;
    }
    if (/[0-9]/.test(c) || (c === "." && /[0-9]/.test(d || ""))) {
      const m = /^(0[xX][0-9a-fA-F_]+|0[bB][01_]+|[0-9_]*\.?[0-9_]+(?:[eE][+-]?[0-9_]+)?)([uUlLfFdDmM]{0,2})/.exec(src.slice(i, i + 80));
      const size = m ? Math.max(m[0].length, 1) : 1; push("num", i, i + size); i += size; continue;
    }
    if (isIdStart(c)) { const s = i; i++; while (i < n && isIdPart(src[i])) i++; push("id", s, i); continue; }
    const op = OPERATORS.find((o) => src.startsWith(o, i));
    if (op) { push("op", i, i + op.length); i += op.length; continue; }
    push("op", i, ++i);
  }
  return { tokens, errors };
}

