# Clean-room specification: discovery and extension tests

This document states what six test files check, so that they can be deleted and written again by
someone who never sees them or their history. It describes behaviour and data: the product code
each file exercises, the fixtures it builds, every scenario with its expected outcome, and how the
files are run. It does not reproduce their code, their test names or their comments, and it does
not follow their layout. The one exception is the shared `vscode` stand-in (section 2), whose
exported names and shapes are an interface other tests depend on.

| Section | File                                       | Kind                                |
| ------- | ------------------------------------------ | ----------------------------------- |
| 2       | `tests/extension/__mocks__/vscode.ts`      | shared `vscode` stand-in for Vitest |
| 3.A     | `tests/backend/utils/repoSearch.test.ts`   | Vitest, `backend` project, real Git |
| 3.B     | `tests/backend/queries/repoSearch.test.ts` | Vitest, `backend` project, real Git |
| 3.C     | `tests/extension/webviewBridge.test.ts`    | Vitest, `extension` project, fakes  |
| 3.D     | `tests-ext/extension.test.ts`              | Mocha inside a real VS Code         |
| 3.E     | `tests-ext/repoManager.test.ts`            | Mocha inside a real VS Code         |

Questions for the maintainer are numbered `tests-d Q1`, `tests-d Q2`, … (section 6).

---

## 0. How the behaviour was observed

- Worktree at commit `c1c8e2f`, Linux x64, Node v22.22.2, pnpm 11.15.1, Vitest 4.1.11, Git 2.55.0
  first in `PATH`.
- The three Vitest files were run with the repository's own configuration:
  `pnpm exec vitest run --project backend <file>` and `--project extension`. All pass (counts in
  1.1).
- Coverage was taken with a Vitest configuration kept outside the repository (same aliases and
  setup file as `vitest.config.ts`, V8 provider, cache and reports in a scratch folder), once per
  file alone and once for the rest of each project without these files, to find what only these
  files execute (section 4).
- How the other extension tests use the shared stand-in was recorded by aliasing `vscode` to an
  instrumented copy (same exports, each member access and call logged with the test file) and
  running the whole `extension` project (64 files, 673 tests, all passing). A second run added
  logging stand-ins for every other top-level `vscode` name the product code uses, to prove none
  is read.
- `xvfb-run -a pnpm run test:ext` was run once. It downloaded VS Code 1.139.1 (stable) into
  `.vscode-test/`, and all 42 tests passed in about three minutes, including the 5 of 3.D and the
  3 of 3.E.
- Further facts were recorded with throw-away tests in a scratch folder: the exact results of the
  repository searches on the fixture of 3.A/3.B, the watcher's mute boundary, the bridge's
  failure log, and, in a separately launched VS Code 1.139.1, how the commands that 3.D runs
  settle. All scratch files and build output were deleted afterwards. No repository file other
  than this document was changed.

---

## 1. Scope and rules

### 1.1 The files

| File                                       | Inherited lines (`pnpm run provenance --lines`) | Tests today | Result |
| ------------------------------------------ | ----------------------------------------------- | ----------- | ------ |
| `tests/backend/utils/repoSearch.test.ts`   | 61                                              | 9           | pass   |
| `tests/backend/queries/repoSearch.test.ts` | 48                                              | 9           | pass   |
| `tests/extension/webviewBridge.test.ts`    | 22                                              | 6           | pass   |
| `tests/extension/__mocks__/vscode.ts`      | 12 (every non-blank line)                       | —           | —      |
| `tests-ext/extension.test.ts`              | 33                                              | 5           | pass   |
| `tests-ext/repoManager.test.ts`            | 26                                              | 3           | pass   |

Each file is deleted and written again **whole, at the same path**. The implementer works from
this document alone; they do not open the old files, their history, or build output that contains
them (`tests-ext/out/`). The rewrite may split or merge scenarios into a different number of
tests, provided every check in section 3 is still made with at least the strength stated there
(exact where this document says exact).

### 1.2 How the Vitest files run

`vitest.config.ts` defines three projects. Two matter here.

| Project     | Collects                       | Setup file            | Timeouts                        | Aliases                                                                                                     |
| ----------- | ------------------------------ | --------------------- | ------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `backend`   | `tests/backend/**/*.test.ts`   | `tests/git-config.ts` | test and hook timeout 30 000 ms | `@/…` → `src/…`, `@tests/…` → `tests/…`                                                                     |
| `extension` | `tests/extension/**/*.test.ts` | `tests/git-config.ts` | Vitest default (5 000 ms)       | the same two, plus the bare specifier `vscode` → the absolute path of `tests/extension/__mocks__/vscode.ts` |

- **Globals are off.** Test functions (`describe`, `it`, `expect`, `vi`, hooks) are imported from
  `vitest`.
- **Git configuration.** `tests/git-config.ts` runs before each test file. It sets
  `GIT_CONFIG_GLOBAL` to `tests/fixtures/gitconfig` (user `Test` / `test@example.invalid`, default
  branch `main`, commit and tag signing off, automatic maintenance off) and `GIT_CONFIG_NOSYSTEM=1`,
  so neither the developer's nor the system's Git settings apply. With `NGG_HOSTILE_GIT_CONFIG=1`
  it uses `tests/fixtures/hostile.gitconfig` instead, which includes the normal file and adds
  settings that change Git's output (colour always, `log.showSignature`, `format.pretty=oneline`,
  `core.quotePath`, short status, sorted branches and tags, columns).
- **Commands.** `pnpm test` runs `vitest run --project backend`, then `--project extension`, then
  `--project webview`. One file: `pnpm exec vitest run --project backend <path>`.
- **Extra CI runs on Linux** that the new files must survive:
  - the `backend` project with `--sequence.shuffle`, which randomises file order and test order
    within a file, so no test may depend on another having run first;
  - the `backend` and `extension` projects with `NGG_HOSTILE_GIT_CONFIG=1` and a German locale
    (`LANG`/`LC_ALL=de_DE.UTF-8`, `LANGUAGE=de`), so no check may depend on Git's English messages
    or on its default output format.
- **Type checking.** `pnpm run typecheck` runs `tsc -p tests`, whose `tests/tsconfig.json`
  includes `tests/backend/**/*.ts` and `tests/extension/**/*.ts` (so the stand-in too) under the
  root settings: `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
  `noUnusedLocals`, `noUnusedParameters` (a parameter may be unused only if its name starts with
  `_`), `verbatimModuleSyntax` and `isolatedModules` (type-only imports written `import type`),
  `noUncheckedSideEffectImports`, target and library `esnext`, and the types of `node` and
  `vscode`. A type written as `import("vscode").X` resolves to `@types/vscode`, never to the
  stand-in.

### 1.3 How the `tests-ext` files run

`pnpm run test:ext` runs three steps in order:

1. `pnpm run compile`: deletes `out/`, then `node esbuild.js` bundles the extension from
   `src/main.ts` into `out/extension.js`, the `main` of `package.json`.
2. `pnpm run compile-tests`: `tsc -p tests-ext/tsconfig.json`, then
   `tsc-alias -p tests-ext/tsconfig.json`.
   - `tests-ext/tsconfig.json` extends the root `tsconfig.json` (and so the strict base settings
     above), with `module: node18`, `moduleResolution: node16`, emitting enabled, `rootDir` the
     repository root, `outDir` `tests-ext/out`, `verbatimModuleSyntax: false`, types `node`,
     `vscode` and `mocha`, and it includes every `.ts` file below `tests-ext/`.
   - Output mirrors the repository: the tests land in `tests-ext/out/tests-ext/*.test.js`, and
     every `src/` module they import is compiled again, as CommonJS, into `tests-ext/out/src/…`.
     `tsc-alias` rewrites `@/…` and `@tests/…` into relative `require` paths. A test file
     therefore runs against this **tsc-compiled CommonJS copy** of the product modules it imports,
     not against the esbuild bundle; only the `vscode` API calls go to the bundled extension.
   - Because the output is CommonJS, the files may not use top-level `await` or `import.meta`.
     With `verbatimModuleSyntax` off, an import used only as a type is dropped from the output.
   - `pnpm run typecheck` also runs `tsc -p tests-ext --noEmit`.
3. `vscode-test` (from `@vscode/test-cli`), which reads `.vscode-test.mjs` at the repository root.

What `.vscode-test.mjs` sets up, per invocation:

- **Test files:** the globs `tests-ext/out/**/*.test.js` and `tests-ext/ui/**/*.test.cjs`, expanded
  by `glob` with no sorting. The order between files is not guaranteed (observed:
  `repoManager`, the two history-document files, `gitActions`, `extension`, then the UI harness).
  Each file must work whatever runs before it in the same VS Code window.
- **Mocha:** the runner creates Mocha with the `tdd` interface, so the globals are `suite`, `test`,
  `suiteSetup`, `setup`, `teardown` and `suiteTeardown`. The configured timeout is 30 000 ms per
  test and hook.
- **VS Code version:** `stable` unless `NGG_VSCODE_VERSION` says otherwise; `minimum` means the
  version in `engines.vscode` (`^1.125.0` → 1.125.0). `NGG_VSCODE_PATH` points at an installed
  executable instead of downloading. Downloads go to `.vscode-test/` (git-ignored).
- **Disposable run folder:** a new temporary folder (under the OS temporary directory; `/tmp` on
  macOS, because VS Code's IPC socket path must stay under about 103 bytes) holding:
  - `workspace/`, created with `git init -b main` and nothing else: an empty repository with no
    commits. It is the one workspace folder of the window.
  - `user-data/User/settings.json` containing one user setting under the extension's name before
    the rename: `neo-git-graph.showUncommittedChanges` set to `true` (the declared default of that
    setting, so no other test sees a difference). 3.D checks that activation copies it.
  - `extensions/`, an empty extensions folder.
  - The folder is deleted when the runner process exits.
- **Launch arguments:** `--disable-gpu`, `--skip-welcome`, `--skip-release-notes`,
  `--disable-workspace-trust` (the manifest does not support untrusted workspaces), `--locale=en`,
  the user-data, extensions and logs folders, a free local port for `--remote-debugging-port`,
  and `--ozone-platform=headless` when `NGG_HEADLESS=1`.
- **Environment of the extension host:** `GIT_CONFIG_GLOBAL` = `tests/fixtures/gitconfig`,
  `GIT_CONFIG_NOSYSTEM=1`, `NGG_CDP_PORT`, `NGG_ARTIFACTS` (default `test-results/`),
  `NGG_VSCODE_LOGS`, `NGG_MINIMUM_VSCODE_VERSION`, `NGG_EXPECTED_VSCODE_VERSION`, and
  **`NGG_EXTENSION_ID`** = `<publisher>.<name>` from `package.json`, today `jcfurey.branchwise`.
- **Extension under test:** the extension development path is the folder of the configuration
  file, the repository root, so VS Code loads `out/extension.js` through `package.json`. The
  manifest activates on `onStartupFinished`. In a probe run the extension was **not yet active**
  when the test code started, so a test that needs it must activate it explicitly.
- **Display:** on Linux without a display, run `xvfb-run -a pnpm run test:ext`, or set
  `NGG_HEADLESS=1`. CI runs it under `xvfb-run -a` on Linux (and nightly against Insiders with
  `NGG_VSCODE_VERSION=insiders`), and directly on Windows and macOS.
- **Artefacts:** `test-results/` receives `run.json` (actual and requested VS Code version,
  platform, Node of the extension host, log folder), VS Code's logs and the UI harness's
  screenshots. `pnpm run clean:all` removes `out/`, `tests-ext/out/`, `.vscode-test/`,
  `test-results/` and packaged `.vsix` files.
- **One scenario:** after compiling, `pnpm exec vscode-test --grep '<title words>' --bail`
  (see `docs/testing.md`). Test titles are therefore free text, but should stay unique enough to
  select.

### 1.4 What the new files must keep, so nothing else breaks

- **Paths and names.** The five test files keep their paths and the `.test.ts` suffix (that is how
  both runners find them). The stand-in keeps its path and must **not** gain a `.test.` in its
  name.
- **The stand-in's interface** (section 2), unchanged, including the three export names, the
  member names and the behaviour of `workspace.getConfiguration`.
- **The fixture link in `.vscode-test.mjs`.** That file (not being rewritten) writes the legacy
  setting and names `tests-ext/extension.test.ts` as the test that checks its copy. The copy check
  (3.D, check D4) must stay in that file.
- **Lint** (`pnpm run lint`, oxlint with `.oxlintrc.json`):
  - import groups in this order, separated by blank lines and alphabetised case-insensitively
    within a group: Node built-ins (always with the `node:` prefix), packages (`vitest`, `vscode`),
    then `@/…` imports, then `@tests/…` imports;
  - braces around every `if` body;
  - `await` inside a loop is an error (`no-await-in-loop`). A polling loop needs either a form
    without `await` in a loop body or a line-level disable comment for that rule;
  - unused variables and parameters are errors unless their names start with `_`;
  - `tests-ext/**` files get the Mocha globals; Vitest files do not.
- **Format** (`pnpm run format`, oxfmt): width 100, two-space indent, no trailing commas.
- **Provenance.** After the rewrite, `pnpm run provenance --update` lowers the entries of these six
  files in `scripts/provenance-baseline.json` (today 61, 48, 22, 12, 33 and 26). Lines of the
  stand-in that must match its fixed interface (for example an export line), or a generic line
  such as a `git init` argument list, may coincide with the old text; such lines are reviewed and
  listed in `scripts/provenance-reviewed.json` as `docs/provenance.md` describes.
- **References elsewhere.** These paths are cited, with what they check, by
  `docs/clean-room/backend-queries.md` (B.6, C.6), `backend-actions.md`, `extension-watchers.md`
  (E6), `legacy-host.md` (B, and §0.2 for the stand-in), `rpc-notify.md`, `rpc-handler.md` and
  `extension-core.md` (§0.2). Keeping every check in section 3 keeps those "already checked" lists
  true.
- **Environment assumptions the current tests make,** which the rewrite may keep or remove:
  - the OS temporary folder is not inside a Git work tree (otherwise every folder under it would be
    reported as that work tree);
  - the absolute path `/repo` does not exist on the machine (3.C relies on its Git-directory lookup
    failing, see 3.C.2);
  - a missing-path check in 3.A and 3.B uses a fixed absolute POSIX path under `/tmp`.
- **Clean-up.** Every temporary folder a Vitest file creates is removed after its tests, and nothing
  is written inside the repository.

---

## 2. The shared stand-in `tests/extension/__mocks__/vscode.ts`

### 2.1 How Vitest picks it up

- Only through the alias of the `extension` project (1.2): every import of the bare specifier
  `vscode`, by a test or by a product module, resolves to this file. The `backend` and `webview`
  projects have no such alias and never load it.
- The folder name `__mocks__` plays no part. No test calls `vi.mock("vscode")` without a factory
  (Vitest's automock), and no test reaches the file through `importOriginal` or
  `vi.importActual`. A test file that calls `vi.mock("vscode", factory)` or
  `vi.doMock("vscode", factory)` replaces the module entirely and never evaluates this file; 48 of
  the 64 files do.
- It is evaluated afresh in each test file that loads it (Vitest isolates files), so state kept in
  it would not leak between files, but it keeps none.
- It is type-checked by `tsc -p tests` (1.2) as ordinary source. It imports nothing.
- `tests/extension/__mocks__/` holds only this file, and the file is not a test.

### 2.2 Exported interface

Exactly three named exports, all `const`, no default export, no other exports. Every member is a
plain property of a plain object literal (own, enumerable, writable, configurable), which is what
lets a test replace one with `vi.spyOn`.

| Export      | Member                        | Shape and behaviour                                                                                                                                                                                                                                  |
| ----------- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `workspace` | `getConfiguration`            | A function that ignores its arguments (any section, any scope) and returns an object with one member, `get(key, defaultValue)`, which ignores `key` and returns `defaultValue` unchanged (the same reference; `undefined` when only a key is given). |
|             | `workspaceFolders`            | The value `undefined`.                                                                                                                                                                                                                               |
|             | `createFileSystemWatcher`     | A function that ignores its arguments and returns an object with exactly `onDidCreate` (a function returning `{ dispose }` with a no-op `dispose`) and `dispose` (a no-op). It has **no** `onDidChange` or `onDidDelete`.                            |
|             | `onDidChangeWorkspaceFolders` | A function that ignores its arguments and returns `{ dispose }` with a no-op `dispose`.                                                                                                                                                              |
|             | `onDidChangeConfiguration`    | The same as `onDidChangeWorkspaceFolders`.                                                                                                                                                                                                           |
| `commands`  | `registerCommand`             | A function that ignores its arguments and returns `{ dispose }` with a no-op `dispose`.                                                                                                                                                              |
| `window`    | `showErrorMessage`            | A function that ignores its arguments and returns a promise that resolves to `undefined`.                                                                                                                                                            |

No member records calls, keeps state or has side effects, and evaluating the module does nothing
else. Everything the real API offers beyond this table is absent: in particular `l10n`, `Uri`,
`Disposable`, `EventEmitter`, `RelativePattern`, `ViewColumn`, `StatusBarAlignment`,
`ConfigurationTarget`, `env` and `extensions` are not exported, so reading them through a
namespace import gives `undefined` (and calling, say, `vscode.l10n.t` throws a `TypeError`).
`workspace` has no other members, `commands` none but `registerCommand`, and `window` none but
`showErrorMessage`. No type annotations are needed; with `noUnusedParameters`, an ignored
parameter that is declared at all must start with `_`.

### 2.3 Who relies on it, and on what

Observed by running the whole `extension` project against an instrumented copy (section 0).

| Test file (outside this group)                                                                                                                                        | Loads the stand-in                                                  | Members it touches                                                                                                         |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `tests/extension/config.test.ts`                                                                                                                                      | directly and through `@/extension/config`                           | `workspace.getConfiguration` only; see below.                                                                              |
| `graph-queries.test.ts`, `legacy-types.test.ts`, `message-echoes.test.ts`, `query-cancellation.test.ts`, `remote-preferences.test.ts`, `view-preferences.test.ts`     | through `@/old-extension/messageHandler` and the modules it imports | None. They need the module to resolve and evaluate without error, because the product modules import `vscode` at run time. |
| `config-types`, `debounce`, `extension-state-storage`, `repo-manager`, `repo-manager-records`, `repoSelection`, `rpc-handlers`, `rpc-types`, `webview-bridge-routing` | no                                                                  | None (they import `vscode` for types only, or import no product module that loads it at run time).                         |
| the other 48 files                                                                                                                                                    | no                                                                  | They replace `vscode` with their own factory.                                                                              |

What `config.test.ts` relies on:

1. **Defaults pass through.** It reads every `branchwise.*` setting through `extConfig` and
   compares each with the default declared in `package.json`. The product calls
   `getConfiguration("branchwise").get(key, fallback)`; the stand-in must return `fallback`. The
   observed calls were `autoCenterCommitDetailsView` → `true`, `dateFormat` → `"Date & Time"`,
   `dateType` → `"Author Date"`, `graphColours` → the twelve default colours, `graphStyle` →
   `"rounded"`, `initialLoadCommits` → `300`, `loadMoreCommits` → `100`,
   `maxDepthOfRepoSearch` → `0`, `showCurrentBranchByDefault` → `false`,
   `showUncommittedChanges` → `true`, `tabIconColourTheme` → `"colour"`.
2. **A missing value is `undefined`.** `extConfig.gitPath()` calls
   `getConfiguration("git").get("path")` with no fallback and must see `undefined`, so that the
   Git path falls back to `"git"`.
3. **The function can be spied on and restored.** It imports the module as a namespace
   (`* as vscode`) and replaces `workspace.getConfiguration` with `vi.spyOn(...)` returning a
   custom `{ get }` for three numeric settings, then restores it. `workspace` must therefore be a
   plain object whose `getConfiguration` is an own, configurable, writable property holding a
   function, and restoring must bring back the original behaviour.

No test reads `workspaceFolders`, `createFileSystemWatcher`, `onDidChangeWorkspaceFolders`,
`onDidChangeConfiguration`, `commands.registerCommand` or `window.showErrorMessage` from this
stand-in today, and none reads a name it does not export (the second instrumented run logged no
such read). They are kept because the interface is to stay unchanged (see `tests-d Q1`).

Other specifications also describe this stand-in's member set as a premise for product code:
`legacy-host.md` §0.2 (only the members above; `vscode.l10n` is `undefined`), `rpc-notify.md`
(no `Disposable`; `window` has only `showErrorMessage`) and `extension-core.md` §0.2. Adding
members would not break a current test, but it would make those premises false; removing or
changing `workspace.getConfiguration` breaks `config.test.ts`.

---

## 3. The test files

Each part below gives the product code exercised, the fakes, the fixture as data, every check
(scenario, call, expected outcome, and whether the comparison is exact or partial), then timing and
platform notes. Check identifiers (A1, B1, …) are this document's own; the rewrite need not use
them or keep one test per row.

In the tables, **exact** means deep equality of the whole result, order included; **sorted** means
deep equality after sorting both sides, so order is not checked; **contains** / **lacks** mean
membership of one element only.

### 3.A `tests/backend/utils/repoSearch.test.ts`

#### 3.A.1 Product code and fakes

- **Under test:** `searchDirectoryForRepos(directory, maxDepth, gitPath, knownRepoPaths)` from
  `src/backend/utils/repoSearch.ts` (specified in `backend-queries.md`, section C). Its result is
  a list of normalised repository paths.
- **Reached through it:** `workTreeRoot` and `getSubmodulePaths` (`src/backend/utils/git.ts`),
  `createGit` (`src/backend/gitClient.ts`), `evalPromises` (`src/backend/utils/promise.ts`),
  `normalizeRepoPath` and `isRepoWithinPath` (`src/backend/utils/repoPath.ts`).
- **Also called by the test:** `normalizeRepoPath`, to write the expected paths in the same form the
  search returns (forward slashes; on Windows a lower-case drive letter).
- **Fakes:** none. Real Git (the executable name `git`, found on `PATH`) and the real file system.
  Repositories are made with the Git command line (the shared helper `git(args, cwd)` of
  `tests/backend/helpers.ts` is available for this).

#### 3.A.2 Fixture

Built once before the file's checks and deleted recursively after the last one.

| Path              | What it is                                                                                                                                                                             |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `T`               | A new folder under the OS temporary directory, replaced by its **real** path (native `realpath`, so macOS's `/var` → `/private/var` and Windows short names cannot make paths differ). |
| `T/repo-a`        | A Git repository on branch `main` with a local user name and e-mail, commit signing off, and one commit adding a file `f` with content `x`.                                            |
| `T/nested/repo-b` | A second repository of the same kind, two levels below `T`.                                                                                                                            |
| `T/not-a-repo`    | A plain folder holding one file, `readme.txt`.                                                                                                                                         |
| `T/plain`         | An empty plain folder.                                                                                                                                                                 |

`A` stands for the normalised path of `T/repo-a`, `B` for that of `T/nested/repo-b`. The commits
are not needed by the search (an empty repository has a top level too) but are part of the
fixture. The branch name plays no part in the checks (`tests/fixtures/gitconfig` makes `main` the
default anyway). On the Linux test machine `T` listed as `nested`, `not-a-repo`, `plain`,
`repo-a`.

#### 3.A.3 Checks

| #   | Start folder                                                                    | Depth | Known repositories | Expected                                | Match                                                                                                                                                    |
| --- | ------------------------------------------------------------------------------- | ----- | ------------------ | --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1  | `A`                                                                             | 0     | none               | `[A]`                                   | exact                                                                                                                                                    |
| A2  | `T/not-a-repo`                                                                  | 0     | none               | `[]`                                    | exact                                                                                                                                                    |
| A3  | an absolute path that does not exist (today a fixed name directly under `/tmp`) | 0     | none               | `[]`                                    | exact                                                                                                                                                    |
| A4  | `A`                                                                             | 0     | `[A]`              | `[]`                                    | exact: a folder equal to a known repository is skipped                                                                                                   |
| A5  | `A/src`, an empty untracked folder created for this check only                  | 0     | `[A]`              | `[]`                                    | exact: a folder inside a known repository is skipped. Without the known list the same call gives `[A]` (observed), so this isolates the known-path rule. |
| A6  | `T`                                                                             | 0     | none               | `[]`                                    | exact: `T` is not in a work tree and depth 0 does not look inside it                                                                                     |
| A7  | `T`                                                                             | 1     | none               | `[A]`                                   | exact: `B`, two levels down, is not reached; `nested`, `not-a-repo` and `plain` add nothing                                                              |
| A8  | `T`                                                                             | 2     | none               | `A` and `B`                             | sorted. Observed order `[B, A]`, the listing order of `T`.                                                                                               |
| A9  | `T`                                                                             | 2     | none               | no entry contains the substring `/.git` | a predicate over all entries. Given A8, it cannot fail on its own on this fixture.                                                                       |

The Git executable is `git` in every call. In A5 the extra folder is removed when the check ends,
whether it passes or fails, so the fixture is unchanged for the other checks (they may run in any
order, 1.2).

#### 3.A.4 Timing and platform

- No waits, no fake timers. The first call that starts Git took about 0.4 s, the others 1–150 ms.
  The `backend` project's 30 s timeout applies to the fixture hooks and each check.
- The expected paths use the same normalisation as the product, so the checks hold on Windows. The
  missing-path input of A3 is a POSIX absolute path; on Windows it is relative to the current drive
  and still does not exist. The `/.git` predicate is written with a forward slash, which is right
  on every platform because results always use `/`.

### 3.B `tests/backend/queries/repoSearch.test.ts`

#### 3.B.1 Product code and fakes

- **Under test:** `findGitRepos(paths, gitPath, maxDepth)` from
  `src/backend/queries/repoSearch.ts` (specified in `backend-queries.md`, section B). Note the
  parameter order: the Git executable comes before the depth, unlike `searchDirectoryForRepos`. It
  searches every path with no known repositories, drops duplicates and sorts the rest by locale
  collation.
- **Reached through it:** the whole of 3.A.1's chain.
- **Also called by the test:** `normalizeRepoPath`, as in 3.A.
- **Fakes:** none; real Git (`git` on `PATH`) and the real file system.

#### 3.B.2 Fixture

The fixture of 3.A.2 **without** `T/not-a-repo`: `T` (real path of a new temporary folder),
`T/repo-a` (`A`), `T/nested/repo-b` (`B`) and the empty `T/plain`. Built once, deleted recursively
after the last check. Observed listing of `T`: `nested`, `plain`, `repo-a`.

#### 3.B.3 Checks

| #   | Paths                                     | Depth | Expected                   | Match                                                                                                               |
| --- | ----------------------------------------- | ----- | -------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| B1  | none (empty list)                         | 2     | `[]`                       | exact                                                                                                               |
| B2  | `[A]`                                     | 0     | `[A]`                      | exact                                                                                                               |
| B3  | `[T/plain]`                               | 0     | `[]`                       | exact                                                                                                               |
| B4  | `[a path that does not exist]` (as in A3) | 2     | `[]`                       | exact. With a depth above 0 the search tries to list the missing folder, so this covers a listing failure.          |
| B5  | `[T]`                                     | 1     | includes `A`               | contains. Observed result: exactly `[A]`.                                                                           |
| B6  | `[T]`                                     | 1     | does not include `B`       | lacks                                                                                                               |
| B7  | `[T]`                                     | 2     | includes `B`               | contains. Observed result: exactly `[B, A]`.                                                                        |
| B8  | `[A, T/nested]`                           | 1     | `A` and `B`                | sorted. `A` is found as the start folder itself, `B` one level below `T/nested`. Observed result: exactly `[B, A]`. |
| B9  | `[T]`                                     | 2     | no entry ends with `/.git` | a predicate over all entries                                                                                        |

The Git executable is `git` in every call. The observed orders in B7 and B8 are the sorted order
(`…/nested/repo-b` collates before `…/repo-a`); none of the checks asserts it.

#### 3.B.4 Timing and platform

As 3.A.4: no waits, about 0.1–0.45 s per Git-running check, 30 s timeout; expected values
normalised; the missing path is a fixed POSIX path under `/tmp`.

### 3.C `tests/extension/webviewBridge.test.ts`

This file checks two modules: the page connection that routes `{ command }` messages, and the
repository watcher's mutes, including that routed requests do not mute it.

#### 3.C.1 Product code

- `webviewBridgeFactory(webview)` from `src/old-extension/webviewBridge.ts` (specified in
  `legacy-host.md`, section B). It subscribes to the webview's messages and returns
  `{ dispose, post, onMessage }`.
- From `src/extension/watchers/git-repo.watcher.ts` (specified in `extension-watchers.md`,
  section E): `watchGitRepo()` (starts a watcher lifetime and returns an object with `dispose`),
  `selectWatchedRepo(repo, gitPath)`, `muteGitRepoWatcher(repo)` and `unmuteGitRepoWatcher(repo)`.
- Reached for real: `createGit` (its Git-directory lookup for `/repo` fails at once, because the
  folder does not exist) and `isRepoWithinPath` (the overlap test for mutes).
- The message type `RequestMessage` from `@/types` types the delivered messages.

#### 3.C.2 Fakes and per-check setup

Module replacements (each with a factory, so the real module is never loaded):

| Module                       | Replacement                                                                                                                                                                                                                                                                                |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `vscode`                     | `workspace.createFileSystemWatcher`, a spy; `RelativePattern`, a class whose constructor keeps its two arguments as the public fields `base` and `pattern`; `Disposable`, a class whose constructor keeps its argument as `dispose`. Nothing else. (The watcher reads only the first two.) |
| `@/extension/rpc/rpc-notify` | `{ rpcNotify: { notify } }` with `notify` a spy. It records the watcher's refresh notifications.                                                                                                                                                                                           |
| `@/extension/util/logger`    | `{ logger: { debug, warn } }`, both spies. The test imports `logger` to read `warn`'s calls.                                                                                                                                                                                               |

The spies are shared by the factories and the checks, so they are created before the factories run
(Vitest hoists module replacements above imports).

**Fake file-system watcher.** Every call to `createFileSystemWatcher` returns a watcher object with
`onDidCreate` and `onDidDelete` (spies that ignore their handler), `onDidChange` (keeps the handler
so the test can fire it later) and `dispose` (a spy). "Firing a change" calls the kept handler with
`{ fsPath: <"/repo" joined with "file" by the platform's path join> }`. The `on…` methods return
nothing.

**Fake webview.** An object with `onDidReceiveMessage(listener)`, a spy that keeps `listener` and
returns `{ dispose }` with `dispose` a spy, and `postMessage`, a spy. It is passed to
`webviewBridgeFactory` through a cast to `Webview`. "Delivering" a message calls the kept listener
with it and returns the listener's return value.

**Before each check:**

1. Fake timers on, with Vitest 4's default set, which fakes `setTimeout` and also
   `performance.now()`. The watcher measures quiet periods with `performance.now()`, so a rewrite
   that narrows the faked set must keep `performance`.
2. All spies' recorded calls cleared.
3. A watcher lifetime started, then `/repo` selected with the Git executable `git`. The work-tree
   watcher (base `/repo`) exists as soon as the selection returns, so a change can be fired at
   once. The Git-directory lookup then fails, which the product logs through `logger.warn`
   (observed: a message naming `/repo`, with simple-git's "directory that does not exist" error),
   and no second watcher is created, so the kept change handler stays the work tree's.

**After each check:** the lifetime is disposed (this also forgets every mute and quiet period,
which is what keeps mute state from leaking between checks), and real timers are restored.

**Two probes used by many checks** (observed: nothing at 249 ms, one notification at 250 ms):

- _Refresh expected:_ fire one change, advance the clock 250 ms, then `notify` must have been
  called **exactly once**, with exactly `("repo.updated", { path: "/repo" })`. Its calls are then
  cleared.
- _Silence expected:_ fire one change, advance 250 ms, then `notify` must not have been called.

Each probe advances the clock by 250 ms; the timelines below count that.

#### 3.C.3 Checks of the bridge

| #   | Scenario                                                                                                                                                                                                                 | Expected                                                                                                                                                                                                                                                    | Match                                                                                                                                  |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| C1  | Make a bridge on the fake webview and dispose it.                                                                                                                                                                        | The subscription's `dispose` was called.                                                                                                                                                                                                                    | exact count: once                                                                                                                      |
| C2  | Register, for `selectRepo`, an async handler that rejects with an `Error` (message `failed`). Deliver `{ command: "selectRepo", repo: "/repo" }`.                                                                        | The delivery's promise **resolves**, to `undefined`. `logger.warn` has a call whose first argument is a string containing `selectRepo` and whose second argument is that same error object (observed text: "The handler of the selectRepo message failed"). | resolution value exact; the log call partial (substring, and "has been called with", so the watcher's own warning may also be present) |
| C3  | Register, for `selectRepo`, a handler returning a promise the test settles later. Deliver the same message without waiting. Probe. Settle the handler's promise and wait for the delivery. Advance 1000 ms. Probe again. | Both probes: refresh expected. A request that is still running, or that ended 1000 ms ago, does not mute the watcher. (A mute would ignore events for 1500 ms after its end, so the second probe would fall inside it.)                                     | exact (the probe's exact-once rule)                                                                                                    |

C2 is the behaviour chosen for `bridge Q1` of `legacy-host.md`: a failing handler is logged with
its command and never turns into a rejection that nobody handles. That section's text still
describes the earlier behaviour, a rejected listener promise (see `tests-d Q2`).

#### 3.C.4 Checks of the mutes

Times are milliseconds after the unmute named `u`. The lifetime watches `/repo` throughout.

| #   | Steps and probes, in order                                                                                                                                    | What it shows                                                                                                                                             |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C4  | mute `/repo`; silence. Unmute `/repo` (`u`). Advance 1000; silence (event at `u`+1000). Advance 500; refresh (event at `u`+1750).                             | Events are ignored while the action runs and for the quiet period after it, and count again afterwards.                                                   |
| C5  | mute `/repo` twice; unmute once. Advance 2000; silence. Unmute again (`u`). Advance 1500; refresh (event at exactly `u`+1500).                                | Two overlapping actions need two unmutes; the quiet period starts at the last one. At exactly 1500 ms events count again (observed: at 1499 they do not). |
| C6  | mute `/other`; refresh. Unmute `/other`. Mute `/repo/submodule`; silence. Unmute it, advance 1500. Mute `/`; silence. Unmute it (`u`), advance 1500; refresh. | An action in an unrelated repository does not mute; one in a repository inside the watched one, or in a folder containing it, does.                       |

Only C5 executes the branch where an unmute leaves the repository still muted (section 4).

#### 3.C.5 Timing and platform

- Everything runs on the fake clock; the whole file took about 20 ms. The `extension` project's
  default 5 s timeout applies. The only real asynchrony is waiting for the delivery promises in C2
  and C3, which settle without the clock advancing.
- CI runs the file on Linux, Windows and macOS (`pnpm run test` has no platform condition). The
  fired path uses the platform's separator, while the watched base and the mute paths are
  POSIX-style strings; the watcher and `isRepoWithinPath` compare them through `node:path`, so the
  mixture is accepted.
- It relies on `/repo` not existing (3.C.2, step 3). If it did exist and were a repository, the
  lookup would add Git-directory watchers, the shared fake watcher would keep their change handler
  instead, and the probes would fire into the wrong watcher.

### 3.D `tests-ext/extension.test.ts`

#### 3.D.1 Product code

The bundled extension (`out/extension.js`, built from `src/main.ts`) running in a real VS Code,
driven only through the public `vscode` API and VS Code commands. No fakes. What it reaches:

- activation, `activate` in `src/main.ts`, which registers the commands and starts the settings
  copy in the background;
- `branchwise.view`, created by `createViewCommand` in `src/extension/view-command.ts`: the first
  run opens one webview panel titled with `EXTENSION_NAME` (`src/extension/constants.ts`,
  `Branchwise`); a later run while it is open reveals it; after it is closed, the next run opens a
  new one;
- `branchwise.showBranches` (opens the panel and asks for the branches pane),
  `branchwise.openDocumentation` and `branchwise.openWalkthrough`
  (`src/extension/handlers/onboarding.ts`), and the manifest entries they depend on (the
  commands, the walkthrough `gettingStarted`, the packaged guide `docs/git-actions.md`);
- `migrateSettings` in `src/extension/migrate-settings.ts`, which copies user settings saved under
  the `neo-git-graph` section to the `branchwise` section.

#### 3.D.2 Fixture and hooks

The file creates nothing itself. It relies on the run set up by `.vscode-test.mjs` (1.3): one
workspace folder that is an empty Git repository, the user setting
`neo-git-graph.showUncommittedChanges: true`, and `NGG_EXTENSION_ID`.

Terms used below:

- **Panel open:** some tab, in any tab group of the window, has the label exactly `Branchwise`.
- **Tab count:** the number of tabs over all tab groups.
- **Open and wait:** run `branchwise.view` with no arguments, then check "panel open" every 50 ms
  for at most 2 s. Reaching the deadline is not itself a failure; the check that follows decides.
  The wait is needed: in a probe the command's promise resolved before any tab existed, and the
  `Branchwise` tab was there 500 ms later.

Hooks:

- **Once, before the checks:** look up the extension by `NGG_EXTENSION_ID` and fail if it is not
  installed; then activate it and wait for activation to finish. (It may not be active yet:
  activation is on `onStartupFinished`, and in a probe it was still inactive when test code
  began.)
- **Before each check:** run `workbench.action.closeAllEditors`, then wait 200 ms.
- **Once, after the checks:** run `workbench.action.closeAllEditors`.

#### 3.D.3 Checks

| #   | Steps                                                                                                                                                                                                                                                                | Expected                                                                                                                                                                 | Match                                                                                  |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| D1  | Open and wait.                                                                                                                                                                                                                                                       | Panel open.                                                                                                                                                              | truthy                                                                                 |
| D2  | Open and wait; panel open. Take the tab count. Run `branchwise.view` again, wait 300 ms, take the tab count again.                                                                                                                                                   | Panel open after the first run; the two counts are equal.                                                                                                                | panel truthy; strict equality of the counts                                            |
| D3  | List all commands (`getCommands(true)`, internal ones filtered out). Run `branchwise.showBranches`, then check "panel open" every 50 ms for at most 2 s. Then run `branchwise.openWalkthrough` and wait for it, then `branchwise.openDocumentation` and wait for it. | The list includes `branchwise.showBranches`, `branchwise.openDocumentation` and `branchwise.openWalkthrough`; the panel opens; neither of the last two commands rejects. | membership, one assertion per command; panel truthy; the last two only must not reject |
| D4  | Check every 50 ms, for at most 5 s, whether `branchwise.showUncommittedChanges` has a user (global) value, read with `getConfiguration("branchwise").inspect(...)`.                                                                                                  | Its global value is `true`.                                                                                                                                              | strict equality with `true`                                                            |
| D5  | Open and wait; panel open. Run `workbench.action.closeAllEditors`, wait 200 ms. Open and wait again.                                                                                                                                                                 | Open after the first run; not open after closing; open again after the second run.                                                                                       | truthy / falsy / truthy                                                                |

Observed in the full run: all five passed, in 55 ms (D1), 353 ms (D2), 974 ms (D3), too fast for
Mocha to print a time (D4) and 329 ms (D5).

What the checks prove, from a probe in a separately launched VS Code 1.139.1:

- D4: right after activation the `branchwise` value had no global value yet, and some time later
  it had global value `true`; the `neo-git-graph` value was still in place. The polling is
  therefore needed, and the check shows a real write to the user settings.
- D3: `workbench.action.openWalkthrough` resolved for this extension's `gettingStarted`, but also
  for a step that does not exist and for an unknown extension. `markdown.showPreview` resolved for
  a file that does not exist without opening anything. So the last part of D3 shows only that the
  two commands exist and do not fail; it does not show that the walkthrough ID or the guide's path
  is valid (see section 5 and `tests-d Q4`).
- The command list also contains `branchwise.fileHistory`, which D3 does not look for.

#### 3.D.4 Timing, order and platform

- Mocha's timeout is 30 s per check and hook; the fixed waits are 200 ms (after closing editors)
  and 300 ms (D2); the polls step 50 ms up to 2 s (panel) or 5 s (setting).
- The checks share one window and one extension instance with each other and with the other
  `tests-ext` files, in an unguaranteed file order (1.3). Closing all editors before each check is
  what makes every check start without a panel; D4 depends only on activation.
- It runs wherever `pnpm run test:ext` runs: Linux under `xvfb-run -a` (or `NGG_HEADLESS=1`),
  Windows and macOS directly, VS Code stable by default, Insiders nightly, and the minimum version
  with `NGG_VSCODE_VERSION=minimum`. It uses only APIs available in the minimum (tab groups,
  `inspect`, `getCommands`).

### 3.E `tests-ext/repoManager.test.ts`

#### 3.E.1 Product code and fakes

- **Under test:** `createRepoManager(extensionState)` from `src/old-extension/repoManager.ts`
  (specified in `legacy-host.md`, section C): `setRepoState(repo, state)` and `getRepos()`.
- **Which copy runs:** the CommonJS output of `tsc` in `tests-ext/out/src/old-extension/`, loaded
  by the compiled test inside VS Code's extension host (Node of Electron; 24.20.0 in the observed
  run). The module uses no VS Code API; nothing of the running extension is involved.
- **Types:** `ExtensionState` (`src/old-extension/extensionState.ts`), `GitRepoSet` and
  `GitRepoState` (`@/types`), imported for types only; the `ExtensionState` import disappears from
  the output.
- **Fake extension state:** an object with only `getRepos()`, which returns the current stored set
  (the same object each time until a save), and `saveRepos(set)`, which replaces the stored set
  with `set` and counts the call. The stored set starts as a shallow copy of the check's initial
  set. It is handed to `createRepoManager` through a cast.

#### 3.E.2 Checks

| #   | Initial stored set                                                      | Call                                                  | Expected                                                          | Match                                |
| --- | ----------------------------------------------------------------------- | ----------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------ |
| E1  | `/ws/a` → `{ columnWidths: null }`                                      | `setRepoState("/ws/a", { columnWidths: [100, 200] })` | the stored set's `/ws/a` record is `{ columnWidths: [100, 200] }` | deep strict equality of that record  |
| E2  | `/ws/a` → `{ columnWidths: null }`                                      | `setRepoState("/ws/a", { columnWidths: [1] })`        | `saveRepos` was called once                                       | strict equality of the count, 1      |
| E3  | `/z`, `/a`, `/m` in that insertion order, each `{ columnWidths: null }` | `getRepos()`                                          | its keys, in order, are `/a`, `/m`, `/z`                          | deep strict equality of the key list |

Assertions use `node:assert` (`deepStrictEqual`, `strictEqual`). All three are synchronous and
took a few milliseconds.

#### 3.E.3 Overlap

`tests/extension/repo-manager-records.test.ts` (Vitest, not being rewritten) already checks the
same behaviours more strictly: code-unit ordering in a new object each time, keeping the given
record and saving on every call, and more. What only this file adds is that the tsc-compiled
CommonJS copy of the module loads and works inside VS Code's own Node (see `tests-d Q5`).

---

## 4. Coverage

### 4.1 Vitest files, each run alone

V8 coverage of `src/`, from running one file with the repository's aliases and setup file. Figures
are lines, statements, branches and functions covered, of the total the provider counts. Only
product files with any coverage are listed.

**3.A alone** (`tests/backend/utils/repoSearch.test.ts`, 9 tests):

| Product file                      | Lines       | Statements  | Branches  | Functions   | Not executed                                                                                     |
| --------------------------------- | ----------- | ----------- | --------- | ----------- | ------------------------------------------------------------------------------------------------ |
| `src/backend/utils/repoSearch.ts` | 87.5% 28/32 | 89.2% 33/37 | 90% 9/10  | 84.6% 11/13 | a folder that cannot be listed; an entry that is a symbolic link (both outcomes of following it) |
| `src/backend/utils/repoPath.ts`   | 80% 4/5     | 80% 4/5     | 83.3% 5/6 | 66.7% 2/3   | the Windows drive-letter lower-casing                                                            |
| `src/backend/utils/git.ts`        | 90% 9/10    | 90% 9/10    | 50% 1/2   | 100% 3/3    | the failure path of the submodule listing; the empty-output branch of the top-level lookup       |
| `src/backend/utils/promise.ts`    | 84.6% 11/13 | 84.6% 11/13 | 75% 3/4   | 100% 2/2    | a failing task; a concurrency limit below 1                                                      |
| `src/backend/gitClient.ts`        | 56.5% 13/23 | 56.5% 13/23 | 50% 2/4   | 40% 4/10    | everything but creating a client (`gitProcessOf`, `gitClientFactory`, the abort-signal branches) |

**3.B alone** (`tests/backend/queries/repoSearch.test.ts`, 9 tests):

| Product file                        | Lines       | Statements  | Branches  | Functions   | Not executed                                                                                                  |
| ----------------------------------- | ----------- | ----------- | --------- | ----------- | ------------------------------------------------------------------------------------------------------------- |
| `src/backend/queries/repoSearch.ts` | 100% 4/4    | 100% 5/5    | (none)    | 100% 3/3    | —                                                                                                             |
| `src/backend/utils/repoSearch.ts`   | 81.3% 26/32 | 81.1% 30/37 | 60% 6/10  | 76.9% 10/13 | the known-repository skip (never reached: `findGitRepos` passes none); entries that are files; symbolic links |
| `src/backend/utils/repoPath.ts`     | 40% 2/5     | 40% 2/5     | 16.7% 1/6 | 33.3% 1/3   | `isRepoWithinPath` entirely; the Windows branch                                                               |
| `src/backend/utils/git.ts`          | 90% 9/10    | 90% 9/10    | 50% 1/2   | 100% 3/3    | as in 3.A                                                                                                     |
| `src/backend/utils/promise.ts`      | 84.6% 11/13 | 84.6% 11/13 | 75% 3/4   | 100% 2/2    | as in 3.A                                                                                                     |
| `src/backend/gitClient.ts`          | 56.5% 13/23 | 56.5% 13/23 | 50% 2/4   | 40% 4/10    | as in 3.A                                                                                                     |

Together, 3.A and 3.B reach 90.6% of the lines (29/32), 91.9% of the statements (34/37), 90% of
the branches (9/10) and 84.6% of the functions (11/13) of `src/backend/utils/repoSearch.ts`; only
the symbolic-link handling is left.

**3.C alone** (`tests/extension/webviewBridge.test.ts`, 6 tests):

| Product file                                 | Lines       | Statements   | Branches    | Functions   | Not executed                                                                                                                                                                                                              |
| -------------------------------------------- | ----------- | ------------ | ----------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/old-extension/webviewBridge.ts`         | 76.2% 16/21 | 76.2% 16/21  | 66.7% 8/12  | 88.9% 8/9   | a message that is not an object or has no string `command`; a command with no handler; a handler that throws before returning a promise; `post`                                                                           |
| `src/extension/watchers/git-repo.watcher.ts` | 86.6% 84/97 | 85.4% 88/103 | 69.0% 29/42 | 80.8% 21/26 | the Git-directory rules and lock-file filter; events outside the watched folder; an unmute without a mute; a successful Git-directory lookup and the watchers it adds; a second dispose; re-selecting the same repository |
| `src/backend/utils/repoPath.ts`              | 80% 4/5     | 80% 4/5      | 83.3% 5/6   | 66.7% 2/3   | the Windows branch                                                                                                                                                                                                        |
| `src/backend/gitClient.ts`                   | 56.5% 13/23 | 56.5% 13/23  | 25% 1/4     | 40% 4/10    | everything but creating a client                                                                                                                                                                                          |

The shared stand-in (section 2) is not loaded by any of the three Vitest files.

### 4.2 What only these files execute

Comparing each file's coverage with a run of the rest of its project (all other `backend` files:
68 files, 571 tests plus 1 skipped; all other `extension` files: 63 files, 667 tests):

- **3.A and 3.B:** nothing. Every statement, branch and function they execute is also executed by
  other `backend` files (`repoSearchTree`, `repoSearchSchedule`, `findGitRepos`,
  `submoduleDiscovery`, `workTreeRoot`, `repoPath`, `gitPath` tests and others). The checks of
  section 3 are still the only ones with exactly these inputs and expectations.
- **3.C:** one branch. In `src/extension/watchers/git-repo.watcher.ts`, the path of
  `unmuteGitRepoWatcher` that only lowers the count when the same repository was muted more than
  once (C5). No other test mutes one repository twice.
- Across the whole `backend` project, one statement of `src/backend/utils/repoSearch.ts` is never
  executed: the handler that treats a **broken** symbolic link as "not a folder". Across the whole
  `extension` project, every line and branch of `webviewBridge.ts` and `git-repo.watcher.ts` is
  executed.

Coverage counts execution, not assertions: another file may run a line without checking what
3.A–3.C check about it.

### 4.3 The `tests-ext` files

No coverage is collected in the extension host. Judged by what else exists (the Vitest suites,
which drive the same modules through fakes, and the UI harness `tests-ext/ui/history.test.cjs`,
which activates the extension and opens the graph through `branchwise.view` and
`branchwise.fileHistory`), 3.D is the only check that, in a real VS Code:

- activation copies a user setting from the `neo-git-graph` section to the `branchwise` section
  (D4; `tests/extension/migrate-settings.test.ts` checks the same logic against a fake API);
- `branchwise.showBranches`, `branchwise.openDocumentation` and `branchwise.openWalkthrough` are
  registered and run without failing, and `branchwise.showBranches` opens the panel (D3;
  `activation.test.ts` and `activation-wiring.test.ts` check the registrations with fakes);
- a second `branchwise.view` adds no tab, and closing the panel and running the command again
  opens a new one (D2, D5; `view-command.test.ts` and `view-command-flow.test.ts` check the same
  logic against a fake `createWebviewPanel`);
- the panel's tab carries the label `Branchwise` (the UI harness finds the graph page by other
  means and reads tab labels nowhere).

3.E checks nothing that `tests/extension/repo-manager-records.test.ts` does not check more
strictly; it is the only check that the tsc-compiled CommonJS copy of `repoManager.ts` works in
the extension host's Node.

---

## 5. Gaps

Behaviours these files do not check and that the rewrite could add cheaply, each with where it
would go. Items already checked by another file are marked so, to avoid duplicates.

| #   | File     | Setup and call                                                                                                                                                         | Expected (observed where marked)                                                                             | Already elsewhere?                                                   |
| --- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| G1  | 3.A      | Add a broken symbolic link (to a path that does not exist) next to the repositories in `T`; search `T` at depth 2.                                                     | Same result as without it: `A` and `B`; no rejection.                                                        | No: the only statement of the module the `backend` suite never runs. |
| G2  | 3.A      | Search `T` at depth 2 with `A` known.                                                                                                                                  | Exactly `[B]` (observed): a known repository is also skipped when reached during the descent.                | Partly (`repoSearchSchedule` uses a stub Git).                       |
| G3  | 3.A      | Search a folder that does not exist at depth 1 or more.                                                                                                                | `[]` (observed at depth 3): a folder that cannot be listed gives nothing.                                    | Only through 3.B's B4.                                               |
| G4  | 3.A, 3.B | Replace the fixed `/tmp/...` missing path with a path inside `T` that is never created.                                                                                | Same results; the check no longer depends on the platform or on the machine's `/tmp`.                        | —                                                                    |
| G5  | 3.B      | Make B5, B7 and B8 exact.                                                                                                                                              | `[T]` at depth 1 → `[A]`; `[T]` at depth 2 → `[B, A]`; `[A, T/nested]` at depth 1 → `[B, A]` (all observed). | Sorting in general: `findGitRepos.test.ts`.                          |
| G6  | 3.B      | Pass the same folder twice: `[T, T]` at depth 2.                                                                                                                       | `[B, A]`, each once (observed).                                                                              | Yes, overlapping folders: `findGitRepos.test.ts`.                    |
| G7  | 3.C      | Like C3, but the handler rejects; probe right after the delivery settles.                                                                                              | Refresh expected: a failed request does not mute either.                                                     | No.                                                                  |
| G8  | 3.C      | Deliver a message for a command with no handler, and one without `command` (for example `{ kind: "rpc.request" }`), while a change is pending.                         | Each delivery resolves to `undefined`; the refresh still arrives at 250 ms.                                  | Routing itself: `webview-bridge-routing.test.ts`.                    |
| G9  | 3.C      | Mute `/repo`, unmute it, fire a change at `u`+1499.                                                                                                                    | Silence (observed); pairs with C5's boundary at 1500.                                                        | Yes: `git-repo-watcher-timing.test.ts`.                              |
| G10 | 3.D      | Compare the walkthrough ID the command opens (`<publisher>.<name>#gettingStarted`, from the extension's `packageJSON`) with the walkthroughs the manifest contributes. | The ID names a contributed walkthrough. The command itself cannot show this: it resolves for any ID (3.D.3). | No.                                                                  |
| G11 | 3.D      | Check that the packaged guide exists: `docs/git-actions.md` under the extension's folder, with `workspace.fs.stat`.                                                    | It exists. `branchwise.openDocumentation` resolves even when the file is missing (3.D.3).                    | No.                                                                  |
| G12 | 3.D      | Include `branchwise.fileHistory` in the registered-command check.                                                                                                      | It is registered (observed in the command list).                                                             | Yes, with fakes (`file-history-command.test.ts`).                    |
| G13 | 3.D      | After the explicit activation, read the extension's `isActive`.                                                                                                        | `true`.                                                                                                      | The UI harness activates it too, without this check.                 |

Not cheap, because they need `.vscode-test.mjs` (outside this group) to change: copying a
**workspace** setting (the fixture has none), and keeping a `branchwise` user value that already
exists instead of overwriting it.

---

## 6. Questions

- **tests-d Q1 — the stand-in's unused members.** Today only `workspace.getConfiguration` is used
  by any test; `workspaceFolders`, `createFileSystemWatcher`, `onDidChangeWorkspaceFolders`,
  `onDidChangeConfiguration`, `commands.registerCommand` and `window.showErrorMessage` are exported
  and never read. Section 2 keeps them. Should the rewrite keep them, trim the stand-in to what is
  used, or add members? Other specifications state the current member set as a premise (2.3).
- **tests-d Q2 — `legacy-host.md` describes the old failure behaviour.** 3.C's C2 requires a failing
  handler to be logged with its command and the listener's promise to resolve. `legacy-host.md`
  (section B: its test list, its non-functional requirements and `bridge Q1`) still says the
  existing test requires the rejection to reach the listener's caller. Should that document be
  corrected?
- **tests-d Q3 — where the mute checks live.** C4–C6 test the repository watcher, not the bridge,
  and `tests/extension/git-repo-watcher-timing.test.ts` covers most of the same ground. Today they
  sit in the bridge's file, together with C3, which ties the two. Should the rewrite keep them in
  `tests/extension/webviewBridge.test.ts`?
- **tests-d Q4 — D3's last part is a smoke check.** Running `branchwise.openWalkthrough` and
  `branchwise.openDocumentation` only shows that they do not fail; VS Code resolves both even for a
  wrong walkthrough ID or a missing guide (3.D.3). Should the rewrite keep it as it is, or add
  G10/G11?
- **tests-d Q5 — the host copy of the repository-manager test.** 3.E repeats, less strictly, what
  `repo-manager-records.test.ts` checks, and adds only that the CommonJS build works in VS Code's
  Node. Should it be rewritten as it is, extended, or dropped (which would also stop
  `tests-ext/tsconfig.json` from compiling `repoManager.ts`)?
- **tests-d Q6 — environment assumptions.** The current checks assume that the OS temporary folder
  is not inside a Git work tree, that a fixed name under `/tmp` does not exist (A3, B4), and that
  `/repo` does not exist (3.C). Should the rewrite keep these assumptions, or make each path its
  own (G4, and for 3.C a missing folder inside a fresh temporary folder)?
- **tests-d Q7 — the `.git` predicates.** A9 and B9 check that no result names a `.git` folder.
  On this fixture the search stops at each work tree and never lists inside a repository, so no
  `.git` folder is ever reached: A9 cannot fail unless A8 does, and B9 guards only against extra
  entries that B7 does not exclude. `repoSearchTree.test.ts` checks a folder named `.git` outside
  any repository. Keep them, drop them, or replace them with a fixture that could make them fail?
- **tests-d Q8 — timing margins in the host.** The panel poll gives up after 2 s and the settle
  waits are 200 ms and 300 ms. They passed with room to spare here (D3, the slowest, took 974 ms),
  but they are the only margins on slower CI machines and on Windows and macOS. Keep them, or widen
  them?
