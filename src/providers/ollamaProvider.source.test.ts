import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

function readOllamaProviderSource(): string {
  return readFileSync(
    path.resolve(process.cwd(), 'src/providers/ollamaProvider.ts'),
    'utf8'
  );
}

test('ollama provider clears stale models when unavailable', () => {
  const source = readOllamaProviderSource();

  assert.match(source, /private clearAvailableModels\(\): void \{/);
  assert.match(source, /this\._info\.availableModels = \[\];/);
  assert.match(source, /this\._info\.currentModel = '';/);
  assert.match(source, /if \(this\._info\.availableModels\.length === 0\) \{[\s\S]*?this\.clearAvailableModels\(\);/);
  assert.match(source, /catch \{[\s\S]*?this\.clearAvailableModels\(\);/);
});
