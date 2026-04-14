# Inline Function Block Context Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce repeated automatic inline suggestions by providing the current function/block context to automatic completion prompts.

**Architecture:** Add a small brace-based block extraction helper in `src/features`, pass the extracted block through `CompletionRequest`, and teach the automatic prompt to include that context and avoid repeating code already present inside it. Keep the feature optional so unsupported languages and unmatched blocks continue using the existing prefix/suffix-only flow.

**Tech Stack:** TypeScript, Node test runner

---

### Task 1: Lock the new behavior with failing tests

**Files:**
- Create: `src/features/inlineBlockContext.test.ts`
- Modify: `src/providers/prompts.test.ts`
- Modify: `package.json`

- [ ] **Step 1: Write failing block-extraction tests**

Add tests that show a brace-delimited function body is extracted around the cursor and that extraction returns `undefined` when no containing block is found.

- [ ] **Step 2: Write a failing prompt test**

Add a prompt test that verifies automatic inline prompts include the current block context and a no-repeat instruction when `currentBlockContext` is provided.

- [ ] **Step 3: Run the focused tests**

Run: `npx tsc -p tsconfig.test.json && node --test .test-dist/features/inlineBlockContext.test.js .test-dist/providers/prompts.test.js`
Expected: FAIL on the new assertions.

### Task 2: Add current block extraction

**Files:**
- Create: `src/features/inlineBlockContext.ts`
- Test: `src/features/inlineBlockContext.test.ts`

- [ ] **Step 1: Implement a lightweight brace-based extractor**

Scan backward to find the containing unmatched `{`, then forward to the matching `}`. Return the block body with the cursor position preserved inside the captured context.

- [ ] **Step 2: Re-run focused extraction tests**

Run: `npx tsc -p tsconfig.test.json && node --test .test-dist/features/inlineBlockContext.test.js`
Expected: PASS

### Task 3: Thread block context into automatic inline requests

**Files:**
- Modify: `src/types.ts`
- Modify: `src/features/inlineCompletionProvider.ts`
- Modify: `src/providers/prompts.ts`
- Test: `src/providers/prompts.test.ts`

- [ ] **Step 1: Add `currentBlockContext` to `CompletionRequest`**

Keep it optional so explicit requests and unsupported files are unaffected.

- [ ] **Step 2: Populate block context only for automatic inline requests**

Use the new helper during request construction and cap the extracted context to a reasonable size before adding it to the request.

- [ ] **Step 3: Update the automatic prompt**

Include `<CURRENT_BLOCK>` when present and add a rule telling the model not to repeat code already present in that block.

- [ ] **Step 4: Re-run focused prompt tests**

Run: `npx tsc -p tsconfig.test.json && node --test .test-dist/features/inlineBlockContext.test.js .test-dist/providers/prompts.test.js`
Expected: PASS

### Task 4: Full verification

**Files:**
- Modify: none unless verification reveals a follow-up fix

- [ ] **Step 1: Run full verification**

Run: `npm test && npm run compile && npm run lint && npm run build`
Expected: all commands exit 0

- [ ] **Step 2: Update issue #20 with a short implementation summary**
