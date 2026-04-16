# NoPilot 🚀

> **A Next-Generation, Multi-Provider AI Coding Assistant for VS Code**

NoPilot is a powerful, customizable alternative to GitHub Copilot. It brings high-performance, context-aware AI completion and inline code editing right into your IDE without tying you to a single subscription or model. Bring your own keys and start coding!

![NoPilot Shield](https://img.shields.io/badge/VS_Code-Extension-blue.svg)
![AI Models](https://img.shields.io/badge/Models-OpenAI_%7C_Anthropic_%7C_Gemini_%7C_Ollama-success.svg)

## ✨ Core Features

* 🌐 **Multi-Provider Support**: Seamlessly switch between OpenAI (GPT-4o), Anthropic (Claude 3.5 Sonnet), Google Gemini (1.5 / 2.0 Flash), local Ollama models, and native VS Code Language Models.
* ⚡ **Zero-Latency LRU Cache**: Type, delete, and retype securely. Our aggressive local memory cache brings up ghost text instantly (0ms) if you encounter identical contexts, avoiding repeating expensive API calls.
* 🧠 **Deep LSP Semantic Context**: NoPilot doesn't just guess filenames. It leverages VS Code's `WorkspaceSymbolProvider` to deeply understand your project architecture. It fetches exact class, struct, and interface definitions across the workspace under the hood to ensure zero-hallucination code generation.
* 🎯 **Dynamic Single/Multi-Line Generation**: Analyzes your cursor position instantly to determine whether you need a single variable (stopping at `\n`), or a full function implementation, preventing bloated, unnecessary code generation and broken brackets.
* 💬 **Interactive Inline Chat (`Ctrl+I`)**: Select a block of code, press `Ctrl+I`, and instruct the AI (e.g., *"Refactor this to be async"*). NoPilot will analyze the surroundings and intelligently replace your code in real-time.
* 📝 **Automated Git Commits**: Generates meaningful conventional commit messages locally by analyzing your diffs on the fly.

## 🚀 Getting Started

1. Install the extension.
2. Open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) and type **`NoPilot: Open Settings`**.
3. Choose your preferred AI Provider and enter your API Key safely (stored in VS Code's encrypted SecretStorage).
4. Start typing!

## ⚙️ Keybindings

* `Tab`: Accept inline suggestions.
* `Ctrl + I` (Windows/Linux) / `Cmd + I` (Mac): Open Inline Chat for the current selection.
* (From Source Control View): Click the Magic Wand icon `✨` to auto-generate a commit message.

## 🛠 Extension Settings

You can customize NoPilot's behavior fully via **VS Code Settings > Extensions > NoPilot**:

* `nopilot.inline.enabled`: Turn ghost text auto-completions on or off.
* `nopilot.inline.qualityProfile`: Pick how aggressive automatic inline suggestions should be.
* `fast`: Small context windows, lower token budgets, and more conservative auto-triggering for lower latency.
* `balanced`: Default mode with the current speed/quality tradeoff.
* `rich`: Larger context windows, higher token budgets, and richer automatic suggestions, including indented blank lines.
* `nopilot.inline.debounceMs`: Milliseconds to wait before calling the AI after typing (default `500`).
* `nopilot.provider`: Default fallback provider.

## 🔒 Security

Your source code is only sent to the specific provider you select. Keys are stored strictly locally using VS Code's Secret Storage, ensuring they are never exposed in configurations.

## 📦 Data Handling

- NoPilot sends prompts and code context only to the AI provider you explicitly choose.
- Provider API keys can be stored locally in VS Code SecretStorage.
- Ollama requests are sent to the endpoint you configure, which may be local or on your network.
- This project currently does not implement custom telemetry or analytics collection.
- You are responsible for reviewing the data handling and retention policies of any third-party model provider you enable.

## 🤝 Project Links

- Support: [SUPPORT.md](./SUPPORT.md)
- Contributing: [CONTRIBUTING.md](./CONTRIBUTING.md)
- Code of Conduct: [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md)
- Security: [SECURITY.md](./SECURITY.md)

---
**Enjoy writing code faster and smarter! 👨‍💻👩‍💻**
