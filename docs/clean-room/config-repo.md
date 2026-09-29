# Clean-room specification: repository, editor and CI configuration

This document specifies thirteen configuration files so that they can be deleted and written
again by someone who never sees them or their history. Configuration is mostly made of values
that some other program reads, so every entry is classified:

- **(A) Dictated.** An external tool, another file of the repository or a repository setting
  requires the value exactly. The value is given exactly, with the reason.
- **(B) Chosen.** A free choice. The document states the requirement the entry serves, not its
  current text; the implementer chooses the text.
- **(C) Obsolete.** Nothing needs the entry any more. The document says what removing it would
  change.

The implementer rewrites each file whole. Comments in the old files are (B) throughout: the new
files may carry comments, written fresh.

| Section | File                            | Read by                                           |
| ------- | ------------------------------- | ------------------------------------------------- |
| 3       | `.github/workflows/ci.yaml`     | GitHub Actions; `publish.yml`                     |
| 4       | `.github/workflows/publish.yml` | GitHub Actions                                    |
| 5       | `.github/dependabot.yml`        | GitHub Dependabot                                 |
| 6       | `.vscode/tasks.json`            | VS Code (Tasks); `launch.json`                    |
| 7       | `.vscode/launch.json`           | VS Code (Run and Debug)                           |
| 8       | `.vscode/settings.json`         | VS Code (workspace settings)                      |
| 9       | `.vscode/extensions.json`       | VS Code (workspace recommendations)               |
| 10      | `.gitattributes`                | Git                                               |
| 11      | `.gitignore`                    | Git, `oxfmt`, `oxlint`, VS Code search            |
| 12      | `.vscodeignore`                 | `vsce` (`package:vsix`, `vsce ls`, `check:links`) |
| 13      | `flake.nix`                     | Nix, direnv                                       |
| 14      | `flake.lock`                    | Nix                                               |
| 15      | `.envrc`                        | direnv                                            |

Questions for the maintainer are numbered `repo Q1`, `repo Q2`, … (section 16). They state the
current behaviour and decide nothing. Section 17 counts the entries per class.

---

## 0. How this was observed

- Worktree at commit `cd1b5db`, Linux x64, Node v22.22.2, pnpm 11.15.1. Git 2.55.0 for all
  repository commands; the system's Git 2.43 only for `git ls-remote` against GitHub, because the
  2.55 build has no HTTPS helper.
- `node scripts/provenance.cjs --lines <file>` for each file (counts in 1.1), and
  `git ls-files --eol` for the whole tree.
- Builds and checks, in this worktree: `pnpm run compile`, `pnpm run compile-tests`,
  `pnpm run typecheck` (passes), `pnpm test` (backend 622 passed and 1 skipped, extension 678
  passed, webview 1970 passed and 2 skipped), `pnpm run package:vsix --out branchwise.vsix`
  (26 files), `xvfb-run -a pnpm run test:package branchwise.vsix` (passes; it downloaded VS Code
  1.139.1 into `.vscode-test/`), `xvfb-run -a pnpm run test:ext` (44 passing), then
  `git status --porcelain --ignored`, `pnpm run format` and `pnpm run lint` with all that output
  present. The watch scripts were run for 20–40 seconds each and their output kept.
- Experiments in a scratch copy of the tree outside the repository: the package listing of `vsce`
  with each line of `.vscodeignore` removed in turn; `oxfmt` and `oxlint` with files planted in
  each ignored folder and each line of `.gitignore` removed in turn; `oxfmt` on files with CRLF
  endings; the build script's error output for a planted syntax error; TypeScript 7.0.2's error and
  watch output. Each output was tested against the problem-matcher patterns below.
- Problem matchers and editor defaults were read from their sources: VS Code 1.139.1's built-in
  TypeScript extension manifest and workbench defaults (from the downloaded build), and the
  manifest of `connor4312.esbuild-problem-matchers` on GitHub.
- Actions: `git ls-remote` of `pnpm/setup`, `actions/checkout`, `actions/upload-artifact` and
  `actions/download-artifact`; `pnpm/setup`'s `action.yml` at the pinned commit.
- GitHub, through its API: recent CI runs and their job names, the branches (with their protection
  flag), branch rules and rulesets for `main`, the repository's metadata, tags, pull requests,
  and the publish workflow's runs. The environments endpoint was refused by the network proxy, so
  the `release` environment could not be inspected.
- Nix is not installed here, so the flake could not be evaluated and the lock not regenerated.
  The versions the flake provides were read from the locked `nixpkgs` revision's source on GitHub.
- No repository file other than this document was changed. Build output, test results, the VSIX
  and the VS Code download are ignored files and were removed afterwards with
  `pnpm run clean:all`.

---

## 1. Scope, consumers and verification

### 1.1 The files

| File                            | Lines | Inherited lines | Last changed by Branchwise in |
| ------------------------------- | ----- | --------------- | ----------------------------- |
| `.github/workflows/ci.yaml`     | 177   | 38              | `38635fe`                     |
| `.github/workflows/publish.yml` | 94    | 26              | `7ca188d`                     |
| `.github/dependabot.yml`        | 13    | 9               | `af2d419`                     |
| `.vscode/tasks.json`            | 73    | 46              | `2896643`                     |
| `.vscode/launch.json`           | 17    | 12              | never                         |
| `.vscode/settings.json`         | 13    | 9               | never                         |
| `.vscode/extensions.json`       | 5     | 3               | never                         |
| `.gitattributes`                | 14    | 13              | never                         |
| `.gitignore`                    | 12    | 9               | `81de229`                     |
| `.vscodeignore`                 | 22    | 11              | `5ea978a`                     |
| `flake.nix`                     | 18    | 7               | `7ca188d`                     |
| `flake.lock`                    | 27    | 19              | never                         |
| `.envrc`                        | 1     | 1               | never                         |

The counts equal those in `scripts/provenance-baseline.json`. Every file is rewritten whole, so
the new files have no inherited lines except the ones an external format forces (see 14.3 for
`flake.lock`).

### 1.2 Repository settings the files depend on, as observed

- The repository `jcfurey/neo-git-graph` is a public GitHub fork of `asispts/neo-git-graph`. Its
  default branch is `main`. Issues are disabled.
- `main` has no branch protection and no ruleset: the branches API reports it unprotected, and
  the branch-rules and rulesets endpoints return empty lists. `todo.md` (items "Keep `main` green
  and require CI" and "Suggested next batch") plans a ruleset on `main` that requires the checks
  `lint (24)`, `test (ubuntu-latest)`, `test (macos-latest)` and `test (windows-latest)`. Nothing
  else names them. The CI runs of 2026-09-29 reported exactly these four job names.
- The publish workflow has never run in this repository. Tags `v0.1.0` to `v0.6.0` exist (from
  upstream). `todo.md` records as outstanding: creating the `release` environment with a required
  reviewer, and moving `VS_MARKETPLACE_TOKEN` and `OPEN_VSX_TOKEN` into it.
- No pull request from Dependabot exists; all eleven pull requests are the maintainer's.
  `todo.md` records enabling Dependabot as an outstanding setting.
- Scheduled CI runs do happen (for example on 2026-09-29 at 05:34 UTC).

### 1.3 Shared constraints

- **Formatting.** `pnpm run format` runs `oxfmt --check` over the tree. It checks the three YAML
  files and the four `.vscode` JSON files (observed: an unformatted copy of either kind is
  reported). The settings in `.oxfmtrc.jsonc` apply: width 100, two-space indent, no trailing
  commas, LF endings. The `.vscode` files are JSON with comments, which VS Code accepts and `oxfmt`
  keeps. `oxfmt` does not check `.gitattributes`, `.gitignore`, `.vscodeignore`, `flake.nix`,
  `flake.lock` or `.envrc`.
- **Node, pnpm and Git.** The documents (`docs/testing.md`, `docs/packaging.md`, `README.md`)
  prescribe Node.js 24 and the pnpm version pinned in `package.json` (`packageManager`:
  `pnpm@11.15.1`), obtained with Corepack or, as an alternative, the Nix shell. No file pins a Git
  version; CI uses the Git preinstalled on each runner image.
- **Package scripts.** Workflows and tasks call scripts that `package.json` defines. Their names are
  dictated by `package.json` and are quoted exactly below.

### 1.4 How each file is verified

| File                                | Verification                                                                                                                                                                                                                                                                                                                                                                     |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ci.yaml`                           | CI itself on the pull request: the four jobs of 3.2 appear with the names of 3.3 E10 and E22 and pass, and the three artifacts appear. `pnpm run format`. `actionlint` if available (`docs/packaging.md` says it passes on both workflows; it is not installed here). A scheduled run the next morning shows the Insiders step running.                                          |
| `publish.yml`                       | `pnpm run format`; `actionlint`. After merging, a manual run from the Actions tab (the dry run of 4.1): the release job passes, CI's jobs run under the validation job's name, the deploy job waits for the environment's approval, downloads the VSIX, checks its identity and verifies both tokens, and skips both publish steps. A real publish only happens on a pushed tag. |
| `dependabot.yml`                    | `pnpm run format`. On GitHub, the Dependabot page of the repository's dependency graph reports a parse error if the file is invalid.                                                                                                                                                                                                                                             |
| `tasks.json`                        | Open the folder in VS Code with the recommended extensions and run each task (Terminal → Run Task). The default build task builds; the watch task starts both watchers and ends its "busy" state; a planted type error and syntax error each appear in Problems. Here, the commands were run and their output matched the matchers (6.2). `pnpm run format`.                     |
| `launch.json`                       | F5 in VS Code: the default build task runs, an Extension Development Host opens with Branchwise loaded, and a breakpoint in `src/` binds through the source maps. `pnpm run test:ext` loads the extension the same way (development path = the repository root). `pnpm run format`.                                                                                              |
| `settings.json`                     | Open the folder in VS Code: the settings are not flagged as unknown, and the task list shows no auto-detected `tsc` tasks. `pnpm run format`.                                                                                                                                                                                                                                    |
| `extensions.json`                   | Open the folder in VS Code: it offers the recommended extensions. `pnpm run format`.                                                                                                                                                                                                                                                                                             |
| `.gitattributes`                    | `git ls-files --eol`: every text file shows `i/lf w/lf attr/text=auto eol=lf` and `resources/icon.png` shows `-text`. `git add --renormalize .` stages nothing. A clone with `core.autocrlf=true` still checks out LF files and passes `pnpm run format`.                                                                                                                        |
| `.gitignore`                        | After `pnpm run compile`, `pnpm run compile-tests`, `pnpm run package:vsix`, `xvfb-run -a pnpm run test:package`, `xvfb-run -a pnpm run test:ext`, `pnpm run benchmark` and (with Nix) `direnv allow`: `git status --porcelain` is empty, and `pnpm run format` and `pnpm run lint` still pass (both read `.gitignore`, 11.2).                                                   |
| `.vscodeignore`                     | `pnpm run package:vsix --out branchwise.vsix` lists exactly the 24 files of 12.2 under `extension/`, plus `[Content_Types].xml` and `extension.vsixmanifest`. Then `xvfb-run -a pnpm run test:package branchwise.vsix` and `pnpm run check:links` pass.                                                                                                                          |
| `flake.nix`, `flake.lock`, `.envrc` | With Nix: `nix flake check`, then `nix develop -c node --version` (24.x) and `nix develop -c pnpm --version`; with direnv, `direnv allow` loads the same shell. Not possible here (no Nix).                                                                                                                                                                                      |

---

## 2. Conventions

- Entries are numbered per file (E1, E2, …) so that questions and counts can refer to them. One
  entry is one key, one pattern, one step or one task property that has its own reason; comments
  of a file form one entry.
- "Exact" values are given in backticks and must be reproduced character for character, except
  where a value is marked as an example.
- For (B) entries the requirement is binding; the text, names and layout are free.
- "Linux" means the `ubuntu-latest` runner, "all platforms" means `ubuntu-latest`,
  `windows-latest` and `macos-latest`.

---

## 3. `.github/workflows/ci.yaml`

### 3.1 Role and consumers

The continuous-integration workflow. It runs on pushes and pull requests, nightly, on demand, and
as a reusable workflow that `publish.yml` calls to validate a release (section 4). It must stay at
this path and file name, because `publish.yml` refers to it by path (4.2 E11) and GitHub reads
workflows only from `.github/workflows/`.

### 3.2 What CI must establish

Two jobs. The first checks the tree once, on Linux; the second tests on all three platforms, with
extra Linux-only legs.

| Check                                                    | Where         | When                         | Why                                                                                                                                                                                                                                                                                                                                                    |
| -------------------------------------------------------- | ------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Locked install                                           | every job     | always                       | The lockfile, not the registry, decides what is tested; a drifted lockfile fails.                                                                                                                                                                                                                                                                      |
| Format, lint, lint-rule tests, type check                | lint job      | always                       | Style and static correctness.                                                                                                                                                                                                                                                                                                                          |
| Localization bundle up to date and translations complete | lint job      | always                       | The committed English bundle must equal a fresh export; every translation must be complete.                                                                                                                                                                                                                                                            |
| Release identity and release-script tests                | lint job      | always                       | The manifest keeps the `jcfurey.branchwise` identity and a stable version named in the changelog and guides; the scripts' own tests pass.                                                                                                                                                                                                              |
| Links in packaged Markdown                               | lint job      | always                       | Packaged guides link only to packaged files.                                                                                                                                                                                                                                                                                                           |
| No new inherited code                                    | lint job      | always                       | No file gains inherited lines over the baseline. Needs the full history.                                                                                                                                                                                                                                                                               |
| Unit and component tests                                 | all platforms | always                       | The three Vitest projects pass on each platform's file system, shell and Git.                                                                                                                                                                                                                                                                          |
| Menu coverage                                            | Linux         | always                       | `vitest.config.ts` fails the run below 80 % function coverage of `src/webview/lib/menus.tsx`.                                                                                                                                                                                                                                                          |
| Backend tests in random order                            | Linux         | always                       | Each destructive-action test builds its own repository, so order must not matter. Vitest prints the seed, so a failing order can be replayed.                                                                                                                                                                                                          |
| Backend and extension tests, hostile Git config, German  | Linux         | always                       | Git translates its messages but not its plumbing, porcelain or `-z` output, and reports failure through exit status. Parsing must not depend on the user's Git configuration (colour, signatures, date formats, sort orders, status format and so on) or on the language of Git's messages. The step must fail if Git is not actually speaking German. |
| VS Code extension and UI tests, stable VS Code           | all platforms | always                       | The extension in a real VS Code. Linux needs a virtual display.                                                                                                                                                                                                                                                                                        |
| The same against VS Code Insiders                        | Linux         | nightly (scheduled run) only | Finds breakage from the next VS Code before it ships.                                                                                                                                                                                                                                                                                                  |
| UI failure diagnostics and minimum VS Code version       | Linux         | always                       | Proves a failing UI test leaves usable artifacts, and that the extension runs on the minimum VS Code in `engines.vscode`.                                                                                                                                                                                                                              |
| Keep UI diagnostics                                      | all platforms | even when earlier steps fail | Screenshots, DOM, browser and VS Code logs for diagnosing failures, kept 14 days.                                                                                                                                                                                                                                                                      |
| Benchmarks (backend, then VS Code interactions)          | Linux         | when the tests passed        | Records timings and CPU profiles; no thresholds.                                                                                                                                                                                                                                                                                                       |
| Keep benchmark reports                                   | Linux         | even when earlier steps fail | Reports and profiles, kept 30 days.                                                                                                                                                                                                                                                                                                                    |
| Package, then test the package                           | Linux         | when the tests passed        | Builds the VSIX under a fixed name, installs it over an older build in a real VS Code and activates it.                                                                                                                                                                                                                                                |
| Keep the VSIX                                            | Linux         | when the package test passed | The installable extension, kept 30 days; the publish workflow downloads it.                                                                                                                                                                                                                                                                            |

Observed durations (2026-09-29): lint 45 s; test 8 min on Linux, 5.5 min on macOS, 9 min on
Windows.

### 3.3 Entries

| #   | Entry                                         | Class | Exact value (A), requirement (B) or effect of removal (C)                                                                                                                                                                                                                                                                                                                                                                                                                            |
| --- | --------------------------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| E1  | Workflow name                                 | B     | A short name that identifies the workflow in the Actions tab. It is also the value of `github.workflow` when CI runs on its own (E7). When `publish.yml` calls CI, GitHub prefixes CI's job names with the calling job's id instead (4.2 E11).                                                                                                                                                                                                                                       |
| E2  | Push trigger and its branch filter            | B     | Run on every push to `main`, so the state of `main` after each merge is known, and on pushes to the maintainer's working branches that are not yet in a pull request (`repo Q5` records which branch prefixes qualify now). Tags must not trigger CI directly; `publish.yml` runs CI for tags.                                                                                                                                                                                       |
| E3  | Pull-request trigger for `main`               | A     | Event `pull_request` for pull requests whose base is `main`. The planned ruleset (1.2) requires the checks of E10 and E22 on pull requests into `main`, which only this event provides. Nothing requires it today (`repo Q1`).                                                                                                                                                                                                                                                       |
| E4  | Manual trigger                                | B     | Anyone with write access can run CI on any branch from the Actions tab (`workflow_dispatch`).                                                                                                                                                                                                                                                                                                                                                                                        |
| E5  | Reusable-workflow trigger                     | A     | `workflow_call`, with no inputs, outputs or secrets. `publish.yml` calls this file (4.2 E11); GitHub refuses the call without this trigger.                                                                                                                                                                                                                                                                                                                                          |
| E6  | Nightly schedule                              | B     | Run once a day on the default branch, at a fixed early-morning UTC time off the full hour (today 05:23 UTC, which `todo.md` quotes), so that drift in stable VS Code, in the runners' Git and in VS Code Insiders shows up between pushes. The Insiders step (E39) keys on this event.                                                                                                                                                                                               |
| E7  | Concurrency                                   | B     | A newer run for the same workflow and ref cancels the older one still in progress. The group must include the ref, so that runs for different branches, pull requests and tags do not cancel each other. When `publish.yml` calls CI, `github.workflow` is the caller's name; the group must never equal a concurrency group that the calling run holds, or the call deadlocks (`publish.yml` has none today).                                                                       |
| E8  | Permissions                                   | B     | Read-only access to the repository contents, nothing else. CI needs no write access and no secrets. A called workflow cannot be granted more than its caller, and `publish.yml` grants only contents read (4.2 E2).                                                                                                                                                                                                                                                                  |
| E9  | Comments                                      | B     | Free. The old file explains the nightly run, the full-history checkout, the random-order run and the German run; equivalent explanations are welcome.                                                                                                                                                                                                                                                                                                                                |
| E10 | Lint job identity and its check name          | A     | Job id `lint` (no separate display name), with a matrix of exactly one variable holding one value, `node: [24]`, so that GitHub names the check `lint (24)`, the name the planned ruleset requires (1.2). The same value selects Node 24 in E13.                                                                                                                                                                                                                                     |
| E11 | Lint job runner                               | B     | Linux (`ubuntu-latest`). The checks are platform-independent; one platform suffices.                                                                                                                                                                                                                                                                                                                                                                                                 |
| E12 | Lint job checkout                             | A     | `actions/checkout@v7` with `fetch-depth: 0`. The provenance check blames every line back to its commit and refuses a shallow clone ("Provenance needs the full history"). The action is GitHub's, referenced by its moving major tag; `v7` was adopted upstream (`ccf6fcb`) and kept by Branchwise. Latest tags seen: `v7` = `v7.0.1`.                                                                                                                                               |
| E13 | Lint job toolchain                            | A     | `pnpm/setup@703c52620218391530e48b9e8870d5c0082e1b9b` with the version comment `# v2.1.0`, and input `runtime` set to `node@` followed by the matrix value (`node@24`). The commit is the one tag `v2.1.0` points to; Branchwise chose this pin (`c2e51a6`). With no `version` input the action installs the pnpm of `package.json`'s `packageManager` (`pnpm@11.15.1`). A `v3.0.0` of the action exists (`repo Q3`).                                                                |
| E14 | Lint job store cache                          | B     | Cache pnpm's store between runs, keyed on the lockfile (the action's `cache` input does this), to shorten installs.                                                                                                                                                                                                                                                                                                                                                                  |
| E15 | Lint job install                              | B     | Install exactly the lockfile and fail if it is out of date, using pnpm's `--frozen-lockfile` option. The action's own install (its `install` input, on by default) does not use that option, so it is turned off and a separate step installs.                                                                                                                                                                                                                                       |
| E16 | Format check                                  | A     | `pnpm run format`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| E17 | Lint and lint-rule tests                      | A     | `pnpm run lint` and `pnpm run test:lint-rules`, both must pass.                                                                                                                                                                                                                                                                                                                                                                                                                      |
| E18 | Type check                                    | A     | `pnpm run typecheck`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| E19 | Localization check                            | A     | `pnpm run l10n:check`. It needs `git` on the `PATH` (it compares the regenerated bundle with `git diff --exit-code`). `ui-wording.md` refers to the current step by name; that reference is descriptive only.                                                                                                                                                                                                                                                                        |
| E20 | Release checks                                | A     | `pnpm run check:release` and `pnpm run test:release`, both must pass.                                                                                                                                                                                                                                                                                                                                                                                                                |
| E21 | Link check and provenance check               | A     | `pnpm run check:links` and `pnpm run check:provenance`. Neither needs a build: the link check lists the packaged files with `vsce ls`.                                                                                                                                                                                                                                                                                                                                               |
| E22 | Test job identity and its check names         | A     | Job id `test` (no separate display name), with a matrix of one variable `os` holding `ubuntu-latest`, `windows-latest` and `macos-latest`, used as the runner. GitHub names the checks `test (ubuntu-latest)`, `test (windows-latest)` and `test (macos-latest)`, the names the planned ruleset requires.                                                                                                                                                                            |
| E23 | Test job time limit                           | B     | A job-level limit that stops a hung VS Code or Git process well before GitHub's six-hour default, with ample room for the slowest platform (observed 9 minutes).                                                                                                                                                                                                                                                                                                                     |
| E24 | Test job failure policy                       | B     | A failure on one platform must not cancel the others (GitHub's matrix default is to cancel them), so every platform reports.                                                                                                                                                                                                                                                                                                                                                         |
| E25 | Test job checkout                             | A     | `actions/checkout@v7`, default (shallow) depth.                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| E26 | Test job toolchain                            | A     | As E13, with `runtime: node@24` written directly.                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| E27 | Test job store cache                          | B     | As E14.                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| E28 | Test job install                              | B     | As E15.                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| E29 | Unit and component tests                      | A     | `pnpm run test`, on all platforms.                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| E30 | Menu coverage                                 | A     | `pnpm run test:coverage`, Linux only (condition on `runner.os == 'Linux'`).                                                                                                                                                                                                                                                                                                                                                                                                          |
| E31 | Random-order backend run                      | A     | `pnpm exec vitest run --project backend --sequence.shuffle`, Linux only. `backend` is a project name in `vitest.config.ts`; `--sequence.shuffle` is Vitest's option.                                                                                                                                                                                                                                                                                                                 |
| E32 | Hostile Git configuration switch              | A     | Environment variable `NGG_HOSTILE_GIT_CONFIG` set to `1` for the step of E36. `tests/git-config.ts` reads exactly this name and value and then points `GIT_CONFIG_GLOBAL` at `tests/fixtures/hostile.gitconfig`.                                                                                                                                                                                                                                                                     |
| E33 | German language support for Git on the runner | A     | Install the Ubuntu package `language-pack-de` without recommended packages (`sudo apt-get update` first). Ubuntu ships Git's German catalogue in that language pack: when `/usr/share/locale/de/LC_MESSAGES/git.mo` does not exist, set `GIT_TEXTDOMAINDIR` to `/usr/share/locale-langpack`.                                                                                                                                                                                         |
| E34 | German locale                                 | A     | `LANG=de_DE.UTF-8`, `LC_ALL=de_DE.UTF-8` and `LANGUAGE=de` for the Git processes of E36.                                                                                                                                                                                                                                                                                                                                                                                             |
| E35 | Proof that Git speaks German                  | B     | Before the tests, run a Git command whose error message is translated (for example one run outside any repository) and fail the step unless the German text appears, so that the step cannot pass in English. Git's German message for running outside a repository contains `Kein Git-Repository`.                                                                                                                                                                                  |
| E36 | Hostile German test run                       | A     | `pnpm exec vitest run --project backend --project extension`, Linux only, with E32–E34 in effect.                                                                                                                                                                                                                                                                                                                                                                                    |
| E37 | UI tests on Linux                             | A     | `xvfb-run -a pnpm run test:ext`. VS Code needs an X display, which Linux runners lack; `xvfb-run` is preinstalled on `ubuntu-latest`.                                                                                                                                                                                                                                                                                                                                                |
| E38 | UI tests on Windows and macOS                 | A     | `pnpm run test:ext`, without a virtual display.                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| E39 | UI tests against Insiders                     | A     | `xvfb-run -a pnpm run test:ext` with `NGG_VSCODE_VERSION` set to `insiders`, only on Linux and only when the event is `schedule`. `.vscode-test.mjs` passes the variable's value to the test runner as the VS Code version; `insiders` is the runner's name for that channel.                                                                                                                                                                                                        |
| E40 | Diagnostics and minimum-version check         | A     | `xvfb-run -a pnpm run test:ui-harness`, Linux only.                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| E41 | Artifact actions                              | A     | `actions/upload-artifact@v7` for every upload (moving major tag; adopted by Branchwise in `c2e51a6`; latest tag seen `v7.0.1`). Artifact names must be unique within a run, including when `publish.yml` calls CI.                                                                                                                                                                                                                                                                   |
| E42 | UI diagnostics artifact                       | B     | On every platform, even after a failure (`always()`), upload the folder `test-results/` (A: the default artifact folder of `.vscode-test.mjs` and `scripts/test-ui-harness.cjs`) under a name that includes the platform, skipping silently when the folder is missing, kept 14 days (`docs/packaging.md` states 14). It must be uploaded before the benchmarks run, so it holds UI output only.                                                                                     |
| E43 | Backend benchmark                             | A     | `pnpm run benchmark`, Linux only, after the UI tests.                                                                                                                                                                                                                                                                                                                                                                                                                                |
| E44 | Interaction benchmark                         | A     | `xvfb-run -a pnpm run benchmark:ui`, Linux only.                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| E45 | Benchmark artifact                            | B     | On Linux, even after a failure, upload the benchmark reports and CPU profiles, skipping silently when none exist, kept 30 days (`docs/packaging.md` states 30). The files are dictated by the benchmark scripts: `test-results/benchmark.json`, `test-results/benchmark-ui.json` and `test-results/benchmark-hover-<rows>.cpuprofile`; patterns `test-results/benchmark*.json` and `test-results/benchmark*.cpuprofile` cover them. The artifact name is free but unique in the run. |
| E46 | Build the VSIX                                | A     | `pnpm run package:vsix --out branchwise.vsix`, Linux only. The file name `branchwise.vsix` is dictated by E47, E48 and `publish.yml` (4.2 E18, E19, E22, E23).                                                                                                                                                                                                                                                                                                                       |
| E47 | Test the VSIX                                 | A     | `xvfb-run -a pnpm run test:package branchwise.vsix`, Linux only.                                                                                                                                                                                                                                                                                                                                                                                                                     |
| E48 | VSIX artifact                                 | A     | On Linux, only when everything before succeeded, upload `branchwise.vsix` as artifact `branchwise-vsix`, failing when the file is missing (`if-no-files-found: error`). `publish.yml` downloads it by that name (4.2 E18). Retention 30 days is (B), as `docs/packaging.md` states.                                                                                                                                                                                                  |
| E49 | Step names and order                          | B     | Names are free and descriptive. Order constraints: install before everything; UI tests before the diagnostics upload; the diagnostics upload before the benchmarks; the benchmark upload after both benchmarks; packaging after the tests and benchmarks; the package test after packaging; the VSIX upload last. Steps that must run only on some platforms or events say so in their condition.                                                                                    |

### 3.4 Notes for the implementer

- Inside a call from `publish.yml`, `github.event_name` is the caller's event (`push` for a tag,
  `workflow_dispatch` for a dry run), so E39 never runs during release validation, and the whole
  CI job list runs as in a normal push.
- The four check names are the only names anything outside the file may depend on. Step names and
  artifact names other than `branchwise-vsix` are free.
- The artifacts of a called workflow belong to the calling run, which is how the deploy job of
  `publish.yml` can download the VSIX.

---

## 4. `.github/workflows/publish.yml`

### 4.1 Release flow and protections

1. **Trigger.** Pushing a tag whose name starts with `v` publishes. A manual run is a dry run:
   everything happens except the two publish steps.
2. **Release identity.** A first job, on Linux with Node 24 and no dependencies, decides the tag
   (the pushed tag's name, or `v` plus the manifest version for a manual run) and runs
   `scripts/check-release.cjs` with it. That script rejects a publisher or name other than
   `jcfurey.branchwise`, a version that is not a stable `major.minor.patch`, a tag other than
   `v<version>`, a changelog without a dated heading for the version, and install instructions in
   `README.md` or `docs/packaging.md` that name another VSIX version. The tag is passed on to the
   deploy job.
3. **Validation.** After the identity job, the whole CI workflow runs from the same commit, as a
   reusable workflow. It produces the tested `branchwise-vsix` artifact.
4. **Deploy.** Only after both succeed, a job in the `release` environment (whose required
   reviewer approves each run and which holds the tokens) installs the locked tools, downloads the
   tested VSIX, checks the manifest inside it against the tag, and verifies both registry tokens
   before publishing anything, so that an expired token cannot leave a release on one registry
   only. It then publishes that same file to the VS Marketplace and to Open VSX, without
   rebuilding, and tolerates a version that is already published.
5. **Least privilege.** The workflow token can only read contents; the registry tokens are
   visible only to the deploy job's steps that use them.

`docs/packaging.md` describes this flow and names the environment, both secrets, the dry run and
the menu path to start it, and the artifact retention; it must stay true after the rewrite.

### 4.2 Entries

| #   | Entry                                | Class | Exact value (A), requirement (B) or effect of removal (C)                                                                                                                                                                                                                                                                                                                       |
| --- | ------------------------------------ | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E1  | Workflow name                        | B     | A short name. `docs/packaging.md` tells the reader to start the dry run from **Actions → publish → Run workflow**, so the name shown there must match the guide (or the guide changes with it).                                                                                                                                                                                 |
| E2  | Permissions                          | B     | Read-only repository contents for every job, nothing else. It is also the ceiling for the called CI workflow (3.3 E8).                                                                                                                                                                                                                                                          |
| E3  | Tag trigger                          | A     | Event `push` with a tag filter matching tags that start with `v` (`v*`). The release script requires the tag `v<major.minor.patch>`; `docs/packaging.md` says a pushed `v<version>` tag publishes.                                                                                                                                                                              |
| E4  | Manual trigger                       | B     | A dry run from the Actions tab (`workflow_dispatch`, no inputs) that validates, tests and packages the manifest's version as if tagged and checks both tokens, but never publishes.                                                                                                                                                                                             |
| E5  | Comments                             | B     | Free. The old file explains the dry run and why tokens are checked first; equivalent explanations are welcome.                                                                                                                                                                                                                                                                  |
| E6  | Identity job structure               | B     | One Linux job, first in the chain, with a readable display name, that exposes the chosen tag as a job output for the deploy job. Its job id is referenced by the other jobs' `needs` and by the deploy job's reading of the output (internal coupling only).                                                                                                                    |
| E7  | Identity job checkout                | A     | `actions/checkout@v7`.                                                                                                                                                                                                                                                                                                                                                          |
| E8  | Identity job toolchain               | A     | `pnpm/setup@703c52620218391530e48b9e8870d5c0082e1b9b # v2.1.0` with `runtime: node@24`, with the action's install turned off. No cache and no install are needed: the release script uses only Node's built-in modules.                                                                                                                                                         |
| E9  | Choosing the tag                     | B     | For a tag push, the pushed tag's short name; otherwise `v` followed by `package.json`'s `version`. Written to the step's outputs. The runner provides `GITHUB_EVENT_NAME`, `GITHUB_REF_NAME` and `GITHUB_OUTPUT` (A: runner variables).                                                                                                                                         |
| E10 | Identity check                       | A     | `node scripts/check-release.cjs "<tag>"`: the script's first argument is the tag; with no second argument it also checks the changelog and the two guides. It exits non-zero on failure. Passing the tag through an environment variable, not by expression inside the script text, avoids injection.                                                                           |
| E11 | Validation job                       | A     | A job that needs the identity job and consists only of `uses: ./.github/workflows/ci.yaml` (same repository, same commit). No secrets are passed: CI needs none. GitHub displays its jobs as `<this job's id> / lint (24)` and so on; the id is free.                                                                                                                           |
| E12 | Deploy job ordering                  | B     | Runs on Linux only after both the identity job and the validation job succeed, with a readable display name.                                                                                                                                                                                                                                                                    |
| E13 | Deploy environment                   | A     | `environment: release`. The environment is a repository setting: its required reviewer gates every deploy run (dry runs included), and it is meant to hold the two secrets (1.2, `repo Q2`). `docs/packaging.md` names it.                                                                                                                                                      |
| E14 | Deploy checkout                      | A     | `actions/checkout@v7`. Needed for `package.json`, the lockfile and the release script.                                                                                                                                                                                                                                                                                          |
| E15 | Deploy toolchain                     | A     | `pnpm/setup@703c52620218391530e48b9e8870d5c0082e1b9b # v2.1.0` with `runtime: node@24`, the action's install turned off and the store cache on (both B, as 3.3 E14–E15).                                                                                                                                                                                                        |
| E16 | Deploy install                       | B     | Install exactly the lockfile (pnpm's `--frozen-lockfile`), so that publishing uses the locked `@vscode/vsce` and `ovsx` from `devDependencies`, not whatever version a runner or `npx` would fetch.                                                                                                                                                                             |
| E17 | Download action                      | A     | `actions/download-artifact@v8` (moving major tag; adopted by Branchwise in `c2e51a6`; latest tag seen `v8.0.1`).                                                                                                                                                                                                                                                                |
| E18 | Download of the tested VSIX          | A     | Artifact name `branchwise-vsix` (what CI uploads, 3.3 E48) into a folder of this job's choosing, which then holds `branchwise.vsix`. E19, E22 and E23 use that path.                                                                                                                                                                                                            |
| E19 | Packaged identity check              | A     | Extract `extension/package.json` from the VSIX (a zip; `unzip -p <vsix> extension/package.json`) into a file under `$RUNNER_TEMP`, then run `node scripts/check-release.cjs "<tag>" "<that file>"`: the second argument makes the script check that manifest's identity and version against the tag and skip the document checks. The tag comes from the identity job's output. |
| E20 | Token verification before publishing | A     | Read the publisher from `package.json` (`jcfurey`), then run `pnpm exec vsce verify-pat <publisher>` and `pnpm exec ovsx verify-pat <publisher>`, both before either publish step, on every run including dry runs.                                                                                                                                                             |
| E21 | Token names                          | A     | `vsce` reads its token from `VSCE_PAT` and `ovsx` from `OVSX_PAT`. They come from the secrets `VS_MARKETPLACE_TOKEN` and `OPEN_VSX_TOKEN` (the names the repository settings and `docs/packaging.md` use), set only on the steps that need them.                                                                                                                                |
| E22 | Publish to the VS Marketplace        | A     | Only when the event is `push`: `pnpm exec vsce publish --packagePath <the downloaded VSIX> --skip-duplicate`.                                                                                                                                                                                                                                                                   |
| E23 | Publish to Open VSX                  | A     | Only when the event is `push`, after E22: `pnpm exec ovsx publish <the downloaded VSIX> --skip-duplicate`.                                                                                                                                                                                                                                                                      |
| E24 | Step names and order                 | B     | Names free. Order within the deploy job: checkout, toolchain, install, download, identity check, token verification, Marketplace, Open VSX.                                                                                                                                                                                                                                     |

---

## 5. `.github/dependabot.yml`

### 5.1 Role and consumers

Dependabot version updates: GitHub reads this file from the default branch and opens pull
requests that raise dependency versions. The pull requests then run CI like any other. No
Dependabot pull request exists in the repository's history (1.2, `repo Q4`).

### 5.2 Entries

| #   | Entry                             | Class | Exact value (A), requirement (B) or effect of removal (C)                                                                                                                                                                                                                                |
| --- | --------------------------------- | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E1  | Configuration format              | A     | `version: 2`, the only format Dependabot accepts, followed by a list of `updates`.                                                                                                                                                                                                       |
| E2  | Watch the workflows' actions      | B     | Keep the actions of both workflows current, including the commit pin of `pnpm/setup` and its version comment, which Dependabot rewrites together. The identifiers are dictated: `package-ecosystem: "github-actions"` with `directory: "/"` (Dependabot then reads `.github/workflows`). |
| E3  | How often for actions             | B     | A regular, low-noise interval (`repo Q4`).                                                                                                                                                                                                                                               |
| E4  | Watch the JavaScript dependencies | B     | Keep `package.json` and `pnpm-lock.yaml` current. The identifiers are dictated: `package-ecosystem: "npm"` (Dependabot's ecosystem for npm, Yarn and pnpm projects) with `directory: "/"`.                                                                                               |
| E5  | How often for dependencies        | B     | As E3.                                                                                                                                                                                                                                                                                   |
| E6  | One pull request per run          | B     | Group every JavaScript dependency update of a run into a single pull request (a group whose pattern matches every package), so that one CI run covers them together. The group name is free.                                                                                             |

---

## 6. `.vscode/tasks.json`

### 6.1 Role and consumers

The workspace's build and test tasks in VS Code. `launch.json` builds through the default build
task (7.2 E7). The problem matchers come from the recommended extension of section 9 (`$esbuild`,
`$esbuild-watch`) and from VS Code's built-in TypeScript support (`$tsc`, `$tsc-watch`). VS Code
also offers every `package.json` script as an automatically detected npm task; the tasks here add
problem matching, background handling and terminal presentation.

### 6.2 The output the matchers must understand (A)

- **esbuild.** `connor4312.esbuild-problem-matchers` (0.0.3) defines `$esbuild` with a two-line
  pattern: a line matching `^[✘▲] \[([A-Z]+)\] (.+)` (severity and message), then a line matching
  `^(?:\t| {4})(?!\s)([^:]+)(?::([0-9]+))?(?::([0-9]+))?:$` (file, line, column), with file paths
  relative to the workspace folder. `$esbuild-watch` uses the same pattern and treats a line
  containing `[watch] build started` as the start and `[watch] build finished` as the end of a
  build. `esbuild.js` prints exactly this: observed for a planted syntax error,
  `✘ [ERROR] Unexpected ";"` followed by four spaces and `src/main.ts:50:15:`, between the two
  markers.
- **tsc.** VS Code's `$tsc` pattern is
  `^([^\s].*)[\(:](\d+)[,:](\d+)(?:\):\s+|\s+-\s+)(error|warning|info)\s+TS(\d+)\s*:\s*(.*)$`, with
  files relative to the task's working directory. TypeScript 7.0.2 prints both forms it accepts:
  `<file>(1,7): error TS2322: …` without colour and `<file>:1:7 - error TS2322: …` in a terminal.
- **tsc watch.** `$tsc-watch` uses `$tsc` and brackets each build between a time-stamped line
  ending in `Starting compilation in watch mode...` (or `File change detected. Starting
incremental compilation...`) and one ending in `Found <n> errors. Watching for file changes.`
  TypeScript 7.0.2's `tsc --watch` printed `07:24:19 PM - Starting compilation in watch mode...` and
  `07:24:21 PM - Found 0 errors. Watching for file changes.`, which match (after VS Code removes the
  terminal's escape sequences). VS Code 1.139 also defines `$tsgo-watch` for a different output
  (`build starting at …`, `build finished in …`) that TypeScript 7.0.2 does not print.

### 6.3 Entries

| #   | Entry                             | Class | Exact value (A), requirement (B) or effect of removal (C)                                                                                                                                            |
| --- | --------------------------------- | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E1  | Comments                          | B     | Free.                                                                                                                                                                                                |
| E2  | Schema version                    | A     | `"version": "2.0.0"`.                                                                                                                                                                                |
| E3  | Combined watch task               | B     | One task in the build group that starts both watchers (E4, E6) in parallel by naming their labels, shows no terminal of its own, and declares an empty matcher list so VS Code does not ask for one. |
| E4  | esbuild watcher command           | A     | A shell task running `pnpm run watch:esbuild`, marked `"isBackground": true` because it never exits.                                                                                                 |
| E5  | esbuild watcher matcher           | A     | `"$esbuild-watch"` (6.2).                                                                                                                                                                            |
| E6  | tsc watcher command               | A     | A shell task running `pnpm run watch:tsc`, marked `"isBackground": true`.                                                                                                                            |
| E7  | tsc watcher matcher               | A     | `"$tsc-watch"` (6.2).                                                                                                                                                                                |
| E8  | Watchers' group and presentation  | B     | Both watchers belong to the build group; their two terminals share one terminal group (split side by side) and are not brought to the front.                                                         |
| E9  | Build command                     | A     | A shell task running `pnpm run compile` (cleans `out/`, then a development build with source maps).                                                                                                  |
| E10 | Build is the default build task   | A     | `"group": { "kind": "build", "isDefault": true }`, on this task only. `launch.json`'s `${defaultBuildTask}` resolves to it, and Ctrl+Shift+B runs it.                                                |
| E11 | Build matcher                     | A     | An esbuild matcher (6.2). Today `"$esbuild-watch"`; `"$esbuild"` matches the same lines for a one-shot build (`repo Q10`).                                                                           |
| E12 | Build presentation                | B     | The terminal appears only when needed (not brought to the front on success).                                                                                                                         |
| E13 | Test command                      | A     | A shell task running `pnpm test`.                                                                                                                                                                    |
| E14 | Test task group and presentation  | B     | In the test group; its terminal always shown; no problem matcher (test output is read, not matched).                                                                                                 |
| E15 | Type-check command                | A     | A shell task running `pnpm run typecheck` (all five TypeScript projects).                                                                                                                            |
| E16 | Type-check matcher                | A     | `"$tsc"` (6.2).                                                                                                                                                                                      |
| E17 | Type-check group and presentation | B     | In the test group; terminal not brought to the front.                                                                                                                                                |
| E18 | Labels                            | B     | Free, short and distinct. The combined watch task refers to the two watchers by label, so those three must agree.                                                                                    |

Observed: `pnpm run compile`, `pnpm run typecheck` and `pnpm test` succeed. `pnpm run watch:esbuild`
builds two bundles and prints its markers as start, start, finish, finish; `$esbuild-watch` treats
the first finish as the end of the build (`repo Q10`). `pnpm run watch:tsc` watches only the root
TypeScript project (the extension host code and `vitest.config.ts`), not the webview or test
projects that `typecheck` also checks.

---

## 7. `.vscode/launch.json`

### 7.1 Role and consumers

The configuration that F5 starts: an Extension Development Host with the working copy loaded as an
extension, for debugging the extension host code.

### 7.2 Entries

| #   | Entry                   | Class | Exact value (A), requirement (B) or effect of removal (C)                                                                                                                                                                                                                      |
| --- | ----------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| E1  | Comments                | B     | Free.                                                                                                                                                                                                                                                                          |
| E2  | Schema version          | A     | `"version": "0.2.0"`.                                                                                                                                                                                                                                                          |
| E3  | One named configuration | B     | A single configuration whose name says it runs the extension.                                                                                                                                                                                                                  |
| E4  | Debugger type           | A     | `"type": "extensionHost"` and `"request": "launch"`.                                                                                                                                                                                                                           |
| E5  | Extension location      | A     | `"args": ["--extensionDevelopmentPath=${workspaceFolder}"]`: the extension's root, where `package.json` is, is the workspace folder.                                                                                                                                           |
| E6  | Compiled code           | A     | `"outFiles": ["${workspaceFolder}/out/**/*.js"]`. The build writes the bundles and their source maps to `out/` (`sourcesContent` off, so the maps point at `src/` on disk). Limiting the search to `out/` keeps the debugger from scanning `node_modules` and `tests-ext/out`. |
| E7  | Build before launch     | A     | `"preLaunchTask": "${defaultBuildTask}"`, which resolves to the build task of 6.3 E9–E10.                                                                                                                                                                                      |

---

## 8. `.vscode/settings.json`

### 8.1 Role and consumers

Workspace settings that VS Code applies to everyone who opens the folder. VS Code 1.139.1's
defaults matter here: `files.exclude` hides `**/.git`, `**/.svn`, `**/.hg`, `**/.jj`,
`**/.DS_Store` and `**/Thumbs.db`; `search.exclude` hides `**/node_modules`,
`**/bower_components` and `**/*.code-search`; and `search.useIgnoreFiles` is on, so search skips
everything `.gitignore` ignores.

### 8.2 Entries

| #   | Entry                              | Class | Exact value (A), requirement (B) or effect of removal (C)                                                                                                                                                                                                                                                                                                                                                                                                    |
| --- | ---------------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| E1  | Comments                           | B     | Free.                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| E2  | Keep `out` visible in the Explorer | C     | `out` is not hidden by default, so this only overrides a developer's own setting that hides it. Removing it changes nothing with default settings.                                                                                                                                                                                                                                                                                                           |
| E3  | Keep `dist` visible                | C     | No `dist` folder is built or exists. Removing it changes nothing.                                                                                                                                                                                                                                                                                                                                                                                            |
| E4  | Hide `out` from search             | C     | Search already skips `out/`: `.gitignore` ignores `**/out/` and `search.useIgnoreFiles` is on. Removing it changes nothing unless a developer turns that setting off.                                                                                                                                                                                                                                                                                        |
| E5  | Hide `dist` from search            | C     | No `dist` folder. Removing it changes nothing.                                                                                                                                                                                                                                                                                                                                                                                                               |
| E6  | No automatic `tsc` tasks           | B     | VS Code must not offer its automatically detected `tsc` build and watch tasks for the repository's TypeScript projects: the project builds with esbuild and the package scripts, and a detected build of `tests-ext` would emit without the path-alias rewrite that `compile-tests` adds. The setting's name is dictated: `"typescript.tsc.autoDetect": "off"`, which VS Code 1.139.1 marks as deprecated in favour of `"js/ts.tsc.autoDetect"` (`repo Q9`). |

---

## 9. `.vscode/extensions.json`

### 9.1 Role and consumers

The extensions VS Code offers to install when the folder is opened.

### 9.2 Entries

| #   | Entry                    | Class | Exact value (A), requirement (B) or effect of removal (C)                                                                                                                                                                                          |
| --- | ------------------------ | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E1  | Comments                 | B     | Free.                                                                                                                                                                                                                                              |
| E2  | esbuild problem matchers | A     | `"connor4312.esbuild-problem-matchers"`. It contributes `$esbuild` and `$esbuild-watch`, which `tasks.json` uses (6.2); without it VS Code reports those matchers as unknown and cannot show build errors or tell when a watch build has finished. |
| E3  | Extension test runner    | B     | Recommend an extension that runs and debugs the VS Code test suites that `.vscode-test.mjs` describes from the Testing view.                                                                                                                       |

---

## 10. `.gitattributes`

### 10.1 Role, consumers and observed state

Git applies these attributes at checkout and commit. Observed with `git ls-files --eol`: 572
tracked files, 571 of them text with LF endings in both the index and the working tree, and one
binary, `resources/icon.png`. Tracked file types: `.ts`, `.tsx`, `.md`, `.json`, `.jsonc`, `.cjs`,
`.mjs`, `.js`, `.css`, `.svg`, `.yaml`, `.yml`, `.nix`, `.lock`, `.png`, and files without an
extension (`LICENSE`, `.envrc`, `CODEOWNERS`, the two Git configuration fixtures, the ignore files).

No test depends on the line endings of tracked files. The tests that need CRLF content write it
themselves into repositories they create outside the working copy, with `GIT_CONFIG_NOSYSTEM=1` and
a fixture global configuration, so neither this file nor the machine's `core.autocrlf` reaches
them. What depends on LF is the format check (E2).

### 10.2 Entries

| #   | Entry                  | Class | Exact value (A), requirement (B) or effect of removal (C)                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| --- | ---------------------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E1  | Comments               | B     | Free.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| E2  | LF for every text file | A     | `* text=auto eol=lf`. `pnpm run format` requires LF: `oxfmt` writes LF and `.oxfmtrc.jsonc` does not change that, and a file with CRLF endings fails the check (observed). A Windows clone with `core.autocrlf=true`, the Git for Windows installer's default, would otherwise check text out with CRLF and fail the format check locally; CI would not notice, because its format check runs on Linux. The rule also gives the packaged text files LF endings whichever platform builds the VSIX. |
| E3  | PNG images are binary  | B     | Mark PNG images as binary, so the only binary file, the extension icon, is never converted or text-diffed. Git's own detection would also treat it as binary (PNG headers contain NUL bytes).                                                                                                                                                                                                                                                                                                      |
| E4  | `*.jpg` binary         | C     | No such file is tracked. Removing it changes nothing today; a future file of this type would rely on Git's content detection (`repo Q7`).                                                                                                                                                                                                                                                                                                                                                          |
| E5  | `*.jpeg` binary        | C     | As E4.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| E6  | `*.gif` binary         | C     | As E4.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| E7  | `*.ico` binary         | C     | As E4.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| E8  | `*.pdf` binary         | C     | As E4. Of these types, a PDF is the one Git's detection could mistake for text (its start can be plain ASCII without NUL bytes).                                                                                                                                                                                                                                                                                                                                                                   |
| E9  | `*.woff` binary        | C     | As E4.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| E10 | `*.woff2` binary       | C     | As E4.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| E11 | `*.ttf` binary         | C     | As E4.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| E12 | `*.vsix` binary        | C     | VSIX files are ignored (11.2 E4) and never tracked. Removing it changes nothing.                                                                                                                                                                                                                                                                                                                                                                                                                   |

---

## 11. `.gitignore`

### 11.1 Role and consumers

Keeps generated files out of Git. Two tools read it as well: `oxfmt` (`pnpm run format`) and
`oxlint` (`pnpm run lint`) skip what it ignores, which was verified by planting an unformatted
JSON file and a lint-failing script in each ignored folder of a scratch copy and removing each
entry in turn. VS Code's search also skips what it ignores (8.1). `oxfmt` and `oxlint` skip
`node_modules` on their own, and their configurations ignore the root `out/` folder.

After `pnpm run compile`, `pnpm run compile-tests`, `pnpm run package:vsix --out branchwise.vsix`,
`test:package` and `test:ext`, the only untracked paths were `.vscode-test/`, `branchwise.vsix`,
`node_modules/`, `out/`, `test-results/` and `tests-ext/out/`, all ignored, and `pnpm run format`
and `pnpm run lint` still passed.

### 11.2 Entries

| #   | Entry               | Class | Exact value (A), requirement (B) or effect of removal (C)                                                                                                                                                                                                                                                                         |
| --- | ------------------- | ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E1  | VS Code downloads   | A     | `/.vscode-test/`. The VS Code test tooling (`vscode-test`, `test:package`, `test:ui-harness`, `benchmark:ui`) downloads VS Code builds into `.vscode-test/` in the working directory; `clean:all` removes it. Without the entry, VS Code's own files show as untracked, and the format check and the linter scan them (observed). |
| E2  | Installed packages  | A     | `/node_modules/`, pnpm's install folder.                                                                                                                                                                                                                                                                                          |
| E3  | Build output        | A     | `**/out/`: `esbuild.js` writes `out/`, and `compile-tests` writes `tests-ext/out/`, so it must match at any depth. Without it, the format check and the linter scan `tests-ext/out` (observed).                                                                                                                                   |
| E4  | Packaged extensions | A     | `*.vsix`. `package:vsix` writes `branchwise-<version>.vsix`, or the name given with `--out` (`branchwise.vsix` in CI and the guides), into the repository root; `clean:all` deletes root VSIX files. At least root-level VSIX files must be ignored.                                                                              |
| E5  | Merge backups       | B     | Keep the backup files that `git mergetool` leaves after resolving conflicts (`*.orig`) out of `git status`. Nothing in the build creates them.                                                                                                                                                                                    |
| E6  | Comment             | B     | Free.                                                                                                                                                                                                                                                                                                                             |
| E7  | direnv cache        | A     | `/.direnv/`, while the direnv set-up of section 15 exists: direnv's `use flake` keeps its cache there. Without it, the format check and the linter scan its contents (observed).                                                                                                                                                  |
| E8  | Nix build link      | C     | `/result` is where `nix build` puts its output link. The flake defines no packages (13.3), so nothing creates it. Removing it changes nothing.                                                                                                                                                                                    |
| E9  | Nix build links     | C     | `/result-*`, the same for builds with several outputs. Removing it changes nothing.                                                                                                                                                                                                                                               |
| E10 | Test artifacts      | A     | `/test-results/`, the default artifact folder of `.vscode-test.mjs`, `scripts/test-ui-harness.cjs` and `scripts/benchmark.mjs` (screenshots, logs, JSON reports, CPU profiles). CI uploads it (3.3 E42, E45) and `clean:all` removes it. Without the entry, its JSON files fail the format check (observed).                      |

---

## 12. `.vscodeignore`

### 12.1 How `vsce` reads it (A)

Read by `@vscode/vsce` 3.9.2 for `package:vsix`, `vsce ls` (`check:links`) and `vsce publish`:

- Lines are trimmed; blank lines and lines starting with `#` are skipped. Lines may end in LF or
  CRLF.
- A line starting with `!` includes, any other line excludes. Patterns are matched with
  `minimatch`, dot files included, against paths relative to the root with forward slashes. A
  pattern whose last segment contains no `*` also matches everything below it (`!out/` covers
  `out/extension.js`).
- A file is packaged when no exclude pattern matches it or any include pattern matches it. The
  order of lines therefore does not matter, unlike `.gitignore`.
- `package.json` and `README.md` are always packaged. `vsce` always excludes, among others,
  `.vscodeignore`, `.gitattributes`, `**/.git/**`, `**/*.vsix` and `**/.vscode-test/**`. Its
  built-in `.github` exclusion does not cover the files inside that folder (observed: they are
  packaged when E3 is removed). With `--no-dependencies` (used by `package:vsix` and `check:links`),
  `node_modules` is never packaged.
- Inside the package, `README.md` becomes `extension/readme.md`, `CHANGELOG.md` becomes
  `extension/changelog.md` and `LICENSE` becomes `extension/LICENSE.txt`. `vsce` rewrites relative
  links in the README and changelog to the repository, so the documents they link to need not be
  packaged; any other packaged Markdown must link only to packaged files (`check:links`).
- `vsce` refuses to combine this file with a `files` field in `package.json` (there is none).
- `vsce` fails when the manifest's `main` file or `icon` is not packaged, and asks for
  confirmation (which aborts a non-interactive build) when no `LICENSE`, `LICENSE.md` or
  `LICENSE.txt` is.

### 12.2 Required package contents (A)

Exactly these 24 files, observed in `branchwise.vsix` (plus `[Content_Types].xml` and
`extension.vsixmanifest`, which `vsce` generates):

- `LICENSE`, `README.md`, `CHANGELOG.md`, `package.json`, `package.nls.json`,
  `package.nls.zh-cn.json`, `package.nls.zh-tw.json`;
- `l10n/bundle.l10n.json`, `l10n/bundle.l10n.zh-cn.json`, `l10n/bundle.l10n.zh-tw.json`;
- `out/extension.js`, `out/web.min.js`, `out/web.min.css`;
- `resources/icon.png`, `resources/webview-icon.svg`, `resources/webview-icon-dark.svg`,
  `resources/webview-icon-light.svg`;
- `docs/git-actions.md`;
- `walkthroughs/act-on-commit.md`, `walkthroughs/branches-pane.md`,
  `walkthroughs/focus-and-remotes.md`, `walkthroughs/open-graph.md`, `walkthroughs/read-graph.md`,
  `walkthroughs/recover.md`.

Nothing else: in particular no `node_modules`, `src`, `tests`, `scripts` or `docs/testing.md`
(the package smoke test checks these five), no other document from `docs/`, no
`resources/icon.svg`, and no source maps (`package:vsix`'s prepublish step empties `out/` and
builds without maps). New files in `l10n/`, `out/` and `walkthroughs/` are packaged without a new
entry; a new resource or packaged document needs one.

### 12.3 Entries

Effect of removing each line, measured with `vsce`'s own listing in a scratch copy, in the last
column.

| #   | Entry                               | Class | Exact value (A), requirement (B) or effect of removal (C)                                                                                                                                                                                    |
| --- | ----------------------------------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E1  | Comments                            | B     | Free. The old file explains the allow-list and why only the user guide ships from `docs/`.                                                                                                                                                   |
| E2  | Exclude top-level files             | B     | Together with E3: nothing ships unless an include line names it (an allow-list; the alternative, a `files` field in `package.json`, cannot be combined with this file). Without E2 alone, 14 top-level configuration files join the package. |
| E3  | Exclude everything below the top    | B     | See E2. Without E3 alone, 595 files are packaged. One pattern matching every path at any depth could replace E2 and E3.                                                                                                                      |
| E4  | `!LICENSE`                          | A     | The MIT licence (manifest `license`); see 12.1 for what `vsce` does without it. The smoke test expects `LICENSE.txt`.                                                                                                                        |
| E5  | `!README.md`                        | C     | `vsce` always packages `README.md`; the listing is identical without this line.                                                                                                                                                              |
| E6  | `!CHANGELOG.md`                     | A     | The Marketplace's changelog; the smoke test expects `changelog.md`. Without it, `CHANGELOG.md` is dropped.                                                                                                                                   |
| E7  | `!package.nls*.json`                | A     | VS Code localizes the manifest's `%…%` strings from `package.nls.json` and `package.nls.<locale>.json` in the installed extension; the smoke test expects all three. Without it, all three are dropped.                                      |
| E8  | `!out/`                             | A     | `main` is `./out/extension.js`; the webview loads `out/web.min.js` and `out/web.min.css`, and `out` is the webview's only local resource root. Without it, the three bundles are dropped and `vsce` fails.                                   |
| E9  | `!l10n/`                            | A     | Manifest `"l10n": "./l10n"`: the runtime translation bundles; the smoke test expects all three.                                                                                                                                              |
| E10 | `!resources/icon.png`               | A     | The manifest's `icon`; `vsce` fails without it.                                                                                                                                                                                              |
| E11 | `!resources/webview-icon.svg`       | A     | The graph panel's icon (`src/extension/view-command.ts`).                                                                                                                                                                                    |
| E12 | `!resources/webview-icon-dark.svg`  | A     | The view command's icon in the manifest and the panel's icon in dark themes.                                                                                                                                                                 |
| E13 | `!resources/webview-icon-light.svg` | A     | The same for light themes.                                                                                                                                                                                                                   |
| E14 | `!docs/git-actions.md`              | A     | The user guide that the Learn more command opens from the installed extension (`src/extension/handlers/onboarding.ts`); the smoke test expects it and checks its links.                                                                      |
| E15 | `!walkthroughs/`                    | A     | The walkthrough steps' Markdown named in the manifest; the smoke test expects each. Without it, all six are dropped.                                                                                                                         |

---

## 13. `flake.nix`

### 13.1 Role and consumers

A Nix development shell. `docs/testing.md` names it as the alternative to Corepack for getting
Node.js 24 and pnpm; `.envrc` loads it for direnv users (section 15). CI does not use Nix, and no
other file, script or document refers to it. Nix is not installed in this environment, so the
flake could not be evaluated here.

### 13.2 What the shell must provide

- Node.js 24, the documented runtime (with it, Corepack).
- pnpm 11. `package.json` pins `pnpm@11.15.1`; at the locked `nixpkgs` revision the shell's pnpm
  is 11.17.0. `docs/testing.md` notes that a `node_modules` installed from another pnpm store makes
  pnpm ask before purging it, and gives the flag that accepts.
- Measured at the locked revision (from its source on GitHub): Node.js 24.18.0, pnpm 11.17.0 and
  vsce 3.9.2.
- Not provided today, taken from the host: Git (the tests run real Git), `xvfb-run` for headless
  Linux UI tests, and `unzip` (only the publish workflow uses it).

### 13.3 Entries

| #   | Entry                       | Class | Exact value (A), requirement (B) or effect of removal (C)                                                                                                              |
| --- | --------------------------- | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E1  | Description                 | B     | One line naming the project's development environment.                                                                                                                 |
| E2  | `nixpkgs` input             | B     | A `nixpkgs` branch recent enough to carry Node.js 24 and pnpm 11. The lock (section 14) fixes the revision.                                                            |
| E3  | Outputs function            | A     | `outputs` is a function of the inputs (the flake schema; it also receives `self`).                                                                                     |
| E4  | Supported systems           | B     | Linux and macOS, each on x86-64 and ARM64 (`x86_64-linux`, `aarch64-linux`, `x86_64-darwin`, `aarch64-darwin` are Nix's names).                                        |
| E5  | Per-system helper           | B     | Any way of producing the shell for each system.                                                                                                                        |
| E6  | Default development shell   | A     | The attribute `devShells.<system>.default`, which `nix develop` and direnv's `use flake` enter when no attribute is named.                                             |
| E7  | Shell without a C toolchain | B     | Nothing is compiled from native source (esbuild ships binaries), so the shell need not carry a compiler.                                                               |
| E8  | Node.js 24                  | A     | `pkgs.nodejs_24`, `nixpkgs`' attribute for the documented runtime.                                                                                                     |
| E9  | pnpm                        | B     | A pnpm 11 from `nixpkgs`; its exact version follows the lock (13.2).                                                                                                   |
| E10 | `vsce`                      | C     | The scripts and workflows run the locked `@vscode/vsce` through pnpm; nothing calls a `vsce` on the `PATH`. Removing it only drops that global command from the shell. |

---

## 14. `flake.lock`

### 14.1 Role

Generated by Nix (`nix flake lock` or `nix flake update`) from the inputs of `flake.nix`, and never
written by hand. It cannot be regenerated here, because Nix is not installed.

### 14.2 Current content

Lock format version 7; a root node with the single input `nixpkgs`; that input locked to GitHub
`NixOS/nixpkgs` at revision `624af665418d3c65d544145b4d34ad696439570e` (last modified 2026-07-26),
from the original reference `nixos-unstable`. It was generated upstream on 2026-07-28 and has not
been updated since.

### 14.3 Entries

| #   | Entry                | Class | Exact value (A), requirement (B) or effect of removal (C)                                                                                           |
| --- | -------------------- | ----- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| E1  | Format and root node | A     | Whatever the Nix used writes; today format `7` with node `root` whose only input is `nixpkgs`.                                                      |
| E2  | The input's original | A     | Mirrors the input URL of `flake.nix` (type `github`, owner `NixOS`, repository `nixpkgs`, reference `nixos-unstable`).                              |
| E3  | The locked revision  | B     | Which `nixpkgs` revision the shell uses (revision, hash, date). Set by when the lock is regenerated; it must provide Node.js 24 and pnpm 11 (13.2). |

A regenerated lock with the same input repeats lines that Nix dictates and that upstream's lock
also has (the `owner`, `repo` and `type` lines, `"root": "root"`, `"version": 7`), so
`pnpm run provenance` will still count them as inherited. `scripts/provenance.cjs` skips
`pnpm-lock.yaml` as generated, but not `flake.lock` (`repo Q13`).

---

## 15. `.envrc`

### 15.1 Role and consumers

direnv runs this file when a developer enters the folder (after `direnv allow`), to load the Nix
shell automatically. Only direnv users need it; it caches into `.direnv/` (11.2 E7).

### 15.2 Entries

| #   | Entry          | Class | Exact value (A), requirement (B) or effect of removal (C)                                                                                                             |
| --- | -------------- | ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E1  | Load the flake | A     | `use flake`: the direnv standard-library function (also provided, with caching, by nix-direnv) that enters the default development shell of the flake in this folder. |

---

## 16. Questions for the maintainer

- **repo Q1 — Required checks.** `main` has no branch protection or ruleset today. `todo.md` plans
  a ruleset requiring `lint (24)`, `test (ubuntu-latest)`, `test (macos-latest)` and
  `test (windows-latest)`, the names the current jobs produce. This specification treats those
  names and the pull-request trigger as dictated (3.3 E3, E10, E22). Should they stay exactly as
  they are, and is the ruleset still intended?
- **repo Q2 — The `release` environment.** The publish workflow has never run here, the
  environments endpoint could not be read, and `todo.md` lists creating the environment (with a
  required reviewer) and moving both tokens into it as outstanding. Until it exists, a run creates
  an environment of that name without protection rules, and repository-level secrets of the same
  names are used. Keep the deploy job's environment and secret names as they are?
- **repo Q3 — How actions are referenced.** `pnpm/setup` is pinned to the commit of `v2.1.0`;
  the three `actions/*` actions use moving major tags (`v7`, `v7`, `v8`). `docs/packaging.md` says
  third-party actions are pinned to commit SHAs, which holds. `pnpm/setup` `v3.0.0` now exists.
  Keep this split and version, pin GitHub's actions too, or move to `v3`?
- **repo Q4 — Dependabot produces nothing.** No Dependabot pull request has ever been opened; the
  repository is a fork, and `todo.md` lists enabling Dependabot as outstanding. The file asks for
  weekly updates of actions and of JavaScript dependencies (the latter in one grouped pull
  request). Keep both ecosystems, the interval and the grouping?
- **repo Q5 — Duplicate runs and branch filter.** A push to a `claude/` or `fix/` branch with an
  open pull request runs CI twice on the same commit (observed: runs 160 and 161); `upstream-pr/`
  branches, which exist on the remote, get no push runs. Keep the push filter as it is?
- **repo Q6 — Time limits and concurrency of releases.** The lint job has no time limit (GitHub's
  default is six hours) while the test job has 25 minutes; the publish workflow has neither a
  concurrency group nor time limits, so two tag pushes could publish at the same time. Keep?
- **repo Q7 — The binary list.** `.gitattributes` names eight binary types that no tracked file
  has, and VSIX files, which are never tracked (10.2 E4–E12). Keep a defensive list, or only the
  types present?
- **repo Q8 — Workspace exclusions.** The four exclusion settings have no effect with VS Code's
  defaults (8.2 E2–E5). Keep any of them?
- **repo Q9 — Deprecated setting name.** VS Code 1.139.1 marks `typescript.tsc.autoDetect` as
  deprecated in favour of `js/ts.tsc.autoDetect`. Which name should the workspace set, or both?
- **repo Q10 — Build matchers.** The default build task uses the watch variant of the esbuild
  matcher for a one-shot build. The esbuild watcher builds two bundles and prints two start and
  finish pairs, so the watch matcher ends the build at the first finish. The tsc watcher checks only
  the root TypeScript project. Keep as they are?
- **repo Q11 — The README include line.** `!README.md` has no effect, because `vsce` always
  packages the README (12.3 E5). Keep it for readability?
- **repo Q12 — Keep the Nix set-up?** It is used only as the documented alternative to Corepack
  and through direnv; CI does not use it; its lock dates from 2026-07-26 and was never updated; its
  pnpm (11.17.0) differs from the pinned 11.15.1; it does not provide Git or `xvfb-run`; its `vsce`
  is unused; and the `/result` ignore entries only serve builds the flake cannot make. Nix is not
  available here to regenerate the lock. Keep, rewrite or drop `flake.nix`, `flake.lock`, `.envrc`
  and the related `.gitignore` entries?
- **repo Q13 — The lock and provenance.** A regenerated `flake.lock` still matches upstream's on
  the lines Nix dictates. Should those be recorded as reviewed coincidences, or should the
  provenance script skip `flake.lock` as it skips `pnpm-lock.yaml`?
- **repo Q14 — One launch configuration.** There is no configuration to debug the VS Code test
  suites (the recommended test runner extension covers that), and the compiled-code pattern also
  covers the webview bundle. Keep the single configuration?
- **repo Q15 — Dry runs need approval.** The deploy job always runs in the `release` environment,
  so a manual dry run also waits for the reviewer, and it can be started from any branch. Keep?

---

## 17. Counts

| File                            | (A) | (B) | (C) | Entries |
| ------------------------------- | --- | --- | --- | ------- |
| `.github/workflows/ci.yaml`     | 31  | 18  | 0   | 49      |
| `.github/workflows/publish.yml` | 15  | 9   | 0   | 24      |
| `.github/dependabot.yml`        | 1   | 5   | 0   | 6       |
| `.vscode/tasks.json`            | 11  | 7   | 0   | 18      |
| `.vscode/launch.json`           | 5   | 2   | 0   | 7       |
| `.vscode/settings.json`         | 0   | 2   | 4   | 6       |
| `.vscode/extensions.json`       | 1   | 2   | 0   | 3       |
| `.gitattributes`                | 1   | 2   | 9   | 12      |
| `.gitignore`                    | 6   | 2   | 2   | 10      |
| `.vscodeignore`                 | 11  | 3   | 1   | 15      |
| `flake.nix`                     | 3   | 6   | 1   | 10      |
| `flake.lock`                    | 2   | 1   | 0   | 3       |
| `.envrc`                        | 1   | 0   | 0   | 1       |
| **Total**                       | 88  | 59  | 17  | 164     |

---

## Decisions

These decisions are the maintainer's answers to the questions above; where they differ from the rest of this specification, they win.

- **Q1.** Keep the four check names and the pull-request trigger exactly; a ruleset that requires them is still intended.
- **Q2.** Keep the `release` environment and the secret names.
- **Q3.** Keep the split: third-party actions pinned to a commit with the version in a comment, GitHub's own actions at major tags. Upgrade nothing in this batch.
- **Q4.** Keep both ecosystems, the weekly interval and the grouping.
- **Q5.** Keep the branch filter.
- **Q6.** Give the lint job and the publish job a time limit, and the publish workflow a concurrency group that never cancels a publish in progress.
- **Q7.** Keep only what is dictated: `* text=auto eol=lf`. Drop the binary patterns and `*.vsix`.
- **Q8.** Drop the four exclusion settings that have no effect.
- **Q9.** Use the current key, `js/ts.tsc.autoDetect`.
- **Q10.** The build task's matcher must treat the build as finished only when every bundle has been built. Coordinate with the build script (`config-build.md`), which may print one start and one end line for the whole build. The tsc watcher may cover the root project only.
- **Q11.** Drop `!README.md`.
- **Q12.** Drop the Nix and direnv set-up: remove `flake.nix`, `flake.lock` and `.envrc`, remove `.direnv/` from `.gitignore`, and remove the Nix alternative from `docs/testing.md`. Nothing in CI uses it, and its lock file cannot be regenerated here.
- **Q13.** Moot after Q12.
- **Q14.** Keep the single launch configuration.
- **Q15.** Keep the reviewer's approval for dry runs.
