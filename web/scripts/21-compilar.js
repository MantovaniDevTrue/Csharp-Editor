async function runCompile() {
  if (compiling) return;
  compiling = true;
  clearTimeout(saveTimer); if (dirty.size) flushSaves();
  haptic("tap");
  $("compile").classList.add("busy");
  $("compile").disabled = true;
  state.dll = null; $("dlDll").hidden = true; $("sendBunny2").hidden = true;
  closePopup();
  try {
    const quick = quickCheck(files());
    // O Bunny recusa um manifest inválido: compilar aqui daria um falso "Compilou".
    const manifestErrors = manifestProblems(files());
    if (manifestErrors.length) {
      state.problems = manifestErrors;
      setView("out");
      showOutput("fail", `Não compilou: ${manifestErrors.length === 1 ? "o manifest.json tem um erro" : `o manifest.json tem ${manifestErrors.length} erros`}`, (out) => {
        out.append(renderProblems(manifestErrors));
        out.append(para("O Bunny recusa o mod enquanto isso não for corrigido. O código C# só é compilado depois."));
      });
      return;
    }
    // Pacote só com a DLL: já vem compilado, e o Bunny carrega direto.
    const compiled = precompiledEntry(files());
    if (compiled && !Object.keys(files()).some((path) => isSource(path))) {
      state.problems = [];
      state.dll = null;
      $("dlDll").hidden = true;
      if (window.BunnyAndroid) $("sendBunny2").hidden = false;
      setView("out");
      showOutput("ok", "Este mod já vem compilado", (out) => {
        out.append(para(`O pacote traz ${compiled} e nenhum arquivo .cs. O Bunny carrega essa DLL sem compilar nada, então não há código para compilar aqui.`));
      });
      return;
    }
    if (!engine.available) {
      state.problems = quick;
      const errs = quick.filter((p) => p.sev === "error").length, warns = quick.length - errs;
      const headline = errs ? `Verificação rápida: ${plural(errs, "erro", "erros")}` : warns ? `Verificação rápida: ${plural(warns, "aviso", "avisos")}, nenhum erro` : "Verificação rápida: nenhum problema";
      showOutput(errs ? "fail" : "quick", headline, (out) => {
        out.append(renderProblems(quick));
        out.append(para("Isto não compilou o mod. Esta cópia não tem o Roslyn; a verificação rápida acha erros comuns, mas não checa tipos. O app para Android compila de verdade."));
      });
      return;
    }
    setView("out");
    showOutput("running", "Compilando…", (out) => out.append(para("Rodando o Roslyn com a API do Bunny instalado.")));
    const payload = payloadOf(files(), manifestOf(mod()).id);
    const count = Object.keys(payload.files).length;
    const started = performance.now();
    const tick = setInterval(() => {
      $("outState").textContent = `Compilando ${plural(count, "arquivo", "arquivos")}… ${Math.round((performance.now() - started) / 1000)} s`;
    }, 1000);
    let result;
    try { result = await compileWithRoslyn(payload); } finally { clearInterval(tick); }
    const seconds = ((performance.now() - started) / 1000).toFixed(1);
    const diagnostics = result.diagnostics || "";
    if (result.code === -50 || result.code === -51) {
      state.problems = [];
      showOutput("fail", result.code === -50 ? "Instale o Bunny Loader para compilar" : "Atualize o Bunny Loader para compilar", (out) => {
        out.append(para(result.code === -50 ? "O app compila com a API do Bunny Loader instalado neste aparelho, a mesma que vai rodar o mod." : "O Bunny instalado não traz a API C# (BunnyLoader.dll). Instale a versão mais nova."));
        out.append(renderProblems(quick));
      });
      setView("out");
    } else if (result.code > 0) {
      if (result.warnings?.length) await loadRoslynPt();
      state.dll = result.assembly ? b64ToBytes(result.assembly) : null;
      $("dlDll").hidden = !state.dll;
      if (window.BunnyAndroid) $("sendBunny2").hidden = false;
      state.problems = quick.filter((p) => p.sev === "warn");
      const cached = result.code === 2;
      showOutput("ok", cached ? `Sem mudanças desde a última compilação (${seconds} s)` : `Compilou em ${seconds} s`, (out) => {
        const tiles = contentTiles();
        if (tiles) out.append(tiles);
        out.append(para(`${plural(result.files || count, "arquivo", "arquivos")}${result.lines ? ` · ${result.lines} linhas` : ""} · ${(result.bytes / 1024).toFixed(1)} KB. O Bunny confere o resto ao carregar o mod no jogo.`));
        out.append(renderProblems(state.problems));
        out.append(techDetails(readableReport(result)));
      });
    } else {
      await loadRoslynPt();
      const roslyn = parseRoslyn((result.errors || []).join("\n"));
      state.problems = roslyn.length ? roslyn : quick;
      const headline = roslyn.length ? `Não compilou: ${plural(roslyn.length, "erro", "erros")}` : "O compilador não aceitou o mod";
      showOutput("fail", headline, (out) => {
        out.append(renderProblems(state.problems));
        out.append(techDetails(readableReport(result), !roslyn.length));
      });
      setView("out");
    }
  } catch (error) {
    state.problems = [];
    showOutput("crash", "O compilador não rodou", (out) => {
      out.append(para(String(error?.message ?? error)));
      out.append(para("O código não foi avaliado. Feche o app, abra de novo e tente outra vez."));
    });
    setView("out");
  } finally {
    compiling = false;
    $("compile").disabled = false;
    $("compile").classList.remove("busy");
    const outcome = $("outHead").dataset.state;
    if (outcome === "ok") { fabEffect("okpulse"); burstConfetti(); haptic("confirm"); countUp($("output")); }
    else if (outcome === "fail" || outcome === "crash") { fabEffect("failshake"); haptic("long"); }
  }
}

