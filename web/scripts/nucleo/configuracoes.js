// ---------- Configurações ----------
const SETTING_DEFAULTS = { wrap: false, fontSize: 14, indent: 4, lineNumbers: true, currentLine: true, autoPairs: true, suggest: true, live: true, warm: true, scene: true, weather: "auto", cycle: "clock", typeFx: "glow", anims: true, haptics: true };
const settings = { ...SETTING_DEFAULTS };
try { Object.assign(settings, JSON.parse(localStorage.getItem("bunny-studio-settings") || "{}")); } catch { /* usa os padrões */ }
const indentUnit = () => " ".repeat(settings.indent);
function saveSettings() { try { localStorage.setItem("bunny-studio-settings", JSON.stringify(settings)); } catch { /* conveniência */ } }
function applySettings() {
  document.body.classList.toggle("wrap", settings.wrap);
  document.body.classList.toggle("noanim", !settings.anims);
  document.body.classList.toggle("nocur", !settings.currentLine);
  document.documentElement.style.setProperty("--code-size", settings.fontSize + "px");
  document.documentElement.style.setProperty("--code-line", Math.round(settings.fontSize * 1.55) + "px");
  document.querySelector(".gutter").style.display = settings.lineNumbers ? "" : "none";
  const textarea = $("src");
  textarea.setAttribute("wrap", settings.wrap ? "soft" : "off");
  textarea.style.tabSize = hlEl().style.tabSize = settings.indent;
  if (state.uid && state.active && typeof files()[state.active] === "string") { measure(); textarea.scrollLeft = 0; render(); }
  if (!settings.live) { state.live = []; }
  if (scene.g && !settings.scene) scene.draw(performance.now(), 0);
}
const hlEl = () => $("hl");
function haptic(kind = "tap") { if (settings.haptics && window.BunnyAndroid?.haptic) { try { window.BunnyAndroid.haptic(kind); } catch { /* opcional */ } } }

