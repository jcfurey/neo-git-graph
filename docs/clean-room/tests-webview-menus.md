# Clean-room specification: the webview menu and row tests

Four test files still hold lines inherited from the upstream projects. Each is deleted and written
again, whole, at the same path, by someone who has not seen it or its history. This document is
what they write from: for each file, the product code it drives, the situations it sets up, what
it does, and what it expects to see, given as behaviour and data.

The rewrite does not have to copy the old files' grouping, helper functions, names or number of
tests. It must check at least the behaviour listed here, at least as precisely: where a check below
says **exact**, the whole value is compared; where it says **partial**, only the named fields are.

The product behaviour behind these checks is specified in [menus.md](menus.md) (the menus, their
source keys and `checkoutBranchAction`), [commit-view.md](commit-view.md) §3 and §5 (`CommitRow`
and `RefLabel`), [actions.md](actions.md) (dialogs and `runAction`) and
[rpc-client.md](rpc-client.md) (RPC requests). Where those documents and this one differ, this one
describes the code at commit `c1c8e2f`, which the current tests pass against.

## 0. How the observations were made

- Checked out `main` at `c1c8e2f` and installed with `pnpm install --frozen-lockfile`.
- Ran the four files with `pnpm exec vitest run --project webview <files>`: 4 files, 64 tests, all
  pass (§1.1 gives the count per file).
- Ran coverage for the four files together, for each file alone, for the whole webview project, and
  for the whole project without these four files (§6).
- From scratch Vitest files outside the repository, using the same setup file and helper, rendered
  `CommitRow` and `RefLabel` with the fixtures of §4 and §5 and printed their HTML; clicked the
  row's menu button and printed the context-menu state; drove the copy entries with success,
  refusal and failure replies, and with a failure title holding `{0}`, and printed the dialog store
  after each; drove the remote checkout, local checkout, remote-HEAD worktree and fetch entries
  and printed the posted messages and the dialogs; and, for §7, submitted the forms these files do
  not submit, chose the tool and remote-flow entries, and chose every entry with no repository
  selected. The scratch files have been deleted.
- `node scripts/provenance.cjs --lines <file>` with Git 2.55 for the inherited-line counts.

Terms used below:

- **Stand-in strings**: the `window.l10n` replacement installed for tests (§1.4). Under it, every
  title, label and message is a key name.
- **`—`** in a list of menu titles: a separator entry (`null`).
- **Choosing an entry**: building a menu, finding the entry with the given title, and calling its
  `onClick`.
- **Submitting**: calling the open form dialog's `onSubmit` with the listed values, one per input,
  in input order.
- **Posted**: passed to the VS Code API stub's `postMessage` spy since it was last cleared.
- **Envelope**: the two fields every `runAction` message carries besides its command: `repo`
  (exactly `"repo"` in §2) and `requestId` (any string).

---

## 1. Scope and rules

### 1.1 The files

| File                                                | Tests | Inherited lines | Product code driven                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| --------------------------------------------------- | ----: | --------------: | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/webview/lib/menus.test.ts`                   |    56 |              58 | `src/webview/lib/menus.tsx`: `commitMenu`, `refMenu`, `commitMenuSource`, `refMenuSource`, `checkoutBranchAction`. Through them, the real `openFormDialog`, `runAction` and `closeDialog` (`src/webview/lib/actions.ts`), `openRemoteAction` (`src/webview/lib/remote-actions.tsx`) and `openAddWorktree` (`src/webview/components/repository/WorktreeManager.tsx`). It also calls `handleLoadRemotes` from `src/webview/lib/remote-actions.tsx` directly. |
| `tests/webview/lib/actions/clipboard.test.ts`       |     4 |              38 | `copyToClipboard` (`src/webview/lib/actions/clipboard.ts`), reached only through the copy entries of `commitMenu` and `refMenu`; the RPC client and handler (`src/webview/lib/rpc/`); `openErrorDialog` (`src/webview/lib/actions.ts`).                                                                                                                                                                                                                    |
| `tests/webview/components/commit/CommitRow.test.ts` |     2 |              55 | `CommitRow` (`src/webview/components/commit/CommitRow.tsx`), with the `RefLabel` it renders; `commitMenu` and `commitMenuSource` through the row's menu button; `openContextMenu` (`src/webview/lib/actions.ts`).                                                                                                                                                                                                                                          |
| `tests/webview/components/commit/RefLabel.test.ts`  |     2 |              17 | `RefLabel` (`src/webview/components/commit/RefLabel.tsx`).                                                                                                                                                                                                                                                                                                                                                                                                 |

Rules for the rewrite:

- Each file is replaced whole, at the same path. Nothing of the old file is kept.
- No product module is mocked in any of the four files. The only stand-ins are the VS Code API
  stub, the stand-in strings, the settings object given by the test helper, and (in two places) a
  reply to a request that the test builds and delivers itself (§2.1, §3.1).
- A fixture value may be changed where no check depends on it. Where an expected value is derived
  from a fixture (a short hash, a suggested branch name, a key), the relation must hold for the
  values chosen.
- The files are `.ts`, as the project's include pattern requires (§1.2), so they cannot contain
  JSX: components are rendered with Preact's `h` (or `createElement`) and `render`.

### 1.2 How the files are run

- **Runner.** Vitest 4.1.11, configured in `vitest.config.ts` at the repository root. The files
  belong to the project named `webview`, whose `include` pattern is `tests/webview/**/*.test.ts`.
  The project resolves `@/` to `src/` and `@tests/` to `tests/`, and runs one setup file,
  `tests/webview/setup.ts` (§1.3), before each test file.
- **Environment.** The `webview` project sets no environment, so Vitest's default (Node, no DOM)
  applies. Each of the four files opts into jsdom (the `jsdom` package, ^30.0.1) with a per-file
  environment comment at the top of the file. The rewritten files need the same opt-in: all of
  them touch `window`, and two render into DOM elements.
- **Isolation.** Vitest's default per-file isolation is not overridden, so each file gets its own
  instances of every module: fresh stores, fresh request counters in `actions.ts` and
  `remote-actions.tsx`, and a fresh settings holder. The helper that installs the settings may be
  called only once per file (the holder refuses a second initialization).
- **Mocks.** The configuration sets none of `clearMocks`, `mockReset` or `restoreMocks`. The
  `postMessage` spy keeps every call made in a file until the file clears it; `menus.test.ts` and
  `clipboard.test.ts` clear it before every test.
- **Timeouts.** The `webview` project sets none, so Vitest's defaults apply (5 s per test, 10 s per
  hook). None of the four files uses fake timers. `clipboard.test.ts` waits for an asynchronous
  result with Vitest's polling helper (default 1 s limit, 50 ms between attempts); that is why each
  of its tests takes about 55 ms.
- **Commands.** `pnpm run test` runs the `backend`, `extension` and `webview` projects in turn.
  `pnpm run test:coverage` is `vitest run --project webview --coverage` (§1.5). CI
  (`.github/workflows/ci.yaml`, job `test`) runs `pnpm run test` on Ubuntu, Windows and macOS and
  `pnpm run test:coverage` on Linux only (step "Check menu coverage"). The shuffled-order run in CI
  is for the `backend` project only.
- **Nothing else singles these files out.** Neither `vitest.config.ts` nor `package.json` names any
  of the four files; the only special treatment is the coverage setting on the product file
  `src/webview/lib/menus.tsx` (§1.5).
- **Other checks that read the files.** `pnpm run typecheck` includes `tsc -p tests/webview`
  (`tests/webview/tsconfig.json` extends `src/webview/tsconfig.json` and includes
  `src/webview/global.d.ts`, which types `window.l10n` and `acquireVsCodeApi`), so fixtures must
  satisfy `GitCommitNode` and `GitRef` in full and component props must type-check.
  `pnpm run lint` (oxlint, `.oxlintrc.json`) applies to tests: imports grouped as built-in,
  external, `@/…`, `@tests/…`, relative, with a blank line between groups and alphabetical order
  inside each; braces on every `if`; unused variables and parameters only with a leading `_`. The
  rule against hard-coded text applies to `src/webview/**/*.tsx` only. `pnpm run format` (oxfmt)
  checks formatting. `pnpm run check:provenance` compares inherited lines with the baseline, which
  the rewrite lowers ([provenance.md](../provenance.md)).

### 1.3 Shared helpers the files rely on

Both helpers are being rewritten by another group with the same interface. These files rely on the
following, and on nothing else in them.

`tests/webview/setup.ts` (the project's setup file; the test files also import its export):

- Export `vscodeApi`: a stand-in for the object VS Code's webview API returns, with Vitest spies
  `postMessage`, `getState` (returns `undefined`) and `setState`. The files read and clear only
  `postMessage`, which records every message the page sends to the extension, in order.
- A global `acquireVsCodeApi` that returns that same object. `src/webview/lib/vscode.ts` calls it
  once when first loaded, so every product module that posts a message posts it to the
  `vscodeApi.postMessage` spy.

`tests/webview/test-utils.ts`:

- `setupWebviewTest(options?)`, called once per file before any check:
  1. gives the page its settings, as if the extension had sent them: `autoCenterCommitDetailsView`
     `true`, `dateFormat` `"Date & Time"`, `graphColours` empty, `graphStyle` `"rounded"`,
     `initialLoadCommits` 300, `loadMoreCommits` 100, `locale` `"en"`,
     `showCurrentBranchByDefault` `false`. `CommitRow` needs them for its date cell;
  2. installs the stand-in strings (§1.4) as a redefinable `window.l10n`;
  3. only with `{ dispatchMessages: true }`: starts the RPC client's listener and the dispatcher of
     command messages, so that a `message` event dispatched on `window` reaches the RPC handler
     (for `rpc.response` data) or the command routes (for `{ command }` data). Without it the
     dispatcher never runs, so a reply carrying a `command` has to be handed to its handler
     directly (as §2.3 G5 does), and the RPC listener starts only with the first RPC request.
- `menus.test.ts`, `CommitRow.test.ts` and `RefLabel.test.ts` call it without options;
  `clipboard.test.ts` calls it with `dispatchMessages: true`. The helper's other export,
  `latestGraphRequest`, is not used by these files.

### 1.4 The stand-in strings

Reading any property of the stand-in returns the property's name. So, in these tests:

- menu titles are key names, with U+2026 `…` appended where the menu appends it (`addTag…`, but
  `compareWith` and `copyCommitHash` bare);
- a form dialog's submit label (`action`) and its inputs' labels and placeholders are key names
  (`dialogAddTagSubmit`, `dialogAddTagName`);
- templates that hold `{0}` in English hold no placeholder here, so substitutions cannot be seen:
  a refused copy reports exactly `unableToCopyToClipboard` whatever was copied, and the row's menu
  button is labelled exactly `commitActions`, without the short hash.

`clipboard.test.ts` loads `src/webview/lib/menus.tsx` and `src/webview/lib/stores.ts` before it
installs the stand-in (the other three files load the product modules after installing it). That
file therefore also checks, without saying so, that loading those modules reads no string
([menus.md](menus.md) §5.4). See tests-m Q2.

### 1.5 The coverage gate on `menus.tsx`

- `vitest.config.ts` sets, for coverage: provider `v8` (`@vitest/coverage-v8` 4.1.11), `include`
  limited to `src/webview/lib/menus.tsx`, reporter `text`, and one threshold: **functions ≥ 80 %
  for `src/webview/lib/menus.tsx`**. There is no threshold on statements, branches or lines, and
  none for any other file.
- It is measured by `pnpm run test:coverage`, which runs the whole `webview` project; CI fails the
  step when the threshold is not met.
- V8 counts every function in the file, not only exports: helpers, each menu entry's `onClick`
  arrow, each dialog's `onSubmit` arrow, and the callback that builds the merge-parent options. At
  `c1c8e2f` the file has 72.
- Whole `webview` project: 72 of 72 (100 %). Without these four files: 70 of 72 (97.22 %). These
  four files alone: 49 of 72 (68.05 %), below the threshold, so running only these files with
  `--coverage` reports a threshold failure even though every test passes.
- The share these files provide: two functions that no other test file reaches, both in
  `menus.test.ts`: the submit handler of the Cherry Pick / Revert form for a commit with fewer than
  two parents, and the one for a merge commit. Without them the project would still pass the gate,
  at 97.22 %, but nothing would check what those two submits send. Details in §6.

### 1.6 Module state that the checks depend on

- `dialog`, `contextMenu` and `selectedRepo` in `src/webview/lib/stores.ts` are signals. The tests
  write them directly to set a situation up and read them to check the outcome.
- `runAction` numbers its requests `action-<n>` and `openRemoteAction` numbers its `remote-<n>`,
  counting across the whole file. No check depends on the number: a `requestId` is checked as "any
  string", or compared with the id read from an earlier message of the same flow.
- After posting its message, `runAction` shows a "running" dialog, so the dialog store is not
  `null` after a submit. The checks do not look at it, but each test must start from a `null`
  dialog store where it checks for `null` afterwards.
- `remote-actions.tsx` remembers one pending `loadRemotes` request. Its reply handler ignores a
  reply whose `requestId` or `repo` does not match that request, and does nothing when the dialog
  has changed since the request was sent.

---

## 2. `tests/webview/lib/menus.test.ts`

56 tests at `c1c8e2f`, all passing. Every check is synchronous.

### 2.1 What it drives, and the stand-ins

- The exports of `src/webview/lib/menus.tsx` listed in §1.1, with the real dialog, action and
  remote-flow code behind them. Checks read what the menus return (titles), what the dialog store
  holds after an entry is chosen (a form dialog's `inputs`, `action`, `destructive`, `source`), and
  what is posted after a submit or a direct action.
- The settings and stand-in strings are installed once, without message dispatch (§1.3).
- Before every test: the `postMessage` spy is cleared, the dialog store is set to `null`, and the
  selected repository is set to `"repo"`. Checks that expect the context-menu store to stay `null`
  set it to `null` first.
- The extension's reply to a `loadRemotes` request is simulated in one group of checks (§2.3 G5):
  the test builds the reply and passes it to `handleLoadRemotes` from
  `src/webview/lib/remote-actions.tsx` itself. The dispatcher is not running in this file.

### 2.2 Fixtures

Commits (`GitCommitNode`; every field is required by the type):

| Name | `hash`                                         | `parentHashes`                         | Other fields                                                                                 |
| ---- | ---------------------------------------------- | -------------------------------------- | -------------------------------------------------------------------------------------------- |
| C0   | the literal string `commit` (not a real hash)  | varies per check (below)               | `author` `Author`, `email` `author@example.com`, `date` 0, `message` `Message`, `refs` empty |
| N    | H = `0123456789abcdef0123456789abcdef01234567` | one parent, `f` repeated 40 times      | as C0                                                                                        |
| N3   | H                                              | `1`×40, `2`×40, `3`×40 (three parents) | as C0                                                                                        |

Refs (`GitRef`), all with `hash` H unless stated:

| Name   | `type`   | `name`         | Role                                   |
| ------ | -------- | -------------- | -------------------------------------- |
| topic  | `head`   | `topic`        | a local branch that is not checked out |
| main   | `head`   | `main`         | the checked-out branch                 |
| remote | `remote` | `origin/topic` | a remote-tracking branch               |
| tag    | `tag`    | `v1`           | a tag                                  |

The messages map given to `commitMenu` is empty unless a check says otherwise.

Expected title lists (from the stand-in strings; order matters; `—` is a separator):

| List          | Entries                                                                                                                                                                                                          | Count |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----: |
| Commit        | `addTag…`, `createBranch…`, —, `checkout…`, `cherryPick…`, `revert…`, —, `merge…`, `reset…`, —, `interactiveRebase…`, `createFixupMenu…`, `compareWith`, `bisectChooseGood`, `bisectChooseBad`, `copyCommitHash` |    16 |
| Local         | `focusThisBranch`, `compareWith`, —, `configureUpstream…`, `addWorktree…`, `rebaseOnto…`, `checkoutBranch`, `pushBranch…`, `renameBranch…`, `deleteBranch…`, `merge…`, —, `copyBranchName`                       |    13 |
| Checked out   | `focusThisBranch`, `compareWith`, —, `configureUpstream…`, `addWorktree…`, `pushBranch…`, `pullBranch…`, `renameBranch…`, —, `copyBranchName`                                                                    |    10 |
| Remote        | `focusThisBranch`, `compareWith`, —, `rebaseOnto…`, `addWorktree…`, `deleteRemoteBranch…`, `fetch…`, `checkoutBranch…`, —, `copyBranchName`                                                                      |    10 |
| Remote's HEAD | `compareWith`, —, `rebaseOnto…`, `addWorktree…`, `fetch…`, —, `copyBranchName`                                                                                                                                   |     7 |
| Tag           | `compareWith`, —, `deleteTag…`, `pushTag…`, `deleteRemoteTag…`, —, `copyTagName`                                                                                                                                 |     7 |

### 2.3 Checks

Match kinds used below: **exact** compares the whole value (keys whose value is `undefined` are
ignored); **strict** is exact and also fails on a key that is present with the value `undefined`;
**partial** compares the listed fields only. For posted messages, **some** means one of the messages
posted in the test matches, **last** the most recent one, and **only** that exactly one message was
posted and it matches. "+ envelope" means the message's `repo` is exactly `"repo"` and its
`requestId` is a string, and the remaining fields are compared exactly.

Whenever a check chooses an entry that opens a form, it also checks that the entry exists and that
the dialog store then holds a dialog of kind `form`.

#### A. Menu contents

Titles of the built menu, mapped to the title or `null` for a separator, compared **exact** with the
lists of §2.2.

| Menu built                                                                                    | `isHeadBranch`     | Expected list                 |
| --------------------------------------------------------------------------------------------- | ------------------ | ----------------------------- |
| `commitMenu` of N with no parents, with one parent `p`×40, and with parents `p`×40 and `q`×40 | —                  | Commit, for all three         |
| `refMenu` of topic                                                                            | `false`            | Local                         |
| `refMenu` of main                                                                             | `true`             | Checked out                   |
| `refMenu` of remote                                                                           | `false` and `true` | Remote, both times            |
| `refMenu` of tag                                                                              | `false` and `true` | Tag, both times               |
| `refMenu` of remote refs named `origin/HEAD` and `team/origin/HEAD`                           | `false` and `true` | Remote's HEAD, all four times |
| `refMenu` of remote refs named `origin/HEADS`, `origin/x-HEAD` and `origin/HEAD/topic`        | `false`            | Remote, all three times       |

The last two rows pin down what counts as a remote's HEAD: a remote ref whose name ends in `/HEAD`,
however many segments come before it; a name with `HEAD` anywhere else in it is a normal remote
branch.

#### B. Building a menu has no side effects, and each result stands alone

- B1. With the context-menu store `null`, build: `commitMenu` for N with parents none, `p`, and
  `p` and `q`, each with a messages map holding `p` → `Parent`; and `refMenu` for topic, remote, a
  remote named `origin/HEAD`, and tag, each with `isHeadBranch` `false` and again `true`. Then:
  nothing posted, dialog store `null`, context-menu store `null`.
- B2. Append a separator and one extra entry to the array returned by `commitMenu` for N; a new
  call for N returns 16 entries. Set the length of the array returned by `refMenu` for topic
  (`false`) to 0; a new call returns 13 entries.

#### C. Source keys

Each result compared **exact**:

| Call                                                                       | Result                        |
| -------------------------------------------------------------------------- | ----------------------------- |
| `commitMenuSource(H)`                                                      | `commit:` followed by H       |
| `refMenuSource` of `{ type: "head", name: "feature/x", hash: H }`          | `ref:head:feature/x`          |
| `refMenuSource` of `{ type: "remote", name: "origin/feature/x", hash: H }` | `ref:remote:origin/feature/x` |
| `refMenuSource` of `{ type: "tag", name: "v1.0", hash: H }`                | `ref:tag:v1.0`                |
| `refMenuSource` of `{ type: "tag", name: "feature/x", hash: "other" }`     | `ref:tag:feature/x`           |

The last row shows that the key ignores the hash, and that a tag and a branch of the same name get
different keys.

#### D. The form each entry opens: submit label, destructive flag, owner

Each field compared **exact**. `destructive` must be the boolean `false`, not absent, on
non-destructive forms.

| Menu                         | Entry chosen    | `action`                   | `destructive` | `source`         |
| ---------------------------- | --------------- | -------------------------- | ------------- | ---------------- |
| `commitMenu` of N            | `addTag…`       | `dialogAddTagSubmit`       | `false`       | `commit:` + H    |
| `commitMenu` of N            | `createBranch…` | `dialogCreateBranchSubmit` | `false`       | `commit:` + H    |
| `commitMenu` of N            | `checkout…`     | `checkout`                 | `false`       | `commit:` + H    |
| `commitMenu` of N            | `cherryPick…`   | `dialogYesCherryPick`      | `false`       | `commit:` + H    |
| `commitMenu` of N            | `revert…`       | `dialogYesRevert`          | `false`       | `commit:` + H    |
| `commitMenu` of N            | `merge…`        | `dialogYesMerge`           | `false`       | `commit:` + H    |
| `commitMenu` of N            | `reset…`        | `dialogYesReset`           | `true`        | `commit:` + H    |
| `refMenu` of topic (`false`) | `renameBranch…` | `dialogRenameBranchSubmit` | `false`       | `ref:head:topic` |
| `refMenu` of topic (`false`) | `deleteBranch…` | `deleteBranch`             | `true`        | `ref:head:topic` |
| `refMenu` of topic (`false`) | `merge…`        | `dialogYesMerge`           | `false`       | `ref:head:topic` |
| `refMenu` of tag (`false`)   | `deleteTag…`    | `deleteTag`                | `true`        | `ref:tag:v1`     |

#### E. The inputs each form asks for

| Form                                                                                       | Expected `inputs`                                                                                                                                                                                                                                                                                                                                                                   | Match     |
| ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| Add Tag on N                                                                               | three inputs: `{ kind: "ref", label: "dialogAddTagName", value: "" }`; `{ kind: "select", label: "dialogAddTagType", value: "annotated", options: [{ label: "dialogAddTagTypeAnnotated", value: "annotated" }, { label: "dialogAddTagTypeLightweight", value: "lightweight" }] }`; `{ kind: "text", label: "dialogAddTagMessage", value: "", placeholder: "dialogAddTagOptional" }` | exact     |
| Create Branch on N                                                                         | one input `{ kind: "ref", value: "" }`, no label                                                                                                                                                                                                                                                                                                                                    | exact     |
| Rename on topic                                                                            | one input `{ kind: "ref", value: "topic" }`: prefilled with the name the branch has now                                                                                                                                                                                                                                                                                             | exact     |
| Reset on N                                                                                 | exactly one input; it has **no `label` key at all** (checked as absence); `kind` `select` and `value` `mixed` (partial); its `options` exactly `soft`, `mixed`, `hard` in that order, labelled `dialogResetSoft`, `dialogResetMixed`, `dialogResetHard`                                                                                                                             | as stated |
| Cherry Pick, and Revert, on C0 with no parents, and with the one parent `parent-1`         | none (empty array)                                                                                                                                                                                                                                                                                                                                                                  | exact     |
| Cherry Pick, and Revert, on C0 with parents `parent-1`, `parent-2`, empty messages map     | one input `{ kind: "select", value: "1", options: [{ label: "parent-1", value: "1" }, { label: "parent-2", value: "2" }] }`, no label. These parents are exactly 8 characters long, so each label is the parent's short hash, and nothing follows it because the map has no message                                                                                                 | exact     |
| Cherry Pick, and Revert, on N3 with the messages map `1`×40 → `First`, `3`×40 → `Third: x` | exactly one input; **no `label` key** (absence); `kind` `select` and `value` `1` (partial); `options` exactly `11111111: First` → `1`, `22222222` → `2`, `33333333: Third: x` → `3`. A parent is listed by its first 8 characters, followed by `: ` and its message when the map has one; a colon inside the message is kept                                                        | as stated |
| Create Worktree, chosen from `refMenu` of a remote named `origin/HEAD` (`false`)           | the fourth input (index 3, the start point) has `value` `refs/remotes/origin/HEAD`: the full ref name. Nothing else in the form is checked                                                                                                                                                                                                                                          | partial   |

#### F. What a submit sends

| Form and values submitted                                                                                              | Expected                                                                                                                                                                      | Match         |
| ---------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| Cherry Pick on C0 with no parents, and with one parent; no values                                                      | `{ command: "cherrypickCommit", repo: "repo", requestId: <any string>, commitHash: "commit", parentIndex: 0 }`                                                                | exact, some   |
| Revert, the same two cases                                                                                             | the same with `command: "revertCommit"`                                                                                                                                       | exact, some   |
| Cherry Pick, and Revert, on C0 with two parents; `["2"]`                                                               | the same with `parentIndex: 2` (a number, not the string that was submitted)                                                                                                  | exact, some   |
| Cherry Pick, and Revert, on N3 with the messages map above; `["3"]`                                                    | a message containing `commitHash` H and `parentIndex` 3                                                                                                                       | partial, last |
| Add Tag on N; `["v3", "lightweight", "typed anyway"]`                                                                  | `{ command: "addTag", tagName: "v3", commitHash: H, lightweight: true, message: "" }` + envelope: a lightweight tag sends an empty message whatever was typed                 | exact, last   |
| Add Tag on N, a second form in the same test; `["v2", "annotated", "  Release notes  "]`                               | `{ command: "addTag", tagName: "v2", commitHash: H, lightweight: false, message: "  Release notes  " }` + envelope: the message is sent as typed, surrounding spaces included | exact, last   |
| Reset on N; `["mixed"]`                                                                                                | `{ command: "resetToCommit", commitHash: H, resetMode: "mixed" }` + envelope                                                                                                  | exact, last   |
| Rename on topic; `["topic"]`. Done twice, separately: from the menu built with `isHeadBranch` `false`, and with `true` | nothing posted, and the dialog store is `null` (the dialog was closed)                                                                                                        | —             |
| then, in the same test, a new Rename form from the same kind of menu; `["Topic"]`                                      | `{ command: "renameBranch", oldName: "topic", newName: "Topic" }` + envelope, and it is the only message of the test. A change of case alone is a change                      | exact, only   |
| Create Branch on N, with the selected repository switched to `"other"` between opening and submitting; `["feature"]`   | nothing posted, and the dialog store is `null`                                                                                                                                | —             |

#### G. Checking out a branch (`checkoutBranchAction`) and the remote-ref flows

- G1. Local branch topic: **only** one message; without its envelope it is **strict**-equal to
  `{ command: "checkoutBranch", branchName: "topic", remoteBranch: null }`. Strict matters here:
  a `fetch` key must be absent, not merely `undefined`.
- G2. A tag (tag), a remote named `origin/HEAD`, and a remote named `team/origin/HEAD` (each with
  hash H), with the context-menu store `null`: nothing posted, dialog store `null`, context-menu
  store `null`.
- G3. A remote named `origin/HEADS`: the **last** message is **partial**
  `{ command: "loadRemotes", branchName: null }`, the start of the remote checkout flow.
- G4. No repository selected (the store set to `undefined`): calling it for topic and then for
  remote posts nothing, and the dialog store stays `null`.
- G5. The remote checkout flow, for three remote refs R with hash `commit`:
  1. call `checkoutBranchAction` with `{ type: "remote", name: R, hash: "commit" }`;
  2. take the last posted message, which is the `loadRemotes` request (observed:
     `{ command: "loadRemotes", repo: "repo", requestId: "remote-<n>", branchName: null }`; it is
     not checked by itself);
  3. pass `handleLoadRemotes` a reply made of that request's fields plus `remotes`
     `["origin", "team", "team/origin"]`, `upstream` `null`, `pushRemote` `null`, `status` `null`;
  4. the dialog store holds a form whose `inputs` are **exact**
     `[{ kind: "ref", value: S }, { kind: "checkbox", label: "fetchBeforeCheckout", value: true }]`;
  5. submit `[S, true]`; **some** message is **exact**
     `{ command: "checkoutBranch", repo: "repo", requestId: <the loadRemotes request's requestId>, branchName: S, remoteBranch: R, fetch: true }`.

  | R                                | S (local name offered) | Why                                                                                   |
  | -------------------------------- | ---------------------- | ------------------------------------------------------------------------------------- |
  | `origin/main`                    | `main`                 | the remote's name and the slash are removed                                           |
  | `origin/feature/navigation`      | `feature/navigation`   | slashes after the remote's name are kept                                              |
  | `team/origin/feature/navigation` | `feature/navigation`   | of the configured remotes that prefix R, the longest (`team/origin`) wins over `team` |

  The suggestion and the checkbox belong to `remote-actions.tsx`; the part this file owns is that
  `checkoutBranchAction` hands the flow the full remote ref name.

- G6. Choosing `fetch…` from `refMenu` of a remote named `origin/HEAD` (`false`): the **last**
  message is **partial** `{ command: "loadRemotes", branchName: null }`.

### 2.4 Timing

Nothing is awaited and no timer is involved: building menus, choosing entries, submitting forms and
handing a reply to `handleLoadRemotes` all complete synchronously, and each check reads the stores
and the spy immediately afterwards. No component is rendered.

## 3. `tests/webview/lib/actions/clipboard.test.ts`

4 tests at `c1c8e2f`, all passing. Each one awaits.

### 3.1 What it drives, and the stand-ins

- `copyToClipboard` from `src/webview/lib/actions/clipboard.ts`, reached only by choosing a copy
  entry from a real menu: `copyCommitHash` from `commitMenu`, `copyBranchName` from `refMenu` of a
  local or a remote branch, `copyTagName` from `refMenu` of a tag.
- The copy is an RPC request: the real RPC client posts it to the `postMessage` spy. The
  extension's answer is simulated by dispatching a `message` event on `window` whose data is an
  `rpc.response`. It reaches the real RPC handler because the file installs the helper with
  `dispatchMessages: true` (§1.3).
- A refusal ends in the real `openErrorDialog`, observed through the dialog store.
- No repository is selected anywhere in this file (the store keeps its initial `undefined`):
  copying does not need one.
- Before every test: the `postMessage` spy is cleared and the dialog store is set to `null`.
- The file loads `menus.tsx` and the stores before installing the stand-in strings (§1.4).

### 3.2 Fixtures

- A commit with `hash` the literal string `commit`, no parents, `author` `Author`, `email`
  `author@example.com`, `date` 0, `message` `Message`, no refs; an empty messages map.
- Three refs with `hash` `tip`: a local branch `topic`, a remote branch `origin/topic`, and a tag
  `v1`. Their menus are built with `isHeadBranch` `false`.
- The simulated answer, the same in every test: `kind` `rpc.response`, `id` the posted request's
  `id`, `success` `true`, `result` `false`. A successful request whose result is `false` is a copy
  that VS Code did not accept (`RpcMethodMap` in `src/types/rpc.types.ts`).

### 3.3 Checks

For each row: build the menu, choose the entry, check the posted request, dispatch the answer, wait
for the dialog, check it.

| Menu                        | Entry chosen     | Request posted                                                                                                                                   | Dialog expected after the answer                                                                                          |
| --------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| `commitMenu` of the commit  | `copyCommitHash` | the **first** posted message is **exact** `{ kind: "rpc.request", id: <any string>, method: "clipboard.copy", params: "commit" }`: the full hash | **partial** `{ kind: "error", message: "unableToCopyToClipboard", reason: null }` (no reason: a refusal is not a failure) |
| `refMenu` of `topic`        | `copyBranchName` | **only** one message; **partial** `{ kind: "rpc.request", method: "clipboard.copy", params: "topic" }`; its `id` is a string                     | first its `kind` is `error`; then **partial** `{ message: "unableToCopyToClipboard" }`                                    |
| `refMenu` of `origin/topic` | `copyBranchName` | the same, with `params` `"origin/topic"`: the remote's name is part of what is sent                                                              | the same                                                                                                                  |
| `refMenu` of `v1`           | `copyTagName`    | the same, with `params` `"v1"`                                                                                                                   | the same                                                                                                                  |

The answer's `id` is the one read from the posted request, so the answer settles that request and no
other.

### 3.4 Timing

The error dialog is not there when the dispatch returns: the RPC handler settles the request's
promise synchronously, but `copyToClipboard` resumes only on a later microtask (observed: still
`null` right after the dispatch, present after one awaited microtask). The file waits by polling
the dialog store with Vitest's polling helper until the expectation holds. The RPC client's 30 s
deadline timer is started for each request and cleared by the answer; no fake timers are used.

## 4. `tests/webview/components/commit/CommitRow.test.ts`

2 tests at `c1c8e2f`, both passing. Both are synchronous.

### 4.1 What it drives, and the stand-ins

- `CommitRow` from `src/webview/components/commit/CommitRow.tsx`, rendered with Preact's `render`
  into a `<tbody>` element created by the test (no `<table>` around it). The row renders one `<tr>`
  and, inside it, one `RefLabel` per ref of the commit.
- The row's actions button opens the context menu through the real `openContextMenu`, with the
  entries of the real `commitMenu` and the key from `commitMenuSource`. The check reads the
  context-menu store.
- The settings and stand-in strings are installed once, without message dispatch, before the
  component and the stores are loaded. The settings are needed: the date cell formats the commit's
  date with them.
- After every test, the container is emptied by rendering nothing into it, which unmounts the row.

### 4.2 Fixtures

Props given in both tests: `isHead` `false`, `headBranch` `null`, `messages` an empty map, `colour`
`undefined`, `expanded` `false`, `onSelect` `undefined`. Not given (component defaults apply):
`rows`, `tabStop`, `relation`, `keepMergedBright`, `dimming`, `onRevealLane`.

| Commit | `hash`         | `message`                               | `refs`                                                                            | Other fields                                                          |
| ------ | -------------- | --------------------------------------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| A      | `abc123456789` | `Commit message after the branch label` | one local branch, `name` `feature/a-very-long-branch-name`, `hash` `abc123456789` | no parents, `author` `Author`, `email` `author@example.com`, `date` 0 |
| B      | `abc123456789` | `message`                               | none                                                                              | as A                                                                  |

Observed description cell (the row's second `<td>`) for commit A, attributes abridged:

```html
<td class="… w-full max-w-0 …">
  <div class="flex min-w-0 items-center">
    <span class="flex max-w-1/2 shrink-0 overflow-hidden">
      <span class="… border-line bg-btn" title="feature/a-very-long-branch-name">
        <svg …>…</svg><span class="truncate ">feature/a-very-long-branch-name</span>
      </span>
    </span>
    <span class="min-w-0 flex-1 truncate" title="Commit message after the branch label"
      >Commit message after the branch label</span
    >
    <button type="button" tabindex="-1" aria-haspopup="menu" aria-label="commitActions" …>
      <svg …>…</svg>
    </button>
  </div>
</td>
```

For commit B the refs `<span>` is absent and the message `<span>` is the first child of the `<div>`.

### 4.3 Checks

1. **Commit A**, container not attached to the document. In the row's second cell, take the
   `<div>` directly inside it; call its first `<span>` child the refs region and its last `<span>`
   child the message region (the button after it is not a `<span>`).
   - The refs region has the class `max-w-1/2` (class-list membership; other classes ignored):
     the labels take at most half of the description's width.
   - The first element inside the refs region that has a `title` attribute has the title
     **exactly** `feature/a-very-long-branch-name`: a label's tooltip is the branch's name alone
     when the branch is not checked out and no repository state is loaded.
   - The message region has the class `flex-1`, its `title` is **exactly** the message, and its
     text content is **exactly** the message: the message fills the rest of the line and keeps its
     full text as a tooltip when it is cut short.
2. **Commit B**, container attached to `document.body` for this test and removed at its end; the
   context-menu store set to `null` before rendering.
   - The element found by the selector "a button with an `aria-haspopup` attribute" has
     `aria-label` **exactly** `commitActions` (with the stand-in strings the key has no `{0}`, so
     no short hash is added).
   - Clicking it (the DOM `click()` method, which fires a click whose `detail` is 0) puts a menu
     in the context-menu store whose `source`, read without subscribing, is **exactly**
     `commit:abc123456789`. The entries and the position are not checked (observed: the 16 titles
     of the commit menu, §2.2, and `x` 0, `y` 0, since jsdom gives every element an empty box).
   - The context-menu store is set back to `null` afterwards.

### 4.4 Timing

Preact's first render and the click handler both complete synchronously; the checks run straight
after them, with no awaits and no timers.

## 5. `tests/webview/components/commit/RefLabel.test.ts`

2 tests at `c1c8e2f` (one check run with two inputs), both passing. Both are synchronous.

### 5.1 What it drives, and the stand-ins

- `RefLabel` from `src/webview/components/commit/RefLabel.tsx`, rendered with Preact's `render`
  into a `<div>` created by the test and never attached to the document.
- The settings and stand-in strings are installed once, without message dispatch, before the
  component is loaded. No store is set: there is no repository state (so no upstream, worktree or
  ahead/behind details) and no focused branch (so no focus badge).
- After every test, the container is emptied by rendering nothing into it.

### 5.2 Fixtures

One ref, `{ type: "head", name: "main", hash: "abc123" }`, rendered with `active` `true` and,
separately, `false`.

Observed HTML, attributes abridged:

| `active` | Outer `<span>`                                                                               | Name `<span>`                             |
| -------- | -------------------------------------------------------------------------------------------- | ----------------------------------------- |
| `true`   | classes include `border-graph`; `title` is `main`, a line break, then `tooltipCurrentBranch` | `class="truncate font-bold"`, text `main` |
| `false`  | classes include `border-line`; `title` is `main`                                             | `class="truncate "`, text `main`          |

In both, the outer `<span>` holds the branch glyph (an `<svg>`) followed by the name `<span>`, and
nothing else.

### 5.3 Checks

The first element matched by "a `<span>` that is a direct child of a `<span>`" (the name, since the
glyph before it is an `<svg>`) is checked for the class `font-bold` (class-list membership):

| `active` | Has `font-bold` |
| -------- | --------------- |
| `true`   | yes             |
| `false`  | no              |

The checked-out branch's name is drawn bold and any other label's is not. Nothing else is checked.

### 5.4 Timing

Synchronous: the checks read the DOM straight after the render.

## 6. Coverage

### 6.1 Runs

All with the V8 provider, at `c1c8e2f`, on Linux. Percentages are as the text reporter prints them.

- **The four files together**, with the configured coverage settings:
  `pnpm exec vitest run --project webview --coverage <the four files>`. 4 files, 64 tests, all
  pass; the run then reports that `menus.tsx` misses its function threshold, and the command
  fails. The same run with `--coverage.include='src/webview/**'` gives the other product files in
  §6.2.
- **Each file alone**, with the configured settings (§6.3).
- **The whole `webview` project** (what `pnpm run test:coverage` runs): 113 files pass and 2 are
  skipped; 1844 tests pass and 2 are skipped; `menus.tsx` is covered 100 % in all four measures.
- **The whole `webview` project without these four files** (each passed to `--exclude`). The run
  also excluded `tests/webview/graph/layout.rules.test.ts`, which timed out on the loaded machine
  and does not load `menus.tsx`: 108 files and 1728 tests pass, 2 skipped.

### 6.2 Per product file, from these four files alone

| Product file                                  | Statements       | Branches         | Functions       | Lines            |
| --------------------------------------------- | ---------------- | ---------------- | --------------- | ---------------- |
| `src/webview/lib/menus.tsx`                   | 80.67 % (96/119) | 100 % (31/31)    | 68.05 % (49/72) | 84.54 % (93/110) |
| `src/webview/lib/actions/clipboard.ts`        | 62.5 % (5/8)     | 25 % (1/4)       | 50 % (1/2)      | 71.42 % (5/7)    |
| `src/webview/components/commit/CommitRow.tsx` | 31.81 % (28/88)  | 38.73 % (43/111) | 38.46 % (10/26) | 29.62 % (24/81)  |
| `src/webview/components/commit/RefLabel.tsx`  | 60 % (18/30)     | 55.26 % (21/38)  | 40 % (4/10)     | 59.25 % (16/27)  |
| `src/webview/lib/remote-actions.tsx`          | 38.73 % (43/111) | 29.54 % (39/132) | 42.1 % (8/19)   | 38.18 % (42/110) |
| `src/webview/lib/actions.ts`                  | 13.86 % (33/238) | 8.08 % (11/136)  | 16.66 % (9/54)  | 13.92 % (33/237) |

In `clipboard.ts`, only the refusal path runs: a successful copy and a failed request are never
answered, and the function that fills `{0}` in the failure title never runs because the stand-in
title has no `{0}`. The low figures for `CommitRow.tsx` and `RefLabel.tsx` are expected: their
pointer, keyboard, tooltip and state behaviour is checked by `CommitRowInteraction.test.ts` and
`RefLabelDetails.test.ts`, which are not part of this group.

### 6.3 `menus.tsx` functions

| Run                                           | Functions       | Statements        | Branches        | Lines             |
| --------------------------------------------- | --------------- | ----------------- | --------------- | ----------------- |
| `menus.test.ts` alone                         | 63.88 % (46/72) | 78.15 % (93/119)  | 100 % (31/31)   | 81.81 % (90/110)  |
| `clipboard.test.ts` alone                     | 19.44 % (14/72) | 34.45 % (41/119)  | 35.48 % (11/31) | 37.27 % (41/110)  |
| `CommitRow.test.ts` alone                     | 8.33 % (6/72)   | 10.92 % (13/119)  | 12.9 % (4/31)   | 11.81 % (13/110)  |
| `RefLabel.test.ts` alone                      | 1.38 % (1/72)   | 0.84 % (1/119)    | 0 % (0/31)      | 0.9 % (1/110)     |
| the four together                             | 68.05 % (49/72) | 80.67 % (96/119)  | 100 % (31/31)   | 84.54 % (93/110)  |
| whole project without the four                | 97.22 % (70/72) | 96.63 % (115/119) | 93.54 % (29/31) | 96.36 % (106/110) |
| whole project (the CI gate: functions ≥ 80 %) | 100 % (72/72)   | 100 % (119/119)   | 100 % (31/31)   | 100 % (110/110)   |

What only these files reach (all of it through `menus.test.ts`):

- two functions: the submit handler of the Cherry Pick / Revert form for a commit with fewer than
  two parents (§2.3 F, first two rows), and the one for a merge commit (§2.3 F, third and fourth
  rows);
- two branches: the merge-parent option label that includes a message (§2.3 E, the N3 row), and
  the rename submitted with the name the branch already has, which posts nothing (§2.3 F);
- the four statements inside those.

The 49 functions the four files reach, by role: the two source-key functions; the helpers that add
the ellipsis, group entries with separators, emphasise a name, build the current-branch phrase and
the explanation line, and recognise a remote's HEAD; the builders of the Compare, Focus and Copy
Branch Name entries; `commitMenu`, `refMenu`, `checkoutBranchAction` and the three per-type menu
builders; the click handlers of the commit menu's Add Tag, Create Branch, Checkout, Cherry Pick,
Revert, Merge, Reset and Copy Commit Hash entries; the click handlers of the local menu's Rename,
Delete and Merge entries, of the remote menu's Create Worktree and Fetch entries, of the tag menu's
Delete Tag and Copy Tag Name entries, and of Copy Branch Name; the openers of all eleven forms
(§2.3 D); the submit handlers of Add Tag, Reset, Rename and both Cherry Pick / Revert variants; and
the callback that builds the merge-parent options.

The 23 functions they do not reach: the click handlers of every Compare entry and every Focus
entry; of the commit menu's interactive rebase, fixup, bisect-good and bisect-bad entries; of the
local menu's Configure Upstream, Create Worktree, Push, Pull, Rebase and Checkout Branch entries; of
the remote menu's Rebase, Delete Remote Branch and Checkout Branch entries; of the tag menu's Push
Tag and Delete Remote Tag entries; and the submit handlers of Create Branch, Checkout (commit),
Merge (commit), Delete Branch, Merge (branch) and Delete Tag. Other test files in the project reach
all of them.

## 7. Gaps

Behaviour of the code these files drive that they do not check, and that the rewrite could check
with little more than the fixtures above. Where another test file in the project already checks
it, that file is named, so the maintainer can decide whether a second check here is worth having.
Expected values are observed at `c1c8e2f`, or given by [menus.md](menus.md) as noted.

### 7.1 `menus.tsx`

1. **The six submits these files never send** (6 of the 23 functions of §6.3). Observed messages,
   without the envelope of §2.3, for N, topic and tag. `menu-actions.test.ts` checks these partially;
   an exact check would also catch extra fields.

| Form and values submitted    | Message                                                                  |
| ---------------------------- | ------------------------------------------------------------------------ |
| Create Branch, `["feature"]` | `{ command: "createBranch", branchName: "feature", commitHash: H }`      |
| Checkout (commit), no values | `{ command: "checkoutCommit", commitHash: H }`                           |
| Merge (commit), `[false]`    | `{ command: "mergeCommit", commitHash: H, createNewCommit: false }`      |
| Delete Branch, `[true]`      | `{ command: "deleteBranch", branchName: "topic", forceDelete: true }`    |
| Merge (branch), `[true]`     | `{ command: "mergeBranch", branchName: "topic", createNewCommit: true }` |
| Delete Tag, no values        | `{ command: "deleteTag", tagName: "v1" }`                                |

2. **The inputs of the remaining forms**: Merge (commit and branch) → one checkbox labelled
   `dialogMergeNoFastForward`, initially `true`; Delete Branch → one checkbox labelled
   `dialogDeleteForceDelete`, initially `false`; Checkout (commit) and Delete Tag → no inputs.
3. **Where the tool entries lead, and with what** ([menus.md](menus.md) §6.2 item 15): Compare on N
   opens a content dialog titled `compareRevisions` comparing `HEAD` with H, and on a ref compares
   with the ref's hash; Focus on topic makes `topic` the selected branch and on remote
   `remotes/origin/topic`, with the branch display set to `focus` (observed); Create Worktree on
   topic and remote prefills the start point with `refs/heads/topic` and
   `refs/remotes/origin/topic` (observed; only a remote's HEAD is checked here); Rebase onto sends
   the full ref name; interactive rebase and fixup query with H; the bisect entries record H as
   good or bad. `branch-focus.test.ts` and `menu-actions.test.ts` check parts of this.
4. **The remote-flow entries' requests**: Push Branch on topic → `loadRemotes` with `branchName`
   `"topic"`; Pull Branch on main (checked out) → `"main"`; Delete Remote Branch, Fetch and
   Checkout Branch on remote, Push Tag and Delete Remote Tag on tag → `branchName` `null`.
   `remote-actions.test.ts` and `menu-actions.test.ts` check parts of this.
5. **The local menu's `checkoutBranch` entry** sends the same message as §2.3 G1.
6. **`checkoutBranchAction` on the checked-out branch** still sends the checkout (decision Q4 of
   [menus.md](menus.md) §8).
7. **The repository guard on a ref form**: open Rename or Delete Branch on topic, change the
   selected repository, submit → nothing posted, dialog store `null` (observed for both; only
   Create Branch is checked now).
8. **No entry throws** ([menus.md](menus.md) §5.7): with no repository selected, choosing every
   entry of every menu of §2.3 A returns normally. Observed over the seven kinds of menu (63
   entries): the copy entries still post their `clipboard.copy` requests (7 of them), the form
   entries still open their forms, and nothing else is posted. The copy requests stay unanswered,
   so each leaves the RPC client's 30 s deadline timer pending.
9. **The question each form shows**: none of these files renders a dialog's `message`. The
   emphasis (`<b><i>` around a short hash or name), the current-branch phrase and the explanation
   line are checked in English by `menu-text.test.ts` and `Dialog.test.ts`.

### 7.2 `actions/clipboard.ts`

10. **A successful copy** (answer `result: true`) leaves the dialog store as it was.
11. **A failed request** (answer `{ success: false, error: "denied" }`) opens the error dialog with
    `reason` `"denied"` (observed).
12. **The failure names what was copied.** With a stand-in whose `unableToCopyToClipboard` is a
    template holding `{0}` (observed with `Could not copy {0}`): the commit's copy entry reports
    `Could not copy typeCommitHash`, both branch entries `Could not copy typeBranchName`, the tag's
    `Could not copy typeTagName`.

`clipboard-outcomes.test.ts` checks 10, 11 and the placeholder rule of 12 by calling
`copyToClipboard` directly. `menu-text.test.ts` checks 12 in English through the entries of the
commit, remote-branch and tag menus, but not through the local branch's entry.

### 7.3 `CommitRow.tsx` and `RefLabel.tsx`

13. **The menu the row's button opens** has the 16 entries of the commit menu (§2.2), in order.
14. **A row without refs** has no refs region: the message `<span>` is the first `<span>` of the
    description (observed for commit B).
15. **The other cells of commit A**: author cell text `Author`, title `Author <author@example.com>`;
    hash cell text `abc12345`, title `abc123456789`.
16. **The label's other visible differences by `active`**: border class `border-graph` when active
    and `border-line` otherwise; title `main` alone when inactive, and `main`, a line break, then
    `tooltipCurrentBranch` when active (§5.2).

`CommitRowInteraction.test.ts` checks 15, the source and position of the menus opened by
right-click and by the button (not their entries), and the short hash in the button's label with a
`{0}` template; it does not check 13 or 14. `RefLabelDetails.test.ts` checks all of 16 (and the
bold name that `RefLabel.test.ts` checks), the tag glyph, the focus badge, double-click checkout
and the label's own menu.

## 8. Questions

Current behaviour is stated for each; nothing is decided here.

- **tests-m Q1. Where the DOM environment is chosen.** Each file opts into jsdom with its own
  environment comment; the `webview` project sets no environment. Should the rewritten files keep
  the per-file opt-in, or should the project set jsdom for all its files (a change to
  `vitest.config.ts`, outside these four files)?
- **tests-m Q2. The implicit check that loading the menus reads no string.** Today only
  `clipboard.test.ts` loads `menus.tsx` and the stores before installing the stand-in strings, and
  nothing says that this is a check ([menus.md](menus.md) §5.4 requires the property). Should the
  rewrite keep it implicit in that file, turn it into an explicit check, or leave it to other
  files?
- **tests-m Q3. Coverage the rewrite must provide.** The gate is measured over the whole project,
  which reaches 97.22 % of `menus.tsx`'s functions without these files. The four files alone reach
  68.05 %, below the gate. Only `menus.test.ts` reaches the two Cherry Pick / Revert submit
  handlers and the two branches of §6.3. Should the rewritten `menus.test.ts` be required to reach
  specific functions, or the gate on its own, or is the project-wide gate enough?
- **tests-m Q4. Remote-flow checks in the menu tests.** §2.3 G5 mostly checks
  `remote-actions.tsx` (the local name offered, the longest-remote rule, the fetch checkbox, the
  reuse of the `loadRemotes` request's id), by calling its reply handler directly. Should those
  checks stay in `menus.test.ts`, or move to the remote-actions tests and leave here only that
  `checkoutBranchAction` starts the flow with the full ref name?
- **tests-m Q5. Overlap in the clipboard tests.** Every test in `clipboard.test.ts` completes the
  refusal round trip, which `clipboard-outcomes.test.ts` also checks. The file's own contribution is
  which text each copy entry sends. Should the rewrite keep a full round trip per entry, keep one,
  or check only the requests?
- **tests-m Q6. Checking layout by class names.** The row check relies on the second cell, the
  order of `<span>`s and the classes `max-w-1/2` and `flex-1`; the label check relies on the first
  nested `<span>` and `font-bold` ([commit-view.md](commit-view.md) §0.4 lists these as selected
  on by these tests). Should the rewrite keep checking these classes and positions, or check the
  same behaviour through other means (tooltips, text, attributes)?
- **tests-m Q7. Drift in [menus.md](menus.md).** Its §6.2 item 9 has Checkout (commit) and Delete
  Tag confirm with `dialogYes`; the code and these tests use `checkout` and `deleteTag`. Its §5.6
  gives the file's function coverage as about 95 % with unreached functions; it is now 100 %. Its
  §1.3 lists `menus.test.ts` as using `commitMenu` and `checkoutBranchAction` only; it now uses all
  five function exports. This document follows the code. Should [menus.md](menus.md) be updated?
- **tests-m Q8. A file whose only check is made elsewhere.** `RefLabel.test.ts` checks one thing,
  that the checked-out branch's name is bold and another's is not, and `RefLabelDetails.test.ts`
  makes the same check together with the border class and the tooltip. Should the rewrite keep
  `RefLabel.test.ts` as specified in §5, widen it (for example with §7 item 16), or should the
  maintainer drop it?

---

## Decisions

These decisions are the maintainer's answers to the questions above; where they differ from the rest of this specification, they win. Every new test must be able to fail when the behaviour it names breaks.

- **Q1.** Keep the per-file jsdom opt-in, as the rest of the webview tests do.
- **Q2.** Make it explicit, once, in the new `menus.test.ts`: loading `menus.tsx` and the stores reads no string from `window.l10n`.
- **Q3.** The project-wide gate is enough, but the new `menus.test.ts` must still reach the functions that only these files reach today (the Cherry-pick and Revert submit handlers for fewer than two parents and for a merge, the parent label with a message, and a rename submitted with the branch's current name). Check with `pnpm run test:coverage` that `menus.tsx` stays at 100% of functions.
- **Q4.** Keep the remote checkout checks in `menus.test.ts`; they are driven through the menus.
- **Q5.** Keep one refusal round trip; for the other entries check only the requests.
- **Q6.** Check behaviour through text, roles and attributes where they show it. Use class names only where the class is itself the behaviour and nothing else shows it.
- **Q7.** Leave `menus.md` as it is; `ui-wording.md` records the changed confirm buttons, and earlier specifications stay as records.
- **Q8.** Delete `tests/webview/components/commit/RefLabel.test.ts`: `RefLabelDetails.test.ts` already checks everything it checks.
- **Gaps.** Add gaps 13 and 14 of §7.3 to the new `CommitRow.test.ts`: the row button's menu has the commit menu's entries in order, and a row without refs has no refs region.
