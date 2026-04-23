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
  assert.match(source, /kind: 'cancelled'/);
  assert.match(source, /kind: 'connection-problem'/);
});

test('extension refreshes status bar from inline request status changes', () => {
  const source = readSource('src/extension.ts');

  assert.match(
    source,
    /inlineProvider\.onDidChangeRequestStatus\(\(\) => refreshStatusBar\(\)\)/
  );
  assert.match(source, /requestStatus: inlineProvider\?\.getRequestStatus\(\),/);
});
