'use strict';

// ── Utilitários ────────────────────────────────────────────────────────────

function formatBytes(bytes) {
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function showView(id) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function setError(msg) {
  document.getElementById('error-msg').textContent = msg || '';
}

// ── Estado ─────────────────────────────────────────────────────────────────

let unsubscribeProgress = null;

// ── Fechar janela ──────────────────────────────────────────────────────────

document.getElementById('btn-close').addEventListener('click', () => window.close());

// ── View: Upload — arrastar e soltar ───────────────────────────────────────

const dropZone  = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');

dropZone.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', () => {
  const file = fileInput.files[0];
  if (file) startConversion(file.path);
});

document.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('drag-over');
});

document.addEventListener('dragleave', (e) => {
  if (!e.relatedTarget || !document.contains(e.relatedTarget)) {
    dropZone.classList.remove('drag-over');
  }
});

document.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (!file) return;
  if (!file.name.toLowerCase().endsWith('.pdf')) {
    setError('Apenas arquivos .pdf são suportados.');
    return;
  }
  startConversion(file.path);
});

// ── Conversão ──────────────────────────────────────────────────────────────

async function startConversion(filePath) {
  setError('');
  const filename = filePath.split(/[\\/]/).pop();
  document.getElementById('converting-filename').textContent = filename;
  document.getElementById('progress-text').textContent = 'Iniciando conversão…';
  document.getElementById('progress-bar-fill').style.width = '0%';
  showView('view-converting');

  // Registrar listener de progresso antes de chamar convertPdf
  unsubscribeProgress = window.api.onProgress((current, total) => {
    const pct = Math.round((current / total) * 100);
    document.getElementById('progress-text').textContent =
      `Convertendo slides… Página ${current} de ${total}`;
    document.getElementById('progress-bar-fill').style.width = pct + '%';
  });

  try {
    const result = await window.api.convertPdf(filePath);
    if (unsubscribeProgress) { unsubscribeProgress(); unsubscribeProgress = null; }
    showReview(result);
  } catch (err) {
    if (unsubscribeProgress) { unsubscribeProgress(); unsubscribeProgress = null; }
    showView('view-upload');
    setError('Erro ao converter: ' + (err.message || 'Falha desconhecida'));
  }
}

// ── Revisão ────────────────────────────────────────────────────────────────

function showReview({ title, slideCount, sizeBytes }) {
  document.getElementById('course-title-input').value = title;
  document.getElementById('info-slides').textContent = slideCount + ' slides';
  document.getElementById('info-size').textContent   = formatBytes(sizeBytes);
  showView('view-review');
}

document.getElementById('btn-save').addEventListener('click', async () => {
  const title = document.getElementById('course-title-input').value.trim() || 'Curso';
  const btn   = document.getElementById('btn-save');

  btn.disabled    = true;
  btn.textContent = 'Salvando…';

  try {
    const result = await window.api.saveFile(title);
    if (result.saved) {
      btn.textContent = '✓ Salvo!';
      setTimeout(() => {
        btn.disabled    = false;
        btn.textContent = 'Salvar .zip →';
      }, 2000);
    } else {
      // Usuário cancelou o diálogo
      btn.disabled    = false;
      btn.textContent = 'Salvar .zip →';
    }
  } catch (err) {
    btn.disabled    = false;
    btn.textContent = 'Salvar .zip →';
    setError('Erro ao salvar: ' + (err.message || 'Falha ao gravar arquivo'));
  }
});

document.getElementById('btn-reset').addEventListener('click', async () => {
  await window.api.resetState();
  fileInput.value = '';
  showView('view-upload');
});
