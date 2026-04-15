export interface CachedValue<T> {
  value: T;
  dependencyUris: string[];
}

export interface CacheLookupResult<T> {
  value: T;
  hit: boolean;
  dependencyUris: string[];
}

interface DerivedContextKeyInput {
  scope: string;
  documentUri: string;
  documentVersion: number;
  language: string;
  contextFlavor: string;
  prefixStartLine: number;
  referencedWords: string[];
}

interface SymbolSnippetKeyInput {
  word: string;
  extension: string;
  excludeUri: string;
}

interface CacheEntry<T> extends CachedValue<T> {
  cacheKey: string;
}

const DEFAULT_DERIVED_CONTEXT_CACHE_SIZE = 60;
const DEFAULT_SYMBOL_SNIPPET_CACHE_SIZE = 120;

function normalizeDependencyUris(dependencyUris: string[]): string[] {
  return Array.from(new Set(dependencyUris.filter((uri) => uri.length > 0)));
}

export function buildDerivedContextCacheKey(input: DerivedContextKeyInput): string {
  return [
    input.scope,
    input.documentUri,
    `v${input.documentVersion}`,
    input.language,
    `ctx:${input.contextFlavor}`,
    `line:${input.prefixStartLine}`,
    input.referencedWords.join(','),
  ].join('|');
}

export function buildSymbolSnippetCacheKey(input: SymbolSnippetKeyInput): string {
  return [input.word, input.extension, input.excludeUri].join('|');
}

export class InlineRequestAssemblyCache {
  private readonly derivedContextCache = new Map<string, CacheEntry<string>>();
  private readonly symbolSnippetCache = new Map<string, CacheEntry<string>>();
  private derivedContextKeys: string[] = [];
  private symbolSnippetKeys: string[] = [];

  constructor(
    private readonly maxDerivedContextEntries = DEFAULT_DERIVED_CONTEXT_CACHE_SIZE,
    private readonly maxSymbolSnippetEntries = DEFAULT_SYMBOL_SNIPPET_CACHE_SIZE
  ) {}

  async getDerivedContext(
    cacheKey: string,
    build: () => Promise<CachedValue<string>>
  ): Promise<CacheLookupResult<string>> {
    return this.getOrBuild(
      this.derivedContextCache,
      cacheKey,
      build,
      this.maxDerivedContextEntries,
      (nextKeys) => {
        this.derivedContextKeys = nextKeys;
      },
      this.derivedContextKeys
    );
  }

  async getSymbolSnippet(
    cacheKey: string,
    build: () => Promise<CachedValue<string>>
  ): Promise<CacheLookupResult<string>> {
    return this.getOrBuild(
      this.symbolSnippetCache,
      cacheKey,
      build,
      this.maxSymbolSnippetEntries,
      (nextKeys) => {
        this.symbolSnippetKeys = nextKeys;
      },
      this.symbolSnippetKeys
    );
  }

  invalidateDocument(uri: string): void {
    this.removeEntriesByDependency(this.derivedContextCache, uri, (nextKeys) => {
      this.derivedContextKeys = nextKeys;
    });
    this.removeEntriesByDependency(this.symbolSnippetCache, uri, (nextKeys) => {
      this.symbolSnippetKeys = nextKeys;
    });
  }

  clearDerivedContexts(): void {
    this.derivedContextCache.clear();
    this.derivedContextKeys = [];
  }

  clearSymbolLookups(): void {
    this.symbolSnippetCache.clear();
    this.symbolSnippetKeys = [];
  }

  private async getOrBuild(
    cache: Map<string, CacheEntry<string>>,
    cacheKey: string,
    build: () => Promise<CachedValue<string>>,
    maxEntries: number,
    updateKeys: (nextKeys: string[]) => void,
    keys: string[]
  ): Promise<CacheLookupResult<string>> {
    const cached = cache.get(cacheKey);
    if (cached) {
      return {
        value: cached.value,
        hit: true,
        dependencyUris: cached.dependencyUris,
      };
    }

    const built = await build();
    const entry: CacheEntry<string> = {
      cacheKey,
      value: built.value,
      dependencyUris: normalizeDependencyUris(built.dependencyUris),
    };

    cache.set(cacheKey, entry);
    const nextKeys = [...keys, cacheKey];

    while (nextKeys.length > maxEntries) {
      const oldestKey = nextKeys.shift();
      if (oldestKey) {
        cache.delete(oldestKey);
      }
    }

    updateKeys(nextKeys);

    return {
      value: entry.value,
      hit: false,
      dependencyUris: entry.dependencyUris,
    };
  }

  private removeEntriesByDependency(
    cache: Map<string, CacheEntry<string>>,
    uri: string,
    updateKeys: (nextKeys: string[]) => void
  ): void {
    const nextKeys: string[] = [];

    for (const [cacheKey, entry] of cache.entries()) {
      if (entry.dependencyUris.includes(uri)) {
        cache.delete(cacheKey);
        continue;
      }

      nextKeys.push(cacheKey);
    }

    updateKeys(nextKeys);
  }
}
