// ---------- Utilidades ----------
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const b64ToBytes = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
const pascal = (id) => String(id).split(/[^A-Za-z0-9]+/).filter(Boolean).map((p) => p[0].toUpperCase() + p.slice(1)).join("") || "MeuMod";
const isText = (path) => /\.(cs|json|md|txt|frag|vert|glsl|pipeline|xml|csv|lang)$/i.test(path);
const newUid = () => (crypto.randomUUID ? crypto.randomUUID() : "xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx".replace(/x/g, () => (Math.random() * 16 | 0).toString(16)));
function toast(text) {
  document.querySelector(".toast")?.remove();
  const el = document.createElement("div");
  el.className = "toast"; el.textContent = text; el.setAttribute("role", "status");
  document.body.append(el);
  setTimeout(() => el.remove(), 3200);
}

