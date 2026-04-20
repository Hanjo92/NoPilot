# Remote Ollama Inline Usability Design

## Goal

Improve the usability of NoPilot inline suggestions for remote Ollama setups where latency and network variability make suggestions feel slow, inconsistent, and opaque.

The main objective is not only to reduce wait time, but to make the extension clearly communicate what is happening while a request is in flight.

## User Problem

For remote Ollama usage, inline suggestions currently feel unreliable in three ways:

- users do not know whether a request started or why no suggestion appeared
- the extension stays too quiet while network or model latency is happening
- overall responsiveness feels uneven, especially for automatic inline requests

The priority order for improvement is:

1. Make state visible in a lightweight way
2. Improve first-response speed
3. Preserve context quality without turning the product into a tuning-heavy tool

## Chosen Direction

Use a **hybrid adaptive mode** for remote Ollama inline suggestions.

This combines:

- automatic detection of remote-like Ollama behavior
- a manual override with `Auto`, `Forced On`, and `Forced Off`
- short-lived status surfaced in both the editor and status bar
- more aggressive request trimming for automatic inline requests in remote mode
- conservative context preservation so quality does not collapse when optimizing for speed

This is preferred over a status-only improvement because it addresses both visibility and responsiveness, and preferred over a fully separate remote pipeline because the added complexity is not justified yet.

## UX Principles

### 1. Quiet by default, visible when work starts

The extension should remain mostly quiet during ordinary use. When an inline request starts, NoPilot should briefly surface status in a way that reassures the user the system is active.

The default behavior should be:

- show lightweight feedback when a request starts
- remove that feedback quickly on success
- keep stronger feedback only for slow, cancelled, or failed requests

### 2. Show practical status, not debug telemetry

The user does not need transport-level details or internal state machine labels. Status copy should stay practical and product-facing.

Good examples:

- `Requesting from remote Ollama…`
- `Slow response from model`
- `Connection problem`
- `Request cancelled`

Bad examples:

- `network phase`
- `post-processing`
- `context assembly cache miss`

### 3. Optimize automatic requests first

Automatic inline requests are where remote Ollama latency hurts most. Explicit actions such as inline chat or intentional manual requests can keep richer behavior because the user has already signaled willingness to wait.

## Product Behavior

### Remote Mode Detection

NoPilot should support three remote mode states:

- `auto`
- `forced-on`
- `forced-off`

In `auto`, NoPilot detects remote-like behavior using practical heuristics rather than one fragile rule. The design should allow multiple signals to contribute, such as:

- endpoint host not resolving to local loopback or localhost
- repeated response durations above the normal local threshold
- network-style failures or timeouts

The user should be able to override detection completely:

- `forced-on` always applies remote-optimized inline behavior
- `forced-off` always uses standard inline behavior

### Request Feedback

When an automatic inline request starts in remote mode:

- show a short-lived editor-adjacent hint
- update the status bar to reflect active remote Ollama request state

When the request succeeds quickly:

- clear the temporary hint
- restore the quieter default status bar presentation

When the request becomes noticeably slow:

- keep a visible but lightweight status
- use wording that acknowledges the wait without sounding broken

When the request is cancelled:

- briefly show that the previous request was cancelled
- avoid making cancellation feel like a hard failure

When the request fails:

- show a practical status such as `Connection problem`
- avoid noisy modal errors unless the failure becomes persistent or actionable

### Request Policy Changes in Remote Mode

Remote mode should prioritize first-response speed for automatic inline requests.

That means:

- smaller token budget for automatic requests
- more conservative use of expensive workspace-wide context
- stronger preference for file-local and near-cursor context
- faster cancellation of stale requests

Explicit requests should continue to use richer context and larger response budgets than automatic requests.

## Context Strategy

Remote mode must reduce request cost without making suggestions feel random.

The preserved context should be prioritized in this order:

1. current cursor-local prefix and suffix
2. current block context
3. current file structure summary
4. immediate recent typing flow

The reduced or deprioritized context should include:

- broader similar-file sampling
- more expensive workspace scans
- context that does not strongly affect the next likely completion

This keeps completions anchored to the user’s current intent while trimming the most latency-sensitive parts of request assembly.

## Surface Design

### Status Bar

The status bar remains the persistent anchor for current provider and model. In remote mode it should also temporarily reflect request state when relevant.

Examples:

- `Ollama · qwen2.5-coder`
- `Ollama · qwen2.5-coder · Waiting`
- `Ollama · qwen2.5-coder · Slow response`

This should decay back to the quieter default state after the request resolves.

### Editor Hint

The editor hint is the short-lived, higher-signal companion to the status bar. It should appear when a request starts and should disappear quickly if the request resolves normally.

This surface should be used for:

- request started
- noticeably slow response
- cancelled request
- connection problem

It should not become a permanent overlay or clutter the editing flow.

## Error Handling

The design should distinguish between:

- normal cancellation because the user kept typing
- slow but valid remote response
- actual connectivity or model failure

Cancellation should not be treated as a visible error unless repeated cancellations are creating a clearly confusing experience. Connection and availability problems should be summarized simply and recover gracefully without forcing the user into settings immediately.

## Scope

### In scope

- remote-mode detection model with manual override
- status bar request-state presentation for remote Ollama
- editor-adjacent short-lived request feedback
- remote-mode automatic request budget adjustments
- context prioritization tuned for remote inline behavior

### Out of scope

- redesigning the entire settings panel
- rewriting all provider inline logic into provider-specific pipelines
- exposing many low-level tuning knobs to users
- solving absolute Ollama inference speed limits

## Acceptance Criteria

- users can tell when a remote Ollama inline request has started
- users can distinguish slow response, cancellation, and connection problems
- automatic inline requests in remote mode feel more responsive than the current baseline
- explicit inline actions keep richer behavior than automatic requests
- remote-mode behavior can be forced on or off by the user

## Testing Strategy

Testing should cover:

- remote-mode detection and override precedence
- status presentation for waiting, slow, cancelled, and error states
- request-policy differences between standard mode and remote mode
- context pruning rules for automatic remote requests
- regression coverage so non-Ollama providers and local Ollama behavior remain unchanged

## Risks and Mitigations

### Risk: Remote detection feels wrong

Mitigation:

- keep a user override
- avoid relying on a single heuristic
- prefer obvious, explainable heuristics

### Risk: Faster requests become noticeably worse

Mitigation:

- preserve current block and file-local context first
- reduce broader context before reducing local context
- keep explicit requests richer than automatic ones

### Risk: Status UI becomes noisy

Mitigation:

- only show request state briefly
- decay back to quiet default after normal completion
- keep status vocabulary small and human-readable
