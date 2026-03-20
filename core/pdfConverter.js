'use strict';

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

// pdfjs-dist usa DOMMatrix internamente (API de browser). Polyfill necessário
// no processo principal do Electron (Node.js puro, sem DOM).
const { createCanvas, DOMMatrix } = require('@napi-rs/canvas');
if (typeof globalThis.DOMMatrix === 'undefined') {
  globalThis.DOMMatrix = DOMMatrix;
}

const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');

// CMaps e fontes padrão empacotados com pdfjs-dist — necessários para renderizar
// texto corretamente em Node.js (sem eles, glyphs aparecem como retângulos vazios)
const PDFJS_DIR = path.dirname(require.resolve('pdfjs-dist/package.json'));
const CMAP_URL = pathToFileURL(path.join(PDFJS_DIR, 'cmaps') + path.sep).href;
const STANDARD_FONT_DATA_URL = pathToFileURL(path.join(PDFJS_DIR, 'standard_fonts') + path.sep).href;

const TARGET_WIDTH = 1920;

// Canvas factory compatível com pdfjs-dist que usa @napi-rs/canvas
class NapiCanvasFactory {
  create(width, height) {
    if (width <= 0 || height <= 0) {
      throw new Error('Invalid canvas size');
    }
    const canvas = createCanvas(width, height);
    const context = canvas.getContext('2d');
    return { canvas, context };
  }

  reset(canvasAndContext, width, height) {
    if (!canvasAndContext.canvas) {
      throw new Error('Canvas is not specified');
    }
    if (width <= 0 || height <= 0) {
      throw new Error('Invalid canvas size');
    }
    canvasAndContext.canvas.width = width;
    canvasAndContext.canvas.height = height;
  }

  destroy(canvasAndContext) {
    if (!canvasAndContext.canvas) {
      throw new Error('Canvas is not specified');
    }
    canvasAndContext.canvas.width = 0;
    canvasAndContext.canvas.height = 0;
    canvasAndContext.canvas = null;
    canvasAndContext.context = null;
  }
}

/**
 * Converte um PDF em array de Buffers PNG (um por página).
 * Largura fixa em 1920px, altura proporcional ao aspect ratio.
 *
 * @param {string} pdfPath - Caminho absoluto para o arquivo PDF
 * @param {(current: number, total: number) => void} [onProgress] - Callback opcional chamado após cada página. Recebe (paginaAtual, totalPaginas).
 * @returns {Promise<Buffer[]>} Array de Buffers PNG
 */
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

module.exports = { convertPdfToImages };
