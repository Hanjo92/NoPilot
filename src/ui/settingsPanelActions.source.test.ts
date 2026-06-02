import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

function readSettingsPanelActionsSource(): string {
  return readFileSync(
    path.resolve(process.cwd(), 'src/ui/settingsPanelActions.ts'),
    'utf8'
  );
}

test('settings panel endpoint actions refresh providers explicitly before sending state', () => {
  const source = readSettingsPanelActionsSource();

  assert.match(source, /syncProviderState: \(providerId: string\) => Promise<void>;/);
  assert.match(source, /reconcileConfiguredProvider: \(\) => Promise<void>;/);
  assert.match(source, /refreshProviderState: \(providerId: string\) => Promise<void>;/);
  assert.match(source, /if \(didSave\) \{\s*await actions\.syncProviderState\(message\.providerId\);\s*await actions\.reconcileConfiguredProvider\(\);\s*await actions\.sendState\(\);/);
  assert.match(source, /await actions\.syncProviderState\(message\.providerId\);\s*await actions\.sendState\(\);/);
  assert.match(source, /message\.key === 'ollama\.endpoint'/);
  assert.match(source, /message\.key === 'openaiCompatible\.baseUrl'/);
  assert.match(source, /await actions\.refreshProviderState\('openai-compatible'\);/);
  assert.match(source, /await actions\.refreshProviderState\('ollama'\);/);
  assert.match(source, /await actions\.sendState\(\);/);
  assert.match(source, /case 'refreshOllama': \{/);
  assert.doesNotMatch(source, /await refreshProviderClient\(actions\.getProvider\('ollama'\)\);/);
});
