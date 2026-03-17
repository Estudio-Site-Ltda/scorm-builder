const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
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

test('convertPdfToImages gera imagens com largura de 1920px', async () => {
  const images = await convertPdfToImages(SAMPLE_PDF);
  for (const img of images) {
    assert.ok(img.length > 10_000, 'cada PNG deve ter mais de 10KB');
    // Verificar largura via PNG IHDR chunk (bytes 16-19 = width uint32 big-endian)
    const width = img.readUInt32BE(16);
    assert.equal(width, 1920, `largura deve ser 1920px, mas foi ${width}px`);
  }
});

test('convertPdfToImages rejeita se arquivo nao existe', async () => {
  await assert.rejects(
    () => convertPdfToImages('/nao/existe.pdf'),
    /ENOENT|nao encontrado|not found/i
  );
});

test('convertPdfToImages chama onProgress para cada pagina', async () => {
  const calls = [];
  await convertPdfToImages(SAMPLE_PDF, (current, total) => {
    calls.push({ current, total });
  });

  assert.ok(calls.length > 0, 'onProgress deve ser chamado pelo menos uma vez');
  for (const { current, total } of calls) {
    assert.ok(typeof current === 'number' && current >= 1);
    assert.ok(typeof total === 'number' && total >= current);
  }
  const last = calls[calls.length - 1];
  assert.equal(last.current, last.total, 'ultima chamada deve ter current === total');
});
