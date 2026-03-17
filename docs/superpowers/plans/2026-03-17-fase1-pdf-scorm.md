# Fase 1: Conversor PDF → SCORM 1.2 (MVP CLI) — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Script Node.js CLI que converte arquivos PDF em pacotes SCORM 1.2 com player responsivo e tracking de conclusão (lesson_status = "completed" ao chegar no último slide).

**Architecture:** Três módulos independentes: `pdfConverter.js` (PDF→array de PNGs via pdfjs-dist + @napi-rs/canvas), `scormBuilder.js` (PNGs + templates → ZIP SCORM 1.2 via archiver), e `convert.js` (CLI entry point com modo arquivo único e modo batch). Templates estáticos para manifesto e player HTML são preenchidos via string replace.

**Tech Stack:** Node.js 18+, pdfjs-dist 3.x (CJS, legacy build), @napi-rs/canvas, archiver, node:test (testes)

---

## Chunk 1: Setup do Projeto + Templates Estáticos

### Task 1: Inicializar projeto Node.js

**Files:**
- Create: `package.json`
- Create: `input/.gitkeep`
- Create: `output/.gitkeep`

- [ ] **Step 1: Inicializar package.json**

```bash
cd "C:\Agentes Claude\conversor-scorm"
npm init -y
```

- [ ] **Step 2: Instalar dependências**

```bash
npm install pdfjs-dist@3 @napi-rs/canvas archiver
npm install --save-dev adm-zip
```

Expected: instalação sem erros. `@napi-rs/canvas` usa binários pré-compilados para Windows — não requer Build Tools. `adm-zip` (devDependency) é usado nos testes para ler e inspecionar o conteúdo dos ZIPs gerados.

- [ ] **Step 3: Ajustar package.json**

Editar `package.json` para garantir:
```json
{
  "name": "conversor-scorm",
  "version": "1.0.0",
  "description": "Conversor PDF/PPT para pacotes SCORM 1.2",
  "main": "convert.js",
  "scripts": {
    "test": "node --test tests/pdfConverter.test.js tests/scormBuilder.test.js tests/integration.test.js"
  },
  "engines": {
    "node": ">=18"
  }
}
```

- [ ] **Step 4: Criar pastas e estrutura**

```bash
mkdir -p "C:\Agentes Claude\conversor-scorm\input"
mkdir -p "C:\Agentes Claude\conversor-scorm\output"
mkdir -p "C:\Agentes Claude\conversor-scorm\core\templates"
mkdir -p "C:\Agentes Claude\conversor-scorm\tests"
```

- [ ] **Step 5: Commit inicial**

```bash
git init
git add package.json package-lock.json
git commit -m "chore: initialize project with dependencies"
```

---

### Task 2: Criar template scorm_api.js

**Files:**
- Create: `core/templates/scorm_api.js`

Arquivo estático copiado verbatim para cada ZIP gerado. Implementa o shim mínimo da API SCORM 1.2.

- [ ] **Step 1: Criar `core/templates/scorm_api.js`**

```javascript
// SCORM 1.2 API Shim
var API = null;

function findAPI(win) {
  var searchCount = 0;
  while (win.API == null && win.parent != null && win.parent != win) {
    searchCount++;
    if (searchCount > 7) return null;
    win = win.parent;
  }
  return win.API;
}

function getAPI() {
  if (API != null) return API;
  API = findAPI(window);
  if (API == null && window.opener != null) {
    API = findAPI(window.opener);
  }
  return API;
}

function LMSInitialize() {
  var api = getAPI();
  if (api) return api.LMSInitialize('');
  return 'false';
}

function LMSSetValue(element, value) {
  var api = getAPI();
  if (api) return api.LMSSetValue(element, value);
  return 'false';
}

function LMSGetValue(element) {
  var api = getAPI();
  if (api) return api.LMSGetValue(element);
  return '';
}

function LMSCommit() {
  var api = getAPI();
  if (api) return api.LMSCommit('');
  return 'false';
}

function LMSFinish() {
  var api = getAPI();
  if (api) return api.LMSFinish('');
  return 'false';
}
```

- [ ] **Step 2: Commit**

```bash
git add core/templates/scorm_api.js
git commit -m "feat: add SCORM 1.2 API shim template"
```

---

### Task 3: Criar template imsmanifest.xml

**Files:**
- Create: `core/templates/imsmanifest.xml`

Template do manifesto SCORM 1.2. Placeholders: `{{COURSE_ID}}`, `{{COURSE_TITLE}}`, `{{SLIDE_FILE_LIST}}`.

- [ ] **Step 1: Criar `core/templates/imsmanifest.xml`**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="{{COURSE_ID}}" version="1.2"
  xmlns="http://www.imsproject.org/xsd/imscp_rootv1p1p2"
  xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_rootv1p2"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.imsproject.org/xsd/imscp_rootv1p1p2 imscp_rootv1p1p2.xsd
                      http://www.adlnet.org/xsd/adlcp_rootv1p2 adlcp_rootv1p2.xsd">
  <metadata>
    <schema>ADL SCORM</schema>
    <schemaversion>1.2</schemaversion>
  </metadata>
  <organizations default="org1">
    <organization identifier="org1">
      <title>{{COURSE_TITLE}}</title>
      <item identifier="item1" identifierref="res1">
        <title>{{COURSE_TITLE}}</title>
      </item>
    </organization>
  </organizations>
  <resources>
    <resource identifier="res1" type="webcontent" adlcp:scormtype="sco" href="index.html">
      <file href="index.html"/>
      <file href="scorm_api.js"/>
      {{SLIDE_FILE_LIST}}
    </resource>
  </resources>
</manifest>
```

- [ ] **Step 2: Commit**

```bash
git add core/templates/imsmanifest.xml
git commit -m "feat: add SCORM 1.2 manifest template"
```

---

### Task 4: Criar template player.html

**Files:**
- Create: `core/templates/player.html`

Player de slides responsivo, mobile-friendly, com suporte a teclado, swipe e tracking SCORM. Sem dependências externas (CSS e JS inline). Placeholders: `{{COURSE_TITLE}}`, `{{SLIDE_COUNT}}`, `{{SLIDES_JSON}}`.

- [ ] **Step 1: Criar `core/templates/player.html`**

```html
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{{COURSE_TITLE}}</title>
  <script src="scorm_api.js"></script>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: sans-serif;
      background: #1a1a1a;
      color: #fff;
      display: flex;
      flex-direction: column;
      min-height: 100vh;
      min-height: 100dvh;
    }
    #slide-container {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 16px;
      overflow: hidden;
    }
    #slide-img {
      max-width: 100%;
      height: auto;
      display: block;
      border-radius: 4px;
      box-shadow: 0 4px 24px rgba(0,0,0,0.5);
    }
    #controls {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 16px;
      padding: 12px 16px;
      background: #111;
      flex-shrink: 0;
    }
    button {
      background: #444;
      color: #fff;
      border: none;
      padding: 10px 20px;
      border-radius: 6px;
      font-size: 18px;
      cursor: pointer;
      min-width: 48px;
      min-height: 48px;
      touch-action: manipulation;
    }
    button:hover:not(:disabled) { background: #666; }
    button:active:not(:disabled) { background: #888; }
    button:disabled { opacity: 0.3; cursor: default; }
    #counter {
      font-size: 14px;
      color: #aaa;
      min-width: 80px;
      text-align: center;
      user-select: none;
    }
  </style>
</head>
<body>
  <div id="slide-container">
    <img id="slide-img" src="" alt="Slide">
  </div>
  <div id="controls">
    <button id="btn-prev" onclick="navigate(-1)" aria-label="Slide anterior">&#8592;</button>
    <span id="counter">1 / {{SLIDE_COUNT}}</span>
    <button id="btn-next" onclick="navigate(1)" aria-label="Próximo slide">&#8594;</button>
  </div>

  <script>
    var slides = {{SLIDES_JSON}};
    var current = 0;
    var completed = false;

    function render() {
      var img = document.getElementById('slide-img');
      img.src = slides[current];
      img.alt = 'Slide ' + (current + 1);
      document.getElementById('counter').textContent = (current + 1) + ' / ' + slides.length;
      document.getElementById('btn-prev').disabled = current === 0;
      document.getElementById('btn-next').disabled = current === slides.length - 1;

      if (current === slides.length - 1 && !completed) {
        completed = true;
        LMSSetValue('cmi.core.lesson_status', 'completed');
        LMSCommit();
      }
    }

    function navigate(dir) {
      var next = current + dir;
      if (next < 0 || next >= slides.length) return;
      current = next;
      render();
    }

    // Navegação por teclado
    document.addEventListener('keydown', function(e) {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') navigate(1);
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') navigate(-1);
    });

    // Navegação por swipe (touch)
    var touchStartX = 0;
    document.addEventListener('touchstart', function(e) {
      touchStartX = e.changedTouches[0].clientX;
    }, { passive: true });
    document.addEventListener('touchend', function(e) {
      var diff = touchStartX - e.changedTouches[0].clientX;
      if (Math.abs(diff) > 50) navigate(diff > 0 ? 1 : -1);
    }, { passive: true });

    window.onload = function() {
      LMSInitialize();
      render();
    };

    window.onbeforeunload = function() {
      LMSFinish();
    };
  </script>
</body>
</html>
```

- [ ] **Step 2: Commit**

```bash
git add core/templates/player.html
git commit -m "feat: add responsive SCORM slide player template"
```

---

## Chunk 2: pdfConverter.js

### Task 5: Implementar e testar pdfConverter.js

**Files:**
- Create: `core/pdfConverter.js`
- Create: `tests/pdfConverter.test.js`

Converte um PDF em array de Buffers PNG usando pdfjs-dist 3.x (legacy/CJS) + @napi-rs/canvas.

- [ ] **Step 1: Escrever o teste que falha**

Criar `tests/pdfConverter.test.js`:

```javascript
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const { convertPdfToImages } = require('../core/pdfConverter');

const SAMPLE_PDF = path.join(__dirname, '..', 'Exemplos', 'PDF', 'Como-Funciona-a-Plataforma-03.pdf');

test('convertPdfToImages retorna array de Buffers PNG', async () => {
  const images = await convertPdfToImages(SAMPLE_PDF);

  assert.ok(Array.isArray(images), 'deve retornar um array');
  assert.ok(images.length > 0, 'deve ter ao menos uma página');

  for (const img of images) {
    assert.ok(Buffer.isBuffer(img), 'cada item deve ser um Buffer');
    // PNG magic bytes: 89 50 4E 47
    assert.equal(img[0], 0x89);
    assert.equal(img[1], 0x50);
    assert.equal(img[2], 0x4E);
    assert.equal(img[3], 0x47);
  }
});

test('convertPdfToImages gera imagens com largura máxima de 800px', async () => {
  const { createCanvas } = require('@napi-rs/canvas');
  // Verificar via decodificação PNG não é trivial — verificamos o número de páginas
  // e que o output é razoável (> 10KB por slide)
  const images = await convertPdfToImages(SAMPLE_PDF);
  for (const img of images) {
    assert.ok(img.length > 10_000, 'cada PNG deve ter mais de 10KB');
  }
});

test('convertPdfToImages rejeita se arquivo não existe', async () => {
  await assert.rejects(
    () => convertPdfToImages('/nao/existe.pdf'),
    /ENOENT|não encontrado|not found/i
  );
});
```

- [ ] **Step 2: Rodar o teste para confirmar que falha**

```bash
cd "C:\Agentes Claude\conversor-scorm"
node --test tests/pdfConverter.test.js
```

Expected: FAIL com `Cannot find module '../core/pdfConverter'`

- [ ] **Step 3: Implementar `core/pdfConverter.js`**

```javascript
'use strict';

const fs = require('fs');
const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');
const { createCanvas } = require('@napi-rs/canvas');

const TARGET_WIDTH = 800;

// Canvas factory para Node.js — necessário para pdfjs-dist renderizar fora do browser
class NodeCanvasFactory {
  create(width, height) {
    const canvas = createCanvas(width, height);
    const context = canvas.getContext('2d');
    return { canvas, context };
  }

  reset(canvasAndContext, width, height) {
    canvasAndContext.canvas.width = width;
    canvasAndContext.canvas.height = height;
  }

  destroy(_canvasAndContext) {
    // Garbage collector cuida da limpeza
  }
}

/**
 * Converte um PDF em array de Buffers PNG (um por página).
 * Largura fixa em 800px, altura proporcional ao aspect ratio.
 *
 * @param {string} pdfPath - Caminho absoluto para o arquivo PDF
 * @returns {Promise<Buffer[]>} Array de Buffers PNG
 */
async function convertPdfToImages(pdfPath) {
  const data = new Uint8Array(fs.readFileSync(pdfPath));

  const loadingTask = pdfjsLib.getDocument({
    data,
    useSystemFonts: true,
    disableFontFace: false,
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

    const { canvas, context } = new NodeCanvasFactory().create(width, height);

    await page.render({
      canvasContext: context,
      viewport,
    }).promise;

    images.push(canvas.toBuffer('image/png'));
  }

  return images;
}

module.exports = { convertPdfToImages };
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

```bash
node --test tests/pdfConverter.test.js
```

Expected: 3 testes PASS. Se o teste de `rejects` falhar com mensagem de erro diferente, ajustar o regex no teste para casar com a mensagem real do erro.

> **Nota:** Se pdfjs-dist retornar warning sobre `canvas` não estar disponível no ambiente, isso é esperado. O canvas é criado manualmente via `@napi-rs/canvas` e passado diretamente via `canvasContext` — o warning não impede a renderização.

- [ ] **Step 5: Commit**

```bash
git add core/pdfConverter.js tests/pdfConverter.test.js
git commit -m "feat: implement PDF to PNG converter (pdfjs-dist + @napi-rs/canvas)"
```

---

## Chunk 3: scormBuilder.js

### Task 6: Implementar e testar scormBuilder.js

**Files:**
- Create: `core/scormBuilder.js`
- Create: `tests/scormBuilder.test.js`

Monta e empacota o ZIP SCORM 1.2 a partir de slide buffers + templates. Expõe também `titleFromFilename`.

- [ ] **Step 1: Escrever o teste que falha**

Criar `tests/scormBuilder.test.js`:

```javascript
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const AdmZip = require('adm-zip');
const { buildScorm, titleFromFilename } = require('../core/scormBuilder');

// PNG 1x1 pixel mínimo válido
const MINIMAL_PNG = Buffer.from(
  '89504e470d0a1a0a0000000d494844520000000100000001' +
  '08020000009001' +
  '2e00000000c49444154789c6260000000020001e221bc330000000049454e44ae426082',
  'hex'
);

function buildInTmp(title, slides) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scorm-test-'));
  const outputPath = path.join(tmpDir, 'test.zip');
  return buildScorm(outputPath, title, slides).then(() => ({ outputPath }));
}

// --- titleFromFilename ---

test('titleFromFilename converte nome de arquivo em título', () => {
  assert.equal(titleFromFilename('minha-aula.pdf'), 'Minha Aula');
  assert.equal(titleFromFilename('modulo_01_introducao.pdf'), 'Modulo 01 Introducao');
  assert.equal(titleFromFilename('/caminho/completo/meu-curso.pdf'), 'Meu Curso');
});

// --- buildScorm: estrutura do ZIP ---

test('buildScorm inclui todos os arquivos obrigatórios no ZIP', async () => {
  const { outputPath } = await buildInTmp('Meu Curso', [MINIMAL_PNG, MINIMAL_PNG]);
  const zip = new AdmZip(outputPath);
  const entries = zip.getEntries().map(e => e.entryName);

  assert.ok(entries.includes('imsmanifest.xml'), 'deve ter imsmanifest.xml');
  assert.ok(entries.includes('index.html'), 'deve ter index.html');
  assert.ok(entries.includes('scorm_api.js'), 'deve ter scorm_api.js');
  assert.ok(entries.includes('slides/slide_01.png'), 'deve ter slide_01.png');
  assert.ok(entries.includes('slides/slide_02.png'), 'deve ter slide_02.png');
});

test('buildScorm substitui todos os placeholders no manifesto', async () => {
  const { outputPath } = await buildInTmp('Curso de Exemplo', [MINIMAL_PNG]);
  const zip = new AdmZip(outputPath);
  const manifest = zip.readAsText('imsmanifest.xml');

  assert.ok(manifest.includes('Curso de Exemplo'), 'manifesto deve conter o título');
  assert.ok(!manifest.includes('{{COURSE_TITLE}}'), 'placeholder COURSE_TITLE não substituído');
  assert.ok(!manifest.includes('{{COURSE_ID}}'), 'placeholder COURSE_ID não substituído');
  assert.ok(!manifest.includes('{{SLIDE_FILE_LIST}}'), 'placeholder SLIDE_FILE_LIST não substituído');
  assert.ok(manifest.includes('slides/slide_01.png'), 'manifesto deve listar os slides');
});

test('buildScorm substitui todos os placeholders no player', async () => {
  const { outputPath } = await buildInTmp('Curso de Exemplo', [MINIMAL_PNG, MINIMAL_PNG]);
  const zip = new AdmZip(outputPath);
  const player = zip.readAsText('index.html');

  assert.ok(player.includes('Curso de Exemplo'), 'player deve conter o título');
  assert.ok(!player.includes('{{COURSE_TITLE}}'), 'placeholder COURSE_TITLE não substituído');
  assert.ok(!player.includes('{{SLIDE_COUNT}}'), 'placeholder SLIDE_COUNT não substituído');
  assert.ok(!player.includes('{{SLIDES_JSON}}'), 'placeholder SLIDES_JSON não substituído');
  assert.ok(player.includes('"slides/slide_01.png"'), 'player deve conter caminho do slide 1');
  assert.ok(player.includes('"slides/slide_02.png"'), 'player deve conter caminho do slide 2');
});
```

- [ ] **Step 2: Rodar o teste para confirmar que falha**

```bash
node --test tests/scormBuilder.test.js
```

Expected: FAIL com `Cannot find module '../core/scormBuilder'`

- [ ] **Step 3: Implementar `core/scormBuilder.js`**

```javascript
'use strict';

const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

const TEMPLATES_DIR = path.join(__dirname, 'templates');

/**
 * Deriva o título do curso a partir do nome do arquivo.
 * Ex: "minha-aula.pdf" → "Minha Aula"
 *
 * @param {string} filename - Nome ou caminho do arquivo
 * @returns {string} Título formatado
 */
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
 * Gera o arquivo ZIP SCORM 1.2.
 *
 * @param {string} outputPath - Caminho absoluto onde o ZIP será salvo
 * @param {string} courseTitle - Título do curso
 * @param {Buffer[]} slideBuffers - Array de Buffers PNG (um por slide)
 * @returns {Promise<void>}
 */
async function buildScorm(outputPath, courseTitle, slideBuffers) {
  const courseId = courseIdFromTitle(courseTitle);
  const slideFilenames = slideBuffers.map((_, i) =>
    `slides/slide_${String(i + 1).padStart(2, '0')}.png`
  );

  // Preencher manifesto
  const slideFileList = slideFilenames
    .map(f => `      <file href="${f}"/>`)
    .join('\n');

  let manifest = fs.readFileSync(path.join(TEMPLATES_DIR, 'imsmanifest.xml'), 'utf8');
  manifest = manifest
    .replace(/\{\{COURSE_ID\}\}/g, escapeXml(courseId))
    .replace(/\{\{COURSE_TITLE\}\}/g, escapeXml(courseTitle))
    .replace(/\{\{SLIDE_FILE_LIST\}\}/g, slideFileList);

  // Preencher player
  const slidesJson = JSON.stringify(slideFilenames);
  let player = fs.readFileSync(path.join(TEMPLATES_DIR, 'player.html'), 'utf8');
  player = player
    .replace(/\{\{COURSE_TITLE\}\}/g, escapeHtml(courseTitle))
    .replace(/\{\{SLIDE_COUNT\}\}/g, String(slideBuffers.length))
    .replace(/\{\{SLIDES_JSON\}\}/g, slidesJson);

  // Montar ZIP
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outputPath);
    const archive = archiver('zip', { zlib: { level: 6 } });

    output.on('close', resolve);
    archive.on('error', reject);
    archive.pipe(output);

    archive.append(manifest, { name: 'imsmanifest.xml' });
    archive.append(player, { name: 'index.html' });
    archive.file(path.join(TEMPLATES_DIR, 'scorm_api.js'), { name: 'scorm_api.js' });

    slideBuffers.forEach((buf, i) => {
      archive.append(buf, { name: slideFilenames[i] });
    });

    archive.finalize();
  });
}

module.exports = { buildScorm, titleFromFilename };
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

```bash
node --test tests/scormBuilder.test.js
```

Expected: 4 testes PASS.

- [ ] **Step 5: Commit**

```bash
git add core/scormBuilder.js tests/scormBuilder.test.js
git commit -m "feat: implement SCORM 1.2 ZIP builder"
```

---

## Chunk 4: CLI Entry Point + Teste de Integração

### Task 7: Implementar convert.js e teste de integração

**Files:**
- Create: `convert.js`
- Create: `tests/integration.test.js`

Entry point da CLI. Modo arquivo único (`node convert.js arquivo.pdf`) e modo batch (sem argumento, processa pasta `input/`).

- [ ] **Step 1: Escrever o teste de integração que falha**

Criar `tests/integration.test.js`:

```javascript
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const SAMPLE_PDF = path.join(ROOT, 'Exemplos', 'PDF', 'Como-Funciona-a-Plataforma-03.pdf');

// Guard: se o arquivo de fixture não existir, aborta com mensagem clara
if (!fs.existsSync(SAMPLE_PDF)) {
  throw new Error(`Arquivo de fixture não encontrado: ${SAMPLE_PDF}\nCopie um PDF de exemplo para Exemplos/PDF/ antes de rodar os testes.`);
}

// --- Modo arquivo único ---

test('convert.js converte PDF unico e gera ZIP na pasta output/', () => {
  const outputDir = path.join(ROOT, 'output');
  fs.mkdirSync(outputDir, { recursive: true });

  const expectedZip = path.join(outputDir, 'Como-Funciona-a-Plataforma-03-scorm.zip');
  if (fs.existsSync(expectedZip)) fs.unlinkSync(expectedZip);

  execSync(`node convert.js "${SAMPLE_PDF}"`, { cwd: ROOT, stdio: 'inherit' });

  assert.ok(fs.existsSync(expectedZip), `ZIP nao foi criado em: ${expectedZip}`);
  assert.ok(fs.statSync(expectedZip).size > 50_000, 'ZIP deve ter mais de 50KB');
});

test('convert.js sai com codigo 1 para arquivo inexistente', () => {
  let exitCode = 0;
  try {
    execSync('node convert.js arquivo-inexistente.pdf', { cwd: ROOT, stdio: 'pipe' });
  } catch (err) {
    exitCode = err.status;
  }
  assert.equal(exitCode, 1, 'deve sair com exit code 1');
});

// --- Modo batch ---

test('convert.js no modo batch converte todos os PDFs da pasta input/', () => {
  // Criar pasta input/ temporária com uma cópia do PDF de exemplo
  const tmpInput = path.join(ROOT, 'input');
  fs.mkdirSync(tmpInput, { recursive: true });

  const tmpPdf = path.join(tmpInput, 'test-batch.pdf');
  fs.copyFileSync(SAMPLE_PDF, tmpPdf);

  const outputDir = path.join(ROOT, 'output');
  const expectedZip = path.join(outputDir, 'test-batch-scorm.zip');
  if (fs.existsSync(expectedZip)) fs.unlinkSync(expectedZip);

  try {
    execSync('node convert.js', { cwd: ROOT, stdio: 'inherit' });
  } finally {
    fs.unlinkSync(tmpPdf); // limpar após o teste
  }

  assert.ok(fs.existsSync(expectedZip), `ZIP batch nao foi criado em: ${expectedZip}`);
});

test('convert.js modo batch sai com codigo 1 se pasta input/ estiver vazia', () => {
  // Garantir que input/ existe mas está vazia
  const tmpInput = path.join(ROOT, 'input');
  fs.mkdirSync(tmpInput, { recursive: true });
  // Remover todos os PDFs da pasta input/ para este teste
  const pdfsInInput = fs.readdirSync(tmpInput).filter(f => f.toLowerCase().endsWith('.pdf'));
  for (const f of pdfsInInput) fs.unlinkSync(path.join(tmpInput, f));

  let exitCode = 0;
  try {
    execSync('node convert.js', { cwd: ROOT, stdio: 'pipe' });
  } catch (err) {
    exitCode = err.status;
  }
  assert.equal(exitCode, 1, 'deve sair com exit code 1 quando input/ esta vazia');
});
```

- [ ] **Step 2: Rodar o teste para confirmar que falha**

```bash
node --test tests/integration.test.js
```

Expected: FAIL com `Cannot find module` ou `ENOENT`

- [ ] **Step 3: Implementar `convert.js`**

```javascript
'use strict';

const path = require('path');
const fs = require('fs');
const { convertPdfToImages } = require('./core/pdfConverter');
const { buildScorm, titleFromFilename } = require('./core/scormBuilder');

const INPUT_DIR = path.join(__dirname, 'input');
const OUTPUT_DIR = path.join(__dirname, 'output');

async function convertFile(pdfPath) {
  const title = titleFromFilename(pdfPath);
  const outputName = path.basename(pdfPath, path.extname(pdfPath)) + '-scorm.zip';
  const outputPath = path.join(OUTPUT_DIR, outputName);

  console.log(`Convertendo: ${path.basename(pdfPath)}`);

  const images = await convertPdfToImages(pdfPath);
  await buildScorm(outputPath, title, images);

  console.log(`[OK] Criado: output/${outputName} (${images.length} slides)`);
}

async function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const arg = process.argv[2];

  if (arg) {
    // Modo arquivo único
    const pdfPath = path.resolve(arg);
    if (!fs.existsSync(pdfPath)) {
      console.error(`Erro: Arquivo não encontrado: ${pdfPath}`);
      process.exit(1);
    }
    await convertFile(pdfPath);

  } else {
    // Modo batch
    fs.mkdirSync(INPUT_DIR, { recursive: true });

    const files = fs.readdirSync(INPUT_DIR)
      .filter(f => f.toLowerCase().endsWith('.pdf'));

    if (files.length === 0) {
      console.log('Nenhum PDF encontrado em input/. Adicione arquivos PDF à pasta input/ e execute novamente.');
      process.exit(1);
    }

    let successCount = 0;
    for (const file of files) {
      try {
        await convertFile(path.join(INPUT_DIR, file));
        successCount++;
      } catch (err) {
        console.error(`Erro ao converter ${file}: ${err.message}`);
      }
    }

    if (successCount === 0) {
      console.error('Nenhum arquivo foi convertido com sucesso.');
      process.exit(1);
    }

    console.log(`\nConcluído. ${successCount}/${files.length} arquivos convertidos.`);
  }
}

main().catch(err => {
  console.error('Erro fatal:', err.message);
  process.exit(1);
});
```

- [ ] **Step 4: Rodar os testes de integração**

```bash
node --test tests/integration.test.js
```

Expected: 4 testes PASS. O primeiro e o terceiro podem demorar 10–30 segundos cada (renderização do PDF).

- [ ] **Step 5: Rodar todos os testes**

```bash
node --test tests/pdfConverter.test.js tests/scormBuilder.test.js tests/integration.test.js
```

Expected: todos os testes PASS (9 testes no total: 3 pdfConverter + 4 scormBuilder + 4 integração - 2 que executam PDF real podem demorar).

- [ ] **Step 6: Teste manual rápido**

```bash
node convert.js "Exemplos/PDF/Como-Funciona-a-Plataforma-03.pdf"
```

Verificar que `output/Como-Funciona-a-Plataforma-03-scorm.zip` foi criado. Abrir o ZIP e confirmar a estrutura:
```
imsmanifest.xml
index.html
scorm_api.js
slides/slide_01.png
slides/slide_02.png
...
```

- [ ] **Step 7: Commit final**

```bash
git add convert.js tests/integration.test.js
git commit -m "feat: add CLI entry point with single-file and batch modes"
```

---

## Verificação Final

- [ ] Todos os testes passam: `node --test tests/pdfConverter.test.js tests/scormBuilder.test.js tests/integration.test.js`
- [ ] ZIP gerado é válido: abrível com qualquer descompressor
- [ ] Estrutura interna do ZIP está correta: `imsmanifest.xml`, `index.html`, `scorm_api.js`, `slides/slide_XX.png`
- [ ] Player abre corretamente em browser: extrair ZIP e abrir `index.html` localmente
- [ ] SCORM completion funciona: ao chegar no último slide, `lesson_status` é marcado como `"completed"` (verificável no console do browser)
