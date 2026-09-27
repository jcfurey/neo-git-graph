# Clean-room specification: `src/backend/queries/loadCommits.ts`

This document says what the graph's commit loader must do, as seen from outside. It is written for an engineer who will build a replacement without seeing the current source. Its sources are the module's callers, the tests that exercise it, the types and helpers it depends on, and the results of running the current code against real repositories.

In one sentence: given a Git client and the graph's view options, the module reads one page of commit history in graph order, attaches branch, remote and tag labels to the commits in that page, says whether more history exists, and, when the working tree has changes on top of the checked-out commit, puts a placeholder row for them at the top.

---

## 0. How the behaviour was observed

- Repository at commit `7fb4f01`. Git 2.43.0, Node v22.22.2, simple-git 3.36.0, Vitest 4.1.11, on Linux.
- The module and `createGit` were bundled with esbuild into a scratch directory. `child_process.spawn` was wrapped so that every Git process the module started, and its full argument list, was recorded.
- Git read only `tests/fixtures/gitconfig` as its global configuration (`GIT_CONFIG_GLOBAL`, with `GIT_CONFIG_NOSYSTEM=1`), as the backend tests do. Selected cases were repeated with `tests/fixtures/hostile.gitconfig`, which turns on colour, signature display, a custom `format.pretty`, `status.showUntrackedFiles=no` and other settings that change Git's output. The results did not change.
- Every existing test that touches the module passes, with the normal configuration and with `NGG_HOSTILE_GIT_CONFIG=1`: 53 backend tests in 10 files, plus 8 message-layer tests in `tests/extension/graph-queries.test.ts`.
- In the examples, "now" means the wall-clock time when the call ran.

---

## 1. Interface

**Module path:** `src/backend/queries/loadCommits.ts`, imported as `@/backend/queries/loadCommits`. The path must not change. `tests/extension/graph-queries.test.ts` replaces the module by this path with `vi.mock`, and `scripts/benchmark.mjs` re-exports from it by relative path.

The module has two exports. Their names and signatures must stay exactly as shown. It has no default export, and it needs no other exports.

### 1.1 `parseLog`

```ts
export function parseLog(stdout: string): GitLogEntry[];
```

Turns the complete standard output of the graph's `git log` command (§2.3) into commit entries, or throws if that output is not well formed. It is a pure function: it starts no process and reads no state.

`GitLogEntry` comes from `@/backend/types` (defined in `src/backend/types/git.types.ts`):

| Field          | Type       | Meaning                                                                                                     |
| -------------- | ---------- | ----------------------------------------------------------------------------------------------------------- |
| `hash`         | `string`   | The commit's full object ID: 40 lowercase hex characters for SHA-1 repositories, 64 for SHA-256.            |
| `parentHashes` | `string[]` | The full object IDs of the commit's parents, in Git's order (first parent first). Empty for a root commit.  |
| `author`       | `string`   | The author name exactly as the commit records it. No mailmap is applied.                                    |
| `email`        | `string`   | The author email as recorded, without angle brackets. It can be empty.                                      |
| `date`         | `number`   | Seconds since the Unix epoch. Which date this is (author or committer) depends on the log command (§3.2.4). |
| `message`      | `string`   | The commit's subject line as Git's `%s` placeholder produces it (§3.2.4).                                   |

### 1.2 `loadCommits`

```ts
export async function loadCommits(
  git: SimpleGit,
  input: {
    branchName: string;
    maxCommits: number;
    showRemoteBranches: boolean;
    hiddenRemotes?: string[];
    hard: boolean;
    dateType: DateType;
    showUncommittedChanges: boolean;
  }
): Promise<Omit<QueryResult<"loadCommits">, "repo" | "branchName">>;
```

The parameter type may be declared inline or as a named type, and named type aliases may be exported or not. Only the shape matters. `tsconfig.base.json` turns on `exactOptionalPropertyTypes`, so `hiddenRemotes` must stay optional (some tests leave it out), and callers pass an array when they do give it.

**Parameters**

| Name                           | Meaning                                                                                                                                                                                                                                                                                   |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `git`                          | A simple-git client for the repository, created by `createGit` or `gitClientFactory` in `@/backend/gitClient`. The client already sets the working directory, the Git executable, output-stabilising `-c` settings, `--no-optional-locks`, and (from the message layer) an `AbortSignal`. |
| `input.branchName`             | `""` shows every branch. Anything else is one entry from the branch list that `loadBranches` produces: a local branch's short name (`main`, `feat/x`), or `remotes/<remote>/<branch>` for a remote-tracking branch. The graph then shows only that branch's history.                      |
| `input.maxCommits`             | The page size: the largest number of real commits to return. The message layer passes a whole number of at least 1 (the settings are clamped with `wholeNumber(…, 1, …)`, and "load more" adds to the value).                                                                             |
| `input.showRemoteBranches`     | Whether remote-tracking branches take part: as starting points of the history and as labels.                                                                                                                                                                                              |
| `input.hiddenRemotes`          | Names of remotes whose remote-tracking branches are hidden when `showRemoteBranches` is true. Leaving it out is the same as `[]`.                                                                                                                                                         |
| `input.hard`                   | Opaque. It is returned unchanged in the result. The webview always sends `true`.                                                                                                                                                                                                          |
| `input.dateType`               | `"Author Date"` or `"Commit Date"` (the `DateType` type from `@/backend/types`). It chooses which timestamp fills each commit's `date`.                                                                                                                                                   |
| `input.showUncommittedChanges` | Whether to look for working-tree changes and add the placeholder row (§3.2.7).                                                                                                                                                                                                            |

**Result.** `QueryResult<"loadCommits">` is the `loadCommits` response payload in `src/backend/types/queries.types.ts`. With `repo` and `branchName` removed, the result must have exactly these five keys and no others:

| Key                    | Type              | Meaning                                                                                                                                |
| ---------------------- | ----------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `commits`              | `GitCommitNode[]` | The rows for the graph, in display order (§3.2.2). This includes the placeholder row when there is one.                                |
| `head`                 | `string \| null`  | The full hash of the commit HEAD resolves to, or `null` when HEAD is unborn. It is reported even when that commit is not in `commits`. |
| `moreCommitsAvailable` | `boolean`         | Whether the selected history has at least one more commit beyond this page.                                                            |
| `hard`                 | `boolean`         | `input.hard`, unchanged.                                                                                                               |
| `uncommittedChanges`   | `number`          | The number of changed working-tree entries shown by the placeholder row, or `0` when there is no placeholder row.                      |

The payload type also has an optional `visibilityKey`. The module must **not** set it, not even to `undefined`. The message handler builds its reply as `{ repo, branchName, visibilityKey: msg.visibilityKey, ...result }`, so a `visibilityKey` key in the result, even an undefined one, would overwrite the request's key. For the same reason the result must not contain `repo` or `branchName`.

`GitCommitNode` (in `git.types.ts`) has every `GitLogEntry` field plus `refs: GitRef[]`. `GitRef` is:

| Field  | Type                          | Meaning                                                                                                                                                                                     |
| ------ | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `hash` | `string`                      | Always equal to the `hash` of the commit it is attached to. For an annotated tag this is the tagged **commit**, not the tag object.                                                         |
| `name` | `string`                      | The label text: a local branch's short name (`main`), a remote-tracking branch as `<remote>/<branch>` (`origin/main`, with no `remotes/` prefix), or a tag's short name (`v1.0`).           |
| `type` | `"head" \| "tag" \| "remote"` | `"head"` means a local branch (anything under `refs/heads/`). It does not mean HEAD, which is reported only through `head`. `"remote"` means a remote-tracking branch. `"tag"` means a tag. |

### 1.3 Who uses what

| User                                                  | Uses                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/old-extension/messageHandler.ts`                 | `loadCommits`, registered as the `loadCommits` graph query. It passes `branchName`, `maxCommits` and `showRemoteBranches` from the request, `hiddenRemotes: msg.hiddenRemotes ?? []`, `hard: msg.hard`, `dateType: config.dateType()` and `showUncommittedChanges: config.showUncommittedChanges()`. Its client carries a fresh `AbortSignal`, which is aborted when a newer `loadCommits` request, a repository change or panel disposal supersedes this one. It posts the result only if the signal was not aborted. If the promise rejects, it posts `graphQueryError` with `error.message`. |
| `scripts/benchmark.mjs`                               | `loadCommits`, re-exported by name through an esbuild bundle. It asserts page lengths of `min(count, total commits)` for 300, 1,000 and 3,000, and checks that a page with `hiddenRemotes: ["origin"]` contains no commit whose message starts with `origin lane`.                                                                                                                                                                                                                                                                                                                              |
| `tests/backend/queries/loadCommits/list.test.ts`      | `loadCommits`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `tests/backend/queries/loadCommits/records.test.ts`   | `loadCommits` and `parseLog`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `tests/backend/queries/graphErrors.test.ts`           | `loadCommits`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `tests/backend/queries/signedCommits.test.ts`         | `loadCommits`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `tests/backend/queries/optionalLocks.test.ts`         | `loadCommits`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `tests/backend/queries/remoteVisibility.test.ts`      | `loadCommits`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `tests/backend/queries/remoteVisibilityScale.test.ts` | `loadCommits`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `tests/backend/queries/workingTree.test.ts`           | `loadCommits`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `tests/backend/actions/optionLikeRefs.test.ts`        | `loadCommits`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `tests/backend/utils/gitPath.test.ts`                 | `loadCommits`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `tests/extension/graph-queries.test.ts`               | Replaces the module with `{ loadCommits: mock }`. It tests the message layer, not this module.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |

Downstream, the webview (`src/webview/lib/handler/load-commits.ts`) stores `commits`, `head`, `moreCommitsAvailable` and `uncommittedChanges`. `src/webview/graph/layout.ts` treats `commits[0]` with hash `"*"` as the uncommitted row. `CommitRow.tsx` builds that row's localized text from `uncommittedChanges`. It also re-sorts each commit's `refs` with a stable sort that only moves the checked-out branch to the front, so the order this module returns is otherwise the order users see.

`scripts/provenance-baseline.json` records 94 inherited lines for this file, and 168 for `tests/backend/queries/loadCommits/list.test.ts`.

---

## 2. Dependencies the implementation must use

### 2.1 Repository and package imports

| Import path                        | Name(s)                                                                                   | Why it is required                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ---------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `simple-git`                       | `SimpleGit` (type only)                                                                   | The client type. `verbatimModuleSyntax` is on, so type-only imports need `import type`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `@/backend/types`                  | `DateType`, `GitCommitNode`, `GitLogEntry`, `QueryResult` (type only); `GitRef` if useful | The public shapes (§1).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `@/backend/utils/refs`             | `branchListRef`                                                                           | Turns a branch-list name into the full ref given to Git: `remotes/<rest>` becomes `refs/remotes/<rest>`, and any other name `n` becomes `refs/heads/n`. Using a full ref means a branch named like an option (`--output=x`) or like a same-named tag is never misread. Branch focus and history search use the same helper.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `@/backend/utils/remoteVisibility` | `remoteVisibility`                                                                        | `remoteVisibility(git, { showRemoteBranches, hiddenRemotes })` resolves to `{ excluded: Set<string>, logArgs: string[] }`. `excluded` holds the short names (the part after `refs/remotes/`) of every remote-tracking ref that belongs to a hidden remote, matched by the longest configured remote name. `logArgs` are the `git log` revision arguments that select every visible remote-tracking ref: `[]` when `showRemoteBranches` is false, `["--remotes"]` when nothing is hidden, otherwise some `--exclude=…` patterns, then `--remotes`, sometimes followed by `--exclude=…`/`--glob=…` pairs for remotes nested under a hidden one. Only when remote branches are on and at least one remote is hidden does it run two Git processes, `git remote` and `git for-each-ref --format=%(refname) refs/remotes/`. History search uses the same helper, so the graph and search agree. The helper keeps the command line short however many refs are hidden. A test asserts this (§5). |
| `@vscode/l10n`                     | `t` (for example `import * as l10n from "@vscode/l10n"`)                                  | Localizes the malformed-output error. The key must be the English text `Git returned an incomplete graph record.`, written as a **string literal** directly inside the `t(…)` call. `pnpm run l10n:check` regenerates `l10n/bundle.l10n.json` by scanning the source for such calls, and fails if the bundle changes. The zh-cn and zh-tw bundles already translate this key.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |

No other repository module is needed. The module must not import `vscode`.

### 2.2 How Git must be invoked

- Every Git process must be started **through the given client**, never with `child_process` or a new client. The client adds `--no-optional-locks` and these `-c` settings to every command: `log.showSignature=false`, `status.showUntrackedFiles=all`, `color.ui=never`, `color.branch=never`, `color.diff=never`, `color.status=never`, `color.showBranch=never`, `color.grep=never`. The client also carries the caller's abort signal. Tests depend on all of this (§5).
- `show-ref` and `log` must be run with `git.raw(args)`, where `args` is **one array** whose first element is the Git subcommand (`"show-ref"` or `"log"`). Tests intercept `raw` and check `Array.isArray(args[0]) && args[0][0] === "<subcommand>"`.
- The graph's `log` command must be run **exactly once** per call. `remoteVisibilityScale.test.ts` finds the first `raw` call whose first element is `"log"`.
- The working-tree count must come from the client's **`status` method**, called as `git.status(["--untracked-files=all"])`. simple-git turns this into `git status --porcelain -b -u --null --untracked-files=all`. The count is the length of the returned summary's `files` array. A test replaces `client.status` with a rejecting mock.
- The client is created with `trimmed: false`, so `raw` returns Git's standard output exactly as written, including trailing NULs and newlines.
- simple-git rejects when a process exits with a non-zero status **and** writes to stderr. It resolves with the standard output when the exit status is non-zero but stderr is empty. In an empty repository, `show-ref` exits with status 1 and prints nothing, so `raw` resolves to `""`. That case is not an error (§3.2.8).

### 2.3 The Git commands, exactly

Below, the client's prefix (`--no-optional-locks -c … `) is left out. Arguments are listed in the order the current code passes them. Keep this order, because revision order can affect how Git breaks ties between commits with equal timestamps (§3.2.2).

**Refs.**

- With `showRemoteBranches` true: `git show-ref -d --head`
- With `showRemoteBranches` false: `git show-ref --heads --tags -d --head`

Output: one line per ref, `<full hash><one space><full ref name>`, each ending in LF. On Windows, accept CR LF and a lone CR as line endings too. The lines are:

- `HEAD`, first, when HEAD resolves to a commit. It is printed even with `--heads --tags`. There is no `HEAD` line when HEAD is unborn.
- Every ref under `refs/heads/`, `refs/remotes/` and `refs/tags/`. Without `--heads --tags`, refs in other namespaces are printed too, such as `refs/stash`, `refs/notes/…`, `refs/pull/…` and `refs/replace/…`. These lines are sorted by full ref name in byte order.
- For every tag that points to a tag object (an annotated tag, or a lightweight tag that points at one), a second line straight after it: `<peeled hash> refs/tags/<name>^{}`. Here `<peeled hash>` is the object reached by peeling tag objects until something else is found (usually a commit, possibly a tree or blob). The first line holds the tag object's own hash.
- Symbolic refs such as `refs/remotes/origin/HEAD`, or a branch made with `git symbolic-ref refs/heads/alias refs/heads/main`, are printed under their own name with their target's hash.

If a ref is broken (it points to a missing object), Git writes an error to stderr and exits with status 128, and the client rejects.

**Log.**

```
git log -z --max-count=<maxCommits + 1> --format=%H%x00%P%x00%an%x00%ae%x00<D>%x00%s --date-order <revisions> --
```

- `<D>` is `%at` (author timestamp) when `dateType` is `"Author Date"`, and `%ct` (committer timestamp) otherwise.
- `<maxCommits + 1>` is the page size plus one, as a decimal, for example `--max-count=301` for 300.
- `<revisions>`:
  - When `branchName` is not empty: the single argument `branchListRef(branchName)`, for example `refs/heads/main` or `refs/remotes/origin/main`. Nothing else is added: no `--branches`, no remote arguments, no HEAD.
  - When `branchName` is empty: `--branches`, `--tags`, then every element of `remoteVisibility(…).logArgs` in the order given, then HEAD's **full hash** as reported by `show-ref`, but only when HEAD resolves. HEAD is always named by its hash, never by the word `HEAD`. When `show-ref` reports no `HEAD` line, nothing is added in its place, and the call must still succeed (examples E1 and O1). The visibility arguments must come after `--branches --tags`, because Git applies each `--exclude` only to the next `--branches`/`--tags`/`--remotes`/`--glob`.
- The final `--` must always be present. It stops Git from reading any revision as a path.
- Output: for each commit, six fields, **each followed by one NUL byte**: hash, space-separated parent hashes (empty for a root), author name, author email, the chosen timestamp as a decimal integer, and the subject. Nothing comes between records and nothing follows the last one. A complete, non-empty output therefore ends in NUL, and an empty history gives `""`. Example for two commits: `H2\0H1\0T\0t@t.com\01700000001\0two\0H1\0\0T\0t@t.com\01700000000\0init\0`.

Commands actually recorded (client prefix left out):

| Case                                                          | Commands, in the order the current code runs them                                                                                                                                                                                           |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| All branches, remotes on, nothing hidden, HEAD `1293b20…`     | `show-ref -d --head` · `log -z --max-count=301 --format=%H%x00%P%x00%an%x00%ae%x00%at%x00%s --date-order --branches --tags --remotes 1293b2096a42bcb7c0974b1d5e663eea35f814c6 --` · `status --porcelain -b -u --null --untracked-files=all` |
| Remotes off                                                   | `show-ref --heads --tags -d --head` · `log … --date-order --branches --tags <head> --` · `status …`                                                                                                                                         |
| `branchName: "main"`, `dateType: "Commit Date"`               | `show-ref -d --head` · `log -z --max-count=301 --format=%H%x00%P%x00%an%x00%ae%x00%ct%x00%s --date-order refs/heads/main --` · `status …`                                                                                                   |
| `hiddenRemotes: ["origin"]`                                   | `remote` · `for-each-ref --format=%(refname) refs/remotes/` · `show-ref -d --head` · `log … --date-order --branches --tags --exclude=origin/* --remotes <head> --` · `status …`                                                             |
| Remotes `team` and `team/upstream`, `hiddenRemotes: ["team"]` | `… log … --branches --tags --exclude=team/* --remotes --glob=refs/remotes/team/upstream/* <head> --`                                                                                                                                        |
| `branchName: "main"`, `hiddenRemotes: ["origin"]`             | `remote` · `for-each-ref …` · `show-ref -d --head` · `log … --date-order refs/heads/main --`. The helper still runs, because its `excluded` set is needed to hide labels.                                                                   |
| `showRemoteBranches: false`, `hiddenRemotes: ["origin"]`      | `show-ref --heads --tags -d --head` · `log … --branches --tags <head> --`. The helper starts no process.                                                                                                                                    |
| Empty repository                                              | `show-ref -d --head` (exit 1, no output) · `log … --branches --tags --remotes --`. There is no head hash and no status.                                                                                                                     |

---

## 3. Behaviour

### 3.1 `parseLog(stdout)`

- `""` gives `[]`.
- Any other input must be a whole number of complete records, each made of six NUL-terminated fields as in §2.3. Otherwise the function throws a plain `Error`. Its message is the localized text for the key `Git returned an incomplete graph record.`. With no localization bundle loaded, as in tests, the message is exactly that English text. In detail, it throws when:
  - the input does not end in a NUL byte. This includes a record followed by a stray `\n`;
  - the number of NUL-terminated fields is not a multiple of six. Examples: `"\0"`, five fields, or one full record followed by part of a second;
  - any record's hash field does not match `^[0-9a-f]{40,64}$`: lowercase hex, 40 to 64 characters. Uppercase, 39 or 65 characters, empty, and text such as `not a hash` are all rejected;
  - any record's date field is not one or more ASCII digits. Rejected examples: `""`, `-5`, `1.5`, `yesterday`, ` 10`.
- It never returns part of a result: one bad record anywhere makes the whole call throw.
- For each valid record, in input order, it produces a `GitLogEntry`:
  - `hash`: the field as is.
  - `parentHashes`: `[]` when the field is empty. Otherwise the field split on single spaces. The parts are **not** validated, so `"xyz  q"` becomes `["xyz", "", "q"]` and a trailing space gives a trailing `""`. Git never produces such fields.
  - `author`, `email`, `message`: the fields as is, including CR, LF, tabs, quotes and any Unicode. Only NUL cannot occur.
  - `date`: the digits read as a decimal number. `"007"` becomes `7`, and `"0"` becomes `0`. Very long digit strings become large, imprecise numbers without an error.

### 3.2 `loadCommits(git, input)`

#### 3.2.1 Which commits are selected

- **All branches (`branchName` is `""`).** The page is taken from the history reachable from:
  - every local branch;
  - every tag, including tags whose history is on no branch. A tag that points at a tree or blob contributes nothing and causes no error;
  - every visible remote-tracking branch, when `showRemoteBranches` is true. A branch is visible when it does not belong to a remote in `hiddenRemotes`. Remote names can contain `/`: hiding `team` hides `team/topic` but not `team/upstream/topic` when `team/upstream` is a configured remote of its own, and hiding `team/upstream` leaves `team/topic` visible. A remote-tracking ref whose remote is no longer configured, such as `stale/topic`, is treated as belonging to the remote named by its first path segment;
  - the commit HEAD resolves to, when it resolves. A detached HEAD's history is therefore always included, even when no branch or tag reaches it, when remote branches are off, or when only a hidden remote reaches it.
- Hiding a remote, or turning remote branches off, removes only those refs **as starting points**. Commits they share with local branches, tags, other remotes or HEAD are still shown.
- **One branch (`branchName` is not `""`).** Only the history reachable from that branch's full ref (§2.3). HEAD, tags, other branches and remotes are not added. A remote-tracking branch can be selected (`remotes/origin/main`) whatever `showRemoteBranches` and `hiddenRemotes` say. Those options affect only its labels.
- Stashes (`refs/stash` and its reflog) never add commits. Neither do notes, `refs/pull/*`, or any namespace other than branches, tags and remote-tracking branches. A commit reachable only from such refs does not appear.
- Everything else about commit selection is Git's own behaviour for the command in §2.3, which the implementation gets for free by running that command. For example, replace refs (`git replace`) are honoured, and a shallow clone's boundary commits have no parents.

#### 3.2.2 Ordering

- Real commits appear in exactly the order `git log --date-order` prints them for the revisions in §2.3. No child appears after its parent. Apart from that, commits are ordered newest first by **committer** timestamp. `dateType` does **not** change the order. It only changes which timestamp is put in `date`. Ties follow Git: with equal timestamps on two branches, the order matches `git rev-list --date-order` with the same revision arguments, for example `b1-2, b2-2, b1-1, b2-1, init`.
- A child with an older committer date than its parent still comes first. For example, a commit dated 1700000500 whose parent is dated "now" is listed before its parent.
- When the placeholder row exists, it is always at index 0, even if HEAD's commit is further down (§4, example B1). All real commits then follow in the order above.

#### 3.2.3 Page size and `moreCommitsAvailable`

- Git is asked for `maxCommits + 1` commits. If it returns that many, `moreCommitsAvailable` is `true`, and only the first `maxCommits` real commits are returned. The extra commit is dropped completely: it gets no labels and it does not count when deciding whether HEAD is on the page. Otherwise `moreCommitsAvailable` is `false` and every returned commit is kept.
- `moreCommitsAvailable` counts real commits only. The placeholder row is added afterwards, so with the row `commits.length` can be `maxCommits + 1`. Example: `maxCommits: 1`, one commit, dirty tree → `commits` is `[*, init]` and `moreCommitsAvailable` is `false`.
- With a branch filter, "more" refers to that branch's history.
- For `maxCommits` values that callers never send (0, negatives, fractions), see Question 1.

#### 3.2.4 Commit fields

Each real commit's `hash`, `parentHashes`, `author`, `email`, `date` and `message` are the `parseLog` result for Git's output:

- `hash`, `parentHashes`: full hashes, 40 hex characters or 64 in a SHA-256 repository (verified with `git init --object-format=sha256`). Parents that are not on the page are still listed. Root commits, and the boundary commits of a shallow clone, have `[]`.
- `author`, `email`: the raw author identity. Mailmap is not applied, even with `log.mailmap=true`. An author with an empty email gives `email: ""`. Git re-encodes a commit that declares a legacy `encoding` header (such as ISO-8859-1) to UTF-8, so `Jérôme`/`Café` arrive intact.
- `date`: with `"Author Date"`, the author timestamp. With `"Commit Date"`, the committer timestamp. Both are Unix seconds, and the zone offset is dropped.
- `message`: Git's `%s`. That is the first paragraph of the message with leading blank lines removed, the paragraph's lines joined by single spaces, and trailing whitespace (including a CR before the LF) removed from each line. An empty message gives `""`. A lone CR inside a line is kept, so `carriage\rreturn subject` stays as is. Tabs, quotes, `<`, `&` and emoji are kept. Git stops `%s` at an embedded NUL byte, so a hand-made commit whose message is `nul\0inside` gives `nul`.
- If Git prints an empty or non-numeric timestamp for **any** commit on the page, the whole call rejects with the incomplete-record error (Question 2). Git does this for a malformed author line such as `author NoEmail 1700000000 +0000`, where it prints empty name, email and timestamp, and, in Git 2.43, for a negative author timestamp.

#### 3.2.5 Labels (`refs`)

Labels come from `show-ref` (§2.3). Each label is attached to the returned commit whose `hash` equals the ref's hash. A ref whose commit is not on the page gives no label anywhere.

- `refs/heads/<name>` gives `{ type: "head", name: "<name>" }`. `<name>` may contain `/`, Unicode, or begin with `-`.
- `refs/tags/<name>` gives `{ type: "tag", name: "<name>" }`.
  - Lightweight tag on a commit: one label on that commit.
  - Annotated tag, or a chain of tags such as `outer` → `inner` → commit: one label, named without `^{}`, on the commit the chain ends at. Its `hash` is that commit's hash. The line with the tag object's own hash never matches a commit and produces nothing.
  - A tag that points at a tree or a blob, directly or through a tag object, produces no label and no error.
- `refs/remotes/<rest>` gives `{ type: "remote", name: "<rest>" }`, for example `origin/main`. Remote-tracking labels exist only when `showRemoteBranches` is true, and only when `<rest>` is not in `remoteVisibility(…).excluded`, which removes every ref of a hidden remote, including its `HEAD`. The symbolic `origin/HEAD` is **included** as a label named `origin/HEAD` when its remote is visible (Question 6).
- A symbolic ref under `refs/heads/` (for example `alias` → `main`) appears as a `"head"` label named `alias` on `main`'s commit.
- The `HEAD` line never produces a label. It only sets `head`.
- Lines for any other namespace (`refs/stash`, `refs/notes/*`, `refs/pull/*`, `refs/replace/*`, custom namespaces) are ignored.
- **Order within a commit:** the order of `show-ref`, which is byte order of the full ref name. That puts local branches first, then remote-tracking branches, then tags, each sorted by name. Uppercase comes before lowercase: `Zeta, a-loose, alpha, b-loose, main`, then tags `T1, t0`. Packed and loose refs are merged into this one order.
- A commit with no matching refs has `refs: []`. The placeholder row always has `refs: []`.
- Labels are given whether or not a branch filter is set. With `branchName: "remotes/origin/main"` and `hiddenRemotes: ["origin"]`, the history of `origin/main` is shown, but none of origin's labels are.

#### 3.2.6 `head`

- It is the hash on `show-ref`'s `HEAD` line: the commit HEAD points to, whether HEAD is on a branch or detached.
- It is `null` when HEAD is unborn. That is the case in a repository with no commits, and on a branch created with `git checkout --orphan` that has no commit yet, even if other branches have history. In the orphan case `commits` still holds the other branches' history, and `head` is `null`.
- It is reported even when HEAD's commit is not on the page: with a branch filter that does not reach HEAD, or when HEAD is older than the page.

#### 3.2.7 The uncommitted-changes row and `uncommittedChanges`

The working tree is checked, which is **one** `status` process, only when all three of these hold:

1. `showUncommittedChanges` is true;
2. `head` is not `null`;
3. HEAD's commit is among the returned real commits, after the page has been cut to `maxCommits`.

If any of these fails, `status` does not run, there is no row, and `uncommittedChanges` is `0`, even if the tree is dirty. Examples: a branch filter that excludes HEAD, HEAD further down than the page, `maxCommits: 0`, or an unborn HEAD with untracked or staged files.

When the check runs, the count is the number of entries in simple-git's parse of `git status --porcelain -b -u --null --untracked-files=all` (§2.2). Observed counts:

| Working-tree state (added one step after another in one repository)     | Count |
| ----------------------------------------------------------------------- | ----- |
| clean                                                                   | 0     |
| one tracked file modified, not staged                                   | 1     |
| the same file staged                                                    | 1     |
| staged **and** modified again (partially staged)                        | 1     |
| plus a staged rename (`git mv g g2`)                                    | 2     |
| plus two untracked files in nested new folders (`d/e/1`, `d/2`)         | 4     |
| plus a new `.gitignore` and a file it ignores                           | 5     |
| plus an untracked file named with a space, a tab, a quote and a newline | 6     |

These were tested separately: a merge conflict on one file counts 1; one deleted tracked file counts 1; a submodule whose working tree has changes counts 1, and a clean submodule counts 0; changes in **another** worktree of the same repository count 0 (each worktree's own view counts its own changes). User settings such as `status.showUntrackedFiles=no` do not lower the count.

- If the count is 0, there is no row and `uncommittedChanges` is `0`.
- If the count is at least 1, `uncommittedChanges` is the count, and this row is put at index 0 of `commits`:

  | Field          | Value                                                                  |
  | -------------- | ---------------------------------------------------------------------- |
  | `hash`         | `"*"`                                                                  |
  | `parentHashes` | `[head]`                                                               |
  | `author`       | `"*"`                                                                  |
  | `email`        | `""`                                                                   |
  | `date`         | the current time in whole Unix seconds (within one second of the call) |
  | `message`      | `""`                                                                   |
  | `refs`         | `[]`                                                                   |

  The webview replaces the row's text with its own localized wording. The row's `date` does not depend on `dateType`.

- If `status` fails (for example `fatal: this operation must be run in a work tree` in a bare repository), the whole call rejects with that error. It must not fall back to "no changes".

#### 3.2.8 Empty and unusual repositories

- **No commits at all** (fresh `git init`): resolves to `{ commits: [], head: null, moreCommitsAvailable: false, hard, uncommittedChanges: 0 }` with remote branches on or off, and even with untracked files. It is not an error, even though `show-ref` exits with status 1.
- **Detached HEAD and no branch or tag left** (`git checkout --detach; git branch -D main`): the commits reachable from HEAD are shown, with `refs: []` and `head` set.
- **Bare repository:** with `showUncommittedChanges: false` it loads normally. With `true` it rejects, because `status` needs a work tree (Question 5). Repository discovery uses `rev-parse --show-toplevel` and never finds bare repositories.

#### 3.2.9 Errors

Every failure rejects the returned promise. Nothing is swallowed, and no partial result is returned. Errors raised by the client are passed on **unchanged**: the same object and the same message. The message layer shows `error.message` in the graph's error view.

| Situation                                                                                                   | Rejection observed                                                                                                                                                                                                                        |
| ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `branchName` names a missing local branch (`nope`)                                                          | simple-git `GitError`, message `fatal: bad revision 'refs/heads/nope'\n` (with the trailing newline)                                                                                                                                      |
| `branchName` names a missing remote branch (`remotes/origin/nope`)                                          | `GitError`, `fatal: bad revision 'refs/remotes/origin/nope'\n`                                                                                                                                                                            |
| `branchName: "main"` in a repository with no commits                                                        | `GitError`, `fatal: bad revision 'refs/heads/main'\n`                                                                                                                                                                                     |
| Local branch literally named `remotes/fake`, used as a filter                                               | `GitError`, `fatal: bad revision 'refs/remotes/fake'\n` (Question 7)                                                                                                                                                                      |
| The directory is not a Git repository                                                                       | `GitError`, `fatal: not a git repository (or any of the parent directories): .git\n`, from the first Git process                                                                                                                          |
| The repository directory was deleted after the client was created                                           | rejects (`spawn git ENOENT`)                                                                                                                                                                                                              |
| The Git executable does not exist                                                                           | rejects (`spawn /nonexistent/git ENOENT`)                                                                                                                                                                                                 |
| A broken ref (a loose ref file holding a hash that does not exist), with remote branches on or off          | `GitError` from `show-ref`, which exits with status 128. simple-git puts the partial standard output (the `HEAD` line) in front of the stderr text in the message, which ends with `fatal: git show-ref: bad ref refs/heads/broken (…)\n` |
| `show-ref`, `log`, `remote` or `for-each-ref` (the last two only when a remote is hidden) or `status` fails | rejects with that failure's error                                                                                                                                                                                                         |
| `log` output is malformed, or any commit has an empty or non-numeric timestamp                              | `Error`, `Git returned an incomplete graph record.` (localized)                                                                                                                                                                           |
| The client's abort signal was already aborted                                                               | simple-git `GitPluginError`, `Abort already signaled`. No process is started.                                                                                                                                                             |
| The signal is aborted while a process runs                                                                  | `GitPluginError`, `Abort signal received`                                                                                                                                                                                                 |

#### 3.2.10 Unusual characters and names

- Branch and tag names with Unicode (`feat/ünï-cøde`, `v1.0-ß`), with a leading `-` (`-D`, `--output=x`), or with `/` are labelled exactly and can be used as filters. A filter on `--output=x` selects that branch and creates no file. A filter on a name used by both a branch and a tag selects the **branch**.
- Author names and subjects with CR, tabs, quotes, HTML-like text and emoji survive unchanged, apart from Git's `%s` handling (§3.2.4). This holds even when the user's configuration turns on colour, signature display, `format.pretty`, `log.decorate`, `log.abbrevCommit` or `log.date`.
- A Git executable path with spaces and parentheses works. That is the client's job, but it only works if every process goes through the client.

---

## 4. Concrete examples

### 4.1 Fixtures

Every repository below is created with `git init -b main`, `git config user.name T` and `git config user.email t@t.com`, and uses the test global configuration (§0). "Commit X at t" means `git commit --allow-empty -m X` with `GIT_AUTHOR_DATE` and `GIT_COMMITTER_DATE` both set to `@t +0000`, unless one of them is given separately. With these inputs the hashes are deterministic (SHA-1):

| Alias | Full hash                                  | Commit                                                                             |
| ----- | ------------------------------------------ | ---------------------------------------------------------------------------------- |
| `I`   | `120e1aceea50f28d89ec89307a633cc0d83ea6a5` | "init" at 1700000000, with file `f` holding `x` (no newline), added by `git add .` |
| `S`   | `1293b2096a42bcb7c0974b1d5e663eea35f814c6` | "second" at 1700000100, child of `I`                                               |
| `M2`  | `0634299c24dc33ca8e9cc2bf66e66e97196ceb63` | "main-2", child of `I`, author date 1800000000, committer date 1700000100          |
| `F1`  | `f917aeaea915301df8b97aae4cec738b4fa2261e` | "feat-1", child of `I`, author date 1600000000, committer date 1700000200          |
| `L`   | `cc344cb870a64f53d8e3f7a5ba3863d0ab14e278` | "local" at 1700000300, child of `S`                                                |
| `DO`  | `59e53d9b638eff9b6b966968d5f909be194f9b30` | "detached-only" at 1700000100, child of `I`                                        |

The default input is `branchName: ""`, `maxCommits: 300`, `showRemoteBranches: true`, no `hiddenRemotes`, `hard: false`, `dateType: "Author Date"`, `showUncommittedChanges: true`. Each example lists only its changes to these values. In the tables, every commit has `author: "T"` and `email: "t@t.com"`, and each label's `hash` equals the hash of the commit it is on. Labels are written `type:name`, in order.

**Repository A:** `I`, `S` on `main` (HEAD). Then `git tag v1` (lightweight, on `S`) and `git tag -a v0 -m ann HEAD~1` (annotated, on `I`).

**Repository B:** `I`, then `M2` on `main`. Then `git checkout -b feature HEAD~1`, commit `F1`, `git checkout main`, and create the untracked file `dirty`.

**Repository C:** `git clone <A> C` (after A1–A7, so A has an untracked file, which does not matter), set the user as above, then commit `L` on `main`. The clone creates `origin/main` on `S` and the symbolic `origin/HEAD` → `origin/main`, and fetches tags `v0` and `v1`.

**Repository D:** `I`, then `git checkout --detach` and commit `DO`. `main` stays on `I`.

### 4.2 Results

**A1: default input, clean tree.** 3 processes: `show-ref`, `log`, `status`.

| #   | hash | parentHashes | date       | message  | refs                  |
| --- | ---- | ------------ | ---------- | -------- | --------------------- |
| 0   | `S`  | `[I]`        | 1700000100 | "second" | `head:main`, `tag:v1` |
| 1   | `I`  | `[]`         | 1700000000 | "init"   | `tag:v0`              |

`head: S`, `moreCommitsAvailable: false`, `hard: false`, `uncommittedChanges: 0`.

**A2: `maxCommits: 1`.** `commits` is only row 0 of A1, `moreCommitsAvailable: true`, `head: S`, `uncommittedChanges: 0`.

**A3: `showRemoteBranches: false`, `dateType: "Commit Date"`, `hard: true`.** The same rows as A1, because author and committer dates are equal here. `hard: true`. The refs command is `show-ref --heads --tags -d --head`.

**A4: A plus an untracked file `untracked`, default input.**

| #   | hash | parentHashes | author | email   | date       | message  | refs                  |
| --- | ---- | ------------ | ------ | ------- | ---------- | -------- | --------------------- |
| 0   | `*`  | `[S]`        | `*`    | `""`    | now        | `""`     | none                  |
| 1   | `S`  | `[I]`        | T      | t@t.com | 1700000100 | "second" | `head:main`, `tag:v1` |
| 2   | `I`  | `[]`         | T      | t@t.com | 1700000000 | "init"   | `tag:v0`              |

`head: S`, `moreCommitsAvailable: false`, `uncommittedChanges: 1`.

**A5: as A4 with `showUncommittedChanges: false`.** The rows of A1, `uncommittedChanges: 0`. Only 2 processes run: no `status`.

**A6: as A4 with `maxCommits: 0`.** `commits: []`, `head: S`, `moreCommitsAvailable: true`, `uncommittedChanges: 0`. 2 processes. (The log asks for `--max-count=1`.)

**A7: `branchName: "nope"`.** Rejects with `GitError` `fatal: bad revision 'refs/heads/nope'\n`.

**B1: default input (HEAD on `main`, the tree is dirty).**

| #   | hash | parentHashes | date       | message  | refs           |
| --- | ---- | ------------ | ---------- | -------- | -------------- |
| 0   | `*`  | `[M2]`       | now        | `""`     | none           |
| 1   | `F1` | `[I]`        | 1600000000 | "feat-1" | `head:feature` |
| 2   | `M2` | `[I]`        | 1800000000 | "main-2" | `head:main`    |
| 3   | `I`  | `[]`         | 1700000000 | "init"   | none           |

`head: M2`, `moreCommitsAvailable: false`, `uncommittedChanges: 1`. The order follows the committer dates (F1 1700000200 before M2 1700000100), not the author dates shown. The row is first even though HEAD's commit is row 2.

**B2: `dateType: "Commit Date"`, `showUncommittedChanges: false`.** Rows `F1` (1700000200), `M2` (1700000100), `I` (1700000000), with the same labels as B1. `uncommittedChanges: 0`.

**B3: `branchName: "feature"`.** Rows `F1` (1600000000, `head:feature`) and `I`. `head: M2` (not in the list). There is no row, `uncommittedChanges: 0`, and only 2 processes run (no `status`).

**B4: `maxCommits: 1`.** Only `F1`. `moreCommitsAvailable: true`, no row, `uncommittedChanges: 0`, no `status` process. HEAD's commit `M2` did not make the page.

**C1: `showUncommittedChanges: false`.**

| #   | hash | parentHashes | date       | message  | refs                                                 |
| --- | ---- | ------------ | ---------- | -------- | ---------------------------------------------------- |
| 0   | `L`  | `[S]`        | 1700000300 | "local"  | `head:main`                                          |
| 1   | `S`  | `[I]`        | 1700000100 | "second" | `remote:origin/HEAD`, `remote:origin/main`, `tag:v1` |
| 2   | `I`  | `[]`         | 1700000000 | "init"   | `tag:v0`                                             |

`head: L`, `moreCommitsAvailable: false`, `uncommittedChanges: 0`. 2 processes.

**C2: as C1 with `hiddenRemotes: ["origin"]`.** The same three rows, but row 1's refs are only `tag:v1`. 4 processes: `remote`, `for-each-ref`, `show-ref`, `log`.

**C3: as C1 with `showRemoteBranches: false`.** The same as C2.

**C4: as C1 with `branchName: "remotes/origin/main"`.** Rows `S` (`remote:origin/HEAD`, `remote:origin/main`, `tag:v1`) and `I` (`tag:v0`). `head: L`. The log revision is `refs/remotes/origin/main`.

**D1: `showRemoteBranches: false`, clean tree.** Rows `DO` (`[I]`, 1700000100, "detached-only", no refs) and `I` (`head:main`). `head: DO`, `uncommittedChanges: 0`. 3 processes (`status` ran and found nothing).

**D2: D plus an untracked file, `branchName: "main"`.** Only row `I` (`head:main`). `head: DO`, `uncommittedChanges: 0`. 2 processes.

**D3: as D2 with `branchName: ""`.** Rows `*` (parent `DO`), `DO`, `I`. `uncommittedChanges: 1`.

**E1: `git init -b main` only, plus an untracked file, default input.** `{ commits: [], head: null, moreCommitsAvailable: false, hard: false, uncommittedChanges: 0 }`. 2 processes (`show-ref` exits 1 with no output, `log` prints nothing).

**O1: a repository with `I` on `main`, then `git checkout --orphan fresh`.** Rows: only `I` (`head:main`). `head: null`, `uncommittedChanges: 0`, even though the index holds `f`.

**R1: records test.** From a repository like `makeRepo()` (one "init" commit), add empty commits with the subjects `carriage\rreturn subject` and `line feed\r\nsubject`, then one with `GIT_AUTHOR_NAME="Carriage\rReturn Author"` and subject `plain`, then `last`. With `maxCommits: 4`, the `(message, author)` pairs are `("last","T")`, `("plain","Carriage\rReturn Author")`, `("line feed subject","T")`, `("carriage\rreturn subject","T")`. `moreCommitsAvailable` is `true`. The hashes equal `git rev-list --max-count=4 HEAD`.

### 4.3 `parseLog` examples

Let `h` be `a`×40.

| Input                                                            | Result                                                                                         |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `""`                                                             | `[]`                                                                                           |
| `h\0` + `b`×40 + ` ` + `c`×40 + `\0A\0a@x\010\0s\0`              | `[{ hash: h, parentHashes: [b×40, c×40], author: "A", email: "a@x", date: 10, message: "s" }]` |
| `h\0\0A\0e\010\0s\0` then `b`×64 + `\0` + `h` + `\0A\0e\00\0s\0` | two entries. The second has a 64-character hash, `parentHashes: [h]` and `date: 0`             |
| the same record with the final NUL removed                       | throws the incomplete-record error                                                             |
| one record + `\n`                                                | throws                                                                                         |
| only the first five fields, each followed by NUL                 | throws                                                                                         |
| one record followed by the first three fields of another         | throws                                                                                         |
| hash `not a hash`, `A`×40, `a`×39 or `a`×65                      | throws                                                                                         |
| hash `a`×41                                                      | accepted                                                                                       |
| date `yesterday`, `""`, `-5`, `1.5`                              | throws                                                                                         |
| date `007`                                                       | `date: 7`                                                                                      |
| parents `xyz  q`                                                 | `parentHashes: ["xyz", "", "q"]`                                                               |
| message `a\nb\r\nc`                                              | kept as is                                                                                     |

### 4.4 Cancellation

- If the client was created with an `AbortSignal` that is already aborted, the call rejects with `GitPluginError: Abort already signaled`, and 0 Git processes start.
- If the signal is aborted just after the call starts, the call rejects with `GitPluginError: Abort signal received` after 1 process was started.

---

## 5. Non-functional requirements

- **Number of Git processes per call.** There must be no per-commit or per-ref processes, whatever the size of the history:

  | Condition                                                                | Processes                                     |
  | ------------------------------------------------------------------------ | --------------------------------------------- |
  | always                                                                   | `show-ref` + `log` = 2                        |
  | `showRemoteBranches` and a non-empty `hiddenRemotes`                     | + `remote` + `for-each-ref` (from the helper) |
  | `showUncommittedChanges`, `head` not null, and HEAD's commit on the page | + `status`                                    |

  The range is 2 to 5. `status` must **not** run when its result could not be shown: the row's conditions fail, HEAD is further down than the page, or a filter excludes HEAD. Otherwise a failing `status` would reject a load that should succeed, and a large working tree would slow every load for nothing.

- **Order between processes.** The log needs HEAD's hash (from `show-ref`) and the visibility arguments (from the helper). `status` needs the log's result. `show-ref` and the helper do not depend on each other. The current code runs everything one after another. Running independent steps at the same time is allowed, but a failure in any step must still reject the call. After an injected failure, `graphErrors.test.ts` waits for every other Git process that was started before it deletes the fixture.
- **Output size.** Git must be asked for at most `maxCommits + 1` commits (`--max-count`). Never read the whole history and cut it down in JavaScript.
- **Performance.** On a 53,157-commit benchmark fixture (`scripts/benchmark-fixture.cjs`, 50,000 base commits, 999 merges, 16 remote lanes; this container, Git 2.43.0), three samples each:

  | Page                                  | Rows   | Processes | Time       |
  | ------------------------------------- | ------ | --------- | ---------- |
  | 300                                   | 300    | 2         | 244–264 ms |
  | 1,000                                 | 1,000  | 2         | 257–285 ms |
  | 3,000                                 | 3,000  | 2         | 266–358 ms |
  | 10,000                                | 10,000 | 2         | 349–389 ms |
  | 60,000 (the whole history)            | 53,157 | 2         | 554–565 ms |
  | 3,000, `hiddenRemotes: ["origin"]`    | 3,000  | 4         | 271–324 ms |
  | 3,000, `showUncommittedChanges: true` | 3,000  | 3         | 286–435 ms |

  `docs/benchmarks/2026-09-18.json` (Git 2.53.0, CI-like Linux) recorded medians of 189.9, 195.3 and 203.6 ms for 300, 1,000 and 3,000 rows, and 215.1 ms for 3,000 rows with origin hidden. Most of the time is Git's date-order walk, so the time grows only slowly with page size. A replacement should stay within about 10% of these numbers. Parsing and attaching labels must take time linear in rows plus refs, never rows × refs.

- **Command-line length.** With 2,000 hidden remote-tracking refs, the whole `log` argument array, joined with spaces, must be under 500 characters (`remoteVisibilityScale.test.ts`). Windows limits a command line to 32,767 characters. Use the helper's arguments and never list refs one by one.
- **User configuration must not matter.** All parsing must work under `tests/fixtures/hostile.gitconfig`. The client's `-c` overrides and the explicit `--format`/`-z`/`--untracked-files=all` arguments are what guarantee this.
- **No writes to the repository.** Reading the graph must not rewrite `.git/index`, even when a file's timestamp has changed (`optionalLocks.test.ts`). The client's `--no-optional-locks` provides this. The module itself must not run any Git command that writes, and must not create files. A branch named `--output=x` must not make Git write a file.
- **Cancellation.** The module does not take a signal of its own. Cancellation works only because every process goes through the client, which carries the caller's signal: an already-aborted signal starts no process, and aborting kills the running one and rejects the call. After cancellation, nothing may be posted or cached. The module has no state between calls.
- **Statelessness and inputs.** Each call is independent: no caching and no module-level state. `input` and its `hiddenRemotes` array must not be changed.
- **Localization.** The only text this module produces is the incomplete-record message, and it must go through `l10n.t` with the literal English key (§2.1). Git's own error text is passed on as is.

---

## 6. Test coverage

### 6.1 What the existing tests check

| File                                                  | Behaviours checked                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/backend/queries/loadCommits/list.test.ts`      | Detached HEAD history and the dirty row, with remotes on and off (row first, `parentHashes: [head]`, count 1). A `main` filter leaves out the detached commit and gives count 0. Detached HEAD with no branch or tag refs: 1 commit, `refs: []`. A HEAD commit reached only by a hidden remote is shown with no labels. An unborn repository gives an empty result with `head: null`. The exact result keys, and the fields of a commit. HEAD's commit has a `"head"` label. `maxCommits: 1` gives 1 commit and `moreCommitsAvailable: true`. `moreCommitsAvailable` is false when everything fits. The `main` filter returns commits. The exact shape of the dirty row. No row when `showUncommittedChanges` is false. No `"remote"` labels when remotes are off. `"Commit Date"` gives a positive `date`. `hard` is passed through. |
| `tests/backend/queries/loadCommits/records.test.ts`   | CR in a subject or author is kept, and CRLF subject lines are joined. The order equals `rev-list`, and more is available (R1). A root commit has `[]` parents. `parseLog` accepts `""` and one valid record with two parents, and rejects a missing terminator, a short record, a partial second record, a bad hash, and a bad date. A malformed `log` output rejects `loadCommits` with the incomplete-record message.                                                                                                                                                                                                                                                                                                                                                                                                               |
| `tests/backend/queries/graphErrors.test.ts`           | A missing branch filter rejects. A removed repository rejects. A missing Git executable rejects. Failures of `show-ref`, `log` and (with a hidden remote) `remote` propagate. A `status` failure propagates. An unborn repository succeeds with an empty result.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `tests/backend/queries/signedCommits.test.ts`         | With `log.showSignature=true` and `color.ui=always` configured, and signed commits present, the messages are exactly `["second signed","first signed","init"]` (which also shows there is no row for a clean tree), and `moreCommitsAvailable` is false.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `tests/backend/queries/optionalLocks.test.ts`         | Loading the graph with `showUncommittedChanges: true` does not rewrite the index.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `tests/backend/queries/remoteVisibility.test.ts`      | A hidden remote's tips and labels are gone, while local, tagged (annotated `kept-tag`, whose label is present) and shared history stays. Other remotes stay. More is available with `maxCommits: 1`. With nothing hidden, the hidden tip comes back. Nested remote names (`team`, `team/upstream`) and orphan remote refs (`stale/topic`). With remotes off, exactly `{base, tagged tip}` and no remote labels.                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `tests/backend/queries/remoteVisibilityScale.test.ts` | With 2,000 hidden refs: the log command line is under 500 characters, the hashes equal `rev-list --date-order --branches --tags <visible remote refs>`, and the remote label names are exactly the visible ones.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `tests/backend/queries/workingTree.test.ts`           | A partially staged file plus two untracked files in a new folder gives `uncommittedChanges` 3.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `tests/backend/actions/optionLikeRefs.test.ts`        | A filter on the branch `--output=x` selects it and writes no file. A branch is chosen over a same-named tag.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `tests/backend/utils/gitPath.test.ts`                 | A Git path with spaces and parentheses works. With a clean tree, the messages are exactly `["init"]`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `tests/extension/graph-queries.test.ts`               | The message layer only: abort, request identity and error posting. The module is mocked.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |

### 6.2 Gaps, each with a test case to add

Each case uses the fixtures of §4.1 unless it says otherwise.

1. **Lightweight and annotated tag labels are exact.** Repository A, default input → `commits[0].refs` equals `[{hash:S,name:"main",type:"head"},{hash:S,name:"v1",type:"tag"}]` and `commits[1].refs` equals `[{hash:I,name:"v0",type:"tag"}]`. There is no label named `v0^{}` and no label carrying the tag object's hash.
2. **Nested annotated tags, and tags on trees and blobs.** Repository A plus `git tag -a inner -m i HEAD`, `git tag -a outer -m o inner`, `git tag treetag HEAD^{tree}`, `git tag blobtag HEAD:f`, `git tag -a anntree -m t HEAD^{tree}` → the call resolves. `S`'s tag labels are `inner`, `outer`, `v1` (in that order), and no label is named `treetag`, `blobtag` or `anntree`.
3. **Label order.** Repository A plus branches `b-loose`, `Zeta`, `alpha`, then `git pack-refs --all`, then branch `a-loose` and tags `T1`, `t0` on `S` → `S`'s labels in order are `head:Zeta, head:a-loose, head:alpha, head:b-loose, head:main, tag:T1, tag:t0, tag:v1`.
4. **Remote labels, including `origin/HEAD`.** Repository C, `showUncommittedChanges: false` → `S`'s refs are `remote:origin/HEAD`, `remote:origin/main`, `tag:v1`, in that order.
5. **Author date against commit date, and the ordering.** Repository B, `showUncommittedChanges: false`. `"Author Date"` → hashes `[F1, M2, I]` with dates `[1600000000, 1800000000, 1700000000]`. `"Commit Date"` → the same hashes with dates `[1700000200, 1700000100, 1700000000]`.
6. **The row is first even when HEAD's commit is not.** Repository B, default input → `commits[0]` is the row with `parentHashes: [M2]`, and `commits.map(c => c.hash)` is `["*", F1, M2, I]`.
7. **No row, and no `status`, when HEAD is further down than the page.** Repository B, `maxCommits: 1` → `commits` is `[F1]`, `moreCommitsAvailable: true`, `uncommittedChanges: 0`, and `client.status` was never called (spy on it).
8. **`moreCommitsAvailable` ignores the row.** A repository with only `I` on `main`, plus an untracked file, `maxCommits: 1` → `commits` hashes are `["*", I]` (length 2 = `maxCommits + 1`), `moreCommitsAvailable: false`, `uncommittedChanges: 1`.
9. **No `status` when the row is off.** Repository A, `showUncommittedChanges: false`, `client.status` replaced by a rejecting mock → resolves.
10. **Stashes are not shown.** A repository with `I`, a tracked change stashed with `git stash`, and a clean tree → `commits` is `[I]` only, and no label mentions `stash`.
11. **Orphan branch.** Example O1 → `head: null`, `commits` is `[I]` with `head:main`, and `uncommittedChanges: 0`.
12. **Unborn repository with files.** Example E1 → an empty result, and `status` is not called.
13. **Remote-branch filter.** Example C4 → hashes `[S, I]`, and the `log` call's revision argument is `refs/remotes/origin/main`. With `hiddenRemotes: ["origin"]` added → the same hashes, and no `"remote"` labels.
14. **Missing remote-branch filter.** Repository C, `branchName: "remotes/origin/nope"` → rejects with a message containing `refs/remotes/origin/nope`.
15. **The result has exactly five keys.** Any call → `Object.keys(result).toSorted()` equals `["commits","hard","head","moreCommitsAvailable","uncommittedChanges"]`, and there is no `visibilityKey` key (`toEqual` does not detect an undefined key).
16. **Empty subject and Unicode.** A commit made with `--allow-empty-message -m ""` gives `message: ""`. A commit with author `Zoë "Z" Ünïcode`, empty email and subject `tab\there émoji 🎉 "quotes" <b>&amp;` gives those values exactly, with `email: ""`. A branch `feat/ünï-cøde` is a label and works as a filter.
17. **SHA-256 repository.** `git init --object-format=sha256`, two commits → each `hash` is 64 characters, and the child's single parent is 64 characters. `parseLog` on a record with a 64-character hash accepts it.
18. **Symbolic branch ref.** `git symbolic-ref refs/heads/alias refs/heads/main` → `main`'s commit has the labels `head:alias`, `head:main`.
19. **Shallow clone.** `git clone --depth 2 file://<repo with 5 commits>` → 2 commits, and the older one has `parentHashes: []`.
20. **Cancellation.** A client created with an already-aborted signal → rejects, and no process starts (spy on `raw` and `status`, or wrap `spawn`).
21. **A malformed author line fails the whole load.** Using `git hash-object -t commit -w --stdin --literally`, write a commit whose author line is `author NoEmail 1700000000 +0000` and point a branch at it → `loadCommits` rejects with `Git returned an incomplete graph record.` (This records the current behaviour. See Question 2.)
22. **Process count.** Repository A, default input → exactly 3 calls, in the order `show-ref`, `log`, `status`. With `hiddenRemotes: ["origin"]` → `remote` and `for-each-ref` as well. With `showUncommittedChanges: false` → exactly 2.
23. **`parseLog` edge cases.** `"\0"` throws. A valid record followed by `\n` throws. A hash of `A`×40 throws. Date `"-5"` throws. Date `"007"` gives 7. Parents `"xyz  q"` give `["xyz","","q"]`.
24. **Status counting.** The table in §3.2.7 as one test, plus a conflicted merge (count 1) and changes in another worktree (count 0 in the main worktree).

---

## 7. Questions

1. **`maxCommits` outside 1, 2, 3, ….** Now: `0` sends `--max-count=1` and returns `commits: []` with `moreCommitsAvailable: true` when any commit exists. `-1` sends `--max-count=0`, so Git returns nothing, yet `moreCommitsAvailable` is `true`, even in an empty repository. `-2` or lower sends a negative count, which Git reads as "no limit", so the whole history comes back with `moreCommitsAvailable: false`. `1.5` sends `--max-count=2.5`; Git reads it as 2, and `moreCommitsAvailable` is `false` because 2 ≠ 2.5. Callers only send whole numbers of at least 1. Should the module reject or clamp other values, or keep passing them through?
2. **One bad commit fails the whole graph.** Now: if any commit on the page has an author line Git cannot parse (it prints empty name, email and timestamp), or, in Git 2.43, a negative author timestamp, the load rejects with "incomplete graph record" and no graph is shown. `git fsck` flags such commits, but they exist in old imported histories. Newer Git versions that print negative timestamps would also be rejected, because the date must be all digits. Was the strict check meant only to catch truncated output? The alternative is to keep such commits with a fallback date or empty identity.
3. **Dirty tree but no row.** Now: the row, and the count, appear only when HEAD's commit is on the page. With a branch filter that excludes HEAD, or when HEAD is further down than the page, a dirty tree shows nothing and `uncommittedChanges` is 0. Is it intended that "load more" can make the row appear later, below other rows' timestamps but still at index 0?
4. **Unborn HEAD with changes.** Now: in a new repository, or on an orphan branch, staged and untracked files are never shown (no row, count 0), because there is no parent to attach them to. Should there be a parentless row?
5. **Bare repositories.** Now: with `showUncommittedChanges: true` (the default), the load rejects with `fatal: this operation must be run in a work tree`. Discovery never offers bare repositories, but a path could still reach the query. Should the check be skipped when there is no work tree?
6. **Symbolic refs as labels.** Now: `origin/HEAD` and any symbolic ref under `refs/heads/` get labels on the graph, while the branch list (`refNames` in `src/backend/utils/refs.ts`) leaves symbolic refs out. So the graph can show `origin/HEAD` or `alias` labels that the branch picker does not offer. Is that intended?
7. **Local branches whose names start with `remotes/`.** Now: a local branch literally named `remotes/fake` is labelled `head:remotes/fake`, but filtering on it looks up `refs/remotes/fake` and rejects with "bad revision". The ambiguity comes from the branch-list naming that `branchListRef` shares with branch focus and history search. Should this module reject, work around, or accept it?
8. **Stashes.** Now: stashes never appear, either as rows or as labels. `refs/stash` is read by `show-ref` (with remotes on) and then ignored. The original Git Graph later added stash rows. Is leaving them out intended?
9. **Git's error text is shown as is.** Now: a missing branch filter surfaces as `fatal: bad revision 'refs/heads/nope'\n`, which is untranslated, keeps its trailing newline, and includes the `refs/heads/` prefix the user never typed. Only the malformed-output error is localized. Should common failures, such as a missing filter branch, get their own localized message?
10. **`parseLog` is lenient in places.** Now: hashes of 41 to 63 characters are accepted, although Git produces only 40 or 64. Parent fields are not validated at all (`"xyz  q"` gives `["xyz","","q"]`). Very large dates become imprecise numbers. Should parents get the same hash check, and should the hash length be limited to exactly 40 or 64?
11. **Label order.** Now: labels follow `show-ref`'s byte order of full ref names, so uppercase names sort before lowercase ones and all branches come before remotes and tags. The webview only moves the checked-out branch first. Is byte order the intended display order, or is it just what Git happens to give?
12. **The placeholder row's timestamp.** Now: the current time, rounded to the nearest second, so it can be up to half a second in the future. Nothing depends on the exact value. Is "now" the intended date, rather than, say, HEAD's date or the newest change's modification time?

---

## 8. Decisions on §7 (from the project maintainer's side)

These decisions replace the "current behaviour" wherever they differ. Build to these, and replace the gap cases they contradict (for example 21 and parts of 23) with tests of the decided behaviour.

- **Q1: clamp the page size.** `maxCommits` is rounded down to a whole number and raised to at least 1 before use.
- **Q2: strict about structure, lenient about content.** `parseLog` still rejects output that is not whole six-field NUL-terminated records, and records whose commit ID is not a full ID (Q10). The name, email and subject are taken as given. A date field that is not a string of digits (for example empty, as Git prints some pre-1970 dates) gives the date `NaN` instead of failing the load; the webview shows such dates as unknown.
- **Q3: keep.** The uncommitted-changes row appears only where HEAD's commit is on the page.
- **Q4: keep.** An unborn HEAD shows no uncommitted-changes row.
- **Q5: no work tree, no row.** In a repository without a work tree (bare), the load succeeds without an uncommitted-changes row instead of failing. Do not add a process to repositories that have a work tree.
- **Q6: keep.** Symbolic refs keep their labels.
- **Q7: keep.** Filter lookups are the branch-reference helper's concern.
- **Q8: out of scope.** Stashes are not shown.
- **Q9: keep.** Git's error text is passed on as it is.
- **Q10: exact IDs.** A commit ID, and each parent ID, must be exactly 40 or exactly 64 lowercase hexadecimal characters; anything else is a malformed record. Large dates stay numbers.
- **Q11: keep.** Labels stay in byte order.
- **Q12: never in the future.** The placeholder row's timestamp is the current time rounded down to whole seconds.
