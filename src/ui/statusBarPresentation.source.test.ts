import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

function readStatusBarPresentationSource(): string {
  return readFileSync(
    path.resolve(process.cwd(), 'src/ui/statusBarPresentation.ts'),
    'utf8'
  );
}

test('status bar presentation includes provider usage in mini view and tooltip', () => {
  const source = readStatusBarPresentationSource();

  assert.match(source, /currentProviderRequests: number;/);
  assert.match(source, /mostUsedProvider\?: \{/);
  assert.match(source, /const usageLabel = `\$\{input\.currentProviderRequests\} req`;/);
  assert.match(source, /`Usage this session: \$\{input\.currentProviderRequests\} request/);
  assert.match(source, /`Top provider: \$\{input\.mostUsedProvider\.providerName\} \(\$\{input\.mostUsedProvider\.requestCount\} request/);
  assert.match(source, /: 'Top provider: none yet',/);
  assert.match(source, /text: `\$\{statusPrefix\}\$\(sparkle\) \$\{input\.displayName\} · \$\{usageLabel\}`/);
});
