# Provider Inline Strategies Design

## Goal

Introduce explicit provider-specific inline completion strategies so OpenAI-style providers, VS Code LM, and Ollama can each apply different prompt and completion transport behavior without scattering provider-specific conditionals across every provider implementation.

## Scope

Included in this design:
- provider-specific inline prompt variants
- provider-specific stop-sequence handling
- provider-specific max-token shaping for inline completion
- focused tests for strategy selection and key provider differences

Explicitly excluded from this slice:
- provider-specific cleanup heuristics after response text is returned
- commit-message strategy changes
- larger provider architecture changes outside inline completion

## Recommended Approach

Add a dedicated `inlineStrategies` module under `src/providers/` that owns provider-to-strategy mapping and produces a resolved inline completion payload:
- `prompt`
- `maxTokens`
- `stopSequences`

OpenAI, Anthropic, and Gemini share one chat-oriented strategy. VS Code LM gets its own strategy because native stop handling is limited and works better with prompt-level directives. Ollama gets its own strategy because local coder models respond better to terser inline-focused prompting and tighter transport constraints.

## Code Boundaries

- `src/providers/inlineStrategies.ts`
  - provider-to-strategy mapping
  - prompt builders per strategy
  - resolved inline config builder
- `src/providers/prompts.ts`
  - remains reusable for shared prompt building
  - can delegate to smaller helper functions if needed
- provider implementations
  - stop hardcoding inline prompt/max-token/stop behavior
  - call the strategy resolver instead

## Strategy Differences

### Chat providers (`openai`, `anthropic`, `gemini`)

- Keep the current shared prompt style as the baseline.
- Preserve request stop sequences.
- Preserve requested token budget unless the request omitted it.

### VS Code LM (`vscode-lm`)

- Use a VS Code LM-specific prompt variant that embeds stronger single-line stopping instructions when newline stopping is requested.
- Do not rely on transport-level stop sequences.
- Cap automatic inline max tokens more tightly than shared chat providers to reduce run-on responses from extension-host LM backends.

### Ollama (`ollama`)

- Use a shorter local-model-oriented prompt variant for inline completion.
- Preserve transport-level stop sequences.
- Cap automatic inline max tokens to a tighter bound than chat providers to reduce verbose local completions.

## Testing

- Add strategy tests in `src/providers/inlineStrategies.test.ts`.
- Verify provider selection maps to the expected strategy family.
- Verify VS Code LM removes transport stop sequences and injects prompt stopping instructions.
- Verify Ollama uses its own prompt variant and token cap behavior.
- Keep provider integration changes light and covered indirectly through the strategy module tests.

## Risks and Mitigations

- Risk: strategy logic becomes another dumping ground for provider quirks.
  - Mitigation: keep it limited to prompt, stop, and max-token resolution only.
- Risk: hidden behavior drift across providers.
  - Mitigation: make the resolved config explicit and testable in a single module.

## Success Criteria Mapping

- Provider-specific behavior is explicit in the codebase.
  - Satisfied by the dedicated strategy module and provider mapping.
- Shared behavior remains reusable.
  - Satisfied by keeping shared prompt helpers and only splitting targeted differences.
- Tests cover strategy selection and key differences.
  - Satisfied by focused module tests for each strategy family.
