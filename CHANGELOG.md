# Changelog

All notable changes to **Universal AI Prompt Engineer** are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] — 2026-11-18

### Added

- **Redesigned Prompt Engineer panel**: two-column compose/result layout, provider status pill,
  character counter, empty state, inline error banner, copy toast, and `Ctrl+Enter` to enhance.
- **Setup view** in the Prompt Engineer Activity Bar container (Set API Key, Clear API Key,
  Open Panel, Extension Settings) alongside the existing Modes view.
- **Mode icons and descriptions** on every sidebar entry; clicking a mode opens the panel with that
  mode preselected and the current editor selection pre-filled.
- **`Ctrl+Alt+O`** keybinding for opening the panel.
- Theme-aware styling using `--vscode-*` CSS variables, so light and high-contrast themes render correctly.
- Live reaction to settings changes (status bar visibility and the panel re-read the configuration).
- Test coverage for the mode catalogue, prompt limits, missing credentials, mode instructions and
  empty provider completions (11 tests).
- Documentation: README with architecture and flow diagrams, screenshots, testing checklist,
  contributing guide, CI workflow.

### Changed

- Shared mode metadata (`label`, `description`, `icon`, `tooltip`) now lives in `promptEngine.ts`
  and drives both the tree views and the panel picker.
- Panel webview keeps its state when hidden (`retainContextWhenHidden`) and restricts
  `localResourceRoots` to the extension folder.
- The provider API key is never echoed back to the webview; the panel only reports whether one exists.

### Fixed

- Panel background no longer hard-coded to a dark colour, which previously broke light themes.
- Status bar visibility now respects `showStatusBar` changes without a window reload.
- Clipboard writes are confirmed in the UI instead of failing silently.

## [0.1.0] — 2026-11-18

### Added

- Initial release: nine enhancement modes, prompt panel, selection and clipboard commands,
  SecretStorage-backed API key, configurable endpoint/model/output mode, unit tests.
