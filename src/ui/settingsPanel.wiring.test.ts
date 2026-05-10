import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

function readSource(relativePath: string): string {
  return readFileSync(path.resolve(process.cwd(), relativePath), 'utf8');
}

test('settings panel skips Ollama model refreshes for provider and usage event updates', () => {
  const source = readSource('src/ui/settingsPanel.ts');

  assert.match(
    source,
    /this\.providerManager\.onDidChangeProvider\(\(\) =>\s*this\.sendStateToWebview\(\{ refreshOllamaModels: false \}\)\s*\)/
  );
  assert.match(
    source,
    /this\.usageTracker\.onDidChangeUsage\(\(\) =>\s*this\.sendStateToWebview\(\{ refreshOllamaModels: false \}\)\s*\)/
  );
  assert.match(
    source,
    /SettingsPanel\.currentPanel\.sendStateToWebview\(\{ refreshOllamaModels: true \}\);/
  );
});

test('settings panel actions avoid redundant Ollama refreshes when resending state', () => {
  const source = readSource('src/ui/settingsPanelActions.ts');

  assert.match(
    source,
    /case 'switchProvider':[\s\S]*?await actions\.sendState\(\{ refreshOllamaModels: false \}\);/
  );
  assert.match(
    source,
    /case 'updateModel':[\s\S]*?await actions\.sendState\(\{ refreshOllamaModels: false \}\);/
  );
  assert.match(
    source,
    /case 'refreshOllama':[\s\S]*?await actions\.sendState\(\{ refreshOllamaModels: false \}\);/
  );
  assert.match(
    source,
    /case 'requestState':[\s\S]*?await actions\.sendState\(\{ refreshOllamaModels: true \}\);/
  );
});
