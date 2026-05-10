import assert from 'node:assert/strict';
import test from 'node:test';
import { getNoPilotStatusBarPresentation } from './statusBarPresentation';

test('getNoPilotStatusBarPresentation shows paused state when Copilot is suppressing automatic inline', () => {
  const presentation = getNoPilotStatusBarPresentation({
    displayName: 'OpenAI',
    providerName: 'OpenAI',
    model: 'gpt-4o-mini',
    currentProviderRequests: 3,
    inlineEnabled: true,
    pausedForCopilot: true,
  });

  assert.match(presentation.text, /\$\(debug-pause\) \$\(sparkle\) OpenAI · 3 req/);
  assert.match(presentation.tooltip, /paused because GitHub Copilot is active/);
  assert.match(presentation.tooltip, /Usage this session: 3 requests/);
});

test('getNoPilotStatusBarPresentation prioritizes disabled state over Copilot pause', () => {
  const presentation = getNoPilotStatusBarPresentation({
    displayName: 'OpenAI',
    providerName: 'OpenAI',
    model: '',
    currentProviderRequests: 0,
    inlineEnabled: false,
    pausedForCopilot: true,
  });

  assert.match(presentation.text, /\$\(circle-slash\) \$\(sparkle\) OpenAI · 0 req/);
  assert.match(presentation.tooltip, /Inline suggestions: disabled/);
  assert.doesNotMatch(presentation.tooltip, /paused because GitHub Copilot is active/);
});

test('getNoPilotStatusBarPresentation shows remote Ollama request state', () => {
  const presentation = getNoPilotStatusBarPresentation({
    displayName: 'Ollama',
    providerName: 'Ollama',
    model: 'qwen2.5-coder:7b',
    currentProviderRequests: 9,
    mostUsedProvider: {
      providerName: 'Ollama',
      requestCount: 9,
    },
    inlineEnabled: true,
    pausedForCopilot: false,
    requestStatus: {
      kind: 'slow',
      providerId: 'ollama',
      providerName: 'Ollama',
      model: 'qwen2.5-coder:7b',
    },
  });

  assert.match(presentation.text, /\$\(sync~spin\) \$\(sparkle\) Ollama · 9 req/);
  assert.match(presentation.tooltip, /Slow response from model/);
  assert.match(presentation.tooltip, /Top provider: Ollama \(9 requests\)/);
});

test('getNoPilotStatusBarPresentation shows waiting Ollama request state', () => {
  const presentation = getNoPilotStatusBarPresentation({
    displayName: 'Ollama',
    providerName: 'Ollama',
    model: 'qwen2.5-coder:7b',
    currentProviderRequests: 4,
    inlineEnabled: true,
    pausedForCopilot: false,
    requestStatus: {
      kind: 'waiting',
      providerId: 'ollama',
      providerName: 'Ollama',
      model: 'qwen2.5-coder:7b',
    },
  });

  assert.match(presentation.text, /\$\(sync~spin\) \$\(sparkle\) Ollama · 4 req/);
  assert.match(presentation.tooltip, /Requesting from remote Ollama.../);
});

test('getNoPilotStatusBarPresentation keeps request state out of tooltip when Copilot is pausing', () => {
  const presentation = getNoPilotStatusBarPresentation({
    displayName: 'Ollama',
    providerName: 'Ollama',
    model: 'qwen2.5-coder:7b',
    currentProviderRequests: 1,
    inlineEnabled: true,
    pausedForCopilot: true,
    requestStatus: {
      kind: 'waiting',
      providerId: 'ollama',
      message: 'Requesting from remote Ollama...',
    },
  });

  assert.match(presentation.text, /\$\(debug-pause\) \$\(sparkle\) Ollama · 1 req/);
  assert.match(presentation.tooltip, /paused because GitHub Copilot is active for this language/);
  assert.doesNotMatch(presentation.tooltip, /Requesting from remote Ollama\.\.\./);
});

test('getNoPilotStatusBarPresentation tooltip has no blank lines without request status', () => {
  const presentation = getNoPilotStatusBarPresentation({
    displayName: 'Ollama',
    providerName: 'Ollama',
    model: 'qwen2.5-coder:7b',
    currentProviderRequests: 0,
    inlineEnabled: true,
    pausedForCopilot: false,
  });

  assert.doesNotMatch(presentation.tooltip, /\n\n/);
  assert.match(presentation.tooltip, /Click to select model/);
  assert.match(presentation.tooltip, /Top provider: none yet/);
});

test('getNoPilotStatusBarPresentation keeps disabled state above request state', () => {
  const presentation = getNoPilotStatusBarPresentation({
    displayName: 'Ollama',
    providerName: 'Ollama',
    model: 'qwen2.5-coder:7b',
    currentProviderRequests: 7,
    inlineEnabled: false,
    pausedForCopilot: false,
    requestStatus: { kind: 'waiting' },
  });

  assert.match(presentation.text, /\$\(circle-slash\).*7 req/);
  assert.match(presentation.tooltip, /Inline suggestions: disabled/);
  assert.doesNotMatch(presentation.tooltip, /Requesting from remote Ollama/);
});
