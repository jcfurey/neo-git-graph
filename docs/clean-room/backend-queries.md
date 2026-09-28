# Clean-room specification: branch list, repository discovery, bounded concurrency, short hashes

This document specifies five modules of Branchwise's extension-host backend (one also reaches the
webview). It describes what they do as seen from outside: their exports, the Git commands they
cause, their results, and their failures. It does not describe how the current files are written.

| Section | Module                                | Export(s)                 |
| ------- | ------------------------------------- | ------------------------- |
| A       | `src/backend/queries/loadBranches.ts` | `loadBranches`            |
| B       | `src/backend/queries/repoSearch.ts`   | `findGitRepos`            |
| C       | `src/backend/utils/repoSearch.ts`     | `searchDirectoryForRepos` |
| D       | `src/backend/utils/promise.ts`        | `evalPromises`            |
| E       | `src/backend/utils/string.ts`         | `abbrevCommit`            |

---

## 0. Shared background

### 0.1 How the observations were made

Everything under "Examples" was observed by running the current modules. The setup was Git 2.43.0,
Node 22.22 on Linux, running as root, with the test suite's global Git configuration
(`GIT_CONFIG_GLOBAL=tests/fixtures/gitconfig`, `GIT_CONFIG_NOSYSTEM=1`). The exact command lines
were recorded with a wrapper executable that logged its arguments and working directory. `T` stands
for a fresh temporary directory, given as its real path. All scratch files have been deleted.

### 0.2 How every Git process is started

None of these modules starts a process directly. Every Git process goes through a simple-git client
made by `createGit` in `@/backend/gitClient`. For `loadBranches`, the caller supplies the client.
For repository search, the `@/backend/utils/git` helpers create one per call. Each process is started as:

`<gitPath> --no-optional-locks -c log.showSignature=false -c status.showUntrackedFiles=all -c color.ui=never -c color.branch=never -c color.diff=never -c color.status=never -c color.showBranch=never -c color.grep=never <arguments>`

The process runs in the client's base directory. Below, "runs `X`" means `<arguments>` is `X`,
with each space-separated word passed as a separate argument unless stated otherwise. The modules
add no `-c` settings or environment variables of their own.

### 0.3 Conditions the tests run under

- CI runs `pnpm run test` on Linux, Windows and macOS. On Linux it also runs the backend suite in a
  shuffled order (`--sequence.shuffle`). A further Linux run uses `NGG_HOSTILE_GIT_CONFIG=1`, which
  switches the global configuration to `tests/fixtures/hostile.gitconfig`: colour forced on,
  `branch.sort=-committerdate`, `column.ui=always`, `core.quotePath`, `log.decorate=full` and
  others. That run also sets Git's messages to German (`LANG=de_DE.UTF-8`, `LC_ALL`, `LANGUAGE=de`).
  As a result:
  - output parsing must not depend on the user's Git configuration or language;
  - new tests must not assert Git's English error text;
  - in that job, the Node process's default locale may be German.
- On macOS the temporary directory is reached through a symlink, so tests compare against
  `fs.realpathSync.native(...)` and `normalizeRepoPath(...)`.
- Backend tests (`tests/backend/**`) run without any `vscode` module. Backend modules must not
  import `vscode`.

### 0.4 Repository checks every rewritten file must pass

- `pnpm run typecheck`. The settings are `strict`, `noUncheckedIndexedAccess`,
  `exactOptionalPropertyTypes`, `noUnusedLocals`, `noUnusedParameters`, `verbatimModuleSyntax`
  (type-only imports must say `import type`) and `isolatedModules`. `src/backend/utils/string.ts` is
  also compiled by the webview project (`src/webview/tsconfig.json`: DOM libraries, no Node or
  VS Code types).
- `pnpm run lint` (oxlint): Node built-ins must use the `node:` protocol; imports must be grouped
  and alphabetised, with `@/…` as the internal group; `if` bodies need braces.
- `pnpm run format` (oxfmt).
- `pnpm run check:provenance`, as described in `docs/provenance.md`.

---

## A. `src/backend/queries/loadBranches.ts`

### A.1 Interface

The module has one export:

`export async function loadBranches(git: SimpleGit, input: { showRemoteBranches: boolean; hiddenRemotes?: string[]; hard: boolean; repo: string; gitPath: string }): Promise<QueryResult<"loadBranches">>`

The input's type is not exported and no caller names it. It may be written inline or as a private
alias. Under `exactOptionalPropertyTypes`, `hiddenRemotes` may be left out, but callers never pass
`undefined` for it.

| Parameter / field          | Meaning                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `git`                      | A simple-git client already bound to the repository directory and the Git executable. In production it also carries the caller's `AbortSignal`. All Git reads must go through this client, so that the caller's executable, working directory, cancellation and settings apply. They should use `git.raw([...])` with an argument array. Tests elsewhere in the suite spy on `raw` and match on `args[0][0]` to inject failures, and the dependency helpers in A.2 already work this way. |
| `input.showRemoteBranches` | When `false`, the result contains no remote-tracking branches, and nothing about remotes is read from Git.                                                                                                                                                                                                                                                                                                                                                                                |
| `input.hiddenRemotes`      | Names of remotes whose remote-tracking branches must be left out. Leaving it out means none. It is consulted only when `showRemoteBranches` is `true`. Duplicates and names that are not remotes are harmless.                                                                                                                                                                                                                                                                            |
| `input.hard`               | An opaque flag, copied unchanged to the result. The webview always sends `true` and never reads it back.                                                                                                                                                                                                                                                                                                                                                                                  |
| `input.repo`               | Copied unchanged to the result. It is not normalised and not used to find the repository, because `git` is already bound to it.                                                                                                                                                                                                                                                                                                                                                           |
| `input.gitPath`            | Accepted but has no effect, because the client already names the executable (see A.7 Q1).                                                                                                                                                                                                                                                                                                                                                                                                 |

**Result.** `QueryResult<"loadBranches">` is defined in `src/backend/types/queries.types.ts` and
re-exported from `@/backend/types`. Its shape is
`{ repo: string; branches: string[]; head: string | null; hard: boolean; isRepo: boolean; visibilityKey?: string | undefined }`.
The fulfilled value must have exactly five own properties: `repo`, `branches`, `head`, `hard` and
`isRepo`. It must not have a `visibilityKey` property at all, not even one set to `undefined`. The
caller writes its own `visibilityKey` first and then spreads this result over it, so an own
`undefined` would erase the caller's value.

**Who uses it**

- `src/old-extension/messageHandler.ts` answers the webview's `loadBranches` request.
  - It builds a client with `gitClientFactory(repo, config.gitPath(), signal).getInstance()`. A
    newer request of the same kind aborts the older one's signal.
  - It calls `loadBranches(git, { showRemoteBranches, hiddenRemotes: msg.hiddenRemotes ?? [], hard, repo, gitPath: config.gitPath() })`.
  - On success it posts `{ command: "loadBranches", visibilityKey, ...result, repo, requestId }`,
    unless the request was superseded.
  - On rejection it posts
    `{ command: "graphQueryError", query: "loadBranches", repo, requestId, message }`. `message` is
    `error.message` for an `Error` and `String(error)` for anything else.
- `src/webview/lib/handler/load-branches.ts` (webview) consumes the reply.
  - It stores `branches` as the branch list (the branch dropdown and filter) and `head` as the head
    branch.
  - If the current selection is not in `branches`, it falls back to a remembered branch, to `head`,
    or to "show all".
- The `remotes/<remote>/<branch>` naming of list entries is shared with `branchListRef` in
  `@/backend/utils/refs`, which turns a list entry back into a full ref for `loadCommits`. Webview
  code (`RefsPane.tsx`, `RefLabel.tsx`, `menus.tsx`, `actions.ts`) also builds entries by adding
  `remotes/` to a remote branch name.
- Tests that call it: `tests/backend/queries/loadBranches/list.test.ts`,
  `tests/backend/queries/graphErrors.test.ts` and `tests/backend/queries/remoteVisibility.test.ts`.
  `tests/extension/graph-queries.test.ts` replaces it with a mock that has only the export
  `loadBranches`.

### A.2 Dependencies the implementation must use

| Import                    | From                               | Purpose                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `SimpleGit` (type only)   | `simple-git`                       | Type of the client parameter. This module must not import simple-git at run time.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `QueryResult` (type only) | `@/backend/types`                  | Return type, `QueryResult<"loadBranches">`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `refNames`                | `@/backend/utils/refs`             | `refNames(git, "refs/heads/" \| "refs/remotes/")` resolves to the short names of the refs in that namespace, with the namespace prefix removed. Symbolic refs such as `origin/HEAD` are left out. Names come in Git's default ref-name order. It runs `for-each-ref --format=%(if)%(symref)%(then)%(else)%(refname)%(end) <namespace>` and rejects when Git fails.                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `currentBranch`           | `@/backend/utils/refs`             | `currentBranch(git, branches)` resolves to the checked-out branch's short name when HEAD is a symbolic ref to `refs/heads/<name>` and `<name>` is in `branches`. Otherwise it resolves to `null`. It runs `symbolic-ref --quiet HEAD`, which follows a chain of symbolic refs to the end, and never rejects: any Git failure gives `null`.                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `remoteVisibility`        | `@/backend/utils/remoteVisibility` | `remoteVisibility(git, { showRemoteBranches?, hiddenRemotes? })` resolves to `{ excluded: Set<string>; logArgs: string[] }`. Only `excluded` is needed here: the short names of remote-tracking refs (without `refs/remotes/`) whose remote is hidden. The set is empty, and no Git runs, when `showRemoteBranches` is `false` or no remotes are hidden. Otherwise it runs `remote` and `for-each-ref --format=%(refname) refs/remotes/`. A ref belongs to the longest name, among the configured remotes and the hidden names, that prefixes the ref followed by `/`. If none does, it belongs to the text before the ref's first `/`. It rejects when either command fails. `loadCommits` and history search use the same helper, so using it keeps the branch list consistent with the graph. |

`loadBranches` passes its whole `input` as the options, or at least `showRemoteBranches` and
`hiddenRemotes`.

### A.3 Behaviour

**Git commands.** The first two lines below always run. The others depend on the input.

| Condition                                               | Commands (arguments after the prefix of 0.2)                                       |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| always                                                  | `for-each-ref --format=%(if)%(symref)%(then)%(else)%(refname)%(end) refs/heads/`   |
| always                                                  | `symbolic-ref --quiet HEAD`                                                        |
| `showRemoteBranches` true                               | `for-each-ref --format=%(if)%(symref)%(then)%(else)%(refname)%(end) refs/remotes/` |
| `showRemoteBranches` true and `hiddenRemotes` not empty | `remote`, and `for-each-ref --format=%(refname) refs/remotes/`                     |

- No other Git command runs: no `git branch`, no `status`, nothing that writes.
- The reads may run concurrently. Their order is not significant.
- Once a required read has failed, the remaining commands need not be started. Currently the HEAD
  read is not started in that case.

**Order of `branches`**

1. `head` comes first, when it is not `null`.
2. The remaining local branches follow in Git's ref-name order. This is byte order of the full ref
   name: uppercase before lowercase, `-` before `.` before `_` before lowercase letters, and
   non-ASCII after ASCII. `branch.sort`, colour settings, `column.ui` and `core.quotePath` do not
   change it.
3. Last come the remote-tracking branches that are not hidden, each written as `remotes/` plus its
   short name (for example `remotes/origin/main`), also in ref-name order.

**What appears in `branches`**

- Each entry appears once.
- Symbolic refs never appear. That covers `refs/remotes/origin/HEAD` and a symbolic ref under
  `refs/heads/`.
- A detached HEAD, a rebase or bisect in progress, tags and stashes never add entries.
- Names are Git's ref names without any quoting. Slashes, quotes, non-ASCII characters and the name
  `HEAD` (as `refs/heads/HEAD`) all appear as stored.
- A local branch is never prefixed. A local branch literally named `origin/main` appears as
  `origin/main`, beside `remotes/origin/main`. A local branch literally named `remotes/foo` appears
  as `remotes/foo` (see A.7 Q3).
- Remote-tracking refs that belong to no configured remote, such as `refs/remotes/lonely` or a
  leftover `refs/remotes/gone/x`, are listed unless the hiding rule below removes them.

**`head`**

- `head` is the short name of the checked-out branch when HEAD refers to an existing local branch.
- If HEAD refers to a symbolic ref under `refs/heads/` that leads to another branch, `head` is the
  branch at the end of the chain.
- `head` is `null` in these cases:
  - HEAD is detached, whether by `checkout --detach` at a branch, tag or hash, by a rebase in
    progress, or by a bisect;
  - HEAD names a branch that has no commit yet (a new repository, or `checkout --orphan`);
  - the HEAD read fails for any reason.

  A HEAD failure is never an error.

**Hiding remotes.** A remote-tracking entry `remotes/<name>` is left out when `<name>` belongs to a
hidden remote, as `remoteVisibility` decides:

- Hiding `team` removes `remotes/team/dev`. It keeps `remotes/team/upstream/dev` when
  `team/upstream` is a configured remote.
- Hiding `team/upstream` removes only that remote's entries.
- A hidden name that is not configured but has refs, such as `gone` for `refs/remotes/gone/x`,
  still hides them.
- Hiding `lonely` removes `remotes/lonely`.

**Other fields.** `repo` is `input.repo`, `hard` is `input.hard`, and `isRepo` is always `true`
when the call succeeds.

**Failures.** The returned promise rejects with the error of the first required read that fails.
The required reads are the local list, the remote list and the remote-visibility reads. There is no
"empty result with `isRepo: false`" path. What callers see:

- The directory is not in a repository: a simple-git `GitError` carrying Git's message. In English
  that is `fatal: not a git repository (or any of the parent directories): .git\n`, translated
  under other locales.
- The repository directory was removed after the client was created: a `GitError` whose message
  starts with `Error: spawn git ENOENT`.
- The Git executable does not exist: a `GitError` whose message starts with
  `Error: spawn /nonexistent/git ENOENT`, naming the configured path.
- The client's signal was aborted before Git answered: simple-git's `GitPluginError` with message
  `Abort already signaled`.
- The message handler turns any of these into a `graphQueryError` with that message.

**Where the repository can be.** Git finds the repository from the client's directory. That can be
a subfolder of the work tree, the `.git` directory itself, or a bare repository. All of these
succeed and list that repository's branches. A bare repository reports `head` from its HEAD.

**Unborn repository.** A new repository with no commits succeeds with
`{ branches: [], head: null, isRepo: true }`.

**Timing, events, disposal.** There are none: no timeouts, retries or debouncing. Cancellation
belongs to the client: once its signal is aborted, pending and later reads reject.

### A.4 Examples (observed)

**Test repository.** Branches `main`, `alpha`, `Beta`, `zeta`, `feature/x`, `a-b`, `a.b`, `a_b`
and `é-accent`, with `zeta` checked out.

| Case                             | Input                                          | Result                                                                                                                                                                                                               |
| -------------------------------- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Remote branches off              | `showRemoteBranches: false, hard: false`       | `{"repo":<repo>,"branches":["zeta","Beta","a-b","a.b","a_b","alpha","feature/x","main","é-accent"],"head":"zeta","hard":false,"isRepo":true}`. Git ran `for-each-ref … refs/heads/` and `symbolic-ref --quiet HEAD`. |
| Remote branches on               | same, `showRemoteBranches: true`, no remotes   | Same result. Git also ran `for-each-ref … refs/remotes/`.                                                                                                                                                            |
| `branch.sort=-committerdate` set | same                                           | Same order.                                                                                                                                                                                                          |
| Symbolic branch added            | `refs/heads/alias` points to `refs/heads/main` | `alias` is not listed.                                                                                                                                                                                               |
| HEAD set to the symbolic branch  | `git symbolic-ref HEAD refs/heads/alias`       | `head: "main"`, and `branches` starts with `"main"`.                                                                                                                                                                 |

**Remotes repository.** Remotes `origin`, `team` and `team/upstream`, each fetched with branches
`main` and `dev`. `origin/HEAD` is set. `refs/remotes/lonely` and `refs/remotes/gone/x` point at a
commit. A local branch is named `origin/main`, and `main` is checked out.
All rows use `showRemoteBranches: true` unless stated.

| `hiddenRemotes`                                                                           | `branches`                                                                                                                                                                                            |
| ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| absent or `[]`                                                                            | `["main","origin/main","remotes/gone/x","remotes/lonely","remotes/origin/dev","remotes/origin/main","remotes/team/dev","remotes/team/main","remotes/team/upstream/dev","remotes/team/upstream/main"]` |
| `["origin"]` (Git also ran `remote` and `for-each-ref --format=%(refname) refs/remotes/`) | `["main","origin/main","remotes/gone/x","remotes/lonely","remotes/team/dev","remotes/team/main","remotes/team/upstream/dev","remotes/team/upstream/main"]`                                            |
| `["origin","origin"]`                                                                     | the same as `["origin"]`                                                                                                                                                                              |
| `["team"]`                                                                                | `["main","origin/main","remotes/gone/x","remotes/lonely","remotes/origin/dev","remotes/origin/main","remotes/team/upstream/dev","remotes/team/upstream/main"]`                                        |
| `["team/upstream"]`                                                                       | `["main","origin/main","remotes/gone/x","remotes/lonely","remotes/origin/dev","remotes/origin/main","remotes/team/dev","remotes/team/main"]`                                                          |
| `["gone"]` (not configured)                                                               | all entries except `remotes/gone/x`                                                                                                                                                                   |
| `["lonely"]`                                                                              | all entries except `remotes/lonely`                                                                                                                                                                   |
| `["nope"]`                                                                                | the full list                                                                                                                                                                                         |
| `["origin"]` with `showRemoteBranches: false`                                             | `["main","origin/main"]`. Only `for-each-ref … refs/heads/` and `symbolic-ref` ran.                                                                                                                   |
| after `checkout --detach`, remote branches off                                            | `branches ["main","origin/main"]`, `head: null`                                                                                                                                                       |

**Other repositories**

| Setup                                                                                                                           | Result                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Repository with `main` and `other`, after `checkout --orphan fresh`                                                             | `branches ["main","other"]`, `head: null`                                                                                |
| `git init` only, with `showRemoteBranches: true, hiddenRemotes: ["x"]`                                                          | `{ branches: [], head: null, isRepo: true }`. Five Git commands ran.                                                     |
| Branches `HEAD` (via `update-ref refs/heads/HEAD`), `HEADS-UP`, `quote"name`, `remotes/foo` and `日本`, with `main` checked out | `["main","HEAD","HEADS-UP","quote\"name","remotes/foo","日本"]`. The same under `hostile.gitconfig`.                     |
| Client created for a subfolder of the work tree, or for its `.git` directory                                                    | The same result as for the work tree.                                                                                    |
| A bare clone of the first repository                                                                                            | Its branches, with `head: "zeta"`.                                                                                       |
| `repo: "ANY-STRING", gitPath: "ignored", hard: true`                                                                            | `result.repo === "ANY-STRING"`, `hard: true`, and `Object.keys(result)` is `["repo","branches","head","hard","isRepo"]`. |
| 5,000 extra local branches                                                                                                      | 5,001 entries (head first, then `b00000`, `b00001`, …) in about 60 ms.                                                   |

**Failures**

| Case                                                                         | Result                                                                                           |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Plain directory, not in a repository                                         | Rejects: `GitError`, `"fatal: not a git repository (or any of the parent directories): .git\n"`. |
| Repository deleted after `createGit`                                         | Rejects: `GitError`, message starting `"Error: spawn git ENOENT"`.                               |
| Client made with `/nonexistent/git`                                          | Rejects: `GitError`, message starting `"Error: spawn /nonexistent/git ENOENT"`.                  |
| Client whose `AbortSignal` is aborted right after the call starts, or before | Rejects: `GitPluginError`, `"Abort already signaled"`.                                           |

### A.5 Non-functional requirements

- **Read-only.** No Git command writes, and the module touches the file system only through Git.
- **Import time.** Importing the module has no effects. Its imports from `simple-git` and
  `@/backend/types` are type-only. It must not import `vscode`.
- **Cost.** Each call starts two to five Git processes, however many branches there are. Hidden
  entries must be filtered with set lookups or something equally cheap, not with a scan per entry
  over all refs. Repositories with thousands of branches must stay fast (5,000 branches took about
  60 ms).
- **No mutation.** The call does not change `input` or its arrays, and returns a new `branches`
  array each time.
- **Promise.** The call always returns a promise. Callers treat any failure as a rejection.

### A.6 Test coverage

**Already checked**

- `tests/backend/queries/loadBranches/list.test.ts`:
  - the result's shape (`toEqual` with the five keys; `toEqual` does not notice an extra key whose
    value is `undefined`);
  - the head branch comes first; a non-head branch is present;
  - a detached HEAD gives `head: null` and `["main"]`;
  - remote branches are left out when the switch is off and included when it is on, as
    `["main","remotes/origin/main"]`;
  - a directory outside any repository rejects;
  - `hard` is passed through;
  - with forced colour and `origin/HEAD` set: detached at a branch tip, a tag or a hash gives
    `head: null` and `["main","topic"]`, and with remote branches on,
    `["main","topic","remotes/origin/main","remotes/origin/topic"]`;
  - the same during a conflicted rebase and during a bisect; after `bisect reset`, `head` is
    `"main"` again.
- `tests/backend/queries/graphErrors.test.ts`: a removed repository and an invalid Git executable
  both reject; an unborn repository gives `branches: []` and `isRepo: true`.
- `tests/backend/queries/remoteVisibility.test.ts`: with `hiddenRemotes: ["origin"]`, `main` and
  `remotes/origin2/topic` are kept and no `remotes/origin/…` entry remains.
- The hostile-configuration CI run repeats all of the above with output-changing settings and
  German messages.
- `tests-ext/ui/history.test.cjs` (UI harness in real VS Code) checks, indirectly, that a hidden
  remote's branches disappear from the branch dropdown and that `remotes/mirror/main` can be
  selected.
- `tests/extension/graph-queries.test.ts` covers only the caller: request identity, cancellation,
  and turning a rejection into `graphQueryError`.

**Gaps, with the test to add**

1. _Order is by ref name, not head-first-then-alphabetical by locale._
   - Setup: `makeRepo()`; create branches `alpha`, `Beta` and `zeta`; `git config branch.sort -committerdate`; check out `zeta`.
   - Call: `loadBranches(createGit(repo, "git"), { showRemoteBranches: false, hard: false, repo, gitPath: "git" })`.
   - Expect: `branches` is `["zeta","Beta","alpha","main"]`.
2. _Exact key set; no `visibilityKey`._
   - Setup: any repository.
   - Call: as above.
   - Expect: `Object.keys(result).toSorted()` is `["branches","hard","head","isRepo","repo"]`.
3. _`repo` is echoed verbatim._
   - Call: with `repo: "not/a/real/path"` and a client bound to a real repository.
   - Expect: `result.repo === "not/a/real/path"`.
4. _Orphan checkout._
   - Setup: `makeRepo()`; `git branch other`; `git checkout --orphan fresh`.
   - Expect: `head: null` and `branches: ["main","other"]`.
5. _Symbolic branches._
   - Setup: `git symbolic-ref refs/heads/alias refs/heads/main`.
   - Expect: `alias` is not in `branches`.
   - Then: `git symbolic-ref HEAD refs/heads/alias`.
   - Expect: `head: "main"` and `branches[0] === "main"`.
6. _Nested remote names._
   - Setup: remotes `team` and `team/upstream`, with refs `refs/remotes/team/topic` and `refs/remotes/team/upstream/topic`.
   - Call: with `hiddenRemotes: ["team"]`.
   - Expect: contains `remotes/team/upstream/topic` and not `remotes/team/topic`. With `["team/upstream"]`, the reverse.
7. _Unconfigured hidden name._
   - Setup: `update-ref refs/remotes/stale/topic HEAD`, with no remote named `stale`.
   - Call: with `hiddenRemotes: ["stale"]`.
   - Expect: `remotes/stale/topic` is absent.
8. _No remote reads when the switch is off._
   - Setup: a repository with a remote; spy on `client.raw`.
   - Call: `showRemoteBranches: false, hiddenRemotes: ["origin"]`.
   - Expect: the first arguments of the recorded commands are exactly `for-each-ref` (namespace `refs/heads/`) and `symbolic-ref`, and `branches` has no `remotes/` entry.
9. _A HEAD read failure is not an error._
   - Setup: spy on `client.raw`; reject when `args[0][0] === "symbolic-ref"`.
   - Expect: the call resolves with `head: null` and `branches: ["main"]`.
10. _Remote-visibility failures propagate._
    - Setup: spy on `client.raw`; reject with `new Error("Git read denied")` when `args[0][0] === "remote"`.
    - Call: with `showRemoteBranches: true, hiddenRemotes: ["origin"]`.
    - Expect: rejects with `"Git read denied"`. Wait for any sibling tasks with `Promise.allSettled`, as `graphErrors.test.ts` does.
11. _A local branch that looks like a remote one._
    - Setup: `git branch origin/main` in a repository with remote `origin`.
    - Expect: `branches` contains both `origin/main` and `remotes/origin/main`.
12. _Cancellation._
    - Setup: `const c = new AbortController(); c.abort();`.
    - Call: `loadBranches(createGit(repo, "git", c.signal), …)`.
    - Expect: rejects. Do not assert the message text.

### A.7 Questions

- **loadBranches Q1.** `input.gitPath` is required but does nothing, because the client already
  names the executable. Should it stay, since the message handler passes it and the tests supply
  it, or should it become optional or go away?
- **loadBranches Q2.** `isRepo` is always `true`. Every failure rejects, including "not a
  repository". The response type still allows `false`. Is `isRepo: false` still meant to exist?
- **loadBranches Q3.** A local branch named `remotes/<x>` looks the same as a remote-tracking entry,
  and `branchListRef` turns it into `refs/remotes/<x>`, which is the wrong ref. Should local names
  with that prefix be marked or escaped somehow, or is the clash accepted?
- **loadBranches Q4.** Remote-tracking refs that belong to no configured remote (`remotes/lonely`,
  `remotes/gone/x`) are listed. Is that wanted, or should they only be listed when a remote owns
  them?
- **loadBranches Q5.** When one concurrent read fails, the promise rejects at once while sibling Git
  processes may still be running. `graphErrors.test.ts` notes that on Windows these can keep the
  repository open. Should the query wait for its siblings to settle before rejecting?
- **loadBranches Q6.** Any failure of the HEAD read, not only a detached HEAD, becomes
  `head: null`. That includes a corrupt HEAD and an abort that lands between reads. Is hiding such
  failures intended?
- **loadBranches Q7.** When HEAD points to a symbolic branch, the reported head is the branch at the
  end of the chain, and the symbolic branch itself is never listed. Is that the intended display?
- **loadBranches Q8.** Ordering is byte order (`Beta` before `alpha`), while repository lists
  elsewhere sort with `localeCompare`. Should the branch list follow the same collation?

---

## B. `src/backend/queries/repoSearch.ts`

### B.1 Interface

The module has one export:

`export async function findGitRepos(paths: string[], gitPath: string, maxDepth: number): Promise<string[]>`

| Parameter  | Meaning                                                                                                                                                                                                 |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `paths`    | Directories to search. In production these are the local paths (`fsPath`) of the workspace folders. Folders without a local path are dropped before the call.                                           |
| `gitPath`  | The Git executable, as a name on `PATH` or a full path. It may contain spaces or parentheses.                                                                                                           |
| `maxDepth` | How many directory levels below each path are examined. It comes from `branchwise.maxDepthOfRepoSearch` (integer, minimum 0, default 0), which the config layer clamps to a whole number of at least 0. |

**Result.** The repositories found, as normalised paths (defined in C.2), each listed once and
sorted (see B.3).

The parameter order differs from `searchDirectoryForRepos` (C.1): here `gitPath` comes before
`maxDepth`. Callers depend on both orders.

**Who uses it**

- `src/extension/workspace-scan.ts`, in `scanWorkspaceRepos`:
  - It calls `findGitRepos(workspaceFolderPaths(), gitPath, maxDepth)` and caches the returned
    promise under the key `[folders, gitPath, maxDepth]`.
  - It attaches `.catch` to that promise directly and clears the cache if it rejects.
  - `listRepos` adds repositories opened during the session, re-sorts with `localeCompare`, and
    compares paths with `===` and `includes`. Paths must therefore be in the same normalised form
    as the rest of the extension uses.
  - `src/extension/handlers/scan-repo.ts` and `src/old-extension/messageHandler.ts` consume
    `listRepos`.
- Tests that call it: `tests/backend/queries/repoSearch.test.ts`,
  `tests/backend/queries/submoduleDiscovery.test.ts`, `tests/backend/utils/workTreeRoot.test.ts`
  and `tests/backend/utils/repoPath.test.ts`. `tests/extension/workspace-scan.test.ts` replaces it
  with a mock that has only the export `findGitRepos`.

### B.2 Dependencies the implementation must use

| Import                    | From                         | Purpose                                                                                                                                                                                                                                                                                                                                      |
| ------------------------- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `searchDirectoryForRepos` | `@/backend/utils/repoSearch` | Searches one path (section C). `tests/backend/utils/repoPath.test.ts` mocks `node:path` (as win32) and `@/backend/utils/git`, then imports both modules fresh. This module should therefore reach Git and path handling only through `searchDirectoryForRepos`, and add no Git calls or path logic of its own that would bypass those mocks. |

### B.3 Behaviour

**Search.** Each entry of `paths` is searched with
`searchDirectoryForRepos(entry, maxDepth, gitPath, [])`, with no known repositories. All the
searches start at once, with no limit across paths.

**Combining results**

- The per-path results are joined.
- Exact duplicate strings are dropped. Normalised real paths make these collide:
  - a repository reached through two workspace folders;
  - a subfolder and its repository;
  - a symlink and its target;
  - a submodule that is also a workspace folder.
- The rest is sorted with `String.prototype.localeCompare` using the process's default locale and
  options, i.e. ICU collation rather than code-unit order. For example, `_repo`, `a_repo`,
  `a-repo`, `a.repo`, `b-repo`, `B-repo`, `é`, `Z`. A repository path sorts before the paths
  below it, for example `c:/workspace` before `c:/workspace/child module`.

**Edge cases**

- An empty `paths` gives `[]`.
- **No rejection for bad input.** Missing paths, unreadable paths, paths that are files, paths
  outside any repository, and a missing or broken Git executable all contribute nothing; the result
  is still a list. The returned promise rejects only if a search rejects, which the current helpers
  never do.
- **Folder inside a repository.** The result is that repository's top level and its initialised
  submodules. Other repositories nested below the folder, at any depth, are not reported (see B.7
  Q3).
- **Path strings are not checked.** A relative path is resolved against the extension host's
  current working directory. The empty string means that directory itself.
- **Timing, events, disposal.** There are none, and the search cannot be cancelled.

### B.4 Examples (observed)

**Ordering.** `T/ord` holds the repositories `b-repo`, `a-repo`, `B-repo`, `_repo`, `Z`, `é`,
`a_repo` and `a.repo`.

`findGitRepos(["T/ord"], "git", 1)` gives
`["T/ord/_repo","T/ord/a_repo","T/ord/a-repo","T/ord/a.repo","T/ord/b-repo","T/ord/B-repo","T/ord/é","T/ord/Z"]`.
Passing the eight repository paths directly at depth 0 gives the same order.

**Other cases**

| Setup                                                                                                                | Call                                                                       | Result                                          |
| -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ----------------------------------------------- |
| `T/loop` holds a repository `r`, a symlink `self` to `T/loop`, a symlink `rlink` to `r`, a broken symlink and a file | `findGitRepos(["T/loop"], "git", 3)`                                       | `["T/loop/r"]`                                  |
| `T` is a repository and contains another repository `T/projects/app`                                                 | `findGitRepos(["T/projects"], "git", 2)`                                   | `["T"]`. The nested repository is not reported. |
| same                                                                                                                 | `findGitRepos(["T/projects/app"], "git", 2)`                               | `["T/projects/app"]`                            |
| repository `outer` with a subfolder `deep`, and a symlink to `outer`                                                 | `findGitRepos([outer, outer, outer + "/deep", symlinkToOuter], "git", 0)`  | `[outer]`                                       |
| a directory containing repositories                                                                                  | `findGitRepos([thatDirectory], "/nonexistent/git", 2)`                     | `[]`, with no rejection                         |
| process working directory is `outer`                                                                                 | `findGitRepos([""], "git", 0)` and `findGitRepos(["deep"], "git", 0)`      | `[outer]`                                       |
| the fixture of `tests/backend/queries/submoduleDiscovery.test.ts`                                                    | `findGitRepos([parent, child, parent], "git", 0)`                          | parent, child and nested, once each             |
| Windows, with `node:path` and `@/backend/utils/git` mocked (`tests/backend/utils/repoPath.test.ts`)                  | `findGitRepos(["C:\\workspace", "c:\\workspace\\child module"], "git", 0)` | `["c:/workspace","c:/workspace/child module"]`  |

### B.5 Non-functional requirements

- **Promise.** The function must always return a promise and never throw synchronously, because
  the caller attaches `.catch` to the returned value right away.
- **Read-only.** It only lists directories, checks entry types and runs read-only Git commands.
- **Cost.** Each examined directory costs one Git process, and each repository found costs one
  more. This is why results are cached by the caller. With the default depth of 0, only the
  workspace folders themselves are examined.
- **Import time.** Importing the module has no effects. It must not import `vscode`.

### B.6 Test coverage

**Already checked**

- `tests/backend/queries/repoSearch.test.ts`:
  - empty `paths`;
  - a repository given directly;
  - a plain folder at depth 0; a path that does not exist;
  - repositories found at depth 1 and exactly at the maximum depth, but not beyond it;
  - results combined across two paths;
  - no `…/.git` entries.

  Most of these use `toContain` or compare sorted copies, so the output order is not checked.

- `tests/backend/queries/submoduleDiscovery.test.ts`:
  - parent, initialised submodule and nested submodule are found at depth 0, including paths with
    spaces;
  - uninitialised submodules are left out;
  - duplicates are dropped when a submodule is also a folder.
- `tests/backend/utils/workTreeRoot.test.ts`: a subfolder and a symlink (junction) each give the
  repository's real path, once, including when mixed with a folder outside any repository.
- `tests/backend/utils/repoPath.test.ts`: on mocked Windows, overlapping folders written with
  different drive-letter case and separators are merged, and the result is sorted.
- `tests/extension/workspace-scan.test.ts` covers only the caller's caching, which uses a mock.

**Gaps, with the test to add**

1. _Sort order is locale collation, not code-unit order._
   - Setup: repositories `T/B-repo` and `T/a-repo`.
   - Call: `findGitRepos([T/B-repo, T/a-repo], "git", 0)`.
   - Expect: `[T/a-repo, T/B-repo]`.
   - Default `sort()` would give the opposite order. The CI job with a German locale gives the same
     answer.
2. _Duplicates through symlinks collapse._
   - Setup: `T/r` is a repository; `T/link` is a symlink (junction on Windows) to `T/r`.
   - Call: `findGitRepos([T], "git", 1)`.
   - Expect: `[T/r]`.
3. _A folder inside a repository hides nested repositories._
   - Setup: `T` is a repository and `T/projects/app` is another.
   - Call: `findGitRepos([T/projects], "git", 2)`.
   - Expect: `[T]`.
4. _A missing Git executable gives an empty list, not a rejection._
   - Setup: `makeRepo()`.
   - Call: `findGitRepos([repo], path.join(repo, "missing-git"), 1)`.
   - Expect: resolves to `[]`.
5. _A file path._
   - Call: `findGitRepos([pathToAFile], "git", 2)`.
   - Expect: `[]`.

### B.7 Questions

- **findGitRepos Q1.** Sorting depends on the host's default locale, so the order can differ between
  machines. Unicode strings that are canonically equal also compare as equal. Is locale collation
  intended, or should the order be deterministic (code-unit, or a fixed locale)? `listRepos`
  re-sorts the same way.
- **findGitRepos Q2.** Empty or relative entries in `paths` are searched relative to the extension
  host's working directory. Should such entries be ignored instead?
- **findGitRepos Q3.** A workspace folder inside an enclosing repository, such as a home-directory
  dotfiles repository, reports only the enclosing repository and hides every independent repository
  below the folder, whatever `maxDepth` is. Is that intended?
- **findGitRepos Q4.** A missing or broken Git executable gives "no repositories" rather than an
  error the user could act on. Is the silent result intended?
- **findGitRepos Q5.** If a search ever rejected, the reason would be lost (see evalPromises Q2),
  and the caller's log would show nothing useful. This is unreachable today. Should the contract
  promise that `findGitRepos` never rejects?

---

## C. `src/backend/utils/repoSearch.ts`

### C.1 Interface

The module has one export:

`export async function searchDirectoryForRepos(directory: string, maxDepth: number, gitPath: string, knownRepoPaths: string[]): Promise<string[]>`

| Parameter        | Meaning                                                                                                                                                                                                                                                                                                   |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `directory`      | The directory to start from, in any form: Windows separators, `..` segments and a trailing separator are all accepted. It is normalised before use.                                                                                                                                                       |
| `maxDepth`       | How many levels below `directory` are examined. `0` examines only `directory` itself (and so reports the repository that contains it). `1` also examines its subdirectories, and so on.                                                                                                                   |
| `gitPath`        | The Git executable, passed to the Git helpers.                                                                                                                                                                                                                                                            |
| `knownRepoPaths` | Repositories already known. A starting directory at or inside one of them is skipped, and a result exactly equal to one of them is dropped. The paths are normalised before comparison. `findGitRepos` always passes `[]`; only tests and the search's own descent into subdirectories pass other values. |

**Result.** A list of normalised repository paths. It may contain duplicates. Its order is given in
C.3.

**Who uses it:** `src/backend/queries/repoSearch.ts`. Tests: `tests/backend/utils/repoSearch.test.ts`,
`tests/backend/utils/gitPath.test.ts` and `tests/backend/utils/repoPath.test.ts`.

### C.2 Dependencies the implementation must use

| Import                                  | From                       | Purpose                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| --------------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| file-system functions                   | `node:fs/promises`         | List a directory's entries and find which entries are directories, following symbolic links.                                                                                                                                                                                                                                                                                                                                                                              |
| `workTreeRoot`                          | `@/backend/utils/git`      | `workTreeRoot(directory, gitPath)` runs `rev-parse --show-toplevel` in `directory`, through a new client for `gitPath`. It resolves to the real path of the work tree's top level, normalised. It resolves to `null` in these cases: outside a work tree; inside a `.git` directory; in a bare repository; for a missing directory or a file; when Git is missing; when Git refuses the repository (for example unsafe ownership). It never rejects.                      |
| `getSubmodulePaths`                     | `@/backend/utils/git`      | `getSubmodulePaths(repoPath, gitPath)` runs `submodule foreach --quiet --recursive` in `repoPath`, followed by one final argument, the shell text `printf "%s\0" "$toplevel/$sm_path"`. It resolves to the normalised absolute paths of all initialised submodules, nested ones included: each superproject's submodules in Git's order, each followed by its own nested submodules. Uninitialised submodules are left out. Any failure gives `[]`, and it never rejects. |
| `normalizeRepoPath`, `isRepoWithinPath` | `@/backend/utils/repoPath` | `normalizeRepoPath(p)` applies `path.normalize`, changes platform separators to `/`, and on Windows lower-cases a leading drive letter. On POSIX a backslash is an ordinary character, and a trailing separator survives normalisation. `isRepoWithinPath(repo, root)` is true when `repo` equals `root` or lies below it. The check is path-aware, not a string prefix test: `/workspace-other` is not within `/workspace`, and another drive is never within.           |
| `evalPromises`                          | `@/backend/utils/promise`  | Runs the searches of subdirectories at most two at a time, keeping the results in listing order (section D).                                                                                                                                                                                                                                                                                                                                                              |

Import exactly `workTreeRoot` and `getSubmodulePaths` from `@/backend/utils/git`, and nothing
else. `tests/backend/utils/repoPath.test.ts` replaces that module with a mock that has only these
two exports, and Vitest fails on access to any other name.

### C.3 Behaviour

The rules below apply to every directory examined, the starting directory included.

1. **Known containment.**
   - If the normalised directory equals, or lies within, any normalised entry of
     `knownRepoPaths`, the result is `[]`.
   - No Git process starts and the file system is not touched. `repoPath.test.ts` checks that
     `workTreeRoot` is never called in this case.
   - The check is path-aware: known `/` (or `C:\`, or `\\server\share\`) covers everything below
     it, while known `/workspace` does not cover `/workspace-other`, and known `C:\` does not
     cover `D:\workspace`.
2. **Inside a work tree.**
   - Otherwise, if `workTreeRoot` reports a top level for the directory, the result is that top
     level (normalised) followed by `getSubmodulePaths` of it (each normalised).
   - `getSubmodulePaths` must be called with the normalised top-level path. The Windows mock in
     `repoPath.test.ts` answers only for `"c:/workspace"`.
   - Any entry exactly equal to a normalised known path is removed, whether it is the top level or
     a submodule.
   - No subdirectory of it is examined, whatever `maxDepth` is (even negative). This has these
     consequences:
     - a subfolder yields its repository's top level, which lies above the directory;
     - a symlink yields the real path;
     - a linked worktree yields its own top level;
     - a submodule's directory yields the submodule, not its superproject;
     - independent repositories and linked worktrees placed inside the work tree are not reported.
3. **Depth exhausted.** If the directory is not in a work tree and `maxDepth <= 0`, the result is
   `[]`, and the directory is not listed.
4. **Listing.**
   - Otherwise the directory's entries are listed. If listing fails (missing, not a directory, no
     permission), the result is `[]`.
   - The subdirectories to search are the entries that are directories after following symbolic
     links, except an entry named exactly `.git`.
   - Files, broken symlinks and entries whose type cannot be read are skipped.
   - Hidden directories, `node_modules` and the like are searched like any other directory.
5. **Descent.**
   - Each subdirectory is searched with these same rules, with `maxDepth - 1` and the same known
     paths.
   - Its path is the normalised directory, then `/`, then the entry name.
   - At most two subdirectories of the same directory are searched at once. When one finishes, the
     next in listing order starts.
6. **Result order.**
   - The subdirectories' results are joined in listing order, however long each search took.
     Listing order is the order `fs.readdir` returns; on the Linux test machine that was ascending
     byte order.
   - Within one repository, the top level precedes its submodules.
   - Duplicates are kept. The same repository can be reached through a symlink, or repeatedly
     through a symlink loop until the depth runs out.
7. **Failures.** In practice the promise never rejects: every Git or file-system failure just
   gives fewer results. (If the search of a subdirectory did reject, the whole search would
   currently reject with an `undefined` reason; see evalPromises Q2.)
8. **Unusual depths.**
   - A non-integer `maxDepth` behaves like the next whole number up: `0.5` examines one level of
     subdirectories, and `1.5` examines two.
   - A negative `maxDepth` behaves like `0`: a repository at the directory is still reported.
9. **A `.git` directory as the start.** Git reports that it is not a work tree, so the directory is
   listed like any other. Nothing is normally found inside it.
10. **Timing, events, disposal.** There are none: no timeouts, no cancellation, no events.

### C.4 Examples (observed)

**Plain repositories.** Unless a row says otherwise, `outer` is `T/misc/outer`, a repository.

| Setup                                                                                                                                                                | Call                                                                           | Result                                                                                                                                                 |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `T/ord` holds eight repositories (B.4)                                                                                                                               | `searchDirectoryForRepos("T/ord", 1, "git", [])`                               | `["T/ord/B-repo","T/ord/Z","T/ord/_repo","T/ord/a-repo","T/ord/a.repo","T/ord/a_repo","T/ord/b-repo","T/ord/é"]` (listing order, not sorted by locale) |
| same                                                                                                                                                                 | depth `0.5`                                                                    | the same eight                                                                                                                                         |
| same                                                                                                                                                                 | depth `-1`                                                                     | `[]`                                                                                                                                                   |
| `T/ord/Z` is a repository                                                                                                                                            | depth `-1`                                                                     | `["T/ord/Z"]`                                                                                                                                          |
| symlink loop directory of B.4                                                                                                                                        | depth `3`                                                                      | `["T/loop/r"]` six times                                                                                                                               |
| `T/misc` holds a bare `bare.git`; `outer`, which contains an independent repository `inner` and a linked worktree `wt-inside`; and a linked worktree `wt` of `outer` | `searchDirectoryForRepos("T/misc", 3, "git", [])`                              | `["T/misc/outer","T/misc/wt"]`                                                                                                                         |
| same                                                                                                                                                                 | `searchDirectoryForRepos(outer + "/inner", 0, "git", [])`                      | `[outer + "/inner"]`                                                                                                                                   |
| same                                                                                                                                                                 | `searchDirectoryForRepos("T/misc/bare.git", 2, "git", [])`                     | `[]`                                                                                                                                                   |
| `outer/deep/er` exists                                                                                                                                               | `searchDirectoryForRepos(outer + "/deep", 5, "git", [])`                       | `[outer]`                                                                                                                                              |
|                                                                                                                                                                      | `searchDirectoryForRepos(outer + "/", 0, …)` and `(outer + "/deep/../", 0, …)` | `[outer]`                                                                                                                                              |
|                                                                                                                                                                      | `searchDirectoryForRepos(outer + "/deep", 0, "git", [outer])`                  | `[]`, without starting Git                                                                                                                             |
|                                                                                                                                                                      | `searchDirectoryForRepos(outer, 0, "git", [outer + "/"])`                      | `[]`                                                                                                                                                   |
|                                                                                                                                                                      | `searchDirectoryForRepos(outer, 0, "git", [outer + "/deep"])`                  | `[outer]`                                                                                                                                              |
| a symlink to `outer`                                                                                                                                                 | `searchDirectoryForRepos(symlinkToOuter, 0, "git", [outer])`                   | `[]`, after running Git                                                                                                                                |
|                                                                                                                                                                      | `searchDirectoryForRepos("T/misc", 1, "git", ["T/misc/wt"])`                   | `["T/misc/outer"]`                                                                                                                                     |
|                                                                                                                                                                      | `searchDirectoryForRepos(outer, 0, "/nonexistent/git", [])`                    | `[]`                                                                                                                                                   |
|                                                                                                                                                                      | `searchDirectoryForRepos(pathOfAFile, 2, "git", [])`                           | `[]`                                                                                                                                                   |
| `T/fake/.git/repo2` is a repository inside a directory named `.git` in a folder outside any repository                                                               | `searchDirectoryForRepos("T/fake", 3, "git", [])`                              | `[]`                                                                                                                                                   |
|                                                                                                                                                                      | `searchDirectoryForRepos(outer + "/.git", 1, "git", [])`                       | `[]`                                                                                                                                                   |
| `T/hid/.hidden/r` and `T/hid/node_modules/pkg` are repositories                                                                                                      | depth `2`                                                                      | both, in that order                                                                                                                                    |

**Submodules.** `parent` is a repository with an initialised submodule at `mods/child`; `T/src` is
another repository; `T/plink` is a symlink to `parent`.

| Call                                                                  | Result                                                                                                                     |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `searchDirectoryForRepos("T/plink", 0, "git", [parent])`              | `[parent + "/mods/child"]`                                                                                                 |
| `searchDirectoryForRepos(parent, 0, "git", [parent + "/mods/child"])` | `[parent]`                                                                                                                 |
| `searchDirectoryForRepos(parent + "/mods/child", 0, "git", [])`       | `[parent + "/mods/child"]`                                                                                                 |
| `searchDirectoryForRepos(parent + "/mods", 0, "git", [])`             | `[parent, parent + "/mods/child"]`                                                                                         |
| `searchDirectoryForRepos("T", 1, "git", [])`                          | `[parent, parent + "/mods/child", parent, parent + "/mods/child", "T/src"]`. `findGitRepos` reduces this to three entries. |

**Concurrency.** This was observed with `@/backend/utils/git` replaced by a stub that delays
answers and counts concurrent `workTreeRoot` calls.

- Setup: the directory's children are `plain1`, `plain2`, `repo1`, `repo2`, `repo3`, `repoS`,
  `slowA` and `slowB`. `plain1` contains three stub repositories. `repoS` has the stub submodules
  `sm1` and `known-sm`, and `known-sm` is passed as known. The `slow*` entries answer after 60 ms,
  the others after 10 ms.
- Result at depth 2: `/plain1/repoX`, `/plain1/repoY`, `/plain1/repoZ`, `/repo1`, `/repo2`,
  `/repo3`, `/repoS`, `/repoS/sm1`, `/slowA`, `/slowB`. This is listing order, and the known
  submodule has been dropped.
- The most `workTreeRoot` calls in flight at once was 3: two siblings at the top, with one of them
  (`plain1`) running two of its own children. `workTreeRoot` was called for the start directory
  first, then children in listing order.

**Windows** (mocked, `tests/backend/utils/repoPath.test.ts`)

| Call                                                                                  | Result                               |
| ------------------------------------------------------------------------------------- | ------------------------------------ |
| `searchDirectoryForRepos("C:\\workspace", 0, "git", ["c:\\workspace\\child module"])` | `["c:/workspace"]`                   |
| `("D:\\workspace", 0, "git", ["C:\\"])`                                               | `["d:/workspace"]`                   |
| `("C:\\workspace\\child", 0, "git", ["C:\\workspace\\"])`                             | `[]`, without calling `workTreeRoot` |

### C.5 Non-functional requirements

- **Read-only.** File-system access is limited to listing directories and reading entry types. Git
  commands are read-only.
- **Paths given to Git** are the normalised forms (forward slashes, lower-case drive letter on
  Windows).
- **Cost.**
  - Each examined directory costs one `rev-parse` process, and each repository found costs one
    `submodule foreach` more.
  - Entry types may be checked in any order or concurrently, but the result must follow listing
    order.
  - The limit of two concurrent searches applies per directory, so total concurrency can grow with
    depth.
  - Nothing can be cancelled and there are no timeouts, so a hung Git process hangs the search.
- **Import time.** Importing the module has no effects. It must not import `vscode`.

### C.6 Test coverage

**Already checked**

- `tests/backend/utils/repoSearch.test.ts`:
  - a repository found at depth 0; a plain folder at depth 0 gives `[]`; a missing directory gives
    `[]`;
  - a directory that is known, and a subdirectory of a known repository, give `[]`;
  - depth 0 does not descend;
  - depth 1 gives exactly `[repoA]`, and depth 2 finds both (compared sorted);
  - no `/.git` paths.
- `tests/backend/utils/gitPath.test.ts`: a Git path containing spaces and parentheses still finds
  the repository.
- `tests/backend/utils/repoPath.test.ts` (mocked Windows and POSIX):
  - normalisation of the start directory and of known paths;
  - known submodules are filtered;
  - children of known roots (`/`, `C:\`, UNC, trailing separator) are skipped without calling
    `workTreeRoot`;
  - unrelated paths (`/workspace-other`, another drive) are still searched.

**Gaps, with the test to add**

1. _Results follow listing order and ignore completion order._
   - Setup: `vi.doMock("@/backend/utils/git", …)` with a `workTreeRoot` that treats names starting
     `repo` as repositories. It answers `repo1` after 50 ms and `repo2` after 5 ms.
     `getSubmodulePaths` resolves `[]`. Create real directories `T/repo1` and `T/repo2`.
   - Call: `searchDirectoryForRepos(T, 1, "git", [])`.
   - Expect: `[T/repo1, T/repo2]`.
2. _At most two siblings at a time._
   - Setup: as above, with five child directories, each answering after 20 ms. Count calls in
     flight.
   - Expect: at most 2 concurrent calls for the children, and all five found.
3. _Submodules follow their superproject and are filtered by exact match._
   - Setup: mock `getSubmodulePaths` to return `[root + "/a", root + "/b"]`.
   - Call: with known `[root + "/b"]`.
   - Expect: `[root, root + "/a"]`.
4. _Symlinked directories are followed._
   - Setup: real repository `T/r`, and a symlink `T/x/link` to `T/r`.
   - Call: `searchDirectoryForRepos(T + "/x", 1, "git", [])`.
   - Expect: `[T/r]` as a real path.
5. _A symlink loop terminates and may repeat entries._
   - Setup: `T/loop/r` is a repository; `T/loop/self` is a symlink to `T/loop`.
   - Call: depth 3.
   - Expect: resolves; every entry equals `T/loop/r`; the length is at least 2.
6. _A `.git` entry is skipped even when it is not a repository's._
   - Setup: `T/fake/.git/inner` is a real repository, and `T/fake` is not a repository.
   - Call: depth 3.
   - Expect: `[]`.
7. _Hidden folders and `node_modules` are searched._
   - Setup: repositories at `T/.hidden/r` and `T/node_modules/p`.
   - Call: depth 2.
   - Expect: both are found.
8. _What is not reported._
   - Setup: a bare repository `T/b.git`; a repository `T/o` containing an independent repository
     `T/o/in`; a linked worktree `T/w` of `T/o`.
   - Call: depth 3.
   - Expect: `[T/o, T/w]`.
9. _Negative depth._
   - Call: a repository directory with depth `-1` → `[repo]`; a plain directory containing a
     repository with depth `-1` → `[]`.
10. _A missing Git executable._
    - Call: `searchDirectoryForRepos(repo, 2, path.join(repo, "missing-git"), [])`.
    - Expect: `[]`.
11. _An unreadable directory._
    - Setup: `chmod 000` on a subdirectory. Skip the test when running as root or on Windows.
    - Expect: resolves, and other siblings are still found.
12. _Starting at a subfolder returns a root above it._
    - Call: `searchDirectoryForRepos(repo + "/a/b", 5, "git", [])`.
    - Expect: `[repo]`. This is currently checked only through `findGitRepos`.

### C.7 Questions

- **searchDirectoryForRepos Q1.** The starting directory is skipped when it lies within a known
  path, but results are removed only when they exactly equal a known path. So a symlink to a known
  repository still yields its submodules, and a top level inside, but not equal to, a known
  repository is still reported. Should results also be filtered by containment?
- **searchDirectoryForRepos Q2.** In production `knownRepoPaths` is always empty. Is the parameter
  still needed beyond tests?
- **searchDirectoryForRepos Q3.** Symlinked directories are followed without remembering visited
  real paths. A loop therefore repeats Git calls until the depth runs out, and the same repository
  appears many times; `findGitRepos` removes the repeats. Should visited real paths be tracked?
- **searchDirectoryForRepos Q4.** A negative `maxDepth` still reports the directory's own
  repository, and fractional depths round up. The setting is clamped to a whole number of at least
  0, so this matters only to direct callers. Should the contract define it?
- **searchDirectoryForRepos Q5.** Bare repositories, and repositories Git refuses to open (for
  example "dubious ownership"), are skipped silently, and the search continues into their
  subdirectories. Is that intended, and should refusals be logged?
- **searchDirectoryForRepos Q6.** The limit of two applies per directory, so a deep search can run
  many Git processes at once. Entry types are also checked one at a time. Should there be one
  global limit, and should heavy folders such as `node_modules` be skipped?
- **searchDirectoryForRepos Q7.** Only an entry named exactly `.git` is skipped. On a
  case-insensitive file system `.GIT` would be searched. Is that acceptable?

---

## D. `src/backend/utils/promise.ts`

### D.1 Interface

The module has one export:

`export function evalPromises<X, Y>(data: X[], maxParallel: number, createPromise: (val: X) => Promise<Y>): Promise<Y[]>`

The return type may be left to inference or written out, but it must be `Promise<Y[]>`.

| Parameter       | Meaning                                                                              |
| --------------- | ------------------------------------------------------------------------------------ |
| `data`          | The items to process, in order.                                                      |
| `maxParallel`   | Upper bound on how many items may be in progress simultaneously.                     |
| `createPromise` | Called once per item to start its work, and returns a promise of that item's result. |

**Who uses it:** only `src/backend/utils/repoSearch.ts`, with `maxParallel` 2. No test calls it
directly.

### D.2 Dependencies

None. The module imports nothing.

### D.3 Behaviour

**Result.** The returned promise fulfils with an array as long as `data`. Element `i` is the value
that item `i`'s promise fulfilled with, `undefined` included, whatever order the items finished in.

**How items start**

- **Empty `data`.** The promise fulfils with `[]`, and `createPromise` is never called.
- **One item.** `createPromise` is called once, straight away, whatever `maxParallel` is (even `0`
  or negative).
- **Two or more items.**
  - Before `evalPromises` returns, `createPromise` is called synchronously for the first items in
    index order. For a positive `maxParallel`, the count is `maxParallel` rounded up, capped at the
    number of items, so `1.5` starts 2.
  - Each time a started promise fulfils, the next unstarted item (lowest index) starts, so the
    number pending never goes above that initial count.
  - The returned promise fulfils when every item has fulfilled.
- **`maxParallel` of 0 or less, or `NaN`, with two or more items.** Nothing starts and the returned
  promise never settles (see Q1).

**When an item fails**

- **Rejection.** When any item's promise rejects, the returned promise rejects with the reason
  `undefined`; the original reason is thrown away. The one-item case also rejects with
  `undefined`. After the rejection:
  - no further items are started;
  - items already running are neither awaited nor cancelled;
  - their results are ignored.
- **`createPromise` throws synchronously.**
  - During the initial calls: the returned promise rejects with the thrown value itself. Items
    started before it keep running and, as they fulfil, later items are still started, even though
    the result is already settled (observed).
  - When starting a later item: the returned promise rejects with `undefined`, and nothing more
    starts.
- **Changing `data` while running.** `data` is read as the run goes on: items added before the run
  finishes are processed and included in the result (observed). Callers must not change `data`
  while the promise is pending (see Q4).

**Other**

- `data` itself is never modified.
- There are no timers, timeouts, events or disposal.

### D.4 Examples (observed)

In these examples the worker (`createPromise`) waits the stated time and then fulfils with
`x * 10`.

| Call                                                                                                         | Observed                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `evalPromises([], 2, worker)`                                                                                | fulfils `[]`; worker never called                                                                                                              |
| `evalPromises([1], 2, worker)`                                                                               | fulfils `[10]`                                                                                                                                 |
| `evalPromises([1], 0, worker)`                                                                               | fulfils `[10]`                                                                                                                                 |
| `evalPromises([1], 2, rejects)`                                                                              | rejects with `undefined`                                                                                                                       |
| `evalPromises([1,2,3,4,5], 2, worker)`, where item `x` takes `(6 - x) × 5` ms                                | fulfils `[10,20,30,40,50]`; order of events: start 1, start 2, end 2, start 3, end 1, start 4, end 4, start 5, end 3, end 5; at most 2 running |
| `evalPromises([1,2,3], 10, worker)`                                                                          | all 3 start at once; fulfils `[10,20,30]`                                                                                                      |
| `evalPromises([1,2], 0, worker)`, `evalPromises([1,2], -1, worker)` and `evalPromises([1,2,3], NaN, worker)` | never settles (still pending after 300 ms); worker never called                                                                                |
| `evalPromises([1,2,3], 1.5, worker)`                                                                         | at most 2 running; fulfils `[10,20,30]`                                                                                                        |
| `evalPromises([1,2,3,4,5], 2, …)` where item 2 rejects after 5 ms and the others take 20 ms                  | rejects `undefined`; events: start 1, start 2, end 2, end 1; items 3–5 never start                                                             |
| `evalPromises([1,2,3,4,5], 1, …)` where item 3 rejects                                                       | rejects `undefined` after items 1–3; items 4 and 5 never start                                                                                 |
| `evalPromises([1], 2, x => { throw new Error("sync 1") })`                                                   | rejects with that `Error`                                                                                                                      |
| `evalPromises([1,2,3,4], 2, …)` where item 2 throws synchronously and the others fulfil after 10 ms          | rejects with `Error("sync 2")`; the worker is still called for 3 and then 4 afterwards                                                         |
| `evalPromises([1,2,3,4], 1, …)` where item 3 throws synchronously                                            | rejects `undefined`; item 4 never starts                                                                                                       |
| `evalPromises([1,2,3], 2, async x => x)`                                                                     | items 1 and 2 have started before the call returns; fulfils `[1,2,3]`                                                                          |
| `evalPromises([1,2,3], 2, async x => x === 2 ? undefined : x)`                                               | fulfils `[1, undefined, 3]` (length 3; index 1 present)                                                                                        |
| `evalPromises(data, 1, …)` with `data = [1,2,3]`, then `data.push(4)` right after the call                   | fulfils `[1,2,3,4]`                                                                                                                            |
| `evalPromises([1,2], 2, x => x === 1 ? Promise.reject("why") : Promise.resolve(x))`                          | rejects with `undefined`                                                                                                                       |

### D.5 Non-functional requirements

- **Purity.** It has no side effects apart from calling `createPromise`. It uses no timers and no
  global state.
- **Import time.** Importing the module has no effects, and it has no imports.
- **Cost.** Overhead grows linearly with the number of items.

### D.6 Test coverage

**Already checked.** Nothing calls `evalPromises` directly. The repository-search tests use it
indirectly with a few directories and only successful searches, so they cover order and success,
but not concurrency or failure.

**Gaps, with the test to add.** These go in a new `tests/backend/utils/promise.test.ts`. None needs
Git.

1. `evalPromises([], 3, fn)` → fulfils `[]`; `fn` not called.
2. `evalPromises(["a"], 0, async x => x + "!")` → fulfils `["a!"]`.
3. Order under different durations: `evalPromises([30, 10, 20], 3, ms => delay(ms).then(() => ms))`
   → `[30, 10, 20]`.
4. Concurrency limit:
   - Call: `evalPromises([1,2,3,4,5,6], 2, …)` with a counter raised on start and lowered on
     finish.
   - Expect: the maximum is exactly 2, and items start in index order.
5. `maxParallel` above the item count: `evalPromises([1,2,3], 10, …)` → all three start before the
   first finishes.
6. Rejection:
   - Call: item 2 of `[1,2,3,4]` rejects with `new Error("x")`, `maxParallel` 1.
   - Expect: rejects, and items 3 and 4 are never started.
   - Also assert the reason, once evalPromises Q2 is decided. It is `undefined` today.
7. Values stay in place: `evalPromises([1,2,3], 2, async x => x === 2 ? undefined : x)` →
   `[1, undefined, 3]`.
8. `maxParallel` 0 with two items: add this only after evalPromises Q1 is decided. Today it never
   settles.

### D.7 Questions

- **evalPromises Q1.** With two or more items, a `maxParallel` of 0 or less, or `NaN`, never
  settles; with exactly one item it runs anyway. Should values below 1 be treated as 1, or rejected?
- **evalPromises Q2.** A rejected item gives the caller the reason `undefined`, and so does the
  one-item case. A synchronous throw during the initial calls instead gives the thrown error.
  Should the first failure's original reason always be passed on?
- **evalPromises Q3.** After a synchronous throw during the initial calls, the promise is already
  rejected, yet remaining items keep being started as earlier ones finish. After an asynchronous
  rejection, nothing more starts. Should both stop the same way?
- **evalPromises Q4.** `data` is read live, so items added during the run are processed. Should the
  helper work on a snapshot taken at the call?
- **evalPromises Q5.** A rejection settles the result while other items may still be running.
  Should it wait for them, like `Promise.allSettled`, so that no work is left running unobserved?
  This relates to loadBranches Q5.
- **evalPromises Q6.** A fractional `maxParallel` acts as the next whole number up (`1.5` allows 2).
  Is that meant to be defined, or should it be an error?

---

## E. `src/backend/utils/string.ts`

### E.1 Interface

The module has one export:

`export function abbrevCommit(commitHash: string): string`

The parameter `commitHash` is a commit hash, normally 40 hexadecimal characters. It is not
checked, and any string is accepted.

**Who uses it**

- `src/old-extension/messageHandler.ts`:
  - The title of the diff tab: `<file name> (Added in <short>)`, `<file name> (Deleted in <short>)`,
    or `<file name> (<short>^ ↔ <short>)`.
  - The error log line `Unable to open the diff of <path> at <short>`.
- `src/webview/components/commit/CommitRow.tsx`: the text of the hash column, and the commit-actions
  button's `aria-label` (through `window.l10n.commitActions`).
- `src/webview/components/repository/RefsPane.tsx`: the "new branch from" dialog message.
- `src/webview/lib/menus.tsx`:
  - the messages of the add-tag, create-branch, checkout, cherry-pick, revert, merge and reset
    dialogs;
  - the labels of the merge-parent options, `<short>` or `<short>: <summary>`.
- Tests that reach it through callers: `tests/webview/lib/menus.test.ts` (parent labels
  `"11111111: First"`, `"22222222"`, `"33333333: Third: x"` from 40-character hashes of repeated
  digits) and `tests/webview/lib/menu-text.test.ts` (dialogs show `<b><i>01234567</i></b>` for the
  hash `0123456789abcdef0123456789abcdef01234567`).

### E.2 Dependencies

None. The module must stay free of imports. It is bundled into the webview, which runs in a
browser, and is compiled by the webview TypeScript project, which has no Node or VS Code types.

### E.3 Behaviour

- `abbrevCommit` returns the first 8 UTF-16 code units of its argument.
- A string of 8 or fewer code units comes back unchanged, and the empty string gives the empty
  string.
- Nothing else is done: no trimming, no change of case, no check for hexadecimal, no use of Git's
  `core.abbrev` setting or of prefix uniqueness.
- It never throws for a string argument.

### E.4 Examples (observed)

| Input                                        | Output                                              |
| -------------------------------------------- | --------------------------------------------------- |
| `"0123456789abcdef0123456789abcdef01234567"` | `"01234567"`                                        |
| `"123456789"`                                | `"12345678"`                                        |
| `"12345678"`                                 | `"12345678"`                                        |
| `"abc"`                                      | `"abc"`                                             |
| `""`                                         | `""`                                                |
| `"  abcdefghij"`                             | `"  abcdef"`                                        |
| `"😀😀😀😀😀"`                               | `"😀😀😀😀"` (8 code units, i.e. 4 surrogate pairs) |

### E.5 Non-functional requirements

- The function is pure and synchronous.
- Importing the module has no effects.
- It must be safe in both the extension host and the browser.

### E.6 Test coverage

**Already checked.** The function is covered indirectly through the menu tests listed in E.1, for
40-character hashes only. Nothing checks the diff-tab title, the hash column's text or the
new-branch dialog.

**Gaps, with the test to add.** These go in a new `tests/webview/utils/string.test.ts` or
`tests/backend/utils/string.test.ts`.

1. `abbrevCommit("0123456789abcdef0123456789abcdef01234567")` → `"01234567"`.
2. `abbrevCommit("12345678")` → `"12345678"`; `abbrevCommit("123456789")` → `"12345678"`.
3. `abbrevCommit("abc")` → `"abc"`; `abbrevCommit("")` → `""`.
4. Optional, for the caller: in `tests/extension/view-diff.test.ts`, for a modified file with
   `commitHash` `"a".repeat(40)`, expect the `vscode.diff` title argument to be
   `"a.txt (aaaaaaaa^ ↔ aaaaaaaa)"`.

### E.7 Questions

- **abbrevCommit Q1.** The length is fixed at 8 and ignores Git's `core.abbrev` and whether the
  prefix is unique. Is a fixed 8 intended?
- **abbrevCommit Q2.** Several places shorten hashes themselves with `slice(0, 8)` instead of
  calling this function:
  - `src/webview/components/history/HistoryTools.tsx`, `WorkflowTools.tsx` and
    `WorkspacePane.tsx`;
  - `src/webview/components/repository/RebaseEditor.tsx`;
  - `src/old-extension/messageHandler.ts`, for workflow effects.

  Should they share it, so that any future change of length applies everywhere?

---

## Decisions (from the project maintainer's side)

These decisions replace the "current behaviour" wherever they differ. Build to these, and test the decided behaviour. Every question not listed as changed is **keep**.

- **searchDirectoryForRepos Q3: no duplicates.** The result lists each normalised path once, at its first position in the order of C.3 rule 6; later occurrences (through symlinks or loops) are dropped. Symlink loops still end when the depth runs out.
- **evalPromises Q1: a usable limit.** A limit below 1, or one that is not a number, is treated as 1, so every input settles.
- **evalPromises Q2: the first failure's reason.** When a task rejects or throws, the returned promise rejects with that task's reason (the thrown value or the rejection value), whether it failed synchronously or not.
- **evalPromises Q3: stop after a failure.** Once any task has failed, no further task starts, whether the failure was synchronous or asynchronous. Tasks already running are not waited for (Q5 is keep).
- Everything else: keep. In particular `loadBranches` Q1 – Q8, `findGitRepos` Q1 – Q5, `searchDirectoryForRepos` Q1, Q2, Q4 – Q7, `evalPromises` Q4 – Q6 and `abbrevCommit` Q1 – Q2 stay as they are.
