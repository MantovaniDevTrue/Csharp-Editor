# Csharp Editor

Editor de código para Android que escreve e compila mods C# do [Bunny Loader](https://github.com/JonataOliveiraa/Bunny-Loader) no próprio celular.

Criado por [Mantovani](https://github.com/MantovaniDevTrue). O app se chama **Bunny C# Studio**. Ele compila com o Roslyn e a API do Bunny instalado no aparelho, então o Bunny Loader precisa estar instalado.

## Baixar

O GitHub Actions publica o APK a cada push em `main`: [BunnyCSharpStudio.apk](https://github.com/MantovaniDevTrue/Csharp-Editor/releases/download/editor-latest/BunnyCSharpStudio.apk)

## O que ele faz

- Editor com destaque de C#, autocomplete da API do Bunny e modelos prontos de itens, armas, NPCs, blocos e sistemas.
- Compilação com os erros em português, mostrando o que foi escrito, o motivo e como deveria ficar.
- Conferência do `manifest.json` com as regras do Bunny.
- Exportação do pacote `.bl` e envio para o Bunny.
- Tutorial opcional, configurações do editor e cenário animado.

## Organização

```text
app/                  App Android em .NET 10
  Source/             Tela, compilador, leitura da API do Bunny
  Resources/          Ícone, cores e textos do Android
web/                  Interface mostrada dentro do app
  index.html          Estrutura da página
  styles/             CSS, aplicado na ordem dos números
  scripts/            JavaScript, carregado na ordem dos números
  data/               Índice inicial da API (gerado)
tools/                Build da interface, índice da API e traduções
  roslyn-pt/          Extrai a tradução oficial das mensagens do Roslyn
  stub-api/           API mínima usada só no teste do emulador
tests/                Testes da interface e teste no emulador
bunny-upstream.txt    Commit do Bunny Loader usado no build
```

Os scripts de `web/` dividem o mesmo escopo e viram uma página só no build. Por isso, o número no nome do arquivo define a ordem.

| Quero mudar | Onde mexer |
|---|---|
| Modelos | `web/scripts/07-modelos.js` |
| Autocomplete | `web/scripts/13-autocomplete.js` e `14-simbolos-do-mod.js` |
| Regras do manifest e verificação enquanto digita | `web/scripts/06-verificacao-rapida.js` |
| Explicação dos erros | `web/scripts/20-erros.js` |
| Compilação e resultado | `web/scripts/19-compilador.js` e `21-compilar.js` |
| Árvore de arquivos e barra lateral | `web/scripts/16-arvore.js` e `17-barra-lateral.js` |
| Compilador no Android | `app/Source/CompilerHost.cs` |
| Leitura do Bunny instalado | `app/Source/BunnyPackage.cs` e `SdkIndex.cs` |

## Como compila

1. O workflow baixa o Bunny Loader no commit de `bunny-upstream.txt` e usa o `ModCompiler` dele.
2. No celular, o app lê `assets/dotnet/BunnyLoader.dll` e as referências do APK do Bunny instalado.
3. O app também gera o autocomplete a partir dessa DLL. O arquivo `web/data/sdk-index.json` só vale até a leitura terminar.

Para atualizar o Bunny usado no build, troque o commit em `bunny-upstream.txt`.

## Testar

Testes da interface, com Python, Playwright e um checkout do Bunny Loader:

```bash
pip install playwright
python3 -m playwright install chromium
BUNNY_UPSTREAM=../bunny-loader python3 tests/test_editor.py
```

No GitHub Actions, `tests/emulator_smoke.sh` também compila código certo e errado dentro do APK, em um emulador. Como lá não existe Bunny instalado, esse teste usa `tools/stub-api`. Para testar os modelos contra a API real, abra no celular **Configurações > Testar os modelos**.

## Assinatura

Para o APK atualizar por cima da versão instalada, configure estes secrets no repositório, com a mesma chave de sempre:

- `BUNNY_KEYSTORE_B64`
- `BUNNY_KEYSTORE_PASSWORD`
- `BUNNY_KEY_ALIAS`

Sem eles, o workflow assina com uma chave temporária, e o Android não aceita instalar por cima.

## Enviar direto para o Bunny

O botão **Enviar para o Bunny** instala e ativa o mod quando o Bunny aceita a ação `dev.bunnyloader.action.IMPORT_PACKAGE`. Esse recebimento está no branch [`feature/receber-pacote-do-studio`](https://github.com/MantovaniDevTrue/Bunny-Loader/tree/feature/receber-pacote-do-studio) e ainda não entrou no Bunny oficial. Até lá, o app salva o `.bl` e a importação é manual.
