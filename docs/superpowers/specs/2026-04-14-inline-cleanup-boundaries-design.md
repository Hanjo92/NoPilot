# Inline Cleanup Boundaries Design

## Goal

Make inline completion cleanup more boundary-aware so insertions stop closer to the useful endpoint without removing valid code.

## Scope

This slice only strengthens post-processing heuristics in `cleanInlineCompletionText`.

Included:
- better trimming when the completion repeats short structural suffix lines such as `}` or `};`
- better trimming when a completion finishes a useful block and then drifts into an obvious next statement after a blank line

Excluded:
- provider prompt changes
- language-specific parsers
- broad syntax-aware completion validation

## Recommended Approach

Keep the cleanup conservative and test-driven:

1. Extend suffix line overlap handling so short structural lines can also be removed when they clearly duplicate the suffix.
2. Add one focused heuristic that trims content after a completed block if a blank line is followed by an obvious next statement.

## Why This Scope

The issue is about noisy output boundaries, not full code understanding. These heuristics are narrow enough to stay safe, but they cover two common sources of “one step too far” completions:

- duplicated closing structure already present in the suffix
- a useful block followed by an unnecessary extra statement

## Success Criteria Mapping

- inline completions more often end at the intended line/block boundary
- obvious trailing noise is removed before insertion
- focused tests cover the new cleanup behavior
