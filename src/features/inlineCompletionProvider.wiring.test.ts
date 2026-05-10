import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

function readSource(relativePath: string): string {
  return readFileSync(path.resolve(process.cwd(), relativePath), 'utf8');
}

function stripWhitespace(source: string): string {
  return source.replace(/\s+/g, '');
}

function assertAppearsInOrder(source: string, snippets: string[]): void {
  let cursor = -1;

  for (const snippet of snippets) {
    const nextIndex = source.indexOf(snippet, cursor + 1);
    assert.ok(
      nextIndex > cursor,
      `Expected snippet to appear after previous snippet: ${snippet}`
    );
    cursor = nextIndex;
  }
}

test('inline provider threads remote Ollama optimization through real request assembly', () => {
  const source = readSource('src/features/inlineCompletionProvider.ts');
  const compact = stripWhitespace(source);

  assert.match(source, /resolveActiveOllamaRemoteMode\(\): boolean/);
  assert.match(source, /const isRemoteOllama = this\.resolveActiveOllamaRemoteMode\(\);/);
  assert.match(
    source,
    /const inlineOptimizationProfile = isRemoteOllama \? 'remote-ollama' : 'standard';/
  );
  assert.ok(
    compact.includes('getInlineRequestPolicy({') &&
      compact.includes('inlineOptimizationProfile,') &&
      compact.includes('buildInlineCacheScope('),
    'request policy and cache scope should receive inlineOptimizationProfile'
  );
  assert.match(
    source,
    /const request = await this\.buildRequest\([\s\S]*?inlineOptimizationProfile[\s\S]*?\);/
  );
  assert.match(source, /inlineOptimizationProfile,\s*\n\s*};/);
});

test('inline provider treats file scope as current-file only and workspace scope as heavy context', () => {
  const source = readSource('src/features/inlineCompletionProvider.ts');

  assert.match(
    source,
    /const includeWorkspaceContext = requestPolicy\.additionalContextScope === 'workspace';/
  );
  assert.match(
    source,
    /const structureContext = buildCurrentFileStructureContext\([\s\S]*?if \(structureContext\)/
  );
  assert.match(
    source,
    /if \(includeWorkspaceContext\) \{[\s\S]*?this\.resolveSimilarFileSampleContext/
  );
  assert.match(
    source,
    /if \(includeWorkspaceContext && searchWords\.length > 0\) \{[\s\S]*?this\.resolveReferencedSymbolSnippet/
  );
});

test('inline provider exposes remote automatic request lifecycle status', () => {
  const source = readSource('src/features/inlineCompletionProvider.ts');

  assert.match(source, /readonly onDidChangeRequestStatus = this\.requestStatusEmitter\.event;/);
  assert.match(source, /getRequestStatus\(\): InlineRequestStatus/);
  assert.match(source, /this\.setRequestStatus\(\{\s*\n\s*kind: 'waiting',/);
  assert.match(source, /message: 'Requesting from remote Ollama\.\.\.'/);
  assert.match(source, /this\.scheduleSlowStatus\(requestId\);/);
  assert.match(source, /this\.ollamaRemoteTracker\.recordSuccess\(providerDurationMs\);/);
  assert.match(source, /this\.ollamaRemoteTracker\.recordFailure\(\);/);
  assert.match(source, /clearRemoteRequestLifecycle\(activeProvider\.info, requestId, 'cancelled'\)/);
  assert.match(source, /clearRemoteRequestLifecycle\(activeProvider\.info, requestId, 'connection-problem'\)/);
});

test('inline provider prevents old clear timers from erasing newer request status', () => {
  const source = readSource('src/features/inlineCompletionProvider.ts');

  assert.match(source, /private clearRequestStatusClearTimer\(\): void/);
  assert.match(
    source,
    /private setRequestStatus\(status: InlineRequestStatus\): void \{[\s\S]*?if \(status\.kind !== 'idle'\) \{[\s\S]*?this\.clearRequestStatusClearTimer\(\);[\s\S]*?\}/
  );
  assert.match(
    source,
    /private scheduleRequestStatusClear\(requestId: number, delayMs = 900\): void \{[\s\S]*?if \(!this\.ownsRemoteRequestLifecycle\(requestId\)\) \{[\s\S]*?return;[\s\S]*?\}[\s\S]*?this\.clearRequestStatusClearTimer\(\);/
  );
});

test('inline provider records remote success only after usable completion validation', () => {
  const source = readSource('src/features/inlineCompletionProvider.ts');

  assertAppearsInOrder(source, [
    'const response = await this.providerManager.complete(request, token);',
    'if (requestId !== this.requestCounter)',
    'if (token.isCancellationRequested)',
    'if (!response.text)',
    'const cleanedText = cleanInlineCompletionText',
    'if (!cleanedText)',
    'this.ollamaRemoteTracker.recordSuccess(providerDurationMs);',
    'return [',
  ]);
});

test('inline provider re-checks freshness after async request assembly before lifecycle starts', () => {
  const source = readSource('src/features/inlineCompletionProvider.ts');

  assertAppearsInOrder(source, [
    'const request = await this.buildRequest',
    'if (requestId !== this.requestCounter)',
    'return undefined;',
    'const buildDurationMs = Date.now() - buildStart;',
    'this.beginRemoteRequestLifecycle(requestId, activeProvider.info);',
    'const response = await this.providerManager.complete(request, token);',
  ]);
  assert.match(
    source,
    /private beginRemoteRequestLifecycle\(requestId: number, providerInfo: ProviderInfo\): void \{[\s\S]*?if \(requestId !== this\.requestCounter\) \{[\s\S]*?return;[\s\S]*?\}/
  );
});

test('inline provider clears remote lifecycle on skip and cache-hit exits', () => {
  const source = readSource('src/features/inlineCompletionProvider.ts');

  assert.match(
    source,
    /if \(requestPolicy\.skip\) \{[\s\S]*?this\.invalidateActiveRemoteRequestLifecycle\(\);[\s\S]*?return undefined;[\s\S]*?\}/
  );
  assert.match(
    source,
    /if \(this\.cache\.has\(cacheKey\)\) \{[\s\S]*?this\.invalidateActiveRemoteRequestLifecycle\(\);[\s\S]*?return \[new vscode\.InlineCompletionItem/
  );
});

test('inline provider invalidates stale remote lifecycle for newer non-tracked invocations', () => {
  const source = readSource('src/features/inlineCompletionProvider.ts');

  assert.match(
    source,
    /private invalidateActiveRemoteRequestLifecycle\(requestId = \+\+this\.requestCounter\): number \{[\s\S]*?this\.clearSlowTimer\(\);[\s\S]*?this\.clearRequestStatusClearTimer\(\);[\s\S]*?this\.activeRequestStatusId = undefined;[\s\S]*?this\.setRequestStatus\(createIdleInlineRequestStatus\(\)\);[\s\S]*?return requestId;[\s\S]*?\}/
  );
  assert.match(
    source,
    /if \(!this\.enabled\) \{[\s\S]*?this\.invalidateActiveRemoteRequestLifecycle\(\);[\s\S]*?return undefined;[\s\S]*?\}/
  );
  assert.match(
    source,
    /if \(this\.shouldSkipAutomaticRequestForCopilot\(document\.languageId, context\.triggerKind\)\) \{[\s\S]*?this\.invalidateActiveRemoteRequestLifecycle\(\);[\s\S]*?return undefined;[\s\S]*?\}/
  );
  assertAppearsInOrder(source, [
    'const shouldTrackRemoteAutomatic = isRemoteOllama && isAutomaticTrigger;',
    'let requestId: number | undefined;',
    'if (!shouldTrackRemoteAutomatic) {',
    'requestId = this.invalidateActiveRemoteRequestLifecycle();',
    'const currentLine = document.lineAt(position.line).text;',
  ]);
  assert.match(source, /requestId \?\?= \+\+this\.requestCounter;/);
});

test('inline provider invalidates stale remote lifecycle on provider changes', () => {
  const source = readSource('src/features/inlineCompletionProvider.ts');

  assert.match(
    source,
    /this\.providerManager\.onDidChangeProvider\(\(\) => \{[\s\S]*?this\.invalidateActiveRemoteRequestLifecycle\(\);[\s\S]*?\}\)/
  );
});

test('inline provider clears slow timer on tracked cancellation and empty-result exits', () => {
  const source = readSource('src/features/inlineCompletionProvider.ts');

  assert.match(
    source,
    /if \(wasCancelled \|\| token\.isCancellationRequested\) \{[\s\S]*?this\.clearRemoteRequestLifecycle\(activeProvider\.info, requestId, 'cancelled'\);[\s\S]*?return undefined;[\s\S]*?\}/
  );
  assert.match(
    source,
    /if \(token\.isCancellationRequested\) \{[\s\S]*?this\.clearRemoteRequestLifecycle\(activeProvider\.info, requestId, 'cancelled'\);[\s\S]*?return undefined;[\s\S]*?\}/
  );
  assert.match(
    source,
    /if \(!response\.text\) \{[\s\S]*?this\.clearRemoteRequestLifecycle\(activeProvider\.info, requestId\);[\s\S]*?return undefined;[\s\S]*?\}/
  );
  assert.match(
    source,
    /if \(!cleanedText\) \{[\s\S]*?this\.clearRemoteRequestLifecycle\(activeProvider\.info, requestId\);[\s\S]*?return undefined;[\s\S]*?\}/
  );
});

test('inline provider scopes remote lifecycle cleanup to the owning request id', () => {
  const source = readSource('src/features/inlineCompletionProvider.ts');

  assert.match(source, /private activeRequestStatusId: number \| undefined;/);
  assert.match(
    source,
    /private beginRemoteRequestLifecycle\([\s\S]*?requestId: number,[\s\S]*?\): void \{[\s\S]*?this\.activeRequestStatusId = requestId;[\s\S]*?this\.setRequestStatus\(\{[\s\S]*?kind: 'waiting'/
  );
  assert.match(
    source,
    /private ownsRemoteRequestLifecycle\(requestId: number\): boolean \{[\s\S]*?return this\.activeRequestStatusId === requestId;[\s\S]*?\}/
  );
  assert.match(
    source,
    /private clearRemoteRequestLifecycle\([\s\S]*?requestId: number,[\s\S]*?\): void \{[\s\S]*?if \(!force && !this\.ownsRemoteRequestLifecycle\(requestId\)\) \{[\s\S]*?return;[\s\S]*?\}/
  );
  assert.match(
    source,
    /private scheduleRequestStatusClear\(requestId: number, delayMs = 900\): void \{[\s\S]*?if \(!this\.ownsRemoteRequestLifecycle\(requestId\)\) \{[\s\S]*?return;[\s\S]*?\}/
  );
  assert.match(
    source,
    /this\.requestStatusClearTimer = setTimeout\(\(\) => \{[\s\S]*?if \(!this\.ownsRemoteRequestLifecycle\(requestId\)\) \{[\s\S]*?return;[\s\S]*?\}/
  );
  assert.match(source, /this\.scheduleRequestStatusClear\(requestId\);/);
  assert.match(
    source,
    /if \(this\.ownsRemoteRequestLifecycle\(requestId\) && this\.requestStatus\.kind === 'waiting'\)/
  );
});

test('extension refreshes status bar from inline request status changes', () => {
  const source = readSource('src/extension.ts');

  assert.match(
    source,
    /inlineProvider\.onDidChangeRequestStatus\(\(\) => refreshStatusBar\(\)\)/
  );
  assert.match(source, /const requestStatus = inlineProvider\?\.getRequestStatus\(\);/);
  assert.match(
    source,
    /const activeRequestStatus = requestStatus\?\.providerId === info\.id\s*\? requestStatus\s*: undefined;/
  );
  assert.match(source, /requestStatus: activeRequestStatus,/);
});
