<div align="center">
  <img src="./resources/icon.png" height="128"/>
  <samp>
    <h1>(neo) Git Graph for Visual Studio Code</h1>
    <h3>The jcfurey fork: visual Git history, branch focus, repository workflows, and devcontainer support.</h3>
  </samp>
</div>

<h4 align="center">
  <a href="#why-this-fork">Why this fork</a> |
  <a href="#features">Features</a> |
  <a href="#installation">Installation</a> |
  <a href="#roadmap">Roadmap</a> |
  <a href="#configuration">Configuration</a> |
  <a href="#contributing">Contributing</a>
</h4>

<p align="center">
  <a href="./LICENSE"><img src="https://img.shields.io/github/license/jcfurey/neo-git-graph" alt="License"></a>
</p>

<!-- ![demo](resources/demo.gif) -->

<p>&nbsp;</p>

## Why this fork

This repository maintains **`jcfurey.neo-git-graph`**, based on
[asispts/neo-git-graph](https://github.com/asispts/neo-git-graph). Its current build version is
**0.9.6**. The upstream authors and MIT license are retained.

The original [Git Graph](https://github.com/mhutchie/vscode-git-graph) by mhutchie changed its license in May 2019.
This fork is based on the last MIT-licensed commit, [`4af8583`](https://github.com/mhutchie/vscode-git-graph/commit/4af8583a42082b2c230d2c0187d4eaff4b69c665).

Everything after that commit is no longer MIT-licensed.

This fork:

- Remains MIT-licensed
- Adds devcontainer support
- Adds internationalization support (English, zh-CN, zh-TW)
- Improves codebase, tooling, and maintainability

## Features

- **Branch focus**: Choose **View → Focus direct history** or **Focus all ancestors** to keep related history bright and dim unrelated branches. Choose subtle or strong dimming, pause/resume the target, or clear focus without changing checkout. These choices are saved per repository across reopening and VS Code restarts.
- **Individual remote visibility**: Hide each remote with its eye button in the Branches pane. Choices survive reopening and repository switches; hiding changes the view, not Git refs. Selecting a hidden branch reveals it, and an explicit revision search can still open hidden history.
- **Wide and deep graphs**: Resize the Graph column or scroll its lanes with the scrollbar, trackpad, or Shift+wheel. Sticky headings keep the scrollbar accessible; selecting a commit reveals its lane, and **Reveal selected lane** returns to it after panning. Refresh preserves manual positioning and commit text stays fixed.
- Review push/pull commits, fetch across workspace repositories, and apply reviewed fast-forward updates.
- Compare and stage submodule pointers, clean up merged local branches, and find regressions with guided Git bisect.

- **Workspace overview**: Inspect branches, local changes, ahead/behind counts, and submodule revisions; initialize, sync, or update nested submodules
- **History search**: Search all repository history by message, SHA, author, date, or path, follow file renames, and save filters per repository
- **Compare and restore**: Compare revisions or changes since their common ancestor, inspect unique commits and file diffs, and restore historical file contents while preserving staged changes
- **Reflog recovery**: Find older branch/HEAD positions, jump to their graph context, and create recovery branches
- **Ordered commit actions**: Select multiple commits for cherry-pick or revert, create staged fixups, and arrange fixup/squash commits in the interactive rebase editor
- **Navigation and activity**: Keyboard navigation, per-repository scroll and filters, compact repository tools, and operation progress with copyable errors
- **Repository tools**: Configure remotes and upstreams, inspect ahead/behind status, and manage worktrees
- **Recovery and stashes**: Continue, abort or skip interrupted operations; inspect and resolve conflicts; save, inspect, apply, pop and drop stashes
- **Rebase**: Preserve merges when rebasing onto another branch, or reorder, reword, squash and drop commits in a linear interactive plan
- **Remote ref management**: Choose a remote for tag pushes, delete remote branches/tags with confirmation, and push rewritten history with an explicit force-with-lease check
- **Remote actions**: Push local branches to a chosen remote, set upstream tracking, pull the current branch with fast-forward only, and fetch updates with optional pruning
- **Remote branch checkout**: Reuse and fast-forward an existing local branch, or create a new tracking branch
- **Branches pane**: Browse local branches, remotes, tags and stashes beside the graph; select or focus a branch, check out, fetch or apply inline, and hide individual remotes or all remote branches
- **Graph view**: See branches, tags, and uncommitted changes in one graph. Click the Uncommitted Changes row (or press Enter) to browse unstaged, staged, untracked, and conflicted files, then select a file to open its diff or merge editor.
- **Commit details**: Click a commit to see message, files, and diffs
- **Branch actions**: Create, checkout, rename, delete, and merge
- **Tag actions**: Create, delete, and push tags
- **Commit actions**: Checkout, cherry-pick, revert, and reset
- **Avatar support (deprecated in v0.6.0)**: Optional avatars from GitHub, GitLab, or Gravatar
- **Multi-repo**: Work with multiple repositories in one workspace, including initialized submodules and their nested submodules
- **Repository selection**: Click a repository's Git Graph button in Source Control to open its graph or switch the existing graph to that repository
- **Devcontainer support**: Works in remote and container environments

See [Working from the graph](docs/git-actions.md) for the available actions and their behavior.
See [View preferences](docs/preferences.md) for what is saved per repository and when navigation resets.

## Installation

Build the fork from this checkout using **Node.js 24**, **pnpm 11.15.1** (pinned in `package.json`), and Git:

```sh
git clone https://github.com/jcfurey/neo-git-graph.git
cd neo-git-graph
pnpm install --frozen-lockfile
pnpm run package:vsix
code --install-extension ./neo-git-graph-0.9.6.vsix --force
```

Alternatively, use **Extensions → … → Install from VSIX…** and select the generated file.
VS Code **1.125.0 or newer** is required. Reload the VS Code window after upgrading an active extension.

The manifest supplies the publisher, version, and fork links directly. Installing this VSIX upgrades
an existing `jcfurey.neo-git-graph` installation, including 0.9.4. The upstream
`asispts.neo-git-graph` has a separate extension identity; disable it if it is also installed to avoid
duplicate graph commands. No temporary manifest edits are needed.

See [Packaging and releases](docs/packaging.md) for package verification and release validation.
See [VS Code UI tests](docs/testing.md) for individual scenarios, failure artifacts, and
minimum-version compatibility checks.

After installing, the **Get started with (neo) Git Graph** walkthrough appears on the Welcome page. Reopen it any time with the **Getting Started** entry in the graph's settings cog.

## Roadmap

The fork already includes the Preact webview, request/response repository workflows, branch
focus, individual remote visibility, horizontal graph navigation, and browsing of uncommitted
changes, all described above. Per-repository view preferences, graph geometry and theme regression
coverage, large-repository performance measurements, and UI failure diagnostics have also shipped.
See the [changelog](CHANGELOG.md) for implemented changes.

The current backlog, reviewed 2026-09-25, prioritizes data safety and security. Its first items are
hardening file restore, Git argument handling, and destructive dialogs, followed by making Git
output parsing independent of user configuration and locale. Row virtualization and ancestry
caching remain deferred; see the [performance report](docs/performance.md). The tracked acceptance
criteria are in [todo.md](todo.md).

## Configuration

All settings use the `neo-git-graph` prefix.

| Setting                       | Default         | Description                                                            |
| ----------------------------- | --------------- | ---------------------------------------------------------------------- |
| `autoCenterCommitDetailsView` | `true`          | Center commit details when opened                                      |
| `dateFormat`                  | `"Date & Time"` | `"Date & Time"`, `"Date Only"`, or `"Relative"`                        |
| `dateType`                    | `"Author Date"` | `"Author Date"` or `"Commit Date"`                                     |
| `fetchAvatars`                | `false`         | Fetch avatars (sends email to external services); deprecated in v0.6.0 |
| `graphColours`                | 12 defaults     | Colors for graph lines                                                 |
| `graphStyle`                  | `"rounded"`     | `"rounded"` or `"angular"`                                             |
| `initialLoadCommits`          | `300`           | Commits to load on open                                                |
| `loadMoreCommits`             | `100`           | Commits to load on demand                                              |
| `maxDepthOfRepoSearch`        | `0`             | Folder depth for repo search                                           |
| `showCurrentBranchByDefault`  | `false`         | Show only current branch on open                                       |
| `showUncommittedChanges`      | `true`          | Show uncommitted changes node                                          |
| `tabIconColourTheme`          | `"colour"`      | `"colour"` or `"grey"`                                                 |

## Contributing

Pull requests from external contributors are currently limited while the project undergoes heavy refactoring.

Please use [Issues](https://github.com/jcfurey/neo-git-graph/issues) for bug reports, feature requests, and discussion.

See the [Roadmap](#roadmap) for the project's current direction.

<!-- ## Sponsors

If you find this extension useful, consider [sponsoring its development](https://github.com/sponsors/asispts).
Your support helps keep it maintained and improving. -->

<!-- Sponsor names and logos go here -->

## License

MIT — see [LICENSE](LICENSE).

> Not related to the original Git Graph project.
