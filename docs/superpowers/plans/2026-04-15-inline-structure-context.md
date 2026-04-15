# Inline Structure Context Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve inline completion quality by adding a compact current-file structure summary and one capped similar-file sample to inline request context without turning automatic completions into heavy prompts.

**Architecture:** Add a focused helper module in `src/features` that can build a compact structure summary for the current file and select one similar-file sample from a small candidate set. Reuse the existing request-assembly cache by composing the new outputs into the existing `additionalContext` string inside `NoPilotInlineCompletionProvider`.

**Tech Stack:** TypeScript, Node test runner, VS Code extension APIs

---

### Task 1: Lock the pure context heuristics with failing tests

**Files:**
- Create: `src/features/inlineProjectContext.ts`
- Create: `src/features/inlineProjectContext.test.ts`
- Modify: `tsconfig.test.json`
- Modify: `package.json`

- [ ] **Step 1: Write failing tests for current-file structure summaries**

Cover a script-like file with a class and several methods. Assert that the summary includes the filename and compact declaration lines, but excludes method bodies and stays bounded.

- [ ] **Step 2: Write failing tests for similar-file selection**

Cover:
- preferring a same-language open-file candidate with strong filename overlap
- skipping weak candidates
- keeping the returned sample bounded

- [ ] **Step 3: Run the focused test file**

Run: `npx tsc -p tsconfig.test.json && node --test .test-dist/features/inlineProjectContext.test.js`
Expected: FAIL because the helper module does not exist yet.

### Task 2: Implement the pure context helper

**Files:**
- Create: `src/features/inlineProjectContext.ts`
- Test: `src/features/inlineProjectContext.test.ts`

- [ ] **Step 1: Implement compact structure summary extraction**

Extract declaration-like lines such as classes, interfaces, widgets, and function/method signatures into a small summary string.

- [ ] **Step 2: Implement similar-file scoring and sample extraction**

Score candidates using filename overlap, referenced words, same-language filtering, and open-file preference. Return at most one bounded sample.

- [ ] **Step 3: Re-run focused helper tests**

Run: `npx tsc -p tsconfig.test.json && node --test .test-dist/features/inlineProjectContext.test.js`
Expected: PASS

### Task 3: Integrate the new context into request assembly

**Files:**
- Modify: `src/features/inlineCompletionProvider.ts`
- Modify: `src/features/inlineContextCache.ts` (only if small key/helper changes are necessary)
- Test: `src/features/inlineContextCache.test.ts` (only if key behavior changes)

- [ ] **Step 1: Build current-file structure context during request assembly**

Include it as a lightweight section even when richer cross-file context is not enabled, provided the resulting section stays small.

- [ ] **Step 2: Add one similar-file sample when richer additional context is allowed**

Prefer a strong same-language candidate and keep the sample bounded.

- [ ] **Step 3: Reuse the existing derived-context cache**

Only expand cache inputs if necessary for correctness. Keep invalidation behavior intact.

- [ ] **Step 4: Run targeted tests for the integrated behavior**

Run: `npx tsc -p tsconfig.test.json && node --test .test-dist/features/inlineProjectContext.test.js .test-dist/features/inlineContextCache.test.js`
Expected: PASS

### Task 4: Full verification

**Files:**
- Modify: none unless verification reveals a follow-up fix

- [ ] **Step 1: Run full verification**

Run: `npm test && npm run compile && npm run lint && npm run build`
Expected: all commands exit 0

- [ ] **Step 2: Update issue #24 with a short implementation summary**
