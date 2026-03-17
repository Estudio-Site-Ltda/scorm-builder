# Design: Fase 1 — Conversor PDF → SCORM 1.2 (MVP CLI)

**Data:** 2026-03-17
**Projeto:** conversor-scorm — Estúdio Site
**Escopo:** Fase 1 — MVP em Node.js puro, sem interface gráfica

---

## Objetivo

Script Node.js executado via terminal que converte arquivos PDF em pacotes SCORM 1.2 válidos, prontos para importação em qualquer LMS compatível. O pacote gerado rastreia conclusão: marca `lesson_status = "completed"` quando o aluno visualiza o último slide.

---

## Uso

```bash
node convert.js minha-aula.pdf   # converte arquivo específico
node convert.js                   # converte todos os PDFs da pasta input/
```

Saída gerada em `output/nome-do-arquivo-scorm.zip`.

---

## Stack

| Componente | Tecnologia |
|---|---|
| Runtime | Node.js 18+ |
| PDF → imagens | pdfjs-dist + @napi-rs/canvas (npm) |
| Geração do ZIP | archiver (npm) |
| Padrão SCORM | Templates manuais (XML + JS inline) |

`@napi-rs/canvas` é preferido ao `node-canvas` pois distribui binários pré-compilados para Windows — sem necessidade de Build Tools, Python ou MSVC. Funciona 100% offline no Windows com `npm install`.

---

## Estrutura de Arquivos

```
conversor-scorm/
├── convert.js                  # Ponto de entrada (CLI)
├── package.json
├── input/                      # PDFs colocados aqui são convertidos automaticamente (criada no primeiro run)
├── output/                     # ZIPs SCORM gerados aqui (criada automaticamente)
└── core/
    ├── pdfConverter.js         # PDF → array de PNGs (pdfjs-dist + @napi-rs/canvas)
    ├── scormBuilder.js         # Monta e empacota o ZIP SCORM 1.2
    └── templates/
        ├── imsmanifest.xml     # Template do manifesto SCORM 1.2 (com placeholders)
        ├── player.html         # Template do player de slides (com placeholders)
        └── scorm_api.js        # Shim estático da API SCORM 1.2 (copiado verbatim para o ZIP)
```

---

## Fluxo de Conversão

```
PDF recebido
    ↓
pdfConverter.js
  - Abre o PDF com pdfjs-dist
  - Para cada página: renderiza em canvas com largura=800px, altura proporcional ao aspect ratio da página
  - Exporta como slide_01.png, slide_02.png...
    ↓
scormBuilder.js
  - Substitui placeholders em imsmanifest.xml: {{COURSE_TITLE}}, {{SLIDE_FILE_LIST}}
  - Substitui placeholders em player.html: {{COURSE_TITLE}}, {{SLIDE_COUNT}}, {{SLIDES_JSON}}
  - Copia scorm_api.js verbatim para o ZIP
  - Empacota via archiver → ZIP
    ↓
output/nome-do-arquivo-scorm.zip ✓
```

**Nome do curso:** derivado do nome do arquivo (ex: `minha-aula.pdf` → `"Minha Aula"`).

**Resolução das imagens:** largura fixa em 800px, altura calculada proporcionalmente ao aspect ratio de cada página (ex: página A4 portrait 595×842pt → renderizada como 800×1131px). Sem distorção, sem corte.

---

## Estrutura Interna do Pacote SCORM Gerado

```
minha-aula.zip
├── imsmanifest.xml
├── index.html          (player de slides)
├── scorm_api.js        (shim da API SCORM 1.2)
└── slides/
    ├── slide_01.png
    ├── slide_02.png
    └── ...
```

---

## Player de Slides (player.html)

Interface minimalista, sem dependências externas (CSS e JS inline):

- Navegação via botões Anterior / Próximo
- Suporte a teclado: setas ← →
- Suporte a swipe (touch) para navegação em dispositivos móveis
- Indicador "Slide X de Y"
- Imagem do slide ocupa 100% da largura disponível, centralizada, com `max-width: 100%` e `height: auto` para preservar proporção em qualquer tela
- Layout responsivo: botões e indicador se adaptam a telas pequenas (mínimo 320px)
- `<meta name="viewport" content="width=device-width, initial-scale=1">` incluído
- Ao visualizar o último slide: dispara `LMSSetValue("cmi.core.lesson_status", "completed")` + `LMSCommit()` para persistir no LMS
- Ao sair da página (`onbeforeunload`): dispara `LMSFinish()` para encerrar a sessão SCORM

---

## SCORM API (scorm_api.js)

Arquivo estático em `core/templates/scorm_api.js`, copiado verbatim para cada ZIP gerado. Implementa o shim mínimo da API SCORM 1.2:
- `LMSInitialize()` — busca o objeto API no `window.parent` seguindo a hierarquia de frames
- `LMSSetValue(element, value)` — delega ao objeto API do LMS
- `LMSGetValue(element)` — delega ao objeto API do LMS
- `LMSCommit()` — delega ao objeto API do LMS
- `LMSFinish()` — delega ao objeto API do LMS

O `player.html` chama `LMSInitialize()` no `window.onload` e `LMSFinish()` ao navegar para além do último slide.

---

## Tratamento de Erros

**Modo arquivo único:**
- Arquivo não encontrado: mensagem de erro e `exit code 1`
- PDF corrompido ou sem páginas: mensagem de erro e `exit code 1`

**Modo batch (pasta `input/`):**
- PDF corrompido ou sem páginas: exibe erro para aquele arquivo, continua processando os demais
- Exit code 0 se ao menos um arquivo foi convertido com sucesso
- Exit code 1 se nenhum arquivo foi convertido (pasta vazia ou todos falharam)
- Pasta `input/` criada automaticamente se não existir (com mensagem orientando o usuário a adicionar PDFs)
- Pasta `output/` criada automaticamente se não existir

---

## O que está fora do escopo desta fase

- Conversão de PPT/PPTX (Fase 2, requer LibreOffice)
- Interface gráfica (Fase 2, requer Electron)
- Configurações customizadas (nome do curso, autor, versão)
- Preview dos slides antes de exportar
- Integração com API do LMS Estúdio
