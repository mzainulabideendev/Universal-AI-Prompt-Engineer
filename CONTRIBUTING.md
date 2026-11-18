# Contributing

Thanks for taking the time to improve Universal AI Prompt Engineer.

## Getting started

```powershell
git clone https://github.com/mzainulabideendev/Universal-AI-Prompt-Engineer.git
cd Universal-AI-Prompt-Engineer
npm install
npm run compile
npm test
```

Press **F5** in VS Code to launch the Extension Development Host.

## What is most useful

- **Mode design.** If a mode produces weak output for a real task, share the rough prompt and the
  result. Mode behaviour lives in `MODE_INSTRUCTIONS` in `src/aiProvider.ts`.
- **Provider compatibility.** Report the provider, endpoint shape and the exact error message.
- **UI issues.** Screenshots in both light and dark themes help a lot.
- **Tests.** Anything that turns a manual checklist item into an automated test.

## Architecture in one minute

| File | Responsibility |
|---|---|
| `src/promptEngine.ts` | mode catalogue: id, label, description, icon, tooltip |
| `src/aiProvider.ts` | URL validation, request building, response/error parsing, input limits |
| `src/extension.ts` | activation, commands, tree views, webview panel, output routing |

Rules of thumb:

1. Every entry point must funnel through `enhancePromptFromText()` so behaviour stays consistent.
2. Never persist the API key outside `SecretStorage`.
3. Keep the webview free of external resources; the CSP is intentionally strict.
4. Use `--vscode-*` CSS variables — no hard-coded theme colours.
5. Errors from the provider are surfaced verbatim; no silent fallbacks.

## Code style

- TypeScript, `strict` mode, no `any` in new code.
- Match the existing formatting (2 spaces, single quotes, trailing semicolons).
- Keep functions small and name them for what they do.
- Comments explain *why*, not *what*.

## Before opening a pull request

- [ ] `npm run compile` passes without errors
- [ ] `npm test` passes
- [ ] New behaviour has a test where the logic is testable without VS Code
- [ ] `CHANGELOG.md` has an entry under `Unreleased`
- [ ] UI changes were checked in dark **and** light themes
- [ ] Screenshots in the README were regenerated if the panel changed
      (`node docs/preview/build-images.cjs`)

## Commit messages

Conventional commits are appreciated:

```
feat(panel): add character counter
fix(provider): reject endpoints with query strings
docs(readme): document output modes
test(modes): assert mode metadata is complete
```

## Reporting a security issue

Please do not open a public issue for vulnerabilities involving keys, secret handling or request
construction. Open a private security advisory on the repository instead, or contact the maintainer
through their GitHub profile.
