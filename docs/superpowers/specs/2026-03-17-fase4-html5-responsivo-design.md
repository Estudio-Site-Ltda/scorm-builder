# Design: Fase 4 — Modo de Saída HTML5 Responsivo

**Data:** 2026-03-17
**Projeto:** conversor-scorm — Estúdio Site
**Escopo:** Fase 4 — Opção de saída HTML5 com texto selecionável em vez de imagens PNG

---

## Objetivo

Adicionar um segundo modo de saída ao conversor: além do modo atual (slides como imagens PNG), o usuário poderá escolher "HTML5 Responsivo", que gera slides como arquivos HTML com texto real selecionável e fidelidade visual garantida por canvas como fundo.

---

## Contexto das Fases

| Fase | Descrição | Status |
|------|-----------|--------|
| 1 | CLI: PDF → SCORM com slides PNG | ✅ Concluída |
| 2 | GUI Electron instalável no Windows | ✅ Concluída |
| 3 | Suporte a PPT/PPTX via LibreOffice | 🔜 Pendente |
| 4 | Modo de saída HTML5 Responsivo | 📋 Este documento |

---

## Decisões de Design

| Decisão | Escolha | Motivo |
|---|---|---|
| Estratégia visual | PNG como `background-image` + camada de texto HTML | Fidelidade 100% garantida pelo canvas; texto selecionável sem risco de layout quebrado |
| Extração de texto | `pdf.js` — `page.getTextContent()` | Já é dependência; retorna texto com posição XY, tamanho e fonte |
| Escopo desta fase | PDF apenas | PPT/PPTX é escopo da Fase 3; o modo HTML5 pode ser adicionado ao PPTX depois |
| Seleção do modo | `<select>` na tela de Revisão (Electron) | Mesma tela onde o usuário edita o nome do curso — fluxo natural |
| Formato do slide HTML | Um `.html` por página | Consistente com a estrutura atual de `slides/slide_01.png` |
| Player | Nova variante `player-html5.html` | Usa `<iframe>` em vez de `<img>`; o restante do player é idêntico |

---

## Fluxo do Usuário

```
[Tela 1 — Upload]
  Usuário seleciona PDF
      ↓
[Tela 1b — Convertendo]
  Conversão ocorre (mesma lógica atual)
      ↓
[Tela 2 — Revisão]
  Campo: Nome do curso
  Select: Formato de saída
    ● Imagens PNG  (padrão, comportamento atual)
    ○ HTML5 Responsivo
  Info: N slides · tamanho estimado
  Botão "Salvar .zip"
      ↓
[Diálogo nativo "Salvar como"]
  ZIP gerado no formato escolhido
```

---

## Arquitetura

### Estrutura de Arquivos

```
conversor-scorm/
├── core/
│   ├── pdfConverter.js        — MODIFICAR: exportar também convertPdfToHtml()
│   ├── scormBuilder.js        — MODIFICAR: buildScorm/buildScormBuffer aceitam modo
│   └── templates/
│       ├── player.html        — sem alterações (modo imagens)
│       └── player-html5.html  — NOVO: player com <iframe> por slide
├── main.js                    — MODIFICAR: passar outputMode no IPC
├── renderer/
│   └── index.html             — MODIFICAR: adicionar <select> de formato
```

### Nova Função: `convertPdfToHtml`

```javascript
/**
 * Converte um PDF em array de strings HTML (um por página).
 * Cada slide é um documento HTML autocontido com:
 *   - PNG da página como background-image (canvas renderizado em base64)
 *   - Camada de texto posicionada via PDF.js getTextContent()
 *
 * @param {string} pdfPath
 * @param {(current: number, total: number) => void} [onProgress]
 * @returns {Promise<{ html: string, width: number, height: number }[]>}
 */
async function convertPdfToHtml(pdfPath, onProgress) { ... }
```

Cada item do array retorna um objeto `{ html, width, height }` onde `html` é um documento HTML completo pronto para ser salvo como `slides/slide_01.html`.

### Estrutura de cada slide HTML

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { margin: 0; overflow: hidden; }
    .slide {
      position: relative;
      width: {{WIDTH}}px;
      height: {{HEIGHT}}px;
      background-image: url('data:image/png;base64,{{BASE64_PNG}}');
      background-size: 100% 100%;
    }
    .text-layer span {
      position: absolute;
      white-space: pre;
      transform-origin: 0% 0%;
      color: transparent;           /* texto invisível — selecionável mas não visível */
    }
    .text-layer span::selection {
      color: transparent;
      background: rgba(0, 120, 255, 0.3);
    }
  </style>
</head>
<body>
  <div class="slide">
    <div class="text-layer">
      <!-- gerado por getTextContent() -->
      <span style="left:120px;top:88px;font-size:32px;">Título do Slide</span>
      ...
    </div>
  </div>
</body>
</html>
```

**Nota de design:** o texto é renderizado como `color: transparent` — visível apenas na seleção. A imagem PNG garante a fidelidade visual; o HTML garante acessibilidade e busca no navegador.

### ZIP SCORM no modo HTML5

```
curso-scorm.zip
├── imsmanifest.xml
├── index.html              ← player-html5.html preenchido
├── scorm_api.js
└── slides/
    ├── slide_01.html
    ├── slide_02.html
    └── ...
```

O manifesto SCORM não muda — apenas o `index.html` e o conteúdo de `slides/` são diferentes.

### Player HTML5 (`player-html5.html`)

Idêntico ao `player.html` atual, com uma alteração:

```html
<!-- Em vez de: -->
<img id="slide-img" src="{{slide}}" ...>

<!-- Usa: -->
<iframe id="slide-frame" src="{{slide}}" scrolling="no"
        style="width:100%;height:100%;border:none;"></iframe>
```

O resto do player (navegação, progresso, SCORM API, toast de conclusão, teclas) permanece igual.

### IPC — Alteração no contrato

```
invoke('convert-pdf', filePath)  →  { title, slideCount, sizeBytes }
                                     (sem alteração — converte e armazena buffers internamente)

invoke('save-file', title, outputMode)  →  { saved, path? }
  outputMode: 'images' | 'html5'        (novo parâmetro)
```

O `main.js` decide qual builder usar com base em `outputMode`:
- `'images'` → `buildScormBuffer(title, pngBuffers)` (atual)
- `'html5'`  → `buildScormHtml5Buffer(title, htmlSlides)` (novo)

---

## Modificações por Arquivo

### `core/pdfConverter.js`

Adicionar `convertPdfToHtml(pdfPath, onProgress)`:
- Reutiliza `NapiCanvasFactory` e o loop de páginas existente
- Por página: renderiza canvas → converte para base64 PNG + chama `page.getTextContent()` → monta HTML

### `core/scormBuilder.js`

Adicionar `buildScormHtml5Buffer(courseTitle, htmlSlides)`:
- Idêntico ao `buildScormBuffer` existente
- Diferença: usa `player-html5.html` como template e adiciona arquivos `.html` em `slides/`

### `main.js`

- `convert-pdf`: armazenar tanto `pngBuffers` quanto `htmlSlides` em memória durante a sessão (ou re-converter sob demanda quando o usuário muda o modo)
- `save-file`: aceitar segundo parâmetro `outputMode`

### `renderer/index.html` + `renderer/app.js`

Adicionar na tela de Revisão:

```html
<div>
  <div class="field-label">Formato de saída</div>
  <select id="output-mode" class="field-input">
    <option value="images">Imagens PNG (padrão)</option>
    <option value="html5">HTML5 Responsivo</option>
  </select>
</div>
```

---

## Estratégia de Conversão

**Opção A — Converter tudo na hora (recomendada para o MVP):**
- `convert-pdf` converte apenas para PNG (comportamento atual)
- Se o usuário selecionar HTML5, o `save-file` aciona a conversão HTML na hora antes de montar o ZIP
- Prós: sem mudança no fluxo de progresso; sem memória extra se o usuário nunca escolher HTML5
- Contras: o usuário espera um pouco mais ao clicar "Salvar" com HTML5

**Opção B — Converter ambos durante o loading:**
- `convert-pdf` produz PNG E HTML em paralelo
- Prós: salvar é instantâneo em qualquer modo
- Contras: +50% de tempo de processamento sempre, mesmo se o usuário nunca usar HTML5

**Decisão:** Opção A para o MVP — converter HTML5 on-demand no momento do save.

---

## O que está fora do escopo desta fase

- HTML5 para PPT/PPTX (vem na Fase 3 ou depois)
- Edição de texto extraído
- Animações CSS dos slides originais (texto estático)
- Modo HTML5 para o CLI `convert.js` (pode ser adicionado depois com `--mode html5`)
- Fontes embarcadas (texto com `color: transparent` sobre o PNG torna isso opcional)

---

## Critérios de Aceitação

- [ ] Select "Formato de saída" visível na tela de Revisão com duas opções
- [ ] Modo "Imagens PNG" produz o mesmo ZIP de antes (sem regressão)
- [ ] Modo "HTML5 Responsivo" produz ZIP com slides como `.html`
- [ ] Texto dos slides é selecionável no navegador dentro do LMS
- [ ] ZIP HTML5 passa na validação SCORM 1.2 do LMS
- [ ] Player HTML5 navega entre slides com as mesmas teclas e controles do player atual
- [ ] Toast de conclusão no último slide funciona em ambos os modos
