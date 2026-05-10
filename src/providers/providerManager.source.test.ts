import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';

function readProviderManagerSource(): string {
  return readFileSync(
    path.resolve(process.cwd(), 'src/providers/providerManager.ts'),
    'utf8'
  );
}

test('provider quick pick is backed by unified model entries', () => {
  const source = readProviderManagerSource();

  assert.match(source, /private static readonly USAGE_PERSIST_DEBOUNCE_MS = 250;/);
  assert.match(source, /private static readonly USAGE_STORAGE_KEY = 'providerUsageCounts';/);
  assert.match(source, /constructor\(\s*private readonly authService: AuthService,\s*private readonly usageState\?: vscode\.Memento\s*\)/);
  assert.match(source, /private usagePersistTimer: ReturnType<typeof setTimeout> \| undefined;/);
  assert.match(source, /this\.activeModelKey = config\.get<string>\(\s*getProviderModelConfigKey\(this\.activeProviderId\),/);
  assert.match(source, /const storedUsageCounts = this\.usageState\?\.get<Partial<Record<ProviderId, number>>>\(\s*ProviderManager\.USAGE_STORAGE_KEY\s*\);/);
  assert.match(source, /this\.hydrateUsageCounts\(storedUsageCounts\);/);
  assert.match(source, /const activeProvider = this\.providers\.get\(this\.activeProviderId\);/);
  assert.match(source, /this\.activeModelKey = this\.resolveSelectedModelKey\(\s*activeProvider,\s*this\.activeModelKey \|\| activeProvider\.info\.currentModel\s*\);/);
  assert.match(source, /if \(this\.activeModelKey !== activeProvider\.info\.currentModel\) \{\s*applyModelSelection\(activeProvider, this\.activeModelKey\);\s*\}/);
  assert.match(source, /return this\.activeModelKey \|\| 'VS Code LM';/);
  assert.match(source, /return `\$\{provider\.info\.icon\} \$\{provider\.info\.currentModel \|\| provider\.info\.name\}`;/);
  assert.match(source, /let isAvailable = await provider\.isAvailable\(\);/);
  assert.match(source, /let info = provider\.info;/);
  assert.match(source, /private readonly usageCounts: Record<ProviderId, number> = \{/);
  assert.match(source, /private readonly _onDidChangeProviderState = new vscode\.EventEmitter<ProviderId>\(\);/);
  assert.match(source, /readonly onDidChangeProviderState = this\._onDidChangeProviderState\.event;/);
  assert.match(source, /private readonly _onDidChangeUsage = new vscode\.EventEmitter<ProviderId>\(\);/);
  assert.match(source, /readonly onDidChangeUsage = this\._onDidChangeUsage\.event;/);
  assert.match(source, /isAvailable = await provider\.isAvailable\(\);/);
  assert.match(source, /info = provider\.info;/);
  assert.match(source, /if \(!isAvailable && !\(info\.requiresApiKey && !info\.hasApiKey\)\) \{/);
  assert.match(source, /const selectedModelKey = this\.resolveSelectedModelKey\(provider, modelKey\);/);
  assert.match(source, /async reconcileConfiguredProvider\(\): Promise<void> \{/);
  assert.match(source, /const configuredProvider = vscode\.workspace\s*\.getConfiguration\('nopilot'\)\s*\.get<ProviderId>\('provider', 'vscode-lm'\);/);
  assert.match(source, /if \(configuredProvider !== this\.activeProviderId\) \{\s*await this\.switchProvider\(configuredProvider\);\s*\}/);
  assert.match(source, /const selectedModelKey = this\.resolveSelectedModelKey\(provider, model\);/);
  assert.match(source, /applyModelSelection\(provider, selectedModelKey\);/);
  assert.match(source, /const resolvedModelKey = this\.resolveSelectedModelKey\(\s*provider,\s*selectedModelKey\s*\);/);
  assert.match(source, /if \(resolvedModelKey !== provider\.info\.currentModel\) \{\s*applyModelSelection\(provider, resolvedModelKey\);/);
  assert.match(source, /if \(resolvedModelKey !== selectedModelKey\) \{/);
  assert.match(source, /this\.activeModelKey = resolvedModelKey;/);
  assert.match(source, /this\._onDidChangeProviderState\.fire\(providerId\);/);
  assert.match(source, /async syncProviderState\(providerId: ProviderId\): Promise<void> \{/);
  assert.match(source, /async refreshProviderState\(providerId: ProviderId\): Promise<void> \{/);
  assert.match(source, /await refreshProviderClient\(provider\);/);
  assert.match(source, /await this\.syncProviderState\(providerId\);/);
  assert.match(source, /let resolvedModelKey = provider\.info\.currentModel;/);
  assert.match(source, /if \(provider\.info\.availableModels\.length > 0\) \{/);
  assert.match(source, /if \(resolvedModelKey !== provider\.info\.currentModel\) \{/);
  assert.match(source, /private resolveSelectedModelKey\(provider: AIProvider, requestedModel: string\): string/);
  assert.match(source, /getProviderRequestCount\(providerId: ProviderId\): number \{/);
  assert.match(source, /getTotalRequestCount\(\): number \{/);
  assert.match(source, /getMostUsedProviderUsage\(\): ProviderUsageSummary \| undefined \{/);
  assert.match(source, /private hydrateUsageCounts\(\s*storedUsageCounts\?: Partial<Record<ProviderId, number>>\s*\): void \{/);
  assert.match(source, /const usageCount = storedUsageCounts\?\.\[providerId\];/);
  assert.match(source, /Number\.isFinite\(usageCount\) && usageCount > 0/);
  assert.match(source, /Math\.floor\(usageCount\)/);
  assert.match(source, /private async flushPersistedUsageCounts\(\): Promise<void> \{/);
  assert.match(source, /await this\.usageState\s*\.update\(ProviderManager\.USAGE_STORAGE_KEY, \{ \.\.\.this\.usageCounts \}\)/);
  assert.match(source, /\.catch\(\(error\) => \{/);
  assert.match(source, /private persistUsageCounts\(\): void \{/);
  assert.match(source, /if \(!this\.usageState\) \{\s*return;\s*\}/);
  assert.match(source, /if \(this\.usagePersistTimer\) \{\s*clearTimeout\(this\.usagePersistTimer\);\s*\}/);
  assert.match(source, /this\.usagePersistTimer = setTimeout\(\(\) => \{/);
  assert.match(source, /this\.usagePersistTimer = undefined;/);
  assert.match(source, /void this\.flushPersistedUsageCounts\(\);/);
  assert.match(source, /ProviderManager\.USAGE_PERSIST_DEBOUNCE_MS/);
  assert.match(source, /logError\('Provider usage persistence failed', error\);/);
  assert.match(source, /private recordProviderRequest\(providerId: ProviderId\): void \{/);
  assert.match(source, /this\.usageCounts\[providerId\] = this\.getProviderRequestCount\(providerId\) \+ 1;/);
  assert.match(source, /this\.persistUsageCounts\(\);/);
  assert.match(source, /this\._onDidChangeUsage\.fire\(providerId\);/);
  assert.match(source, /this\.recordProviderRequest\(provider\.info\.id\);/);
  assert.match(source, /const items: ProviderQuickPickItem\[\] = this\.buildModelEntries\(\)\.map/);
  assert.match(source, /title: 'NoPilot: Select AI Model'/);
  assert.match(source, /if \(selected\.providerId && !selected\.modelKey\) \{/);
  assert.match(source, /void vscode\.window\.showWarningMessage\(/);
  assert.match(source, /`NoPilot: \$\{providerName\} is currently unavailable`/);
  assert.match(source, /if \(selected\.providerId && selected\.modelKey\) \{/);
  assert.match(source, /await this\.switchTo\(selected\.providerId, selected\.modelKey\)/);
  assert.match(source, /if \(info\.status === 'unavailable'\) \{/);
  assert.match(source, /description: `Direct API · \$\{usageLabel\}`/);
  assert.match(source, /detail: '\$\(warning\) Unavailable'/);
  assert.match(source, /const availableModels = info\.availableModels\.length > 0/);
  assert.match(source, /for \(const model of availableModels\)/);
  assert.match(source, /if \(this\.usagePersistTimer\) \{\s*clearTimeout\(this\.usagePersistTimer\);\s*this\.usagePersistTimer = undefined;\s*void this\.flushPersistedUsageCounts\(\);\s*\}/);
  assert.match(source, /this\._onDidChangeProviderState\.dispose\(\);/);
  assert.match(source, /this\._onDidChangeUsage\.dispose\(\);/);
});

test('provider quick pick descriptions include usage counts without expanding details', () => {
  const source = readProviderManagerSource();

  assert.match(source, /const usageLabel = this\.formatProviderRequestCount\(\s*'vscode-lm'\s*\);/);
  assert.match(source, /description: `via \$\{model\.vendor\} · \$\{usageLabel\}`/);
  assert.match(source, /detail: isActive \? '\$\(check\) Active' : '\$\(plug\) Ready — no API key needed'/);
  assert.match(source, /const usageLabel = this\.formatProviderRequestCount\(pid\);/);
  assert.match(source, /for \(const model of availableModels\) \{[\s\S]*?description: `via \$\{info\.name\} Direct API · \$\{usageLabel\}`/);
  assert.match(source, /for \(const model of availableModels\) \{[\s\S]*?detail: statusLabel/);
  assert.match(source, /private formatRequestCount\(requestCount: number\): string \{/);
  assert.match(source, /private formatProviderRequestCount\(providerId: ProviderId\): string \{/);
  assert.match(source, /return this\.formatRequestCount\(this\.getProviderRequestCount\(providerId\)\);/);
});

test('provider quick pick keeps most-used summary out of option rows', () => {
  const source = readProviderManagerSource();

  assert.match(source, /action\?: 'settings';/);
  assert.doesNotMatch(source, /usage-summary/);
  assert.match(source, /private getProviderUsageSummaryLabel\(\): string \{/);
  assert.match(source, /const mostUsedProvider = this\.getMostUsedProviderUsage\(\);/);
  assert.match(source, /return mostUsedProvider\s*\? `Most used: \$\{mostUsedProvider\.providerIcon\} \$\{mostUsedProvider\.providerName\} \(\$\{this\.formatProviderRequestCount\(mostUsedProvider\.providerId\)\}\) · Total: \$\{totalUsageLabel\}`/);
  assert.match(source, /: `Most used: none yet · Total: \$\{totalUsageLabel\}`;/);
  assert.match(source, /placeHolder: `Choose your AI provider or model · \$\{this\.getProviderUsageSummaryLabel\(\)\}`/);
});
