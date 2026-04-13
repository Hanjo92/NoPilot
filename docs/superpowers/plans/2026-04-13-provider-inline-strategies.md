# Provider Inline Strategies Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make inline completion behavior explicit per provider family by routing prompt, stop, and max-token handling through a reusable strategy module.

**Architecture:** Add a provider-facing `inlineStrategies` module that resolves a normalized inline completion config for each provider family. Keep shared prompt helpers reusable, but move provider-specific branching out of the individual provider classes so the differences are testable in one place.

**Tech Stack:** TypeScript, VS Code extension APIs, existing provider adapters, Node test runner

---

### Task 1: Add strategy module tests first

**Files:**
- Create: `src/providers/inlineStrategies.test.ts`
- Modify: `package.json`
- Reference: `src/providers/prompts.ts`

- [ ] **Step 1: Write the failing test**

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import { buildInlineCompletionConfig } from './inlineStrategies';

test('chat providers keep shared stop sequences and token budgets', () => {
  const config = buildInlineCompletionConfig('openai', {
    mode: 'automatic',
    prefix: 'const value = ',
    suffix: '',
    language: 'typescript',
    filename: 'example.ts',
    stopSequences: ['\n'],
    maxTokens: 96,
  });

  assert.deepEqual(config.stopSequences, ['\n']);
  assert.equal(config.maxTokens, 96);
  assert.match(config.prompt, /Complete the code at <CURSOR>/);
});

test('vscode lm uses prompt-directed stopping instead of transport stop sequences', () => {
  const config = buildInlineCompletionConfig('vscode-lm', {
    mode: 'automatic',
    prefix: 'const value = ',
    suffix: '',
    language: 'typescript',
    filename: 'example.ts',
    stopSequences: ['\n'],
    maxTokens: 192,
  });

  assert.equal(config.stopSequences, undefined);
  assert.equal(config.maxTokens, 128);
  assert.match(config.prompt, /CRITICAL DIRECTIVE/);
});

test('ollama uses a local inline prompt and tighter automatic cap', () => {
  const config = buildInlineCompletionConfig('ollama', {
    mode: 'automatic',
    prefix: 'const value = ',
    suffix: '',
    language: 'typescript',
    filename: 'example.ts',
    stopSequences: ['\n'],
    maxTokens: 192,
  });

  assert.deepEqual(config.stopSequences, ['\n']);
  assert.equal(config.maxTokens, 160);
  assert.match(config.prompt, /Return only the missing code at the cursor/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsc -p tsconfig.test.json && node --test .test-dist/providers/inlineStrategies.test.js`
Expected: FAIL because `inlineStrategies` does not exist yet.

- [ ] **Step 3: Register the new test file in the shared test command**

```json
"test": "tsc -p tsconfig.test.json && node --test ... .test-dist/providers/inlineStrategies.test.js ..."
```

- [ ] **Step 4: Run the focused test command again**

Run: `npx tsc -p tsconfig.test.json && node --test .test-dist/providers/inlineStrategies.test.js`
Expected: FAIL with missing implementation assertions instead of missing-file errors.

- [ ] **Step 5: Commit**

```bash
git add package.json src/providers/inlineStrategies.test.ts
git commit -m "test: add inline strategy coverage"
```

### Task 2: Implement the strategy module

**Files:**
- Create: `src/providers/inlineStrategies.ts`
- Modify: `src/providers/prompts.ts`
- Test: `src/providers/inlineStrategies.test.ts`

- [ ] **Step 1: Write the minimal strategy implementation**

```ts
import { CompletionRequest, ProviderId } from '../types';
import { buildCompletionPrompt } from './prompts';

export interface ResolvedInlineCompletionConfig {
  prompt: string;
  maxTokens: number;
  stopSequences?: string[];
}

export function buildInlineCompletionConfig(
  providerId: ProviderId,
  request: CompletionRequest
): ResolvedInlineCompletionConfig {
  if (providerId === 'vscode-lm') {
    const prompt = buildCompletionPrompt(request) +
      '\n\nCRITICAL DIRECTIVE: The user expects a SINGLE-LINE completion or a partial line completion. You MUST NOT output any newline character. STOP IMMEDIATELY after writing the rest of the current line.';
    return {
      prompt,
      maxTokens: Math.min(request.maxTokens ?? 256, request.mode === 'automatic' ? 128 : 256),
      stopSequences: undefined,
    };
  }

  if (providerId === 'ollama') {
    return {
      prompt: `Return only the missing code at the cursor.\nLanguage: ${request.language}\nFile: ${request.filename}\n<CONTEXT_BEFORE>${request.prefix}</CONTEXT_BEFORE><CURSOR><CONTEXT_AFTER>${request.suffix}</CONTEXT_AFTER>`,
      maxTokens: Math.min(request.maxTokens ?? 256, request.mode === 'automatic' ? 160 : 256),
      stopSequences: request.stopSequences,
    };
  }

  return {
    prompt: buildCompletionPrompt(request),
    maxTokens: request.maxTokens ?? 256,
    stopSequences: request.stopSequences,
  };
}
```

- [ ] **Step 2: Keep shared prompt helpers reusable**

```ts
export function buildVscodeLmStopDirective(): string {
  return 'CRITICAL DIRECTIVE: The user expects a SINGLE-LINE completion or a partial line completion. You MUST NOT output any newline character. STOP IMMEDIATELY after writing the rest of the current line.';
}
```

- [ ] **Step 3: Run focused tests**

Run: `npx tsc -p tsconfig.test.json && node --test .test-dist/providers/inlineStrategies.test.js .test-dist/providers/prompts.test.js`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/providers/inlineStrategies.ts src/providers/prompts.ts src/providers/inlineStrategies.test.ts package.json
git commit -m "feat: add inline provider strategies"
```

### Task 3: Wire providers to the strategy resolver

**Files:**
- Modify: `src/providers/openaiProvider.ts`
- Modify: `src/providers/anthropicProvider.ts`
- Modify: `src/providers/geminiProvider.ts`
- Modify: `src/providers/ollamaProvider.ts`
- Modify: `src/providers/vscodeLmProvider.ts`
- Reference: `src/providers/inlineStrategies.ts`

- [ ] **Step 1: Replace per-provider inline prompt/max-token/stop wiring**

```ts
const inlineConfig = buildInlineCompletionConfig(this._info.id, request);
```

- [ ] **Step 2: Use resolved values in each provider transport**

```ts
messages: [{ role: 'user', content: inlineConfig.prompt }]
max_tokens: inlineConfig.maxTokens
stop: inlineConfig.stopSequences
```

- [ ] **Step 3: Remove duplicated VS Code LM newline-stop prompt logic**

```ts
const inlineConfig = buildInlineCompletionConfig(this._info.id, request);
const messages = [vscode.LanguageModelChatMessage.User(inlineConfig.prompt)];
```

- [ ] **Step 4: Run provider-related tests**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/providers/openaiProvider.ts src/providers/anthropicProvider.ts src/providers/geminiProvider.ts src/providers/ollamaProvider.ts src/providers/vscodeLmProvider.ts src/providers/inlineStrategies.ts src/providers/prompts.ts src/providers/inlineStrategies.test.ts package.json
git commit -m "refactor: route providers through inline strategies"
```

### Task 4: Final verification and issue update

**Files:**
- Modify: none required unless verification reveals follow-up fixes

- [ ] **Step 1: Run full verification**

Run: `npm test && npm run compile && npm run lint && npm run build`
Expected: all commands exit 0

- [ ] **Step 2: Review diff for scope**

Run: `git diff --stat main...HEAD`
Expected: only inline strategy and provider wiring changes

- [ ] **Step 3: Add an issue update comment**

```text
Summarize strategy families, provider differences, and verification commands for issue #8.
```

- [ ] **Step 4: Prepare publish flow**

```bash
git status --short
```
