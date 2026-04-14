import assert from 'node:assert/strict';
import test from 'node:test';
import { extractCurrentBlockContext } from './inlineBlockContext';

test('extractCurrentBlockContext captures the surrounding brace block with a cursor marker', () => {
  const source = `function buildUser() {
  const profile = createProfile();
  const account = createAccount(profile);
  
  return account;
}`;
  const cursorOffset = source.indexOf('\n  return');
  const context = extractCurrentBlockContext(source, cursorOffset);

  assert.ok(context);
  assert.match(context, /\{\n\s{2}const profile = createProfile\(\);/);
  assert.match(context, /<CURRENT_CURSOR>/);
  assert.match(context, /return account;/);
});

test('extractCurrentBlockContext still returns context for an unfinished block', () => {
  const source = `function buildUser() {
  const profile = createProfile();
  `;
  const cursorOffset = source.length;
  const context = extractCurrentBlockContext(source, cursorOffset);

  assert.ok(context);
  assert.match(context, /const profile = createProfile\(\);/);
  assert.match(context, /<CURRENT_CURSOR>/);
});

test('extractCurrentBlockContext returns undefined when no containing block exists', () => {
  const source = 'const value = computeResult();';
  const cursorOffset = source.length;

  assert.equal(extractCurrentBlockContext(source, cursorOffset), undefined);
});
