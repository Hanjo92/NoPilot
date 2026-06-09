const CHAT_VIEW_SCRIPT = `const vscode = acquireVsCodeApi();
let currentState = null;

window.addEventListener('message', event => {
  const message = event.data;

  if (message.command === 'updateState') {
    currentState = message.state;
    render(currentState);
  }
});

document.getElementById('chatComposer').addEventListener('submit', event => {
  event.preventDefault();
  submitPrompt();
});

document.getElementById('clearChatButton').addEventListener('click', () => {
  vscode.postMessage({ command: 'clearChat' });
});

document.getElementById('chatTranscript').addEventListener('click', event => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }

  const action = target.dataset.action;
  const messageId = target.dataset.messageId;
  if (!action || !messageId) {
    return;
  }

  vscode.postMessage({ command: 'applyResponse', messageId, mode: action });
});

document.getElementById('chatPrompt').addEventListener('keydown', event => {
  if (event.key !== 'Enter' || event.shiftKey) {
    return;
  }

  event.preventDefault();
  submitPrompt();
});

vscode.postMessage({ command: 'requestState' });

function submitPrompt() {
  const textarea = document.getElementById('chatPrompt');
  if (!(textarea instanceof HTMLTextAreaElement)) {
    return;
  }

  const prompt = textarea.value.trim();
  if (!prompt || currentState?.isPending) {
    return;
  }

  vscode.postMessage({ command: 'submitChat', prompt });
  textarea.value = '';
}

function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function render(state) {
  renderHeader(state);
  renderError(state.errorMessage);
  renderTranscript(state);
  renderComposer(state.isPending);
}

function renderHeader(state) {
  document.getElementById('providerLabel').textContent = state.providerLabel;
  document.getElementById('providerDescription').textContent = state.providerDescription;
  document.getElementById('contextLabel').textContent = state.contextLabel;
  document.getElementById('contextDescription').textContent = state.contextDescription;
}

function renderError(errorMessage) {
  const banner = document.getElementById('errorBanner');
  banner.textContent = errorMessage || '';
  banner.classList.toggle('hidden', !errorMessage);
}

function renderTranscript(state) {
  const transcript = document.getElementById('chatTranscript');
  const emptyState = document.getElementById('emptyState');

  if (!state.messages.length) {
    transcript.innerHTML = '';
    emptyState.classList.remove('hidden');
    return;
  }

  emptyState.classList.add('hidden');
  transcript.innerHTML = state.messages.map(renderMessage).join('');
}

function renderMessage(message) {
  const actionButtons = message.role === 'assistant' && !message.pending
    ? '<div class="message-actions">'
      + '<button class="secondary" type="button" data-action="insert" data-message-id="' + message.id + '">Insert</button>'
      + '<button class="secondary" type="button" data-action="replace" data-message-id="' + message.id + '">Replace Selection</button>'
      + '</div>'
    : '';
  const label = message.pending ? 'Assistant · Thinking' : message.role === 'user' ? 'User' : 'Assistant';

  return '<article class="chat-message ' + message.role + '">'
    + '<div class="message-meta">'
    + '  <span class="message-role">' + label + '</span>'
    + actionButtons
    + '</div>'
    + '<pre class="message-content">' + escapeHtml(message.content) + '</pre>'
    + '</article>';
}

function renderComposer(isPending) {
  const textarea = document.getElementById('chatPrompt');
  const button = document.getElementById('sendButton');
  const clearButton = document.getElementById('clearChatButton');

  if (!(textarea instanceof HTMLTextAreaElement) || !(button instanceof HTMLButtonElement) || !(clearButton instanceof HTMLButtonElement)) {
    return;
  }

  textarea.disabled = isPending;
  button.disabled = isPending;
  clearButton.disabled = isPending;
  button.textContent = isPending ? 'Thinking...' : 'Send';
}`;

export function getChatViewScript(): string {
  return CHAT_VIEW_SCRIPT;
}
