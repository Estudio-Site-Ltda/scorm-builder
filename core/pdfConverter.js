'use strict';

const fs = require('fs');
const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');
const { createCanvas } = require('@napi-rs/canvas');

const TARGET_WIDTH = 800;

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
 * Largura fixa em 800px, altura proporcional ao aspect ratio.
 *
 * @param {string} pdfPath - Caminho absoluto para o arquivo PDF
 * @returns {Promise<Buffer[]>} Array de Buffers PNG
 */
async function convertPdfToImages(pdfPath) {
  const data = new Uint8Array(fs.readFileSync(pdfPath));

  const canvasFactory = new NapiCanvasFactory();

  const loadingTask = pdfjsLib.getDocument({
    data,
    canvasFactory,
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

    const canvasAndContext = canvasFactory.create(width, height);

    await page.render({
      canvasContext: canvasAndContext.context,
      viewport,
      canvasFactory,
    }).promise;

    images.push(canvasAndContext.canvas.toBuffer('image/png'));
  }

  return images;
}

module.exports = { convertPdfToImages };
