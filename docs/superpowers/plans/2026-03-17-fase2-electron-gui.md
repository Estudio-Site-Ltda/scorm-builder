# Fase 2 — Interface Electron + Empacotamento Windows

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Empacotar o conversor PDF→SCORM como aplicativo desktop instalável no Windows com interface gráfica de arrastar-e-soltar.

**Architecture:** Electron (main process em Node.js + renderer em Chromium), comunicação via IPC com contextBridge. O ZIP SCORM é gerado em memória no main process e nunca trafega para o renderer; o renderer apenas dispara operações por nome. O CLI `convert.js` é mantido intacto.

**Tech Stack:** Electron 28, electron-builder (NSIS installer), Node.js 18 built-in, pdfjs-dist + @napi-rs/canvas (existentes), archiver (existente).

---

## Mapa de Arquivos

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `core/scormBuilder.js` | Modificar | Extrair `_populateArchive`, adicionar `buildScormBuffer` |
| `core/pdfConverter.js` | Modificar | Adicionar parâmetro opcional `onProgress` |
| `tests/pdfConverter.test.js` | Modificar | Corrigir asserção de largura (800 → 1920) |
| `tests/scormBuilder.test.js` | Modificar | Adicionar testes para `buildScormBuffer` |
| `package.json` | Modificar | Deps Electron, scripts, config electron-builder |
| `main.js` | Criar | Processo principal: BrowserWindow + handlers IPC |
| `preload.js` | Criar | contextBridge: expõe API segura para o renderer |
| `renderer/index.html` | Criar | UI: três views (upload / convertendo / revisão) |
| `renderer/app.js` | Criar | Lógica da UI: drag-drop, IPC, transições de view |

---

## Chunk 1: Preparação do core

### Task 1: Refatorar scormBuilder.js — extrair _populateArchive e adicionar buildScormBuffer

**Files:**
- Modify: `core/scormBuilder.js`
- Modify: `tests/scormBuilder.test.js`

- [ ] **Step 1: Adicionar testes para buildScormBuffer**

Abrir `tests/scormBuilder.test.js` e adicionar ao final:

```javascript
// Importar buildScormBuffer junto com os demais
// Linha 7 — alterar para:
const { buildScorm, buildScormBuffer, titleFromFilename } = require('../core/scormBuilder');

// Adicionar ao final do arquivo:

test('buildScormBuffer retorna Buffer com ZIP valido contendo todos os arquivos', async () => {
  const buf = await buildScormBuffer('Curso Buffer', [MINIMAL_PNG, MINIMAL_PNG]);

  assert.ok(Buffer.isBuffer(buf), 'deve ser um Buffer');
  assert.ok(buf.length > 0, 'buffer nao pode ser vazio');

  const zip = new AdmZip(buf);
  const entries = zip.getEntries().map(e => e.entryName);

  assert.ok(entries.includes('imsmanifest.xml'));
  assert.ok(entries.includes('index.html'));
  assert.ok(entries.includes('scorm_api.js'));
  assert.ok(entries.includes('slides/slide_01.png'));
  assert.ok(entries.includes('slides/slide_02.png'));
});

test('buildScormBuffer lanca erro para slides vazios', async () => {
  await assert.rejects(
    () => buildScormBuffer('Teste', []),
    { message: 'slideBuffers must contain at least one slide' }
  );
});

test('buildScormBuffer e buildScorm produzem o mesmo conteudo', async () => {
  const tmpDir = require('os').tmpdir();
  const outPath = require('path').join(tmpDir, 'cmp-test.zip');

  await buildScorm(outPath, 'Comparacao', [MINIMAL_PNG]);
  const diskBuf = require('fs').readFileSync(outPath);
  const memBuf  = await buildScormBuffer('Comparacao', [MINIMAL_PNG]);

  // Ambos devem conter os mesmos arquivos internos
  const zipDisk = new AdmZip(diskBuf);
  const zipMem  = new AdmZip(memBuf);
  const namesDisk = zipDisk.getEntries().map(e => e.entryName).sort();
  const namesMem  = zipMem.getEntries().map(e => e.entryName).sort();
  assert.deepEqual(namesMem, namesDisk, 'lista de arquivos deve ser identica');
});
```

- [ ] **Step 2: Executar os novos testes — devem falhar (buildScormBuffer não existe)**

```bash
node --test tests/scormBuilder.test.js
```

Esperado: FAIL com `TypeError: buildScormBuffer is not a function` nos 3 novos testes.

- [ ] **Step 3: Refatorar scormBuilder.js**

Substituir o conteúdo de `core/scormBuilder.js` inteiro pelo código abaixo:

```javascript
'use strict';

const fs = require('fs');
const path = require('path');
const { PassThrough } = require('stream');
const archiver = require('archiver');

const TEMPLATES_DIR = path.join(__dirname, 'templates');

function titleFromFilename(filename) {
  const base = path.basename(filename, path.extname(filename));
  return base
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

function courseIdFromTitle(title) {
  return 'course-' + title.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

function escapeXml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Preenche um archiver com o conteúdo SCORM 1.2.
 * Reutilizado por buildScorm e buildScormBuffer.
 * @param {import('archiver').Archiver} archive
 * @param {string} courseTitle
 * @param {Buffer[]} slideBuffers
 */
function _populateArchive(archive, courseTitle, slideBuffers) {
  const courseId = courseIdFromTitle(courseTitle);
  const slideFilenames = slideBuffers.map((_, i) =>
    `slides/slide_${String(i + 1).padStart(2, '0')}.png`
  );

  const slideFileList = slideFilenames
    .map(f => `      <file href="${f}"/>`)
    .join('\n');

  let manifest = fs.readFileSync(path.join(TEMPLATES_DIR, 'imsmanifest.xml'), 'utf8');
  manifest = manifest
    .replace(/\{\{COURSE_ID\}\}/g, escapeXml(courseId))
    .replace(/\{\{COURSE_TITLE\}\}/g, escapeXml(courseTitle))
    .replace(/\{\{SLIDE_FILE_LIST\}\}/g, slideFileList);

  const slidesJson = JSON.stringify(slideFilenames);
  let player = fs.readFileSync(path.join(TEMPLATES_DIR, 'player.html'), 'utf8');
  player = player
    .replace(/\{\{COURSE_TITLE\}\}/g, escapeHtml(courseTitle))
    .replace(/\{\{SLIDE_COUNT\}\}/g, String(slideBuffers.length))
    .replace(/\{\{SLIDES_JSON\}\}/g, slidesJson);

  archive.append(manifest, { name: 'imsmanifest.xml' });
  archive.append(player,   { name: 'index.html' });
  archive.file(path.join(TEMPLATES_DIR, 'scorm_api.js'), { name: 'scorm_api.js' });

  slideBuffers.forEach((buf, i) => {
    archive.append(buf, { name: slideFilenames[i] });
  });
}

/**
 * Gera o ZIP SCORM 1.2 e grava em disco.
 * @param {string}   outputPath  - Caminho absoluto onde o ZIP será salvo
 * @param {string}   courseTitle
 * @param {Buffer[]} slideBuffers
 * @returns {Promise<void>}
 */
async function buildScorm(outputPath, courseTitle, slideBuffers) {
  if (!slideBuffers || slideBuffers.length === 0) {
    throw new Error('slideBuffers must contain at least one slide');
  }
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outputPath);
    const archive = archiver('zip', { zlib: { level: 6 } });

    output.on('close', resolve);
    output.on('error', reject);
    archive.on('error', reject);
    archive.pipe(output);

    _populateArchive(archive, courseTitle, slideBuffers);
    archive.finalize();
  });
}

/**
 * Gera o ZIP SCORM 1.2 em memória e retorna um Buffer.
 * Usado pelo processo principal do Electron (sem gravar em disco).
 * @param {string}   courseTitle
 * @param {Buffer[]} slideBuffers
 * @returns {Promise<Buffer>}
 */
async function buildScormBuffer(courseTitle, slideBuffers) {
  if (!slideBuffers || slideBuffers.length === 0) {
    throw new Error('slideBuffers must contain at least one slide');
  }
  return new Promise((resolve, reject) => {
    const chunks = [];
    const passThrough = new PassThrough();
    passThrough.on('data',  (chunk) => chunks.push(chunk));
    passThrough.on('end',   () => resolve(Buffer.concat(chunks)));
    passThrough.on('error', reject);

    const archive = archiver('zip', { zlib: { level: 6 } });
    archive.on('error', reject);
    archive.pipe(passThrough);

    _populateArchive(archive, courseTitle, slideBuffers);
    archive.finalize();
  });
}

module.exports = { buildScorm, buildScormBuffer, titleFromFilename };
```

- [ ] **Step 4: Executar todos os testes de scormBuilder — devem passar**

```bash
node --test tests/scormBuilder.test.js
```

Esperado: todos os testes passam (incluindo os 3 novos).

- [ ] **Step 5: Commit**

```bash
git add core/scormBuilder.js tests/scormBuilder.test.js
git commit -m "feat: add buildScormBuffer for in-memory ZIP generation"
```

---

### Task 2: Adicionar callback de progresso ao pdfConverter.js e corrigir teste de largura

**Files:**
- Modify: `core/pdfConverter.js`
- Modify: `tests/pdfConverter.test.js`

**Contexto:** O `TARGET_WIDTH` já é 1920, mas o teste verifica 800 — o teste está desatualizado. Esta task corrige isso e adiciona o parâmetro `onProgress` opcional.

- [ ] **Step 1: Executar os testes existentes — verificar que o teste de largura falha**

```bash
node --test tests/pdfConverter.test.js
```

Esperado: FAIL no teste `gera imagens com largura de 800px` (largura real é 1920).

- [ ] **Step 2: Corrigir teste de largura e adicionar teste de progresso**

Em `tests/pdfConverter.test.js`:

Alterar linha 30:
```javascript
// de:
assert.equal(width, 800, `largura deve ser 800px, mas foi ${width}px`);
// para:
assert.equal(width, 1920, `largura deve ser 1920px, mas foi ${width}px`);
```

Adicionar ao final do arquivo:
```javascript
test('convertPdfToImages chama onProgress para cada pagina', async () => {
  const calls = [];
  await convertPdfToImages(SAMPLE_PDF, (current, total) => {
    calls.push({ current, total });
  });

  assert.ok(calls.length > 0, 'onProgress deve ser chamado pelo menos uma vez');
  // Verificar que current e total são numeros validos
  for (const { current, total } of calls) {
    assert.ok(typeof current === 'number' && current >= 1);
    assert.ok(typeof total === 'number' && total >= current);
  }
  // Verificar que a última chamada é current === total
  const last = calls[calls.length - 1];
  assert.equal(last.current, last.total, 'ultima chamada deve ter current === total');
});
```

- [ ] **Step 3: Executar testes — devem falhar (onProgress não implementado)**

```bash
node --test tests/pdfConverter.test.js
```

Esperado: FAIL no novo teste de progresso; o teste de largura agora PASS.

- [ ] **Step 4: Adicionar onProgress a convertPdfToImages**

Em `core/pdfConverter.js`, alterar apenas a assinatura e o loop:

```javascript
// Linha 57 — alterar assinatura:
async function convertPdfToImages(pdfPath, onProgress) {

// Após a linha 92 (images.push(...)):
    images.push(canvasAndContext.canvas.toBuffer('image/png'));
    if (typeof onProgress === 'function') onProgress(pageNum, pdf.numPages);
```

O arquivo completo da função após a mudança:

```javascript
async function convertPdfToImages(pdfPath, onProgress) {
  const data = new Uint8Array(fs.readFileSync(pdfPath));

  const canvasFactory = new NapiCanvasFactory();

  const loadingTask = pdfjsLib.getDocument({
    data,
    canvasFactory,
    cMapUrl: CMAP_URL,
    cMapPacked: true,
    standardFontDataUrl: STANDARD_FONT_DATA_URL,
    useSystemFonts: true,
    disableFontFace: true,
  });

  const pdf = await loadingTask.promise;
  const images = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const baseViewport = page.getViewport({ scale: 1 });
    const scale = TARGET_WIDTH / baseViewport.width;
    const viewport = page.getViewport({ scale });

    const width = Math.round(viewport.width);
    const height = Math.round(viewport.height);

    const canvasAndContext = canvasFactory.create(width, height);

    await page.render({
      canvasContext: canvasAndContext.context,
      viewport,
      canvasFactory,
    }).promise;

    images.push(canvasAndContext.canvas.toBuffer('image/png'));
    if (typeof onProgress === 'function') onProgress(pageNum, pdf.numPages);
  }

  return images;
}
```

- [ ] **Step 5: Executar todos os testes — devem passar**

```bash
node --test tests/pdfConverter.test.js
```

Esperado: todos os 4 testes passam.

- [ ] **Step 6: Executar a suite completa para garantir que nada quebrou**

```bash
node --test tests/pdfConverter.test.js tests/scormBuilder.test.js tests/integration.test.js
```

Esperado: todos os testes passam.

- [ ] **Step 7: Commit**

```bash
git add core/pdfConverter.js tests/pdfConverter.test.js
git commit -m "feat: add optional onProgress callback to convertPdfToImages, fix width assertion"
```

---

### Task 3: Instalar dependências Electron e atualizar package.json

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Instalar electron e electron-builder**

```bash
npm install --save-dev electron@^28 electron-builder@^24
```

Aguardar a instalação. Ignorar warnings sobre peer deps opcionais.

- [ ] **Step 2: Atualizar package.json**

Substituir o conteúdo de `package.json` pelo seguinte (mantendo as dependências já instaladas):

```json
{
  "name": "conversor-scorm",
  "version": "2.0.0",
  "description": "Conversor PDF para pacotes SCORM 1.2",
  "main": "main.js",
  "scripts": {
    "start": "electron .",
    "build": "electron-builder",
    "test": "node --test tests/pdfConverter.test.js tests/scormBuilder.test.js tests/integration.test.js",
    "convert": "node convert.js"
  },
  "engines": {
    "node": ">=18"
  },
  "keywords": [],
  "author": "",
  "license": "ISC",
  "type": "commonjs",
  "dependencies": {
    "@napi-rs/canvas": "^0.1.97",
    "archiver": "^7.0.1",
    "pdfjs-dist": "^3.11.174"
  },
  "devDependencies": {
    "adm-zip": "^0.5.16",
    "electron": "^28.0.0",
    "electron-builder": "^24.0.0"
  },
  "build": {
    "appId": "com.estudiossite.conversor-scorm",
    "productName": "Conversor SCORM",
    "win": {
      "target": "nsis"
    },
    "nsis": {
      "oneClick": false,
      "perMachine": false,
      "allowElevation": false
    },
    "files": [
      "main.js",
      "preload.js",
      "renderer/**",
      "core/**",
      "node_modules/**",
      "!node_modules/.cache/**",
      "!**/tests/**",
      "!convert.js",
      "!input/**",
      "!output/**",
      "!docs/**",
      "!Exemplos/**"
    ],
    "asar": true,
    "asarUnpack": [
      "**/@napi-rs/canvas/**",
      "**/pdfjs-dist/legacy/build/**"
    ]
  }
}
```

- [ ] **Step 3: Verificar que electron está instalado**

```bash
npx electron --version
```

Esperado: `v28.x.x`

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add electron and electron-builder dependencies"
```

---

## Chunk 2: Processos Electron

### Task 4: Criar preload.js

**Files:**
- Create: `preload.js`

- [ ] **Step 1: Criar preload.js**

```javascript
'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  /**
   * Inicia a conversão do PDF.
   * Progresso chega via onProgress() antes deste Promise resolver.
   * @param {string} filePath - Caminho absoluto para o PDF
   * @returns {Promise<{ title: string, slideCount: number, sizeBytes: number }>}
   */
  convertPdf: (filePath) =>
    ipcRenderer.invoke('convert-pdf', filePath),

  /**
   * Abre diálogo "Salvar como" e grava o ZIP em disco.
   * Usa o buffer retido no main process — nunca transfere bytes para o renderer.
   * Retorna { saved: false } se o usuário cancelar ou se não houver conversão pendente.
   * Lança erro se a gravação em disco falhar.
   * @param {string} title - Nome do curso (usado como nome sugerido do arquivo)
   * @returns {Promise<{ saved: boolean, path?: string }>}
   */
  saveFile: (title) =>
    ipcRenderer.invoke('save-file', title),

  /**
   * Limpa o estado do main process (descarta o ZIP em memória).
   * Chamar antes de exibir a tela de upload novamente ("Converter outro").
   * @returns {Promise<void>}
   */
  resetState: () =>
    ipcRenderer.invoke('reset-state'),

  /**
   * Registra listener de progresso de conversão.
   * O RENDERER é responsável por remover o listener:
   *   - caminho feliz: ao exibir a tela de revisão (após convertPdf resolver)
   *   - caminho de erro: no bloco catch (via try/finally)
   * @param {(current: number, total: number) => void} cb
   * @returns {() => void} função de cleanup — chame para remover o listener
   */
  onProgress: (cb) => {
    const handler = (_event, current, total) => cb(current, total);
    ipcRenderer.on('conversion-progress', handler);
    return () => ipcRenderer.removeListener('conversion-progress', handler);
  },
});
```

- [ ] **Step 2: Commit**

```bash
git add preload.js
git commit -m "feat: add Electron preload with contextBridge API"
```

---

### Task 5: Criar main.js

**Files:**
- Create: `main.js`

- [ ] **Step 1: Criar main.js**

```javascript
'use strict';

const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs   = require('fs');

const { convertPdfToImages } = require('./core/pdfConverter');
const { buildScormBuffer, titleFromFilename } = require('./core/scormBuilder');

let mainWindow;

/** Buffer do ZIP gerado, retido até o usuário salvar ou converter outro arquivo. */
let pendingZipBuffer = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 460,
    height: 540,
    resizable: false,
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ── IPC: convert-pdf ────────────────────────────────────────────────────────
ipcMain.handle('convert-pdf', async (event, filePath) => {
  pendingZipBuffer = null;

  const title = titleFromFilename(path.basename(filePath));

  const slideBuffers = await convertPdfToImages(filePath, (current, total) => {
    // Envia progresso para o renderer enquanto converte
    event.sender.send('conversion-progress', current, total);
  });

  pendingZipBuffer = await buildScormBuffer(title, slideBuffers);

  return {
    title,
    slideCount: slideBuffers.length,
    sizeBytes:  pendingZipBuffer.length,
  };
});

// ── IPC: save-file ──────────────────────────────────────────────────────────
ipcMain.handle('save-file', async (_event, title) => {
  if (!pendingZipBuffer) {
    return { saved: false };
  }

  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  const defaultFilename = `${slug}-scorm.zip`;

  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    defaultPath: defaultFilename,
    filters: [{ name: 'ZIP SCORM', extensions: ['zip'] }],
  });

  if (canceled || !filePath) return { saved: false };

  await fs.promises.writeFile(filePath, pendingZipBuffer);
  return { saved: true, path: filePath };
});

// ── IPC: reset-state ────────────────────────────────────────────────────────
ipcMain.handle('reset-state', () => {
  pendingZipBuffer = null;
});
```

- [ ] **Step 2: Commit**

```bash
git add main.js
git commit -m "feat: add Electron main process with IPC handlers"
```

---

## Chunk 3: Interface do Usuário

### Task 6: Criar renderer/index.html e renderer/app.js

**Files:**
- Create: `renderer/index.html`
- Create: `renderer/app.js`

- [ ] **Step 1: Criar diretório renderer/**

```bash
mkdir renderer
```

- [ ] **Step 2: Criar renderer/index.html**

```html
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy"
        content="default-src 'self'; style-src 'self' 'unsafe-inline'">
  <title>Conversor SCORM</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      --bg:            #0c0c0e;
      --surface:       rgba(255,255,255,0.04);
      --surface-hover: rgba(255,255,255,0.08);
      --border:        rgba(255,255,255,0.08);
      --border-strong: rgba(255,255,255,0.14);
      --text:          #ececec;
      --text-muted:    rgba(255,255,255,0.38);
      --green:         rgb(52,211,153);
      --green-bg:      rgba(52,211,153,0.12);
      --danger:        rgba(255,100,100,0.85);
    }

    body {
      font-family: 'Segoe UI Variable', 'Segoe UI', system-ui, sans-serif;
      background: var(--bg);
      color: var(--text);
      height: 100vh;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      user-select: none;
    }

    /* ── Titlebar ─────────────────────────────── */
    #titlebar {
      height: 36px;
      -webkit-app-region: drag;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      position: relative;
    }
    #titlebar .title {
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.1em;
      color: var(--text-muted);
      text-transform: uppercase;
    }
    #btn-close {
      position: absolute;
      right: 14px;
      width: 14px;
      height: 14px;
      border-radius: 50%;
      background: #ff5f57;
      border: none;
      cursor: pointer;
      -webkit-app-region: no-drag;
      opacity: 0.7;
      transition: opacity 0.15s;
    }
    #btn-close:hover { opacity: 1; }

    /* ── Content area ─────────────────────────── */
    #content {
      flex: 1;
      display: flex;
      flex-direction: column;
      padding: 0 28px 28px;
      min-height: 0;
    }

    /* ── Views ────────────────────────────────── */
    .view { display: none; flex-direction: column; flex: 1; }
    .view.active { display: flex; }

    /* ── View: Upload ─────────────────────────── */
    #view-upload {
      align-items: center;
      justify-content: center;
      gap: 10px;
    }
    #drop-zone {
      border: 1.5px dashed var(--border-strong);
      border-radius: 16px;
      padding: 40px 32px;
      text-align: center;
      width: 100%;
      cursor: pointer;
      background: var(--surface);
      transition: border-color 0.15s, background 0.15s;
    }
    #drop-zone:hover,
    #drop-zone.drag-over {
      border-color: rgba(255,255,255,0.3);
      background: var(--surface-hover);
    }
    #drop-zone .icon     { font-size: 34px; margin-bottom: 14px; }
    #drop-zone .primary  { font-size: 14px; font-weight: 500; }
    #drop-zone .secondary{ font-size: 12px; color: var(--text-muted); margin-top: 4px; }
    #error-msg { font-size: 12px; color: var(--danger); min-height: 18px; text-align: center; }
    #hint      { font-size: 11px; color: rgba(255,255,255,0.2); }

    /* ── View: Converting ─────────────────────── */
    #view-converting {
      align-items: center;
      justify-content: center;
      gap: 20px;
    }
    #converting-filename {
      font-size: 12px;
      color: var(--text-muted);
      max-width: 340px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .spinner {
      width: 44px;
      height: 44px;
      border-radius: 50%;
      border: 3px solid var(--border-strong);
      border-top-color: rgba(255,255,255,0.65);
      animation: spin 0.75s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    #progress-text { font-size: 13px; font-weight: 500; }
    #progress-bar-track {
      width: 100%;
      height: 3px;
      background: var(--border);
      border-radius: 2px;
      overflow: hidden;
    }
    #progress-bar-fill {
      height: 100%;
      background: rgba(255,255,255,0.55);
      border-radius: 2px;
      transition: width 0.2s ease;
      width: 0%;
    }

    /* ── View: Review ─────────────────────────── */
    #view-review { gap: 16px; justify-content: center; }

    .badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: var(--green-bg);
      border: 1px solid rgba(52,211,153,0.25);
      border-radius: 100px;
      padding: 4px 12px;
      font-size: 12px;
      font-weight: 500;
      color: var(--green);
      align-self: flex-start;
    }
    .field-label {
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 0.08em;
      color: var(--text-muted);
      text-transform: uppercase;
      margin-bottom: 6px;
    }
    .field-input {
      width: 100%;
      background: rgba(255,255,255,0.04);
      border: 1px solid var(--border-strong);
      border-radius: 8px;
      padding: 9px 12px;
      color: var(--text);
      font-size: 13px;
      font-family: inherit;
      outline: none;
      transition: border-color 0.15s;
    }
    .field-input:focus { border-color: rgba(255,255,255,0.28); }

    .info-row { display: flex; gap: 12px; }
    .info-card {
      flex: 1;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 10px 14px;
    }
    .info-card .label {
      font-size: 10px;
      color: var(--text-muted);
      letter-spacing: 0.06em;
      text-transform: uppercase;
      margin-bottom: 3px;
    }
    .info-card .value { font-size: 13px; font-weight: 500; }

    .btn-row { display: flex; gap: 8px; margin-top: auto; }
    .btn {
      border: none;
      border-radius: 8px;
      padding: 10px 16px;
      font-size: 13px;
      font-weight: 500;
      font-family: inherit;
      cursor: pointer;
      transition: background 0.15s, transform 0.1s;
    }
    .btn:active:not(:disabled) { transform: scale(0.97); }
    .btn:disabled { opacity: 0.5; cursor: default; }
    .btn-secondary {
      flex: 1;
      background: var(--surface);
      border: 1px solid var(--border-strong);
      color: var(--text-muted);
    }
    .btn-secondary:hover:not(:disabled) { background: var(--surface-hover); color: var(--text); }
    .btn-primary {
      flex: 2;
      background: rgba(255,255,255,0.1);
      border: 1px solid rgba(255,255,255,0.16);
      color: var(--text);
    }
    .btn-primary:hover:not(:disabled) { background: rgba(255,255,255,0.16); }
  </style>
</head>
<body>

  <div id="titlebar">
    <span class="title">Conversor SCORM</span>
    <button id="btn-close" title="Fechar"></button>
  </div>

  <div id="content">

    <!-- View: Upload -->
    <div id="view-upload" class="view active">
      <div id="drop-zone">
        <div class="icon">📄</div>
        <div class="primary">Arraste um PDF aqui</div>
        <div class="secondary">ou clique para selecionar</div>
      </div>
      <div id="error-msg"></div>
      <div id="hint">Apenas arquivos .pdf</div>
      <input type="file" id="file-input" accept=".pdf" style="display:none">
    </div>

    <!-- View: Converting -->
    <div id="view-converting" class="view">
      <div id="converting-filename"></div>
      <div class="spinner"></div>
      <div id="progress-text">Iniciando conversão…</div>
      <div id="progress-bar-track">
        <div id="progress-bar-fill"></div>
      </div>
    </div>

    <!-- View: Review -->
    <div id="view-review" class="view">
      <div class="badge">
        <svg width="12" height="12" viewBox="0 0 256 256" fill="currentColor">
          <path d="M229.66,77.66l-128,128a8,8,0,0,1-11.32,0l-56-56a8,8,0,0,1,11.32-11.32L96,188.69,218.34,66.34a8,8,0,0,1,11.32,11.32Z"/>
        </svg>
        Conversão concluída
      </div>
      <div>
        <div class="field-label">Nome do curso</div>
        <input type="text" id="course-title-input" class="field-input">
      </div>
      <div class="info-row">
        <div class="info-card">
          <div class="label">Slides</div>
          <div class="value" id="info-slides">—</div>
        </div>
        <div class="info-card">
          <div class="label">Tamanho</div>
          <div class="value" id="info-size">—</div>
        </div>
      </div>
      <div class="btn-row">
        <button class="btn btn-secondary" id="btn-reset">← Converter outro</button>
        <button class="btn btn-primary"   id="btn-save">Salvar .zip →</button>
      </div>
    </div>

  </div>

  <script src="app.js"></script>
</body>
</html>
```

- [ ] **Step 3: Criar renderer/app.js**

```javascript
'use strict';

// ── Utilitários ────────────────────────────────────────────────────────────

function formatBytes(bytes) {
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function showView(id) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function setError(msg) {
  document.getElementById('error-msg').textContent = msg || '';
}

// ── Estado ─────────────────────────────────────────────────────────────────

let unsubscribeProgress = null;

// ── Fechar janela ──────────────────────────────────────────────────────────

document.getElementById('btn-close').addEventListener('click', () => window.close());

// ── View: Upload — arrastar e soltar ───────────────────────────────────────

const dropZone  = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');

dropZone.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', () => {
  const file = fileInput.files[0];
  if (file) startConversion(file.path);
});

document.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('drag-over');
});

document.addEventListener('dragleave', (e) => {
  if (!e.relatedTarget || !document.contains(e.relatedTarget)) {
    dropZone.classList.remove('drag-over');
  }
});

document.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (!file) return;
  if (!file.name.toLowerCase().endsWith('.pdf')) {
    setError('Apenas arquivos .pdf são suportados.');
    return;
  }
  startConversion(file.path);
});

// ── Conversão ──────────────────────────────────────────────────────────────

async function startConversion(filePath) {
  setError('');
  const filename = filePath.split(/[\\/]/).pop();
  document.getElementById('converting-filename').textContent = filename;
  document.getElementById('progress-text').textContent = 'Iniciando conversão…';
  document.getElementById('progress-bar-fill').style.width = '0%';
  showView('view-converting');

  // Registrar listener de progresso antes de chamar convertPdf
  unsubscribeProgress = window.api.onProgress((current, total) => {
    const pct = Math.round((current / total) * 100);
    document.getElementById('progress-text').textContent =
      `Convertendo slides… Página ${current} de ${total}`;
    document.getElementById('progress-bar-fill').style.width = pct + '%';
  });

  try {
    const result = await window.api.convertPdf(filePath);
    if (unsubscribeProgress) { unsubscribeProgress(); unsubscribeProgress = null; }
    showReview(result);
  } catch (err) {
    if (unsubscribeProgress) { unsubscribeProgress(); unsubscribeProgress = null; }
    showView('view-upload');
    setError('Erro ao converter: ' + (err.message || 'Falha desconhecida'));
  }
}

// ── Revisão ────────────────────────────────────────────────────────────────

function showReview({ title, slideCount, sizeBytes }) {
  document.getElementById('course-title-input').value = title;
  document.getElementById('info-slides').textContent = slideCount + ' slides';
  document.getElementById('info-size').textContent   = formatBytes(sizeBytes);
  showView('view-review');
}

document.getElementById('btn-save').addEventListener('click', async () => {
  const title = document.getElementById('course-title-input').value.trim() || 'Curso';
  const btn   = document.getElementById('btn-save');

  btn.disabled    = true;
  btn.textContent = 'Salvando…';

  try {
    const result = await window.api.saveFile(title);
    if (result.saved) {
      btn.textContent = '✓ Salvo!';
      setTimeout(() => {
        btn.disabled    = false;
        btn.textContent = 'Salvar .zip →';
      }, 2000);
    } else {
      // Usuário cancelou o diálogo
      btn.disabled    = false;
      btn.textContent = 'Salvar .zip →';
    }
  } catch (err) {
    btn.disabled    = false;
    btn.textContent = 'Salvar .zip →';
    setError('Erro ao salvar: ' + (err.message || 'Falha ao gravar arquivo'));
  }
});

document.getElementById('btn-reset').addEventListener('click', async () => {
  await window.api.resetState();
  fileInput.value = '';
  showView('view-upload');
});
```

- [ ] **Step 4: Commit**

```bash
git add renderer/index.html renderer/app.js
git commit -m "feat: add Electron renderer UI (upload, converting, review views)"
```

---

## Chunk 4: Teste manual e build

### Task 7: Smoke test — executar no modo desenvolvimento

**Files:** nenhum

- [ ] **Step 1: Iniciar o app em modo desenvolvimento**

```bash
npm start
```

Esperado: janela do app abre (460×540px, tema escuro, frameless).

- [ ] **Step 2: Testar fluxo completo**

1. Arrastar o arquivo `Exemplos/PDF/Como-Funciona-a-Plataforma-03.pdf` para a drop zone
2. Verificar que a tela "Convertendo" aparece com progresso "Página X de Y"
3. Verificar que a tela de revisão aparece com nome do curso, contagem de slides e tamanho
4. Editar o nome do curso para "Teste Electron"
5. Clicar "Salvar .zip" — diálogo "Salvar como" deve abrir com `teste-electron-scorm.zip` como nome sugerido
6. Salvar e verificar que o arquivo ZIP existe em disco
7. Clicar "Converter outro" — app deve voltar para a tela de upload
8. Tentar arrastar um arquivo `.txt` — deve exibir mensagem de erro

- [ ] **Step 3: Verificar que o CLI ainda funciona**

```bash
npm run convert -- Exemplos/PDF/Como-Funciona-a-Plataforma-03.pdf
```

Esperado: arquivo gerado em `output/`.

- [ ] **Step 4: Commit de eventuais correções encontradas durante o teste**

```bash
git add -A
git commit -m "fix: smoke test corrections"
```

(Pular se nenhuma correção for necessária.)

---

### Task 8: Build do instalador Windows

**Files:** nenhum

- [ ] **Step 1: Executar o build**

```bash
npm run build
```

Esperado: diretório `dist/` criado com `Conversor SCORM Setup X.X.X.exe` dentro.

A primeira execução pode demorar alguns minutos (baixa o Electron binário para empacotamento).

- [ ] **Step 2: Se o build falhar por causa de @napi-rs/canvas**

Caso o erro seja `Error: The module was compiled against a different Node.js version`, instalar `@electron/rebuild` e executar:

```bash
npm install --save-dev @electron/rebuild
npx electron-rebuild
npm run build
```

- [ ] **Step 3: Instalar e testar o instalador gerado**

1. Executar `dist/Conversor SCORM Setup X.X.X.exe`
2. Seguir o instalador (não deve pedir admin)
3. Abrir o app instalado e repetir o fluxo do Task 7
4. Verificar que o ZIP gerado é válido no LMS

- [ ] **Step 4: Adicionar dist/ ao .gitignore**

Verificar se `.gitignore` existe. Se não existir, criar; se existir, adicionar:

```
dist/
output/
input/
node_modules/
.superpowers/
```

- [ ] **Step 5: Commit final**

```bash
git add .gitignore
git commit -m "chore: add dist/ and build artifacts to .gitignore"
```
