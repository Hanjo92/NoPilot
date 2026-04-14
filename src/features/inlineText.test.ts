import assert from 'node:assert/strict';
import test from 'node:test';
import {
  cleanInlineCompletionText,
  extractReferencedWords,
  getInlineRequestPolicy,
  getInlineStopSequences,
  sliceLines,
  stripMarkdownCodeFences,
} from './inlineText';

test('stripMarkdownCodeFences removes fenced wrapper from model output', () => {
  const cleaned = stripMarkdownCodeFences('```ts\nconst value = 1;\n```');

  assert.equal(cleaned, 'const value = 1;');
});

test('extractReferencedWords finds PascalCase symbols from recent prefix', () => {
  const words = extractReferencedWords('const model = new ShopModel();');

  assert.deepEqual(words, ['ShopModel']);
});

test('sliceLines splits on actual newline characters', () => {
  const snippet = sliceLines('zero\none\ntwo', 1, 2);

  assert.equal(snippet, 'one\ntwo');
});

test('getInlineStopSequences returns a real newline stop token', () => {
  const stopSequences = getInlineStopSequences('const value = computeResult()', 29);

  assert.deepEqual(stopSequences, ['\n']);
});

test('getInlineRequestPolicy keeps automatic requests lean without hidden same-file caps', async () => {
  const policy = getInlineRequestPolicy({
    isAutomaticTrigger: true,
    qualityProfile: 'balanced',
    lineText: 'const value = ',
    cursorCharacter: 14,
  });

  assert.deepEqual(policy, {
    skip: false,
    includeAdditionalContext: false,
    maxTokens: 96,
    maxPrefixLines: undefined,
    maxSuffixLines: undefined,
  });
});

test('getInlineRequestPolicy keeps fast profile conservative on indent-only lines', async () => {
  const policy = getInlineRequestPolicy({
    isAutomaticTrigger: true,
    qualityProfile: 'fast',
    lineText: '    ',
    cursorCharacter: 4,
  });

  assert.equal(policy.skip, true);
});

test('getInlineRequestPolicy allows balanced profile on ordinary indented blank lines', () => {
  const policy = getInlineRequestPolicy({
    isAutomaticTrigger: true,
    qualityProfile: 'balanced',
    lineText: '    ',
    cursorCharacter: 4,
  });

  assert.deepEqual(policy, {
    skip: false,
    includeAdditionalContext: false,
    maxTokens: 96,
    maxPrefixLines: undefined,
    maxSuffixLines: undefined,
  });
});

test('getInlineRequestPolicy skips automatic requests inside line comments', () => {
  const lineText = 'const value = 1; // explain the result';
  const policy = getInlineRequestPolicy({
    isAutomaticTrigger: true,
    qualityProfile: 'balanced',
    lineText,
    cursorCharacter: lineText.length,
  });

  assert.equal(policy.skip, true);
});

test('getInlineRequestPolicy skips automatic requests inside string literals', () => {
  const lineText = 'const message = "hel';
  const policy = getInlineRequestPolicy({
    isAutomaticTrigger: true,
    qualityProfile: 'balanced',
    lineText,
    cursorCharacter: lineText.length,
  });

  assert.equal(policy.skip, true);
});

test('getInlineRequestPolicy skips automatic requests inside import statements', () => {
  const lineText = 'import { readF';
  const policy = getInlineRequestPolicy({
    isAutomaticTrigger: true,
    qualityProfile: 'balanced',
    lineText,
    cursorCharacter: lineText.length,
  });

  assert.equal(policy.skip, true);
});

test('getInlineRequestPolicy skips automatic requests in low-signal chaining states', () => {
  const lineText = 'user?.';
  const policy = getInlineRequestPolicy({
    isAutomaticTrigger: true,
    qualityProfile: 'balanced',
    lineText,
    cursorCharacter: lineText.length,
  });

  assert.equal(policy.skip, true);
});

test('getInlineRequestPolicy makes fast profile more conservative', () => {
  const policy = getInlineRequestPolicy({
    isAutomaticTrigger: true,
    qualityProfile: 'fast',
    lineText: 'return ',
    cursorCharacter: 7,
  });

  assert.deepEqual(policy, {
    skip: false,
    includeAdditionalContext: false,
    maxTokens: 64,
    maxPrefixLines: undefined,
    maxSuffixLines: undefined,
  });
});

test('getInlineRequestPolicy lets rich profile complete on indented blank lines', () => {
  const policy = getInlineRequestPolicy({
    isAutomaticTrigger: true,
    qualityProfile: 'rich',
    lineText: '    ',
    cursorCharacter: 4,
  });

  assert.deepEqual(policy, {
    skip: false,
    includeAdditionalContext: true,
    maxTokens: 192,
    maxPrefixLines: undefined,
    maxSuffixLines: undefined,
  });
});

test('trimSingleLineCompletion keeps only the first line of a noisy completion', async () => {
  const inlineText = await import('./inlineText');
  const trimmed = (inlineText as any).trimSingleLineCompletion(
    'value + 1\nconsole.log(value);\nreturn value;'
  );

  assert.equal(trimmed, 'value + 1');
});

test('getInlineRequestPolicy preserves richer context for explicit requests', async () => {
  const policy = getInlineRequestPolicy({
    isAutomaticTrigger: false,
    qualityProfile: 'fast',
    lineText: '',
    cursorCharacter: 0,
  });

  assert.deepEqual(policy, {
    skip: false,
    includeAdditionalContext: true,
    maxTokens: 256,
    maxPrefixLines: undefined,
    maxSuffixLines: undefined,
  });
});

test('getInlineRequestPolicy keeps explicit requests available in filtered automatic contexts', () => {
  const lineText = 'import { readF';
  const policy = getInlineRequestPolicy({
    isAutomaticTrigger: false,
    qualityProfile: 'balanced',
    lineText,
    cursorCharacter: lineText.length,
  });

  assert.equal(policy.skip, false);
  assert.equal(policy.maxTokens, 256);
});

test('buildInlineCacheScope separates provider and model variants', async () => {
  const inlineText = await import('./inlineText');

  assert.equal(
    (inlineText as any).buildInlineCacheScope('ollama', 'qwen2.5-coder:7b', 'fast'),
    'ollama::qwen2.5-coder:7b::fast'
  );
  assert.equal(
    (inlineText as any).buildInlineCacheScope('openai', '', 'balanced'),
    'openai::auto::balanced'
  );
});

test('cleanInlineCompletionText removes conversational lead-in before code', () => {
  const cleaned = cleanInlineCompletionText({
    text: "Sure, here's the completion:\nvalue + 1",
    prefix: 'const next = ',
    suffix: ';',
    stopSequences: ['\n'],
  });

  assert.equal(cleaned, 'value + 1');
});

test('cleanInlineCompletionText keeps single-line code when provider prefixes a blank line', () => {
  const cleaned = cleanInlineCompletionText({
    text: '\nvalue + 1',
    prefix: 'const next = ',
    suffix: ';',
    stopSequences: ['\n'],
  });

  assert.equal(cleaned, 'value + 1');
});

test('cleanInlineCompletionText removes trailing explanation after a code block', () => {
  const cleaned = cleanInlineCompletionText({
    text: 'if (ready) {\n  run();\n}\n\nExplanation: call run when ready.',
    prefix: '',
    suffix: '',
    stopSequences: undefined,
  });

  assert.equal(cleaned, 'if (ready) {\n  run();\n}');
});

test('cleanInlineCompletionText removes duplicated structural suffix lines', () => {
  const cleaned = cleanInlineCompletionText({
    text: '  run();\n}',
    prefix: 'if (ready) {\n',
    suffix: '\n}',
    stopSequences: undefined,
  });

  assert.equal(cleaned, '  run();');
});

test('cleanInlineCompletionText trims obvious next statements after a completed block', () => {
  const cleaned = cleanInlineCompletionText({
    text: 'if (ready) {\n  run();\n}\n\nconst fallback = createFallback();',
    prefix: '',
    suffix: '',
    stopSequences: undefined,
  });

  assert.equal(cleaned, 'if (ready) {\n  run();\n}');
});
