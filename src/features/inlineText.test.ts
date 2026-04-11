import assert from 'node:assert/strict';
import test from 'node:test';
import {
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
