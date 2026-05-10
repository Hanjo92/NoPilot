import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

function readAuthServiceSource(): string {
  return readFileSync(
    path.resolve(process.cwd(), 'src/services/authService.ts'),
    'utf8'
  );
}

test('auth service tracks local secret writes so external secret listeners can ignore them', () => {
  const source = readAuthServiceSource();

  assert.match(source, /private readonly pendingLocalSecretChanges = new Map<string, number>\(\);/);
  assert.match(source, /this\.trackLocalSecretChange\(key\);\s*try \{\s*await this\.secrets\.store\(key, apiKey\);/);
  assert.match(source, /catch \(error\) \{\s*this\.releaseLocalSecretChange\(key\);\s*throw error;\s*\}/);
  assert.match(source, /this\.trackLocalSecretChange\(key\);\s*try \{\s*await this\.secrets\.delete\(key\);/);
  assert.match(source, /consumeLocalSecretChange\(key: string\): boolean \{/);
  assert.match(source, /private trackLocalSecretChange\(key: string\): void \{/);
  assert.match(source, /private releaseLocalSecretChange\(key: string\): void \{/);
});
