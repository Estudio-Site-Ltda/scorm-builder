'use strict';

const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs   = require('fs');

const { convertPdfToImages } = require('./core/pdfConverter');
const { buildScormBuffer, titleFromFilename } = require('./core/scormBuilder');

let mainWindow;

/** Buffer do ZIP gerado, retido até o usuário salvar ou converter outro arquivo. */
let pendingZipBuffer = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 460,
    height: 540,
    resizable: false,
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ── IPC: convert-pdf ────────────────────────────────────────────────────────
ipcMain.handle('convert-pdf', async (event, filePath) => {
  pendingZipBuffer = null;

  const title = titleFromFilename(path.basename(filePath));

  const slideBuffers = await convertPdfToImages(filePath, (current, total) => {
    event.sender.send('conversion-progress', current, total);
  });

  pendingZipBuffer = await buildScormBuffer(title, slideBuffers);

  return {
    title,
    slideCount: slideBuffers.length,
    sizeBytes:  pendingZipBuffer.length,
  };
});

// ── IPC: save-file ──────────────────────────────────────────────────────────
ipcMain.handle('save-file', async (_event, title) => {
  if (!pendingZipBuffer) {
    return { saved: false };
  }

  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  const defaultFilename = `${slug}-scorm.zip`;

  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    defaultPath: defaultFilename,
    filters: [{ name: 'ZIP SCORM', extensions: ['zip'] }],
  });

  if (canceled || !filePath) return { saved: false };

  await fs.promises.writeFile(filePath, pendingZipBuffer);
  return { saved: true, path: filePath };
});

// ── IPC: reset-state ────────────────────────────────────────────────────────
ipcMain.handle('reset-state', () => {
  pendingZipBuffer = null;
});
