import assert from 'node:assert/strict';
import test from 'node:test';
import {
  chooseRepositoryIndex,
  collectRepositoryRootPaths,
  isPathInsideRoot,
} from './gitSelection';

test('isPathInsideRoot matches files nested under the repo root', () => {
  assert.equal(isPathInsideRoot('/workspace/repo/src/app.ts', '/workspace/repo'), true);
  assert.equal(isPathInsideRoot('/workspace/other/app.ts', '/workspace/repo'), false);
});

test('chooseRepositoryIndex prefers the active editor repository', () => {
  const index = chooseRepositoryIndex(
    ['/workspace/a', '/workspace/b'],
    '/workspace/b/src/file.ts'
  );

  assert.equal(index, 1);
});

test('chooseRepositoryIndex falls back to the first repository when there is no active match', () => {
  const index = chooseRepositoryIndex(
    ['/workspace/a', '/workspace/b'],
    '/workspace/c/src/file.ts'
  );

  assert.equal(index, 0);
});

test('chooseRepositoryIndex returns -1 for an empty repository list', () => {
  assert.equal(chooseRepositoryIndex([], '/workspace/a/src/file.ts'), -1);
});

test('collectRepositoryRootPaths keeps only file-backed roots', () => {
  const roots = collectRepositoryRootPaths([
    { rootUri: { fsPath: '/workspace/a', scheme: 'file' } },
    { rootUri: { fsPath: '/workspace/b', scheme: 'vscode-userdata' } },
    {},
  ]);

  assert.deepEqual(roots, ['/workspace/a']);
});
