# Clean-room specification: `src/backend/queries/commitDetails.ts`

This document says what the commit-details query must do, as seen from outside it. It is written for an engineer who will build a replacement without seeing the current source. It was put together from the module's callers, the tests that exercise it, the shared types, the Git client it receives, Git's documented output formats, and the behaviour observed by running the current code against purpose-built repositories.

In one sentence: given a Git client for one repository and a commit, the module returns that commit's identity, people, date and full message, plus the list of files the commit changed relative to its first parent, each with its change kind and line counts. It returns `null` details instead of throwing when anything goes wrong.

---

## 0. Environment used for the observations

- Linux, Git 2.43.0, Node v22.22.2. simple-git 3.36.0 and Vitest 4.1.11 came from the repository's `node_modules`.
- As in the backend test suite, `GIT_CONFIG_GLOBAL` pointed at `tests/fixtures/gitconfig` and `GIT_CONFIG_NOSYSTEM=1` was set. Selected scenarios were repeated with `tests/fixtures/hostile.gitconfig` plus extra repository settings (`diff.renames=false`, `diff.noprefix=true`, `diff.external=/bin/false`, `diff.mnemonicPrefix=true`, `core.quotePath=true`). Results did not change.
- The client passed in was always `createGit(repoPath, "git")` from `@/backend/gitClient`, the same factory the tests and the extension use. To see the exact command lines, the client was pointed at a wrapper script that logged its arguments and then ran Git.

---

## 1. Interface

### 1.1 Module path and the single export

The module lives at `src/backend/queries/commitDetails.ts`. Everything imports it as `@/backend/queries/commitDetails`.

It has exactly one export. The name, the parameter order and the types must not change:

```ts
export async function commitDetails(
  git: SimpleGit,
  input: { commitHash: string; dateType: DateType }
): Promise<QueryResult<"commitDetails">>;
```

- `git`: a simple-git client already bound to the repository's working directory (see §2.2). The function must run all of its Git commands through this object.
- `input.commitHash`: the revision to describe. In production it is always a full commit ID taken from the graph. Tests also pass `"HEAD"` and a nonexistent abbreviated ID. See §3.2 for every accepted form.
- `input.dateType`: `"Author Date"` or `"Commit Date"`. It selects which timestamp goes into `date`.
- The input object's type is not exported today. A replacement may write it inline or as a private alias, but it must not export a new name or add required fields.
- `QueryResult<"commitDetails">` resolves to `{ commitDetails: GitCommitDetails | null }`. The returned object must have **exactly one own property**, `commitDetails` (see §5.4 for why).

The module exports no types and no other values.

### 1.2 Result types (defined in `src/backend/types/git.types.ts`, not in this module)

`GitCommitDetails`. The object must have exactly these eight properties and no others, because a test compares it with `toEqual` against an object that lists exactly these keys.

| Field         | Type              | Meaning                                                                                                                                                                                                                           |
| ------------- | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `hash`        | `string`          | The commit's full object ID in lowercase hexadecimal, as Git prints it (40 characters for SHA-1 repositories, 64 for SHA-256). It is never the caller's input echoed back: `"HEAD"` or an abbreviation comes back as the full ID. |
| `parents`     | `string[]`        | The full IDs of the commit's parents, in Git's order (first parent first). For a commit without parents, the current value is `[""]`, a one-element array holding an empty string (see Q2).                                       |
| `author`      | `string`          | The author name exactly as recorded in the commit. `.mailmap` is **not** applied.                                                                                                                                                 |
| `email`       | `string`          | The author email exactly as recorded, without angle brackets. `.mailmap` is not applied.                                                                                                                                          |
| `date`        | `number`          | Whole seconds since the Unix epoch. It is the author timestamp for `"Author Date"` and the committer timestamp otherwise. The time zone offset is dropped.                                                                        |
| `committer`   | `string`          | The committer name exactly as recorded. The committer's email is not reported.                                                                                                                                                    |
| `body`        | `string`          | The complete commit message, subject line included, after the normalisation in §3.4.                                                                                                                                              |
| `fileChanges` | `GitFileChange[]` | The files the commit changed, as described in §3.5. It is empty when there is nothing to report.                                                                                                                                  |

`GitFileChange`. Each entry must have exactly these five properties and no others. A test compares entries with `toEqual`, so, for example, a similarity score must not be added.

| Field         | Type                       | Meaning                                                                                                                         |
| ------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `oldFilePath` | `string`                   | The path before the commit. For a rename, it is the source path. For every other kind, it equals `newFilePath`.                 |
| `newFilePath` | `string`                   | The path after the commit. For a rename, it is the destination. For a deletion, it is the deleted path, which no longer exists. |
| `type`        | `"A" \| "M" \| "D" \| "R"` | Added, modified, deleted or renamed. No other letter can appear. The union type is `GitFileChangeType`.                         |
| `additions`   | `number \| null`           | Lines added. `null` when Git reports no line counts for the change, which in practice means Git treats the content as binary.   |
| `deletions`   | `number \| null`           | Lines removed. It is `null` exactly when `additions` is `null`.                                                                 |

`DateType` is `"Author Date" | "Commit Date"`.

### 1.3 Who uses the export

| User                                              | What it relies on                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/old-extension/messageHandler.ts`             | Imports `commitDetails`. It registers it as the `"commitDetails"` graph query and calls `commitDetails(git, { commitHash: msg.commitHash, dateType: config.dateType() })`. `git` comes from `gitClientFactory(repo, config.gitPath(), controller.signal).getInstance()`, so the client carries an abort signal that fires when a newer details request or a repository switch replaces this one. The handler spreads the result into the reply, `{ command, ...result, repo, requestId }`, posts it only if the signal has not fired, and turns a rejection into a `graphQueryError` message that carries the error text. |
| `tests/backend/queries/commitDetails/get.test.ts` | Imports `commitDetails`. Calls it with `createGit(dir, "git")` and `{ commitHash, dateType }`, where `commitHash` is a full ID, `"HEAD"` or `"deadbeef1234"`. Checks the exact key set of the result and of each file change. See §6.                                                                                                                                                                                                                                                                                                                                                                                     |
| `tests/backend/queries/signedCommits.test.ts`     | Imports `commitDetails`. Calls it on an SSH-signed commit in a repository with `log.showSignature=true` and `color.ui=always`, and checks `hash`, `body` and the list of `newFilePath`s.                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `tests/extension/graph-queries.test.ts`           | Replaces the module with `vi.mock("@/backend/queries/commitDetails", () => ({ commitDetails: mock }))`. It depends on the export's name and on the client being the **first** argument: it reads `.signal` from the first argument of the first call.                                                                                                                                                                                                                                                                                                                                                                     |

The webview never imports the module, but it consumes the result after it crosses the message bridge:

- `src/webview/lib/handler/commit-details.ts` drops a reply whose `hash` differs from the full ID of the expanded row. A replacement must return Git's full lowercase ID (§3.2). A `null` reply closes the panel and shows the generic "Unable to load commit details" dialog.
- `src/webview/components/commit/CommitDetails.tsx` shows `hash`, `parents.join(", ")`, `author` and `email`, `date` (read as Unix seconds), `committer`, and `body` with whitespace preserved.
- `src/webview/components/commit/FileTree.tsx` and `src/webview/utils/fileTree.ts` split `newFilePath` on `/` to build folders, then sort the tree themselves. They colour entries by `type` from a table that has only the keys `A`, `M`, `D` and `R`. When either count is `null`, they label the entry as binary and disable its diff. They show counts only for `M` and `R`.
- Opening a diff (`viewDiff` in `messageHandler.ts`) reads `oldFilePath` at `<hash>^` and `newFilePath` at `<hash>`, so the list is expected to describe the change against the **first parent**.

---

## 2. Dependencies the implementation must use

### 2.1 Imports

- `import type { SimpleGit } from "simple-git";`
- `import type { DateType, GitCommitDetails, QueryResult } from "@/backend/types";` The file may also import `GitFileChange` and `GitFileChangeType` from the same path if it needs them.

No runtime import is required. The module must **not** create its own client, for example with `createGit`, and must not spawn Git itself (§5.2).

### 2.2 The client it receives

`git` is created by `createGit` in `src/backend/gitClient.ts`. Properties that matter here:

- Each call to `git.raw(args)` runs `<gitPath> --no-optional-locks -c log.showSignature=false -c status.showUntrackedFiles=all -c color.ui=never -c color.branch=never -c color.diff=never -c color.status=never -c color.showBranch=never -c color.grep=never <args…>` in the repository directory. These overrides are what keep a user's `log.showSignature=true` or `color.ui=always` out of the output. The module gets them for free by using the client and must not add its own.
- Output is **not trimmed** (`trimmed: false`). `raw` resolves with stdout decoded as UTF-8. Bytes that are not valid UTF-8 become U+FFFD.
- `raw` rejects when Git exits non-zero **and** wrote something to stderr. A zero exit resolves even if stderr carried warnings, such as Git's rename-limit warning.
- At most 6 processes run at once per client. When the client's abort signal fires, running processes are killed and pending or new `raw` calls reject. If the signal has already fired, no process is started at all.

### 2.3 Git commands

The current module runs exactly three commands per call, all through `git.raw`. The arguments below are exactly what reaches Git after the client's prefix. `<rev>` is `input.commitHash`, passed unchanged as its own argument.

**Command 1: commit header and message**

```
show --quiet --format=<FORMAT> --end-of-options <rev>
```

- `--quiet` suppresses the diff that `show` would otherwise print.
- `--end-of-options` makes Git read `<rev>` as a revision even when it starts with `-`, so an input like `--output=/some/file` cannot act as an option (observed: no file is created and the result is `null`).
- `<FORMAT>` prints six header placeholders on the first line, in this order, then `%n%B`:
  1. `%H`: full commit ID
  2. `%P`: space-separated full parent IDs, which is empty for a parentless commit
  3. `%an`: author name. Use the lowercase form, which does not apply `.mailmap`.
  4. `%ae`: author email. Lowercase form, no `.mailmap`.
  5. `%at` when `dateType === "Author Date"`, otherwise `%ct`: a Unix timestamp in seconds
  6. `%cn`: committer name (lowercase form)

  After the header comes `%n` (a newline) and then `%B` (the raw message: subject and body, unwrapped). Because this is `--format=` (a terminator format), Git appends one more newline after `%B`.

- The six header fields must be separated by a delimiter that cannot occur inside names, emails, IDs or numbers. The delimiter is **not** part of any contract. The current command uses a fixed 40-character ASCII token. Other backend queries in this repository use NUL (`%x00`), which is equally acceptable. Any change is visible only in the process arguments.

Example of the raw stdout for the root commit of §4.1, with `⟨D⟩` standing for the delimiter:

```
c40822f2c5a1c67cffab9e5afff99583dfd3bc61⟨D⟩⟨D⟩Ann Author⟨D⟩ann@example.com⟨D⟩1600000100⟨D⟩Cal Committer
root

```

For an annotated tag name, `show` first prints the tag object (`tag <name>`, `Tagger: …`, a blank line, the tag message), and only then the formatted commit. See §3.2 and Q5.

**Commands 2 and 3: changed files and line counts**

```
diff-tree --name-status -z -r -m --root --find-renames --diff-filter=AMDR --end-of-options <rev>
diff-tree --numstat -z -r -m --root --find-renames --diff-filter=AMDR --end-of-options <rev>
```

What each argument contributes:

| Argument             | Why it matters                                                                                                                                                                                                                                 |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `-z`                 | Paths are printed raw, with no C-style quoting and no escaping, whatever `core.quotePath` says. Records and fields are terminated by NUL (details below). Without it, the names listed in §3.5.4 could not be recovered byte for byte.         |
| `-r`                 | Recurse into subdirectories, so entries are files (and submodules), never tree objects.                                                                                                                                                        |
| `-m`                 | Makes `diff-tree` emit a separate diff for each parent of a merge, in parent order. Without it, `diff-tree` prints nothing for a merge.                                                                                                        |
| `--root`             | A parentless commit is diffed against the empty tree, so all its files appear as added. Without it, a root commit prints nothing.                                                                                                              |
| `--find-renames`     | Rename detection with Git's default similarity threshold of **50%**. Copies are not detected. This flag applies regardless of the user's `diff.renames` setting, which plumbing ignores. The user's `diff.renameLimit` still applies (§3.5.3). |
| `--diff-filter=AMDR` | Only added, modified, deleted and renamed entries are printed. Type changes (`T`, such as a file becoming a symlink), copies (`C`, not produced here anyway), unmerged (`U`), unknown (`X`) and broken pairs (`B`) are dropped.                |
| `--end-of-options`   | As for command 1.                                                                                                                                                                                                                              |

Output layout (Git's documented `-z` formats, as observed with Git 2.43.0). `␀` is a NUL byte.

- If there is nothing to print, stdout is empty.
- Otherwise the output is one or more **sections**, one per parent that has at least one entry left after filtering. Each section is introduced by a field holding the full ID of the commit being shown, terminated by `␀`. A parent whose diff is empty after filtering gets **no section at all**, so the first section present is not necessarily the first parent's. This matters for Q1.
- `--name-status` records:
  - non-rename: `<status>␀<path>␀`, where status is `A`, `M` or `D`
  - rename: `R<score>␀<old path>␀<new path>␀`, where the score is three digits, e.g. `R100` or `R064`
- `--numstat` records:
  - non-rename: `<added>\t<deleted>\t<path>␀`
  - rename: `<added>\t<deleted>\t␀<old path>␀<new path>␀`. Here the first field stops right after the second tab, with no path in it, and the source and destination come as the next two NUL-terminated fields.
  - `<added>` and `<deleted>` are decimal numbers, or `-` for both when Git treats the pair as binary.
- Entries within a section are in Git's path order: ascending byte order of the full path, with a rename placed at the position of its **new** path. Both commands list the same entries in the same order.

Raw example for the merge of §4.4, which has one entry per section and sections for both parents:

```
name-status: f720e965…␀M␀f␀A␀s␀f720e965…␀M␀f␀A␀m␀
numstat:     f720e965…␀3\t0\tf␀1\t0\ts␀f720e965…␀1\t1\tf␀1\t0\tm␀
```

Raw example for a rename with edits:

```
name-status: a1a2ad28…␀…␀R064␀ten.txt␀zz-renamed.txt␀
numstat:     a1a2ad28…␀…␀2\t2\t␀ten.txt␀zz-renamed.txt␀
```

The replacement must keep these three commands. Their observable behaviour depends on these exact options, and §3 is written against their output.

---

## 3. Behaviour

### 3.1 Overall contract

- The returned promise **always resolves**. It never rejects and never throws synchronously.
- On success it resolves to `{ commitDetails: <GitCommitDetails> }`.
- On any failure it resolves to `{ commitDetails: null }`. Failures include a Git command failing, an aborted client, a missing Git binary, a directory that is not a repository, and output that does not have the expected shape. No partial result is ever returned: if any of the three Git commands (§2.3) fails, or its output does not have the expected layout, the whole result is `null`.
- Each call is independent. The module keeps no state between calls and must be safe to call concurrently for different commits and clients.

### 3.2 Which commit is described, and `hash`

`commitHash` is handed to Git as a revision. Observed outcomes (repository of §4.1/§4.2, where `HEAD` is the second commit):

| `commitHash` input                                                                        | Result                                                              |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| full 40- or 64-character ID                                                               | details of that commit                                              |
| abbreviated ID (`4db0ec8`), or the full ID in upper case                                  | details, with `hash` the full **lowercase** ID                      |
| `HEAD`, `HEAD~1`, a branch name, a lightweight tag name                                   | details of the commit it names, with `hash` the full ID             |
| annotated tag name                                                                        | `null` (see Q5)                                                     |
| a tree ID, a blob ID, the all-zero ID, an unknown ID                                      | `null`                                                              |
| `""` (empty string)                                                                       | `null`                                                              |
| a range (`HEAD~1..HEAD`), two revisions in one string, a file name that is not a revision | `null`                                                              |
| something that looks like an option (`--output=<file>`)                                   | `null`, and Git does not treat it as an option (no file is written) |

### 3.3 Header fields

- `hash`: see §3.2.
- `parents`: Git's `%P` split on single spaces, in the order Git gives: first parent, second parent, and so on (an octopus merge gives three or more). When `%P` is empty, which happens for a root commit and for the boundary commit of a shallow clone, the current result is `[""]` (Q2).
- `author`, `email`, `committer`: exactly as stored, without trimming or mapping. `.mailmap` has no effect, even with `log.mailmap` enabled. Empty values are possible and come back as `""`, e.g. a commit whose author line is `author  <> …` gives `author: ""` and `email: ""`.
- Commit objects stored in another encoding (with an `encoding` header, e.g. ISO-8859-1) are re-encoded to UTF-8 by Git before the module sees them. Names and message both arrive as proper Unicode text. Observed: `Jos\xe9` gives `"José"`.
- `date`: the selected Git timestamp as a JavaScript number of seconds. `"Author Date"` selects the author timestamp. Any other value, which in production means `"Commit Date"`, selects the committer timestamp (Q7). Example: author `1600000100 +0200` and committer `1650000100 -0500` give 1600000100 or 1650000100 respectively.
- Signature data is never part of any field, even when the user's configuration asks Git to show signatures. The client's `log.showSignature=false` handles this, and `signedCommits.test.ts` checks it.

### 3.4 `body`

`body` is the text Git prints for `%B`, changed as follows:

1. Every line ending in the message, whether CR LF, a lone CR or LF, becomes a single LF (`\n`). A lone CR in the middle of a line therefore splits it into two lines.
2. Trailing lines that are **completely empty** are removed, together with the final line break, so the body never ends with `\n`. Lines at the end that contain only spaces or tabs are **kept**.
3. Nothing else changes: leading blank lines, indentation, tabs, internal blank lines and Unicode are preserved.

Observed (raw message stored in the commit object → `body`):

| Raw message bytes                                                      | `body`                                                                 |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `subject only`                                                         | `"subject only"`                                                       |
| `Second commit\n\nFirst paragraph.\n\nSecond paragraph,\ntwo lines.\n` | `"Second commit\n\nFirst paragraph.\n\nSecond paragraph,\ntwo lines."` |
| `subj\r\n\r\nbody crlf\r\nline2\r\n`                                   | `"subj\n\nbody crlf\nline2"`                                           |
| `subj\rbody-cr\r`                                                      | `"subj\nbody-cr"`                                                      |
| `\n\nleading blank lines\n`                                            | `"\n\nleading blank lines"`                                            |
| `trailing blanks\n\n\n\n`                                              | `"trailing blanks"`                                                    |
| `trailing ws line\n   \n\t\n`                                          | `"trailing ws line\n   \n\t"`                                          |
| (empty message)                                                        | `""`                                                                   |
| `tabs\tin\tmsg\n\n  indented body\n`                                   | `"tabs\tin\tmsg\n\n  indented body"`                                   |
| `unicode: 中文 café ✓\n`                                               | `"unicode: 中文 café ✓"`                                               |

### 3.5 `fileChanges`

#### 3.5.1 Which diff is listed

- **Ordinary commit (one parent):** the changes from the parent to the commit.
- **Root commit, or shallow boundary commit (no parents):** every file in the commit, each as `A`.
- **Merge commit (two or more parents):** the list is the diff from the **first parent** to the merge. The UI relies on this, since it diffs against `<hash>^`. Line counts are also those against the first parent. For example, in §4.4 the file `f` reads `+3 -0` against the first parent and `+1 -1` against the second, and the result is `+3 -0`. Except in the case below, changes against the second and later parents never appear.
  - **Current behaviour when the first parent's filtered diff is empty:** Git prints no section for that parent, and the result lists the **next** parent's changes instead. This happens for a merge made with `-s ours`, for a merge whose first parent already contained everything, and for a merge whose only first-parent change is a type change. See §4.5, §4.8 and Q1.
- **Commit with no reportable changes** (an empty commit, or one whose only changes are type changes): `[]`.

#### 3.5.2 Kinds of entries

| Situation in the commit                                          | Entry                                                                     |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------- |
| new file, symlink or submodule                                   | `type: "A"`, both paths the new path                                      |
| content change of a file, symlink target or submodule commit     | `type: "M"`, both paths the path                                          |
| **mode-only** change (e.g. `chmod +x`)                           | `type: "M"`, counts `0` and `0`                                           |
| removed file, symlink or submodule                               | `type: "D"`, both paths the removed path                                  |
| rename detected by Git (similarity ≥ 50%, with or without edits) | `type: "R"`, `oldFilePath` = source, `newFilePath` = destination          |
| rename below 50% similarity                                      | two entries: `D` for the old path and `A` for the new one                 |
| copy (new file identical or similar to a file that still exists) | `A` for the new file. Copies are never detected.                          |
| type change (file ↔ symlink, file ↔ submodule)                   | **omitted** (Q3)                                                          |
| a file replaced by a directory of the same name, or the reverse  | `D` for one path and `A` for each file under the other, as Git lists them |

The rename similarity score Git reports (e.g. `R064`) is not exposed. Only the letter `R` is kept.

#### 3.5.3 Rename detection limits

Git's own rename-limit setting still applies. When a commit has more rename candidates than `diff.renameLimit` allows, Git prints a warning on stderr but still exits successfully. Exact (100%) renames are still found, and inexact renames fall back to a `D` and an `A`. The call still succeeds. Observed with `diff.renameLimit=1`: `blob.bin → blob2.bin` stayed `R`, and `ten.txt → zz-renamed.txt` (64%) became `D ten.txt` plus `A zz-renamed.txt`.

#### 3.5.4 Paths

- Paths are relative to the repository root, with `/` between directories, identical to the names recorded in the commit's trees. No quoting, unescaping, trimming, case folding, Unicode normalisation or slash conversion is applied. A backslash in a name stays a backslash.
- These names must come back exactly (and are tested): `中文.txt`, `café.md`, `tab\tname`, `quote"name`, `new\nline`, `back\\slash` (one backslash), `0:foo`, `目录/新.txt`. Also observed exact: a name with leading and trailing spaces and a trailing CR (`" sp ace \r"`), `"quoted"` with its quote marks, `1\t2\tx` (looks like a line-count record), `R100` (looks like a rename status), a 40-hex-digit name that looks like a commit ID, and a name starting with `-`.
- Names whose bytes are not valid UTF-8 arrive with U+FFFD in place of the bad bytes (§2.2). Two such names can therefore become the same string (Q6).

#### 3.5.5 Line counts

- For each entry, `additions` and `deletions` are the numbers Git's `--numstat` reports for that same entry in the same (first-parent) section. For a rename, the numbers belong to the old→new pair.
- `null` for both when Git reports `-`, meaning Git treats the content as binary: files with NUL bytes, files marked `binary` or `-diff` in `.gitattributes`, and binary renames.
- Git takes attributes from the **current** working tree and index, not from the commit being shown. Adding `b.txt -diff` to an uncommitted `.gitattributes` makes an old commit's `b.txt` report `null` counts.
- Other observed values: empty file added gives `0/0`. A file without a trailing newline counts its last line (`"no newline"` gives `1/0`). A symlink counts its target as one line (`A` gives `1/0`, retarget gives `1/1`). A submodule added gives `1/0` and a submodule moved to another commit gives `1/1`. A pure 100% rename gives `0/0`. A deletion of an n-line file gives `0/n`.
- If Git reports no counts for an entry at all, both stay `null`. In normal operation this never happens, because both diff commands list the same entries.
- When two entries in a section have the same `newFilePath` string, which only happens through the U+FFFD collapse of §3.5.4, both currently carry the counts of the **later** entry (Q6).

#### 3.5.6 Order

`fileChanges` is in the order Git lists the section: ascending byte order of the path, with renames placed at their destination path. Observed: `-dash`, `b.txt`, `bin.dat`, `dir/sub/z.txt`, `empty`, … and `link`, `dir/sub/z.txt→moved.txt`, `run.sh`. No caller depends on the order, since the webview sorts its tree and tests either sort or check a single entry, but keeping Git's order costs nothing.

### 3.6 Configuration independence

Results must not depend on the user's Git configuration in the ways the backend suite's hostile configuration exercises (`color.* = always`, `log.showSignature`, `log.decorate`, `log.abbrevCommit`, `log.date`, `format.pretty`, `core.quotePath`). They also did not depend on `diff.renames`, `diff.noprefix`, `diff.mnemonicPrefix` or `diff.external`, all of which were observed to make no difference. This comes from the client's `-c` overrides plus the choice of plumbing (`diff-tree`), explicit `--format` placeholders and `-z`.

Settings that **do** change the result today:

- `diff.renameLimit` (§3.5.3).
- `.gitattributes` (§3.5.5).
- `i18n.logOutputEncoding`. Neither the client nor the `show` command overrides it. With `i18n.logOutputEncoding=ISO-8859-1`, a commit whose author is `Zoë` and whose message is `café` came back as `author: "Zo\uFFFD"` and `body: "caf\uFFFD"`, because Git printed Latin-1 bytes and the client decoded them as UTF-8. See Q11.

---

## 4. Concrete examples (observed)

Shared setup for §4.1–§4.10:

- Environment: `GIT_CONFIG_GLOBAL=<repo>/tests/fixtures/gitconfig`, `GIT_CONFIG_NOSYSTEM=1`, `GIT_AUTHOR_NAME="Ann Author"`, `GIT_AUTHOR_EMAIL=ann@example.com`, `GIT_COMMITTER_NAME="Cal Committer"`, `GIT_COMMITTER_EMAIL=cal@example.com`.
- Each commit in a scenario uses the next pair of dates in one sequence shared by the whole script: author `1600000100 +0200` and committer `1650000100 -0500`, then `…200`, `…300`, and so on, via `GIT_AUTHOR_DATE` and `GIT_COMMITTER_DATE`. `git merge` is given the same dates.
- Repositories are created with `git init -b main`. The client is `createGit(dir, "git")`, and `dateType` is `"Author Date"` unless stated.
- The IDs shown are the ones this exact setup produced with Git 2.43.0. They are reproducible, but tests should read IDs with `git rev-parse` rather than hard-code them.

### 4.1 Root commit (`dateType: "Author Date"`)

Files: `-dash` = `x\n`. `b.txt` = `one\ntwo\n`. `bin.dat` = bytes `00 01 02`. `dir/sub/z.txt` = `1\n2\n3\n`. `empty` = 0 bytes. `link` = symlink to `b.txt`. `nonl` = `no newline` with no final newline. `run.sh` = `#!/bin/sh\n`, executable. Commit message `root`.

```
{ commitDetails: {
  hash: "c40822f2c5a1c67cffab9e5afff99583dfd3bc61",
  parents: [""],
  author: "Ann Author", email: "ann@example.com", date: 1600000100,
  committer: "Cal Committer", body: "root",
  fileChanges: [
    { oldFilePath: "-dash",         newFilePath: "-dash",         type: "A", additions: 1,    deletions: 0 },
    { oldFilePath: "b.txt",         newFilePath: "b.txt",         type: "A", additions: 2,    deletions: 0 },
    { oldFilePath: "bin.dat",       newFilePath: "bin.dat",       type: "A", additions: null, deletions: null },
    { oldFilePath: "dir/sub/z.txt", newFilePath: "dir/sub/z.txt", type: "A", additions: 3,    deletions: 0 },
    { oldFilePath: "empty",         newFilePath: "empty",         type: "A", additions: 0,    deletions: 0 },
    { oldFilePath: "link",          newFilePath: "link",          type: "A", additions: 1,    deletions: 0 },
    { oldFilePath: "nonl",          newFilePath: "nonl",          type: "A", additions: 1,    deletions: 0 },
    { oldFilePath: "run.sh",        newFilePath: "run.sh",        type: "A", additions: 1,    deletions: 0 } ] } }
```

With `dateType: "Commit Date"`, everything is identical except `date: 1650000100`.

### 4.2 Modifications, mode change, symlink, binary, deletions, 100% rename, type change

On top of §4.1: `b.txt` becomes `one\nTWO\nthree\n`. `chmod +x -- -dash`. `link` is retargeted to `dir/sub/z.txt`. `nonl` is replaced by a symlink to `b.txt` (a type change). `bin.dat` becomes bytes `00 09 09`. `git rm empty run.sh`. `git mv dir/sub/z.txt moved.txt`. The message is `Second commit`, blank line, `First paragraph.`, blank line, `Second paragraph,\ntwo lines.`

```
{ commitDetails: {
  hash: "4db0ec87408fdba8bd34fc8c5b35076c2a35ac65",
  parents: ["c40822f2c5a1c67cffab9e5afff99583dfd3bc61"],
  author: "Ann Author", email: "ann@example.com", date: 1600000200, committer: "Cal Committer",
  body: "Second commit\n\nFirst paragraph.\n\nSecond paragraph,\ntwo lines.",
  fileChanges: [
    { oldFilePath: "-dash",         newFilePath: "-dash",     type: "M", additions: 0,    deletions: 0 },
    { oldFilePath: "b.txt",         newFilePath: "b.txt",     type: "M", additions: 2,    deletions: 1 },
    { oldFilePath: "bin.dat",       newFilePath: "bin.dat",   type: "M", additions: null, deletions: null },
    { oldFilePath: "empty",         newFilePath: "empty",     type: "D", additions: 0,    deletions: 0 },
    { oldFilePath: "link",          newFilePath: "link",      type: "M", additions: 1,    deletions: 1 },
    { oldFilePath: "dir/sub/z.txt", newFilePath: "moved.txt", type: "R", additions: 0,    deletions: 0 },
    { oldFilePath: "run.sh",        newFilePath: "run.sh",    type: "D", additions: 0,    deletions: 1 } ] } }
```

`nonl` (file → symlink) is absent. With `--diff-filter` removed, Git would have listed it as `T`.

### 4.3 Rename similarity, binary rename, copy

Base commit: `ten.txt` = lines 1…10. `low.txt` = lines 201…210. `blob.bin` = 50 × bytes `00 'b' 'i' 'n'`. `src.txt` = lines 100…120. The next commit (`renames`) does four things. It moves `ten.txt` to `zz-renamed.txt` and changes its last two lines to `NINE` and `TEN` (64% similar). It moves `low.txt` to `a-low.txt` and rewrites nine of its ten lines (below 50%). It moves `blob.bin` to `blob2.bin` unchanged. It copies `src.txt` to `copy.txt`.

```
fileChanges: [
  { oldFilePath: "a-low.txt", newFilePath: "a-low.txt",      type: "A", additions: 10,   deletions: 0 },
  { oldFilePath: "blob.bin",  newFilePath: "blob2.bin",      type: "R", additions: null, deletions: null },
  { oldFilePath: "copy.txt",  newFilePath: "copy.txt",       type: "A", additions: 21,   deletions: 0 },
  { oldFilePath: "low.txt",   newFilePath: "low.txt",        type: "D", additions: 0,    deletions: 10 },
  { oldFilePath: "ten.txt",   newFilePath: "zz-renamed.txt", type: "R", additions: 2,    deletions: 2 } ]
```

(`hash` `a1a2ad28291192aadf344475cdfe731bfa7a8fe1`, `date` 1600000400, `body` `"renames"`.)

### 4.4 Merge: first-parent changes and counts

Base: `f` = `a b c d e` (five lines). Branch `side` appends `S1 S2 S3` to `f` and adds `s` (`s\n`). `main` changes the first line of `f` to `M1` and adds `m` (`m\n`). Then, on `main`, `git merge --no-edit side`, which merges `f` automatically.

```
{ commitDetails: {
  hash: "f720e965895cb6f94275cd5c21ce6124816bb4ae",
  parents: ["2524ba5b451a900d8bc78807506d1d9256d09841",   // main (first parent)
            "593363b4c28c8159ec699ab56affbc67cb90ee61"],  // side
  author: "Ann Author", email: "ann@example.com", date: 1600000800, committer: "Cal Committer",
  body: "Merge branch 'side'",
  fileChanges: [
    { oldFilePath: "f", newFilePath: "f", type: "M", additions: 3, deletions: 0 },
    { oldFilePath: "s", newFilePath: "s", type: "A", additions: 1, deletions: 0 } ] } }
```

Against the second parent, `f` would be `+1 -1` and `m` would be added. Neither appears.

### 4.5 Merge made with `-s ours` (current behaviour, see Q1)

Continuing §4.4: branch `side2` starts from `main`'s pre-merge commit (`2524ba5…`) and adds `t` (`t\n`). Back on `main`, `git merge -s ours --no-edit side2`. The merge's tree is identical to its first parent's tree.

```
parents: ["f720e965895cb6f94275cd5c21ce6124816bb4ae", "3669f1508215fc3ac7afd1d908e20c421f3e1fd0"]
body: "Merge branch 'side2'"
fileChanges: [
  { oldFilePath: "f", newFilePath: "f", type: "M", additions: 3, deletions: 0 },
  { oldFilePath: "s", newFilePath: "s", type: "A", additions: 1, deletions: 0 },
  { oldFilePath: "t", newFilePath: "t", type: "D", additions: 0, deletions: 1 } ]
```

These are the changes against the **second** parent. Against the first parent there are none. (`hash` `c8712196bbc660831aae92944f4ea8560d0c2441`.)

### 4.6 Octopus merge and empty commit

Continuing: branches `o1` and `o2` both start from `main~2` and add files `o1` and `o2`. Then `git merge --no-edit o1 o2`:

```
parents: ["c8712196bbc660831aae92944f4ea8560d0c2441", "69b178dad51f70d70baaf4dd8d2bffcf8fb07cec", "8b0d8d3e489db21212582698489bc36745184ec2"]
body: "Merge branches 'o1' and 'o2'"
fileChanges: [
  { oldFilePath: "o1", newFilePath: "o1", type: "A", additions: 1, deletions: 0 },
  { oldFilePath: "o2", newFilePath: "o2", type: "A", additions: 1, deletions: 0 } ]
```

Then `git commit --allow-empty -m empty` gives `parents: ["7323cfa2d22a6e90fcd97647ad01ddb25b0b9246"]`, `body: "empty"`, `fileChanges: []`.

### 4.7 Input forms

In the repository of §4.1–§4.2, after `git tag light` and `git tag -a -m annotated ann` on `HEAD`:

| `commitHash`                                               | `commitDetails`                                                    |
| ---------------------------------------------------------- | ------------------------------------------------------------------ |
| `4db0ec8`                                                  | `hash: "4db0ec87408fdba8bd34fc8c5b35076c2a35ac65"`, 7 file changes |
| `HEAD`, `main`, `light`                                    | same as above                                                      |
| `4DB0EC87408FDBA8BD34FC8C5B35076C2A35AC65`                 | same as above (lowercase `hash`)                                   |
| `HEAD~1`                                                   | `hash: "c40822f2c5a1c67cffab9e5afff99583dfd3bc61"`, 8 file changes |
| `ann`                                                      | `null`                                                             |
| tree ID of `HEAD`, blob ID of `HEAD:b.txt`                 | `null`                                                             |
| `0000000000000000000000000000000000000000`, `deadbeef1234` | `null`                                                             |
| `""`, `HEAD~1..HEAD`, `HEAD HEAD~1`, `b.txt`               | `null`                                                             |
| `--output=<some path>`                                     | `null`, and no file is created at that path                        |

### 4.8 Type changes

- A commit whose only change turns file `f` into a symlink gives `fileChanges: []` (`hash` `42123b007c015ac5c5406b77c156eacbcb4ff9ed`, made on branch `tc` from a base with files `t` and `f`).
- Current behaviour, see Q1: on `main` (from the same base), add `s` (`s\n`), then `git merge --no-edit tc`. Against its first parent the merge only changes `f` from file to symlink. That entry is filtered out, so Git prints no first-parent section, and the result shows the second parent's diff: `fileChanges: [{ oldFilePath: "s", newFilePath: "s", type: "A", additions: 1, deletions: 0 }]`. The raw unfiltered output was `<id>␀T␀f␀<id>␀A␀s␀`.

### 4.9 Unusual names and order

Base commit: file `3\t4\told` (lines 1…5). Next commit: `git mv` it to `" sp ace \r"` and append a line `6`. Add `1\t2\tx`, `R100`, `"quoted"`, `目录/新.txt` (each `q\n`), `bad\xfe` (`q\n`) and `bad\xff` (`q\nr\n`), where the last two names contain the single bytes FE and FF.

```
fileChanges: [
  { oldFilePath: "3\t4\told",      newFilePath: " sp ace \r",     type: "R", additions: 1, deletions: 0 },
  { oldFilePath: "\"quoted\"",     newFilePath: "\"quoted\"",     type: "A", additions: 1, deletions: 0 },
  { oldFilePath: "1\t2\tx",        newFilePath: "1\t2\tx",        type: "A", additions: 1, deletions: 0 },
  { oldFilePath: "R100",           newFilePath: "R100",           type: "A", additions: 1, deletions: 0 },
  { oldFilePath: "bad\uFFFD",      newFilePath: "bad\uFFFD",      type: "A", additions: 2, deletions: 0 },
  { oldFilePath: "bad\uFFFD",      newFilePath: "bad\uFFFD",      type: "A", additions: 2, deletions: 0 },
  { oldFilePath: "目录/新.txt",     newFilePath: "目录/新.txt",     type: "A", additions: 1, deletions: 0 } ]
```

The first `bad…` entry is `bad\xfe`, a one-line file, yet it shows `2/0`, the counts of `bad\xff`. See Q6.

### 4.10 Submodules

Add a submodule at `sub` pinned to its first commit (the parent repository also gains `.gitmodules`):

```
[ { oldFilePath: ".gitmodules", newFilePath: ".gitmodules", type: "A", additions: 3, deletions: 0 },
  { oldFilePath: "sub",         newFilePath: "sub",         type: "A", additions: 1, deletions: 0 } ]
```

Move the submodule to its next commit: `[{ oldFilePath: "sub", newFilePath: "sub", type: "M", additions: 1, deletions: 1 }]`.

### 4.11 SHA-256 repository

`git init -b main --object-format=sha256`. Commit `f` = `x\n`, then append `y` and `git mv f g`:

```
hash:    "f3436dda51194d2be5528c3a9c5d041173f4507c843a61483c804d177f9c4b5b"
parents: ["49ba46adec09ae76f7d3bc5105936872f3a7072e5e628d5ac9baba6d7356dedf"]
fileChanges: [{ oldFilePath: "f", newFilePath: "g", type: "R", additions: 1, deletions: 0 }]
```

The root commit of the same repository gives `parents: [""]` and `fileChanges: [{ oldFilePath: "f", newFilePath: "f", type: "A", additions: 1, deletions: 0 }]`.

### 4.12 Identity, mailmap, attributes, failures

- A commit object with author `Jos\xe9 <j@e.com>`, header `encoding ISO-8859-1`, and message `caf\xe9 latin1` gives `author: "José"` and `body: "café latin1"`.
- An uncommitted `.mailmap` with `Mapped Name <mapped@example.com> Ann Author <ann@example.com>` in the §4.1 repository leaves `author: "Ann Author"` and `email: "ann@example.com"`.
- An uncommitted `.gitattributes` with `b.txt -diff` turns §4.1's `b.txt` entry into `additions: null, deletions: null`. Removing it restores `2/0`.
- `{ commitDetails: null }` in each of these cases, and the promise does not reject:
  - the client's abort signal fired before the call
  - the signal fires during the call
  - the client's Git path does not exist
  - the directory is not a Git repository

---

## 5. Non-functional requirements

### 5.1 Git processes

- Each call starts **at most three** Git processes, one per command in §2.3. When the client's signal has already fired, none are started.
- The current module starts all three at once without waiting for one to finish before starting the next, so its latency is about that of the slowest command. A replacement should keep them concurrent. They do not depend on each other's output.
- For an input that fails, the current module still starts all three. Nothing depends on that.

### 5.2 Use the given client only

All Git work must go through the `git` argument. That is how:

- the user's configured Git executable is used
- `--no-optional-locks` and the `-c` overrides of §2.2 apply, which the hostile-config CI run and `signedCommits.test.ts` depend on
- cancellation works: the extension aborts superseded requests through the client's signal

The module must not write to the repository, must not take the index lock, and must not read files from disk itself.

### 5.3 Performance (observed on the test machine)

| Commit                                                  | Entries | Time per call |
| ------------------------------------------------------- | ------- | ------------- |
| root commit with 20,000 one-line files in one directory | 20,000  | ≈ 400 ms      |
| 5,000 modified files and 500 renames                    | 5,500   | ≈ 230–290 ms  |

A single `diff-tree --numstat` on the second commit took about 270 ms, so Git dominates. The module's own work must stay roughly linear in the number of entries: matching counts to entries must not become quadratic for tens of thousands of files.

### 5.4 Result shape and errors

- The result object must contain only the `commitDetails` key. The extension spreads it into a webview message next to `command`, `repo` and `requestId`, so extra keys would leak into the message.
- The promise must never reject, and no rejection may be left unhandled, even when several of the three commands fail at once (for example when the signal fires mid-call). The extension does handle a rejection, by posting `graphQueryError` with the error text, but the current module never produces one (Q4).
- The result must be plain data that survives the webview bridge's JSON serialisation: strings, numbers, `null` and arrays only.

---

## 6. Test coverage

### 6.1 Already checked

`tests/backend/queries/commitDetails/get.test.ts` (each test builds repositories with `makeRepo()` from `tests/backend/helpers.ts`, one commit `init` adding `f` = `x`):

- For the root commit with `"Author Date"` and with `"Commit Date"`, the result has exactly the eight `GitCommitDetails` keys, `hash` equals the full ID, and `date > 0`. The two dates are not told apart.
- The root commit has at least one file change.
- `commitHash: "deadbeef1234"` gives exactly `{ commitDetails: null }`.
- A modified file `f` has numeric `additions` and `deletions`. The values are not checked.
- `body` contains `init`.
- Unusual names: seven added names (five of them skipped on Windows) each `A 2/0`, a binary `A null/null`, and a 100% rename `old.txt → 目录/新.txt` at `R 0/0`, each with exactly five keys. Order is not checked (both sides are sorted). The same test also checks that other modules (`sourceFile`, `loadHistory`, `loadRestorePlan`) and `git show <hash>:<path>` accept the returned paths.
- A two-parent merge whose first-parent diff is non-empty lists only the first-parent entry (`["side"]`). An `--allow-empty` commit gives `[]`.

`tests/backend/queries/signedCommits.test.ts`: an SSH-signed commit, with the user's config set to show signatures and use colour, gives `hash`, `body: "second signed"` and file list `["b"]`.

CI also runs the backend suite with `NGG_HOSTILE_GIT_CONFIG=1` (`tests/fixtures/hostile.gitconfig`), which re-runs all of the above under output-altering settings.

`tests/extension/graph-queries.test.ts` mocks the module. It checks only that it is called with the client first and how the handler treats a result or a rejection.

### 6.2 Gaps, each with a test case (input → expected result)

Expected values are the current behaviour. Items marked _(Q n)_ depend on the decision in that question.

1. **Author date vs commit date.** Commit with `GIT_AUTHOR_DATE="1600000100 +0200"` and `GIT_COMMITTER_DATE="1650000100 -0500"` → `date` is `1600000100` for `"Author Date"` and `1650000100` for `"Commit Date"`.
2. **Exact identity fields.** Author `Ann Author <ann@example.com>`, committer `Cal Committer <cal@example.com>` → `author: "Ann Author"`, `email: "ann@example.com"`, `committer: "Cal Committer"`.
3. **Mailmap ignored.** Same commit plus a `.mailmap` mapping Ann to `Mapped Name <mapped@example.com>` and `git config log.mailmap true` → author and email unchanged.
4. **Parents.** Root commit → `parents: [""]` _(Q2)_. Second commit → `[<root id>]`. Two-parent merge → `[<first>, <second>]` in that order. Octopus → three IDs in order.
5. **Full ID for symbolic or abbreviated input.** `commitHash: "HEAD"`, a 7-character abbreviation, and the upper-case full ID → `hash` is the full lowercase ID of that commit.
6. **Body normalisation.** Commit objects written with `git hash-object -t commit -w --stdin` using the raw messages of §3.4 → the listed bodies. At least cover CR LF, lone CR, trailing empty lines, trailing whitespace-only lines, leading blank lines and the empty message.
7. **Multi-paragraph body.** `git commit -m "Second commit" -m "First paragraph." -m $'Second paragraph,\ntwo lines.'` → `"Second commit\n\nFirst paragraph.\n\nSecond paragraph,\ntwo lines."`.
8. **Exact modification counts.** `b.txt` from `one\ntwo\n` to `one\nTWO\nthree\n` → `M 2/1`.
9. **Deletions.** `git rm` of a one-line text file → `{ type: "D", oldFilePath: p, newFilePath: p, additions: 0, deletions: 1 }`. `git rm` of an empty file → `D 0/0`. `git rm` of a binary file → `D null/null`.
10. **Rename with edits and below the threshold.** The §4.3 commit → exactly the five entries shown there: `R 2/2` for `ten.txt → zz-renamed.txt`, `D` plus `A` for the below-threshold `low.txt → a-low.txt`, `A` for the copy, and a binary rename `R null/null`.
11. **Mode-only change.** `chmod +x f` and commit → `[{ oldFilePath: "f", newFilePath: "f", type: "M", additions: 0, deletions: 0 }]`.
12. **Type change omitted.** Replace a file with a symlink and commit → `fileChanges: []` _(Q3)_.
13. **Symlink entries.** Add a symlink → `A 1/0`. Retarget it → `M 1/1`.
14. **Binary modification.** `bin.dat` from bytes `00 01 02` to `00 09 09` → `M null/null`.
15. **Merge counts come from the first parent.** The §4.4 merge → `f` is `M 3/0`, not `1/1`, and `m` is absent.
16. **Merge with an empty first-parent diff.** The §4.5 `-s ours` merge → currently `M f 3/0, A s 1/0, D t 0/1`. If Q1 is decided in favour of first-parent semantics, the result would be `[]`. Also the §4.8 merge → currently `[A s]`. First-parent semantics would give `[]`.
17. **Octopus merge.** The §4.6 merge → `[A o1 1/0, A o2 1/0]` and three parents.
18. **Annotated tag input.** `commitHash: "ann"` (annotated tag on HEAD) → `{ commitDetails: null }` _(Q5)_. Lightweight tag → the commit's details.
19. **Option-like input is not an option.** `commitHash: "--output=<tmp>/leak.txt"` → `{ commitDetails: null }`, and `<tmp>/leak.txt` does not exist afterwards.
20. **Non-commit IDs.** Tree ID or blob ID → `{ commitDetails: null }`.
21. **Order.** The §4.2 commit → entries in exactly the listed order, with the rename at `moved.txt`'s position.
22. **Submodule entries.** The §4.10 commits → the entries shown.
23. **SHA-256 repository.** The §4.11 commits → 64-character `hash` and `parents`, and `R f→g 1/0`.
24. **Failures resolve to null.**
    - A client from `createGit(dir, "git", signal)` whose `AbortController` was already aborted → `{ commitDetails: null }`.
    - A client for a directory that is not a repository → `{ commitDetails: null }`.
    - Also assert that the promise never rejects and that no `unhandledRejection` event is emitted.
25. **Rename limit.** Set `diff.renameLimit=1` in the §4.3 repository → `blob.bin→blob2.bin` stays `R`, and `ten.txt` / `zz-renamed.txt` become `D 0/10` and `A 10/0`. The call still succeeds.
26. **Attributes decide binary-ness.** In §4.1, write an uncommitted `.gitattributes` with `b.txt -diff` → `b.txt` is `A null/null`.
27. **Process count** (optional). With a client whose Git path is a logging wrapper → exactly three invocations (`show`, `diff-tree --name-status`, `diff-tree --numstat`) per successful call.
28. **Log output encoding.** Commit with author `Zoë` and message `café`, then `git config i18n.logOutputEncoding ISO-8859-1` → currently `author: "Zo\uFFFD"`, `body: "caf\uFFFD"` _(Q11)_. If Q11 is decided in favour of UTF-8, expect `"Zoë"` and `"café"`.
29. **File replaced by a directory.** Base has file `p`. Next commit removes it and adds `p/inner` → `[D p 0/1, A p/inner 1/0]`.

---

## 7. Questions

These are behaviours that look like bugs or are ambiguous. For each, the current behaviour is stated, followed by what may have been intended. Nothing here is decided.

**Q1. Merges whose first-parent diff is empty show another parent's changes.** When the diff from a merge's first parent is empty after filtering, Git prints no section for that parent. The result then lists the diff against the second (or a later) parent as if it were the merge's own changes. This happens for `-s ours` merges, for merges where the first parent already had every change, and for merges whose only first-parent change is a type change (§4.5, §4.8). It contradicts the first-parent meaning that the UI's diff (`<hash>^` against `<hash>`) and the existing merge test assume. Intended is probably an empty list, or the first parent's actual changes. For information, `git diff-tree --diff-merges=first-parent …` (instead of `-m`) printed nothing for these merges with Git 2.43.0. Which minimum Git version must be supported?

**Q2. Parentless commits report `parents: [""]`.** Root commits and shallow-clone boundary commits give a one-element array holding an empty string. `loadCommits` returns `[]` for the same commits. The details panel shows an empty "Parents:" line either way. Intended is probably `[]`.

**Q3. Type changes vanish.** A file that becomes a symlink or a submodule, or the reverse, is not listed at all, and a commit with only such changes shows no files. `GitFileChangeType` and the webview's colour table only know `A`, `M`, `D` and `R`, so listing them would need a decision: report them as `M`, add a `T` kind across backend and webview, or keep hiding them.

**Q4. Errors are swallowed.** Every failure becomes `{ commitDetails: null }`, and the user sees a generic "Unable to load commit details". The extension already turns a rejection into a `graphQueryError` whose dialog would include Git's message, and its tests cover that path with a mocked module. Should real Git errors reject so their text reaches the user, or stay silent? Either way, a stale request cancelled through the abort signal is discarded by the handler.

**Q5. Annotated tag names give `null`.** Branches, lightweight tags, `HEAD~n` and abbreviations work, but an annotated tag name fails because `show` prints the tag object before the commit. Production always passes full commit IDs, so this is latent. Should tag-like inputs be peeled to their commit (e.g. by asking for `<rev>^{commit}`), or is a full commit ID the only supported input?

**Q6. Paths that are not UTF-8.** Invalid UTF-8 bytes in names become U+FFFD. The returned path then no longer names the file in Git, so diffs and history for it fail. Two such names can decode to the same string, and both entries then show the later entry's line counts (§4.9: the one-line file shows `2/0`). Intended may be to keep counts paired with their own entry regardless of name, and possibly to preserve the raw bytes, which would require reading Git's output as bytes. Or it may be to accept the limitation.

**Q7. `dateType` fallback.** Any value other than exactly `"Author Date"` selects the committer date. The type allows only the two strings, so this matters only for untyped callers. Is "anything else means commit date" intended, or should unknown values be rejected or default to the author date?

**Q8. Body trimming rules.** Trailing lines that are completely empty are removed, but trailing lines holding only spaces or tabs are kept. Lone CRs inside a line are turned into line breaks. Leading blank lines are kept. Are these exact rules intended, or is a simpler rule acceptable (e.g. trim all trailing whitespace, or keep CRs that are not part of CR LF)? The webview shows the body with `white-space: pre-wrap`, so the difference is visible.

**Q9. Line counts depend on the current working tree's `.gitattributes` and on `diff.renameLimit`.** Whether an old commit's file counts as binary follows today's attributes rather than the commit's own. A large commit may lose inexact renames to the user's rename limit, and then shows `D` and `A` pairs. This is Git's default behaviour. Should the module pin it, for example by reading attributes from the commit or overriding the rename limit, or accept it?

**Q10. Submodule entries look like files.** A submodule addition or update is listed with counts (`1/0` or `1/1`), so the UI offers a text diff for it. Is that intended, or should submodules be marked, for example with `null` counts, so the UI treats them like binary entries?

**Q11. `i18n.logOutputEncoding` corrupts names and messages.** A user who sets a non-UTF-8 log output encoding can get U+FFFD in place of non-ASCII characters in `author`, `committer` and `body` (§3.6). The file list is not affected. Other parsed-output settings are neutralised by the client, so this looks like an omission. Intended is probably UTF-8 output regardless of the setting. For information, `git show --encoding=UTF-8 …` printed UTF-8 in that repository. Decide whether the fix belongs in this module's command or in the client's shared overrides in `src/backend/gitClient.ts`.

---

## 8. Decisions on §7 (from the project maintainer's side)

These decisions replace the "current behaviour" wherever they differ. Build to these, and test the decided behaviour.

- **Q1: a merge's files are its first-parent diff.** For a commit with parents, the file list and counts are the diff between its first parent and the commit, and are empty when that diff is empty (for example an `-s ours` merge), never another parent's diff. A root commit is diffed against the empty tree. No minimum Git version is declared, so use only commands and options that every Git 2.x supports (not `--diff-merges`); for example, the two-tree form of `diff-tree` with the first parent's ID.
- **Q2: no parents means `[]`.** A parentless commit reports `parents: []`, as the graph's log query does. Check the callers and the webview handle an empty list.
- **Q3: type changes are modifications.** An entry whose type changed (file, symlink or submodule) is listed with status `M`, with the counts Git gives for it.
- **Q4: keep.** Failures still give `null`.
- **Q5: keep.** Only commit IDs are supported.
- **Q6: keep.** No special handling of non-UTF-8 names.
- **Q7: keep.**
- **Q8: keep the observed body rules.**
- **Q9: keep.**
- **Q10: keep.**
- **Q11: always UTF-8.** Ask Git for UTF-8 output regardless of `i18n.logOutputEncoding`, so names and messages are never garbled by that setting.
