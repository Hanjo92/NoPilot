const HEADER_MARKUP_BLOCK = `<h1><span class="icon">⚡</span> NoPilot Settings</h1>
<p class="subtitle">Configure your AI providers and extension settings</p>`;

const PROVIDER_SECTION_MARKUP_BLOCK = `<h2>🔌 Providers</h2>
<div class="provider-grid" id="providerGrid">
  <!-- Dynamically populated -->
</div>`;

const INLINE_SECTION_MARKUP_BLOCK = `<h2>⚙ Inline Completion</h2>
<div class="settings-section" id="inlineSettings">
  <!-- Dynamically populated -->
</div>
<div class="settings-note">
  GitHub Copilot overlap detection is best-effort. NoPilot can pause automatic inline suggestions when Copilot is active for this language, but it cannot reliably detect Copilot quota exhaustion or sign-in expiry.
</div>`;

const OLLAMA_SECTION_MARKUP_BLOCK = `<h2>🦙 Ollama</h2>
<div class="settings-section" id="ollamaSettings">
  <!-- Dynamically populated -->
</div>`;

const COMMIT_SECTION_MARKUP_BLOCK = `<h2>💬 Commit Messages</h2>
<div class="settings-section" id="commitSettings">
  <!-- Dynamically populated -->
</div>`;

const FOOTER_MARKUP_BLOCK = `<div class="footer">
  NoPilot v0.1.0 — Replace Copilot with your preferred AI provider
</div>`;

const BODY_BLOCKS = [
  HEADER_MARKUP_BLOCK,
  PROVIDER_SECTION_MARKUP_BLOCK,
  INLINE_SECTION_MARKUP_BLOCK,
  OLLAMA_SECTION_MARKUP_BLOCK,
  COMMIT_SECTION_MARKUP_BLOCK,
  FOOTER_MARKUP_BLOCK,
];

function joinBlocks(blocks: string[]): string {
  return blocks.join('\n\n');
}

export function getSettingsWebviewBody(): string {
  return joinBlocks(BODY_BLOCKS);
}
