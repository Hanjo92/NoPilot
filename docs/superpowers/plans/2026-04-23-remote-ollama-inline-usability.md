# Remote Ollama Inline Usability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve remote Ollama inline suggestions by adding hybrid remote-mode detection, short-lived request status, faster automatic request policy, and a simple user override.

**Architecture:** Keep the implementation modular and test-first. Add pure helpers for remote-mode resolution and request status copy, extend existing inline policy/strategy functions for remote Ollama, then wire the live inline provider to emit request-state updates that `extension.ts` can reflect in the status bar and editor hint.

**Tech Stack:** VS Code extension API, TypeScript, `node:test`, existing settings webview string-rendering modules, Ollama HTTP provider

---

## File Structure

- Create `src/providers/ollamaRemoteMode.ts`: pure helper for `auto` / `forced-on` / `forced-off`, endpoint locality checks, and rolling telemetry decisions.
- Create `src/providers/ollamaRemoteMode.test.ts`: unit tests for override precedence, local endpoint detection, remote endpoint detection, and latency/failure signals.
- Create `src/features/inlineRequestStatus.ts`: pure request-status types and user-facing copy helpers.
- Create `src/features/inlineRequestStatus.test.ts`: unit tests for waiting, slow, cancelled, and connection-problem copy.
- Modify `src/types.ts`: add `OllamaRemoteMode`, `InlineOptimizationProfile`, `InlineRequestStatus`, and new settings state fields.
- Modify `package.json`: add `nopilot.ollama.remoteMode` configuration and add new test files to the explicit `npm test` command.
- Modify `tsconfig.test.json`: include newly-created test files so TypeScript compiles them before `node --test` runs.
- Modify `src/ui/settingsPanel.ts`: route nested `ollama.remoteMode` reads/writes through `nopilot.ollama`.
- Modify `src/ui/settingsPanelState.ts`: expose `settings.ollamaRemoteMode`.
- Modify `src/ui/settingsWebviewScript.ts`: render the Ollama remote mode select.
- Modify `src/ui/settingsWebview.test.ts`, `src/ui/settingsPanelState.test.ts`, and `src/ui/settingsPanelActions.test.ts`: cover the new setting.
- Modify `src/features/inlineText.ts`: add remote-mode automatic policy shaping while preserving explicit behavior.
- Modify `src/features/inlineText.test.ts`: cover remote automatic policy and cache-scope differences.
- Modify `src/providers/inlineStrategies.ts`: reduce Ollama automatic cap further when `request.inlineOptimizationProfile === 'remote-ollama'`.
- Modify `src/providers/inlineStrategies.test.ts`: cover remote Ollama strategy behavior and explicit/chat preservation.
- Modify `src/features/inlineCompletionProvider.ts`: resolve remote mode, adjust cache scope and request policy, emit request status, track recent durations/failures, and show editor-adjacent hints.
- Modify `src/ui/statusBarPresentation.ts` and `src/ui/statusBarPresentation.test.ts`: show request state without breaking disabled/Copilot precedence.
- Modify `src/extension.ts`: subscribe to inline request-state changes and refresh status bar.

---

### Task 1: Add Remote Mode Configuration and Settings UI

**Files:**
- Modify: `package.json`
- Modify: `src/types.ts`
- Modify: `src/ui/settingsPanel.ts`
- Modify: `src/ui/settingsPanelState.ts`
- Modify: `src/ui/settingsWebviewScript.ts`
- Test: `src/packageManifest.test.ts`
- Test: `src/ui/settingsPanelState.test.ts`
- Test: `src/ui/settingsPanelActions.test.ts`
- Test: `src/ui/settingsWebview.test.ts`

- [ ] **Step 1: Write failing manifest and state tests**

In `src/packageManifest.test.ts`, extend the manifest interface and add this test:

```ts
interface ExtensionManifest {
  activationEvents?: string[];
  contributes?: {
    configuration?: {
      properties?: Record<string, {
        type?: string;
        enum?: string[];
        default?: string;
      }>;
    };
  };
  galleryBanner?: {
    color?: string;
  };
  icon?: string;
}

test('manifest exposes Ollama remote mode setting', () => {
  const manifest = readManifest();
  const setting = manifest.contributes?.configuration?.properties?.['nopilot.ollama.remoteMode'];

  assert.equal(setting?.type, 'string');
  assert.equal(setting?.default, 'auto');
  assert.deepEqual(setting?.enum, ['auto', 'forced-on', 'forced-off']);
});
```

In `src/ui/settingsPanelState.test.ts`, add `ollama.remoteMode` to the fake values and assert state output:

```ts
const values: Record<string, unknown> = {
  'inline.enabled': true,
  'inline.qualityProfile': 'rich',
  'inline.pauseWhenCopilotActive': true,
  'inline.debounceMs': 300,
  'inline.maxPrefixLines': 50,
  'inline.maxSuffixLines': 20,
  'ollama.endpoint': 'http://127.0.0.1:11434',
  'ollama.remoteMode': 'forced-on',
  'commitMessage.language': 'en',
  'commitMessage.format': 'conventional',
};

assert.equal(state.settings.ollamaRemoteMode, 'forced-on');
```

In `src/ui/settingsPanelActions.test.ts`, add a test that the generic update path forwards the new setting without normalizing it as an endpoint:

```ts
test('handleSettingsPanelMessage updates Ollama remote mode without refreshing models', async () => {
  const { provider, calls, actions } = createActions();

  await handleSettingsPanelMessage(
    { command: 'updateSetting', key: 'ollama.remoteMode', value: 'forced-on' },
    actions
  );

  assert.deepEqual(calls.updateSettings, [
    { key: 'ollama.remoteMode', value: 'forced-on' },
  ]);
  assert.equal(provider.refreshCalls, 0);
  assert.equal(calls.sendState, 1);
});
```

In `src/ui/settingsWebview.test.ts`, add assertions to the existing webview script/markup tests:

```ts
assert.match(script, /OLLAMA_REMOTE_MODE_OPTIONS/);
assert.match(script, /ollama\.remoteMode/);
assert.match(script, /Remote Mode/);
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
npm test
```

Expected: failures mention missing `nopilot.ollama.remoteMode`, missing `ollamaRemoteMode`, and missing webview script strings.

- [ ] **Step 3: Add shared types**

In `src/types.ts`, add:

```ts
export type OllamaRemoteMode = 'auto' | 'forced-on' | 'forced-off';
export type InlineOptimizationProfile = 'standard' | 'remote-ollama';

export type InlineRequestStatusKind =
  | 'idle'
  | 'waiting'
  | 'slow'
  | 'cancelled'
  | 'connection-problem';

export interface InlineRequestStatus {
  kind: InlineRequestStatusKind;
  providerId?: ProviderId;
  providerName?: string;
  model?: string;
  message?: string;
}
```

Extend `CompletionRequest`:

```ts
/** Inline request optimization profile for provider-specific latency tuning */
inlineOptimizationProfile?: InlineOptimizationProfile;
```

Extend `WebviewState.settings`:

```ts
ollamaRemoteMode: OllamaRemoteMode;
```

- [ ] **Step 4: Add package setting**

In `package.json`, under `contributes.configuration.properties`, add:

```json
"nopilot.ollama.remoteMode": {
  "type": "string",
  "enum": [
    "auto",
    "forced-on",
    "forced-off"
  ],
  "enumDescriptions": [
    "Automatically optimize inline suggestions when Ollama behaves like a remote endpoint.",
    "Always use remote-optimized inline behavior for Ollama.",
    "Never use remote-optimized inline behavior for Ollama."
  ],
  "default": "auto",
  "description": "Remote Ollama optimization mode for inline suggestions"
}
```

- [ ] **Step 5: Route nested Ollama setting reads/writes**

In `src/ui/settingsPanel.ts`, update `getSetting`:

```ts
getSetting: <T>(key: string, defaultValue: T) => {
  if (key === 'ollama.endpoint') {
    return ollamaConfig.get('endpoint', defaultValue);
  }

  if (key === 'ollama.remoteMode') {
    return ollamaConfig.get('remoteMode', defaultValue);
  }

  return config.get(key, defaultValue);
},
```

Update `updateSetting`:

```ts
if (key === 'ollama.endpoint' || key === 'ollama.remoteMode') {
  const ollamaConfig = vscode.workspace.getConfiguration('nopilot.ollama');
  const settingName = key === 'ollama.endpoint' ? 'endpoint' : 'remoteMode';
  await ollamaConfig.update(
    settingName,
    String(value),
    vscode.ConfigurationTarget.Global
  );
  return;
}
```

- [ ] **Step 6: Add settings state and webview select**

In `src/ui/settingsPanelState.ts`, add:

```ts
ollamaRemoteMode: source.getSetting('ollama.remoteMode', 'auto'),
```

In `src/ui/settingsWebviewScript.ts`, add options near the other option constants:

```ts
const OLLAMA_REMOTE_MODE_OPTIONS = [
  { value: 'auto', label: 'Auto' },
  { value: 'forced-on', label: 'Forced On' },
  { value: 'forced-off', label: 'Forced Off' },
];
```

In `getOllamaSettingsMarkup`, add a second row after Endpoint:

```ts
{
  label: 'Remote Mode',
  description: 'Optimize inline suggestions for remote Ollama latency',
  control: selectInput('ollama.remoteMode', settings.ollamaRemoteMode, OLLAMA_REMOTE_MODE_OPTIONS),
},
```

- [ ] **Step 7: Run tests to verify this task passes**

Run:

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 8: Commit**

```bash
git add package.json src/types.ts src/packageManifest.test.ts src/ui/settingsPanel.ts src/ui/settingsPanelState.ts src/ui/settingsPanelState.test.ts src/ui/settingsPanelActions.test.ts src/ui/settingsWebviewScript.ts src/ui/settingsWebview.test.ts
git commit -m "feat: add Ollama remote mode setting"
```

---

### Task 2: Add Remote Mode Resolution Helpers

**Files:**
- Create: `src/providers/ollamaRemoteMode.ts`
- Create: `src/providers/ollamaRemoteMode.test.ts`
- Modify: `package.json`
- Modify: `tsconfig.test.json`

- [ ] **Step 1: Write failing tests**

Create `src/providers/ollamaRemoteMode.test.ts`:

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createOllamaRemoteModeTracker,
  isLocalOllamaEndpoint,
  normalizeOllamaRemoteMode,
  resolveOllamaRemoteMode,
} from './ollamaRemoteMode';

test('normalizeOllamaRemoteMode accepts only supported values', () => {
  assert.equal(normalizeOllamaRemoteMode('auto'), 'auto');
  assert.equal(normalizeOllamaRemoteMode('forced-on'), 'forced-on');
  assert.equal(normalizeOllamaRemoteMode('forced-off'), 'forced-off');
  assert.equal(normalizeOllamaRemoteMode('unexpected'), 'auto');
  assert.equal(normalizeOllamaRemoteMode(undefined), 'auto');
});

test('isLocalOllamaEndpoint detects local endpoints', () => {
  assert.equal(isLocalOllamaEndpoint('http://localhost:11434'), true);
  assert.equal(isLocalOllamaEndpoint('127.0.0.1:11434'), true);
  assert.equal(isLocalOllamaEndpoint('http://[::1]:11434'), true);
  assert.equal(isLocalOllamaEndpoint('http://192.168.0.10:11434'), false);
  assert.equal(isLocalOllamaEndpoint('https://ollama.example.com'), false);
});

test('resolveOllamaRemoteMode respects forced overrides before heuristics', () => {
  assert.deepEqual(resolveOllamaRemoteMode({
    setting: 'forced-on',
    endpoint: 'http://localhost:11434',
    recentDurationsMs: [],
    recentFailureCount: 0,
  }), { enabled: true, reason: 'forced-on' });

  assert.deepEqual(resolveOllamaRemoteMode({
    setting: 'forced-off',
    endpoint: 'http://192.168.0.10:11434',
    recentDurationsMs: [2500, 2600],
    recentFailureCount: 2,
  }), { enabled: false, reason: 'forced-off' });
});

test('resolveOllamaRemoteMode detects remote endpoint and slow local behavior', () => {
  assert.deepEqual(resolveOllamaRemoteMode({
    setting: 'auto',
    endpoint: 'http://192.168.0.10:11434',
    recentDurationsMs: [],
    recentFailureCount: 0,
  }), { enabled: true, reason: 'endpoint' });

  assert.deepEqual(resolveOllamaRemoteMode({
    setting: 'auto',
    endpoint: 'http://localhost:11434',
    recentDurationsMs: [1600, 1800],
    recentFailureCount: 0,
  }), { enabled: true, reason: 'latency' });

  assert.deepEqual(resolveOllamaRemoteMode({
    setting: 'auto',
    endpoint: 'http://localhost:11434',
    recentDurationsMs: [200],
    recentFailureCount: 0,
  }), { enabled: false, reason: 'local' });
});

test('createOllamaRemoteModeTracker keeps rolling latency and failure signals', () => {
  const tracker = createOllamaRemoteModeTracker(3);

  tracker.recordSuccess(100);
  tracker.recordSuccess(1700);
  tracker.recordSuccess(1800);
  tracker.recordSuccess(1900);
  tracker.recordFailure();

  assert.deepEqual(tracker.snapshot(), {
    recentDurationsMs: [1700, 1800, 1900],
    recentFailureCount: 1,
  });
});
```

Add `src/providers/ollamaRemoteMode.test.ts` to the explicit `include` list in `tsconfig.test.json`.

Add `.test-dist/providers/ollamaRemoteMode.test.js` to the explicit `node --test` list in `package.json`.

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test
```

Expected: TypeScript fails because `src/providers/ollamaRemoteMode.ts` does not exist.

- [ ] **Step 3: Implement helper**

Create `src/providers/ollamaRemoteMode.ts`:

```ts
import type { OllamaRemoteMode } from '../types';
import { normalizeOllamaEndpoint } from './ollamaModels';

export type OllamaRemoteModeReason =
  | 'forced-on'
  | 'forced-off'
  | 'endpoint'
  | 'latency'
  | 'failure'
  | 'local';

export interface ResolvedOllamaRemoteMode {
  enabled: boolean;
  reason: OllamaRemoteModeReason;
}

interface ResolveOllamaRemoteModeInput {
  setting: unknown;
  endpoint: string;
  recentDurationsMs: number[];
  recentFailureCount: number;
}

export function normalizeOllamaRemoteMode(value: unknown): OllamaRemoteMode {
  return value === 'forced-on' || value === 'forced-off' || value === 'auto'
    ? value
    : 'auto';
}

export function isLocalOllamaEndpoint(endpoint: string): boolean {
  try {
    const url = new URL(normalizeOllamaEndpoint(endpoint));
    const hostname = url.hostname.toLowerCase();
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname === '[::1]';
  } catch {
    return false;
  }
}

function hasRepeatedSlowResponses(durations: number[]): boolean {
  return durations.slice(-3).filter((duration) => duration >= 1500).length >= 2;
}

export function resolveOllamaRemoteMode(
  input: ResolveOllamaRemoteModeInput
): ResolvedOllamaRemoteMode {
  const setting = normalizeOllamaRemoteMode(input.setting);

  if (setting === 'forced-on') {
    return { enabled: true, reason: 'forced-on' };
  }

  if (setting === 'forced-off') {
    return { enabled: false, reason: 'forced-off' };
  }

  if (!isLocalOllamaEndpoint(input.endpoint)) {
    return { enabled: true, reason: 'endpoint' };
  }

  if (hasRepeatedSlowResponses(input.recentDurationsMs)) {
    return { enabled: true, reason: 'latency' };
  }

  if (input.recentFailureCount >= 2) {
    return { enabled: true, reason: 'failure' };
  }

  return { enabled: false, reason: 'local' };
}

export function createOllamaRemoteModeTracker(limit = 5): {
  recordSuccess(durationMs: number): void;
  recordFailure(): void;
  snapshot(): { recentDurationsMs: number[]; recentFailureCount: number };
} {
  const recentDurationsMs: number[] = [];
  let recentFailureCount = 0;

  return {
    recordSuccess(durationMs: number): void {
      recentDurationsMs.push(durationMs);
      while (recentDurationsMs.length > limit) {
        recentDurationsMs.shift();
      }
      recentFailureCount = Math.max(0, recentFailureCount - 1);
    },
    recordFailure(): void {
      recentFailureCount = Math.min(limit, recentFailureCount + 1);
    },
    snapshot() {
      return {
        recentDurationsMs: [...recentDurationsMs],
        recentFailureCount,
      };
    },
  };
}
```

- [ ] **Step 4: Run tests to verify this task passes**

Run:

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add package.json tsconfig.test.json src/providers/ollamaRemoteMode.ts src/providers/ollamaRemoteMode.test.ts
git commit -m "feat: detect remote Ollama mode"
```

---

### Task 3: Add Remote Inline Request Policy and Strategy

**Files:**
- Modify: `src/features/inlineText.ts`
- Modify: `src/features/inlineText.test.ts`
- Modify: `src/providers/inlineStrategies.ts`
- Modify: `src/providers/inlineStrategies.test.ts`

- [ ] **Step 1: Write failing policy tests**

In `src/features/inlineText.test.ts`, add:

```ts
test('getInlineRequestPolicy trims automatic remote Ollama requests', () => {
  const policy = getInlineRequestPolicy({
    isAutomaticTrigger: true,
    qualityProfile: 'rich',
    lineText: 'return ',
    cursorCharacter: 7,
    inlineOptimizationProfile: 'remote-ollama',
  });

  assert.deepEqual(policy, {
    skip: false,
    includeAdditionalContext: true,
    additionalContextScope: 'file',
    maxTokens: 64,
    maxPrefixLines: 30,
    maxSuffixLines: 10,
  });
});

test('getInlineRequestPolicy keeps explicit remote Ollama requests rich', () => {
  const policy = getInlineRequestPolicy({
    isAutomaticTrigger: false,
    qualityProfile: 'fast',
    lineText: '',
    cursorCharacter: 0,
    inlineOptimizationProfile: 'remote-ollama',
  });

  assert.deepEqual(policy, {
    skip: false,
    includeAdditionalContext: true,
    additionalContextScope: 'workspace',
    maxTokens: 256,
    maxPrefixLines: undefined,
    maxSuffixLines: undefined,
  });
});

test('buildInlineCacheScope includes inline optimization profile', async () => {
  const inlineText = await import('./inlineText');

  assert.equal(
    (inlineText as any).buildInlineCacheScope('ollama', 'qwen2.5-coder:7b', 'fast', 'remote-ollama'),
    'ollama::qwen2.5-coder:7b::fast::remote-ollama'
  );
});
```

In `src/providers/inlineStrategies.test.ts`, add:

```ts
test('remote Ollama automatic requests use a smaller token cap', () => {
  const config = buildInlineCompletionConfig('ollama', createInlineRequest({
    inlineOptimizationProfile: 'remote-ollama',
    maxTokens: 192,
  }));

  assert.equal(config.strategyId, 'ollama');
  assert.equal(config.maxTokens, 96);
  assert.match(config.prompt, /Prefer the shortest correct completion/);
});

test('remote Ollama explicit requests keep requested token budget', () => {
  const config = buildInlineCompletionConfig('ollama', createInlineRequest({
    mode: 'explicit',
    inlineOptimizationProfile: 'remote-ollama',
    maxTokens: 220,
  }));

  assert.equal(config.strategyId, 'ollama');
  assert.equal(config.maxTokens, 220);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
npm test
```

Expected: TypeScript errors because `inlineOptimizationProfile` is not accepted by policy input and `additionalContextScope` does not exist yet.

- [ ] **Step 3: Extend inline policy**

In `src/features/inlineText.ts`, update imports and interfaces:

```ts
import type { InlineOptimizationProfile, InlineQualityProfile } from '../types';

export type AdditionalContextScope = 'none' | 'file' | 'workspace';

export interface InlineRequestPolicy {
  skip: boolean;
  includeAdditionalContext: boolean;
  additionalContextScope: AdditionalContextScope;
  maxTokens: number;
  maxPrefixLines?: number;
  maxSuffixLines?: number;
}

interface InlineRequestPolicyInput {
  isAutomaticTrigger: boolean;
  qualityProfile?: InlineQualityProfile;
  inlineOptimizationProfile?: InlineOptimizationProfile;
  lineText: string;
  cursorCharacter: number;
}
```

Update explicit policy:

```ts
return {
  skip: false,
  includeAdditionalContext: true,
  additionalContextScope: 'workspace',
  maxTokens: EXPLICIT_INLINE_MAX_TOKENS,
  maxPrefixLines: undefined,
  maxSuffixLines: undefined,
};
```

Update `buildAutomaticInlinePolicy`:

```ts
function buildAutomaticInlinePolicy(
  profile: AutomaticInlineProfile,
  skip: boolean,
  inlineOptimizationProfile: InlineOptimizationProfile = 'standard'
): InlineRequestPolicy {
  if (inlineOptimizationProfile === 'remote-ollama') {
    return {
      skip,
      includeAdditionalContext: true,
      additionalContextScope: 'file',
      maxTokens: 64,
      maxPrefixLines: 30,
      maxSuffixLines: 10,
    };
  }

  return {
    skip,
    includeAdditionalContext: profile.includeAdditionalContext,
    additionalContextScope: profile.includeAdditionalContext ? 'workspace' : 'none',
    maxTokens: profile.maxTokens,
    maxPrefixLines: undefined,
    maxSuffixLines: undefined,
  };
}
```

Pass `input.inlineOptimizationProfile` into every `buildAutomaticInlinePolicy(...)` call.

Update `buildInlineCacheScope`:

```ts
export function buildInlineCacheScope(
  providerId: string,
  model: string,
  qualityProfile: InlineQualityProfile,
  inlineOptimizationProfile: InlineOptimizationProfile = 'standard'
): string {
  return `${providerId}::${model || 'auto'}::${normalizeInlineQualityProfile(qualityProfile)}::${inlineOptimizationProfile}`;
}
```

- [ ] **Step 4: Extend Ollama strategy**

In `src/providers/inlineStrategies.ts`, add:

```ts
const REMOTE_OLLAMA_AUTOMATIC_MAX_TOKENS = 96;
```

Update the Ollama case:

```ts
const ollamaAutomaticCap =
  request.inlineOptimizationProfile === 'remote-ollama'
    ? REMOTE_OLLAMA_AUTOMATIC_MAX_TOKENS
    : OLLAMA_AUTOMATIC_MAX_TOKENS;

return {
  strategyId,
  prompt: buildOllamaInlinePrompt(request),
  maxTokens: resolveAutomaticCap(request, ollamaAutomaticCap),
  stopSequences: request.stopSequences,
};
```

- [ ] **Step 5: Update existing test expectations**

Existing deep-equality assertions in `src/features/inlineText.test.ts` must now include `additionalContextScope`.

Use:

```ts
additionalContextScope: 'none'
```

for automatic policies without additional context, and:

```ts
additionalContextScope: 'workspace'
```

for rich automatic and explicit policies.

Update the existing cache scope expectation from:

```ts
'ollama::qwen2.5-coder:7b::fast'
```

to:

```ts
'ollama::qwen2.5-coder:7b::fast::standard'
```

- [ ] **Step 6: Run tests to verify this task passes**

Run:

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/features/inlineText.ts src/features/inlineText.test.ts src/providers/inlineStrategies.ts src/providers/inlineStrategies.test.ts
git commit -m "feat: tune inline policy for remote Ollama"
```

---

### Task 4: Add Request Status Presentation

**Files:**
- Create: `src/features/inlineRequestStatus.ts`
- Create: `src/features/inlineRequestStatus.test.ts`
- Modify: `src/ui/statusBarPresentation.ts`
- Modify: `src/ui/statusBarPresentation.test.ts`
- Modify: `package.json`
- Modify: `tsconfig.test.json`

- [ ] **Step 1: Write failing status tests**

Create `src/features/inlineRequestStatus.test.ts`:

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createIdleInlineRequestStatus,
  getInlineRequestStatusMessage,
} from './inlineRequestStatus';

test('createIdleInlineRequestStatus returns quiet idle state', () => {
  assert.deepEqual(createIdleInlineRequestStatus(), { kind: 'idle' });
});

test('getInlineRequestStatusMessage returns practical remote Ollama copy', () => {
  assert.equal(getInlineRequestStatusMessage({
    kind: 'waiting',
    providerId: 'ollama',
    providerName: 'Ollama',
    model: 'qwen2.5-coder:7b',
  }), 'Requesting from remote Ollama...');

  assert.equal(getInlineRequestStatusMessage({ kind: 'slow' }), 'Slow response from model');
  assert.equal(getInlineRequestStatusMessage({ kind: 'cancelled' }), 'Request cancelled');
  assert.equal(getInlineRequestStatusMessage({ kind: 'connection-problem' }), 'Connection problem');
  assert.equal(getInlineRequestStatusMessage({ kind: 'idle' }), '');
});
```

In `src/ui/statusBarPresentation.test.ts`, add:

```ts
test('getNoPilotStatusBarPresentation shows remote Ollama request state', () => {
  const presentation = getNoPilotStatusBarPresentation({
    displayName: 'Ollama',
    providerName: 'Ollama',
    model: 'qwen2.5-coder:7b',
    inlineEnabled: true,
    pausedForCopilot: false,
    requestStatus: {
      kind: 'slow',
      providerId: 'ollama',
      providerName: 'Ollama',
      model: 'qwen2.5-coder:7b',
    },
  });

  assert.match(presentation.text, /\$\(sync~spin\) \$\(sparkle\) Ollama/);
  assert.match(presentation.tooltip, /Slow response from model/);
});

test('getNoPilotStatusBarPresentation keeps disabled state above request state', () => {
  const presentation = getNoPilotStatusBarPresentation({
    displayName: 'Ollama',
    providerName: 'Ollama',
    model: 'qwen2.5-coder:7b',
    inlineEnabled: false,
    pausedForCopilot: false,
    requestStatus: { kind: 'waiting' },
  });

  assert.match(presentation.text, /\$\(circle-slash\)/);
  assert.match(presentation.tooltip, /Inline suggestions: disabled/);
  assert.doesNotMatch(presentation.tooltip, /Requesting from remote Ollama/);
});
```

Add `src/features/inlineRequestStatus.test.ts` to the explicit `include` list in `tsconfig.test.json`.

Add `.test-dist/features/inlineRequestStatus.test.js` to the explicit `node --test` list in `package.json`.

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
npm test
```

Expected: TypeScript fails because `inlineRequestStatus.ts` does not exist and status bar input does not accept `requestStatus`.

- [ ] **Step 3: Implement status helper**

Create `src/features/inlineRequestStatus.ts`:

```ts
import type { InlineRequestStatus } from '../types';

export function createIdleInlineRequestStatus(): InlineRequestStatus {
  return { kind: 'idle' };
}

export function getInlineRequestStatusMessage(status: InlineRequestStatus): string {
  switch (status.kind) {
    case 'waiting':
      return status.providerId === 'ollama'
        ? 'Requesting from remote Ollama...'
        : 'Requesting inline suggestion...';
    case 'slow':
      return 'Slow response from model';
    case 'cancelled':
      return 'Request cancelled';
    case 'connection-problem':
      return 'Connection problem';
    case 'idle':
    default:
      return '';
  }
}
```

- [ ] **Step 4: Extend status bar presentation**

In `src/ui/statusBarPresentation.ts`, import and extend input:

```ts
import type { InlineRequestStatus } from '../types';
import { getInlineRequestStatusMessage } from '../features/inlineRequestStatus';

export interface NoPilotStatusBarPresentationInput {
  displayName: string;
  providerName: string;
  model: string;
  inlineEnabled: boolean;
  pausedForCopilot: boolean;
  requestStatus?: InlineRequestStatus;
}
```

Derive request status after disabled/Copilot handling:

```ts
const requestMessage =
  input.inlineEnabled && !input.pausedForCopilot && input.requestStatus
    ? getInlineRequestStatusMessage(input.requestStatus)
    : '';
const isRequestActive = Boolean(requestMessage);

const statusPrefix = !input.inlineEnabled
  ? '$(circle-slash) '
  : input.pausedForCopilot
    ? '$(debug-pause) '
    : isRequestActive
      ? '$(sync~spin) '
      : '';
```

Append request copy to tooltip:

```ts
const requestLine = requestMessage ? `\n${requestMessage}` : '';

tooltip: `NoPilot — ${input.displayName}\nProvider: ${input.providerName} | Model: ${input.model || 'auto'}\n${inlineStatus}${requestLine}\nClick to switch`,
```

- [ ] **Step 5: Run tests to verify this task passes**

Run:

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add package.json tsconfig.test.json src/features/inlineRequestStatus.ts src/features/inlineRequestStatus.test.ts src/ui/statusBarPresentation.ts src/ui/statusBarPresentation.test.ts
git commit -m "feat: present inline request status"
```

---

### Task 5: Wire Remote Mode into Inline Provider

**Files:**
- Modify: `src/features/inlineCompletionProvider.ts`
- Modify: `src/extension.ts`

- [ ] **Step 1: Add request-state event API to inline provider**

In `src/features/inlineCompletionProvider.ts`, import the new helpers:

```ts
import type { InlineRequestStatus, OllamaRemoteMode } from '../types';
import { createIdleInlineRequestStatus, getInlineRequestStatusMessage } from './inlineRequestStatus';
import {
  createOllamaRemoteModeTracker,
  normalizeOllamaRemoteMode,
  resolveOllamaRemoteMode,
} from '../providers/ollamaRemoteMode';
```

Add fields:

```ts
private readonly requestStatusEmitter = new vscode.EventEmitter<InlineRequestStatus>();
readonly onDidChangeRequestStatus = this.requestStatusEmitter.event;
private requestStatus: InlineRequestStatus = createIdleInlineRequestStatus();
private readonly ollamaRemoteTracker = createOllamaRemoteModeTracker();
private requestStatusClearTimer: ReturnType<typeof setTimeout> | undefined;
private requestSlowTimer: ReturnType<typeof setTimeout> | undefined;
private inlineHintDecorationType = vscode.window.createTextEditorDecorationType({
  after: {
    margin: '0 0 0 1.2em',
    color: new vscode.ThemeColor('descriptionForeground'),
    fontStyle: 'italic',
  },
});
```

Add public getter:

```ts
getRequestStatus(): InlineRequestStatus {
  return this.requestStatus;
}
```

- [ ] **Step 2: Add remote mode resolution methods**

Add private methods:

```ts
private getOllamaRemoteModeSetting(): OllamaRemoteMode {
  return normalizeOllamaRemoteMode(
    vscode.workspace.getConfiguration('nopilot.ollama').get('remoteMode', 'auto')
  );
}

private getOllamaEndpoint(): string {
  return vscode.workspace
    .getConfiguration('nopilot.ollama')
    .get('endpoint', 'http://localhost:11434');
}

private resolveActiveOllamaRemoteMode(): boolean {
  if (this.providerManager.getActiveProviderId() !== 'ollama') {
    return false;
  }

  const snapshot = this.ollamaRemoteTracker.snapshot();
  return resolveOllamaRemoteMode({
    setting: this.getOllamaRemoteModeSetting(),
    endpoint: this.getOllamaEndpoint(),
    recentDurationsMs: snapshot.recentDurationsMs,
    recentFailureCount: snapshot.recentFailureCount,
  }).enabled;
}
```

- [ ] **Step 3: Add status and editor hint methods**

Add:

```ts
private setRequestStatus(status: InlineRequestStatus): void {
  this.requestStatus = status;
  this.requestStatusEmitter.fire(status);
  this.updateEditorHint(status);
}

private scheduleRequestStatusClear(delayMs = 900): void {
  if (this.requestStatusClearTimer) {
    clearTimeout(this.requestStatusClearTimer);
  }

  this.requestStatusClearTimer = setTimeout(() => {
    this.requestStatusClearTimer = undefined;
    this.setRequestStatus(createIdleInlineRequestStatus());
  }, delayMs);
}

private clearSlowTimer(): void {
  if (this.requestSlowTimer) {
    clearTimeout(this.requestSlowTimer);
    this.requestSlowTimer = undefined;
  }
}

private scheduleSlowStatus(requestId: number): void {
  this.clearSlowTimer();
  this.requestSlowTimer = setTimeout(() => {
    this.requestSlowTimer = undefined;
    if (requestId === this.requestCounter && this.requestStatus.kind === 'waiting') {
      this.setRequestStatus({
        ...this.requestStatus,
        kind: 'slow',
        message: 'Slow response from model',
      });
    }
  }, 1200);
}

private updateEditorHint(status: InlineRequestStatus): void {
  const editor = vscode.window.activeTextEditor;
  if (!editor || status.kind === 'idle') {
    editor?.setDecorations(this.inlineHintDecorationType, []);
    return;
  }

  const message = getInlineRequestStatusMessage(status);
  if (!message) {
    editor.setDecorations(this.inlineHintDecorationType, []);
    return;
  }

  const position = editor.selection.active;
  const range = new vscode.Range(position, position);
  editor.setDecorations(this.inlineHintDecorationType, [{
    range,
    renderOptions: {
      after: {
        contentText: ` ${message}`,
      },
    },
  }]);
}
```

- [ ] **Step 4: Thread remote optimization into request policy, cache, and buildRequest**

Before calling `getInlineRequestPolicy`, compute:

```ts
const isRemoteOllama = this.resolveActiveOllamaRemoteMode();
const inlineOptimizationProfile = isRemoteOllama ? 'remote-ollama' : 'standard';
```

Call `getInlineRequestPolicy` with:

```ts
inlineOptimizationProfile,
```

Call `buildInlineCacheScope` with:

```ts
inlineOptimizationProfile
```

Pass `inlineOptimizationProfile` into `buildRequest`, and include it in the returned `CompletionRequest`.

- [ ] **Step 5: Respect file-only context scope**

In `buildAdditionalContext`, replace the two workspace-heavy guards:

```ts
if (requestPolicy.includeAdditionalContext) {
  const similarFileSample = await this.resolveSimilarFileSampleContext(
    document,
    searchWords
  );
  ...
}

if (requestPolicy.includeAdditionalContext && searchWords.length > 0) {
  ...
}
```

with:

```ts
if (requestPolicy.additionalContextScope === 'workspace') {
  const similarFileSample = await this.resolveSimilarFileSampleContext(
    document,
    searchWords
  );
  if (similarFileSample.value) {
    additionalSections.push(similarFileSample.value);
    similarFileSample.dependencyUris.forEach((uri) => dependencyUris.add(uri));
  }
}

if (requestPolicy.additionalContextScope === 'workspace' && searchWords.length > 0) {
  ...
}
```

Keep current file structure outside those guards so `file` scope preserves it.

- [ ] **Step 6: Add request lifecycle status and telemetry**

After debounce passes and before provider call:

```ts
if (isRemoteOllama && request.mode === 'automatic') {
  this.setRequestStatus({
    kind: 'waiting',
    providerId: 'ollama',
    providerName: 'Ollama',
    model: activeProvider.info.currentModel,
  });
  this.scheduleSlowStatus(requestId);
}
```

After successful provider response:

```ts
if (isRemoteOllama && request.mode === 'automatic') {
  this.ollamaRemoteTracker.recordSuccess(providerDurationMs);
  this.clearSlowTimer();
  this.scheduleRequestStatusClear(500);
}
```

When a newer request supersedes the current one:

```ts
if (isRemoteOllama && request.mode === 'automatic') {
  this.clearSlowTimer();
  this.setRequestStatus({
    kind: 'cancelled',
    providerId: 'ollama',
    providerName: 'Ollama',
    model: activeProvider.info.currentModel,
  });
  this.scheduleRequestStatusClear(700);
}
```

In catch for non-cancellation errors:

```ts
if (isRemoteOllama) {
  this.ollamaRemoteTracker.recordFailure();
  this.clearSlowTimer();
  this.setRequestStatus({
    kind: 'connection-problem',
    providerId: 'ollama',
    providerName: 'Ollama',
    model: activeProvider.info.currentModel,
  });
  this.scheduleRequestStatusClear(1800);
}
```

- [ ] **Step 7: Wire status bar refresh**

In `src/extension.ts`, after creating `refreshStatusBar`, subscribe:

```ts
context.subscriptions.push(
  inlineProvider.onDidChangeRequestStatus(() => refreshStatusBar())
);
```

Pass request status to presentation:

```ts
requestStatus: inlineProvider?.getRequestStatus(),
```

- [ ] **Step 8: Clean up timers and decoration**

In `dispose()`:

```ts
this.clearSlowTimer();
if (this.requestStatusClearTimer) {
  clearTimeout(this.requestStatusClearTimer);
}
this.inlineHintDecorationType.dispose();
this.requestStatusEmitter.dispose();
```

- [ ] **Step 9: Run tests and compile**

Run:

```bash
npm test
npm run compile
```

Expected: all tests pass and TypeScript compilation exits `0`.

- [ ] **Step 10: Commit**

```bash
git add src/features/inlineCompletionProvider.ts src/extension.ts
git commit -m "feat: surface remote Ollama inline status"
```

---

### Task 6: Final Verification and Packaging

**Files:**
- Verify only

- [ ] **Step 1: Run full automated checks**

Run:

```bash
npm test
npm run lint
npm run build
```

Expected:

- `npm test` reports all tests passing
- `npm run lint` exits `0`
- `npm run build` exits `0`

- [ ] **Step 2: Package VSIX**

Run:

```bash
npx @vscode/vsce package --out /tmp/nopilot-remote-ollama-usability.vsix
```

Expected: package succeeds and the VSIX file is written to `/tmp/nopilot-remote-ollama-usability.vsix`.

- [ ] **Step 3: Check git status**

Run:

```bash
git status --short
```

Expected: no unstaged source changes. If `.test-dist/` or generated VSIX output appears, confirm it is ignored or remove only generated files that were created by verification.

- [ ] **Step 4: Commit plan if not already committed**

If this implementation plan is still uncommitted, run:

```bash
git add docs/superpowers/plans/2026-04-23-remote-ollama-inline-usability.md
git commit -m "docs: plan remote Ollama inline usability"
```

---

## Self-Review Checklist

- Spec coverage: remote detection, manual override, status bar, editor hint, faster automatic requests, context preservation, and testing are each covered by tasks above.
- Red-flag scan: no forbidden planning phrases are intentionally left for implementers.
- Type consistency: `OllamaRemoteMode`, `InlineOptimizationProfile`, and `InlineRequestStatus` are introduced in `src/types.ts` before later tasks consume them.
- Scope check: the plan avoids a full settings redesign and avoids a separate provider pipeline; it implements the selected hybrid adaptive mode only.
