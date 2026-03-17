const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const AdmZip = require('adm-zip');
const { buildScorm, buildScormBuffer, titleFromFilename } = require('../core/scormBuilder');

// PNG 1x1 pixel minimo valido
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

test('titleFromFilename converte nome de arquivo em titulo', () => {
  assert.equal(titleFromFilename('minha-aula.pdf'), 'Minha Aula');
  assert.equal(titleFromFilename('modulo_01_introducao.pdf'), 'Modulo 01 Introducao');
  assert.equal(titleFromFilename('/caminho/completo/meu-curso.pdf'), 'Meu Curso');
});

// --- buildScorm: estrutura do ZIP ---

test('buildScorm inclui todos os arquivos obrigatorios no ZIP', async () => {
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

  assert.ok(manifest.includes('Curso de Exemplo'), 'manifesto deve conter o titulo');
  assert.ok(!manifest.includes('{{COURSE_TITLE}}'), 'placeholder COURSE_TITLE nao substituido');
  assert.ok(!manifest.includes('{{COURSE_ID}}'), 'placeholder COURSE_ID nao substituido');
  assert.ok(!manifest.includes('{{SLIDE_FILE_LIST}}'), 'placeholder SLIDE_FILE_LIST nao substituido');
  assert.ok(manifest.includes('slides/slide_01.png'), 'manifesto deve listar os slides');
});

test('buildScorm substitui todos os placeholders no player', async () => {
  const { outputPath } = await buildInTmp('Curso de Exemplo', [MINIMAL_PNG, MINIMAL_PNG]);
  const zip = new AdmZip(outputPath);
  const player = zip.readAsText('index.html');

  assert.ok(player.includes('Curso de Exemplo'), 'player deve conter o titulo');
  assert.ok(!player.includes('{{COURSE_TITLE}}'), 'placeholder COURSE_TITLE nao substituido');
  assert.ok(!player.includes('{{SLIDE_COUNT}}'), 'placeholder SLIDE_COUNT nao substituido');
  assert.ok(!player.includes('{{SLIDES_JSON}}'), 'placeholder SLIDES_JSON nao substituido');
  assert.ok(player.includes('"slides/slide_01.png"'), 'player deve conter caminho do slide 1');
  assert.ok(player.includes('"slides/slide_02.png"'), 'player deve conter caminho do slide 2');
});

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

  const zipDisk = new AdmZip(diskBuf);
  const zipMem  = new AdmZip(memBuf);
  const namesDisk = zipDisk.getEntries().map(e => e.entryName).sort();
  const namesMem  = zipMem.getEntries().map(e => e.entryName).sort();
  assert.deepEqual(namesMem, namesDisk, 'lista de arquivos deve ser identica');
});
