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
  });

  assert.match(presentation.text, /\$\(debug-pause\) \$\(sparkle\) OpenAI/);
  assert.match(presentation.tooltip, /paused because GitHub Copilot is active/);
});

test('getNoPilotStatusBarPresentation prioritizes disabled state over Copilot pause', () => {
  const presentation = getNoPilotStatusBarPresentation({
    displayName: 'OpenAI',
    providerName: 'OpenAI',
    model: '',
    inlineEnabled: false,
    pausedForCopilot: true,
  });

  assert.match(presentation.text, /\$\(circle-slash\) \$\(sparkle\) OpenAI/);
  assert.match(presentation.tooltip, /Inline suggestions: disabled/);
  assert.doesNotMatch(presentation.tooltip, /paused because GitHub Copilot is active/);
});

test('getNoPilotStatusBarPresentation shows remote Ollama request state', () => {
  const presentation = getNoPilotStatusBarPresentation({
    displayName: 'Ollama',
    providerName: 'Ollama',
    model: 'qwen2.5-coder:7b',
    inlineEnabled: true,
    pausedForCopilot: false,
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
    requestStatus: { kind: 'waiting' },
  });

  assert.match(presentation.text, /\$\(circle-slash\)/);
  assert.match(presentation.tooltip, /Inline suggestions: disabled/);
  assert.doesNotMatch(presentation.tooltip, /Requesting from remote Ollama/);
});
