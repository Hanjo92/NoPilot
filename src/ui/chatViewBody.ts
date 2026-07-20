export function getChatViewBody(): string {
  return `<div class="chat-shell">
  <header class="chat-header">
    <div class="chat-header-copy">
      <p class="eyebrow">NoPilot Chat</p>
      <h1 id="panelTitle">Agent Mode</h1>
      <p id="modeLead" class="chat-header-lead">Plan changes, inspect context, and draft code with workspace-aware prompts.</p>
      <div class="mode-switch" role="tablist" aria-label="NoPilot chat mode">
        <button id="askModeButton" class="mode-chip" type="button" data-mode="ask" aria-pressed="false">Ask</button>
        <button id="agentModeButton" class="mode-chip active" type="button" data-mode="agent" aria-pressed="true">Agent</button>
      </div>
    </div>
    <div class="chat-header-actions">
      <button id="refreshConnectionButton" class="secondary" type="button">Refresh Connection</button>
      <button id="clearChatButton" class="secondary" type="button">New Chat</button>
    </div>
  </header>

  <section class="status-panel">
    <div class="status-card">
      <span class="status-label">Provider</span>
      <strong id="providerLabel">Loading...</strong>
      <p id="providerDescription" class="status-copy"></p>
    </div>
    <div class="status-card">
      <span class="status-label">Mode</span>
      <strong id="modeLabel">Agent</strong>
      <p id="modeDescription" class="status-copy"></p>
    </div>
    <div class="status-card">
      <span class="status-label">Context</span>
      <strong id="contextLabel">No active editor</strong>
      <p id="contextDescription" class="status-copy"></p>
    </div>
  </section>

  <section id="errorBanner" class="error-banner hidden" role="alert"></section>
  <section id="emptyState" class="empty-state">
    <strong id="emptyStateTitle">Agent mode is ready.</strong>
    <p id="emptyStateDescription">Ask NoPilot to inspect the current file, plan a refactor, or draft the next code change.</p>
  </section>
  <section id="chatTranscript" class="chat-transcript" aria-live="polite"></section>

  <form id="chatComposer" class="chat-composer">
    <label id="composerLabel" class="composer-label" for="chatPrompt">Request</label>
    <textarea
      id="chatPrompt"
      rows="5"
      placeholder="Ask NoPilot Agent to inspect the current file, plan edits, or draft code using the active workspace context."
    ></textarea>
    <div class="composer-actions">
      <p id="composerHint" class="composer-hint">Enter to run. Shift+Enter for a new line.</p>
      <button id="sendButton" class="primary" type="submit">Run Agent</button>
    </div>
  </form>
</div>`;
}
