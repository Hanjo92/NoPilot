import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCompletionPrompt } from './prompts';

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
