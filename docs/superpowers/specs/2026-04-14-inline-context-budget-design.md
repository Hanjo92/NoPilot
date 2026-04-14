# Automatic Inline Context Budget Design

**Problem:** Automatic inline completions currently clamp same-file prefix/suffix context more aggressively than the exposed settings imply. This makes suggestions weak or absent because nearby declarations and surrounding logic are omitted from the request.

**Decision:** Treat `nopilot.inline.maxPrefixLines` and `nopilot.inline.maxSuffixLines` as the true same-file context budget for both automatic and explicit inline requests. Keep quality profiles focused on token budget, blank-line aggressiveness, and whether extra cross-file context is allowed.

**Why:** Users already have explicit settings for same-file context size. Applying an additional hidden automatic cap makes the feature feel unreliable and makes the settings misleading. Respecting configured line budgets should improve relevance without reintroducing the heavier cross-file behavior that earlier tuning intentionally reduced.

**Scope:**
- update automatic inline policy tests to reflect that same-file line budgets are no longer profile-capped
- keep automatic profile differences for `maxTokens`, trigger filtering, and `includeAdditionalContext`
- avoid changing provider prompts or cross-file context assembly in this slice

**Risks and mitigations:**
- Larger same-file context can increase request size.
  - Mitigation: keep `balanced` and `fast` profiles lean on extra context and tokens.
- Rich and balanced may feel closer in some files.
  - Mitigation: preserve profile differences through token budgets and additional-context behavior.
