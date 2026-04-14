# Inline Context Budget Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make automatic inline completions respect the configured same-file context window instead of applying a smaller hidden profile cap.

**Architecture:** Keep the change inside the inline request-policy layer so `NoPilotInlineCompletionProvider` continues to use one source of truth for same-file line budgets: the user settings. Quality profiles should still control token budgets, blank-line behavior, and cross-file additional context.

**Tech Stack:** TypeScript, Node test runner

---

### Task 1: Lock the new policy with tests

**Files:**
- Modify: `src/features/inlineText.test.ts`
- Test: `src/features/inlineText.test.ts`

- [ ] **Step 1: Write failing tests**

Add assertions that automatic `fast`, `balanced`, and `rich` profiles no longer return hidden `maxPrefixLines` / `maxSuffixLines` caps while preserving their other differences.

- [ ] **Step 2: Run the focused test file**

Run: `npx tsc -p tsconfig.test.json && node --test .test-dist/features/inlineText.test.js`
Expected: FAIL on the new policy assertions.

### Task 2: Remove the hidden automatic same-file cap

**Files:**
- Modify: `src/features/inlineText.ts`
- Test: `src/features/inlineText.test.ts`

- [ ] **Step 1: Update automatic inline policy construction**

Return automatic profile policies without internal same-file line-budget caps, keeping `maxTokens`, `includeAdditionalContext`, and trigger filtering unchanged.

- [ ] **Step 2: Re-run focused tests**

Run: `npx tsc -p tsconfig.test.json && node --test .test-dist/features/inlineText.test.js`
Expected: PASS

### Task 3: Full verification

**Files:**
- Modify: none unless verification reveals a follow-up fix

- [ ] **Step 1: Run full verification**

Run: `npm test && npm run compile && npm run lint && npm run build`
Expected: all commands exit 0

- [ ] **Step 2: Update issue #15 with a short implementation summary**
