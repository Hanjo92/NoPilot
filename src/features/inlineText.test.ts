import assert from 'node:assert/strict';
import test from 'node:test';
import {
  cleanInlineCompletionText,
  extractReferencedWords,
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

test('getInlineRequestPolicy keeps automatic requests lean', async () => {
  const inlineText = await import('./inlineText');
  const policy = (inlineText as any).getInlineRequestPolicy({
    isAutomaticTrigger: true,
    lineText: 'const value = ',
    cursorCharacter: 14,
  });

  assert.deepEqual(policy, {
    skip: false,
    includeAdditionalContext: false,
    maxTokens: 96,
    maxPrefixLines: 20,
    maxSuffixLines: 8,
  });
});

test('getInlineRequestPolicy skips automatic requests on indent-only lines', async () => {
  const inlineText = await import('./inlineText');
  const policy = (inlineText as any).getInlineRequestPolicy({
    isAutomaticTrigger: true,
    lineText: '    ',
    cursorCharacter: 4,
  });

  assert.equal(policy.skip, true);
});

test('trimSingleLineCompletion keeps only the first line of a noisy completion', async () => {
  const inlineText = await import('./inlineText');
  const trimmed = (inlineText as any).trimSingleLineCompletion(
    'value + 1\nconsole.log(value);\nreturn value;'
  );

  assert.equal(trimmed, 'value + 1');
});

test('getInlineRequestPolicy preserves richer context for explicit requests', async () => {
  const inlineText = await import('./inlineText');
  const policy = (inlineText as any).getInlineRequestPolicy({
    isAutomaticTrigger: false,
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

test('buildInlineCacheScope separates provider and model variants', async () => {
  const inlineText = await import('./inlineText');

  assert.equal(
    (inlineText as any).buildInlineCacheScope('ollama', 'qwen2.5-coder:7b'),
    'ollama::qwen2.5-coder:7b'
  );
  assert.equal(
    (inlineText as any).buildInlineCacheScope('openai', ''),
    'openai::auto'
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

test('cleanInlineCompletionText removes trailing explanation after a code block', () => {
  const cleaned = cleanInlineCompletionText({
    text: 'if (ready) {\n  run();\n}\n\nExplanation: call run when ready.',
    prefix: '',
    suffix: '',
    stopSequences: undefined,
  });

  assert.equal(cleaned, 'if (ready) {\n  run();\n}');
});
