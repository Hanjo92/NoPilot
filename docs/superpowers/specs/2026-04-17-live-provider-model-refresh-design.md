# Live Provider Model Refresh Design

**Issue:** `#35`

## Problem

OpenAI, Anthropic, and Gemini model options are currently hard-coded inside each provider class. Those fallback lists are already drifting away from the providers' current production model catalogs, which makes the settings UI feel stale and can hide better default choices.

## Goal

Keep direct-provider model selection fresh without sacrificing reliability:

- ship curated fallback model lists for first load and offline/error cases
- refresh available models from each provider's live models API when credentials are present
- preserve a stable, usable current-model selection when refresh fails or returns an unexpected set

## Non-Goals

- replacing Ollama's existing dynamic model refresh flow
- building a universal capability taxonomy for every provider
- validating every returned model by making completion calls
- exposing preview/internal-only models unless they can be filtered safely from the list API response

## Recommended Approach

Introduce a shared direct-provider model catalog module with two responsibilities:

1. Define curated fallback model lists and defaults for `openai`, `anthropic`, and `gemini`
2. Fetch and normalize live model IDs from each provider API when credentials are available

Each direct provider should:

- initialize `availableModels` from the shared fallback list immediately
- attempt a live refresh during `isAvailable()` / `refreshClient()`
- keep the fallback list if the live refresh fails
- keep `currentModel` if it is still valid, otherwise choose the best refreshed default

## Provider-Specific Strategy

### OpenAI

- fallback list should prefer current text/code-capable production models
- live refresh should use the official models list API
- filter out embeddings, audio-only, moderation, image-only, realtime-only, and obviously deprecated families

### Anthropic

- fallback list should include current Claude production families
- live refresh should use the official models list API
- keep only Claude text-generation model IDs suitable for message generation/completion

### Gemini

- fallback list should move to the current Gemini 2.5 production family
- live refresh should use the official Gemini models list API
- keep only `generateContent`-capable text-generation models, excluding TTS/image-only/live-only variants

## Shared Selection Rules

- curated fallbacks are always available without network success
- if refreshed models are non-empty, replace the displayed `availableModels`
- if `currentModel` is missing from the refreshed list, select the first preferred refreshed model
- if refresh returns empty or errors, keep the fallback list untouched

## Integration Points

- add a new provider-model catalog helper under `src/providers`
- update `OpenAIProvider`, `AnthropicProvider`, and `GeminiProvider` to read fallback lists from it
- use provider-specific refresh helpers during `isAvailable()` / `refreshClient()`
- leave settings panel rendering unchanged so refreshed `availableModels` automatically flow through the existing UI

## Risks

### Risk: provider API changes or permission differences

Mitigation:

- keep curated fallback lists
- swallow refresh failures and keep provider status behavior stable

### Risk: bad filtering removes useful models

Mitigation:

- keep filter rules explicit and test them with representative samples
- favor inclusive curated fallbacks over overly clever live filtering

### Risk: refresh latency affects settings or activation

Mitigation:

- reuse existing provider initialization path
- only refresh when credentials exist
- keep the UI usable with fallback models even before live refresh completes

## Test Strategy

- pure tests for provider catalog fallback/default selection
- pure tests for live model filtering per provider
- provider-level tests confirming refreshed models replace fallbacks when available
- verification that fallback lists remain when refresh fails
