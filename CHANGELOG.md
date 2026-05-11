# Changelog

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog, and this project follows Semantic Versioning.

## [Unreleased]

### Added

- Settings usage summary now includes a donut chart that shows each provider's share of total requests.

## [0.2.1] - 2026-05-10

### Fixed

- Restored provider usage visibility in the model picker without adding extra option rows that break Quick Pick rendering.
- Kept current, total, and most-used provider usage visible across the status bar tooltip, settings view, and model picker summary.

## [0.2.0] - 2026-04-23

### Added

- Remote Ollama optimization mode with Auto, Forced On, and Forced Off controls.
- Marketplace and README guidance for provider setup, remote Ollama endpoints, and data handling.
- Inline request status feedback for remote or slow Ollama suggestions.

### Changed

- Automatic remote Ollama inline suggestions now use leaner file-scoped context and smaller token budgets.
- Inline cache scopes now separate standard and remote-optimized request profiles.
- Settings UI now surfaces Ollama endpoint refresh, remote mode, and provider model state more clearly.

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
