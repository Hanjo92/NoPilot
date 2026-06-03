# Changelog

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog, and this project follows Semantic Versioning.

## [Unreleased]

### Added

- Custom `nopilot.commitMessage.customPrompt` support for AI-generated commit messages, including `{{diff}}` and `{{language}}` placeholders and settings UI support.

## [0.3.3] - 2026-06-02

### Fixed

- Stopped the settings webview from refreshing endpoint-backed providers on every state render, which could trigger repeated settings panel redraws and make menu controls difficult to select.
- Kept Ollama and OpenAI-compatible provider refreshes tied to explicit endpoint/base URL actions instead of ordinary state reads.

## [0.3.2] - 2026-06-01

### Changed

- Refreshed Marketplace and README copy to match the current Activity Bar menu, provider-first model selection, settings dashboard, usage visibility, and endpoint support.
- Clarified VS Code setting descriptions for provider switching, inline suggestions, commit messages, and provider-specific models.

## [0.3.1] - 2026-06-01

### Added

- Added a NoPilot Activity Bar entry with sidebar shortcuts for core extension actions.

### Changed

- Changed provider/model selection to choose a provider first, then select from that provider's models.
- Updated the settings panel to refresh provider activation state immediately after clicking Activate.

## [0.3.0] - 2026-05-19

### Added

- Added OpenAI-compatible provider support with separate base URL, model, and API key handling.
- Settings usage summary now includes a donut chart that shows each provider's share of total requests.

### Fixed

- Rendered the settings usage chart without CSP-blocked inline style attributes.

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
