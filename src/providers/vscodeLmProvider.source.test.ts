import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

function readVscodeLmProviderSource(): string {
  return readFileSync(
    path.resolve(process.cwd(), 'src/providers/vscodeLmProvider.ts'),
    'utf8'
  );
}

test('vscode lm provider clears stale models when unavailable', () => {
  const source = readVscodeLmProviderSource();

  assert.match(source, /private clearDiscoveredModels\(\): void \{/);
  assert.match(source, /this\.discoveredModels = \[\];/);
  assert.match(source, /this\._info\.availableModels = \[\];/);
  assert.match(source, /this\._info\.currentModel = '';/);
  assert.match(source, /if \(typeof vscode\.lm === 'undefined'\) \{[\s\S]*?this\.clearDiscoveredModels\(\);/);
  assert.match(source, /if \(models\.length > 0\) \{[\s\S]*?return true;[\s\S]*?\}[\s\S]*?this\.clearDiscoveredModels\(\);/);
  assert.match(source, /catch \{[\s\S]*?this\.clearDiscoveredModels\(\);/);
});
