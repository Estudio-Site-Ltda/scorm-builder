const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const SAMPLE_PDF = path.join(ROOT, 'Exemplos', 'PDF', 'Como-Funciona-a-Plataforma-03.pdf');

// Guard: se o arquivo de fixture nao existir, aborta com mensagem clara
if (!fs.existsSync(SAMPLE_PDF)) {
  throw new Error(`Arquivo de fixture nao encontrado: ${SAMPLE_PDF}\nCopie um PDF de exemplo para Exemplos/PDF/ antes de rodar os testes.`);
}

// --- Modo arquivo unico ---

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
    fs.unlinkSync(tmpPdf);
  }

  assert.ok(fs.existsSync(expectedZip), `ZIP batch nao foi criado em: ${expectedZip}`);
});

test('convert.js modo batch sai com codigo 1 se pasta input/ estiver vazia', () => {
  const tmpInput = path.join(ROOT, 'input');
  fs.mkdirSync(tmpInput, { recursive: true });
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
