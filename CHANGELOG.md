# Changelog

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog, and this project follows Semantic Versioning.

## [0.1.0] - 2026-04-11

### Added

- Multi-provider AI support for VS Code LM, OpenAI, Anthropic, Gemini, and Ollama.
- Inline code completion, inline chat editing, and commit message generation.
- Settings webview with provider management, model selection, and inline behavior controls.
- Copilot-aware automatic inline pause option to reduce overlapping suggestions.
- Test suite covering model selection, provider credentials, inline text handling, git selection, webview composition, and status bar presentation.

### Changed

- Refactored the settings UI into dedicated body, styles, script, and presentation modules.
- Improved inline completion request filtering, provider state handling, and status bar feedback.

### Notes

- GitHub Copilot overlap detection is best-effort and cannot reliably detect quota exhaustion or sign-in expiry.
