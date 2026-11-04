#!/usr/bin/env python3
"""Roda os testes do editor sem .NET. O compilador aqui e simulado; o Roslyn de verdade roda no emulator_smoke.sh.

    run_tests.py [PASTA_PARA_SCREENSHOTS]
"""
from __future__ import annotations

from support import *  # noqa: F403
from test_interface import *  # noqa: F403
from test_logica import *  # noqa: F403


def main() -> int:
    shots = Path(sys.argv[1]) if len(sys.argv) > 1 else None
    if shots:
        shots.mkdir(parents=True, exist_ok=True)
    subprocess.run([sys.executable, str(ROOT / "tools/generate_sdk_index.py")], check=True)
    with tempfile.TemporaryDirectory() as temp:
        plain = Path(temp) / "plain"
        build_site(plain)
        plain_url = serve(plain)
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch()
            page = browser.new_page()
            page.goto(plain_url)
            page.wait_for_selector("#tree .row.file")
            test_quick_check(page)
            test_snippets(page)
            test_member_references(page)
            test_stress_mod(page)
            test_snippet_probe(page)
            test_errors(page)
            test_packs(page)
            test_zip(page)
            test_completions(page)
            page.close()
            test_ui(browser, plain_url, shots)
            test_engine(browser, plain_url)
            browser.close()
    print(f"\n{len(failures)} falha(s)" if failures else "\nWEB_EDITOR_TESTS=PASS")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
