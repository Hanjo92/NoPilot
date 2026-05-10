import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

function readSettingsPanelStateSource(): string {
  return readFileSync(
    path.resolve(process.cwd(), 'src/ui/settingsPanelState.ts'),
    'utf8'
  );
}

test('settings panel state derives provider usage summaries for the webview', () => {
  const source = readSettingsPanelStateSource();

  assert.match(source, /getProviderRequestCount: \(providerId: ProviderInfo\['id'\]\) => number;/);
  assert.match(source, /function getMostUsedProvider\(providers: ProviderWebviewInfo\[\]\): ProviderUsageSummary \| undefined \{/);
  assert.match(source, /requestCount: source\.getProviderRequestCount\(provider\.id\),/);
  assert.match(source, /isMostUsed: false,/);
  assert.match(source, /isMostUsed: mostUsedProvider\?\.providerId === provider\.id,/);
  assert.match(source, /const currentProviderRequests =/);
  assert.match(source, /const totalRequests = providersWithUsageFlags\.reduce\(/);
  assert.match(source, /usage: \{\s*currentProviderRequests,\s*totalRequests,\s*mostUsedProvider,\s*\},/);
});
