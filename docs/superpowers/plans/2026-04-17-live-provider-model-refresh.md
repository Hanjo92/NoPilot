# Live Provider Model Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace stale static direct-provider model lists with curated fallbacks plus live refresh from OpenAI, Anthropic, and Gemini model APIs.

**Architecture:** Add a shared provider-model catalog module with provider-specific fallback lists, default selection rules, and live refresh helpers. Keep provider classes thin and preserve the current settings UI pipeline by continuing to expose refreshed models through `ProviderInfo.availableModels`.

**Tech Stack:** TypeScript, Node test runner, VS Code extension APIs, existing provider SDKs plus `fetch`

---

### Task 1: Lock the catalog behavior with failing tests

**Files:**
- Create: `src/providers/directProviderModels.ts`
- Create: `src/providers/directProviderModels.test.ts`
- Modify: `tsconfig.test.json`
- Modify: `package.json`

- [ ] **Step 1: Add failing tests for curated fallback/default behavior**

Cover:
- OpenAI fallback list contains current GPT-5 / GPT-4.1 production entries
- Anthropic fallback list contains current Claude production entries
- Gemini fallback list contains current Gemini 2.5 production entries
- default selection prefers a sensible production default

- [ ] **Step 2: Add failing tests for live model filtering**

Cover:
- OpenAI filters out embeddings / moderation / audio-only / image-only families
- Anthropic keeps Claude text-generation models
- Gemini keeps `generateContent`-capable text-generation models and excludes TTS/image-only variants
- fallback is preserved when refresh fails or returns nothing

- [ ] **Step 3: Run focused tests**

Run: `npx tsc -p tsconfig.test.json && node --test .test-dist/providers/directProviderModels.test.js`
Expected: FAIL because the shared catalog module does not exist yet.

### Task 2: Implement the shared direct-provider catalog

**Files:**
- Create: `src/providers/directProviderModels.ts`
- Test: `src/providers/directProviderModels.test.ts`

- [ ] **Step 1: Add curated fallback lists and default-model helpers**

- [ ] **Step 2: Add provider-specific live refresh helpers**

Use official models-list endpoints and explicit filtering rules.

- [ ] **Step 3: Re-run focused catalog tests**

Run: `npx tsc -p tsconfig.test.json && node --test .test-dist/providers/directProviderModels.test.js`
Expected: PASS

### Task 3: Integrate refreshed catalogs into direct providers

**Files:**
- Modify: `src/providers/openaiProvider.ts`
- Modify: `src/providers/anthropicProvider.ts`
- Modify: `src/providers/geminiProvider.ts`
- Modify: provider tests if needed

- [ ] **Step 1: Initialize direct providers from shared fallbacks**

- [ ] **Step 2: Refresh live model lists in `isAvailable()` / `refreshClient()`**

- [ ] **Step 3: Preserve valid current selections or choose refreshed defaults**

- [ ] **Step 4: Add or update provider-level tests where integration behavior needs coverage**

### Task 4: Full verification

**Files:**
- Modify: none unless verification reveals a follow-up fix

- [ ] **Step 1: Run full verification**

Run: `npm test && npm run compile && npm run lint && npm run build`
Expected: all commands exit 0

- [ ] **Step 2: Update issue #35 with a short implementation summary**
