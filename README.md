# NoPilot

> A multi-provider AI coding assistant for VS Code. Keep the Copilot-style workflow, but choose the model and endpoint that fit your project.

NoPilot brings inline code completion, selection-based inline edits, and AI commit messages into VS Code without locking you to a single subscription or provider. Use VS Code Language Models, Claude, GPT, Gemini, OpenAI-compatible APIs, or Ollama, including remote endpoints on your network.

![NoPilot Shield](https://img.shields.io/badge/VS_Code-Extension-blue.svg)
![AI Models](https://img.shields.io/badge/Models-VS_Code_LM_%7C_Claude_%7C_GPT_%7C_Gemini_%7C_OpenAI--Compatible_%7C_Ollama-success.svg)

## Highlights

- **Choose your provider**: Switch between VS Code LM, Anthropic, OpenAI, OpenAI-compatible APIs, Gemini, and Ollama from the NoPilot settings panel.
- **Inline completions that fit your latency**: Pick Fast, Balanced, or Rich quality profiles for automatic ghost text.
- **Remote Ollama friendly**: Auto-detect remote or slow Ollama behavior, trim automatic inline requests, and show request status when the endpoint is slow or unreachable.
- **Context-aware suggestions**: Reuse local cache entries, current-file context, nearby structure, and workspace symbols when the selected profile allows it.
- **Inline Chat**: Select code, press `Ctrl+I` or `Cmd+I`, and ask NoPilot to edit or replace it in place.
- **AI commit messages**: Generate conventional or simple commit messages from your Git diff, or override the prompt with your own template.
- **Local-first secrets**: Provider keys are stored through VS Code SecretStorage, not plain settings JSON.

## Getting Started

1. Install the extension.
2. Open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) and type **`NoPilot: Open Settings`**.
3. Choose a provider:
   - **VS Code LM**: Uses language models already available through VS Code.
   - **Anthropic, OpenAI, Gemini**: Set your API key, then choose a model.
   - **OpenAI-Compatible**: Set a `baseUrl`, save an API key, refresh models, then choose any model exposed by your compatible server.
   - **Ollama**: Set an endpoint such as `http://localhost:11434` or a remote server URL, refresh models, then choose a completion model.
4. Start typing. Accept inline suggestions with `Tab`.

### OpenAI-Compatible Quick Start

This provider is useful when you want to point NoPilot at a custom OpenAI-style gateway instead of the official OpenAI API or a raw Ollama endpoint.

Example:

- `nopilot.provider = openai-compatible`
- `nopilot.openaiCompatible.baseUrl = https://llm.example.com/v1`
- Save your API key through **NoPilot: Set API Key** or the Settings panel
- `nopilot.openaiCompatible.model = gpt-oss:20b`

This keeps custom model names such as `gpt-oss:20b` or `mistral-small:latest` separate from official `nopilot.openai.*` settings.

## Keybindings

- `Tab`: Accept inline suggestions.
- `Ctrl+I` on Windows/Linux or `Cmd+I` on macOS: Open Inline Chat for the current selection.
- Source Control magic wand: Generate a commit message from the current Git diff.

## Important Settings

You can customize NoPilot's behavior fully via **VS Code Settings > Extensions > NoPilot**:

- `nopilot.provider`: Active AI provider.
- `nopilot.model`: Optional VS Code LM model override.
- `nopilot.inline.enabled`: Turn automatic ghost text suggestions on or off.
- `nopilot.inline.qualityProfile`: Choose `fast`, `balanced`, or `rich` automatic inline behavior.
- `nopilot.inline.pauseWhenCopilotActive`: Pause automatic NoPilot suggestions when GitHub Copilot is active for the current language.
- `nopilot.inline.debounceMs`: Milliseconds to wait before requesting an automatic suggestion.
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
- `nopilot.commitMessage.customPrompt`: Optional custom prompt template. Supports `{{diff}}` and `{{language}}`, and overrides the preset format when set.

Example:

```json
"nopilot.commitMessage.customPrompt": "Generate a commit message in {{language}} using the format '<type>(<scope>): <subject>'. Use one of feat, fix, docs, refactor, test, or chore. Include a Jira ticket from the branch name when present.\n\n{{diff}}"
```

## OpenAI-Compatible Tips

Use the OpenAI-compatible provider when:

- you have a custom `/v1` proxy or gateway
- you want auth headers and model discovery through `/models`
- your backend model names are not official OpenAI names
- you want to avoid mixing custom gateway settings with official `nopilot.openai.*`

The configured `baseUrl` should point at the API root, for example `https://llm.example.com/v1`. NoPilot will query `${baseUrl}/models` and send chat-completions requests through that same root.

## Remote Ollama Tips

Remote Ollama servers can feel different from local `localhost` setups because latency and intermittent network failures are more visible while you type. NoPilot's `auto` remote mode detects remote endpoints and slow local behavior, then keeps automatic inline requests leaner. Explicit actions, such as Inline Chat, can still use richer context.

Use `forced-on` if your endpoint is behind a proxy, tunnel, LAN server, or remote machine and you always want remote-optimized inline completions. Use `forced-off` if you want local-style behavior even when NoPilot would otherwise optimize for latency.

## Security

Your source code is sent only to the provider you select. Provider API keys are stored locally using VS Code SecretStorage, and Ollama or OpenAI-compatible requests go only to the endpoint you configure.

Do not commit real API keys, internal gateway URLs, or temporary tunnel URLs into workspace settings, screenshots, docs, or examples.

## Data Handling

- NoPilot sends prompts and code context only to the AI provider you explicitly choose.
- Provider API keys are stored locally in VS Code SecretStorage.
- Ollama requests are sent to the endpoint you configure, which may be local or on your network.
- OpenAI-compatible requests are sent to the `baseUrl` you configure.
- This project currently does not implement custom telemetry or analytics collection.
- You are responsible for reviewing the data handling and retention policies of any third-party model provider you enable.

## Project Links

- Support: [SUPPORT.md](./SUPPORT.md)
- Contributing: [CONTRIBUTING.md](./CONTRIBUTING.md)
- Code of Conduct: [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md)
- Security: [SECURITY.md](./SECURITY.md)

---
Built for developers who want Copilot-style speed without giving up provider choice.
