import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

function readSource(filename: string): string {
  return readFileSync(
    path.resolve(process.cwd(), filename),
    'utf8'
  );
}

test('direct API providers reset stale live model state when auth becomes unavailable', () => {
  const anthropic = readSource('src/providers/anthropicProvider.ts');
  const openai = readSource('src/providers/openaiProvider.ts');
  const gemini = readSource('src/providers/geminiProvider.ts');

  assert.match(anthropic, /if \(!hasKey\) \{\s*this\.client = undefined;\s*const fallbackModels = getDirectProviderFallbackModels\('anthropic'\);/);
  assert.match(anthropic, /if \(!fallbackModels\.includes\(this\._info\.currentModel\)\) \{\s*this\._info\.currentModel = getDirectProviderDefaultModel\('anthropic'\);/);
  assert.match(anthropic, /this\.applyModelState\(\);\s*return false;\s*\}/);
  assert.match(openai, /this\.client = undefined;\s*this\._info\.hasApiKey = false;\s*this\._info\.status = 'needs-key';\s*const fallbackModels = getDirectProviderFallbackModels\('openai'\);/);
  assert.match(openai, /if \(!fallbackModels\.includes\(this\._info\.currentModel\)\) \{\s*this\._info\.currentModel = getDirectProviderDefaultModel\('openai'\);/);
  assert.match(openai, /this\.applyModelState\(\);\s*return false;/);
  assert.match(gemini, /if \(!hasKey\) \{\s*this\.genAI = undefined;\s*this\.model = undefined;\s*const fallbackModels = getDirectProviderFallbackModels\('gemini'\);/);
  assert.match(gemini, /if \(!fallbackModels\.includes\(this\._info\.currentModel\)\) \{\s*this\._info\.currentModel = getDirectProviderDefaultModel\('gemini'\);/);
  assert.match(gemini, /this\.applyModelState\(\);\s*return false;\s*\}/);
});
