'use strict';

const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

const TEMPLATES_DIR = path.join(__dirname, 'templates');

/**
 * Deriva o titulo do curso a partir do nome do arquivo.
 * Ex: "minha-aula.pdf" -> "Minha Aula"
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
 * @param {string} outputPath - Caminho absoluto onde o ZIP sera salvo
 * @param {string} courseTitle - Titulo do curso
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
