# Conversor PPT/PDF para SCORM 1.2

> Documento técnico de referência para desenvolvimento interno — Estúdio Site

---

## Visão Geral

Aplicação desktop para Windows que converte arquivos PowerPoint (.pptx/.ppt) e PDF em pacotes SCORM 1.2 prontos para importação no LMS Estúdio ou qualquer LMS compatível.

**Uso:** Interno (equipe Estúdio Site)  
**Versão SCORM:** 1.2  
**Prioridade:** Interface simples → Offline no Windows → Velocidade de desenvolvimento → API

---

## Opções de Stack

### Opção A — Electron + Node.js (Recomendada)

Aplicação desktop instalável no Windows. Interface web embutida via Chromium. Roda 100% offline.

**Vantagens:**
- Instalador padrão Windows (.exe)
- Sem dependência de servidor ou terminal
- Interface moderna com HTML/CSS/JS
- Acesso direto ao sistema de arquivos

**Desvantagens:**
- Instalador grande (80–150 MB por incluir o Chromium)
- Curva de aprendizado inicial com Electron

---

### Opção B — Laravel Local (Alternativa mais rápida)

Aplicação web acessada pelo navegador. Requer iniciar o servidor via terminal (`php artisan serve`).

**Vantagens:**
- Stack já dominada (Laravel)
- Desenvolvimento mais rápido
- Fácil de evoluir para web/SaaS depois

**Desvantagens:**
- Usuário precisa abrir o terminal para subir o servidor
- Menos "polish" para uso desktop

---

## Stack Técnica (Opção A — Electron)

| Componente | Tecnologia |
|---|---|
| Shell da aplicação | Electron |
| Interface | HTML + TailwindCSS (CDN) |
| Conversão PPT → imagens | LibreOffice headless (CLI) |
| Conversão PDF → imagens | pdfjs-dist (npm) |
| Geração do ZIP SCORM | archiver (npm) |
| Padrão SCORM | Templates manuais (XML + JS) |

---

## Estrutura do Projeto

```
scorm-converter/
├── main.js                    # Processo principal do Electron
├── package.json
├── /renderer                  # Interface do usuário
│   ├── index.html
│   ├── app.js
│   └── style.css
├── /core                      # Lógica de negócio
│   ├── pptConverter.js        # PPT → imagens via LibreOffice
│   ├── pdfConverter.js        # PDF → imagens via pdfjs
│   ├── scormBuilder.js        # Monta e empacota o SCORM 1.2
│   └── templates/
│       ├── imsmanifest.xml    # Manifesto SCORM (template)
│       └── player.html        # Player de slides (template)
└── /output                    # ZIPs gerados ficam aqui
```

---

## Fluxo de Conversão

### PPT → SCORM

```
Arquivo .pptx
    ↓
LibreOffice headless (CLI)
    ↓
Slides exportados como imagens PNG
    ↓
scormBuilder.js monta HTML player + imsmanifest.xml
    ↓
archiver gera o ZIP
    ↓
pacote-scorm.zip ✓
```

### PDF → SCORM

```
Arquivo .pdf
    ↓
pdfjs-dist (Node.js)
    ↓
Páginas exportadas como imagens PNG
    ↓
scormBuilder.js monta HTML player + imsmanifest.xml
    ↓
archiver gera o ZIP
    ↓
pacote-scorm.zip ✓
```

---

## Estrutura Interna do Pacote SCORM 1.2

Todo pacote SCORM 1.2 válido é um arquivo ZIP com esta estrutura:

```
meu-curso.zip
├── imsmanifest.xml        # Obrigatório — descreve o pacote
├── index.html             # Player de navegação dos slides
├── scorm_api.js           # Shim da API SCORM 1.2
└── slides/
    ├── slide_01.png
    ├── slide_02.png
    └── ...
```

O `imsmanifest.xml` e o `player.html` são **templates fixos** — apenas o nome do curso e a lista de slides são substituídos dinamicamente.

---

## O que é Simples vs. Trabalhoso

### Simples
- Interface (arrastar arquivo, botão converter, barra de progresso)
- Geração do ZIP SCORM
- Conversão de PDF para imagens

### Trabalhoso
- Configurar o LibreOffice headless corretamente no Windows
- Fazer o player HTML navegar bem pelos slides (teclado, clique, responsivo)
- Empacotar o Electron junto com o LibreOffice no instalador final

---

## Estratégia de Desenvolvimento Sugerida

### Fase 1 — MVP em script Node.js (1–2 dias)
Sem interface. Roda no terminal. Foco em validar a conversão e a geração do SCORM.

```bash
node convert.js minha-apresentacao.pptx
# → gera minha-apresentacao-scorm.zip
```

### Fase 2 — Interface Electron (2–3 dias)
Adicionar a janela desktop por cima do script já validado. Arrastar arquivo, botão converter, log de progresso.

### Fase 3 — Polimento (opcional)
- Opções de configuração (nome do curso, autor, versão)
- Preview dos slides antes de exportar
- Integração futura com a API do LMS Estúdio

---

## Dependências e Instalação

```bash
# Iniciar projeto
npm init -y
npm install electron pdfjs-dist archiver

# LibreOffice (instalar separado no Windows)
# Download: https://www.libreoffice.org/download/libreoffice/
# Chamado via: exec('soffice --headless --convert-to png slide.pptx')
```

---

## Referências

- [SCORM 1.2 Specification](https://scorm.com/scorm-explained/technical-scorm/scorm-12-overview-for-developers/)
- [Electron Docs](https://www.electronjs.org/docs)
- [pdfjs-dist (npm)](https://www.npmjs.com/package/pdfjs-dist)
- [archiver (npm)](https://www.npmjs.com/package/archiver)
- [LibreOffice Headless](https://help.libreoffice.org/latest/en-US/text/shared/guide/start_parameters.html)

---

*Documento gerado em março de 2026 — Estúdio Site*
