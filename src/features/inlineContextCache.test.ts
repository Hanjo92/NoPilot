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
    contextFlavor: 'full',
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

test('different provider scopes do not share derived context entries', async () => {
  const cache = new InlineRequestAssemblyCache();
  let builds = 0;
  const openAiKey = buildDerivedContextCacheKey({
    scope: 'openai::gpt-4o-mini::balanced',
    documentUri: 'file:///repo/sample.ts',
    documentVersion: 3,
    language: 'typescript',
    contextFlavor: 'full',
    prefixStartLine: 10,
    referencedWords: ['ShopModel'],
  });
  const ollamaKey = buildDerivedContextCacheKey({
    scope: 'ollama::qwen2.5-coder:7b::balanced',
    documentUri: 'file:///repo/sample.ts',
    documentVersion: 3,
    language: 'typescript',
    contextFlavor: 'full',
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

test('different document versions do not share derived context entries', async () => {
  const cache = new InlineRequestAssemblyCache();
  let builds = 0;
  const versionThreeKey = buildDerivedContextCacheKey({
    scope: 'openai::gpt-4o-mini::balanced',
    documentUri: 'file:///repo/sample.ts',
    documentVersion: 3,
    language: 'typescript',
    contextFlavor: 'full',
    prefixStartLine: 10,
    referencedWords: ['ShopModel'],
  });
  const versionFourKey = buildDerivedContextCacheKey({
    scope: 'openai::gpt-4o-mini::balanced',
    documentUri: 'file:///repo/sample.ts',
    documentVersion: 4,
    language: 'typescript',
    contextFlavor: 'full',
    prefixStartLine: 10,
    referencedWords: ['ShopModel'],
  });

  await cache.getDerivedContext(versionThreeKey, async () => {
    builds += 1;
    return { value: '// v3 context', dependencyUris: ['file:///repo/sample.ts'] };
  });
  await cache.getDerivedContext(versionFourKey, async () => {
    builds += 1;
    return { value: '// v4 context', dependencyUris: ['file:///repo/sample.ts'] };
  });

  assert.equal(builds, 2);
});

test('different context flavors do not share derived context entries', async () => {
  const cache = new InlineRequestAssemblyCache();
  let builds = 0;
  const lightKey = buildDerivedContextCacheKey({
    scope: 'openai::gpt-4o-mini::balanced',
    documentUri: 'file:///repo/sample.ts',
    documentVersion: 3,
    language: 'typescript',
    contextFlavor: 'light',
    prefixStartLine: 10,
    referencedWords: ['ShopModel'],
  });
  const fullKey = buildDerivedContextCacheKey({
    scope: 'openai::gpt-4o-mini::balanced',
    documentUri: 'file:///repo/sample.ts',
    documentVersion: 3,
    language: 'typescript',
    contextFlavor: 'full',
    prefixStartLine: 10,
    referencedWords: ['ShopModel'],
  });

  await cache.getDerivedContext(lightKey, async () => {
    builds += 1;
    return { value: '// light context', dependencyUris: ['file:///repo/sample.ts'] };
  });
  await cache.getDerivedContext(fullKey, async () => {
    builds += 1;
    return { value: '// full context', dependencyUris: ['file:///repo/sample.ts'] };
  });

  assert.equal(builds, 2);
});

test('symbol snippet cache reuses the same lookup key', async () => {
  const cache = new InlineRequestAssemblyCache();
  let builds = 0;
  const key = buildSymbolSnippetCacheKey({
    word: 'ShopModel',
    extension: '.ts',
    excludeUri: 'file:///repo/current.ts',
  });

  const first = await cache.getSymbolSnippet(key, async () => {
    builds += 1;
    return {
      value: '// symbol snippet',
      dependencyUris: ['file:///repo/ShopModel.ts'],
    };
  });
  const second = await cache.getSymbolSnippet(key, async () => {
    builds += 1;
    return {
      value: '// newer snippet',
      dependencyUris: ['file:///repo/ShopModel.ts'],
    };
  });

  assert.equal(first.hit, false);
  assert.equal(second.hit, true);
  assert.equal(second.value, '// symbol snippet');
  assert.equal(builds, 1);
});

test('clearing symbol lookups drops cached symbol entries without touching derived context', async () => {
  const cache = new InlineRequestAssemblyCache();

  await cache.getDerivedContext('derived-key', async () => ({
    value: '// context',
    dependencyUris: ['file:///repo/current.ts'],
  }));
  await cache.getSymbolSnippet('symbol-key', async () => ({
    value: '// symbol snippet',
    dependencyUris: ['file:///repo/ShopModel.ts'],
  }));

  cache.clearSymbolLookups();

  const derived = await cache.getDerivedContext('derived-key', async () => ({
    value: '// rebuilt context',
    dependencyUris: ['file:///repo/current.ts'],
  }));
  const symbol = await cache.getSymbolSnippet('symbol-key', async () => ({
    value: '// rebuilt symbol',
    dependencyUris: ['file:///repo/ShopModel.ts'],
  }));

  assert.equal(derived.hit, true);
  assert.equal(symbol.hit, false);
});
