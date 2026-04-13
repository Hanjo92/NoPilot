const ROOT_STYLE_BLOCK = `:root {
  --card-bg: var(--vscode-editor-background);
  --card-border: var(--vscode-widget-border, var(--vscode-editorGroup-border));
  --card-hover: var(--vscode-list-hoverBackground);
  --active-border: var(--vscode-focusBorder);
  --badge-bg: var(--vscode-badge-background);
  --badge-fg: var(--vscode-badge-foreground);
  --danger: var(--vscode-errorForeground);
}

* { box-sizing: border-box; margin: 0; padding: 0; }

body {
  padding: 20px 32px;
  font-family: var(--vscode-font-family);
  font-size: var(--vscode-font-size);
  color: var(--vscode-foreground);
  background: var(--vscode-editor-background);
  line-height: 1.6;
}`;

const HEADER_STYLE_BLOCK = `h1 {
  font-size: 1.5em;
  font-weight: 600;
  margin-bottom: 4px;
  display: flex;
  align-items: center;
  gap: 8px;
}

h1 .icon { font-size: 1.3em; }

.subtitle {
  color: var(--vscode-descriptionForeground);
  margin-bottom: 24px;
  font-size: 0.9em;
}

h2 {
  font-size: 1.1em;
  font-weight: 600;
  margin: 28px 0 12px;
  display: flex;
  align-items: center;
  gap: 6px;
}`;

const PROVIDER_CARD_STYLE_BLOCK = `.provider-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 12px;
}

.provider-card {
  background: var(--card-bg);
  border: 1px solid var(--card-border);
  border-radius: 8px;
  padding: 16px;
  cursor: pointer;
  transition: border-color 0.15s, box-shadow 0.15s, transform 0.1s;
  position: relative;
}

.provider-card:hover {
  border-color: var(--vscode-focusBorder);
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}

.provider-card.active {
  border-color: var(--active-border);
  border-width: 2px;
  padding: 15px;
}

.provider-card .card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.provider-card .card-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  font-size: 1.05em;
}

.provider-card .card-icon {
  font-size: 1.4em;
}

.badge {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 0.75em;
  font-weight: 600;
}

.badge.active {
  background: var(--badge-bg);
  color: var(--badge-fg);
}

.badge.needs-key {
  background: var(--vscode-editorWarning-foreground);
  color: var(--vscode-editor-background);
  opacity: 0.9;
}

.badge.unavailable {
  opacity: 0.5;
}

.provider-card .card-desc {
  color: var(--vscode-descriptionForeground);
  font-size: 0.85em;
  margin-bottom: 12px;
}

.provider-card .card-model {
  font-size: 0.85em;
  margin-bottom: 8px;
}

.provider-card .card-model label {
  color: var(--vscode-descriptionForeground);
}

.provider-card select {
  width: 100%;
  padding: 4px 8px;
  margin-top: 4px;
  background: var(--vscode-input-background);
  color: var(--vscode-input-foreground);
  border: 1px solid var(--vscode-input-border, var(--card-border));
  border-radius: 4px;
  font-family: inherit;
  font-size: inherit;
  outline: none;
}

.provider-card select:focus {
  border-color: var(--vscode-focusBorder);
}

.card-actions {
  display: flex;
  gap: 6px;
  margin-top: 10px;
}`;

const CONTROL_STYLE_BLOCK = `button {
  padding: 5px 12px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-family: inherit;
  font-size: 0.85em;
  font-weight: 500;
  transition: opacity 0.15s;
}

button:hover { opacity: 0.85; }

button.primary {
  background: var(--vscode-button-background);
  color: var(--vscode-button-foreground);
}

button.secondary {
  background: var(--vscode-button-secondaryBackground);
  color: var(--vscode-button-secondaryForeground);
}

button.danger {
  background: transparent;
  color: var(--danger);
  border: 1px solid var(--danger);
  opacity: 0.7;
}

button.danger:hover { opacity: 1; }`;

const SETTINGS_SECTION_STYLE_BLOCK = `.settings-section {
  background: var(--card-bg);
  border: 1px solid var(--card-border);
  border-radius: 8px;
  padding: 16px 20px;
  margin-top: 12px;
}

.setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 0;
  border-bottom: 1px solid var(--card-border);
}

.setting-row:last-child { border-bottom: none; }

.setting-label {
  display: flex;
  flex-direction: column;
}

.setting-label .label-text { font-weight: 500; }

.setting-label .label-desc {
  font-size: 0.8em;
  color: var(--vscode-descriptionForeground);
}

.setting-control {
  display: flex;
  align-items: center;
  gap: 8px;
}

.setting-control input[type="number"] {
  width: 70px;
  padding: 4px 8px;
  background: var(--vscode-input-background);
  color: var(--vscode-input-foreground);
  border: 1px solid var(--vscode-input-border, var(--card-border));
  border-radius: 4px;
  font-family: inherit;
  text-align: center;
}

.setting-control input[type="text"] {
  width: 280px;
  max-width: 100%;
  padding: 4px 8px;
  background: var(--vscode-input-background);
  color: var(--vscode-input-foreground);
  border: 1px solid var(--vscode-input-border, var(--card-border));
  border-radius: 4px;
  font-family: inherit;
}

.ollama-endpoint-control {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.ollama-endpoint-control input[type="text"] {
  flex: 1 1 280px;
}

.setting-control select {
  padding: 4px 8px;
  background: var(--vscode-input-background);
  color: var(--vscode-input-foreground);
  border: 1px solid var(--vscode-input-border, var(--card-border));
  border-radius: 4px;
  font-family: inherit;
}

.toggle {
  position: relative;
  width: 40px;
  height: 22px;
}

.toggle input { opacity: 0; width: 0; height: 0; }

.toggle .slider {
  position: absolute;
  cursor: pointer;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: var(--vscode-input-background);
  border: 1px solid var(--vscode-input-border, var(--card-border));
  border-radius: 22px;
  transition: 0.2s;
}

.toggle .slider:before {
  position: absolute;
  content: "";
  height: 16px;
  width: 16px;
  left: 2px;
  bottom: 2px;
  background: var(--vscode-foreground);
  border-radius: 50%;
  transition: 0.2s;
}

.toggle input:checked + .slider {
  background: var(--vscode-button-background);
  border-color: var(--vscode-button-background);
}

.toggle input:checked + .slider:before {
  transform: translateX(18px);
  background: var(--vscode-button-foreground);
}`;

const SETTINGS_NOTE_STYLE_BLOCK = `.settings-note {
  margin-top: 10px;
  padding: 10px 12px;
  border-left: 3px solid var(--vscode-inputValidation-infoBorder, var(--vscode-focusBorder));
  background: var(--vscode-textBlockQuote-background, var(--card-bg));
  color: var(--vscode-descriptionForeground);
  font-size: 0.8em;
  line-height: 1.5;
}`;

const FOOTER_STYLE_BLOCK = `.footer {
  margin-top: 32px;
  padding-top: 16px;
  border-top: 1px solid var(--card-border);
  color: var(--vscode-descriptionForeground);
  font-size: 0.8em;
  text-align: center;
}

.footer a {
  color: var(--vscode-textLink-foreground);
  text-decoration: none;
}

.footer a:hover { text-decoration: underline; }`;

const STYLE_BLOCKS = [
  ROOT_STYLE_BLOCK,
  HEADER_STYLE_BLOCK,
  PROVIDER_CARD_STYLE_BLOCK,
  CONTROL_STYLE_BLOCK,
  SETTINGS_SECTION_STYLE_BLOCK,
  SETTINGS_NOTE_STYLE_BLOCK,
  FOOTER_STYLE_BLOCK,
];

function joinBlocks(blocks: string[]): string {
  return blocks.join('\n\n');
}

export function getSettingsWebviewStyles(): string {
  return joinBlocks(STYLE_BLOCKS);
}
