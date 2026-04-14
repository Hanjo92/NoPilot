# Inline Cleanup Boundaries Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tighten inline cleanup so completions stop before duplicated structural suffix lines and obvious next-statement drift.

**Architecture:** Keep the work inside `src/features/inlineText.ts` by adding small, pure cleanup helpers that compose into `cleanInlineCompletionText`. Use narrow tests in `src/features/inlineText.test.ts` so the heuristics stay explicit and easy to tune.

**Tech Stack:** TypeScript, Node test runner

---

### Task 1: Add failing cleanup tests

**Files:**
- Modify: `src/features/inlineText.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
test('cleanInlineCompletionText removes duplicated structural suffix lines', () => {
  const cleaned = cleanInlineCompletionText({
    text: '  run();\n}',
    prefix: 'if (ready) {\n',
    suffix: '\n}',
    stopSequences: undefined,
  });

  assert.equal(cleaned, '  run();');
});

test('cleanInlineCompletionText trims obvious next statements after a completed block', () => {
  const cleaned = cleanInlineCompletionText({
    text: 'if (ready) {\n  run();\n}\n\nconst fallback = createFallback();',
    prefix: '',
    suffix: '',
    stopSequences: undefined,
  });

  assert.equal(cleaned, 'if (ready) {\n  run();\n}');
});
```

- [ ] **Step 2: Run the focused test file**

Run: `npx tsc -p tsconfig.test.json && node --test .test-dist/features/inlineText.test.js`
Expected: FAIL on the new cleanup assertions

### Task 2: Implement the cleanup heuristics

**Files:**
- Modify: `src/features/inlineText.ts`
- Test: `src/features/inlineText.test.ts`

- [ ] **Step 1: Extend suffix overlap handling for structural lines**
- [ ] **Step 2: Add a helper that trims after a completed block when a blank line introduces an obvious next statement**
- [ ] **Step 3: Keep `cleanInlineCompletionText` composition linear and readable**

- [ ] **Step 4: Re-run focused cleanup tests**

Run: `npx tsc -p tsconfig.test.json && node --test .test-dist/features/inlineText.test.js`
Expected: PASS

### Task 3: Full verification

**Files:**
- Modify: none unless verification reveals a fix

- [ ] **Step 1: Run full verification**

Run: `npm test && npm run compile && npm run lint && npm run build`
Expected: all commands exit 0

- [ ] **Step 2: Update issue #4 with the cleanup slice summary**
