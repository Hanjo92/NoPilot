export function getChatViewStyles(): string {
  return `:root {
  color-scheme: light dark;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  padding: 0;
  font-family: var(--vscode-font-family);
  color: var(--vscode-foreground);
  background:
    radial-gradient(circle at top, color-mix(in srgb, var(--vscode-textLink-foreground) 12%, transparent), transparent 45%),
    linear-gradient(180deg, var(--vscode-editor-background), color-mix(in srgb, var(--vscode-sideBar-background) 82%, black));
}

.chat-shell {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 16px;
}

.chat-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.eyebrow {
  margin: 0 0 4px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--vscode-textLink-foreground);
}

.chat-header h1 {
  margin: 0;
  font-size: 20px;
  line-height: 1.2;
}

.status-panel {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.status-card,
.empty-state,
.chat-message,
.chat-composer,
.error-banner {
  border: 1px solid color-mix(in srgb, var(--vscode-panel-border) 70%, transparent);
  border-radius: 16px;
  background: color-mix(in srgb, var(--vscode-editorWidget-background) 86%, transparent);
  box-shadow: 0 12px 40px color-mix(in srgb, black 12%, transparent);
}

.status-card {
  padding: 14px;
}

.status-label {
  display: block;
  margin-bottom: 6px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--vscode-descriptionForeground);
}

.status-copy {
  margin: 6px 0 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--vscode-descriptionForeground);
}

.error-banner {
  padding: 12px 14px;
  color: var(--vscode-errorForeground);
  border-color: color-mix(in srgb, var(--vscode-errorForeground) 40%, transparent);
}

.hidden {
  display: none;
}

.empty-state {
  padding: 18px;
  text-align: center;
  color: var(--vscode-descriptionForeground);
}

.chat-transcript {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.chat-message {
  overflow: hidden;
}

.chat-message.user {
  border-color: color-mix(in srgb, var(--vscode-textLink-foreground) 40%, transparent);
}

.chat-message.assistant {
  border-color: color-mix(in srgb, var(--vscode-terminal-ansiGreen) 30%, transparent);
}

.message-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  border-bottom: 1px solid color-mix(in srgb, var(--vscode-panel-border) 70%, transparent);
}

.message-role {
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.message-actions {
  display: flex;
  gap: 8px;
}

.message-content {
  margin: 0;
  padding: 14px;
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.6;
  overflow-x: auto;
}

.chat-composer {
  margin-top: auto;
  padding: 14px;
}

.composer-label {
  display: block;
  margin-bottom: 10px;
  font-size: 12px;
  font-weight: 700;
}

textarea {
  width: 100%;
  min-height: 120px;
  resize: vertical;
  padding: 12px;
  border-radius: 12px;
  border: 1px solid color-mix(in srgb, var(--vscode-input-border) 80%, transparent);
  background: var(--vscode-input-background);
  color: var(--vscode-input-foreground);
  font: inherit;
  line-height: 1.5;
}

textarea:focus,
button:focus {
  outline: 1px solid var(--vscode-focusBorder);
  outline-offset: 2px;
}

.composer-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 12px;
}

.composer-hint {
  margin: 0;
  font-size: 12px;
  color: var(--vscode-descriptionForeground);
}

button {
  appearance: none;
  border: 1px solid transparent;
  border-radius: 999px;
  padding: 8px 14px;
  font: inherit;
  cursor: pointer;
  transition: transform 120ms ease, opacity 120ms ease;
}

button:hover {
  transform: translateY(-1px);
}

button:disabled {
  cursor: default;
  opacity: 0.6;
  transform: none;
}

button.primary {
  color: var(--vscode-button-foreground);
  background: linear-gradient(135deg, var(--vscode-button-background), color-mix(in srgb, var(--vscode-button-background) 75%, white));
}

button.primary:hover {
  background: var(--vscode-button-hoverBackground);
}

button.secondary {
  color: var(--vscode-button-secondaryForeground);
  background: var(--vscode-button-secondaryBackground);
}

button.secondary:hover {
  background: var(--vscode-button-secondaryHoverBackground);
}

@media (max-width: 720px) {
  .chat-shell {
    padding: 12px;
  }

  .status-panel {
    grid-template-columns: 1fr;
  }

  .chat-header,
  .composer-actions,
  .message-meta {
    flex-direction: column;
    align-items: stretch;
  }

  .message-actions {
    justify-content: flex-end;
  }
}`;
}
