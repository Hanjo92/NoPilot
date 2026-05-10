import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

function readSettingsWebviewScriptSource(): string {
  return readFileSync(
    path.resolve(process.cwd(), 'src/ui/settingsWebviewScript.ts'),
    'utf8'
  );
}

test('settings webview only shows Activate for ready providers', () => {
  const source = readSettingsWebviewScriptSource();

  assert.match(source, /if \(!isActive && provider\.status === 'ready'\) \{/);
  assert.doesNotMatch(source, /provider\.status === 'ready' \|\| !provider\.requiresApiKey/);
  assert.match(source, /if \(isActive && provider\.status === 'ready'\) \{/);
  assert.match(source, /isActive \? '⚠ Active · Key needed' : '🔑 Key needed'/);
  assert.match(source, /isActive \? '⚠ Active · Unavailable' : 'Unavailable'/);
  assert.match(source, /if \(message\.command === 'resetOllamaRefreshPending'\) \{/);
  assert.match(source, /setOllamaRefreshPending\(false, ''\);/);
  assert.match(source, /function formatRequestCount\(count\) \{/);
  assert.match(source, /function getProviderUsageMarkup\(provider\) \{/);
  assert.match(source, /formatRequestCount\(provider\.requestCount\)/);
  assert.match(source, /provider\.isMostUsed \? '<span class="usage-badge">Top<\/span>' : ''/);
  assert.match(source, /renderProviderUsageSummary\(state\);/);
  assert.match(source, /const summary = document\.getElementById\('providerUsageSummary'\);/);
  assert.match(source, /state\.usage\.currentProviderRequests/);
  assert.match(source, /state\.usage\.mostUsedProvider/);
  assert.match(source, /state\.usage\.totalRequests/);
  assert.match(source, /function clampNumberInputValue\(value, min, max\) \{/);
  assert.match(source, /const parsedValue = parseInt\(target\.value, 10\);/);
  assert.match(source, /if \(Number\.isNaN\(parsedValue\)\) \{/);
  assert.match(source, /const min = target\.min \? parseInt\(target\.min, 10\) : Number\.NaN;/);
  assert.match(source, /const max = target\.max \? parseInt\(target\.max, 10\) : Number\.NaN;/);
  assert.match(source, /const normalizedValue = clampNumberInputValue\(parsedValue, min, max\);/);
  assert.match(source, /updateSetting\(settingKey, normalizedValue\);/);
});
