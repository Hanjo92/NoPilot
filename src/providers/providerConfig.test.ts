import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

function readProviderConfigSource(): string {
  return readFileSync(
    path.resolve(process.cwd(), 'src/providers/providerConfig.ts'),
    'utf8'
  );
}

test('provider config helper maps providers to persisted model keys', () => {
  const source = readProviderConfigSource();

  assert.match(source, /export function getProviderModelConfigKey\(providerId: ProviderId\): string \{/);
  assert.match(source, /return providerId === 'vscode-lm' \? 'model' : `\$\{providerId\}\.model`;/);
});

test('provider config helper maps providers to VS Code setting scopes', () => {
  const source = readProviderConfigSource();

  assert.match(source, /export function getProviderModelSettingScope\(providerId: ProviderId\): string \{/);
  assert.match(source, /return providerId === 'vscode-lm'/);
  assert.match(source, /\? 'nopilot\.model'/);
  assert.match(source, /: `nopilot\.\$\{providerId\}\.model`;/);
});
