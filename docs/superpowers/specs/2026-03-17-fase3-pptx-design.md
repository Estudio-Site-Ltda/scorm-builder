# Design: Fase 3 — Suporte a PPT/PPTX via LibreOffice

**Data:** 2026-03-17
**Projeto:** conversor-scorm — Estúdio Site
**Escopo:** Fase 3 — Aceitar arquivos PPT/PPTX além de PDF

---

## Objetivo

Ampliar o conversor para aceitar apresentações PowerPoint (`.ppt` e `.pptx`). A estratégia é usar o LibreOffice em modo headless para converter o arquivo para PDF e, em seguida, reutilizar integralmente o pipeline existente de PDF → PNG → SCORM.

---

## Contexto das Fases

| Fase | Descrição | Status |
|------|-----------|--------|
| 1 | CLI: PDF → SCORM com slides PNG | ✅ Concluída |
| 2 | GUI Electron instalável no Windows | ✅ Concluída |
| 3 | Suporte a PPT/PPTX via LibreOffice | 📋 Este documento |
| 4 | Modo de saída HTML5 Responsivo | 📋 Especificado |

---

## Decisões de Design

| Decisão | Escolha | Motivo |
|---|---|---|
| Ferramenta de conversão | LibreOffice headless | Gratuito, sem dependência de nuvem, alta fidelidade com PPT/PPTX; roda 100% offline |
| Estratégia de conversão | PPTX → PDF (LibreOffice) → PNG (pipeline atual) | Reutiliza todo o código existente sem duplicação |
| Detecção do LibreOffice | Busca em caminhos padrão do Windows | Sem necessidade de variável de ambiente obrigatória |
| Bundling do LibreOffice | NÃO incluído no instalador | Instalação separada; LibreOffice (~400 MB) tornaria o instalador inviável |
| Arquivo temporário | PDF intermediário em `os.tmpdir()` | Limpo automaticamente após conversão |
| Feedback ao usuário | Mensagem "Convertendo PPT..." antes do progresso de páginas | LibreOffice não emite progresso — usuário vê spinner durante esta etapa |
| Suporte no CLI | Sim — `convert.js` passa a aceitar `.pptx` | Paridade de funcionalidade entre GUI e CLI |

---

## Fluxo do Usuário

```
[Tela 1 — Upload]
  Usuário arrasta ou seleciona arquivo .pdf, .ppt ou .pptx
      ↓
[Tela 1b — Convertendo]
  Se PPTX:
    "Convertendo apresentação…" (spinner, sem barra — LibreOffice não emite progresso)
    LibreOffice converte para PDF temporário
  Em seguida (PDF ou PPTX após conversão):
    "Convertendo slides… Página X de Y" (barra de progresso — pipeline atual)
      ↓
[Tela 2 — Revisão]
  Mesmo fluxo atual: nome editável, contagem de slides, tamanho, botão salvar
```

---

## Arquitetura

### Estrutura de Arquivos

```
conversor-scorm/
├── core/
│   ├── pdfConverter.js        — sem alterações
│   ├── scormBuilder.js        — sem alterações
│   ├── pptxConverter.js       — NOVO: PPTX → PDF via LibreOffice
│   └── templates/             — sem alterações
├── convert.js                 — MODIFICAR: aceitar .ppt/.pptx
├── main.js                    — MODIFICAR: detectar extensão, chamar pptxConverter se necessário
├── renderer/
│   └── index.html             — MODIFICAR: aceitar="pdf,.ppt,.pptx" no input e drop zone
```

### Nova Função: `pptxConverter.js`

```javascript
'use strict';

const { execFile } = require('child_process');
const path = require('path');
const os   = require('os');
const fs   = require('fs');

/**
 * Caminhos padrão do LibreOffice no Windows.
 * Testa do mais recente para o mais antigo.
 */
const LIBREOFFICE_CANDIDATES = [
  'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
  'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe',
];

/**
 * Localiza o executável do LibreOffice instalado no sistema.
 * @returns {string} Caminho para soffice.exe
 * @throws {Error} Se LibreOffice não estiver instalado
 */
function findLibreOffice() {
  for (const candidate of LIBREOFFICE_CANDIDATES) {
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error(
    'LibreOffice não encontrado. Instale em libreoffice.org e tente novamente.'
  );
}

/**
 * Converte um arquivo PPT/PPTX para PDF usando LibreOffice headless.
 * Retorna o caminho do PDF temporário gerado.
 *
 * @param {string} pptxPath - Caminho absoluto para o arquivo .ppt/.pptx
 * @returns {Promise<string>} Caminho do PDF temporário gerado
 */
async function convertPptxToPdf(pptxPath) {
  const soffice = findLibreOffice();
  const tmpDir  = os.tmpdir();

  return new Promise((resolve, reject) => {
    execFile(
      soffice,
      ['--headless', '--convert-to', 'pdf', '--outdir', tmpDir, pptxPath],
      { timeout: 120_000 },
      (err, stdout, stderr) => {
        if (err) {
          reject(new Error(`LibreOffice falhou: ${stderr || err.message}`));
          return;
        }
        // LibreOffice cria o PDF com o mesmo nome base do arquivo original
        const base    = path.basename(pptxPath, path.extname(pptxPath));
        const pdfPath = path.join(tmpDir, `${base}.pdf`);
        if (!fs.existsSync(pdfPath)) {
          reject(new Error(`PDF temporário não encontrado: ${pdfPath}`));
          return;
        }
        resolve(pdfPath);
      }
    );
  });
}

module.exports = { convertPptxToPdf, findLibreOffice };
```

### Modificação em `main.js`

No handler `convert-pdf`, detectar a extensão e converter se necessário:

```javascript
ipcMain.handle('convert-pdf', async (event, filePath) => {
  pendingZipBuffer = null;

  let sourcePath = filePath;
  let tmpPdf     = null;

  const ext = path.extname(filePath).toLowerCase();

  if (ext === '.ppt' || ext === '.pptx') {
    // Fase 1: LibreOffice converte para PDF (sem progresso de páginas ainda)
    event.sender.send('conversion-progress-message', 'Convertendo apresentação…');
    tmpPdf      = await convertPptxToPdf(filePath);
    sourcePath  = tmpPdf;
  }

  // Fase 2: pipeline existente PDF → PNG
  const title = titleFromFilename(path.basename(filePath));
  const slideBuffers = await convertPdfToImages(sourcePath, (current, total) => {
    event.sender.send('conversion-progress', current, total);
  });

  // Limpar PDF temporário
  if (tmpPdf) fs.unlink(tmpPdf, () => {});

  pendingZipBuffer = await buildScormBuffer(title, slideBuffers);

  return { title, slideCount: slideBuffers.length, sizeBytes: pendingZipBuffer.length };
});
```

### Novo evento IPC: `conversion-progress-message`

Emitido pelo main quando não há progresso numérico disponível (etapa do LibreOffice). O renderer exibe a mensagem como texto estático com spinner, sem barra de progresso.

```
Main → Renderer:
  'conversion-progress-message'  payload: string   (mensagem livre)
  'conversion-progress'          payload: current, total  (já existente)
```

### Modificação no renderer

**`index.html`** — input file e drop zone aceitam os novos formatos:

```html
<input type="file" id="file-input" accept=".pdf,.ppt,.pptx" style="display:none">
```

```html
<div class="secondary">ou clique para selecionar</div>
<!-- hint: -->
<div id="hint">Arquivos .pdf, .ppt e .pptx</div>
```

**`app.js`** — validação na drop zone:

```javascript
const ACCEPTED = ['.pdf', '.ppt', '.pptx'];
const ext = '.' + file.name.split('.').pop().toLowerCase();
if (!ACCEPTED.includes(ext)) {
  setError('Apenas arquivos .pdf, .ppt e .pptx são suportados.');
  return;
}
```

Registrar listener do novo evento de mensagem:

```javascript
window.api.onProgressMessage((msg) => {
  document.getElementById('progress-text').textContent = msg;
  document.getElementById('progress-bar-fill').style.width = '0%';
});
```

### Modificação no `preload.js`

Adicionar ao contextBridge:

```javascript
onProgressMessage: (cb) => {
  const handler = (_event, msg) => cb(msg);
  ipcRenderer.on('conversion-progress-message', handler);
  return () => ipcRenderer.removeListener('conversion-progress-message', handler);
},
```

---

## Verificação do LibreOffice

Antes de iniciar a conversão, o main process verifica se o LibreOffice está instalado. Se não estiver, o IPC rejeita com mensagem clara que o renderer exibe na tela de upload:

```
"LibreOffice não encontrado. Instale em libreoffice.org e tente novamente."
```

Isso evita que o usuário aguarde o processo falhar silenciosamente.

---

## CLI (`convert.js`)

Adicionar suporte a `.pptx` e `.ppt`:

```javascript
const ext = path.extname(inputPath).toLowerCase();

let pdfPath = inputPath;
let tmpPdf  = null;

if (ext === '.ppt' || ext === '.pptx') {
  console.log('Convertendo apresentação com LibreOffice…');
  tmpPdf  = await convertPptxToPdf(inputPath);
  pdfPath = tmpPdf;
}

const images = await convertPdfToImages(pdfPath, (current, total) => {
  process.stdout.write(`\rPágina ${current} de ${total}...`);
});

if (tmpPdf) fs.unlinkSync(tmpPdf);
```

---

## O que está fora do escopo desta fase

- Suporte a `.odp`, `.key` (Keynote) ou outros formatos de apresentação
- Progresso em tempo real durante a etapa do LibreOffice (API não disponível)
- Bundling do LibreOffice no instalador
- Preservação de animações e transições do PowerPoint
- Modo HTML5 para PPTX (escopo da Fase 4 se necessário)

---

## Pré-requisito do usuário

O LibreOffice deve estar instalado na máquina. Download gratuito em **libreoffice.org**. A versão mínima recomendada é 7.x.

---

## Critérios de Aceitação

- [ ] Drop zone aceita arquivos `.ppt` e `.pptx` além de `.pdf`
- [ ] Mensagem "Convertendo apresentação…" é exibida durante a etapa do LibreOffice
- [ ] Progresso "Página X de Y" aparece normalmente após a etapa do LibreOffice
- [ ] ZIP gerado a partir de PPTX passa na validação SCORM 1.2 do LMS
- [ ] Erro claro é exibido se LibreOffice não estiver instalado
- [ ] PDF temporário é removido após a conversão (com ou sem erro)
- [ ] CLI `convert.js` aceita `.pptx` como argumento
- [ ] Conversão de PDF puro não sofre regressão
