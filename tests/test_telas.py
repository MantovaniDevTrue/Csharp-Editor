"""Mede cada tela em celulares pequenos e grandes, na horizontal e em tablet.

O WebView fica com TextZoom 100, entao a fonte do sistema nao muda o layout. O "tamanho de exibicao" do
Android muda a largura em pixels de CSS, e por isso as telas estreitas estao na lista.
"""
from __future__ import annotations

from support import *  # noqa: F403

SCREENS = [("320x568", 320, 568, 1), ("360x640", 360, 640, 1), ("412x915", 412, 915, 1), ("480x320", 480, 320, 1), ("640x360", 640, 360, 1),
           ("915x412", 915, 412, 1), ("600x960", 600, 960, 1), ("800x1280", 800, 1280, 1), ("1280x800", 1280, 800, 1), ("280x653", 280, 653, 1)]

# O que sai da tela de verdade: rolagem da pagina, controle cortado sem poder rolar ate ele.
AUDIT = """(scope) => {
  const root = scope ? document.querySelector(scope) : document.body;
  const bad = [];
  const doc = document.documentElement;
  if (doc.scrollWidth > innerWidth + 1) bad.push('pagina rola para o lado: ' + doc.scrollWidth + ' de ' + innerWidth);
  const name = (el) => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.className && el.className.baseVal === undefined ? '.' + String(el.className).split(' ')[0] : '') + ' "' + (el.textContent || '').trim().slice(0, 18) + '"';
  const scroller = (el) => { for (let p = el.parentElement; p; p = p.parentElement) { const s = getComputedStyle(p); if (/(auto|scroll)/.test(s.overflowX + s.overflowY) && (p.scrollWidth > p.clientWidth || p.scrollHeight > p.clientHeight)) return true; } return false; };
  for (const el of root.querySelectorAll('button, input, select, textarea, h1, h2, label, [role=button]')) {
    if (el.closest('[hidden]') || el.closest('#scene')) continue;
    const s = getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden') continue;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    if ((r.right > innerWidth + 1 || r.left < -1 || r.bottom > innerHeight + 1 || r.top < -1) && !scroller(el)) bad.push('cortado: ' + name(el) + ' ' + [r.left, r.top, r.right, r.bottom].map(Math.round));
    if (el.tagName === 'BUTTON' && el.scrollWidth > el.clientWidth + 2 && s.overflow !== 'hidden') bad.push('texto sai do botao: ' + name(el));
  }
  return bad.slice(0, 8);
}"""


def test_screens(browser, url: str, shots: Path | None) -> None:
    for label, width, height, font in SCREENS:
        context = browser.new_context(viewport={"width": width, "height": height}, has_touch=True, device_scale_factor=1)
        page = context.new_page()
        page.set_default_timeout(6000)
        print(f"     (tela {label})", flush=True)
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.add_init_script(FAKE_ANDROID)
        page.goto(url)
        page.wait_for_selector("#tree .row.file", state="attached")
        def measure(where, scope=None):
            page.wait_for_timeout(260)
            bad = page.evaluate(AUDIT, scope)
            check(not bad, f"{label}: {where}", bad)
            if shots:
                page.screenshot(path=str(shots / f"tela-{label.replace(' ', '_')}-{where}.png"))
        for view in ("files", "code", "snips", "out"):
            page.evaluate("(v) => setView(v)", view)
            measure(view)
        if page.locator("#menuBtn").is_visible():
            page.click("#menuBtn")
            measure("barra", "#drawer")
            page.click("#drawerClose")
        page.evaluate("setView('files')")
        page.click("#settingsBtn")
        measure("configuracoes", "#settings")
        page.evaluate("document.querySelector('#settings').close()")
        page.evaluate("() => { window.bunnyStudio.openModSearch('Item'); }")
        measure("busca-no-mod", "#modSearch")
        page.evaluate("document.querySelector('#modSearch').close()")
        page.evaluate("() => { document.querySelector('#editMod').click(); }")
        measure("dados-do-mod", "#dlg")
        page.evaluate("document.querySelector('#dlg').close('cancel')")
        page.evaluate("() => { newFile(); }")
        measure("dialogo", "#dlg")
        page.evaluate("document.querySelector('#dlg').close('cancel')")
        page.evaluate("() => { newTexture(); }")
        measure("nova-textura", "#dlg")
        page.evaluate("document.querySelector('#dlg').close('cancel')")
        page.evaluate("""() => {
          settings.liveOpen = true;
          files()['Content/Items/Previa.cs'] = 'using Terraria;\\nusing Terraria.ModLoader;\\nnamespace M.Content.Items;\\npublic class Previa : ModItem\\n{\\n    public override void SetDefaults()\\n    {\\n        Item.damage = 50;\\n        Item.crit = 6;\\n        Item.useTime = 20;\\n        Item.useAnimation = 20;\\n        Item.knockBack = 6;\\n    }\\n}\\n';
          openFile('Content/Items/Previa.cs'); setView('code');
        }""")
        measure("previa-viva", "#codePane")
        room = page.evaluate("document.querySelector('#ed').getBoundingClientRect().height")
        check(room >= (70 if height >= 600 else 28), f"{label}: previa deixa espaco para o codigo", room)
        page.evaluate("settings.liveOpen = false; delete files()['Content/Items/Previa.cs']; openFile('manifest.json')")
        keep = page.evaluate("state.uid")
        page.evaluate("(async () => { const m = starterJsMod('tela_js', 'Tela JS'); state.mods[m.uid] = m; await switchMod(m.uid); setView('files'); })()")
        page.wait_for_function("isJsProject()")
        measure("projeto-js", "#filesPane")
        page.evaluate("openConverter()")
        page.wait_for_selector("#convert[open]")
        measure("conversor", "#convert")
        foot = page.evaluate("(() => { const b = document.querySelector('#cvCreate').getBoundingClientRect(); return b.bottom <= innerHeight + 1 && b.height > 0; })()")
        check(foot, f"{label}: botao do conversor visivel")
        page.evaluate("$('convert').close()")
        page.evaluate("(uid) => { const old = state.uid; return switchMod(uid).then(() => { delete state.mods[old]; store.remove(old); }); }", keep)
        page.wait_for_function("(uid) => state.uid === uid", arg=keep)
        page.evaluate("openFile('Content/Items/StarterMaterial.png'); setView('code')")
        page.evaluate("window.bunnyStudio.openTexture('Content/Items/StarterMaterial.png')")
        page.wait_for_selector("#pixel[open]")
        measure("textura", "#pixel")
        for panel in ("layers", "frames"):
            page.evaluate("(p) => document.querySelector(`[data-panel=${p}]`).click()", panel)
            measure("textura-" + panel, "#pixel")
        page.evaluate("document.querySelector('#pxFront').click()")
        measure("textura-color", "#pixel")
        cursor = page.evaluate("(() => { const a = document.querySelector('#pxSVCursor').getBoundingClientRect(), b = document.querySelector('#pxSV').getBoundingClientRect(), h = document.querySelector('#pxHueCursor').getBoundingClientRect(), g = document.querySelector('#pxHue').getBoundingClientRect(); return a.width > 0 && a.left + 8 >= b.left && a.right - 8 <= b.right && a.top + 8 >= b.top && a.bottom - 8 <= b.bottom && h.width > 0 && h.left + 5 >= g.left && h.right - 5 <= g.right; })()")
        check(cursor, f"{label}: cursores de cor dentro das areas")
        area = page.locator("#pxSV").bounding_box()
        page.mouse.move(area["x"] + area["width"] * .75, area["y"] + area["height"] * .25)
        page.mouse.down()
        page.mouse.move(area["x"] + area["width"] * .5, area["y"] + area["height"] * .5, steps=3)
        moved = page.evaluate("(() => { const a = document.querySelector('#pxSVCursor').getBoundingClientRect(), b = document.querySelector('#pxSV').getBoundingClientRect(); return [(a.left + a.width / 2 - b.left) / b.width, (a.top + a.height / 2 - b.top) / b.height, !document.querySelector('#pxLoupe').hidden]; })()")
        check(abs(moved[0] - .5) < .06 and abs(moved[1] - .5) < .06 and moved[2], f"{label}: cursor segue o dedo e mostra a lupa", moved)
        page.mouse.up()
        check(page.locator("#pxLoupe").is_hidden(), f"{label}: lupa some ao soltar")
        page.evaluate("document.querySelector('#pxFront').click()")
        page.evaluate("document.querySelector('#pixel').close()")
        page.evaluate("window.bunnyStudio.startTour()")
        page.wait_for_selector("#tourNext")
        steps = 0
        while page.locator("#tour").count() and steps < 16:
            page.wait_for_timeout(300)
            box = page.locator(".tourcard").bounding_box()
            check(box and box["y"] >= 0 and box["x"] >= 0 and box["y"] + box["height"] <= height + 1 and box["x"] + box["width"] <= width + 1, f"{label}: tutorial passo {steps + 1} cabe", box)
            page.click("#tourNext")
            steps += 1
        check(not errors, f"{label}: sem erro de JavaScript", errors)
        context.close()
