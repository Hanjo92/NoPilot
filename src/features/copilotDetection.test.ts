import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isCopilotEnabledForLanguage,
  shouldSkipNoPilotAutomaticInline,
} from './copilotDetection';

test('isCopilotEnabledForLanguage respects wildcard and language-specific overrides', () => {
  assert.equal(
    isCopilotEnabledForLanguage(
      { '*': true, markdown: false, typescript: true },
      'typescript'
    ),
    true
  );
  assert.equal(
    isCopilotEnabledForLanguage(
      { '*': true, markdown: false, typescript: true },
      'markdown'
    ),
    false
  );
  assert.equal(
    isCopilotEnabledForLanguage(
      { '*': false, typescript: true },
      'python'
    ),
    false
  );
});

test('isCopilotEnabledForLanguage falls back to enabled when config shape is missing', () => {
  assert.equal(isCopilotEnabledForLanguage(undefined, 'typescript'), true);
  assert.equal(isCopilotEnabledForLanguage(true, 'typescript'), true);
  assert.equal(isCopilotEnabledForLanguage('invalid', 'typescript'), true);
});

test('shouldSkipNoPilotAutomaticInline only pauses automatic requests when Copilot is likely active', () => {
  assert.equal(
    shouldSkipNoPilotAutomaticInline({
      isAutomaticTrigger: true,
      pauseWhenCopilotActive: true,
      editorInlineSuggestEnabled: true,
      copilotExtensionInstalled: true,
      copilotExtensionActive: true,
      copilotLanguageEnabled: true,
    }),
    true
  );

  assert.equal(
    shouldSkipNoPilotAutomaticInline({
      isAutomaticTrigger: false,
      pauseWhenCopilotActive: true,
      editorInlineSuggestEnabled: true,
      copilotExtensionInstalled: true,
      copilotExtensionActive: true,
      copilotLanguageEnabled: true,
    }),
    false
  );

  assert.equal(
    shouldSkipNoPilotAutomaticInline({
      isAutomaticTrigger: true,
      pauseWhenCopilotActive: false,
      editorInlineSuggestEnabled: true,
      copilotExtensionInstalled: true,
      copilotExtensionActive: true,
      copilotLanguageEnabled: true,
    }),
    false
  );

  assert.equal(
    shouldSkipNoPilotAutomaticInline({
      isAutomaticTrigger: true,
      pauseWhenCopilotActive: true,
      editorInlineSuggestEnabled: true,
      copilotExtensionInstalled: true,
      copilotExtensionActive: true,
      copilotLanguageEnabled: false,
    }),
    false
  );
});
