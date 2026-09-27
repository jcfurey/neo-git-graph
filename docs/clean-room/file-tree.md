# Clean-room specification: `src/webview/utils/fileTree.ts`

This document says what the commit-details file tree helper must do, as seen from outside it. It is written for an engineer who will build a replacement without seeing the current source. It is based on the module's two importers (`CommitDetails.tsx` and `FileTree.tsx`), the `GitFileChange` type and the backend query that produces those values, the repository's tests, and the results of running the current module under Node.

---

## 0. Environment used for every example and measurement

- Node v22.22.2, full ICU, default locale `en-US` (from the environment). Linux, 4 vCPU Intel Xeon at 2.10 GHz.
- The module was bundled on its own with the repository's esbuild and called directly from scratch scripts. The ordering examples marked with a locale were run with `LC_ALL`/`LANG` set to that locale, which changes Node's default locale.
- Unless an example says otherwise, each input entry is a change whose `oldFilePath` equals its `newFilePath`, with `type: "M"`, `additions: 1`, `deletions: 0`. Only `newFilePath` (and, where stated, `oldFilePath` or `type`) matters to the result.

### Notation used for trees in §4 and §6

A result is written as an indented outline, one node per line. Two spaces of indent mean "child of the line above with less indent".

- `folder "NAME" (path "PATH")` is a folder node with `name` = NAME and `path` = PATH.
- `file "NAME" ← NEWPATH [T]` is a file node with `name` = NAME whose `file` is the input entry with `newFilePath` = NEWPATH and `type` = T. Where two entries share a `newFilePath`, the entry is identified by its `oldFilePath` in a note.
- Strings are written as JSON strings, so `""` is the empty string, `"\n"` a newline and `"é"` the letter e followed by a combining acute accent.
- `(empty)` means the function returned an empty array.

---

## 1. Interface

**Module path:** `src/webview/utils/fileTree.ts`, imported as `@/webview/utils/fileTree`.

The module has four exports. All four names and shapes must stay exactly as below.

### `export type FileTreeFile`

```ts
export type FileTreeFile = {
  type: "file";
  name: string;
  file: GitFileChange;
};
```

A leaf of the tree: one changed file.

| Field  | Meaning                                                                                                                                                                                     |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `type` | Always the literal `"file"`. Used by callers to tell a file node from a folder node.                                                                                                        |
| `name` | The last segment of the change's `newFilePath`: everything after its final `/`, or the whole path if it has no `/`. Shown as the row's label. Can be the empty string for odd input (§3.6). |
| `file` | The change this node stands for. It is the very object that was passed in the input array (same reference), not a copy.                                                                     |

### `export type FileTreeFolder`

```ts
export type FileTreeFolder = {
  type: "folder";
  name: string;
  path: string;
  children: Array<FileTreeNode>;
};
```

A directory that contains at least one changed file somewhere beneath it.

| Field      | Meaning                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `type`     | Always the literal `"folder"`.                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `name`     | This directory's own segment name (one path component, no `/`). Shown as the row's label.                                                                                                                                                                                                                                                                                                                                                                    |
| `path`     | The directory's location inside the repository: the segment names from the top level down to and including this one, joined with `/`, with no leading or trailing `/`. For the file `src/webview/utils/fileTree.ts` the folders have paths `src`, `src/webview` and `src/webview/utils`. `FileTree.tsx` uses this string both as the Preact `key` of the folder's list item and as the identity under which it remembers that the user collapsed the folder. |
| `children` | The folder's direct children (folders and files), ordered as described in §3.3. Never empty. It must be a plain mutable `Array` type, because `FileTree.tsx` passes it where `Array<FileTreeNode>` is expected.                                                                                                                                                                                                                                              |

### `export type FileTreeNode`

```ts
export type FileTreeNode = FileTreeFile | FileTreeFolder;
```

A discriminated union on `type`.

### `export function buildFileTree(files: Array<GitFileChange>): Array<FileTreeNode>`

Turns the flat list of changes of one commit into the list of top-level tree nodes. There is no node for the repository root; the returned array is the root's contents. Behaviour in §3.

### Who uses what

| Importer                                          | What it imports            | How it uses it                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------------------------------- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/webview/components/commit/CommitDetails.tsx` | `buildFileTree` (value)    | In `CommitDetails`, memoised on the `details` object: `[]` when `details` is `null` (without calling the function), otherwise `buildFileTree(details.fileChanges)`. The result is passed to `<FileTree nodes={...} commitHash={details.hash} />`.                                                                                                                                                                                                                                                                                                                                                                             |
| `src/webview/components/commit/FileTree.tsx`      | `FileTreeNode` (type only) | Renders the nodes recursively as nested `<ul>` lists. Narrows on `node.type`. For a file it reads `name` (label) and `file` (colour by `file.type`, the rename badge and tooltip from `file.oldFilePath`/`file.newFilePath`, the `+n`/`-n` counts from `file.additions`/`file.deletions`, the diff action, the context menu). Its list-item `key` is `file.newFilePath`. For a folder it reads `name` (label), `path` (list-item `key`, and the collapsed-state set: a folder is open unless its `path` is in that set; clicking toggles membership) and `children` (rendered recursively when open). All folders start open. |
| Any test                                          | nothing                    | No test file imports the module (see §6).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |

`FileTreeFile` and `FileTreeFolder` are not imported anywhere today, but they are part of the public surface and must remain exported under those names.

---

## 2. Dependencies the implementation must use

| Import path       | Name            | Kind                             | Why                                                                                                                                                                                                                                                                        |
| ----------------- | --------------- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@/backend/types` | `GitFileChange` | type-only import (`import type`) | The element type of the input and of `FileTreeFile.file`. The project compiles with `verbatimModuleSyntax`, so a type-only import must be written as one. The webview bundle must not pull any backend runtime code, so nothing else may be imported from `@/backend/...`. |

No other repository module is needed. The module must not touch the DOM, `window`, `window.l10n`, the VS Code API, stores or messages.

### Contract of `GitFileChange` (dependency, not part of this module)

Defined in `src/backend/types/git.types.ts` and re-exported by `@/backend/types`:

| Field                                                    | Meaning                                                                                            |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `oldFilePath: string`                                    | Path before the change. Differs from `newFilePath` only for renames.                               |
| `newFilePath: string`                                    | Path after the change. For a deletion it is the path of the deleted file (equal to `oldFilePath`). |
| `type: "A" \| "M" \| "D" \| "R"`                         | Added, modified, deleted, renamed.                                                                 |
| `additions: number \| null`, `deletions: number \| null` | Line counts; `null` for binary files.                                                              |

What the backend (`src/backend/queries/commitDetails.ts`) actually sends, which bounds the realistic inputs: paths are repository-relative, use `/` as the only separator, never start or end with `/`, and never contain empty, `.` or `..` segments. They may contain any other character, including spaces, tabs, newlines, quotes, backslashes and non-ASCII text (Git's NUL-separated output is used, so nothing is quoted or escaped). For a merge, only the changes against the first parent are listed. A commit with no changes gives an empty list. Within one commit each `newFilePath` normally occurs once. The behaviour for other inputs (§3.6, §3.7) is still part of this specification, because the function is exported and tests may feed it anything that type-checks.

### Platform API: string collation

Names are ordered with the JavaScript runtime's default collation: the order that a default `Intl.Collator` (no locale argument, no options), or equivalently `String.prototype.localeCompare` with no locale and no options, gives. The default locale is the runtime's: in the VS Code webview that is the Chromium/Electron default locale; under Vitest it is Node's, which Node takes from `LC_ALL`/`LANG`. See §3.3 for what that means in practice and §7 Q2 for whether it is wanted.

---

## 3. Behaviour of `buildFileTree(files)`

### 3.1 What goes where

1. Each input entry produces exactly one file node. Nothing is dropped, merged or de-duplicated: the number of file nodes in the whole result always equals `files.length`.
2. A file node is placed according to the entry's `newFilePath` only. Every `/` in the path separates two segments. The last segment is the file node's `name`. Each segment before it is a directory, outermost first, and the file node sits inside the innermost of them. A path without `/` gives a file node at the top level. (Leading slashes are the one exception; see §3.6.)
3. `oldFilePath` and `type` have no influence on where a node goes, what it is called, or on ordering. They are only carried along inside `file`.
4. Directories with the same `path` are the same folder node. Two changes under `src/` share one `src` folder, however far apart they are in the input.
5. Folder names are compared as exact strings: case-sensitive (`A` and `a` are two folders) and without Unicode normalisation (a composed `é` and a decomposed `e` + combining accent are two folders that look alike).
6. A folder node exists only because at least one file lies beneath it. No empty folders are produced, and every folder's `children` has at least one entry.

### 3.2 Single-child folders are not collapsed

Every directory level gets its own folder node, even when a directory contains nothing but one other directory. `a/b/c/d.txt` gives three nested folders `a` → `b` → `c` and then the file; the result is never a single folder labelled `a/b/c`. The nesting depth of a file node equals the number of directory segments in its path.

### 3.3 Ordering

The same rule applies to the returned top-level array and to every folder's `children`, at every depth:

1. All folder nodes come before all file nodes.
2. Folders are ordered among themselves by `name`, and files among themselves by `name`, using the default collation described in §2.
3. When the collation calls two names equal, their relative order is the order of first appearance in the input: for files, their order in `files`; for folders, the order in which the first file beneath each was met. Identical file names in one folder only happen with duplicate paths (§3.7); for folders, only with names that are different strings but collate as equal, such as composed and decomposed forms of the same accented letter.
4. Apart from those ties, the output order does not depend on the input order. Reversing the input gives the same tree.

Consequences of the default collation, observed with locale `en-US` (also `C`, `POSIX` and `ja-JP` give the same order for these names):

- Case: for names that differ only in case, lower case comes first (`a.txt` before `A.txt`, `b` before `B`), but case does not outrank letters (`A.txt` before `b.txt`).
- Numbers are compared digit by digit, not as numbers: `file02.txt`, `file1.txt`, `file10.txt`, `file2.txt`, `File3.txt`.
- Punctuation and symbols sort before digits, and digits before letters: `_x`, `-y`, `.env`, `@a`, `#h`, `~z`, `1`, then letters. Dot-files are not grouped separately; `.gitignore` sorts with the other punctuation-initial names, before `README.md`.
- Accented letters sort next to their base letter in `en-US` (`å.txt`, `ä.txt` after `a.b.txt` and before `a~b.txt`), and accent differences count less than base letters (`resume`, `Resume`, `résumé`, `rèsume`, `resumes`).
- The order depends on the default locale. In `sv-SE`, `å.txt`, `ä.txt` and `ö.txt` sort after `zz`. In `tr-TR`, `Index.ts` sorts before `index-a.ts`, whereas in `en-US` the order is `index-a.ts`, `index.test.ts`, `index.ts`, `Index.ts`, `indexa.ts`.

### 3.4 Renames, deletions and other change types

- A renamed file (`type: "R"`) appears once, at its new location, under its new name. Its old location does not appear in the tree at all; if nothing else changed under the old directory, that directory is absent. The file node's `file.oldFilePath` still holds the old path (FileTree shows it in the rename tooltip).
- A deleted file (`type: "D"`) appears at its `newFilePath`, which for backend data is the path it was deleted from.
- Added and modified files have nothing special.

### 3.5 Folder `path` values

- A top-level folder's `path` equals its `name`. A nested folder's `path` is its parent's `path`, a `/`, then its own `name`.
- Equivalently, for well-formed input, a folder's `path` is the prefix of the file's `newFilePath` that ends just before the `/` that follows the folder's segment. For every file node inside a folder, `folder.path + "/" + fileNode.name === fileNode.file.newFilePath` (well-formed input).
- `path` is a pure function of the directory segments, so the same folder gets the same `path` string on every call. Two different folders never share a `path`.
- A folder's `path` can equal the `newFilePath` of a sibling file node: when a file `a` was deleted and a file `a/b` added in the same commit, the top level holds a folder with `path` `"a"` and a file with `newFilePath` `"a"` (see §7 Q4).

### 3.6 Unusual paths

None of these come from the backend. They are listed so that a replacement behaves the same.

| Input shape                                       | Result                                                                                                                                                                                          |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Leading `/` (one or more)                         | Ignored. `/a` is a top-level file `a`; `//b/c` and `b/d` share one top-level folder `b` (path `b`). The `newFilePath` inside `file` keeps its slashes.                                          |
| Repeated `/` inside the path                      | Each extra `/` makes a folder whose `name` is the empty string. `a//b` gives folder `a` (path `a`) → folder `""` (path `a/`) → file `b`. `a///d` adds one more level: folder `""` (path `a//`). |
| Trailing `/`                                      | The file node's `name` is the empty string. `a/` gives folder `a` → file `""`.                                                                                                                  |
| Empty string, or only slashes (`""`, `/`, `///`)  | A top-level file node whose `name` is the empty string.                                                                                                                                         |
| `.` and `..` segments                             | Treated as ordinary names; nothing is resolved or normalised. `./a` gives folder `.` → file `a`; `x/../z` gives folder `x` → folder `..` (path `x/..`) → file `z`.                              |
| Backslashes                                       | Not separators. `a\b\c.txt` is one top-level file with that whole name.                                                                                                                         |
| Leading, trailing or inner spaces, tabs, newlines | Kept exactly in `name` and `path`.                                                                                                                                                              |
| Non-ASCII (CJK, accents, emoji)                   | Kept exactly. Composed and decomposed forms stay distinct (§3.1).                                                                                                                               |
| Very deep paths                                   | Every level gets a folder. A single path with 2,048 segments (the most a 4,096-byte path can have) works. See §5 for limits and costs.                                                          |

The function assumes its input matches the declared type. With a `newFilePath` that is not a string (for example `undefined` from untyped data), the current module throws a `TypeError`; no caller relies on that, and a replacement need not match it. An `oldFilePath` that is not a string is never looked at.

### 3.7 Duplicate paths

If two or more entries have the same `newFilePath`, each gets its own file node, side by side in the same folder, in input order. Folders on the way are shared as usual. (FileTree would then render two list items with the same key; see §7 Q5.)

### 3.8 Return value

- A new array every call, containing the top-level nodes in the order of §3.3. For an empty input it is an empty array.
- Every node object and every `children` array in the result is newly created by that call. Nothing is shared with a previous call's result, and nothing is cached between calls.
- Nodes are plain, extensible, unfrozen objects. Each has exactly the own properties listed in §1 (`type`, `name`, `file` for a file; `type`, `name`, `path`, `children` for a folder) and no others, so deep-equality assertions such as Vitest's `toEqual` match the outlines in §4 exactly. Property order is not significant.

---

## 4. Concrete examples

All outputs were produced by running the current module (§0).

### 4.1 Empty input

Input: `[]`. Output: `(empty)`.

### 4.2 One top-level file

Input: `README.md`. Output:

```
file "README.md" ← README.md [M]
```

### 4.3 A typical commit

Input, in this order: `src/webview/utils/fileTree.ts`, `README.md`, `src/extension.ts`, `src/webview/main.tsx`, `docs/a.md`. Output:

```
folder "docs" (path "docs")
  file "a.md" ← docs/a.md [M]
folder "src" (path "src")
  folder "webview" (path "src/webview")
    folder "utils" (path "src/webview/utils")
      file "fileTree.ts" ← src/webview/utils/fileTree.ts [M]
    file "main.tsx" ← src/webview/main.tsx [M]
  file "extension.ts" ← src/extension.ts [M]
file "README.md" ← README.md [M]
```

### 4.4 A single deep file, in full

Input: one entry `{ oldFilePath: "a/b/c/d.txt", newFilePath: "a/b/c/d.txt", type: "M", additions: 1, deletions: 0 }`. Output, as JSON:

```json
[
  {
    "type": "folder",
    "name": "a",
    "path": "a",
    "children": [
      {
        "type": "folder",
        "name": "b",
        "path": "a/b",
        "children": [
          {
            "type": "folder",
            "name": "c",
            "path": "a/b/c",
            "children": [
              {
                "type": "file",
                "name": "d.txt",
                "file": {
                  "oldFilePath": "a/b/c/d.txt",
                  "newFilePath": "a/b/c/d.txt",
                  "type": "M",
                  "additions": 1,
                  "deletions": 0
                }
              }
            ]
          }
        ]
      }
    ]
  }
]
```

The `file` value is the input object itself (`===`).

### 4.5 Shared prefixes

Input: `src/a.ts`, `src/b/c.ts`. Output:

```
folder "src" (path "src")
  folder "b" (path "src/b")
    file "c.ts" ← src/b/c.ts [M]
  file "a.ts" ← src/a.ts [M]
```

### 4.6 Ordering of mixed names

Input: `b.txt`, `a/x`, `A.txt`, `a.txt`, `B/y`, `_z/q`. Output:

```
folder "_z" (path "_z")
  file "q" ← _z/q [M]
folder "a" (path "a")
  file "x" ← a/x [M]
folder "B" (path "B")
  file "y" ← B/y [M]
file "a.txt" ← a.txt [M]
file "A.txt" ← A.txt [M]
file "b.txt" ← b.txt [M]
```

Input: `A/x`, `a/y`, `B`, `b`, `a`, `A`. Output:

```
folder "a" (path "a")
  file "y" ← a/y [M]
folder "A" (path "A")
  file "x" ← A/x [M]
file "a" ← a [M]
file "A" ← A [M]
file "b" ← b [M]
file "B" ← B [M]
```

Top-level file names only, each set given in some input order and returning the same order for the reversed input (locale `en-US`):

| Input names                                                                                                                                                                 | Output order                                                                                                                                                                |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `file10.txt`, `file2.txt`, `file1.txt`, `File3.txt`, `file02.txt`                                                                                                           | `file02.txt`, `file1.txt`, `file10.txt`, `file2.txt`, `File3.txt`                                                                                                           |
| `index.ts`, `index.test.ts`, `index-a.ts`, `indexa.ts`, `Index.ts`                                                                                                          | `index-a.ts`, `index.test.ts`, `index.ts`, `Index.ts`, `indexa.ts`                                                                                                          |
| `resume`, `résumé`, `Resume`, `rèsume`, `resumes`                                                                                                                           | `resume`, `Resume`, `résumé`, `rèsume`, `resumes`                                                                                                                           |
| `b.txt`, `a-b.txt`, `a_b.txt`, `a.b.txt`, `ab.txt`, `a b.txt`, `a~b.txt`, `.env`, `_x`, `-y`, `~z`, `#h`, `@a`, `1`, `Z`, `zz`, `ä.txt`, `z.txt`, `å.txt`, `ö.txt`, `o.txt` | `_x`, `-y`, `.env`, `@a`, `#h`, `~z`, `1`, `a b.txt`, `a_b.txt`, `a-b.txt`, `a.b.txt`, `å.txt`, `ä.txt`, `a~b.txt`, `ab.txt`, `b.txt`, `o.txt`, `ö.txt`, `Z`, `z.txt`, `zz` |

The same last set in `sv-SE`: `_x`, `-y`, `.env`, `@a`, `#h`, `~z`, `1`, `a b.txt`, `a_b.txt`, `a-b.txt`, `a.b.txt`, `a~b.txt`, `ab.txt`, `b.txt`, `o.txt`, `Z`, `z.txt`, `zz`, `å.txt`, `ä.txt`, `ö.txt`. In `de-DE` it matches `en-US`. The `index` set in `tr-TR`: `Index.ts`, `index-a.ts`, `index.test.ts`, `index.ts`, `indexa.ts`.

Dot-files, from the §4.11 input: folders `.`, `..`, `.hidden`, `x`, then file `.gitignore`.

### 4.7 Renames and deletions

Input: `{ old: "old/dir/x.ts", new: "new/dir/x.ts", type: "R" }`, `old/dir/y.ts` (M). Output:

```
folder "new" (path "new")
  folder "dir" (path "new/dir")
    file "x.ts" ← new/dir/x.ts [R]    (file.oldFilePath is "old/dir/x.ts")
folder "old" (path "old")
  folder "dir" (path "old/dir")
    file "y.ts" ← old/dir/y.ts [M]
```

Input: `{ old: "a/x.ts", new: "b/x.ts", type: "R" }` alone. Output: only folder `b` (path `b`) → file `x.ts` [R]. There is no folder `a`.

Input: `gone/file.txt` with `type: "D"`. Output: folder `gone` (path `gone`) → file `file.txt` [D].

### 4.8 Duplicate paths

Input: `{ old: "1", new: "d/x", type: "A" }`, `{ old: "2", new: "d/x", type: "M" }`, `{ old: "3", new: "d/x", type: "D" }`. Output: folder `d` (path `d`) with three file nodes named `x`, whose `file.oldFilePath` values are `1`, `2`, `3` in that order. With the input reversed: `3`, `2`, `1`.

Input: `{ old: "one", new: "x", type: "M" }`, `{ old: "two", new: "x", type: "R" }`. Output: two top-level file nodes named `x`, `one` first.

### 4.9 A file and a folder with the same name

Input: `a` (D), `a/b` (A), in either order. Output:

```
folder "a" (path "a")
  file "b" ← a/b [A]
file "a" ← a [D]
```

### 4.10 Leading, repeated and trailing slashes, and empty paths

Input: `/a`, `//b/c`, `b/d`. Output:

```
folder "b" (path "b")
  file "c" ← //b/c [M]
  file "d" ← b/d [M]
file "a" ← /a [M]
```

Input: `/a/b.txt`, `a/c.txt`. Output: folder `a` (path `a`) → files `b.txt` (← `/a/b.txt`) and `c.txt` (← `a/c.txt`).

Input: `a//b`, `a/c`, `a///d`. Output:

```
folder "a" (path "a")
  folder "" (path "a/")
    folder "" (path "a//")
      file "d" ← a///d [M]
    file "b" ← a//b [M]
  file "c" ← a/c [M]
```

Input: `//a//b`. Output: folder `a` (path `a`) → folder `""` (path `a/`) → file `b`.

Input: `a/`, `a/b/`. Output:

```
folder "a" (path "a")
  folder "b" (path "a/b")
    file "" ← a/b/ [M]
  file "" ← a/ [M]
```

Input: `a/b/`, `a/b/c`. Output: folder `a` → folder `b` (path `a/b`) → files `""` then `c`.

Input: `""`. Output: one top-level file node with name `""`. The same for `/` and for `///`.

Input (ten entries): `""`, `/`, `//`, `a/`, `a//`, `/a`, `a`, `a/b`, `./a`, `a/./b`. Output (ten file nodes):

```
folder "." (path ".")
  file "a" ← ./a [M]
folder "a" (path "a")
  folder "" (path "a/")
    file "" ← a// [M]
  folder "." (path "a/.")
    file "b" ← a/./b [M]
  file "" ← a/ [M]
  file "b" ← a/b [M]
file "" ← "" [M]
file "" ← / [M]
file "" ← // [M]
file "a" ← /a [M]
file "a" ← a [M]
```

### 4.11 Dots, backslashes, whitespace

Input: `./a`, `../b`, `x/./y`, `x/../z`, `.hidden/f`, `.gitignore`. Output:

```
folder "." (path ".")
  file "a" ← ./a [M]
folder ".." (path "..")
  file "b" ← ../b [M]
folder ".hidden" (path ".hidden")
  file "f" ← .hidden/f [M]
folder "x" (path "x")
  folder "." (path "x/.")
    file "y" ← x/./y [M]
  folder ".." (path "x/..")
    file "z" ← x/../z [M]
file ".gitignore" ← .gitignore [M]
```

Input: `a\b\c.txt` (backslashes). Output: one top-level file node named `a\b\c.txt`.

Input: `" a/ b "`, `"a b/c"`. Output: folder `" a"` (path `" a"`) → file `" b "`; folder `"a b"` (path `"a b"`) → file `"c"`.

Input: `"line\nbreak/f"`, `"tab\there"`. Output: folder `"line\nbreak"` (path `"line\nbreak"`) → file `"f"`; then top-level file `"tab\there"`.

### 4.12 Unicode

Input: `目录/新.txt`, `é/composed` (composed `"é"`), `é/decomposed` (decomposed), `émoji/😀.txt`. Output: four top-level folders in this order: `"é"` (→ `composed`), `"é"` (→ `decomposed`), `émoji` (→ `😀.txt`), `目录` (→ `新.txt`). The two `é` folders are separate and keep their input order.

Input: `é/1`, `é/2`, `é/3`. Output: folder `"é"` (children `1`, `3`), then folder `"é"` (child `2`). With the first two swapped, `"é"` comes first.

---

## 5. Non-functional requirements

### 5.1 Purity

- Synchronous. No side effects. It reads nothing but its argument and the runtime's default collation.
- It must not modify the input array (order, length, contents) or any change object in it. A deeply frozen input must work.
- For the same input, and the same default locale, it always returns a structurally equal result.
- It keeps no state between calls.

### 5.2 What callers rely on beyond the returned shape

- `file` is the input object itself. Nothing in the repository compares it by reference today, but the node must carry the original values unchanged (FileTree forwards it to `viewDiff` and the file context menu), and keeping the reference avoids copying thousands of objects. A replacement must keep this identity.
- A folder's `path` must depend only on its directory segments (§3.5). FileTree keys each folder's list item on it and keeps the set of collapsed folders keyed on it. When `CommitDetails` recomputes the tree for a new details object while FileTree stays mounted, a folder the user collapsed stays collapsed only because it gets the same `path` again. The format of `path` (segments joined by a single `/`, no leading `/`) must be kept, not just its uniqueness.
- A file's list-item key in FileTree is `file.newFilePath`. The module must not change that string (it cannot, since it passes the original object through).
- `CommitDetails` memoises the call on the details object, so the function runs once per commit shown and again only when a new details object arrives.

### 5.3 Performance

Commit details can list thousands of files, and the call runs on the webview's UI thread before the details panel renders.

Measured with the current module (§0), repeated-call median, after a warm-up call:

| Input                                                                         | Time     |
| ----------------------------------------------------------------------------- | -------- |
| 1,000 real paths from this repository and its `node_modules` (up to 9 levels) | 4.4 ms   |
| 5,000 real paths (up to 11 levels)                                            | 12.2 ms  |
| 10,000 real paths (up to 11 levels)                                           | 23.9 ms  |
| 20,000 real paths (up to 13 levels)                                           | 58.9 ms  |
| 24,414 real paths (up to 13 levels)                                           | 61.9 ms  |
| 10,000 synthetic files, 1 to 6 levels                                         | 21.5 ms  |
| 50,000 synthetic files, 1 to 6 levels                                         | 87.9 ms  |
| 100,000 synthetic files, 1 to 6 levels                                        | 126.4 ms |
| 10,000 files in one top-level list                                            | 9.5 ms   |
| 10,000 files in one folder three levels down                                  | 9.7 ms   |
| 10,000 folders with one file each                                             | 6.9 ms   |

The first call in a fresh process (JIT cold) took 15.6 ms for 1,000 real paths, 39.2 ms for 10,000 and 94.3 ms for 24,414.

Requirements for a replacement:

- Total work must grow roughly in proportion to the total length of all paths plus the cost of sorting each folder's children (that is, about n log n in the number of files for bounded depth). Work that grows with the square of the number of files, such as scanning all earlier files or all existing folders for each new file, is not acceptable.
- On hardware like the above, 10,000 files of realistic depth should take no more than about 50 ms warm, and 100,000 no more than about 250 ms.
- Depth: a path with 2,048 segments must work. The current module's cost grows with the square of the depth for a single very deep path (100 levels: 0.1 ms; 1,000: 8.6 ms; 2,048: 37.7 ms; 10,000: about 89 ms). It fails with `RangeError: Maximum call stack size exceeded` somewhere above roughly 6,000 levels in a cold process (about 6,350 in one run; 10,000 succeeded after warm-up; 50,000 failed). A replacement must not be worse than this, and may be better (see §7 Q7). FileTree's own rendering is also recursive, which is outside this module.

---

## 6. Test coverage

### 6.1 What existing tests check

Nothing exercises this module directly or indirectly.

- No test imports `@/webview/utils/fileTree`.
- Running `vitest run --project webview` with V8 coverage limited to the module showed 0% of its statements and functions executed. In the same run `FileTree.tsx` was at 8% (module load only) and `CommitDetails.tsx` never rendered a non-null `details`. The component tests that expand a commit (`tests/webview/components/commit/WorkingTreeDetails.test.ts`, `tests/webview/components/commit/GraphErrors.test.ts`) only reach the loading state, and `tests/webview/lib/graph-requests.test.ts` feeds `fileChanges: []` into the stores without rendering.
- The VS Code UI harness (`tests-ext/ui/history.test.cjs`, test "clips wide graphs after scrolling, resizing, zoom and details") expands a commit that has no file changes, and asserts only graph alignment.
- Backend tests (`tests/backend/queries/commitDetails/get.test.ts`, `tests/backend/queries/signedCommits.test.ts`) check the input data this module receives (a rename into `目录/新.txt`, binary files with `null` counts, first-parent changes of a merge, `[]` for an empty commit), not the tree.

### 6.2 Gaps: tests to add

Suggested file: `tests/webview/utils/fileTree.test.ts` (Vitest project `webview`; no DOM needed). Build each change as `{ oldFilePath: p, newFilePath: p, type: "M", additions: 1, deletions: 0 }` unless stated. For ordering tests, use ASCII names without `i`/`I`, so the expected order is the same under `en-US`, `C` and other common default locales; Turkish, for example, orders `I` and `i` differently. Expected results use the notation of §0.

| #   | Behaviour                                                    | Input (`newFilePath`s, in order)                                    | Expected                                                                                                                                                       |
| --- | ------------------------------------------------------------ | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G1  | Empty input                                                  | `[]`                                                                | `[]`                                                                                                                                                           |
| G2  | Top-level file, identity                                     | `README.md`                                                         | one node `{ type: "file", name: "README.md", file }` where `file` is the input object (`toBe`)                                                                 |
| G3  | One folder per segment, no collapsing of single-child chains | `a/b/c/d.txt`                                                       | exactly the JSON of §4.4 (`toEqual`)                                                                                                                           |
| G4  | Shared prefixes merge into one folder                        | `src/a.ts`, `src/b/c.ts`                                            | the outline of §4.5                                                                                                                                            |
| G5  | Folders before files at every level, names ordered           | `b.txt`, `a/x`, `A.txt`, `a.txt`, `B/y`, `_z/q`                     | the first outline of §4.6                                                                                                                                      |
| G6  | Case: lower case first, letters before case                  | `B`, `b`, `A`, `a`                                                  | top-level file names `a`, `A`, `b`, `B`                                                                                                                        |
| G7  | No numeric ordering                                          | `f10.txt`, `f2.txt`, `f1.txt`                                       | `f1.txt`, `f10.txt`, `f2.txt`                                                                                                                                  |
| G8  | Output independent of input order                            | the G5 input reversed                                               | deep-equal to the G5 result                                                                                                                                    |
| G9  | Duplicate paths kept, in input order                         | `d/x` three times with `oldFilePath` `1`, `2`, `3`                  | folder `d` with three files `x`, `oldFilePath` `1`, `2`, `3`; reversed input gives `3`, `2`, `1`                                                               |
| G10 | Renames placed by the new path only                          | `{ old: "a/x.ts", new: "b/x.ts", type: "R" }`                       | only folder `b` (path `b`) → file `x.ts`, whose `file.oldFilePath` is `a/x.ts`; no folder `a`                                                                  |
| G11 | Deleted file placed at its path                              | `gone/file.txt` with `type: "D"`                                    | folder `gone` → file `file.txt` [D]                                                                                                                            |
| G12 | Input not mutated                                            | a deeply frozen array of `z.txt`, `a/b.txt`, `a/a.txt`, `m/n/o.txt` | no exception; input deep-equal to a copy taken before the call                                                                                                 |
| G13 | Fresh result per call                                        | the G12 input, called twice                                         | the two results are deep-equal but not the same arrays or node objects                                                                                         |
| G14 | Folder path is the joined segments                           | `src/webview/utils/fileTree.ts`                                     | folder paths `src`, `src/webview`, `src/webview/utils`; and for every file node in a folder, `folder.path + "/" + name` equals `file.newFilePath`              |
| G15 | Case-sensitive folders                                       | `A/x`, `a/y`                                                        | two folders, `a` (path `a`) then `A` (path `A`)                                                                                                                |
| G16 | File and folder with the same name                           | `a` (D), `a/b` (A)                                                  | the outline of §4.9                                                                                                                                            |
| G17 | Leading slashes ignored                                      | `/a/b.txt`, `a/c.txt`                                               | one folder `a` (path `a`) with `b.txt` and `c.txt`                                                                                                             |
| G18 | Repeated slashes make empty-named folders                    | `a//b`                                                              | folder `a` (path `a`) → folder `""` (path `a/`) → file `b`                                                                                                     |
| G19 | Trailing slash makes an empty-named file                     | `a/`                                                                | folder `a` → file `""`                                                                                                                                         |
| G20 | Empty path                                                   | `""`                                                                | one top-level file node with name `""`                                                                                                                         |
| G21 | Dots and backslashes are ordinary characters                 | `x/../z`, `a\b.txt`                                                 | folder `x` → folder `..` (path `x/..`) → file `z`; then top-level file `a\b.txt`                                                                               |
| G22 | Unicode kept, no normalisation, ties keep input order        | `é/1`, `é/2`                                                        | two folders, `"é"` first then `"é"`; swapping the inputs swaps them                                                                                            |
| G23 | Every entry gives exactly one file node                      | the ten entries of the last example in §4.10                        | exactly the outline given there; 10 file nodes in total                                                                                                        |
| G24 | Scale                                                        | 10,000 distinct paths spread over folders 1 to 6 levels deep        | completes (use a loose time bound, for example under 1 second, to avoid flaky CI); file-node count 10,000; every folder's children are sorted by the §3.3 rule |
| G25 | Depth                                                        | one path of 2,048 segments `d0/d1/…/d2047/leaf.txt`                 | no exception; 2,048 nested folders; the innermost folder's path is the path without `/leaf.txt`                                                                |

Optional component-level gap (it tests FileTree's use of `path`, not this module alone), in a jsdom test that renders `CommitDetails` with a details object whose `fileChanges` are `src/a.ts` and `src/b/c.ts`:

| #   | Steps                                                                                                   | Expected                                                                                 |
| --- | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| G26 | Render; click the button labelled `b`                                                                   | Its `aria-expanded` becomes `false` and `c.ts` is no longer in the DOM; `a.ts` still is. |
| G27 | After G26, re-render `CommitDetails` with a new details object for the same commit and the same changes | `b` is still collapsed (its `path` `src/b` is unchanged).                                |

---

## 7. Questions

**Q1. Single-child folder chains are not compacted.** Currently `a/b/c/d.txt` shows three nested folder rows. VS Code's own explorer compacts such chains into one row (`a/b/c`) by default (`explorer.compactFolders`). Is one level per segment the intended look, or should chains be compacted? Compacting would change `name` (and the number of nodes), which FileTree shows directly; `path` could stay the full path.

**Q2. Ordering depends on the runtime's default locale and is not numeric-aware.** The same commit can be listed in different orders for users with different UI languages (Swedish puts `å`, `ä`, `ö` after `z`; Turkish puts `Index.ts` before `index-a.ts`), and `file10` sorts before `file2`. Elsewhere the webview formats dates with the `locale` field of its configuration (VS Code's display language, `vscode.env.language`), not the runtime default, and tests under Node get whatever `LANG` the machine has. Is locale-dependent, non-numeric order intended, or should the order be fixed (for example, the configured locale, a set locale, or numeric-aware comparison as VS Code's explorer uses)?

**Q3. Unusual slashes are handled inconsistently.** Leading slashes are dropped (so `/a/b` and `a/b` share a folder), while repeated inner slashes produce folders named `""` and a trailing slash produces a file named `""`, which FileTree renders as a blank row. Git never produces these paths, so this may not matter. Is the current behaviour intended, or should all of them be kept literally, or all normalised?

**Q4. A file and a folder can share a key.** When a commit replaces a file with a directory (`D a` and `A a/b`), the top-level list holds folder `a` (key `path` = `"a"`) and file `a` (key `newFilePath` = `"a"`). FileTree renders them in one `<ul>` with the same Preact key, which may confuse Preact's reconciliation when the list changes. The module is behaving as specified; the collision comes from how FileTree picks keys. Should the module expose a distinct key, or should FileTree prefix its keys by node type? (This affects FileTree, not the signatures here.)

**Q5. Duplicate paths are not de-duplicated.** Two entries with the same `newFilePath` give two identical-looking rows with the same Preact key. The backend does not produce duplicates for one parent, so this is defensive only. Keep both, or keep one?

**Q6. Composed and decomposed Unicode names give two look-alike folders.** Git treats them as different paths, so keeping them separate is arguably right, but the user sees two folders with the same label. Intended?

**Q7. Stack limit on extreme depth.** The current module throws a `RangeError` for a path of roughly 6,000 or more segments. Real paths are limited to about 2,048 segments by the 4,096-byte path limit, so this cannot happen with backend data. Should a replacement be required to handle any depth, or is 2,048 enough?

**Q8. A rename's old location is not shown.** A file moved from `a/x.ts` to `b/x.ts` appears only under `b`, with the old path in the tooltip. If nothing else changed in `a`, the tree gives no sign that `a` lost a file. Is placing renames at the new location only intended?

---

## 8. Decisions on §7 (from the project maintainer's side)

These decisions replace the "current behaviour" wherever they differ. Build to these, and replace the gap cases they contradict (G6, G7, G18, G19, G20) with tests of the decided behaviour.

- **Q1: keep.** Single-child folder chains are not merged.
- **Q2: numeric order in the display language.** At every level, folders still come before files. Names are ordered with a collator for the display language (`getWebviewConfig().locale` from `@/webview/lib/webview-config`) with numeric ordering, so `file2` comes before `file10`. If Intl rejects the display language's tag, use the runtime's default locale, still numeric. Names the collator counts as equal keep their input order. Build the collator once per locale tag, not per call.
- **Q3: ignore empty segments.** Leading, repeated and trailing slashes create no folders or files named `""`: `a//b` places `b` in folder `a`, and `a/` places a file named `a` at the top level. A path with no non-empty segment becomes a top-level file named `""`. A folder's `path` joins only the segments that are used.
- **Q4: keep.** Keys are the component's concern, not this module's.
- **Q5: keep.** Duplicate paths are all kept, in input order.
- **Q6: keep.** No Unicode normalisation.
- **Q7: depth.** Paths up to at least 2,048 segments must work without throwing.
- **Q8: keep.** A rename appears only at its new path.
