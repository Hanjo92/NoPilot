const SCRIPT_BOOTSTRAP_BLOCK = `const vscode = acquireVsCodeApi();
let currentState = null;
let ollamaRefreshPending = false;
let pendingOllamaEndpoint = '';
let interactionHandlersBound = false;

window.addEventListener('message', event => {
  const message = event.data;
  if (message.command === 'updateState') {
    currentState = message.state;
    ollamaRefreshPending = false;
    pendingOllamaEndpoint = '';
    render(currentState);
    return;
  }

  if (message.command === 'resetOllamaRefreshPending') {
    setOllamaRefreshPending(false, '');
  }
});

ensureInteractionHandlersBound();
vscode.postMessage({ command: 'requestState' });

function render(state) {
  renderProviders(state.providers, state.activeProviderId);
  renderProviderUsageSummary(state);
  renderInlineSettings(state.settings);
  renderOllamaSettings(state);
  renderCommitSettings(state.settings);
}`;

const SCRIPT_PROVIDER_HELPER_BLOCK = `function getProviderStatusBadge(provider, isActive) {
  if (isActive && provider.status === 'ready') {
    return '<span class="badge active">✓ Active</span>';
  }

  if (provider.status === 'needs-key') {
    return '<span class="badge needs-key">'
      + (isActive ? '⚠ Active · Key needed' : '🔑 Key needed')
      + '</span>';
  }

  if (provider.status === 'unavailable') {
    return '<span class="badge unavailable">'
      + (isActive ? '⚠ Active · Unavailable' : 'Unavailable')
      + '</span>';
  }

  return '<span class="badge">Ready</span>';
}

function getProviderModelControl(provider) {
  if (provider.availableModels.length === 0) {
    return '<span style="opacity:0.5">' + (provider.currentModel || 'Auto-detect') + '</span>';
  }

  return '<select data-model-provider-id="' + provider.id + '">'
    + provider.availableModels.map(model =>
        '<option value="' + model + '"' + (model === provider.currentModel ? ' selected' : '') + '>' + model + '</option>'
      ).join('')
    + '</select>';
}

function getProviderActionsMarkup(provider, isActive) {
  let actions = '';

  if (!isActive && provider.status === 'ready') {
    actions += '<button class="primary" data-action="switchProvider" data-provider-id="' + provider.id + '">Activate</button>';
  }

  if (!provider.requiresApiKey) {
    return actions;
  }

  if (provider.hasApiKey) {
    actions += '<button class="secondary" data-action="setApiKey" data-provider-id="' + provider.id + '">Change Key</button>';
    actions += '<button class="danger" data-action="removeApiKey" data-provider-id="' + provider.id + '">Remove</button>';
    return actions;
  }

  actions += '<button class="primary" data-action="setApiKey" data-provider-id="' + provider.id + '">Set API Key</button>';
  return actions;
}

function formatRequestCount(count) {
  return count + ' request' + (count === 1 ? '' : 's');
}

function formatUsagePercent(requestCount, totalRequests) {
  if (totalRequests <= 0) {
    return '0%';
  }

  const rawPercent = (requestCount / totalRequests) * 100;
  const roundedPercent = rawPercent >= 10 ? Math.round(rawPercent) : Math.round(rawPercent * 10) / 10;
  const normalizedPercent = Number.isInteger(roundedPercent)
    ? String(roundedPercent)
    : roundedPercent.toFixed(1).replace(/\\.0$/, '');

  return normalizedPercent + '%';
}

function getProviderUsageColor(providerId) {
  const usageColors = {
    'vscode-lm': 'var(--usage-vscode-lm)',
    anthropic: 'var(--usage-anthropic)',
    openai: 'var(--usage-openai)',
    gemini: 'var(--usage-gemini)',
    ollama: 'var(--usage-ollama)',
  };

  return usageColors[providerId] || 'var(--usage-fallback)';
}

function getProviderUsageMarkup(provider) {
  return '<div class="card-usage">'
    + '  <span class="usage-label">Usage</span>'
    + '  <span class="usage-value">' + formatRequestCount(provider.requestCount) + '</span>'
    + (provider.isMostUsed ? '<span class="usage-badge">Top</span>' : '')
    + '</div>';
}

function renderProviderCard(provider, activeId) {
  const isActive = provider.id === activeId;
  const statusBadge = getProviderStatusBadge(provider, isActive);
  const modelControl = getProviderModelControl(provider);
  const actions = getProviderActionsMarkup(provider, isActive);
  const usage = getProviderUsageMarkup(provider);

  return '<div class="provider-card' + (isActive ? ' active' : '') + '">'
    + '<div class="card-header">'
    + '  <div class="card-title"><span class="card-icon">' + provider.icon + '</span> ' + provider.name + '</div>'
    + '  ' + statusBadge
    + '</div>'
    + '<div class="card-desc">' + provider.description + '</div>'
    + '<div class="card-model">'
    + '  <label>Model</label>'
    + '  ' + modelControl
    + '</div>'
    + usage
    + '<div class="card-actions">' + actions + '</div>'
    + '</div>';
}`;

const SCRIPT_PROVIDER_RENDER_BLOCK = `function renderProviders(providers, activeId) {
  const grid = document.getElementById('providerGrid');
  grid.innerHTML = providers.map(provider => renderProviderCard(provider, activeId)).join('');
}

function getProviderUsageChartMarkup(providers, totalRequests) {
  let startDegrees = 0;
  const segments = providers
    .filter(provider => provider.requestCount > 0)
    .map(provider => {
      const segmentDegrees = (provider.requestCount / totalRequests) * 360;
      const endDegrees = startDegrees + segmentDegrees;
      const segment = getProviderUsageColor(provider.id)
        + ' '
        + startDegrees.toFixed(1)
        + 'deg '
        + endDegrees.toFixed(1)
        + 'deg';
      startDegrees = endDegrees;
      return segment;
    });

  const gradient = segments.length > 0
    ? 'conic-gradient(' + segments.join(', ') + ')'
    : 'var(--usage-track)';

  return '<div class="usage-chart-shell">'
    + '<div class="usage-chart" style="background:' + gradient + ';">'
    + '  <div class="usage-chart-hole">'
    + '    <span class="usage-chart-total-label">Total</span>'
    + '    <strong class="usage-chart-total-value">' + totalRequests + '</strong>'
    + '  </div>'
    + '</div>'
    + '<div class="usage-chart-caption">Request share by provider</div>'
    + '</div>';
}

function getProviderUsageLegendMarkup(providers, totalRequests) {
  return '<div class="usage-legend">'
    + providers.map(provider =>
        '<div class="usage-legend-item">'
        + '  <span class="usage-legend-label">'
        + '    <span class="usage-legend-dot" style="background:' + getProviderUsageColor(provider.id) + ';"></span>'
        + '    <span class="usage-legend-name">' + provider.icon + ' ' + provider.name + '</span>'
        + '  </span>'
        + '  <span class="usage-legend-metrics">'
        + '    <strong>' + formatUsagePercent(provider.requestCount, totalRequests) + '</strong>'
        + '    <span>' + formatRequestCount(provider.requestCount) + '</span>'
        + '  </span>'
        + '</div>'
      ).join('')
    + '</div>';
}

function getProviderUsageSummaryMarkup(state) {
  const currentProvider = state.providers.find(provider => provider.id === state.activeProviderId);
  const currentUsageLabel = currentProvider
    ? currentProvider.icon + ' ' + currentProvider.name + ' · ' + formatRequestCount(state.usage.currentProviderRequests)
    : formatRequestCount(state.usage.currentProviderRequests);
  const topProviderLabel = state.usage.mostUsedProvider
    ? state.usage.mostUsedProvider.providerIcon
      + ' '
      + state.usage.mostUsedProvider.providerName
      + ' · '
      + formatRequestCount(state.usage.mostUsedProvider.requestCount)
    : 'None yet';

  if (state.usage.totalRequests === 0) {
    return '<div class="provider-usage-summary empty">'
      + '<div class="usage-empty-state">No provider requests yet</div>'
      + '<div class="usage-summary-stats">'
      + '  <div class="usage-stat"><span class="usage-stat-label">Current provider</span><strong>' + currentUsageLabel + '</strong></div>'
      + '  <div class="usage-stat"><span class="usage-stat-label">Most used</span><strong>' + topProviderLabel + '</strong></div>'
      + '  <div class="usage-stat"><span class="usage-stat-label">Total</span><strong>' + formatRequestCount(state.usage.totalRequests) + '</strong></div>'
      + '</div>'
      + '<div class="usage-empty-copy">Start using NoPilot to see each provider&apos;s request share.</div>'
      + '</div>';
  }

  return '<div class="provider-usage-summary">'
    + getProviderUsageChartMarkup(state.providers, state.usage.totalRequests)
    + '<div class="usage-summary-stats">'
    + '  <div class="usage-stat"><span class="usage-stat-label">Current provider</span><strong>' + currentUsageLabel + '</strong></div>'
    + '  <div class="usage-stat"><span class="usage-stat-label">Most used</span><strong>' + topProviderLabel + '</strong></div>'
    + '  <div class="usage-stat"><span class="usage-stat-label">Total</span><strong>' + formatRequestCount(state.usage.totalRequests) + '</strong></div>'
    + '</div>'
    + getProviderUsageLegendMarkup(state.providers, state.usage.totalRequests)
    + '</div>';
}

function renderProviderUsageSummary(state) {
  const summary = document.getElementById('providerUsageSummary');
  summary.innerHTML = getProviderUsageSummaryMarkup(state);
}`;

const SCRIPT_SETTINGS_RENDER_BLOCK = `const COMMIT_LANGUAGE_OPTIONS = [
  { value: 'en', label: 'English' },
  { value: 'ko', label: '한국어' },
  { value: 'ja', label: '日本語' },
  { value: 'zh', label: '中文' },
  { value: 'es', label: 'Español' },
  { value: 'fr', label: 'Français' },
  { value: 'de', label: 'Deutsch' },
];

const COMMIT_FORMAT_OPTIONS = [
  { value: 'conventional', label: 'Conventional Commits' },
  { value: 'simple', label: 'Simple' },
];

const INLINE_QUALITY_PROFILE_OPTIONS = [
  { value: 'fast', label: 'Fast' },
  { value: 'balanced', label: 'Balanced' },
  { value: 'rich', label: 'Rich' },
];

const OLLAMA_REMOTE_MODE_OPTIONS = [
  { value: 'auto', label: 'Auto' },
  { value: 'forced-on', label: 'Forced On' },
  { value: 'forced-off', label: 'Forced Off' },
];

const INLINE_SETTING_DEFINITIONS = [
  {
    label: 'Enabled',
    description: 'Enable inline code suggestions',
    type: 'toggle',
    key: 'inline.enabled',
    valueKey: 'inlineEnabled',
  },
  {
    label: 'Quality Profile',
    description: 'Choose between lower latency, balanced defaults, or richer context for automatic suggestions',
    type: 'select',
    key: 'inline.qualityProfile',
    valueKey: 'qualityProfile',
    options: INLINE_QUALITY_PROFILE_OPTIONS,
  },
  {
    label: 'Pause for Copilot',
    description: 'Skip automatic NoPilot suggestions when GitHub Copilot is active for this language',
    type: 'toggle',
    key: 'inline.pauseWhenCopilotActive',
    valueKey: 'pauseWhenCopilotActive',
  },
  {
    label: 'Debounce',
    description: 'Delay before requesting completion (ms)',
    type: 'number',
    key: 'inline.debounceMs',
    valueKey: 'debounceMs',
    min: 100,
    max: 2000,
  },
  {
    label: 'Prefix Lines',
    description: 'Lines of code before cursor for context',
    type: 'number',
    key: 'inline.maxPrefixLines',
    valueKey: 'maxPrefixLines',
    min: 5,
    max: 200,
  },
  {
    label: 'Suffix Lines',
    description: 'Lines of code after cursor for context',
    type: 'number',
    key: 'inline.maxSuffixLines',
    valueKey: 'maxSuffixLines',
    min: 0,
    max: 100,
  },
];

function getInlineSettingControl(definition, settings) {
  const value = settings[definition.valueKey];

  if (definition.type === 'toggle') {
    return toggleSwitch(definition.key, value);
  }

  if (definition.type === 'select') {
    return selectInput(definition.key, value, definition.options);
  }

  return numberInput(definition.key, value, definition.min, definition.max);
}

function getInlineSettingsMarkup(settings) {
  return renderSettingRows(INLINE_SETTING_DEFINITIONS.map(definition => ({
    label: definition.label,
    description: definition.description,
    control: getInlineSettingControl(definition, settings),
  })));
}

function getCommitSettingsMarkup(settings) {
  return renderSettingRows([
    {
      label: 'Language',
      description: 'Commit message language',
      control: selectInput('commitMessage.language', settings.commitLanguage, COMMIT_LANGUAGE_OPTIONS),
    },
    {
      label: 'Format',
      description: 'Commit message format',
      control: selectInput('commitMessage.format', settings.commitFormat, COMMIT_FORMAT_OPTIONS),
    },
  ]);
}

function getOllamaProvider(state) {
  return state.providers.find(provider => provider.id === 'ollama') || null;
}

function getOllamaStatusMarkup(state) {
  const provider = getOllamaProvider(state);

  if (!provider) {
    return '';
  }

  const count = provider.availableModels.length;
  const selected = provider.currentModel || 'None';
  const status = provider.status === 'ready'
    ? count + ' completion model' + (count === 1 ? '' : 's') + ' loaded'
    : 'Unable to load completion models';

  return '<div class="settings-note ollama-status-note">'
    + '<strong>Status:</strong> ' + status
    + ' · <strong>Selected:</strong> ' + selected
    + '</div>';
}

function getOllamaModelPreviewMarkup(state) {
  const provider = getOllamaProvider(state);

  if (!provider || provider.availableModels.length === 0) {
    return '';
  }

  const previewModels = provider.availableModels.slice(0, 6);
  const remainingCount = provider.availableModels.length - previewModels.length;
  const suffix = remainingCount > 0 ? ' +' + remainingCount + ' more' : '';

  return '<div class="settings-note ollama-model-preview">'
    + '<strong>Models from endpoint:</strong> '
    + previewModels.join(', ')
    + suffix
    + '</div>';
}

function getOllamaSettingsMarkup(state) {
  const settings = state.settings;
  const provider = getOllamaProvider(state);
  const endpointValue = ollamaRefreshPending && pendingOllamaEndpoint
    ? pendingOllamaEndpoint
    : settings.ollamaEndpoint;
  const readyLabel = provider && provider.availableModels.length > 0
    ? 'Apply & Refresh (' + provider.availableModels.length + ')'
    : 'Apply & Refresh';
  const buttonLabel = ollamaRefreshPending ? 'Refreshing...' : readyLabel;

  return getOllamaStatusMarkup(state)
    + getOllamaModelPreviewMarkup(state)
    + renderSettingRows([
    {
      label: 'Endpoint',
      description: 'HTTP endpoint for your local or remote Ollama server',
      control: ollamaEndpointControl(endpointValue, buttonLabel),
    },
    {
      label: 'Remote Mode',
      description: 'Optimize inline suggestions for remote Ollama latency',
      control: selectInput('ollama.remoteMode', settings.ollamaRemoteMode, OLLAMA_REMOTE_MODE_OPTIONS),
    },
  ]);
}

function renderInlineSettings(settings) {
  const container = document.getElementById('inlineSettings');
  container.innerHTML = getInlineSettingsMarkup(settings);
}

function renderOllamaSettings(state) {
  const container = document.getElementById('ollamaSettings');
  container.innerHTML = getOllamaSettingsMarkup(state);
}

function renderCommitSettings(settings) {
  const container = document.getElementById('commitSettings');
  container.innerHTML = getCommitSettingsMarkup(settings);
}`;

const SCRIPT_INPUT_HELPER_BLOCK = `function renderSettingRows(rows) {
  return rows.map(row => settingRow(row.label, row.description, row.control)).join('');
}

function settingRow(label, desc, control) {
  return '<div class="setting-row">'
    + '<div class="setting-label">'
    + '  <span class="label-text">' + label + '</span>'
    + '  <span class="label-desc">' + desc + '</span>'
    + '</div>'
    + '<div class="setting-control">' + control + '</div>'
    + '</div>';
}

function toggleSwitch(key, checked) {
  return '<label class="toggle">'
    + '<input type="checkbox"' + (checked ? ' checked' : '')
    + ' data-setting-key="' + key + '">'
    + '<span class="slider"></span></label>';
}

function numberInput(key, value, min, max) {
  return '<input type="number" value="' + value + '" min="' + min + '" max="' + max + '"'
    + ' data-setting-key="' + key + '">';
}

function ollamaEndpointControl(value, buttonLabel) {
  return '<div class="ollama-endpoint-control">'
    + '<input id="ollamaEndpointInput" type="text" value="' + value + '" placeholder="http://localhost:11434"'
    + ' data-setting-key="ollama.endpoint">'
    + '<button class="primary" data-action="refreshOllama">' + buttonLabel + '</button>'
    + '</div>';
}

function textInput(key, value, placeholder) {
  return '<input type="text" value="' + value + '" placeholder="' + placeholder + '"'
    + ' data-setting-key="' + key + '">';
}

function clampNumberInputValue(value, min, max) {
  let nextValue = value;

  if (Number.isFinite(min)) {
    nextValue = Math.max(nextValue, min);
  }

  if (Number.isFinite(max)) {
    nextValue = Math.min(nextValue, max);
  }

  return nextValue;
}

function selectInput(key, value, options) {
  return '<select data-setting-key="' + key + '">'
    + options.map(o =>
        '<option value="' + o.value + '"' + (o.value === value ? ' selected' : '') + '>'
        + o.label + '</option>'
      ).join('')
    + '</select>';

}

function setOllamaRefreshPending(pending, endpointValue) {
  ollamaRefreshPending = pending;
  pendingOllamaEndpoint = pending ? (endpointValue || '') : '';
  if (currentState) {
    render(currentState);
  }
}`;

const SCRIPT_ACTION_BLOCK = `function switchProvider(id)  { vscode.postMessage({ command: 'switchProvider', providerId: id }); }
function setApiKey(id)       { vscode.postMessage({ command: 'setApiKey', providerId: id }); }
function removeApiKey(id)    { vscode.postMessage({ command: 'removeApiKey', providerId: id }); }
function updateModel(id, m)  { vscode.postMessage({ command: 'updateModel', providerId: id, model: m }); }
function updateSetting(k, v) { vscode.postMessage({ command: 'updateSetting', key: k, value: v }); }`;

const SCRIPT_INTERACTION_BLOCK = `function ensureInteractionHandlersBound() {
  if (interactionHandlersBound) {
    return;
  }

  interactionHandlersBound = true;

  document.addEventListener('click', event => {
    if (!(event.target instanceof Element)) {
      return;
    }

    const actionElement = event.target.closest('[data-action]');
    if (!(actionElement instanceof HTMLElement)) {
      return;
    }

    const { action, providerId } = actionElement.dataset;

    if (action === 'switchProvider' && providerId) {
      switchProvider(providerId);
      return;
    }

    if (action === 'setApiKey' && providerId) {
      setApiKey(providerId);
      return;
    }

    if (action === 'removeApiKey' && providerId) {
      removeApiKey(providerId);
      return;
    }

    if (action === 'refreshOllama') {
      refreshOllama();
    }
  });

  document.addEventListener('change', event => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) {
      return;
    }

    const modelProviderId = target.dataset.modelProviderId;
    if (modelProviderId) {
      updateModel(modelProviderId, target.value);
      return;
    }

    const settingKey = target.dataset.settingKey;
    if (!settingKey || settingKey === 'ollama.endpoint') {
      return;
    }

    if (target instanceof HTMLInputElement && target.type === 'checkbox') {
      updateSetting(settingKey, target.checked);
      return;
    }

    if (target instanceof HTMLInputElement && target.type === 'number') {
      const parsedValue = parseInt(target.value, 10);
      if (Number.isNaN(parsedValue)) {
        return;
      }

      const min = target.min ? parseInt(target.min, 10) : Number.NaN;
      const max = target.max ? parseInt(target.max, 10) : Number.NaN;
      const normalizedValue = clampNumberInputValue(parsedValue, min, max);
      if (target.value !== String(normalizedValue)) {
        target.value = String(normalizedValue);
      }

      updateSetting(settingKey, normalizedValue);
      return;
    }

    updateSetting(settingKey, target.value.trim());
  });

  document.addEventListener('keydown', event => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) {
      return;
    }

    if (target.id === 'ollamaEndpointInput' && event.key === 'Enter') {
      event.preventDefault();
      refreshOllama();
    }
  });
}

function getOllamaEndpointValue() {
  const input = document.getElementById('ollamaEndpointInput');
  return input ? input.value.trim() : '';
}

function refreshOllama() {
  const endpoint = getOllamaEndpointValue();
  setOllamaRefreshPending(true, endpoint);
  vscode.postMessage({
    command: 'refreshOllama',
    endpoint,
  });
}`;

const SCRIPT_BLOCKS = [
  SCRIPT_BOOTSTRAP_BLOCK,
  SCRIPT_PROVIDER_HELPER_BLOCK,
  SCRIPT_PROVIDER_RENDER_BLOCK,
  SCRIPT_SETTINGS_RENDER_BLOCK,
  SCRIPT_INPUT_HELPER_BLOCK,
  SCRIPT_ACTION_BLOCK,
  SCRIPT_INTERACTION_BLOCK,
];

function joinBlocks(blocks: string[]): string {
  return blocks.join('\n\n');
}

export function getSettingsWebviewScript(): string {
  return joinBlocks(SCRIPT_BLOCKS);
}
