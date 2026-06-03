# NoPilot

> Provider-switching AI coding for VS Code. Use inline completions, inline chat, commit messages, usage-aware provider controls, and local or remote model endpoints from one NoPilot menu.

NoPilot gives VS Code a lightweight AI coding workflow without locking you to one provider. Open the NoPilot Activity Bar entry, choose a provider first, then choose a model from that provider. You can use VS Code Language Models, Claude, OpenAI/GPT, Gemini, OpenAI-compatible APIs, and local or remote Ollama servers.

![NoPilot Shield](https://img.shields.io/badge/VS_Code-Extension-blue.svg)
![AI Models](https://img.shields.io/badge/Models-VS_Code_LM_%7C_Claude_%7C_GPT_%7C_Gemini_%7C_OpenAI--Compatible_%7C_Ollama-success.svg)

## Highlights

- **Activity Bar control center**: Open NoPilot from the VS Code Activity Bar and jump to settings, provider/model selection, API keys, inline suggestion toggles, or commit message generation.
- **Provider-first model picker**: Choose the provider first, then pick from that provider's models instead of scanning one long mixed model list.
- **Settings dashboard**: Activate providers, set API keys, refresh live model lists, configure endpoints, and review request usage in one webview.
- **Usage visibility**: See current provider requests, total requests, top provider, and provider share in the status bar and settings dashboard.
- **Inline completions**: Get automatic ghost text with Fast, Balanced, or Rich quality profiles.
- **Inline Chat**: Select code, press `Ctrl+I` or `Cmd+I`, and ask NoPilot to edit or replace it in place.
- **AI commit messages**: Generate conventional or simple commit messages from your Git diff.
- **Remote and custom endpoints**: Use OpenAI-compatible `/v1` gateways and local, LAN, tunneled, or remote Ollama servers.
- **Local-first secrets**: Provider keys are stored through VS Code SecretStorage, not plain settings JSON.

## Getting Started

1. Install NoPilot.
2. Open the NoPilot icon in the VS Code Activity Bar, or run **NoPilot: Open Settings** from the Command Palette.
3. Configure a provider:
   - **VS Code LM**: Uses language models already available through VS Code.
   - **Anthropic, OpenAI, Gemini**: Save an API key, then choose a model.
   - **OpenAI-Compatible**: Set a `baseUrl`, save an API key, refresh models, then choose a model exposed by your server.
   - **Ollama**: Set a local or remote endpoint, refresh models, then choose a completion model.
4. Run **NoPilot: Select Provider / Model** from the sidebar, status bar, or Command Palette.
5. Start typing. Accept inline suggestions with `Tab`.

## NoPilot Menu

The NoPilot Activity Bar entry opens a compact sidebar menu:

- **Open Settings**: Open the provider and extension settings dashboard.
- **Select Provider / Model**: Pick a provider first, then a model from that provider.
- **Set API Key**: Save or change credentials through VS Code SecretStorage.
- **Toggle Inline Suggestions**: Enable or disable automatic ghost text.
- **Generate Commit Message**: Create a commit message from the current Git changes.

The status bar also shows the active provider/model with request usage and opens the same provider/model picker when clicked.

## Provider And Model Selection

NoPilot separates provider selection from model selection:

1. Choose a provider such as VS Code LM, Anthropic, OpenAI, OpenAI-Compatible, Gemini, or Ollama.
2. NoPilot shows only models for that provider.
3. Pick a model, or open the full settings dashboard if setup is needed.

This keeps the model picker readable when several providers or live model catalogs are available.

## Provider Setup

### VS Code LM

Use this when you want NoPilot to call models already available through VS Code. You can leave `nopilot.model` empty to use the provider default, or choose a discovered model from NoPilot.

### Anthropic, OpenAI, And Gemini

Use **NoPilot: Set API Key** or the settings dashboard to store credentials. Provider model settings are separate:

- `nopilot.anthropic.model`
- `nopilot.openai.model`
- `nopilot.gemini.model`

### OpenAI-Compatible

Use this provider for custom OpenAI-style gateways, proxies, and self-hosted endpoints.

Example:

- `nopilot.provider = openai-compatible`
- `nopilot.openaiCompatible.baseUrl = https://llm.example.com/v1`
- Save your API key through **NoPilot: Set API Key** or the settings dashboard
- `nopilot.openaiCompatible.model = gpt-oss:20b`

NoPilot queries `${baseUrl}/models` and sends chat-completions requests through the configured API root. Custom model names stay separate from official `nopilot.openai.*` settings.

### Ollama

Set `nopilot.ollama.endpoint` to `http://localhost:11434` or to a LAN, tunnel, proxy, or remote server URL. Refresh models from the settings dashboard, then choose a model with **NoPilot: Select Provider / Model**.

Remote Ollama mode can automatically use leaner automatic inline requests when latency or network behavior makes a server feel remote.

## Keybindings

- `Tab`: Accept inline suggestions.
- `Ctrl+I` on Windows/Linux or `Cmd+I` on macOS: Open Inline Chat for the current selection.
- Source Control magic wand: Generate a commit message from the current Git diff.

## Important Settings

You can customize NoPilot through **VS Code Settings > Extensions > NoPilot** or the NoPilot settings dashboard:

- `nopilot.provider`: Active provider for NoPilot requests.
- `nopilot.model`: Optional VS Code LM model override.
- `nopilot.inline.enabled`: Enable automatic inline suggestions.
- `nopilot.inline.qualityProfile`: Choose `fast`, `balanced`, or `rich` automatic inline behavior.
- `nopilot.inline.pauseWhenCopilotActive`: Pause automatic NoPilot suggestions when GitHub Copilot is active for the current language.
- `nopilot.inline.debounceMs`: Delay before requesting an automatic suggestion.
- `nopilot.inline.maxPrefixLines`: Maximum lines before the cursor to include as inline context.
- `nopilot.inline.maxSuffixLines`: Maximum lines after the cursor to include as inline context.
- `nopilot.ollama.endpoint`: Ollama server endpoint, local or remote.
- `nopilot.ollama.remoteMode`: `auto`, `forced-on`, or `forced-off` remote Ollama optimization.
- `nopilot.ollama.model`: Ollama completion model.
- `nopilot.anthropic.model`: Anthropic model.
- `nopilot.openai.model`: OpenAI model.
- `nopilot.openaiCompatible.baseUrl`: OpenAI-compatible API base URL.
- `nopilot.openaiCompatible.model`: OpenAI-compatible model.
- `nopilot.gemini.model`: Gemini model.
- `nopilot.commitMessage.language`: Commit message language, such as `en`, `ko`, or `ja`.
- `nopilot.commitMessage.format`: `conventional` or `simple`.

## Usage Visibility

NoPilot tracks request counts per provider in extension storage. The status bar and settings dashboard show:

- current provider request count
- total request count
- most-used provider
- provider share across configured providers

These counts are local convenience data for the extension UI.

## Security And Data Handling

Your source code is sent only to the provider you select. Provider API keys are stored locally using VS Code SecretStorage. Ollama and OpenAI-compatible requests go only to the endpoint you configure.

- NoPilot sends prompts and code context only to the active provider.
- Provider API keys are stored locally in VS Code SecretStorage.
- Ollama requests are sent to the configured endpoint, which may be local or remote.
- OpenAI-compatible requests are sent to the configured `baseUrl`.
- This project currently does not implement custom telemetry or analytics collection.
- You are responsible for reviewing the data handling and retention policies of any third-party model provider you enable.

Do not commit real API keys, internal gateway URLs, or temporary tunnel URLs into workspace settings, screenshots, docs, or examples.

## Troubleshooting

- Open **NoPilot: Open Settings** to confirm the active provider, API key state, endpoint, and selected model.
- Use **NoPilot: Select Provider / Model** to verify that the provider exposes selectable models.
- For Ollama, refresh models after changing `nopilot.ollama.endpoint`.
- For OpenAI-compatible servers, confirm that the configured `baseUrl` points to the API root, such as `https://llm.example.com/v1`.
- Check **Output > NoPilot** for provider state and request diagnostics.

## Project Links

- Support: [SUPPORT.md](./SUPPORT.md)
- Contributing: [CONTRIBUTING.md](./CONTRIBUTING.md)
- Code of Conduct: [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md)
- Security: [SECURITY.md](./SECURITY.md)
- Maintainer automation: [docs/operations/weekday-issue-slack-notifier.md](./docs/operations/weekday-issue-slack-notifier.md)

---

Built for developers who want AI coding help without giving up provider choice.
