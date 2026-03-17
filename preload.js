'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  /**
   * Inicia a conversão do PDF.
   * Progresso chega via onProgress() antes deste Promise resolver.
   * @param {string} filePath - Caminho absoluto para o PDF
   * @returns {Promise<{ title: string, slideCount: number, sizeBytes: number }>}
   */
  convertPdf: (filePath) =>
    ipcRenderer.invoke('convert-pdf', filePath),

  /**
   * Abre diálogo "Salvar como" e grava o ZIP em disco.
   * Usa o buffer retido no main process — nunca transfere bytes para o renderer.
   * Retorna { saved: false } se o usuário cancelar ou se não houver conversão pendente.
   * Lança erro se a gravação em disco falhar.
   * @param {string} title - Nome do curso (usado como nome sugerido do arquivo)
   * @returns {Promise<{ saved: boolean, path?: string }>}
   */
  saveFile: (title) =>
    ipcRenderer.invoke('save-file', title),

  /**
   * Limpa o estado do main process (descarta o ZIP em memória).
   * Chamar antes de exibir a tela de upload novamente ("Converter outro").
   * @returns {Promise<void>}
   */
  resetState: () =>
    ipcRenderer.invoke('reset-state'),

  /**
   * Registra listener de progresso de conversão.
   * O RENDERER é responsável por remover o listener:
   *   - caminho feliz: ao exibir a tela de revisão (após convertPdf resolver)
   *   - caminho de erro: no bloco catch (via try/finally)
   * @param {(current: number, total: number) => void} cb
   * @returns {() => void} função de cleanup — chame para remover o listener
   */
  onProgress: (cb) => {
    const handler = (_event, current, total) => cb(current, total);
    ipcRenderer.on('conversion-progress', handler);
    return () => ipcRenderer.removeListener('conversion-progress', handler);
  },
});
