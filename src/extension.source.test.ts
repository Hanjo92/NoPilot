import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

function readExtensionSource(): string {
  return readFileSync(
    path.resolve(process.cwd(), 'src/extension.ts'),
    'utf8'
  );
}

function assertAppearsInOrder(source: string, snippets: string[]): void {
  let cursor = -1;

  for (const snippet of snippets) {
    const nextIndex = source.indexOf(snippet, cursor + 1);
    assert.ok(nextIndex > cursor, `Expected snippet to appear after previous snippet: ${snippet}`);
    cursor = nextIndex;
  }
}

test('extension configuration listener refreshes provider state for external model and Ollama endpoint changes', () => {
  const source = readExtensionSource();

  assert.match(source, /const PROVIDER_IDS: ProviderId\[\] = \['vscode-lm', 'anthropic', 'openai', 'gemini', 'ollama'\];/);
  assert.match(source, /const providerManager = new ProviderManager\(authService, context\.globalState\);/);
  assert.match(source, /void \(async \(\) => \{/);
  assert.match(source, /await providerManager\.reconcileConfiguredProvider\(\);/);
  assert.match(source, /await providerManager\.syncProviderState\(selected\.id as ProviderId\);/);
  assert.match(source, /providerManager\.onDidChangeUsage\(refreshStatusBar\);/);
  assert.match(source, /authService\.onDidChange\(\(event\) => \{/);
  assert.match(source, /const providerId = authService\.getProviderIdForSecretKey\(event\.key\);/);
  assert.match(source, /if \(authService\.consumeLocalSecretChange\(event\.key\)\) \{/);
  assert.match(source, /await providerManager\.refreshProviderState\(providerId\);/);
  assert.match(source, /logError\('Secret change sync failed', error\);/);
  assertAppearsInOrder(source, [
    "if (e.affectsConfiguration('nopilot.ollama.endpoint')) {",
    "await providerManager.refreshProviderState('ollama');",
    "e.affectsConfiguration('nopilot.ollama.endpoint'))",
    'await providerManager.reconcileConfiguredProvider();',
  ]);
  assert.match(source, /for \(const providerId of PROVIDER_IDS\) \{/);
  assert.match(source, /if \(!e\.affectsConfiguration\(getProviderModelSettingScope\(providerId\)\)\) \{/);
  assert.match(source, /const provider = providerManager\.getProvider\(providerId\);/);
  assert.match(source, /if \(provider && configuredModel !== provider\.info\.currentModel\) \{/);
  assert.match(source, /await providerManager\.updateModel\(providerId, configuredModel\);/);
  assert.match(source, /e\.affectsConfiguration\('nopilot\.ollama\.remoteMode'\)/);
  assert.match(source, /const mostUsedProvider = providerManager\.getMostUsedProviderUsage\(\);/);
  assert.match(source, /currentProviderRequests: providerManager\.getProviderRequestCount\(info\.id\),/);
  assert.match(source, /mostUsedProvider: mostUsedProvider/);
  assert.match(source, /logError\('Configuration change sync failed', error\);/);
});
