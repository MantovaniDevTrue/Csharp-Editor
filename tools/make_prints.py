#!/usr/bin/env python3
"""Tira os prints do README com a interface real, na tela de um celular.

    make_prints.py SITE_DIR PASTA_DE_SAIDA
"""
from __future__ import annotations

import functools
import http.server
import sys
import threading
from pathlib import Path

from playwright.sync_api import sync_playwright

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tests"))
from support import FAKE_ANDROID, Quiet  # noqa: E402

# Um desenho pequeno, para o editor de texturas nao aparecer vazio.
SPRITE = """() => {
  const p = window.bunnyStudio.px, rows = [
    '................','....KKK..KKK....','...KRRRKKRRRK...','..KRWRRRRRRRRK..','..KRRRRRRRRDRK..','..KRRRRRRRRDRK..','...KRRRRRRDRK...','....KRRRRDRK....',
    '.....KRRDRK.....','......KRRK......','.......KK.......','................','................','................','................','................'];
  const c = {K: [34, 32, 52, 255], R: [217, 87, 99, 255], D: [172, 50, 50, 255], W: [255, 255, 255, 255]};
  rows.forEach((row, y) => [...row].forEach((v, x) => { if (c[v]) { const i = (y * p.w + x) * 4; p.data.set(c[v], i); } }));
  window.bunnyStudio.pxLayerAction('add');
}"""


def main() -> int:
    site, out = Path(sys.argv[1]), Path(sys.argv[2])
    out.mkdir(parents=True, exist_ok=True)
    handler = functools.partial(Quiet, directory=str(site))
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    url = f"http://127.0.0.1:{server.server_address[1]}/index.html"
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        context = browser.new_context(viewport={"width": 412, "height": 860}, device_scale_factor=2, has_touch=True)
        page = context.new_page()
        page.add_init_script(FAKE_ANDROID)
        page.goto(url)
        page.wait_for_selector("#tree .row.file", state="attached")
        page.evaluate("document.fonts.ready")
        page.wait_for_timeout(800)

        def shot(name: str) -> None:
            page.wait_for_timeout(450)
            page.evaluate("document.querySelector('.toast')?.remove()")
            page.screenshot(path=str(out / f"{name}.png"))

        page.evaluate("setView('files')")
        shot("projeto")
        page.evaluate("files()['Content/Items/Weapons/Lamina.cs'] = ''; openFile('Content/Items/Weapons/Lamina.cs'); setView('code'); src.focus()")
        page.keyboard.type("espada")
        page.wait_for_selector("#pop:not([hidden])")
        shot("autocomplete")
        page.keyboard.press("Tab")
        page.keyboard.press("Escape")
        page.evaluate("src.blur(); setView('code')")
        shot("codigo")
        page.evaluate("setView('snips')")
        shot("modelos")
        # Um engano comum, com a mesma resposta que o compilador real da.
        page.evaluate("""() => {
          openFile('Content/Items/Weapons/Lamina.cs');
          src.value = src.value.replace('Item.width = 40', 'Item.widht = 40'); src.dispatchEvent(new Event('input'));
          const before = src.value.slice(0, src.value.indexOf('widht')).split('\\n');
          const error = `Content/Items/Weapons/Lamina.cs(${before.length},${before.pop().length + 1}): CS1061: 'Item' does not contain a definition for 'widht' and no accessible extension method 'widht' accepting a first argument of type 'Item' could be found`;
          window.BunnyAndroid.compile = (id) => setTimeout(() => window.bunnyStudio.onNativeCompile(id, JSON.stringify({code: -1, errors: [error], warnings: [], bytes: 0, diagnostics: '', assembly: ''})), 20);
        }""")
        page.click("#compile")
        page.wait_for_selector(".prob.error")
        shot("erros")
        page.evaluate("src.value = src.value.replace('Item.widht', 'Item.width'); src.dispatchEvent(new Event('input')); setView('files')")
        page.click("#menuBtn")
        shot("arquivos")
        page.click("#drawerClose")
        page.evaluate("() => { window.bunnyStudio.openModSearch('Item'); }")
        shot("busca")
        page.evaluate("document.querySelector('#modSearch').close()")
        page.evaluate("() => { window.bunnyStudio.newTexture('Content/Items/Coracao.png'); }")
        page.fill("#fld_w", "16")
        page.fill("#fld_h", "16")
        page.click("#dlgOk")
        page.wait_for_selector("#pixel[open]")
        page.evaluate(SPRITE)
        page.evaluate("window.bunnyStudio.pxSetColor([217, 87, 99, 255])")
        shot("textura")
        page.evaluate("document.querySelector('[data-panel=layers]').click()")
        shot("camadas")
        browser.close()
    print("PRINTS", len(list(out.glob("*.png"))))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
