# Estudio Site SCORM Builder

Aplicativo para Windows que converte arquivos PDF em pacotes `SCORM 1.2` prontos para importação em LMS compatíveis.

Hoje, o fluxo implementado e estável é para `PDF -> SCORM`. O suporte a PowerPoint ainda não faz parte do uso final deste projeto.

## Responsável pelo projeto

Este projeto é mantido por André Andrade, da Estúdio Site.

Site oficial:

- https://www.estudiosite.com.br

Canal no YouTube para tutoriais e orientações de uso:

- https://www.youtube.com/@EstudioSite

## Para que serve

O aplicativo pega um PDF com várias páginas e gera um arquivo `.zip` SCORM com:

- `imsmanifest.xml`
- `index.html`
- `scorm_api.js`
- imagens dos slides em `slides/`

Esse ZIP pode ser enviado para plataformas LMS que aceitam o padrão SCORM 1.2.

## Requisitos

Para uso normal:

- Windows

Para uso via terminal:

- Windows
- Node.js 18 ou superior
- Dependências do projeto instaladas com `npm install`

## Antes de instalar: como gerar o instalador

O instalador não fica salvo no Git. Se você baixou o projeto pelo repositório, gere o `.exe` localmente antes de instalar.

Dentro da pasta do projeto, execute:

```bash
npm install
npm run build
```

Ao final, o instalador será criado na pasta `dist/`.

Exemplo esperado:

```text
dist/Estudio Site SCORM Builder Setup 2.0.0.exe
```

## Como instalar o aplicativo

Depois de gerar o instalador:

1. Abra a pasta `dist/`
2. Execute o arquivo `Estudio Site SCORM Builder Setup ... .exe`
3. Conclua a instalação
4. Abra o aplicativo
5. Arraste um arquivo `.pdf` para a janela
6. Aguarde a conversão
7. Escolha onde salvar o `.zip`

Ao final, o aplicativo gera um pacote SCORM pronto para envio ao LMS.

## Uso pelo aplicativo desktop

Fluxo esperado:

1. Abrir o aplicativo
2. Arrastar um arquivo PDF para a área indicada
3. Acompanhar o progresso da conversão
4. Revisar o nome do curso
5. Clicar em `Salvar .zip`

## Uso pelo terminal

Se você pretende usar sem o instalador, dentro da pasta do projeto:

```bash
npm install
npm run convert -- "caminho-do-arquivo.pdf"
```

Exemplo:

```bash
npm run convert -- "Exemplos/PDF/Como-Funciona-a-Plataforma-03.pdf"
```

O arquivo gerado será salvo na pasta `output/`.

Também existe modo em lote. Coloque PDFs dentro da pasta `input/` e execute:

```bash
node convert.js
```

Nesse modo, o sistema tenta converter todos os PDFs encontrados em `input/`.

## Onde ficam os arquivos gerados

- Conversão via terminal: pasta `output/`
- Conversão via aplicativo: no local escolhido na hora de salvar

## Limitações atuais

- O uso final atual é para arquivos `PDF`
- O pacote gerado segue o padrão `SCORM 1.2`
- O projeto foi pensado para uso em Windows

## Para executar em modo desenvolvimento

Se o objetivo for abrir a interface Electron a partir do código-fonte:

```bash
npm install
npm start
```

## Para gerar o instalador novamente

Se precisar recriar o instalador em outro momento:

```bash
npm install
npm run build
```

O instalador será gerado na pasta `dist/`.
