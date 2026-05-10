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

test('settings panel endpoint actions rely on state refresh instead of direct Ollama client refreshes', () => {
  const source = readSettingsPanelActionsSource();

  assert.match(source, /syncProviderState: \(providerId: string\) => Promise<void>;/);
  assert.match(source, /reconcileConfiguredProvider: \(\) => Promise<void>;/);
  assert.match(source, /if \(didSave\) \{\s*await actions\.syncProviderState\(message\.providerId\);\s*await actions\.reconcileConfiguredProvider\(\);\s*await actions\.sendState\(\);/);
  assert.match(source, /await actions\.syncProviderState\(message\.providerId\);\s*await actions\.sendState\(\);/);
  assert.match(source, /message\.key === 'ollama\.endpoint'/);
  assert.match(source, /await actions\.sendState\(\);/);
  assert.match(source, /case 'refreshOllama': \{/);
  assert.doesNotMatch(source, /await refreshProviderClient\(actions\.getProvider\('ollama'\)\);/);
});
