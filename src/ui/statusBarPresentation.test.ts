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
