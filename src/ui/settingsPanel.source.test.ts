import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

function readSettingsPanelSource(): string {
  return readFileSync(
    path.resolve(process.cwd(), 'src/ui/settingsPanel.ts'),
    'utf8'
  );
}

test('settings panel refreshes the webview when external NoPilot configuration changes', () => {
  const source = readSettingsPanelSource();

  assert.match(source, /private stateRequestVersion = 0;/);
  assert.match(source, /private isRefreshingProviderStateForWebview = false;/);
  assert.match(source, /private isDisposed = false;/);
  assert.match(source, /if \(!this\.isRefreshingProviderStateForWebview\) \{\s*this\.requestStateRefresh\(\);\s*\}/);
  assert.match(source, /this\.providerManager\.onDidChangeUsage\(\(\) => \{/);
  assert.match(source, /vscode\.workspace\.onDidChangeConfiguration\(\(event\) => \{/);
  assert.match(source, /if \(event\.affectsConfiguration\('nopilot'\)\) \{/);
  assert.match(source, /private requestStateRefresh\(\): void \{/);
  assert.match(source, /void this\.sendStateToWebview\(\)\.catch\(\(error\) => \{/);
  assert.match(source, /logError\('SettingsPanel state refresh failed', error\);/);
  assert.match(source, /const requestVersion = \+\+this\.stateRequestVersion;/);
  assert.match(source, /this\.isRefreshingProviderStateForWebview = true;/);
  assert.match(source, /await this\.providerManager\.refreshProviderState\('ollama'\);/);
  assert.match(source, /getProviderRequestCount: \(providerId\) =>/);
  assert.match(source, /this\.isRefreshingProviderStateForWebview = false;/);
  assert.match(source, /if \(this\.isDisposed \|\| requestVersion !== this\.stateRequestVersion\) \{/);
  assert.match(source, /if \(message\.command === 'refreshOllama'\) \{/);
  assert.match(source, /void this\.panel\.webview\.postMessage\(\{ command: 'resetOllamaRefreshPending' \}\);/);
  assert.match(source, /this\.isDisposed = true;/);
});
