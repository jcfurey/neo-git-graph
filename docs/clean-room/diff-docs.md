# Clean-room specification: `src/old-extension/diffDocProvider.ts`

This specification describes what the module that serves Branchwise's read-only "historical file" documents must do, as seen from outside it. It is written for an engineer who will build a replacement without seeing the current source. It is based on the module's callers, the tests that load it, the modules it imports, VS Code's and Git's documented behaviour, and behaviour observed by running the current code.

In short, the module does two things:

1. **Building and reading URIs.** It builds `branchwise:` URIs that name a file at a Git commit, a file at a commit's first parent, or a Git object by ID, inside a given repository. It also parses such URIs back into their parts.
2. **Serving content.** A `vscode.TextDocumentContentProvider` gives VS Code the text of those documents by running `git show` in the named repository. It refuses anything that could turn a URI into a Git option, or start Git in a directory the extension has no business with. Every refusal and every Git failure produces an empty document. Nothing is ever shown to the user or logged.

The graph uses these URIs for its commit-file diffs, range diffs, working-tree diffs, "view file at revision", and restore previews.

There is one module, so every section below belongs to it. Test gaps are numbered `diffdoc G1`, `diffdoc G2`, and so on. Questions are numbered `diffdoc Q1`, `diffdoc Q2`, and so on.

---

## 0. How the behaviour was observed

- The tests ran on Node v22.22.2, Git 2.43.0 and Vitest 4.1.11. Vitest was run from the repository's `node_modules` with scratch configs outside the repository, and the `@/` and `@tests/` aliases pointed at `src/` and `tests/`. `tests/git-config.ts` was the setup file, so Git read only `tests/fixtures/gitconfig`, or `tests/fixtures/hostile.gitconfig` for the runs marked "hostile".
- The existing tests `tests/extension/diff-doc-provider.test.ts` and `tests/extension/message-protocol.test.ts` pass (20 tests).
- In the scratch experiments, `vscode` was replaced by a mock with these parts:
  - `Uri` was the `vscode-uri` 3.2.0 package, which is the same implementation that VS Code ships.
  - `EventEmitter` recorded subscriptions, fires and disposal.
  - `workspace.onDidCloseTextDocument` captured its listener and recorded disposal.
- Real Git repositories were built with `makeRepo()` from `tests/backend/helpers.ts`. That helper makes a repository whose root commit holds one file `f` containing `x`, on branch `main`.
- The exact Git argument vector was captured by setting the Git path to a shell script that logged its arguments and working directory and then ran the real Git.
- `tests-ext/historyDocuments.test.ts` and a small URI probe were also compiled into a scratch directory and run inside real VS Code 1.139.1 (the copy the repository keeps in `.vscode-test/`, run under `xvfb-run`). All three tests passed, and the probe confirmed the string forms shown in §4.1.
- The public TypeScript types in §1 come from a declaration file emitted into a scratch directory from the current module.

---

## 1. Interface

### 1.1 Module path

`src/old-extension/diffDocProvider.ts`. Every importer uses the alias `@/old-extension/diffDocProvider`.

It has exactly **four runtime exports**: one class and three functions. It has **no type exports**. None of the names or signatures below may change.

### 1.2 `export class DiffDocProvider implements vscode.TextDocumentContentProvider`

Public members:

| Member                       | Signature                                                                                           | Meaning                                                                                                                                                                      |
| ---------------------------- | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| static `scheme`              | `static scheme: string`, value `"branchwise"`                                                       | The URI scheme of every document this module builds and serves. It is an ordinary static property, not a getter or a readonly one. Callers read it to register the provider. |
| constructor                  | `new DiffDocProvider(forRepo: (repo: string) => SimpleGit, isSavedRepo: (repo: string) => boolean)` | See below.                                                                                                                                                                   |
| `provideTextDocumentContent` | `provideTextDocumentContent(uri: vscode.Uri): string \| Thenable<string>`                           | Returns the document text for `uri` (§3.6). It takes one declared parameter. VS Code also passes a cancellation token, which is ignored.                                     |
| `onDidChange`                | getter, `get onDidChange(): vscode.Event<vscode.Uri>`                                               | The provider's change event, which VS Code subscribes to when the provider is registered. It returns the same function on every read, and it never fires (§3.8).             |
| `dispose`                    | `dispose(): void`                                                                                   | Releases the provider's VS Code subscription and event emitter, and forgets cached content (§3.9).                                                                           |

The constructor takes two parameters:

- `forRepo(repo)` returns a simple-git client whose working directory is the repository folder `repo`. The provider calls it once for each document that it serves by running Git. It is called with the repository string exactly as decoded from the URI, not normalized. It may throw, for example when the folder does not exist.
- `isSavedRepo(repo)` returns whether the extension has saved graph state for the repository. The provider calls it with the **normalized** repository path (see `normalizeRepoPath`, §2.1), and only for repositories that were not encoded during this process's lifetime. It exists so that diff editors which VS Code restores after a restart can still load. Their URIs were written by an earlier process, so no encode call has recorded their repository yet.
- The constructor must not call either callback. The test in `tests/extension/message-protocol.test.ts` checks that the Git client factory is not called during setup.

`DiffDocProvider` must be a real class. The protocol test checks `toBeInstanceOf(DiffDocProvider)`.

The current declaration file also lists private members. Their names are not part of the contract.

### 1.3 `export function encodeDiffDocUri(repo: string, path: string, commit: string): vscode.Uri`

Builds the URI of the file `path` as it was at the revision `commit` in the repository `repo`. It also records `repo` as opened in this process (§3.2).

- `repo` is the repository folder: an absolute path, as the callers pass it.
- `path` is the file's path relative to the repository root. Callers use `/` as the separator.
- `commit` is a full object ID, optionally followed by one `^` to mean its first parent, or the 40-zero placeholder for "no file". The function itself accepts any string. Validation happens only when the document is served.

### 1.4 `export function encodeDiffBlobUri(repo: string, path: string, blob: string | null): vscode.Uri`

Builds the URI of the Git object `blob`, shown under the name `path`, in `repo`. `null` means "no content", and the resulting URI serves an empty document. It also records `repo` as opened.

- `path` is used only as the document's name, which VS Code shows in the tab title and uses to pick a language. Git is not asked about it.

### 1.5 `export function decodeDiffDocUri(uri: vscode.Uri)`

The declared return type is:

```ts
{ filePath: string; commit: string | undefined; repo: string | undefined; blob?: boolean }
```

- `filePath` is `uri.path`, unchanged.
- `commit` and `repo` are the decoded values of the query arguments of those names. When a value is missing or cannot be decoded, the key is still an own property of the result, with the value `undefined`.
- `blob` is present, with the value `true`, only when the URI carries the blob marker (§3.4). Otherwise the key is **absent**, not `undefined`. The extension-host test compares with `assert.deepStrictEqual` against an object that has only `repo`, `filePath` and `commit`, so an extra key would fail it. The value `false` is never produced.

### 1.6 Who uses what

| Importer                                            | Exports used                                                                                                     | How                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/extension/legacy.ts` (`createMessageProtocol`) | `DiffDocProvider`, `DiffDocProvider.scheme`                                                                      | Builds one provider per activation. Its `forRepo` builds a client for the repository with the Git path setting as it is at the time of the call. Its `isSavedRepo` asks whether the repository manager has saved state under exactly that key. The provider is registered with `vscode.workspace.registerTextDocumentContentProvider(DiffDocProvider.scheme, provider)`. At deactivation both the registration and the provider are disposed.                                                |
| `src/old-extension/messageHandler.ts`               | `encodeDiffDocUri`, `encodeDiffBlobUri`                                                                          | Builds URIs for `vscode.diff` and `vscode.open`. The commit-file diff uses `(repo, oldPath, hash + "^")` on the left and `(repo, newPath, hash)` on the right. The range diff uses the left and right commit IDs, or 40 zeros when a side is `null`. The historical-file view uses `(repo, path, hash)`. The restore preview uses 40 zeros when the destination is missing, and the source hash. The working-tree diff calls `encodeDiffBlobUri` with the index or HEAD blob IDs, or `null`. |
| `tests/extension/diff-doc-provider.test.ts`         | `DiffDocProvider` (constructor, `scheme`, `provideTextDocumentContent`), `encodeDiffDocUri`, `encodeDiffBlobUri` | Unit tests against real Git repositories, with `vscode` mocked (§6.1).                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `tests/extension/message-protocol.test.ts`          | `DiffDocProvider` (`instanceof`, `provideTextDocumentContent`; `dispose` through `legacy.ts`)                    | Registration, disposal, and the saved-repository path, with the Git client factory mocked.                                                                                                                                                                                                                                                                                                                                                                                                   |
| `tests-ext/historyDocuments.test.ts`                | `decodeDiffDocUri`, `DiffDocProvider` (constructor, `provideTextDocumentContent`, `dispose`), `encodeDiffDocUri` | Runs inside real VS Code.                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |

`decodeDiffDocUri` has no production caller outside this module. The extension-host test uses it.

---

## 2. Dependencies the implementation must use

### 2.1 Repository imports

- **`normalizeRepoPath` from `@/backend/utils/repoPath`.** Both the "opened in this process" record and `isSavedRepo` must use the repository key it produces.
  - It applies Node's `path.normalize`, which resolves `.` and `..` segments and collapses repeated separators. It then joins the segments with `/`, and on Windows it lowercases the drive letter.
  - A trailing separator is **kept**: `/a/b/` stays `/a/b/`.
  - The repository manager stores its saved state under keys of this form. The test "reopens documents for repositories with saved state" depends on the provider asking `isSavedRepo` about exactly this form.

### 2.2 Packages

- **`vscode`.** The module may use only the following, because the test mocks provide nothing else:
  - `vscode.Uri.from({ scheme, path, query })` to build URIs, and `Uri#with({ query })` if the query is changed afterwards. The mock in `diff-doc-provider.test.ts` implements only `from`, `with({ query })` and `toString`.
  - `vscode.EventEmitter<vscode.Uri>`, using only its constructor, `.event` and `.dispose()`.
  - `vscode.workspace.onDidCloseTextDocument(listener)`.
  - Types: `TextDocumentContentProvider`, `Uri`, `Event`, `Disposable`, `Thenable`.

  The mock in `message-protocol.test.ts` has **no `Uri` at all**, and neither mock has `Disposable`. So the provider class (constructor, `provideTextDocumentContent`, `dispose`) and module loading must not touch `vscode.Uri`, `vscode.Disposable`, or any other part of the API.

- **`simple-git`**, for the type `SimpleGit` only (a type-only import). The provider runs Git only through the client's **`show` method**, with an array of arguments (§3.7). The protocol test's fake client has nothing but `show`, so any other client method would fail there.
- **`node:path`**, for `isAbsolute` (the platform's rule for absolute paths) and `sep` (the platform's separator, which decides whether file paths are rewritten, §3.3).

The module needs nothing else. There is no logger, no localisation and no configuration.

---

## 3. Behaviour

### 3.1 Loading the module

Importing the module has no side effects. It makes no VS Code API calls, runs no Git and does no I/O. It starts with an empty module-wide record of repositories opened in this process (§3.2).

### 3.2 The record of repositories opened in this process

- Every call to `encodeDiffDocUri` or `encodeDiffBlobUri` adds `normalizeRepoPath(repo)` to a record. The record is kept once for the whole module, not per provider, for as long as the extension host process runs.
- The repository is recorded even if the URI is never opened, and even if building the URI then throws (§3.3).
- Nothing removes entries. Disposing a provider does not clear the record. A provider created later accepts repositories that were encoded before it existed (observed: encode, dispose provider A, and a new provider B with `isSavedRepo` always returning false still serves the document).
- The record is what lets the provider accept a repository without asking `isSavedRepo`.

### 3.3 `encodeDiffDocUri(repo, path, commit)`

It returns a `vscode.Uri` with these parts:

- **scheme:** `branchwise`. There is no authority and no fragment.
- **path:** `path`, unchanged. The one exception is on platforms whose path separator is `\` (Windows), where every `\` in `path` is replaced by `/`. On other platforms a backslash is a legitimate file-name character and is kept. No leading `/` is added: `dir/file.txt` stays `dir/file.txt`.
- **query:** exactly `commit=` + `encodeURIComponent(commit)` + `&repo=` + `encodeURIComponent(repo)`. The `^` suffix therefore appears as `%5E`.

Other points:

- The repository is recorded (§3.2).
- VS Code's `Uri` rules apply. A `path` that starts with `//` makes the call throw VS Code's error: `[UriError]: If a URI does not contain an authority component, then the path cannot begin with two slash characters ("//")`. The repository has already been recorded when that happens. Repository-relative paths never start with `/`, so callers do not hit this.
- Because the URI string may be persisted by VS Code (restored editors), the query format is a compatibility contract. The provider must still serve URIs written by the current format in an earlier session.

### 3.4 `encodeDiffBlobUri(repo, path, blob)`

- It returns the same URI that `encodeDiffDocUri(repo, path, blob ?? "0".repeat(40))` would return, with `&blob=1` appended to the query.
- The query is therefore `commit=<encoded id>&repo=<encoded repo>&blob=1`.
- `null` becomes 40 zeros even in SHA-256 repositories. The provider rejects all-zero IDs of either length, so both produce an empty document.
- The repository is recorded.

### 3.5 `decodeDiffDocUri(uri)`

It reads only `uri.path` and `uri.query`. The query is parsed as follows:

- The query is split on every `&`. Empty pieces, and pieces without `=`, are ignored.
- In each piece, the key is everything before the **first** `=`, and it is **not** percent-decoded. So `com%6Dit=` is not `commit`, and key matching is case-sensitive.
- The value is everything after that `=`, including any further `=`, and it is decoded with `decodeURIComponent`. `+` is not turned into a space.
- If a value's escapes cannot be decoded (for example `%E0%A4%A`), that piece is ignored as if it were absent. An earlier piece with the same key keeps its value.
- When a key repeats, the last decodable value wins.
- Unknown keys are ignored. Keys such as `__proto__` or `toString` must not affect the result or any object prototype.
- `blob` is `true` exactly when the decoded value of the last decodable `blob` piece is the string `"1"`. `%31` counts, because it decodes to `1`; `true`, `0` and anything else do not.

The function never throws for any string query.

A round trip must be lossless. Take a URI from `encodeDiffDocUri`, turn it into a string with `toString()`, and parse it back with `vscode.Uri.parse`. Decoding the result gives back the original `repo`, `path` and `commit`, including spaces, `#`, `?`, `%`, tabs, newlines, quotes, non-ASCII text and (off Windows) backslashes. VS Code's own string form lowercases a drive-letter-like first path segment; see `diffdoc Q12`.

### 3.6 `provideTextDocumentContent(uri)`

The provider reads only `uri.path`, `uri.query` and `uri.toString()`. It must **not** check `uri.scheme`: the protocol test passes an object without a `scheme` property and expects content. VS Code routes only `branchwise:` URIs to the provider anyway.

It decides in this order. The first step that applies determines the result.

1. **Cached.** If content is cached under the key `uri.toString()` (§3.8), it returns that string **directly**, not as a promise. It does no other checks, so a cached document stays available even if its repository has since lost its saved state. It runs no Git and calls no callback.
2. **Revision check.** It decodes the URI (§3.5), and takes `commit` as `""` when it is missing.
   - For a document URI (no blob marker), one trailing `^` is set aside, and the rest must be a full object ID.
   - For a blob URI, the whole value must be a full object ID, and no `^` is allowed.
   - A full object ID is exactly 40 or exactly 64 characters from `0-9a-f`, lowercase only.
   - An ID made only of zeros is refused. This is the "no file" placeholder, and it is refused with or without `^`.
   - Anything else is refused: symbolic names (`HEAD`), abbreviated IDs, uppercase hex, `^^`, `~1`, `^2`, and anything starting with `-`. The result is `""`, returned directly.
3. **Repository check.** The decoded `repo` must be present and absolute by the platform's rule (`path.isAbsolute`). Otherwise the result is `""`, returned directly.
4. **Known repository.** Let `key = normalizeRepoPath(repo)`.
   - If `key` is in the record (§3.2), it continues.
   - Otherwise it calls `isSavedRepo(key)`. If that returns true it continues; otherwise the result is `""`, returned directly.
   - `isSavedRepo` is not called when an earlier step already decided the result, or when the repository is in the record.
   - Keys compare exactly, so `/r` and `/r/` are different repositories (`diffdoc Q3`).
5. **Git client.** It calls `forRepo(repo)` with the decoded, un-normalized string.
   - If that throws, the result is `""`, returned directly and **not** cached. The next request calls `forRepo` again.
   - With the product factory this happens, for example, when the folder does not exist.
6. **Git.** It calls the client's `show` with `["--end-of-options", <revision>, "--"]` (§3.7) and returns a **promise**.
   - The promise resolves with Git's standard output (§3.7).
   - If `show` rejects, for any reason, the promise resolves with `""`. It never rejects.
   - In both cases the resolved string is cached under `uri.toString()` before the promise resolves.

Consequences:

- For rejected URIs, `forRepo` is never called, so no Git process starts and no file can be written. The tests check this with `--output=<file>` and `-O<file>`.
- Callers see only a string or a promise of a string, and the value is `""` for every refusal or failure. There is no error, no message and no log line.
- Callers rely on this. For an added file, the left side (`<hash>^:<old path>`) does not exist in Git. For a deleted file, the right side does not exist. For a root commit, `<hash>^` is not a valid revision. Each of these must show as an empty side of the diff, not as a failed diff command.

Two exceptions escape. An exception thrown by `isSavedRepo`, or thrown synchronously by the client's `show`, propagates out of `provideTextDocumentContent` (`diffdoc Q8`). The product's callbacks do not throw.

### 3.7 The Git command

The revision passed to Git is one of these:

| URI kind                     | Revision argument                               |
| ---------------------------- | ----------------------------------------------- |
| document, `commit=<id>`      | `<id>:<filePath>`                               |
| document, `commit=<id>^`     | `<id>^:<filePath>` (the first parent's version) |
| blob, `commit=<id>&…&blob=1` | `<id>` (the file path is not used)              |

`<filePath>` is `uri.path` exactly as decoded, without validation. It is always inside a single argument that starts with a validated object ID and comes after `--end-of-options`, so nothing in the path can become a Git option.

The module calls the client's `show(["--end-of-options", revision, "--"])`. With the product client (`createGit` or `gitClientFactory` from `@/backend/gitClient`), the observed process has these properties:

- It runs in the repository folder, with this argument vector:

  ```
  <git path> --no-optional-locks -c log.showSignature=false -c status.showUntrackedFiles=all -c color.ui=never -c color.branch=never -c color.diff=never -c color.status=never -c color.showBranch=never -c color.grep=never show --end-of-options <revision> --
  ```

  Everything before `show` comes from the client, not from this module.

- `--end-of-options` requires Git 2.24 or later.

What Git returns, according to Git's documented `git show` behaviour and confirmed by observation:

- **Files.** For a blob, the output is the stored bytes exactly. No textconv, no clean or smudge filters and no end-of-line conversion are applied, even when `.gitattributes` asks for them. CRLF line endings, a UTF-8 BOM and a missing final newline are all preserved.
  - The client decodes the output as UTF-8. Invalid bytes, such as Latin-1 text or binary data, become U+FFFD, and NUL bytes are kept (`diffdoc Q7`).
- **Symbolic links.** A symbolic link's blob is its target text.
- **Directories.** A path naming a directory, or an empty path, shows Git's tree listing: `tree <revision>\n\n<entry>\n…`, where subdirectories end in `/`.
- **Other tree-ish IDs.** A tree ID or annotated-tag ID works in a document URI (Git peels it to a tree). A blob ID in a document URI fails.
- **Non-blob objects in a blob URI.** A commit ID shows the commit header and patch, a tag ID shows the tag and then its commit, and a tree ID shows the tree listing. The client does not pin `format.pretty`, `log.decorate` or `log.date`, so the layout of this text follows the user's configuration (`diffdoc Q5`).
- **Failures.** A path absent at that revision, a root commit's `^`, a submodule gitlink whose commit is not in the repository, `..` segments, a leading `/`, an ID of the wrong length for the repository's hash algorithm, a folder that is not a repository, and a missing Git executable all make Git fail or fail to start. `show` rejects and the document is `""`.
- **`./` paths.** A path beginning with `./` is resolved by Git relative to the folder the client runs in. That is the repository root, unless `repo` names a subdirectory.
- **Merge commits.** `<merge>^` is the first parent.

The Git command has no timeout and no cancellation. If Git hangs, the promise stays pending.

### 3.8 Cached content and eviction

- Every document that reaches Git is cached under `uri.toString()`, including documents whose Git call failed and are cached as `""`.
- The cache is per provider instance.
- The constructor subscribes once to `vscode.workspace.onDidCloseTextDocument`. When VS Code reports a closed document, the entry whose key equals that document's `uri.toString()` is removed. The document's scheme does not matter.
- According to VS Code's documentation, this event fires when VS Code disposes a document. That can be well after its editor tab closes. The event also fires when a document's language is changed.
- After eviction, the next request for that URI runs every check and Git again.
- Two requests for the same URI while neither has finished each call `forRepo` and each run Git. The later one to finish overwrites the entry, with identical content.
- The emitter behind `onDidChange` never fires. VS Code therefore never re-asks for a document while it is open.

### 3.9 `dispose()`

- Disposes the close-document subscription and the change emitter, each once, and empties the cache. The protocol test requires exactly one disposal each of "change emitter" and "closed-document listener" per `dispose()` call, and nothing else.
- It does not clear the module-wide record (§3.2).
- After disposal the provider still answers `provideTextDocumentContent` exactly as before, running Git and caching the result. With the subscription gone, nothing is ever evicted.
- Calling `dispose()` a second time disposes the subscription and the emitter again. VS Code's disposables tolerate this.

### 3.10 Timing and messages

The module has no debounce, no delay, no timeout and no retry. It shows no user-visible message, writes no log, and has no localized strings.

---

## 4. Concrete examples

### 4.1 URIs (observed with `vscode-uri` 3.2.0 and real VS Code 1.139.1)

`A` below stands for 40 `a` characters, `B` for 40 `b` characters, `C` for 40 `c` characters and `Z` for 40 zeros.

| Call                                                                                     | `path`                    | `query`                                                                           | `toString()`                                                                                                                       |
| ---------------------------------------------------------------------------------------- | ------------------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `encodeDiffDocUri("/tmp/repo", "dir/file.txt", A)`                                       | `dir/file.txt`            | `commit=A&repo=%2Ftmp%2Frepo`                                                     | `branchwise:dir/file.txt?commit%3DA%26repo%3D%252Ftmp%252Frepo`                                                                    |
| `encodeDiffDocUri("/tmp/repo #?% with spaces 中文", "folder/odd #?\tname.txt", B + "^")` | `folder/odd #?\tname.txt` | `commit=B%5E&repo=%2Ftmp%2Frepo%20%23%3F%25%20with%20spaces%20%E4%B8%AD%E6%96%87` | `branchwise:folder/odd%20%23%3F%09name.txt?commit%3DB%255E%26repo%3D…`                                                             |
| `encodeDiffDocUri("/tmp/r/../repo/", "back\\slash", "HEAD")` (Linux)                     | `back\slash`              | `commit=HEAD&repo=%2Ftmp%2Fr%2F..%2Frepo%2F`                                      | the repository is recorded as `/tmp/repo/`                                                                                         |
| `encodeDiffBlobUri("/tmp/repo", "x/y.ts", C)`                                            | `x/y.ts`                  | `commit=C&repo=%2Ftmp%2Frepo&blob=1`                                              |                                                                                                                                    |
| `encodeDiffBlobUri("/tmp/repo", "x/y.ts", null)`                                         | `x/y.ts`                  | `commit=Z&repo=%2Ftmp%2Frepo&blob=1`                                              |                                                                                                                                    |
| `encodeDiffDocUri("/tmp/repo", "//x", A)`                                                |                           |                                                                                   | throws `[UriError]: If a URI does not contain an authority component, then the path cannot begin with two slash characters ("//")` |
| `encodeDiffDocUri("/tmp/repo", "C:foo", B)`                                              | `C:foo`                   | `commit=B&repo=%2Ftmp%2Frepo`                                                     | `branchwise:c%3Afoo?…`, and after `Uri.parse` the path is `c:foo`                                                                  |

Decoding the parsed string form of the first three rows gives back exactly `{ filePath, commit, repo }`, with no `blob` key. The blob rows decode with `blob: true`.

### 4.2 `decodeDiffDocUri` on hand-made queries (path `/p`)

| `query`                                  | Result (own keys in order `filePath, commit, repo[, blob]`) |
| ---------------------------------------- | ----------------------------------------------------------- |
| `""` or `commit`                         | `{ filePath: "/p", commit: undefined, repo: undefined }`    |
| `commit=`                                | `commit: ""`                                                |
| `commit=a&commit=b`                      | `commit: "b"`                                               |
| `commit=a&commit=%E0%A4%A`               | `commit: "a"`                                               |
| `commit=%E0%A4%A&commit=a`               | `commit: "a"`                                               |
| `blob=1` or `blob=%31`                   | `blob: true`                                                |
| `blob=true`, `blob=0` or `blob=1&blob=0` | no `blob` key                                               |
| `com%6Dit=abc` or `COMMIT=a`             | `commit: undefined`                                         |
| `commit=a+b%20c`                         | `commit: "a+b c"`                                           |
| `commit=a=b`                             | `commit: "a=b"`                                             |
| `repo=%2Fx&repo=%2Fy`                    | `repo: "/y"`                                                |
| `&&commit=z&`                            | `commit: "z"`                                               |
| `__proto__=x&commit=y`                   | `commit: "y"`, and no prototype change                      |
| `commit=%00`                             | `commit: "\u0000"`                                          |

### 4.3 Content

**Setup.** Repository R comes from `makeRepo()`: root commit ROOT, where `f` = `x`. A second commit SECOND adds these files:

| File               | Contents                                                                   |
| ------------------ | -------------------------------------------------------------------------- |
| `dir/a.txt`        | `A\n`                                                                      |
| `dir/b.txt`        | `B`                                                                        |
| `crlf.txt`         | `l1\r\nl2\r\n`                                                             |
| `bom.txt`          | `\uFEFFbom`                                                                |
| `latin1.txt`       | bytes `63 61 66 E9 0A`                                                     |
| `bin.dat`          | bytes `00 01 02 FF 0A`                                                     |
| `empty.txt`        | empty                                                                      |
| `conv.txt`         | `raw text\n`, with a textconv driver and a smudge filter that uppercase it |
| `x.eol`            | `e1\ne2\n`, with `text eol=crlf`                                           |
| `odd #?\tname.txt` | `odd`                                                                      |
| `link`             | symbolic link to `dir/a.txt`                                               |

A third commit adds a submodule `sm` whose commit is not in R. Then a merge commit MERGE is made, whose first parent has `f` = `x` and whose second parent has `f` = `side`. An annotated tag `v1` points at ROOT.

The provider was built with `forRepo = (d) => createGit(d, "git")`. Each URI was made with the encode functions, so R is recorded.

| URI                                                                   | Content                                                                                                                                                                                                         |
| --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `f` at SECOND                                                         | `x`                                                                                                                                                                                                             |
| `f` at `ROOT^`                                                        | `""` (Git fails)                                                                                                                                                                                                |
| `f` at `SECOND^`                                                      | `x`                                                                                                                                                                                                             |
| `dir` at SECOND                                                       | `tree SECOND:dir\n\na.txt\nb.txt\n`                                                                                                                                                                             |
| `""` (empty path) at SECOND                                           | `tree SECOND:\n\n.gitattributes\nbin.dat\nbom.txt\nconv.txt\ncrlf.txt\ndir/\nempty.txt\nf\nlatin1.txt\nlink\nodd #?\tname.txt\nx.eol\n`                                                                         |
| `/f`, `dir/../f`, `nope.txt` at SECOND                                | `""`                                                                                                                                                                                                            |
| `./f` at SECOND                                                       | `x`                                                                                                                                                                                                             |
| `crlf.txt`                                                            | `l1\r\nl2\r\n`                                                                                                                                                                                                  |
| `bom.txt`                                                             | `\uFEFFbom`                                                                                                                                                                                                     |
| `latin1.txt`                                                          | `caf\uFFFD\n`                                                                                                                                                                                                   |
| `bin.dat`                                                             | `\u0000\u0001\u0002\uFFFD\n`                                                                                                                                                                                    |
| `empty.txt`                                                           | `""`                                                                                                                                                                                                            |
| `conv.txt`                                                            | `raw text\n` (no textconv, no filter)                                                                                                                                                                           |
| `x.eol`                                                               | `e1\ne2\n` (no end-of-line conversion)                                                                                                                                                                          |
| `odd #?\tname.txt`                                                    | `odd`                                                                                                                                                                                                           |
| `link`                                                                | `dir/a.txt`                                                                                                                                                                                                     |
| `sm` at the third commit                                              | `""`                                                                                                                                                                                                            |
| `f` at `MERGE^`                                                       | `x`                                                                                                                                                                                                             |
| `f` at uppercase SECOND, `SECOND^^`, `SECOND~1`, `Z^`, or 64 zeros    | `""`, without Git                                                                                                                                                                                               |
| `f` at 64 `e` characters (SHA-1 repository)                           | `""` (Git fails)                                                                                                                                                                                                |
| blob URI with the ID of `SECOND:dir/a.txt`                            | `A\n`                                                                                                                                                                                                           |
| blob URI with ROOT's ID                                               | `commit <ROOT>\nAuthor: T <t@t.com>\nDate:   <date>\n\n    init\n\ndiff --git a/f b/f\nnew file mode 100644\nindex 0000000..c1b0730\n--- /dev/null\n+++ b/f\n@@ -0,0 +1 @@\n+x\n\\ No newline at end of file\n` |
| the same, hostile Git configuration                                   | `<abbrev> (tag: refs/tags/v1) init\ndiff --git a/f b/f\n…`                                                                                                                                                      |
| blob URI with SECOND's tree ID                                        | `tree <tree id>\n\n.gitattributes\n…`                                                                                                                                                                           |
| document URI `f` with SECOND's tree ID, or with an annotated tag's ID | `x`                                                                                                                                                                                                             |
| document URI `f` with a blob ID                                       | `""`                                                                                                                                                                                                            |

**SHA-256.** In a repository made with `git init --object-format=sha256`, `f` at its 64-hex HEAD and the blob URI of `HEAD:f` both return the file text. A 40-hex ID there returns `""`.

**Size and concurrency.** A 17.8 MB text file was returned whole in about 90 ms. Two simultaneous requests for one URI both resolved to `x` and called `forRepo` twice.

**Failures that return an empty document.** Each of these returns `""`:

- a Git path of `/nonexistent/git`;
- a repository folder that is not a Git repository;
- a missing folder, where `forRepo` throws. Here `""` is returned directly.

### 4.4 Lifecycle and callbacks (repository R, HEAD `H`, recording mocks)

The steps run in order against one provider. `isSavedRepo` returns false throughout, and its calls are recorded.

1. **Construct.** A close listener is added. Neither callback is called.
2. **Hand-made URI for an unrecorded spelling.** The query is `commit=H&repo=<R + "/sub/..//">` and the provider has not recorded that spelling. The result is `""`, returned directly as a string. `isSavedRepo` was called once, with `R + "/"`, and `forRepo` was not called.
3. **First request after encoding.** Build `u = encodeDiffDocUri(R, "f", H)`, then request it. The result is a promise that resolves to `x`. `forRepo` was called once, with `R`, and `isSavedRepo` was not called.
4. **Same URI again.** The result is the string `x`, returned directly. `forRepo` was not called again.
5. **Recorded repository spelled with a trailing slash.** The query has `repo=<R + "/./">`. The result is `""`. `isSavedRepo` was called with `R + "/"`, and Git did not run.
6. **Object that does not exist.** Request `commit=<40 d>&repo=<R>` with the key `"bad"`. The result is `""`, and Git ran. Requesting it again returns `""` directly, without Git.
7. **Close event.** Fire the close event for a document whose `toString()` is `"bad"`, then request that URI again. The result is a promise, and Git ran again.
8. **`onDidChange`.** It is a function, and it is the same function on every read.
9. **`dispose()`.** It logs "close listener disposed" and "emitter disposed", each once.
10. **After `dispose()`.** Request `u`: the result is a promise and Git ran. Request `u` again: the string comes back directly.
11. **Second `dispose()`.** It logs both disposals again.
12. **`forRepo` that throws.** Two requests each return `""` directly, and `forRepo` was called twice.
13. **`isSavedRepo` that throws.** The exception propagates to the caller.

---

## 5. Non-functional requirements

- **Security.** No URI may start a Git process unless it passes all the checks in §3.6. Only a full object ID (optionally one `^`, document URIs only) and a repository that was recorded or saved get through. No part of a URI may reach Git outside the single revision argument after `--end-of-options`. The module must never write files or change repository state; `git show` is read-only.
- **Never reject.** `provideTextDocumentContent` must not reject or throw because of URI content, Git failures or a failing `forRepo`. Every such case produces `""`.
- **Import-time behaviour.** Loading the module has no side effects and touches no VS Code API (§3.1). The protocol test loads it with a `vscode` mock that lacks `Uri`.
- **Constructor.** The constructor makes exactly one `onDidCloseTextDocument` subscription and exactly one `EventEmitter`. It runs no Git and does not call its callbacks.
- **Resource cleanup.** `dispose()` releases both of those resources exactly once per call, and frees the cached strings.
  - Cached strings otherwise live until VS Code closes the document. Memory use is the size of every open historical document.
  - The module-wide record lives for the process and grows by one entry per distinct repository key encoded (`diffdoc Q4`).
- **Purity.**
  - `decodeDiffDocUri` is pure.
  - The two encode functions have one side effect: recording the repository.
  - The provider is stateful: it holds the cache.
- **Performance.** The provider makes at most one `forRepo` call and one Git process per uncached request, and none for cached or refused requests. Output is buffered whole. There is no size limit.
- **Compatibility.**
  - The scheme `branchwise`, the query keys `commit`, `repo` and `blob`, the value encoding (`encodeURIComponent`), the `^` convention and the blob marker `blob=1` must stay the same. VS Code persists open editors' URIs across restarts, and the provider must serve URIs written by earlier sessions of the current format.
  - The provider must work with URIs revived by VS Code (plain `vscode.Uri` objects) and with the plain objects the tests pass, which have only `path`, `query` and `toString`.

---

## 6. Test coverage

### 6.1 What existing tests already check

**`tests/extension/diff-doc-provider.test.ts`** (Vitest, `vscode` mocked with `Uri.from`/`with`/`toString`, a no-op `EventEmitter` and `workspace.onDidCloseTextDocument`, real Git through `createGit`):

- A file at a commit, the same file at `<commit>^`, and a blob URI built with `encodeDiffBlobUri` return the right text.
- A 40-zero document URI and a `null` blob URI return `""` without calling `forRepo`.
- These URIs return `""` without calling `forRepo`, even when `isSavedRepo` always returns true, and leave an existing file unchanged:
  - `commit=--output=<file>`
  - `commit=-O<file>`
  - `commit=--ext-diff`
  - `commit=HEAD`
  - `commit=abc1234`
  - `commit=<40 a>^&blob=1`
- A relative repository, `.`, and an absolute repository that is neither recorded nor saved return `""` without calling `forRepo`.
- A repository that is not recorded but that `isSavedRepo` accepts under its normalized key serves content.
- A malformed escape in `commit` returns `""` without calling `forRepo`.

**`tests-ext/historyDocuments.test.ts`** (real VS Code):

- Encoding, then `toString()`, then `Uri.parse`, then decoding round-trips repository and file paths that contain spaces, `#`, `?`, `%`, `%41`, tabs, newlines, quotes, non-ASCII text and (off Windows) a backslash. The result has exactly the keys `repo`, `filePath` and `commit`.
- Two repositories, each with the same file name containing `#` and spaces, requested at the same time, each return their own content.
- `dispose()` can be called.

**`tests/extension/message-protocol.test.ts`** (through `createMessageProtocol`):

- One registration uses the scheme `"branchwise"` and a `DiffDocProvider` instance.
- Constructing the provider does not create a Git client.
- Deactivation disposes "change emitter" and "closed-document listener" exactly once each, plus the registration.
- A hand-made URI for a saved repository resolves through the client's `show`, and the factory receives the raw repository string and the current Git path.
- An unsaved, unrecorded repository returns `""` without creating a client.
- A changed Git path applies to the next document.
- Implicitly: the module can be imported and the provider constructed with a `vscode` mock that has no `Uri`.

### 6.2 Gaps, and tests to add

Unless a case says otherwise, each case uses the `diff-doc-provider.test.ts` setup, where `provider(saved)` records `forRepo` calls in `opened`. Cases that need eviction replace the mock's `workspace.onDidCloseTextDocument` with one that captures the listener.

- **diffdoc G1, cached content.** Setup: repository `repo`, commit `C`, `u = encodeDiffDocUri(repo, "f", C)`. Call: `await docs.provideTextDocumentContent(u)`, then `docs.provideTextDocumentContent(u)` again without awaiting. Expect: both give the file text, the second value is a plain string (not a promise), and `opened` has length 1.
- **diffdoc G2, eviction on close.** Setup: as G1, with the captured close listener. Call: request `u`; call the listener with `{ uri: u }`; request `u` again. Expect: `opened` has length 2, and both results are the file text. Also, a close event for an unrelated URI leaves `opened` at length 1 after a further request.
- **diffdoc G3, failures are cached.** Setup: `u = encodeDiffDocUri(repo, "missing.txt", C)`. Call: request `u` twice. Expect: `""` both times, and `opened` has length 1.
- **diffdoc G4, a throwing `forRepo` is not cached.** Setup: `new DiffDocProvider(() => { throw new Error("x"); }, () => true)` and an encoded URI. Call: request twice. Expect: both return `""` directly (not promises), and the factory ran twice.
- **diffdoc G5, object-ID rules.** Setup: `provider(() => true)` and hand-made URIs for `repo`. Call: request each of these commit values: uppercase `C`, `C^^`, `C~1`, `C^2`, 40 zeros followed by `^`, 64 zeros, and a 39-character prefix of `C`. Expect: `""` and `opened` stays empty for all of them.
- **diffdoc G6, SHA-256 IDs.** Setup: a repository made with `git init --object-format=sha256`, and the 64-hex HEAD `H` and blob `B` of file `f`. Call: request `encodeDiffDocUri(dir, "f", H)` and `encodeDiffBlobUri(dir, "f", B)`. Expect: both return the file text. Skip this case if Git is older than 2.29.
- **diffdoc G7, arguments given to the callbacks.** Setup: an encoded repository `repo`; an unrecorded absolute folder `other`; `isSavedRepo` records its argument and returns false. Call: request a hand-made URI with `repo=` + `encodeURIComponent(other + "/x/..")`, then an encoded URI for `repo`. Expect:
  - `isSavedRepo` was called once, with `normalizeRepoPath(other)`, and not for `repo`.
  - `forRepo` was called once, with `repo` exactly.
  - For a URI with `repo=` + `encodeURIComponent(repo + "/x/..")` served through the record, `forRepo` receives the un-normalized `repo + "/x/.."`.
- **diffdoc G8, the recorded-repository set is module-wide.** Setup: call `encodeDiffDocUri(repo, "f", C)`. Then construct a fresh `provider(() => false)`, dispose it, and construct another fresh `provider(() => false)`. Call: request a hand-made URI (`commit=C&repo=<repo>`) on the second provider. Expect: the file text.
- **diffdoc G9, exact URI shape.** Call: `encodeDiffDocUri("/tmp/r", "d/f.txt", "a".repeat(40) + "^")` and `encodeDiffBlobUri("/tmp/r", "d/f.txt", null)`. Expect:
  - Both have scheme `branchwise` and path `d/f.txt`.
  - The first query is `commit=` + 40 `a` + `%5E&repo=%2Ftmp%2Fr`.
  - The second query is `commit=` + 40 `0` + `&repo=%2Ftmp%2Fr&blob=1`.
- **diffdoc G10, decoding edge cases.** Call: `decodeDiffDocUri` with the queries in §4.2. Expect: the results in §4.2, including own `commit` and `repo` keys set to `undefined` when those arguments are missing, and no `blob` key unless the value is `"1"`.
- **diffdoc G11, the exact Git arguments.** Setup: a `forRepo` that returns `{ show: vi.fn(async () => "ok") }`, and `isSavedRepo` returning true. Call: request hand-made URIs:
  1. path `a b/c.txt`, `commit=C%5E`;
  2. path `a b/c.txt`, `commit=C&blob=1`.
     Expect: `show` receives `["--end-of-options", C + "^:a b/c.txt"]` for the first and `["--end-of-options", C]` for the second.
- **diffdoc G12, raw blob content.** Setup: commit files with CRLF endings, a smudge filter and a textconv driver configured in `.gitattributes`, and a symbolic link. Call: request each at that commit. Expect: the stored bytes (CRLF kept, not filtered, not converted), and the link's target text.
- **diffdoc G13, dispose.** Setup: a mock that counts disposals of the close subscription and the emitter. Call: request an encoded URI; then `dispose()`; then request the same URI. Expect:
  - one disposal each;
  - the request after `dispose()` runs `forRepo` again, because the cache was cleared;
  - it still returns the file text.
- **diffdoc G14, `onDidChange` never fires.** Setup: subscribe a spy to `provider.onDidChange` using an emitter mock that records `fire`. Call: request several URIs, and fire the close listener. Expect: `fire` is never called.
- **diffdoc G15, backslashes on Windows** (Windows only). Call: `encodeDiffDocUri("C:\\r", "d\\f.txt", C)`. Expect: path `d/f.txt`, and a later request for a hand-made URI with `repo=` + `encodeURIComponent("c:/r")` is accepted through the record. On other platforms, assert that the path `d\f.txt` is kept.
- **diffdoc G16, `./` and directory paths** (documents current behaviour; see `diffdoc Q6`). Call: request `./f`, `dir` and `""` at a commit. Expect: `x`, then `tree <C>:dir\n\n…`, then `tree <C>:\n\n…`.
- **diffdoc G17, never rejects on Git failure.** Setup: `forRepo` returns a client whose `show` rejects with an error. Call: request. Expect: the promise resolves to `""`.

---

## 7. Questions (current behaviour stated, no decision made)

- **diffdoc Q1: failures are cached and look like empty files.** A Git failure is cached as `""` until VS Code closes the document, and `onDidChange` never fires. So a transient failure keeps the editor empty for its lifetime. There is also no way to tell "this file did not exist at that revision" (the intended empty side of an added or deleted file) from "Git failed" or "the URI was refused". Should failures stay uncached, be reported (for example logged), or be shown differently?
- **diffdoc Q2: refusals are silent.** A URI from a link or another extension that names a symbolic ref, an abbreviated ID or an unknown repository opens as an empty editor, with no message and no log line. Is silence intended, or should refusals be logged for diagnosis?
- **diffdoc Q3: different spellings of one repository.** Normalization keeps a trailing separator, so `/r/` and `/r` are different keys. If a repository was encoded as `/r` and a URI names `/r/`, or the reverse, the URI is refused unless `isSavedRepo` accepts that exact spelling. On Windows, only the drive letter's case is folded; the rest of the path is compared case-sensitively. Should keys be canonicalised further, for example by removing trailing separators or using the real path?
- **diffdoc Q4: the recorded-repository set is global and permanent.** Repositories are recorded when a URI is built, not when it is opened. The set is shared by all provider instances, survives `dispose()`, and is never pruned, even after a repository is removed from the workspace or deleted. Is process-wide, permanent recording intended?
- **diffdoc Q5: blob URIs accept any object type.** A blob URI with a commit, tag or tree ID shows `git show`'s rendering of that object. The layout of that rendering follows the user's `format.pretty`, `log.decorate` and `log.date` settings, which the client does not pin. The product only ever passes blob IDs. Should non-blob objects produce an empty document, or be rendered in a fixed format?
- **diffdoc Q6: odd paths in document URIs.** The file path is not validated, and some values give results other than a file:
  - an empty path or a directory shows a tree listing;
  - a path beginning with `./` or `../` is resolved by Git relative to the client's working folder;
  - `..` inside a path or a leading `/` fails.

  The product's callers pass validated repository-relative paths. Should the provider refuse paths that are empty, absolute or relative-looking, or that name trees?

- **diffdoc Q7: text decoding.** Git's output is decoded as UTF-8. Latin-1 and UTF-16 text and binary files arrive garbled, with U+FFFD and NUL characters, and a BOM stays in the text as U+FEFF. The user's `files.encoding` or the file's detected encoding is not considered. Is lossy UTF-8 acceptable, or should encoding be honoured?
- **diffdoc Q8: two exceptions escape.** A throwing `forRepo` is turned into `""`. A throwing `isSavedRepo`, or a client whose `show` throws synchronously, instead throws out of `provideTextDocumentContent`. Should those also produce `""`?
- **diffdoc Q9: the raw string goes to `forRepo`.** `forRepo` receives the repository string exactly as written in the URI, while the acceptance check uses the normalized key. A URI naming `/r/x/..` is accepted as `/r`, but the Git client is built for the folder `/r/x/..`. That folder fails if `/r/x` no longer exists, and is a different string on Windows. Should `forRepo` receive the normalized path?
- **diffdoc Q10: mixed return types.** Refused, cached and `forRepo`-failure results are returned as plain strings, and Git-backed results as promises. VS Code and the tests accept both. May a replacement always return a promise, or always a string when it can?
- **diffdoc Q11: only a single `^` names a parent.** `~N` and `^N` are refused. So a diff against a merge's second parent, or a grandparent, cannot be expressed except by passing the resolved ID. Is that the intended limit?
- **diffdoc Q12: drive-letter-like file names.** VS Code's string form of a URI whose path starts with a letter and a colon (for example the top-level file `C:foo`, which is valid on Linux) lowercases that letter. After a round trip through the string form, for instance in a restored editor, the provider asks Git for `c:foo`, which fails on case-sensitive file systems. The cache key, which is the string form, also cannot tell `C:foo` from `c:foo`. Is this edge worth handling, for example by always starting the path with `/` or placing the file path in the query? That would change the URI format, which has compatibility implications.
- **diffdoc Q13: behaviour after `dispose()`.** A disposed provider still runs Git and caches results, and those results are never evicted because the close subscription is gone. A second `dispose()` disposes the subscription and emitter again. Should a disposed provider return `""` without running Git, and should `dispose()` be idempotent?
- **diffdoc Q14: no de-duplication of requests in flight.** Simultaneous requests for one URI start one Git process each. VS Code normally asks once per document, so this is rarely visible. Should requests in flight be shared?

---

## Decisions

These decisions are the maintainer's answers to the questions above. Where they differ from "current behaviour" elsewhere in this specification, they win.

- **Q1.** Cache only content Git produced successfully. A Git failure resolves to `""` but is not cached, so the next request for that URI runs Git again.
- **Q2, Q3, Q4, Q5, Q7, Q9, Q10, Q11, Q12.** Keep the current behaviour.
- **Q6.** A document URI with an empty file path is refused (`""`, no Git). Other paths are passed on as today.
- **Q8.** Nothing escapes to VS Code: an exception from `isSavedRepo`, a synchronous throw from `show`, or any other failure while serving a URI resolves to `""` (and, per Q1, is not cached).
- **Q13.** `dispose()` is idempotent: the close listener and the event emitter are released once, however often it is called. After disposal, every request resolves to `""` without running Git or caching anything.
- **Q14.** Concurrent requests for the same URI share one Git run: while a request is in flight, a second request for the same `uri.toString()` receives the same result.
- **After review: the revision is followed by `--`.** Without it, Git takes a revision it cannot resolve as a path when a file of that name exists in the working tree, and `git show` then shows HEAD. On Windows the path `<id>:dir/../f` resolves to the file `f`, so a path with `..` showed HEAD's commit instead of failing. The `--` makes Git treat the argument only as a revision, so each failure listed in §3.7 gives `""` on every platform.
