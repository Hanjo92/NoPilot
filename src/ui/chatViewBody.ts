export function getChatViewBody(): string {
  return `<div class="chat-shell">
  <header class="chat-header">
    <div>
      <p class="eyebrow">NoPilot Chat</p>
      <h1>Agent Panel</h1>
    </div>
    <button id="clearChatButton" class="secondary" type="button">New Chat</button>
  </header>

  <section class="status-panel">
    <div class="status-card">
      <span class="status-label">Provider</span>
      <strong id="providerLabel">Loading...</strong>
      <p id="providerDescription" class="status-copy"></p>
    </div>
    <div class="status-card">
      <span class="status-label">Context</span>
      <strong id="contextLabel">No active editor</strong>
      <p id="contextDescription" class="status-copy"></p>
    </div>
  </section>

  <section id="errorBanner" class="error-banner hidden" role="alert"></section>
  <section id="emptyState" class="empty-state">
    <p>Ask about the current file, selection, or next code change.</p>
  </section>
  <section id="chatTranscript" class="chat-transcript" aria-live="polite"></section>

  <form id="chatComposer" class="chat-composer">
    <label class="composer-label" for="chatPrompt">Prompt</label>
    <textarea
      id="chatPrompt"
      rows="5"
      placeholder="Ask NoPilot to explain, plan, review, or draft code using the current editor context."
    ></textarea>
    <div class="composer-actions">
      <p class="composer-hint">Enter to send. Shift+Enter for a new line.</p>
      <button id="sendButton" class="primary" type="submit">Send</button>
    </div>
  </form>
</div>`;
}
