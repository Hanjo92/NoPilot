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
  const sendStateSource = source.slice(
    source.indexOf('private async sendStateToWebview'),
    source.indexOf('/** Handle messages')
  );

  assert.match(source, /private stateRequestVersion = 0;/);
  assert.match(source, /private isDisposed = false;/);
  assert.doesNotMatch(source, /isRefreshingProviderStateForWebview/);
  assert.match(source, /this\.providerManager\.onDidChangeUsage\(\(\) => \{/);
  assert.match(source, /vscode\.workspace\.onDidChangeConfiguration\(\(event\) => \{/);
  assert.match(source, /if \(event\.affectsConfiguration\('nopilot'\)\) \{/);
  assert.match(source, /private requestStateRefresh\(\): void \{/);
  assert.match(source, /void this\.sendStateToWebview\(\)\.catch\(\(error\) => \{/);
  assert.match(source, /logError\('SettingsPanel state refresh failed', error\);/);
  assert.match(source, /const requestVersion = \+\+this\.stateRequestVersion;/);
  assert.doesNotMatch(sendStateSource, /refreshProviderState\('ollama'\)/);
  assert.doesNotMatch(sendStateSource, /refreshProviderState\('openai-compatible'\)/);
  assert.match(source, /getProviderRequestCount: \(providerId\) =>/);
  assert.match(source, /if \(this\.isDisposed \|\| requestVersion !== this\.stateRequestVersion\) \{/);
  assert.match(source, /refreshProviderState: \(providerId\) =>\s*this\.providerManager\.refreshProviderState\(providerId as any\),/);
  assert.match(source, /if \(message\.command === 'refreshOllama'\) \{/);
  assert.match(source, /void this\.panel\.webview\.postMessage\(\{ command: 'resetOllamaRefreshPending' \}\);/);
  assert.match(source, /this\.isDisposed = true;/);
});
