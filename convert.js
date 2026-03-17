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
    // Modo arquivo unico
    // Rejeitar argumentos que nao sao arquivos PDF
    if (arg.startsWith('-') || !arg.toLowerCase().endsWith('.pdf')) {
      console.error(`Erro: Esperado um arquivo .pdf, recebido: ${arg}`);
      console.error('Uso: node convert.js [arquivo.pdf]');
      process.exit(1);
    }
    const pdfPath = path.resolve(arg);
    if (!fs.existsSync(pdfPath)) {
      console.error(`Erro: Arquivo nao encontrado: ${pdfPath}`);
      process.exit(1);
    }
    await convertFile(pdfPath);

  } else {
    // Modo batch
    fs.mkdirSync(INPUT_DIR, { recursive: true });

    const files = fs.readdirSync(INPUT_DIR)
      .filter(f => f.toLowerCase().endsWith('.pdf'));

    if (files.length === 0) {
      console.log('Nenhum PDF encontrado em input/. Adicione arquivos PDF a pasta input/ e execute novamente.');
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

    console.log(`\nConcluido. ${successCount}/${files.length} arquivos convertidos.`);
    // Nota: exit code 0 mesmo com falhas parciais (ao menos 1 sucesso).
    // Scripts automatizados devem verificar o log para erros individuais.
  }
}

main().catch(err => {
  console.error('Erro fatal:', err.message);
  process.exit(1);
});
