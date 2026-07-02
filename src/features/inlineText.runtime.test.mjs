import assert from 'node:assert/strict';
import test from 'node:test';

const moduleUrl = new URL('./inlineText.ts', import.meta.url);
const {
  extractFirstMarkdownCodeBlock,
  stripMarkdownCodeFences,
} = await import(moduleUrl.href);

test('inline markdown fence helpers accept info strings with symbols or extra metadata', () => {
  const stripped = stripMarkdownCodeFences(
    '```c++ title="example.cpp"\nstd::vector<int> values;\n```'
  );
  const extracted = extractFirstMarkdownCodeBlock(
    'Explanation first.\n```tsx title="Widget.tsx"\nreturn <Widget />;\n```\nMore text.'
  );

  assert.equal(stripped, 'std::vector<int> values;');
  assert.equal(extracted, 'return <Widget />;');
});
