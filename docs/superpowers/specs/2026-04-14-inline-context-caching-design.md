# Inline Context Caching Design

## Goal

Reduce repeated pre-provider work during inline completion by caching expensive request-assembly inputs for nearby cursor states in the same document version and for repeated symbol/snippet lookups across requests.

## Problem Summary

NoPilot already caches final inline completion text by provider/model/profile scope and nearby prefix/suffix state. That avoids repeated provider calls, but request assembly still repeats expensive work:

- rebuilding derived additional context for repeated inline requests in the same document version
- re-running workspace symbol lookups for the same referenced words
- re-reading workspace files and re-slicing snippets for the same symbol/file hits

These costs are paid before the provider call and can stack up while typing, especially in files that trigger additional context assembly.

## Scope

Included in this slice:
- document-version-scoped caching for derived inline additional context
- symbol/snippet caching for repeated semantic and file-based lookup results
- safe invalidation with document version and provider/model/profile scope changes
- observable cache hit/miss behavior through tests or logs

Excluded from this slice:
- final inline text cache changes
- provider-specific caching behavior
- larger parser-based context analysis

## Recommended Architecture

Introduce a dedicated cache helper module for inline request assembly, separate from the existing final completion cache in `NoPilotInlineCompletionProvider`.

The cache is split into two layers:

### 1. Derived Context Cache

This cache stores the final `additionalContext` string for a narrow inline request context.

Key inputs:
- `document.uri`
- `document.version`
- provider/model/profile scope
- whether `includeAdditionalContext` is enabled
- current language
- prefix start line / suffix budget relevant to the request
- extracted referenced words

Purpose:
- avoid rebuilding the same top-of-file context, open-doc snippets, and referenced-symbol snippets while the user keeps typing in nearby positions in the same document version

### 2. Symbol/Snippet Cache

This cache stores reusable lookup results behind the derived context assembly:

- symbol lookup results by `word`
- resolved snippet text for a symbol/file lookup

Key inputs:
- workspace lookup word
- current file extension
- current document URI when excluding self references

Purpose:
- avoid repeating `vscode.executeWorkspaceSymbolProvider`
- avoid repeating `workspace.findFiles`
- avoid repeating `workspace.fs.readFile` and snippet slicing for the same result

## Module Boundary

Add a new module under `src/features/` with responsibilities limited to request-assembly caching:

- cache key construction
- cache lookup/store helpers
- safe invalidation methods
- instrumentation hooks for cache hits/misses

`NoPilotInlineCompletionProvider` should remain the orchestrator:
- compute prefix/suffix as it already does
- delegate additional-context assembly to the cache helper
- keep the existing final inline completion cache unchanged

## Invalidation Rules

### Derived Context Cache

Invalidate when:
- `document.version` changes
- provider/model/profile scope changes
- `includeAdditionalContext` is false

Practical approach:
- include document version and scope in the key so the cache safely rolls over without global mutation
- opportunistically prune old entries with a bounded LRU limit

### Symbol/Snippet Cache

Invalidate when:
- a referenced file is changed or closed
- a workspace text document changes in a way that could affect lookup reuse
- the cached snippet entry ages out of the bounded cache

Practical approach:
- key by lookup inputs and store URI/version metadata with the cached result
- if a cached file-backed snippet refers to a URI whose open document version changed, treat it as stale
- keep the cache bounded to prevent unbounded growth

## Request Flow After Change

1. Inline provider computes request policy, prefix, and suffix.
2. If additional context is disabled, request assembly behaves as before.
3. If additional context is enabled:
   - build a derived-context cache key
   - try derived-context cache first
   - if missed, assemble context using symbol/snippet cache helpers
   - store the final assembled `additionalContext`
4. Build the completion request and continue with provider execution.

## Observability

Add lightweight logs so cache behavior is visible during debugging:

- `Inline context cache hit`
- `Inline context cache miss`
- `Inline symbol cache hit`
- `Inline symbol cache miss`

Tests should also make behavior observable by asserting that expensive resolvers are not called on repeated requests with stable keys.

## Testing Strategy

Add focused tests for the cache helper module rather than trying to fake the full VS Code provider flow.

Core assertions:
- repeated derived-context requests with the same document version reuse cached output
- changing the document version yields a miss
- repeated symbol lookups for the same word reuse cached snippet results
- cache keys remain isolated when provider/model/profile scope changes

## Tradeoffs

### Why split the caches?

Because document-version context and symbol/snippet reuse have different invalidation shapes:

- document-derived context is tightly coupled to a single document version
- symbol/snippet reuse is broader and can survive across nearby requests until file state changes

Keeping them separate makes invalidation easier to reason about and keeps tests focused.

### Why not cache the whole request?

Caching the whole request would make keys too large and brittle, and it would blur responsibility between:

- prefix/suffix extraction
- additional-context assembly
- final completion response caching

This design targets the expensive repeated work without replacing the existing response cache.

## Success Criteria Mapping

- Repeated inline requests do less redundant pre-provider work.
  - Achieved by derived-context and symbol/snippet caching.
- Cache invalidation is safe with document/provider/model changes.
  - Achieved by keying with document version and scope plus bounded stale-entry handling.
- Instrumentation or tests make cache behavior observable.
  - Achieved by focused cache tests and hit/miss logging.
