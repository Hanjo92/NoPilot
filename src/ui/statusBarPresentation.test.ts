import assert from 'node:assert/strict';
import test from 'node:test';
import { getNoPilotStatusBarPresentation } from './statusBarPresentation';

test('getNoPilotStatusBarPresentation shows paused state when Copilot is suppressing automatic inline', () => {
  const presentation = getNoPilotStatusBarPresentation({
    displayName: 'OpenAI',
    providerName: 'OpenAI',
    model: 'gpt-4o-mini',
    inlineEnabled: true,
    pausedForCopilot: true,
    currentProviderRequests: 4,
    mostUsedProviderName: 'OpenAI',
    mostUsedProviderRequests: 4,
  });

  assert.match(presentation.text, /\$\(debug-pause\) \$\(sparkle\) OpenAI · 4 req/);
  assert.match(presentation.tooltip, /paused because GitHub Copilot is active/);
  assert.match(presentation.tooltip, /Requests: 4/);
});

test('getNoPilotStatusBarPresentation prioritizes disabled state over Copilot pause', () => {
  const presentation = getNoPilotStatusBarPresentation({
    displayName: 'OpenAI',
    providerName: 'OpenAI',
    model: '',
    inlineEnabled: false,
    pausedForCopilot: true,
    currentProviderRequests: 0,
    mostUsedProviderRequests: 0,
  });

  assert.match(presentation.text, /\$\(circle-slash\) \$\(sparkle\) OpenAI · 0 req/);
  assert.match(presentation.tooltip, /Inline suggestions: disabled/);
  assert.doesNotMatch(presentation.tooltip, /paused because GitHub Copilot is active/);
  assert.match(presentation.tooltip, /Most used: None yet/);
});

test('getNoPilotStatusBarPresentation shows remote Ollama request state', () => {
  const presentation = getNoPilotStatusBarPresentation({
    displayName: 'Ollama',
    providerName: 'Ollama',
    model: 'qwen2.5-coder:7b',
    inlineEnabled: true,
    pausedForCopilot: false,
    currentProviderRequests: 9,
    mostUsedProviderName: 'Ollama',
    mostUsedProviderRequests: 9,
    requestStatus: {
      kind: 'slow',
      providerId: 'ollama',
      providerName: 'Ollama',
      model: 'qwen2.5-coder:7b',
    },
  });

  assert.match(presentation.text, /\$\(sync~spin\) \$\(sparkle\) Ollama/);
  assert.match(presentation.tooltip, /Slow response from model/);
});

test('getNoPilotStatusBarPresentation shows waiting Ollama request state', () => {
  const presentation = getNoPilotStatusBarPresentation({
    displayName: 'Ollama',
    providerName: 'Ollama',
    model: 'qwen2.5-coder:7b',
    inlineEnabled: true,
    pausedForCopilot: false,
    currentProviderRequests: 2,
    mostUsedProviderName: 'Ollama',
    mostUsedProviderRequests: 5,
    requestStatus: {
      kind: 'waiting',
      providerId: 'ollama',
      providerName: 'Ollama',
      model: 'qwen2.5-coder:7b',
    },
  });

  assert.match(presentation.text, /\$\(sync~spin\) \$\(sparkle\) Ollama/);
  assert.match(presentation.tooltip, /Requesting from remote Ollama.../);
});

test('getNoPilotStatusBarPresentation keeps request state out of tooltip when Copilot is pausing', () => {
  const presentation = getNoPilotStatusBarPresentation({
    displayName: 'Ollama',
    providerName: 'Ollama',
    model: 'qwen2.5-coder:7b',
    inlineEnabled: true,
    pausedForCopilot: true,
    currentProviderRequests: 2,
    mostUsedProviderName: 'Ollama',
    mostUsedProviderRequests: 5,
    requestStatus: {
      kind: 'waiting',
      providerId: 'ollama',
      message: 'Requesting from remote Ollama...',
    },
  });

  assert.match(presentation.text, /\$\(debug-pause\) \$\(sparkle\) Ollama/);
  assert.match(presentation.tooltip, /paused because GitHub Copilot is active for this language/);
  assert.doesNotMatch(presentation.tooltip, /Requesting from remote Ollama\.\.\./);
});

test('getNoPilotStatusBarPresentation tooltip has no blank lines without request status', () => {
  const presentation = getNoPilotStatusBarPresentation({
    displayName: 'Ollama',
    providerName: 'Ollama',
    model: 'qwen2.5-coder:7b',
    inlineEnabled: true,
    pausedForCopilot: false,
    currentProviderRequests: 0,
    mostUsedProviderRequests: 0,
  });

  assert.doesNotMatch(presentation.tooltip, /\n\n/);
});

test('getNoPilotStatusBarPresentation keeps disabled state above request state', () => {
  const presentation = getNoPilotStatusBarPresentation({
    displayName: 'Ollama',
    providerName: 'Ollama',
    model: 'qwen2.5-coder:7b',
    inlineEnabled: false,
    pausedForCopilot: false,
    currentProviderRequests: 1,
    mostUsedProviderName: 'Ollama',
    mostUsedProviderRequests: 1,
    requestStatus: { kind: 'waiting' },
  });

  assert.match(presentation.text, /\$\(circle-slash\)/);
  assert.match(presentation.tooltip, /Inline suggestions: disabled/);
  assert.doesNotMatch(presentation.tooltip, /Requesting from remote Ollama/);
});
