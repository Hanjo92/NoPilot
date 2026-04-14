# Inline Function Block Context Design

**Problem:** After accepting an inline suggestion and continuing inside the same function, NoPilot can suggest the same pattern again. The automatic inline request currently sends generic prefix/suffix slices, but it does not explicitly identify the containing function or block, so the model is not guided away from code that already exists in the current block.

**Decision:** Add a lightweight current-block extraction step for automatic inline requests. When the cursor is inside a brace-delimited block, capture the surrounding block body and pass it separately in the completion request. Update the automatic inline prompt to include this block context and explicitly forbid repeating code already present there.

**Why this approach:** It addresses the repetition at the prompt level without depending only on post-generation cleanup or suppression. The prefix/suffix slices remain useful for fill-in-the-middle behavior, while the separate block context gives the model a clearer view of what has already been written inside the current function.

**Scope:**
- apply only to automatic inline requests in this slice
- support brace-delimited blocks using a lightweight text heuristic
- do not add language-server dependencies or full syntax parsing
- keep fallback behavior unchanged when no block can be identified

**Architecture:**
- create a focused `inlineBlockContext` helper that extracts the current block around a cursor offset
- add an optional `currentBlockContext` field to the completion request type
- compute block context inside `NoPilotInlineCompletionProvider.buildRequest` for automatic inline requests
- extend automatic inline prompts to include the block context and a no-repeat rule

**Risks and mitigations:**
- Heuristic block detection may miss some languages or unusual formatting.
  - Mitigation: treat block context as optional and fall back to the existing behavior.
- Larger prompts can increase request size.
  - Mitigation: cap block context length and limit the change to automatic requests only.
- Overly aggressive “do not repeat” wording could suppress useful continuations.
  - Mitigation: scope the instruction to code that already exists in the current block, not to the whole prefix.
