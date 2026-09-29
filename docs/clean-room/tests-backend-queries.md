# Clean-room specification: backend query tests and `tests/backend/helpers.ts`

This document says what four backend test files check, and what the shared test helper module provides, so that someone who never sees those files can write replacements with the same coverage. It describes behaviour and data only. Test names, comments, helper shapes and the order of the old files are deliberately not reproduced; the replacements should be organised however the implementer finds clearest.

---

## 0. How this was observed

- Repository at commit `c1c8e2f`. Git 2.55.0 first in `PATH`, Node v22.22.2, pnpm 11.15.1, Vitest 4.1.11, simple-git 3.36.0, on Linux.
- The four files were run with `pnpm exec vitest run --project backend <files>`: 36 tests, all passing. They also pass with `NGG_HOSTILE_GIT_CONFIG=1` and with `--sequence.shuffle`.
- Concrete values below come from re-running each fixture in a scratch Vitest project (outside the repository) that imported the same product modules and printed their full results. Commit IDs and dates differ on every run, so they are given as symbols (`I`, `S`, …) and "now".

---

## 1. Scope and rules

### 1.1 The files

| File                                                 | Tests | Inherited lines (baseline) |
| ---------------------------------------------------- | ----- | -------------------------- |
| `tests/backend/queries/loadCommits/list.test.ts`     | 15    | 168                        |
| `tests/backend/queries/loadBranches/list.test.ts`    | 12    | 88                         |
| `tests/backend/queries/commitDetails/get.test.ts`    | 8     | 63                         |
| `tests/backend/queries/signedCommits.test.ts`        | 1     | 4                          |
| `tests/backend/helpers.ts` (shared module, no tests) | –     | 14                         |

"Tests" counts every case Vitest reports, including each row of a parameterised case. The baseline column is the file's entry in `scripts/provenance-baseline.json`.

Each file is deleted and rewritten whole at the same path. The implementer does not open the old file, its history, or any built output containing it. The rewrite does not have to keep the same number of tests: it may split or merge cases, as long as every check listed in §3 is still made (or replaced by a stricter one) and the coverage of §4 is not lowered.

### 1.2 How the tests run

- **Runner.** Vitest 4, project `backend` in `vitest.config.ts`. That project includes `tests/backend/**/*.test.ts`, so `helpers.ts` (no `.test.` in its name) is never collected as a test file. The environment is Node (no DOM). `globals` is off, so test files import `describe`, `it`, `expect`, hooks and `vi` from `vitest`.
- **Timeouts.** `testTimeout` and `hookTimeout` are both 30 000 ms for the backend project, because Git process start-up is slow on Windows runners. None of these files set their own timeouts, use fake timers or retries.
- **Aliases.** `@/…` resolves to `src/…` and `@tests/…` to `tests/…`, both in Vitest (`resolve.alias`) and in TypeScript (`paths` in `tsconfig.base.json`). The helper module is imported as `@tests/backend/helpers`.
- **Setup file.** `tests/git-config.ts` runs before every file of the `backend` and `extension` projects. It sets `GIT_CONFIG_GLOBAL` to `tests/fixtures/gitconfig`, or to `tests/fixtures/hostile.gitconfig` when `NGG_HOSTILE_GIT_CONFIG=1`, and sets `GIT_CONFIG_NOSYSTEM=1`. Every Git process a test starts, directly or through the product code, inherits this, so the developer's own Git configuration cannot change results.
  - `tests/fixtures/gitconfig`: user `Test <test@example.invalid>`, `init.defaultBranch=main`, `commit.gpgSign=false`, `tag.gpgSign=false`, `maintenance.auto=false`.
  - `tests/fixtures/hostile.gitconfig`: includes the file above, then turns on settings that change Git's human-readable output: every `color.*` = `always`, `log.showSignature=true`, `log.decorate=full`, `log.abbrevCommit=true`, `log.date=relative`, `format.pretty=oneline`, `core.quotePath=true`, `status.short`/`status.branch=true`, `status.showUntrackedFiles=no`, `branch.sort=-committerdate`, `tag.sort=-creatordate`, `column.ui=always`.
  - Environment variables of the machine still apply on top (for example `GIT_CONFIG_COUNT`/`GIT_CONFIG_KEY_n` command-line settings, `GIT_EDITOR`). The machine used here injected three harmless settings that way.
- **CI** (`.github/workflows/ci.yaml`, job `test`):
  1. `pnpm run test` on Ubuntu, Windows and macOS. It runs `vitest run --project backend`, then the `extension` and `webview` projects.
  2. Linux only: `vitest run --project backend --sequence.shuffle`, which randomises the order of files and of the tests inside them. Tests must not depend on each other's order.
  3. Linux only: the `backend` and `extension` projects with `NGG_HOSTILE_GIT_CONFIG=1` and a German locale (`LANG`/`LC_ALL=de_DE.UTF-8`, `LANGUAGE=de`), after a guard that fails unless Git really prints German messages. Tests must not match Git's message text.
- **Coverage.** The only coverage setting in `vitest.config.ts` is for `src/webview/lib/menus.tsx` (functions ≥ 80 %), measured by `pnpm run test:coverage`, which runs the `webview` project only. These files feed no coverage threshold. Running the backend project with `--coverage` and the repository's defaults reports only `menus.tsx` (0 %) and fails that threshold; §4 overrides `coverage.include` to measure the backend.

### 1.3 What the rewrite must keep

- The four test paths and the helper path, with the helper's exported interface unchanged (§2). 53 other files import the helper.
- **Type checking.** `pnpm run typecheck` runs `tsc -p tests`, whose `tests/tsconfig.json` covers `tests/backend/**/*.ts` and `tests/extension/**/*.ts` with the strict base settings (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noUnusedLocals`, `noUnusedParameters`, `verbatimModuleSyntax`, `isolatedModules`). Optional request fields that the tests leave out (such as `hiddenRemotes`) must stay left out rather than set to `undefined`.
- **Lint and format.** `pnpm run lint` (oxlint: `curly`, `node:` protocol for built-ins, and an import order of built-ins, external packages, `@/…`, then `@tests/…`, alphabetised, with blank lines between groups) and `pnpm run format` (`oxfmt --check`).
- **Portability.** Every file must pass on Linux, macOS and Windows, in shuffled order, and with the hostile configuration in German. All Git runs use the `git` found on `PATH`.
- **Provenance.** After the rewrite, `pnpm run check:provenance` reports that these files went down. The baseline is then lowered with `pnpm run provenance --update` and the rewrite is logged in `docs/provenance.md`, as for any rewrite. §2 fixes the helper's names, parameters and configuration values, so a few lines of an independent helper may still match old lines word for word (a line that writes the test identity, for example); such lines are reviewed and listed as coincidences as `docs/provenance.md` describes.
- **Documents that name these files.** `docs/clean-room/load-commits.md`, `commit-details.md`, `backend-queries.md`, `backend-types.md`, `backend-actions.md` and `file-tree.md` refer to these test files by path when listing existing coverage. Keeping the paths keeps those references valid.
- No other file changes: not `vitest.config.ts`, `tests/git-config.ts`, the fixtures, or the product code.

---

## 2. Shared helper module `tests/backend/helpers.ts`

The module offers ways to build throw-away Git repositories and run Git synchronously from tests. It has exactly five named exports and no default export. It imports `beforeEach` and `afterEach` from `vitest`, so it can only be loaded inside a Vitest run.

### 2.1 Interface

```ts
export function git(args: string[], cwd: string): void;
export function gitOutput(args: string[], cwd: string): string;
export function refNames(namespace: string, cwd: string): string[];
export function freshRepo(setup?: (repo: string) => void): () => string;
export function makeRepo(): string;
```

The return types may be inferred rather than written, but must be as shown.

### 2.2 `git(args, cwd)`

Runs the `git` executable found on `PATH`, synchronously, with exactly `args` as its arguments and `cwd` as its working directory. The environment is the test process's own, so the setup file's configuration applies. Standard input, output and error are all pipes: nothing is echoed into the test output, and Git cannot wait for terminal input. It returns nothing. When Git exits with a non-zero status (or cannot be started) it throws Node's child-process error, which carries the status and the captured output. Callers rely on this: some expect a Git command to fail and assert that the call throws.

### 2.3 `gitOutput(args, cwd)`

The same as `git`, with the same throwing rule, but returns Git's standard output decoded as UTF-8, with leading and trailing whitespace removed (`String.prototype.trim` semantics; newlines inside the output are kept).

### 2.4 `refNames(namespace, cwd)`

The names of the refs whose full name starts with `namespace` (callers pass `"refs/tags/"`), each with its first two path components removed (`refs/tags/v1.0` → `v1.0`), in Git's default `for-each-ref` order (sorted by full ref name). Returns `[]` when there are none. It reads through Git, so packed and loose refs both count.

### 2.5 `makeRepo()`

Creates a new repository and returns its path. The caller owns it and must delete it.

- **Folder.** A new, uniquely named directory directly under `os.tmpdir()`, whose name starts with `ngg-test-`. The returned path is the directory's canonical real path as the operating system reports it (Node's native `realpath`), so symbolic links in the temporary folder (macOS `/var` → `/private/var`) and Windows short names are resolved. Several callers compare product output, which Git has already resolved, against this path.
- **Repository.** A non-bare repository whose initial branch is `main`. If Git rejects the option that names the initial branch at `init`, the helper instead initialises with Git's default and then creates and checks out `main` before the first commit (see tests-q Q7).
- **Repository-level configuration.** `user.name=T`, `user.email=t@t.com`, `commit.gpgsign=false`, `tag.gpgsign=false`, written to the repository's own config file. The identity must live there, not only in the environment of the helper's own commit: callers make further commits with plain `git commit` and expect author and committer `T <t@t.com>` (for example, `tests/backend/actions/history.test.ts` filters history by the author `t@t.com`).
- **Content.** One commit on `main`, with message `init`, adding one file `f` whose content is the single byte `x` (no trailing newline). Author and committer dates are the current time (not pinned). The work tree is clean and `HEAD` points at `refs/heads/main`.

Observed `git log` for a new repository: one root commit `init`, author and committer `T <t@t.com>`, changing `f` by one insertion.

### 2.6 `freshRepo(setup?)`

Registers set-up and clean-up hooks so that each test in the calling scope works on a repository made for it alone.

- It must be called while a test file or a `describe` block is being collected (callers call it at the top level of the file). At that moment it registers two hooks in the calling scope:
  - a `beforeEach` hook that calls `makeRepo()`, remembers the path, and then calls `setup(path)` if `setup` was given (its return value is ignored);
  - an `afterEach` hook that deletes the remembered folder recursively, ignoring a missing folder, and retrying up to 5 times 100 ms apart when the deletion fails (Windows can hold files briefly after a Git process exits).
- It returns a getter. Calling the getter returns the current test's repository path. Before the first `beforeEach` has run it returns `""`.
- Hook order matters to callers: hooks registered after the `freshRepo` call run after its `beforeEach`, so they can already use the getter. `tests/backend/actions/tag/push.test.ts` relies on that.

### 2.7 Files that import the helper

The four files being rewritten import `git` and `makeRepo` (`signedCommits.test.ts` only `makeRepo`). Every other importer, which is not being rewritten, uses these exports:

| Importer                                              | Exports used                                |
| ----------------------------------------------------- | ------------------------------------------- |
| `tests/backend/actions/batchedProcesses.test.ts`      | `git`, `gitOutput`, `makeRepo`              |
| `tests/backend/actions/branch/checkout.test.ts`       | `git`, `makeRepo`                           |
| `tests/backend/actions/branch/create.test.ts`         | `freshRepo`, `git`, `gitOutput`             |
| `tests/backend/actions/branch/delete.test.ts`         | `freshRepo`, `git`, `gitOutput`             |
| `tests/backend/actions/branch/rename.test.ts`         | `freshRepo`, `git`, `gitOutput`             |
| `tests/backend/actions/commit/checkout.test.ts`       | `freshRepo`, `git`, `gitOutput`             |
| `tests/backend/actions/commit/cherrypick.test.ts`     | `freshRepo`, `git`, `gitOutput`             |
| `tests/backend/actions/commit/mergeParents.test.ts`   | `freshRepo`, `git`, `gitOutput`             |
| `tests/backend/actions/commit/reset.test.ts`          | `freshRepo`, `git`, `gitOutput`             |
| `tests/backend/actions/commit/revert.test.ts`         | `freshRepo`, `git`, `gitOutput`             |
| `tests/backend/actions/history.test.ts`               | `makeRepo`                                  |
| `tests/backend/actions/merge/conflicts.test.ts`       | `git`, `makeRepo`                           |
| `tests/backend/actions/merge/mergeBranch.test.ts`     | `freshRepo`, `git`, `gitOutput`             |
| `tests/backend/actions/merge/mergeCommit.test.ts`     | `freshRepo`, `git`, `gitOutput`             |
| `tests/backend/actions/networkCancel.test.ts`         | `git`, `gitOutput`, `makeRepo`              |
| `tests/backend/actions/optionLikeRefs.test.ts`        | `git`, `makeRepo`                           |
| `tests/backend/actions/remote.test.ts`                | `git`, `makeRepo`                           |
| `tests/backend/actions/repository.test.ts`            | `makeRepo`                                  |
| `tests/backend/actions/tag/add.test.ts`               | `freshRepo`, `git`, `gitOutput`, `refNames` |
| `tests/backend/actions/tag/delete.test.ts`            | `freshRepo`, `git`, `refNames`              |
| `tests/backend/actions/tag/push.test.ts`              | `freshRepo`, `git`, `refNames`              |
| `tests/backend/actions/workflows.test.ts`             | `makeRepo`                                  |
| `tests/backend/queries/branchFocus.test.ts`           | `git`, `makeRepo`                           |
| `tests/backend/queries/conflictKinds.test.ts`         | `freshRepo`, `git`, `gitOutput`             |
| `tests/backend/queries/graphErrors.test.ts`           | `git`, `makeRepo`                           |
| `tests/backend/queries/loadBranches/entries.test.ts`  | `freshRepo`, `git`                          |
| `tests/backend/queries/loadBranches/unborn.test.ts`   | `git`                                       |
| `tests/backend/queries/loadCommits/records.test.ts`   | `gitOutput`, `makeRepo`                     |
| `tests/backend/queries/localUpstream.test.ts`         | `freshRepo`, `git`                          |
| `tests/backend/queries/optionalLocks.test.ts`         | `makeRepo`                                  |
| `tests/backend/queries/remoteVisibility.test.ts`      | `git`, `makeRepo`                           |
| `tests/backend/queries/remoteVisibilityScale.test.ts` | `gitOutput`, `makeRepo`                     |
| `tests/backend/queries/repoSearch.test.ts`            | `git`                                       |
| `tests/backend/queries/repositoryState.test.ts`       | `git`, `makeRepo`                           |
| `tests/backend/queries/submoduleDiscovery.test.ts`    | `git`, `makeRepo`                           |
| `tests/backend/queries/workingTree.test.ts`           | `makeRepo`                                  |
| `tests/backend/sandbox.ts` (shared module)            | `makeRepo`                                  |
| `tests/backend/utils/gitPath.test.ts`                 | `makeRepo`                                  |
| `tests/backend/utils/repoSearch.test.ts`              | `git`                                       |
| `tests/backend/utils/repoSearchTree.test.ts`          | `git`                                       |
| `tests/backend/utils/scratchTree.ts` (shared module)  | `git`                                       |
| `tests/backend/utils/validation.test.ts`              | `git`, `gitOutput`, `makeRepo`              |
| `tests/backend/utils/workTreeRoot.test.ts`            | `makeRepo`                                  |
| `tests/extension/action-cancel.test.ts`               | `git`, `gitOutput`, `makeRepo`              |
| `tests/extension/diff-doc-content.test.ts`            | `makeRepo`                                  |
| `tests/extension/diff-doc-provider.test.ts`           | `git`, `makeRepo`                           |
| `tests/extension/file-history-command.test.ts`        | `makeRepo`                                  |
| `tests/extension/git-repo-watcher.test.ts`            | `git`, `gitOutput`, `makeRepo`              |
| `tests/extension/remote-preferences.test.ts`          | `git`, `makeRepo`                           |
| `tests/extension/restore-undo.test.ts`                | `gitOutput`, `makeRepo`                     |
| `tests/extension/scan-repo-depth.test.ts`             | `git`                                       |
| `tests/extension/scan-repo.test.ts`                   | `git`, `makeRepo`                           |
| `tests/extension/view-preferences.test.ts`            | `makeRepo`                                  |

`tests/backend/sandbox.ts` re-uses `makeRepo` for its own `repo()` helper and describes that repository as being on `main` with a single commit that adds `f` holding `x`; eight more test files use it through that helper. Callers also depend on these details: `f` containing exactly `x` (for example `tests/extension/diff-doc-content.test.ts` reads `f` at a parent revision and expects `x`, and `tests/backend/queries/workingTree.test.ts` stages and edits `f`), the branch name `main`, the identity above, and the canonical path (for example `tests/backend/utils/workTreeRoot.test.ts` expects product output equal to the normalised `makeRepo()` path). No file under `tests-ext/` or `scripts/` imports the helper.

---

## 3. The test files

None of the four files installs a mock, a spy, a fake executable or fake timers, and none sets environment variables. Every call goes through a real simple-git client made by `createGit(<folder>, "git")` from `src/backend/gitClient.ts`, running the real `git` on `PATH` against repositories built on disk. In the tables, "exact" means deep equality, in which a key present on one side and missing (or `undefined`) on the other is ignored, but any extra key with a defined value fails. "Partial" means a subset match: only the named keys are compared, but an array named in the expected value must have exactly the listed length, and its elements are matched in turn.

### 3.1 `tests/backend/queries/loadCommits/list.test.ts` (15 tests)

**Exercises** `loadCommits(git, input)` from `src/backend/queries/loadCommits.ts` (imported as `@/backend/queries/loadCommits`), and through it `src/backend/utils/remoteVisibility.ts` and `src/backend/utils/refs.ts`. One case also calls the client's own `revparse(["HEAD"])` to learn HEAD's full ID.

**Base request.** Unless a case says otherwise, the request is `branchName: ""`, `maxCommits: 300`, `showRemoteBranches: false`, `hard: false`, `dateType: "Author Date"`, `showUncommittedChanges: false`, with `hiddenRemotes` left out.

#### Fixtures

| Name   | How it is built                                                                                                                                                                                                                         | Lifetime                                                      |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| **T2** | `makeRepo()`, then a file `f2` containing `y` (no newline) is added and committed with message `second`. History: `I` (`init`) ← `S` (`second`), `main` at `S`, clean tree.                                                             | Built once for the file, only read, deleted after all tests.  |
| **RP** | Two `makeRepo()` repositories. The second gets a remote `origin` whose URL is the first one's path, then `git fetch origin`. It then has `refs/remotes/origin/main` and, with Git 2.48 or later, a symbolic `refs/remotes/origin/HEAD`. | Built once, only read, both deleted after all tests.          |
| **DO** | `makeRepo()`; HEAD detached at its commit; an empty commit `detached-only` (`D`) made on the detached HEAD, so `D` is reachable from HEAD alone; then an untracked file `untracked` containing `dirty`.                                 | New for each case, deleted at the end of it, also on failure. |
| **BL** | `makeRepo()`; HEAD detached at `I`; branch `main` deleted. No branch or tag refs remain.                                                                                                                                                | Per case.                                                     |
| **HR** | `makeRepo()`; a remote `origin` with URL `.` (never fetched); HEAD detached; an empty commit `hidden-remote-tip` (`H`); `refs/remotes/origin/topic` created at `H`. `H` is reachable only from HEAD and from `origin/topic`.            | Per case.                                                     |
| **UB** | A new folder under the temporary directory (prefix `ngg-empty-`, path not canonicalised) in which `git init -b main` is run. No commits, no identity.                                                                                   | Per case.                                                     |
| **UT** | `makeRepo()` plus an untracked file `untracked` containing `z`.                                                                                                                                                                         | Per case.                                                     |

`makeRepo()` does not pin dates, so the two repositories of RP have identical `init` commits (same ID) when made within the same second and unrelated root commits otherwise. No assertion depends on which.

#### Cases

Result shape and pass-through:

| Case | Fixture | Request changes | Expected                                                                                                                                                                                                                                                                                                   |
| ---- | ------- | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C-1  | T2      | none            | Exact: `{ commits: <any array>, head: <any string>, moreCommitsAvailable: false, hard: false, uncommittedChanges: 0 }`. At least one commit. The first commit is exactly `{ hash: <string>, parentHashes: <array>, author: <string>, email: <string>, date: <number>, message: <string>, refs: <array> }`. |
| C-2  | T2      | none            | Exact: the same five-key result shape with `moreCommitsAvailable: false` (repeats the first half of C-1).                                                                                                                                                                                                  |
| C-3  | T2      | `hard: true`    | Exact: the five-key shape with `hard: true`, `moreCommitsAvailable: false`, `uncommittedChanges: 0`.                                                                                                                                                                                                       |

Paging:

| Case | Fixture | Request changes | Expected                                                                                                                 |
| ---- | ------- | --------------- | ------------------------------------------------------------------------------------------------------------------------ |
| C-4  | T2      | `maxCommits: 1` | Exact: the five-key shape with `moreCommitsAvailable: true`, `hard: false`, `uncommittedChanges: 0`. Exactly one commit. |

HEAD and labels:

| Case | Fixture | Request changes                                            | Expected                                                                                                                                                                                            |
| ---- | ------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C-5  | T2      | none                                                       | `head` is not `null`; a commit whose `hash` equals `head` is in the list; at least one of its `refs` has `type: "head"`.                                                                            |
| C-6  | RP      | none (remotes off)                                         | No label of any commit has `type: "remote"`.                                                                                                                                                        |
| C-7  | BL      | `showRemoteBranches: true`, `showUncommittedChanges: true` | Exactly one commit, which partially matches `{ hash: <result.head>, refs: [] }`: HEAD's commit is listed although no ref names it, and it has no labels.                                            |
| C-8  | HR      | `showRemoteBranches: true`, `hiddenRemotes: ["origin"]`    | The commit whose `hash` equals `result.head` exists and partially matches `{ message: "hidden-remote-tip", refs: [] }`: HEAD's commit is still listed, and carries no label from the hidden remote. |

Branch filter, uncommitted-changes row and detached HEAD:

| Case       | Fixture | Request changes                                                                                     | Expected                                                                                                                                                                                                                                                                                                                                                    |
| ---------- | ------- | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C-9        | T2      | `branchName: "main"`                                                                                | At least one commit.                                                                                                                                                                                                                                                                                                                                        |
| C-10       | UT      | `showUncommittedChanges: true`                                                                      | The first row is exactly `{ hash: "*", parentHashes: [<result.head>], author: "*", email: "", date: <any number>, message: "", refs: [] }`, and `uncommittedChanges` is `1`.                                                                                                                                                                                |
| C-11       | UT      | none (row off)                                                                                      | The first commit exists and its `hash` is not `"*"`.                                                                                                                                                                                                                                                                                                        |
| C-12, C-13 | DO      | `showUncommittedChanges: true`; `showRemoteBranches` is `true` in one case and `false` in the other | `head` equals the trimmed ID that the client's `revparse(["HEAD"])` gives (`D`); the list's hashes include `D`; the first row partially matches `{ hash: "*", parentHashes: [D] }`; `uncommittedChanges` is `1`. Then, with the same client and the same request plus `branchName: "main"`: the hashes do not include `D`, and `uncommittedChanges` is `0`. |

The repository in C-12/C-13 has no remotes, so both parameter values give the same result; they differ only in the Git arguments the module builds.

Empty repository and dates:

| Case | Fixture | Request changes                                            | Expected                                                                                                                                                         |
| ---- | ------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C-14 | UB      | `showRemoteBranches: true`, `showUncommittedChanges: true` | The promise resolves, and the result partially matches `{ commits: [], head: null, moreCommitsAvailable: false, uncommittedChanges: 0 }`. `hard` is not checked. |
| C-15 | T2      | `dateType: "Commit Date"`                                  | At least one commit, and the first commit's `date` is greater than `0`. The value is not compared with the author date (the two are equal in T2).                |

#### Observed results (for reference; most are not asserted in full)

- T2, base request: `commits` = `[ { hash: S, parentHashes: [I], author: "T", email: "t@t.com", date: now, message: "second", refs: [ { hash: S, name: "main", type: "head" } ] }, { hash: I, parentHashes: [], author: "T", email: "t@t.com", date: now, message: "init", refs: [] } ]`, `head: S`, `moreCommitsAvailable: false`, `hard: false`, `uncommittedChanges: 0`. With `maxCommits: 1`: only the `S` entry and `moreCommitsAvailable: true`. With `branchName: "main"` or `"Commit Date"`: the same as the base request.
- DO, either parameter: `[ { hash: "*", parentHashes: [D], author: "*", email: "", date: now, message: "", refs: [] }, { hash: D, parentHashes: [I], message: "detached-only", refs: [], … }, { hash: I, message: "init", refs: [ { hash: I, name: "main", type: "head" } ], … } ]`, `head: D`, `uncommittedChanges: 1`. With `branchName: "main"`: only the `I` entry, `head: D`, `uncommittedChanges: 0`.
- BL: one entry `I` with `refs: []`, and `head: I`.
- HR with `hiddenRemotes: ["origin"]`: `[ H with refs [], I with the main label ]`. Without `hiddenRemotes`, `H` carries `{ hash: H, name: "origin/topic", type: "remote" }`.
- UB: `{ commits: [], head: null, moreCommitsAvailable: false, hard: false, uncommittedChanges: 0 }`.
- RP with remotes on (not asserted): `I` carries `main` (`head`), then `origin/HEAD` and `origin/main` (both `remote`).

#### Timing and platform notes

Each case takes 10–120 ms. Nothing is platform-specific: names and contents are ASCII, and paths are built with the platform's path functions. The dirty cases use an untracked file, so under the hostile configuration (`status.showUntrackedFiles=no`) they pass only because the product overrides that setting. T2 and RP are never modified, so a shuffled order cannot affect them.

### 3.2 `tests/backend/queries/loadBranches/list.test.ts` (12 tests)

**Exercises** `loadBranches(git, input)` from `src/backend/queries/loadBranches.ts` (imported as `@/backend/queries/loadBranches`), and through it `refNames` and `currentBranch` in `src/backend/utils/refs.ts` and `src/backend/utils/remoteVisibility.ts`.

**Request.** Always `{ showRemoteBranches, hard, repo: <folder>, gitPath: "git" }`, with the client made by `createGit(<same folder>, "git")`. `hiddenRemotes` is never given. `showRemoteBranches` and `hard` are `false` unless a case says otherwise.

#### Fixtures

| Name   | How it is built                                                                                                                                                                                                                                                                                                                                                                                                         | Lifetime                                                                                                                                                      |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **LB** | `makeRepo()` plus a branch `feature/foo` at the same commit; `main` stays checked out.                                                                                                                                                                                                                                                                                                                                  | Built once for the file, only read, deleted after all tests.                                                                                                  |
| **DH** | `makeRepo()`, then HEAD detached at the full ID of its only commit (obtained with `git rev-parse HEAD`).                                                                                                                                                                                                                                                                                                                | Built once, only read, deleted after all tests.                                                                                                               |
| **RP** | As in §3.1: a second `makeRepo()` repository with remote `origin` pointing at a first one, fetched.                                                                                                                                                                                                                                                                                                                     | Built once, only read. Only the repository with the remote is deleted afterwards; the other one is left in the temporary folder (tests-q Q6).                 |
| **BZ** | `makeRepo()`; repository-level `color.ui=always` and `color.branch=always`; a branch `topic` and a lightweight tag `v1`, both at `init`; a remote `origin` whose URL is the repository's own path; a quiet `git fetch origin` (giving `origin/main`, `origin/topic`, and on Git 2.48 or later `origin/HEAD`); then `git remote set-head origin main`, so `refs/remotes/origin/HEAD` is a symbolic ref to `origin/main`. | Built once for the five BZ cases and deleted after them. Each case changes it and puts `main` back as the checked-out branch before it ends, also on failure. |

With BZ's settings, Git's human-readable branch listing (`git branch -a`) is wrapped in ANSI colour codes, contains a `remotes/origin/HEAD -> origin/main` line, and in the states the BZ cases create also contains a line for the current state, such as `(HEAD detached at v1)`, `(HEAD detached at <short ID>)`, `(no branch, rebasing topic)` or `(no branch, bisect started on main)`. The expected lists below contain none of these extra lines.

#### Cases

Result shape and the current branch:

| Case | Fixture | Request changes | Expected                                                                                                                                         |
| ---- | ------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| B-1  | LB      | none            | Exact: `{ repo: <the folder string passed in>, branches: <any array>, head: "main", hard: false, isRepo: true }`, and `branches[0]` is `"main"`. |
| B-2  | LB      | none            | `branches` contains `"feature/foo"`.                                                                                                             |
| B-3  | LB      | `hard: true`    | Exact: `{ repo: <folder>, branches: <any array>, head: <any string>, hard: true, isRepo: true }`.                                                |
| B-4  | DH      | none            | Exact: `{ repo: <folder>, branches: <any array>, head: null, hard: false, isRepo: true }`, and `branches` is exactly `["main"]`.                 |

Remote-tracking entries:

| Case | Fixture | Request changes            | Expected                                                                                                                           |
| ---- | ------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| B-5  | RP      | none                       | Exact: the five-key shape with `head: <any string>` and `hard: false`. No entry starts with `remotes/`.                            |
| B-6  | RP      | `showRemoteBranches: true` | Exact: the same five-key shape. `branches` is exactly `["main", "remotes/origin/main"]`: the symbolic `origin/HEAD` is not listed. |

Detached and in-progress states (all on BZ; "local list" is the result with remotes off, "full list" with `showRemoteBranches: true`):

| Case | Git state before the call                                                                                                                                                                                                                                                                                                           | Expected                                                                                                                                                                                                                  |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B-7  | `git checkout --detach main` (HEAD at the commit `main` names)                                                                                                                                                                                                                                                                      | Local list partially matches `{ head: null, branches: ["main", "topic"] }`. Full list's `branches` is exactly `["main", "topic", "remotes/origin/main", "remotes/origin/topic"]`. Afterwards `main` is checked out again. |
| B-8  | `git checkout --detach v1` (HEAD at the commit `v1` names)                                                                                                                                                                                                                                                                          | As B-7.                                                                                                                                                                                                                   |
| B-9  | `git checkout --detach HEAD` (HEAD at the commit it already had)                                                                                                                                                                                                                                                                    | As B-7.                                                                                                                                                                                                                   |
| B-10 | On `main`, `f` is overwritten with `main side` and committed (`commit -am`) as `main side`; on `topic`, `f` is overwritten with `topic side` and committed as `topic side`; then `git rebase main` from `topic`, which must fail (the helper call throws) because both sides changed `f`. HEAD is now detached in a stopped rebase. | Local list partially matches `{ head: null, branches: ["main", "topic"] }`. Afterwards `git rebase --abort` and `main` checked out again.                                                                                 |
| B-11 | With `main` checked out, its current commit is noted as `base`; two empty commits `middle` and `last` are added on `main`; then `git bisect start main <base>` (bad `main`, good `base`), which detaches HEAD at `middle`.                                                                                                          | Local list partially matches `{ head: null, branches: ["main", "topic"] }`. Then, after `git bisect reset` (done even on failure), the local list partially matches `{ head: "main", branches: ["main", "topic"] }`.      |

B-7 to B-9 are one parameterised case over the three `checkout --detach` targets.

Not a repository:

| Case | Folder                                                                                          | Expected                                                                                           |
| ---- | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| B-12 | The system temporary folder itself (`os.tmpdir()`), used as both `repo` and the client's folder | The promise rejects (any error). Observed: an error carrying Git's "not a git repository" message. |

#### Observed results

- LB: `branches: ["main", "feature/foo"]`, `head: "main"`. With `hard: true`, the same with `hard: true`.
- DH: `branches: ["main"]`, `head: null`.
- RP: remotes off `["main"]`, remotes on `["main", "remotes/origin/main"]`, `head: "main"` in both.
- BZ: in every detached, rebasing and bisecting state the local list is `["main", "topic"]` and the full list `["main", "topic", "remotes/origin/main", "remotes/origin/topic"]`, with `head: null`. After the bisect reset, `head: "main"`.
- A folder that does not exist fails earlier: `createGit` throws synchronously ("Cannot use simple-git on a directory that does not exist"). No case uses that.

#### Timing, order and platform notes

The BZ cases take about 100–140 ms each, the others 10–60 ms. The five BZ cases share one repository and change it (B-10 and B-11 leave extra commits on `main` and `topic`); every expected value above holds in any order, which matters because CI shuffles tests. A case that fails before restoring `main` would leave BZ in a state that can fail the others. B-12 depends on the machine's temporary folder not being inside a Git work tree (tests-q Q1). Nothing is platform-specific; `f` is written through a path joined with `/`, which Windows accepts.

### 3.3 `tests/backend/queries/commitDetails/get.test.ts` (8 tests)

**Exercises** `commitDetails(git, { commitHash, dateType })` from `src/backend/queries/commitDetails.ts` (imported as `@/backend/queries/commitDetails`). One case also calls `sourceFile`, `loadHistory` and `loadRestorePlan` from `src/backend/queries/history.ts` (and through them `src/backend/utils/history.ts` and `src/backend/utils/validation.ts`), and the simple-git client's own `show` method. Commit IDs for requests are read with `git rev-parse HEAD`; two requests pass the name `HEAD` instead of an ID.

#### Fixtures

| Name   | How it is built                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Lifetime                                                     |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| **R1** | `makeRepo()`. `I` is the full ID of its only commit (`init`, adding `f` = `x`).                                                                                                                                                                                                                                                                                                                                                                                                                       | Built once for the file, only read, deleted after all tests. |
| **R2** | `makeRepo()`; `f` overwritten with `modified content` (no newline); everything staged and committed as `mod`.                                                                                                                                                                                                                                                                                                                                                                                         | Per case, deleted at its end (also on failure).              |
| **R3** | `makeRepo()`; a file `old.txt` containing `moved` plus a newline is added and committed as `before`. Then, all in one further commit (ID `U`, any message): text files each containing `one`, newline, `two`, newline, named `中文.txt`, `café.md` and, except on Windows, `tab`+TAB+`name`, `quote"name`, `new`+LF+`line`, `back\slash` and `0:foo`; a file `binary.dat` holding the three bytes `00 01 02`; a new folder `目录` and `git mv old.txt 目录/新.txt`; then `git add -A` and the commit. | Per case.                                                    |
| **R4** | `makeRepo()`; branch `side` created and checked out; a file `side` containing `side` plus newline added and committed as `side`; back on `main`, a file `main` containing `main` plus newline added and committed as `main`; `git merge --no-edit side`, making a two-parent merge whose first parent is the `main` commit. Later in the same case an empty commit `empty` is added on top.                                                                                                           | Per case.                                                    |

#### Cases

Header fields:

| Case | Fixture, request                     | Expected                                                                                                                                                                                                                                             |
| ---- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D-1  | R1, `commitHash: I`, `"Author Date"` | Exact: `{ commitDetails: { hash: I, parents: <any array>, author: <any string>, email: <any string>, date: <any number>, committer: <any string>, body: <any string>, fileChanges: <any array> } }` (no other keys at either level), and `date > 0`. |
| D-2  | R1, `commitHash: I`, `"Commit Date"` | The same as D-1. The two dates are equal in R1, so the choice is not told apart.                                                                                                                                                                     |
| D-3  | R1, `commitHash: I`, `"Author Date"` | `body` contains `init`.                                                                                                                                                                                                                              |

File changes:

| Case | Fixture, request                                                   | Expected                                                                                                                                              |
| ---- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| D-4  | R1, `commitHash: I`, `"Author Date"`                               | `commitDetails` is not `null` and `fileChanges` is not empty (the root commit is compared with an empty tree).                                        |
| D-5  | R2, the `mod` commit's ID, `"Author Date"`                         | Not `null`; an entry with `newFilePath: "f"` exists, and its `additions` and `deletions` are numbers (values not checked).                            |
| D-6  | R4, `commitHash: "HEAD"` at the merge, `"Author Date"`             | The `newFilePath`s of `fileChanges` are exactly `["side"]`: the merge lists the file it brought in relative to its first parent, not the `main` file. |
| D-7  | R4 after the `empty` commit, `commitHash: "HEAD"`, `"Author Date"` | `fileChanges` is exactly `[]`. (D-6 and D-7 are one test.)                                                                                            |

Hard file names (D-8, one test on R3, `commitHash: U`, `"Author Date"`). `fileChanges` must equal the following list exactly, ignoring order (both sides are sorted by `newFilePath` with plain JavaScript string comparison before comparing). Every entry has exactly these five keys.

| `oldFilePath`    | `newFilePath`    | `type` | `additions` | `deletions` | Windows |
| ---------------- | ---------------- | ------ | ----------- | ----------- | ------- |
| `0:foo`          | `0:foo`          | `"A"`  | `2`         | `0`         | absent  |
| `back\slash`     | `back\slash`     | `"A"`  | `2`         | `0`         | absent  |
| `binary.dat`     | `binary.dat`     | `"A"`  | `null`      | `null`      | present |
| `café.md`        | `café.md`        | `"A"`  | `2`         | `0`         | present |
| `new`+LF+`line`  | `new`+LF+`line`  | `"A"`  | `2`         | `0`         | absent  |
| `quote"name`     | `quote"name`     | `"A"`  | `2`         | `0`         | absent  |
| `tab`+TAB+`name` | `tab`+TAB+`name` | `"A"`  | `2`         | `0`         | absent  |
| `中文.txt`       | `中文.txt`       | `"A"`  | `2`         | `0`         | present |
| `old.txt`        | `目录/新.txt`    | `"R"`  | `0`         | `0`         | present |

Then, for every path in that list except `binary.dat` (the new path for the rename), all at once:

- the client's `show` with the arguments `--end-of-options` and `U:<path>` resolves to exactly the file's content (`one\ntwo\n`, or `moved\n` for `目录/新.txt`), so the returned path can address the file at that revision;
- `sourceFile(client, U, path)` resolves to an object whose `hash` is `U`;
- `loadHistory(client, { text: "", author: "", since: "", until: "", path, revision: "", follow: false }, 0)` resolves to a page whose first entry's `hash` is `U`;
- `loadRestorePlan(client, U, path, path)` resolves to a plan whose `destination` is `path`.

What makes these names hard is that Git quotes or escapes them in its default output: plain `git diff-tree` in R3 prints, for example, `"caf\303\251.md"`, `"tab\tname"` and `"back\\slash"` in quotes with octal escapes, and without rename detection shows `old.txt` deleted and `目录/新.txt` added. `0:foo` contains a colon, which Git's `<revision>:<path>` notation also uses.

Missing commit:

| Case | Fixture, request                                                                 | Expected                                                |
| ---- | -------------------------------------------------------------------------------- | ------------------------------------------------------- |
| D-9  | R1, `commitHash: "deadbeef1234"` (hexadecimal, names no object), `"Author Date"` | Exact: `{ commitDetails: null }`. The promise resolves. |

D-1 to D-9 above are 8 tests: D-6 and D-7 share one.

#### Observed results

- R1: `{ hash: I, parents: [], author: "T", email: "t@t.com", date: now, committer: "T", body: "init", fileChanges: [ { oldFilePath: "f", newFilePath: "f", type: "A", additions: 1, deletions: 0 } ] }`, the same for either date type.
- R2: `fileChanges: [ { oldFilePath: "f", newFilePath: "f", type: "M", additions: 1, deletions: 1 } ]`, `body: "mod"`.
- R3: exactly the table above (Linux), in Git's order: `0:foo`, `back\slash`, `binary.dat`, `café.md`, `new⏎line`, `quote"name`, `tab⇥name`, `中文.txt`, then the rename. For each text path `sourceFile` gave mode `100644`, `loadHistory` one entry (`U`, `more: false`), and `loadRestorePlan` `{ source: U, sourcePath: path, destination: path, dirty: false, snapshot: <hash> }`.
- R4 merge: `parents: [<main commit>, <side commit>]`, `body: "Merge branch 'side'"`, `fileChanges: [ { oldFilePath: "side", newFilePath: "side", type: "A", additions: 1, deletions: 0 } ]`. The empty commit: `fileChanges: []`.

#### Timing and platform notes

D-8 is the slowest case in the group (about 450 ms, many Git processes run concurrently); the others take 5–150 ms. On Windows, the five names that Windows file systems cannot hold as ordinary names (TAB, LF, `"`, `\`, `:`) are neither written nor expected, leaving `中文.txt`, `café.md`, `binary.dat` and the rename. The non-ASCII names are written in NFC and must come back unchanged, which on macOS relies on Git's default `core.precomposeUnicode` there. No case depends on another; R1 is only read.

### 3.4 `tests/backend/queries/signedCommits.test.ts` (1 test)

**Purpose.** Repository settings can make Git add signature status lines and colour codes to log output. With such settings and signed commits in place, seven queries that parse commit subjects must still return the plain subjects:

| Query                                       | Module (all under `src/backend/queries/`)                  |
| ------------------------------------------- | ---------------------------------------------------------- |
| `loadCommits`                               | `loadCommits.ts`                                           |
| `commitDetails`                             | `commitDetails.ts`                                         |
| `loadHistory`                               | `history.ts`                                               |
| `loadBatchPlan`                             | `history.ts`                                               |
| `repositoryQuery` with `kind: "rebasePlan"` | `repository.ts`                                            |
| `loadSyncPlan`                              | `workflows.ts`                                             |
| `repositoryQuery` with `kind: "bisect"`     | `repository.ts`, which reads the state through `bisect.ts` |

Each call gets a new client from `createGit(<repository>, "git")`.

#### Fixture (built before the test, deleted after it)

1. `makeRepo()`, whose commit `init` is `I`.
2. A second folder next to it in the same temporary directory (prefix `ngg-remote-`) holding a bare clone of the repository (`git clone -q --bare`), so the remote's `main` is `I`.
3. In the repository: remote `origin` pointing at that folder, then a quiet `git fetch origin` (so `origin/main` is `I`).
4. Repository-level `log.showSignature=true` and `color.ui=always`.
5. Two signed commits on `main`, made by writing commit objects directly (no signing program is involved):
   - For each: write a file (`a` for the first, `b` for the second) whose content is the subject plus a newline, stage it, and take the index's tree (`git write-tree`) and the current HEAD as parent.
   - The raw commit object is, line by line: `tree <tree>`, `parent <parent>`, `author T <t@t.com> 1700000000 +0000`, `committer T <t@t.com> 1700000000 +0000`, then a `gpgsig` header holding an SSH signature armour over three lines (`-----BEGIN SSH SIGNATURE-----`, a continuation line with the base64 text `U1NIU0lHAAAAAQ==`, which decodes to the `SSHSIG` magic and version 1 and nothing else, and `-----END SSH SIGNATURE-----`; continuation lines start with one space), an empty line, the subject, and a final newline.
   - The object is stored with `git hash-object -t commit -w --stdin`, and `git update-ref HEAD <id>` moves `main` to it.
   - First commit: file `a`, subject `first signed` (`F`, parent `I`). Second: file `b`, subject `second signed` (`G`, parent `F`). Afterwards the work tree and index match `G`: the tree is clean.

Observed with Git 2.55: plain `git log --format=%s -2` in this repository prints a red `No signature` line (ANSI escape codes around it) before each subject on standard output. With `GIT_TRACE=1`, a `git log --show-signature` on such a commit starts no other process and writes an error to standard error saying that `gpg.ssh.allowedSignersFile` must be configured, so neither `gpg` nor `ssh-keygen` has to be installed.

#### Checks, in order

| Step | Call                                                                                                                                              | Expected                                                                                                                                                                                      |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0    | The test runs plain `git log --format=%s -2` itself, without the backend's overrides.                                                             | Its output is not exactly `second signed`, newline, `first signed`, newline. If a Git version ignored the settings, the later steps would pass for the wrong reason; this step fails instead. |
| 1    | `loadCommits` with `branchName: ""`, `maxCommits: 10`, `showRemoteBranches: true`, `hard: false`, `"Author Date"`, `showUncommittedChanges: true` | The `message`s are exactly `["second signed", "first signed", "init"]` (so there is also no uncommitted-changes row), and `moreCommitsAvailable` is `false`.                                  |
| 2    | `commitDetails` with `commitHash: G`, `"Author Date"`                                                                                             | `commitDetails` partially matches `{ hash: G, body: "second signed" }`, and its `newFilePath`s are exactly `["b"]`.                                                                           |
| 3    | `loadHistory(client, { text: "", author: "", since: "", until: "", path: "", revision: "", follow: false }, 0)`                                   | The entries' `message`s are exactly `["second signed", "first signed", "init"]`.                                                                                                              |
| 4    | `loadBatchPlan(client, [F, G])`                                                                                                                   | The entries' `message`s are exactly `["first signed", "second signed"]` (the order given).                                                                                                    |
| 5    | `repositoryQuery(client, { kind: "rebasePlan", base: I, autosquash: false })`                                                                     | The result's `kind` is `"rebasePlan"` and its `plan.entries`' `message`s are exactly `["first signed", "second signed"]`.                                                                     |
| 6    | `loadSyncPlan(client, "main", "origin", "main")`                                                                                                  | `outgoing.entries`' `message`s are exactly `["second signed", "first signed"]`.                                                                                                               |
| 7    | The test runs `git bisect start G I` (bad `G`, good `I`), which checks out `F`; then `repositoryQuery(client, { kind: "bisect" })`                | The result's `kind` is `"bisect"` and `state.subject` is `"first signed"`. `git bisect reset` runs afterwards, also on failure.                                                               |

#### Observed results

- Step 1: `G` (`date: 1700000000`, label `main`), `F` (`1700000000`), `I` (now, labels `origin/HEAD` and `origin/main`), `head: G`, `uncommittedChanges: 0`. The signed commits are older than their parent, and still come first.
- Step 2: `{ hash: G, parents: [F], author: "T", email: "t@t.com", date: 1700000000, committer: "T", body: "second signed", fileChanges: [ { oldFilePath: "b", newFilePath: "b", type: "A", additions: 1, deletions: 0 } ] }`.
- Step 5: `plan` = `{ base: I, head: G, branch: "main", entries: [ { hash: F, action: "pick", message: "first signed" }, { hash: G, action: "pick", message: "second signed" } ] }`.
- Step 6: `remoteHead: I`, `incoming` empty, `ahead: 2`, `behind: 0`, `canFastForward: false`.
- Step 7: `state` has `original: "main"`, `head: F`, `good: [I]`, `bad: G`, `remaining: 2`, `firstBad: null`, `ambiguous: false`, terms `good`/`bad`.

#### Timing and platform notes

About 300 ms. Nothing is platform-specific: the commit object is passed on standard input with LF line endings, and file names are ASCII. Step 0 only checks that the output differs, so it holds whatever language Git prints the extra line in. Step 7 leaves no bisect state behind. The clean-up deletes both folders without retries.

---

## 4. Coverage

Measured on Linux with Git 2.55.0 by running the backend project with V8 coverage, overriding the repository's coverage settings so that `src/backend/**` is measured instead of `menus.tsx`:

```sh
pnpm exec vitest run --project backend --coverage --coverage.include='src/backend/**' \
  --coverage.reporter=text --coverage.reporter=json-summary <test files>
```

Run once with all four files and once with each file alone. The helper module is not measured (it is not under `src/`). Files not listed were not reached (0 %).

**All four files together** (covered / total):

| Product file                            | Statements        | Branches         | Functions       | Lines             |
| --------------------------------------- | ----------------- | ---------------- | --------------- | ----------------- |
| `src/backend/gitClient.ts`              | 13/23 (56.5 %)    | 2/4 (50 %)       | 4/10 (40 %)     | 13/23 (56.5 %)    |
| `src/backend/queries/bisect.ts`         | 24/26 (92.3 %)    | 21/29 (72.4 %)   | 9/10 (90 %)     | 20/21 (95.2 %)    |
| `src/backend/queries/commitDetails.ts`  | 51/56 (91.1 %)    | 41/48 (85.4 %)   | 9/9 (100 %)     | 49/54 (90.7 %)    |
| `src/backend/queries/history.ts`        | 38/86 (44.2 %)    | 28/70 (40 %)     | 7/12 (58.3 %)   | 37/83 (44.6 %)    |
| `src/backend/queries/loadBranches.ts`   | 9/9 (100 %)       | 4/4 (100 %)      | 3/3 (100 %)     | 9/9 (100 %)       |
| `src/backend/queries/loadCommits.ts`    | 60/71 (84.5 %)    | 39/49 (79.6 %)   | 7/10 (70 %)     | 57/67 (85.1 %)    |
| `src/backend/queries/repository.ts`     | 21/80 (26.3 %)    | 7/77 (9.1 %)     | 6/18 (33.3 %)   | 19/76 (25 %)      |
| `src/backend/queries/workflows.ts`      | 7/45 (15.6 %)     | 5/24 (20.8 %)    | 1/13 (7.7 %)    | 7/43 (16.3 %)     |
| `src/backend/utils/history.ts`          | 62/88 (70.5 %)    | 37/67 (55.2 %)   | 13/16 (81.3 %)  | 58/82 (70.7 %)    |
| `src/backend/utils/refs.ts`             | 8/9 (88.9 %)      | 7/8 (87.5 %)     | 5/6 (83.3 %)    | 8/8 (100 %)       |
| `src/backend/utils/remoteVisibility.ts` | 24/29 (82.8 %)    | 10/17 (58.8 %)   | 7/8 (87.5 %)    | 22/26 (84.6 %)    |
| `src/backend/utils/validation.ts`       | 7/26 (26.9 %)     | 6/17 (35.3 %)    | 6/13 (46.2 %)   | 6/24 (25 %)       |
| All of `src/backend`                    | 324/1210 (26.8 %) | 207/901 (23.0 %) | 77/260 (29.6 %) | 305/1156 (26.4 %) |

**Each file alone** (lines covered / total):

| Product file                            | commit list (§3.1) | branch list (§3.2) | commit details (§3.3) | signed commits (§3.4) |
| --------------------------------------- | ------------------ | ------------------ | --------------------- | --------------------- |
| `src/backend/gitClient.ts`              | 13/23              | 13/23              | 13/23                 | 13/23                 |
| `src/backend/queries/bisect.ts`         | –                  | –                  | –                     | 20/21                 |
| `src/backend/queries/commitDetails.ts`  | –                  | –                  | 49/54                 | 46/54                 |
| `src/backend/queries/history.ts`        | –                  | –                  | 30/83                 | 27/83                 |
| `src/backend/queries/loadBranches.ts`   | –                  | 9/9                | –                     | –                     |
| `src/backend/queries/loadCommits.ts`    | 56/67              | –                  | –                     | 55/67                 |
| `src/backend/queries/repository.ts`     | –                  | –                  | –                     | 19/76                 |
| `src/backend/queries/workflows.ts`      | –                  | –                  | –                     | 7/43                  |
| `src/backend/utils/history.ts`          | –                  | –                  | 58/82                 | 18/82                 |
| `src/backend/utils/refs.ts`             | 1/8                | 7/8                | –                     | –                     |
| `src/backend/utils/remoteVisibility.ts` | 22/26              | 7/26               | 6/26                  | 6/26                  |
| `src/backend/utils/validation.ts`       | –                  | –                  | 1/24                  | 6/24                  |

What these files leave unreached in the modules they are about: in `loadCommits.ts`, the rejection of malformed log output, tag labels (lightweight and peeled annotated), refs outside the branch, tag and remote namespaces, a page size that is not a positive number, and the handling of a failed status read (as in a bare repository); in `commitDetails.ts`, the early `null` for range notations and the checks that reject malformed Git output; in `refs.ts`, a branch filter naming a remote-tracking branch and a failed read of HEAD; in `remoteVisibility.ts`, hiding a remote that has another remote configured below it. `loadBranches.ts` is fully covered. Other backend test files reach most of the rest (§5).

No CI threshold depends on these files. The only threshold (functions ≥ 80 % for `src/webview/lib/menus.tsx`) comes from the `webview` project. The new files should reach at least the figures above for the modules they are about: `loadCommits.ts`, `loadBranches.ts`, `commitDetails.ts`, and, through the signed-commit test, `bisect.ts`.

---

## 5. Gaps

Behaviours of the exercised modules that these four files do not check. Where another backend test file already checks something, it is named; the rewrite need not repeat it. Items without such a note were not found in any other test file and are cheap to add to the fixtures above.

**`loadCommits`**

1. Several cases check types, not values (C-1, C-2, C-3, C-9, C-15). With T2 the whole result is known (§3.1, observed results): commits `S` then `I` with their exact parents, `author: "T"`, `email: "t@t.com"`, messages, and the single `main` label on `S`. Asserting that list exactly is cheap and makes C-9 fail if the branch filter were ignored.
2. C-6 cannot fail if remote labels were never produced. Pair it with the same fixture and `showRemoteBranches: true`, expecting `origin/main` (and, with Git 2.48 or later, `origin/HEAD`) as `remote` labels on the remote's tip. (`loadCommits/labels.test.ts` checks remote labels on its own fixture.)
3. C-15 does not tell the two dates apart. A commit with different author and committer dates (`GIT_AUTHOR_DATE`, `GIT_COMMITTER_DATE`) gives each value exactly. (`loadCommits/page.test.ts` does this.)
4. C-8 checks only HEAD's commit. The same fixture can also assert that `I` keeps its `main` label and that `origin/topic` appears when `hiddenRemotes` is left out.
5. Tag labels, malformed log output, bare repositories and page-size clamping are not reached here. (`loadCommits/labels.test.ts`, `records.test.ts`, `content.test.ts`, `uncommitted.test.ts` and `page.test.ts` check them.)

**`loadBranches`**

6. B-12 accepts any rejection. It could also assert that a folder inside a fresh temporary directory, known not to be a repository, rejects (tests-q Q1), and that a folder that does not exist makes `createGit` throw before `loadBranches` is called.
7. `hiddenRemotes` is never passed here. (`loadBranches/entries.test.ts` checks it, and branch order under `branch.sort`.)
8. B-2 checks only membership. With LB the whole list is known: `["main", "feature/foo"]`.

**`commitDetails`**

9. D-1 and D-2 cannot tell author from committer dates, and D-3 accepts any body containing `init` (the observed body is exactly `init`). (`commitDetails/header.test.ts` checks exact dates and identities.)
10. D-5 does not check values. R2 gives exactly `[ { oldFilePath: "f", newFilePath: "f", type: "M", additions: 1, deletions: 1 } ]`.
11. D-4 only checks that the root commit lists something. R1 gives exactly one entry, `{ oldFilePath: "f", newFilePath: "f", type: "A", additions: 1, deletions: 0 }`.
12. The merge case checks only paths. Its entry is exactly `{ oldFilePath: "side", newFilePath: "side", type: "A", additions: 1, deletions: 0 }`, and `parents` lists the `main` commit first. (`commitDetails/files.test.ts` covers deletions, type changes and more renames; `commitDetails/inputs.test.ts` covers ranges, tags and option-like input.)

**Signed commits (§3.4)**

13. The fixture already has two signed commits and a remote. With it, other log-reading views can be checked cheaply: a two-commit comparison (`compareCommits` or `loadComparison` in `history.ts`) between `I` and `G`, the reflog page (`loadReflog`), a stash made on top of `G` (`loadStashes` in `repository.ts`), and `loadCommits` with `branchName: "main"`. None of these is checked with signed commits anywhere: the hostile CI run turns on `log.showSignature` for the whole suite, but every other test makes unsigned commits, so this file is the only one in which Git actually prints signature lines.
14. Step 7 checks only `state.subject`. The observed state (§3.4) could be asserted in full apart from `id`, and marking `F` bad (`git bisect bad`) makes Git name the first bad commit, which exercises the `firstBad` path with a signed commit.

**`tests/backend/helpers.ts`**

15. The helper has no tests of its own, and none are needed for the rewrite. Callers check it indirectly: every repository-building test fails if `makeRepo` changes identity, branch, content or path form.

---

## 6. Questions

Current behaviour is stated; nothing here is decided.

**tests-q Q1. The branch list's non-repository case uses the machine's temporary folder.** B-12 passes the system temporary folder itself as `repo`. It only rejects because that folder is not inside a Git work tree. On a machine whose `TMPDIR` lies inside a checkout, or with `GIT_DIR` set, the call resolves and the test fails. A new empty folder under the temporary directory has the same dependence, unless `GIT_CEILING_DIRECTORIES` is set for the call. Should the rewrite keep using the temporary folder, use a new empty folder, or also bound Git's repository search?

**tests-q Q2. Weak and duplicate checks in the commit-list file.** C-2 repeats half of C-1; C-3 repeats the same shape with `hard: true`. C-6, C-9 and C-15 would still pass if, respectively, remote labels were never produced, the branch filter were ignored, or the author date were always used. C-12 and C-13 run the same assertions on a repository without remotes, so the parameter changes nothing observable. Keep them as they are, strengthen them (§5 items 1–3), or drop the duplicates?

**tests-q Q3. Weak and duplicate checks in the commit-details file.** D-1 and D-2 are identical apart from `dateType` and cannot tell the dates apart; D-3 and D-4 are implied by values that could be asserted exactly; D-5 checks only that the counts are numbers. Keep, strengthen (§5 items 9–12), or merge?

**tests-q Q4. The commit-details file also tests another module.** D-8 checks `sourceFile`, `loadHistory`, `loadRestorePlan` from `history.ts` and the client's `show` with every hard name. Those checks belong to the history queries. Should the rewrite keep them in the commit-details file, where they share the fixture, or move them to a history test?

**tests-q Q5. The signed-commit precondition depends on Git's behaviour.** Step 0 asserts that Git's own output is corrupted by the fixture. It relies on Git 2.x printing an extra line for a signature it cannot check, and on no allowed-signers file being configured (the machine could inject one through `GIT_CONFIG_COUNT`/`GIT_CONFIG_KEY_n`, which `GIT_CONFIG_NOSYSTEM` does not stop; then Git would run `ssh-keygen`). If a future Git stopped printing that line, step 0 would fail although the product is fine. Keep step 0?

**tests-q Q6. Clean-up is uneven.** The branch-list file never deletes the remote repository of its RP fixture, so every run leaves one `ngg-test-*` folder behind. The four files delete their folders without retries, unlike `freshRepo` (5 retries); on Windows a Git process that has not quite exited can make a deletion fail and fail the hook. The unborn repository of C-14 is not made through the canonical-path route. Should the rewrite delete every folder it makes, with retries, and canonicalise every path?

**tests-q Q7. `makeRepo` falls back for a Git without `init -b`.** The fallback helps only Git versions older than 2.28, yet C-14 and other callers run `git init -b main` directly, and no minimum Git version is declared anywhere. Keep the fallback in the rewritten helper, or require a Git that supports `init -b`?

**tests-q Q8. `makeRepo` disables signing twice.** It writes `commit.gpgsign=false` and `tag.gpgsign=false` into every repository, although the setup file's global configuration already sets both for every test that can import the helper. Keep the repository-level settings (they protect a caller that runs Git with a different global configuration), or rely on the fixture?

**tests-q Q9. `makeRepo` uses the current time.** Two repositories made in the same second get the same root commit ID; made a second apart they do not. RP (§3.1, §3.2) is therefore sometimes one history and sometimes two unrelated ones. No current assertion depends on it, and callers of the helper may rely on `init` being "now" (for example ordering against their own later commits). Should the helper pin the dates of `init`, or should the fixtures that pair two repositories use a clone instead?

**tests-q Q10. One mutable repository is shared by five branch-list cases.** BZ is changed by every case that uses it, and each case restores `main` in a `finally`. They pass in any order today, but a failure that leaves a rebase or bisect in progress can make the remaining cases fail too. `freshRepo` exists for per-test repositories. Keep the shared repository (faster), or build BZ per case?

**tests-q Q11. Overlapping branch-list cases.** B-4 (detached at the commit's ID in DH) and B-9 (detached at `HEAD` in BZ) check the same state; B-1 and B-2 use the same call. Merge them in the rewrite, or keep them apart?

---

## Decisions

These decisions are the maintainer's answers to the questions above; where they differ from the rest of this specification, they win. Throughout, every new test must be able to fail when the behaviour it names breaks, and the new files together must cover at least what §4 reports for each product file.

- **Q1.** The non-repository case uses a fresh empty folder of its own, with `GIT_CEILING_DIRECTORIES` set to that folder's parent for the call and `GIT_DIR` and `GIT_WORK_TREE` unset, so a temp folder inside a work tree cannot change the result.
- **Q2.** Drop the repeated shape checks, keeping one. Give the branch filter, remote-off and commit-date cases fixtures in which the wrong result differs from the right one: commits that the filter or the remote setting must leave out, and author dates that differ from committer dates. The parameter that changes nothing observable is either given a case where its effect shows, or not tested.
- **Q3.** Tell the two date types apart with commits whose author and committer dates differ, and assert line counts and the body exactly.
- **Q4.** Move the checks of `sourceFile`, `loadHistory` and `loadRestorePlan` to a new `tests/backend/queries/history.test.ts`, named for the module they test.
- **Q5.** Assert on what the product returns, not on Git's own wording, and clear any signing configuration injected through the environment (`GIT_CONFIG_COUNT` and the `GIT_CONFIG_KEY_*` / `GIT_CONFIG_VALUE_*` pairs) for the test.
- **Q6.** Remove every folder a test creates, with `fs.rmSync(path, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })`, and make every temporary path canonical with `fs.realpathSync.native`.
- **Q7.** Keep the fallback for Git without `init -b`; it is cheap.
- **Q8.** Keep the repository-level signing settings: the hostile-configuration run can override the global ones.
- **Q9.** Leave `makeRepo`'s dates as they are. A test that needs two related repositories clones one from the other instead of relying on equal root commits.
- **Q10.** Cases that change the repository each get their own; read-only cases may share one.
- **Q11.** Remove the overlapping cases, keeping the one that checks more.
