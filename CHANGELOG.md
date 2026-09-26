# Changelog

## [Unreleased]

Current fork build: **`jcfurey.neo-git-graph@0.9.6`**. The manifest now carries the fork identity
directly, continuing the locally installed 0.9.x builds. Historical upstream releases remain below.

### Added

- Click the Uncommitted Changes row to browse staged, unstaged, untracked, and conflicted files and open their native diff or merge editor.

- Tests that submit each classic action dialog and check the request, the action dispatch table, and the repository lock, with CI keeping `menus.tsx` function coverage at 80% or more.
- Failure-time UI screenshots, DOM snapshots, browser errors, and extension logs, with an automated failure/recovery check and a minimum-version VS Code smoke test in CI.
- Repeatable backend focus and VS Code interaction benchmarks for large histories, with timing reports and hover CPU profiles in Linux CI.
- Graph topology and rendering regression coverage for complex merges, partial history, both graph styles, zoom, resizing, and expanded details.
- Keyboard and contrast checks for graph focus and remote visibility in built-in light, dark, and high-contrast themes.
- Per-remote graph visibility controls with saved choices, consistent history searches, and automatic reveal when selecting a hidden remote branch.
- Horizontal scrolling within the Graph column for wide histories, using a scrollbar, trackpad or Shift+mouse wheel.
- Sticky column headings keep graph scrolling accessible deep in history; selecting a commit reveals its lane, with a **Reveal selected lane** button to return after panning.

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

- Save focus mode, target, dimming, pause state, and Show Remote Branches per repository across graph reopening and VS Code restarts; document temporary search and scrolling state.
- Make fork VSIX packaging repeatable with `pnpm run package:vsix`, and verify upgrades and activation in an isolated VS Code profile.
- Gate tag publishing on matching fork identity/version and the full validation workflow; publish the same VSIX that passed package checks.
- Refresh fork installation instructions, shipped features, and remaining work in the README.
- Cancel superseded repository queries, restore focus after dialogs, and adapt controls to narrow windows.
- Localize the backend's error messages through `@vscode/l10n`, with Simplified and Traditional Chinese translations.
- Reuse the workspace repository scan between refreshes until a repository appears or vanishes.
- Remove the unused pre-RPC activation path and its duplicate configuration module.
- Share one field style between dialogs and pages, and replace the header's text glyphs with icons.
- Open the search row on demand from the header or with `/`, give advanced menu items plain-language names, and explain how to undo in the reset, checkout, delete, drop, rebase and force-push dialogs.

### Fixed

- Open file diffs and restore previews while another view or Git action is running, instead of reporting that another operation is running.
- Show commits whose dates are out of range, such as `@99999999999999`, with an unknown date instead of an empty graph, and keep a failing graph or dialog from blanking the whole view.
- Name the Reset mode and merge parent choices for screen readers.
- Offer **Stop Git** while a push, pull, fetch, or other network action runs, so an unresponsive server no longer leaves the repository locked, and never let Git wait for a password typed in a terminal.
- Load the graph on Windows when a hidden remote has hundreds of branches, which exceeded the command-line limit.
- Refresh the graph after commits and other changes in linked worktrees and submodules, whose Git data lives outside their folder, and when a merge, cherry-pick, revert, rebase, or bisect starts or stops.
- List a repository once under its real path when a workspace folder is a subfolder of it or a symlink to it, and match Source Control and File History selections to that entry.
- Show the same repositories in the picker and the Workspace pane, follow added or removed workspace folders, respect the search depth for newly created repositories, and stop listing every repository ever viewed.
- Load the whole graph when a commit subject or author name contains a carriage return, and show an error instead of a silently truncated graph if Git's log output is incomplete.
- Reject invalid branch, tag, and remote names such as `a..b`, `x@{1}`, or `has space` before running Git; the previous check never saw Git's refusal.
- Activate and register every command even when the last viewed repository was deleted, a workspace folder is missing, or no folder is open, and skip folders of virtual workspaces instead of failing; virtual and untrusted workspaces are declared unsupported.
- Recognize repositories by Git's output and exit status instead of English or German "not a repository" text, so scanning behaves the same in every language.
- Accept a `git.path` that contains spaces or parentheses, such as `C:\Program Files\Git\bin\git.exe`, or lists several paths, and prefer the Git that VS Code's own Git extension found.
- Stop background reads from rewriting or locking the index while you commit, and keep refreshing the graph after reads; only actions that change a repository pause its file watcher.
- Detect merge conflicts from Git's exit status instead of its English output, so a conflicted merge in another language is no longer reported as successful, and explain how to continue or abort it.
- Ignore `log.showSignature`, forced color, and hidden untracked files in the user's Git configuration when reading Git output, so signed commits no longer end the graph or break details, history, and plans, and removing a worktree no longer discards untracked files that `status.showUntrackedFiles=no` hid.
- List branches without parsing `git branch`, so a rebase, bisect, or detached HEAD no longer adds phantom branches such as `(no`, and colored or translated Git output no longer breaks checkout or remote renames.
- Show exact names and line counts in commit details for files with non-ASCII characters, tabs, quotes, newlines, or backslashes, so their diffs, history, and restore work, and diff a file named like `0:foo` against its own staged version.
- Explain instead of deleting when a remote branch's remote is no longer configured; previously the name was cut by another remote's length. Checking out such a branch suggests its own path and creates an untracked local branch.
- Ignore a held Enter or Space key in dialogs and menus, and open destructive confirmations with focus on Cancel, so holding Enter on a menu item can no longer delete a branch, tag, or stash.
- Warn before restoring over local edits that `git status` hides, such as skip-worktree and assume-unchanged files, or a file whose on-disk name differs only in letter case or Unicode form.
- Refuse to restore a file into a submodule or nested repository, where the superproject cannot see or warn about local edits.
- Pass existing branch and tag names to Git so that names such as `-d` or `--output=x`, which fetches can create, are never read as options, and filter or merge a branch rather than a tag with the same name.
- Open `neo-git-graph:` documents only for full object IDs in repositories the extension has opened, so links and other extensions cannot pass options such as `--output` to `git show`.
- Make uncommitted changes keyboard accessible, restore focus when closing details, count individual untracked files, and remove placeholder commit metadata from the changes row.
- Resolve staged diff contents to immutable blobs so reopening a file after staging shows the current changes.

- Avoid scanning all loaded commits for every row's keyboard tab stop; keep graph hover updates from rerendering text rows and reuse unchanged graph line paths.
- Keep explicitly cleared focus cleared after reopening, and save a current-branch fallback when the old target disappears.
- Merge individual preference updates so focus, column widths, and remote visibility cannot overwrite one another.
- Keep hidden remote labels readable using the theme's muted text color instead of fading the entire row.
- Give keyboard column-resize handles localized names and visible focus outlines.
- Place native select focus outlines outside the dropdown background for clearer contrast in dark themes.
- Restore saved remote visibility when reopening the graph, preserve it on remote rename, and remove obsolete preferences after remote deletion.
- Show graph-loading errors with a Retry button instead of empty history or an indefinite loading indicator.
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

[Unreleased]: https://github.com/jcfurey/neo-git-graph/compare/v0.6.0...HEAD
[0.6.0]: https://github.com/asispts/neo-git-graph/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/asispts/neo-git-graph/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/asispts/neo-git-graph/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/asispts/neo-git-graph/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/asispts/neo-git-graph/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/asispts/neo-git-graph/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/asispts/neo-git-graph/releases/tag/v0.1.0
