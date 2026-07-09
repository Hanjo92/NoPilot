import assert from 'node:assert/strict';
import test from 'node:test';

const moduleUrl = new URL('./chatViewModel.ts', import.meta.url);
const {
  buildChatRequestHistory,
  normalizeAssistantResponseContent,
  normalizeChatResponseForApply,
} = await import(moduleUrl.href);

test('buildChatRequestHistory excludes pending entries and the latest user prompt', () => {
  const history = buildChatRequestHistory([
    { id: 'user-1', role: 'user', content: 'Review this function.' },
    { id: 'assistant-1', role: 'assistant', content: 'It needs a null guard.' },
    { id: 'user-2', role: 'user', content: 'Draft that guard.' },
    { id: 'assistant-2', role: 'assistant', content: 'Working on it...', pending: true },
  ]);

  assert.deepEqual(history, [
    { role: 'user', content: 'Review this function.' },
    { role: 'assistant', content: 'It needs a null guard.' },
  ]);
});

test('buildChatRequestHistory keeps the latest assistant turn when there is no new pending user prompt', () => {
  const history = buildChatRequestHistory([
    { id: 'user-1', role: 'user', content: 'Review this function.' },
    { id: 'assistant-1', role: 'assistant', content: 'It needs a null guard.' },
  ]);

  assert.deepEqual(history, [
    { role: 'user', content: 'Review this function.' },
    { role: 'assistant', content: 'It needs a null guard.' },
  ]);
});

test('buildChatRequestHistory caps prior turns after removing the current prompt', () => {
  const history = buildChatRequestHistory([
    { id: 'user-1', role: 'user', content: 'u1' },
    { id: 'assistant-1', role: 'assistant', content: 'a1' },
    { id: 'user-2', role: 'user', content: 'u2' },
    { id: 'assistant-2', role: 'assistant', content: 'a2' },
    { id: 'user-3', role: 'user', content: 'u3' },
    { id: 'assistant-3', role: 'assistant', content: 'a3' },
    { id: 'user-4', role: 'user', content: 'u4' },
    { id: 'assistant-4', role: 'assistant', content: 'a4' },
    { id: 'user-5', role: 'user', content: 'u5' },
    { id: 'assistant-5', role: 'assistant', content: 'a5' },
    { id: 'user-6', role: 'user', content: 'u6' },
    { id: 'assistant-6', role: 'assistant', content: 'Working on it...', pending: true },
  ], 10);

  assert.deepEqual(history, [
    { role: 'user', content: 'u1' },
    { role: 'assistant', content: 'a1' },
    { role: 'user', content: 'u2' },
    { role: 'assistant', content: 'a2' },
    { role: 'user', content: 'u3' },
    { role: 'assistant', content: 'a3' },
    { role: 'user', content: 'u4' },
    { role: 'assistant', content: 'a4' },
    { role: 'user', content: 'u5' },
    { role: 'assistant', content: 'a5' },
  ]);
});

test('normalizeAssistantResponseContent preserves code indentation while trimming wrapper blank lines', () => {
  assert.equal(
    normalizeAssistantResponseContent('\n\n  const answer = 42;\n'),
    '  const answer = 42;'
  );
  assert.equal(normalizeAssistantResponseContent('   \n\t'), undefined);
});

test('normalizeChatResponseForApply prefers the first fenced block and preserves indentation', () => {
  const normalized = normalizeChatResponseForApply(
    'Add a guard clause.\n\n```ts\n  if (!value) {\n    return;\n  }\n```'
  );

  assert.equal(normalized, '  if (!value) {\n    return;\n  }');
});

test('normalizeChatResponseForApply trims blank wrapper lines but refuses empty fenced replies', () => {
  assert.equal(
    normalizeChatResponseForApply('```ts\n\n  const answer = 42;\n\n```'),
    '  const answer = 42;'
  );
  assert.equal(normalizeChatResponseForApply('```ts\n```'), undefined);
});

test('normalizeChatResponseForApply accepts fenced code info strings with symbols or metadata', () => {
  assert.equal(
    normalizeChatResponseForApply('```c++ title="main.cpp"\nstd::vector<int> values;\n```'),
    'std::vector<int> values;'
  );
  assert.equal(
    normalizeChatResponseForApply(
      'Use this version.\n```tsx title="Widget.tsx"\n  return <Widget />;\n```\nIt keeps the JSX intact.'
    ),
    '  return <Widget />;'
  );
});
