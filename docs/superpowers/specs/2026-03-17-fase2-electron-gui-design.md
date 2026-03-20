# Design: Fase 2 — Interface Electron + Empacotamento Windows

**Data:** 2026-03-17
**Projeto:** conversor-scorm — Estúdio Site
**Escopo:** Fase 2 — GUI desktop instalável no Windows via Electron

---

## Objetivo

Empacotar o conversor PDF → SCORM 1.2 como aplicação desktop instalável no Windows. A interface substitui o uso do terminal: o usuário arrasta ou seleciona um PDF, acompanha o progresso da conversão, edita o nome do curso e salva o `.zip` via diálogo nativo do sistema operacional.

---

## Decisões de Design

| Decisão | Escolha | Motivo |
|---|---|---|
| Framework desktop | Electron | Já previsto no plano original; simples de desenvolver; funciona 100% offline |
| Formatos suportados | PDF apenas | PPT/PPTX (requer LibreOffice) fica para Fase 3 |
| Entrega do arquivo | Diálogo "Salvar como…" nativo | Comportamento esperado em app desktop |
| Fluxo UX | Dois passos: Upload → Revisão | Permite editar o nome do curso antes de salvar |
| Installer Windows | NSIS via electron-builder | Instalador clicável por usuário, sem exigir admin |
| Segurança Electron | `contextIsolation: true`, `nodeIntegration: false` | Padrão seguro; renderer sem acesso direto ao Node.js |

---

## Fluxo do Usuário

```
[Tela 1 — Upload]
  Usuário arrasta PDF ou clica para selecionar arquivo
      ↓
[Tela 1b — Convertendo]
  Spinner + barra de progresso "Página X de Y"
  Conversão ocorre no processo principal (Node.js)
  onProgress emite eventos ANTES de convertPdf resolver
      ↓
[Tela 2 — Revisão]
  Campo editável: nome do curso (derivado do nome do arquivo)
  Info: número de slides, tamanho do ZIP em memória (buffer já pronto)
  Botão "Salvar .zip" → dispara ipcRenderer.invoke('save-file')
  Botão "Converter outro" → dispara ipcRenderer.invoke('reset-state') e volta à Tela 1
      ↓
[Diálogo nativo "Salvar como"]
  Usuário escolhe pasta e nome do arquivo
  Main process grava buffer do ZIP (mantido em memória no main) em disco
```

---

## Arquitetura

### Estrutura de Arquivos

```
conversor-scorm/
├── main.js                  # NOVO — processo principal do Electron
├── preload.js               # NOVO — bridge segura via contextBridge
├── package.json             # MODIFICAR — adicionar Electron + electron-builder + scripts
├── renderer/
│   ├── index.html           # NOVO — interface única com duas views
│   └── app.js               # NOVO — lógica da UI
├── core/                    # EXISTENTE
│   ├── pdfConverter.js      # sem alterações
│   ├── scormBuilder.js      # MODIFICAR — adicionar buildScormBuffer()
│   └── templates/           # sem alterações
├── convert.js               # EXISTENTE — CLI mantido, não incluído no build Electron
└── dist/                    # electron-builder output (gitignored)
```

### Modelo de Segurança

```javascript
// main.js — BrowserWindow
new BrowserWindow({
  webPreferences: {
    preload: path.join(__dirname, 'preload.js'),
    contextIsolation: true,   // obrigatório
    nodeIntegration: false,   // obrigatório
  }
})
```

### IPC — Contrato Completo

O ZIP gerado **nunca trafega para o renderer**. O main process mantém o buffer em memória (`let pendingZipBuffer = null`) e o renderer apenas referencia operações por nome via IPC.

```
Renderer (app.js)                    Main Process (main.js)
─────────────────────────────────────────────────────────────
invoke('convert-pdf', filePath)  →   converte, armazena buffer internamente
                                 ←   resolve com { title, slideCount, sizeBytes }
                                      (sem zipBuffer no retorno)

send('conversion-progress')      ←   emitido N vezes durante conversão
  payload: { current, total }         (antes de resolve do convert-pdf)

invoke('save-file', title)       →   abre dialog.showSaveDialog
                                      usa pendingZipBuffer para gravar
                                 ←   resolve com { saved, path? }

invoke('reset-state')            →   pendingZipBuffer = null
                                 ←   resolve (sem retorno significativo)
```

### API exposta via contextBridge (preload.js)

```javascript
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // Inicia conversão; progress chega via onProgress antes deste resolver
  convertPdf: (filePath) =>
    ipcRenderer.invoke('convert-pdf', filePath),
  // → Promise<{ title: string, slideCount: number, sizeBytes: number }>

  // Abre diálogo e salva; usa buffer retido no main process.
  // Retorna { saved: false } se o usuário cancelar o diálogo ou se
  // nenhuma conversão tiver sido feita (pendingZipBuffer === null).
  // Lança erro se a gravação em disco falhar.
  saveFile: (title) =>
    ipcRenderer.invoke('save-file', title),
  // → Promise<{ saved: boolean, path?: string }>

  // Limpa estado do main process (pendingZipBuffer = null).
  // Chame ANTES de exibir a Tela 1 novamente ("Converter outro").
  resetState: () =>
    ipcRenderer.invoke('reset-state'),
  // → Promise<void>

  // Registra listener de progresso; retorna função de cleanup.
  // O RENDERER é responsável por chamar o cleanup:
  //   - no caminho feliz: ao exibir a Tela 2 (após convertPdf resolver)
  //   - no caminho de erro: no catch do convertPdf (via try/finally)
  // Isso evita vazamento de listeners se a conversão falhar.
  onProgress: (cb) => {
    const handler = (_event, current, total) => cb(current, total);
    ipcRenderer.on('conversion-progress', handler);
    return () => ipcRenderer.removeListener('conversion-progress', handler);
  },
});
```

### Ciclo de vida do onProgress

1. Renderer registra `window.api.onProgress(cb)` **antes** de chamar `convertPdf`
2. Main process emite `webContents.send('conversion-progress', current, total)` dentro do loop de páginas do `pdfConverter.js`
3. `convertPdf` resolve somente após todas as páginas processadas e o ZIP construído
4. Renderer limpa o listener com a função retornada quando a Tela 2 é exibida
5. Se `convertPdf` for chamado novamente (após "Converter outro"), um novo par register/cleanup é feito

### Modificação em scormBuilder.js — buildScormBuffer

```javascript
/**
 * Monta o ZIP SCORM em memória e retorna um Buffer.
 * Usa archiver com PassThrough para coletar os chunks sem gravar em disco.
 */
async function buildScormBuffer(courseTitle, slideBuffers) {
  // validação idêntica ao buildScorm existente
  if (!slideBuffers || slideBuffers.length === 0) {
    throw new Error('slideBuffers must be a non-empty array');
  }

  return new Promise((resolve, reject) => {
    const chunks = [];
    const passThrough = new (require('stream').PassThrough)();
    passThrough.on('data', (chunk) => chunks.push(chunk));
    passThrough.on('end', () => resolve(Buffer.concat(chunks)));
    passThrough.on('error', reject);

    const archive = archiver('zip', { zlib: { level: 6 } });
    archive.on('error', reject);
    archive.pipe(passThrough);

    // mesmo conteúdo que buildScorm: manifest, index.html, scorm_api.js, slides/
    _populateArchive(archive, courseTitle, slideBuffers);

    archive.finalize();
  });
}
```

`_populateArchive` é uma função interna extraída do `buildScorm` existente para reutilização pelos dois exports.

### sizeBytes na Tela de Revisão

`sizeBytes` é o tamanho real do `pendingZipBuffer` após a construção completa do ZIP em memória. A Tela de Revisão só aparece depois que o ZIP já está pronto — não é uma estimativa.

---

## Interface (renderer/)

### Tela 1 — Upload

- Janela 460×540px, frameless, drag habilitado na titlebar customizada
- Drop zone centralizada com borda dashed, ícone PDF, texto "Arraste um PDF aqui / ou clique para selecionar"
- `<input type="file" accept=".pdf">` oculto, ativado pelo clique na drop zone
- Hover com arquivo sobre a janela: borda ilumina (evento `dragover`)
- Erro inline se arquivo não for `.pdf`

### Tela 1b — Convertendo

- Nome do arquivo sendo processado (pequeno, cinza)
- Spinner animado (CSS puro)
- Texto "Convertendo slides… Página X de Y"
- Barra de progresso proporcional
- Tela não-interativa durante conversão (sem botão cancelar no MVP)

### Tela 2 — Revisão

- Badge verde "Conversão concluída"
- Campo `<input>` editável pré-preenchido com `titleFromFilename(filename)`
- Info: `slideCount` slides · tamanho formatado (ex: "4,2 MB")
- Botão primário: **"Salvar .zip"** → chama `window.api.saveFile(editedTitle)`
  - Nome sugerido no diálogo: `${slugify(editedTitle)}-scorm.zip`
- Botão secundário: **"Converter outro"** → chama `window.api.resetState()`, exibe Tela 1

### Visual

- Tema escuro consistente com o player SCORM (`#0c0c0e`, glassmorphism)
- Fonte: `'Segoe UI Variable', 'Segoe UI', system-ui`
- Janela: 460×540px, não-redimensionável, frameless, titlebar drag customizada

---

## Empacotamento (electron-builder)

### package.json — seção build

```json
{
  "build": {
    "appId": "com.estudiossite.conversor-scorm",
    "productName": "Conversor SCORM",
    "win": {
      "target": "nsis"
    },
    "nsis": {
      "oneClick": false,
      "perMachine": false,
      "allowElevation": false
    },
    "files": [
      "main.js",
      "preload.js",
      "renderer/**",
      "core/**",
      "node_modules/**",
      "!node_modules/.cache/**",
      "!**/tests/**",
      "!convert.js"
    ],
    "asar": true,
    "asarUnpack": [
      "**/@napi-rs/canvas/**",
      "**/pdfjs-dist/legacy/build/**"
    ]
  }
}
```

### Rebuild de módulos nativos

`@napi-rs/canvas` é um addon nativo N-API. Para garantir compatibilidade com o Node.js embutido no Electron:

```json
"scripts": {
  "postinstall": "electron-rebuild",
  "build": "electron-builder",
  "start": "electron ."
}
```

```bash
npm install --save-dev electron-rebuild
```

`electron-builder` executa `electron-rebuild` automaticamente antes do build via `npmRebuild: true` (default quando `electron-rebuild` está instalado como devDependency).

### asar + native modules

`@napi-rs/canvas` não pode ser carregado de dentro de um arquivo `.asar`. A configuração `asarUnpack` garante que o diretório do módulo seja extraído para `app.asar.unpacked/` no instalador. O Electron resolve o `require()` automaticamente para o caminho não-compactado.

---

## Dependências a Adicionar

```bash
npm install --save-dev electron electron-builder electron-rebuild
```

Versão recomendada: `electron@^28` (Node 18 embutido, N-API compatível com `@napi-rs/canvas@0.1.97`)

---

## O que está fora do escopo desta fase

- Conversão de PPT/PPTX (Fase 3)
- Botão cancelar durante conversão
- Histórico de conversões
- Configurações (resolução, autor, versão SCORM)
- Build para macOS/Linux
- Auto-update

---

## Critérios de Aceitação

- [ ] Instalar o `.exe` gerado em Windows limpo e converter um PDF com sucesso
- [ ] Progresso aparece em tempo real (página X de Y) durante a conversão
- [ ] Nome do curso é editável na tela de revisão
- [ ] Diálogo "Salvar como" abre com nome sugerido (`nome-scorm.zip`)
- [ ] ZIP gerado passa na validação do LMS (mesmo comportamento do CLI)
- [ ] "Converter outro" limpa o estado e reseta a UI para a Tela 1
- [ ] CLI `convert.js` continua funcionando independentemente do Electron
- [ ] App não requer privilégios de administrador para instalar ou rodar
