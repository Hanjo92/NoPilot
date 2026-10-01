import assert from 'node:assert/strict';
import test from 'node:test';
import { DocumentSnapshot, EditTarget, exactPatch, responseEdit, reviewAndApply } from './editSafety';
import { cancellationSource } from './testSupport';

const original: EditTarget = { uri: 'file:///project/a.ts', version: 3, text: 'one two three', start: 4, end: 7, cursor: 7 };

test('response edits use the captured file, selection and cursor, independent of the active editor', () => {
  const replacement = responseEdit(original, 'NEW', 'replace');
  assert.equal(replacement.before.uri, 'file:///project/a.ts');
  assert.equal(replacement.after, 'one NEW three');
  assert.equal(responseEdit(original, '!', 'insert').after, 'one two! three');
  assert.throws(() => responseEdit({ ...original, end: 4 }, 'x', 'replace'), /no selection/);
});

test('wrong file, document version, or same-version content prevents approval and apply', async () => {
  for (const change of [{ uri: 'file:///b.ts' }, { version: 4 }, { text: 'different' }]) {
    let approvals = 0; let applies = 0;
    await assert.rejects(reviewAndApply([responseEdit(original, 'x', 'replace')], {
      read: async () => ({ ...original, ...change }), approve: async () => { approvals++; return true; },
      apply: async () => { applies++; return true; },
    }, cancellationSource().token), /original document changed/);
    assert.equal(approvals, 0); assert.equal(applies, 0);
  }
});

test('changing any file during multi-file review rejects the whole proposal', async () => {
  const other = { ...original, uri: 'file:///project/b.ts' };
  const current = new Map<string, DocumentSnapshot>([[original.uri, original], [other.uri, other]]);
  let applies = 0;
  await assert.rejects(reviewAndApply([responseEdit(original, 'x', 'replace'), responseEdit(other, 'y', 'replace')], {
    read: async uri => current.get(uri)!,
    approve: async () => { current.set(other.uri, { ...other, version: 4 }); return true; },
    apply: async () => { applies++; return true; },
  }, cancellationSource().token), /original document changed/);
  assert.equal(applies, 0);
});

test('approval decline or cancellation never applies a change', async () => {
  for (const cancel of [false, true]) {
    const source = cancellationSource(); let applies = 0;
    const operation = reviewAndApply([responseEdit(original, 'x', 'replace')], {
      read: async () => original,
      approve: async () => { if (cancel) { source.cancel(); } return cancel; },
      apply: async () => { applies++; return true; },
    }, source.token);
    if (cancel) { await assert.rejects(operation, /Cancelled/); } else { assert.equal(await operation, false); }
    assert.equal(applies, 0);
  }
});

test('reviewed multi-file edits are dispatched once and a rejected workspace edit is reported', async () => {
  const edits = [responseEdit(original, 'x', 'replace'), responseEdit({ ...original, uri: 'file:///b.ts' }, 'y', 'replace')];
  let calls = 0;
  await assert.rejects(reviewAndApply(edits, {
    read: async uri => edits.find(e => e.before.uri === uri)!.before,
    approve: async approved => { assert.deepEqual(approved, edits); return true; },
    apply: async approved => { calls++; assert.equal(approved.length, 2); return false; },
  }, cancellationSource().token), /VS Code rejected/);
  assert.equal(calls, 1);
});

test('exact patches reject missing, ambiguous and empty matches while preserving surrounding text', () => {
  assert.equal(exactPatch(original, 'two', 'second', 'a.ts').after, 'one second three');
  assert.throws(() => exactPatch(original, '', 'x', 'a.ts'));
  assert.throws(() => exactPatch(original, 'missing', 'x', 'a.ts'));
  assert.throws(() => exactPatch({ ...original, text: 'a a' }, 'a', 'b', 'a.ts'));
});
