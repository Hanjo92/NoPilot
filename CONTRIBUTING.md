# Contributing

Thanks for helping improve NoPilot.

## Before You Start

- Check existing GitHub issues before opening a new one.
- For larger changes, open or reference an issue first so scope and direction are clear.
- Keep pull requests focused and small when possible.

## Local Setup

```bash
npm install
npm test
npm run lint
npm run build
```

## Pull Request Guidelines

- Describe the problem and the change clearly.
- Add or update tests when behavior changes.
- Update documentation when setup, behavior, or UI changes.
- Avoid unrelated refactors in the same pull request.

## Extension-Specific Notes

- API keys should never be committed. NoPilot uses VS Code SecretStorage for persisted provider keys.
- If a change affects provider requests or data flow, document that impact in the pull request.
- If a change affects the Marketplace listing or user-facing settings, update `README.md` or `CHANGELOG.md` as needed.
