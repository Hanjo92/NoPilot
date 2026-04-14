# Inline Structure Context Design

**Issue:** `#24`

## Problem

Inline completion quality can improve when the model sees a little more file-level and project-level context, but sending entire files or multiple long samples would increase prompt cost and can drown out the local cursor context. The current inline pipeline already carries prefix/suffix slices, optional block context, and optional additional context, but it does not provide a compact summary of the current file structure or a carefully capped example from a similar project file.

## Goal

Improve inline completion quality by adding low-cost structural context:

- a compact summary of the current file's structure
- at most one short similar-file sample when it is likely to help

This should make suggestions feel more aligned with the active script's style and project conventions without turning automatic inline requests into heavy cross-file prompts.

## Non-Goals

- sending the entire current file as additional context
- sending several project files on every automatic request
- adding syntax-tree dependencies or language-server-only logic
- replacing the existing prefix/suffix or current-block context mechanisms

## Constraints

- keep automatic inline prompts lightweight
- preserve existing caching patterns so repeated requests do not repeatedly rebuild expensive context
- prefer deterministic heuristics over slow or fuzzy repository-wide ranking
- cap all added context aggressively

## Recommended Approach

Use a two-layer lightweight context strategy:

### 1. Current File Structure Summary

Build a small structural summary from the active file. This should prefer signal over volume.

Candidate contents:

- file basename
- nearest top-level declarations such as class names, widget names, or function signatures
- a short list of relevant method or field signatures near the current block
- possibly the first few important declarations from the file header when they are short

This is not full source text. It is a compact scaffold that tells the model what kind of file it is inside and what major symbols exist.

### 2. One Similar-File Sample

Optionally include one short sample from another project file when it is likely to help.

Selection rules:

- same language only
- prefer open files first
- prefer filenames or top-level symbol names that share words with the current file or recent referenced symbols
- skip the current file
- pick only one file
- cap the extracted sample to a small range, such as a short top section or one matching declaration window

This sample should act as a style/reference hint, not as a second full context body.

## Context Budget Rules

To keep prompt cost bounded:

- always cap current-file structure summary length
- always cap similar-file sample length
- never include more than one similar-file sample
- skip similar-file sampling entirely when no strong candidate exists quickly
- allow richer profiles to include this context more often than fast profiles

## Integration Points

### Completion Request Assembly

Extend inline request assembly so it can compute:

- `currentFileStructureContext`
- `similarFileSampleContext`

These should be composed into the existing `additionalContext` field rather than creating many separate prompt sections at first. That keeps the change smaller and easier to test.

### Caching

The existing derived-context cache should be reused. The cache key should expand only by the minimum new inputs needed for correctness, such as:

- current document version
- selected similar-file URI when a sample is included
- referenced symbols or filename-derived match keys used in selection

### Prompting

The prompt should continue to center the cursor-local code first. The new structure/sample context should remain supporting material, not the primary instruction.

## Heuristic Details

### Current File Structure Summary

Good candidates:

- `class PuzzleGamePage extends StatefulWidget`
- `_PuzzleGamePageState extends State<PuzzleGamePage>`
- `void _checkWin()`
- `void _gameOver()`

Bad candidates:

- long method bodies
- large state initialization blocks
- repeated literal-heavy sections

### Similar-File Sample Selection

Good candidates:

- another Flutter `State` class file in the same project
- an open Dart file with similar widget or method names
- a file matching referenced symbols from the current prefix

Bad candidates:

- generated files
- unrelated helper files with different structure
- large utility files chosen only because of a weak filename overlap

## Risks

### Risk: Prompt bloat

Too much structure/sample context could dilute local completion quality.

Mitigation:

- hard caps
- one sample maximum
- selective inclusion only

### Risk: Wrong sample chosen

A weakly related sample can bias completions in the wrong direction.

Mitigation:

- prefer deterministic high-confidence matches
- skip sampling when confidence is low

### Risk: Extra request-build latency

Cross-file scanning can slow automatic inline completions.

Mitigation:

- open-file-first heuristics
- small search space
- reuse existing derived-context caching
- strict timeout/fallback behavior

## Test Strategy

Focused tests should cover:

- current-file structure summary extraction stays compact
- similar-file selection prefers a strong same-language candidate
- sampling is skipped when no good candidate exists
- assembled additional context stays bounded
- existing request assembly cache behavior remains correct with the new inputs

## Rollout Recommendation

Implement this in two small slices:

1. current-file structure summary
2. one similar-file sample

That keeps it easy to evaluate quality and latency impact separately if needed.
