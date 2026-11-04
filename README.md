# Csharp Editor

Editor de código para Android que escreve e compila mods C# do [Bunny Loader](https://github.com/JonataOliveiraa/Bunny-Loader) no próprio celular.

Criado por [Mantovani](https://github.com/MantovaniDevTrue).

O app se chama **Bunny C# Studio**. Ele compila com o Roslyn e a API do Bunny instalado no aparelho, então o Bunny Loader precisa estar instalado.

## Baixar

O GitHub Actions publica o APK a cada push em `main`: [BunnyCSharpStudio.apk](https://github.com/MantovaniDevTrue/Csharp-Editor/releases/download/editor-latest/BunnyCSharpStudio.apk)

Precisa do Android 8.0 ou mais novo.

## O que ele faz

- Editor com destaque de C#, autocomplete da API do Bunny e modelos prontos de itens, armas, NPCs, blocos e sistemas.
- Compilação com os erros em português, mostrando o que foi escrito, o motivo e como deveria ficar.
- Conferência do `manifest.json` com as regras do Bunny.
- Exportação do pacote `.bl` e envio para o Bunny.
- Editor de texturas em pixel, com camadas, quadros, formas, seleção, espelho e paleta.
- Pacotes de texturas e de fontes, com gerador de fontes a partir de um `.ttf`.
- Tutorial opcional, configurações do editor e cenário animado.

## Organização

```text
app/                    App Android em .NET 10
  Source/
    MainActivity.cs     Tela e ponte com a interface
    Bunny/              Bunny instalado e pasta ModSources
    Compilador/         Compilação e leitura da API
  Resources/            Ícone, cores e textos do Android
web/                    Interface mostrada dentro do app
  index.html            Estrutura da página
  styles/               CSS, por área
  data/                 Índice inicial da API (gerado)
  scripts/
    nucleo/             Estado, configurações, ZIP e utilidades
    editor/             Editor, autocomplete, busca e teclado
    csharp/             Lexer, API, manifest e verificação rápida
    modelos/            Modelos prontos e o painel deles
    compilador/         Compilação, explicação e correção dos erros
    projeto/            Árvore, barra lateral, mods, importar e exportar
    textura/            Editor de texturas: documento, ferramentas, tela e painéis
    fontes/             Gerador de fontes
    bunny/              Conexão com a pasta do Bunny
    telas/              Tutorial e configurações
    cenario/            Fundo animado
    testes/             Mods usados nos testes do app
tools/                  Build da interface, índice da API e traduções
tests/                  Testes da interface e teste no emulador
bunny-upstream.txt      Commit do Bunny Loader usado no build
```

Os scripts de `web/` dividem o mesmo escopo e viram uma página só no build. A ordem deles fica em `web/scripts/ordem.txt`, e arquivo novo precisa entrar nessa lista.

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
BUNNY_UPSTREAM=../bunny-loader python3 tests/run_tests.py
```

No GitHub Actions, `tests/emulator_smoke.sh` também compila código certo e errado dentro do APK, em um emulador. Como lá não existe Bunny instalado, esse teste usa `tools/stub-api`. Para testar os modelos contra a API real, abra no celular **Configurações > Testar os modelos**.

## Assinatura

Para o APK atualizar por cima da versão instalada, configure estes secrets no repositório, com a mesma chave de sempre:

- `BUNNY_KEYSTORE_B64`
- `BUNNY_KEYSTORE_PASSWORD`
- `BUNNY_KEY_ALIAS`

Sem eles, o workflow assina com uma chave temporária, e o Android não aceita instalar por cima.

## Pasta do Bunny

O app acessa a pasta `ModSources` pelo mesmo caminho do BL Editor: a activity de ponte do Bunny entrega a permissão da pasta, e o provider dele instala o projeto.

O Bunny só libera essa ponte para apps assinados com a chave dele. Com outra chave, o app oferece escolher a pasta no seletor do Android e a instalação é feita no próprio Bunny.
