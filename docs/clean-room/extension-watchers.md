# Clean-room specification: extension logging, debouncing and watchers

Modules covered, one top-level section each:

- Part A: `src/extension/util/debounce.ts`
- Part B: `src/extension/util/logger.ts`
- Part C: `src/extension/watchers/config.watcher.ts`
- Part D: `src/extension/watchers/git.watcher.ts`
- Part E: `src/extension/watchers/git-repo.watcher.ts`

This document says what these five extension-host modules must do, as seen from outside them. It is written for an engineer who will build replacements without seeing the current source. It draws on the modules' callers, the tests that load or mock them, the modules they import, VS Code's and Git's documented behaviour, and behaviour observed by running the current code.

In short:

- **debounce** holds back a callback per `(event type, URI)` pair until that pair has been quiet for 100 ms.
- **logger** writes to one VS Code log output channel named `Branchwise`, and does nothing until activation initialises it.
- **config.watcher** turns VS Code configuration changes into the `repo.rescan` and `config.changed` notifications for the graph webview.
- **git.watcher** turns the appearance or disappearance of `.git` entries anywhere in the workspace, and workspace-folder changes, into a fresh repository scan (`repo.rescan`).
- **git-repo.watcher** watches the one repository the graph shows (its work tree, its Git directory and, for linked worktrees, the common directory). After relevant files change it sends `repo.updated`, debounced by 250 ms. Git actions that the extension runs itself can temporarily mute it.

---

## 0. How the behaviour was observed

- Node v22.22.2, Git 2.43.0 and Vitest 4.1.11 were run from the repository's `node_modules`, with a scratch Vitest config outside the repository. That config used the same `@/` alias and the same `tests/git-config.ts` setup file as the `extension` project, so Git read only the fixture global configuration.
- `vscode` was replaced by small per-experiment mocks. They recorded every call, including arguments, event-listener registrations and disposals, in one ordered log. `@/extension/rpc/rpc-notify` and `@/extension/workspace-scan` were mocked to record calls. `@/extension/util/logger` was mocked to record each call's level and arguments, except in Part B, which used the real module.
- For Part E, a wrapper script stood in for the Git executable. It recorded its working directory and full argument vector, then ran the real `git`. The real repositories used were a plain repository, a linked worktree, a submodule, a bare clone, a symlink to a repository, a repository created with `git init --separate-git-dir`, a subdirectory of a work tree, a plain non-repository directory and a missing directory.
- Timing cases used Vitest fake timers. With Vitest 4's defaults these advance `setTimeout`, `Date.now()`, `performance.now()` and `process.hrtime` together. The same timing cases were also cross-checked with real timers.
- The existing tests `config-watcher`, `git-watcher`, `git-repo-watcher`, `webviewBridge`, `view-command` and `action-repository` (all under `tests/extension/`) were run and pass on the current code.

All scratch files were deleted afterwards.

---

# Part A. `src/extension/util/debounce.ts`

## A1. Interface

### A1.1 Module path

`src/extension/util/debounce.ts`, imported as `@/extension/util/debounce`.

### A1.2 Exports

```ts
export type FsWatcherEvent = "created" | "deleted";

export function createDebouncer(): {
  debounce(
    type: FsWatcherEvent,
    uri: vscode.Uri,
    callback: (type: FsWatcherEvent, uri: vscode.Uri) => Promise<void>
  ): void;
  dispose(): void;
};
```

- `FsWatcherEvent`: the kind of file-system event being debounced. It is one of two string literals, `"created"` or `"deleted"`. No `"changed"` member exists.
- `createDebouncer()`: returns a new, independent debouncer. Each debouncer has its own pending state, and two debouncers never affect each other. The returned object has exactly two members, `debounce` and `dispose`. It must be usable as a VS Code disposable-like (anything with `dispose()`), because a caller passes it to `vscode.Disposable.from`.
- `debounce(type, uri, callback)`: asks for `callback(type, uri)` to run once the pair `(type, uri)` has gone 100 ms without another `debounce` call.
  - `type`: the event kind. It is part of the identity of the pending call.
  - `uri`: the resource. Only its `toString()` result counts towards identity. Two different `Uri` objects with equal `toString()` are the same resource, and nothing else about the URI (for example `fsPath`) is read.
  - `callback`: the async work to run. It receives the `type` and the `uri` object from the latest call for that pair. It is expected to return a promise.
  - Returns `undefined`.
- `dispose()`: cancels every pending call of this debouncer. Returns `undefined`.

### A1.3 Who uses what

| Importer                                         | Uses                                            |
| ------------------------------------------------ | ----------------------------------------------- |
| `src/extension/watchers/git.watcher.ts` (Part D) | `createDebouncer`, `FsWatcherEvent` (type only) |

No test imports this module directly. `tests/extension/git-watcher.test.ts` exercises it through `watchGitDir`, with the real module and the real, uninitialised logger.

## A2. Dependencies the implementation must use

| Import                    | Name                          | Purpose                                                                                                                 |
| ------------------------- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `vscode`                  | `Uri` (**type-only import**)  | Parameter type only. The module must not need any runtime value from `vscode`.                                          |
| `@/extension/util/logger` | `logger`                      | Reporting a rejected callback, with `logger.error`.                                                                     |
| Platform                  | `setTimeout` / `clearTimeout` | Scheduling. The tests drive it with Vitest fake timers, so scheduling must go through timers those fake timers control. |

## A3. Behaviour

1. **Identity.** A pending call is identified by the pair (type, `uri.toString()`). `"created"` and `"deleted"` for the same URI are separate pairs, and so are two URIs with different strings.
2. **Trailing debounce, 100 ms.** On each `debounce` call, any pending call for the same pair is cancelled. A new one is scheduled 100 ms later. The callback therefore runs exactly once per burst, 100 ms after the last call of that burst. It never runs before 100 ms have passed. With fake timers, it has not run at 99 ms and has run at 100 ms.
3. **Latest call wins.** When calls for the same pair pass different `callback` functions or different `Uri` objects, the one that runs is the callback from the last call, invoked with that call's `type` and `uri` object. Earlier callbacks for the pair are dropped without being called.
4. **After firing.** Once the callback has started, the pair is no longer pending. The next `debounce` for that pair starts a fresh 100 ms wait. If the previous callback's promise has not settled yet, the new one still runs when its timer expires. Nothing serialises callbacks.
5. **Callback failure.** When the promise returned by the callback rejects, the rejection is caught. It is reported as `logger.error("Unable to process repository change", reason)`, where `reason` is the rejection value exactly as given (an `Error`, a string, and so on). Nothing is rethrown, and no unhandled rejection results. A resolved promise produces no log output.
6. **`dispose()`.** It cancels all pending calls, so none of their callbacks ever runs. It can be called any number of times. The debouncer is **not** permanently closed: a `debounce` call after `dispose()` schedules normally and fires 100 ms later (see debounce Q4). Callbacks that are already running are not affected.
7. **No other output.** Success paths produce no log output.

## A4. Concrete examples

| Sequence (fake timers, t in ms)                                                                           | Observed                                                                          |
| --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| t=0 `debounce("created", U, a)`; t=60 `debounce("created", U', b)` where `U'.toString() === U.toString()` | At 159 neither ran. At 160 `b("created", U')` ran once. `a` never ran.            |
| t=0 `debounce("created", X, f)`, `debounce("deleted", X, f)`, `debounce("created", Y, f)`                 | At 100 `f` ran three times: `("created", X)`, `("deleted", X)`, `("created", Y)`. |
| callback rejects with `new Error("boom")`                                                                 | `logger.error("Unable to process repository change", <that Error>)`               |
| callback rejects with `"str"`                                                                             | `logger.error("Unable to process repository change", "str")`                      |
| two pending pairs, then `dispose()`, advance 1000                                                         | No callback ran.                                                                  |
| after that, `debounce("created", X, f)`, advance 100                                                      | `f` ran once.                                                                     |
| callback started (promise pending), new `debounce` for the same pair, advance 100                         | The callback ran a second time while the first was unsettled.                     |
| URI objects `{toString: "same", fsPath: "/a"}` then `{toString: "same", fsPath: "/b"}`                    | One call, which received the second object (`fsPath` `/b`).                       |

## A5. Non-functional requirements

- Importing the module has no side effects. It creates no timers and makes no VS Code calls.
- Memory is bounded by the number of distinct pending pairs. A pair's bookkeeping is dropped once it fires or is cancelled.
- After `dispose()`, no timers created by this debouncer remain scheduled, so the extension host can idle and tests can finish.
- It must work with Vitest fake timers (`vi.runAllTimersAsync`, `vi.advanceTimersByTime`).
- The module must build under the repository's strict TypeScript settings (`verbatimModuleSyntax`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`) and pass `oxlint`. Under `verbatimModuleSyntax` an ordinary `import` of `vscode` would stay in the emitted code, so the import must be written as `import type` to keep the module free of any runtime dependency on `vscode`.

## A6. Test coverage

**Already checked, indirectly.** `tests/extension/git-watcher.test.ts` shows that one `created` or `deleted` event, followed by running all timers, leads to exactly one callback. It does not check the delay, coalescing, keying, error handling or disposal.

**Gaps.** These tests would target the module directly. Use fake timers, and mock `@/extension/util/logger` with a recording `error`.

| #           | Setup                                                          | Call                                                                                               | Expected                                                                                                |
| ----------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| debounce T1 | fresh debouncer, `f = vi.fn(async () => {})`, a URI `U`        | `debounce("created", U, f)` 5 times, 30 ms apart                                                   | `f` not called 99 ms after the last call. Called exactly once at 100 ms, with `("created", U)`.         |
| debounce T2 | same                                                           | `debounce("created", X, f)`, `debounce("deleted", X, f)`, `debounce("created", Y, f)`; advance 100 | 3 calls, one per pair.                                                                                  |
| debounce T3 | two URI objects with equal `toString()` but different `fsPath` | debounce both with type `"created"`; advance 100                                                   | 1 call, with the second object.                                                                         |
| debounce T4 | callbacks `a` then `b` for the same pair within 100 ms         | advance 100                                                                                        | only `b` called                                                                                         |
| debounce T5 | callback returns `Promise.reject(err)`                         | advance 100, flush microtasks                                                                      | `logger.error` called once with `("Unable to process repository change", err)`. No unhandled rejection. |
| debounce T6 | two pending pairs                                              | `dispose()`, advance 1000                                                                          | no callbacks. `vi.getTimerCount()` is 0.                                                                |
| debounce T7 | disposed debouncer                                             | `debounce("created", X, f)`; advance 100                                                           | `f` called once (documents today's behaviour; revisit if debounce Q4 is decided otherwise).             |
| debounce T8 | a callback whose promise stays pending                         | fire once, then debounce the same pair again; advance 100                                          | the callback called twice                                                                               |
| debounce T9 | two debouncers `d1`, `d2`, same pair                           | `d1.debounce(...)`, `d2.debounce(...)`, `d1.dispose()`; advance 100                                | only `d2`'s callback runs                                                                               |

## A7. Questions

- **debounce Q1. A callback that throws synchronously, or returns something other than a promise, escapes the timer.** Currently, a synchronous `throw` from the callback, or a callback that returns `undefined`, raises an exception inside the timer callback: the thrown error in the first case, a `TypeError` about reading `catch` of `undefined` in the second. The exception is uncaught in the extension host, and nothing is logged. The type signature requires a promise-returning callback, and the only caller passes an `async` function, so this cannot happen today. It may be intended that every failure is logged the same way.
- **debounce Q2. The error message is fixed and specific to repositories.** Currently every rejection is logged as "Unable to process repository change", whatever the caller is. The module is a general utility in `util/`, so a caller-supplied message or context may be intended. With a single caller, the current wording is accurate.
- **debounce Q3. The delay is fixed at 100 ms.** There is no parameter. The repository watcher (Part E) uses its own 250 ms debounce instead of this utility, with different keying. It is unclear whether a single configurable debouncer was intended.
- **debounce Q4. `dispose()` is not terminal.** Currently a debouncer accepts and fires new calls after `dispose()`. For a disposable, the more usual contract is that it becomes inert. No caller calls `debounce` after disposing today, because the watcher's event subscriptions are disposed at the same moment.
- **debounce Q5. Callbacks for one pair can overlap.** Currently a new burst for a pair can start its callback while the previous callback's promise is still pending. It is unclear whether serialisation per pair was intended. Today's only callback is effectively synchronous, so it does not matter yet.

---

# Part B. `src/extension/util/logger.ts`

## B1. Interface

### B1.1 Module path

`src/extension/util/logger.ts`, imported as `@/extension/util/logger` (and as `./extension/util/logger` from `src/main.ts`).

### B1.2 Exports

The module has exactly one export:

```ts
export const logger: {
  init: (ctx: vscode.ExtensionContext) => void;
  error: (message: string | Error, ...args: unknown[]) => void;
  warn: (message: string, ...args: unknown[]) => void;
  info: (message: string, ...args: unknown[]) => void;
  debug: (message: string, ...args: unknown[]) => void;
};
```

The object's own enumerable keys are exactly `init`, `error`, `warn`, `info` and `debug`. No `trace` member exists.

- `init(ctx)`: creates the extension's log output channel and registers it for disposal with the extension.
  - `ctx`: the extension context passed to `activate`. Only `ctx.subscriptions` is used, and it is pushed to.
  - Returns `undefined`.
- `error(message, ...args)`: logs at error level.
  - `message`: a string, or an `Error`, whose message and stack VS Code renders.
  - `args`: extra values passed through unchanged. VS Code formats them, and callers pass the caught error here so that the stack appears in the log.
- `warn`, `info`, `debug`: log at the named level. `message` must be a string. `args` are passed through unchanged.
- All logging methods return `undefined`.

### B1.3 Who uses what

| Importer                                     | Members used                                                                           |
| -------------------------------------------- | -------------------------------------------------------------------------------------- |
| `src/main.ts` (`activate`)                   | `init` (first statement of activation), `info("Extension activated")` (last statement) |
| `src/extension/util/debounce.ts`             | `error`                                                                                |
| `src/extension/watchers/config.watcher.ts`   | `info`                                                                                 |
| `src/extension/watchers/git.watcher.ts`      | `info`                                                                                 |
| `src/extension/watchers/git-repo.watcher.ts` | `debug`, `warn`                                                                        |
| `src/extension/rpc/rpc-notify.ts`            | `debug`, `error`                                                                       |
| `src/extension/rpc/rpc-server.ts`            | `debug`, `warn`, `error`                                                               |
| `src/extension/handlers/scan-repo.ts`        | `info`                                                                                 |
| `src/extension/migrate-settings.ts`          | `warn`, `info`                                                                         |
| `src/extension/workspace-folders.ts`         | `warn`                                                                                 |
| `src/extension/workspace-scan.ts`            | `warn`                                                                                 |
| `src/old-extension/messageHandler.ts`        | `error`, `debug`                                                                       |

Every current caller passes a string as the first argument, including callers of `error`.

**Tests that mock the module** replace it with an object that has only some of the members. This is why each caller must use only the members listed above (§B5):

| Test                                       | Mocked members                   |
| ------------------------------------------ | -------------------------------- |
| `tests/extension/rpc-notify.test.ts`       | `debug`, `info`, `warn`, `error` |
| `tests/extension/rpc-server.test.ts`       | `debug`, `warn`, `error`         |
| `tests/extension/migrate-settings.test.ts` | `info`, `warn`                   |
| `tests/extension/config-watcher.test.ts`   | `info` only                      |
| `tests/extension/git-repo-watcher.test.ts` | `debug`, `warn`                  |
| `tests/extension/webviewBridge.test.ts`    | `debug`, `warn`                  |

**Tests that load the real module.**

- `tests/extension/activation.test.ts` calls `init` through `activate`, with a `vscode` mock whose `createOutputChannel` ignores its arguments and returns an object with `info`, `warn`, `error`, `debug` and `dispose`. That mock has **no** `Disposable`. It calls `activate` several times in one module instance, so `init` runs repeatedly.
- `tests/extension/git-watcher.test.ts`, `action-repository.test.ts` and every other test that imports a caller without mocking the logger load the real logger without calling `init`. Their logging calls must be silent no-ops.
- `scripts/test-ui-harness.cjs` (`pnpm test:ui-harness`) runs VS Code and asserts that the retained log files contain "Extension activated". That message is written at info level by `activate`. The harness therefore depends on the channel being a _log_ output channel, whose content VS Code writes to its log folder, and on info level being recorded at VS Code's default log level.

## B2. Dependencies the implementation must use

| Import                  | Name                                         | Purpose                                                                                                                                                                                                          |
| ----------------------- | -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `vscode`                | `window.createOutputChannel`                 | Creating the channel in `init`. It must be called with the `{ log: true }` option so that the result is a `LogOutputChannel` with `error`, `warn`, `info` and `debug` methods and VS Code's log-level filtering. |
| `vscode`                | types `ExtensionContext`, `LogOutputChannel` | Typing                                                                                                                                                                                                           |
| `@/extension/constants` | `EXTENSION_NAME` (value `"Branchwise"`)      | The channel's name                                                                                                                                                                                               |

No other `vscode` API may be used. In particular, `init` must not construct `vscode.Disposable`, which the activation test's mock does not provide. It pushes the channel itself onto `ctx.subscriptions`.

## B3. Behaviour

1. **Before `init`.** `error`, `warn`, `info` and `debug` do nothing: no exception, no buffering, no console output. Messages logged before `init` are lost (logger Q2).
2. **`init(ctx)`.** It calls `vscode.window.createOutputChannel("Branchwise", { log: true })` exactly once, pushes the returned channel onto `ctx.subscriptions` (one push, of the channel object itself), and makes that channel the destination of all later logging calls. VS Code disposes the channel when the extension deactivates, because it is in the context's subscriptions.
3. **Logging after `init`.** Each method calls the channel's method of the **same name** with the same arguments, in the same order and unchanged: `logger.error(m, ...a)` becomes `channel.error(m, ...a)`, and likewise for `warn`, `info` and `debug`. The logger adds no prefix and no timestamp, and does no formatting or filtering. VS Code adds timestamps and level tags, and hides messages below the user's chosen log level. At VS Code's default level (Info), `debug` messages are not shown.
4. **`init` again.** A second `init(ctx2)` creates a second channel with the same name, pushes it onto `ctx2.subscriptions`, and redirects all later logging to it. The first channel is neither disposed nor written to again (logger Q1).
5. **Errors.** The logger itself never throws in production. It does not catch exceptions from the channel.
6. **Return values.** Every method returns `undefined`.

## B4. Concrete examples

| Call (after `init` unless stated)                                              | Channel receives                                                                                |
| ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| before `init`: `logger.error("e0")`, `warn("w0")`, `info("i0")`, `debug("d0")` | nothing. No channel exists yet.                                                                 |
| `logger.init(ctx)`                                                             | `createOutputChannel("Branchwise", { log: true })`. `ctx.subscriptions` now holds that channel. |
| `logger.error(err, 1, { a: 2 })` where `err` is an `Error`                     | `channel.error(err, 1, { a: 2 })`                                                               |
| `logger.error("msg", err)`                                                     | `channel.error("msg", err)`                                                                     |
| `logger.warn("w", "extra")`                                                    | `channel.warn("w", "extra")`                                                                    |
| `logger.info("i")`                                                             | `channel.info("i")`                                                                             |
| `logger.debug("d", undefined, null)`                                           | `channel.debug("d", undefined, null)` (trailing `undefined` and `null` preserved)               |
| `logger.init(ctx2)`, then `logger.info("after second init")`                   | the second channel's `info("after second init")`. The first channel gets nothing.               |

## B5. Non-functional requirements

- **Import-time behaviour.** Importing the module must not touch `vscode` at runtime. It must not create a channel, read configuration or register anything. Many tests import it transitively under `vscode` mocks that lack `window` entirely (for example `vi.mock("vscode", () => ({}))` in the RPC tests).
- **Process-wide singleton.** All importers share one destination, set by `init`. Callers never receive or pass a channel.
- **Cheap no-op.** Before `init`, calls must be cheap and side-effect free. They run on hot paths such as every RPC request and notification.
- **Caller discipline under test mocks.** Some tests replace `logger` with partial objects (§B1.3). A replacement of any _caller_ in this document must use only the members listed for it. The config watcher may use `info` only. The repository watcher may use `debug` and `warn` only. Calling any other member under those mocks throws a `TypeError`.

## B6. Test coverage

**Already checked.**

- `tests/extension/activation.test.ts` checks that `init` succeeds with a minimal channel mock and no `Disposable`, including repeated activation. It does not assert the channel's name, options or registration.
- `scripts/test-ui-harness.cjs` checks, in a real VS Code, that info-level output ("Extension activated") reaches the retained log files.

Nothing checks forwarding, argument pass-through, the no-op before `init`, or the name and options.

**Gaps.** For each, mock `vscode.window.createOutputChannel` to return a recording channel, and use `vi.resetModules()` between tests, because the module holds state.

| #         | Setup                         | Call                                                                             | Expected                                                                                                          |
| --------- | ----------------------------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| logger T1 | fresh module, not initialised | `error("a")`, `warn("b")`, `info("c")`, `debug("d")`                             | no throw. `createOutputChannel` not called.                                                                       |
| logger T2 | fresh module                  | import only                                                                      | `createOutputChannel` not called                                                                                  |
| logger T3 | `ctx = { subscriptions: [] }` | `init(ctx)`                                                                      | `createOutputChannel` called once with `("Branchwise", { log: true })`. `ctx.subscriptions` equals `[channel]`.   |
| logger T4 | initialised                   | `error(new Error("x"), 1)`; `warn("w", 2)`; `info("i")`; `debug("d", undefined)` | each goes to the same-named channel method with identical arguments, including the trailing `undefined`           |
| logger T5 | initialised with `ctx1`       | `init(ctx2)`; `info("z")`                                                        | the second channel receives `info("z")`. The first receives nothing further. Both contexts hold one channel each. |
| logger T6 | not initialised               | `Object.keys(logger)`                                                            | `["init", "error", "warn", "info", "debug"]` (pins the surface that partial mocks mirror)                         |

## B7. Questions

- **logger Q1. Repeated `init` leaks a channel.** Currently a second `init` creates a second "Branchwise" channel and abandons the first without disposing it. The first stays in the earlier context's subscriptions. VS Code activates an extension once, so in production this only happens in tests. It may be intended that `init` is idempotent, or that it replaces and disposes the previous channel.
- **logger Q2. Messages before `init` are dropped silently.** Currently anything logged before activation, for example at import time, disappears. Buffering until `init` could be intended. No current caller logs before `init`, because `activate` calls it first.
- **logger Q3. After deactivation the logger keeps writing to a disposed channel.** Currently the logger still points at the channel after VS Code disposes it through the subscriptions, and later calls go to the disposed channel. Whether VS Code ignores or rejects writes to a disposed log channel is not documented. Resetting to the no-op state on disposal may be intended.
- **logger Q4. The level surface is uneven.** Currently only `error` accepts an `Error` as its first argument, and there is no `trace`, although `LogOutputChannel` provides one. This may be deliberate minimalism.

---

# Part C. `src/extension/watchers/config.watcher.ts`

## C1. Interface

### C1.1 Module path

`src/extension/watchers/config.watcher.ts`, imported as `./watchers/config.watcher` from `src/extension/view-command.ts` and as `@/extension/watchers/config.watcher` from tests.

### C1.2 Exports

```ts
export function initConfigWatcher(): vscode.Disposable;
```

- Takes no parameters.
- Subscribes to VS Code configuration changes for as long as the returned disposable is not disposed.
- Returns **the disposable that `vscode.workspace.onDidChangeConfiguration` returned**. Disposing it ends the subscription.

### C1.3 Who uses what

| User                                     | How                                                                                                                                                                                                                                                                                                                                                |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/extension/view-command.ts`          | Calls `initConfigWatcher()` each time it creates a graph panel. This happens after `initRpcNotify(panel.webview)` and before `watchGitDir()` and `watchGitRepo()`. It disposes the result in the panel's `onDidDispose`, after the RPC notifier and before the other two watchers. At most one panel, and so one config watcher, exists at a time. |
| `tests/extension/config-watcher.test.ts` | Imports `initConfigWatcher` and calls it in `beforeEach` without disposing.                                                                                                                                                                                                                                                                        |
| `tests/extension/view-command.test.ts`   | Mocks the module as `{ initConfigWatcher: () => ({ dispose }) }`. Only the name and the returned `dispose` matter.                                                                                                                                                                                                                                 |

## C2. Dependencies the implementation must use

| Import                            | Name                                 | Purpose                                                                                                        |
| --------------------------------- | ------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| `vscode`                          | `workspace.onDidChangeConfiguration` | The subscription. Its event object is used only through `affectsConfiguration(section)`.                       |
| `@/extension/handlers/initialize` | `webviewConfig`                      | Builds the `config.changed` payload (type `WebviewConfig`) from the current settings and `vscode.env.language` |
| `@/extension/rpc/rpc-notify`      | `rpcNotify`                          | Sends `repo.rescan` and `config.changed`. Called fire-and-forget; its promise is not awaited.                  |
| `@/extension/util/logger`         | `logger` (**`info` only**)           | Diagnostic line                                                                                                |

The module must not import `initRpcNotify`. Several test mocks of `rpc-notify` do not provide it.

## C3. Behaviour

For every configuration-change event, in this order:

1. **Repository search changed.** If the event affects `git.path` or `branchwise.maxDepthOfRepoSearch`, according to `event.affectsConfiguration(...)` with no scope argument, then:
   - it logs `logger.info("Configuration changed")`, then
   - it calls `rpcNotify.notify("repo.rescan", null)`.
2. **Any Branchwise setting changed.** If the event affects the `branchwise` section, meaning any setting whose key starts with `branchwise.`, it calls `rpcNotify.notify("config.changed", webviewConfig())`. The payload is computed at the time of the event, so it reflects the new values.
3. Both can happen for one event. When they do, `repo.rescan` is sent **before** `config.changed`, and the info line is logged before either notification.
4. Events that affect neither produce no calls: no log line and no notification. This covers other extensions' settings, `git.*` settings other than `git.path`, the legacy `neo-git-graph.*` section, and an empty change.
5. Nothing is debounced. Each event is handled synchronously inside the listener. The notification promises are not awaited, and `rpcNotify.notify` never throws synchronously (see `docs/clean-room/rpc-notify.md`, N2).
6. The payload is the whole configuration object, not just the changed keys. Its fields are listed in C4. `config.changed` is sent even when the changed setting does not appear in the payload (for example `branchwise.tabIconColourTheme`, `branchwise.dateType`, `branchwise.fetchAvatars`, `branchwise.showUncommittedChanges` or `branchwise.maxDepthOfRepoSearch`). See config Q1.
7. **Disposal.** After the returned disposable is disposed, configuration changes produce nothing, because VS Code no longer calls the listener.

The module keeps no state of its own.

## C4. Concrete examples

The mock event answered `affectsConfiguration(s)` with `true` when a changed key equalled `s` or started with `s + "."`. `vscode.env.language` was `"fr"`. `webviewConfig()` returned the defaults, except where settings were set.

| Changed keys                                                                            | Log                          | Notifications (in order)                                                                                                                                                                                                                       |
| --------------------------------------------------------------------------------------- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `git.path`                                                                              | info "Configuration changed" | `repo.rescan`, `null`                                                                                                                                                                                                                          |
| `branchwise.maxDepthOfRepoSearch`                                                       | info "Configuration changed" | `repo.rescan`, `null`; then `config.changed`, _config_                                                                                                                                                                                         |
| `branchwise.graphStyle` (settings: `graphStyle: "angular"`, `initialLoadCommits: 12.9`) | none                         | `config.changed`, `{ autoCenterCommitDetailsView: true, dateFormat: "Date & Time", graphColours: [12 default colours], graphStyle: "angular", initialLoadCommits: 12, loadMoreCommits: 100, locale: "fr", showCurrentBranchByDefault: false }` |
| `branchwise` (whole section)                                                            | none                         | `config.changed`, _config_                                                                                                                                                                                                                     |
| `git.path` and `branchwise.dateFormat`                                                  | info "Configuration changed" | `repo.rescan`, `null`; then `config.changed`, _config_                                                                                                                                                                                         |
| `branchwise.tabIconColourTheme`                                                         | none                         | `config.changed`, _config_ (unchanged payload)                                                                                                                                                                                                 |
| `git.enabled`, `editor.fontSize`, `neo-git-graph.graphStyle`, or nothing                | none                         | none                                                                                                                                                                                                                                           |

The payload's rounding and filtering (for example `12.9` becoming `12`) belong to `webviewConfig` and `extConfig`, not to this module.

## C5. Non-functional requirements

- **Import-time behaviour.** No `vscode` calls, no subscriptions and no notifications happen at import time. `src/main.ts` imports this module transitively under the activation test's `vscode` mock, which has no `onDidChangeConfiguration`.
- **Return the VS Code subscription itself.** Do not wrap it in `new vscode.Disposable(...)`. The config-watcher test's `vscode` mock has no `Disposable`, and its `onDidChangeConfiguration` returns `{ dispose }`.
- **Minimal `vscode` surface.** The test mock provides only `env.language`, `workspace.getConfiguration` and `workspace.onDidChangeConfiguration`. The event object provides only `affectsConfiguration`. The module, and anything it calls, must need nothing else.
- **Logger surface.** Use `logger.info` only (see §B5).
- The listener must not throw. VS Code isolates listener errors, but the second notification must still be sent when the first is sent.

## C6. Test coverage

**Already checked** by `tests/extension/config-watcher.test.ts`:

- A `branchwise.graphStyle` change sends exactly one call, `config.changed`, with the current settings (`graphStyle`, `dateFormat`, `initialLoadCommits` rounded down, `locale` from `vscode.env.language`).
- `branchwise.maxDepthOfRepoSearch` sends both `repo.rescan` (`null`) and `config.changed`.
- `git.path` sends exactly one call, `repo.rescan` (`null`).
- `editor.fontSize` sends nothing.

**Gaps:**

| #         | Setup                                                         | Call                                                                       | Expected                                                                                               |
| --------- | ------------------------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| config T1 | as in the existing test                                       | fire `branchwise.maxDepthOfRepoSearch`                                     | `notify.mock.calls[0][0] === "repo.rescan"` and `notify.mock.calls[1][0] === "config.changed"` (order) |
| config T2 | logger mock with recording `info`                             | fire `git.path`; then fire `branchwise.graphStyle`                         | `info` called once with `"Configuration changed"` for the first event and not at all for the second    |
| config T3 | `onDidChangeConfiguration` mock returns a unique object `sub` | `initConfigWatcher()`                                                      | the result is `sub` (identity)                                                                         |
| config T4 | as existing                                                   | fire an event whose `affectsConfiguration` is true only for `"branchwise"` | exactly one `config.changed`                                                                           |
| config T5 | as existing                                                   | fire `git.path` and `branchwise.dateFormat` together                       | calls are `[["repo.rescan", null], ["config.changed", expect.any(Object)]]`                            |
| config T6 | as existing                                                   | fire `git.enabled`; fire `neo-git-graph.graphStyle`                        | no calls                                                                                               |

## C7. Questions

- **config Q1. `config.changed` for settings the payload does not carry.** Currently any `branchwise.*` change sends the full payload, including changes to `dateType`, `showUncommittedChanges`, `fetchAvatars`, `tabIconColourTheme` and `maxDepthOfRepoSearch`, which are not in it. The webview ignores a payload equal to the one it has, so, for example, switching `dateType` or `showUncommittedChanges` does not reload the graph until something else refreshes it. It may be intended to refresh on data-affecting settings, or to send only when a payload field changed.
- **config Q2. `git.path` triggers a rescan that may change nothing.** Currently any `git.path` change sends `repo.rescan`. The effective Git path prefers the executable reported by VS Code's Git extension (`extConfig.gitPath`), so when that is available, `git.path` has no effect on the scan. The repository watcher (Part E) also keeps the Git path it was given at selection. Whether a `git.path` change should also re-run the repository watcher's Git directory lookup is open.
- **config Q3. The log line covers only one branch.** Currently "Configuration changed" is logged only when a rescan is triggered, not for display-setting changes. The log is therefore silent for the more common case.

---

# Part D. `src/extension/watchers/git.watcher.ts`

## D1. Interface

### D1.1 Module path

`src/extension/watchers/git.watcher.ts`, imported as `./watchers/git.watcher` from `view-command.ts` and as `@/extension/watchers/git.watcher` from tests.

### D1.2 Exports

```ts
export function watchGitDir(): vscode.Disposable;
```

- Takes no parameters.
- Starts watching for `.git` entries appearing or disappearing anywhere in the open workspace folders, and for workspace-folder changes. Returns one disposable that stops all of it.

### D1.3 Who uses what

| User                                   | How                                                                                                                                                     |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/extension/view-command.ts`        | Calls `watchGitDir()` for each new graph panel, after `initConfigWatcher()` and before `watchGitRepo()`, and disposes it in the panel's `onDidDispose`. |
| `tests/extension/git-watcher.test.ts`  | Imports `watchGitDir` and calls it in `beforeEach`, never disposing                                                                                     |
| `tests/extension/view-command.test.ts` | Mocks the module as `{ watchGitDir: () => ({ dispose }) }`                                                                                              |

## D2. Dependencies the implementation must use

| Import                       | Name                                    | Purpose                                                                                                                                                                                                        |
| ---------------------------- | --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `vscode`                     | `workspace.createFileSystemWatcher`     | The `.git` watcher                                                                                                                                                                                             |
| `vscode`                     | `workspace.onDidChangeWorkspaceFolders` | Folder changes                                                                                                                                                                                                 |
| `vscode`                     | `Disposable.from`                       | Combines everything into the returned disposable. This is the **only** `Disposable` member the test mock provides (a static `from`; no constructor). A plain `{ dispose }` object would also satisfy the test. |
| `@/extension/util/debounce`  | `createDebouncer`, `FsWatcherEvent`     | 100 ms debounce per `(event, URI)` (Part A)                                                                                                                                                                    |
| `@/extension/workspace-scan` | `invalidateWorkspaceScan`               | Drops the cached workspace scan so that the next scan walks the folders again                                                                                                                                  |
| `@/extension/rpc/rpc-notify` | `rpcNotify`                             | Sends `repo.rescan`                                                                                                                                                                                            |
| `@/extension/util/logger`    | `logger` (`info`)                       | Diagnostic lines                                                                                                                                                                                               |

## D3. Behaviour

1. **Watcher.** `watchGitDir()` calls `vscode.workspace.createFileSystemWatcher("**/.git", false, true, false)`. The glob is a plain string, so it matches absolute paths anywhere inside the workspace folders. Create events are wanted, change events are ignored, and delete events are wanted. A `.git` entry can be a directory (an ordinary repository) or a file (a linked worktree or submodule). Both match. Paths _inside_ a `.git` directory do not match the glob.
2. **Subscriptions.** It subscribes to the watcher's `onDidCreate` and `onDidDelete`, and to `vscode.workspace.onDidChangeWorkspaceFolders`. It must **not** subscribe to `onDidChange`, which the test mock does not provide.
3. **`.git` created or deleted.** Each event is passed to the debouncer, keyed by event kind (`"created"` or `"deleted"`) and URI. 100 ms after the last event for that key, the following happens synchronously and in this order:
   1. `logger.info("Git directory created: <fsPath>")` or `logger.info("Git directory deleted: <fsPath>")`, where `<fsPath>` is the event URI's `fsPath`;
   2. `invalidateWorkspaceScan()`;
   3. `rpcNotify.notify("repo.rescan", null)` (not awaited).
      The event path is never checked against the search depth, the workspace folders or the repository list. Every reported `.git` path leads to a rescan, and the scan itself decides what the picker lists. For example, `/ws/a/b/c/d/e/.git`, which is deeper than the default search depth, still leads to exactly one rescan.
4. **Workspace folders changed.** Immediately and synchronously, with no debounce, in this order: `logger.info("Workspace folders changed")`, `invalidateWorkspaceScan()`, `rpcNotify.notify("repo.rescan", null)`. The event's `added` and `removed` lists are not read.
5. **Coalescing is per path and kind only.** Several `.git` events for _different_ paths, or a create and a delete of the _same_ path, each produce their own rescan when their timers expire (git.watcher Q1). Repeated events for the same path and kind within 100 ms produce one.
6. **Disposal.** Disposing the returned value disposes the file-system watcher, the create subscription, the delete subscription, the folder subscription and the debouncer. Pending debounced rescans are cancelled and never run. Observed disposal order: watcher, create listener, delete listener, folder listener, debouncer. Only "everything is disposed and nothing fires afterwards" is required.
7. **Errors.** Nothing here is expected to throw. A failure inside the debounced work would be logged by the debouncer (A3.5).

## D4. Concrete examples

These are fake-timer observations; t is in ms.

| Input                                                                    | Observed                                                                                                                                                                                                                            |
| ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `watchGitDir()`                                                          | `createFileSystemWatcher("**/.git", false, true, false)`; subscriptions to create, delete and workspace folders; `Disposable.from` with 5 items                                                                                     |
| folder change `{ added: [], removed: [] }`                               | at once: info "Workspace folders changed", `invalidateWorkspaceScan()`, `notify("repo.rescan", null)`                                                                                                                               |
| t=0: create `/ws/a/.git` twice, delete `/ws/a/.git`, create `/ws/b/.git` | nothing at t=99. At t=100: info "Git directory created: /ws/a/.git", invalidate, rescan; info "Git directory deleted: /ws/a/.git", invalidate, rescan; info "Git directory created: /ws/b/.git", invalidate, rescan (three rescans) |
| delete `/ws/c/.git`, then dispose at once, advance 500                   | no log, no invalidate, no notification                                                                                                                                                                                              |

## D5. Non-functional requirements

- **Import-time behaviour.** No watchers or subscriptions are created at import time. `src/main.ts` loads this module under mocks without `createFileSystemWatcher`.
- **Test mock surface.** In `git-watcher.test.ts`, `createFileSystemWatcher` ignores its arguments and returns `{ onDidCreate, onDidDelete, dispose }`. Listener registrations return `{ dispose }`. `onDidChangeWorkspaceFolders` has the same shape. `Disposable` is `{ from }`. The URI passed to listeners has only `fsPath` and `toString()`. The implementation must work within that surface.
- **Fake timers.** The test uses `vi.useFakeTimers()` and `await vi.runAllTimersAsync()`. The debounce must use timers those fake timers control.
- **Resource cleanup.** After disposal, no watcher, subscription or timer remains.
- **Cost.** One recursive watcher over the workspace. VS Code's own `files.watcherExclude` setting applies to it. Work on each event is constant; the expensive scan happens later, when the webview asks for it.

## D6. Test coverage

**Already checked** by `tests/extension/git-watcher.test.ts`:

- A workspace-folder change calls `invalidateWorkspaceScan` once and `notify("repo.rescan", null)` once, synchronously.
- For each of `create` and `delete` on a deep `.git` path (`/ws/a/b/c/d/e/.git`), running all timers leads to exactly one invalidation and exactly the call list `[["repo.rescan", null]]`.

**Gaps:**

| #              | Setup                                                   | Call                                                                | Expected                                                                                    |
| -------------- | ------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| git.watcher T1 | record `createFileSystemWatcher` arguments              | `watchGitDir()`                                                     | called once with `("**/.git", false, true, false)`                                          |
| git.watcher T2 | fake timers                                             | create `/ws/a/.git` 3 times, 50 ms apart; advance 99 after the last | no calls. Advance 1 more: exactly one invalidate and one rescan.                            |
| git.watcher T3 | fake timers                                             | create `/ws/a/.git` and create `/ws/b/.git`; advance 100            | two invalidations, two rescans (documents today's behaviour; see git.watcher Q1)            |
| git.watcher T4 | recording logger and a shared call log                  | create `/ws/a/.git`; advance 100                                    | order: info "Git directory created: /ws/a/.git", invalidate, notify                         |
| git.watcher T5 | `Disposable.from` mock that actually disposes its items | create `/ws/a/.git`; dispose; advance 1000                          | no invalidate or notify. The watcher and all three subscriptions have had `dispose` called. |
| git.watcher T6 | recording logger                                        | folder change                                                       | info "Workspace folders changed" before invalidate and notify                               |

## D7. Questions

- **git.watcher Q1. Bursts across paths are not coalesced.** Currently each distinct `.git` path, and each kind, gets its own rescan. Cloning several repositories, initialising several submodules or deleting a tree of repositories can send a burst of `repo.rescan` notifications, each invalidating the cache and prompting a full scan from the webview. `docs/clean-room/rpc-handler.md` Q7 notes that the webview does not coalesce overlapping rescans either. A single trailing rescan per burst may be intended.
- **git.watcher Q2. It watches only while a graph panel is open.** Currently the caller creates this watcher per panel. Repositories created or removed while no panel is open do not invalidate the workspace-scan cache, so the next panel can list a stale set until the folders, the Git path or the search depth change. This follows from the caller's lifetime choice, but it affects what this module is for.
- **git.watcher Q3. Deleting an ancestor folder.** Currently the module relies on VS Code reporting the `.git` path itself. When a whole repository folder is deleted, VS Code's watcher may report only the top-level deleted folder and not each nested path. In that case no rescan happens. VS Code does not document this, so it needs checking in a real window.
- **git.watcher Q4. Log wording.** "Git directory created/deleted" is also logged when `.git` is a file (a worktree or submodule). This is cosmetic.

---

# Part E. `src/extension/watchers/git-repo.watcher.ts`

## E1. Interface

### E1.1 Module path

`src/extension/watchers/git-repo.watcher.ts`, imported as `./watchers/git-repo.watcher` from `view-command.ts` and as `@/extension/watchers/git-repo.watcher` from `src/old-extension/messageHandler.ts` and tests.

### E1.2 Exports

```ts
export function watchGitRepo(): vscode.Disposable;
export function selectWatchedRepo(repo: string, gitPath: string): void;
export function muteGitRepoWatcher(repo: string): void;
export function unmuteGitRepoWatcher(repo: string): void;
```

- `watchGitRepo()`: starts a watcher _lifetime_. While it lasts, `selectWatchedRepo` has an effect. Returns a disposable that ends the lifetime (E3.9). In the current code the result is a `vscode.Disposable` instance.
- `selectWatchedRepo(repo, gitPath)`: makes `repo` the repository being watched.
  - `repo`: the repository path exactly as the webview selected it, normally an absolute work-tree root. It is used unchanged as the work-tree watcher's base and as the `path` of the notification. It is not normalised and symbolic links in it are not resolved.
  - `gitPath`: the Git executable used for the one-time lookup of the repository's Git directories.
  - Returns `undefined`. It never throws.
- `muteGitRepoWatcher(repo)`: records that a Git action the extension runs in `repo` has started. While any action overlapping the watched repository is running, and for 1.5 s after the last one ends, file events are ignored.
  - `repo`: the path of the repository the action runs in.
- `unmuteGitRepoWatcher(repo)`: records that one such action in `repo` has ended.
  - `repo`: must be the _same string_ passed to the matching mute (E3.8).

### E1.3 Who uses what

| User                                                                                                            | Exports                                                           | How                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/extension/view-command.ts`                                                                                 | `watchGitRepo`                                                    | One lifetime per graph panel, created after `watchGitDir()` and disposed in the panel's `onDidDispose` after the other watchers. At most one panel exists at a time.                                                                                                                                                                                                                                                                                                                                            |
| `src/old-extension/messageHandler.ts`                                                                           | `selectWatchedRepo`, `muteGitRepoWatcher`, `unmuteGitRepoWatcher` | On a webview `selectRepo` message for a repository different from the one it last selected, it calls `selectWatchedRepo(repo, config.gitPath())`, inside a `try` that logs at debug level if it throws. For every action that changes a repository (not for view-only actions such as opening a diff), it calls `muteGitRepoWatcher(msg.repo)` before running Git and `unmuteGitRepoWatcher(msg.repo)` in a `finally`, before posting the result. The webview then refreshes on its own after mutating actions. |
| `tests/extension/git-repo-watcher.test.ts`                                                                      | `watchGitRepo`, `selectWatchedRepo`                               | real Git repositories, `vscode` mock (see E5)                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `tests/extension/webviewBridge.test.ts`                                                                         | all four                                                          | a non-existent repository `/repo`, fake timers                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `tests/extension/view-command.test.ts`                                                                          | —                                                                 | mocks `{ watchGitRepo }`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `action-dispatch`, `restore-undo`, `view-diff`, `action-cancel`, `action-repository`, `nested-repository` tests | —                                                                 | mock `{ selectWatchedRepo, muteGitRepoWatcher, unmuteGitRepoWatcher }` as `vi.fn()`. `action-repository.test.ts` asserts the caller mutes and unmutes the action's own repository.                                                                                                                                                                                                                                                                                                                              |
| `graph-queries`, `remote-preferences`, `view-preferences` tests                                                 | (real module, via `messageHandler`)                               | They send `selectRepo` with **no** lifetime started, under `vscode` mocks that lack `RelativePattern`. `selectWatchedRepo` must therefore be a silent no-op without a lifetime. Mute and unmute must work without touching `vscode`.                                                                                                                                                                                                                                                                            |

The notification it sends is consumed by `src/webview/lib/rpc/rpc-handler.ts`. The webview refreshes only when `message.path` is **string-equal** to its selected repository, so the path must be echoed exactly as given to `selectWatchedRepo`.

## E2. Dependencies the implementation must use

| Import                       | Name                                                                         | Purpose                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ---------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `vscode`                     | `workspace.createFileSystemWatcher`, `RelativePattern`                       | One watcher per watched directory, created as `createFileSystemWatcher(new RelativePattern(<directory path string>, "**/*"))`. Only the pattern argument is passed, so create, change and delete events are all wanted. The base must be a **string path**, because the tests read `.base` and compare it with strings. The `**/*` pattern makes VS Code watch the directory recursively, including folders outside the workspace. |
| `vscode`                     | `Disposable` (constructor taking a callback), or any object with `dispose()` | The value `watchGitRepo` returns                                                                                                                                                                                                                                                                                                                                                                                                   |
| `@/backend/gitClient`        | `createGit(repoPath, gitPath)`                                               | The Git client used for the directory lookup. It determines the exact command line (E3.3).                                                                                                                                                                                                                                                                                                                                         |
| `@/backend/utils/repoPath`   | `isRepoWithinPath(repo, root)`                                               | The overlap test for mutes (E3.8)                                                                                                                                                                                                                                                                                                                                                                                                  |
| `@/extension/rpc/rpc-notify` | `rpcNotify`                                                                  | Sends `repo.updated`                                                                                                                                                                                                                                                                                                                                                                                                               |
| `@/extension/util/logger`    | `logger` (**`debug` and `warn` only**)                                       | Diagnostic lines                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `node:fs/promises`           | `realpath`                                                                   | Resolves the Git directories to real paths                                                                                                                                                                                                                                                                                                                                                                                         |
| `node:path`                  | `path`                                                                       | Resolving relative Git output and computing event paths relative to a watched directory                                                                                                                                                                                                                                                                                                                                            |

## E3. Behaviour

### E3.1 Lifetimes and selection

1. `watchGitRepo()` starts a lifetime. Only one lifetime can receive selections at a time, the most recently started one. There is one selection slot for the whole extension host (git-repo Q5). Starting a lifetime creates no watchers.
2. `selectWatchedRepo(repo, gitPath)` with no lifetime started, or after the lifetime has been disposed, does nothing. It makes no VS Code calls, runs no Git and does not throw.
3. `selectWatchedRepo(repo, gitPath)` does nothing when `repo` is string-equal to the repository this lifetime is already watching. No watcher is recreated, a pending refresh is kept and the new `gitPath` is ignored. This holds even when the earlier Git directory lookup failed, so a failed lookup is never retried by re-selecting (git-repo Q3).
4. Otherwise, the selection switches to `repo`:
   1. Every watcher of the previous selection is disposed, and any pending refresh is cancelled. The previous repository never receives its pending `repo.updated`.
   2. **Synchronously**, before `selectWatchedRepo` returns, one watcher is created on the work tree: `RelativePattern(repo, "**/*")`, with `repo` exactly as given.
   3. **Asynchronously**, the Git directories are looked up (E3.3). When the lookup succeeds and this selection is still current, meaning no later selection or disposal has happened, one or two further watchers are created (E3.2). A lookup that finishes after a later selection, or after disposal, creates nothing.

### E3.2 Which directories are watched

Git directories are compared by their **real paths** (E3.3):

| Repository kind                                                       | Watchers (in creation order)                                                                                                                                                        |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ordinary repository (`.git` directory in the work tree)               | 1. work tree (`repo`); 2. real path of `<repo>/.git`, with the combined rule set (per-worktree and shared entries)                                                                  |
| Submodule (Git directory in the superproject's `.git/modules/<name>`) | 1. work tree; 2. real path of the module's Git directory, combined rule set                                                                                                         |
| Linked worktree (`git worktree add`)                                  | 1. work tree; 2. real path of `<common>/.git/worktrees/<name>`, per-worktree entries only; 3. real path of the common directory (the main repository's `.git`), shared entries only |
| Separate Git directory (`git init --separate-git-dir`)                | 1. work tree; 2. that Git directory, combined rule set                                                                                                                              |
| Repository path is a symbolic link to a repository                    | 1. work tree at the **link** path, as given; 2. the **real** Git directory                                                                                                          |
| A subdirectory of a work tree passed as `repo`                        | 1. that subdirectory; 2. the enclosing repository's real Git directory                                                                                                              |
| Bare repository                                                       | 1. `repo` itself, as a "work tree"; 2. `repo` itself, as the Git directory (git-repo Q8)                                                                                            |
| Lookup failed (not a repository, missing directory, Git not runnable) | 1. work tree only                                                                                                                                                                   |

Because the comparison uses real paths, a repository reached through a symlink still gets one Git-directory watcher, not two.

The existing test pins the work tree as the first watcher (`[main, realpath(main/.git)]`). It also pins the exact counts: 2 for the ordinary repository and the submodule, and 3 for the linked worktree.

### E3.3 The Git directory lookup (exact commands)

Two queries run in `repo`, through the client from `createGit(repo, gitPath)`. They may run concurrently. With that client, the observed process command lines, with the working directory set to `repo`, are:

```
<gitPath> --no-optional-locks -c log.showSignature=false -c status.showUntrackedFiles=all -c color.ui=never -c color.branch=never -c color.diff=never -c color.status=never -c color.showBranch=never -c color.grep=never rev-parse --absolute-git-dir
<gitPath> --no-optional-locks -c log.showSignature=false -c status.showUntrackedFiles=all -c color.ui=never -c color.branch=never -c color.diff=never -c color.status=never -c color.showBranch=never -c color.grep=never rev-parse --git-common-dir
```

The module supplies only the `rev-parse …` arguments. Everything before them comes from `createGit`.

- `git rev-parse --absolute-git-dir` prints the absolute path of the repository's Git directory (`$GIT_DIR`).
- `git rev-parse --git-common-dir` prints the common directory (`$GIT_COMMON_DIR`, otherwise `$GIT_DIR`). The printed path may be relative (for example `.git`), in which case it is relative to the working directory.
- The client does not trim output. A single trailing newline (`\n`) is removed from each output, and nothing else is removed, because paths may legitimately begin or end with spaces. Each result is resolved against `repo` if it is relative, then turned into a real path, with symlinks resolved, using `realpath` from `node:fs/promises`.
- If the two real paths are equal, the repository has one Git-directory watcher with the combined rule set. Otherwise it has a Git-directory watcher with per-worktree rules and a common-directory watcher with shared rules.

**Failure.** If client creation, either query, or either path resolution fails, there is exactly one `logger.warn("Unable to find the Git directory of <repo>", error)`. `<repo>` is the string as given, and `error` is the thrown value. No Git-directory watchers are created, and the work-tree watcher stays. Nothing is rethrown and no rejection escapes. Observed `error` messages:

| Case                              | Error message                                                                                                                            |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| plain directory, not a repository | `fatal: not a git repository (or any of the parent directories): .git`                                                                   |
| directory does not exist          | `Cannot use simple-git on a directory that does not exist` (thrown synchronously by the client; still reported through the same warning) |
| `gitPath` is `/no/such/git`       | `Error: spawn /no/such/git ENOENT`                                                                                                       |

### E3.4 Which file events count

Each watcher judges an event by the event path relative to that watcher's base directory, written with `/` separators on every platform. An event **counts** only when all of the following hold:

- the relative path does not begin with `../`, meaning the path is inside the base;
- the relative path satisfies that watcher's rule set (below);
- the watched repository is not muted at the moment the event arrives (E3.8).

A counting event is logged at debug level (E3.6) and restarts the refresh delay (E3.5).

Events that do not count produce no log output and leave any pending refresh as it is.

**Work-tree rule.** Everything counts except the entry named `.git` at the top of the work tree and anything below it. This covers `.git` as a directory or as a file. The following all count: the base itself (empty relative path), `.gitignore`, `.github/…`, any nested repository's `.git/…` (for example `sub/.git/index`), and ignored files such as `node_modules/…` (git-repo Q7).

**Per-worktree entries** (relative to the Git directory, matched exactly and case-sensitively):

- `HEAD`, `index`
- `MERGE_HEAD`, `CHERRY_PICK_HEAD`, `REVERT_HEAD`
- `BISECT_` followed by one or more characters from `A`–`Z` and `_` (for example `BISECT_LOG`, `BISECT_HEAD`, `BISECT_START`, `BISECT_TERMS`, `BISECT_EXPECTED_REV`)
- `rebase-merge`, `rebase-apply` or `sequencer` themselves, or anything below them

**Shared entries** (relative to the common directory, or to the Git directory when they are the same):

- `config`, `packed-refs`
- `refs` itself, or anything below `refs/` (including lock files such as `refs/heads/x.lock`)

Everything else in a Git directory is ignored. That includes `ORIG_HEAD`, `FETCH_HEAD`, `REBASE_HEAD`, `AUTO_MERGE`, `MERGE_MSG`, `MERGE_MODE`, `SQUASH_MSG`, `COMMIT_EDITMSG`, `logs/…`, `objects/…`, `index.lock`, `HEAD.lock`, `config.lock`, `packed-refs.lock`, `config.worktree`, `shallow`, `description`, `hooks/…`, `info/…`, `modules/…`, `worktrees/…`, the base directory itself, and case variants such as `head`. It also includes names that merely start with a listed name, such as `refsx`, `sequencerx`, `BISECT_` alone and `BISECT_log`.

Consequences for a linked worktree:

- Its own `HEAD`, `index` and in-progress operation files count, through the Git-directory watcher.
- Shared `refs/…`, `packed-refs` and `config` count, through the common-directory watcher.
- The main worktree's `HEAD` or `index` in the common directory do **not** count, and neither do other worktrees' files under `worktrees/<other>/`.
- `refs/…` inside the linked worktree's own Git directory (per-worktree refs such as `refs/bisect/…`) and its `config` do **not** count there (git-repo Q9).

### E3.5 Refresh timing and the notification

- A lifetime has at most one pending refresh, shared by all watchers of the current selection. Each counting event cancels the pending refresh, if any, and schedules a new one **250 ms** later (trailing debounce). With fake timers: an event at 0 and another at 200 give nothing at 449 and exactly one notification at 450.
- When the pending refresh runs:
  1. `logger.debug("Sending repo.updated notification: <repo>")`;
  2. `rpcNotify.notify("repo.updated", { path: repo })`, not awaited. `repo` is the exact string given to `selectWatchedRepo`, so for example a trailing `/` is preserved.
- Events that keep arriving less than 250 ms apart postpone the refresh indefinitely. With an event every 200 ms for 4 s, there was no notification until 250 ms after the last one (git-repo Q7).
- A refresh that is already scheduled is **not** cancelled by a mute that starts later (git-repo Q1). It is cancelled by a selection switch and by disposal.

### E3.6 Log output

| When              | Level | Message                                                                                                                                               |
| ----------------- | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| a counting event  | debug | `Repository file <kind>: <fsPath>` where `<kind>` is `created`, `changed` or `deleted` (the VS Code event) and `<fsPath>` is the event URI's `fsPath` |
| the refresh fires | debug | `Sending repo.updated notification: <repo>`                                                                                                           |
| the lookup fails  | warn  | `Unable to find the Git directory of <repo>`, followed by the error as a second argument                                                              |

Nothing else is logged.

### E3.7 Event kinds

Create, change and delete events are treated the same way. The kind appears only in the debug line.

### E3.8 Muting

State for muting is kept for the whole module, independent of lifetimes. It works before any lifetime exists and without a selection.

1. `muteGitRepoWatcher(repo)` increments a counter for the exact string `repo`.
2. `unmuteGitRepoWatcher(repo)`:
   - If no counter exists for that exact string, it does nothing. In particular, it does not open a quiet period.
   - If the counter is above 1, it decrements it.
   - If the counter is 1, it removes the counter and opens a **quiet period** for `repo` that ends 1500 ms after this call. If the same string is muted and unmuted again, the new unmute replaces the end time with its own call time plus 1500 ms.
3. **When the watched repository counts as muted.** When an event arrives, the watched repository `W` is muted if there is any path `P` for which either:
   - a counter currently exists for `P`, or
   - `P`'s quiet period has not yet ended, meaning the current time is strictly before its end,

   and `P` and `W` overlap. They overlap when `W` is inside `P` or `P` is inside `W`, as decided by `isRepoWithinPath` applied in both directions. That function treats equal paths as inside, normalises both paths and on Windows is insensitive to drive-letter case.
   - At exactly 1500 ms after the last unmute, events count again. At 1499 ms they are still ignored.
   - `/repo` is muted by actions in `/repo`, in `/repo/submodule` (a nested repository) and in `/` (a parent). It is not muted by `/other` or by the sibling `/nonexistent/repo-other` of `/nonexistent/repo`, because overlap is by path components, not string prefixes.
   - A linked worktree and its main worktree are usually sibling directories, so an action in one does not mute the other. An action in a linked worktree that changes shared refs therefore refreshes a view of the main worktree. That is correct, because that view's graph changed.

4. Ignored events are dropped, not deferred. An event that arrives while muted never causes a refresh later. Callers rely on the webview refreshing by itself after a mutating action.
5. Quiet periods that have passed have no further effect. Their bookkeeping may be discarded at any time.
6. Disposing _any_ lifetime clears all counters and quiet periods (git-repo Q6). An unmute that arrives afterwards for an action started earlier finds no counter and does nothing.
7. Keys are exact strings. Muting `/x` and unmuting `/x/` does not balance: `/x` stays muted, observed for 5 s and more, until another unmute of `/x` or a disposal (git-repo Q4).

### E3.9 Disposal of a lifetime

Disposing the value returned by `watchGitRepo()`:

- empties the selection slot, so later `selectWatchedRepo` calls do nothing until a new lifetime starts, even if another, newer lifetime is still alive (git-repo Q5);
- forgets the watched repository;
- invalidates any in-flight Git directory lookup, so it adds no watchers when it completes;
- clears all mute counters and quiet periods;
- disposes every watcher this lifetime created and cancels its pending refresh.

Disposing twice is harmless: the second call finds nothing left to do.

Watchers are disposed through the `FileSystemWatcher.dispose()` of each one. The implementation must not rely on the values returned by `onDidCreate`, `onDidChange` or `onDidDelete`. In the tests those return the handler function or `undefined`, not a disposable.

## E4. Concrete examples

These are observed on the current code. `R` is a scratch directory, `main` an ordinary repository, `wt` a linked worktree of `main`, and `parent/module` a submodule.

| Call                                                                                          | Watchers created (base, pattern)                                                                                     | Git commands (working directory)               |
| --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| `selectWatchedRepo("R/main", "git")`                                                          | sync: `R/main` `**/*`; then `R/main/.git` `**/*`                                                                     | in `R/main`: the two `rev-parse` lines of E3.3 |
| `selectWatchedRepo("R/wt", "git")`                                                            | `R/wt`; then `R/main/.git/worktrees/wt`, `R/main/.git`                                                               | in `R/wt`                                      |
| `selectWatchedRepo("R/parent/module", "git")`                                                 | `R/parent/module`; then `R/parent/.git/modules/module`                                                               | in `R/parent/module`                           |
| `selectWatchedRepo("R/bare.git", "git")`                                                      | `R/bare.git`; then `R/bare.git` again                                                                                | in `R/bare.git`                                |
| `selectWatchedRepo("R/link", "git")` (symlink to `R/main`)                                    | `R/link`; then `R/main/.git`                                                                                         | in `R/link`                                    |
| `selectWatchedRepo("R/plain", "git")` (not a repository)                                      | `R/plain` only; warn `Unable to find the Git directory of R/plain` with the `fatal: not a git repository…` error     | in `R/plain`                                   |
| then `selectWatchedRepo("R/main", "/no/such/git")`, then `selectWatchedRepo("R/main", "git")` | `R/plain` disposed; `R/main` created; warn with `spawn /no/such/git ENOENT`; the second call does nothing (no retry) | —                                              |
| `select(main)`, `select(wt)`, `select(main)` in quick succession                              | ends with exactly `[R/main, R/main/.git]`                                                                            | —                                              |
| `select(main)` then dispose at once                                                           | none remain; the lookup that finished later added nothing                                                            | —                                              |

Relevance for an ordinary repository (1 means a refresh was sent 250 ms after a single event):

| Watcher   | Relative path                                                                                                                                                                                                                                                                                                                                                                                                 | Result |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| work tree | `file`, _(base itself)_, `.gitignore`, `.github/x`, `sub/.git/index`, `node_modules/x/y`, `..`                                                                                                                                                                                                                                                                                                                | 1      |
| work tree | `.git`, `.git/index`, `../outside`                                                                                                                                                                                                                                                                                                                                                                            | 0      |
| Git dir   | `HEAD`, `index`, `refs`, `refs/heads/x`, `refs/heads/x.lock`, `packed-refs`, `config`, `MERGE_HEAD`, `CHERRY_PICK_HEAD`, `REVERT_HEAD`, `BISECT_LOG`, `BISECT_HEAD`, `rebase-merge`, `rebase-merge/done`, `rebase-apply/0001`, `sequencer/todo`                                                                                                                                                               | 1      |
| Git dir   | `ORIG_HEAD`, `FETCH_HEAD`, `logs/HEAD`, `objects/ab/cd`, `refsx`, `packed-refs.lock`, `config.lock`, `config.worktree`, `index.lock`, `HEAD.lock`, `MERGE_MSG`, `MERGE_MODE`, `REBASE_HEAD`, `AUTO_MERGE`, `BISECT_`, `BISECT_log`, `sequencerx`, `COMMIT_EDITMSG`, `modules/x/HEAD`, `worktrees/x/HEAD`, `hooks/pre-commit`, `info/exclude`, `shallow`, `description`, _(base itself)_, `head`, `SQUASH_MSG` | 0      |

Relevance for the linked worktree `wt`:

| Watcher          | Relative path                                                                 | Result |
| ---------------- | ----------------------------------------------------------------------------- | ------ |
| worktree Git dir | `HEAD`, `index`, `MERGE_HEAD`                                                 | 1      |
| worktree Git dir | `refs/bisect/bad`, `config`, `packed-refs`, `refs/heads/x`, `config.worktree` | 0      |
| common dir       | `refs/heads/x`, `packed-refs`, `config`                                       | 1      |
| common dir       | `HEAD`, `index`, `MERGE_HEAD`, `worktrees/wt/HEAD`, `objects/aa/bb`           | 0      |

Timing and muting, with fake timers and the watched repository `/nonexistent/repo` (whose lookup fails, so there is only the work-tree watcher):

| Sequence                                                                      | Observed                                                                                                                                                                                                   |
| ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| event at 0, event at 200                                                      | nothing at 449; one `repo.updated` `{ path: "/nonexistent/repo" }` at 450; debug lines: two "Repository file changed: /nonexistent/repo/file", then "Sending repo.updated notification: /nonexistent/repo" |
| event at 0; `mute(repo)` at 100                                               | notification still sent at 250                                                                                                                                                                             |
| event; `selectWatchedRepo(sameRepo, "other-git")`                             | still one notification at 250; no watcher change                                                                                                                                                           |
| event; `selectWatchedRepo("/nonexistent/other", "git")`                       | old watcher disposed; no notification, ever                                                                                                                                                                |
| `unmute(repo)` with no prior mute; event                                      | refresh as normal                                                                                                                                                                                          |
| `mute`, `unmute`; +1000 `mute`, `unmute`; +1000 event                         | ignored (window extended to 2500)                                                                                                                                                                          |
| … +500 more (2500), event                                                     | refresh                                                                                                                                                                                                    |
| `mute("/nonexistent/repo-other")`; event                                      | refresh (not overlapping)                                                                                                                                                                                  |
| `mute(repo)`, event, dispose, new lifetime, select `repo`, event              | first event: no notification (refresh cancelled by dispose); second: refresh (mute cleared)                                                                                                                |
| `mute(repo)` before any lifetime; new lifetime; select; event                 | ignored (mute honoured)                                                                                                                                                                                    |
| lifetime A, lifetime B, select `/two` (goes to B); dispose A; event on `/two` | refresh still sent; a later `select("/three")` does nothing; disposing B removes `/two`'s watcher                                                                                                          |
| `select("/nonexistent/slash/")`; event                                        | `repo.updated` `{ path: "/nonexistent/slash/" }`                                                                                                                                                           |

## E5. Non-functional requirements

- **Import-time behaviour.** No watchers, timers, Git processes or `vscode` calls at import time. The module is imported, through `messageHandler`, `view-command` and `main`, by many tests whose `vscode` mocks lack `createFileSystemWatcher`, `RelativePattern` and `Disposable`.
- **Module-wide state is required.** `messageHandler` calls `selectWatchedRepo`, `muteGitRepoWatcher` and `unmuteGitRepoWatcher` without a reference to the lifetime `view-command` created. The selection slot and the mute state must therefore be shared by the whole module.
- **Synchronous work-tree watcher.** `webviewBridge.test.ts` calls `selectWatchedRepo` in a synchronous `beforeEach`, then immediately fires the `onDidChange` handler that the work-tree watcher registered. That watcher, and its three event registrations, must exist when `selectWatchedRepo` returns.
- **Test `vscode` mock surface.** `createFileSystemWatcher` receives the pattern object and reads only `.base`. `RelativePattern` is a class storing `(base, pattern)`. `Disposable` is a class whose constructor stores a `dispose` callback. The returned watcher has `onDidChange`, `onDidCreate`, `onDidDelete` and `dispose`, and the `on…` methods do not return disposables. In `git-repo-watcher.test.ts`, a watcher's `dispose` removes it from the test's list of live watchers, so the tests observe disposal directly. In `webviewBridge.test.ts` every call returns the _same_ watcher object, and the last `onDidChange` registration wins.
- **Clock.** The quiet period must be measured with a clock that Vitest fake timers advance (`Date.now()`, `performance.now()` or timers). The refresh must use `setTimeout`-family timers.
- **Real paths.** Git-directory watcher bases are real paths. The test compares them with `fs.realpathSync(...)`, which matters on macOS, where `/tmp` is `/private/tmp`, and for symlinked checkouts. The work-tree base is not resolved.
- **Git usage.** Git runs only once per selection switch: two short `rev-parse` queries, through `createGit`, so that the configured executable, `--no-optional-locks` and the shared `-c` overrides apply. No Git runs on file events.
- **Resource cleanup.** Switching selections or disposing leaves no watchers or timers from the old selection behind. After disposal, a late lookup creates nothing.
- **Performance.** Handling an event costs constant work plus a scan of the mute table, which is tiny. At most one refresh is pending per lifetime. VS Code's `files.watcherExclude` applies to these watchers, as VS Code decides.
- **Errors never escape.** `selectWatchedRepo` does not throw, even for a missing directory or a missing Git executable. The lookup's failure is only logged. Mute and unmute never throw.
- **Logger surface.** Use `logger.debug` and `logger.warn` only (see §B5).

## E6. Test coverage

**Already checked:**

- `tests/extension/git-repo-watcher.test.ts`:
  - The exact watcher count for a linked worktree (3) and a submodule (2).
  - A real commit, reported to every watcher whose base contains each touched Git file, gives exactly one `repo.updated` with the repository path. None of the touched files are below the work tree.
  - For a linked worktree, `objects/…`, another worktree's `worktrees/other/HEAD` and the common directory's `HEAD` give no refresh, while the worktree Git directory's `MERGE_HEAD` gives exactly one.
  - Selecting a worktree and then `main` at once ends with exactly `[main, realpath(main/.git)]`: stale lookups add nothing, the old watchers are disposed and the work tree comes first.
- `tests/extension/webviewBridge.test.ts`:
  - A work-tree change gives exactly one `repo.updated` `{ path: "/repo" }` after 250 ms.
  - The watcher keeps working while a read-only request is in flight and after it finishes.
  - During a mute, events are ignored. After unmuting they are still ignored at +1000 ms, and they count at +1500 ms and later (the 1500 ms boundary is included).
  - Nested mutes need matching unmutes.
  - Mutes on a submodule path or on `/` affect `/repo`; a mute on `/other` does not.
- `tests/extension/action-repository.test.ts` (with a mock) checks that the caller mutes and unmutes the action's repository and leaves view-only actions unmuted.

**Gaps.** For real-Git cases, create repositories in a temporary directory and delete them afterwards. Use the `git-repo-watcher.test.ts` mock style unless stated otherwise.

| #            | Setup                                                                                                     | Call                                                                                                                                     | Expected                                                                                                                                                                     |
| ------------ | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| git-repo T1  | a wrapper executable that records its argv and working directory, then runs `git`; an ordinary repository | `selectWatchedRepo(repo, wrapper)`; wait for 2 watchers                                                                                  | exactly two invocations, in `repo`, ending in `rev-parse --absolute-git-dir` and `rev-parse --git-common-dir`, each preceded by `--no-optional-locks` and the `-c` overrides |
| git-repo T2  | a plain directory; recording `logger.warn`                                                                | `selectWatchedRepo(dir, "git")`; wait 300 ms                                                                                             | exactly one watcher (base `dir`); `warn` called once with `("Unable to find the Git directory of " + dir, expect.any(Error))`                                                |
| git-repo T3  | a missing directory                                                                                       | same                                                                                                                                     | one watcher; one warning; no throw from `selectWatchedRepo`                                                                                                                  |
| git-repo T4  | ordinary repository, 2 watchers live, record disposals                                                    | `selectWatchedRepo(repo, "git")` again, and again with another `gitPath`                                                                 | no disposals, no new watchers, no Git invocations                                                                                                                            |
| git-repo T5  | fake timers, `/nonexistent/repo` selected                                                                 | fire a work-tree event, then `selectWatchedRepo("/nonexistent/other", "git")`; advance 1000                                              | no `repo.updated`; the old watcher disposed                                                                                                                                  |
| git-repo T6  | no lifetime started, `vscode` mock without `RelativePattern`                                              | `selectWatchedRepo("/x", "git")`                                                                                                         | no throw; `createFileSystemWatcher` not called                                                                                                                               |
| git-repo T7  | lifetime disposed                                                                                         | `selectWatchedRepo("/x", "git")`                                                                                                         | no watchers created                                                                                                                                                          |
| git-repo T8  | ordinary repository                                                                                       | `selectWatchedRepo(repo, "git")`; dispose at once; wait 400 ms                                                                           | no live watchers                                                                                                                                                             |
| git-repo T9  | ordinary repository, both watchers live                                                                   | report each work-tree path from the E4 table to the work-tree watcher, one at a time, waiting 260 ms after each                          | exactly the E4 results                                                                                                                                                       |
| git-repo T10 | same                                                                                                      | report each Git-directory path from the E4 table                                                                                         | exactly the E4 results                                                                                                                                                       |
| git-repo T11 | linked worktree, 3 watchers                                                                               | report `refs/heads/x` and `config` to the common-directory watcher; `refs/bisect/bad` and `config` to the worktree Git-directory watcher | one refresh each for the first two; none for the others                                                                                                                      |
| git-repo T12 | fake timers, `/nonexistent/repo`                                                                          | events at 0 and 200                                                                                                                      | no notification at 449; one at 450                                                                                                                                           |
| git-repo T13 | fake timers                                                                                               | `mute(repo)`, `unmute(repo)`; advance 1499; event; advance 250                                                                           | no notification; then advance 1; event; advance 250 → one notification                                                                                                       |
| git-repo T14 | fake timers                                                                                               | `unmute(repo)` with no mute; event; advance 250                                                                                          | one notification                                                                                                                                                             |
| git-repo T15 | fake timers                                                                                               | `mute(repo)`; dispose; new lifetime; select `repo`; event; advance 250                                                                   | one notification (dispose clears mutes)                                                                                                                                      |
| git-repo T16 | fake timers                                                                                               | `mute("/nonexistent/repo-other")`; event; advance 250                                                                                    | one notification                                                                                                                                                             |
| git-repo T17 | fake timers, recording `logger.debug`                                                                     | event (change); advance 250                                                                                                              | debug lines `"Repository file changed: /nonexistent/repo/file"`, then `"Sending repo.updated notification: /nonexistent/repo"`                                               |
| git-repo T18 | `git init --separate-git-dir <gd> <wt>`                                                                   | `selectWatchedRepo(wt, "git")`                                                                                                           | watchers `[wt, realpath(gd)]`                                                                                                                                                |
| git-repo T19 | a symlink `L` to an ordinary repository `M`                                                               | `selectWatchedRepo(L, "git")`; report `HEAD` under the Git dir                                                                           | watchers `[L, realpath(M/.git)]`; `repo.updated` `{ path: L }`                                                                                                               |
| git-repo T20 | fake timers                                                                                               | `selectWatchedRepo("/nonexistent/slash/", "git")`; event                                                                                 | `repo.updated` `{ path: "/nonexistent/slash/" }` (exact echo)                                                                                                                |
| git-repo T21 | fake timers                                                                                               | event at 0; `mute(repo)` at 100; advance 150                                                                                             | one notification (documents today's behaviour; see git-repo Q1)                                                                                                              |

## E7. Questions

- **git-repo Q1. A refresh scheduled before a mute still fires during it.** Currently, if a counting event arrives and an action mutes the repository within the next 250 ms, `repo.updated` is still sent while the action runs. The webview may then reload mid-action, reading a half-updated repository. Cancelling the pending refresh on mute may be intended.
- **git-repo Q2. Muted events are lost, not deferred.** Currently events during a mute or quiet period are discarded. Recovery depends on the webview refreshing after the action. The webview does so for mutating actions, but not for results it treats as background or does not accept (see `actionMutates` and `acceptRemoteActionResult` in `src/webview/lib/remote-actions.tsx`). External changes made during a long mute (for example a commit in a terminal during a slow push) and the action's own changes can then go unseen until the next event. Scheduling one refresh at the end of the quiet period when something was dropped may be intended.
- **git-repo Q3. There is no retry after a failed lookup.** Currently re-selecting the same repository is a no-op because the work-tree watcher exists, even when the Git directory lookup failed or a different `gitPath` is now passed. Examples are a folder selected before `git init`, or a wrong `git.path` fixed later. HEAD and refs changes then never refresh the view until another repository is selected. Retrying on re-selection, or on `git.path` changes, may be intended.
- **git-repo Q4. Mute bookkeeping uses exact strings.** Currently overlap is decided by normalised path containment, but mute and unmute are matched by exact string. Unmuting with a different spelling of the same path (a trailing slash, a different separator or a different drive-letter case) leaves the repository muted until disposal. The only caller passes the same `msg.repo` to both, so this does not happen today.
- **git-repo Q5. There is one selection slot for all lifetimes.** Currently the newest lifetime receives selections, but disposing _any_ lifetime empties the slot and clears all mutes, including those belonging to a newer lifetime still in use. That lifetime's watchers keep running but can no longer be re-targeted. The caller keeps at most one panel, so this does not happen today. It is unclear whether lifetimes should be independent.
- **git-repo Q6. Disposal clears mutes of actions still running.** Currently closing the panel during a Git action clears its mute. If a new panel opens before the action ends, the action's own file events refresh the new panel, and its later unmute is a no-op with no quiet period. The mute state is module-wide, while disposal is per lifetime, so it is ambiguous which should own it.
- **git-repo Q7. Work-tree noise and starvation.** Currently every work-tree path except the top-level `.git` counts, including ignored files (build output, `node_modules`) and nested repositories' Git directories. The refresh is a pure trailing debounce with no maximum wait, so a build writing files more often than every 250 ms postpones the refresh until it stops. Respecting ignore rules, or adding a maximum wait, may be intended. The work-tree watcher exists because uncommitted changes appear in the graph.
- **git-repo Q8. Bare repositories.** Currently, if a bare repository is selected, the work-tree watcher and the Git-directory watcher cover the same directory. The work-tree rule accepts every path there (`objects/…`, `logs/…`, `FETCH_HEAD`), so any Git activity refreshes the view, and events count twice. It is unclear whether bare repositories can be selected at all. The workspace scan looks for `.git` entries, but other paths into the selection exist, such as Source Control and File History.
- **git-repo Q9. Per-worktree refs and config in a linked worktree are ignored.** Currently, in a linked worktree's own Git directory only the per-worktree entries count. `refs/…`, which holds Git's per-worktree refs such as `refs/bisect/*`, `refs/worktree/*` and `refs/rewritten/*`, and `config.worktree` do not count there. In an ordinary repository both sets apply. During `git bisect`, the `BISECT_*` files still trigger a refresh, so the practical gap is small. It is unclear whether this asymmetry is intended.
- **git-repo Q10. Some Git files that change the graph are not watched.** Currently `shallow`, changed by `git fetch --deepen` or `--unshallow`, which alters the visible history, is ignored. So are `ORIG_HEAD`, `FETCH_HEAD` and `REBASE_HEAD`, which is probably fine because refs change alongside them. It is unclear whether `shallow` should count.
- **git-repo Q11. An event path equal to `..` counts.** Currently only relative paths beginning with `../` are treated as outside the base. An event for the base's parent itself, relative path `..`, passes that check and counts for the work-tree watcher. VS Code should never report such a path for a `**/*` pattern, so this is cosmetic.
- **git-repo Q12. Lock files are handled inconsistently.** Currently `refs/**/*.lock` counts while `index.lock`, `HEAD.lock`, `config.lock` and `packed-refs.lock` do not. The debounce hides the extra events, but the rule is uneven.

---

## Appendix: cross-module facts callers rely on

- Notification names and payloads (`src/types/rpc.types.ts`): `"repo.rescan"` with `null`, `"config.changed"` with a `WebviewConfig`, and `"repo.updated"` with `RepoUpdate` = `{ path: string }`. All three are sent with `rpcNotify.notify(name, payload)`, fire-and-forget. None of these modules may import `initRpcNotify`.
- Delays: 100 ms per `.git` path and kind (Parts A and D), 250 ms per repository selection (Part E), and a 1500 ms quiet period after the last unmute (Part E). Configuration and workspace-folder changes are not delayed.
- None of the five modules may do anything at import time.
- Log channel: one VS Code log output channel named `Branchwise`, created with `{ log: true }` in `activate`.

---

## Decisions (from the project maintainer's side)

These decisions replace the "current behaviour" wherever they differ. Build to these, and test the decided behaviour. Every question not listed as changed is **keep**.

- **debounce Q1: every failure is logged.** A callback that throws synchronously is caught and logged with the same message as a rejection; a callback that returns something other than a promise is fine and logs nothing.
- **git-repo Q7: a maximum wait.** The refresh stays a trailing 250 ms debounce, but no refresh is postponed more than 2,000 ms after the first change that has not yet been reported: while relevant events keep arriving, `repo.updated` is sent at least every 2,000 ms. Ignored files still count.
- **git-repo Q8: one watcher per directory.** When the work tree and the Git directory are the same directory (a bare repository), it is watched once, and each event counts once, by the work-tree rule.
- **git-repo Q9: per-worktree refs count.** In a linked worktree's own Git directory, `refs/…` and `config.worktree` count as well as the per-worktree entries that count today, and `config.worktree` counts in every Git directory, ordinary repositories included (amended after the first implementation).
- **git-repo Q10: `shallow` counts.** A change to `shallow` in the Git directory counts.
- **git-repo Q11: outside is outside.** An event path whose relative path is `..` or begins with `../` never counts.
- **git-repo Q12: Git's lock files never count.** Inside a Git directory (the Git directory, the common directory, a linked worktree's own Git directory), any path whose last segment ends in `.lock` is ignored; the rename that completes the update is what counts. In the work tree, a path ending in `.lock` (`yarn.lock`, `Cargo.lock`) counts like any other file (narrowed after the first implementation).
- Everything else: keep. In particular debounce Q2 – Q5, logger Q1 – Q4, config Q1 – Q3, git.watcher Q1 – Q4 and git-repo Q1 – Q6 stay as they are.
