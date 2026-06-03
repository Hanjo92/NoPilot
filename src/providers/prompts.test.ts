import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCommitMessagePrompt, buildCompletionPrompt } from './prompts';

test('buildCompletionPrompt uses a leaner prompt for automatic inline requests', () => {
  const prompt = buildCompletionPrompt({
    mode: 'automatic',
    prefix: 'const value = ',
    suffix: '',
    language: 'typescript',
    filename: 'example.ts',
    maxTokens: 96,
  });

  assert.match(prompt, /Complete the code at <CURSOR>/);
  assert.match(prompt, /Prefer the shortest correct completion/);
  assert.doesNotMatch(prompt, /RULES:/);
  assert.doesNotMatch(prompt, /logical completion \(a single expression, line, or block\)/);
});

test('buildCompletionPrompt includes current block context for automatic inline requests', () => {
  const prompt = buildCompletionPrompt({
    mode: 'automatic',
    prefix: 'const account = ',
    suffix: '',
    language: 'typescript',
    filename: 'example.ts',
    currentBlockContext: '{\n  const profile = createProfile();\n  <CURRENT_CURSOR>\n}',
    maxTokens: 96,
  });

  assert.match(prompt, /<CURRENT_BLOCK>/);
  assert.match(prompt, /Do not repeat code that already exists in <CURRENT_BLOCK>/);
  assert.match(prompt, /const profile = createProfile\(\);/);
});

test('buildCompletionPrompt keeps the fuller prompt for explicit inline requests', () => {
  const prompt = buildCompletionPrompt({
    mode: 'explicit',
    prefix: 'const value = ',
    suffix: '',
    language: 'typescript',
    filename: 'example.ts',
    maxTokens: 256,
  });

  assert.match(prompt, /RULES:/);
  assert.match(prompt, /logical completion \(a single expression, line, or block\)/);
});

test('buildCommitMessagePrompt uses preset format instructions when no custom prompt is configured', () => {
  const prompt = buildCommitMessagePrompt({
    diff: 'diff --git a/file.ts b/file.ts',
    language: 'en',
    format: 'conventional',
  });

  assert.match(prompt, /Follow the Conventional Commits format/);
  assert.match(prompt, /Write the message in English/);
  assert.match(prompt, /Diff:\ndiff --git a\/file\.ts b\/file\.ts/);
});

test('buildCommitMessagePrompt expands custom placeholders and skips preset format instructions', () => {
  const prompt = buildCommitMessagePrompt({
    diff: 'diff --git a/file.ts b/file.ts',
    language: 'ko',
    format: 'simple',
    customPrompt: 'Write the message in {{language}}. Review this diff:\n{{diff}}',
  });

  assert.match(prompt, /Follow the user's custom instructions exactly/);
  assert.match(prompt, /Write the message in Korean/);
  assert.match(prompt, /Review this diff:\ndiff --git a\/file\.ts b\/file\.ts/);
  assert.doesNotMatch(prompt, /Write a simple, clear commit message/);
  assert.doesNotMatch(prompt, /Follow the Conventional Commits format/);
});
