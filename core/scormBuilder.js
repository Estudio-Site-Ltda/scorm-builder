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
