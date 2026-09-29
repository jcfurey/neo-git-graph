# Clean-room specification: the webview utility tests and the shared webview test modules

This document specifies seven files under `tests/webview/` that still hold lines inherited from the
upstream projects. Each is deleted and written again, at the same path, by someone who never sees
the current file or its history. What must survive is what the files check (for the five test
files) and what they offer other tests (for the two shared modules), not how they are written. See
[provenance.md](../provenance.md): inherited tests are replaced the same way as inherited code,
with the behaviour they check as the specification.

The test sections describe checks as scenarios, inputs and expected outcomes. They do not follow the
current files' order or grouping, and the numbering of checks (C1, C2, …) is this document's own.
The two shared modules are an interface other tests import, so their export names and types are
stated exactly.

---

## 0. How the observations were made

- Worktree at commit `c1c8e2f` of `main`. Node v22.22.2, Vitest 4.1.11, jsdom 30.0.1.
- Each file was run on its own and together with the others, with
  `pnpm exec vitest run --project webview <files>`. All 90 tests passed.
- The shared modules were probed with throw-away Vitest files and configurations under `/tmp`,
  using the repository's aliases and setup file. To see which other tests depend on which property
  of the shared modules, the whole `webview` project was run against altered copies of them,
  substituted through a module alias (§2.4). The scratch files have been deleted.
- Coverage was measured with the V8 provider, limited to the product files these tests load (§8).

---

## 1. Scope and rules

### 1.1 The files

| File                                       | What it tests (product modules under `src/webview/`)                                                           | Tests now | Environment | Inherited lines (`scripts/provenance-baseline.json`) |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------- | --------- | ----------- | ---------------------------------------------------- |
| `tests/webview/utils/columns.test.ts`      | `utils/columns.ts`                                                                                             | 41        | node        | 51                                                   |
| `tests/webview/lib/rpc-client.test.ts`     | `lib/rpc/rpc-client.ts`, reaching `lib/rpc/rpc-handler.ts`, `lib/shell-text.ts` and `lib/vscode.ts`            | 20        | jsdom       | 8                                                    |
| `tests/webview/utils/ref.test.ts`          | `utils/ref.ts`                                                                                                 | 20        | node        | 27                                                   |
| `tests/webview/utils/format.test.ts`       | `utils/format.ts`                                                                                              | 6         | node        | 18                                                   |
| `tests/webview/lib/webview-config.test.ts` | `lib/webview-config.ts`, reaching `applyWebviewConfig` in `lib/actions.ts` and `maxCommits` in `lib/stores.ts` | 3         | node        | 15                                                   |
| `tests/webview/test-utils.ts`              | Shared helper module, imported by 69 other files (§2.3)                                                        | none      | (either)    | 17                                                   |
| `tests/webview/setup.ts`                   | The `webview` project's setup file, also imported by 40 other files (§2.3)                                     | none      | (either)    | 6                                                    |

"Tests now" counts the test cases Vitest reports, with each row of a parameterized table counted
once. The rewrite need not keep these counts or any test names; it must keep every check listed in
§3 to §7 (a check may be split or merged), and it may add the ones listed in §9.

### 1.2 Rewriting whole files

- Each file is deleted and written anew at the same path. The paths matter: the five test files
  must keep the `.test.ts` suffix under `tests/webview/` to be collected; `tests/webview/setup.ts`
  is named in `vitest.config.ts`; and other tests import the two shared modules as
  `@tests/webview/setup` and `@tests/webview/test-utils`.
- The two shared modules must keep the interface in §2 exactly: the 76 other files that import them
  are not being rewritten, and every one of them must still pass unchanged.
- After the rewrite, `pnpm run provenance --update` lowers the seven baseline entries. A line of the
  new files that matches an upstream line only because the interface or the product fixes it (for
  example a field of the shared configuration in §2.2, or an error message the product throws) is
  reviewed and listed in `scripts/provenance-reviewed.json`, as [provenance.md](../provenance.md)
  describes. See questions tests-u Q1 and Q2.

### 1.3 How the files are run

- `pnpm run test` runs the Vitest projects `backend`, `extension` and `webview` one after another;
  `pnpm exec vitest run --project webview <files>` runs chosen files. The files are also type-checked
  by `pnpm run typecheck` (§1.4).
- The `webview` project in `vitest.config.ts`:
  - collects `tests/webview/**/*.test.ts`, so `setup.ts` and `test-utils.ts` are never collected as
    tests;
  - has one setup file, `tests/webview/setup.ts` (`setupFiles`), which Vitest evaluates in every test
    file's module graph before the test file's own imports (§2.1);
  - resolves `@/…` to `src/…` and `@tests/…` to `tests/…`;
  - sets no `environment`, so a file runs in Vitest's default `node` environment unless its first
    line is the docblock comment `// @vitest-environment jsdom`. Of the five test files only
    `rpc-client.test.ts` carries it; it needs `window`, `document`, `MessageEvent` and `ErrorEvent`.
    The other four run without a DOM and must keep working without one (`webview-config.test.ts`
    loads the actions and stores modules, which load fine without a DOM);
  - sets no timeouts, so Vitest's defaults apply (5 s per test, 10 s per hook). The slowest check in
    the group, which loads the actions module afresh, takes about 1 s;
  - sets no `globals`, so `describe`, `it`, `expect`, `vi` and the hooks are imported from `vitest`;
  - sets none of `clearMocks`, `mockReset`, `restoreMocks` or `unstubGlobals`. Nothing resets the
    shared mocks, fake timers or globals between tests of one file; each test file starts with a
    fresh module graph (Vitest's default isolation), so mocks start fresh per file.
- Coverage: the root `coverage` block uses the V8 provider, `include: ["src/webview/lib/menus.tsx"]`,
  the `text` reporter, and one threshold (80 % of functions in `src/webview/lib/menus.tsx`).
  `pnpm run test:coverage` (`vitest run --project webview --coverage`) runs it, in CI on Linux only.
  None of the seven files is named in it and none of them loads `menus.tsx` (§8), so the threshold
  depends on other tests. Running only these files with `--coverage` and the repository's settings
  reports `menus.tsx` as uncovered and fails that threshold; that is expected, not a regression.
- Nothing else in `vitest.config.ts`, `package.json` or the CI workflow treats these files
  specially.

### 1.4 Type-checking, lint and format

- `pnpm run typecheck` includes `tsc -p tests/webview`. `tests/webview/tsconfig.json` extends
  `src/webview/tsconfig.json` (strict mode, `noUncheckedIndexedAccess`,
  `exactOptionalPropertyTypes`, `noUnusedLocals`, `noUnusedParameters`, `verbatimModuleSyntax`,
  libraries `esnext` and `dom`, JSX from `preact`) and includes every `.ts` file under
  `tests/webview` plus `src/webview/global.d.ts`. That declaration file makes the global function
  `acquireVsCodeApi` and the property `Window.l10n` (typed `LocalizedStrings`) visible without an
  import, so test code may name both directly.
- `pnpm run lint` (oxlint) applies to test files: imports are ordered builtin, external, then
  `@/…`, then `@tests/…`, alphabetized, with a blank line between groups; unused variables are
  errors unless their names start with `_`.
- `pnpm run format` (oxfmt) checks a 100-column width, two-space indent and no trailing commas.

### 1.5 Example values that sit on inherited lines

The concrete inputs below are given because the current assertions use them, but in these checks
they come from lines that `pnpm run provenance --lines` reports as inherited. Most of the checks
would test the same rule with other values. Whether the rewrite keeps these values, and then lists
the matching lines as reviewed coincidences, or picks new values of the same kind, is question
tests-u Q2. Every other value in this document comes from lines written for Branchwise.

| File                     | Checks whose example values are inherited                                                                                                       |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `columns.test.ts`        | The fixtures W and D; C2; the three-width input of C5; the `0` and `NaN` inputs of C6; C8; C12, C13, C15, C16, C23, C26, C27, C31, C43 and C65. |
| `rpc-client.test.ts`     | R7 (the call `request("clipboard.copy", "commit")` and running all timers; the German text is Branchwise's).                                    |
| `ref.test.ts`            | All of F1 to F20.                                                                                                                               |
| `format.test.ts`         | All of T1 to T6.                                                                                                                                |
| `webview-config.test.ts` | The initial settings fixture and W1.                                                                                                            |
| `test-utils.ts`          | The eight configuration values, and the `window.l10n` proxy (§2.2); these are interface, not examples (tests-u Q1).                             |
| `setup.ts`               | The `vscodeApi` object and the global's definition (§2.1); interface (tests-u Q1).                                                              |

---

## 2. The shared modules

### 2.1 `tests/webview/setup.ts`

**Role.** It is the `webview` project's only setup file, and also a module that tests import to reach
the mock it installs. Vitest evaluates it once per test file, before the file's imports, in the same
module graph; a later `import { vscodeApi } from "@tests/webview/setup"` in that file returns the
same module instance (observed: the imported `vscodeApi` is the object the global function returns).
It must work in both the `node` and `jsdom` environments, so it touches only `globalThis`.

**Exports.** Exactly one named export, and no default export:

| Export      | Type and value                                                                                                                                                                                                                                                                                                                                                            |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `vscodeApi` | A plain object with exactly three own properties, in this order: `getState`, `setState`, `postMessage`. Each is a Vitest mock function (`vi.fn`). `getState` is typed `Mock<() => unknown>` and by default returns `undefined`. `setState` and `postMessage` are untyped `vi.fn()` mocks (parameters and result `any`), and by default do nothing and return `undefined`. |

The loose types are part of the interface: other tests give `postMessage` implementations whose
parameter is typed as a particular message (`(message: RpcRequest) => …`,
`(message: { command?: string }) => …`) and give `getState` return values of any shape. A
stricter type would break their compilation.

**Global side effect at load.** It defines an own property `acquireVsCodeApi` on `globalThis` with
`Object.defineProperty`, with these attributes:

| Attribute      | Value                                                                                                                         |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `value`        | A Vitest mock function (`vi.isMockFunction` is true) whose implementation returns `vscodeApi`, the same object on every call. |
| `configurable` | `true` (required: `tests/webview/lib/vscode-api.test.ts` replaces the property and puts it back).                             |
| `writable`     | `false`                                                                                                                       |
| `enumerable`   | `false`                                                                                                                       |

It does not call `acquireVsCodeApi` itself (observed: zero recorded calls at the start of a test
file that has imported only the setup module). The product module `src/webview/lib/vscode.ts` calls
it once each time that module is loaded, so the call count a test sees equals the number of fresh
loads of `lib/vscode.ts` in its file.

**What it does not do.** It does not define `window.l10n`, set any `data-*` attribute on the
document, install fake timers, register hooks (`beforeEach`, `afterEach`, …), or clear or reset any
mock. Recorded calls of the three mocks accumulate across all tests of a file until a test clears
them, and some files depend on that (§2.4).

**After `vi.resetModules()`.** If a test resets the module registry and then imports
`@tests/webview/setup` again (directly, or through `test-utils.ts`), the module is evaluated again:
a new `vscodeApi` object is created and a new global function returning it replaces the old one
(observed). Modules loaded before the reset keep the old object. No current test relies on this
either way; see tests-u Q3.

### 2.2 `tests/webview/test-utils.ts`

**Exports.** Exactly two named functions, and no default export or types:

| Export               | Signature                                                                                                        |
| -------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `latestGraphRequest` | `latestGraphRequest<K extends GraphQueryCommand>(command: K): Extract<QueryRequest, { command: K }>`             |
| `setupWebviewTest`   | `setupWebviewTest(options?: { dispatchMessages?: boolean }): void`, where `dispatchMessages` defaults to `false` |

`GraphQueryCommand` (`"loadBranches" | "loadCommits" | "commitDetails"`) and `QueryRequest` come
from `@/backend/types`. The narrowed return type matters: callers read command-specific fields such
as `requestId`, `repo` and the commit hash of the request without casts.

**`latestGraphRequest(command)`**

- Looks at the first argument of every call recorded on `vscodeApi.postMessage` (the mock from
  §2.1), from the oldest to the newest, and returns the **last** one whose `command` property equals
  `command`. The returned value is the very object that was posted (identity, not a copy).
- Posted values without that `command` (RPC requests, which carry `kind` and no `command`, and other
  legacy commands) are skipped.
- When no recorded call matches, including right after the mock was cleared, it throws an `Error`
  whose message is `No <command> request was sent`, for example `No loadCommits request was sent`.
- It only reads: it neither clears the mock nor changes any state.
- (Observed, relied on by no test: a recorded call made with no argument makes it throw a
  `TypeError`, because it reads `command` of `undefined`.)

**`setupWebviewTest(options)`** does three things, in this order, and returns `undefined`:

1. Calls `initializeWebviewConfig` (`@/webview/lib/webview-config`) with one configuration object.
   The object is created once, when the module loads, and is the same object on every call. It is
   not frozen: other tests change its fields in place (§2.3). Its fields, exactly:

   | Field                         | Value                               |
   | ----------------------------- | ----------------------------------- |
   | `autoCenterCommitDetailsView` | `true`                              |
   | `dateFormat`                  | `"Date & Time"`                     |
   | `graphColours`                | `[]` (a new, unfrozen, empty array) |
   | `graphStyle`                  | `"rounded"`                         |
   | `initialLoadCommits`          | `300`                               |
   | `loadMoreCommits`             | `100`                               |
   | `locale`                      | `"en"`                              |
   | `showCurrentBranchByDefault`  | `false`                             |

   Because the product accepts a configuration only once per module graph, a second call in the
   same file throws `Error("Webview configuration is already initialized")` from this step, before
   step 2 runs (observed: `window.l10n` is left as it was). Every caller therefore calls it once per
   file, at the top level or in `beforeAll`.

2. Defines `window.l10n` with `Object.defineProperty`: `configurable: true` (required: many tests
   redefine it afterwards, §2.3), not writable, not enumerable. The value is a `Proxy` over an empty
   object whose only trap is `get`, which answers every property key with the key converted to a
   string. So `window.l10n.repo` is `"repo"`, an unknown key reads as its own name, and a symbol key
   reads as, for example, `"Symbol(Symbol.iterator)"`. Having no other traps, the `in` operator
   finds no key on it, `Object.keys(window.l10n)` is `[]`, and `JSON.stringify(window.l10n)` is
   `"{}"`. The value is typed as `LocalizedStrings` (`@/old-extension/l10n/webviewL10n`). This step
   needs a `window`, so only files in the `jsdom` environment call the function.

3. Only when `dispatchMessages` is `true`: calls `rpcClient.init()` (`@/webview/lib/rpc/rpc-client`)
   and then `initDispatcher()` (`@/webview/lib/dispatcher`). Together they add two `message`
   listeners to `window` the first time in a module graph; both are idempotent, so later calls add
   none (observed). With the default, neither is called and no listener is added.

**Loading the module.** It imports, at load time, `@/webview/lib/dispatcher`,
`@/webview/lib/rpc/rpc-client`, `@/webview/lib/webview-config` and `@tests/webview/setup`, plus
type-only imports. Loading the dispatcher loads much of the page's logic (actions, stores, response
handlers). Observed in a fresh `jsdom` file, importing `test-utils.ts` records one call of
`acquireVsCodeApi` (from `lib/vscode.ts`) and one of `vscodeApi.getState` (the stores reading the
saved state), no `setState` or `postMessage` calls, and adds no window listener. These effects come
from the product modules, not from the helper itself; see tests-u Q4.

### 2.3 Who relies on what

Every file of the `webview` project that loads `src/webview/lib/vscode.ts`, directly or through any
store, action or component, relies on the global `acquireVsCodeApi` from §2.1, whether or not it
imports `setup.ts`. In addition:

- `tests/webview/lib/vscode-api.test.ts` reads the property descriptor of
  `globalThis.acquireVsCodeApi`, replaces it with its own, and restores the saved descriptor after
  each test. It needs the property to be an own, configurable property.
- `tests/webview/globals.test.ts` uses only the declared type of `acquireVsCodeApi`.
- These files redefine `window.l10n` after `setupWebviewTest()` (or after another helper that
  does), so they need it configurable: `components/ui/Dialog.behaviour.test.ts`,
  `components/ui/Dropdown.test.ts`, `components/ui/DialogRefNames.test.ts`, `components/history/ListEditors.test.ts`,
  `components/repository/RefsPane.test.ts`, `components/repository/RemoteManager.test.ts`,
  `components/commit/FileTreeView.test.ts`, `components/commit/BranchFocusBadge.test.ts`,
  `lib/actions/clipboard-outcomes.test.ts`, `lib/handler/action-result.test.ts`,
  `lib/menu-text.test.ts`, `pages/NoRepoPage.test.ts`, and the helpers
  `components/commit/commit-view-fixtures.ts` and `components/commit/graph-view-harness.ts` (all
  paths under `tests/webview/`).
- `tests/webview/utils/date.test.ts` and `tests/webview/utils/date-time-zone.test.ts` change
  fields of the configuration object in place (`Object.assign(getWebviewConfig(), …)`), so the object from
  step 1 of §2.2 must not be frozen. `graph/palette.test.ts`, `lib/actions.test.ts`,
  `lib/rpc-handler.test.ts` and `components/commit/commit-view-fixtures.ts` read it through
  `getWebviewConfig()` and compare or copy it.

The files that import the shared modules, and what each uses. Paths are under `tests/webview/`.
"Mock API used" lists the parts of the `vscodeApi` mocks the file touches by name: a bare member
means it is called or passed to `expect`, `.mock` means its recorded calls are read, and the other
suffixes are the Vitest mock methods called on it. Every file listed runs in `jsdom`; the two
`*-harness.ts` modules are helpers imported by `jsdom` tests.

| File                                             | Imports                                               | `setupWebviewTest`       | `latestGraphRequest` commands                                        | Mock API used                                                                                                                                                                                                |
| ------------------------------------------------ | ----------------------------------------------------- | ------------------------ | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `App.test.ts`                                    | `setupWebviewTest`                                    | default                  |                                                                      |                                                                                                                                                                                                              |
| `AppIsolation.test.ts`                           | `setupWebviewTest`                                    | default                  |                                                                      |                                                                                                                                                                                                              |
| `components/commit/BranchFocusBadge.test.ts`     | `setupWebviewTest`                                    | default                  |                                                                      |                                                                                                                                                                                                              |
| `components/commit/ColumnResize.test.ts`         | `vscodeApi`, `setupWebviewTest`                       | default                  |                                                                      | `postMessage.mock`, `postMessage.mockClear`                                                                                                                                                                  |
| `components/commit/CommitDetails.test.ts`        | `setupWebviewTest`                                    | default                  |                                                                      |                                                                                                                                                                                                              |
| `components/commit/CommitGraph.test.ts`          | `setupWebviewTest`                                    | default                  |                                                                      |                                                                                                                                                                                                              |
| `components/commit/CommitRow.test.ts`            | `setupWebviewTest`                                    | default                  |                                                                      |                                                                                                                                                                                                              |
| `components/commit/CommitRowInteraction.test.ts` | `setupWebviewTest`                                    | default                  |                                                                      |                                                                                                                                                                                                              |
| `components/commit/CommitTable.test.ts`          | `setupWebviewTest`                                    | default                  |                                                                      |                                                                                                                                                                                                              |
| `components/commit/CommitViewRenders.test.ts`    | `setupWebviewTest`                                    | default                  |                                                                      |                                                                                                                                                                                                              |
| `components/commit/FileTree.test.ts`             | `setupWebviewTest`                                    | default                  |                                                                      |                                                                                                                                                                                                              |
| `components/commit/FileTreeView.test.ts`         | `vscodeApi`, `latestGraphRequest`, `setupWebviewTest` | default                  | `commitDetails`                                                      | `postMessage`, `postMessage.mock`, `postMessage.mockClear`                                                                                                                                                   |
| `components/commit/GraphErrors.test.ts`          | `latestGraphRequest`, `setupWebviewTest`              | default                  | `loadCommits`, `loadBranches`, a variable (`query`), `commitDetails` |                                                                                                                                                                                                              |
| `components/commit/GraphScroll.test.ts`          | `setupWebviewTest`                                    | default                  |                                                                      |                                                                                                                                                                                                              |
| `components/commit/GraphViewControls.test.ts`    | `vscodeApi`, `latestGraphRequest`, `setupWebviewTest` | default                  | `loadCommits`                                                        | `getState.mockReturnValueOnce`, `postMessage`, `postMessage.mockClear`, `setState`                                                                                                                           |
| `components/commit/GraphViewFocus.test.ts`       | `setupWebviewTest`                                    | default                  |                                                                      |                                                                                                                                                                                                              |
| `components/commit/GraphViewHistory.test.ts`     | `setupWebviewTest`                                    | default                  |                                                                      |                                                                                                                                                                                                              |
| `components/commit/RefLabel.test.ts`             | `setupWebviewTest`                                    | default                  |                                                                      |                                                                                                                                                                                                              |
| `components/commit/RefLabelDetails.test.ts`      | `vscodeApi`, `setupWebviewTest`                       | default                  |                                                                      | `postMessage`, `postMessage.mock`, `postMessage.mockClear`                                                                                                                                                   |
| `components/commit/TableGeometry.test.ts`        | `setupWebviewTest`                                    | default                  |                                                                      |                                                                                                                                                                                                              |
| `components/commit/WorkingTreeDetails.test.ts`   | `vscodeApi`, `setupWebviewTest`                       | default                  |                                                                      | `postMessage`, `postMessage.mock`, `postMessage.mockClear`                                                                                                                                                   |
| `components/commit/WorkingTreeTiming.test.ts`    | `vscodeApi`, `setupWebviewTest`                       | default                  |                                                                      | `postMessage.mock`                                                                                                                                                                                           |
| `components/commit/graph-view-harness.ts`        | `vscodeApi`                                           |                          |                                                                      | `postMessage.mock`                                                                                                                                                                                           |
| `components/history/ListEditors.test.ts`         | `setupWebviewTest`                                    | default                  |                                                                      |                                                                                                                                                                                                              |
| `components/history/SearchBar.test.ts`           | `setupWebviewTest`                                    | default                  |                                                                      |                                                                                                                                                                                                              |
| `components/repository/RefsPane.test.ts`         | `setupWebviewTest`                                    | default                  |                                                                      |                                                                                                                                                                                                              |
| `components/repository/RefsScale.test.ts`        | `setupWebviewTest`                                    | default                  |                                                                      |                                                                                                                                                                                                              |
| `components/repository/RefsTiming.test.ts`       | `setupWebviewTest`                                    | default                  |                                                                      |                                                                                                                                                                                                              |
| `components/repository/RemoteManager.test.ts`    | `vscodeApi`, `setupWebviewTest`                       | default                  |                                                                      | `postMessage.mock`, `postMessage.mockClear`                                                                                                                                                                  |
| `components/ui/ContextMenu.test.ts`              | `setupWebviewTest`                                    | default                  |                                                                      |                                                                                                                                                                                                              |
| `components/ui/Dialog.behaviour.test.ts`         | `setupWebviewTest`                                    | default                  |                                                                      |                                                                                                                                                                                                              |
| `components/ui/Dialog.test.ts`                   | `setupWebviewTest`                                    | default                  |                                                                      |                                                                                                                                                                                                              |
| `components/ui/DialogRefNames.test.ts`           | `setupWebviewTest`                                    | default                  |                                                                      |                                                                                                                                                                                                              |
| `components/ui/Dropdown.test.ts`                 | `setupWebviewTest`                                    | default                  |                                                                      |                                                                                                                                                                                                              |
| `graph/palette.test.ts`                          | `setupWebviewTest`                                    | default                  |                                                                      |                                                                                                                                                                                                              |
| `layout/MainHeader.test.ts`                      | `vscodeApi`, `setupWebviewTest`                       | default                  |                                                                      | `postMessage`, `postMessage.mock`, `postMessage.mockClear`, `setState.mock`                                                                                                                                  |
| `layout/MainHeaderMenu.test.ts`                  | `vscodeApi`, `setupWebviewTest`                       | default                  |                                                                      | `postMessage`, `postMessage.mock`                                                                                                                                                                            |
| `lib/actions.test.ts`                            | `vscodeApi`, `setupWebviewTest`                       | default                  |                                                                      | `postMessage.mock`                                                                                                                                                                                           |
| `lib/actions/clipboard-outcomes.test.ts`         | `vscodeApi`, `setupWebviewTest`                       | default                  |                                                                      | `postMessage.mock`, `postMessage.mockClear`                                                                                                                                                                  |
| `lib/actions/clipboard.test.ts`                  | `vscodeApi`, `setupWebviewTest`                       | `dispatchMessages: true` |                                                                      | `postMessage`, `postMessage.mock`, `postMessage.mockClear`                                                                                                                                                   |
| `lib/branch-focus.test.ts`                       | `vscodeApi`, `latestGraphRequest`, `setupWebviewTest` | default                  | `loadCommits`, `loadBranches`                                        | `postMessage`, `postMessage.mock`                                                                                                                                                                            |
| `lib/cancel-action.test.ts`                      | `vscodeApi`, `setupWebviewTest`                       | default                  |                                                                      | `postMessage`, `postMessage.mockClear`                                                                                                                                                                       |
| `lib/config-changed.test.ts`                     | `vscodeApi`, `latestGraphRequest`, `setupWebviewTest` | default                  | `loadCommits`, `loadBranches`                                        | `postMessage.mockClear`                                                                                                                                                                                      |
| `lib/dispatcher.test.ts`                         | `vscodeApi`, `setupWebviewTest`                       | default                  |                                                                      | `postMessage`, `postMessage.mock`, `postMessage.mockClear`                                                                                                                                                   |
| `lib/graph-requests.test.ts`                     | `latestGraphRequest`, `setupWebviewTest`              | default                  | `loadCommits`, `loadBranches`, `commitDetails`                       |                                                                                                                                                                                                              |
| `lib/handler/action-result.test.ts`              | `vscodeApi`, `setupWebviewTest`                       | default                  |                                                                      | `postMessage`, `postMessage.mock`, `postMessage.mockClear`                                                                                                                                                   |
| `lib/handler/commit-details.test.ts`             | `latestGraphRequest`, `setupWebviewTest`              | default                  | `commitDetails`                                                      |                                                                                                                                                                                                              |
| `lib/handler/load-branches.test.ts`              | `vscodeApi`, `latestGraphRequest`                     |                          | `loadBranches`                                                       | `postMessage`, `postMessage.mock`, `postMessage.mockClear`                                                                                                                                                   |
| `lib/handler/load-commits.test.ts`               | `latestGraphRequest`, `setupWebviewTest`              | default                  | `loadCommits`, `commitDetails`                                       |                                                                                                                                                                                                              |
| `lib/handler/refresh.test.ts`                    | `vscodeApi`, `setupWebviewTest`                       | default                  |                                                                      | `postMessage`, `postMessage.mock`, `postMessage.mockClear`                                                                                                                                                   |
| `lib/handler/view-diff.test.ts`                  | `vscodeApi`, `setupWebviewTest`                       | default                  |                                                                      | `postMessage`, `postMessage.mockClear`                                                                                                                                                                       |
| `lib/hints.test.ts`                              | `vscodeApi`, `setupWebviewTest`                       | default                  |                                                                      | `setState`                                                                                                                                                                                                   |
| `lib/history-tools.test.ts`                      | `vscodeApi`, `setupWebviewTest`                       | default                  |                                                                      | `postMessage`, `postMessage.mock`, `postMessage.mockClear`, `setState`                                                                                                                                       |
| `lib/menu-actions.test.ts`                       | `vscodeApi`, `setupWebviewTest`                       | default                  |                                                                      | `postMessage`, `postMessage.mock`, `postMessage.mockClear`                                                                                                                                                   |
| `lib/menu-anchor.test.ts`                        | `setupWebviewTest`                                    | default                  |                                                                      |                                                                                                                                                                                                              |
| `lib/menu-text.test.ts`                          | `vscodeApi`, `setupWebviewTest`                       | `dispatchMessages: true` |                                                                      | `postMessage.mock`, `postMessage.mockClear`                                                                                                                                                                  |
| `lib/menus.test.ts`                              | `vscodeApi`, `setupWebviewTest`                       | default                  |                                                                      | `postMessage`, `postMessage.mock`, `postMessage.mockClear`                                                                                                                                                   |
| `lib/preference-lifetime.test.ts`                | `vscodeApi`                                           |                          |                                                                      | `getState.mockImplementation`, `getState.mockReturnValue`, `postMessage`, `postMessage.mock`, `postMessage.mockClear`, `postMessage.mockImplementation`, `setState.mockImplementation`, `setState.mockReset` |
| `lib/remote-visibility.test.ts`                  | `vscodeApi`, `latestGraphRequest`, `setupWebviewTest` | default                  | `loadCommits`, `loadBranches`                                        | `postMessage`, `postMessage.mock`                                                                                                                                                                            |
| `lib/repo-selection.test.ts`                     | `vscodeApi`                                           |                          |                                                                      | `postMessage`, `postMessage.mockClear`                                                                                                                                                                       |
| `lib/repository-actions.test.ts`                 | `setupWebviewTest`                                    | default                  |                                                                      |                                                                                                                                                                                                              |
| `lib/repository-queries.test.ts`                 | `vscodeApi`, `setupWebviewTest`                       | default                  |                                                                      | `postMessage.mock`, `postMessage.mockClear`                                                                                                                                                                  |
| `lib/rpc-client-state.test.ts`                   | `vscodeApi`                                           |                          |                                                                      | `postMessage`, `postMessage.mock`, `postMessage.mockImplementation`, `postMessage.mockImplementationOnce`, `postMessage.mockReset`                                                                           |
| `lib/rpc-handler-client.test.ts`                 | `vscodeApi`, `setupWebviewTest`                       | default                  |                                                                      | `postMessage`, `postMessage.mock`, `postMessage.mockClear`                                                                                                                                                   |
| `lib/rpc-handler.test.ts`                        | `vscodeApi`, `setupWebviewTest`                       | default                  |                                                                      | `postMessage`, `postMessage.mock`, `postMessage.mockClear`, `postMessage.mockImplementationOnce`, `setState`, `setState.mockClear`                                                                           |
| `lib/search-row.test.ts`                         | `vscodeApi`, `setupWebviewTest`                       | default                  |                                                                      | `setState`                                                                                                                                                                                                   |
| `lib/stores/repo-list.store.test.ts`             | `vscodeApi`                                           |                          |                                                                      | `postMessage`, `postMessage.mock`, `postMessage.mockClear`                                                                                                                                                   |
| `lib/uncorrelated-replies.test.ts`               | `vscodeApi`, `latestGraphRequest`, `setupWebviewTest` | default                  | `loadBranches`                                                       | `postMessage.mock`                                                                                                                                                                                           |
| `lib/unseen-failures.test.ts`                    | `vscodeApi`, `setupWebviewTest`                       | default                  |                                                                      | `postMessage.mockClear`                                                                                                                                                                                      |
| `lib/workflows.test.ts`                          | `vscodeApi`, `setupWebviewTest`                       | default                  |                                                                      | `postMessage.mock`, `postMessage.mockClear`                                                                                                                                                                  |
| `main/late-selection.test.ts`                    | `vscodeApi`                                           |                          |                                                                      | `postMessage.getMockImplementation`, `postMessage.mockImplementation`                                                                                                                                        |
| `main/page-harness.ts`                           | `vscodeApi`                                           |                          |                                                                      | `postMessage.mock`, `postMessage.mockImplementation`                                                                                                                                                         |
| `pages/NoCommitsPage.test.ts`                    | `setupWebviewTest`                                    | default                  |                                                                      |                                                                                                                                                                                                              |
| `pages/NoRepoPage.test.ts`                       | `setupWebviewTest`                                    | default                  |                                                                      |                                                                                                                                                                                                              |
| `utils/date-time-zone.test.ts`                   | `setupWebviewTest`                                    | default                  |                                                                      |                                                                                                                                                                                                              |
| `utils/date.test.ts`                             | `latestGraphRequest`, `setupWebviewTest`              | default                  | `loadCommits`                                                        |                                                                                                                                                                                                              |

### 2.4 Which properties the other tests depend on

To find out which properties of the shared modules the other tests actually depend on, the whole
`webview` project (115 files, 1846 tests, two of them skipped) was run with each module replaced by
a copy altered in one way. An unaltered copy, substituted the same way, passed every test. Paths
below are under `tests/webview/`; the number after a file is how many of its tests failed, and
"setup fails" means its `beforeAll` hook threw, so none of its tests ran.

| Alteration                                                                                                               | Failing tests | Files that fail                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------------ | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `initialLoadCommits` 301 instead of 300                                                                                  | 5             | `lib/actions.test.ts` (5)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `loadMoreCommits` 101 instead of 100                                                                                     | 3             | `components/commit/GraphViewControls.test.ts` (1), `lib/actions.test.ts` (1), `lib/graph-requests.test.ts` (1)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `locale` `"fr"` instead of `"en"`                                                                                        | 3             | `components/commit/CommitDetails.test.ts` (1), `components/commit/CommitRowInteraction.test.ts` (1), `utils/date-time-zone.test.ts` (1)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `dateFormat` `"Date Only"` instead of `"Date & Time"`                                                                    | 3             | `components/commit/CommitRowInteraction.test.ts` (1), `lib/config-changed.test.ts` (1), `utils/date-time-zone.test.ts` (1)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `graphColours` `["#123456"]` instead of `[]`                                                                             | 4             | `components/commit/CommitTable.test.ts` (4)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `graphStyle` `"angular"` instead of `"rounded"`                                                                          | 1             | `components/commit/CommitGraph.test.ts` (1)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `autoCenterCommitDetailsView` `false` instead of `true`                                                                  | 1             | `components/commit/CommitDetails.test.ts` (1)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `showCurrentBranchByDefault` `true` instead of `false`                                                                   | 0             | none                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| The configuration frozen before it is passed on                                                                          | 126           | `utils/date-time-zone.test.ts` (3), `utils/date.test.ts` (123)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| A fresh copy of the configuration passed on each call, instead of one object                                             | 0             | none                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| The proxy answers `<key>` instead of the key's name                                                                      | 239           | 36 files: `App.test.ts` (2), `AppIsolation.test.ts` (1), `components/commit/CommitRow.test.ts` (1), `components/commit/FileTreeView.test.ts` (5), `components/commit/GraphErrors.test.ts` (1), `components/commit/GraphScroll.test.ts` (1), `components/commit/GraphViewControls.test.ts` (8), `components/commit/GraphViewFocus.test.ts` (7), `components/commit/GraphViewHistory.test.ts` (7), `components/commit/WorkingTreeDetails.test.ts` (6), `components/history/ListEditors.test.ts` (2), `components/repository/RefsPane.test.ts` (1), `components/repository/RefsScale.test.ts` (2), `components/repository/RemoteManager.test.ts` (17), `components/ui/Dialog.test.ts` (6), `components/ui/Dropdown.test.ts` (2), `layout/MainHeader.test.ts` (22), `layout/MainHeaderMenu.test.ts` (18), `lib/actions/clipboard.test.ts` (4), `lib/branch-focus.test.ts` (2), `lib/cancel-action.test.ts` (5), `lib/dispatcher.test.ts` (1), `lib/graph-requests.test.ts` (1), `lib/handler/action-result.test.ts` (18), `lib/handler/commit-details.test.ts` (2), `lib/handler/view-diff.test.ts` (1), `lib/history-tools.test.ts` (5), `lib/menu-actions.test.ts` (21), `lib/menus.test.ts` (43), `lib/repository-actions.test.ts` (10), `lib/repository-queries.test.ts` (3), `lib/uncorrelated-replies.test.ts` (1), `lib/unseen-failures.test.ts` (1), `lib/workflows.test.ts` (3), `pages/NoCommitsPage.test.ts` (1), `utils/date.test.ts` (8) |
| `window.l10n` defined with `configurable: false`                                                                         | 212           | 20 files: `components/commit/BranchFocusBadge.test.ts` (setup fails), `components/commit/CommitDetails.test.ts` (16), `components/commit/CommitRowInteraction.test.ts` (27), `components/commit/CommitTable.test.ts` (14), `components/commit/CommitViewRenders.test.ts` (3), `components/commit/FileTreeView.test.ts` (33), `components/commit/GraphViewControls.test.ts` (9), `components/commit/GraphViewFocus.test.ts` (4), `components/commit/GraphViewHistory.test.ts` (8), `components/commit/RefLabelDetails.test.ts` (16), `components/history/ListEditors.test.ts` (setup fails), `components/repository/RefsPane.test.ts` (setup fails), `components/repository/RemoteManager.test.ts` (1), `components/ui/Dialog.behaviour.test.ts` (62), `components/ui/DialogRefNames.test.ts` (setup fails), `components/ui/Dropdown.test.ts` (5), `lib/actions/clipboard-outcomes.test.ts` (13), `lib/handler/action-result.test.ts` (1), `lib/menu-text.test.ts` (setup fails), `pages/NoRepoPage.test.ts` (setup fails)                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `dispatchMessages` ignored (never calls `init` or `initDispatcher`)                                                      | 0             | none                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `vscodeApi.getState` returns `null` instead of `undefined`                                                               | 0             | none                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| The three `vscodeApi` mocks cleared before every test (a `beforeEach` added to the setup file)                           | 4             | `main/init-failure.test.ts` (1), `main/scan-retry.test.ts` (1), `main/start.test.ts` (2)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| The RPC client and the dispatcher imported only when `dispatchMessages` is `true`, instead of when `test-utils.ts` loads | 0             | none                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |

What this means for the rewrite:

- Every configuration value except `showCurrentBranchByDefault` is load-bearing, and the object must
  stay unfrozen. Keep all eight values exactly as in §2.2; `showCurrentBranchByDefault: false`
  matches the product default and costs nothing to keep.
- The proxy's "key name as text" answer is relied on by 36 files, and the property's
  `configurable: true` by 20 (directly, or through `commit-view-fixtures.ts` and
  `graph-view-harness.ts`, which redefine `window.l10n`).
- The setup file must not clear the mocks between tests: three files under `main/` load the page
  in a `beforeAll` hook and read, in later tests, the messages it posted then.
- Nothing depends on `dispatchMessages` having an effect, on `getState` returning `undefined`
  rather than `null`, on the helper passing its own object rather than a copy, or on
  `test-utils.ts` loading the RPC client and the dispatcher when it loads. These are still part of
  the interface of §2 (tests-u Q1, Q4, Q5).

---

## 3. `tests/webview/utils/columns.test.ts`

### 3.1 What it exercises

- Module `src/webview/utils/columns.ts`, through its four exports: the constants `MIN_COLUMN` and
  `MIN_DESCRIPTION`, and the pure functions `isColumnWidths(widths)` and
  `moveBoundary(widths, boundary, delta, description)`. The module's behaviour is specified in
  [columns.md](columns.md); this section says which of it the test file checks.
- It depends on `RESIZABLE_COLUMNS` (`[0, 2, 3, 4]`) in `src/webview/constants.ts`, which the tests
  do not import: stored slot 0 is the Graph column, 1 Date, 2 Author, 3 Commit, and the Description
  column (header cell 1) has no stored width. Boundary _n_ is the right edge of header cell _n_, so
  boundary 0 is Graph | Description, 1 is Description | Date, 2 is Date | Author and 3 is
  Author | Commit.
- No mocks, spies, timers or DOM. It runs in the `node` environment. Every call is synchronous.

### 3.2 Fixtures

- **W**, the standard stored widths: `[100, 120, 120, 90]`. One array object is shared by several
  checks, and two of them assert that it is still `[100, 120, 120, 90]` after being passed to
  `moveBoundary` (§3.6).
- **D**, the standard measured description width: `400`.
- **A holey array**: an array of length 4 whose first three slots hold `100`, `120`, `120` and whose
  fourth slot is missing (a hole, not an `undefined` value), made by setting `length` to 4 on a
  three-element array.
- **An all-hole array**: an empty array whose `length` is set to 4.
- **A frozen W**: `Object.freeze([100, 120, 120, 90])`.

How results are compared, which the rewrite must keep:

- `isColumnWidths` results are compared exactly with `true` or `false` (`toBe`), so a truthy or
  falsy non-boolean would fail.
- `moveBoundary` results are compared as a whole object `{ widths, moved }` with Vitest's deep
  equality (`toEqual`). Under it, `-0` and `0` differ (observed), so every expected `moved: 0`
  also asserts a positive zero; an extra own property on the result would fail; and an array hole
  equals `undefined`.
- Constants are compared exactly (`toBe`).

### 3.3 Constants

| Check | Expectation                                         |
| ----- | --------------------------------------------------- |
| C1    | `MIN_COLUMN` is `40` and `MIN_DESCRIPTION` is `64`. |

### 3.4 `isColumnWidths`

Each row is one call, or one call per listed value; the result is compared exactly.

| Check | Input                                                                                                      | Result  | What it shows                                                                                                                                     |
| ----- | ---------------------------------------------------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| C2    | `[100, 120, 120, 90]`                                                                                      | `true`  | The ordinary case.                                                                                                                                |
| C3    | `[120, 90, 100, 5.5]`, `[120.4, 90, 100, 70.6]`, `[0.001, 5.5, 39.9, 1e9]`                                 | `true`  | Non-integers, and values below `MIN_COLUMN`, pass.                                                                                                |
| C4    | frozen W                                                                                                   | `true`  | Freezing does not matter.                                                                                                                         |
| C5    | `[100, 120, 120]`, `[]`, `[100, 300, 80, 80, 80]`                                                          | `false` | Lengths 3, 0 and 5 fail; five was the length stored before the Description width was dropped.                                                     |
| C6    | `[100, x, 120, 90]` for x in `0`, `-1`, `-0`, `NaN`, `Infinity`, `-Infinity`                               | `false` | A value that is not strictly positive and finite fails.                                                                                           |
| C7    | `[x, 120, 120, 90]` for x in `"100"`, `null`, `undefined`, `true`, `[100]`                                 | `false` | The type is checked with no coercion: a numeric string, a boolean or a one-element array fails.                                                   |
| C8    | `null`                                                                                                     | `false` | `null` input.                                                                                                                                     |
| C9    | `undefined`, `"abcd"`, `"abc"`, `5`, `{}`, `{ length: 4 }`, `{ 0: 100, 1: 120, 2: 120, 3: 90, length: 4 }` | `false` | Non-array input, even a four-character string or an object with four indexed numbers and `length: 4`, yields `false`; none of these calls throws. |
| C10   | the holey array; the all-hole array                                                                        | `false` | A hole fails like a bad value.                                                                                                                    |
| C11   | a fresh `[100, 120, 120, 90]`, inspected after the call                                                    | —       | The argument is still deep-equal to `[100, 120, 120, 90]`.                                                                                        |

The inputs in C7 and C9 are cast to the parameter type (`Array<number> | null`) so that the file
compiles.

### 3.5 `moveBoundary`: outcomes

Each row is one call `moveBoundary(widths, boundary, delta, description)`, or one call per listed
value, and its expected result. "W" and "D" are the fixtures of §3.2; "unchanged" means `widths`
deep-equal to the input.

**Moves inside the limits**

| Check | widths                      | boundary | delta | description | → widths                    | moved |
| ----- | --------------------------- | -------- | ----- | ----------- | --------------------------- | ----- |
| C12   | W                           | 0        | 30    | D           | `[130, 120, 120, 90]`       | 30    |
| C13   | W                           | 1        | 20    | D           | `[100, 100, 120, 90]`       | 20    |
| C14   | W                           | 1        | −20   | D           | `[100, 140, 120, 90]`       | −20   |
| C15   | W                           | 2        | 25    | D           | `[100, 145, 95, 90]`        | 25    |
| C16   | W                           | 3        | −15   | D           | `[100, 120, 105, 105]`      | −15   |
| C17   | W                           | −0       | 10    | D           | `[110, 120, 120, 90]`       | 10    |
| C18   | `[100, 120, 120, Infinity]` | 0        | 10    | D           | `[110, 120, 120, Infinity]` | 10    |
| C19   | frozen W                    | 2        | 10    | D           | `[100, 130, 110, 90]`       | 10    |
| C20   | frozen W                    | 0        | 10    | D           | `[110, 120, 120, 90]`       | 10    |

C17 shows that a boundary of negative zero is boundary 0; C18 that an unusable width away from the
boundary does not stop the move; C19 and C20 that the function never writes to its input.

**Boundaries 2 and 3 do not read the description argument**

| Check | widths | boundary | delta | description                    | → widths              | moved |
| ----- | ------ | -------- | ----- | ------------------------------ | --------------------- | ----- |
| C21   | W      | 2        | 10    | each of `NaN`, `Infinity`, `0` | `[100, 130, 110, 90]` | 10    |
| C22   | W      | 3        | 50    | 0                              | `[100, 120, 170, 40]` | 50    |

**Clamped by a minimum (40 for a stored column, 64 for the description)**

| Check | widths | boundary | delta | description | → widths              | moved |
| ----- | ------ | -------- | ----- | ----------- | --------------------- | ----- |
| C23   | W      | 0        | −200  | D           | `[40, 120, 120, 90]`  | −60   |
| C24   | W      | 0        | −60   | D           | `[40, 120, 120, 90]`  | −60   |
| C25   | W      | 0        | 336   | D           | `[436, 120, 120, 90]` | 336   |
| C26   | W      | 0        | 500   | 100         | `[136, 120, 120, 90]` | 36    |
| C27   | W      | 1        | 300   | D           | `[100, 40, 120, 90]`  | 80    |
| C28   | W      | 1        | −500  | D           | `[100, 456, 120, 90]` | −336  |
| C29   | W      | 2        | −81   | D           | `[100, 40, 200, 90]`  | −80   |
| C30   | W      | 2        | 81    | D           | `[100, 200, 40, 90]`  | 80    |
| C31   | W      | 3        | 300   | D           | `[100, 120, 170, 40]` | 50    |
| C32   | W      | 3        | −300  | D           | `[100, 120, 40, 170]` | −80   |
| C33   | W      | 0        | 10    | 64          | unchanged             | 0     |
| C34   | W      | 0        | −10   | 64          | `[90, 120, 120, 90]`  | −10   |
| C35   | W      | 1        | −10   | 64          | unchanged             | 0     |

C24 and C25 are the exact limits (the move is not cut short); C33 to C35 show that a description of
exactly 64 blocks moves that would shrink it but not moves that grow it.

**A neighbour narrower than its minimum is widened back to it, whichever way the request points**

| Check | widths               | boundary | delta          | description | → widths              | moved |
| ----- | -------------------- | -------- | -------------- | ----------- | --------------------- | ----- |
| C36   | `[10, 120, 120, 90]` | 0        | each of −30, 0 | D           | `[40, 120, 120, 90]`  | 30    |
| C37   | `[100, 30, 120, 90]` | 2        | −50            | D           | `[100, 40, 110, 90]`  | 10    |
| C38   | `[100, 20, 120, 90]` | 1        | 30             | D           | `[100, 40, 120, 90]`  | −20   |
| C39   | W                    | 0        | 10             | 50          | `[86, 120, 120, 90]`  | −14   |
| C40   | W                    | 1        | −10            | 50          | `[100, 106, 120, 90]` | 14    |
| C41   | W                    | 0        | −8             | 50          | `[86, 120, 120, 90]`  | −14   |
| C42   | `[10, 120, 120, 90]` | 0        | 50             | 94          | `[40, 120, 120, 90]`  | 30    |

C41 moves further than asked; C42 is the case where exactly one position satisfies both minimums
(Graph 10 + 30 = 40, description 94 − 30 = 64).

**Both minimums cannot be met at once: nothing moves**

| Check | widths               | boundary | delta | description | → widths  | moved |
| ----- | -------------------- | -------- | ----- | ----------- | --------- | ----- |
| C43   | `[40, 40, 40, 40]`   | 0        | 30    | 0           | unchanged | 0     |
| C44   | `[10, 120, 120, 90]` | 0        | 50    | 80          | unchanged | 0     |
| C45   | `[60, 120, 120, 90]` | 0        | 0     | 30          | unchanged | 0     |
| C46   | `[100, 30, 45, 90]`  | 2        | 0     | D           | unchanged | 0     |
| C47   | `[100, 20, 120, 90]` | 1        | −100  | 50          | unchanged | 0     |

**Unusable boundary, request, description or neighbouring width: nothing moves**

| Check | widths                                            | boundary                                 | delta                                  | description                            | → widths                     | moved |
| ----- | ------------------------------------------------- | ---------------------------------------- | -------------------------------------- | -------------------------------------- | ---------------------------- | ----- |
| C48   | W                                                 | each of 4, 7, −1, 1.5, `NaN`, `Infinity` | 10                                     | D                                      | unchanged                    | 0     |
| C49   | W                                                 | each of 0, 1, 2, 3                       | each of `NaN`, `Infinity`, `-Infinity` | D                                      | unchanged                    | 0     |
| C50   | W                                                 | each of 0, 1                             | 10                                     | each of `NaN`, `Infinity`, `-Infinity` | unchanged                    | 0     |
| C51   | W                                                 | 1                                        | `-Infinity`                            | `Infinity`                             | unchanged                    | 0     |
| C52   | `[x, 120, 120, 90]`, x each of `NaN`, `Infinity`  | 0                                        | 10                                     | D                                      | unchanged                    | 0     |
| C53   | `[100, x, 120, 90]`, x each of `NaN`, `Infinity`  | each of 1, 2                             | 10                                     | D                                      | unchanged                    | 0     |
| C54   | `[100, 120, 120, x]`, x each of `NaN`, `Infinity` | 3                                        | −10                                    | D                                      | unchanged                    | 0     |
| C55   | the holey array                                   | 3                                        | 10                                     | D                                      | `[100, 120, 120, undefined]` | 0     |

**An array of any length but four: nothing moves**

| Check | widths                    | boundary     | delta | description | → widths     | moved |
| ----- | ------------------------- | ------------ | ----- | ----------- | ------------ | ----- |
| C56   | `[]`                      | 0            | 10    | D           | `[]`         | 0     |
| C57   | `[100]`                   | 0            | 10    | D           | `[100]`      | 0     |
| C58   | `[100, 120]`              | each of 1, 2 | 10    | D           | `[100, 120]` | 0     |
| C59   | `[100, 120, 120, 90, 80]` | each of 0, 4 | 10    | D           | unchanged    | 0     |

**Non-integer values, compared with exact floating-point equality**

| Check | widths                  | boundary | delta | description | → widths                  | moved |
| ----- | ----------------------- | -------- | ----- | ----------- | ------------------------- | ----- |
| C60   | `[100.5, 120, 120, 90]` | 0        | 10.25 | D           | `[110.75, 120, 120, 90]`  | 10.25 |
| C61   | W                       | 2        | 0.3   | D           | `[100, 120.3, 119.7, 90]` | 0.3   |
| C62   | `[100, 40.5, 120, 90]`  | 1        | 10    | D           | `[100, 40, 120, 90]`      | 0.5   |

C62 is capped: Date may shrink only to 40, so the boundary moves 0.5, not 10. The values in C61 are
the double-precision results of `120 + 0.3` and `120 - 0.3`, which print as `120.3` and `119.7`.

### 3.6 `moveBoundary`: zero's sign, copies, and the caller's array

| Check | Scenario                                                                                                                    | Expectation                                                                                                                          |
| ----- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| C63   | `moved` from (`[40, 120, 120, 90]`, 0, −8, D), which clamps to no move; from (W, 4, 10, D); and from (W, 0, `NaN`, D)       | `Object.is(moved, 0)` is `true` each time: a positive zero.                                                                          |
| C64   | W with each boundary 0 to 3 and a delta of `-0`, description D                                                              | Deep-equal to `{ widths: [100, 120, 120, 90], moved: 0 }`, which also requires a positive zero.                                      |
| C65   | `moveBoundary(W, 2, 25, D)`, then W inspected                                                                               | W is still deep-equal to `[100, 120, 120, 90]`.                                                                                      |
| C66   | A fresh `[100, 120, 120, 90]` passed with each boundary 0, 1, 2, 3 and 9, once with delta 20 and once with 0, description D | The returned `widths` is never the same array object as the input (`not.toBe`); afterwards the input is still `[100, 120, 120, 90]`. |

### 3.7 Timing

None. Every check is a synchronous call.

---

## 4. `tests/webview/lib/rpc-client.test.ts`

### 4.1 What it exercises

- `rpcClient` from `src/webview/lib/rpc/rpc-client.ts`: mostly `request(method, params)`, and
  `init()` once. The module's behaviour is specified in [rpc-client.md](rpc-client.md) (with the
  maintainer's decisions in its §8); this section says which of it the test file checks.
- Through it, without importing them: `src/webview/lib/rpc/rpc-handler.ts` (the window `message`
  listener that settles requests from `rpc.response` messages), `src/webview/lib/shell-text.ts`
  (reads the timeout text from the `data-rpc-timeout` attribute of `<html>`, that is
  `document.documentElement.dataset.rpcTimeout`) and `src/webview/lib/vscode.ts` (the API object).
- Type: `RpcRequest` from `@/types`, to read posted messages.
- Environment: `jsdom` (first line `// @vitest-environment jsdom`).

### 4.2 Stand-ins and instruments

- **The VS Code API** is the `vscodeApi` mock of §2.1: every request's message reaches
  `vscodeApi.postMessage`, and the global `acquireVsCodeApi` mock counts acquisitions. Some checks
  give `postMessage` a one-time implementation (`mockImplementationOnce`) that answers
  synchronously or throws.
- **The extension's answers** are simulated by dispatching, synchronously, a `MessageEvent` of type
  `message` on `window` whose `data` is `{ kind: "rpc.response", id, success: true, result }`, with
  `id` taken from the posted message.
- **The last posted message** is the first argument of the most recent `postMessage` call; reading
  it when nothing was posted fails the test.
- **An outcome tracker** attaches both a fulfilment and a rejection handler to a request's promise
  and records whether it has settled, how, and with what value. Because its handler counts as
  handling the rejection, Vitest reports no unhandled rejection for a request that is left to fail.
- **A listener-error recorder**: jsdom reports an exception thrown inside a window event listener as
  an `error` event on `window`. Before every test, the file adds a window `error` listener that
  records `event.error` and calls `preventDefault()`; after every test it removes it. Checks assert
  the record is empty to show that a late or stray answer was ignored without throwing.
- **Per-test reset**: before every test, `vscodeApi.postMessage`'s recorded calls are cleared
  (`mockClear`) and the listener-error record is emptied; after every test, real timers are restored
  (`vi.useRealTimers()`).
- **Fake timers**: every check installs them (`vi.useFakeTimers()`) after the module has been
  imported and before its first request. `vi.getTimerCount()` then counts pending deadlines, and
  `vi.advanceTimersByTimeAsync(ms)` or `vi.runAllTimersAsync()` passes time.
- **The timeout text** is set per check through `document.documentElement.dataset.rpcTimeout`.
  The document persists across the tests of the file, so each check that depends on it sets it.

State carried between tests: the module is loaded once for the whole file, so its table of pending
requests and its "listening" flag persist. `init()` is called in R4 alone; every other check runs on
a module where at most an earlier `request` has installed the answer listener, so those checks
depend on `request` installing it. Requests that are never answered simply stay
pending when real timers are restored.

### 4.3 Checks

**The message and its deadline timer**

| Check | Setup and call                                                                                                                                                        | Expected (exact unless marked)                                                                                                                                                                                                                                                                                                                                                    |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1    | `request("clipboard.copy", "abc")`; afterwards the request is answered with `result: true` only to tidy up.                                                           | The return value is a `Promise`. `postMessage` was called once, with exactly one argument. That argument deep-equals `{ kind: "rpc.request", id: <any string>, method: "clipboard.copy", params: "abc" }` (so no other defined keys), and its `params` is identical (`toBe`) to the value passed. The timer count is already 1 when the call returns, before anything is awaited. |
| R2    | `request("clipboard.copy", obj)` where `obj` is `{ forced: ["through", "the", "types"] }` (cast past the types); then `request("no.such", undefined)` (both cast).    | The first posted message's `params` is `obj` itself (`toBe`). The second posted message has `method: "no.such"`, exactly as given, and `params` is an own key of it (`Object.hasOwn`) whose value is `undefined`.                                                                                                                                                                 |
| R3    | Two calls `request("repo.scan", null)`; the second is answered with `result: answer`, where `answer` is `{ repos: [] }`; later the first is answered too, to tidy up. | Two posts with different ids; timer count 2 before the answer and 1 right after it. The second promise fulfils with `answer` itself (`toBe`). After that has been awaited, the first is still pending.                                                                                                                                                                            |
| R4    | Note how many times the global `acquireVsCodeApi` mock has been called. Call `init()`, then `request("docs.open", null)` and `request("settings.open", null)`.        | The `acquireVsCodeApi` call count is unchanged (no second acquisition), and `postMessage` was called twice.                                                                                                                                                                                                                                                                       |

**Settling by an answer**

| Check | Setup and call                                                                                                                                                                                                                                                       | Expected                                                                                                                          |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| R5    | `postMessage` is given a one-time implementation that, while being called, dispatches the success answer `result: "sync"` for the id of the message it receives. Then `request("docs.open", null)`.                                                                  | Right after the call the timer count is 0 (the answer already cancelled the deadline), and the promise fulfils with `"sync"`.     |
| R6    | `vi.resetModules()`, then a dynamic import of `@/webview/lib/rpc/rpc-client` gives a newly evaluated copy of the module on which nothing has called `init()`. On it, `request("docs.open", null)`, then at once the success answer `result: true` for the posted id. | Timer count 0 right after the answer, and the promise fulfils with `true`: the first request installs the answer listener itself. |

In R6 the new copy also loads a new `lib/vscode.ts`, which calls the global `acquireVsCodeApi`
again and receives the same `vscodeApi` object, because the setup module itself is not loaded
again; so the new copy's message is still recorded by the mock the file imported.

**Expiry after 30 seconds.** In these checks the timeout text is `"No response: {0}"` unless the
row says otherwise.

| Check | Setup and call                                                                                                                                                                      | Expected                                                                                                                                                                                                                                                    |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R7    | Timeout text `"Keine Antwort der Erweiterung: {0}"`. `request("clipboard.copy", "commit")`; an expectation that it rejects is attached before time passes; then all timers are run. | Rejects with an error whose message contains `"Keine Antwort der Erweiterung: clipboard.copy"` (Vitest's `rejects.toThrow` with a string, a substring match). The template comes from the `<html>` attribute, so a German template yields a German message. |
| R8    | `request("docs.open", null)`, tracked. Advance 29,999 ms; then 1 ms more. Then answer it with success; let one microtask pass.                                                      | Pending after 29,999 ms; rejected at 30,000 ms, with the timer count 0. After the late answer the recorded value is still an `Error` (not overturned) and no listener error was recorded.                                                                   |
| R9    | `request("docs.open", null)`; advance 30,000 ms.                                                                                                                                    | The rejection value is an `Error` instance and matches `{ name: "Error", message: "No response: docs.open" }` (partial match on those two fields).                                                                                                          |
| R10   | The `rpcTimeout` entry is deleted from the dataset. `request("clipboard.copy", "x")`; advance 30,000 ms.                                                                            | The rejection is an `Error` whose `message` is exactly `""`.                                                                                                                                                                                                |
| R11   | Timeout text `"BEFORE {0}"` when `request("docs.open", null)` is made; changed to `"AFTER {0}"` before the deadline; advance 30,000 ms.                                             | Message exactly `"AFTER docs.open"`: the template in force at expiry is used, not the one at request time.                                                                                                                                                  |
| R12   | `request("docs.open", null)` at 0 ms; advance 10,000 ms; `request("settings.open", null)`; advance 20,000 ms; check; advance 10,000 ms more.                                        | At 30,000 ms the first has rejected, the second is still pending and the timer count is 1. At 40,000 ms the second has rejected with exactly `"No response: settings.open"` and the timer count is 0.                                                       |
| R13   | One check per row of the table below: set the timeout text, call `request(method, null)` (method names not in the method map are cast), advance 30,000 ms.                          | The rejection's `message` is exactly the text in the last column.                                                                                                                                                                                           |

| Timeout text       | Method          | Message                                |
| ------------------ | --------------- | -------------------------------------- |
| `{0} and {0}`      | `docs.open`     | `docs.open and docs.open`              |
| `no placeholder`   | `docs.open`     | `no placeholder`                       |
| `x {1} {0} $& {0}` | `settings.open` | `x {1} settings.open $& settings.open` |
| `m=$&`             | `a$&b`          | `m=$&`                                 |
| `m={0}`            | `a$&b`          | `m=a$&b`                               |
| `{0}`              | ``$`$'$$``      | ``$`$'$$``                             |

Together the rows of the table show that every `{0}` is replaced, that other braces such as `{1}`
are left alone, and that `$` sequences are never expanded, neither in the text nor in the method
name.

**Posting throws**

| Check | Setup and call                                                                                                                                                                                                                                                                                                                   | Expected                                                                                                                                                                                                                         |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R14   | `postMessage` throws `err = new Error("clone failed")` once. `request("clipboard.copy", "x")` is called inside an assertion that it does not throw; the promise is tracked; one microtask passes. Then a success answer is sent for the id recorded by the mock (the call is recorded even though it threw); one more microtask. | The call did not throw. The outcome deep-equals `{ settled: "rejected", value: err }` and the value is `err` itself (`toBe`). Timer count 0. After the late answer the value is still `err`, and no listener error was recorded. |
| R15   | `postMessage` throws the string `"a string"` once. `request("clipboard.copy", "x")`; its rejection is caught and awaited.                                                                                                                                                                                                        | The rejection is an `Error` instance that matches `{ message: "a string", cause: "a string" }` (partial). Timer count 0.                                                                                                         |

### 4.4 Timing notes

- All time is fake. The async variants (`advanceTimersByTimeAsync`, `runAllTimersAsync`) are used
  so that promise callbacks run between timers. "One microtask" means awaiting an already
  resolved promise once.
- The deadline is pinned from both sides by R8 (still pending at 29,999 ms, rejected at 30,000 ms).
  R7 runs all timers and so does not pin the value.
- Answers are dispatched synchronously, so a check can inspect the timer count immediately after
  dispatching.

---

## 5. `tests/webview/utils/ref.test.ts`

### 5.1 What it exercises

- `hasInvalidRefChars(name: string): boolean` from `src/webview/utils/ref.ts`: whether a name that a
  dialog is about to send to Git breaks a ref-name rule. `true` means the name is refused.
- No mocks, timers or DOM; `node` environment; synchronous calls. Every result is compared exactly
  with `true` or `false` (`toBe`).
- The rules are also checked, more widely, by `tests/webview/utils/ref.rules.test.ts`, which is not
  being rewritten (§9.3).

### 5.2 Checks

| Check | Input                                   | Result             | Rule                                                       |
| ----- | --------------------------------------- | ------------------ | ---------------------------------------------------------- |
| F1    | `feature/login`                         | `false`            | A two-component name with one slash.                       |
| F2    | `main`, asked twice                     | `false` both times | Repeatable: a second identical call agrees with the first. |
| F3    | `my branch`                             | `true`             | Space character.                                           |
| F4    | `-branch`                               | `true`             | First character `-`.                                       |
| F5    | `/branch`                               | `true`             | First character `/`.                                       |
| F6    | `a..b`                                  | `true`             | `..` anywhere.                                             |
| F7    | `a//b`                                  | `true`             | `//` anywhere.                                             |
| F8    | `a/.b`                                  | `true`             | `/.`: a later component beginning with a dot.              |
| F9    | `branch.`                               | `true`             | Last character `.`.                                        |
| F10   | `branch/`                               | `true`             | Last character `/`.                                        |
| F11   | `branch.lock`                           | `true`             | Suffix `.lock`.                                            |
| F12   | `branch@{1}`                            | `true`             | `@{` anywhere.                                             |
| F13   | `@`                                     | `true`             | Exactly `@`.                                               |
| F14   | `branch~1`                              | `true`             | `~` anywhere.                                              |
| F15   | `branch^`                               | `true`             | `^` anywhere.                                              |
| F16   | `branch:name`                           | `true`             | `:` anywhere.                                              |
| F17   | `branch?`                               | `true`             | `?` anywhere.                                              |
| F18   | `branch*`                               | `true`             | `*` anywhere.                                              |
| F19   | `branch[`                               | `true`             | `[` anywhere.                                              |
| F20   | `branch\name` (one backslash character) | `true`             | `\` anywhere.                                              |

F3 to F20 are one parameterized table today, counted as 18 tests; the rewrite may lay them out in
any way that keeps one assertion per name.

### 5.3 Timing

None.

---

## 6. `tests/webview/utils/format.test.ts`

### 6.1 What it exercises

- `format(template: string, ...parts: Array<ComponentChildren>): Array<ComponentChildren>` from
  `src/webview/utils/format.ts`: it cuts a localized template at its numbered placeholders `{0}`,
  `{1}`, … and returns the pieces as a list of Preact children, with `parts[n]` in place of each
  `{n}`.
- `h` from `preact` builds one element to pass as a part. No DOM is needed: nothing is rendered.
  `node` environment; synchronous calls.
- Every result is compared with deep equality (`toEqual`) against a whole array. Two properties of
  that comparison matter here (both observed): the array's length must match, so a trailing
  `undefined` piece must be present as an element; and a Preact element equals only itself, not a
  newly built element with the same type and children (Preact gives each element a unique internal
  id), so the element check in T3 effectively requires the part itself to be returned.
- More behaviour of `format` is checked by `tests/webview/utils/format.pieces.test.ts`, which is not
  being rewritten (§9.4).

### 6.2 Checks

| Check | Template                | Parts                         | Result (whole array, deep equality)          | What it shows                                                                                                    |
| ----- | ----------------------- | ----------------------------- | -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| T1    | `Refresh`               | none                          | `["Refresh"]`                                | One element: the template string.                                                                                |
| T2    | `Add tag to commit {0}` | `"abcd1234"`                  | `["Add tag to commit ", "abcd1234"]`         | Text, then the part; no empty string after a placeholder that ends the template.                                 |
| T3    | `Checkout {0}?`         | the element `<b>abcd1234</b>` | `["Checkout ", <that element>, "?"]`         | The element itself sits between the two text pieces.                                                             |
| T4    | `merge {0} into {1}?`   | `"topic"`, `"main"`           | `["merge ", "topic", " into ", "main", "?"]` | Two placeholders in ascending order: text and parts alternate.                                                   |
| T5    | `{1} then {0}`          | `"second"`, `"first"`         | `["first", " then ", "second"]`              | Pieces follow the template's order; each placeholder takes the part its number names.                            |
| T6    | `reset {0} to {1}`      | `"main"`                      | `["reset ", "main", " to ", undefined]`      | A placeholder with no part becomes an `undefined` piece (which renders as nothing); the array has four elements. |

### 6.3 Timing

None.

---

## 7. `tests/webview/lib/webview-config.test.ts`

### 7.1 What it exercises

- `src/webview/lib/webview-config.ts`: `initializeWebviewConfig(value)`, `updateWebviewConfig(value)`
  and `getWebviewConfig()`, which hold the extension's settings for the page, once per module
  instance. The module's behaviour is specified in §5 of [webview-state.md](webview-state.md).
- Through a newly loaded module graph: `applyWebviewConfig(config)` from
  `src/webview/lib/actions.ts` (what a `config.changed` notification from the extension calls) and
  the signal `maxCommits` from `src/webview/lib/stores.ts` (how many rows the graph asks for), read
  with `peek()`.
- Type: `WebviewConfig` from `@/types`.
- Environment: `node`, with no DOM. This matters beyond the file itself: one check loads the actions
  module (and with it the RPC client, the stores and the rest of the page logic) without a
  `window`, so any of those modules that touched `window` or `document` while loading would make
  it fail. [rpc-client.md](rpc-client.md) §6.2 relies on this to catch a client that installs its
  listener at load time. The rewrite must keep the file in the `node` environment.
- No mocks or timers. The global `acquireVsCodeApi` from §2.1 is what lets `lib/vscode.ts` load.

### 7.2 Fixtures

- **Initial settings**: a `WebviewConfig` with the same eight values as the shared helper's
  (§2.2): `autoCenterCommitDetailsView: true`, `dateFormat: "Date & Time"`, `graphColours: []`,
  `graphStyle: "rounded"`, `initialLoadCommits: 300`, `loadMoreCommits: 100`, `locale: "en"`,
  `showCurrentBranchByDefault: false`.
- **Changed settings**: a copy of the initial settings with `dateFormat: "Relative"` and
  `initialLoadCommits: 500`.

### 7.3 Checks

Error messages are matched as substrings (`toThrow` with a string).

| Check | Module instance                                                                                                                                                                                                        | Steps and expectations                                                                                                                                                                                                                                                                                                                                    |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| W1    | The statically imported module, before any other check has touched it (so importing it initializes nothing).                                                                                                           | `getWebviewConfig()` throws `Webview configuration is not initialized`. After `initializeWebviewConfig(initial)`, `getWebviewConfig()` returns that very object (`toBe`). A second `initializeWebviewConfig(initial)` throws `Webview configuration is already initialized`.                                                                              |
| W2    | A fresh instance: `vi.resetModules()`, then a dynamic import of `@/webview/lib/webview-config`.                                                                                                                        | `updateWebviewConfig(changed)` returns exactly `false`, and `getWebviewConfig()` still throws `Webview configuration is not initialized`. After `initializeWebviewConfig(initial)`, `getWebviewConfig()` is `initial` (`toBe`). Then `updateWebviewConfig(changed)` returns exactly `true`, and `getWebviewConfig()` is `changed` (`toBe`).               |
| W3    | A fresh graph: `vi.resetModules()`, then dynamic imports of `@/webview/lib/webview-config`, then `@/webview/lib/actions`, then `@/webview/lib/stores`, so that the actions module uses the same fresh settings holder. | Note `maxCommits.peek()` (observed: `0`). `applyWebviewConfig(changed)` does not throw, and `maxCommits.peek()` is unchanged (`toBe` the noted value), so the early change was discarded rather than raising the row count to 500. Then `initializeWebviewConfig(initial)` does not throw, and `getWebviewConfig()` is `initial` (`toBe`), not `changed`. |

W1 depends on running against a module instance that nothing has initialized yet; in the current
file it is the first check, run on the statically imported module. A rewrite may instead load a
fresh instance for it.

### 7.4 Timing

None of the checks uses timers. W3 loads the actions module afresh, which took about 1 s in the
observed run, well inside the default 5 s.

---

## 8. Coverage

Measured with the V8 provider by running only the five test files, with the coverage `include`
widened to `src/webview/**` (the repository's setting covers only `menus.tsx`):

```sh
pnpm exec vitest run --project webview --coverage --coverage.include='src/webview/**' \
  tests/webview/utils/columns.test.ts tests/webview/lib/rpc-client.test.ts \
  tests/webview/utils/ref.test.ts tests/webview/utils/format.test.ts \
  tests/webview/lib/webview-config.test.ts
```

All 90 tests passed. The command exits with status 1 only because of the repository's `menus.tsx`
threshold (§1.3): none of these files loads `menus.tsx`, so it shows 0 % of functions against the
required 80 %.

What these five files alone cover, per product file (covered / total):

| Product file (under `src/webview/`) | Statements     | Branches       | Functions     | Lines          | Uncovered, and why                                                                                                                                                        |
| ----------------------------------- | -------------- | -------------- | ------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `utils/columns.ts`                  | 29/29 (100 %)  | 34/34 (100 %)  | 5/5 (100 %)   | 29/29 (100 %)  | Nothing.                                                                                                                                                                  |
| `utils/ref.ts`                      | 19/19 (100 %)  | 19/19 (100 %)  | 4/4 (100 %)   | 17/17 (100 %)  | Nothing by line, although several rules (`"`, `<`, `>`, control characters, `HEAD`, a leading `.`) are reached by no input of this file; `ref.rules.test.ts` checks them. |
| `utils/format.ts`                   | 8/8 (100 %)    | 4/4 (100 %)    | 2/2 (100 %)   | 8/8 (100 %)    | Nothing.                                                                                                                                                                  |
| `lib/webview-config.ts`             | 12/12 (100 %)  | 6/6 (100 %)    | 3/3 (100 %)   | 12/12 (100 %)  | Nothing by line; the reactive behaviour (readers re-running when the settings are replaced) is checked only by `webview-config-holder.test.ts`.                           |
| `lib/rpc/rpc-client.ts`             | 27/29 (93.1 %) | 4/4 (100 %)    | 9/9 (100 %)   | 26/28 (92.9 %) | The branch where installing the answer listener throws inside `request` (lines 47–48). `rpc-client-state.test.ts` covers it.                                              |
| `lib/rpc/rpc-handler.ts`            | 16/36 (44.4 %) | 10/42 (23.8 %) | 4/12 (33.3 %) | 16/36 (44.4 %) | Only successful answers and answers for unknown ids are reached; failure answers, malformed answers and every notification are not. Its own tests cover them.             |
| `lib/shell-text.ts`                 | 1/1 (100 %)    | 2/2 (100 %)    | 1/1 (100 %)   | 1/1 (100 %)    | Nothing.                                                                                                                                                                  |
| `lib/vscode.ts`                     | 1/1 (100 %)    | —              | —             | 1/1 (100 %)    | Nothing.                                                                                                                                                                  |
| `lib/actions.ts`                    | 4/238 (1.7 %)  | 1/136 (0.7 %)  | 1/54 (1.9 %)  | 4/237 (1.7 %)  | Only loading, and `applyWebviewConfig`'s early return in W3.                                                                                                              |
| `lib/stores.ts`                     | 24/43 (55.8 %) | 0/24 (0 %)     | 0/7 (0 %)     | 24/43 (55.8 %) | Only its top-level declarations, when it loads.                                                                                                                           |
| `constants.ts`                      | 7/7 (100 %)    | —              | —             | 7/7 (100 %)    | Loaded as a dependency.                                                                                                                                                   |

Both `rpc-client.test.ts` and `webview-config.test.ts` load much of the page's logic (the RPC
handler imports the actions, which import the stores, navigation, repository and remote actions,
the date utilities and a few UI components). Those modules then show their top-level statements as
covered (for example `lib/navigation.ts` 16/108 lines, `lib/repository-actions.tsx` 9/100,
`utils/date.ts` 6/61) without any of their functions running; they are not listed above.

Per test file, the exercised module is reached by that file alone: `columns.test.ts` gives all of
`columns.ts`, `ref.test.ts` all of `ref.ts`, `format.test.ts` all of `format.ts`,
`webview-config.test.ts` all of `webview-config.ts` (and loads `rpc-client.ts`, 4/28 lines), and
`rpc-client.test.ts` the `rpc-client.ts`, `rpc-handler.ts` and `shell-text.ts` figures above (and
loads `webview-config.ts`, 1/12 lines). The rewrite should reach at least the same figures for
the first eight rows.

---

## 9. Gaps

Behaviours of the exercised modules that these files do not check, with the result observed from
the current code. Several are already checked by other test files that are not being rewritten;
those are named so that the rewrite does not duplicate them. The rest are cheap to add to the
rewritten files.

### 9.1 `columns.test.ts`

Not checked by any test today:

| Gap | Call                                                                                                                                   | Observed result                                                                                                                                             |
| --- | -------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GC1 | `isColumnWidths(new Float64Array([100, 120, 120, 90]))` (cast)                                                                         | `false`: a typed array is not an array.                                                                                                                     |
| GC2 | `isColumnWidths([Number.MAX_VALUE, 120, 120, 90])`; `isColumnWidths([Number.MIN_VALUE, 120, 120, 90])`                                 | `true` both: no upper bound and no minimum (decision Q8 of [columns.md](columns.md)).                                                                       |
| GC3 | `moveBoundary(W, 0, 10, -10)`; `moveBoundary(W, 1, 10, -10)`                                                                           | Unchanged with `moved` 0; then `[100, 46, 120, 90]` with `moved` 74 (a negative description is restored to 64).                                             |
| GC4 | `moveBoundary([0, 120, 120, 90], 0, 0, D)`; `moveBoundary([-10, 120, 120, 90], 0, 5, D)`; `moveBoundary([100, 120, 120, -5], 3, 0, D)` | `[40, 120, 120, 90]` with 40; `[40, 120, 120, 90]` with 50; `[100, 120, 75, 40]` with −45: a zero or negative stored width is restored like any narrow one. |
| GC5 | `moveBoundary(a, 0, 10, D)` for `a = []` and for `a = [NaN, 120, 120, 90]`                                                             | The returned `widths` is a new array, not `a` (C66 checks this only for four finite widths).                                                                |
| GC6 | `moveBoundary(W, "1", 10, D)` (the boundary cast from a string)                                                                        | Unchanged, `moved` 0.                                                                                                                                       |
| GC7 | `moveBoundary(W, 2, 80, D)`; `moveBoundary(W, 2, -80, D)`                                                                              | `[100, 200, 40, 90]` with 80; `[100, 40, 200, 90]` with −80: the exact room between two stored columns (C29 and C30 ask one pixel more).                    |

### 9.2 `rpc-client.test.ts`

- R7 matches the localized text as a substring of the rejection's message. An exact comparison,
  and a check that the rejection is an `Error`, would cost nothing.
- Checked elsewhere, so not needed here: repeated and failing `init()`, and a request whose listener
  cannot be installed (the two lines of `rpc-client.ts` these files miss), the table of pending
  requests, and ids not repeating after a reload (`tests/webview/lib/rpc-client-state.test.ts`);
  failure and malformed answers, answers in reverse order, and the deadline seen through `init()`
  (`tests/webview/lib/rpc-handler-client.test.ts`); duplicate answers for one id
  (`tests/webview/lib/rpc-handler.test.ts`).
- Not checked anywhere: that a request whose `params` is `null` posts `params: null` as an own key
  of the message for a method other than `repo.scan` (R2 checks `undefined`; the `repo.scan` message
  is compared exactly in `rpc-handler-client.test.ts`). Low value.

### 9.3 `ref.test.ts`

`tests/webview/utils/ref.rules.test.ts` already checks the empty string, `"`, `<`, `>`, control
characters and DEL, names starting with `.`, `.lock` at the end of any component, `HEAD`, and
repeated calls in alternation. Not checked anywhere:

| Gap | Input                                                                    | Observed result |
| --- | ------------------------------------------------------------------------ | --------------- |
| GR1 | `🌿-branch`, `feat/🌿` (characters outside the Basic Multilingual Plane) | `false` both    |
| GR2 | `release/v1.2.3` (dots inside a later component)                         | `false`         |

F2 asks an accepted name twice. A stateful matcher would only misbehave after a match, so asking a
refused name twice (for example `a..b`) is the stronger form; `ref.rules.test.ts` already
alternates the two.

### 9.4 `format.test.ts`

`tests/webview/utils/format.pieces.test.ts` already checks the empty template, adjacent
placeholders, one part used at two placeholders (by identity), indexes of several digits and with
leading zeros, braces that are not placeholders, unused parts, falsy parts, `$` patterns and line
breaks, rendering markup as text, and a new array per call. Not checked anywhere:

| Gap | Call                            | Observed result                                                         |
| --- | ------------------------------- | ----------------------------------------------------------------------- |
| GF1 | `format("{0} {1}", "{1}", "B")` | `["{1}", " ", "B"]`: a part's own text is not scanned for placeholders. |

### 9.5 `webview-config.test.ts`

`tests/webview/lib/webview-config-holder.test.ts` already checks the reactive behaviour, that the
errors are `Error` instances, that the stored object stays open to changes in place, and that
initializing does not subscribe the caller. Not checked anywhere:

| Gap | Scenario                                                                                          | Observed result                                                                                                                                                          |
| --- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| GW1 | After `initializeWebviewConfig(first)`, `initializeWebviewConfig(second)` with a different object | Throws `Webview configuration is already initialized`, and `getWebviewConfig()` is still `first` (W1 repeats the same object, so it cannot tell "kept" from "replaced"). |

W1 and W2 match the error messages as substrings; an exact comparison would cost nothing.

### 9.6 The shared modules

No test checks `setup.ts` or `test-utils.ts` directly. §2.4 shows which of their properties other
tests pin and which none do (`dispatchMessages`, `showCurrentBranchByDefault`, …). A rewrite could
pin the interface of §2.1 and §2.2 with a small test of its own; see tests-u Q6.

---

## 10. Questions

Each question states the current behaviour. Nothing here is decided.

**tests-u Q1. Helper lines the interface forces.** `setup.ts` has 6 inherited lines and
`test-utils.ts` 17, and nearly all of them state the interface of §2: the `vscodeApi` object with
its three mock members, the `configurable` global, the eight configuration fields and values, the
`window.l10n` definition with its proxy, and the two calls made for `dispatchMessages`. A rewrite
that keeps the interface will very likely produce some of the same lines. Today no line of either
file is listed in `scripts/provenance-reviewed.json`. Are such lines to be listed as reviewed
coincidences, or should the interface change where no test depends on it (§2.4 shows, for example,
that no test depends on `showCurrentBranchByDefault: false`, on the helper passing its own object
rather than a copy, or on what `dispatchMessages` does)?

**tests-u Q2. Example values on inherited lines.** §1.5 lists the checks whose inputs come from
inherited lines: the fixtures W and D and ten `moveBoundary` cases of `columns.test.ts`, every name
in `ref.test.ts`, every template in `format.test.ts`, the settings fixture of
`webview-config.test.ts`, and the first RPC timeout check. Written from this document, a natural
assertion on the same values can match an old line character for character. Today the values are
as listed. Should the rewrite keep them (and list any matching lines after review), or choose new
values that exercise the same rules?

**tests-u Q3. The setup module after a module reset.** Today, if a test calls `vi.resetModules()`
and then imports `@tests/webview/setup` (directly or through `test-utils.ts`), the module runs again:
a second `vscodeApi` object is created and a new global `acquireVsCodeApi` returning it replaces
the first, while modules loaded earlier keep posting to the first. No current test does this. Should
the rewrite keep plain module semantics, or make the mock survive a reset (for example by reusing
the global it finds)?

**tests-u Q4. What importing `test-utils.ts` loads.** Today it imports the dispatcher, the RPC
client and the settings holder at load time, so importing it loads most of the page logic and
records one `acquireVsCodeApi` call and one `getState` call before any test runs (§2.2). With the
RPC client and the dispatcher imported only when `dispatchMessages` is `true`, every test still
passes (§2.4). Must the rewrite keep these imports static?

**tests-u Q5. What `dispatchMessages` is for.** Two files pass `dispatchMessages: true`
(`lib/actions/clipboard.test.ts`, `lib/menu-text.test.ts`), which installs the RPC answer listener
and the legacy message dispatcher. With the option ignored, every test still passes (§2.4): the
first RPC request installs its listener anyway, and neither file sends a legacy `command` message.
The option must stay accepted, since those two files are not being rewritten. Should it keep its
current effect, or is it a candidate for removal later?

**tests-u Q6. Testing the shared modules themselves.** No test checks `setup.ts` or `test-utils.ts`
directly, and several properties of §2 are pinned by no test (§2.4). Should the rewrite add a test
file for them (a new file, outside the seven being replaced), or rely on the other tests as today?

**tests-u Q7. Coverage thresholds.** The repository enforces a threshold only for
`src/webview/lib/menus.tsx`. `columns.ts`, `ref.ts`, `format.ts` and `webview-config.ts` are fully
covered by these files alone, and `rpc-client.ts` nearly so (§8). Should the rewrite add thresholds
for them in `vitest.config.ts`, or leave the configuration as it is?

---

## Decisions

These decisions are the maintainer's answers to the questions above; where they differ from the rest of this specification, they win. Every new test must be able to fail when the behaviour it names breaks, and the new files together must cover at least what the coverage section reports for each product file.

- **Q1.** Keep the interface of `setup.ts` and `test-utils.ts` exactly as §2 gives it. Lines that the interface forces and that happen to match upstream are listed as reviewed coincidences after review.
- **Q2.** Pick new example values of the same kind that test the same rules: new ref names (valid and invalid for the same reasons), new format templates and parts, new column widths and fixtures, new settings values. Keep a value only where the product dictates it, such as a setting's name or an RPC method name.
- **Q3.** Keep the current behaviour: importing the setup module again after `vi.resetModules()` creates a new `vscodeApi` and replaces the global.
- **Q4.** No. Load them statically or lazily, whichever is simpler; no test depends on it.
- **Q5.** Keep the `dispatchMessages` option with its current effect; it is part of the interface.
- **Q6.** Yes. Add `tests/webview/test-helpers.test.ts`, checking the properties §2 records that other tests rely on:
  - every configuration value is present, and the object is not frozen;
  - `window.l10n` returns each key's own name and stays configurable;
  - mocks are not cleared between tests;
  - the other properties the specification names as relied on but unpinned.
- **Q7.** No coverage thresholds in this batch; `vitest.config.ts` belongs to the configuration batch.
