# Clean-room specification: branch, commit, merge and tag actions, the Git client, and the Git helpers

This document says what six backend modules of Branchwise must do, as seen from outside. It is written for an engineer who will build replacements without seeing the current source of these six files. Its sources are the modules' callers, the tests that exercise them, the helpers and types they depend on, Git's and simple-git's documented behaviour, and the results of running the current code against throwaway repositories.

| Section | Module                          | In one sentence                                                                                                                |
| ------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| A       | `src/backend/actions/branch.ts` | Create, delete, rename and check out local branches, including checking out a remote-tracking branch as a local one.           |
| B       | `src/backend/actions/commit.ts` | Check out, cherry-pick, revert and reset to a commit.                                                                          |
| C       | `src/backend/actions/merge.ts`  | Merge a local branch or a commit into the checked-out branch, and recognise a merge that stopped on conflicts in any language. |
| D       | `src/backend/actions/tag.ts`    | Create, delete and push tags.                                                                                                  |
| E       | `src/backend/gitClient.ts`      | Make the simple-git clients the whole backend uses, with the settings and prefix arguments that keep Git's output parseable.   |
| F       | `src/backend/utils/git.ts`      | Three one-process questions about a folder: its work tree's real top level, its initialized submodules, and `origin`'s URL.    |

---

## 0. Ground rules shared by all six modules

### 0.1 How the behaviour was observed

- Repository at commit `937fcf8`. Git 2.43.0, Node v22.22.2, simple-git 3.36.0, Vitest 4.1.11, Linux.
- The six modules (and `runGit`) were bundled with esbuild into a scratch directory. `child_process.spawn` was wrapped so that every Git process, its full argument list, its working directory, whether it was started detached, and the `GIT_TERMINAL_PROMPT` value in its environment were recorded.
- Git read only `tests/fixtures/gitconfig` as its global configuration (`GIT_CONFIG_GLOBAL`, with `GIT_CONFIG_NOSYSTEM=1`), as the backend tests do.
- Every existing test that touches these modules passes: 168 backend tests in 31 files, both with the normal fixture configuration and with `NGG_HOSTILE_GIT_CONFIG=1` (`tests/fixtures/hostile.gitconfig`, which turns on colour, signature display, `status.showUntrackedFiles=no` and more), plus 46 extension tests in 10 files that replace these modules with mocks.
- Git's messages quoted below are Git 2.43's English text. Other Git versions and locales produce other text; nothing in these modules may depend on that text (§0.4).
- In command listings, `<prefix>` stands for the arguments every backend Git process starts with (§E.3.1) and is omitted. `<repo>` stands for a repository's absolute path.

### 0.2 Two ways a module runs Git

Every Git process these modules start goes one of two ways. Which way each command goes is part of the specification, because the two differ in what counts as failure, in the error the caller sees, in cancellation, and in the environment.

**Through the client.** The `SimpleGit` value passed in as `git` (normally made by `createGit`, §E). simple-git runs the command in the client's base directory, with the client's executable and prefix arguments, at most six at a time per client.

- A command **fails only when Git exits non-zero _and_ wrote something to standard error**. A non-zero exit with an empty standard error resolves successfully with Git's standard output (often the empty string). Several behaviours below rely on this, for example `rev-parse --verify --quiet` of a missing name resolving to `""`.
- On failure the promise rejects with simple-git's `GitError`, whose `message` is Git's standard output immediately followed by its standard error, as raw text (usually ending in a newline). Example: `"fatal: a branch named 'main' already exists\n"`.
- If the executable cannot be started, the rejection is a `GitError` whose message is the text of Node's spawn error including its stack trace (for example `"Error: spawn /nonexistent/git ENOENT\n    at ChildProcess._handle.onexit ..."`).
- Cancellation: if the client was made with an abort signal that is already aborted, the command rejects without starting, with simple-git's `GitPluginError` "Abort already signaled". If the signal fires while it runs, simple-git kills the process and rejects with `GitPluginError` "Abort signal received".
- simple-git refuses, before starting any process, argument lists that contain certain option names anywhere before a `--` separator, such as an argument beginning with `--upload-pack`, `--receive-pack` or `--template`. It rejects with a `GitPluginError` such as "Use of --upload-pack or --receive-pack is not permitted without enabling allowUnsafePack". This matters for tag messages (§D, tag Q2).

**Through `runGit`** (from `@/backend/utils/runGit`). Used for network commands and for `merge`.

- The process runs in the top level of the client's work tree (found with one client-run `rev-parse --show-toplevel`), so a client whose base directory is a subfolder still works.
- It gets the same `<prefix>` arguments and the caller's environment with `GIT_TERMINAL_PROMPT=0` added, so a credential prompt fails at once rather than waiting (`networkCancel.test.ts` checks that the SSH command sees `0`).
- It **fails whenever Git exits non-zero**, whatever it printed. The rejection is a plain `Error` whose message is Git's standard output and standard error joined by a newline (each only if non-empty), or `git <subcommand> exited with <code>` if both are empty. If the executable cannot be started, the message is Node's (`"spawn /nonexistent/git ENOENT"`).
- Its executable is, unless the caller passes one, the path recorded for the client by `createGit` (`gitProcessOf`), falling back to `git` for clients made elsewhere.
- Cancellation: if the client was made with an abort signal, aborting ends the Git process and the processes below it (`networkCancel.test.ts` checks that the SSH command stops too) and rejects with the signal's reason (by default a `DOMException` "This operation was aborted"). A signal that is already aborted makes the preceding client-run `rev-parse --show-toplevel` reject with "Abort already signaled".

### 0.3 What callers observe

All four action modules are called from `src/old-extension/messageHandler.ts`, through one registration per command. For each request the handler:

1. refuses the request if another mutating action is running in the same repository (or an overlapping submodule), without calling the module;
2. creates a fresh client with `gitClientFactory(msg.repo, config.gitPath(), controller.signal).getInstance()`, where the controller is aborted by a `cancelAction` message carrying the request's `requestId` (among this document's actions, the webview offers **Stop Git** for `pushTag` and for `checkoutBranch` with `fetch: true`);
3. calls the action with that client and the whole request message (which also carries `command`, `repo` and possibly `requestId`; the actions ignore those fields), plus `config.gitPath()` as a third argument for `mergeBranch` and `mergeCommit` only;
4. posts `{ command, status, requestId?, repo? }` to the webview, where `status` is `null` on success and otherwise the rejection's `message` (or `String(value)` for a non-`Error`). If the controller was aborted, the status is instead the handler's own "The Git operation was cancelled.".

**The actions must resolve to `undefined`.** The handler treats a function returned by an action as a follow-up to call after releasing the repository lock.

The webview shows `status` to the user verbatim (for example in the "Unable to Merge" dialog the UI harness looks for). So the text of every rejection is user-visible.

### 0.4 Localisation

User-facing messages created by these modules and their validation helpers go through `l10n.t` from `@vscode/l10n`. With no bundle loaded, `l10n.t` returns the English text with `{0}` placeholders filled. The English strings are keys of `l10n/bundle.l10n.json` and of the Chinese bundles, and `pnpm run l10n:check` regenerates the English bundle from literal `l10n.t("…")` calls in `src/` and fails if it changes. So a message this specification quotes must be passed to `l10n.t` as that exact literal.

Git's own messages are in the user's locale. No behaviour may be decided by matching Git's text. `tests/backend/actions/merge/conflicts.test.ts` checks this with a wrapper executable that translates Git's conflict messages.

### 0.5 Validation helpers the actions share (from `@/backend/utils/validation`)

These are not part of the six modules but define observable behaviour of the actions, so their contracts are summarised here.

| Helper                         | Git it runs (through the client)                                 | Rejects with                                                                                                                                                                                                                                         |
| ------------------------------ | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `requireBranchName(git, name)` | `check-ref-format --normalize refs/heads/<name>`, unless skipped | `Error("Enter a valid branch name.")` when the name is empty, is `HEAD`, starts with `-` (these three without running Git), or when Git does not print back exactly `refs/heads/<name>` (invalid, or would be rewritten like `a//b`).                |
| `requireTagName(git, name)`    | `check-ref-format --normalize refs/tags/<name>`, unless skipped  | `Error("Enter a valid tag name.")` when empty or starting with `-` (without Git), or when Git does not print back exactly `refs/tags/<name>`. `HEAD` is accepted.                                                                                    |
| `requireRemote(git, remote)`   | `remote` (simple-git `getRemotes()`)                             | `Error("Remote '<remote>' is not configured for this repository.")` unless a configured remote has exactly that name.                                                                                                                                |
| `splitRemoteRef(git, ref)`     | `remote`, then `requireBranchName` on the branch part            | `Error("The remote for '<ref>' is no longer configured.")` when no configured remote name `R` makes `ref` start with `R/`. Otherwise picks the **longest** such `R`, and the remainder must pass `requireBranchName`. Resolves `{ remote, branch }`. |

---

## A. `src/backend/actions/branch.ts`

### A.1 Interface

**Module path:** `src/backend/actions/branch.ts`, imported as `@/backend/actions/branch`. The path must not change: `tests/extension/action-dispatch.test.ts` replaces the module by this path with `vi.mock`.

Four named exports, no default export, no other exports needed.

```ts
export async function createBranch(
  git: SimpleGit,
  input: ActionPayload<"createBranch">
): Promise<void>;
export async function deleteBranch(
  git: SimpleGit,
  input: ActionPayload<"deleteBranch">
): Promise<void>;
export async function renameBranch(
  git: SimpleGit,
  input: ActionPayload<"renameBranch">
): Promise<void>;
export async function checkoutBranch(
  git: SimpleGit,
  input: ActionPayload<"checkoutBranch">
): Promise<void>;
```

`git` is the client for the repository (§0.2). The payload types come from `ActionPayload` in `@/backend/types` (defined in `src/backend/types/actions.types.ts`):

| Payload          | Field          | Type             | Meaning                                                                                                                                                                 |
| ---------------- | -------------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `createBranch`   | `branchName`   | `string`         | Short name of the new local branch, without `refs/heads/`.                                                                                                              |
|                  | `commitHash`   | `string`         | Where the branch starts. The webview sends a full commit hash; Git accepts any revision (a tag, `HEAD~1`, a remote-tracking name).                                      |
| `deleteBranch`   | `branchName`   | `string`         | Short name of an existing local branch. May look like an option (`-D`, `--output=x`): such refs can arrive through clones and fetches.                                  |
|                  | `forceDelete`  | `boolean`        | `true` deletes even if the branch is not merged.                                                                                                                        |
| `renameBranch`   | `oldName`      | `string`         | Short name of an existing local branch; may look like an option.                                                                                                        |
|                  | `newName`      | `string`         | New short name.                                                                                                                                                         |
| `checkoutBranch` | `branchName`   | `string`         | Short name of the local branch to switch to, or to create.                                                                                                              |
|                  | `remoteBranch` | `string \| null` | `null`: switch to the local branch. Otherwise a remote-tracking branch named as it appears below `refs/remotes/`, for example `origin/main` or `team/origin/feature/x`. |
|                  | `fetch`        | `boolean?`       | Only meaningful with a `remoteBranch`: `true` fetches that branch from its remote first. Absent or `false`: no fetch.                                                   |
|                  | `requestId`    | `string?`        | Used by the message handler for cancellation; the module ignores it.                                                                                                    |

**Who uses what**

| User                                            | Exports                                                                       |
| ----------------------------------------------- | ----------------------------------------------------------------------------- |
| `src/old-extension/messageHandler.ts`           | all four, called as `f(git, msg)`                                             |
| `tests/backend/actions/branch/create.test.ts`   | `createBranch`                                                                |
| `tests/backend/actions/branch/delete.test.ts`   | `deleteBranch`                                                                |
| `tests/backend/actions/branch/rename.test.ts`   | `renameBranch`                                                                |
| `tests/backend/actions/branch/checkout.test.ts` | `checkoutBranch`                                                              |
| `tests/backend/actions/optionLikeRefs.test.ts`  | `deleteBranch`, `renameBranch`                                                |
| `tests/backend/utils/validation.test.ts`        | `createBranch`, `renameBranch`                                                |
| `tests/backend/actions/repository.test.ts`      | `checkoutBranch`                                                              |
| `tests/extension/action-dispatch.test.ts`       | mocks the module path; expects all four names, each called with two arguments |

### A.2 Dependencies the implementation must use

| Import                                                                  | For                                                                                                                                                                                      |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `import type { SimpleGit } from "simple-git"`                           | The client parameter.                                                                                                                                                                    |
| `import type { ActionPayload } from "@/backend/types"`                  | Payload types.                                                                                                                                                                           |
| `requireBranchName`, `splitRemoteRef` from `@/backend/utils/validation` | Name validation and remote lookup with the messages in §0.5.                                                                                                                             |
| `runGit` from `@/backend/utils/runGit`                                  | The fetch in `checkoutBranch` (network: prompt disabled, cancellable).                                                                                                                   |
| `refNames` from `@/backend/utils/refs`                                  | Whether a local branch exists. `refNames(git, "refs/heads/")` resolves the short names of all non-symbolic refs under `refs/heads/`, from uncoloured, unlocalised `for-each-ref` output. |

Use the `@/…` alias for repository imports; the lint configuration forbids relative parent imports.

### A.3 Behaviour

#### A.3.1 `createBranch(git, { branchName, commitHash })`

1. Validate `branchName` with `requireBranchName`. Invalid → reject with "Enter a valid branch name." and change nothing.
2. Through the client: `branch -- <branchName> <commitHash>`.

The branch is created at the commit without checking it out; HEAD does not move. Git's own refusals surface as `GitError` with Git's text: an existing branch, an unresolvable start point, a name that clashes with an existing ref directory (`feature` when `feature/x` exists). Because the start point follows `--`, an option-like `commitHash` is treated as a revision, not an option. Git's `branch.autoSetupMerge` still applies: a start point given as a remote-tracking name (for example `origin/main`) sets that branch's upstream.

#### A.3.2 `deleteBranch(git, { branchName, forceDelete })`

Through the client: `branch -d -- <branchName>`, or `branch -D -- <branchName>` when `forceDelete` is true. No validation of the name is done first, so option-like names are deleted as names. Git refuses an unmerged branch without force, the branch checked out in any worktree (even with force), and a missing branch; each surfaces as `GitError` with Git's text.

#### A.3.3 `renameBranch(git, { oldName, newName })`

1. Validate `newName` with `requireBranchName` (only the new name).
2. Through the client: `branch -m -- <oldName> <newName>`.

`-m` (not `-M`) means an existing target is refused. Renaming the checked-out branch moves HEAD with it. Renaming a branch to its own name succeeds and changes nothing. A missing or invalid `oldName` is reported by Git ("fatal: no branch named 'zzz'", "fatal: invalid branch name: 'a..b'").

#### A.3.4 `checkoutBranch(git, input)`

Always first: validate `branchName` with `requireBranchName`; invalid → reject with "Enter a valid branch name." before any other Git process.

**Local checkout (`remoteBranch === null`).** Through the client: `checkout <branchName>`. Nothing else. HEAD ends on the branch; Git refuses when local changes would be overwritten. Other outcomes of Git's own `checkout` rules apply unchanged; see branch Q1.

**Remote checkout (`remoteBranch` is a string).** In this order:

1. **Remote lookup.** Find the remote and branch part of `remoteBranch` as `splitRemoteRef` does (longest configured remote name followed by `/`; the rest must be a valid branch name).
   - With `fetch === true`, a failed lookup rejects: "The remote for '<remoteBranch>' is no longer configured." when no remote matches, or "Enter a valid branch name." when the branch part is invalid (for example `origin/HEAD`). Nothing else happens.
   - With `fetch` absent or `false`, a failed lookup is not an error; the checkout continues without tracking (step 3). The removed-remote case in `checkout.test.ts` depends on this.
2. **Fetch** (only when `fetch === true` and the lookup succeeded). Through `runGit`: `fetch --no-tags -- <remote> +refs/heads/<branch>:refs/remotes/<remoteBranch>`. Only that one remote-tracking ref is updated (forced, so a rewound remote branch is followed); no tags are fetched. Failure rejects with Git's text (for example "fatal: couldn't find remote ref refs/heads/nothere\n") and nothing is checked out. It can be cancelled (§0.2).
3. **Local branch does not exist** (not among `refNames(git, "refs/heads/")`): through the client, `checkout --track -b <branchName> refs/remotes/<remoteBranch>` when the lookup succeeded, or `checkout --no-track -b <branchName> refs/remotes/<remoteBranch>` when it failed. The new branch starts at the remote-tracking ref and, with `--track`, gets that remote branch as its upstream even when the user has `branch.autoSetupMerge=false`. Git's refusals reject with Git's text. When the remote-tracking ref is missing or local changes would be overwritten, no branch is created. When several remotes' refspecs map to the same tracking ref, Git creates the branch, refuses to set up tracking and does not switch to it (branch Q6).
4. **Local branch exists**: through the client, `checkout <branchName>`, then `merge --ff-only refs/remotes/<remoteBranch>`. The branch is fast-forwarded to the remote-tracking ref when possible (even with the user's `merge.ff=false`), left alone when it is already there or ahead, and a diverged branch is refused ("fatal: Not possible to fast-forward, aborting.") without starting a merge. The existing branch's upstream is not set or changed. See branch Q2 (the switch is not undone when the fast-forward fails) and branch Q3.

Whether a remote exists is looked up even when `fetch` is false. The whole sequence is never retried and has no timeout.

**Git processes, in order** (through the client unless marked):

| Case                                  | Processes                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| local                                 | `check-ref-format --normalize refs/heads/<branchName>`; `checkout <branchName>`                                                                                                                                                                                                                                                                                           |
| remote, fetch, new branch             | `check-ref-format …/<branchName>`; `remote`; `check-ref-format --normalize refs/heads/<branch>`; `rev-parse --show-toplevel`; **runGit** `fetch --no-tags -- <remote> +refs/heads/<branch>:refs/remotes/<remoteBranch>`; `for-each-ref --format=%(if)%(symref)%(then)%(else)%(refname)%(end) refs/heads/`; `checkout --track -b <branchName> refs/remotes/<remoteBranch>` |
| remote, no fetch, existing branch     | `check-ref-format …/<branchName>`; `remote`; `check-ref-format …/<branch>`; `for-each-ref …`; `checkout <branchName>`; `merge --ff-only refs/remotes/<remoteBranch>`                                                                                                                                                                                                      |
| remote, lookup failed, fetch not true | `check-ref-format …/<branchName>`; `remote` (and the branch-part check if a remote matched); `for-each-ref …`; `checkout --no-track -b <branchName> refs/remotes/<remoteBranch>` (or the existing-branch pair)                                                                                                                                                            |

### A.4 Concrete examples

Fixture R: `makeRepo()` from `tests/backend/helpers.ts` (branch `main`, one commit), then `git commit --allow-empty -m second`. Fixture C: a clone of such a repository with a second local branch `other`; "advance the remote" means commit on the remote's `main` then `git fetch origin` in the clone.

| Call                                                                                                                                             | Observed result                                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| R: `createBranch({ branchName: "nb", commitHash: <HEAD^> })`                                                                                     | resolves `undefined`; `refs/heads/nb` = HEAD^; HEAD still `refs/heads/main`                                              |
| R: `createBranch({ branchName: "main", commitHash: <HEAD^> })`                                                                                   | rejects `GitError` "fatal: a branch named 'main' already exists\n"; `main` unchanged                                     |
| R: `createBranch({ branchName: "bb", commitHash: "deadbeef"×5 })`                                                                                | rejects "fatal: not a valid branch point: 'deadbeef…deadbeef'\n"; no branch                                              |
| R: `createBranch({ branchName: "a..b", … })`, `"HEAD"`, `"-x"`                                                                                   | rejects `Error` "Enter a valid branch name."; the last two start no Git process at all                                   |
| R: `createBranch({ branchName: "e3", commitHash: "--force" })`                                                                                   | rejects "fatal: not a valid object name: '--force'\n"                                                                    |
| R: `deleteBranch({ branchName: "main", forceDelete: true })` (checked out)                                                                       | rejects "error: cannot delete branch 'main' used by worktree at '<repo>'\n"                                              |
| R + unmerged branch `unm`: `deleteBranch({ branchName: "unm", forceDelete: false })`                                                             | rejects "error: the branch 'unm' is not fully merged.\nIf you are sure you want to delete it, run 'git branch -D unm'\n" |
| R: `deleteBranch({ branchName: "missing", forceDelete: false })`                                                                                 | rejects "error: branch 'missing' not found\n"                                                                            |
| refs `refs/heads/-D`, `refs/heads/--output=x`: `deleteBranch({ branchName: "-D", forceDelete: true })`                                           | only `refs/heads/-D` removed; no file named `x` or anything else written to the work tree                                |
| R: `renameBranch({ oldName: "main", newName: "trunk" })`                                                                                         | resolves; `symbolic-ref HEAD` = `refs/heads/trunk`                                                                       |
| R: `renameBranch({ oldName: "main", newName: "-D" })`                                                                                            | rejects "Enter a valid branch name."; refs unchanged                                                                     |
| C: `checkoutBranch({ branchName: "other", remoteBranch: null })`                                                                                 | HEAD on `other`                                                                                                          |
| C: `checkoutBranch({ branchName: "nonexistent", remoteBranch: null })`                                                                           | rejects "error: pathspec 'nonexistent' did not match any file(s) known to git\n"                                         |
| C, remote advanced: `checkoutBranch({ branchName: "from-remote", remoteBranch: "origin/main" })`                                                 | new branch at the fetched `origin/main`, upstream `origin/main`                                                          |
| C, remote advanced but **not** fetched: `checkoutBranch({ branchName: "nb1", remoteBranch: "origin/main" })`                                     | new branch at the old `origin/main` (no fetch), upstream `origin/main`                                                   |
| C, remote advanced, not fetched: same with `fetch: true`                                                                                         | branch at the remote's new tip; only `refs/remotes/origin/main` updated                                                  |
| C, remote advanced, HEAD on `other`: `checkoutBranch({ branchName: "main", remoteBranch: "origin/main" })`                                       | HEAD on `main`, fast-forwarded to `origin/main`, work tree updated                                                       |
| C, HEAD on `main`, `main` has a local commit, remote advanced and fetched: `checkoutBranch({ branchName: "main", remoteBranch: "origin/main" })` | rejects with Git's hints and "fatal: Not possible to fast-forward, aborting.\n"; no `MERGE_HEAD`; `main` unchanged       |
| C: `checkoutBranch({ branchName: "other", remoteBranch: "origin/main" })` (`other` exists, no upstream)                                          | switches to `other`, fast-forwards it to `origin/main`; `other` still has no upstream                                    |
| C with `refs/remotes/team/mirror/topic` and no remote `team`: `{ branchName: "mirror/topic", remoteBranch: "team/mirror/topic", fetch: true }`   | rejects "The remote for 'team/mirror/topic' is no longer configured."                                                    |
| same with `fetch: false`                                                                                                                         | resolves; HEAD on new `mirror/topic` at that ref; no `branch.mirror/topic.remote` config                                 |
| C: `{ branchName: "zz", remoteBranch: "origin/nothere", fetch: true }`                                                                           | rejects `Error` "fatal: couldn't find remote ref refs/heads/nothere\n"                                                   |
| C: `{ branchName: "zz", remoteBranch: "origin/nothere", fetch: false }`                                                                          | rejects "fatal: 'refs/remotes/origin/nothere' is not a commit and a branch 'zz' cannot be created from it\n"             |
| C: `{ branchName: "zz3", remoteBranch: "origin/HEAD", fetch: false }`                                                                            | resolves; new branch at `origin/HEAD`'s target with no upstream                                                          |
| C with remote `team/origin` only: `{ branchName: "feature/navigation", remoteBranch: "team/origin/main", fetch: true }`                          | fetches from `team/origin`; upstream `team/origin/main`                                                                  |

### A.5 Non-functional requirements

- Stateless: no module-level state, nothing done at import time, no caching between calls. Every call uses only the client it is given.
- Resolve with `undefined` (§0.3). Reject with the errors described; never swallow a Git failure except the remote-lookup failure described in A.3.4 step 1.
- Validation happens before any Git write, so an invalid name changes nothing (checked by `validation.test.ts`, which compares all refs before and after).
- Option-like branch names must never be read as options by any Git command the module runs (`--` or full refs are used).
- Branch lists must not depend on the user's colour, sort or column settings (the checkout test sets `color.branch=always`).
- The only network command, the fetch, must go through `runGit` so that it cannot prompt and can be stopped with the client's abort signal.
- Process count per call is small and fixed: at most 8 Git processes (A.3.4 table).

### A.6 Test coverage

**Already checked**

- `branch/create.test.ts`: branch created at the given commit without checkout; existing branch refused and kept; invalid commit refused and no branch created.
- `branch/delete.test.ts`: merged branch deleted without force; unmerged refused without force; force deletes unmerged; missing branch refused.
- `branch/rename.test.ts`: rename keeps the commit; missing source refused; existing target refused.
- `branch/checkout.test.ts`: local checkout; a stale local branch checked out by its local ref stays stale; new tracking branch at the remote revision with upstream; nonexistent local branch refused; an existing branch already at the remote revision is reused; a stale local branch is switched to and fast-forwarded; fast-forward despite `merge.ff=false`; a branch ahead keeps its commits; diverged history refused without `MERGE_HEAD`; overwritten uncommitted changes refused and kept; a removed remote's ref: refused with fetch, checked out untracked without fetch; `color.branch=always` does not matter.
- `optionLikeRefs.test.ts`: branches `-D` and `--output=x` deleted (both force settings) without writing files; unmerged `-D` still needs force; `-D` renamed; new name `-D` refused.
- `utils/validation.test.ts`: nine invalid names refused by `createBranch` and `renameBranch` before any Git write, with "Enter a valid branch name".
- `actions/repository.test.ts`: fetch before checkout into a new branch from remote `team/origin`, with explicit tracking despite `branch.autoSetupMerge=false`.
- `extension/action-dispatch.test.ts`: each export is called with `(client, message)` and a rejection becomes the status.

**Gaps, each with a test to add**

1. _`HEAD` and option-like names are refused by `createBranch` without Git._ Setup: `freshRepo()`. Call: `createBranch(createGit(repo, "git"), { branchName: "HEAD", commitHash: head })`, then the same with `"-x"`. Expect: both reject with /Enter a valid branch name/; `for-each-ref` output unchanged.
2. _Renaming the checked-out branch moves HEAD._ Setup: `freshRepo()`. Call: `renameBranch(client, { oldName: "main", newName: "trunk" })`. Expect: `git symbolic-ref HEAD` is `refs/heads/trunk`; `refs/heads/main` no longer exists.
3. _The checked-out branch cannot be deleted, even with force._ Setup: `freshRepo()`. Call: `deleteBranch(client, { branchName: "main", forceDelete: true })`. Expect: rejects; `refs/heads/main` still exists.
4. _Without `fetch`, nothing is fetched but tracking is still set._ Setup: checkout fixture; advance the remote without fetching in the clone; note `origin/main`. Call: `checkoutBranch(client, { branchName: "x", remoteBranch: "origin/main" })`. Expect: `x` is at the noted old `origin/main`; `refs/remotes/origin/main` unchanged; `@{upstream}` of `x` is `origin/main`.
5. _A fetch updates only the selected tracking ref and no tags._ Setup: checkout fixture; on the remote, commit on `main`, create branch `side` with a new commit and tag `v1`; do not fetch. Call: `checkoutBranch(client, { branchName: "x", remoteBranch: "origin/main", fetch: true })`. Expect: `x` equals the remote's `main`; no `refs/tags/v1` locally; no `refs/remotes/origin/side`.
6. _An invalid local name stops before any lookup or fetch._ Setup: checkout fixture with the remote advanced; record `for-each-ref` output. Call: `checkoutBranch(client, { branchName: "bad name", remoteBranch: "origin/main", fetch: true })`. Expect: rejects /Enter a valid branch name/; refs (including `refs/remotes/origin/main`) unchanged.
7. _The longest remote name wins._ Setup: two bare remotes A and B whose `main` differ; `git remote add up A`, `git config remote.up.fetch +refs/heads/*:refs/remotes/up-only/*`, `git remote add up/stream B`. Call: `checkoutBranch(client, { branchName: "y", remoteBranch: "up/stream/main", fetch: true })`. Expect: `y` equals B's `main`; `branch.y.remote` is `up/stream`; `branch.y.merge` is `refs/heads/main`.
8. _A new tracking branch is refused when local changes would be overwritten._ Setup: checkout fixture; advance and fetch the remote; write uncommitted text to `f`. Call: `checkoutBranch(client, { branchName: "nb", remoteBranch: "origin/main", fetch: false })`. Expect: rejects; no `refs/heads/nb`; HEAD and `f` unchanged.
9. _A stalled fetch can be stopped._ Setup: as `networkCancel.test.ts` (SSH remote whose `core.sshCommand` records `$GIT_TERMINAL_PROMPT $$` then sleeps), plus `git update-ref refs/remotes/origin/main HEAD`; client `createGit(repo, "git", controller.signal)`. Call: `checkoutBranch(client, { branchName: "x", remoteBranch: "origin/main", fetch: true })`; abort once the marker exists. Expect: rejects within 5 s; the marker's prompt value is `0`; no `refs/heads/x`; the SSH process ends.
10. _Existing branch, fast-forward refused while it was not checked out_ (pins the answer to branch Q2). Setup: checkout fixture; commit on local `main`; advance and fetch the remote; `git checkout other`. Call: `checkoutBranch(client, { branchName: "main", remoteBranch: "origin/main" })`. Expect today: rejects and HEAD is on `main`; expected after a decision on Q2 may be HEAD back on `other`.
11. _Local checkout of a name that is only a file_ (pins branch Q1). Setup: `freshRepo()`; write uncommitted text to `f`. Call: `checkoutBranch(client, { branchName: "f", remoteBranch: null })`. Expect today: resolves and `f` is back to its committed content; expected after a decision on Q1: rejects and `f` keeps the uncommitted text.

### A.7 Questions

- **branch Q1.** A local checkout passes the name straight to `git checkout` with no local-branch check and no path separator. When no local branch has that name, Git applies its own fallbacks: a unique remote branch of that name silently creates a new tracking branch; a tag name detaches HEAD; and a name that matches a file or folder **restores that path from the index and discards its uncommitted changes**, resolving successfully (observed with `f`). The webview only offers this for existing local branches. Should the action refuse names that are not local branches?
- **branch Q2.** When the local branch exists, the switch happens before the fast-forward. If the fast-forward then fails (diverged history), the call rejects but HEAD stays on the newly checked-out branch. Should the action check first, or return to the previous branch, or is "switched but not updated" intended?
- **branch Q3.** A new branch gets the remote branch as its upstream, but an existing branch's upstream is left as it was, even when it tracks something else or nothing. `docs/git-actions.md` says remote checkout "creates an explicit tracking branch, or checks out and fast-forwards an existing local branch", which matches, but it is unclear whether an existing branch without an upstream should gain one.
- **branch Q4.** Without `fetch: true`, every lookup failure silently drops tracking, including a configured remote whose branch part is invalid (`origin/HEAD` creates an untracked branch). With `fetch: true` the same inputs are errors. Is the asymmetry intended beyond the removed-remote case?
- **branch Q5.** The fast-forward and the new-branch checkout follow the user's `merge.autoStash`. With `merge.autoStash=true` and a conflicting uncommitted change, the call resolves successfully but leaves `f` with conflict markers (`UU f`) and an `autostash` stash entry. Should the action pass `--no-autostash`, or report this state?
- **branch Q6.** With remotes `team` and `team/origin` both configured with default refspecs, the fetch from `team/origin` succeeds, but Git then refuses `--track` because two remotes map to `refs/remotes/team/origin/main` ("fatal: not tracking: ambiguous information for ref …"). The call rejects, yet the tracking ref has been updated and the local branch `lr` **has been created** (HEAD not moved), so a retry takes the existing-branch path. Acceptable, or should this case be detected before anything is changed?

---

## B. `src/backend/actions/commit.ts`

### B.1 Interface

**Module path:** `src/backend/actions/commit.ts` (`@/backend/actions/commit`), mocked by that path in `tests/extension/action-dispatch.test.ts`.

```ts
export async function checkoutCommit(
  git: SimpleGit,
  input: ActionPayload<"checkoutCommit">
): Promise<void>;
export async function cherrypickCommit(
  git: SimpleGit,
  input: ActionPayload<"cherrypickCommit">
): Promise<void>;
export async function revertCommit(
  git: SimpleGit,
  input: ActionPayload<"revertCommit">
): Promise<void>;
export async function resetToCommit(
  git: SimpleGit,
  input: ActionPayload<"resetToCommit">
): Promise<void>;
```

| Payload            | Field         | Type                                                                    | Meaning                                                                                                                                                   |
| ------------------ | ------------- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `checkoutCommit`   | `commitHash`  | `string`                                                                | The commit to check out with a detached HEAD. The webview sends a full hash.                                                                              |
| `cherrypickCommit` | `commitHash`  | `string`                                                                | The commit to apply on top of HEAD.                                                                                                                       |
|                    | `parentIndex` | `number`                                                                | `0` for an ordinary commit. For a merge commit, the 1-based parent (Git's `--mainline`) the change is taken against; the webview offers `1…n` for merges. |
| `revertCommit`     | `commitHash`  | `string`                                                                | The commit whose change is undone by a new commit.                                                                                                        |
|                    | `parentIndex` | `number`                                                                | As for cherry-pick.                                                                                                                                       |
| `resetToCommit`    | `commitHash`  | `string`                                                                | Where the current branch (or detached HEAD) is moved.                                                                                                     |
|                    | `resetMode`   | `GitResetMode` = `"soft" \| "mixed" \| "hard"` (from `@/backend/types`) | Which of HEAD, index and work tree follow. The webview defaults to `mixed`.                                                                               |

**Who uses what:** `src/old-extension/messageHandler.ts` (all four, `f(git, msg)`); `tests/backend/actions/commit/checkout.test.ts` (`checkoutCommit`), `cherrypick.test.ts` (`cherrypickCommit`), `revert.test.ts` (`revertCommit`), `reset.test.ts` (`resetToCommit`, plus the `GitResetMode` type); `tests/extension/action-dispatch.test.ts` (mock of all four, two arguments each).

### B.2 Dependencies the implementation must use

`import type { SimpleGit } from "simple-git"` and `import type { ActionPayload } from "@/backend/types"`. All four commands run through the client (§0.2); none needs `runGit`, validation or localisation.

### B.3 Behaviour

All four run exactly one Git process through the client and resolve `undefined` when it succeeds, or reject with the client's `GitError` carrying Git's text.

| Function           | Git command line                                                                                            |
| ------------------ | ----------------------------------------------------------------------------------------------------------- |
| `checkoutCommit`   | `checkout <commitHash>`                                                                                     |
| `cherrypickCommit` | `cherry-pick <commitHash>`, or `cherry-pick -m <parentIndex> <commitHash>` when `parentIndex > 0`           |
| `revertCommit`     | `revert --no-edit <commitHash>`, or `revert --no-edit -m <parentIndex> <commitHash>` when `parentIndex > 0` |
| `resetToCommit`    | `reset --<resetMode> <commitHash>` (`--soft`, `--mixed` or `--hard`)                                        |

`parentIndex` is written in decimal as JavaScript prints the number. Zero and negative values mean "no `-m`".

- **checkoutCommit**: HEAD becomes detached at the commit; branches do not move. Git refuses when local changes would be overwritten or the commit is unknown ("fatal: reference is not a tree: 0000…0000\n"). See commit Q1 for inputs that are not commit hashes.
- **cherrypickCommit**: a new commit on HEAD with the picked commit's message and author; its hash differs from the original. No editor is opened. On a conflict, or when the pick turns out empty (its change is already present), Git leaves the cherry-pick in progress (`CHERRY_PICK_HEAD`), the call rejects with Git's text (the conflict listing is Git's standard output followed by its "error: could not apply …" lines), and the repository stays in that state for the status strip's Continue/Skip/Abort. A merge commit without `-m` is refused ("error: commit <hash> is a merge but no -m option was given.\nfatal: cherry-pick failed\n"). Git 2.43 accepts `-m 1` on an ordinary commit and picks it normally.
- **revertCommit**: a new commit with Git's default message ("Revert \"<subject>\"\n\nThis reverts commit <hash>." and, with `-m`, ", reversing\nchanges made to <parent>."). `--no-edit` prevents an editor, which nobody could use. Conflicts leave `REVERT_HEAD` and reject with Git's text; dirty files that would be overwritten are refused.
- **resetToCommit**: moves HEAD (soft), plus the index (mixed), plus the work tree (hard). `mixed` prints a list of unstaged paths on standard output and still succeeds. An unknown commit is refused ("fatal: Could not parse object '0000…0000'.\n") and HEAD does not move. As in Git, a hard reset also clears an interrupted merge or revert (observed: `MERGE_HEAD` and `REVERT_HEAD` removed, status clean).

### B.4 Concrete examples

| Setup                                                 | Call                                                                           | Observed                                                                                                                                                                            |
| ----------------------------------------------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `makeRepo()` + empty commit "second"                  | `checkoutCommit({ commitHash: <HEAD^> })`                                      | HEAD detached at HEAD^; `main` unchanged                                                                                                                                            |
| same                                                  | `checkoutCommit({ commitHash: "0"×40 })`                                       | rejects "fatal: reference is not a tree: 0000000000000000000000000000000000000000\n"; still on `main`                                                                               |
| same, uncommitted change to a file that differs       | `checkoutCommit({ commitHash: <older> })`                                      | rejects "error: Your local changes to the following files would be overwritten by checkout:\n\tf\nPlease commit your changes or stash them before you switch branches.\nAborting\n" |
| branch `side` changed `g`; `main` has one more commit | `cherrypickCommit({ commitHash: <side>, parentIndex: 0 })`                     | new commit on `main` with subject "cherry commit"; `HEAD^` is the old `main`                                                                                                        |
| `side` and `main` both changed `f` differently        | `cherrypickCommit({ commitHash: <side>, parentIndex: 0 })`                     | rejects "Auto-merging f\nCONFLICT (content): Merge conflict in f\nerror: could not apply 6731874... side change\nhint: …"; `CHERRY_PICK_HEAD` exists                                |
| merge commit M (2 parents)                            | `cherrypickCommit({ commitHash: M, parentIndex: 0 })`                          | rejects "error: commit <M> is a merge but no -m option was given.\nfatal: cherry-pick failed\n"                                                                                     |
| same                                                  | `cherrypickCommit({ commitHash: M, parentIndex: 3 })`                          | rejects "error: commit <M> does not have parent 3\nfatal: cherry-pick failed\n"                                                                                                     |
| third commit on top of "second", both changing `f`    | `revertCommit({ commitHash: <second>, parentIndex: 0 })`                       | rejects with "CONFLICT (content)…error: could not revert df179c7... second…"; `REVERT_HEAD` exists                                                                                  |
| merge M of branch adding `g`                          | `revertCommit({ commitHash: M, parentIndex: 1 })`                              | new commit "Revert \"merge side\"\n\nThis reverts commit <M>, reversing\nchanges made to <parent1>."; `g` removed                                                                   |
| first commit `f=x`, second `f=y`                      | `resetToCommit({ commitHash: <first>, resetMode: "soft" / "mixed" / "hard" })` | index/work tree `y/y`, `x/y`, `x/x`                                                                                                                                                 |

### B.5 Non-functional requirements

- Stateless; nothing at import time; one Git process per call; resolve `undefined`.
- Never open an editor or pager: the environment has no terminal (revert needs `--no-edit`; cherry-pick and reset open none by default).
- No validation or retries; Git is the judge of every input.

### B.6 Test coverage

**Already checked:** `commit/checkout.test.ts` (detached checkout; unknown commit refused, stays on branch); `commit/cherrypick.test.ts` (applied as a new commit on the current branch; unknown commit refused); `commit/revert.test.ts` (revert commit added, file removed, clean status; unknown commit refused); `commit/reset.test.ts` (the three modes' effect on HEAD, index and work tree; unknown commit refused); `action-dispatch.test.ts` (dispatch and status).

**Gaps**

1. _Merge commits need a parent._ Setup: `makeRepo()`; branch `side` adds `g`; `git merge --no-ff side` on a branch `m2`; back on `main`. Call: `cherrypickCommit({ commitHash: M, parentIndex: 0 })`, then `{ parentIndex: 1 }`. Expect: the first rejects and HEAD is unchanged; the second adds one commit whose tree contains `g`.
2. _A cherry-pick conflict leaves the operation in progress._ Setup: `side` and `main` change `f` differently. Call: `cherrypickCommit({ commitHash: side, parentIndex: 0 })`. Expect: rejects; `.git/CHERRY_PICK_HEAD` exists; `git status --porcelain` shows `UU f`.
3. _Revert of a merge with a mainline._ Setup: as gap 1 but merged into `main`. Call: `revertCommit({ commitHash: M, parentIndex: 1 })`. Expect: resolves; `g` no longer exists; `git log -1 --format=%s` is `Revert "…"` of M's subject.
4. _A revert conflict leaves the operation in progress._ Setup: commits "second" and "third" both change `f`. Call: `revertCommit({ commitHash: second, parentIndex: 0 })`. Expect: rejects; `.git/REVERT_HEAD` exists.
5. _Checkout refuses to overwrite local changes._ Setup: two commits with different `f`; write uncommitted text to `f`. Call: `checkoutCommit({ commitHash: first })`. Expect: rejects; still on `main`; `f` keeps the uncommitted text.
6. _Hard reset clears an interrupted operation._ Setup: produce a revert conflict (gap 4). Call: `resetToCommit({ commitHash: "HEAD", resetMode: "hard" })`. Expect: resolves; no `REVERT_HEAD`; clean status.
7. _Each action resolves to `undefined`._ Any successful call above: `await expect(p).resolves.toBeUndefined()`.
8. _Non-hash inputs_ (pins commit Q1): `checkoutCommit({ commitHash: "main" })` today attaches HEAD to `main`; `checkoutCommit({ commitHash: "f" })` with a modified `f` today restores `f`. Expected results depend on the decision.

### B.7 Questions

- **commit Q1.** `checkoutCommit` gives the value to `git checkout` with nothing to force a detached, commit-only reading. A branch name attaches HEAD to that branch instead of detaching; a file name restores that file and **discards its uncommitted changes**; and an option-like value is read as an option (`--orphan=x` created an orphan branch `x` and resolved). The UI only sends full hashes. Should the action insist on a commit (for example detach explicitly and end options before the value)?
- **commit Q2.** `resetToCommit` has the same exposure: an option-like `commitHash` becomes an option (`{ commitHash: "--hard", resetMode: "soft" }` ran `reset --soft --hard`, a hard reset of HEAD), and with `mixed` a path-like value resets that path in the index. `resetMode` is not checked at run time; any string becomes `--<string>` (`"keep"` works, `"bogus"` returns Git's usage text as the error). Should unknown modes and non-commit values be refused?
- **commit Q3.** `parentIndex` values that are not positive integers are passed through or dropped: `1.5` becomes `-m 1.5` (Git: "option `mainline' expects a number greater than zero"); `-1` silently means "no parent". Should the action reject them itself?
- **commit Q4.** Conflicts in cherry-pick and revert are reported as Git's raw, possibly translated, text through the client, while a merge conflict gets a localized explanation (§C). Should cherry-pick and revert conflicts get a similar message, and should they, like merge, go through `runGit` so that a failure printed only on standard output is still a failure?

---

## C. `src/backend/actions/merge.ts`

### C.1 Interface

**Module path:** `src/backend/actions/merge.ts` (`@/backend/actions/merge`), mocked by that path in `tests/extension/action-dispatch.test.ts`.

```ts
export async function mergeBranch(
  git: SimpleGit,
  input: ActionPayload<"mergeBranch">,
  binary: string
): Promise<void>;
export async function mergeCommit(
  git: SimpleGit,
  input: ActionPayload<"mergeCommit">,
  binary: string
): Promise<void>;
```

| Payload       | Field             | Type      | Meaning                                                                                                                                                     |
| ------------- | ----------------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mergeBranch` | `branchName`      | `string`  | Short name of a **local** branch (the webview offers merge only on local branch labels). May look like an option.                                           |
|               | `createNewCommit` | `boolean` | `true`: always create a merge commit (`--no-ff`). `false`: leave the choice to Git and the user's configuration. The webview's checkbox defaults to `true`. |
| `mergeCommit` | `commitHash`      | `string`  | The commit to merge. The webview sends a full hash.                                                                                                         |
|               | `createNewCommit` | `boolean` | As above.                                                                                                                                                   |

`binary` is the Git executable used for the merge process itself. The message handler passes `config.gitPath()`, the same path it gave the client.

**Who uses what:** `src/old-extension/messageHandler.ts` (both, `f(git, msg, config.gitPath())`); `tests/backend/actions/merge/mergeBranch.test.ts` (`mergeBranch`), `mergeCommit.test.ts` (`mergeCommit`), `conflicts.test.ts` (both); `tests/backend/actions/optionLikeRefs.test.ts` (`mergeBranch`); `tests/extension/action-dispatch.test.ts` (mock; asserts the third argument is the configured Git path). The UI harness (`tests-ext/ui/history.test.cjs`, "recovers from a merge conflict through the status controls") merges a conflicting branch through the UI and expects the "Unable to Merge" dialog and then "Merge in progress".

### C.2 Dependencies the implementation must use

| Import                                                 | For                                                                                                  |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| `import * as l10n from "@vscode/l10n"`                 | The conflict message (§0.4).                                                                         |
| `import type { SimpleGit } from "simple-git"`          | The client.                                                                                          |
| `import type { ActionPayload } from "@/backend/types"` | Payload types.                                                                                       |
| `runGit` from `@/backend/utils/runGit`                 | The merge process: exact exit-status handling, no prompts, cancellable, top-level working directory. |

### C.3 Behaviour

#### C.3.1 The merge argument

- `mergeCommit` merges `commitHash` as given.
- `mergeBranch` merges `branchName` by its short name **only if** Git resolves that short name to exactly `refs/heads/<branchName>`; otherwise it merges the full ref `refs/heads/<branchName>`. Resolution is one client-run `rev-parse --verify --quiet --symbolic-full-name --end-of-options <branchName>`; a failure of that lookup, or any output other than `refs/heads/<branchName>` (after trimming), selects the full ref.
- The merge commit's subject quotes whatever argument Git was given, so the short name produces "Merge branch 'feature'" and the full ref produces "Merge branch 'refs/heads/feature'". The full ref is what guarantees that the branch, and not some other ref that Git would pick for the short name, is merged. The tests show two such situations: a tag with the same name (`optionLikeRefs.test.ts`, "merges a branch, not a tag with the same name"), and on a case-insensitive filesystem the loose tag `-d` answering for the branch `-D` (the same file accepts either subject in that case).
- A name that is not a local branch (missing, invalid, a remote-tracking name like `origin/feature`, or empty) therefore reaches Git as `refs/heads/<name>` and fails with Git's text ("merge: refs/heads/nonexistent - not something we can merge\n").

#### C.3.2 The merge

Through `runGit` with executable `binary`: `merge [--no-ff] --no-edit --end-of-options <argument>`, with `--no-ff` exactly when `createNewCommit` is true. `--no-edit` accepts Git's message without an editor; `--end-of-options` keeps option-like names (`-D`) from being read as options.

- Success: resolve `undefined`. Fast-forward, merge commit, and "Already up to date." are all success.
- The user's configuration applies where no flag overrides it: with `createNewCommit: false`, `merge.ff=false` still creates a merge commit and `merge.ff=only` refuses diverged history; `merge.autoStash` applies (merge Q2, Q4).
- Uncommitted changes that do not collide with the merge are kept; colliding ones make Git refuse before starting.

#### C.3.3 Failure and conflict detection

When the merge process fails, check through the client whether a merge is now in progress: `rev-parse --verify --quiet MERGE_HEAD`, where non-empty output means yes and any failure of the check means no.

- **In progress** → reject with a new `Error` whose `cause` is the original failure and whose message is the localized form (§0.4) of the English text "The merge stopped on conflicts. Resolve and stage the conflicted files, then continue or abort the merge from the status strip." The repository is left mid-merge (`MERGE_HEAD`, conflicted files) for the status strip's Stage Resolution / Continue / Abort.
- **Not in progress** → reject with the original failure unchanged (Git's own message, possibly localized), for example uncommitted changes that would be overwritten, an unknown branch or commit, a refused fast-forward, a missing executable ("spawn /nonexistent/git ENOENT"), or a cancellation.

`conflicts.test.ts` runs the same conflict through a wrapper that rewrites Git's conflict lines into German and still expects the fixed message, so the outcome may depend only on the exit status and on whether `MERGE_HEAD` exists. See merge Q1 for other situations that leave `MERGE_HEAD` behind.

#### C.3.4 Git processes, in order

| Function      | Processes                                                                                                                                                                                                                                                               |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mergeBranch` | client `rev-parse --verify --quiet --symbolic-full-name --end-of-options <branchName>`; client `rev-parse --show-toplevel`; **runGit(binary)** `merge [--no-ff] --no-edit --end-of-options <argument>`; on failure only, client `rev-parse --verify --quiet MERGE_HEAD` |
| `mergeCommit` | client `rev-parse --show-toplevel`; **runGit(binary)** `merge [--no-ff] --no-edit --end-of-options <commitHash>`; on failure only, client `rev-parse --verify --quiet MERGE_HEAD`                                                                                       |

The lookups use the client's own executable; only the merge process uses `binary`.

### C.4 Concrete examples

Fixture M: `makeRepo()`, branch `feature` with one extra commit adding `feature.txt`, back on `main`. Fixture X: `topic` and `main` each change `f` differently.

| Setup and call                                                                              | Observed                                                                                                                                                                                                                                                                                                       |
| ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M: `mergeBranch({ branchName: "feature", createNewCommit: false }, "git")`                  | fast-forward; `main` = `feature`; process `merge --no-edit --end-of-options feature`                                                                                                                                                                                                                           |
| M: `mergeBranch({ branchName: "feature", createNewCommit: true }, "git")`                   | merge commit, subject "Merge branch 'feature'"; `HEAD^1` old `main`, `HEAD^2` `feature`                                                                                                                                                                                                                        |
| M, then on a branch `dev` with its own commit: same call                                    | subject "Merge branch 'feature' into dev" (Git's wording)                                                                                                                                                                                                                                                      |
| M + `git tag feature main`: `mergeBranch({ branchName: "feature", createNewCommit: true })` | argument `refs/heads/feature`; `HEAD^2` is the branch; subject "Merge branch 'refs/heads/feature'"                                                                                                                                                                                                             |
| M: `mergeBranch({ branchName: "nonexistent", createNewCommit: false })`                     | rejects `Error` "merge: refs/heads/nonexistent - not something we can merge\n"                                                                                                                                                                                                                                 |
| M + `refs/remotes/origin/feature`: `mergeBranch({ branchName: "origin/feature", … })`       | rejects "merge: refs/heads/origin/feature - not something we can merge\n"                                                                                                                                                                                                                                      |
| M + `merge.ff=false`: `mergeBranch({ branchName: "feature", createNewCommit: false })`      | a merge commit is created (two parents)                                                                                                                                                                                                                                                                        |
| M, `main` moved, `merge.ff=only`: `createNewCommit: false` / `true`                         | rejects with Git's "…fatal: Not possible to fast-forward, aborting.\n" / merge commit created                                                                                                                                                                                                                  |
| M: `mergeCommit({ commitHash: <feature>, createNewCommit: true })`                          | subject "Merge commit '<full hash>'"; with an abbreviated hash, "Merge commit '54380f8'"                                                                                                                                                                                                                       |
| M: `mergeCommit({ commitHash: "deadbeef"×5, createNewCommit: false })`                      | rejects "merge: deadbeef…deadbeef - not something we can merge\n"                                                                                                                                                                                                                                              |
| X: `mergeBranch({ branchName: "topic", createNewCommit: true }, "git")`                     | rejects "The merge stopped on conflicts. Resolve and stage the conflicted files, then continue or abort the merge from the status strip."; `cause.message` "Auto-merging f\nCONFLICT (content): Merge conflict in f\nAutomatic merge failed; fix conflicts and then commit the result.\n"; `MERGE_HEAD` exists |
| X with a translating wrapper as both client executable and `binary`                         | the same fixed message; `MERGE_HEAD` exists                                                                                                                                                                                                                                                                    |
| X after `git merge --abort`, uncommitted change to `f`                                      | rejects with Git's own (non-empty) message; `f` keeps the change; no `MERGE_HEAD`                                                                                                                                                                                                                              |
| M, unrelated uncommitted file, `createNewCommit: true`                                      | merge commit created; the uncommitted file kept                                                                                                                                                                                                                                                                |
| M, `binary` = `/nonexistent/git`                                                            | rejects `Error` "spawn /nonexistent/git ENOENT"                                                                                                                                                                                                                                                                |

### C.5 Non-functional requirements

- Stateless; nothing at import time; resolve `undefined`.
- At most four Git processes per call.
- No editor, no terminal prompt (`--no-edit`; `runGit` disables prompts).
- Cancellation through the client's abort signal must stop the merge process (inherited from `runGit`). A cancelled merge is reported as the cancellation, never as a conflict: the state check itself goes through the aborted client, is refused, and counts as "no merge in progress". (Observed with a slow `pre-merge-commit` hook: rejection "This operation was aborted", no `MERGE_HEAD` afterwards.)
- The conflict message is an exact `l10n.t` literal present in all three bundles (§0.4); tests match its first words, "The merge stopped on conflicts".
- The original failure must stay reachable as `cause` for diagnostics; nothing else reads it today.

### C.6 Test coverage

**Already checked:** `merge/mergeBranch.test.ts` (fast-forward without `createNewCommit`; `--no-ff` commit named "Merge branch 'feature'"; missing branch refused, `main` unchanged); `merge/mergeCommit.test.ts` (fast-forward; `--no-ff` "Merge commit '…"; invalid hash refused); `merge/conflicts.test.ts` (conflict reported with the fixed message for both functions, with English and translated Git, `MERGE_HEAD` left; another failure reported with Git's non-empty message, work tree and state untouched); `optionLikeRefs.test.ts` (branch `-D` merged and named after it, or after `refs/heads/-D` when a case-insensitive filesystem shadows it; a same-named tag does not win); `action-dispatch.test.ts` (third argument; failure releases the repository lock).

**Gaps**

1. _The merge process uses `binary`, and only the merge process._ Setup: fixture M; `recordingGit(dir)` from `tests/backend/queries/loadCommits/fixtures.ts`. Call: `mergeBranch(createGit(repo, "git"), { branchName: "feature", createNewCommit: true }, recorder.gitPath)`. Expect: `recorder.runs()` equals `["merge --no-ff --no-edit --end-of-options feature"]`.
2. _The conflict error keeps Git's failure as `cause`._ Setup: fixture X. Call: `mergeBranch(…, { branchName: "topic", createNewCommit: true }, "git")`. Expect: the rejection's `cause` is an `Error` with a non-empty message that does not contain "The merge stopped on conflicts".
3. _Unrelated uncommitted changes survive a merge._ Setup: fixture M plus an uncommitted change to `f`. Call: `mergeBranch({ branchName: "feature", createNewCommit: true })`. Expect: resolves; `HEAD^2` is `feature`; `f` keeps the uncommitted text.
4. _A shadowing tag changes the message to the full ref._ Setup: fixture M; `git tag feature main`. Call: `mergeBranch({ branchName: "feature", createNewCommit: true })`. Expect: `HEAD^2` = `refs/heads/feature`; subject "Merge branch 'refs/heads/feature'".
5. _Cancellation before the merge._ Setup: fixture M; an aborted controller. Call: `mergeBranch(createGit(repo, "git", signal), { branchName: "feature", createNewCommit: true }, "git")`. Expect: rejects; not the conflict message; `main` unchanged; no `MERGE_HEAD`.
6. _An already-running merge_ (pins merge Q1). Setup: fixture X; call once (conflict). Call again. Expect today: rejects with the conflict message although the second merge never started.
7. _`createNewCommit: false` under `merge.ff=false`_ (pins merge Q2). Setup: fixture M; `git config merge.ff false`. Call: `mergeBranch({ branchName: "feature", createNewCommit: false })`. Expect today: a two-parent merge commit.

### C.7 Questions

- **merge Q1.** Every failure after which `MERGE_HEAD` exists is reported as "stopped on conflicts". That includes a merge that was **already in progress before the call** (Git refuses to start: "error: Merging is not possible because you have unmerged files" or "fatal: You have not concluded your merge (MERGE_HEAD exists)"), and a `pre-merge-commit` hook that rejects a clean merge ("hook says no\nNot committing merge…"). Should those be told apart (for example by checking for a merge before starting, or by looking for unmerged paths)?
- **merge Q2.** `createNewCommit: false` adds no flag, so the user's `merge.ff` decides: `false` still makes a merge commit and `only` refuses diverged history. The checkbox label in the webview is about avoiding fast-forward; is "false" meant as "fast-forward when possible" (Git's `--ff`) or as "whatever Git is configured to do"?
- **merge Q3.** Only the merge process uses the `binary` argument; the lookups and the conflict check use the client's executable, and other network actions (`pushTag`, the checkout fetch) use the client's recorded executable without an extra argument. The handler passes the same path to both, so the parameter looks redundant but is part of the signature the dispatch test asserts. Keep it as is?
- **merge Q4.** With `merge.autoStash=true` and an uncommitted change to a file the merge touches, the call resolves successfully but leaves the file conflicted (`UU f`) and an `autostash` stash entry, with no `MERGE_HEAD`. Should the merge disable autostash or report that state?

---

## D. `src/backend/actions/tag.ts`

### D.1 Interface

**Module path:** `src/backend/actions/tag.ts` (`@/backend/actions/tag`), mocked by that path in `tests/extension/action-dispatch.test.ts`.

```ts
export async function addTag(git: SimpleGit, input: ActionPayload<"addTag">): Promise<void>;
export async function deleteTag(git: SimpleGit, input: ActionPayload<"deleteTag">): Promise<void>;
export async function pushTag(git: SimpleGit, input: ActionPayload<"pushTag">): Promise<void>;
```

| Payload     | Field         | Type      | Meaning                                                                                                                                                              |
| ----------- | ------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `addTag`    | `tagName`     | `string`  | Short name, without `refs/tags/`.                                                                                                                                    |
|             | `commitHash`  | `string`  | Object to tag (the webview sends a commit hash).                                                                                                                     |
|             | `lightweight` | `boolean` | `true`: a plain ref to the object. `false`: an annotated tag object with tagger and message.                                                                         |
|             | `message`     | `string`  | Annotation text; ignored when `lightweight`. The webview sends `""` for lightweight tags and may send `""` for annotated ones (the field is optional in the dialog). |
| `deleteTag` | `tagName`     | `string`  | Short name of an existing local tag; may look like an option (`-d`).                                                                                                 |
| `pushTag`   | `tagName`     | `string`  | Short name of a local tag.                                                                                                                                           |
|             | `remote`      | `string`  | Name of a configured remote.                                                                                                                                         |
|             | `requestId`   | `string?` | For the handler's cancellation; ignored by the module.                                                                                                               |

**Who uses what:** `src/old-extension/messageHandler.ts` (all three, `f(git, msg)`); `tests/backend/actions/tag/add.test.ts` (`addTag`), `delete.test.ts` (`deleteTag`), `push.test.ts` (`pushTag`); `tests/backend/actions/optionLikeRefs.test.ts` (`addTag`, `deleteTag`); `tests/backend/utils/validation.test.ts` (`addTag`, `pushTag`); `tests/backend/actions/repository.test.ts` (`pushTag`); `tests/extension/action-dispatch.test.ts` (mock); the UI harness pushes and deletes tags through the UI.

### D.2 Dependencies the implementation must use

`import type { SimpleGit } from "simple-git"`; `import type { ActionPayload } from "@/backend/types"`; `requireRemote`, `requireTagName` from `@/backend/utils/validation` (§0.5); `runGit` from `@/backend/utils/runGit` (the push).

### D.3 Behaviour

#### D.3.1 `addTag`

1. Validate `tagName` with `requireTagName`; invalid → "Enter a valid tag name.", nothing written.
2. Through the client: `tag -- <tagName> <commitHash>` when `lightweight`, else `tag -a -m <message> -- <tagName> <commitHash>`.

- An existing tag is refused ("fatal: tag 'lw' already exists\n") and kept. An unknown object is refused (annotated: "fatal: bad object type.\n"). Any object type can be tagged (a tree hash makes a tag pointing at a tree).
- Git's normal message clean-up applies to `-m`: trailing blank lines and lines starting with `#` are removed (`"Line one\n\nbody\n# not a comment"` is stored as "Line one\n\nbody"). An empty message makes an annotated tag with no text.
- The user's `tag.gpgSign=true` makes annotated tags require signing (failing when signing fails, with Git's text) and makes Git refuse lightweight tags ("fatal: no tag message?\n").
- A message that begins with `--upload-pack`, `--receive-pack` or `--template` is refused by simple-git before Git runs (§0.2, tag Q2). Other option-like messages such as `-d` are stored verbatim.

#### D.3.2 `deleteTag`

Through the client: `tag -d -- <tagName>`. No validation first, so option-like tags are deleted as names. A missing tag is refused ("error: tag 'zzz' not found.\n"). Only the local tag is removed.

#### D.3.3 `pushTag`

1. `requireRemote(git, remote)`; unknown → "Remote '<remote>' is not configured for this repository." (checked **before** the tag name, so this message wins when both are wrong).
2. `requireTagName(git, tagName)`.
3. Through `runGit` (client's executable): `push -- <remote> refs/tags/<tagName>:refs/tags/<tagName>`.

Only the named tag is pushed (an annotated tag arrives as a tag object). There is no force: a remote tag with the same name pointing elsewhere is rejected with Git's text, and pushing a tag the remote already has succeeds with no change. A tag missing locally (including a branch name) fails with Git's "error: src refspec refs/tags/<name> does not match any…". Unreachable remotes fail with Git's text. The push cannot prompt for credentials and stops when the client's signal is aborted.

**Processes:** `addTag` → `check-ref-format --normalize refs/tags/<tagName>` (unless empty or starting with `-`), `tag …`. `deleteTag` → `tag -d -- <tagName>`. `pushTag` → `remote`; `check-ref-format --normalize refs/tags/<tagName>`; `rev-parse --show-toplevel`; **runGit** `push -- <remote> refs/tags/<tagName>:refs/tags/<tagName>`.

### D.4 Concrete examples

| Setup and call                                                                                                           | Observed                                                                                                                                                                                           |
| ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `addTag({ tagName: "lw", commitHash: <HEAD>, lightweight: true, message: "ignored" })`                                   | `cat-file -t refs/tags/lw` = `commit`; process `tag -- lw <HEAD>`                                                                                                                                  |
| `addTag({ tagName: "v1.0", commitHash: <HEAD>, lightweight: false, message: "Release v1.0" })`                           | `cat-file -t` = `tag`; `v1.0^{commit}` = HEAD; subject "Release v1.0"                                                                                                                              |
| `addTag({ tagName: "ann0", …, lightweight: false, message: "" })`                                                        | annotated tag with an empty message                                                                                                                                                                |
| `addTag({ tagName: "ann2", …, lightweight: false, message: "--upload-pack=x" })`                                         | rejects `GitPluginError` "Use of --upload-pack or --receive-pack is not permitted without enabling allowUnsafePack"; no tag                                                                        |
| `addTag({ tagName: "-d", …, lightweight: true })`                                                                        | rejects "Enter a valid tag name."; no Git process                                                                                                                                                  |
| `addTag({ tagName: "HEAD", …, lightweight: true })`                                                                      | resolves; `refs/tags/HEAD` created                                                                                                                                                                 |
| `deleteTag({ tagName: "v1.0" })` with tags `v1.0`, `v1.1`                                                                | only `v1.1` remains                                                                                                                                                                                |
| `deleteTag({ tagName: "-d" })` with `refs/tags/-d`                                                                       | only that ref removed; no files written                                                                                                                                                            |
| bare remote `origin`, tags `v1.0`, `v2.0`: `pushTag({ tagName: "v1.0", remote: "origin" })`                              | remote has only `refs/tags/v1.0`                                                                                                                                                                   |
| annotated tag `ann1` pushed, then moved locally with `git tag -f ann1`: `pushTag({ tagName: "ann1", remote: "origin" })` | rejects `Error` "To <bare>\n ! [rejected] ann1 -> ann1 (already exists)\nerror: failed to push some refs to '<bare>'\nhint: Updates were rejected because the tag already exists in the remote.\n" |
| `pushTag({ tagName: "bad name", remote: "nope" })`                                                                       | rejects "Remote 'nope' is not configured for this repository."                                                                                                                                     |
| `pushTag({ tagName: "v99", remote: "origin" })`                                                                          | rejects "error: src refspec refs/tags/v99 does not match any\nerror: failed to push some refs to '<bare>'\n"                                                                                       |
| client for `<repo>/sub`: `pushTag({ tagName: "ann4", remote: "origin" })`                                                | pushed (the push runs in the top level)                                                                                                                                                            |

### D.5 Non-functional requirements

- Stateless; nothing at import time; resolve `undefined`.
- Validation before any write; `validation.test.ts` compares every local and remote ref before and after.
- The push must go through `runGit` (no terminal prompt, stoppable; the webview marks tag pushes as network actions with a Stop button).
- At most four Git processes per call.

### D.6 Test coverage

**Already checked:** `tag/add.test.ts` (lightweight and annotated tags at the commit with the message; existing tag refused and kept; invalid commit refused, no tag); `tag/delete.test.ts` (only the named tag deleted; missing refused); `tag/push.test.ts` (only the named tag pushed; missing local tag refused); `optionLikeRefs.test.ts` (tag `-d` deleted without writing files; new tag `-d` refused); `validation.test.ts` (nine invalid names refused by `addTag` and `pushTag` before any Git write); `repository.test.ts` (push to a non-default remote `backup`); `action-dispatch.test.ts`; UI harness (push and delete through dialogs).

**Gaps**

1. _Unknown remote is reported first._ Setup: `freshRepo()` with tag `v1`. Call: `pushTag({ tagName: "bad name", remote: "nope" })`. Expect: rejects "Remote 'nope' is not configured for this repository."
2. _No forced tag push._ Setup: push `v1` to a bare remote; `git commit --allow-empty`; `git tag -f v1`. Call: `pushTag({ tagName: "v1", remote: "origin" })`. Expect: rejects; the remote's `v1` still points at the old commit.
3. _Annotated tags are pushed as tag objects._ Setup: annotated tag `a1`. Call: `pushTag({ tagName: "a1", remote: "origin" })`. Expect: in the bare repository, `for-each-ref --format=%(objecttype) refs/tags/a1` is `tag`.
4. _A stalled tag push can be stopped._ Setup: as `networkCancel.test.ts`, with a tag `t1`. Call: `pushTag(createGit(repo, "git", signal), { tagName: "t1", remote: "origin" })`, abort after the marker appears. Expect: rejects within 5 s; marker prompt value `0`; SSH process ends.
5. _Lightweight ignores the message._ Call: `addTag({ tagName: "lw", commitHash: head, lightweight: true, message: "ignored" })`. Expect: `cat-file -t refs/tags/lw` is `commit`.
6. _Annotated with an empty message_ (pins tag Q3). Call: `addTag({ tagName: "a0", commitHash: head, lightweight: false, message: "" })`. Expect today: `cat-file -t` is `tag` and `%(contents)` is empty.
7. _Tag named `HEAD`_ (pins tag Q1). Call: `addTag({ tagName: "HEAD", commitHash: head, lightweight: true, message: "" })`. Expect today: resolves and `refs/tags/HEAD` exists.
8. _Pushing from a subfolder client._ Setup: bare remote, tag `v1`, folder `sub`. Call: `pushTag(createGit(join(repo, "sub"), "git"), { tagName: "v1", remote: "origin" })`. Expect: the remote has `refs/tags/v1`.

### D.7 Questions

- **tag Q1.** Tag validation accepts `HEAD`, while branch validation refuses it. A tag named `HEAD` makes the name `HEAD` ambiguous in later Git commands. Should `addTag` refuse it?
- **tag Q2.** The annotation is passed as a command-line argument through the client. As a result (a) simple-git refuses messages beginning with `--upload-pack`, `--receive-pack` or `--template` with an English `GitPluginError`, and (b) Git strips `#` lines and trailing blank lines. Should the message be stored exactly as typed (for example by passing it another way and turning off clean-up)?
- **tag Q3.** An annotated tag with an empty message is created silently. Should an empty annotation be refused, or turned into a lightweight tag, or is an empty annotated tag intended?
- **tag Q4.** With `tag.gpgSign=true` in the user's configuration, lightweight tags always fail ("fatal: no tag message?"). Should lightweight tags opt out of signing (`--no-sign`)?

---

## E. `src/backend/gitClient.ts`

### E.1 Interface

**Module path:** `src/backend/gitClient.ts` (`@/backend/gitClient`). The path must not change: six extension test files mock it by this path, and `scripts/benchmark.mjs` imports it by the relative path `./src/backend/gitClient`.

```ts
export type GitClient = ReturnType<typeof gitClientFactory>;
export type GitInstance = GitClient["getInstance"];

export const PARSED_OUTPUT_CONFIG: string[];
export const PARSED_OUTPUT_ARGS: string[];

export function gitProcessOf(git: SimpleGit): { gitPath: string; abort?: AbortSignal } | undefined;
export function createGit(repoPath: string, gitPath: string, abort?: AbortSignal): SimpleGit;
export function gitClientFactory(
  repoPath: string,
  gitPath: string,
  abort?: AbortSignal
): {
  getInstance: () => SimpleGit;
  setRepo(newRepoPath: string): void;
  setGitPath(newGitPath: string): void;
};
```

The inferred types above must keep this shape (with `exactOptionalPropertyTypes`, `abort` is an optional property that is absent, not `undefined`, when there is no signal). `GitInstance` is the type of the `getInstance` function, `() => SimpleGit` (gitClient Q1).

**Values**

```
PARSED_OUTPUT_CONFIG = [
  "log.showSignature=false",
  "status.showUntrackedFiles=all",
  "color.ui=never",
  "color.branch=never",
  "color.diff=never",
  "color.status=never",
  "color.showBranch=never",
  "color.grep=never"
]

PARSED_OUTPUT_ARGS = [
  "--no-optional-locks",
  "-c", "log.showSignature=false",
  "-c", "status.showUntrackedFiles=all",
  "-c", "color.ui=never",
  "-c", "color.branch=never",
  "-c", "color.diff=never",
  "-c", "color.status=never",
  "-c", "color.showBranch=never",
  "-c", "color.grep=never"
]
```

Both are exactly these arrays, in this order. `PARSED_OUTPUT_ARGS` is `--no-optional-locks` followed by each `PARSED_OUTPUT_CONFIG` entry preceded by `-c`.

**Parameters**

| Name                   | Meaning                                                                                                                                                                                                                                      |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `repoPath`             | Directory Git runs in (the client's base directory). Any folder inside a work tree works; it must exist.                                                                                                                                     |
| `gitPath`              | The Git executable. In the extension it is `config.gitPath()` (`src/extension/config.ts`); tests pass `git` or an absolute path. It may contain spaces and parentheses (`utils/gitPath.test.ts` uses `…/ngg-portable …/Git (portable)/git`). |
| `abort`                | Optional cancellation for everything the client runs, and for processes other modules start on its behalf through `gitProcessOf`.                                                                                                            |
| `git` (`gitProcessOf`) | A client.                                                                                                                                                                                                                                    |

**Who uses what**

| User                                                                                                                                                                                                                                           | Exports                                           |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `src/backend/utils/runGit.ts`                                                                                                                                                                                                                  | `gitProcessOf`, `PARSED_OUTPUT_ARGS`              |
| `src/backend/utils/git.ts` (§F), `src/extension/watchers/git-repo.watcher.ts`                                                                                                                                                                  | `createGit`                                       |
| `src/old-extension/messageHandler.ts`, `src/old-extension/fileHistoryCommand.ts`, `src/extension/legacy.ts`, `src/backend/actions/history.ts`, `src/backend/queries/workflows.ts`, `src/backend/queries/workspace.ts`, `scripts/benchmark.mjs` | `gitClientFactory(…).getInstance()`               |
| 46 test files under `tests/` (for example every file under `tests/backend/actions/`, plus `tests/extension/diff-doc-provider.test.ts` and `tests/extension/restore-undo.test.ts`)                                                              | `createGit`                                       |
| `tests/backend/actions/workflows.test.ts`, `tests/extension/remote-preferences.test.ts`, `tests/extension/view-preferences.test.ts`, `tests-ext/historyDocuments.test.ts`                                                                      | `gitClientFactory` (and `createGit` in the first) |
| `tests/backend/queries/loadCommits/fixtures.ts`                                                                                                                                                                                                | `PARSED_OUTPUT_ARGS`                              |
| `tests/extension/{action-dispatch,graph-queries,query-cancellation,action-repository,nested-repository,workspace-rows}.test.ts`                                                                                                                | mock the module with only `gitClientFactory`      |

No code uses `GitClient`, `GitInstance`, `PARSED_OUTPUT_CONFIG` (outside this module), `setRepo` or `setGitPath` (only a test mock object mentions `setRepo`).

### E.2 Dependencies the implementation must use

`import { simpleGit } from "simple-git"` and `import type { SimpleGit } from "simple-git"`. Nothing from the repository.

### E.3 Behaviour

#### E.3.1 What every client does

A client made by `createGit(repoPath, gitPath, abort?)` is a simple-git instance with these properties:

- **Base directory** `repoPath`.
- **Executable and prefix.** Every process it starts has the argument list `--no-optional-locks`, then `-c <setting>` for each `PARSED_OUTPUT_CONFIG` entry in order, then the command. That is, its arguments begin with exactly `PARSED_OUTPUT_ARGS`. `tests/backend/queries/loadCommits/processes.test.ts` records every process and strips `PARSED_OUTPUT_ARGS.join(" ") + " "`; any process without that prefix fails the test.
  - `--no-optional-locks`: `optionalLocks.test.ts` requires that loading the graph, the repository state and the workspace rows leaves `.git/index` byte-for-byte unchanged, while a plain `git status` in the same situation rewrites it.
  - Each `-c` entry pins a setting to the value the backend's parsers assume, whatever the user configured: `log` prints no signature-check lines, no command emits colour escape codes, and `status` lists every untracked file. `hostile.gitconfig` sets the opposite of each, and the backend suite must still pass with it. Settings not in the list keep the user's values.
- **Unusual executable paths are accepted, silently.** simple-git 3.36 refuses an executable path containing characters such as spaces or parentheses unless the client option `unsafe.allowUnsafeCustomBinary` is set, and when it is set it writes the line "Invalid value supplied for custom binary, restricted characters must be removed or supply the unsafe.allowUnsafeCustomBinary option" with `console.warn` while constructing the client. `createGit` must accept such paths and must print nothing: that warning is not allowed to appear, and `console.warn` must be the original function again when `createGit` returns **or throws**. No other console output is produced. (The repository's lint configuration forbids `console` use, so touching it needs an explicit lint exemption.)
- **Concurrency:** at most 6 processes run at once per client; further commands queue (observed with a wrapper that sleeps 0.3 s: 14 concurrent commands on one client took 0.93 s, while 12 commands on 12 separate clients took 0.33 s). Processes started through `runGit` are not counted.
- **Output is not trimmed:** `raw()` resolves Git's standard output exactly, with its final newline (`"main\n"`). Callers strip exactly one trailing newline where paths may end in spaces or newlines.
- **Cancellation:** when `abort` is given, simple-git refuses new commands once it is aborted and kills running ones (§0.2). Without it, commands cannot be cancelled.
- **Failure semantics** as described in §0.2 (simple-git defaults, unchanged).
- **Registration:** the client is associated with `{ gitPath }` or `{ gitPath, abort }` so that `gitProcessOf` can return it.

`createGit` is synchronous and starts no process. If `repoPath` does not exist or is not a directory, it throws synchronously, with simple-git's `GitConstructError` "Cannot use simple-git on a directory that does not exist". An empty or otherwise strange `gitPath` does not throw at creation; commands fail when they run.

#### E.3.2 `gitProcessOf(git)`

Returns the association made by `createGit` for this exact client object: `{ gitPath }` when it was made without a signal (the object has no `abort` key) or `{ gitPath, abort }` with the same signal object. Returns `undefined` for any client not made by `createGit` (for example `simpleGit(repo)` in `tests-ext/gitActions.test.ts`). Used by `runGit` to start processes with the same executable and cancellation.

#### E.3.3 `gitClientFactory(repoPath, gitPath, abort?)`

Creates a client immediately with `createGit(repoPath, gitPath, abort)` (so it throws synchronously for a missing directory) and returns a holder:

- `getInstance()` returns the current client; the same object on every call until a setter replaces it.
- `setRepo(newRepoPath)` remembers the new path and replaces the current client with a new one for that path, keeping the current executable and signal.
- `setGitPath(newGitPath)` remembers the new executable and replaces the client likewise, keeping the current path and signal.

Replaced clients keep working for anyone who still holds them. If creating the replacement throws, the exception propagates and `getInstance()` still returns the previous client, but the new path or executable has already been remembered and is used by the next setter call (gitClient Q2).

### E.4 Concrete examples

| Call                                                                                   | Observed                                                                                                                                                   |
| -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `createGit(repo, "git").raw(["status", "--porcelain"])`                                | one process: `git --no-optional-locks -c log.showSignature=false … -c color.grep=never status --porcelain`, cwd `repo`                                     |
| repository config `status.showUntrackedFiles=no`, `color.ui=always`, an untracked file | through the client, `status --porcelain` prints `?? untracked\n` and `branch` prints `* main\n` (no colour); plain `git status --porcelain` prints nothing |
| `createGit("/nonexistent/dir", "git")`                                                 | throws `GitConstructError` "Cannot use simple-git on a directory that does not exist"                                                                      |
| `createGit(repo, "<tmp>/Git (portable)/git")` with `console.warn` spied                | spy not called; `console.warn` is the same function afterwards; `raw(["rev-parse", "HEAD"])` works                                                         |
| the same path given to `simpleGit` directly with the unsafe option                     | one warning: "Invalid value supplied for custom binary, restricted characters must be removed or supply the unsafe.allowUnsafeCustomBinary option"         |
| `gitProcessOf(createGit(repo, "git"))`                                                 | `{ gitPath: "git" }` (`"abort" in result` is false)                                                                                                        |
| `gitProcessOf(createGit(repo, "/usr/bin/git", signal))`                                | `{ gitPath: "/usr/bin/git", abort: signal }`                                                                                                               |
| `gitProcessOf(simpleGit(repo))`                                                        | `undefined`                                                                                                                                                |
| `createGit(repo, "git").raw(["rev-parse", "--abbrev-ref", "HEAD"])`                    | `"main\n"`                                                                                                                                                 |
| client with an aborted signal: `raw([...])`                                            | rejects `GitPluginError` "Abort already signaled"                                                                                                          |
| signal aborted 50 ms into a slow command                                               | rejects `GitPluginError` "Abort signal received"                                                                                                           |
| `f = gitClientFactory(repo, "git", s)`; `f.setRepo(other)`                             | new instance; its `rev-parse --show-toplevel` is `other`; `gitProcessOf(new).abort === s`; the old instance still works on `repo`                          |
| `f.setRepo("/nonexistent/abc")`                                                        | throws "Cannot use simple-git on a directory that does not exist"; `getInstance()` unchanged                                                               |

### E.5 Non-functional requirements

- **Import time:** defines the two constant arrays and an empty association table; creates no client and starts no process.
- **No leaks:** the association from client to executable and signal must not keep clients alive. Clients are created per request (every action, query and graph read makes a new one), so a strong table would grow without bound.
- **Synchronous creation:** `createGit` and `gitClientFactory` return synchronously; callers chain immediately (`createGit(repo, "git").revparse(...)`).
- **Stable constants:** other modules and tests spread and join the two arrays; they must not be mutated at run time, and their declared type must remain assignable to `string[]` (simple-git's `config` option and `spawn` take mutable arrays).
- **Console:** nothing printed, `console.warn` always restored (§E.3.1).
- **Hostile configuration:** all backend tests pass with `tests/fixtures/hostile.gitconfig`; that depends on these settings.

### E.6 Test coverage

**Already checked:** the prefix on every process (`loadCommits/processes.test.ts` via `recordingGit`); reads do not rewrite the index (`queries/optionalLocks.test.ts`); signature and colour settings do not corrupt parsing (`queries/signedCommits.test.ts` and the whole backend suite under `NGG_HOSTILE_GIT_CONFIG=1`); an executable path with spaces and parentheses works for the graph and repository search (`utils/gitPath.test.ts`); abort through `createGit`'s signal stops network processes via `runGit` (`actions/networkCancel.test.ts`); an already-aborted `gitClientFactory` signal makes queries reject while another client is unaffected (`actions/workflows.test.ts`); spies on client methods count processes (`actions/batchedProcesses.test.ts`).

**Gaps**

1. _Exact constant values._ Call: import both constants. Expect: `toEqual` the arrays in §E.1. (Today a changed list would silently change what `processes.test.ts` strips.)
2. _Missing directory throws synchronously._ Call: `() => createGit("/nonexistent-ngg", "git")` and `() => gitClientFactory("/nonexistent-ngg", "git")`. Expect: both throw /does not exist/.
3. _No console output for unusual executable paths._ Setup: a symlink to Git at `<tmp>/Git (portable)/git`; `vi.spyOn(console, "warn")`; keep a reference `before = console.warn`. Call: `createGit(repo, thatPath)`. Expect: the spy was not called; `console.warn === before`. Also with a missing directory: throws and `console.warn === before`.
4. _`gitProcessOf`._ Expect: `gitProcessOf(createGit(repo, "git"))` equals `{ gitPath: "git" }` and has no `abort` key; with a signal, `.abort` is that signal; `gitProcessOf(simpleGit(repo))` is `undefined`.
5. _Output is not trimmed._ Call: `createGit(repo, "git").raw(["rev-parse", "--abbrev-ref", "HEAD"])`. Expect: `"main\n"`.
6. _At most six processes at once per client._ Setup (POSIX): a wrapper executable that appends `start`/`end` lines to a log around `sleep 0.3` before running Git. Call: 14 concurrent `raw(["rev-parse", "HEAD"])` on one client. Expect: replaying the log, the number of started-but-not-ended processes never exceeds 6.
7. _Factory setters._ Setup: two repositories A and B; `f = gitClientFactory(A, "git", signal)`. Call: `f.getInstance()` twice; `f.setRepo(B)`; `f.setGitPath(realGitPath)`. Expect: the first two instances are identical; after each setter a different instance; after `setRepo`, `rev-parse --show-toplevel` is B and `gitProcessOf(...).abort` is `signal`; after `setGitPath`, `gitProcessOf(...).gitPath` is the new path.
8. _Abort while a client command runs._ Setup: slow wrapper executable; client with a signal. Call: `raw(["rev-parse", "HEAD"])`, abort after 50 ms. Expect: rejects /Abort signal received/.

### E.7 Questions

- **gitClient Q1.** `GitInstance` is the type of the `getInstance` _function_, not of the client it returns, and neither `GitInstance` nor `GitClient` is used anywhere. Keep them as they are, change `GitInstance` to mean `SimpleGit`, or drop them?
- **gitClient Q2.** `setRepo` and `setGitPath` have no callers. If creating the replacement fails, the factory still remembers the bad path, so a later `setGitPath` fails for a reason unrelated to its own argument. Should the factory remember the new value only after the new client exists, or should the setters be removed?
- **gitClient Q3.** The settings list covers signatures, colour and untracked files. Other settings in `hostile.gitconfig` (`format.pretty`, `log.decorate`, `core.quotePath`, `branch.sort`, `column.ui`) are handled by each command asking for explicit formats instead. Is the list meant to stay minimal, with that responsibility on each command, or to grow?

---

## F. `src/backend/utils/git.ts`

### F.1 Interface

**Module path:** `src/backend/utils/git.ts` (`@/backend/utils/git`). The path must not change: `tests/backend/utils/repoPath.test.ts`, `tests/extension/scan-repo-windows.test.ts` and `tests/extension/view-command.test.ts` mock it by this path.

```ts
export async function workTreeRoot(directory: string, gitPath: string): Promise<string | null>;
export async function getSubmodulePaths(repoPath: string, gitPath: string): Promise<string[]>;
export async function getRemoteUrl(repoPath: string, gitPath: string): Promise<string | null>;
```

| Parameter   | Meaning                                                                |
| ----------- | ---------------------------------------------------------------------- |
| `directory` | Any folder (absolute, or relative to the process's current directory). |
| `repoPath`  | A folder in a repository, normally its top level.                      |
| `gitPath`   | The Git executable, as for `createGit`.                                |

**Who uses what**

| User                                                                                                         | Exports                                                                                 |
| ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| `src/backend/utils/repoSearch.ts`                                                                            | `workTreeRoot` (on every folder the workspace scan visits), `getSubmodulePaths`         |
| `src/extension/view-command.ts`                                                                              | `workTreeRoot` (folder clicked in Source Control; falls back to the folder when `null`) |
| `src/old-extension/fileHistoryCommand.ts`                                                                    | `workTreeRoot` (`null` → "Select a workspace file to view its history.")                |
| `tests/backend/utils/workTreeRoot.test.ts`                                                                   | `workTreeRoot`                                                                          |
| `tests/backend/queries/submoduleDiscovery.test.ts`                                                           | `getSubmodulePaths`                                                                     |
| `tests/backend/utils/getRemoteUrl.test.ts`                                                                   | `getRemoteUrl` (its only user)                                                          |
| `repoSearch.test.ts` (both folders), `gitPath.test.ts`, `workTreeRoot.test.ts`, `submoduleDiscovery.test.ts` | indirectly, through `searchDirectoryForRepos` / `findGitRepos`                          |
| `repoPath.test.ts`, `scan-repo-windows.test.ts`                                                              | mock `workTreeRoot` and `getSubmodulePaths`                                             |
| `view-command.test.ts`                                                                                       | mocks `workTreeRoot` only                                                               |

### F.2 Dependencies the implementation must use

| Import                                              | For                                                                                                                              |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `realpath` from `node:fs/promises`                  | Resolving symlinks in the top level (the promise version uses the operating system's real-path call, like `fs.realpath.native`). |
| `createGit` from `@/backend/gitClient`              | One client per call, without an abort signal.                                                                                    |
| `normalizeRepoPath` from `@/backend/utils/repoPath` | The repository key format: normalized, forward slashes, lower-case drive letter on Windows.                                      |

### F.3 Behaviour

All three functions **never reject**: every failure (missing folder, which makes `createGit` throw; Git missing or failing; `realpath` failing) becomes `null` or `[]`. Each runs exactly one Git process through a client based at the given folder.

#### F.3.1 `workTreeRoot(directory, gitPath)`

Runs `rev-parse --show-toplevel` in `directory` and removes exactly one trailing newline from the output. An empty result gives `null`. Otherwise the result is the real path of that top level (every symlink resolved by `realpath`), in `normalizeRepoPath` form.

- A repository's top level, any subfolder, a symlink (or Windows junction) to the repository or to a subfolder of it: all give the repository's **real** top level. `workTreeRoot.test.ts` relies on this when it expects `findGitRepos` to list a repository once for `[outside, repo, subfolder, link]`.
- A linked worktree gives its own top level; a submodule folder gives the submodule's top level.
- `null` for: a folder outside any work tree, the `.git` folder or anything inside it, a bare repository, a path that does not exist or is a file, and a missing or broken Git executable.
- A top level whose name ends in a newline keeps that newline (only Git's own terminator is removed).

#### F.3.2 `getSubmodulePaths(repoPath, gitPath)`

Runs, in `repoPath`:

```
submodule foreach --quiet --recursive printf "%s\0" "$toplevel/$sm_path"
```

(the last argument is the single string `printf "%s\0" "$toplevel/$sm_path"`, with a literal backslash and zero, which `printf` turns into a NUL byte). Splits the output on NUL, drops empty pieces, and normalizes each with `normalizeRepoPath`.

- Only **initialized** submodules appear (a deinitialized one is left out); nested submodules of initialized submodules appear too, each right after its parent, in Git's traversal order (index order, which is path order, depth first).
- Each entry is the absolute path of the submodule's work tree built from Git's `$toplevel` (the real path of the superproject that contains it) and `$sm_path`. Entries are separated by NUL, the one byte a path cannot contain, so any other character, including spaces, is kept. The result is not passed through `realpath`.
- Works from any folder of the superproject (the list is always for the whole superproject).
- `[]` when there are no initialized submodules, outside a repository, for a missing folder or executable, and **whenever Git's traversal fails for any submodule** (a broken initialized submodule empties the whole list; utils/git Q2).

#### F.3.3 `getRemoteUrl(repoPath, gitPath)`

Runs `config --get remote.origin.url`. Trims whitespace from the output; empty → `null`, otherwise the URL.

- No `origin` remote → Git exits with status 1 and prints nothing, which the client treats as success with empty output → `null`.
- Several `remote.origin.url` values → the last one (Git's `--get`). The URL is the raw configured value: `url.<base>.insteadOf` rewriting is not applied, and surrounding spaces are removed.
- Other remotes are ignored.

### F.4 Concrete examples

| Call                                                                                                                                                              | Observed                                                                                         |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `workTreeRoot("<repo>", "git")`, `("<repo>/a/b")`, `("<repo>/a/")`                                                                                                | `"<repo>"`                                                                                       |
| `workTreeRoot("<outside>/link")` where `link` → `<repo>`; `("<outside>/link/a")`                                                                                  | `"<repo>"`                                                                                       |
| `workTreeRoot("<repo>/.git")`, `("<repo>/.git/refs")`, bare repo, `"<outside>"`, `"<outside>/missing"`, `"<repo>/f"` (a file)                                     | `null`                                                                                           |
| `workTreeRoot("<repo>", "/nonexistent/git")`                                                                                                                      | `null`                                                                                           |
| `workTreeRoot("<wt>")` for a linked worktree of `<repo>`                                                                                                          | `"<wt>"`                                                                                         |
| `workTreeRoot("a", "git")` with the process's current directory at `<repo>`                                                                                       | `"<repo>"`                                                                                       |
| `workTreeRoot("<tmp>/name\n")` for a repository whose folder name ends in a newline                                                                               | `"<tmp>/name\n"`                                                                                 |
| parent with initialized `sub/child module` (containing initialized `nested module`), initialized `zz second`, uninitialized `uninit`: `getSubmodulePaths(parent)` | `["<parent>/sub/child module", "<parent>/sub/child module/nested module", "<parent>/zz second"]` |
| same, called from `<parent>/sub` or through a symlink to `<parent>`                                                                                               | the same list (paths under the real `<parent>`)                                                  |
| `getSubmodulePaths("<parent>/sub/child module")`                                                                                                                  | `["<parent>/sub/child module/nested module"]`                                                    |
| parent with submodules `a`, `b`; `a`'s folder deleted                                                                                                             | `["<parent>/b"]`                                                                                 |
| parent with submodules `a`, `b`; `a/.git` points to a missing directory                                                                                           | `[]`                                                                                             |
| `getSubmodulePaths` on a repo without submodules / outside a repo / missing Git                                                                                   | `[]`                                                                                             |
| `getRemoteUrl` with `origin` = `https://github.com/some/repo.git`                                                                                                 | `"https://github.com/some/repo.git"`                                                             |
| `getRemoteUrl` with `origin` URL `"  https://example.com/x.git  "`                                                                                                | `"https://example.com/x.git"`                                                                    |
| then `git config --add remote.origin.url https://second/y.git`                                                                                                    | `"https://second/y.git"`                                                                         |
| no remote / `/tmp/ngg-test-does-not-exist-xyz`                                                                                                                    | `null`                                                                                           |

On Windows, `normalizeRepoPath` gives forward slashes and a lower-case drive letter (`C:\workspace` → `c:/workspace`), which the Windows-path tests rely on through mocks.

### F.5 Non-functional requirements

- Never throw or reject (callers use the results directly, for example `root ?? folder`).
- One Git process per call, no abort signal, no caching (repositories and submodules change between scans). `workTreeRoot` is called once per folder visited by a workspace scan, so it must stay one process.
- Nothing at import time.
- Results are repository keys: always in `normalizeRepoPath` form, so they compare equal to VS Code paths and to keys saved in extension state.

### F.6 Test coverage

**Already checked:** `utils/workTreeRoot.test.ts` (repository, subfolder, symlink and symlink subfolder map to the real normalized top level; outside, `.git`, missing → `null`; workspace discovery lists a repository once); `queries/submoduleDiscovery.test.ts` (nested submodules and spaces, in order `[child, nested]`; none → `[]`; missing Git → `[]`; uninitialized excluded and deduplication, through `findGitRepos`); `utils/getRemoteUrl.test.ts` (URL; no remote → `null`; missing folder → `null`); `utils/repoSearch.test.ts`, `queries/repoSearch.test.ts`, `utils/gitPath.test.ts` (scans through these helpers, including an executable path with spaces).

**Gaps**

1. _`workTreeRoot` with a missing Git executable._ Call: `workTreeRoot(repo, join(repo, "missing-git"))`. Expect: `null`.
2. _Bare repository and file path._ Setup: `git init --bare <dir>`; `makeRepo()`. Call: `workTreeRoot(<dir>)`, `workTreeRoot(join(repo, "f"))`. Expect: both `null`.
3. _Linked worktree._ Setup: `git worktree add <wt>`. Call: `workTreeRoot(<wt>)`. Expect: `normalizeRepoPath(<wt>)`.
4. _Only one trailing newline removed_ (POSIX only). Setup: `git init` in a folder named `"name\n"`. Call: `workTreeRoot(thatFolder)`. Expect: a string ending in `"name\n"`.
5. _Submodules from a subfolder._ Setup: the `submoduleDiscovery` fixture. Call: `getSubmodulePaths(join(parent, "src"), "git")`. Expect: `[child, nested]`.
6. _Submodules outside a repository._ Call: `getSubmodulePaths(os.tmpdir-made empty folder, "git")`. Expect: `[]`.
7. _`getRemoteUrl` trims and takes the last value._ Setup: `git remote add origin "  https://a/x.git  "`. Expect: `"https://a/x.git"`; after `git config --add remote.origin.url https://b/y.git`, `"https://b/y.git"`.
8. _`getRemoteUrl` ignores other remotes._ Setup: only `upstream` configured. Expect: `null`.
9. _A broken submodule_ (pins utils/git Q2). Setup: two initialized submodules; replace one's `.git` file with `gitdir: /nonexistent`. Expect today: `[]`.

### F.7 Questions

- **utils/git Q1.** `getRemoteUrl` has no caller outside its own test. Keep it, or remove it together with the test?
- **utils/git Q2.** One broken initialized submodule makes `getSubmodulePaths` return `[]` for the whole superproject, hiding healthy submodules from the workspace list. Is all-or-nothing intended, or should the healthy ones still be listed?
- **utils/git Q3.** `workTreeRoot` returns `null` for "not in a work tree" and for "Git could not run" alike, so a wrong `git.path` makes every folder look like a non-repository without any message. Is that silence intended for these callers?
- **utils/git Q4.** `workTreeRoot` resolves symlinks with `realpath`, but `getSubmodulePaths` returns Git's paths without doing so. They agree today because Git reports real paths, but only `workTreeRoot` guarantees it. Should both guarantee real paths?

---

## Decisions (from the project maintainer's side)

These decisions replace the "current behaviour" wherever they differ. Build to these, and test the decided behaviour. Every question not listed as changed is **keep**. Where a decision needs a refusal message, reuse an existing localized string when one fits (for example those the validation helpers already produce); if a new string is unavoidable, add it through the l10n tables with zh-cn and zh-tw translations so that `pnpm run l10n:check` passes.

- **branch Q1: a local checkout only switches branches.** With `remoteBranch === null`, the action switches to the existing local branch `branchName` and nothing else. If no local branch of that name exists, it refuses before running any command that changes the repository, and changes nothing. It must never restore paths, create a tracking branch, or detach HEAD, whatever the name matches (a file, a remote branch, a tag, an option-like string). Git's own refusal when local changes would be overwritten stays as it is.
- **commit Q1: checking out a commit always detaches at a commit.** `checkoutCommit` refuses, without running Git, a `commitHash` that is not 4 to 64 hexadecimal characters. Otherwise HEAD ends detached at that commit; a value is never read as a branch, a path or an option.
- **commit Q2: reset takes only commits and known modes.** `resetToCommit` refuses, without running Git, a `commitHash` that is not 4 to 64 hexadecimal characters, and a `resetMode` other than `soft`, `mixed` or `hard`. The value is always read as a commit, never as a path or an option.
- **commit Q3: parent numbers are whole.** `cherrypickCommit` and `revertCommit` refuse, without running Git, a `parentIndex` that is not a whole number of 0 or more. 0 keeps its meaning ("no parent choice"), and 1 or more selects that parent, as today.
- **commit Q1/Q2, extended to cherry-pick and revert** (added after the first implementation): `cherrypickCommit` and `revertCommit` also refuse, without running Git, a `commitHash` that is not 4 to 64 hexadecimal characters.
- **merge Q1: tell an existing merge apart.** When a merge was already in progress before the call (`MERGE_HEAD` existed before Git ran), the action reports Git's own failure, not "stopped on conflicts". A merge that the call itself started and that leaves `MERGE_HEAD` is still reported as stopped on conflicts.
- **tag Q1: `HEAD` is not a tag name.** A tag named exactly `HEAD` is refused before any Git command runs, as `createBranch` refuses it.
- **gitClient Q1: drop unused types.** `GitClient` and `GitInstance` are not exported if nothing outside the module uses them.
- **utils/git Q1: drop `getRemoteUrl`.** Nothing but its own test uses it; remove it and `tests/backend/utils/getRemoteUrl.test.ts` with it.
- Everything else: keep. In particular branch Q2 – Q6, commit Q4, merge Q2 – Q4 (the `binary` parameter stays), tag Q2 – Q4, gitClient Q2 – Q3 and utils/git Q2 – Q4 stay as they are.
