# Clean-room specification: tests of the branch, tag, commit and merge actions

This document says what fourteen backend test files check, so that they can be deleted and written again by someone who never sees them or their history. It describes behaviour and data: the repositories each file builds, the calls it makes, and what it expects afterwards. It does not describe how the current files are laid out. The implementer is free to name, group and order the new tests as they like, as long as every check listed here is made, on the same kind of data, with at least the same strength (exact where this document says exact, partial where it says partial).

It also describes the shared set-up in two further files that are not rewritten but hold one inherited declaration each (§1.6).

| Section | File (under `tests/backend/actions/`) | Product functions exercised                                         | Tests            |
| ------- | ------------------------------------- | ------------------------------------------------------------------- | ---------------- |
| 2.1     | `branch/rename.test.ts`               | `renameBranch`                                                      | 3                |
| 2.2     | `branch/create.test.ts`               | `createBranch`                                                      | 3                |
| 2.3     | `branch/delete.test.ts`               | `deleteBranch`                                                      | 4                |
| 2.4     | `branch/checkout.test.ts`             | `checkoutBranch`                                                    | 12               |
| 2.5     | `tag/add.test.ts`                     | `addTag`                                                            | 4                |
| 2.6     | `tag/push.test.ts`                    | `pushTag`                                                           | 2                |
| 2.7     | `tag/delete.test.ts`                  | `deleteTag`                                                         | 2                |
| 2.8     | `commit/cherrypick.test.ts`           | `cherrypickCommit`                                                  | 2                |
| 2.9     | `commit/revert.test.ts`               | `revertCommit`                                                      | 2                |
| 2.10    | `commit/reset.test.ts`                | `resetToCommit`                                                     | 4                |
| 2.11    | `commit/checkout.test.ts`             | `checkoutCommit`                                                    | 2                |
| 2.12    | `merge/mergeCommit.test.ts`           | `mergeCommit`                                                       | 3                |
| 2.13    | `merge/mergeBranch.test.ts`           | `mergeBranch`                                                       | 3                |
| 2.14    | `merge/conflicts.test.ts`             | `mergeBranch`, `mergeCommit`, through a translating fake executable | 3 (2 on Windows) |

All 49 tests pass today (§1.3).

---

## 1. Scope and rules

### 1.1 What is rewritten

Each of the fourteen files in the table is deleted and written again **at the same path**, whole. The rewrite may split a file's checks into more tests or merge them into fewer, but every check in its section below must survive, and no check may move to another file (other groups own the neighbouring files, and the coverage in §3 is counted per file set).

Nothing in the product changes. The new tests must pass against the current `src/` unchanged.

The two files in §1.6 are **not** rewritten. Only their inherited declaration of the shared repository variable is restructured, and none of their tests may change.

### 1.2 How the files are run

- **Runner.** Vitest 4.1.11, project `backend` of `vitest.config.ts`. That project takes every `tests/backend/**/*.test.ts`; nothing in `vitest.config.ts` or `package.json` names any of these files individually. Run the group with `pnpm exec vitest run --project backend <files>`; `pnpm test` runs the backend project first, then `extension`, then `webview`.
- **Imports.** No globals: tests import `describe`, `it`, `expect` and the hooks from `vitest`. Two path aliases exist in the backend project: `@/` for `src/` and `@tests/` for `tests/`. Product modules are imported as `@/backend/...`, the shared helpers as `@tests/backend/helpers`.
- **Environment.** Node (Vitest's default). No DOM, no `vscode` mock (that alias exists only in the `extension` project).
- **Setup file.** `tests/git-config.ts` runs before each file. It points `GIT_CONFIG_GLOBAL` at `tests/fixtures/gitconfig`, or at `tests/fixtures/hostile.gitconfig` when `NGG_HOSTILE_GIT_CONFIG` is `1`, and sets `GIT_CONFIG_NOSYSTEM=1`. Every Git process, whether a test starts it or the product does, inherits this. The normal fixture sets a user name and e-mail, `init.defaultBranch=main`, commit and tag signing off, and automatic maintenance off. The hostile fixture includes the normal one and adds output-changing settings: colour always on (including `color.branch`), `log.showSignature`, full decorations, abbreviated hashes, relative dates, `format.pretty=oneline`, `core.quotePath`, short status with branch and **no untracked files**, reverse-date sorting of branches and tags, and `column.ui=always`.
- **Timeouts.** The backend project sets `testTimeout` and `hookTimeout` to 30 000 ms, because starting Git processes is slow on Windows runners. No file in this group sets its own timeout. On Linux each test takes 60–270 ms.
- **Hook order.** Vitest's default: `beforeEach` hooks run in the order they were registered, `afterEach` hooks in reverse. §2.6 relies on this.
- **Type-checking, lint and format.** `pnpm run typecheck` includes `tsc -p tests`, which covers `tests/backend/**/*.ts` with the strict base settings (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noUnusedLocals`, `noUnusedParameters`, `verbatimModuleSyntax`, so type-only imports must be written as such). `pnpm run lint` (oxlint) applies to tests too: import groups in the order built-in, external, `@/…`, `@tests/…`, separated by blank lines and sorted alphabetically; built-in modules with the `node:` prefix; braces on every block; no unused variables. `pnpm run format` (oxfmt) must pass.
- **CI.** The `test` job of `.github/workflows/ci.yaml` runs `pnpm run test` on Ubuntu, Windows and macOS with Node 24. On Linux only it then also runs:
  - the backend project in shuffled order (`--sequence.shuffle`), so no test may depend on another having run first;
  - the backend and extension projects with `NGG_HOSTILE_GIT_CONFIG=1` and Git's messages in German (`LANG`/`LC_ALL=de_DE.UTF-8`, `LANGUAGE=de`), after checking that Git really answers in German. So no assertion may depend on the wording of Git's own messages, and none may depend on configuration that the hostile fixture changes.
- **Coverage.** The only coverage configuration is for the `webview` project: `pnpm run test:coverage` measures `src/webview/lib/menus.tsx` alone, with a threshold of 80 % of functions, on Linux in CI. These tests are not part of it and meet no threshold. With the default configuration, `--coverage` on the backend project reports nothing, because `coverage.include` names only that webview file; §3 overrides it.

### 1.3 Observed state before the rewrite

At commit `c1c8e2f`, with Git 2.55.0 first in `PATH`, Node 22.22.2 and Linux, the fourteen files hold 49 tests and all pass, in about 4 s of wall time. They also all pass with `NGG_HOSTILE_GIT_CONFIG=1`. German messages could not be checked locally; CI runs them in German on every push.

Per-file counts are in the table above. `merge/conflicts.test.ts` registers 3 tests on Linux and macOS and 2 on Windows (§2.14).

Rejection messages quoted in §2 as "observed" come from running the same scenarios against the current product with Git 2.55.0 in English. **None of the current tests asserts them** unless §2 says so; they are given so that the implementer can recognise the failure being provoked. Messages that start with `fatal:`, `error:` or `hint:` are Git's own and are translated in other locales.

### 1.4 Shared helpers the files rely on

Every file imports from `tests/backend/helpers.ts` (`@tests/backend/helpers`). Another group is rewriting that file with an **unchanged interface**; the new tests may rely on exactly the behaviour below and nothing else. No file in this group uses `tests/backend/sandbox.ts`, mocks, spies or recording Git wrappers.

| Export      | What these tests rely on                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `makeRepo`  | Returns the absolute, symlink-free (canonical) path of a **new** folder under the system temporary folder whose name starts `ngg-test-`. It holds a non-bare repository on branch `main` with local configuration `user.email`, `user.name`, `commit.gpgsign=false` and `tag.gpgsign=false`, and exactly one commit, with message `init`, containing one file `f` whose content is `x` (no newline). The work tree is clean. The caller deletes the folder.     |
| `freshRepo` | Called once at the top level of a file, with an optional preparation function. Registers a `beforeEach` that makes a repository with `makeRepo` and then passes its path to the preparation function, and an `afterEach` that deletes that folder (recursively, forced, retrying up to 5 times 100 ms apart). Returns a function that gives the current test's repository path; it must be called inside a test or hook, because the path is new for each test. |
| `git`       | Runs the `git` found on `PATH` with the given arguments in the given folder, synchronously, output captured (not shown). Throws when Git exits non-zero. Returns nothing useful.                                                                                                                                                                                                                                                                                |
| `gitOutput` | As `git`, but returns Git's standard output as text with leading and trailing white space removed. Throws when Git exits non-zero; §2.11 relies on that throw.                                                                                                                                                                                                                                                                                                  |
| `refNames`  | Given a ref namespace such as `refs/tags/` and a folder (bare or not), returns the short names (the part after `refs/<kind>/`) of the refs below it, sorted by full ref name, as an array; an empty array when there are none.                                                                                                                                                                                                                                  |

Which file uses which export:

| File                        | `makeRepo` | `freshRepo` | `git` | `gitOutput` | `refNames` |
| --------------------------- | :--------: | :---------: | :---: | :---------: | :--------: |
| `branch/rename.test.ts`     |            |      ✓      |   ✓   |      ✓      |            |
| `branch/create.test.ts`     |            |      ✓      |   ✓   |      ✓      |            |
| `branch/delete.test.ts`     |            |      ✓      |   ✓   |      ✓      |            |
| `branch/checkout.test.ts`   |     ✓      |             |   ✓   |             |            |
| `tag/add.test.ts`           |            |      ✓      |   ✓   |      ✓      |     ✓      |
| `tag/push.test.ts`          |            |      ✓      |   ✓   |             |     ✓      |
| `tag/delete.test.ts`        |            |      ✓      |   ✓   |             |     ✓      |
| `commit/cherrypick.test.ts` |            |      ✓      |   ✓   |      ✓      |            |
| `commit/revert.test.ts`     |            |      ✓      |   ✓   |      ✓      |            |
| `commit/reset.test.ts`      |            |      ✓      |   ✓   |      ✓      |            |
| `commit/checkout.test.ts`   |            |      ✓      |   ✓   |      ✓      |            |
| `merge/mergeCommit.test.ts` |            |      ✓      |   ✓   |      ✓      |            |
| `merge/mergeBranch.test.ts` |            |      ✓      |   ✓   |      ✓      |            |
| `merge/conflicts.test.ts`   |     ✓      |             |   ✓   |             |            |

The rewrite may use any of these exports in any file; the table records current use, not a limit. `branch/checkout.test.ts` and `merge/conflicts.test.ts` today read Git's output with a direct child-process call rather than `gitOutput`; that is not a requirement.

### 1.5 Conventions used in §2

- **Base repository.** What `makeRepo` returns: branch `main`, one commit `I` (message `init`, file `f` = `x`).
- **Client.** Every action call gets a new client from `createGit(<repository path>, "git")` (`src/backend/gitClient.ts`), so the product runs the `git` on `PATH`; only §2.14 also uses a fake executable instead of `"git"`. Where a merge action takes a third argument, the executable, it is the same string as the client's.
- **Unknown commit.** A well-formed 40-digit hexadecimal ID of an object that does not exist: either `deadbeef` written five times, or forty zeros. Both pass the product's own input checks, so the refusal comes from Git.
- **Rejects.** The call's promise is rejected. Unless §2 names a message check, the reason is not inspected. **Exact** means a strict equality check on the value named; **contains** and **matches** are substring and regular-expression checks on the rejection's message.
- **Branches.** "Local branches are exactly [a, b]" means the short names of all refs under `refs/heads/`, sorted, equal that list.
- **State is read with the test's own Git**, after the call has settled, never through the product.
- Branch, tag and file names and commit messages are the ones the current files use. They may be changed unless an assertion depends on them; §2 marks those.
- Every success case awaits the call; none checks the resolved value (the product resolves `undefined`; see §4).

### 1.6 Set-up in `workflows.test.ts` and `repository.test.ts`

These two files in `tests/backend/actions/` are not rewritten; each has one inherited line, the declaration of the module-level variable that holds the current test's repository. The implementer may restructure that declaration (and the hooks around it, if they wish) but must leave every test, and every file-level helper the tests call, working unchanged. What the tests rely on:

**What the variable holds.** A string: the canonical path of the main repository of the test that is running, as returned by `makeRepo` (so a base repository as in §1.5), with no trailing separator and without being re-resolved. Tests use it as a working folder for Git, join file names onto it, clone it, put it in an array for the workspace scan, and pass it to `createGit` and `gitClientFactory`. Keep the value exactly as `makeRepo` returns it: it is already canonical, and nothing in these files resolves it again.

**How it is read.** Under the identifier the tests use today, as a plain value, never through a call. File-level helpers read it lazily: default parameter values and client-making arrow functions evaluate it at call time. Nothing reads it while the file is being collected, and no test assigns it.

**When it is set.** In a `beforeEach` registered at the top level of the file, before any other top-level `beforeEach`, and before any test in any `describe` block (both files also have tests outside `describe`). It is a new repository for every test.

- In `workflows.test.ts` the same hook also resets a list of extra folders to contain just this repository.
- In `repository.test.ts` the same hook also resets that list and then sets three local options in the new repository: `rerere.enabled=false`, `rebase.autoStash=false`, `merge.autoStash=false`.

**When it is removed.** In a top-level `afterEach`: every folder in the list (the repository first, then any extra repositories or folders that the test's helpers created and registered during the test) is deleted recursively, forced, with up to 5 retries 100 ms apart. The list's declaration is not inherited and may stay as it is.

**Observed.** `repository.test.ts` holds 22 tests and `workflows.test.ts` 11; all pass. Using `freshRepo` instead would turn every read of the variable into a call, which changes the tests, so it is not a drop-in replacement.

---

## 2. The files

Each section names the product code, the fixture, the cases, and notes. Case identifiers (R1, C1, …) are this document's own.

### 2.1 `branch/rename.test.ts`

**Product.** `renameBranch(git, { oldName, newName })` from `src/backend/actions/branch.ts`, with a client from `createGit` (`src/backend/gitClient.ts`). On the way it runs the branch-name check of `src/backend/utils/validation.ts` on the new name. No mocks.

**Fixture (new for every test).** Base repository plus a second local branch, `old-name`, pointing at `I`. HEAD stays on `main`. So the local branches are `main` and `old-name`, both at `I`.

| Case | Call                                            | Expected                                                                                                                                   | Observed rejection (not asserted)             |
| ---- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------- |
| R1   | rename `old-name` to `new-name`                 | Resolves. Local branches exactly [`main`, `new-name`]. `new-name` resolves to the same commit that `old-name` resolved to before the call. | —                                             |
| R2   | rename `missing` (no such branch) to `whatever` | Rejects. Local branches exactly [`main`, `old-name`].                                                                                      | `fatal: no branch named 'missing'`            |
| R3   | rename `old-name` to `main` (exists)            | Rejects. Local branches exactly [`main`, `old-name`], so neither was overwritten or lost.                                                  | `fatal: a branch named 'main' already exists` |

**Notes.** All checks are exact. In R1 the commit is read before the call and compared after it. The new names in R2 and R3 are valid branch names, so the rejection comes from Git, not from the product's name check.

### 2.2 `branch/create.test.ts`

**Product.** `createBranch(git, { branchName, commitHash })` from `src/backend/actions/branch.ts`, which also runs the branch-name check. No mocks.

**Fixture (new for every test).** Base repository plus a second, empty commit on `main` (message `second`). So `main` = HEAD = the second commit `S`, and `HEAD^` = `I`.

| Case | Call                                                      | Expected                                                                                                                                 | Observed rejection (not asserted)                      |
| ---- | --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| C1   | create `new-branch` at the full hash of `I`               | Resolves. `refs/heads/new-branch` resolves to `I`. HEAD is still the symbolic ref `refs/heads/main` (the new branch is not checked out). | —                                                      |
| C2   | create `main` at the full hash of `I`                     | Rejects. `main` still resolves to `S`.                                                                                                   | `fatal: a branch named 'main' already exists`          |
| C3   | create `bad-branch` at an unknown commit (`deadbeef` × 5) | Rejects. The only ref under `refs/heads/` is `refs/heads/main` (compared as the full ref name, exactly).                                 | `fatal: not a valid branch point: 'deadbeefdeadbeef…'` |

**Notes.** All checks are exact. C2 shows that creating never moves an existing branch (no force).

### 2.3 `branch/delete.test.ts`

**Product.** `deleteBranch(git, { branchName, forceDelete })` from `src/backend/actions/branch.ts`. No mocks.

**Fixture (new for every test).** Base repository, then:

- branch `merged` at `I` (so it is contained in `main`);
- branch `unmerged` created from `I` and checked out, with one commit adding file `g` = `y` (message free), so its tip is not reachable from `main`;
- `main` checked out again.

Local branches are `main`, `merged`, `unmerged`.

| Case | Call                           | Expected                                                        | Observed rejection (not asserted)                                                 |
| ---- | ------------------------------ | --------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| D1   | delete `merged`, force off     | Resolves. Local branches exactly [`main`, `unmerged`].          | —                                                                                 |
| D2   | delete `unmerged`, force off   | Rejects. Local branches exactly [`main`, `merged`, `unmerged`]. | `error: the branch 'unmerged' is not fully merged`, followed by two `hint:` lines |
| D3   | delete `unmerged`, force on    | Resolves. Local branches exactly [`main`, `merged`].            | —                                                                                 |
| D4   | delete `nonexistent`, force on | Rejects. Local branches exactly [`main`, `merged`, `unmerged`]. | `error: branch 'nonexistent' not found`                                           |

**Notes.** All checks are exact. D1 and D2 together show that "force off" is Git's safe delete; D3 that "force on" removes an unmerged branch; D4 that force does not turn a missing branch into success.

### 2.4 `branch/checkout.test.ts`

**Product.** `checkoutBranch(git, { branchName, remoteBranch, fetch? })` from `src/backend/actions/branch.ts`. Through it: the branch-name check and the remote-ref split of `src/backend/utils/validation.ts`, and the local-branch listing of `src/backend/utils/refs.ts`. No case sets `fetch: true` for a configured remote, so the product never fetches here (§3). No mocks.

**Fixture (new for every test; the file's own hooks, not `freshRepo`).**

1. An **upstream** repository `U`, made with `makeRepo`: non-bare, `main` checked out, commit `I`, `f` = `x`.
2. A **local** repository `L`: a new empty folder under the system temporary folder (prefix `ngg-checkout-`, not made canonical), into which `U` is cloned by its path. `L` then has remote `origin` = `U`, and `main` checked out and tracking `origin/main`, both at `I`.
3. Local configuration of `L`: `user.name`, `user.email`, `commit.gpgsign=false`, `branch.autoSetupMerge=true`, and `merge.autoStash=false` (so that a fast-forward over local changes is refused rather than stashed, whatever else is configured).
4. Branch `other` in `L` at `I`. HEAD stays on `main`.
5. After each test both folders are deleted (recursively, forced, no retries).

Several cases first **advance the upstream**: in `U`, write `remote update` into `f`, stage and commit it; then fetch `origin` in `L`. Call the new commit `N`. Afterwards `origin/main` in `L` is `N`, while `main` and `other` in `L` are still `I`.

Below, "switch to X" means a plain checkout of X run by the test, not by the product; "current branch" is the branch HEAD is attached to; "upstream" is the branch's upstream in abbreviated form; `Lc` is an empty commit the test makes on `main` in `L` (message free). Commits compared after the call are read by the test before it.

- **K1.** Call `other`, remote `null`. Resolves; current branch `other`.
- **K2.** Advance the upstream; switch to `other`. Call `main`, remote `null`. Resolves; current branch `main`; HEAD is `I`. A plain switch does not bring a branch up to date with its remote.
- **K3.** Advance the upstream. Call `from-remote`, remote `origin/main`. Resolves; current branch `from-remote`; HEAD is `N`; upstream is `origin/main`.
- **K4.** Call `nonexistent`, remote `null`. Rejects (reason not inspected). Observed: the product's own message "The branch changed. Refresh the graph and try again."
- **K5.** No advance, so `other` is already where `origin/main` is. Call `other`, remote `origin/main`. Resolves; current branch `other`; HEAD equals the commit `origin/main` resolves to. The product switches to the branch that is there instead of making a new one.
- **K6.** Advance the upstream; switch to `other`. Call `main`, remote `origin/main`. Resolves; current branch `main`; HEAD is `N`; upstream is `origin/main`; `f` in the work tree reads exactly `remote update`.
- **K7.** Advance the upstream; set `merge.ff=false` in `L`; HEAD stays on `main`. Call `main`, remote `origin/main`. Resolves; HEAD is `N` itself, so no merge commit was made even though that setting asks Git for one; porcelain status is empty.
- **K8.** Make `Lc` on `main`; switch to `other`. `main` is now one commit ahead of `origin/main` (`I`). Call `main`, remote `origin/main`. Resolves; current branch `main`; HEAD is `Lc`. The branch is not moved back to the remote's older commit.
- **K9.** Make `Lc` on `main`; advance the upstream, so `main` and `origin/main` have diverged; stay on `main`. Call `main`, remote `origin/main`. Rejects (reason not inspected); HEAD is `Lc`; porcelain status is empty; `.git/MERGE_HEAD` does not exist. Observed: Git's `hint:` lines about diverging branches, then `fatal: Not possible to fast-forward, aborting.`
- **K10.** Advance the upstream (which changed `f`); write `unfinished local work` into `f` in `L`, uncommitted; HEAD on `main`. Call `main`, remote `origin/main`. Rejects (reason not inspected); HEAD is `I`; `f` reads exactly `unfinished local work`; `.git/MERGE_HEAD` does not exist. Observed: `Updating <old>..<new>`, then Git's error naming `f` as a local change the merge would destroy, then `Aborting`.
- **K11.** Create the ref `refs/remotes/team/mirror/topic` at `I` with plumbing. No remote `team` is configured (only `origin`). First call `mirror/topic`, remote `team/mirror/topic`, `fetch: true`: rejects, and the message **matches** `/no longer configured/` (observed in full: "The remote for 'team/mirror/topic' is no longer configured."). Then the same call with `fetch: false`: resolves; current branch `mirror/topic`; HEAD is `I`; reading `branch.mirror/topic.remote` from `L`'s configuration fails because it is not set (no upstream).
- **K12.** Set `color.branch=always` in `L`; advance the upstream; switch to `other`. Call `main`, remote `origin/main`. Resolves; current branch `main`; HEAD is `N`. The product must not depend on `git branch` output, which this setting fills with colour codes.

**Notes.**

- Every check is exact except K11's message check, a regular-expression match on the product's own, localised message. It is the only message check among the branch tests.
- In K9 and K10 the product first switches to `main`, which is already current, and Git then refuses the fast-forward, so nothing moves.
- K11 needs a ref under `refs/remotes/` that does not start with the name of any configured remote followed by `/`. Its remainder, `mirror/topic`, itself contains a slash, so the branch created has a slash in its name.
- The empty porcelain-status checks in K7 and K9 would not see untracked files under the hostile fixture (`status.showUntrackedFiles=no`); none are expected (tests-a Q4).
- The clone folder is not made canonical, and its clean-up does not retry; see tests-a Q2.

### 2.5 `tag/add.test.ts`

**Product.** `addTag(git, { tagName, commitHash, lightweight, message })` from `src/backend/actions/tag.ts`, which runs the tag-name check of `src/backend/utils/validation.ts`. No mocks.

**Fixture (new for every test).** Base repository. `H` is the full hash of HEAD, read by the test.

| Case | Before the call                                                                                    | Call                                                                         | Expected                                                                                                                                      | Observed rejection (not asserted)                                               |
| ---- | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| T1   | —                                                                                                  | tag `v1.0-lw` at `H`, lightweight, message empty                             | Resolves. The object `refs/tags/v1.0-lw` names is of type `commit` (no tag object), and the ref resolves to `H`.                              | —                                                                               |
| T2   | —                                                                                                  | tag `v1.0` at `H`, annotated, message `Release v1.0`                         | Resolves. The object `refs/tags/v1.0` names is of type `tag`; the tag peeled to a commit is `H`; the tag's subject is exactly `Release v1.0`. | —                                                                               |
| T3   | Add an empty commit (message free); create a lightweight tag `existing` at `HEAD^` with plain Git. | tag `existing` at the new `H`, lightweight, message empty                    | Rejects. `existing` still resolves to the commit it resolved to before the call (the older one).                                              | `fatal: tag 'existing' already exists`                                          |
| T4   | —                                                                                                  | tag `v2.0` at an unknown commit (`deadbeef` × 5), lightweight, message empty | Rejects. There are no tags at all (`refNames` of `refs/tags/` is an empty list).                                                              | `fatal: trying to write ref 'refs/tags/v2.0' with nonexistent object deadbeef…` |

**Notes.** All checks are exact. The subject in T2 depends on the message passed, so the two must match. T3 shows the product never replaces a tag (no force).

### 2.6 `tag/push.test.ts`

**Product.** `pushTag(git, { tagName, remote })` from `src/backend/actions/tag.ts`. Through it: the remote check and tag-name check of `src/backend/utils/validation.ts`, and `runGit` of `src/backend/utils/runGit.ts`, which starts the `git push` process itself. No mocks.

**Fixture (new for every test).** Created in this order, which matters because the second step needs the repository from the first:

1. A base repository (via `freshRepo`).
2. A new empty folder under the system temporary folder (prefix `ngg-test-bare-`, not made canonical), in which an empty **bare** repository is initialised.
3. In the base repository: remote `origin` set to the bare repository's path; `main` pushed to it; then two lightweight tags, `v1.0` and `v2.0`, at HEAD. They are created after the push, so the bare repository starts with no tags.

After each test the bare folder is deleted (recursively, forced, no retries), before `freshRepo` deletes the base repository.

| Case | Call                                 | Expected                                                                        | Observed rejection (not asserted)                                                                                                                             |
| ---- | ------------------------------------ | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1   | push `v1.0` to `origin`              | Resolves. The bare repository's tags are exactly [`v1.0`]; `v2.0` stayed local. | —                                                                                                                                                             |
| P2   | push `v99.0-nonexistent` to `origin` | Rejects. The bare repository has no tags (empty list).                          | A plain `Error` (from `runGit`): `error: src refspec refs/tags/v99.0-nonexistent does not match any`, then `error: failed to push some refs to '<bare path>'` |

**Notes.** All checks are exact. Tags are read from the bare repository with `refNames`, which must therefore work on a bare repository. The tag name in P2 is valid, so the product's own checks pass and the refusal comes from Git.

### 2.7 `tag/delete.test.ts`

**Product.** `deleteTag(git, { tagName })` from `src/backend/actions/tag.ts`. No mocks.

**Fixture (new for every test).** Base repository plus lightweight tags `v1.0` and `v1.1` at HEAD.

| Case | Call                 | Expected                                                              | Observed rejection (not asserted)     |
| ---- | -------------------- | --------------------------------------------------------------------- | ------------------------------------- |
| X1   | delete `v1.0`        | Resolves. Tags are exactly [`v1.1`].                                  | —                                     |
| X2   | delete `nonexistent` | Rejects. Tags are exactly [`v1.0`, `v1.1`]; nothing else was deleted. | `error: tag 'nonexistent' not found.` |

**Notes.** All checks are exact.

### 2.8 `commit/cherrypick.test.ts`

**Product.** `cherrypickCommit(git, { commitHash, parentIndex })` from `src/backend/actions/commit.ts`. No mocks.

**Fixture (new for every test).** Base repository, then:

- branch `side` from `I`, checked out, with one commit `P` that adds file `g` = `cherry` and has the message `cherry commit`;
- `main` checked out again, and an empty commit `M` made on it (message free).

So `main` = `M`, whose parent is `I`, and `P` is not in `main`.

| Case | Call                                  | Expected                                                                                                                                                                               | Observed rejection (not asserted) |
| ---- | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| Y1   | pick `P` (full hash), `parentIndex` 0 | Resolves. The new HEAD's parent is `M` (the `main` tip read before the call); HEAD's subject is exactly `cherry commit`; `g` in the work tree reads exactly `cherry`; HEAD is not `P`. | —                                 |
| Y2   | pick forty zeros, `parentIndex` 0     | Rejects. `main` still resolves to `M`.                                                                                                                                                 | `fatal: bad object 0000…0000`     |

**Notes.** All checks are exact; the last one in Y1 is an inequality. The subject check depends on `P`'s message. `M` is required, not decoration: Git records commit times in whole seconds, so if `main` were still `I` (the parent of `P`), a pick made before the clock ticks over would rebuild `P` bit for bit (tree, parent, author, committer, times, message), and the inequality would fail at random.

### 2.9 `commit/revert.test.ts`

**Product.** `revertCommit(git, { commitHash, parentIndex })` from `src/backend/actions/commit.ts`. No mocks.

**Fixture (new for every test).** Base repository plus one commit `V` that adds file `g` = `revert-me` (message free). HEAD = `V`.

| Case | Call                                    | Expected                                                                                                                                                       | Observed rejection (not asserted) |
| ---- | --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| V1   | revert `V` (full hash), `parentIndex` 0 | Resolves. The new HEAD's parent is `V`; `g` no longer exists in the work tree; porcelain status is empty (the revert was committed, no editor was waited for). | —                                 |
| V2   | revert forty zeros, `parentIndex` 0     | Rejects. HEAD still resolves to `V`.                                                                                                                           | `fatal: bad object 0000…0000`     |

**Notes.** All checks are exact. Observed but not asserted: the revert's subject is Git's default, `Revert "<subject of V>"`. The empty-status check has the same hostile-fixture caveat as §2.4 (tests-a Q4).

### 2.10 `commit/reset.test.ts`

**Product.** `resetToCommit(git, { commitHash, resetMode })` from `src/backend/actions/commit.ts`. The file also imports the type `GitResetMode` from `@/backend/types` for the mode values. No mocks.

**Fixture (new for every test).** Base repository, then `f` changed to `y` and committed (message free) as `S`. So `f` reads `x` in `I` and `y` in `S` (= HEAD), and the work tree and index are clean.

Mode cases. Each resets to the full hash of `I` (read as `HEAD^` before the call), then reads three things and compares them **together, exactly**, as one record:

| Case | `resetMode` | HEAD is `I` afterwards | `f` in the index (staged blob) | `f` in the work tree |
| ---- | ----------- | ---------------------- | ------------------------------ | -------------------- |
| Z1   | `soft`      | yes                    | `y`                            | `y`                  |
| Z2   | `mixed`     | yes                    | `x`                            | `y`                  |
| Z3   | `hard`      | yes                    | `x`                            | `x`                  |

Failure case:

| Case | Call                         | Expected                             | Observed rejection (not asserted)            |
| ---- | ---------------------------- | ------------------------------------ | -------------------------------------------- |
| Z4   | reset to forty zeros, `hard` | Rejects. HEAD still resolves to `S`. | `fatal: Could not parse object '0000…0000'.` |

**Notes.** Z1–Z3 are one scenario with three inputs, so a parameterised test fits. No two expected records are equal, so a product that mapped any mode to another would fail. The index content is the staged blob of `f`, read by path from stage 0.

### 2.11 `commit/checkout.test.ts`

**Product.** `checkoutCommit(git, { commitHash })` from `src/backend/actions/commit.ts`. No mocks.

**Fixture (new for every test).** Base repository plus an empty commit `S` on `main` (message free). HEAD = `main` = `S`; `S`'s parent is `I`.

| Case | Call                      | Expected                                                                                                                                                                                                              | Observed rejection (not asserted)        |
| ---- | ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| W1   | check out `I` (full hash) | Resolves. HEAD resolves to `I`; HEAD is **detached**: asking Git for HEAD's symbolic ref, quietly, exits non-zero, so the helper throws; `main` still resolves to something other than `I` (it was not moved to `I`). | —                                        |
| W2   | check out forty zeros     | Rejects. HEAD is still the symbolic ref `refs/heads/main` (exact).                                                                                                                                                    | `fatal: unable to read tree (0000…0000)` |

**Notes.** W1's detachment check relies on `gitOutput` throwing when Git exits non-zero (§1.4). Its last check is an inequality; it would be as valid, and stronger, to check that `main` is still `S` (§4).

### 2.12 `merge/mergeCommit.test.ts`

**Product.** `mergeCommit(git, { commitHash, createNewCommit }, executable)` from `src/backend/actions/merge.ts`, with the executable `"git"`. Through it, `runGit` of `src/backend/utils/runGit.ts` starts the `git merge` process. No mocks.

**Fixture (new for every test).** Base repository, then branch `feature` from `I`, checked out, with one commit `F` adding file `feature.txt` = `feature` (message free); then `main` checked out again. So `main` = `I` and `F` is one commit ahead: a merge can fast-forward. `F`'s full hash is read by the test.

| Case | Call                                                                | Expected                                                                                                                                                                                        | Observed rejection (not asserted)                                        |
| ---- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| M1   | merge `F` (full hash), no merge commit requested                    | Resolves. `main` resolves to `F` (fast-forward).                                                                                                                                                | —                                                                        |
| M2   | merge `F` (full hash), merge commit requested                       | Resolves. HEAD's first parent is `I` (the `main` tip read before the call); its second parent is `F`; HEAD's subject **matches** the regular expression anchored at the start `Merge commit '`. | —                                                                        |
| M3   | merge an unknown commit (`deadbeef` × 5), no merge commit requested | Rejects. `main` still resolves to `I`.                                                                                                                                                          | A plain `Error`: `merge: deadbeefdeadbeef… - not something we can merge` |

**Notes.** All checks are exact except M2's subject, a prefix match. Observed in full: `Merge commit '<the full hash of F>'`. Git writes this subject itself and does not translate it, which is why the check survives the German CI run.

### 2.13 `merge/mergeBranch.test.ts`

**Product.** `mergeBranch(git, { branchName, createNewCommit }, executable)` from `src/backend/actions/merge.ts`, with the executable `"git"`. No mocks.

**Fixture (new for every test).** The same as §2.12: `main` = `I`, and branch `feature` one commit `F` ahead of it. The subject check in N2 depends on the branch being called `feature`.

| Case | Call                                                         | Expected                                                                                                                                                       | Observed rejection (not asserted)                                                    |
| ---- | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| N1   | merge branch `feature`, no merge commit requested            | Resolves. `main` resolves to the same commit as `feature` (fast-forward).                                                                                      | —                                                                                    |
| N2   | merge branch `feature`, merge commit requested               | Resolves. HEAD's first parent is `I`; its second parent is `F`; HEAD's subject is exactly `Merge branch 'feature'` (the short name, not `refs/heads/feature`). | —                                                                                    |
| N3   | merge branch `nonexistent-branch`, no merge commit requested | Rejects. `main` still resolves to `I`.                                                                                                                         | A plain `Error`: `merge: refs/heads/nonexistent-branch - not something we can merge` |

**Notes.** All checks are exact. Like §2.12, N2's subject is Git's own untranslated merge message.

### 2.14 `merge/conflicts.test.ts`

**Product.** `mergeBranch` and `mergeCommit` from `src/backend/actions/merge.ts`, each called with a client from `createGit(repository, E)` and the same executable `E` as the third argument. The point of the file: the product must recognise a merge that stopped on conflicts **without reading Git's messages**, and for any other failure the rejection must carry Git's text rather than the product's conflict text.

**Fake executable (not on Windows).** A stand-in for a Git that speaks another language. It is a POSIX shell script named `git`, mode `0755`, written by the test into a new folder created next to the repository (same parent folder, prefix `ngg-git-`). When run, it:

1. runs the real `git` found on `PATH` with all the arguments it received;
2. captures that run's standard output and standard error together, as one text;
3. writes that text, followed by a newline, to its **standard output only**, with every `CONFLICT` replaced by `KONFLIKT` and every `Automatic merge failed` replaced by `Automatischer Merge fehlgeschlagen`;
4. exits with the real Git's exit status.

So the fake executable never writes to standard error, prints a newline even when Git printed nothing, and hides the English conflict wording. The folder is made on every platform, but the script is written and used only outside Windows. On Windows, Node starts executables without a POSIX shell, so a `#!` script cannot stand in for `git.exe`.

**Fixture (new for every test; the file's own hooks, not `freshRepo`).** A base repository from `makeRepo`, and the empty folder for the fake executable. Then:

- branch `topic` from `I`, checked out, `f` set to `topic` and committed (message free);
- `main` checked out again, `f` set to `main` and committed (message free).

So `main` and `topic` both changed `f` from `x`, differently: any merge of one into the other conflicts in `f`. After each test both folders are deleted (recursively, forced, no retries).

**Parameterised case (one test per executable).**

| Executable `E`             | Registered on                |
| -------------------------- | ---------------------------- |
| `"git"` (Git's own output) | every platform               |
| the fake executable's path | Linux and macOS, not Windows |

For each `E`, in one test:

1. `mergeBranch` of `topic` into `main`, merge commit requested. Rejects, and the message **contains** `The merge stopped on conflicts` (the opening words of the product's own, localised message; observed in full: "The merge stopped on conflicts. Resolve and stage the conflicted files, then continue or abort the merge from the status strip."). Afterwards `.git/MERGE_HEAD` exists.
2. The test aborts that merge with the real Git.
3. `mergeCommit` of `topic`'s tip (full hash, read with the real Git), no merge commit requested. Rejects, and the message **contains** the same words. (The merge is left stopped; clean-up removes the folder.)

**Single case (every platform, executable `"git"`).** Write `uncommitted` into `f` without staging it. `mergeBranch` of `topic`, merge commit requested. It rejects, and:

- the rejection value is an instance of `Error`;
- its message does **not contain** `The merge stopped on conflicts`;
- its message is not empty after trimming white space (the wording is left unchecked: CI runs Git in German);
- `f` still reads exactly `uncommitted`;
- `.git/MERGE_HEAD` does not exist.

Observed message (English): Git's error naming `f` as a local change the merge would destroy, the advice to commit or stash, `Aborting`, and `Merge with strategy ort failed.`

**Notes.**

- The message checks are substring checks on the product's own text, not on Git's. If the product's conflict message is reworded, the substring must follow it.
- Nothing here checks that `E` is actually the process that ran; with the fake executable the test would also pass if the product ignored `E` and ran the real Git. That the merge process uses the given executable is checked in `merge/mergeState.test.ts`, which is not in this group.
- In the German CI run, the `"git"` case also sees German messages; the fake executable's case is what makes the check independent of the runner's locale.
- On Windows the file registers two tests, on Linux and macOS three. See tests-a Q3.

---

## 3. Coverage

Measured on Linux with Git 2.55.0 first in `PATH`, with the configuration's `coverage.include` overridden, because by default it names only a webview file (§1.2):

```sh
pnpm exec vitest run --project backend --coverage --coverage.include='src/backend/**' \
  --coverage.reporter=text <the fourteen files>
```

**The fourteen files together.** Product files they do not load, or load without running anything, are left out.

| Product file                      | Statements      | Branches       | Functions      | Lines           | Not reached                                                                                                                                                                         |
| --------------------------------- | --------------- | -------------- | -------------- | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/backend/actions/branch.ts`   | 96.55 % (28/29) | 87.5 % (14/16) | 100 % (7/7)    | 96.55 % (28/29) | The fetch before a remote checkout (`fetch: true` with a configured remote).                                                                                                        |
| `src/backend/actions/commit.ts`   | 83.33 % (15/18) | 60 % (6/10)    | 100 % (6/6)    | 83.33 % (15/18) | Refusal of a malformed commit ID; refusal of an invalid parent index; a non-zero parent index (mainline); refusal of an unknown reset mode.                                         |
| `src/backend/actions/merge.ts`    | 87.5 % (14/16)  | 100 % (8/8)    | 66.66 % (4/6)  | 93.33 % (14/15) | The two fallbacks for when a preliminary query itself errors (the `MERGE_HEAD` check, and resolving the branch name); reached only on errors such as cancellation.                  |
| `src/backend/actions/tag.ts`      | 90 % (9/10)     | 75 % (3/4)     | 100 % (3/3)    | 90 % (9/10)     | Refusal of the tag name `HEAD`.                                                                                                                                                     |
| `src/backend/gitClient.ts`        | 60.86 % (14/23) | 50 % (2/4)     | 50 % (5/10)    | 60.86 % (14/23) | `gitClientFactory` and its setters; clients made with an abort signal.                                                                                                              |
| `src/backend/utils/runGit.ts`     | 64.44 % (29/45) | 32 % (8/25)    | 61.53 % (8/13) | 62.79 % (27/43) | Cancellation, spawn failures, blob reading and writing.                                                                                                                             |
| `src/backend/utils/validation.ts` | 57.69 % (15/26) | 47.05 % (8/17) | 69.23 % (9/13) | 58.33 % (14/24) | Every refusal except K11's (a remote-tracking name whose remote is not configured); choosing among several matching remote names; the commit-resolution and current-branch helpers. |
| `src/backend/utils/refs.ts`       | 44.44 % (4/9)   | 0 % (0/8)      | 50 % (3/6)     | 50 % (4/8)      | Everything but the local-branch listing.                                                                                                                                            |

**Each folder alone**, for its own action module:

| Test folder | Product file                    | Statements      | Branches       | Functions     | Lines           |
| ----------- | ------------------------------- | --------------- | -------------- | ------------- | --------------- |
| `branch/`   | `src/backend/actions/branch.ts` | 96.55 % (28/29) | 87.5 % (14/16) | 100 % (7/7)   | 96.55 % (28/29) |
| `tag/`      | `src/backend/actions/tag.ts`    | 90 % (9/10)     | 75 % (3/4)     | 100 % (3/3)   | 90 % (9/10)     |
| `commit/`   | `src/backend/actions/commit.ts` | 83.33 % (15/18) | 60 % (6/10)    | 100 % (6/6)   | 83.33 % (15/18) |
| `merge/`    | `src/backend/actions/merge.ts`  | 87.5 % (14/16)  | 100 % (8/8)    | 66.66 % (4/6) | 93.33 % (14/15) |

So within the group, each action module is reached only by its own folder.

**For comparison**, the whole backend project (590 tests, 589 passed and 1 skipped) covers the four action modules and `gitClient.ts` completely: 100 % of statements (96/96), branches (42/42), functions (32/32) and lines (95/95). Everything this group misses is reached by neighbouring files that are not being rewritten here.

**Thresholds.** None applies. The only threshold in the repository is 80 % of functions for `src/webview/lib/menus.tsx`, measured by `pnpm run test:coverage` on the webview project; these tests do not contribute to it. The rewrite should keep at least the coverage above for each product file.

---

## 4. Gaps

Behaviours of the exercised modules that this group does not check. Where another backend test file already checks one, it is named; those need not be duplicated. The ones marked **cheap** fit into this group's existing fixtures with one call and one or two checks.

**All four modules**

1. **Cheap.** Every success case could check that the action resolves to `undefined`; the message handler treats any other value (a function) as a follow-up to run. Some neighbours check this for a few actions (`branch/remoteCheckout.test.ts`, `commit/operations.test.ts`, `commit/inputs.test.ts`, `merge/mergeState.test.ts`).

**Branches**

2. The fetch before a remote checkout (`fetch: true` with a configured remote): only the chosen branch is fetched, forced into its tracking ref, without tags. Checked in `branch/remoteCheckout.test.ts`.
3. **Cheap.** K11's first call (refused) leaves no branch `mirror/topic` behind and HEAD where it was. Today only the second call's result is checked, and it would pass either way.
4. **Cheap.** K4's rejection is the product's own message; its opening words could be matched, as K11's are (see tests-a Q1 and Q6).
5. Invalid, option-like and `HEAD` branch names are refused before Git runs, for create, rename and checkout. Checked in `branch/localSwitch.test.ts`, `branch/remoteCheckout.test.ts` and `optionLikeRefs.test.ts`.
6. Renaming the checked-out branch moves HEAD along; deleting it is refused even with force. Checked in `branch/localSwitch.test.ts`.
7. **Cheap.** Creating a branch at a revision that is not a full hash (a tag, `HEAD~1`, a remote-tracking name). Only full hashes are used here.

**Tags**

8. **Cheap.** T1 and T2 tag HEAD, so a product that ignored `commitHash` and always tagged HEAD would pass them. Tagging an older commit (for example `I` after an extra commit) and checking where the tag points closes that.
9. **Cheap.** P1 checks only the tag's name in the bare repository, not that it points at HEAD's commit.
10. The tag name `HEAD` is refused; other invalid names are refused; annotating with an empty message; a lightweight tag ignores its message; pushing to an unknown remote names the remote; a remote tag that points elsewhere is not replaced; an annotated tag is pushed as a tag object; pushing from a client opened in a subfolder; cancelling a push. Checked in `tag/tagging.test.ts`.
11. Deleting an option-like tag name (`-d`). Checked in `optionLikeRefs.test.ts`.

**Commits**

12. Malformed commit IDs (not hexadecimal, fewer than four digits, option-like) are refused with the product's own message before Git runs; an unknown reset mode is refused. Checked in `commit/inputs.test.ts`.
13. A non-zero parent index picks or reverts a merge commit against that parent; an invalid index is refused. Checked in `commit/mergeParents.test.ts`, `commit/operations.test.ts` and `commit/inputs.test.ts`.
14. A cherry-pick or revert that conflicts leaves the operation in progress; checking out a commit whose files differ from uncommitted edits is refused and the edits survive. Checked in `commit/operations.test.ts`.
15. **Cheap.** W1 checks only that `main` is not at `I`; it could check that `main` is still exactly `S`.
16. **Cheap.** Reset, checkout, cherry-pick and revert with an abbreviated hash (four or more digits). Partly checked in `commit/inputs.test.ts`.

**Merges**

17. A merge already in progress is refused with Git's message, not the conflict message; the conflict message keeps Git's error as its cause; a branch that shares its name with a tag is merged by its full ref; the merge process is the executable passed in; a cancelled client starts no merge. Checked in `merge/mergeState.test.ts` and `optionLikeRefs.test.ts`.
18. **Cheap.** M2's subject could be matched exactly (`Merge commit '<full hash of F>'`), as N2's is.
19. **Cheap.** After step 3 of §2.14 (`mergeCommit` stopping on conflicts) `.git/MERGE_HEAD` could be checked too, as after step 1.
20. **Cheap.** With no merge commit requested but histories that cannot fast-forward (and do not conflict), Git still makes a merge commit; and merging a commit that is already contained resolves and changes nothing.

**Client**

21. `gitClientFactory`, including replacing the folder or the executable, is checked in `tests/backend/utils/gitClient.test.ts`. Clients made with an abort signal are checked in `networkCancel.test.ts`, `branch/remoteCheckout.test.ts`, `merge/mergeState.test.ts` and `tag/tagging.test.ts`, among others.

---

## 5. Questions

Numbered for reference; nothing here is decided.

- **tests-a Q1.** Most failure cases accept any rejection. The only message checks are K11 (regular expression on the product's message), the conflict cases of §2.14 (substring of the product's message), and the plain-merge-failure case of §2.14 (not the conflict message, not empty). Where the rejection is the product's own text rather than Git's (K4 today), should the rewrite match it, or keep "any rejection" as now? Git's own messages cannot be matched, because CI runs them in German.
- **tests-a Q2.** Three files clean up after themselves instead of using `freshRepo`: §2.4 (the upstream and the clone), §2.6 (the bare repository) and §2.14 (the repository and the fake-executable folder). None of these deletions retries, whereas `freshRepo` retries five times 100 ms apart, and deleting a folder right after Git exits can fail on Windows. The clone and the bare repository are also not made canonical (the fake-executable folder is, since it sits beside a canonical repository). Should the rewrite give these folders the same retrying clean-up, and canonical paths, as `freshRepo`, or keep them as now?
- **tests-a Q3.** On Windows, the fake-executable case of §2.14 is not registered at all, so test reports show 2 tests there and 3 elsewhere, and nothing shows that a check was left out. Should the rewrite register it as skipped on Windows, provide a Windows-runnable fake (for example a Node script behind a `.cmd`), or keep it absent?
- **tests-a Q4.** K7, K9 and V1 check that porcelain status is empty. Under the hostile fixture, `status.showUntrackedFiles=no` hides untracked files from that status, so in the hostile CI run an untracked leftover would go unnoticed. Should those checks ask Git for untracked files explicitly, or stay as now?
- **tests-a Q5.** The checkout fixture of §2.4 sets `branch.autoSetupMerge=true`, which is Git's default. With it, Git sets up tracking by itself whenever a branch is started from `refs/remotes/origin/…`, so K3's upstream check would pass even if the product stopped asking for tracking explicitly. With `false` it would not (observed with Git 2.55: no upstream is set). Neither `true`, `always` nor `false` makes K11's no-upstream check sensitive to the product's explicit choice, because Git 2.55 set up no tracking from a ref of an unconfigured remote under any of them. Should the fixture use `false`, at least for K3?
- **tests-a Q6.** A local checkout (`remoteBranch: null`) of a branch that never existed is refused with "The branch changed. Refresh the graph and try again." (K4). The wording suits a branch deleted since the graph was loaded, less so a name that was never a branch. This is a product question; it matters for the tests only if Q1 decides to match that message.
- **tests-a Q7.** Some checks here repeat checks in neighbouring files that are not being rewritten: K1 (switch to an existing branch) is also in `branch/localSwitch.test.ts`, and K3 (new branch from a remote-tracking branch, tracking it) in `branch/remoteCheckout.test.ts`. §1.1 asks for every check to survive. Should the rewrite keep these duplicates, or may it drop a check that another file makes?

---

## Decisions

These decisions are the maintainer's answers to the questions above; where they differ from the rest of this specification, they win. Every new test must be able to fail when the behaviour it names breaks, and the new files together must cover at least what the coverage section reports for each product file.

- **Q1.** Where the product writes its own message, check that text exactly. Where the message is Git's, check only that the call rejects, and what did not change.
- **Q2.** Yes: remove every folder with `fs.rmSync(path, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })`, and make clone, bare and temporary paths canonical with `fs.realpathSync.native`.
- **Q3.** Register the fake-Git conflict case on every platform and skip it on Windows with `it.skipIf(...)`, with a comment saying why, so the report shows it as skipped.
- **Q4.** Yes: ask Git for untracked files explicitly (`status --porcelain --untracked-files=all`), so the hostile configuration cannot hide them.
- **Q5.** Yes: that case uses `branch.autoSetupMerge=false`, so only the product can have set up the tracking.
- **Q6.** The product's wording is out of scope here; tests check it as it is (Q1).
- **Q7.** Drop checks that repeat `localSwitch.test.ts` and `remoteCheckout.test.ts` unless they add an angle those files lack.
- **Gaps.** Add the cheap ones the specification marks, including a tag created on a commit other than HEAD and a check that the actions resolve to `undefined`.
- **`workflows.test.ts` and `repository.test.ts`.** Restructure only the shared repository variable and its set-up and clean-up; change no test.
