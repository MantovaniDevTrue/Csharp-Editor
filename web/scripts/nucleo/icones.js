// ---------- Ícones em pixel ----------
// Uma única família, 16×16, para os menus e botões terem a mesma cara do resto do app.
const ICONS = {
  open: "M4 2h2v1h2v1h2v1h2v1h2v4h-2v1h-2v1H8v1H6v1H4z",
  edit: "M11 1h2v1h1v1h1v2h-1v1h-1v1h-1v1h-1v1H9v1H8v1H7v1H6v1H1v-5h1v-1h1V9h1V8h1V7h1V6h1V5h1V4h1V3h1V2h1z",
  close: "M2 2h3v1h1v1h1v1h2V4h1V3h1V2h3v3h-1v1h-1v1h-1v2h1v1h1v1h1v3h-3v-1h-1v-1h-1v-1H7v1H6v1H5v1H2v-3h1v-1h1v-1h1V7H4V6H3V5H2z",
  copy: "M5 1h9v10h-3v4H2V5h3zM7 3v2h4v4h1V3zM4 7v6h5V7z",
  grid: "M1 1h14v14H1zM3 3v3h3V3zM8 3v3h5V3zM3 8v5h3V8zM8 8v5h5V8z",
  path: "M3 1h7v1h1v1h1v1h1v11H3zM5 3v10h6V6H9V3zM6 8h4v1H6zM6 10h4v1H6z",
  fit: "M1 1h5v2H3v3H1zM10 1h5v5h-2V3h-3zM1 10h2v3h3v2H1zM13 10h2v5h-5v-2h3z",
  preview: "M2 2h12v12H2zM4 4v8h8V4zM6 6h4v4H6z",
  size: "M1 1h6v2H4v1h1v1h1v1h1v1h2V6h1V5h1V4h1V3H9V1h6v6h-2V5h-1v1h-1v1h-1v2h1v1h1v1h1v-2h2v6H9v-2h3v-1h-1v-1h-1V9H9v1H7V9H6v1H5v1H4v1h3v2H1V9h2v2h1v-1h1V9h1V7H5V6H4V5H3v2H1z",
  export: "M7 1h2v1h1v1h1v1h1v2H9v5H7V6H4V4h1V3h1V2h1zM2 11h2v2h8v-2h2v4H2z",
  importar: "M7 1h2v6h3v2h-1v1h-1v1H9v1H7v-1H6v-1H5V9H4V7h3zM2 11h2v2h8v-2h2v4H2z",
  move: "M1 3h6v1h1v1h7v8H1zM8 7v2H4v2h4v2h1v-1h1v-1h1V9h-1V8H9V7z",
  rotate: "M6 2h5v1h1v1h1V2h2v5h-5V5h2V4h-1V3H6v1H5v1H4v5h1v1h1v1h5v-1h1v-1h2v2h-1v1h-1v1H5v-1H4v-1H3v-1H2V5h1V4h1V3h2z",
  flipv: "M7 1h2v1h1v1h1v2H9v2H7V5H5V3h1V2h1zM1 7h14v2H1zM7 10h2v1h2v2h-1v1H9v1H7v-1H6v-1H5v-2h2z",
  fliph: "M1 7h1V6h1V5h2v2h2V5h2v2h2V5h2v1h1v1h1v2h-1v1h-1v1h-2V9H9v2H7V9H5v2H3v-1H2V9H1z",
  plus: "M6 2h4v4h4v4h-4v4H6v-4H2V6h4z",
  dots: "M6 2h4v3H6zM6 7h4v3H6zM6 12h4v3H6z",
  undo: "M6 2h2v2h3v1h2v1h1v2h1v5h-2v-1h-1v-1h-1V9H8v3H6v-1H5v-1H4V9H3V8H2V6h1V5h1V4h1V3h1z",
  redo: "M8 2h2v1h1v1h1v1h1v1h1v2h-1v1h-1v1h-1v1h-1v1H8V9H5v2H4v1H3v1H1V8h1V6h1V5h2V4h3z",
  up: "M7 3h2v1h1v1h1v1h1v1h1v2h-2V8h-1V7h-1v6H7V7H6v1H5v1H3V7h1V6h1V5h1V4h1z",
  down: "M7 3h2v6h1V8h1V7h2v2h-1v1h-1v1h-1v1H9v1H7v-1H6v-1H5v-1H4V9H3V7h2v1h1v1h1z",
  caret: "M5 2h2v2h2v2h2v2h1v1h-1v2H9v2H7v2H5z",
  send: "M1 2h2v1h2v1h2v1h2v1h2v1h2v1h2v1h-2v1h-2v1H9v1H7v1H5v1H3v1H1v-5h6V8H1z",
  folder: "M1 3h6v2h8v9H1z",
  save: "M1 1h11v1h1v1h1v1h1v11H1zM4 3v3h6V3zM4 9v4h8V9z",
  fonte: "M3 2h10v3h-2V4H9v8h1v2H6v-2h1V4H5v1H3z",
  texture: "M1 1h7v7H1zM8 8h7v7H8zM8 1h7v7H8zM10 3v3h3V3zM1 8h7v7H1zM3 10v3h3v-3z",
  search: "M5 1h5v1h1v1h1v5h-1v1h-1v1h1v1h1v1h1v1h1v2h-2v-1h-1v-1h-1v-1H9v-1H5v-1H4V9H3V8H2V3h1V2h2zM5 3v1H4v3h1v1h4V7h1V4H9V3z",
};
const icon = (name, cls = "") => `<svg class="pxi ${cls}" viewBox="0 0 16 16" aria-hidden="true" shape-rendering="crispEdges"><path fill="currentColor" fill-rule="evenodd" d="${ICONS[name]}"/></svg>`;
const GLYPH_ICONS = { "✎": "edit", "✕": "close", "▶": "open", "⧉": "copy", "▦": "grid", "⎘": "path", "⛶": "fit", "▫": "preview", "▣": "size", "⇪": "export", "⇥": "move", "↻": "rotate", "↕": "flipv", "↔": "fliph", "+": "plus" };
const sheetGlyph = (glyph) => (GLYPH_ICONS[glyph] ? icon(GLYPH_ICONS[glyph]) : `<b>${esc(glyph || "")}</b>`);
