"""O que os testes da interface dividem: site montado, servidor e a ponte simulada do app."""
from __future__ import annotations

import base64
import functools
import http.server
import io
import json
import os
import shutil
import subprocess
import sys
import tempfile
import threading
import zipfile
from pathlib import Path

from playwright.sync_api import sync_playwright

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
import build_web  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
failures: list[str] = []


def check(ok: bool, label: str, detail: object = "") -> None:
    print(("ok   " if ok else "FALHA") + " " + label + (f" -> {detail}" if detail and not ok else ""))
    if not ok:
        failures.append(label)


def build_site(target: Path) -> None:
    target.mkdir(parents=True)
    (target / "index.html").write_text(build_web.page_html(), encoding="utf-8")


# Simula a ponte do MainActivity.cs.
FAKE_ANDROID = """
window.__saved = [];
try { localStorage.setItem('bunny-studio-tour', '1'); } catch {}
window.BunnyAndroid = {
  saveToDownloads(name, b64) { window.__sent = [name, atob(b64)]; return 'saved:Download/BunnyStudio/' + name; },
  openBunny() { window.__opened = true; return true; },
  haptic(kind) { (window.__haptics = window.__haptics || []).push(kind); },
  saveFile(name, b64) { window.__saved.push([name, atob(b64)]); setTimeout(() => window.bunnyStudio.onNativeSave('saved', name)); },
  bridgeStatus() { return JSON.stringify({status: window.__bridgeStatus || 'wrong_signature', connected: !!window.__folder}); },
  connectBunny() { window.__folder = window.__folder || {}; setTimeout(() => window.bunnyStudio.onBunnyConnected(true)); },
  bridgeCall(id, op, json) {
    const a = JSON.parse(json); let r = {ok: true};
    if (op === 'write') { window.__folder[a.name] = a.files; r.count = Object.keys(a.files).length; }
    if (op === 'list') r.projects = Object.keys(window.__folder);
    if (op === 'read') r.files = window.__folder[a.name];
    setTimeout(() => window.bunnyStudio.onBridge(id, JSON.stringify(r)));
  },
  canSendToBunny() { return !!window.__direct; },
  sendToBunny() { window.__delivered = true; return 'sent'; },
  bunnyInfo() { return JSON.stringify({installed: !window.__noBunny, version: '1.0', package: 'com.bunnyloader', stub: false}); },
  compile(id, json) {
    window.__lastCompile = JSON.parse(json);
    const files = window.__lastCompile.files;
    const bad = Object.keys(files).find(k => files[k].includes('nao compila'));
    const result = window.__noBunny ? {code:-50, errors:[], warnings:[], bytes:0, diagnostics:'BUNNY_REFERENCES_UNAVAILABLE', assembly:''}
      : bad ? {code:-1, errors:[`${bad}(3,18): CS1002: ; expected`], warnings:[], bytes:0, diagnostics:'status failed', assembly:''}
      : {code:1, errors:[], warnings:[], files:Object.keys(files).length, lines:10, ms:5, bytes:2048, assembly:btoa('MZfake'), diagnostics:`status compiled\nstats 5 ${Object.keys(files).length} 10`};
    setTimeout(() => window.bunnyStudio.onNativeCompile(id, JSON.stringify(result)), 20);
  },
};
"""


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def serve(directory: Path) -> str:
    handler = functools.partial(Quiet, directory=str(directory))
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return f"http://127.0.0.1:{server.server_address[1]}/index.html"


def sample_projects():
    upstream = Path(os.environ.get("BUNNY_UPSTREAM", ROOT / "build/bunny-upstream")) / "samples"
    for manifest in sorted(upstream.glob("ExampleModCSharp/manifest.json")):
        root = manifest.parent
        files = {}
        for path in root.rglob("*"):
            if path.is_file():
                rel = path.relative_to(root).as_posix()
                files[rel] = path.read_text(encoding="utf-8-sig") if path.suffix == ".cs" or rel == "manifest.json" else 0
        yield root.name, files


QUICK = """(files) => {
  const decoded = {};
  for (const [k, v] of Object.entries(files)) decoded[k] = typeof v === 'string' ? v : new Uint8Array(1);
  return window.bunnyStudio.quickCheck(decoded);
}"""
