#!/usr/bin/env node
/**
 * Renders the README images.
 *
 * The panel screenshots are generated from the *real* webview markup in
 * src/extension.ts, with VS Code theme variables filled in, so the images
 * cannot drift away from the shipped UI.
 *
 * Usage: node docs/preview/build-images.cjs [--only panel]
 */
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..', '..');
const imagesDir = path.join(root, 'docs', 'images');
const previewDir = path.join(root, 'docs', 'preview', '.generated');

const chromeCandidates = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  process.env.CHROME_PATH || ''
].filter(Boolean);

const chrome = chromeCandidates.find((candidate) => fs.existsSync(candidate));
if (!chrome) {
  throw new Error('Chrome or Edge is required to render the README images.');
}

const dark = {
  '--vscode-editor-background': '#1f1f1f',
  '--vscode-foreground': '#cccccc',
  '--vscode-descriptionForeground': '#9d9d9d',
  '--vscode-editorWidget-background': '#252526',
  '--vscode-panel-border': '#3c3c3c',
  '--vscode-input-background': '#313131',
  '--vscode-input-foreground': '#cccccc',
  '--vscode-input-border': '#3c3c3c',
  '--vscode-button-background': '#0078d4',
  '--vscode-button-foreground': '#ffffff',
  '--vscode-button-secondaryBackground': '#3a3d41',
  '--vscode-button-secondaryForeground': '#ffffff',
  '--vscode-textCodeBlock-background': '#181818',
  '--vscode-textLink-foreground': '#4daafc',
  '--vscode-focusBorder': '#0078d4',
  '--vscode-testing-iconPassed': '#73c991',
  '--vscode-editorWarning-foreground': '#cca700',
  '--vscode-errorForeground': '#f85149',
  '--vscode-inputValidation-errorBackground': '#5a1d1d',
  '--vscode-inputValidation-errorBorder': '#be1100',
  '--vscode-notifications-background': '#252526',
  '--vscode-font-family': "'Segoe UI', 'Segoe WPC', system-ui, sans-serif",
  '--vscode-font-size': '13px',
  '--vscode-editor-font-family': "Consolas, 'Courier New', monospace"
};

const light = {
  ...dark,
  '--vscode-editor-background': '#ffffff',
  '--vscode-foreground': '#3b3b3b',
  '--vscode-descriptionForeground': '#6e7681',
  '--vscode-editorWidget-background': '#f8f8f8',
  '--vscode-panel-border': '#e5e5e5',
  '--vscode-input-background': '#ffffff',
  '--vscode-input-foreground': '#3b3b3b',
  '--vscode-input-border': '#cecece',
  '--vscode-button-secondaryBackground': '#e5e5e5',
  '--vscode-button-secondaryForeground': '#3b3b3b',
  '--vscode-textCodeBlock-background': '#f6f8fa',
  '--vscode-textLink-foreground': '#006ab1',
  '--vscode-focusBorder': '#0090f1',
  '--vscode-errorForeground': '#e51400',
  '--vscode-inputValidation-errorBackground': '#f2dede',
  '--vscode-editorWarning-foreground': '#bf8803',
  '--vscode-testing-iconPassed': '#388a34',
  '--vscode-notifications-background': '#ffffff'
};

const modes = [
  ['quick', 'Quick Enhance'],
  ['professional', 'Professional Enhance'],
  ['developer', 'Developer Mode'],
  ['architect', 'Expert Architect'],
  ['debugging', 'Debugging Mode'],
  ['code-review', 'Code Review Mode'],
  ['uiux', 'UI/UX Mode'],
  ['game', 'Game Development Mode'],
  ['autonomous', 'Autonomous Agent Mode']
];

const hints = {
  quick: 'Quick Enhance — tighten the wording and make the request specific without adding structure.',
  professional: 'Professional Enhance — context, scope, deliverables and success criteria.',
  developer: 'Developer Mode — conventions, error handling, security and focused tests.',
  architect: 'Expert Architect — requirements, boundaries, data flow, trade-offs and staged delivery.',
  debugging: 'Debugging Mode — reproduction, evidence, root-cause analysis and a verified minimal fix.',
  'code-review': 'Code Review Mode — prioritised, actionable findings without unsolicited rewrites.',
  uiux: 'UI/UX Mode — user goals, layout, responsive behaviour, accessibility and interaction states.',
  game: 'Game Development Mode — mechanics, controls, feedback, assets, performance and playtesting.',
  autonomous: 'Autonomous Agent Mode — inspect, plan, implement, verify and report actual results.'
};

const samplePrompt = [
  'Fix the save button on our dashboard, it sometimes does nothing.',
  'We use React + TypeScript, the form posts to /api/projects.'
].join('\n');

const sampleResult = [
  '## Task',
  'Fix the dashboard save button that intermittently does nothing after a form edit.',
  '',
  '## Context to verify first',
  '- Locate the save handler for the dashboard project form (React + TypeScript).',
  '- Confirm how it calls `POST /api/projects`, including request body, headers and error paths.',
  '- Check whether the button is disabled while a request is in flight.',
  '',
  '## Requirements',
  '1. Reproduce the failure and capture evidence (network response, console error, UI state).',
  '2. Identify the root cause before changing code; do not guess.',
  '3. Apply the smallest fix that resolves the cause and keeps existing behaviour.',
  '4. Add a regression test for the failing path.',
  '5. Run the relevant checks and report the actual output, including anything still failing.',
  '',
  '## Success criteria',
  '- Saving reliably updates the project and shows success feedback.',
  '- Failed saves surface an actionable error and re-enable the button.',
  '- No unrelated refactors or new dependencies.'
].join('\n');

function themeStyle(vars) {
  const body = Object.entries(vars)
    .map(([key, value]) => `${key}: ${value};`)
    .join('\n      ');
  return `<style>\n      :root {\n      ${body}\n      }\n      html, body { min-height: 100%; }\n    </style>`;
}

function panelHtml(theme) {
  const source = fs.readFileSync(path.join(root, 'src', 'extension.ts'), 'utf8');
  const match = source.match(/return `<!DOCTYPE html>([\s\S]*?)<\/html>`;/);
  if (!match) {
    throw new Error('Could not locate the webview HTML template in src/extension.ts');
  }

  let html = `<!DOCTYPE html>${match[1]}</html>`;
  html = html.replace(/<meta http-equiv="Content-Security-Policy"[^>]*>\s*/i, '');
  html = html.replace(/\$\{nonce\}/g, 'preview');
  html = html.replace('${modeHints}', JSON.stringify(hints));

  const stub = `<script>
      window.acquireVsCodeApi = function () {
        return {
          postMessage: function () {},
          getState: function () { return {}; },
          setState: function () {}
        };
      };
    </script>`;
  html = html.replace('</head>', `${themeStyle(theme)}${stub}</head>`);

  const seed = `<script>
      window.addEventListener('load', function () {
        var modes = ${JSON.stringify(modes.map(([id, label]) => ({ id: id, label: label })))};
        function send(data) { window.postMessage(data, '*'); }
        setTimeout(function () { send({ type: 'settingsLoaded', endpoint: 'https://api.openai.com/v1', model: 'gpt-4o-mini', hasApiKey: true, modes: modes }); }, 40);
        setTimeout(function () { send({ type: 'setSource', content: ${JSON.stringify(samplePrompt)} }); }, 80);
        setTimeout(function () { send({ type: 'result', content: ${JSON.stringify(sampleResult)} }); }, 120);
        setTimeout(function () {
          var toast = document.getElementById('toast');
          if (toast) { toast.classList.remove('show'); }
        }, 2000);
      });
    </script>`;
  html = html.replace('</body>', `${seed}</body>`);
  return html;
}

function render(html, outName, width, height, scale) {
  const dpr = scale || 2;
  fs.mkdirSync(previewDir, { recursive: true });
  const htmlPath = path.join(previewDir, `${outName}.html`);
  fs.writeFileSync(htmlPath, html, 'utf8');
  const outPath = path.join(imagesDir, `${outName}.png`);
  execFileSync(
    chrome,
    [
      '--headless=new',
      '--disable-gpu',
      '--hide-scrollbars',
      `--force-device-scale-factor=${dpr}`,
      '--virtual-time-budget=4000',
      `--window-size=${width},${height}`,
      `--screenshot=${outPath}`,
      `file:///${htmlPath.replace(/\\/g, '/')}`
    ],
    { stdio: 'ignore' }
  );
  console.log(`rendered ${path.relative(root, outPath)} (${width}x${height} @${dpr}x)`);
}

function svgWrapper(svgName, width, height) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8" />
    <style>html,body{margin:0;padding:0;background:#0d1117;}svg{display:block;}</style>
    </head><body><img src="../../../docs/images/${svgName}" width="${width}" height="${height}" /></body></html>`;
}

const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : '';

if (!only || only === 'panel') {
  render(panelHtml(dark), 'panel-dark', 1400, 800);
  render(panelHtml(light), 'panel-light', 1400, 800);
}

if (!only || only === 'banner') {
  render(svgWrapper('banner.svg', 1280, 400), 'banner', 1280, 400, 1);
}

if (!only || only === 'diagrams') {
  render(svgWrapper('architecture.svg', 1200, 660), 'architecture', 1200, 660);
  render(svgWrapper('flow.svg', 1200, 430), 'flow', 1200, 430);
}

if (!only || only === 'sidebar') {
  const sidebar = fs.readFileSync(path.join(__dirname, 'sidebar.html'), 'utf8');
  render(sidebar, 'sidebar', 1100, 720);
}
