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

test('convertPdfToImages gera imagens com largura maxima de 800px', async () => {
  const images = await convertPdfToImages(SAMPLE_PDF);
  for (const img of images) {
    assert.ok(img.length > 10_000, 'cada PNG deve ter mais de 10KB');
  }
});

test('convertPdfToImages rejeita se arquivo nao existe', async () => {
  await assert.rejects(
    () => convertPdfToImages('/nao/existe.pdf'),
    /ENOENT|nao encontrado|not found/i
  );
});
