# Inline Context Caching Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cache expensive inline request-assembly inputs so repeated typing in nearby cursor states does less work before the provider call.

**Architecture:** Add a dedicated request-assembly cache module under `src/features/` with two bounded caches: one for derived `additionalContext` strings and one for symbol/snippet lookup reuse. Keep `NoPilotInlineCompletionProvider` as the orchestrator, but move cache bookkeeping and invalidation out of the main provider body so the behavior is testable in isolation.

**Tech Stack:** TypeScript, VS Code extension APIs, Node test runner

---

### Task 1: Add cache module tests first

**Files:**
- Create: `src/features/inlineContextCache.test.ts`
- Modify: `tsconfig.test.json`
- Modify: `package.json`

- [ ] **Step 1: Write the failing test**

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  InlineRequestAssemblyCache,
  buildDerivedContextCacheKey,
  buildSymbolSnippetCacheKey,
} from './inlineContextCache';

test('derived context cache reuses the same document-version key', async () => {
  const cache = new InlineRequestAssemblyCache();
  let builds = 0;
  const key = buildDerivedContextCacheKey({
    scope: 'openai::gpt-4o-mini::balanced',
    documentUri: 'file:///repo/sample.ts',
    documentVersion: 3,
    language: 'typescript',
    prefixStartLine: 10,
    referencedWords: ['ShopModel'],
  });

  const first = await cache.getDerivedContext(key, async () => {
    builds += 1;
    return {
      value: '// context',
      dependencyUris: ['file:///repo/sample.ts', 'file:///repo/ShopModel.ts'],
    };
  });
  const second = await cache.getDerivedContext(key, async () => {
    builds += 1;
    return {
      value: '// newer context',
      dependencyUris: ['file:///repo/sample.ts'],
    };
  });

  assert.equal(first.hit, false);
  assert.equal(second.hit, true);
  assert.equal(second.value, '// context');
  assert.equal(builds, 1);
});

test('invalidating a dependency uri clears derived and symbol entries', async () => {
  const cache = new InlineRequestAssemblyCache();
  await cache.getDerivedContext('derived-key', async () => ({
    value: '// context',
    dependencyUris: ['file:///repo/ShopModel.ts'],
  }));
  await cache.getSymbolSnippet('symbol-key', async () => ({
    value: '// symbol snippet',
    dependencyUris: ['file:///repo/ShopModel.ts'],
  }));

  cache.invalidateDocument('file:///repo/ShopModel.ts');

  const derived = await cache.getDerivedContext('derived-key', async () => ({
    value: '// rebuilt',
    dependencyUris: ['file:///repo/ShopModel.ts'],
  }));
  const symbol = await cache.getSymbolSnippet('symbol-key', async () => ({
    value: '// rebuilt symbol',
    dependencyUris: ['file:///repo/ShopModel.ts'],
  }));

  assert.equal(derived.hit, false);
  assert.equal(symbol.hit, false);
});

test('different provider/model/profile scopes do not share derived context entries', async () => {
  const cache = new InlineRequestAssemblyCache();
  let builds = 0;
  const openAiKey = buildDerivedContextCacheKey({
    scope: 'openai::gpt-4o-mini::balanced',
    documentUri: 'file:///repo/sample.ts',
    documentVersion: 3,
    language: 'typescript',
    prefixStartLine: 10,
    referencedWords: ['ShopModel'],
  });
  const ollamaKey = buildDerivedContextCacheKey({
    scope: 'ollama::qwen2.5-coder:7b::balanced',
    documentUri: 'file:///repo/sample.ts',
    documentVersion: 3,
    language: 'typescript',
    prefixStartLine: 10,
    referencedWords: ['ShopModel'],
  });

  await cache.getDerivedContext(openAiKey, async () => {
    builds += 1;
    return { value: '// openai context', dependencyUris: ['file:///repo/sample.ts'] };
  });
  await cache.getDerivedContext(ollamaKey, async () => {
    builds += 1;
    return { value: '// ollama context', dependencyUris: ['file:///repo/sample.ts'] };
  });

  assert.equal(builds, 2);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsc -p tsconfig.test.json && node --test .test-dist/features/inlineContextCache.test.js`
Expected: FAIL because `inlineContextCache` does not exist yet.

- [ ] **Step 3: Register the new test file**

```json
"src/features/inlineContextCache.ts",
"src/features/inlineContextCache.test.ts"
```

```json
".test-dist/features/inlineContextCache.test.js"
```

- [ ] **Step 4: Run the focused test again**

Run: `npx tsc -p tsconfig.test.json && node --test .test-dist/features/inlineContextCache.test.js`
Expected: FAIL on missing implementation assertions instead of missing-file errors.

- [ ] **Step 5: Commit**

```bash
git add tsconfig.test.json package.json src/features/inlineContextCache.test.ts
git commit -m "test: add inline context cache coverage"
```

### Task 2: Implement the cache helper

**Files:**
- Create: `src/features/inlineContextCache.ts`
- Test: `src/features/inlineContextCache.test.ts`

- [ ] **Step 1: Add the cache types and bounded maps**

```ts
export interface CachedValue<T> {
  value: T;
  dependencyUris: string[];
}

export interface CacheLookupResult<T> {
  value: T;
  hit: boolean;
}

export class InlineRequestAssemblyCache {
  // derived context cache + symbol/snippet cache
}
```

- [ ] **Step 2: Add cache key helpers**

```ts
export function buildDerivedContextCacheKey(input: {
  scope: string;
  documentUri: string;
  documentVersion: number;
  language: string;
  prefixStartLine: number;
  referencedWords: string[];
}): string

export function buildSymbolSnippetCacheKey(input: {
  word: string;
  extension: string;
  excludeUri: string;
}): string
```

- [ ] **Step 3: Add dependency-based invalidation**

```ts
invalidateDocument(uri: string): void
clearSymbolLookups(): void
```

- [ ] **Step 4: Run focused cache tests**

Run: `npx tsc -p tsconfig.test.json && node --test .test-dist/features/inlineContextCache.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/inlineContextCache.ts src/features/inlineContextCache.test.ts package.json tsconfig.test.json
git commit -m "feat: add inline request assembly cache"
```

### Task 3: Wire the cache into inline request assembly

**Files:**
- Modify: `src/features/inlineCompletionProvider.ts`
- Reference: `src/features/inlineText.ts`
- Reference: `src/features/inlineContextCache.ts`

- [ ] **Step 1: Add provider-owned cache and invalidation listeners**

```ts
private readonly requestAssemblyCache = new InlineRequestAssemblyCache();
```

```ts
vscode.workspace.onDidChangeTextDocument((event) => {
  this.requestAssemblyCache.invalidateDocument(event.document.uri.toString());
  this.requestAssemblyCache.clearSymbolLookups();
});
```

- [ ] **Step 2: Extract additional-context assembly into helper methods**

```ts
private async buildAdditionalContext(...)
private async resolveReferencedSymbolSnippet(...)
```

- [ ] **Step 3: Use derived-context cache before rebuilding expensive context**

```ts
const cachedContext = await this.requestAssemblyCache.getDerivedContext(cacheKey, async () => ({
  value: additionalContext.trim(),
  dependencyUris: Array.from(dependencyUris),
}));
```

- [ ] **Step 4: Add cache hit/miss logs**

```ts
log(`Inline context cache ${cachedContext.hit ? 'hit' : 'miss'}: ...`);
log(`Inline symbol cache ${cachedSnippet.hit ? 'hit' : 'miss'}: ${word}`);
```

- [ ] **Step 5: Run focused tests**

Run: `npm test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/features/inlineCompletionProvider.ts src/features/inlineContextCache.ts src/features/inlineContextCache.test.ts package.json tsconfig.test.json
git commit -m "perf: cache inline request assembly"
```

### Task 4: Final verification and issue update

**Files:**
- Modify: none required unless verification reveals a fix

- [ ] **Step 1: Run full verification**

Run: `npm test && npm run compile && npm run lint && npm run build`
Expected: all commands exit 0

- [ ] **Step 2: Review diff scope**

Run: `git diff --stat main...HEAD`
Expected: only inline caching and supporting docs/tests changed

- [ ] **Step 3: Update issue #9**

```text
Summarize derived-context caching, symbol/snippet caching, invalidation behavior, and verification commands.
```

- [ ] **Step 4: Prepare publish flow**

```bash
git status --short
```
