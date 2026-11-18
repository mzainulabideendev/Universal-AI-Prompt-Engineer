import * as vscode from 'vscode';
import { randomBytes } from 'node:crypto';
import { PromptMode, PromptModes } from './promptEngine';
import { API_KEY_SECRET, enhanceWithConfiguredProvider, getCompletionUrl } from './aiProvider';

const SETTINGS_SECTION = 'universalAIPromptEngineer';

class ActionTreeItem extends vscode.TreeItem {
  constructor(
    label: string,
    description: string,
    icon: string,
    tooltip: string,
    command?: { command: string; arguments?: unknown[] }
  ) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.description = description;
    this.tooltip = tooltip;
    this.iconPath = new vscode.ThemeIcon(icon);
    if (command) {
      this.command = { title: label, command: command.command, arguments: command.arguments };
    }
  }
}

class PromptEngineerTreeProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  private readonly items: vscode.TreeItem[] = PromptModes.all.map(
    (mode) =>
      new ActionTreeItem(mode.label, mode.description, mode.icon, mode.tooltip, {
        command: 'universalAIPromptEngineer.openPromptPanelWithMode',
        arguments: [mode.id]
      })
  );

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(): vscode.TreeItem[] {
    return this.items;
  }
}

class SetupTreeProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  private readonly items: vscode.TreeItem[] = [
    new ActionTreeItem('Set API Key', 'SecretStorage', 'key', 'Store an API key for the configured provider.', {
      command: 'universalAIPromptEngineer.setApiKey'
    }),
    new ActionTreeItem('Clear API Key', 'Remove', 'trash', 'Delete the stored API key from SecretStorage.', {
      command: 'universalAIPromptEngineer.clearApiKey'
    }),
    new ActionTreeItem('Open Panel', 'Ctrl+Alt+O', 'window', 'Open the Prompt Engineer panel.', {
      command: 'universalAIPromptEngineer.openPromptPanel'
    }),
    new ActionTreeItem('Extension Settings', 'Configure', 'gear', 'Open the Universal AI Prompt Engineer settings.', {
      command: 'workbench.action.openSettings',
      arguments: [SETTINGS_SECTION]
    })
  ];

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(): vscode.TreeItem[] {
    return this.items;
  }
}

function toCommandSuffix(mode: PromptMode): string {
  switch (mode) {
    case 'code-review':
      return 'codeReviewEnhance';
    case 'quick':
      return 'quickEnhance';
    default:
      return `${mode}Enhance`;
  }
}

class PromptEngineerPanel {
  public static currentPanel: PromptEngineerPanel | undefined;

  public readonly panel: vscode.WebviewPanel;
  private webviewReady = false;
  private pendingResult: string | undefined;
  private pendingMode: PromptMode | undefined;
  private pendingSource: string | undefined;

  private constructor(panel: vscode.WebviewPanel, private readonly context: vscode.ExtensionContext) {
    this.panel = panel;

    this.panel.webview.html = this.getHtml();

    this.panel.onDidDispose(() => {
      PromptEngineerPanel.currentPanel = undefined;
    });

    this.panel.webview.onDidReceiveMessage(async (message) => {
      if (message.type === 'ready') {
        this.webviewReady = true;
        await this.sendProviderSettings('settingsLoaded');
        if (this.pendingMode) {
          this.panel.webview.postMessage({ type: 'setMode', mode: this.pendingMode });
          this.pendingMode = undefined;
        }
        if (this.pendingSource !== undefined) {
          this.panel.webview.postMessage({ type: 'setSource', content: this.pendingSource });
          this.pendingSource = undefined;
        }
        if (this.pendingResult !== undefined) {
          this.panel.webview.postMessage({ type: 'result', content: this.pendingResult });
          this.pendingResult = undefined;
        }
      }

      if (message.type === 'saveSettings') {
        try {
          await this.saveProviderSettings(message);
          await this.sendProviderSettings('settingsSaved');
        } catch (error) {
          this.panel.webview.postMessage({
            type: 'settingsError',
            content: error instanceof Error ? error.message : 'Could not save provider settings.'
          });
        }
      }

      if (message.type === 'removeApiKey') {
        const confirmation = await vscode.window.showWarningMessage(
          'Remove the saved AI provider API key?',
          { modal: true },
          'Remove Key'
        );
        if (confirmation === 'Remove Key') {
          await this.context.secrets.delete(API_KEY_SECRET);
          await this.sendProviderSettings('settingsSaved');
        }
      }

      if (message.type === 'enhance') {
        const mode = isPromptMode(message.mode) ? message.mode : 'professional';
        try {
          const enhanced = await enhanceWithConfiguredProvider(
            this.context.secrets,
            vscode.workspace.getConfiguration(SETTINGS_SECTION),
            typeof message.text === 'string' ? message.text : '',
            mode
          );
          this.panel.webview.postMessage({ type: 'result', content: enhanced });
        } catch (error) {
          this.panel.webview.postMessage({
            type: 'error',
            content: error instanceof Error ? error.message : 'The AI request failed.'
          });
        }
      }

      if (message.type === 'copy') {
        await vscode.env.clipboard.writeText(typeof message.content === 'string' ? message.content : '');
        this.panel.webview.postMessage({ type: 'copied' });
      }

      if (message.type === 'openSettings') {
        await vscode.commands.executeCommand('workbench.action.openSettings', SETTINGS_SECTION);
      }
    });
  }

  public static createOrShow(context: vscode.ExtensionContext): PromptEngineerPanel {
    const column = vscode.window.activeTextEditor ? vscode.window.activeTextEditor.viewColumn : undefined;

    if (PromptEngineerPanel.currentPanel) {
      PromptEngineerPanel.currentPanel.panel.reveal(column, true);
      return PromptEngineerPanel.currentPanel;
    }

    const panel = vscode.window.createWebviewPanel(
      'promptEngineerPanel',
      'Prompt Engineer',
      { viewColumn: column ?? vscode.ViewColumn.One, preserveFocus: false },
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [context.extensionUri]
      }
    );

    PromptEngineerPanel.currentPanel = new PromptEngineerPanel(panel, context);
    return PromptEngineerPanel.currentPanel;
  }

  public showResult(content: string): void {
    if (!this.webviewReady) {
      this.pendingResult = content;
    } else {
      this.panel.webview.postMessage({ type: 'result', content });
    }
    this.panel.reveal(vscode.ViewColumn.One, true);
  }

  /** Reveals the panel and selects a mode, optionally prefilling the prompt editor. */
  public selectMode(mode: PromptMode, sourceText?: string): void {
    this.panel.reveal(vscode.ViewColumn.One, true);
    const text = typeof sourceText === 'string' && sourceText.trim() ? sourceText : undefined;
    if (!this.webviewReady) {
      this.pendingMode = mode;
      if (text) {
        this.pendingSource = text;
      }
      return;
    }
    this.panel.webview.postMessage({ type: 'setMode', mode });
    if (text) {
      this.panel.webview.postMessage({ type: 'setSource', content: text });
    }
  }

  public async refreshProviderSettings(): Promise<void> {
    if (this.webviewReady) {
      await this.sendProviderSettings('settingsLoaded');
    }
  }

  private async sendProviderSettings(type: 'settingsLoaded' | 'settingsSaved'): Promise<void> {
    const configuration = vscode.workspace.getConfiguration(SETTINGS_SECTION);
    this.panel.webview.postMessage({
      type,
      endpoint: configuration.get<string>('apiEndpoint', 'https://api.openai.com/v1'),
      model: configuration.get<string>('model', 'gpt-4o-mini'),
      hasApiKey: Boolean(await this.context.secrets.get(API_KEY_SECRET)),
      modes: PromptModes.all.map((mode) => ({ id: mode.id, label: mode.label }))
    });
  }

  private async saveProviderSettings(message: Record<string, unknown>): Promise<void> {
    const endpoint = typeof message.endpoint === 'string' ? message.endpoint.trim() : '';
    const model = typeof message.model === 'string' ? message.model.trim() : '';
    const apiKey = typeof message.apiKey === 'string' ? message.apiKey.trim() : '';

    getCompletionUrl(endpoint);
    if (!model || model.length > 200) {
      throw new Error('Enter a model name between 1 and 200 characters.');
    }

    const configuration = vscode.workspace.getConfiguration(SETTINGS_SECTION);
    await configuration.update('apiEndpoint', endpoint, vscode.ConfigurationTarget.Global);
    await configuration.update('model', model, vscode.ConfigurationTarget.Global);
    if (apiKey) {
      await this.context.secrets.store(API_KEY_SECRET, apiKey);
    }
  }

  private getHtml(): string {
    const nonce = randomBytes(16).toString('base64');
    const modeHints = JSON.stringify(
      PromptModes.all.reduce((hints, mode) => {
        hints[mode.id] = mode.tooltip;
        return hints;
      }, {} as Record<string, string>)
    ).replace(/</g, '\\u003c');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src data:;" />
  <title>Prompt Engineer</title>
  <style>
    :root {
      --card-bg: var(--vscode-editorWidget-background, #252526);
      --card-border: var(--vscode-panel-border, rgba(128, 128, 128, 0.35));
      --muted: var(--vscode-descriptionForeground, #9d9d9d);
      --accent: var(--vscode-button-background, #0e639c);
      --accent-text: var(--vscode-button-foreground, #ffffff);
      --code-bg: var(--vscode-textCodeBlock-background, rgba(127, 127, 127, 0.12));
      --ok: var(--vscode-testing-iconPassed, #3fb950);
      --warn: var(--vscode-editorWarning-foreground, #cca700);
      --danger: var(--vscode-errorForeground, #f85149);
      --radius: 8px;
    }
    * { box-sizing: border-box; }
    html, body { height: 100%; }
    body {
      margin: 0;
      padding: 0;
      background: var(--vscode-editor-background, #1e1e1e);
      color: var(--vscode-foreground, #cccccc);
      font-family: var(--vscode-font-family, "Segoe UI", sans-serif);
      font-size: var(--vscode-font-size, 13px);
    }
    .app {
      display: grid;
      gap: 14px;
      max-width: 1180px;
      margin: 0 auto;
      padding: 18px 20px 26px;
    }
    header {
      display: flex;
      align-items: center;
      gap: 12px;
      padding-bottom: 4px;
    }
    .logo {
      width: 38px;
      height: 38px;
      border-radius: 10px;
      flex: 0 0 auto;
      box-shadow: 0 4px 14px rgba(99, 102, 241, 0.28);
    }
    .titles { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
    h1 {
      margin: 0;
      font-size: 15px;
      font-weight: 600;
      letter-spacing: 0.1px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .subtitle { margin: 0; font-size: 12px; color: var(--muted); }
    .pill {
      margin-left: auto;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 5px 10px;
      border-radius: 999px;
      border: 1px solid var(--card-border);
      background: var(--card-bg);
      font-size: 11px;
      color: var(--muted);
      white-space: nowrap;
    }
    .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--muted); }
    .pill.ok { color: var(--ok); border-color: color-mix(in srgb, var(--ok) 45%, transparent); }
    .pill.ok .dot { background: var(--ok); box-shadow: 0 0 0 3px color-mix(in srgb, var(--ok) 18%, transparent); }
    .pill.warn { color: var(--warn); border-color: color-mix(in srgb, var(--warn) 45%, transparent); }
    .pill.warn .dot { background: var(--warn); }

    .grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 14px; align-items: start; }
    @media (max-width: 880px) { .grid { grid-template-columns: minmax(0, 1fr); } }

    .card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: var(--radius);
      padding: 14px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      min-width: 0;
    }
    .card-head {
      display: flex;
      align-items: center;
      gap: 8px;
      justify-content: space-between;
    }
    .card-title {
      margin: 0;
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.07em;
      text-transform: uppercase;
      color: var(--muted);
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    label.field { display: grid; gap: 5px; font-size: 11px; color: var(--muted); }
    input[type="url"], input[type="text"], input[type="password"], select, textarea {
      width: 100%;
      padding: 8px 10px;
      border-radius: 6px;
      border: 1px solid var(--vscode-input-border, var(--card-border));
      background: var(--vscode-input-background, #3c3c3c);
      color: var(--vscode-input-foreground, #cccccc);
      font-family: inherit;
      font-size: 12.5px;
      outline: none;
    }
    input:focus, select:focus, textarea:focus {
      border-color: var(--vscode-focusBorder, #007fd4);
      box-shadow: 0 0 0 1px var(--vscode-focusBorder, #007fd4);
    }
    textarea {
      min-height: 176px;
      resize: vertical;
      line-height: 1.55;
      font-family: var(--vscode-editor-font-family, "Consolas", monospace);
      font-size: 13px;
    }
    select { appearance: auto; cursor: pointer; }
    .hint { margin: 0; font-size: 11px; color: var(--muted); min-height: 1.2em; }
    .row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    .spacer { flex: 1 1 auto; }
    .counter { font-size: 11px; color: var(--muted); font-variant-numeric: tabular-nums; }
    .counter.over { color: var(--danger); }

    button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      border: 1px solid transparent;
      border-radius: 6px;
      padding: 7px 12px;
      font-family: inherit;
      font-size: 12.5px;
      font-weight: 500;
      cursor: pointer;
      color: var(--accent-text);
      background: var(--accent);
      transition: filter 0.12s ease, opacity 0.12s ease;
      white-space: nowrap;
    }
    button:hover:not(:disabled) { filter: brightness(1.12); }
    button:focus-visible { outline: 1px solid var(--vscode-focusBorder, #007fd4); outline-offset: 2px; }
    button:disabled { opacity: 0.55; cursor: progress; }
    button.secondary {
      background: var(--vscode-button-secondaryBackground, rgba(128, 128, 128, 0.2));
      color: var(--vscode-button-secondaryForeground, var(--vscode-foreground, #cccccc));
    }
    button.ghost {
      background: transparent;
      color: var(--muted);
      border-color: var(--card-border);
      padding: 5px 9px;
      font-size: 11.5px;
    }
    button.ghost:hover:not(:disabled) { color: var(--vscode-foreground); background: rgba(128, 128, 128, 0.14); }
    button svg { width: 14px; height: 14px; flex: 0 0 auto; }

    .result {
      white-space: pre-wrap;
      word-break: break-word;
      background: var(--code-bg);
      border: 1px solid var(--card-border);
      border-radius: 6px;
      padding: 12px;
      min-height: 240px;
      max-height: 52vh;
      overflow: auto;
      font-family: var(--vscode-editor-font-family, "Consolas", monospace);
      font-size: 12.5px;
      line-height: 1.6;
    }
    .result.empty {
      display: grid;
      place-content: center;
      text-align: center;
      gap: 6px;
      color: var(--muted);
      font-family: var(--vscode-font-family, sans-serif);
      font-size: 12.5px;
    }
    .result.empty strong { color: var(--vscode-foreground); font-weight: 600; }

    .banner {
      display: none;
      align-items: flex-start;
      gap: 8px;
      padding: 9px 11px;
      border-radius: 6px;
      font-size: 12px;
      line-height: 1.45;
      border: 1px solid var(--vscode-inputValidation-errorBorder, var(--danger));
      background: var(--vscode-inputValidation-errorBackground, rgba(248, 81, 73, 0.12));
      color: var(--vscode-foreground);
    }
    .banner.show { display: flex; }
    .banner svg { width: 14px; height: 14px; flex: 0 0 auto; margin-top: 2px; color: var(--danger); }

    details.settings {
      border: 1px solid var(--card-border);
      border-radius: var(--radius);
      background: var(--card-bg);
      padding: 0;
    }
    details.settings > summary {
      cursor: pointer;
      list-style: none;
      padding: 11px 14px;
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.07em;
      text-transform: uppercase;
      color: var(--muted);
      display: flex;
      align-items: center;
      gap: 8px;
    }
    details.settings > summary::-webkit-details-marker { display: none; }
    details.settings > summary:hover { color: var(--vscode-foreground); }
    details.settings > summary .chev { margin-left: auto; transition: transform 0.15s ease; }
    details.settings[open] > summary .chev { transform: rotate(90deg); }
    details.settings .settings-body {
      display: grid;
      gap: 10px;
      padding: 0 14px 14px;
      grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
    }
    .settings-body .full { grid-column: 1 / -1; }
    .status-line { font-size: 11.5px; color: var(--muted); }
    .status-line.ok { color: var(--ok); }
    .status-line.error { color: var(--danger); }

    footer {
      display: flex;
      gap: 8px;
      align-items: center;
      flex-wrap: wrap;
      font-size: 11px;
      color: var(--muted);
    }
    footer a { color: var(--vscode-textLink-foreground, #3794ff); text-decoration: none; cursor: pointer; }
    footer a:hover { text-decoration: underline; }

    .spinner {
      width: 12px;
      height: 12px;
      border-radius: 50%;
      border: 2px solid color-mix(in srgb, var(--accent-text) 35%, transparent);
      border-top-color: var(--accent-text);
      animation: spin 0.8s linear infinite;
      display: none;
      flex: 0 0 auto;
    }
    button.busy .spinner { display: inline-block; }
    button.busy svg { display: none; }
    @keyframes spin { to { transform: rotate(360deg); } }

    .toast {
      position: fixed;
      right: 16px;
      bottom: 16px;
      padding: 8px 12px;
      border-radius: 6px;
      background: var(--vscode-notifications-background, var(--card-bg));
      border: 1px solid var(--card-border);
      color: var(--vscode-foreground, #fff);
      font-size: 12px;
      opacity: 0;
      transform: translateY(6px);
      transition: opacity 0.15s ease, transform 0.15s ease;
      pointer-events: none;
    }
    .toast.show { opacity: 1; transform: translateY(0); }
  </style>
</head>
<body>
  <div class="app">
    <header>
      <svg class="logo" viewBox="0 0 64 64" aria-hidden="true">
        <defs>
          <linearGradient id="lg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#8b5cf6" />
            <stop offset="100%" stop-color="#3b82f6" />
          </linearGradient>
        </defs>
        <rect width="64" height="64" rx="14" fill="url(#lg)" />
        <path d="M18 22h24v5H18zm0 9h24v5H18zm0 9h15v5H18z" fill="#fff" opacity="0.95" />
        <path d="M44 33l3.2 7.3L54 43.5l-6.8 3.2L44 54l-3.2-7.3L34 43.5l6.8-3.2z" fill="#fff" />
      </svg>
      <div class="titles">
        <h1>Universal AI Prompt Engineer</h1>
        <p class="subtitle">Turn rough ideas into review-ready instructions for any AI coding agent.</p>
      </div>
      <span class="pill" id="providerPill"><span class="dot"></span><span id="providerPillText">Checking…</span></span>
    </header>

    <details class="settings" id="settingsCard">
      <summary>
        <svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor" aria-hidden="true"><path d="M9.1 1.6a1.9 1.9 0 0 1 1.3 2.5l-.2.5.9.9.5-.2a1.9 1.9 0 0 1 2.5 1.3l.2.6-1.6.5-.2-.6a.4.4 0 0 0-.5-.3l-.5.2-2.3-2.3.2-.5a.4.4 0 0 0-.3-.5l-.6-.2zM6.9 5.4l3.7 3.7-4.9 4.9-2.1-2.1z" opacity=".75"/></svg>
        Provider settings
        <svg class="chev" viewBox="0 0 16 16" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M6 4l4 4-4 4V4z"/></svg>
      </summary>
      <div class="settings-body">
        <label class="field full">HTTPS API endpoint
          <input id="endpointInput" type="url" spellcheck="false" autocomplete="url" placeholder="https://api.openai.com/v1" />
        </label>
        <label class="field">Model
          <input id="modelInput" type="text" spellcheck="false" autocomplete="off" placeholder="gpt-4o-mini" />
        </label>
        <label class="field">API key
          <input id="apiKeyInput" type="password" autocomplete="new-password" placeholder="Leave blank to keep the saved key" />
        </label>
        <div class="row full">
          <button id="saveSettingsBtn" class="secondary">
            <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M13.7 4.3a1 1 0 0 1 0 1.4l-6 6a1 1 0 0 1-1.4 0l-3-3 1.4-1.4L7 9.6l5.3-5.3a1 1 0 0 1 1.4 0z"/></svg>
            Save provider settings
          </button>
          <button id="removeKeyBtn" class="ghost">
            <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M6 2h4a1 1 0 0 1 1 1v1h3v1.5h-1l-.7 8a1 1 0 0 1-1 .9H4.7a1 1 0 0 1-1-.9l-.7-8H2V4h3V3a1 1 0 0 1 1-1zm1 2h2V3.5H7V4z"/></svg>
            Remove saved key
          </button>
          <span class="spacer"></span>
          <button id="openSettingsBtn" class="ghost">All settings</button>
        </div>
        <div class="status-line full" id="settingsStatus" role="status" aria-live="polite">Loading provider settings…</div>
      </div>
    </details>

    <div class="banner" id="errorBanner" role="alert">
      <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8 1l7 13H1L8 1zm0 4.6a.9.9 0 0 0-.9 1l.2 3.2h1.4l.2-3.2a.9.9 0 0 0-.9-1zm0 6a1 1 0 1 0 0 2 1 1 0 0 0 0-2z"/></svg>
      <span id="errorText"></span>
    </div>

    <div class="grid">
      <section class="card">
        <div class="card-head">
          <h2 class="card-title">
            <svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor" aria-hidden="true"><path d="M3 2h10v2H3zm0 5h10v2H3zm0 5h6v2H3z"/></svg>
            Your rough prompt
          </h2>
          <span class="counter" id="charCount">0 / 20,000</span>
        </div>
        <label class="field">Mode
          <select id="modeSelect"></select>
        </label>
        <p class="hint" id="modeHint"></p>
        <textarea id="sourceText" placeholder="Example: build a login page with a database and password reset" aria-label="Prompt to enhance"></textarea>
        <div class="row">
          <button id="generateBtn">
            <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8 1l1.7 4.3L14 7l-4.3 1.7L8 13l-1.7-4.3L2 7l4.3-1.7z"/><path d="M13 11l.8 2.2L16 14l-2.2.8L13 17l-.8-2.2L10 14l2.2-.8z" opacity=".7"/></svg>
            <span class="spinner"></span>
            Enhance prompt
          </button>
          <button id="clearBtn" class="ghost">Clear</button>
          <span class="spacer"></span>
          <span class="hint">Ctrl+Enter</span>
        </div>
      </section>

      <section class="card">
        <div class="card-head">
          <h2 class="card-title">
            <svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor" aria-hidden="true"><path d="M2 2h12v2H2zm0 4h12v2H2zm0 4h8v2H2z"/><path d="M11.7 9.3l.9 2.3 2.3.9-2.3.9-.9 2.3-.9-2.3-2.3-.9 2.3-.9z"/></svg>
            Enhanced prompt
          </h2>
          <button id="copyBtn" class="ghost">
            <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M5 1h8a1 1 0 0 1 1 1v9h-1.5V2.5H5V1zM2 4h8a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z"/></svg>
            Copy
          </button>
        </div>
        <div class="result empty" id="result">
          <strong>Nothing here yet</strong>
          <span>Pick a mode, add your rough prompt, then press Enhance.</span>
        </div>
      </section>
    </div>

    <footer>
      <span>Keys stay in VS Code SecretStorage.</span>
      <span>&middot;</span>
      <span>Prompts are sent only to your configured HTTPS endpoint.</span>
      <span class="spacer"></span>
      <a id="docsLink" role="button" tabindex="0">Open extension settings</a>
    </footer>
  </div>
  <div class="toast" id="toast">Copied to clipboard</div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const els = {
      sourceText: document.getElementById('sourceText'),
      modeSelect: document.getElementById('modeSelect'),
      modeHint: document.getElementById('modeHint'),
      result: document.getElementById('result'),
      generateBtn: document.getElementById('generateBtn'),
      clearBtn: document.getElementById('clearBtn'),
      copyBtn: document.getElementById('copyBtn'),
      endpointInput: document.getElementById('endpointInput'),
      modelInput: document.getElementById('modelInput'),
      apiKeyInput: document.getElementById('apiKeyInput'),
      settingsStatus: document.getElementById('settingsStatus'),
      saveSettingsBtn: document.getElementById('saveSettingsBtn'),
      removeKeyBtn: document.getElementById('removeKeyBtn'),
      openSettingsBtn: document.getElementById('openSettingsBtn'),
      providerPill: document.getElementById('providerPill'),
      providerPillText: document.getElementById('providerPillText'),
      charCount: document.getElementById('charCount'),
      errorBanner: document.getElementById('errorBanner'),
      errorText: document.getElementById('errorText'),
      toast: document.getElementById('toast'),
      docsLink: document.getElementById('docsLink')
    };
    const MODE_HINTS = ${modeHints};
    const MAX_CHARS = 20000;
    let modes = [];
    let lastResult = '';
    let toastTimer = 0;
    let pendingMode = '';

    function setModes(list) {
      if (!Array.isArray(list) || !list.length) { return; }
      modes = list;
      els.modeSelect.innerHTML = '';
      list.forEach(function (mode) {
        const option = document.createElement('option');
        option.value = mode.id;
        option.textContent = mode.label;
        els.modeSelect.appendChild(option);
      });
      els.modeSelect.value = pendingMode || 'professional';
      updateModeHint();
    }

    function updateModeHint() {
      const mode = els.modeSelect.value;
      els.modeHint.textContent = MODE_HINTS[mode] || '';
    }

    function setBusy(busy) {
      els.generateBtn.disabled = busy;
      els.generateBtn.classList.toggle('busy', busy);
    }

    function showError(message) {
      els.errorText.textContent = message || '';
      els.errorBanner.classList.toggle('show', Boolean(message));
    }

    function renderEmpty() {
      els.result.classList.add('empty');
      els.result.innerHTML = '<strong>Nothing here yet</strong><span>Pick a mode, add your rough prompt, then press Enhance.</span>';
    }

    function renderResult(text) {
      lastResult = text || '';
      els.result.classList.remove('empty');
      els.result.textContent = text || '';
    }

    function toast(message) {
      els.toast.textContent = message;
      els.toast.classList.add('show');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(function () { els.toast.classList.remove('show'); }, 1600);
    }

    function updateCounter() {
      const length = els.sourceText.value.length;
      els.charCount.textContent = length.toLocaleString() + ' / 20,000';
      els.charCount.classList.toggle('over', length > MAX_CHARS);
    }

    function setProviderState(hasKey) {
      els.providerPill.classList.toggle('ok', hasKey);
      els.providerPill.classList.toggle('warn', !hasKey);
      els.providerPillText.textContent = hasKey ? 'Provider connected' : 'API key required';
    }

    els.modeSelect.addEventListener('change', updateModeHint);
    els.sourceText.addEventListener('input', updateCounter);
    els.sourceText.addEventListener('keydown', function (event) {
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        event.preventDefault();
        els.generateBtn.click();
      }
    });

    els.generateBtn.addEventListener('click', function () {
      const text = els.sourceText.value;
      if (!text.trim()) {
        showError('Enter a prompt before enhancing it.');
        els.sourceText.focus();
        return;
      }
      showError('');
      setBusy(true);
      els.result.classList.remove('empty');
      els.result.textContent = 'Enhancing with AI…';
      vscode.postMessage({ type: 'enhance', text: text, mode: els.modeSelect.value });
    });

    els.clearBtn.addEventListener('click', function () {
      els.sourceText.value = '';
      updateCounter();
      showError('');
      lastResult = '';
      renderEmpty();
      els.sourceText.focus();
    });

    els.copyBtn.addEventListener('click', function () {
      if (!lastResult) { toast('Nothing to copy yet'); return; }
      vscode.postMessage({ type: 'copy', content: lastResult });
    });

    els.saveSettingsBtn.addEventListener('click', function () {
      els.saveSettingsBtn.disabled = true;
      els.settingsStatus.classList.remove('ok', 'error');
      els.settingsStatus.textContent = 'Saving provider settings…';
      vscode.postMessage({
        type: 'saveSettings',
        endpoint: els.endpointInput.value,
        model: els.modelInput.value,
        apiKey: els.apiKeyInput.value
      });
    });

    els.removeKeyBtn.addEventListener('click', function () {
      vscode.postMessage({ type: 'removeApiKey' });
    });

    els.openSettingsBtn.addEventListener('click', function () {
      vscode.postMessage({ type: 'openSettings' });
    });

    els.docsLink.addEventListener('click', function () {
      vscode.postMessage({ type: 'openSettings' });
    });

    window.addEventListener('message', function (event) {
      const message = event.data;
      if (message.type === 'settingsLoaded' || message.type === 'settingsSaved') {
        els.endpointInput.value = message.endpoint || '';
        els.modelInput.value = message.model || '';
        els.apiKeyInput.value = '';
        els.settingsStatus.classList.toggle('ok', Boolean(message.hasApiKey));
        els.settingsStatus.textContent = message.hasApiKey
          ? 'API key saved securely. Leave the key field blank to keep using it.'
          : 'No API key saved. Enter one to enable AI enhancement.';
        setProviderState(Boolean(message.hasApiKey));
        setModes(message.modes);
        els.saveSettingsBtn.disabled = false;
      } else if (message.type === 'settingsError') {
        els.settingsStatus.classList.remove('ok');
        els.settingsStatus.classList.add('error');
        els.settingsStatus.textContent = 'Error: ' + message.content;
        els.saveSettingsBtn.disabled = false;
      } else if (message.type === 'result') {
        setBusy(false);
        showError('');
        renderResult(message.content || '');
        toast('Prompt enhanced');
      } else if (message.type === 'error') {
        setBusy(false);
        renderEmpty();
        showError(message.content || 'The AI request failed.');
      } else if (message.type === 'copied') {
        toast('Copied to clipboard');
      } else if (message.type === 'setMode') {
        pendingMode = message.mode || '';
        if (modes.length) {
          els.modeSelect.value = pendingMode;
          updateModeHint();
        }
        els.sourceText.focus();
      } else if (message.type === 'setSource') {
        els.sourceText.value = message.content || '';
        updateCounter();
        els.sourceText.focus();
      }
    });

    updateCounter();
    updateModeHint();
    vscode.postMessage({ type: 'ready' });
  </script>
</body>
</html>`;
  }
}

async function getInputText(defaultValue?: string): Promise<string> {
  const result = await vscode.window.showInputBox({
    prompt: 'Enter a rough prompt to improve',
    placeHolder: 'Example: Build a login page with database',
    value: defaultValue,
    ignoreFocusOut: true
  });

  return result ?? '';
}

async function enhancePromptFromText(mode: PromptMode, sourceText: string, context: vscode.ExtensionContext): Promise<void> {
  if (!sourceText.trim()) {
    vscode.window.showInformationMessage('No prompt text was provided.');
    return;
  }

  let enhanced: string;
  try {
    enhanced = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: 'Enhancing prompt with AI…', cancellable: false },
      () =>
        enhanceWithConfiguredProvider(
          context.secrets,
          vscode.workspace.getConfiguration(SETTINGS_SECTION),
          sourceText,
          mode
        )
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The AI request failed.';
    const action = await vscode.window.showErrorMessage(message, 'Set API Key', 'Open Settings');
    if (action === 'Set API Key') {
      await setApiKey(context);
    } else if (action === 'Open Settings') {
      await vscode.commands.executeCommand('workbench.action.openSettings', SETTINGS_SECTION);
    }
    return;
  }

  const outputMode = vscode.workspace.getConfiguration(SETTINGS_SECTION).get<string>('outputMode', 'panel');

  if (outputMode === 'copy') {
    await vscode.env.clipboard.writeText(enhanced);
    vscode.window.showInformationMessage(`Prompt enhanced in ${PromptModes.labels[mode]} mode and copied to the clipboard.`);
    return;
  }

  if (outputMode === 'replace') {
    const editor = vscode.window.activeTextEditor;
    if (editor) {
      const selection = editor.selection;
      editor.edit((editBuilder) => {
        editBuilder.replace(selection, enhanced);
      });
      vscode.window.showInformationMessage(`Prompt enhanced in ${PromptModes.labels[mode]} mode and replaced the selection.`);
      return;
    }
    vscode.window.showInformationMessage('No active editor was available to replace the selection.');
    return;
  }

  const panel = PromptEngineerPanel.currentPanel ?? PromptEngineerPanel.createOrShow(context);
  panel.showResult(enhanced);
}

async function enhanceSelection(mode: PromptMode, context: vscode.ExtensionContext): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showInformationMessage('Open a text editor to enhance a prompt.');
    return;
  }

  const selectedText = editor.document.getText(editor.selection);
  const textToEnhance = selectedText.trim() || (await getInputText());
  await enhancePromptFromText(mode, textToEnhance, context);
}

async function enhanceClipboard(mode: PromptMode, context: vscode.ExtensionContext): Promise<void> {
  const clipboardText = await vscode.env.clipboard.readText();
  const textToEnhance = clipboardText.trim() || (await getInputText());
  await enhancePromptFromText(mode, textToEnhance, context);
}

async function enhancePromptFromInput(mode: PromptMode, context: vscode.ExtensionContext): Promise<void> {
  const text = await getInputText();
  await enhancePromptFromText(mode, text, context);
}

export function activate(context: vscode.ExtensionContext) {
  const configuration = vscode.workspace.getConfiguration(SETTINGS_SECTION);
  const defaultMode = configuration.get<string>('defaultMode', 'professional') as PromptMode;

  const treeView = vscode.window.createTreeView('promptEngineerSidebar', {
    treeDataProvider: new PromptEngineerTreeProvider(),
    showCollapseAll: false
  });
  const setupView = vscode.window.createTreeView('promptEngineerSetup', {
    treeDataProvider: new SetupTreeProvider(),
    showCollapseAll: false
  });
  context.subscriptions.push(treeView, setupView);

  const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.command = 'universalAIPromptEngineer.openPromptPanel';
  statusBarItem.text = '$(sparkle) Prompt Engineer';
  statusBarItem.tooltip = 'Open the Universal AI Prompt Engineer panel (Ctrl+Alt+O)';
  context.subscriptions.push(statusBarItem);

  const syncStatusBar = () => {
    if (configuration.get<boolean>('showStatusBar', true)) {
      statusBarItem.show();
    } else {
      statusBarItem.hide();
    }
  };
  syncStatusBar();

  const commandDefinitions: Record<string, () => Promise<void>> = {
    'universalAIPromptEngineer.enhanceSelection': async () => {
      await enhanceSelection(defaultMode, context);
    },
    'universalAIPromptEngineer.enhanceClipboard': async () => {
      await enhanceClipboard(defaultMode, context);
    },
    'universalAIPromptEngineer.openPromptPanel': async () => {
      PromptEngineerPanel.createOrShow(context);
    },
    'universalAIPromptEngineer.setApiKey': async () => {
      await setApiKey(context);
    },
    'universalAIPromptEngineer.clearApiKey': async () => {
      await clearApiKey(context);
    }
  };

  for (const mode of PromptModes.all) {
    commandDefinitions[`universalAIPromptEngineer.${toCommandSuffix(mode.id)}`] = async () => {
      await enhancePromptFromInput(mode.id, context);
    };
  }

  for (const [command, handler] of Object.entries(commandDefinitions)) {
    context.subscriptions.push(vscode.commands.registerCommand(command, handler));
  }

  context.subscriptions.push(
    vscode.commands.registerCommand('universalAIPromptEngineer.openPromptPanelWithMode', async (mode?: PromptMode) => {
      const selected = isPromptMode(mode) ? mode : defaultMode;
      const editor = vscode.window.activeTextEditor;
      const selectedText = editor ? editor.document.getText(editor.selection) : '';
      const panel = PromptEngineerPanel.createOrShow(context);
      panel.selectMode(selected, selectedText);
    }),
    vscode.commands.registerCommand('universalAIPromptEngineer.enhanceSelectionWithMode', async (mode?: PromptMode) => {
      await enhanceSelection(isPromptMode(mode) ? mode : defaultMode, context);
    }),
    vscode.commands.registerCommand('universalAIPromptEngineer.enhanceClipboardWithMode', async (mode?: PromptMode) => {
      await enhanceClipboard(isPromptMode(mode) ? mode : defaultMode, context);
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (!event.affectsConfiguration(SETTINGS_SECTION)) {
        return;
      }
      syncStatusBar();
      void PromptEngineerPanel.currentPanel?.refreshProviderSettings();
    })
  );

  vscode.window.showInformationMessage(
    `Universal AI Prompt Engineer is ready. Default mode: ${PromptModes.get(defaultMode).label}.`
  );
}

export function deactivate() {}

async function setApiKey(context: vscode.ExtensionContext): Promise<void> {
  const apiKey = await vscode.window.showInputBox({
    title: 'Set AI Provider API Key',
    prompt: 'Enter your OpenAI-compatible provider API key. It is stored in VS Code SecretStorage.',
    password: true,
    ignoreFocusOut: true,
    validateInput: (value) => (value.trim() ? undefined : 'Enter a non-empty API key.')
  });
  if (apiKey === undefined) {
    return;
  }
  await context.secrets.store(API_KEY_SECRET, apiKey.trim());
  await PromptEngineerPanel.currentPanel?.refreshProviderSettings();
  vscode.window.showInformationMessage('AI provider API key stored securely for this VS Code profile.');
}

async function clearApiKey(context: vscode.ExtensionContext): Promise<void> {
  await context.secrets.delete(API_KEY_SECRET);
  await PromptEngineerPanel.currentPanel?.refreshProviderSettings();
  vscode.window.showInformationMessage('AI provider API key removed from VS Code SecretStorage.');
}

function isPromptMode(value: unknown): value is PromptMode {
  return typeof value === 'string' && PromptModes.getAll().includes(value as PromptMode);
}
