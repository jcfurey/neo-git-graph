# Clean-room specification: extension core modules

This document says what nine extension-host modules of Branchwise must do, as seen from outside them. It is written for an engineer who will replace them without seeing their current source. It is based on the modules' callers, the tests that load or replace them, the shared types, the webview code that consumes what they produce, VS Code's and Git's documented behaviour, and behaviour observed by running the current code.

Modules covered, one top-level section each:

| Section | Module                                      |
| ------- | ------------------------------------------- |
| A       | `src/extension/config.ts`                   |
| B       | `src/extension/html.ts`                     |
| C       | `src/extension/legacy.ts`                   |
| D       | `src/extension/view-command.ts`             |
| E       | `src/extension/rpc/handlers.ts`             |
| F       | `src/extension/handlers/clipboard.ts`       |
| G       | `src/extension/handlers/initialize-repo.ts` |
| H       | `src/extension/handlers/initialize.ts`      |
| I       | `src/extension/handlers/scan-repo.ts`       |

Every section has the same seven parts: Interface, Dependencies, Behaviour, Examples, Non-functional requirements, Test coverage (with gaps as test cases), and Questions. Questions are numbered per module with a short prefix (`config Q1`, `html Q1`, `legacy Q1`, `view Q1`, `handlers Q1`, `clipboard Q1`, `init-repo Q1`, `initialize Q1`, `scan Q1`). Gaps are numbered the same way with `G`.

---

## 0. Common ground

### 0.1 How the behaviour was observed

- Repository at commit `937fcf8`, Node v22.22.2, Vitest 4.1.11, Git 2.43.0 on Linux.
- The repository's own tests were run with `npx vitest run --project extension` (30 files, 225 tests, all pass). V8 coverage of the nine modules was taken from that run to find what the tests do not execute.
- Additional observations used throw-away Vitest files in a scratch directory outside the repository (deleted afterwards), with a config that aliased `@/` to the repository's `src/`. `vscode` was replaced with a `vi.mock` factory in each file that recorded every call. For the repository scan, a wrapper script set as `git.path` logged every Git command line before running the real Git.
- No repository file was changed.

### 0.2 Test harness facts that constrain every module

- The `extension` Vitest project (see `vitest.config.ts`) aliases `vscode` to `tests/extension/__mocks__/vscode.ts`, and most test files replace it again with their own `vi.mock("vscode", factory)`. Each factory supplies only a few members. **Reading a member that a `vi.mock` factory did not define throws** (Vitest reports "No "x" export is defined on the mock"). A module must therefore not touch any `vscode` member at import time, and at run time must touch only the members named in its "Non-functional requirements" part.
- `vi.mock` is keyed by the resolved file, so `./config` and `@/extension/config` name the same mocked module. Replacements must keep every module at its current path.
- `pnpm run typecheck` type-checks `src/` and `tests/` with `strict`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax` and `isolatedModules`. Type-only imports must use `import type`.
- The VS Code integration suite (`tests-ext/extension.test.ts`, run with `pnpm run test:ext`) and the UI harness (`tests-ext/ui/history.test.cjs`) drive the real, bundled extension. They could not be run in this environment; what they check is listed from their source.

### 0.3 Messages between the extension and the graph page

The graph page (webview) and the extension exchange messages over one `postMessage` channel carrying three kinds of message:

1. **RPC requests and responses.** The page posts `{ kind: "rpc.request", id, method, params }`. `src/extension/rpc/rpc-server.ts` (already rewritten, specified in `docs/clean-room/rpc-server.md`) finds the handler for `method` in the table exported by module E, calls it with `params` as its only argument, awaits it, and posts `{ kind: "rpc.response", id, success: true, result }` (an `undefined` result is sent as `null`) or `{ kind: "rpc.response", id, success: false, error }`, where `error` is the thrown value's string `message`, or its string form. The page gives up on a request after 30 seconds.
2. **Notifications.** One-way `{ kind: "rpc.notify", id, name, message }` messages sent through `rpcNotify.notify(name, message)` from `src/extension/rpc/rpc-notify.ts`. Names and payload types are in `RpcNotificationMap` (`src/types/rpc.types.ts`): `view.showPane` `{ pane }`, `repo.select` `{ name, path }`, `repo.rescan` `null`, `config.changed` `WebviewConfig`, `repo.updated` `{ path }`.
3. **Legacy command messages.** Objects with a `command` field, typed `RequestMessage` (page to extension) and `ResponseMessage` (extension to page) in `src/types/legacy.ts`. Module C wires these up; module D sends one of them (`fileHistory`) directly.

The page posts `{ command: "viewReady" }` once it has received its localized strings and configuration (RPC `webview.initialize`) and has loaded its repository list (RPC `repo.scan`).

---

## A. `src/extension/config.ts`

In one sentence: the module is where the rest of the extension reads Branchwise settings (with numeric and colour settings sanitized) and learns which Git executable to run.

### A.1 Interface

The module has four runtime exports and one type export. No default export.

**`export async function resolveBuiltInGitPath(): Promise<void>`**

Queries the built-in Git extension (`vscode.git`) for the path of the executable it runs, and keeps the answer for `extConfig.gitPath()`. It always resolves (with `undefined`) and never rejects. No parameters.

**`export function configuredGitPath(value: unknown): string`**

Turns a raw value of VS Code's own `git.path` setting into one executable path or name.

- `value`: whatever `vscode.workspace.getConfiguration("git").get("path")` returned: a string, an array of candidate strings (a form VS Code's own setting schema allows), `null`, `undefined`, or any other JSON value.

**`export function wholeNumber(value: unknown, minimum: number, fallback: number): number`**

Turns a raw numeric setting into an integer no smaller than a lower bound.

- `value`: the raw setting value, of any type.
- `minimum`: the smallest result allowed for a usable number.
- `fallback`: the result when `value` is not a usable number. It is returned as given, without the bound applied.

**`export const extConfig`**

A plain object with exactly these twelve own enumerable properties. Each is a function of no arguments that returns the setting's current value.

| Property                      | Return type                                                 | Source                                             | Value when the setting is absent     |
| ----------------------------- | ----------------------------------------------------------- | -------------------------------------------------- | ------------------------------------ |
| `autoCenterCommitDetailsView` | `boolean`                                                   | `branchwise.autoCenterCommitDetailsView`           | `true`                               |
| `dateFormat`                  | `DateFormat` (`"Date & Time" \| "Date Only" \| "Relative"`) | `branchwise.dateFormat`                            | `"Date & Time"`                      |
| `dateType`                    | `DateType` (`"Author Date" \| "Commit Date"`)               | `branchwise.dateType`                              | `"Author Date"`                      |
| `gitPath`                     | `string`                                                    | the built-in Git extension's path, else `git.path` | `"git"`                              |
| `graphColours`                | `string[]`                                                  | `branchwise.graphColours`, invalid entries removed | the twelve manifest defaults (below) |
| `graphStyle`                  | `GraphStyle` (`"rounded" \| "angular"`)                     | `branchwise.graphStyle`                            | `"rounded"`                          |
| `initialLoadCommits`          | `number`                                                    | `branchwise.initialLoadCommits`, lower bound 1     | `300`                                |
| `loadMoreCommits`             | `number`                                                    | `branchwise.loadMoreCommits`, lower bound 1        | `100`                                |
| `maxDepthOfRepoSearch`        | `number`                                                    | `branchwise.maxDepthOfRepoSearch`, lower bound 0   | `0`                                  |
| `showCurrentBranchByDefault`  | `boolean`                                                   | `branchwise.showCurrentBranchByDefault`            | `false`                              |
| `showUncommittedChanges`      | `boolean`                                                   | `branchwise.showUncommittedChanges`                | `true`                               |
| `tabIconColourTheme`          | `"colour" \| "grey"`                                        | `branchwise.tabIconColourTheme`                    | `"colour"`                           |

The default colour list, in order: `#0085d9`, `#d9008f`, `#00d90a`, `#d98500`, `#a300d9`, `#ff0000`, `#00d9cc`, `#e138e8`, `#85d900`, `#dc5b23`, `#6f24d6`, `#ffcc00`.

All defaults must equal the `default` that `package.json` declares under `contributes.configuration.properties` for the same key. The manifest also declares `branchwise.fetchAvatars` (deprecated, no effect); it has no getter and must not get one.

The union type for `tabIconColourTheme` is not exported today; nothing outside the module names it.

**`export type Config = typeof extConfig`**

The type of `extConfig`. It must stay structurally the type of the exported object, because `registerMessageHandlers` in `src/old-extension/messageHandler.ts` declares its `config` dependency with it.

**Who uses what**

| User                                                                                                                                                                                                                                                            | Exports used                                                                                                                                     |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/main.ts`                                                                                                                                                                                                                                                   | `resolveBuiltInGitPath`, called once during activation with a `void` prefix: activation does not wait for it.                                    |
| `src/extension/view-command.ts` (module D)                                                                                                                                                                                                                      | `extConfig.tabIconColourTheme`, `extConfig.gitPath`                                                                                              |
| `src/extension/legacy.ts` (module C)                                                                                                                                                                                                                            | `extConfig` as a whole (handed to `registerMessageHandlers`), and `extConfig.gitPath` for diff documents                                         |
| `src/extension/handlers/initialize.ts` (H)                                                                                                                                                                                                                      | `autoCenterCommitDetailsView`, `dateFormat`, `graphColours`, `graphStyle`, `initialLoadCommits`, `loadMoreCommits`, `showCurrentBranchByDefault` |
| `src/extension/handlers/scan-repo.ts` (I)                                                                                                                                                                                                                       | `gitPath`, `maxDepthOfRepoSearch`                                                                                                                |
| `src/old-extension/fileHistoryCommand.ts`                                                                                                                                                                                                                       | `extConfig.gitPath`                                                                                                                              |
| `src/old-extension/messageHandler.ts`                                                                                                                                                                                                                           | type `Config`; calls `gitPath`, `maxDepthOfRepoSearch`, `dateType` and `showUncommittedChanges` on the object it is given                        |
| `tests/extension/config.test.ts`                                                                                                                                                                                                                                | imports `configuredGitPath`, `extConfig`, `wholeNumber`; spies on `vscode.workspace.getConfiguration`                                            |
| `tests/extension/view-command.test.ts`                                                                                                                                                                                                                          | replaces the module with `{ extConfig: { tabIconColourTheme: () => "colour", gitPath: () => "git" } }`                                           |
| `tests/extension/config-watcher.test.ts`, `scan-repo.test.ts`, `scan-repo-windows.test.ts`, `activation.test.ts`, `file-history-command.test.ts`                                                                                                                | load the real module indirectly                                                                                                                  |
| eleven tests that call `registerMessageHandlers` (`action-cancel`, `action-dispatch`, `action-repository`, `graph-queries`, `nested-repository`, `query-cancellation`, `remote-preferences`, `restore-undo`, `view-diff`, `view-preferences`, `workspace-rows`) | pass partial `config` objects cast through `Parameters<typeof registerMessageHandlers>[1]`; they depend on `Config` only through that type       |

### A.2 Dependencies the implementation must use

| Import            | Name(s)                            | Use                                                                                                                       |
| ----------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `vscode`          | `workspace.getConfiguration`       | Read settings: section `"branchwise"` for the Branchwise settings, section `"git"` for `path`.                            |
| `vscode`          | `extensions.getExtension`          | Only inside `resolveBuiltInGitPath`, to find the extension with id `"vscode.git"`.                                        |
| `node:fs`         | `existsSync`                       | Synchronous existence check of `git.path` candidates. A directory counts as existing; the tests' expectations match this. |
| `@/backend/types` | `DateType` (type)                  | Return type of `dateType`.                                                                                                |
| `@/types`         | `DateFormat`, `GraphStyle` (types) | Return types of `dateFormat` and `graphStyle`.                                                                            |

Relevant VS Code behaviour:

- `WorkspaceConfiguration.get(key, defaultValue)` returns the default when no scope defines the key, and otherwise the stored value as it is. VS Code validates settings against the manifest only to warn in the editor; an invalid stored value is still returned.
- The built-in Git extension (`vscode.git`) exports an object with `getAPI(1)`. The returned API has `git.path`, the absolute path of the Git executable the extension found. `getAPI` throws when the extension is disabled through `git.enabled: false`. `Extension.activate()` resolves to the exports.

### A.3 Behaviour

**Reading Branchwise settings.** Each getter other than `gitPath` asks VS Code for the setting on every call: it obtains the configuration for section `"branchwise"` and calls `get` with the key (the property name, without the `branchwise.` prefix) and the default from the table as the second argument. Nothing is cached, so a changed setting is visible on the next call. The tests' `vscode` mocks return the second argument of `get`, which is how `config.test.ts` compares the defaults with the manifest.

**Booleans and fixed choices.** `autoCenterCommitDetailsView`, `dateFormat`, `dateType`, `graphStyle`, `showCurrentBranchByDefault`, `showUncommittedChanges` and `tabIconColourTheme` return exactly what VS Code returns. They do not check that the value is a boolean or one of the allowed strings (see config Q3).

**Numbers.** `initialLoadCommits`, `loadMoreCommits` and `maxDepthOfRepoSearch` apply `wholeNumber` to the stored value with lower bounds 1, 1 and 0 and fallbacks 300, 100 and 0.

**`wholeNumber(value, minimum, fallback)`.**

- When `value` is a primitive number that is finite, the result is `value` rounded down (toward negative infinity) to an integer, raised to `minimum` if it is below it. There is no upper bound. Negative zero with minimum 0 yields positive zero.
- For anything else the result is `fallback`, unchanged: `NaN`, `Infinity`, `-Infinity`, numeric strings such as `"500"`, `Number` objects, `BigInt`, booleans, `null`, `undefined`, objects.

**Graph colours.** `graphColours` reads the stored list (default: the twelve colours) and returns a new array with, in their original order, only the entries that satisfy the colour format declared by the manifest's `branchwise.graphColours` item `pattern`. The accepted forms are:

- optional leading and trailing whitespace (spaces, tabs, newlines) around the colour;
- `#` followed by exactly 6 or exactly 8 hexadecimal digits, upper or lower case; or
- lowercase `rgb` or `rgba`, optional whitespace, `(`, three decimal integers of 1 to 3 digits separated by commas, where each comma may be followed by whitespace, and `)` directly after the third integer.

Kept entries are returned verbatim, including surrounding whitespace and letter case. Rejected, among others: 3- or 4-digit hex, `#` with 7 digits, named colours, `RGB(...)` in capitals, whitespace directly after `(` or before a comma, a fourth (alpha) component, integers of 4 or more digits, `hsl(...)`. Integers above 255 with at most 3 digits are accepted. An entry that is not a string is dropped, except that one whose string form would match is kept as it is: a nested array `["#000000"]` survives as an array (see config Q2). An empty list, or a list with nothing valid, yields `[]`. When the stored value is not an array (a string, `null`, an object), the getter throws a `TypeError` (see config Q1).

**`gitPath`.**

- When a previous `resolveBuiltInGitPath` call recorded a path, `gitPath()` returns that path, whatever `git.path` says.
- Otherwise it reads `vscode.workspace.getConfiguration("git").get("path")`, called with the key only and no default, on every call, and returns `configuredGitPath` of that value.

**`configuredGitPath(value)`.**

1. The candidates are the elements of `value` when it is an array, and otherwise `value` alone.
2. Only strings that contain something other than whitespace remain candidates. They are kept as written, not trimmed.
3. The result is the first candidate that exists on disk, checked synchronously with the exact string. A directory counts as existing. A relative path is checked against the extension host's current working directory.
4. When no candidate exists, the result is the first candidate (see config Q6).
5. When there are no candidates, the result is `"git"`, which the operating system resolves through `PATH`.

**`resolveBuiltInGitPath()`.**

1. Looks up the extension `"vscode.git"`.
2. If it is active, uses its current exports. If it is installed but not active, awaits its `activate()` and uses the value that resolves to.
3. Calls `getAPI(1)` on those exports and reads `git.path`.
4. When that value is truthy, it becomes the recorded path. Otherwise (extension missing, no API, empty path) the recorded path is cleared.
5. Any exception or rejection along the way (lookup throws, `activate()` rejects, `getAPI` throws) also clears the recorded path. The returned promise still resolves.
6. Each call replaces the previous outcome: a failing call after a successful one clears the path again.

Timing: activation starts this call without waiting for it. Until it settles, `gitPath()` returns the `git.path`-based value, afterwards the built-in path (see config Q5).

### A.4 Examples

All observed with a `vscode` mock whose `get` returns the stored value when present and otherwise the default.

| Stored settings                                                                                                                                                                                             | Call                      | Result                                                                                                                          |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| nothing stored, no built-in path                                                                                                                                                                            | every getter              | `true`, `"Date & Time"`, `"Author Date"`, `"git"`, the 12 defaults, `"rounded"`, `300`, `100`, `0`, `false`, `true`, `"colour"` |
| `graphColours: ["#abcdef", " #ABCDEF ", "#abcdef12", "#fff", "red", "rgb(1,2,3)", "rgba(1, 2, 3)", "rgba(1,2,3,0.5)", "rgb (999,  0,0)", "rgb( 1,2,3)", "rgb(1 ,2,3)", 5, null, "#abcdefg", "\t#000000\n"]` | `graphColours()`          | `["#abcdef", " #ABCDEF ", "#abcdef12", "rgb(1,2,3)", "rgba(1, 2, 3)", "rgb (999,  0,0)", "\t#000000\n"]`                        |
| `graphColours: [["#000000"], {"a":1}, true, "#00000", "#0000000", "RGB(1,2,3)", "rgb(1,2,3) ", "rgb(1,2)", "rgb(1000,2,3)", "rgb(1,\t2,\n3)", "#GGGGGG", "  #aAbBcC"]`                                      | `graphColours()`          | `[["#000000"], "rgb(1,2,3) ", "rgb(1,\t2,\n3)", "  #aAbBcC"]`                                                                   |
| `graphColours: []`                                                                                                                                                                                          | `graphColours()`          | `[]`                                                                                                                            |
| `graphColours: "red"` (or `null`)                                                                                                                                                                           | `graphColours()`          | throws `TypeError`                                                                                                              |
| `dateFormat: "Nonsense", graphStyle: 7, tabIconColourTheme: "blue", autoCenterCommitDetailsView: "yes"`                                                                                                     | the four getters          | `"Nonsense"`, `7`, `"blue"`, `"yes"`                                                                                            |
| `initialLoadCommits: 300.5, loadMoreCommits: -1, maxDepthOfRepoSearch: "2"`                                                                                                                                 | the three numeric getters | `300`, `1`, `0`                                                                                                                 |
| `initialLoadCommits: 2.9, loadMoreCommits: -0.5, maxDepthOfRepoSearch: -0.5`                                                                                                                                | the three numeric getters | `2`, `1`, `0`                                                                                                                   |
| `initialLoadCommits: 1e21, loadMoreCommits: true, maxDepthOfRepoSearch: 3.99`                                                                                                                               | the three numeric getters | `1e21`, `100`, `3`                                                                                                              |

| Call                                                         | Result                             |
| ------------------------------------------------------------ | ---------------------------------- |
| `wholeNumber(300.5, 1, 300)`                                 | `300`                              |
| `wholeNumber(-1, 1, 300)` / `wholeNumber(0, 1, 300)`         | `1` / `1`                          |
| `wholeNumber(-2, 0, 0)`                                      | `0`                                |
| `wholeNumber(NaN, 1, 300)` / `wholeNumber(Infinity, 1, 300)` | `300` / `300`                      |
| `wholeNumber("500", 1, 300)` / `wholeNumber(null, 1, 300)`   | `300` / `300`                      |
| `wholeNumber(42, 1, 300)`                                    | `42`                               |
| `wholeNumber(-0, 0, 5)`                                      | `0` (positive zero)                |
| `wholeNumber(5, 10, 1)`                                      | `10`                               |
| `wholeNumber(undefined, 1, -5)`                              | `-5` (the fallback is not bounded) |
| `wholeNumber(new Number(3), 1, 2)` / `wholeNumber(3n, 1, 2)` | `2` / `2`                          |

With `/tmp/x/git` an existing file and `/tmp/x/adir` an existing directory:

| Call                                                                                                                | Result                                                               |
| ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `configuredGitPath(undefined)`, `(null)`, `("")`, `(" ")`, `([])`, `(["", "  ", "\t"])`, `({ path: "/tmp/x/git" })` | `"git"`                                                              |
| `configuredGitPath("/tmp/x/git")`                                                                                   | `"/tmp/x/git"`                                                       |
| `configuredGitPath("git-custom")` (does not exist)                                                                  | `"git-custom"`                                                       |
| `configuredGitPath(["/tmp/x/missing", "/tmp/x/git"])`                                                               | `"/tmp/x/git"`                                                       |
| `configuredGitPath(["/tmp/x/missing", "/tmp/x/gone"])`                                                              | `"/tmp/x/missing"`                                                   |
| `configuredGitPath([" ", 5, null, "a-missing"])`                                                                    | `"a-missing"`                                                        |
| `configuredGitPath([5, "/tmp/x/git"])`                                                                              | `"/tmp/x/git"`                                                       |
| `configuredGitPath("/tmp/x/adir")`                                                                                  | `"/tmp/x/adir"`                                                      |
| `configuredGitPath(" /tmp/x/git")`                                                                                  | `" /tmp/x/git"` (not found because of the space, returned untrimmed) |

`resolveBuiltInGitPath` followed by `extConfig.gitPath()`, with `git.path` set to `"/other"`:

| `vscode.extensions.getExtension("vscode.git")` returns                                                            | `gitPath()` afterwards               |
| ----------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| `undefined`                                                                                                       | `"/other"` (via `configuredGitPath`) |
| active extension whose `exports.getAPI(1)` returns `{ git: { path: "/builtin/git" } }` (`activate` is not called) | `"/builtin/git"`                     |
| inactive extension whose `activate()` resolves to exports returning path `"/activated/git"`                       | `"/activated/git"`                   |
| active, API path `""`                                                                                             | `"/other"`                           |
| active, `getAPI` throws                                                                                           | `"/other"`                           |
| inactive, `activate()` rejects (after an earlier successful call)                                                 | `"/other"`                           |
| `getExtension` itself throws (after an earlier successful call)                                                   | `"/other"`                           |

### A.5 Non-functional requirements

- **Import time.** Importing the module must not touch `vscode`. The `vscode` mocks of `scan-repo.test.ts` and `scan-repo-windows.test.ts` define only `workspace`, and the one in `config-watcher.test.ts` defines only `env` and `workspace`; these tests load the real module.
- **Where `vscode.extensions` is touched.** Only inside `resolveBuiltInGitPath`.
- **State.** The only state is the recorded built-in path. It is shared by every importer for the life of the extension host.
- **Purity.** `wholeNumber` is pure. `configuredGitPath` only reads the file system. The getters only read settings, and `gitPath` may check the file system once per candidate.
- **Cost.** Getters are synchronous and cheap. `gitPath` is called for every Git operation, so it must not do more than the existence checks described.
- **Shape of `extConfig`.** It is handed as a whole to other code, which calls its members as methods. Members must not depend on `this`.
- **`resolveBuiltInGitPath` never rejects**, because activation ignores the promise; a rejection would be an unhandled rejection.

### A.6 Test coverage

**Already checked.**

- `tests/extension/config.test.ts`:
  - every getter except `gitPath` returns the manifest default when nothing is stored, and `gitPath()` returns `"git"`;
  - `configuredGitPath` for `undefined`, `null`, `" "`, an existing file (in a directory whose name contains a space and a parenthesis), a missing name, a list whose second entry exists, a list where none exist, and `[]`;
  - `wholeNumber` for `300.5`, `-1`, `0`, minimum 0 with `-2`, `NaN`, `Infinity`, `"500"`, `null`, `42`;
  - the three numeric getters apply the bounds (`300.5`, `-1`, `"2"`);
  - the manifest declares the three numeric settings as integers with minimums 1, 1 and 0.
- `tests/extension/config-watcher.test.ts`: `initialLoadCommits` of `50.7` arrives as `50` through `webviewConfig()`, and changed `graphStyle` and `dateFormat` are read live.
- `tests/extension/activation.test.ts`: activation, which calls `resolveBuiltInGitPath` with `getExtension` returning `undefined`, completes and registers every command.
- `scan-repo.test.ts`, `file-history-command.test.ts`: `gitPath()` yields a working `"git"` with no `git.path`.

**Gaps.** V8 coverage shows the built-in extension branch and the failure branch of `resolveBuiltInGitPath` never run.

- **config G1, colour filtering.** Setup: `branchwise.graphColours` stored as the first colour list in A.4. Call: `extConfig.graphColours()`. Expect: the filtered list shown there, in order, entries unchanged.
- **config G2, new array.** Setup: stored list `["#000000"]`. Call: `graphColours()`. Expect: equal to the stored list but not the same array object.
- **config G3, non-array colours.** Setup: stored `"red"`. Call: `graphColours()`. Expect: whatever config Q1 decides (today: throws `TypeError`).
- **config G4, active Git extension.** Setup: `getExtension("vscode.git")` returns `{ isActive: true, exports: { getAPI: (v) => ({ git: { path: "/builtin/git" } }) }, activate }`, `git.path` stored as `"/other"`. Call: `await resolveBuiltInGitPath()`, then `gitPath()`. Expect: `"/builtin/git"`; `getAPI` called once with `1`; `activate` not called.
- **config G5, inactive Git extension.** Setup: `{ isActive: false, activate: async () => ({ getAPI: () => ({ git: { path: "/activated/git" } }) }) }`. Call: as G4. Expect: `"/activated/git"`, `activate` called once.
- **config G6, failures fall back and resolve.** For each of: `getAPI` throws; `activate` rejects; `getExtension` throws; API path `""`; `getAPI` returns `undefined`. Setup: first a successful G4 call, then the failing extension. Call: `await resolveBuiltInGitPath()` (must resolve), then `gitPath()`. Expect: `configuredGitPath` of the stored `git.path`.
- **config G7, `git.path` read live.** Setup: no built-in path; stored `git.path` changes from `"/a"` to `["/missing", <existing file>]` between two calls. Call: `gitPath()` twice. Expect: `"/a"`, then the existing file. `getConfiguration` was called with `"git"` and `get` with `"path"`.
- **config G8, getters read live.** Setup: spy on `getConfiguration`, change the stored `graphStyle` between calls. Call: `graphStyle()` twice. Expect: each call returns the value stored at that moment.
- **config G9, passthrough of choices.** Setup: stored `dateFormat: "Nonsense"`, `tabIconColourTheme: "blue"`. Call: the getters. Expect: whatever config Q3 decides (today: returned unchanged).
- **config G10, more `wholeNumber` cases.** Calls: `wholeNumber(2.9, 1, 9)`, `wholeNumber(-0.5, 0, 9)`, `wholeNumber(-0, 0, 9)`, `wholeNumber(new Number(3), 1, 9)`, `wholeNumber(undefined, 1, -5)`. Expect: `2`, `0`, positive `0`, `9`, `-5`.
- **config G11, `configuredGitPath` edge cases.** Calls: a directory path; `" " + existingFile`; `[5, existingFile]`; `["", "  "]`; `{ path: existingFile }`. Expect: the directory; the untrimmed string; the file; `"git"`; `"git"`.

### A.7 Questions

- **config Q1.** A `branchwise.graphColours` value that is not an array (a string, `null`, an object) makes `graphColours()` throw. That propagates into `webviewConfig()`, so the page fails to open ("Unable to open the graph: …") and every `config.changed` notification fails in the configuration listener. Intended may be to fall back to the default colours.
- **config Q2.** The colour check accepts `rgba(r, g, b)` without an alpha component but rejects `rgba(r, g, b, a)`, accepts components up to 999, keeps surrounding whitespace, and keeps a nested array whose string form is a colour (it then reaches the page as a non-string). The manifest pattern is the same, so the settings editor warns about the same values. Is keeping the manifest pattern as the single rule intended, or should the check be stricter (strings only, alpha allowed, 0-255, trimmed)?
- **config Q3.** Settings with fixed choices and booleans are passed on unvalidated, so `dateFormat: "Nonsense"` or `showUncommittedChanges: "no"` reach the page or the backend as is. Intended may be to fall back to the default for a value outside the declared choices.
- **config Q4.** Numeric settings have no upper bound. `initialLoadCommits: 1e21` becomes Git's `--max-count=1e+21`, which Git rejects, and a large `maxDepthOfRepoSearch` makes the workspace walk very long. Is an upper bound wanted?
- **config Q5.** The built-in Git extension's path always wins over `git.path`, and it is resolved only once, at activation. Changing `git.path` later triggers a repository rescan (the configuration watcher reacts to `git.path`) but has no effect while the built-in path is known. And until the activation-time lookup settles, `gitPath()` returns the `git.path`-based value, so the first Git processes of a session can use a different executable from later ones. Intended?
- **config Q6.** When no `git.path` candidate exists, the result is the first (missing) candidate, so every Git process fails. VS Code's Git extension instead falls back to its normal search when the configured paths fail. Also, candidates are not trimmed, a directory is accepted as an executable, and a relative path is checked against the extension host's working directory. Intended?

---

## B. `src/extension/html.ts`

In one sentence: the module produces the HTML page that each graph webview loads, with a strict Content Security Policy, the bundled script and stylesheet, and a few localized strings the page needs before it can talk to the extension.

### B.1 Interface

Two runtime exports, no types.

**`export function createWevbviewHtml(ctx: vscode.ExtensionContext, webview: vscode.Webview): string`**

The name's spelling (`Wevbview`) is part of the interface: module D, `webview-html.test.ts` and the `vi.mock` in `view-command.test.ts` use it (see html Q1).

- `ctx`: the extension context. Only `ctx.extensionUri` is read.
- `webview`: the panel's webview. Only `webview.cspSource` and `webview.asWebviewUri(uri)` are used.
- Returns the complete HTML document as a string.

**`export function escapeAttribute(value: string): string`**

Escapes the characters that could end or corrupt an attribute value written between double quotes, and returns the escaped text.

**Who uses what**

| User                                   | Exports used                                                                              |
| -------------------------------------- | ----------------------------------------------------------------------------------------- |
| `src/extension/view-command.ts` (D)    | `createWevbviewHtml`, once per new panel; the result is assigned to `panel.webview.html`. |
| `tests/extension/webview-html.test.ts` | both exports                                                                              |
| `tests/extension/view-command.test.ts` | replaces the module with `{ createWevbviewHtml: () => "<html>graph</html>" }`             |

### B.2 Dependencies the implementation must use

| Import                                  | Name(s)                                                              | Use                                                                         |
| --------------------------------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `vscode`                                | `Uri.joinPath`                                                       | Build `<extensionUri>/out/web.min.css` and `<extensionUri>/out/web.min.js`. |
| `vscode`                                | `env.language`                                                       | The display language for the `lang` attribute.                              |
| `vscode`                                | `l10n.t`                                                             | Translate the three shell strings.                                          |
| `node:crypto`                           | a cryptographically secure random source (for example `randomBytes`) | The per-page script nonce.                                                  |
| `./constants` (`@/extension/constants`) | `EXTENSION_NAME` (`"Branchwise"`)                                    | The document title.                                                         |

### B.3 Behaviour

`createWevbviewHtml` returns an HTML5 document with this content. Whitespace between elements is not significant; element order and attribute values are.

1. `<!DOCTYPE html>` first.
2. The `<html>` start tag carries exactly four attributes, in this order, each value double-quoted and passed through `escapeAttribute`:
   - `lang`: `vscode.env.language` (for example `en`, `de`, `zh-tw`).
   - `data-loading`: `vscode.l10n.t("Loading…")`. The key ends in the single character U+2026, not three dots.
   - `data-init-failed`: `vscode.l10n.t("Unable to open the graph: {0}")`.
   - `data-rpc-timeout`: `vscode.l10n.t("The extension did not answer in time: {0}")`.

   `l10n.t` is called with the key alone, so `{0}` stays in the text; the page puts an error message or an RPC method name there itself. The page reads these attributes as `document.documentElement.dataset.loading`, `.initFailed` and `.rpcTimeout` (`src/webview/lib/shell-text.ts`). The page has no localized strings until the `webview.initialize` answer arrives, and needs these three while it loads, when that answer fails, and when any request times out. The attribute names are therefore fixed. The three keys must be passed to `vscode.l10n.t` as literal strings so that `pnpm run l10n:export` keeps extracting them; the English and translated bundles in `l10n/` already contain them.

3. In `<head>`, in this order:
   - `<meta charset="UTF-8">`;
   - `<meta http-equiv="Content-Security-Policy" content="…">` whose content has exactly these directives: `default-src 'none'`; `style-src <cspSource> 'unsafe-inline'`; `script-src <cspSource> 'nonce-<nonce>'`; `img-src data:`; `connect-src <cspSource>`. `<cspSource>` is `webview.cspSource` as given. Directives are separated by `;` and the content ends with `;`. (Today the content has a line break inside it; CSP ignores that whitespace.)
   - `<meta name="viewport" content="width=device-width, initial-scale=1.0">`;
   - `<link rel="stylesheet" href="…">` whose `href` is the string form of `webview.asWebviewUri(vscode.Uri.joinPath(ctx.extensionUri, "out", "web.min.css"))`;
   - `<title>Branchwise</title>`.
4. In `<body>`, in this order:
   - an empty `<div id="app"></div>` (the page renders into the element with id `app`);
   - `<script nonce="<nonce>" src="…"></script>` whose `src` is the string form of `webview.asWebviewUri(vscode.Uri.joinPath(ctx.extensionUri, "out", "web.min.js"))`.
5. The nonce is new for every call and comes from a cryptographically secure source. Today it is 32 random bytes in unpadded base64url, 43 characters from `A-Z a-z 0-9 - _`. It must consist only of base64 or base64url characters, which is what the CSP nonce syntax allows, and carry at least 128 bits. The same nonce appears in the CSP and in the `<script>` tag.
6. `cspSource`, the two resource URIs and the title are inserted without escaping (see html Q2).

`escapeAttribute(value)` replaces every `&` with `&amp;`, every `"` with `&quot;`, every `<` with `&lt;` and every `>` with `&gt;`. An `&` in the input is escaped once, so existing entities are not preserved (`&quot;` becomes `&amp;quot;`). All other characters, including `'` and non-ASCII text, pass unchanged. The empty string maps to itself.

### B.4 Examples

Observed with `env.language` = `en"<x>&`, `l10n.t` returning its key, `extensionUri` = `EXT`, `joinPath` joining with `/`, `asWebviewUri` prefixing `vscode-resource:`, and `cspSource` = `https://csp.example`. The document contained these parts, in this order (layout whitespace left out, since it is not part of the contract; `N` stands for that call's nonce, observed for example as `Eup9MAwz5OUCLiBKr3-VHBg2YH-NIfpC3-maFql9LsM`):

| Part              | Observed attribute values or content                                                                                                                                                                                                                                                               |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| doctype           | `<!DOCTYPE html>`                                                                                                                                                                                                                                                                                  |
| `html` start tag  | `lang` = `en&quot;&lt;x&gt;&amp;`; `data-loading` = `Loading…`; `data-init-failed` = `Unable to open the graph: {0}`; `data-rpc-timeout` = `The extension did not answer in time: {0}`                                                                                                             |
| `meta`            | `charset` = `UTF-8`                                                                                                                                                                                                                                                                                |
| `meta`            | `http-equiv` = `Content-Security-Policy`; `content` = `default-src 'none'; style-src https://csp.example 'unsafe-inline'; script-src https://csp.example 'nonce-N'; img-src data:; connect-src https://csp.example;` (with a line break where this table shows the space after `'unsafe-inline';`) |
| `meta`            | `name` = `viewport`; `content` = `width=device-width, initial-scale=1.0`                                                                                                                                                                                                                           |
| `link`            | `rel` = `stylesheet`; `href` = `vscode-resource:EXT/out/web.min.css`                                                                                                                                                                                                                               |
| `title`           | `Branchwise`                                                                                                                                                                                                                                                                                       |
| `body` > `div`    | `id` = `app`, empty                                                                                                                                                                                                                                                                                |
| `body` > `script` | `nonce` = `N`; `src` = `vscode-resource:EXT/out/web.min.js`; empty                                                                                                                                                                                                                                 |

Two consecutive calls produced different nonces. With the test's mock, where `l10n.t` returns `«<key>» "quoted" & <tagged>`, the `data-loading` value is `«Loading…» &quot;quoted&quot; &amp; &lt;tagged&gt;`.

| `escapeAttribute(…)` | Result                                     |
| -------------------- | ------------------------------------------ |
| `a "b" & <c>`        | `a &quot;b&quot; &amp; &lt;c&gt;`          |
| `&quot;`             | `&amp;quot;`                               |
| `it's`               | `it's`                                     |
| `a&&b<<>>""`         | `a&amp;&amp;b&lt;&lt;&gt;&gt;&quot;&quot;` |
| `中文 «»`            | `中文 «»`                                  |
| (empty string)       | (empty string)                             |

### B.5 Non-functional requirements

- No file or network access, no Git, no state between calls apart from randomness.
- Only `env.language`, `l10n.t` and `Uri.joinPath` of `vscode` may be touched: the `webview-html.test.ts` mock defines nothing else. Only `extensionUri` of the context and `cspSource` and `asWebviewUri` of the webview may be read: the test passes objects with nothing else. Nothing may be touched at import time.
- Resource URIs are converted with their string form (template interpolation calls `toString()`); the test's `joinPath` returns plain strings and its `asWebviewUri` returns its argument.
- `escapeAttribute` is pure.

### B.6 Test coverage

**Already checked** (`tests/extension/webview-html.test.ts`): `lang` equals the display language; `data-loading` equals `escapeAttribute` of the translated text; `data-init-failed` and `data-rpc-timeout` contain their English keys; a double quote in translated text cannot end the attribute; the `escapeAttribute` example `a "b" & <c>`.

**Gaps.**

- **html G1, CSP.** Setup: as in the test, with `cspSource` = `"csp"`. Call: `createWevbviewHtml`. Expect: the CSP meta content, split on `;` and trimmed, is exactly `default-src 'none'`, `style-src csp 'unsafe-inline'`, `script-src csp 'nonce-<n>'`, `img-src data:`, `connect-src csp`.
- **html G2, nonce.** Call twice. Expect: in each document the `<script>` tag's `nonce` equals the CSP nonce; it matches `^[A-Za-z0-9_-]{22,}$`; the two documents' nonces differ.
- **html G3, resources.** Setup: `asWebviewUri` records its argument and returns `"U(" + arg + ")"`. Expect: `joinPath` called with `(extensionUri, "out", "web.min.css")` and `(extensionUri, "out", "web.min.js")`; the stylesheet `href` is `U(ext/out/web.min.css)` and the script `src` is `U(ext/out/web.min.js)`.
- **html G4, skeleton.** Expect: the document starts with `<!DOCTYPE html>`, contains `<title>Branchwise</title>`, one `<div id="app"></div>` before the script, and the charset and viewport metas.
- **html G5, attribute order.** Expect: the `<html>` tag's attribute names in order are `lang`, `data-loading`, `data-init-failed`, `data-rpc-timeout`.
- **html G6, escaping rules.** Calls: `escapeAttribute("&quot;")`, `escapeAttribute("it's")`, `escapeAttribute("")`. Expect: `&amp;quot;`, `it's`, empty string.
- **html G7, translation keys.** Setup: `l10n.t` records its arguments. Expect: exactly the three keys, each called with no further arguments.

### B.7 Questions

- **html Q1.** `createWevbviewHtml` is misspelled. Renaming it would touch module D, `webview-html.test.ts` and the mock in `view-command.test.ts` together. Keep the name, or rename in the same change?
- **html Q2.** `webview.cspSource`, the resource URIs and the title are inserted without escaping. They come from VS Code and a constant, so this is safe today; should they be escaped anyway?
- **html Q3.** The policy allows `connect-src <cspSource>` although the page makes no network requests, and allows inline styles (`'unsafe-inline'`), which the page's components use. Is `connect-src` still needed?

---

## C. `src/extension/legacy.ts`

In one sentence: the module connects the older command-message protocol (the `{ command, … }` messages that drive graph queries and Git actions) to each graph panel, owns the per-workspace repository state shared by all panels, and registers the provider that serves historical file contents to VS Code's diff editors.

### C.1 Interface

One runtime export.

**`export function createMessageProtocol(ctx: vscode.ExtensionContext): { attach(panel: vscode.WebviewPanel): { dispose(): void } }`**

- `ctx`: the extension context. It is used for `ctx.subscriptions` (one registration is pushed) and, through the extension state, `ctx.workspaceState`, `ctx.globalState` and `ctx.globalStoragePath`.
- The returned object has exactly one member, `attach`.
- `attach(panel)`: connects one graph panel. It reads `panel.visible`, uses `panel.webview` (message listener and `postMessage`) and subscribes to `panel.onDidChangeViewState`. It returns an object whose only member is `dispose()`, usable wherever a `vscode.Disposable` is expected.

**Who uses what**

| User                                   | Uses                                                                                                                                                                                    |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/extension/view-command.ts` (D)    | calls `createMessageProtocol(ctx)` once when the view command is created (during activation); calls `attach(panel)` for every new panel and disposes the result when that panel closes. |
| `tests/extension/view-command.test.ts` | replaces the module with `{ createMessageProtocol: () => ({ attach: () => ({ dispose }) }) }`                                                                                           |
| `tests/extension/activation.test.ts`   | runs the real module through `activate` and checks its creation-time effects.                                                                                                           |

### C.2 Dependencies the implementation must use

| Import                            | Name(s)                                         | Contract relied on                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| --------------------------------- | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@/old-extension/extensionState`  | `ExtensionState`                                | `new ExtensionState(ctx)`. Construction clears data earlier versions kept: if `globalState` holds `avatarCache`, it is updated to `undefined`, and the directory `<globalStoragePath>/avatars` is removed recursively in the background, ignoring errors. It stores saved per-repository state under the workspace-state key `repoStates`.                                                                                                                                                                                                |
| `@/old-extension/repoManager`     | `createRepoManager`                             | `createRepoManager(extensionState)` returns the repository manager. Its `getRepos()` returns the saved state keyed by repository path (a sorted copy, read live).                                                                                                                                                                                                                                                                                                                                                                         |
| `@/old-extension/diffDocProvider` | `DiffDocProvider`                               | Static `scheme` is `"branchwise"`. `new DiffDocProvider(forRepo, isSavedRepo)`, where `forRepo(repo: string): SimpleGit` gives a Git client for a repository and `isSavedRepo(repo: string): boolean` says whether the repository has saved state (so editors restored from an earlier session can load). When VS Code asks for a `branchwise:` document it runs `git show --end-of-options <commit>:<path>` (or `<blob id>`) in that repository through the client, for repositories this session encoded or that `isSavedRepo` accepts. |
| `@/backend/gitClient`             | `gitClientFactory`                              | `gitClientFactory(repoPath, gitPath).getInstance()` returns a simple-git client that runs `<gitPath> --no-optional-locks -c log.showSignature=false -c status.showUntrackedFiles=all -c color.ui=never -c color.branch=never -c color.diff=never -c color.status=never -c color.showBranch=never -c color.grep=never <command>` in `repoPath`.                                                                                                                                                                                            |
| `@/extension/config`              | `extConfig`                                     | Passed whole to the message handlers; `gitPath()` read for each diff-document client.                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `@/old-extension/messageHandler`  | `registerMessageHandlers`                       | `registerMessageHandlers(bridge, { config, repoManager })` registers every legacy command handler on the bridge and returns `{ onPanelShown(): void; dispose(): void }`. `onPanelShown` forgets which repository the page last selected, so the next `selectRepo` message is treated as a new selection (it re-targets the repository watcher and cancels in-flight graph queries). `dispose` aborts in-flight queries; running actions, remote loads and a pending Undo finish on their own.                                             |
| `@/old-extension/webviewBridge`   | `webviewBridgeFactory`, type `WebviewBridge`    | `webviewBridgeFactory(webview)` registers one `onDidReceiveMessage` listener that routes `{ command }` messages to handlers, and returns `{ dispose(), post(message: ResponseMessage), onMessage(command, handler) }`. `post` returns the webview's `postMessage` promise.                                                                                                                                                                                                                                                                |
| `vscode`                          | `workspace.registerTextDocumentContentProvider` | Register the provider for the `branchwise` scheme.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |

### C.3 Behaviour

**`createMessageProtocol(ctx)`**, called once per activation:

1. Creates one extension state for `ctx` (with the clean-up side effects above) and one repository manager on top of it. Every panel attached later shares these two, so saved per-repository state survives closing and reopening the graph within a session.
2. Creates a diff-document provider and registers it for the scheme `"branchwise"` with `vscode.workspace.registerTextDocumentContentProvider`. It pushes the registration's disposable onto `ctx.subscriptions` (exactly one push). The provider receives:
   - a client factory that, for a repository path, returns `gitClientFactory(repo, extConfig.gitPath()).getInstance()`, reading the Git path at the moment a document is requested;
   - a predicate that returns `true` exactly when the repository manager's current saved state has an entry whose key equals the given path.
3. Runs no Git and registers no webview listener.
4. Returns `{ attach }`.

**`attach(panel)`**:

1. Remembers whether the panel is visible now.
2. Creates a webview bridge on `panel.webview`, then registers the legacy message handlers on it with `{ config: extConfig, repoManager }`, then subscribes to `panel.onDidChangeViewState`. All three happen synchronously inside `attach`, before it returns; module D attaches before it sets the page HTML, so no page message is missed.
3. On each view-state event:
   - if `panel.visible` equals the remembered visibility, nothing happens (events for focus or column changes are ignored);
   - if the panel became visible, the handlers' `onPanelShown()` is called first, then `{ command: "refresh" }` is posted through the bridge without waiting for the result; the page reloads its graph when it receives it;
   - if the panel became hidden, nothing is posted;
   - in both cases the new visibility is remembered.
     A panel attached while hidden gets its first refresh when it first becomes visible.
4. Returns `{ dispose }`. The first `dispose()` call disposes the message handlers (aborting their in-flight queries), the bridge (removing its message listener) and the view-state subscription, observed in that order; nothing relies on the order. Later calls do nothing.

There are no timers or debounces in this module.

### C.4 Examples

Observed with `messageHandler` and `gitClient` replaced by recorders and a fake panel:

| Step                                                                                                                    | Observed effect                                                                                                                                                                                                       |
| ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `createMessageProtocol(ctx)` with `globalState` holding `avatarCache` and an `avatars` directory in `globalStoragePath` | `registerTextDocumentContentProvider("branchwise", provider)`; `ctx.subscriptions.length` goes from 0 to 1; `globalState.update("avatarCache", undefined)`; the `avatars` directory is gone shortly after; no Git ran |
| provider's predicate with saved state `{ "/repo/a": { columnWidths: null } }`                                           | `"/repo/a"` → `true`; `"/repo/b"` → `false`                                                                                                                                                                           |
| provider's client factory for `"/repo/a"` with no `git.path`                                                            | `gitClientFactory("/repo/a", "git")`                                                                                                                                                                                  |
| `attach(panel)` with `panel.visible = true`                                                                             | webview message listener registered, then `registerMessageHandlers(bridge, { config: extConfig, repoManager })`, then `onDidChangeViewState` subscribed; nothing posted                                               |
| view-state events with visibility true, false, false, true, true                                                        | exactly one `onPanelShown()` and one posted `{ "command": "refresh" }`, both at the fourth event                                                                                                                      |
| `attach` with `panel.visible = false`, then an event with `visible = true`                                              | one `onPanelShown()`, one `{ "command": "refresh" }`                                                                                                                                                                  |
| `dispose()` twice                                                                                                       | handlers' `dispose`, bridge listener disposed, view-state subscription disposed, once each, in that order                                                                                                             |

### C.5 Non-functional requirements

- **Activation safety.** `activation.test.ts` runs `createMessageProtocol` with a `vscode` mock that has `workspace.registerTextDocumentContentProvider`, `workspace.onDidCloseTextDocument`, `workspace.getConfiguration` and `EventEmitter`, and asserts that simple-git is never constructed. Creation must stay within those members and must not run Git or read saved repository paths from disk.
- **Side effects at creation**, all required: the avatar clean-up (the activation test waits for the directory to disappear and checks the `globalState` update), the provider registration and the push onto `ctx.subscriptions`.
- **Background work** (the directory removal) must never reject unhandled.
- **Disposal** of an attachment is idempotent and leaves no listener on the panel.
- **No import-time effects.**

### C.6 Test coverage

**Already checked** (`tests/extension/activation.test.ts`, through `activate`): creation completes with a minimal `vscode` mock, runs no Git even when saved state names a deleted repository, removes the avatar cache directory and clears `avatarCache`. The provider itself is tested directly in `tests/extension/diff-doc-provider.test.ts` and `tests-ext/historyDocuments.test.ts`, not through this module. V8 coverage shows `attach` and the provider callbacks never run.

**Gaps.**

- **legacy G1, registration.** Setup: `vscode.workspace.registerTextDocumentContentProvider` records its arguments and returns a disposable; `ctx.subscriptions = []`. Call: `createMessageProtocol(ctx)`. Expect: one registration with scheme `"branchwise"` and a `DiffDocProvider` instance; `ctx.subscriptions` holds exactly that registration's disposable.
- **legacy G2, provider callbacks.** Setup: saved `repoStates` `{ "/repo/a": { columnWidths: null } }` in `workspaceState`; `@/backend/gitClient` mocked so that `gitClientFactory` records its arguments and returns a client whose `show` resolves `"content"`; the registered provider captured from the `registerTextDocumentContentProvider` mock. Build the URIs by hand (not with `encodeDiffDocUri`, which would mark the repository as opened this session): an object with `path` `/f.txt`, `query` `commit=<40 hex digits>&repo=%2Frepo%2Fa` and a unique `toString()`. Call: `provideTextDocumentContent` with it, then with the same URI for `%2Frepo%2Fb`. Expect: the first resolves `"content"` and `gitClientFactory` was called with `("/repo/a", extConfig.gitPath())`; the second returns `""` without calling `gitClientFactory`. Then store `git.path` as another value and request a new URI for `/repo/a`: the new value is used.
- **legacy G3, attach wiring.** Setup: `registerMessageHandlers` mocked. Call: `attach(panel)`. Expect: called once with a bridge and `{ config: extConfig, repoManager }`, where `repoManager` is the same object for two different attachments of one protocol.
- **legacy G4, refresh on becoming visible.** Setup: panel visible. Call: fire view-state events with visibility `true`, `false`, `false`, `true`, `true`. Expect: `webview.postMessage` called once with `{ command: "refresh" }`, and `onPanelShown` once, both at the fourth event, with `onPanelShown` before the post.
- **legacy G5, attach while hidden.** Setup: panel hidden. Call: event with visibility `true`. Expect: one refresh.
- **legacy G6, dispose.** Call: `dispose()` twice. Expect: handlers' `dispose`, the bridge's message listener and the view-state subscription each disposed exactly once.

### C.7 Questions

- **legacy Q1.** Only the provider's registration is disposed at deactivation. The provider instance itself, which holds a `workspace.onDidCloseTextDocument` subscription, a document cache and an event emitter, is never disposed. Should deactivation dispose it as well?
- **legacy Q2.** Every time the panel becomes visible again, the page is told to refresh and the current repository selection is reset (which cancels in-flight graph queries). The panel keeps its page alive while hidden (`retainContextWhenHidden`) and hidden pages already receive `repo.updated` notifications, so the refresh may be redundant work on every tab switch. Intended?
- **legacy Q3.** The saved-repository check compares path keys exactly. State saved by older versions under a differently normalized path (for example an uppercase Windows drive letter) would not match the normalized path the provider asks about, so such restored diff editors open empty. Is migrating or normalizing saved keys wanted?

---

## D. `src/extension/view-command.ts`

In one sentence: the module implements the `branchwise.view` command: it opens the single graph panel or brings it forward, wires every per-panel service to it, forwards Source Control and file-history clicks to the page as repository selections, and opens side panes on request.

### D.1 Interface

One runtime export.

**`export function createViewCommand(ctx: vscode.ExtensionContext): ViewCommand`**, where the returned value is a function with an extra method:

- the function: `(sourceControl?: Pick<vscode.SourceControl, "rootUri">, file?: string) => void`
  - `sourceControl`: an object whose `rootUri.fsPath` names a folder. VS Code passes the Source Control provider when the command runs from the `scm/title` button; the file-history command passes `{ rootUri: vscode.Uri.file(repo) }`; the command palette and the status bar pass nothing.
  - `file`: a path relative to the repository's top level with `/` separators, from the file-history command. It only has an effect together with `sourceControl`.
  - It returns `undefined` (not a promise). It declares two parameters, which VS Code fills positionally.
- `showPane(pane: SidebarPane): void`, where `SidebarPane` is `"refs" | "workspace"` from `@/types`: brings the graph forward and opens that side pane.

The type of the returned value is inferred today; callers use it only as a callable with `showPane`.

**Who uses what**

| User                                                           | Uses                                                                                                                                                                                                                                                                           |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/main.ts`                                                  | `createViewCommand(ctx)` once during activation. Registers the returned function itself as the `branchwise.view` handler; `branchwise.showBranches` calls `view.showPane("refs")`; the file-history command's callback calls `view({ rootUri: vscode.Uri.file(repo) }, file)`. |
| `tests/extension/view-command.test.ts`                         | `createViewCommand`, with every collaborator mocked (see D.5).                                                                                                                                                                                                                 |
| `tests/extension/activation.test.ts`                           | runs it through `activate`.                                                                                                                                                                                                                                                    |
| `tests-ext/extension.test.ts`, `tests-ext/ui/history.test.cjs` | run it inside VS Code through the commands.                                                                                                                                                                                                                                    |

### D.2 Dependencies the implementation must use

| Import                        | Name(s)                                                                                  | Contract relied on                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ----------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `vscode`                      | `window.createWebviewPanel`, `window.activeTextEditor`, `ViewColumn.One`, `Uri.joinPath` | Create and place the panel, build resource URIs.                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `node:path`                   | `basename`                                                                               | Display name of a selected repository.                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `./repoSelection`             | `getSourceControlRepo`                                                                   | `getSourceControlRepo(sourceControl)` returns the normalized path of `sourceControl.rootUri.fsPath` (forward slashes, lowercase Windows drive letter), or `undefined` when there is no `rootUri` or its `fsPath` is empty.                                                                                                                                                                                                                                                                                 |
| `./repoSelection`             | `createRepoSelection`                                                                    | `createRepoSelection(webview, send, onReady)` registers one `onDidReceiveMessage` listener and returns `{ select(repo), dispose() }`. `select` normalizes the path and keeps only the most recent one until the page posts `{ command: "viewReady" }`; on that message it calls `onReady()` and then `send(repo)` for the pending one. After that, `select` calls `send` at once. A later `viewReady` does not resend an old selection. `dispose` removes the listener and forgets the pending repository. |
| `@/backend/utils/git`         | `workTreeRoot`                                                                           | `workTreeRoot(directory, gitPath): Promise<string \| null>` runs `<gitPath> --no-optional-locks -c log.showSignature=false -c status.showUntrackedFiles=all -c color.ui=never -c color.branch=never -c color.diff=never -c color.status=never -c color.showBranch=never -c color.grep=never rev-parse --show-toplevel` in `directory` and resolves the normalized real path of the top level, or `null` outside a work tree or for a missing directory. It never rejects.                                  |
| `@/extension/workspace-scan`  | `addSessionRepo`                                                                         | Adds a repository to the list the page's picker and Workspace pane offer for the rest of the session (`repo.scan` includes it while its `.git` exists).                                                                                                                                                                                                                                                                                                                                                    |
| `./config`                    | `extConfig`                                                                              | `tabIconColourTheme()` when creating a panel; `gitPath()` for each click's lookup.                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `./constants`                 | `EXTENSION_NAME`                                                                         | Panel title `"Branchwise"`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `./html`                      | `createWevbviewHtml`                                                                     | The page HTML (module B).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `./legacy`                    | `createMessageProtocol`                                                                  | Module C.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `./rpc/rpc-server`            | `createRpcServer`                                                                        | `createRpcServer().attach(webview)` answers RPC requests from that webview until the returned disposable is disposed.                                                                                                                                                                                                                                                                                                                                                                                      |
| `./rpc/rpc-notify`            | `initRpcNotify`, `rpcNotify`                                                             | `initRpcNotify(webview)` makes that webview the target of notifications and returns a disposable that detaches it. `rpcNotify.notify(name, message)` posts a notification; its promise never rejects and callers ignore it. The post starts synchronously within the call.                                                                                                                                                                                                                                 |
| `./watchers/config.watcher`   | `initConfigWatcher`                                                                      | Returns a disposable. While alive, sends `repo.rescan` and `config.changed` when settings change.                                                                                                                                                                                                                                                                                                                                                                                                          |
| `./watchers/git.watcher`      | `watchGitDir`                                                                            | Returns a disposable. While alive, sends `repo.rescan` when a `.git` entry appears or disappears or workspace folders change.                                                                                                                                                                                                                                                                                                                                                                              |
| `./watchers/git-repo.watcher` | `watchGitRepo`                                                                           | Returns a disposable. While alive, sends `repo.updated` when the selected repository's Git data changes.                                                                                                                                                                                                                                                                                                                                                                                                   |
| `@/types`                     | `SidebarPane` (type)                                                                     | Parameter type of `showPane`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |

`view-command.test.ts` mocks these by the specifiers `@/extension/config`, `@/extension/html`, `@/extension/legacy`, `@/extension/rpc/rpc-server`, `@/extension/rpc/rpc-notify`, `@/extension/watchers/config.watcher`, `@/extension/watchers/git.watcher`, `@/extension/watchers/git-repo.watcher`, `@/backend/utils/git` and `@/extension/workspace-scan`, and uses the real `repoSelection`. The replacement must import each of these modules (relative or `@/` spelling), not reimplement them.

### D.3 Behaviour

**Creation, `createViewCommand(ctx)`.** It creates the message protocol for `ctx` (module C, with its creation-time effects) and one RPC server. Both last for the session and serve every panel. No panel is created, no Git runs, and no other `vscode` member is touched. State kept between calls: the open panel (at most one), whether its page has reported ready, at most one pending file-history request, at most one pending pane, and which click is the most recent.

**Calling the command, `view(sourceControl?, file?)`.** Two things happen, in this order.

_Selection._ The clicked folder is `getSourceControlRepo(sourceControl)`.

- No folder: any pending file-history request is discarded. A repository lookup already running is not cancelled, and a pending repository selection is not cleared. `file` is ignored.
- A folder: this click becomes the most recent one, and a lookup of its top level starts without being awaited: `workTreeRoot(folder, extConfig.gitPath())`. When it settles:
  1. The repository is the returned top level, or the clicked folder itself when the result is `null`.
  2. `addSessionRepo(repository)` is called, even when a later click has superseded this one and even when the panel has been closed meanwhile.
  3. If another click with a folder has happened since this one, nothing more happens.
  4. The pending file-history request becomes `{ repo: repository, path: file }` when `file` was given, and is cleared otherwise.
  5. If a panel is open, its repository selection is asked to select the repository. If no panel is open, the selection is dropped.

_Panel._

- A panel is open: `panel.reveal(vscode.window.activeTextEditor?.viewColumn)`. With no active editor the argument is `undefined`, which VS Code treats as the panel's current column. Nothing else happens.
- No panel is open: a new one is created and wired, in this order:
  1. `vscode.window.createWebviewPanel("branchwise", "Branchwise", column, options)`, where `column` is the active editor's `viewColumn`, or `vscode.ViewColumn.One` when there is no active editor, and `options` is `{ enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [joinPath(extensionUri, "media"), joinPath(extensionUri, "out")] }`.
  2. `panel.iconPath` is `joinPath(extensionUri, "resources", "webview-icon.svg")` when `extConfig.tabIconColourTheme()` returns `"colour"`, and otherwise `{ light: joinPath(extensionUri, "resources", "webview-icon-light.svg"), dark: joinPath(extensionUri, "resources", "webview-icon-dark.svg") }`.
  3. Per-panel services: the message protocol's `attach(panel)`, the RPC server's `attach(panel.webview)`, `initRpcNotify(panel.webview)`, `initConfigWatcher()`, `watchGitDir()`, `watchGitRepo()` (observed in this order; nothing relies on their relative order, only on all of them preceding step 5). The ready flag is cleared.
  4. A repository selection on `panel.webview` with the two callbacks below.
  5. `panel.webview.html = createWevbviewHtml(ctx, panel.webview)`. Every listener above must exist before this assignment.
  6. A `panel.onDidDispose` handler (below). The panel is recorded as open.

  A lookup started by the same call settles later and selects on this new panel.

**When the selection sends a repository** (the page is ready):

1. `rpcNotify.notify("repo.select", { name: basename(repository), path: repository })`, not awaited.
2. If the pending file-history request's `repo` equals `repository` exactly, `panel.webview.postMessage({ command: "fileHistory", repo, path })` is called without waiting, and the request is cleared. A request for a different repository stays pending. Because the notification's post starts inside the `notify` call, the page receives `repo.select` before `fileHistory`.

**When the page reports ready** (the selection's `onReady`): the ready flag is set, and a pending pane, if any, is sent with `rpcNotify.notify("view.showPane", { pane })` and cleared. This runs before the selection sends its pending repository, so on the first `viewReady` the page receives `view.showPane` before `repo.select`. A repeated `viewReady` from the same page sends nothing new.

**`showPane(pane)`.**

1. `pane` becomes the pending pane, replacing any earlier one.
2. The command runs as `view()` with no arguments: the panel is revealed or created, and a pending file-history request is discarded (see view Q1).
3. If the page is ready, `view.showPane` is sent at once and the pending pane is cleared. Otherwise it is sent when the page reports ready. Only the last pane requested before then is sent.

**When the panel closes** (`onDidDispose`): each per-panel disposable is disposed once. Observed order: the message protocol attachment, the RPC server attachment, the notification attachment, the configuration watcher, the `.git` watcher, the repository watcher, the repository selection; no test or caller relies on the order. Then the panel, the selection, the pending file-history request and the pending pane are forgotten and the ready flag is cleared. The next `view()` creates a new panel with new attachments; the message protocol and RPC server objects are reused.

**Timing.** The module has no timers or debounces. The only asynchronous step is one Git process per click, started when the command runs.

**Failure.** Nothing in the module throws in normal operation. The lookup never rejects; notifications are fire-and-forget.

### D.4 Examples

Observed with every collaborator replaced by a recorder, the real `repoSelection`, an active editor in column 2, `extensionUri` = `EXT`, and `joinPath` joining with `/`. "ready" means the fake page posted `{ command: "viewReady" }`.

| Step                                                                                                                                         | Observed calls, in order                                                                                                                                                                                                                                                                                                                                                                                          |
| -------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `createViewCommand(ctx)`                                                                                                                     | `createMessageProtocol(ctx)`, `createRpcServer()`. Returned: a function of length 2 with own key `showPane`.                                                                                                                                                                                                                                                                                                      |
| `view()`                                                                                                                                     | `createWebviewPanel("branchwise", "Branchwise", 2, { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: ["EXT/media", "EXT/out"] })`; message protocol attach; RPC server attach; `initRpcNotify`; `initConfigWatcher`; `watchGitDir`; `watchGitRepo`; selection listener registered; HTML created and assigned; `onDidDispose` registered. `iconPath` = `"EXT/resources/webview-icon.svg"`. |
| `view()` again; then with no active editor                                                                                                   | `reveal(2)`; `reveal(undefined)`                                                                                                                                                                                                                                                                                                                                                                                  |
| before ready: `view({ rootUri: { fsPath: "/w/a" } }, "f.txt")`; lookup resolves `"/real/a"`                                                  | `workTreeRoot("/w/a", <gitPath>)`, `reveal(2)`, then `addSessionRepo("/real/a")`; nothing sent                                                                                                                                                                                                                                                                                                                    |
| page ready                                                                                                                                   | `notify("repo.select", { name: "a", path: "/real/a" })`, `postMessage({ command: "fileHistory", repo: "/real/a", path: "f.txt" })`                                                                                                                                                                                                                                                                                |
| after ready: click `/w/loose`, lookup resolves `null`                                                                                        | `addSessionRepo("/w/loose")`, `notify("repo.select", { name: "loose", path: "/w/loose" })`                                                                                                                                                                                                                                                                                                                        |
| after ready: click `/w/c1` with file `one.txt`, then click `/w/c2`; `/w/c2` resolves `"/real/c2"` first, `/w/c1` resolves `"/real/c1"` later | `addSessionRepo("/real/c2")`, `notify("repo.select", { name: "c2", … })`, then `addSessionRepo("/real/c1")` only; no `fileHistory`                                                                                                                                                                                                                                                                                |
| after ready: `view.showPane("refs")`                                                                                                         | `reveal(2)`, `notify("view.showPane", { pane: "refs" })`                                                                                                                                                                                                                                                                                                                                                          |
| after ready: click `/w/d` with `d.txt`, then `view()` before the lookup resolves, then it resolves `"/real/d"`                               | `repo.select` for `/real/d`, then `fileHistory` for `d.txt` (the request is set after the argument-less call)                                                                                                                                                                                                                                                                                                     |
| panel closes                                                                                                                                 | disposes: message protocol, RPC server, notifications, configuration watcher, `.git` watcher, repository watcher, selection listener                                                                                                                                                                                                                                                                              |
| click `/w/e` with `e.txt`, panel closes, then the lookup resolves `"/real/e"`                                                                | `addSessionRepo("/real/e")` only                                                                                                                                                                                                                                                                                                                                                                                  |
| with `tabIconColourTheme` `"grey"`: `showPane("workspace")` then `showPane("refs")` before ready, then ready                                 | new panel with `iconPath` `{ light: "EXT/resources/webview-icon-light.svg", dark: "EXT/resources/webview-icon-dark.svg" }`, one `reveal(2)`; on ready only `notify("view.showPane", { pane: "refs" })`                                                                                                                                                                                                            |
| new panel: click `/w/f` with `f.txt`, `showPane("refs")`, lookup resolves `"/real/f"`, then ready                                            | on ready: `notify("view.showPane", { pane: "refs" })`, `notify("repo.select", { name: "f", path: "/real/f" })`, `postMessage({ command: "fileHistory", repo: "/real/f", path: "f.txt" })`                                                                                                                                                                                                                         |
| new panel: click `/w/a` with `f.txt`, lookup resolves, then `view()`, then ready                                                             | on ready: `notify("repo.select", …)` only; the file history is lost (view Q1)                                                                                                                                                                                                                                                                                                                                     |
| `view({ rootUri: { fsPath: "" } })`, `view({ rootUri: undefined })`, `view(undefined, "file.txt")`                                           | `reveal(2)` each; no lookup                                                                                                                                                                                                                                                                                                                                                                                       |

### D.5 Non-functional requirements

- **Test mocks bound what may be touched.**
  - `view-command.test.ts` defines only `window.activeTextEditor`, `window.createWebviewPanel`, `ViewColumn.One` and `Uri.joinPath` on `vscode`.
  - Its fake panel has only `webview.html`, `webview.onDidReceiveMessage`, `reveal` and `onDidDispose`, and accepts an `iconPath` assignment. It has no `webview.postMessage`, so `postMessage` may only be called for a file-history request, which that test does not make.
  - Its `extConfig` has only `tabIconColourTheme` and `gitPath`.
  - `activation.test.ts` runs `createViewCommand` with a `vscode` mock that has no `Uri.joinPath` and no `window.createWebviewPanel`, so creation must not touch them.
- **One panel at most**, and a second invocation never opens a second tab (`tests-ext/extension.test.ts`).
- **Git** runs only for clicks with a folder: one `rev-parse --show-toplevel` per click. Creation and argument-less calls run none.
- **Resources.** Every per-panel attachment is disposed exactly once when the panel closes. Nothing per-panel outlives it except `addSessionRepo` entries.
- **No unhandled rejections.** Promises returned by `notify` and `postMessage` are deliberately not awaited.
- **Import time.** No effects.

### D.6 Test coverage

**Already checked.**

- `tests/extension/view-command.test.ts`:
  - "honors SCM clicks on a new or existing panel, including clicks before initialization": two clicks before ready select only the second after `viewReady`; a click after ready notifies at once; an argument-less call notifies nothing; one panel, three reveals, the HTML assigned.
  - "selects the top level of a clicked subfolder, and the latest click wins": the lookup's top level is selected; a superseded click's late result is not selected but is still passed to `addSessionRepo`.
- `tests-ext/extension.test.ts`: the command opens a tab labelled `Branchwise`; a second run adds no tab; `branchwise.showBranches` opens the panel; after closing all editors the command opens a fresh panel.
- `tests-ext/ui/history.test.cjs`: after `branchwise.view` runs with a `rootUri`, the picker ends up showing that repository; Explorer file history opens the file's history in the graph.
- V8 coverage shows these never run in unit tests: the pane flush, the `fileHistory` post, the close handler, `showPane`, the `null`-lookup fallback, a click with a file, the no-editor column, the grey icon and the repository match for a pending file.

**Gaps.** Unless stated, the setup is the `view-command.test.ts` mocks, plus `webview.postMessage` on the fake panel and a captured `onDidDispose` handler.

- **view G1, file history after selection.** Call: `view(sc("/w/a"), "x/y.txt")`, then `viewReady`. Expect: `notify("repo.select", { name: "a", path: "/w/a" })`, then `postMessage({ command: "fileHistory", repo: "/w/a", path: "x/y.txt" })`, in that order.
- **view G2, file history of a superseded click.** Call: click `/w/1` with `one.txt` (slow lookup), click `/w/2` without a file, `viewReady`, then resolve both. Expect: no `fileHistory` post.
- **view G3, `null` top level.** Setup: `workTreeRoot` resolves `null`. Call: click `/w/loose`, then ready. Expect: `addSessionRepo("/w/loose")` and `repo.select` for `/w/loose`.
- **view G4, panel options.** Setup: `activeTextEditor` undefined. Call: `view()`. Expect: `createWebviewPanel("branchwise", "Branchwise", 1, { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [<ext>/media, <ext>/out] })`. Then with an editor in column 3, `view()` calls `reveal(3)`.
- **view G5, icon.** Setup: `tabIconColourTheme` returns `"grey"`. Call: `view()`. Expect: `iconPath` is `{ light: …/resources/webview-icon-light.svg, dark: …/resources/webview-icon-dark.svg }`; with `"colour"`, `…/resources/webview-icon.svg`.
- **view G6, `showPane` before ready.** Call: `showPane("workspace")`, `showPane("refs")`, then `viewReady`. Expect: one panel; exactly one `notify("view.showPane", { pane: "refs" })`, sent at `viewReady`.
- **view G7, `showPane` when ready.** Call: `view()`, `viewReady`, `showPane("refs")`. Expect: `reveal` then `notify("view.showPane", { pane: "refs" })` at once.
- **view G8, close.** Call: `view()`, then the captured `onDidDispose` handler. Expect: each of the seven per-panel disposables disposed once. Then `view()` creates a second panel; `createMessageProtocol` and `createRpcServer` were still called only once.
- **view G9, state cleared on close.** Call: `showPane("refs")` (not ready), close, `view()`, `viewReady`. Expect: no `view.showPane`. Similarly a pending file-history request does not survive a close.
- **view G10, late lookup after close.** Call: click `/w/e` (slow), close, resolve. Expect: `addSessionRepo` called; no `notify`; a later `view()` and `viewReady` send no `repo.select`.
- **view G11, creation.** Call: `createViewCommand(ctx)` only. Expect: `createMessageProtocol(ctx)` and `createRpcServer()` once each; no `createWebviewPanel`, no `workTreeRoot`.
- **view G12, order on first ready.** Call: click `/w/f` with `f.txt`, `showPane("refs")`, resolve, `viewReady`. Expect: `view.showPane`, then `repo.select`, then `fileHistory`. (Pin only if view Q8 keeps this order.)
- **view G13, HTML last.** Setup: record the order of `onDidReceiveMessage`, attach calls and the `html` assignment. Call: `view()`. Expect: every attach and listener registration happens before `html` is assigned.

### D.7 Questions

- **view Q1.** A file-history request can be lost depending on timing. If the lookup for a file-history click finishes before the page is ready, and the command then runs without a folder (status bar, command palette, or `showPane`), the pending file history is discarded and only the repository is selected. If the same call happens while the lookup is still running, the file history survives. Intended may be that an argument-less call never discards a pending file history, or always does.
- **view Q2.** `localResourceRoots` includes `<extension>/media`, which does not exist in the repository or the package. Stale entry or intentional?
- **view Q3.** Every invocation, including Source Control clicks and file history, calls `reveal` with the active editor's column, which moves an open graph into that editor group. Should an open graph be revealed where it is?
- **view Q4.** The tab icon is chosen only when the panel is created; changing `branchwise.tabIconColourTheme` does not update an open panel. Intended?
- **view Q5.** A click whose lookup finishes after its panel was closed is offered in later scans but never selected; reopening the graph shows the first repository instead of the clicked one. Intended?
- **view Q6.** `view(undefined, file)` silently ignores `file`. Only the file-history command passes a file, always with a folder, so this is unreachable today. Should it be rejected or logged?
- **view Q7.** The panel title is the product name and is not localized. Intended?
- **view Q8.** On the first `viewReady`, a pending pane is announced before a pending repository selection. Nothing depends on this order today. Keep it as a requirement?

---

## E. `src/extension/rpc/handlers.ts`

In one sentence: the module is the table that maps each RPC method name the page may call to the extension function that answers it.

### E.1 Interface

One runtime export.

**`export const rpcHandlers`**: a plain object (prototype `Object.prototype`) with exactly these seven own enumerable properties. Each value is a function that accepts one `params` argument of type `unknown` (or ignores it) and returns the method's result or a promise of it.

| Method (key)         | Params sent by the page | Result type (`RpcMethodMap`) | What the handler does                                                                                           |
| -------------------- | ----------------------- | ---------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `clipboard.copy`     | the text, a `string`    | `boolean`                    | `copyToClipboard(params)` (module F), passing `params` through.                                                 |
| `webview.initialize` | `null`                  | `WebviewInitialize`          | `webviewInitialize()` (module H).                                                                               |
| `git.init`           | `null`                  | `boolean`                    | `initializeRepo()` (module G).                                                                                  |
| `repo.scan`          | `null`                  | `ScanRepoResult`             | `scanRepos()` (module I).                                                                                       |
| `settings.open`      | `null`                  | `boolean`                    | `openExtensionSettings()`: runs `workbench.action.openSettings` with the query `"branchwise"`, resolves `true`. |
| `docs.open`          | `null`                  | `boolean`                    | `runCommand("branchwise.openDocumentation")`: runs that command, resolves `true`.                               |
| `walkthrough.open`   | `null`                  | `boolean`                    | `runCommand("branchwise.openWalkthrough")`: runs that command, resolves `true`.                                 |

Type-level requirements:

- The table must be checked against `RpcMethodMap` at compile time, so that a missing method, an extra key, or a handler whose (awaited) result does not match `RpcMethodMap[method]["result"]` fails `pnpm run typecheck`.
- The table must stay assignable to `Readonly<Record<string, (params: unknown) => unknown>>`, because the RPC server reads it through that type. Under `strict`, a handler whose parameter is typed narrower than `unknown` (for example `string`) breaks that assignment.

**Who uses what**

| User                                 | Uses                                                                                                                                                                                                      |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/extension/rpc/rpc-server.ts`    | `rpcHandlers`. It looks a method up among the table's own properties only (so `toString`, `__proto__` and `constructor` are unknown methods), calls the handler with exactly one argument, and awaits it. |
| `tests/extension/rpc-server.test.ts` | replaces the module with `{ rpcHandlers: { "repo.scan": mock } }`.                                                                                                                                        |

The page calls `clipboard.copy` (`src/webview/lib/actions/clipboard.ts`), `webview.initialize` (`src/webview/main.tsx`), `git.init` (`src/webview/pages/NoRepoPage.tsx`), `repo.scan` (`src/webview/lib/stores/repo-list.store.ts`), and `walkthrough.open`, `docs.open`, `settings.open` (`src/webview/layout/MainHeader.tsx`).

### E.2 Dependencies the implementation must use

| Import                                 | Name                                                                                                                      |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `@/extension/handlers/clipboard`       | `copyToClipboard`                                                                                                         |
| `@/extension/handlers/initialize`      | `webviewInitialize`                                                                                                       |
| `@/extension/handlers/initialize-repo` | `initializeRepo`                                                                                                          |
| `@/extension/handlers/onboarding`      | `runCommand` (`runCommand(command)` runs a VS Code command without arguments and resolves `true`; a rejection propagates) |
| `@/extension/handlers/open-settings`   | `openExtensionSettings`                                                                                                   |
| `@/extension/handlers/scan-repo`       | `scanRepos`                                                                                                               |
| `@/types`                              | `RpcMethod`, `RpcMethodMap` (types)                                                                                       |

### E.3 Behaviour

- Each handler calls its delegate once per request and returns what the delegate returns: a resolved value, a rejection, or a synchronous throw, all unchanged. Every handler in the table today returns a promise.
- Only `clipboard.copy` uses `params`, passing it through unchanged (the delegate validates it). The other six ignore `params` entirely, whatever it is.
- The module logs nothing; the RPC server logs.
- Adding a method means adding it to `RpcMethodMap` and to this table; the page's client and the server need no change.

### E.4 Examples

Observed wire traffic through the real RPC server and the real table (`vscode` mocked: `executeCommand` resolves `undefined` unless stated, `clipboard.writeText` resolves, no workspace folders):

| Page request (`id` "7")                                                               | Extension response                                                                                                                                                                                                                                                  |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `clipboard.copy` with `"abc"`                                                         | `{ kind: "rpc.response", id: "7", success: true, result: true }`                                                                                                                                                                                                    |
| `clipboard.copy` with `5`                                                             | `{ kind: "rpc.response", id: "7", success: false, error: "Invalid copyToClipboard parameters" }`                                                                                                                                                                    |
| `git.init` with `null`                                                                | `{ …, success: true, result: true }`; `executeCommand("git.init")`                                                                                                                                                                                                  |
| `git.init` when `executeCommand` rejects with `Error("command 'git.init' not found")` | `{ …, success: false, error: "command 'git.init' not found" }`                                                                                                                                                                                                      |
| `repo.scan`                                                                           | `{ …, success: true, result: { repos: [] } }`                                                                                                                                                                                                                       |
| `settings.open`                                                                       | `{ …, success: true, result: true }`; `executeCommand("workbench.action.openSettings", "branchwise")`                                                                                                                                                               |
| `docs.open` / `walkthrough.open`                                                      | `result: true`; `executeCommand("branchwise.openDocumentation")` / `executeCommand("branchwise.openWalkthrough")`                                                                                                                                                   |
| `webview.initialize`                                                                  | `result: { l10n: { …412 strings… }, config: { autoCenterCommitDetailsView: true, dateFormat: "Date & Time", graphColours: [12 defaults], graphStyle: "rounded", initialLoadCommits: 300, loadMoreCommits: 100, locale: "en", showCurrentBranchByDefault: false } }` |
| `git.init` with params `{ x: 1 }`                                                     | same as with `null`; params ignored                                                                                                                                                                                                                                 |

### E.5 Non-functional requirements

- No import-time effects beyond loading the handler modules. No state.
- The table must be a plain object whose only own properties are the seven methods; the server's own-property lookup relies on it.

### E.6 Test coverage

**Already checked:** nothing loads the real table. `rpc-server.test.ts` exercises the server against a one-entry mock table.

**Gaps.**

- **handlers G1, key set.** Call: `Object.keys(rpcHandlers).toSorted()`. Expect: `["clipboard.copy", "docs.open", "git.init", "repo.scan", "settings.open", "walkthrough.open", "webview.initialize"]`, all functions.
- **handlers G2, delegation.** Setup: mock the six handler modules with spies returning distinct values. Call: each handler with `params` `"p"`. Expect: `copyToClipboard("p")`; `webviewInitialize()`, `initializeRepo()`, `scanRepos()`, `openExtensionSettings()` each with no arguments; `runCommand("branchwise.openDocumentation")` for `docs.open` and `runCommand("branchwise.openWalkthrough")` for `walkthrough.open`; each handler resolves to its spy's value.
- **handlers G3, errors pass through.** Setup: a delegate rejects with `Error("x")`. Call: its handler. Expect: rejects with the same error object.
- **handlers G4, end to end.** Setup: real server, real table, `vscode` mocked as in E.4. Call: the requests in E.4. Expect: the responses shown.

### E.7 Questions

- **handlers Q1.** `git.init`, `settings.open`, `docs.open` and `walkthrough.open` always resolve `true` when the command resolves, so the boolean carries no information (the page ignores it). Should they return something meaningful, or should the result type be `null`?
- **handlers Q2.** Methods whose declared params are `null` accept anything. Should the table refuse unexpected params?

---

## F. `src/extension/handlers/clipboard.ts`

In one sentence: the module copies text the page asks for to the system clipboard and reports whether that worked.

### F.1 Interface

**`export async function copyToClipboard(params: unknown): Promise<boolean>`**

- `params`: the RPC params as received, expected to be the text to copy.
- Resolves `true` when the text was written, `false` when writing failed. Rejects when `params` is not a string.

Users: module E (`clipboard.copy`). No test imports it.

### F.2 Dependencies the implementation must use

`vscode`: `env.clipboard.writeText(value: string): Thenable<void>`.

### F.3 Behaviour

- `params` not a string (number, `null`, `undefined`, object, …): the returned promise rejects with an `Error` whose message is exactly `Invalid copyToClipboard parameters` (English, not localized). The clipboard is not touched. This is a rejection, never a synchronous throw.
- `params` a string, including the empty string: `vscode.env.clipboard.writeText(params)` is called once with it and awaited. The promise resolves `true` when that resolves, and `false` when it rejects or throws synchronously. The failure is neither rethrown nor logged.

On the page, `false` or a rejection both lead to the "unable to copy" error dialog (`src/webview/lib/actions/clipboard.ts`), so the rejection's message is not shown to the user; the RPC server logs it.

### F.4 Examples

| Call                                        | Clipboard calls      | Outcome                                               |
| ------------------------------------------- | -------------------- | ----------------------------------------------------- |
| `copyToClipboard("hello")`                  | `writeText("hello")` | resolves `true`                                       |
| `copyToClipboard("")`                       | `writeText("")`      | resolves `true`                                       |
| `copyToClipboard(5)` / `(null)`             | none                 | rejects `Error("Invalid copyToClipboard parameters")` |
| `copyToClipboard("x")`, `writeText` rejects | `writeText("x")`     | resolves `false`                                      |
| `copyToClipboard("x")`, `writeText` throws  | `writeText("x")`     | resolves `false`                                      |

### F.5 Non-functional requirements

Touches only `vscode.env.clipboard`, and only when called. No state, no logging, no import-time effects.

### F.6 Test coverage

**Already checked:** nothing.

**Gaps.** Setup for all: `vscode` mocked with `env.clipboard.writeText` as a spy.

- **clipboard G1.** Call: `copyToClipboard("hello")`. Expect: resolves `true`; `writeText` called once with `"hello"`.
- **clipboard G2.** Call: `copyToClipboard("")`. Expect: resolves `true`; `writeText("")`.
- **clipboard G3.** Call: `copyToClipboard(5)`, `(null)`, `({})`. Expect: each returns a promise that rejects with an `Error` whose message is `Invalid copyToClipboard parameters`; `writeText` never called; the call itself does not throw.
- **clipboard G4.** Setup: `writeText` rejects. Call: `copyToClipboard("x")`. Expect: resolves `false`.
- **clipboard G5.** Setup: `writeText` throws synchronously. Call: `copyToClipboard("x")`. Expect: resolves `false`.

### F.7 Questions

- **clipboard Q1.** A failed clipboard write is swallowed without being logged, so the reason is lost. Should it be logged?
- **clipboard Q2.** The refusal message names an internal function and is not localized. It is only logged today; should it be a neutral message?

---

## G. `src/extension/handlers/initialize-repo.ts`

In one sentence: the module lets the page's "no repository" screen start VS Code's own "Initialize Repository" flow.

### G.1 Interface

**`export async function initializeRepo(): Promise<boolean>`**: no parameters. Resolves `true` after VS Code's command finishes; rejects when the command fails.

Users: module E (`git.init`). No test imports it.

### G.2 Dependencies the implementation must use

`vscode`: `commands.executeCommand`.

### G.3 Behaviour

- Runs `vscode.commands.executeCommand("git.init")` with no further arguments and waits for it.
- Resolves `true` once it resolves, whatever it resolved to.
- A rejection propagates unchanged. With VS Code's Git extension disabled, the rejection message is `command 'git.init' not found`; the page then shows "Unable to initialize the repository: {0}" with that message (`src/webview/pages/NoRepoPage.tsx`).
- Documented behaviour of the built-in `git.init` command: without arguments it asks the user where to create the repository (a pick of workspace folders, or a folder dialog). Cancelling ends the command normally, so the result is still `true`.
- The module asks for no rescan. The page's repository list updates when the `.git` watcher (created by module D) sees a new `.git` inside the workspace and sends `repo.rescan`.

### G.4 Examples

| `executeCommand("git.init")`                    | `initializeRepo()`      |
| ----------------------------------------------- | ----------------------- |
| resolves `undefined`                            | resolves `true`         |
| resolves `"something"`                          | resolves `true`         |
| rejects `Error("command 'git.init' not found")` | rejects with that error |

### G.5 Non-functional requirements

Touches only `vscode.commands`, and only when called. No state, no import-time effects. No timeout of its own; the page's 30-second RPC deadline applies while the user answers VS Code's prompt.

### G.6 Test coverage

**Already checked:** nothing.

**Gaps.**

- **init-repo G1.** Setup: `executeCommand` spy resolving `undefined`. Call: `initializeRepo()`. Expect: resolves `true`; spy called once with exactly `("git.init")`.
- **init-repo G2.** Setup: `executeCommand` rejects `Error("boom")`. Call: `initializeRepo()`. Expect: rejects with that same error.

### G.7 Questions

- **init-repo Q1.** The result is `true` even when the user cancels VS Code's prompt, so the page cannot tell success from cancellation. Intended?
- **init-repo Q2.** VS Code lets the user create the repository in any folder. One outside the workspace folders is never discovered by the scan or the `.git` watcher, and the page stays on the "no repository" screen. Should the new repository be offered (for example added to the session list) or should the command be limited to workspace folders?
- **init-repo Q3.** The page's 30-second RPC deadline can expire while the user is still in VS Code's folder dialog, which shows a timeout error although initialization may still succeed. Intended?

---

## H. `src/extension/handlers/initialize.ts`

In one sentence: the module assembles what the page needs to start (its localized strings and display settings), and the display settings alone for live updates.

### H.1 Interface

**`export function webviewConfig(): WebviewConfig`**

Returns the display settings the page uses. `WebviewConfig` (`src/types/config.ts`) is a read-only object type with exactly: `autoCenterCommitDetailsView: boolean`, `dateFormat: DateFormat`, `graphColours: readonly string[]`, `graphStyle: GraphStyle`, `initialLoadCommits: number`, `loadMoreCommits: number`, `locale: string` (VS Code's display language, used for date formatting), `showCurrentBranchByDefault: boolean`.

**`export async function webviewInitialize(): Promise<WebviewInitialize>`**

Resolves `{ l10n, config }`, where `WebviewInitialize` (`src/types/rpc.types.ts`) is `{ l10n: LocalizedStrings; config: WebviewConfig }` and `LocalizedStrings` is the return type of `getWebviewLocalizedStrings`.

**Who uses what**

| User                                       | Uses                                                                                               |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| `src/extension/watchers/config.watcher.ts` | `webviewConfig`, sent as the `config.changed` notification whenever a `branchwise` setting changes |
| `src/extension/rpc/handlers.ts` (E)        | `webviewInitialize`, for `webview.initialize`                                                      |
| `tests/extension/config-watcher.test.ts`   | runs the real `webviewConfig` through the watcher                                                  |

### H.2 Dependencies the implementation must use

| Import                             | Name(s)                                      | Use                                                                                                                                                         |
| ---------------------------------- | -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `vscode`                           | `env.language`                               | `locale`                                                                                                                                                    |
| `@/extension/config`               | `extConfig`                                  | the seven settings                                                                                                                                          |
| `@/old-extension/l10n/webviewL10n` | `getWebviewLocalizedStrings`                 | the page's localized strings (an object of about 410 entries, computed with `vscode.l10n.t` at call time). `config-watcher.test.ts` mocks this module path. |
| `@/types`                          | `WebviewConfig`, `WebviewInitialize` (types) | return types                                                                                                                                                |

### H.3 Behaviour

- `webviewConfig()` returns a new object with exactly the eight keys of `WebviewConfig`. Seven come from the `extConfig` getter of the same name, called at that moment; `locale` is `vscode.env.language`. Nothing is cached. Observed key order is alphabetical, as listed in H.1; nothing depends on it. Extension-only settings (`dateType`, `gitPath`, `maxDepthOfRepoSearch`, `showUncommittedChanges`, `tabIconColourTheme`) are not included.
- An exception from a getter propagates (see config Q1).
- `webviewInitialize()` resolves `{ l10n: getWebviewLocalizedStrings(), config: webviewConfig() }`, both computed at call time. It rejects if either throws.

### H.4 Examples

With nothing stored and `env.language` = `fr`: `webviewConfig()` returns `{ autoCenterCommitDetailsView: true, dateFormat: "Date & Time", graphColours: [the 12 defaults], graphStyle: "rounded", initialLoadCommits: 300, loadMoreCommits: 100, locale: "fr", showCurrentBranchByDefault: false }`.

With `initialLoadCommits: 12.7`, `graphColours: ["bad", "#123456"]`, `dateFormat: "Relative"` stored: `{ …, dateFormat: "Relative", graphColours: ["#123456"], initialLoadCommits: 12, … }`.

Two calls return equal but distinct objects.

`webviewInitialize()` resolves an object with keys `l10n` then `config`; with `l10n.t` returning its key, `l10n.repo` is `"Repo"`.

### H.5 Non-functional requirements

- Only `vscode.env.language`, plus whatever `extConfig` reads, may be touched. `config-watcher.test.ts` supplies only `env.language` and `workspace`.
- No state, no caching, no side effects, no import-time effects.

### H.6 Test coverage

**Already checked** (`tests/extension/config-watcher.test.ts`): after a `branchwise.graphStyle` change, `config.changed` carries `graphStyle: "angular"`, `dateFormat: "Relative"`, `initialLoadCommits: 50` (from `50.7`) and `locale: "de"`.

**Gaps.**

- **initialize G1, exact keys.** Setup: default settings, `env.language` `"fr"`. Call: `webviewConfig()`. Expect: deep-equals the object in H.4, with no other keys.
- **initialize G2, filtered colours.** Setup: `graphColours: ["bad", "#123456"]`. Call: `webviewConfig()`. Expect: `graphColours` is `["#123456"]`.
- **initialize G3, initialize payload.** Setup: `getWebviewLocalizedStrings` mocked to return `{ a: "A" }`. Call: `webviewInitialize()`. Expect: resolves `{ l10n: { a: "A" }, config: webviewConfig() }`.
- **initialize G4, read live.** Setup: change a stored setting between two calls. Expect: each call reflects the value at that moment.

### H.7 Questions

- **initialize Q1.** When a setting getter throws (config Q1), `webview.initialize` fails and the page shows "Unable to open the graph". Should `webviewConfig` fall back per setting instead, so the graph still opens?

---

## I. `src/extension/handlers/scan-repo.ts`

In one sentence: the module answers the page's request for the list of repositories to offer in its picker and Workspace pane.

### I.1 Interface

**`export async function scanRepos(): Promise<ScanRepoResult>`**: no parameters. `ScanRepoResult` (`src/types/rpc.types.ts`) is `{ repos: GitRepo[] }`, and `GitRepo` (`src/types/config.ts`) is `{ name: string; path: string }`.

**Who uses what**

| User                                        | Uses                                                         |
| ------------------------------------------- | ------------------------------------------------------------ |
| `src/extension/rpc/handlers.ts` (E)         | `scanRepos`, for `repo.scan`                                 |
| `tests/extension/scan-repo.test.ts`         | `scanRepos` against real Git repositories                    |
| `tests/extension/scan-repo-windows.test.ts` | `scanRepos` with `node:path` replaced by its Windows flavour |

### I.2 Dependencies the implementation must use

| Import                       | Name(s)                                               | Contract relied on                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ---------------------------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@/extension/config`         | `extConfig.gitPath`, `extConfig.maxDepthOfRepoSearch` | Git executable and search depth.                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `@/extension/workspace-scan` | `listRepos`                                           | `listRepos(gitPath, maxDepth): Promise<string[]>` resolves the repositories found under the workspace folders (a result reused until the folders, Git path or depth change or a `.git` appears or vanishes) together with this session's other repositories (added with `addSessionRepo`) whose `.git` still exists. Paths are normalized (forward slashes, lowercase Windows drive letter), unique, and sorted with `localeCompare`. It rejects when the walk fails. |
| `@/extension/util/logger`    | `logger.info`                                         | One line per scan. The logger does nothing until activation initializes it.                                                                                                                                                                                                                                                                                                                                                                                           |
| `node:path`                  | `basename`                                            | Each repository's display name. `scan-repo-windows.test.ts` replaces `node:path` with `path.win32`.                                                                                                                                                                                                                                                                                                                                                                   |
| `@/types`                    | `ScanRepoResult` (type)                               | Return type.                                                                                                                                                                                                                                                                                                                                                                                                                                                          |

### I.3 Behaviour

1. Reads `extConfig.gitPath()` once and `extConfig.maxDepthOfRepoSearch()` once.
2. Awaits `listRepos(gitPath, depth)`.
3. Logs at info level exactly `Repository scan completed: <count> found; Git binary: <gitPath>`, with the same `gitPath` value that was passed to `listRepos`.
4. Resolves `{ repos }`, where `repos` has one entry per path, in the order `listRepos` returned them, each `{ name: basename(path), path }`.
5. When `listRepos` rejects, the promise rejects with the same error and nothing is logged here. The RPC server then logs it and sends it to the page, which shows "Unable to load repositories: {0}" with a retry button.

The module does not run Git itself. For reference, a scan through `listRepos` runs, in each directory it examines, `<gitPath> --no-optional-locks -c log.showSignature=false -c status.showUntrackedFiles=all -c color.ui=never -c color.branch=never -c color.diff=never -c color.status=never -c color.showBranch=never -c color.grep=never rev-parse --show-toplevel`. In each repository found it runs the same prefix followed by `submodule foreach --quiet --recursive` and the shell text `printf "%s\0" "$toplevel/$sm_path"`. With depth 0 only the workspace folders themselves are examined. Each extra level descends one directory level, skipping `.git` and not descending into work trees. A repeated scan with the same folders, Git path and depth reuses the earlier result and runs no Git.

### I.4 Examples

| Situation                                                                                                           | `await scanRepos()`                                                                                                                        |
| ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `listRepos` resolves `["/b/two", "/a/one"]`, Git path `git`                                                         | `{ repos: [{ name: "two", path: "/b/two" }, { name: "one", path: "/a/one" }] }`; log `Repository scan completed: 2 found; Git binary: git` |
| `listRepos` resolves `[]`                                                                                           | `{ repos: [] }`; log `Repository scan completed: 0 found; Git binary: git`                                                                 |
| `listRepos` resolves `["/x/y/", "/", "c:/w", "/p/a b"]`                                                             | names `"y"`, `""`, `"w"`, `"a b"`, paths unchanged, same order                                                                             |
| `listRepos` rejects `Error("scan broke")`                                                                           | rejects with that error; no log line                                                                                                       |
| real Git: workspace folder `outer` containing `outer/a repo` and `outer/deep/b`, both repositories, depth 0 / 1 / 2 | `[]` / `[{ name: "a repo", … }]` / `[{ name: "a repo", … }, { name: "b", … }]`                                                             |
| real Git: a repository with the initialized submodule `src/child module` (from `scan-repo.test.ts`), default depth  | the parent and `{ name: "child module", path: "<parent>/src/child module" }`, sorted by path                                               |
| Windows paths (from `scan-repo-windows.test.ts`): folders `C:\workspace` and `c:\workspace\child module`            | `[{ name: "workspace", path: "c:/workspace" }, { name: "child module", path: "c:/workspace/child module" }]`                               |
| no workspace folders                                                                                                | `{ repos: [] }`                                                                                                                            |

### I.5 Non-functional requirements

- `scan-repo.test.ts` and `scan-repo-windows.test.ts` define only `workspace` on `vscode` (`workspaceFolders` and `getConfiguration`). The module and what it loads must touch nothing else in `vscode`, including at import time.
- `basename` must come from `node:path`, so that the Windows test's replacement applies.
- One log line per successful scan. No caching of its own: caching and invalidation belong to `workspace-scan`, and every call must go through `listRepos`.

### I.6 Test coverage

**Already checked.**

- `tests/extension/scan-repo.test.ts` (real Git): parent and initialized submodule at the default depth; overlapping workspace folders list each repository once; missing and non-`file` folders are skipped without hiding others; a subfolder and a symlink of a repository both yield its real top level once; no folders yield `{ repos: [] }`.
- `tests/extension/scan-repo-windows.test.ts`: Windows folder and submodule paths come out as the same forward-slash, lowercase-drive keys that a Source Control click produces.
- `tests/extension/workspace-scan.test.ts` covers `listRepos` and its cache directly.

**Gaps.**

- **scan G1, depth passed through.** Setup: `workspace-scan` mocked; `maxDepthOfRepoSearch` stored as `2.5`; `git.path` stored as an existing file. Call: `scanRepos()`. Expect: `listRepos` called once with `(<that file>, 2)`.
- **scan G2, log line.** Setup: `listRepos` resolves two paths; logger mocked. Expect: `logger.info` called once with `Repository scan completed: 2 found; Git binary: git`.
- **scan G3, order kept.** Setup: `listRepos` resolves `["/b/two", "/a/one"]`. Expect: result order `two`, `one`.
- **scan G4, rejection.** Setup: `listRepos` rejects `Error("scan broke")`. Expect: `scanRepos()` rejects with that error; `logger.info` not called.
- **scan G5, real depth.** Setup: real Git, folder `outer` with repositories at `outer/a repo` and `outer/deep/b`. Call: `scanRepos()` with depth 0, 1 and 2. Expect: the results in I.4.

### I.7 Questions

- **scan Q1.** The display name is the last path segment, so a repository at a filesystem root has an empty name, and two repositories with the same folder name look alike in the picker. Should the name fall back to the path, or be disambiguated?

---

## Appendix: all gaps and questions

**Gaps:** config G1-G11, html G1-G7, legacy G1-G6, view G1-G13, handlers G1-G4, clipboard G1-G5, init-repo G1-G2, initialize G1-G4, scan G1-G5.

**Questions:** config Q1-Q6, html Q1-Q3, legacy Q1-Q3, view Q1-Q8, handlers Q1-Q2, clipboard Q1-Q2, init-repo Q1-Q3, initialize Q1, scan Q1.

---

## Decisions (from the project maintainer's side)

These decisions replace the "current behaviour" wherever they differ. Build to these, and test the decided behaviour. Every question not listed as changed is **keep**.

- **config Q1: a bad colour setting falls back.** A `branchwise.graphColours` value that is not an array is treated as unset, so the default colours apply and nothing throws.
- **config Q4: a ceiling for numbers.** Every whole-number setting is capped at 1,000,000 after its existing lower bound and rounding, so no out-of-range value reaches Git.
- **html Q1: fix the name.** The export is named `createWebviewHtml`. Update its one caller (module D), `webview-html.test.ts` and the mock in `view-command.test.ts` in the same change. No other export changes name.
- **legacy Q1: dispose the provider.** Deactivation disposes the content provider itself (its subscription, cache and emitter) as well as its registration.
- **view Q1: an argument-less call keeps a pending file history.** A call without a folder (status bar, command palette, `showPane`) never discards a file-history request that is waiting for the page to become ready. The request is only replaced by a newer folder click or file-history request, or dropped when the panel closes.
- **view Q2: no missing resource root.** `localResourceRoots` lists only directories that exist in the package; drop `<extension>/media`.
- **view Q8: make the order a requirement.** On first ready, the pending pane is shown before the repository is selected, as today, and tests pin that order.
- Everything else: keep. In particular config Q2, Q3, Q5, Q6, html Q2 – Q3, legacy Q2 – Q3, view Q3 – Q7, handlers Q1 – Q2, clipboard Q1 – Q2, init-repo Q1 – Q3, initialize Q1 and scan Q1 stay as they are.
