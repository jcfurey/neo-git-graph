# Changelog

## [Unreleased]

### Added

- Per-remote graph visibility controls with saved choices, consistent history searches, and automatic reveal when selecting a hidden remote branch.
- Horizontal scrolling within the Graph column for wide histories, using a scrollbar, trackpad or Shift+mouse wheel.

- Selectable branch focus with full-colour direct history, muted merged history and gray unrelated commits, plus an option to keep all ancestors bright.
- Focus branches from their context menus, identify the target with a Focus badge, choose subtle or strong graph dimming, and pause/resume focus without losing the target.
- Submodule commit comparisons and parent pointer staging/unstaging.
- Workspace fetch with individual results and reviewed fast-forward updates.
- Push/pull commit previews, selected merged-branch cleanup, and guided Git bisect.
- Portable workflow UI checks, three-platform CI, and a large-history benchmark.
- Branches pane beside the graph listing local branches, remotes, tags and stashes with inline actions and a toggle that hides remote branches.
- Settings cog in the header that gathers the repository tools and opens the extension's settings.
- Getting Started walkthrough, a Learn more entry that opens the shipped guide, a first-use hint above the graph, and a menu button on every commit row.

### Changed

- Cancel superseded repository queries, restore focus after dialogs, and adapt controls to narrow windows.
- Localize the backend's error messages through `@vscode/l10n`, with Simplified and Traditional Chinese translations.
- Reuse the workspace repository scan between refreshes until a repository appears or vanishes.
- Remove the unused pre-RPC activation path and its duplicate configuration module.
- Share one field style between dialogs and pages, and replace the header's text glyphs with icons.
- Open the search row on demand from the header or with `/`, give advanced menu items plain-language names, and explain how to undo in the reset, checkout, delete, drop, rebase and force-push dialogs.

### Fixed

- Keep detached-HEAD commits and their uncommitted changes visible in the all-branches graph.
- Ignore superseded graph, branch, and commit-details replies, including stale errors, and cancel obsolete graph reads.
- Include the webview-bridge regression tests in the extension test suite, with watcher recovery coverage.
- Clip graph lines to the actual column width so wide graphs cannot overlap commit text.

- Include staged-only submodule pointer changes in the workspace filter.
- Report a diff that VS Code cannot open instead of leaving the request pending.
- Keep dialog fields and checkboxes visible on themes whose input and dialog backgrounds match.

## [0.6.0] - 2026-08-25

### Added

- View for repositories without commits
- Faster tab restoration by retaining the webview context

### Changed

- Migrate the webview to Preact
- Improve long branch name display and emphasize the checked-out branch
- Deprecate the `fetchAvatars` setting

### Fixed

- Handle root commit actions correctly
- Avoid reloading a retained panel when it is restored
- Make repository watcher muting safe

## [0.5.0] - 2026-07-24

### Added

- Git Graph button in the Source Control view title
- Centralized logging with a dedicated "Git Graph" output channel

### Changed

- Optimize extension initialization logic
- Replace the "Locate HEAD" button with a highlighted HEAD commit row in the graph
- Status bar: add icons for the active and watching states
- Simplify localization to use English-string keys extracted with @vscode/l10n-dev

### Fixed

- Native browser context menu appearing over the graph in browser-based VS Code (vscode.dev / Codespaces)
- Header layout quirks around the refresh button

## [0.4.0] - 2026-04-10

### Added

- Full internationalization (i18n) support with multiple languages
- Language support: English (default), Simplified Chinese (简体中文), Traditional Chinese (繁體中文)

### Fixed

- Escape HTML in git output before rendering

## [0.3.0] - 2026-03-26

### Added

- Introduce gitClient based on simple-git
- Added a button to locate HEAD in the graph

### Changed

- Extract webview bridge
- Extract webview lifecycle

## [0.2.0] - 2026-03-17

### Added

- Add initial test suite and CI configuration

### Fixed

- Remove information message

## [0.1.1] - 2026-02-23

### Changed

- Migrate build system to esbuild and upgrade dependencies
- Add oxlint linter and oxfmt formatter

## [0.1.0] - 2026-02-18

Initial release

[Unreleased]: https://github.com/asispts/neo-git-graph/compare/v0.6.0...HEAD
[0.6.0]: https://github.com/asispts/neo-git-graph/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/asispts/neo-git-graph/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/asispts/neo-git-graph/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/asispts/neo-git-graph/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/asispts/neo-git-graph/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/asispts/neo-git-graph/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/asispts/neo-git-graph/releases/tag/v0.1.0
