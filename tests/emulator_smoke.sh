#!/usr/bin/env bash
# Instala o APK no emulador e exige uma compilacao real, com acerto e com erro.
set -u
APK="$1"; OUT="$2"
mkdir -p "$OUT"
PACKAGE=io.github.mantovanidevtrue.bunnystudio
adb install -r "$APK" || exit 1
adb logcat -c
adb shell am start -n "$PACKAGE/.MainActivity" --es bunny.hash autocompile
sleep 20; adb exec-out screencap -p > "$OUT/inicio.png"
result=""
for _ in $(seq 1 90); do
  sleep 10
  result="$(adb logcat -d -s BunnyStudio:I | grep -o 'BUNNY_SMOKE_DONE.*' | tail -1)"
  [ -n "$result" ] && break
done
adb exec-out screencap -p > "$OUT/final.png"
adb logcat -d > "$OUT/logcat.txt"
adb logcat -d -s BunnyStudio:I | tail -60 | cut -c1-1200
echo "RESULT: ${result:-sem resultado}"
case "$result" in *"first=ok second=fail models="*) ;; *) exit 1 ;; esac

# O pacote salvo em Downloads precisa ser o que o Bunny le: manifest e entry na raiz.
adb pull /sdcard/Download/BunnyStudio/smoke-test.bl "$OUT/smoke-test.bl" || exit 1
python3 - "$OUT/smoke-test.bl" <<'PY' || exit 1
import json, re, sys, zipfile
archive = zipfile.ZipFile(sys.argv[1])
assert archive.testzip() is None
manifest = json.loads(archive.read("manifest.json"))
assert re.fullmatch(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", manifest["uid"]), manifest["uid"]
assert re.fullmatch(r"[A-Za-z][A-Za-z0-9_]{0,63}", manifest["id"]), manifest["id"]
assert manifest["blVersion"] == 3
assert manifest["id"] + ".cs" in archive.namelist()
assert not any(name.startswith("content/") for name in archive.namelist())
print("PACOTE_OK", len(archive.namelist()), "arquivos")
PY

# Erros reais do Roslyn: cada um precisa de explicacao e de uma correcao que compila.
adb shell am force-stop "$PACKAGE"
adb logcat -c
adb shell am start -n "$PACKAGE/.MainActivity" --es bunny.hash autoerrors >/dev/null
errors=""
for _ in $(seq 1 60); do
  sleep 5
  errors="$(adb logcat -d -s BunnyStudio:I | grep -o 'BUNNY_ERRORS_DONE.*' | tail -1)"
  [ -n "$errors" ] && break
done
adb logcat -d -s BunnyStudio:I | grep -E 'BUNNY_ERROR ' | cut -c30-330
adb logcat -d -s BunnyStudio:I | grep -E 'BUNNY_ERRORS_START|BUNNY_PT|chromium|Uncaught' | tail -8 | cut -c1-300
echo "ERROS: ${errors:-sem resultado}"
case "$errors" in *"falhas=0"*) ;; *) echo "::error::Explicacao de erros falhou: ${errors:-sem resultado}"; exit 1 ;; esac

# O app precisa continuar vivo depois de reaberto. Mede quantas aberturas sobrevivem.
alive=0; died=0
for trial in 1 2 3 4 5 6 7 8; do
  adb shell am force-stop "$PACKAGE"
  adb logcat -c
  adb shell am start -n "$PACKAGE/.MainActivity" >/dev/null
  sleep 15
  if [ -n "$(adb shell pidof "$PACKAGE" | tr -d '[:space:]')" ]; then
    alive=$((alive + 1))
  else
    died=$((died + 1))
    echo "--- abertura $trial: o app sumiu ---"
    adb logcat -d | grep -iE "bunnystudio|AndroidRuntime|FATAL|DEBUG +:|libc +:|tombstone|has died|Killing|am_kill|webview.*(crash|error)|Process .* died|ANR" | tail -40 | cut -c1-260
  fi
done
echo "ABERTURAS vivas=$alive mortas=$died"

# Carga: tamanhos crescentes dentro do APK. Falhar aqui avisa, mas nao barra o APK.
adb shell am force-stop "$PACKAGE"
adb logcat -c
adb shell am start -n "$PACKAGE/.MainActivity" --es bunny.hash autostress
stress=""
for i in $(seq 1 45); do
  sleep 10
  stress="$(adb logcat -d -s BunnyStudio:I | grep -o 'BUNNY_STRESS_DONE.*' | tail -1)"
  [ -n "$stress" ] && break
  adb logcat -d | grep -q 'Renderizador encerrado' && { stress="renderizador encerrado"; break; }
  if [ $((i % 30)) -eq 0 ]; then
    echo "--- ${i}0 s ---"
    adb shell top -b -n 1 2>/dev/null | grep -iE 'bunny|sandbox|webview' | head -6 | cut -c1-120
  fi
done
adb exec-out screencap -p > "$OUT/carga.png"
adb logcat -d > "$OUT/logcat-carga.txt"
adb logcat -d -s BunnyStudio:I | grep -E 'BUNNY_STRESS|Renderizador' | cut -c1-1100
adb logcat -d | grep -iE 'lowmemorykiller|out of memory|Aw, Snap|chromium.*(fatal|error)' | tail -8 | cut -c1-220
adb shell dumpsys meminfo "$PACKAGE" 2>/dev/null | sed -n 1,6p | cut -c1-110
if [ -z "$stress" ]; then
  echo "--- diagnostico ---"
  adb shell ps -A 2>/dev/null | grep -iE 'bunny|sandbox' | cut -c1-120
  adb shell dumpsys activity activities 2>/dev/null | grep -E 'mResumedActivity|topResumedActivity' | head -3 | cut -c1-140
  adb logcat -d | grep -iE "bunnystudio|AndroidRuntime|FATAL|DEBUG +:|libc +:|tombstone|has died|Killing|Process .* died|ANR" | tail -60 | cut -c1-260
fi
echo "STRESS: ${stress:-sem resultado}"
case "$stress" in *"state=ok"*) ;; *) echo "::warning::Teste de carga do emulador sem sucesso: ${stress:-sem resultado}" ;; esac
exit 0
