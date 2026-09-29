# Clean-room specification: the extension manifest

This document describes `package.json`, the extension manifest, so that it can be deleted and
written again by someone who never sees it or its history. It is written for that implementer.

A manifest is configuration, not code. Most of it is values that something outside the file
requires exactly: VS Code, the Marketplace, `vsce`, pnpm, CI, the scripts and the tests. Those
values are an interface, like an exported signature, and this document gives each of them exactly.
The rest are choices the project made; for those it states what must be true and leaves the
wording and layout to the implementer. A few entries no longer serve a purpose, or name the
upstream projects; for those it says what they do today and leaves the decision to the maintainer.

Every entry is put in one of three classes:

| Class | Meaning                                                                                                           | What this document gives                         |
| ----- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| **A** | Dictated: an external interface requires this exact value, and any other value breaks something outside the file. | The exact value, and what depends on it.         |
| **B** | Chosen: another value would do as well.                                                                           | The requirement the entry serves, not its text.  |
| **C** | Obsolete or questionable: nothing uses it any more, or it no longer fits Branchwise.                              | What it does today and what removing it changes. |

| Part | Content                                                                        |
| ---- | ------------------------------------------------------------------------------ |
| 0    | How this was derived                                                           |
| 1    | Scope, consumers, and how a rewrite is verified                                |
| 2    | Entry by entry, in the manifest's own grouping                                 |
| 3    | Invariants: order, formatting, and agreement with other files                  |
| 4    | Questions for the maintainer, numbered `manifest Q1`, `manifest Q2`, and so on |

---

## 0. How this was derived

- Worktree at commit `cd1b5db` (`main`), Linux x64, Node v22.22.2, pnpm 11.15.1, `vsce` 3.9.2,
  oxfmt 0.64.0. Blame used Git 2.55.0.
- The inherited lines were found with Git 2.55.0's `git blame -w -M -C` over
  `f8ed5df..HEAD -- package.json`: every line attributed to the boundary is upstream work. Applying
  the substantive-line rule that `scripts/provenance.cjs` exports to those lines gives 154, the
  figure `scripts/provenance-baseline.json` records. Running the script itself
  (`node scripts/provenance.cjs --lines package.json`) with Git 2.55 first in `PATH` was refused by
  this session's worktree guard, so the same blame was run directly. The inherited lines are the description reference, categories,
  keywords, `license`, the first upstream credit, the `repository` type, `main`, `l10n`,
  `activationEvents`, `icon`, `engines`, 16 of the 29 scripts, the dependency lines that predate
  the fork, the first command's title and icons, the Source Control menu entry, and nearly all of
  each setting's declaration. Branchwise's own lines are the identity (`name`, `displayName`,
  `version`, `publisher`, the links), the other four commands, the two File History menus, every
  setting name, the walkthrough, `packageManager`, `capabilities`, and the other 13 scripts.
- Consumers were found by searching the whole tree (except `node_modules`, `out`,
  `pnpm-lock.yaml`, and `CHANGELOG.md`, which is history) for every field name, script name,
  command ID, setting name, walkthrough and step ID, file path, and dependency name, and reading
  each hit. What `vsce` checks was read from its packaging and validation code in `node_modules`.
- Which orders the formatter imposes was found by running `oxfmt` on copies of the manifest in
  `/tmp` with one object or array reordered at a time (§3.2).
- `pnpm run check:release`, `pnpm run test:release` (24 tests), `pnpm run check:links` and
  `pnpm exec oxfmt --check package.json` pass on the current manifest. The manifest equals
  `JSON.stringify(manifest, null, 2)` followed by one newline, byte for byte.
- No repository file other than this document was changed.

---

## 1. Scope, consumers, and how a rewrite is verified

### 1.1 The file

`package.json` at the repository root: 360 lines, one JSON object with 23 top-level fields. The
rewrite replaces the whole file, including the lines Branchwise wrote, because they sit among
inherited ones and share their layout. The manifest must end up with the same meaning as today in
every (A) entry, and serve the same requirement in every (B) entry; (C) entries are kept as they
behave today unless the maintainer decides otherwise (§4).

Out of scope, and not to be changed: `pnpm-lock.yaml` (the dependency ranges must match it
exactly, §2.4 and §2.5), `package.nls*.json` (the texts behind the `%…%` references, already rewritten under
[ui-wording.md](ui-wording.md)), `.vscodeignore`, `esbuild.js`, and every script and test that
reads the manifest.

### 1.2 Who reads it

| Reader                                       | What it reads                                                                                                                                                                                                                                                                                                                                                                                                              |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| VS Code, at install and every start          | Identity (`publisher.name`, `version`), `engines.vscode`, `main`, `activationEvents`, `capabilities`, `l10n`, and every `contributes` point. It replaces each `"%key%"` string with the value from `package.nls.<locale>.json`, falling back to `package.nls.json`. User settings are stored under the declared setting names.                                                                                             |
| Marketplace and Open VSX                     | `displayName`, `description` (resolved through `package.nls.json` by `vsce`), `categories`, `keywords` (as tags), `icon`, `homepage`, `bugs`, `repository`, `license`, `version`, `engines`.                                                                                                                                                                                                                               |
| `vsce` (packaging, `vsce ls`, publishing)    | Validates `name`, `publisher`, `version`, `engines.vscode`, `main` with `activationEvents`, that `icon` is not SVG, and that `@types/vscode` is no newer than `engines.vscode`; runs the `vscode:prepublish` script through `npm run`; rewrites relative links in the README and changelog to the GitHub repository named by `repository`, and fails to package when there is none, because the README has relative links. |
| pnpm and Corepack                            | `packageManager` (which pnpm runs), `dependencies` and `devDependencies` (checked against `pnpm-lock.yaml` by `--frozen-lockfile`), `scripts`.                                                                                                                                                                                                                                                                             |
| Dependabot (`.github/dependabot.yml`)        | The dependency lists (npm ecosystem, weekly).                                                                                                                                                                                                                                                                                                                                                                              |
| CI (`.github/workflows/ci.yaml`)             | Script names: `format`, `lint`, `test:lint-rules`, `typecheck`, `l10n:check`, `check:release`, `test:release`, `check:links`, `check:provenance`, `test`, `test:coverage`, `test:ext`, `test:ui-harness`, `benchmark`, `benchmark:ui`, `package:vsix`, `test:package`.                                                                                                                                                     |
| Publishing (`.github/workflows/publish.yml`) | `version` and `publisher` through `node -p`, and the packaged manifest inside the VSIX through `scripts/check-release.cjs`.                                                                                                                                                                                                                                                                                                |
| `scripts/check-release.cjs`                  | `publisher` must be `jcfurey`, `name` must be `branchwise`, `version` must be a plain `major.minor.patch`; without a packaged manifest it also requires `CHANGELOG.md`, `README.md` and `docs/packaging.md` to name that version.                                                                                                                                                                                          |
| `scripts/test-package.cjs`                   | `name`, `publisher`, `version`, `displayName`, `engines`, `repository` (copied into an older fixture build that the real VSIX must upgrade).                                                                                                                                                                                                                                                                               |
| `scripts/package-smoke.cjs`                  | The installed extension's `version`, and the `media.markdown` path of every walkthrough step, each of which must be packaged; runs `branchwise.view`, `branchwise.openDocumentation`, `branchwise.openWalkthrough`.                                                                                                                                                                                                        |
| `scripts/markdown-links.cjs`                 | Indirectly: the packaged file list from `vsce ls`.                                                                                                                                                                                                                                                                                                                                                                         |
| `.vscode-test.mjs`                           | `engines.vscode`, which must have the form `^X.Y.Z` (the minimum VS Code the tests can select), and `publisher` and `name` (the extension ID handed to the tests).                                                                                                                                                                                                                                                         |
| `.vscode/tasks.json`, `.vscode/launch.json`  | Script names `watch:esbuild`, `watch:tsc`, `compile` (the default build task, run before launching), `test`, `typecheck`.                                                                                                                                                                                                                                                                                                  |
| Unit tests (`tests/extension/`)              | Setting declarations: defaults, `enum`s, `type` and `minimum` of the numeric settings, the colour `pattern` and default list, the order of setting names; the two `capabilities`. Details per entry in §2.                                                                                                                                                                                                                 |
| VS Code tests (`tests-ext/`)                 | The contributed command IDs and walkthrough IDs, through the running extension's `packageJSON`; settings written with `update`, which VS Code accepts only for declared settings.                                                                                                                                                                                                                                          |
| Source (`src/`)                              | Command IDs it registers and runs, setting names it reads, the walkthrough ID it opens (`publisher.name#gettingStarted`, built from the running manifest), resource paths.                                                                                                                                                                                                                                                 |
| Documentation                                | `README.md` (pnpm version, VS Code minimum, extension ID, VSIX file name, the settings table), `docs/packaging.md`, `docs/testing.md`, `docs/performance.md`, `docs/provenance.md` (script names), `docs/git-actions.md` (the command palette label of the walkthrough command).                                                                                                                                           |

The l10n tooling does not read the manifest itself: `scripts/check-l10n.js` compares
`package.nls.<locale>.json` with `package.nls.json` only. Nothing checks automatically that every
`%key%` in the manifest exists in `package.nls.json`; a missing key shows as the raw `%key%` text
in VS Code. §3.4 makes that a manual check.

### 1.3 How a rewrite is verified

All of the following must pass after the rewrite, with no other file changed except
`scripts/provenance-baseline.json`, `scripts/provenance-reviewed.json` and `docs/provenance.md`
as [the provenance guide](../provenance.md) describes:

1. `pnpm install --frozen-lockfile`: fails if any dependency name or range differs from
   `pnpm-lock.yaml`.
2. `pnpm run format`: the formatter imposes the layout and several orders (§3.2).
3. `pnpm run lint && pnpm run test:lint-rules`.
4. `pnpm run typecheck`.
5. `pnpm run l10n:check`.
6. `pnpm run check:release && pnpm run test:release`.
7. `pnpm run check:links`.
8. `pnpm test` (all three Vitest projects; the `extension` project holds the manifest checks) and
   `pnpm run test:coverage`.
9. `pnpm run package:vsix --out branchwise.vsix`, then
   `xvfb-run -a pnpm run test:package branchwise.vsix` (on Linux without a display): the package installs over an older build of the
   same ID, activates, ships every walkthrough file, and opens the graph, guide and walkthrough.
10. `xvfb-run -a pnpm run test:ext` and `xvfb-run -a pnpm run test:ui-harness` (the latter also
    runs on the minimum VS Code taken from `engines.vscode`).
11. `pnpm run check:provenance`, after lowering the baseline.
12. The manual checks of §3.4.

A semantic comparison is the strongest check: parse the old and new manifests and compare every
(A) value; the differences should be only in (B) entries and in (C) entries the maintainer
changed. The implementer cannot do this (they never see the old file), but the reviewer can.

Lines of the new file that match an upstream line exactly will still be counted as inherited.
Most (A) lines are bound to match, because the value and the formatter's layout are both fixed:
a setting's `"type": "boolean",`, its `"default": true,`, a `%config.…%` reference, a dependency
line, an enum value. After review, list them in `scripts/provenance-reviewed.json` under
`package.json`, naming this specification, as earlier rewrites did for exported signatures.

---

## 2. Entry by entry

Entries are numbered M1, M2, … and grouped as the manifest groups them. For each: its class, its
exact value (A) or its requirement (B), what it does today (C), and who reads it. JSON is shown
compactly here; §3.1 gives the layout the file must have. A table at the end (§2.11) counts the
entries per class.

### 2.1 Identity and Marketplace listing

**M1 `name`: (A) `"branchwise"`.** With `publisher`, it forms the extension ID
`jcfurey.branchwise`. VS Code keys the installed extension, its saved state (`globalState`,
`workspaceState`, which hold every repository's view preferences) and upgrades by that ID, so a
different ID installs a second, separate extension. `scripts/check-release.cjs` rejects any other
value (and `scripts/check-release.test.cjs` checks that it rejects the name before the rename,
`neo-git-graph`). `vsce` names the package `branchwise-<version>.vsix`, which `README.md`,
`docs/packaging.md` and `scripts/test-package.cjs` rely on. The running manifest's `name` also
builds the walkthrough ID in `src/extension/handlers/onboarding.ts`, and `.vscode-test.mjs` and
`scripts/test-package.cjs` pass `publisher.name` to the tests as `NGG_EXTENSION_ID`.

**M2 `displayName`: (A) `"Branchwise"`.** The name in the Extensions view and on the Marketplace.
A plain string, not a `%…%` reference: the product name is not translated. `scripts/test-package.cjs`
copies it into its fixture. It must equal the product name used elsewhere: the panel title and
status bar item (`EXTENSION_NAME` in `src/extension/constants.ts`), the command category (M75a–M75e),
and the Settings section title (M84).

**M3 `version`: (A) `"0.9.7"`.** A rewrite is not a release, so the version stays. It must be a
plain `major.minor.patch` (`scripts/check-release.cjs`), and `CHANGELOG.md` must have a dated
`## [0.9.7] - …` heading and `README.md` and `docs/packaging.md` must name `branchwise-0.9.7.vsix`
(`pnpm run check:release`). Publishing reads it with `node -p` to choose the tag `v0.9.7`, and the
package smoke test compares the installed extension's version with it.

**M4 `description`: (A) `"%description%"`.** The key into `package.nls*.json`. `vsce` resolves it
for the Marketplace; VS Code resolves it per display language.

**M5 `categories`: (B).** Requirement: Marketplace categories for the listing, each taken from the
Marketplace's fixed list of category names (any other name is not a category), describing a tool
for source control that visualises history. The formatter sorts the list (§3.2). Nothing in the
repository reads it.

**M6 `keywords`: (B).** Requirement: a short list of lowercase search terms by which someone
looking for a Git history or branch graph in the Marketplace finds Branchwise. `vsce` publishes
them as tags. The formatter sorts the list (§3.2). Nothing in the repository reads it.

**M7 `homepage`: (B).** Requirement: the Marketplace's project link, pointing at the project's
page, today `"https://github.com/jcfurey/neo-git-graph"`. If absent, `vsce` derives the
repository's README link from M11 instead. See manifest Q4.

**M8 `bugs`: (B).** Requirement: the Marketplace's issue link, an object whose `url` is the project's
issue tracker, today `"https://github.com/jcfurey/neo-git-graph/issues"`, which is also where
`README.md` sends bug reports. If absent, `vsce` derives the same link from M11. See manifest Q4.

**M9 `license`: (A) `"MIT"`.** The SPDX identifier of the licence in `LICENSE`; any other value
misstates the licence. `vsce` packages the `LICENSE` file whatever this says, unless the value has
the form `SEE LICENSE IN <file>`, which would change which file it looks for; do not use that
form.

**M10 `contributors`: (C).** Today: a list of two people, each an object with `name` and `url`:
the author of Git Graph (mhutchie) and the author of asispts/neo-git-graph (asispts), with their
GitHub profile URLs. Nothing in the repository reads it, `vsce` does not put it in the package's
Marketplace metadata, and VS Code does not show it. `docs/packaging.md` asks that the upstream
credits be kept here when metadata changes. The MIT licence requires the copyright notices, which
`LICENSE` keeps; it does not require credits in the manifest. Removing the field changes no
behaviour, only that instruction in `docs/packaging.md`. Keeping it means writing the two
upstream names and URLs again, lines that will match upstream exactly and must be listed as
reviewed. See manifest Q1.

**M11 `repository.url`: (A) `"https://github.com/jcfurey/neo-git-graph.git"`.** `vsce` turns
every relative link and image in `README.md` and `CHANGELOG.md` into a link to
`https://github.com/jcfurey/neo-git-graph/blob/HEAD/…` (or `/raw/HEAD/…` for images), and refuses
to package when it cannot find a GitHub or GitLab repository here, because the README has relative
links; `scripts/markdown-links.cjs` relies on that rewriting to exempt the README and changelog.
The Marketplace shows it as the source link. `scripts/test-package.cjs` copies the whole
`repository` value into its fixture. Any URL naming the same GitHub repository would do for
`vsce` (it strips `.git`), but this is the project's canonical clone URL, and `README.md` gives
the same one to `git clone`. See manifest Q4.

**M12 `repository.type`: (B).** Requirement: the npm-style repository object declares which kind of
version control the URL is. `vsce` ignores it. The formatter puts it before `url` (§3.2).

**M13 `publisher`: (A) `"jcfurey"`.** The Marketplace and Open VSX publisher ID, and the first half
of the extension ID (see M1). `scripts/check-release.cjs` rejects any other value (its test checks
that `asispts` is rejected). The publish workflow reads it with `node -p` to verify both
registries' tokens, and the `release` environment holds tokens for this publisher only.

**M14 `icon`: (A) `"resources/icon.png"`.** The Marketplace and Extensions view icon. The file must
exist and be packaged (`.vscodeignore` includes exactly this file; `scripts/package-smoke.cjs`
checks it is installed); `vsce` rejects an SVG icon. `README.md` shows the same image.

### 2.2 Runtime entry points

**M15 `main`: (A) `"./out/extension.js"`.** The bundle `esbuild.js` writes from `src/main.ts`.
`.vscodeignore` packages `out/`, and `scripts/package-smoke.cjs` checks that `out/extension.js`
is installed. `vsce` requires `activationEvents` (M17) whenever `main` is present.

**M16 `l10n`: (A) `"./l10n"`.** The folder where VS Code looks for `bundle.l10n.<locale>.json` to
translate `vscode.l10n.t` strings in the extension host. `pnpm run l10n:export` writes
`l10n/bundle.l10n.json` there; `.vscodeignore` packages the folder; the package smoke test checks
the three bundles are installed. `src/main.ts` passes VS Code's loaded bundle on to
`@vscode/l10n` for the backend's messages.

**M17 `activationEvents`: (A) `["onStartupFinished"]`.** The extension activates in every window
once start-up has finished, whether or not the user runs a command. Activation shows the Branchwise
status bar button (which the first walkthrough step points to), copies settings saved under the
old `neo-git-graph.` names (`src/extension/migrate-settings.ts`, which `.vscode-test.mjs` and
`tests-ext/extension.test.ts` exercise by saving one such setting before VS Code starts), and
removes the old avatar cache. The commands need no activation event of their own, because VS Code
1.74 and later activate an extension for its contributed commands. Do not use `"*"`: `vsce` asks
for confirmation of star activation.

**M18 `engines`: (A) `{"vscode": "^1.125.0"}`.** The oldest VS Code Branchwise supports. It must
keep the form `^X.Y.Z`: `.vscode-test.mjs` takes the minimum version from exactly that form to run
the minimum-version UI check (`NGG_VSCODE_VERSION=minimum`, `pnpm run test:ui-harness`) and throws
on any other form. `vsce` rejects an `@types/vscode` range whose major and minor are newer than
this (M58). `README.md` states the same minimum, and `scripts/test-package.cjs` copies `engines`
into both of its fixtures. No `node` engine is declared.

**M19 `capabilities.virtualWorkspaces`: (A) `{"supported": false, "description":
"%capabilities.virtualWorkspaces%"}`.** Branchwise runs Git on local files, which a virtual
workspace lacks, so VS Code disables it there and shows the description.
`tests/extension/activation.test.ts` checks `supported` is `false`.

**M20 `capabilities.untrustedWorkspaces`: (A) `{"supported": false, "description":
"%capabilities.untrustedWorkspaces%"}`.** Git can run programs a repository's configuration names,
so VS Code disables Branchwise until the workspace is trusted, and shows the description.
Checked by the same test. (The VS Code tests start with `--disable-workspace-trust`.)

**M21 `packageManager`: (A) `"pnpm@11.15.1"`.** Corepack installs this pnpm, and pnpm itself runs
this version when a different one is invoked. `README.md` names pnpm 11.15.1 as "pinned in
`package.json`", and `docs/packaging.md` and `docs/testing.md` point here. The CI workflows set
up pnpm without naming a version of their own. The lockfile format follows this pnpm.

### 2.3 Scripts

A script's **name** is (A) when anything outside the manifest runs it by name, and (B) when only
other scripts do. A script's **body** is always a choice, stated here as a requirement; where the
current body is Branchwise's own it is quoted as the model. General requirements for every body:

- `pnpm test`, `pnpm run test:ext` and the scripts they call (`compile`, `clean`, `compile-tests`)
  run on the Windows and macOS CI runners, where pnpm runs scripts with `cmd.exe` and `sh`
  respectively. Their bodies may use only what both shells understand: commands joined with `&&`,
  double quotes for arguments, and Node one-liners in double quotes for file operations (no `rm`,
  no single-quoted arguments, no environment-variable syntax). Keep every script portable in the
  same way.
- Tools are invoked by their `node_modules/.bin` names, which pnpm puts on `PATH` (`tsc`, `vitest`,
  `vsce`, `vscode-test`, `oxfmt`, `oxlint`, `vscode-l10n-dev`, `tsc-alias`), or as
  `node <file>`.
- Where callers pass extra arguments (`pnpm run package:vsix --out branchwise.vsix`,
  `pnpm run check:release v0.9.7`, `pnpm run test:package branchwise.vsix`,
  `pnpm run provenance --lines <file>`, `pnpm run provenance --update`), pnpm appends them to the
  body, so the command that must receive them has to come last.

| #   | Name                | Class | Run by (outside the manifest)                                                                                                                 | Body requirement                                                                                                                                                                                                                                                                                                                       |
| --- | ------------------- | ----- | --------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M22 | `typecheck`         | A     | CI lint job; `.vscode/tasks.json`; `docs/testing.md`; `package`                                                                               | Type-check, without writing output, each of the five TypeScript projects: the root `tsconfig.json`, `src/webview`, `tests`, `tests/webview` and `tests-ext`. The first four do not emit by configuration; `tests-ext/tsconfig.json` does (for `compile-tests`), so its check must suppress output explicitly. Fail on the first error. |
| M23 | `vscode:prepublish` | A     | `vsce`, which runs it with `npm run` before packaging                                                                                         | Remove the previous build output (`clean`), then run the full production build with its checks (`package`). The name is `vsce`'s hook and must be exactly this.                                                                                                                                                                        |
| M24 | `package`           | B     | only `vscode:prepublish`                                                                                                                      | Type-check (`typecheck`), lint (`lint`), then build the extension and webview with `esbuild.js` in its production mode (its `--production` flag: minified, no source maps), stopping at the first failure.                                                                                                                             |
| M25 | `package:vsix`      | A     | CI (`--out branchwise.vsix`); `README.md`; `docs/packaging.md`                                                                                | Check the extension identity, then package without scanning `node_modules` (the extension is bundled), with the packaging command last so `--out` reaches it: `node scripts/check-release.cjs && vsce package --no-dependencies`.                                                                                                      |
| M26 | `check:release`     | A     | CI lint job; `docs/packaging.md` (with a tag argument)                                                                                        | `node scripts/check-release.cjs`, with the tag argument passed through.                                                                                                                                                                                                                                                                |
| M27 | `check:links`       | A     | CI lint job                                                                                                                                   | `node scripts/markdown-links.cjs`.                                                                                                                                                                                                                                                                                                     |
| M28 | `check:provenance`  | A     | CI lint job; `docs/provenance.md`                                                                                                             | `node scripts/provenance.cjs --check`.                                                                                                                                                                                                                                                                                                 |
| M29 | `provenance`        | A     | `docs/provenance.md` (with `--update`, `--lines`); `scripts/provenance.cjs` prints it                                                         | `node scripts/provenance.cjs`, arguments passed through.                                                                                                                                                                                                                                                                               |
| M30 | `test:release`      | A     | CI lint job; `docs/packaging.md`                                                                                                              | Run the Node test files of the scripts with Node's own runner: `node --test scripts/check-l10n.test.cjs scripts/check-release.test.cjs scripts/markdown-links.test.cjs scripts/provenance.test.cjs`. See manifest Q6.                                                                                                                  |
| M31 | `test:package`      | A     | CI (`branchwise.vsix`); `docs/packaging.md`                                                                                                   | `node scripts/test-package.cjs`, the VSIX path passed through.                                                                                                                                                                                                                                                                         |
| M32 | `clean`             | B     | `vscode:prepublish`, `compile`                                                                                                                | Delete the `out` folder and everything in it, succeeding when it does not exist, on every platform (a Node one-liner, see above).                                                                                                                                                                                                      |
| M33 | `clean:all`         | A     | `docs/testing.md`                                                                                                                             | Delete `out`, `tests-ext/out`, `.vscode-test`, `test-results` and every `*.vsix` file at the repository root, each only if present, on every platform. Today a Node one-liner over that list.                                                                                                                                          |
| M34 | `compile`           | A     | `.vscode/tasks.json` (default build task, run before launching the extension); `docs/testing.md`; `test:ext`                                  | `clean`, then a development build with `esbuild.js` given no flag (source maps, not minified).                                                                                                                                                                                                                                         |
| M35 | `test`              | A     | CI on all three platforms; `.vscode/tasks.json` (`pnpm test`); `docs/testing.md`                                                              | Run all three Vitest projects defined in `vitest.config.ts` (`backend`, `extension`, `webview`) once, without watching, and fail if any test fails. The project names are an interface of `vitest.config.ts` that CI also uses directly.                                                                                               |
| M36 | `test:coverage`     | A     | CI (Linux); `vitest.config.ts` comment                                                                                                        | `vitest run --project webview --coverage`: the coverage thresholds in `vitest.config.ts` apply to a webview module.                                                                                                                                                                                                                    |
| M37 | `benchmark`         | A     | CI (Linux); `docs/performance.md`; `docs/testing.md`                                                                                          | `node scripts/benchmark.mjs`.                                                                                                                                                                                                                                                                                                          |
| M38 | `benchmark:ui`      | A     | CI (Linux); `docs/performance.md`; `docs/testing.md`                                                                                          | A production build, then the UI benchmark: `node esbuild.js --production && node scripts/benchmark-ui.cjs`.                                                                                                                                                                                                                            |
| M39 | `test:ext`          | A     | CI on all three platforms; `docs/testing.md`                                                                                                  | `compile`, then `compile-tests`, then the VS Code test runner `vscode-test`, which reads `.vscode-test.mjs`.                                                                                                                                                                                                                           |
| M40 | `test:ui-harness`   | A     | CI (Linux); `docs/testing.md`                                                                                                                 | `node --test tests-ext/ui/diagnostics.unit.cjs && node esbuild.js --production && pnpm run compile-tests && node scripts/test-ui-harness.cjs`.                                                                                                                                                                                         |
| M41 | `compile-tests`     | A     | `docs/testing.md`; `test:ext`; `test:ui-harness`                                                                                              | Compile the `tests-ext` project to `tests-ext/out` with `tsc`, then rewrite the `@/…` and `@tests/…` path aliases in the emitted JavaScript with `tsc-alias`, using the same `tests-ext/tsconfig.json`, so that VS Code can load the compiled tests.                                                                                   |
| M42 | `watch:esbuild`     | A     | `.vscode/tasks.json` (with the `$esbuild-watch` problem matcher)                                                                              | Run `esbuild.js` in its watch mode (its `--watch` flag), whose start and finish messages the problem matcher recognises.                                                                                                                                                                                                               |
| M43 | `watch:tsc`         | A     | `.vscode/tasks.json` (with the `$tsc-watch` problem matcher)                                                                                  | Type-check the root project in `tsc`'s watch mode.                                                                                                                                                                                                                                                                                     |
| M44 | `format`            | A     | CI lint job; `docs/testing.md`                                                                                                                | Check, without writing, that every file the formatter covers is formatted (oxfmt with `.oxfmtrc.jsonc`), failing otherwise.                                                                                                                                                                                                            |
| M45 | `format:fix`        | B     | nothing                                                                                                                                       | Format every file the formatter covers, in place.                                                                                                                                                                                                                                                                                      |
| M46 | `lint`              | A     | CI lint job; `package`                                                                                                                        | Run oxlint over the repository with `.oxlintrc.json`, failing on errors.                                                                                                                                                                                                                                                               |
| M47 | `test:lint-rules`   | A     | CI lint job                                                                                                                                   | `node --test oxlint/webview-text.test.cjs`.                                                                                                                                                                                                                                                                                            |
| M48 | `lint:fix`          | B     | nothing                                                                                                                                       | Run oxlint and apply its automatic fixes.                                                                                                                                                                                                                                                                                              |
| M49 | `l10n:export`       | A     | `l10n:check`; named in comments of `scripts/check-l10n.js` and `src/old-extension/l10n/webviewL10n.ts`, and in [ui-wording.md](ui-wording.md) | Extract every `l10n.t` string of the source under `src` into `l10n/bundle.l10n.json` with `vscode-l10n-dev export`, then format that file with oxfmt, so that the committed bundle is exactly what a fresh export produces and passes `format`.                                                                                        |
| M50 | `l10n:check`        | A     | CI lint job                                                                                                                                   | Run `l10n:export`; fail if the regenerated `l10n/bundle.l10n.json` differs from the committed file; then run `node scripts/check-l10n.js`. Stop at the first failure.                                                                                                                                                                  |

### 2.4 `dependencies`

Every name and range is (A): `pnpm install --frozen-lockfile` fails unless each section of the
manifest names exactly the packages and range strings that the `importers` section of
`pnpm-lock.yaml` records for it, so a package may not move between `dependencies` and
`devDependencies` either. The runtime packages are bundled into `out/` by esbuild and the VSIX is
built with `--no-dependencies`, so none of them is shipped as a package; they are
`dependencies` because the code that runs in VS Code imports them.

| #   | Package           | Range      | Used by                                                                          |
| --- | ----------------- | ---------- | -------------------------------------------------------------------------------- |
| M51 | `@preact/signals` | `^2.11.1`  | The webview's state (`src/webview/**`).                                          |
| M52 | `@vscode/l10n`    | `^0.0.18`  | Translation of backend messages (`src/backend/**`), configured in `src/main.ts`. |
| M53 | `preact`          | `^10.29.8` | The webview's components (`src/webview/**`, `.tsx`).                             |
| M54 | `simple-git`      | `^3.36.0`  | The backend's Git client (`src/backend/**`).                                     |

### 2.5 `devDependencies`

All (A), for the same reason.

| #   | Package                 | Range      | Used by                                                                                                                                                                              |
| --- | ----------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| M55 | `@tailwindcss/postcss`  | `^4.3.3`   | `esbuild.js` (building the webview CSS); `tests/webview/styles.test.ts`.                                                                                                             |
| M56 | `@types/mocha`          | `^10.0.10` | `tests-ext/tsconfig.json` (`types`), for the Mocha globals of the VS Code tests.                                                                                                     |
| M57 | `@types/node`           | `~24.13.3` | Node types for every TypeScript project; the tilde keeps them on Node 24.13's types, the Node 24 line that CI and the documents use.                                                 |
| M58 | `@types/vscode`         | `~1.125.0` | The VS Code API types. Its major and minor must not exceed `engines.vscode` (M18), or `vsce` refuses to package; the tilde keeps it on 1.125.                                        |
| M59 | `@vitest/coverage-v8`   | `4.1.11`   | `pnpm run test:coverage`. An exact version, not a range, kept equal to the installed `vitest`: Vitest does not support a coverage provider of another version.                       |
| M60 | `@vscode/l10n-dev`      | `^0.0.35`  | The `vscode-l10n-dev` command in `l10n:export`.                                                                                                                                      |
| M61 | `@vscode/test-cli`      | `^0.0.15`  | The `vscode-test` command in `test:ext`; `.vscode-test.mjs` (its `defineConfig`); `scripts/test-ui-harness.cjs` and `scripts/benchmark-ui.cjs` (its `bin.mjs`).                      |
| M62 | `@vscode/test-electron` | `^3.1.0`   | `scripts/test-package.cjs` (downloading VS Code, its command line, running the smoke test).                                                                                          |
| M63 | `@vscode/vsce`          | `^3.9.2`   | The `vsce` command in `package:vsix`; `scripts/markdown-links.cjs` (`vsce ls`); `scripts/test-package.cjs` (`createVSIX`); the publish workflow (`vsce verify-pat`, `vsce publish`). |
| M64 | `esbuild`               | `^0.28.2`  | `esbuild.js`. (`pnpm-workspace.yaml` allows its install script.)                                                                                                                     |
| M65 | `eslint-plugin-import`  | `^2.32.0`  | Loaded by oxlint as a JavaScript plugin (`.oxlintrc.json` `jsPlugins`, for its import-order rule).                                                                                   |
| M66 | `jsdom`                 | `^30.0.1`  | The DOM environment of the webview tests (about 90 files select it).                                                                                                                 |
| M67 | `ovsx`                  | `^1.1.1`   | The publish workflow (`ovsx verify-pat`, `ovsx publish`).                                                                                                                            |
| M68 | `oxfmt`                 | `^0.64.0`  | `format`, `format:fix`, `l10n:export`.                                                                                                                                               |
| M69 | `oxlint`                | `^1.79.0`  | `lint`, `lint:fix`.                                                                                                                                                                  |
| M70 | `postcss`               | `^8.5.26`  | `esbuild.js`; `tests/webview/styles.test.ts`.                                                                                                                                        |
| M71 | `tailwindcss`           | `^4.3.3`   | `src/webview/styles.css` (imported through the PostCSS plugin); `tests/webview/styles.test.ts`.                                                                                      |
| M72 | `tsc-alias`             | `^1.9.2`   | `compile-tests`.                                                                                                                                                                     |
| M73 | `typescript`            | `^7.0.2`   | The `tsc` command in `typecheck`, `watch:tsc`, `compile-tests`.                                                                                                                      |
| M74 | `vitest`                | `^4.1.11`  | `test`, `test:coverage`, and the CI steps that call `vitest` directly.                                                                                                               |

### 2.6 `contributes.commands`

Each command is an object with the keys `command`, `title` and `category`, and the first also
`icon`. All five are (A). VS Code shows each in the Command Palette as `<category>: <title>`;
`docs/git-actions.md` quotes one such label ("Branchwise: Open Getting Started Walkthrough"), so
the category is the product name. `src/main.ts` and `src/old-extension/fileHistoryCommand.ts`
register the IDs; `tests/extension/activation.test.ts` expects exactly these five to be
registered; `tests-ext/extension.test.ts` checks that every command the running manifest
contributes is registered. The order of the list is free (§3.2).

| #    | `command`                      | `title`                       | `category`     | Other                                                                                                                                                                                                                                                             | Also run by                                                                                                                                                                          |
| ---- | ------------------------------ | ----------------------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| M75a | `branchwise.view`              | `%command.view%`              | `"Branchwise"` | `"icon": {"light": "resources/webview-icon-light.svg", "dark": "resources/webview-icon-dark.svg"}`: the Source Control button (M76) shows this icon, the first for light themes and the second for dark ones. Both files are packaged by name in `.vscodeignore`. | The status bar item; the first walkthrough step (its link and its completion event); the webview (`src/old-extension/messageHandler.ts`); `scripts/package-smoke.cjs`; `tests-ext/`. |
| M75b | `branchwise.fileHistory`       | `%command.fileHistory%`       | `"Branchwise"` |                                                                                                                                                                                                                                                                   | The two File History menus (M78, M81); `tests-ext/ui/history.test.cjs`.                                                                                                              |
| M75c | `branchwise.showBranches`      | `%command.showBranches%`      | `"Branchwise"` |                                                                                                                                                                                                                                                                   | The walkthrough (completion event, and the links in two step descriptions).                                                                                                          |
| M75d | `branchwise.openDocumentation` | `%command.openDocumentation%` | `"Branchwise"` |                                                                                                                                                                                                                                                                   | The webview's `docs.open` request (`src/extension/rpc/handlers.ts`); the walkthrough; `scripts/package-smoke.cjs`.                                                                   |
| M75e | `branchwise.openWalkthrough`   | `%command.openWalkthrough%`   | `"Branchwise"` |                                                                                                                                                                                                                                                                   | The webview's `walkthrough.open` request; `scripts/package-smoke.cjs`.                                                                                                               |

The commands have no `enablement` and no `commandPalette` menu entries, so all five are offered in
the Command Palette; `branchwise.fileHistory` then uses the active editor's file. Keep it so.

### 2.7 `contributes.menus`

Three menus, each holding one item with the keys `command`, `group` and `when`.

**M76 `scm/title` item: (A) for the placement: menu `scm/title`, `"command": "branchwise.view"`,
`"group": "navigation"`.** This is the Branchwise button in the title of each Git repository in
the Source Control view. VS Code passes the clicked repository's source control as the command's
first argument, which `src/main.ts` and `src/extension/view-command.ts` use to select that
repository; `README.md` and the first walkthrough step describe the button. Only the group
`navigation` puts a menu item in the title bar as an icon button (any other group moves it into
the overflow menu), and the icon comes from M75a.

**M77 its `when`: (B).** Requirement: show the button only for source controls provided by VS
Code's built-in Git extension (the provider whose ID is `git`), not for other source control
providers, whose repositories Branchwise cannot read.

**M78 `explorer/context` item: (A) for the placement: menu `explorer/context`,
`"command": "branchwise.fileHistory"`.** Right-clicking a file in the Explorer offers File History;
VS Code passes the file's URI as the first argument.

**M79 its `group`: (B).** Requirement: a named group, so that the entry sits in a section of its
own in the context menu rather than among the ungrouped entries at the end. Branchwise uses
`"git"` for both File History menus; keep the two the same.

**M80 its `when`: (B).** Requirement: offer the entry for files only, not folders, and only for
resources the command accepts, whose URI scheme is `file` or `vscode-remote`
(`src/old-extension/fileHistoryCommand.ts` rejects every other scheme with an error). Today's
condition, Branchwise's own, is
`"!explorerResourceIsFolder && (resourceScheme == file || resourceScheme == vscode-remote)"`.

**M81 `editor/title/context` item: (A) for the placement: menu `editor/title/context`,
`"command": "branchwise.fileHistory"`.** Right-clicking an editor tab offers File History for the
tab's file; VS Code passes its URI.

**M82 its `group`: (B).** As M79.

**M83 its `when`: (B).** As M80: the tab's resource has scheme `file` or `vscode-remote`. Today it
repeats M80's condition word for word. The folder test in it is an Explorer context key, and an
editor tab always shows a file, so for this menu the requirement is only the scheme test.

### 2.8 `contributes.configuration`

One object (not a list) with `title`, `type` and `properties`.

**M84 `title`: (B).** Requirement: the heading of Branchwise's section in the Settings editor, the
product name; today `"Branchwise"`, as M2.

**M85 `type`: (B).** Optional: VS Code treats the configuration as an object whether or not this
is declared, and if it is declared it must be `"object"` (VS Code warns about anything else).
Nothing in the repository reads it.

**Every setting (M86 to M97).** Each is a property of `properties` named `branchwise.<key>`. The
names, types, defaults, `enum` values, `minimum`s, item schemas, and `%…%` references are all (A).
The order of an `enum` is the order of the Settings editor's drop-down, and `enumDescriptions`
must follow it position by position; no test checks the order, but keep it as given.

- **Names.** Users' settings are stored under these names, so another name loses them. VS Code
  writes a setting with `WorkspaceConfiguration.update` only if it is declared, which
  `src/extension/migrate-settings.ts` (copying from `neo-git-graph.<key>`) and the UI tests
  (`tests-ext/ui/history.test.cjs`, `tests-ext/ui/benchmark.cjs`) rely on. The source reads the
  section `branchwise` (`src/extension/config.ts`), watches it
  (`src/extension/watchers/config.watcher.ts`), and opens the Settings editor filtered to it
  (`src/extension/handlers/open-settings.ts`). `README.md` lists every setting with its default.
- **Defaults** must equal the fallbacks in `extConfig` (`src/extension/config.ts`):
  `tests/extension/config.test.ts` compares every one.
- **Descriptions** use the keys `description`, `enumDescriptions`, and `deprecationMessage`, plain
  text, not their `markdown…` variants: the texts in `package.nls*.json` are plain text.
  `enumDescriptions` pairs with `enum` by position.
- **No other keys.** No setting declares `scope` (so each has VS Code's default, window scope,
  which lets the copy write both user and workspace settings), `order`, `tags`, `markdownDescription`,
  or `editPresentation`.

| #   | Setting                                  | Class | Declaration (exact)                                                                                                                                                                                                                                           | Also checked by                                                                                                                                                                                                                                       |
| --- | ---------------------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M86 | `branchwise.autoCenterCommitDetailsView` | A     | `type` `"boolean"`, `default` `true`, `description` `"%config.autoCenterCommitDetailsView%"`                                                                                                                                                                  | Sent to the webview (`src/extension/handlers/initialize.ts`, `WebviewConfig`).                                                                                                                                                                        |
| M87 | `branchwise.dateFormat`                  | A     | `type` `"string"`, `enum` `["Date & Time", "Date Only", "Relative"]`, `enumDescriptions` `["%config.dateFormat.dateTime%", "%config.dateFormat.dateOnly%", "%config.dateFormat.relative%"]`, `default` `"Date & Time"`, `description` `"%config.dateFormat%"` | `tests/extension/config-types.test.ts` compares the `enum` with the `DateFormat` type.                                                                                                                                                                |
| M88 | `branchwise.dateType`                    | A     | `type` `"string"`, `enum` `["Author Date", "Commit Date"]`, `enumDescriptions` `["%config.dateType.authorDate%", "%config.dateType.commitDate%"]`, `default` `"Author Date"`, `description` `"%config.dateType%"`                                             | The backend's `DateType` (`src/backend/types/git.types.ts`).                                                                                                                                                                                          |
| M89 | `branchwise.fetchAvatars`                | C     | Today: `type` `"boolean"`, `default` `false`, `description` `"%config.fetchAvatars%"`, `deprecationMessage` `"%config.fetchAvatars.deprecation%"`.                                                                                                            | See below and manifest Q3.                                                                                                                                                                                                                            |
| M90 | `branchwise.graphColours`                | A     | `type` `"array"`, `items` `{"type": "string", "description": "%config.graphColours.item%", "pattern": <see below>}`, `default` the 12 colours below in this order, `description` `"%config.graphColours%"`                                                    | `tests/extension/manifest.ts` reads the default and pattern; `config-settings.test.ts` requires 12 default colours equal to `extConfig`'s and the pattern to accept exactly what the code accepts; two further tests use the default as fixture data. |
| M91 | `branchwise.graphStyle`                  | A     | `type` `"string"`, `enum` `["rounded", "angular"]`, `enumDescriptions` `["%config.graphStyle.rounded%", "%config.graphStyle.angular%"]`, `default` `"rounded"`, `description` `"%config.graphStyle%"`                                                         | `config-types.test.ts` compares the `enum` with the `GraphStyle` type.                                                                                                                                                                                |
| M92 | `branchwise.initialLoadCommits`          | A     | `type` `"integer"`, `minimum` `1`, `default` `300`, `description` `"%config.initialLoadCommits%"`                                                                                                                                                             | `config.test.ts` checks `type` and `minimum` of the three numeric settings.                                                                                                                                                                           |
| M93 | `branchwise.loadMoreCommits`             | A     | `type` `"integer"`, `minimum` `1`, `default` `100`, `description` `"%config.loadMoreCommits%"`                                                                                                                                                                | As M92.                                                                                                                                                                                                                                               |
| M94 | `branchwise.maxDepthOfRepoSearch`        | A     | `type` `"integer"`, `minimum` `0`, `default` `0`, `description` `"%config.maxDepthOfRepoSearch%"`                                                                                                                                                             | As M92; `docs/git-actions.md` names the setting.                                                                                                                                                                                                      |
| M95 | `branchwise.showCurrentBranchByDefault`  | A     | `type` `"boolean"`, `default` `false`, `description` `"%config.showCurrentBranchByDefault%"`                                                                                                                                                                  | Sent to the webview.                                                                                                                                                                                                                                  |
| M96 | `branchwise.showUncommittedChanges`      | A     | `type` `"boolean"`, `default` `true`, `description` `"%config.showUncommittedChanges%"`                                                                                                                                                                       | `.vscode-test.mjs` saves `neo-git-graph.showUncommittedChanges` and `tests-ext/extension.test.ts` checks it is copied, which needs this declaration.                                                                                                  |
| M97 | `branchwise.tabIconColourTheme`          | A     | `type` `"string"`, `enum` `["colour", "grey"]`, `enumDescriptions` `["%config.tabIconColourTheme.colour%", "%config.tabIconColourTheme.grey%"]`, `default` `"colour"`, `description` `"%config.tabIconColourTheme%"`                                          | `src/extension/view-command.ts` picks the tab icon by it.                                                                                                                                                                                             |

**The 12 default colours of M90**, in order: `"#0085d9"`, `"#d9008f"`, `"#00d90a"`, `"#d98500"`,
`"#a300d9"`, `"#ff0000"`, `"#00d9cc"`, `"#e138e8"`, `"#85d900"`, `"#dc5b23"`, `"#6f24d6"`,
`"#ffcc00"`. They are the same list as `DEFAULT_GRAPH_COLOURS` in `src/extension/config.ts`.

**The item pattern of M90.** What is dictated is the set of strings it accepts, which must be
exactly the set that `GRAPH_COLOUR` in `src/extension/config.ts` accepts, so that the Settings
editor warns about exactly the entries the graph drops. A string is accepted when it consists of
optional whitespace, then one of the following, then optional whitespace, and nothing else:

- `#` and exactly 6 or exactly 8 hexadecimal digits, in either case;
- the letters `rgb` or `rgba` (lower case), optional whitespace, `(`, then three groups of one to
  three decimal digits separated by commas, then `)`. Whitespace is allowed after each comma and
  nowhere else inside the parentheses. (`rgba` takes three numbers too; no alpha.)

Examples: `#123456`, `#12345678`, `  #aAbBcC`, `rgb(0,0,0)`, `rgba(1, 2, 3)`, `rgb (10,20,30) ` are
accepted; `#1234567`, `#123`, `rgb(0,0,0,0)`, `rgb( 0,0,0)`, `hsl(1, 2%, 3%)`, `transparent` and the
empty string are not. The pattern is written in JSON, so every backslash of the regular expression
is doubled. VS Code evaluates it as an ECMAScript regular expression, so write one that is valid
with and without the `u` flag. Using the source of `GRAPH_COLOUR` itself satisfies all of this.

**M89 `fetchAvatars` today.** Earlier versions fetched author avatars; the feature and its code
were removed, and the setting has no effect. VS Code shows it struck through with the deprecation
text. `src/extension/migrate-settings.ts` deliberately does not copy it from the old
`neo-git-graph.` name, and `tests/extension/migrate-settings.test.ts` checks that the copied list
is every declared setting except this one, so under the `branchwise.` name it has only ever held a
value a user typed in after the rename. `README.md` lists it as having no effect. Removing the
declaration would make VS Code mark any stored `branchwise.fetchAvatars` as an unknown setting,
would drop the row from `README.md`, and would pass every test. Until the maintainer decides,
declare it as described.

### 2.9 `contributes.walkthroughs`

A list with one walkthrough. Its keys are `id`, `title`, `description` and `steps`; each step's
keys are `id`, `title`, `description`, `media` (with `markdown`), and for three steps
`completionEvents`. VS Code shows the walkthrough on the Welcome page and records each step's
completion under the step's ID.

**M98 the walkthrough: (A)** `"id": "gettingStarted"`, `"title": "%walkthrough.title%"`,
`"description": "%walkthrough.description%"`. `src/extension/handlers/onboarding.ts` opens
`<publisher>.<name>#gettingStarted`; `tests-ext/extension.test.ts` checks that the walkthrough the
command opens is one the manifest contributes.

**M99 to M104, the steps: (A)** for each step's `id` (VS Code keeps users' progress under it),
`title` and `description` references, and `media.markdown` path. Each path names a file in
`walkthroughs/`, which `.vscodeignore` packages and `scripts/package-smoke.cjs` requires to be
installed and non-empty, and whose relative links `scripts/markdown-links.cjs` checks.

| #    | `id`              | `title` / `description` keys                                                       | `media.markdown`                    |
| ---- | ----------------- | ---------------------------------------------------------------------------------- | ----------------------------------- |
| M99  | `openGraph`       | `%walkthrough.openGraph.title%`, `%walkthrough.openGraph.description%`             | `walkthroughs/open-graph.md`        |
| M100 | `readGraph`       | `%walkthrough.readGraph.title%`, `%walkthrough.readGraph.description%`             | `walkthroughs/read-graph.md`        |
| M101 | `actOnCommit`     | `%walkthrough.actOnCommit.title%`, `%walkthrough.actOnCommit.description%`         | `walkthroughs/act-on-commit.md`     |
| M102 | `branchesPane`    | `%walkthrough.branchesPane.title%`, `%walkthrough.branchesPane.description%`       | `walkthroughs/branches-pane.md`     |
| M103 | `focusAndRemotes` | `%walkthrough.focusAndRemotes.title%`, `%walkthrough.focusAndRemotes.description%` | `walkthroughs/focus-and-remotes.md` |
| M104 | `recover`         | `%walkthrough.recover.title%`, `%walkthrough.recover.description%`                 | `walkthroughs/recover.md`           |

**M105 the order of the steps: (B).** Requirement: the order a newcomer needs them in, which is
the order of the table: open the graph, read it, act on a commit, the Branches pane, branch focus
and remote visibility, then recovering from mistakes. `docs/git-actions.md` describes the steps in
this order but leaves out the fifth (see manifest Q7).

**M106 `completionEvents`: (B).** Requirement: a step that asks the user to do something is
checked off when they do it. Today, Branchwise's own choice: `openGraph` completes on
`"onCommand:branchwise.view"`, `branchesPane` on `"onCommand:branchwise.showBranches"`, and
`recover` on `"onCommand:branchwise.openDocumentation"`; the other three steps declare none, so VS
Code checks them off by its default rule (when a command link in the step is clicked, or, for a
step without one, when it is opened).

### 2.10 Fields that are absent

These are not entries, but adding any of them would change behaviour, so the rewrite must not:

- A top-level `type`: the repository's `.js` files (`esbuild.js`, `scripts/check-l10n.js`) are CommonJS;
  `"type": "module"` would break them.
- `browser`: would make Branchwise a web extension, which it cannot be (it runs Git).
- `extensionKind`: absent, so VS Code runs Branchwise where the workspace is (the remote or
  container side in remote development), which the devcontainer support relies on.
- `extensionDependencies`: the built-in Git extension is used if present
  (`src/extension/config.ts`), never required.
- `author`, `sponsor`, `private`, `preview`, `pricing`, `qna`, `badges`, `galleryBanner`,
  `files`, `workspaces`: none is declared today. `author` and `sponsor` named upstream until the
  rename (see manifest Q2).

### 2.11 Count

| Group                   | Entries   | A      | B      | C     |
| ----------------------- | --------- | ------ | ------ | ----- |
| Identity and listing    | M1–M14    | 8      | 5      | 1     |
| Runtime entry points    | M15–M21   | 7      | 0      | 0     |
| Scripts                 | M22–M50   | 25     | 4      | 0     |
| `dependencies`          | M51–M54   | 4      | 0      | 0     |
| `devDependencies`       | M55–M74   | 20     | 0      | 0     |
| Commands                | M75a–M75e | 5      | 0      | 0     |
| Menus                   | M76–M83   | 3      | 5      | 0     |
| Configuration           | M84–M97   | 11     | 2      | 1     |
| Walkthrough             | M98–M106  | 7      | 2      | 0     |
| **Total** (110 entries) |           | **90** | **18** | **2** |

## 3. Invariants

### 3.1 Layout

- Strict JSON: no comments, no trailing commas. VS Code, `vsce`, pnpm and every script parse it as
  JSON.
- The formatter decides the layout, and `pnpm run format` fails on anything else. For a file named
  `package.json`, oxfmt uses the layout of `JSON.stringify(value, null, 2)`: two-space
  indentation, every non-empty array and object spread one element per line (even a one-element
  array such as `activationEvents`), a space after each colon, and one final newline. The current
  file is exactly that, byte for byte, so writing the value with that call and one trailing
  newline, or writing it by hand and running `pnpm exec oxfmt package.json`, gives the required
  text.
- LF line endings (`.gitattributes`), ASCII only today, no tabs, no `\u` escapes.
- Every `%key%` reference is a whole string value: VS Code replaces a string only when all of it is
  `%key%`.

### 3.2 Order

Found by reversing one object or list at a time in a copy and running oxfmt on it:

| What                                                                                 | Order                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Top-level fields                                                                     | Imposed by the formatter, which restores this order from any other: `name`, `displayName`, `version`, `description`, `categories`, `keywords`, `homepage`, `bugs`, `license`, `contributors`, `repository`, `publisher`, `main`, `scripts`, `dependencies`, `devDependencies`, `l10n`, `contributes`, `activationEvents`, `icon`, `engines`, `packageManager`, `capabilities`.               |
| `categories`, `keywords`                                                             | Sorted alphabetically by the formatter.                                                                                                                                                                                                                                                                                                                                                      |
| `dependencies`, `devDependencies`                                                    | Sorted by package name by the formatter.                                                                                                                                                                                                                                                                                                                                                     |
| Keys of `repository` and of `bugs`                                                   | Put in the formatter's order (`type` before `url`; `url` before any `email`).                                                                                                                                                                                                                                                                                                                |
| `contributes.configuration.properties`                                               | Alphabetical by setting name, as in the table of §2.8. `tests/extension/migrate-settings.test.ts` requires the declared names, less `fetchAvatars`, to equal `MIGRATED_SETTINGS` in `src/extension/migrate-settings.ts` element by element, and that list is alphabetical. The Settings editor sorts settings itself (none declares `order`), so the file's order changes nothing users see. |
| `enum` / `enumDescriptions`                                                          | Position by position, as given in §2.8.                                                                                                                                                                                                                                                                                                                                                      |
| `graphColours` default                                                               | As given: lanes take the colours in this order.                                                                                                                                                                                                                                                                                                                                              |
| Walkthrough steps                                                                    | As given (M105).                                                                                                                                                                                                                                                                                                                                                                             |
| `scripts`, `contributes` keys, commands, menus, every object's keys not listed above | Free: the formatter keeps whatever order it is given, and nothing reads them in order. Group related scripts together.                                                                                                                                                                                                                                                                       |

### 3.3 Agreement with other files

The manifest must stay consistent with these, none of which the rewrite changes:

| Manifest                                                     | Must agree with                                                                                                                                  |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| The 45 `%key%` references                                    | The keys of `package.nls.json`, `package.nls.zh-cn.json` and `package.nls.zh-tw.json`: today all three hold exactly these 45 keys and no others. |
| `name`, `publisher`                                          | `scripts/check-release.cjs`; the VSIX name in `README.md` and `docs/packaging.md`; `README.md`'s extension ID.                                   |
| `version`                                                    | `CHANGELOG.md`, `README.md`, `docs/packaging.md` (`pnpm run check:release`).                                                                     |
| `displayName`, command `category`, configuration `title`     | `EXTENSION_NAME` in `src/extension/constants.ts` and the label `docs/git-actions.md` quotes.                                                     |
| `engines.vscode`                                             | `@types/vscode` (not newer in major and minor); `README.md`'s stated minimum; the `^X.Y.Z` form `.vscode-test.mjs` parses.                       |
| `packageManager`                                             | `README.md`'s pnpm version.                                                                                                                      |
| `dependencies`, `devDependencies`                            | `pnpm-lock.yaml`, section by section.                                                                                                            |
| Command IDs                                                  | `src/main.ts`, `src/old-extension/fileHistoryCommand.ts`, `tests/extension/activation.test.ts`, the command links in `package.nls*.json`.        |
| Setting names, defaults, `enum`s, `minimum`s, colour pattern | `src/extension/config.ts`, `src/extension/migrate-settings.ts`, `src/types/config.ts`, `src/backend/types/git.types.ts`, `README.md`.            |
| Walkthrough ID; step `media` paths                           | `src/extension/handlers/onboarding.ts`; the files in `walkthroughs/`.                                                                            |
| `icon`, the command's icons, `main`, `l10n`                  | The files in `resources/`, `esbuild.js`'s output, the `l10n/` folder, and `.vscodeignore`, which packages each of them by name or folder.        |
| `repository.url`                                             | The repository `README.md` tells people to clone.                                                                                                |

### 3.4 Checks to make by hand

Nothing automated covers these, so the implementer makes them before handing over:

1. **References.** Collect every string value of the form `%key%` in the new manifest and every key
   of the three `package.nls*.json` files; the sets must be equal (45 keys), and no string may
   contain a `%` otherwise.
2. **Files.** Every path the manifest names exists: `resources/icon.png`,
   `resources/webview-icon-light.svg`, `resources/webview-icon-dark.svg`, the six files in
   `walkthroughs/`, and, after `pnpm run compile`, `out/extension.js`.
3. **In VS Code.** Launch the extension (the **Run Extension** configuration) on a Git repository
   and check that: the Branchwise button with its icon is in the Source Control title; the Command
   Palette offers five commands, each `Branchwise: <title>` with a translated title (not a
   `%key%`); File History is on the context menu of a file in the Explorer and of an editor tab,
   and not of a folder; the Settings editor filtered to `branchwise` shows twelve settings with
   their descriptions and drop-down descriptions, `fetchAvatars` marked deprecated, and a warning on
   a `graphColours` entry such as `#123`; the walkthrough opens with six steps and their pages.
   Repeat the palette check with `--locale=zh-cn`.
4. **VS Code's own manifest warnings.** VS Code reports invalid contribution points in its logs,
   naming the extension ID. After `pnpm run test:ext`, the logs are under
   `test-results/vscode-logs/`; none should name `jcfurey.branchwise` with a warning about its
   manifest.

The reviewer, who may read the old file, additionally compares every (A) value of the two
manifests after parsing them.

## 4. Questions for the maintainer

Each question states the current behaviour; this document decides none of them. Until they are
answered, the implementer writes the entry as §2 describes it, which keeps today's behaviour.

**manifest Q1. Upstream credits in `contributors` (M10).** Today the manifest credits the authors
of Git Graph and of asispts/neo-git-graph, by name and GitHub profile URL, and `docs/packaging.md`
asks that these credits be kept here. Nothing reads the field, and neither the Marketplace nor VS
Code shows it. `LICENSE` carries both copyright notices, as the MIT licence requires, and
`README.md`'s "Origins and license" section credits both projects. Keep the field (its lines will
match upstream and must be listed as reviewed), or remove it and change `docs/packaging.md`?

**manifest Q2. `author` and `sponsor`.** Neither field exists today; according to the 0.9.7
changelog entry, the rename removed the upstream author and sponsor from the manifest. Should they
stay absent, or should `author` name Branchwise's maintainer? A `sponsor` field would show a
sponsor button on the Marketplace and add a sponsor tag.

**manifest Q3. The deprecated `fetchAvatars` setting (M89).** It has no effect, is shown
struck through, is deliberately not copied from the old name, and is listed in `README.md` as
having no effect; its deprecation text says it may be removed in a later release. Under the
`branchwise.` name it can only hold a value typed in by hand since the rename. Keep declaring it,
or remove it, with its two keys in each `package.nls*.json` file and its `README.md` row? (The
tests would still pass; the exemption for it in `src/extension/migrate-settings.ts` and its test
would then exempt nothing.)

**manifest Q4. The repository links (M7, M8, M11).** `homepage`, `bugs.url` and `repository.url`
name the GitHub repository `jcfurey/neo-git-graph`, whose name is the upstream project's.
[docs/provenance.md](../provenance.md) plans a move to a new repository once no inherited code is
left. The rewrite keeps today's URLs. When the move happens, these three, `README.md`'s clone
instructions and its links change together. Separately: `homepage` and `bugs` repeat what `vsce`
would derive from `repository` (the derived homepage ends in `#readme`); keep them explicit, or
let `vsce` derive them?

**manifest Q5. Checking the `%key%` references.** `scripts/check-l10n.js` compares the translated
`package.nls.<locale>.json` files with `package.nls.json`, but nothing compares the manifest's
references with `package.nls.json`; a missing key shows the raw `%key%` in VS Code, and an unused
key goes unnoticed. §3.4 makes it a manual check. Should the l10n check or a unit test cover it?

**manifest Q6. `test:release` names its test files (M30).** It runs the four `scripts/*.test.cjs`
files listed by name, so a fifth script test would not run in CI until added to the list. Keep the
explicit list, or select every `scripts/*.test.cjs`?

**manifest Q7. The walkthrough in `docs/git-actions.md` (M105).** The guide says the walkthrough
has five steps and lists them, but the manifest contributes six: the step on branch focus and
remote visibility is missing from the guide. The guide is outside this rewrite; should it be
corrected separately?

**manifest Q8. A keyword that names the upstream product (M6).** One of today's search keywords is
the name of the product Branchwise was forked from. It is a common search term for this kind of
tool, but it is also the upstream name. Should M6's requirement exclude upstream product names?
