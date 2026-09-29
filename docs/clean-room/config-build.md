# Clean-room specification: build and test configuration

This document states what nine configuration files must achieve, so that each can be deleted and
written again, whole and at the same path, by someone who never sees them or their history. It
also covers one file that is not being rewritten, `src/webview/tsconfig.json`, because two of the
nine extend it or are extended with it and the implementer must keep them working together.

Each entry of each file is classified:

- **(A) Dictated.** Another value would break a consumer: a script, a workflow, another
  configuration file, the product code or the tests. The value is stated exactly and must be
  reproduced.
- **(B) Chosen.** One reasonable choice among several. The document states the requirement the
  entry serves (observable behaviour), not its current text; the implementer chooses how to meet
  it.
- **(C) Obsolete.** Nothing needs it today. The document says what removing it would change.

For `esbuild.js`, which is a program rather than a list of settings, section 2 is a behaviour
specification: inputs, outputs, console lines, exit status and edge cases, with observed examples.

Questions for the maintainer are numbered `build Q1`, `build Q2`, … (section 13). They describe
current behaviour and decide nothing.

| Section | File                          | What it is                                                    |
| ------- | ----------------------------- | ------------------------------------------------------------- |
| 2       | `esbuild.js`                  | Node script that bundles the extension and the webview        |
| 3       | `vitest.config.ts`            | Vitest configuration: three test projects and menu coverage   |
| 4       | `.vscode-test.mjs`            | `@vscode/test-cli` configuration for tests inside VS Code     |
| 5       | `tsconfig.base.json`          | Compiler options shared by every TypeScript project           |
| 6       | `tsconfig.json`               | Root project: extension-side sources and `vitest.config.ts`   |
| 7       | `tests/tsconfig.json`         | Type-check project for the backend and extension Vitest tests |
| 8       | `tests/webview/tsconfig.json` | Type-check project for the webview Vitest tests               |
| 9       | `tests-ext/tsconfig.json`     | Compiles the VS Code-hosted tests to CommonJS                 |
| 10      | `pnpm-workspace.yaml`         | pnpm settings: which dependencies may run build scripts, pins |
| 11      | `src/webview/tsconfig.json`   | Not rewritten; context only (extended by section 8's file)    |

---

## 0. How the behaviour was observed

- Worktree at commit `cd1b5db`, Linux x64, Node v22.22.2, pnpm 11.15.1, installed with
  `pnpm install --frozen-lockfile`. Tool versions from the lockfile: esbuild 0.28.2, TypeScript
  7.0.2 (the native compiler; `tsc --version` prints `Version 7.0.2`), Vitest 4.1.11 with
  `@vitest/coverage-v8` 4.1.11, Tailwind CSS and `@tailwindcss/postcss` 4.3.3, PostCSS 8.5.26,
  `tsc-alias` 1.9.2, `@vscode/test-cli` 0.0.15, `@vscode/test-electron` 3.1.0, `@vscode/vsce`
  3.9.2.
- Git was the system Git 2.43.0. Putting the Git 2.55 build first in `PATH`, as requested, was
  refused by the session's worktree guard (section 0.1), so `pnpm run provenance --lines` and the
  Git fixtures of the tests ran with 2.43.0.
- In the worktree itself: `pnpm run compile`, `node esbuild.js --production`, the build in watch
  mode (started, observed, stopped), `pnpm run typecheck`, `pnpm test`, `pnpm run test:coverage`,
  a coverage run restricted to one unrelated test file (to see the threshold fail),
  `pnpm run compile-tests`, `tsc -p . --watch` for a few seconds, and
  `pnpm run provenance --lines` for each file.
- The VS Code commands of section 1.4 ran under `xvfb-run -a` with `NGG_VSCODE_PATH` (and, for
  the harness, `NGG_MINIMUM_VSCODE_PATH`) pointing at VS Code 1.139.1 and 1.125.0 builds already
  downloaded in the main checkout's `.vscode-test/`, and with `NGG_ARTIFACTS` and the VSIX under
  `/tmp`: `pnpm run test:ext`, `pnpm run test:ui-harness`,
  `pnpm run package:vsix --out <tmp>/branchwise.vsix` and `pnpm run test:package <that file>`.
  All passed.
- pnpm's settings were tried in a separate folder under `/tmp` holding only `package.json`,
  `pnpm-lock.yaml` and a varied `pnpm-workspace.yaml`, with its own `node_modules`. The ranges
  that dependents request were read from the registry with `pnpm view`.
- Everything that needed a changed file ran in a scratch copy of the repository under `/tmp` (the
  tree without `.git`, `node_modules` linked to the worktree's): syntax errors, a missing entry
  point, an unresolvable import and an invalid stylesheet fed to the build; watch-mode rebuilds
  after edits, new files and fixes; one-option-at-a-time variations of every `tsconfig` file
  followed by the five type-check projects, with probe files that fail only under a given option;
  variations of `tests-ext/tsconfig.json` followed by `tsc` and `tsc-alias`; bundles built with
  and without the alias plugin and the explicit JSX options, compared by hash; a webview component
  test run without the JSX settings of `src/webview/tsconfig.json`.
- All build output (`out/`, `tests-ext/out/`, `test-results/`, packaged `.vsix`) was deleted
  afterwards. No repository file other than this document was changed.

### 0.1 Commands refused

- Any command that put the Git 2.55 build first in `PATH` (an `export PATH=…` or a `PATH=…`
  prefix naming the scratch `git255/bin` folder) was refused by the worktree guard ("names git in a
  form too complex to verify"). It was not worked around; the system Git was used instead.
- A shell loop that ran `sed` with a computed program over a scratch copy was refused for the same
  reason; the same experiment was repeated with a small Node script in `/tmp`.

---

## 1. Scope, consumers and verification

### 1.1 The files

| File                          | Inherited lines | Entries | (A) | (B) | (C) |
| ----------------------------- | --------------- | ------- | --- | --- | --- |
| `esbuild.js`                  | 83              | 32      | 19  | 12  | 1   |
| `vitest.config.ts`            | 20              | 23      | 17  | 6   | 0   |
| `.vscode-test.mjs`            | 1               | 37      | 27  | 10  | 0   |
| `tsconfig.base.json`          | 21              | 20      | 10  | 7   | 3   |
| `tsconfig.json`               | 5               | 7       | 5   | 1   | 1   |
| `tests/tsconfig.json`         | 1               | 3       | 2   | 1   | 0   |
| `tests/webview/tsconfig.json` | 2               | 4       | 4   | 0   | 0   |
| `tests-ext/tsconfig.json`     | 13              | 14      | 8   | 4   | 2   |
| `pnpm-workspace.yaml`         | 4               | 12      | 8   | 4   | 0   |

Inherited lines are those `pnpm run provenance --lines <file>` reports; they equal the counts in
`scripts/provenance-baseline.json`. `src/webview/tsconfig.json` reports 0 inherited and 3
reviewed lines (its rewrite is recorded under `shared-types.md`). An entry is one setting, one
behaviour or one comment that the rewrite must provide; the file name and place count as an
entry of each file. Section 12 repeats the totals.

Each file is deleted and written again **whole, at the same path and under the same name**. The
implementer works from this document; they do not open the old files, their history, or build
output that contains them. The rewrite may order, group and comment entries as it likes.

### 1.2 How the TypeScript projects fit together

```text
tsconfig.base.json                     shared options, no files of its own
├── tsconfig.json                      root project: src/** except src/webview, vitest.config.ts
│   ├── tests/tsconfig.json            tests/backend/**, tests/extension/**
│   └── tests-ext/tsconfig.json        tests-ext/**, emits CommonJS to tests-ext/out
└── src/webview/tsconfig.json          webview project: DOM library, Preact JSX   (not rewritten)
    └── tests/webview/tsconfig.json    tests/webview/** plus src/webview/global.d.ts
```

Every project also compiles whatever its files import, so `src/` modules are checked again inside
each test project (for example the webview project checks the `src/types`, `src/backend/types`,
`src/backend/utils` and `src/old-extension/l10n` modules the webview imports).

Three tools besides `tsc` read these files:

- **esbuild** finds, for each source file it bundles, the nearest `tsconfig.json` above it and
  applies some of its options, at least `paths` and the JSX settings (observed, section 2.4).
  Files under `src/webview/` get `src/webview/tsconfig.json`; the other `src/` files get the root
  `tsconfig.json`.
- **Vitest** (through Vite) does the same for each file it transforms. This is how the webview
  tests compile Preact JSX: `vitest.config.ts` says nothing about JSX (section 3.2).
- **`tsc-alias`** reads `tests-ext/tsconfig.json` to rewrite `@/…` in the emitted CommonJS.

### 1.3 Consumers

| Consumer                                                                                     | What it relies on                                                                                                                                                                                                                                                                                                                                                                                             |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `package.json` `main`                                                                        | `./out/extension.js`, produced by `esbuild.js`                                                                                                                                                                                                                                                                                                                                                                |
| `package.json` `compile`                                                                     | deletes `out/`, then `node esbuild.js` (development build)                                                                                                                                                                                                                                                                                                                                                    |
| `package.json` `package`                                                                     | `pnpm run typecheck && pnpm run lint && node esbuild.js --production`                                                                                                                                                                                                                                                                                                                                         |
| `package.json` `vscode:prepublish`                                                           | `clean` then `package`; `vsce` runs it before packaging                                                                                                                                                                                                                                                                                                                                                       |
| `package.json` `watch:esbuild`, `watch:tsc`                                                  | `node esbuild.js --watch`; `tsc -p . --watch` (root project)                                                                                                                                                                                                                                                                                                                                                  |
| `package.json` `benchmark:ui`, `test:ui-harness`                                             | `node esbuild.js --production` without cleaning `out/` first                                                                                                                                                                                                                                                                                                                                                  |
| `package.json` `typecheck`                                                                   | `tsc -p .`, `tsc -p src/webview`, `tsc -p tests`, `tsc -p tests/webview`, `tsc -p tests-ext --noEmit`, in that order, stopping at the first failure                                                                                                                                                                                                                                                           |
| `package.json` `compile-tests`                                                               | `tsc -p tests-ext/tsconfig.json && tsc-alias -p tests-ext/tsconfig.json`                                                                                                                                                                                                                                                                                                                                      |
| `package.json` `test`, `test:coverage`                                                       | Vitest projects named `backend`, `extension`, `webview`; `--coverage` on `webview` only                                                                                                                                                                                                                                                                                                                       |
| `package.json` `test:ext`                                                                    | `compile`, `compile-tests`, then `vscode-test`, which loads `.vscode-test.mjs` from the working directory                                                                                                                                                                                                                                                                                                     |
| `package.json` `clean:all`                                                                   | removes `out`, `tests-ext/out`, `.vscode-test`, `test-results` and `*.vsix` at the root                                                                                                                                                                                                                                                                                                                       |
| `.vscode/tasks.json`                                                                         | task `watch:esbuild` (background, problem matcher `$esbuild-watch`), task `watch:tsc` (`$tsc-watch`), default build task `compile` (`$esbuild-watch`), `typecheck` (`$tsc`)                                                                                                                                                                                                                                   |
| `.vscode/launch.json`                                                                        | "Run Extension" runs the default build task (`compile`) first, then loads the extension from the repository root; `outFiles` `${workspaceFolder}/out/**/*.js` for source maps                                                                                                                                                                                                                                 |
| `.vscode/extensions.json`                                                                    | recommends `connor4312.esbuild-problem-matchers`, which defines `$esbuild-watch` (section 2.5)                                                                                                                                                                                                                                                                                                                |
| `.github/workflows/ci.yaml`                                                                  | `pnpm run typecheck`; `pnpm run test`; `pnpm run test:coverage` (Linux); `pnpm exec vitest run --project backend --sequence.shuffle`; `pnpm exec vitest run --project backend --project extension` with `NGG_HOSTILE_GIT_CONFIG=1` in German; `test:ext` (Insiders nightly via `NGG_VSCODE_VERSION`); `test:ui-harness`; `benchmark:ui`; `package:vsix --out branchwise.vsix`; `test:package branchwise.vsix` |
| `.github/workflows/publish.yml`                                                              | calls `ci.yaml`, then publishes the VSIX CI built                                                                                                                                                                                                                                                                                                                                                             |
| `scripts/test-ui-harness.cjs`                                                                | runs `@vscode/test-cli`'s `bin.mjs` from the repository root with `--grep … --bail`, setting `NGG_ARTIFACTS`, `NGG_VSCODE_VERSION` (`stable` or `minimum`), `NGG_VSCODE_PATH`, `NGG_DIAGNOSTIC_FAULT`; then reads `run.json` and `vscode-logs` from the artifact folder                                                                                                                                       |
| `scripts/package-smoke.cjs` via `scripts/test-package.cjs`                                   | the installed VSIX contains `out/extension.js`, `out/web.min.js`, `out/web.min.css`                                                                                                                                                                                                                                                                                                                           |
| `scripts/benchmark.mjs`                                                                      | imports `esbuild` itself; does not use `esbuild.js`                                                                                                                                                                                                                                                                                                                                                           |
| `src/extension/html.ts`, `src/extension/view-command.ts`                                     | the page loads `out/web.min.css` and `out/web.min.js` (classic `<script>`, not a module) from the extension's `out` folder, which is also the webview's only local resource root                                                                                                                                                                                                                              |
| `tests/extension/webview-page.test.ts`                                                       | expects the page to reference `out/web.min.css` and `out/web.min.js`                                                                                                                                                                                                                                                                                                                                          |
| `tests/webview/styles.test.ts`                                                               | runs `@tailwindcss/postcss` over `src/webview/styles.css` itself, "as `esbuild.js` builds it"                                                                                                                                                                                                                                                                                                                 |
| `tests/webview/globals.test.ts`                                                              | compile-time probes that fail unless `tsc -p tests/webview` sees the DOM but no Node globals                                                                                                                                                                                                                                                                                                                  |
| `tests-ext/**`, `tests-ext/ui/**`                                                            | environment variables and fixture that `.vscode-test.mjs` sets up (section 4)                                                                                                                                                                                                                                                                                                                                 |
| `.vscodeignore`                                                                              | packages `out/` whole (so any file left in it ships), never `node_modules`, sources or configuration                                                                                                                                                                                                                                                                                                          |
| `.gitignore`                                                                                 | ignores `**/out/`, `/.vscode-test/`, `/test-results/`, `*.vsix`; nothing ignores a `coverage/` folder                                                                                                                                                                                                                                                                                                         |
| `.oxlintrc.json`, `oxlint/restriction.config.json`                                           | lint `esbuild.js`, `vitest.config.ts` and `.vscode-test.mjs` like other code; `esbuild.js` alone may use `console`; `.vscode-test.mjs` has `import/named` switched off; `out/**` is not linted                                                                                                                                                                                                                |
| `.oxfmtrc.jsonc`                                                                             | formats all of these files: width 100, two spaces, no trailing commas                                                                                                                                                                                                                                                                                                                                         |
| `docs/testing.md`, `docs/packaging.md`, `docs/performance.md`                                | document `NGG_VSCODE_PATH`, `NGG_HEADLESS`, `NGG_ARTIFACTS`, `NGG_VSCODE_VERSION=minimum`, `NGG_MINIMUM_VSCODE_PATH`, `test-results/`, `vscode-logs/`, `run.json`, and `vitest run --project webview`                                                                                                                                                                                                         |
| `docs/clean-room/shared-types.md` (S.2, S.3), `tests-discovery-extension.md` (1.2, 1.3, 1.4) | state these compiler options, projects and test-runner settings as premises                                                                                                                                                                                                                                                                                                                                   |

### 1.4 Commands that must pass

After the rewrite, each of these must behave as it does today (observed results in brackets):

| Command                                                       | Must                                                                                                                                                         |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm run compile`                                            | exit 0 and leave the six development files of section 2.3 in `out/` [2.1 s, exit 0]                                                                          |
| `node esbuild.js --production`                                | exit 0 and leave the three production files [0.6 s, exit 0]                                                                                                  |
| `pnpm run package`                                            | type-check, lint, then build for production                                                                                                                  |
| `pnpm run watch:esbuild`                                      | keep running, rebuild on change, and print the lines of section 2.5 around every build                                                                       |
| `pnpm run watch:tsc`                                          | keep running; TypeScript 7 prints "Starting compilation in watch mode..." and "Found 0 errors. Watching for file changes.", which `$tsc-watch` recognises    |
| `pnpm run typecheck`                                          | exit 0 across all five projects [5.4 s]                                                                                                                      |
| `pnpm test`                                                   | all three Vitest projects pass [backend 71 files, 622 passed, 1 skipped; extension 64 files, 678 passed; webview 115 files, 113 run, 1970 passed, 2 skipped] |
| `pnpm exec vitest run --project backend --sequence.shuffle`   | pass in any order                                                                                                                                            |
| `pnpm run test:coverage`                                      | pass the menu threshold [functions 100 % (72/72) of `src/webview/lib/menus.tsx`]                                                                             |
| `pnpm run compile-tests`                                      | emit the four `tests-ext` tests as CommonJS with every `@/` rewritten [2.5 s]                                                                                |
| `pnpm run test:ext` (under `xvfb-run -a` on Linux)            | run every `tests-ext` test inside VS Code and pass                                                                                                           |
| `pnpm run test:ui-harness` (under `xvfb-run -a`)              | the injected failure, the recovery and the minimum-version run all verify                                                                                    |
| `pnpm run package:vsix --out branchwise.vsix`                 | produce a VSIX whose `extension/out/` holds the three production files and no source maps                                                                    |
| `pnpm run test:package branchwise.vsix` (under `xvfb-run -a`) | install over an older build and activate                                                                                                                     |
| `pnpm run lint`, `pnpm run format`                            | pass on the rewritten files                                                                                                                                  |
| `pnpm run check:provenance`                                   | pass after `pnpm run provenance --update` lowers the nine entries                                                                                            |

### 1.5 Rules for every file

- **Provenance.** After the rewrite, `pnpm run provenance --update` lowers the nine entries in
  `scripts/provenance-baseline.json`. Many (A) entries are option names and values that any
  correct file must contain (for example a `tsconfig` option and its value), so a faithful rewrite
  will match some old lines word for word. Such lines are reviewed and listed in
  `scripts/provenance-reviewed.json`, as `docs/provenance.md` describes.
- **Lint and format.** The three script files are linted by oxlint with the repository's
  configuration (import groups in order with blank lines between, `node:` prefixes for built-ins,
  braces on every `if`, no `console` except in `esbuild.js`, no unused variables unless prefixed
  with `_`) and formatted by oxfmt.
- **Module systems.** `package.json` has no `"type"` field, so a `.js` file at the root is
  CommonJS when Node runs it. `esbuild.js` is run directly by `node`. Written as CommonJS it runs
  silently; a `.js` file with `import` statements also runs, but only after Node prints a
  `MODULE_TYPELESS_PACKAGE_JSON` warning and parses the file twice (observed on Node 22.22; CI
  uses Node 24, the documented version). The
  scripts that name the file are not being rewritten, so its name must stay.
  `.vscode-test.mjs` is ESM by its extension (and uses top-level `await`). `vitest.config.ts` is
  loaded by Vite, which bundles it; each Vitest run prints a notice that its ESM syntax would not
  load under Vite's future native loader (build Q9).

---

## 2. `esbuild.js`

### 2.1 Role

A Node script, run from the repository root, that produces everything the extension ships in
`out/`: the extension-host bundle and the webview page's script and stylesheet. It is the only
producer of `out/`. It does not type-check (type errors do not stop it; `pnpm run typecheck` is
separate) and it does not clean `out/` (the `clean` script does).

### 2.2 Inputs

- **Arguments.** Two flags, each recognised if it appears anywhere among the arguments; any other
  argument is ignored. They combine freely.
  - `--production`: build for shipping (minified, no source maps).
  - `--watch`: keep running and rebuild on change.
- **Working directory.** Entry points and output paths are relative to the working directory,
  which every consumer sets to the repository root (pnpm runs scripts there; `.vscode/tasks.json`
  runs `pnpm run …` in the workspace folder). Run from any other folder, the build fails at once
  (observed: from `/tmp`, "Could not resolve src/main.ts", exit 1; see 2.6 for the report).
- **Environment.** The script reads no environment variable. One variable reaches the build
  anyway: `@tailwindcss/postcss` optimises its output with Lightning CSS when
  `NODE_ENV=production`. Nothing in the repository sets it, so today's builds are never optimised
  by Tailwind; with it set, the production stylesheet differs (observed: 29 545 bytes instead of
  29 671, different content; build Q3).
- **Sources.** `src/main.ts` and everything it imports; `src/webview/main.tsx` and everything it
  imports, including `src/webview/styles.css`; for the stylesheet, every file Tailwind scans for
  class names (the whole `src/webview/` folder, as `styles.css` asks). The nearest `tsconfig.json`
  of each source file also applies (section 1.2).

### 2.3 Outputs

Two bundles, written into `out/` at the repository root (the folder is created when missing):

| File                   | Development build       | Production build  | Consumer                                             |
| ---------------------- | ----------------------- | ----------------- | ---------------------------------------------------- |
| `out/extension.js`     | readable, 384 099 bytes | minified, 194 263 | `package.json` `main`; VS Code loads it              |
| `out/extension.js.map` | 261 087 bytes           | not written       | debugger (`.vscode/launch.json` `outFiles`)          |
| `out/web.min.js`       | readable, 354 869 bytes | minified, 171 264 | `<script src>` of the page (`src/extension/html.ts`) |
| `out/web.min.js.map`   | 259 555 bytes           | not written       | webview developer tools                              |
| `out/web.min.css`      | readable, 37 759 bytes  | minified, 29 671  | `<link rel="stylesheet">` of the page                |
| `out/web.min.css.map`  | 23 673 bytes            | not written       | webview developer tools                              |

Sizes are those of commit `cd1b5db` and only indicate scale.

**The extension bundle** (`out/extension.js`):

- A single CommonJS file whose exports are the exports of `src/main.ts` (today only `activate`).
  VS Code `require`s it through `main` and calls `activate`.
- Every package it imports from `node_modules` (`simple-git`, `@vscode/l10n` and their
  dependencies such as `debug` and `ms`) is inlined. The VSIX is packaged with
  `--no-dependencies` and `.vscodeignore` ships no `node_modules`, so nothing else is available at
  run time.
- Left as run-time `require` calls: the module `vscode` (provided by the extension host, which is
  why it must never be bundled) and Node's built-in modules, with or without the `node:` prefix.
  Observed in the development bundle: `vscode` (24 call sites), `node:path`, `node:fs/promises`,
  `node:crypto`, `node:fs`, `node:os`, `node:events`, `node:child_process`, `fs`, `fs/promises`,
  `tty`, `util`, `os`, `child_process`. No other bare `require` remains.
- Syntax is lowered to ES2015 (entry X12). Observed consequence: `async` functions become
  generator-based helpers (149 uses of the async helper in the development bundle), and object
  spread and class fields become helper calls. Regular expressions whose flags are newer than
  ES2015 still reach the host as they are written, and run there.

**The webview script** (`out/web.min.js`):

- A classic script: one immediately invoked function with no `import`, `export` or `require`. The
  page loads it with a plain `<script>` element (with a nonce), not as a module, from the
  extension's `out/` folder, which is the webview's only local resource root. Preact and
  `@preact/signals` are inlined.
- JSX in the webview sources compiles to calls of Preact's automatic runtime
  (`preact/jsx-runtime`, bundled), never to `React.createElement`.
- It reads the global `acquireVsCodeApi` that VS Code defines in the page.

**The stylesheet** (`out/web.min.css`):

- Produced because `src/webview/main.tsx` imports `./styles.css`. Its name comes from the
  script's: the bundle's CSS goes next to `web.min.js` with the same base name.
- `styles.css` is written in Tailwind's language (`@import "tailwindcss" source(…)`, `@theme`,
  utility classes named in the components), which esbuild cannot read. So the text esbuild bundles
  for any `.css` file of the webview is not the file itself but PostCSS's output for it, with the
  Tailwind plugin and the file's own path given as its origin. Relative references left in that
  output resolve from the original file's folder. The result is Tailwind's plain CSS (already free
  of CSS nesting; no `&` remains), reformatted or minified by esbuild. The Tailwind licence
  comment is kept in both modes. Today `styles.css` is the only CSS file in the bundle.
- `tests/webview/styles.test.ts` runs the same Tailwind step on `styles.css` and checks its
  layers and tokens, so the build must not add a CSS processing step that changes that output,
  beyond esbuild's own bundling and minifying.

**Source maps** (development only): each output file ends with a comment naming its map, which
sits next to it (`//# sourceMappingURL=extension.js.map`, and the CSS comment form for the
stylesheet). Maps are version 3, list `sources` relative to `out/` (for example `../src/main.ts`
and `../node_modules/.pnpm/…`), and carry **no** `sourcesContent` (observed: 191 sources for the
extension, 109 for the script, 1 for the stylesheet). The production build writes no maps and no
map comments.

**Files left over.** The build writes only its outputs; it never deletes files in `out/`. A
production build after a development build therefore leaves the three old `.map` files in `out/`,
no longer referenced (observed after `pnpm run test:ui-harness`, which builds for production
without cleaning). `vscode:prepublish` cleans first, so a VSIX never contains them (observed: the
packaged `extension/out/` held exactly `extension.js`, `web.min.css` and `web.min.js`), but the
`.vscodeignore` rule would ship anything left in `out/` (build Q4).

### 2.4 Resolving `@/`

Both bundles import project modules as `@/<path>`, which must resolve to `<repository>/src/<path>`
with the usual extension and index-file lookup. The mapping is fixed relative to the repository,
not to the working directory.

Today the script resolves `@/` itself. Observed: with that resolver removed, both bundles are
byte-identical, because esbuild applies the `paths` of `tsconfig.base.json` (inherited through the
nearest `tsconfig.json`) on its own. The requirement is the mapping, not the mechanism. One
combination is **not** equivalent: with the script's own resolver kept but the explicit JSX
options of X18 removed, esbuild compiled the JSX of the modules reached through that resolver
with the classic `React.createElement` transform (227 call sites in at least 10 modules), which
fails in the page, while modules reached by relative imports still used Preact's runtime. Without
the resolver and without the explicit JSX options, the output was identical to today's. Whatever
the implementer chooses, the webview script must contain no `React.createElement` (build Q2).

### 2.5 Console output and the VS Code problem matcher

`.vscode/tasks.json` attaches the problem matcher `$esbuild-watch` to the background task
`watch:esbuild` and to the default build task `compile`. It is contributed by the recommended
extension `connor4312.esbuild-problem-matchers`, whose published definition is:

- a background task becomes busy on a line matching `\[watch\] build started` and idle on a line
  matching `\[watch\] build finished`; it is considered busy from the start;
- a problem is a line matching `^[✘▲] \[([A-Z]+)\] (.+)` (severity word, message) followed by a
  line matching `^(?:\t| {4})(?!\s)([^:]+)(?::([0-9]+))?(?::([0-9]+))?:$` (file, line, column);
  file paths are relative to the workspace folder.

So the build prints, for **every build of every bundle, in every mode**:

1. `[watch] build started` on standard output when the build starts;
2. for each error, on standard error, the two lines `✘ [ERROR] <message>` and four spaces
   followed by `<file>:<line>:<column>:`, where the file is relative to the repository root;
3. `[watch] build finished` on standard output when the build ends, successful or not.

The two marker lines and the two error lines are dictated by the matcher's patterns, character
for character. esbuild's own log output is switched off, so nothing else is printed for a
successful build. Warnings are not reported at all (the current sources produce none; observed
with esbuild's warnings switched on in a scratch copy). The line and column are esbuild's (line
counted from 1, column from 0; build Q14).

What VS Code needs from this:

- **Watch task.** "Run Extension" does not use it (it runs `compile`), but developers start the
  `watch` task, which depends on `watch:esbuild` and `watch:tsc`. VS Code treats a background task
  as ready once its matcher sees the end line, and lists the problems reported between the start
  and end lines.
- **Build task.** `compile` is not a background task; the matcher only collects the problems from
  its output.

Observed output of a successful development build:

```text
$ pnpm run compile
$ pnpm run clean && node esbuild.js
$ node -e "require('fs').rmSync('out',{recursive:true,force:true})"
[watch] build started
[watch] build finished
[watch] build started
[watch] build finished
```

`node esbuild.js --production` prints the same four build lines.

### 2.6 Order, failure and exit status (one-shot builds)

- Without `--watch`, the extension bundle is built completely first, then the webview bundle; each
  prints its own start and finish lines, so a success prints exactly the four lines above. The
  process then exits 0; it must not linger, so the builds release their resources before the
  script ends.
- **Any error ends the run with exit status 1**, after the error lines and the finish line of the
  failing bundle. The error is then printed again on standard error as esbuild's failure object
  (an `Error: Build failed with N error(s):` message, one line per error in esbuild's
  `file:line:column: ERROR: message` form, and a stack trace).
- If the extension bundle fails, the webview bundle is not attempted. If the webview bundle fails,
  the extension bundle has already been written. Nothing is written for a bundle that fails.

Observed failures (paths relative to the repository root unless shown otherwise):

```text
# a syntax error appended to src/webview/lib/shell-text.ts as its line 8
stdout: [watch] build started
        [watch] build finished
        [watch] build started
        [watch] build finished
stderr: ✘ [ERROR] Unexpected ";"
            src/webview/lib/shell-text.ts:8:23:
        Error: Build failed with 1 error:
        src/webview/lib/shell-text.ts:8:23: ERROR: Unexpected ";"
        … stack trace …
exit 1; out/ holds extension.js and extension.js.map only

# an import of the missing module "@/extension/does-not-exist" in src/extension/constants.ts
stdout: [watch] build started
        [watch] build finished
stderr: ✘ [ERROR] Could not resolve "<repository>/src/extension/does-not-exist"
            src/extension/constants.ts:2:24:
        Error: Build failed with 1 error:
        src/extension/constants.ts:2:24: ERROR: [plugin: <the build's resolver>] Could not resolve "<repository>/src/extension/does-not-exist"
        … stack trace …
exit 1; out/ not created (compile had removed it)
```

Two failures are reported badly today; a rewrite may keep or improve them (build Q1, build Q5):

- **An error without a location** (for example a missing entry point, or running from another
  folder) makes the reporter fail while printing it. esbuild then adds a second error naming the
  reporter, and the finish line is never printed:

  ```text
  stdout: [watch] build started
  stderr: ✘ [ERROR] Could not resolve "src/main.ts"
          Error: Build failed with 2 errors:
          error: Could not resolve "src/main.ts"
          <repository>/esbuild.js:<line>:<column>: ERROR: [plugin: <the reporter>] <a TypeError from reading the missing location>
          … stack trace …
  exit 1
  ```

  In watch mode this would leave the VS Code task busy for good. Minimum requirement for the
  rewrite: an error without a file still prints its `✘ [ERROR]` line, and the finish line always
  follows.

- **A stylesheet rejected by Tailwind** (observed with an `@apply` of an unknown utility): Tailwind
  prints its own stack trace on standard error first, then the reporter prints
  `✘ [ERROR] tailwindcss: <absolute path>/src/webview/styles.css:1:1: Cannot apply unknown utility class …`
  with a location line pointing into PostCSS's own source under `node_modules/.pnpm/postcss@…/`,
  not at the stylesheet. Exit 1; the extension bundle had been written.

### 2.7 Watch mode

- With `--watch`, both bundles start at once and then watch their inputs; the process never exits
  on its own and exits on `SIGINT` or `SIGTERM` (observed). Because both builds run concurrently,
  the first round prints two start lines and then two finish lines (build Q7). A later change
  rebuilds only the bundle(s) whose inputs changed; each rebuild prints its own start line, its
  errors and its finish line.
- A failing build does not stop watching, and the next change that fixes it rebuilds
  successfully. This holds for the very first round too: started with a syntax error in a webview
  module, the process kept running, wrote the extension bundle, and wrote the webview files once
  the error was fixed.
- Observed: while a webview rebuild was failing, its previous `web.min.*` files were absent from
  `out/`; they reappeared with the next successful rebuild. This is esbuild's own handling of a
  failed rebuild, not something the script does.
- **Stylesheet freshness.** The stylesheet depends on class names written anywhere under
  `src/webview/`, not only in modules the page imports. Every file Tailwind reports having read,
  and every folder it reports scanning (observed: 93 files and 7 folders), must be watched, so
  that each of these rebuilds the stylesheet with the new class (all observed):
  - a class added to a component the page imports;
  - a new file containing a class in a scanned folder, even one nothing imports (a `.json` file
    in `src/webview/lib/`);
  - a new file in a new sub-folder of a scanned folder (a `.ts` file in a new folder under
    `src/webview/lib/`);
  - an edit to such an unimported file.
- Development settings apply unless `--production` is also given.

Observed transcript, in the scratch copy (start, then an edit that breaks a webview module, then
the fix):

```text
[watch] build started
[watch] build started
[watch] build finished
[watch] build finished
[watch] build started
✘ [ERROR] Unexpected ";"
    src/webview/lib/shell-text.ts:8:23:
[watch] build finished
[watch] build started
[watch] build finished
```

### 2.8 Entries

"X" numbers are used only by this document.

| #   | Entry                            | Class | Exact value (A), requirement (B), or effect of removal (C)                                                                                                                                                    | Consumers                                                                            |
| --- | -------------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| X1  | File name and place              | A     | `esbuild.js` at the repository root, run as `node esbuild.js …`                                                                                                                                               | `package.json` scripts; the oxlint override allowing `console` names this path       |
| X2  | Module form of the script        | B     | Runs under `node` in a package without `"type"`, on Node 22 and 24, without warnings (1.5).                                                                                                                   | —                                                                                    |
| X3  | Flag `--production`              | A     | `--production`, anywhere among the arguments                                                                                                                                                                  | `package`, `benchmark:ui`, `test:ui-harness`                                         |
| X4  | Flag `--watch`                   | A     | `--watch`, anywhere among the arguments                                                                                                                                                                       | `watch:esbuild`                                                                      |
| X5  | Both bundles in each run         | A     | Every invocation builds the extension bundle and the webview bundle.                                                                                                                                          | every script above                                                                   |
| X6  | Extension entry point            | A     | `src/main.ts`                                                                                                                                                                                                 | —                                                                                    |
| X7  | Extension output                 | A     | `out/extension.js`                                                                                                                                                                                            | `package.json` `main`; `scripts/package-smoke.cjs`                                   |
| X8  | Extension dependencies inlined   | A     | Everything bundled except X10's modules                                                                                                                                                                       | `.vscodeignore`; `vsce --no-dependencies`                                            |
| X9  | Extension module format          | A     | CommonJS (esbuild format `cjs`), exporting what `src/main.ts` exports                                                                                                                                         | VS Code extension host                                                               |
| X10 | Extension platform and externals | A     | Node platform (built-ins stay `require` calls; Node resolution conditions); `vscode` external                                                                                                                 | extension host                                                                       |
| X11 | Webview entry point              | A     | `src/webview/main.tsx`                                                                                                                                                                                        | —                                                                                    |
| X12 | Extension language level         | B     | Output runs in the extension host of every supported VS Code (minimum 1.125.0; observed Node 24.15.0 there and 24.20.0 in 1.139.1). Today ES2015; any level that Node runs meets it (build Q6).               | —                                                                                    |
| X13 | Webview script output            | A     | `out/web.min.js`                                                                                                                                                                                              | `src/extension/html.ts`; `tests/extension/webview-page.test.ts`; `package-smoke.cjs` |
| X14 | Stylesheet output                | A     | `out/web.min.css`, next to the script with the same base name                                                                                                                                                 | as X13                                                                               |
| X15 | Webview dependencies inlined     | A     | Everything bundled, no externals                                                                                                                                                                              | the page has no module loader                                                        |
| X16 | Webview script form              | A     | A classic script (esbuild format `iife`): no `import` or `export`, runs when loaded                                                                                                                           | the `<script>` element of `src/extension/html.ts`                                    |
| X17 | Webview language level           | B     | Output runs in the webview of every supported VS Code. Today ES2020; it must not exceed what the Chromium of VS Code 1.125 runs.                                                                              | —                                                                                    |
| X18 | Webview JSX                      | A     | Automatic runtime with import source `preact` (2.3, 2.4)                                                                                                                                                      | Preact components under `src/webview/`                                               |
| X19 | Tailwind step for stylesheets    | A     | Every `.css` file of the webview bundle goes through PostCSS with `@tailwindcss/postcss` at its default options before bundling, with its own path as origin and its folder for resolving what remains (2.3). | `src/webview/styles.css`; `tests/webview/styles.test.ts`                             |
| X20 | Tailwind inputs watched          | B     | In watch mode, every file and folder that Tailwind reports is watched (2.7).                                                                                                                                  | `watch:esbuild`                                                                      |
| X21 | `@/` mapping                     | A     | `@/<path>` resolves to `<repository>/src/<path>` in both bundles (2.4)                                                                                                                                        | every source module                                                                  |
| X22 | The script's own `@/` resolver   | C     | Removing it leaves both bundles byte-identical, as long as `tsconfig.base.json` keeps its `paths` and the JSX of X18 is still set, in the build options or through `src/webview/tsconfig.json` (2.4).         | —                                                                                    |
| X23 | Minification                     | B     | On with `--production`, off otherwise: readable development output, smaller VSIX.                                                                                                                             | VSIX size                                                                            |
| X24 | Source maps                      | B     | Without `--production`: a separate map for each output, linked by a comment, sources relative to `out/`. With it: none (2.3).                                                                                 | `launch.json` `outFiles`; debugging                                                  |
| X25 | Sources not embedded in maps     | B     | Maps point at the files on disk rather than carrying their text: smaller maps; the debugger reads the sources from the repository.                                                                            | —                                                                                    |
| X26 | esbuild's own log                | B     | Off, so that only the lines of 2.5 appear.                                                                                                                                                                    | problem matcher                                                                      |
| X27 | Start and finish lines           | A     | `[watch] build started` and `[watch] build finished` on standard output, around every build of each bundle, in every mode                                                                                     | `$esbuild-watch` (2.5)                                                               |
| X28 | Error lines                      | A     | `✘ [ERROR] <message>`, then four spaces and `<file>:<line>:<column>:` with the file relative to the repository root, on standard error, before the finish line                                                | `$esbuild-watch`                                                                     |
| X29 | One-shot sequence                | B     | Extension first, then webview; stop at the first failing bundle; release build resources so that the process ends (2.6).                                                                                      | `compile`, `package`                                                                 |
| X30 | Watch sequence                   | B     | Both bundles watched concurrently; failures keep watching (2.7).                                                                                                                                              | `watch:esbuild`                                                                      |
| X31 | Failure exit                     | B     | Any failure prints the error and ends with a non-zero status, today 1 (2.6).                                                                                                                                  | `compile`, `package`, `test:ext`, CI                                                 |
| X32 | Comments                         | B     | Explain what is not obvious: why the Tailwind step exists and why its inputs are watched.                                                                                                                     | —                                                                                    |

Counts for `esbuild.js`: **(A) 19, (B) 12, (C) 1**; 32 entries.

---

## 3. `vitest.config.ts`

### 3.1 Role and how it is loaded

Vitest finds this file by name in the working directory (the repository root). Vite bundles it
before running it, which is why the file may use both `import` syntax and the CommonJS
`__dirname` today; each run prints a notice that this combination would not load under Vite's
planned native configuration loader (observed in every run; build Q9). The root TypeScript
project type-checks the file (it is listed in `tsconfig.json`'s `include`).

It defines three **projects**. Every consumer selects them by name: `pnpm test` runs
`vitest run --project backend`, then `--project extension`, then `--project webview`, each a
separate process; CI adds `--project backend --sequence.shuffle` and
`--project backend --project extension` (with `NGG_HOSTILE_GIT_CONFIG=1`); `test:coverage` runs
`--project webview --coverage`; `docs/performance.md` runs single webview files with
`--project webview`.

### 3.2 What the tests rely on without the file saying so

These are Vitest defaults. The rewrite must not change them, whether by setting them or by leaving
them out:

- **No globals.** Every test file imports `describe`, `it`, `expect`, `vi` and the hooks from
  `vitest` (260 files do).
- **Default environment `node`.** 91 of the 115 webview test files choose `jsdom` themselves with
  a per-file environment comment; the others, and every backend and extension test, run in Node.
- **Per-file isolation** and the default pool, so that the setup files run once per test file and
  module state does not leak between files.
- **Default timeouts** (5 000 ms per test and hook) for the `extension` and `webview` projects.
- **JSX.** Nothing about JSX is configured here. Vite compiles the `.tsx` modules under
  `src/webview/` with the JSX settings of `src/webview/tsconfig.json` (Preact's automatic
  runtime). Observed: with `jsxImportSource` removed from that file, a component test failed with
  "Failed to resolve import `react/jsx-dev-runtime`". A rewrite that configures JSX here instead
  must produce the same result.

### 3.3 Behaviour

- **Aliases, all projects.** A specifier that starts with `@/` resolves to the same path under
  `<repository>/src/`, and one that starts with `@tests/` to the same path under
  `<repository>/tests/`. The targets are absolute paths computed from the configuration file's own
  folder, so they do not depend on the working directory and work on Windows, macOS and Linux (CI
  runs `pnpm test` on all three). Tests use these aliases instead of `../` imports, which the lint
  configuration forbids.
- **`backend` project.** Collects `tests/backend/**/*.test.ts`. Runs `tests/git-config.ts` before
  each test file: it points `GIT_CONFIG_GLOBAL` at `tests/fixtures/gitconfig` (or at
  `tests/fixtures/hostile.gitconfig` when `NGG_HOSTILE_GIT_CONFIG=1`) and sets
  `GIT_CONFIG_NOSYSTEM=1`, so every Git process ignores the developer's configuration. Allows
  30 000 ms per test and per hook, because these tests start real Git processes, which take much
  longer to launch on Windows runners.
- **`extension` project.** Collects `tests/extension/**/*.test.ts`, with the same setup file. In
  addition to the two aliases, the bare module name `vscode` resolves to
  `tests/extension/__mocks__/vscode.ts` (the shared stand-in; see
  `tests-discovery-extension.md` section 2), so product modules that import `vscode` load the
  stand-in. Default timeouts.
- **`webview` project.** Collects `tests/webview/**/*.test.ts`. Runs `tests/webview/setup.ts`
  before each test file (it installs the stand-in for `acquireVsCodeApi`). Default timeouts.
- **Coverage.** Applies only when `--coverage` is given (only `test:coverage` does, on the
  `webview` project). Uses the V8 provider (`@vitest/coverage-v8` is the installed provider).
  Measures exactly one file, `src/webview/lib/menus.tsx`, and fails the run unless at least 80 %
  of that file's functions ran. Prints a text table and summary to the terminal and writes no
  report files (nothing in `.gitignore` covers a `coverage/` folder, and none was created).

Observed coverage output: the full `webview` project reports functions 100 % (72/72), statements
119/119, branches 31/31, lines 110/110, exit 0. Restricted to one unrelated test file
(`tests/webview/utils/format.test.ts`), the run printed a table with `menus.tsx` at 0 % and ended
with `ERROR: Coverage for functions (0%) does not meet "src/webview/lib/menus.tsx" threshold (80%)`,
exit 1.

### 3.4 Entries

| #   | Entry                                            | Class | Exact value (A) or requirement (B)                                                                                      | Consumers                                                  |
| --- | ------------------------------------------------ | ----- | ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| V1  | File name and place                              | A     | `vitest.config.ts` at the repository root                                                                               | Vitest; `tsconfig.json` `include`                          |
| V2  | The configuration is the module's default export | A     | default export                                                                                                          | Vitest                                                     |
| V3  | Alias `@/`                                       | A     | `@/<path>` → `<repository>/src/<path>`, in all three projects                                                           | every test file                                            |
| V4  | Alias `@tests/`                                  | A     | `@tests/<path>` → `<repository>/tests/<path>`, in all three projects                                                    | 67 backend files, extension and webview files              |
| V5  | How alias targets are computed                   | B     | Absolute, from the configuration file's folder; independent of the working directory and of the operating system (3.3). | CI on three systems                                        |
| V6  | Coverage provider                                | A     | `v8`                                                                                                                    | the installed `@vitest/coverage-v8`                        |
| V7  | Coverage scope                                   | A     | only `src/webview/lib/menus.tsx`                                                                                        | CI step "Check menu coverage"                              |
| V8  | Coverage threshold                               | A     | functions ≥ 80 % for `src/webview/lib/menus.tsx`; below it the run fails                                                | CI step "Check menu coverage"                              |
| V9  | Coverage report                                  | B     | Results printed to the terminal; no report files written into the repository (3.3).                                     | CI log                                                     |
| V10 | Comment on where coverage is measured            | B     | Point to the command and the CI job that enforce the threshold.                                                         | —                                                          |
| V11 | Project `backend`: name                          | A     | `backend`                                                                                                               | `test`, CI shuffle and hostile-configuration steps         |
| V12 | Project `backend`: files                         | A     | `tests/backend/**/*.test.ts`                                                                                            | —                                                          |
| V13 | Project `backend`: setup file                    | A     | `tests/git-config.ts`                                                                                                   | CI hostile-configuration step                              |
| V14 | Project `backend`: test timeout                  | B     | Long enough for real Git processes on the slowest CI system; today 30 000 ms.                                           | Windows CI                                                 |
| V15 | Project `backend`: hook timeout                  | B     | Same as V14, for set-up and tear-down hooks that build repositories; today 30 000 ms.                                   | Windows CI                                                 |
| V16 | Comment on the timeouts                          | B     | Explain why this project's limits differ from the default (3.3).                                                        | —                                                          |
| V17 | Project `extension`: name                        | A     | `extension`                                                                                                             | `test`, CI hostile-configuration step                      |
| V18 | Project `extension`: files                       | A     | `tests/extension/**/*.test.ts`                                                                                          | —                                                          |
| V19 | Project `extension`: setup file                  | A     | `tests/git-config.ts`                                                                                                   | CI hostile-configuration step                              |
| V20 | Project `extension`: `vscode` alias              | A     | the bare specifier `vscode` → `<repository>/tests/extension/__mocks__/vscode.ts`, in this project only                  | the extension test files and the product modules they load |
| V21 | Project `webview`: name                          | A     | `webview`                                                                                                               | `test`, `test:coverage`, `docs/performance.md`             |
| V22 | Project `webview`: files                         | A     | `tests/webview/**/*.test.ts`                                                                                            | —                                                          |
| V23 | Project `webview`: setup file                    | A     | `tests/webview/setup.ts`                                                                                                | 43 webview test files import its export                    |

Counts for `vitest.config.ts`: **(A) 17, (B) 6, (C) 0**; 23 entries.

Not configured and so not entries: globals, environment, pool, isolation, reporters, the other
projects' timeouts, JSX (3.2).

---

## 4. `.vscode-test.mjs`

### 4.1 Role and how it is loaded

`@vscode/test-cli` (the `vscode-test` command, run by `test:ext`, by `scripts/test-ui-harness.cjs`
through the package's `bin.mjs`, and by developers with `--grep … --bail`) loads this file from
the working directory, the repository root. The file's folder is also the extension development
path, so VS Code loads the extension from `package.json` and `out/extension.js` there. The file is
an ES module (by its extension); it runs set-up work while it loads, before it hands the
configuration to the runner, so every invocation gets fresh state.

`tests-discovery-extension.md` section 1.3 describes the resulting test environment from the
tests' side; this section specifies the file.

### 4.2 Inputs

| Input                                 | Effect                                                                                                                                                                                                                   |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `package.json` `engines.vscode`       | Must have the form `^X.Y.Z`; `X.Y.Z` is the **minimum version** (today `1.125.0`). Any other form makes loading fail with an error that names the value and says the minimum-version rule needs updating.                |
| `package.json` `publisher` and `name` | Form the extension identifier `<publisher>.<name>` (today `jcfurey.branchwise`).                                                                                                                                         |
| `NGG_VSCODE_VERSION`                  | Unset or empty: `stable`. `minimum`: the minimum version. Anything else (`insiders`, an exact version) is passed on unchanged. The result is the version the runner downloads and the version the tests expect.          |
| `NGG_VSCODE_PATH`                     | When set and **non-empty**, the runner uses that VS Code executable instead of downloading one. `scripts/test-ui-harness.cjs` passes an empty string to mean "not set", so an empty value must behave like an unset one. |
| `NGG_ARTIFACTS`                       | Folder for artefacts; relative values resolve against the working directory; default `test-results`. Passed on as an absolute path.                                                                                      |
| `NGG_HEADLESS`                        | `1` adds the launch argument `--ozone-platform=headless` (Linux without a display). Any other value adds nothing.                                                                                                        |
| The rest of the environment           | Inherited by VS Code and the extension host. The UI tests read `NGG_VSCODE_PATH`, `NGG_DIAGNOSTIC_FAULT`, `NGG_BENCH_*` from it directly.                                                                                |

### 4.3 Set-up performed while loading

1. **A run folder**: a new, uniquely named folder in the system's temporary folder, except on
   macOS where it is created directly in `/tmp`: the macOS temporary folder is so deeply nested
   that VS Code's IPC socket paths inside the profile would exceed the 103-byte limit. The path
   used is the real path (symbolic links resolved). Today's names start with
   `ngg-extension-tests-`.
2. **The workspace**: `<run folder>/workspace`, created as an empty Git repository whose initial
   branch is `main`, with no commits. It is the only folder of the test window.
3. **The log folder**: `<artefacts>/vscode-logs/<run folder's name>`, created before launch. VS Code
   writes its logs there directly, so they survive even an early failure, and
   `scripts/test-ui-harness.cjs` looks for `exthost.log` and the extension's output under it.
4. **The user profile**: `<run folder>/user-data/User/settings.json` containing exactly one
   setting, `"neo-git-graph.showUncommittedChanges": true`. It gives activation a setting in the
   section the extension used before it was renamed, so that `tests-ext/extension.test.ts` can
   check the migration to `branchwise.…`. `true` is the setting's declared default, so migrating
   it changes nothing any other test observes.
5. **A free local port** for the Chrome DevTools Protocol, found by asking the system for any free
   TCP port on `127.0.0.1` and releasing it again. The same number goes to VS Code's
   `--remote-debugging-port` and to `NGG_CDP_PORT`, through which the UI tests drive the window
   (build Q15).
6. **Clean-up**: when the runner process exits, the run folder is deleted recursively, tolerating
   files that are briefly locked (a few retries). The artefact folder is kept.

### 4.4 The configuration handed to the runner

- **Test files**: `tests-ext/out/**/*.test.js` (what `compile-tests` emits) and
  `tests-ext/ui/**/*.test.cjs` (the UI harness, not compiled), relative to the repository root.
- **Workspace folder**: the workspace of 4.3.
- **Version**: as resolved in 4.2; with `NGG_VSCODE_PATH` set, that installation instead.
- **Environment added for the extension host** (on top of the inherited one):

  | Variable                      | Value                                                  | Read by                                          |
  | ----------------------------- | ------------------------------------------------------ | ------------------------------------------------ |
  | `GIT_CONFIG_GLOBAL`           | absolute path of `tests/fixtures/gitconfig`            | every Git process started inside VS Code         |
  | `GIT_CONFIG_NOSYSTEM`         | `1`                                                    | Git                                              |
  | `NGG_CDP_PORT`                | the port of 4.3 step 5, as a string                    | `tests-ext/ui/history.test.cjs`                  |
  | `NGG_ARTIFACTS`               | absolute artefact folder                               | UI tests, diagnostics                            |
  | `NGG_VSCODE_LOGS`             | the log folder of 4.3 step 3                           | `run.json`, then `scripts/test-ui-harness.cjs`   |
  | `NGG_MINIMUM_VSCODE_VERSION`  | the minimum version                                    | UI compatibility check, `run.json`               |
  | `NGG_EXPECTED_VSCODE_VERSION` | the resolved version (`stable`, `insiders` or `X.Y.Z`) | UI compatibility check (exact versions asserted) |
  | `NGG_EXTENSION_ID`            | `<publisher>.<name>`                                   | `tests-ext/extension.test.ts`, UI tests          |

- **Launch arguments**, in any order:

  | Argument                                   | Why                                                                                                        |
  | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
  | `--disable-gpu`                            | stable rendering under Xvfb, headless Linux and CI virtual machines                                        |
  | `--skip-welcome`, `--skip-release-notes`   | no welcome or release-notes editor opens, so tab, focus and screenshot checks see only what the tests open |
  | `--disable-workspace-trust`                | the manifest does not support untrusted workspaces; the extension must activate without a trust prompt     |
  | `--locale=en`                              | tests assert English text                                                                                  |
  | `--user-data-dir=<run folder>/user-data`   | the profile of 4.3 step 4, never the developer's                                                           |
  | `--extensions-dir=<run folder>/extensions` | no other extensions load                                                                                   |
  | `--logsPath=<log folder>`                  | logs land in the artefact folder (4.3 step 3)                                                              |
  | `--remote-debugging-port=<port>`           | the UI tests connect to it (4.3 step 5)                                                                    |
  | `--ozone-platform=headless`                | only when `NGG_HEADLESS=1`                                                                                 |

- **Mocha**: 30 000 ms per test and hook. The runner's own defaults apply otherwise (the `tdd`
  interface: `suite`, `test`, `suiteSetup`, `setup`, `teardown`, `suiteTeardown`).

Observed with `NGG_VSCODE_PATH` set to a cached VS Code 1.139.1 and `NGG_ARTIFACTS` under `/tmp`,
under `xvfb-run -a`: `pnpm run test:ext` ran 44 tests in about two minutes, all passing, suites
in the order history documents, history document URIs, Git actions, extension, workflow UI. The
artefact folder held `run.json` (`vscode` 1.139.1, `minimum` 1.125.0, `requested` `stable`,
`extension` `jcfurey.branchwise`, Node 24.20.0 in the extension host, `logs` under
`vscode-logs/ngg-extension-tests-…`), `compatibility-smoke.json`, the screenshots and the logs.
`pnpm run test:ui-harness` (stable 1.139.1, and minimum 1.125.0 through
`NGG_MINIMUM_VSCODE_PATH`) verified the injected failure, the recovery and the minimum run; the
minimum run's extension host ran Node 24.15.0.

### 4.5 Entries

| #   | Entry                                   | Class | Exact value (A) or requirement (B)                                                                                           | Consumers                                         |
| --- | --------------------------------------- | ----- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| T1  | File name and place                     | A     | `.vscode-test.mjs` at the repository root, an ES module                                                                      | `vscode-test`; `.oxlintrc.json` override names it |
| T2  | One configuration as the default export | A     | default export                                                                                                               | `@vscode/test-cli`                                |
| T3  | Minimum version                         | A     | `X.Y.Z` taken from `engines.vscode` of the form `^X.Y.Z`                                                                     | harness, UI compatibility check                   |
| T4  | Unexpected `engines.vscode` form        | B     | Loading fails with a message naming the value (4.2).                                                                         | —                                                 |
| T5  | `NGG_VSCODE_VERSION`                    | A     | unset or empty → `stable`; `minimum` → the minimum; otherwise as given                                                       | CI (Insiders), harness, `docs/testing.md`         |
| T6  | `NGG_ARTIFACTS`                         | A     | default `test-results`, resolved to an absolute path                                                                         | harness, CI artefact upload, `docs/testing.md`    |
| T7  | Run folder                              | B     | Fresh per invocation, real path, `/tmp` on macOS (4.3 step 1).                                                               | —                                                 |
| T8  | Run folder removed on exit              | B     | Deleted when the runner exits, tolerating brief locks (4.3 step 6).                                                          | —                                                 |
| T9  | Workspace                               | A     | `<run folder>/workspace`: empty repository, initial branch `main`, no commits                                                | `tests-ext` files                                 |
| T10 | Log folder                              | A     | `<artefacts>/vscode-logs/<run folder's name>`, created before launch                                                         | harness, `docs/testing.md`                        |
| T11 | Legacy user setting                     | A     | `<run folder>/user-data/User/settings.json` = `{"neo-git-graph.showUncommittedChanges": true}`                               | `tests-ext/extension.test.ts`                     |
| T12 | How the port is found                   | B     | A free TCP port on `127.0.0.1`, per run (4.3 step 5).                                                                        | —                                                 |
| T13 | Same port for VS Code and the tests     | A     | `--remote-debugging-port=<p>` and `NGG_CDP_PORT=<p>`                                                                         | UI tests                                          |
| T14 | Test file globs                         | A     | `tests-ext/out/**/*.test.js`, `tests-ext/ui/**/*.test.cjs`                                                                   | `compile-tests` output; UI harness                |
| T15 | Workspace folder setting                | A     | T9's folder                                                                                                                  | —                                                 |
| T16 | Version setting                         | A     | T5's result                                                                                                                  | —                                                 |
| T17 | Installation override                   | A     | `NGG_VSCODE_PATH`, when non-empty, as the executable to use                                                                  | harness, `docs/testing.md`, `docs/performance.md` |
| T18 | `GIT_CONFIG_GLOBAL`                     | A     | absolute path of `tests/fixtures/gitconfig`                                                                                  | Git inside VS Code                                |
| T19 | `GIT_CONFIG_NOSYSTEM`                   | A     | `1`                                                                                                                          | Git inside VS Code                                |
| T20 | `NGG_CDP_PORT`                          | A     | T13's port, as a string                                                                                                      | UI tests                                          |
| T21 | `NGG_ARTIFACTS` for the host            | A     | T6's absolute folder                                                                                                         | UI tests                                          |
| T22 | `NGG_VSCODE_LOGS`                       | A     | T10's folder                                                                                                                 | UI tests (`run.json`), harness                    |
| T23 | `NGG_MINIMUM_VSCODE_VERSION`            | A     | T3's version                                                                                                                 | UI tests                                          |
| T24 | `NGG_EXPECTED_VSCODE_VERSION`           | A     | T5's result                                                                                                                  | UI tests                                          |
| T25 | `NGG_EXTENSION_ID`                      | A     | `<publisher>.<name>` from `package.json`                                                                                     | `tests-ext/extension.test.ts`, UI tests           |
| T26 | `--disable-gpu`                         | B     | Rendering must be reliable without a GPU (4.4).                                                                              | CI, Xvfb                                          |
| T27 | `--skip-welcome`                        | B     | No welcome editor at start (4.4).                                                                                            | tab and screenshot checks                         |
| T28 | `--skip-release-notes`                  | B     | No release-notes editor at start (4.4).                                                                                      | tab and screenshot checks                         |
| T29 | `--disable-workspace-trust`             | A     | `--disable-workspace-trust`                                                                                                  | manifest `untrustedWorkspaces.supported: false`   |
| T30 | `--locale=en`                           | A     | `--locale=en`                                                                                                                | English assertions                                |
| T31 | `--user-data-dir`                       | A     | `<run folder>/user-data`                                                                                                     | T11                                               |
| T32 | `--extensions-dir`                      | B     | An empty extensions folder of the run's own, so no installed extension interferes.                                           | —                                                 |
| T33 | `--logsPath`                            | A     | T10's folder                                                                                                                 | harness                                           |
| T34 | `--remote-debugging-port`               | A     | T13's port                                                                                                                   | UI tests                                          |
| T35 | `--ozone-platform=headless`             | A     | added exactly when `NGG_HEADLESS=1`                                                                                          | `docs/testing.md`, `docs/packaging.md`            |
| T36 | Mocha timeout                           | B     | Room for slow VS Code start-up and UI steps on CI; today 30 000 ms per test and hook.                                        | —                                                 |
| T37 | Comments                                | B     | Explain whatever a reader could not infer: at least the macOS folder choice and which test relies on the pre-rename setting. | —                                                 |

Counts for `.vscode-test.mjs`: **(A) 27, (B) 10, (C) 0**; 37 entries.

---

## 5. `tsconfig.base.json`

### 5.1 Role

The compiler options every TypeScript project shares. It lists no files and is never compiled on
its own. `tsconfig.json` and `src/webview/tsconfig.json` extend it by that file name, and the
three test projects inherit it through them. esbuild and Vite read it too, through the nearest
`tsconfig.json` of each source file (section 1.2): its `paths` would resolve `@/` for esbuild if
the build did not resolve it itself (entry X22), and its other options had no effect on the
bundles (observed: bundles byte-identical with `target` removed or set to `es2020`, and with
`verbatimModuleSyntax` removed).

With TypeScript 7.0.2, several options equal the compiler's defaults. The observations below
separate what each option changes from what the default already gives (build Q12). "The five
projects" means the five `tsc` runs of `pnpm run typecheck`.

### 5.2 Entries

| #   | Entry                          | Class | Exact value (A), requirement (B), or effect of removal (C)                                                                                                                                                                                                                                          | Observed                                                                                                                                                                  |
| --- | ------------------------------ | ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B1  | File name and place            | A     | `tsconfig.base.json` at the repository root                                                                                                                                                                                                                                                         | extended by name by `tsconfig.json` and `src/webview/tsconfig.json`                                                                                                       |
| B2  | `module`                       | A     | `esnext`: sources are ES modules and may use `import.meta` and top-level `await`                                                                                                                                                                                                                    | removed: identical results (TypeScript 7's default); `preserve` also passes                                                                                               |
| B3  | `moduleResolution`             | A     | `bundler`: extensionless relative imports and package `exports`, as esbuild and Vite resolve them                                                                                                                                                                                                   | removed (with or without B2): identical results. `tests-ext` must replace it (section 9)                                                                                  |
| B4  | `target`                       | B     | Accept the syntax the sources and tests use: at least ES2020 (a BigInt literal in `tests/extension/config-settings.test.ts` needs ES2020; the `s` flag of regular expressions in `src/backend/actions/remotes.ts` and `src/backend/queries/commitDetails.ts` needs ES2018). Today the newest level. | `es2015`/`es2017`: TS1501 ×2 and TS2737; `es2018`, `es2019`: TS2737; `es2020` and removed: pass                                                                           |
| B5  | `lib`                          | B     | The extension-side projects see the ECMAScript library of at least ES2024 and **no DOM**, so extension code cannot use browser globals. (The webview project replaces this list with its own.) Today the newest level.                                                                              | `es2023`: TS2550 (`Promise.withResolvers`); `es2022`: `findLast`, `toSorted`; removed: passes but the root project then accepts `document` (probe)                        |
| B6  | `types`                        | C     | Removing it changes nothing: TypeScript 7 includes no `@types` package unless asked. `tests/webview/globals.test.ts` still finds no Node globals in the webview test project.                                                                                                                       | removed: five projects pass                                                                                                                                               |
| B7  | `noEmit`                       | A     | `true`: the type-check runs write nothing                                                                                                                                                                                                                                                           | removed: `pnpm run typecheck` wrote 439 `.js` files next to the sources                                                                                                   |
| B8  | `strict`                       | A     | `true` (at least `strictNullChecks` is needed by B10)                                                                                                                                                                                                                                               | `false`: TS5052 in all five projects; removed: identical results (TypeScript 7's default)                                                                                 |
| B9  | `noUncheckedIndexedAccess`     | A     | `true`: the code relies on indexed reads being possibly `undefined`                                                                                                                                                                                                                                 | removed: TS2783 in `src/old-extension/messageHandler.ts`, `src/webview/lib/actions.ts`, `src/webview/lib/navigation.ts`; TS2344 in `tests/extension/legacy-types.test.ts` |
| B10 | `exactOptionalPropertyTypes`   | A     | `true`: tests assert that an optional field cannot be set to `undefined` (`shared-types.md` S.2)                                                                                                                                                                                                    | removed: unused `@ts-expect-error` (TS2578) ×8 in `tests/backend/types/shapes.test.ts` and ×1 in `tests/webview/webview-types.test.ts`                                    |
| B11 | `noUnusedLocals`               | B     | An unused local variable, import or private declaration is a type error.                                                                                                                                                                                                                            | probe: TS6133 with it; removed: sources still pass                                                                                                                        |
| B12 | `noUnusedParameters`           | B     | An unused parameter is a type error (names starting with `_` are exempt, as in the lint rule).                                                                                                                                                                                                      | as B11                                                                                                                                                                    |
| B13 | `noFallthroughCasesInSwitch`   | B     | A non-empty `case` that falls into the next is a type error.                                                                                                                                                                                                                                        | probe: TS7029 with it; removed: sources still pass                                                                                                                        |
| B14 | `verbatimModuleSyntax`         | B     | An import or export used only as a type must say so, so that esbuild and Vite, which compile one file at a time without type information, keep exactly the imports that exist at run time (`shared-types.md` S.2). `tests-ext` must turn it off (section 9).                                        | removed: sources still pass; bundles byte-identical                                                                                                                       |
| B15 | `isolatedModules`              | C     | Removing it changes nothing where B14 is on, since B14 already applies its rules. It matters only in `tests-ext`, where B14 is off: there it rejects re-exporting a type without `type`, which `tsc`'s whole-program emit handles anyway.                                                           | removed: five projects pass; a probe in `tests-ext` lost its TS1205                                                                                                       |
| B16 | `noUncheckedSideEffectImports` | C     | Removing it changes nothing: TypeScript 7 already reports a side-effect import of a missing module.                                                                                                                                                                                                 | removed: probe still TS2882                                                                                                                                               |
| B17 | `moduleDetection`              | B     | Every `.ts` file is a module even without `import` or `export`, so top-level names never collide across files. Declaration files are unaffected (`src/webview/global.d.ts` must stay global; `shared-types.md` S.2).                                                                                | `auto` or removed: sources pass; a probe of two files declaring the same top-level name gave TS2451 ×2                                                                    |
| B18 | `skipLibCheck`                 | A     | `true`: declarations under `node_modules` are not checked                                                                                                                                                                                                                                           | `false` or removed: the webview project and `tests/webview` fail on `simple-git`'s declarations (TS2591 ×11, TS2503 ×3), which need Node types those projects do not have |
| B19 | `paths` for `@/`               | A     | `"@/*": ["./src/*"]`, relative to this file (TypeScript 7 has no `baseUrl`)                                                                                                                                                                                                                         | removed: hundreds of TS2307 in every project except `tests-ext`; esbuild uses it too (X22)                                                                                |
| B20 | `paths` for `@tests/`          | A     | `"@tests/*": ["./tests/*"]`                                                                                                                                                                                                                                                                         | used by the backend, extension and webview tests                                                                                                                          |

Counts for `tsconfig.base.json`: **(A) 10, (B) 7, (C) 3**; 20 entries.

Every value here is an option name and a literal, so a correct rewrite will repeat many old lines
exactly; see 1.5 on reviewed coincidences. The implementer may order the options as they like
and may add a short comment explaining the grouping.

---

## 6. `tsconfig.json`

### 6.1 Role

The root project: `tsc -p .` in `typecheck`, and `tsc -p . --watch` in `watch:tsc` (the VS Code
`watch` task, problem matcher `$tsc-watch`; TypeScript 7 prints the lines that matcher expects,
section 1.4). It type-checks the extension side: every file under `src/` except `src/webview/`,
plus `vitest.config.ts`. `tests/tsconfig.json` and `tests-ext/tsconfig.json` extend it. For
esbuild and Vite it is the nearest configuration of every `src/` file outside `src/webview/`
(section 1.2).

The watch task therefore checks only the extension side; webview type errors appear only in
`pnpm run typecheck` (build Q10).

### 6.2 Entries

| #   | Entry                        | Class | Exact value (A), requirement (B), or effect of removal (C)                                                                        | Observed                                                                                                                                                                                                    |
| --- | ---------------------------- | ----- | --------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | File name and place          | A     | `tsconfig.json` at the repository root                                                                                            | `tsc -p .`; extended by `tests/tsconfig.json` and `tests-ext/tsconfig.json`; esbuild's and Vite's lookup                                                                                                    |
| R2  | `extends`                    | A     | `./tsconfig.base.json`                                                                                                            | —                                                                                                                                                                                                           |
| R3  | Node in `types`              | A     | `"node"` in `compilerOptions.types`                                                                                               | removed: the root project still passes, only because `vitest.config.ts` imports Vitest, whose declarations (Vite's) pull Node's in; `tests` (which inherits it) fails with TS2591 ×370, TS2304 ×67 and more |
| R4  | VS Code in `types`           | C     | Removing it changes nothing: every use of the API imports the module `vscode`, which TypeScript finds in `@types/vscode` by name. | `types: ["node"]`: five projects pass                                                                                                                                                                       |
| R5  | `include` of `src`           | A     | `src`                                                                                                                             | —                                                                                                                                                                                                           |
| R6  | `include` of the Vitest file | B     | `vitest.config.ts` is type-checked by some project. Today this one, with Node's types.                                            | removed: all pass, and nothing checks the file any more                                                                                                                                                     |
| R7  | `exclude`                    | A     | `src/webview`                                                                                                                     | removed: the root project compiles the webview without the DOM or JSX settings: TS7026 ×933, TS17004 ×837, TS6142 ×139 and more                                                                             |

Counts for `tsconfig.json`: **(A) 5, (B) 1, (C) 1**; 7 entries.

Nothing type-checks `tests/git-config.ts`: it is not under `src/`, `tests/tsconfig.json` includes
only `tests/backend/**` and `tests/extension/**`, and no checked file imports it (it is a Vitest
setup file). `esbuild.js`, `.vscode-test.mjs` and the `.cjs` files under `tests-ext/ui/` and
`scripts/` are JavaScript and not type-checked either (build Q11).

---

## 7. `tests/tsconfig.json`

### 7.1 Role

`tsc -p tests` in `typecheck`. It type-checks the Vitest tests of the `backend` and `extension`
projects, and every `src/` module they import, with the root project's settings (Node types, no
DOM). Vite, which looks up the nearest configuration of each file it compiles, finds this one for
these tests; the file adds nothing of its own that affects compilation.

### 7.2 Entries

| #   | Entry               | Class | Exact value (A) or requirement (B)                                                                               | Observed                                                                                                                                 |
| --- | ------------------- | ----- | ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| S1  | File name and place | A     | `tests/tsconfig.json`                                                                                            | `tsc -p tests`                                                                                                                           |
| S2  | `extends`           | B     | Inherit the shared options together with Node's types (today by extending the root project, `../tsconfig.json`). | extending `../tsconfig.base.json` instead, with nothing added: TS2591 ×370, TS2304 ×67 and more                                          |
| S3  | `include`           | A     | `./backend/**/*.ts` and `./extension/**/*.ts`                                                                    | removed: the root project's `include` applies instead, so the run passes while checking `src/` and `vitest.config.ts` and no test at all |

Counts for `tests/tsconfig.json`: **(A) 2, (B) 1, (C) 0**; 3 entries.

The two globs also cover the helpers and fixtures in those folders that are not test files (for
example `tests/backend/helpers.ts` and `tests/extension/__mocks__/vscode.ts`), and must not reach
`tests/webview/`, which needs the DOM.

---

## 8. `tests/webview/tsconfig.json`

### 8.1 Role

`tsc -p tests/webview` in `typecheck`. It type-checks the webview tests, and every `src/` module
they import, with the webview project's settings: the DOM library, Preact's JSX, and no Node or
VS Code globals. Several tests are compile-time probes that only work under exactly these
settings: `tests/webview/globals.test.ts` says it checks "the globals of `src/webview/global.d.ts`
and the settings of `src/webview/tsconfig.json`, as `tsc -p tests/webview` sees them", with
`@ts-expect-error` lines that must fail to compile (for example a call to Node's `process`).

### 8.2 Entries

| #   | Entry                                | Class | Exact value (A)                                                                                 | Observed                                                                                                                          |
| --- | ------------------------------------ | ----- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| W1  | File name and place                  | A     | `tests/webview/tsconfig.json`                                                                   | `tsc -p tests/webview`                                                                                                            |
| W2  | `extends`                            | A     | `../../src/webview/tsconfig.json`                                                               | the probes of `globals.test.ts` test that file's settings through this project                                                    |
| W3  | `include` of the test folder         | A     | `./**/*.ts` (every `.ts` file under `tests/webview/`, including `setup.ts` and `test-utils.ts`) | —                                                                                                                                 |
| W4  | `include` of the page's global types | A     | `../../src/webview/global.d.ts`                                                                 | removed: TS2339 ×472, TS2304 ×11 and more (no `window.l10n`, no `acquireVsCodeApi`, no `*.css` modules), and TS2578 on the probes |

Counts for `tests/webview/tsconfig.json`: **(A) 4, (B) 0, (C) 0**; 4 entries.

`src/webview/global.d.ts` must be listed by path because it is an ambient script that no module
imports; `shared-types.md` (module G) requires it to stay at that path for this reason.

---

## 9. `tests-ext/tsconfig.json`

### 9.1 Role

Three commands read it:

- `compile-tests` runs `tsc -p tests-ext/tsconfig.json`, which emits JavaScript, then
  `tsc-alias -p tests-ext/tsconfig.json`, which rewrites every `@/…` in the emitted files into a
  relative `require` path;
- `typecheck` runs `tsc -p tests-ext --noEmit`;
- `.vscode-test.mjs` then loads the emitted `tests-ext/out/**/*.test.js`.

What `compile-tests` must produce (observed, 2.5 s): CommonJS `.js` files without source maps or
declarations, in a tree that mirrors the repository under `tests-ext/out/`. The four tests land in
`tests-ext/out/tests-ext/<name>.test.js`; every `src/` module they import (today 30 files under
`src/backend/` and one under `src/old-extension/`) is compiled again into `tests-ext/out/src/…`.
The requires then read, for example, `require("../src/backend/actions/repository")`. A test
therefore runs against this compiled copy of the product modules it imports, not against the
esbuild bundle (`tests-discovery-extension.md` 1.3).

The emitted files are CommonJS because `package.json` has no `"type"` field and the module mode is
one of Node's; VS Code's extension host loads the tests with `require`. The output was
byte-identical with `module` set to `node16`, `node18`, `node20` or `nodenext`.

### 9.2 Entries

| #   | Entry                  | Class | Exact value (A), requirement (B), or effect of removal (C)                                                                                                            | Observed                                                                                                                                                                |
| --- | ---------------------- | ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E1  | File name and place    | A     | `tests-ext/tsconfig.json`                                                                                                                                             | `compile-tests`, `typecheck`                                                                                                                                            |
| E2  | `extends`              | B     | Inherit the shared options (today through the root project, `../tsconfig.json`).                                                                                      | extending `../tsconfig.base.json` directly: all pass (this file sets its own `types` and `include`)                                                                     |
| E3  | `module`               | B     | A Node module mode, so that `.ts` files in this package are emitted as CommonJS. Today `node18`.                                                                      | `node16`, `node20`, `nodenext`: identical output; `commonjs`: TS5110 with E4                                                                                            |
| E4  | `moduleResolution`     | B     | Replaces the inherited `bundler`, which Node module modes reject, with Node's own resolution matching E3. Today `node16`.                                             | removed: TS5095 and TS5109; `nodenext`: identical output                                                                                                                |
| E5  | `noEmit`               | A     | `false` (the shared options say `true`)                                                                                                                               | removed: `compile-tests` emits nothing, so `vscode-test` finds no compiled test                                                                                         |
| E6  | `paths` for `@/`       | A     | `"@/*": ["../src/*"]`, declared in this file                                                                                                                          | removed: `tsc` still passes (it inherits the base mapping), but `tsc-alias` rewrites nothing and the emitted files `require("@/…")`, which fails in VS Code             |
| E7  | `paths` for `@tests/`  | C     | No `tests-ext` file imports `@tests/…`. Removing it changes nothing today; a future `tests-ext` file that imported from `tests/` would need it back.                  | `paths` with only `@/`: identical results                                                                                                                               |
| E8  | `rootDir`              | A     | `..` (the repository root, which contains both `tests-ext/` and `src/`)                                                                                               | removed: TS5011; the value fixes the mirrored layout of 9.1                                                                                                             |
| E9  | Node in `types`        | A     | `"node"`                                                                                                                                                              | `types: ["mocha", "vscode"]`: 81 errors (`node:` modules, `Buffer`, `process`)                                                                                          |
| E10 | VS Code in `types`     | C     | Removing it changes nothing: the tests import the module `vscode`, found in `@types/vscode` by name.                                                                  | `types: ["node", "mocha"]`: identical results                                                                                                                           |
| E11 | Mocha in `types`       | A     | `"mocha"` (the tests use the `tdd` globals `suite`, `test`, `suiteSetup`, `setup`, `teardown`, `suiteTeardown`)                                                       | `types: ["node", "vscode"]`: TS2593, TS2304, TS2552 (25 errors)                                                                                                         |
| E12 | `outDir`               | A     | `./out`, that is `tests-ext/out`                                                                                                                                      | removed: JavaScript is written next to the sources and `tsc-alias` fails. `tests-ext/out` is what `.vscode-test.mjs` globs, `clean:all` removes and `.gitignore` covers |
| E13 | `verbatimModuleSyntax` | A     | `false` (the shared options say `true`)                                                                                                                               | removed: TS1295 ×267: `import` and `export` are not allowed in files emitted as CommonJS under that option                                                              |
| E14 | `include`              | B     | Every `.ts` file under `tests-ext/` (today four, all at the top level) and nothing outside it; the `src/` modules they import are compiled because they are imported. | removed: the root project's `include` applies, TS1479 on `vitest.config.ts` and no test compiled; `./*.ts`: identical today                                             |

Counts for `tests-ext/tsconfig.json`: **(A) 8, (B) 4, (C) 2**; 14 entries.

Because the output is CommonJS, the test files may not use top-level `await` or `import.meta`;
because `verbatimModuleSyntax` is off here, an import used only as a type is dropped from the
output (`tests-discovery-extension.md` 1.3).

---

## 10. `pnpm-workspace.yaml`

### 10.1 Role

pnpm 11 (pinned by `packageManager` in `package.json`, 11.15.1) reads its project settings from
this file. The repository is a single package; the file declares no workspace packages. Every
install in CI and in the documentation is `pnpm install --frozen-lockfile`.

Two settings are present:

- **Which dependencies may run install scripts.** pnpm 11 runs no dependency's install script
  unless allowed, and a frozen install **fails** when a dependency that has one is not listed
  either way. Observed in a separate scratch install: with any of the three names removed,
  `pnpm install --frozen-lockfile` ended with `ERR_PNPM_IGNORED_BUILDS` naming that package, and
  exit status 1. The three packages with install scripts in today's lockfile are
  `@vscode/vsce-sign`, `esbuild` and `keytar`.
- **Overrides.** Four transitive development dependencies are forced to patched versions. pnpm
  records overrides in `pnpm-lock.yaml` (its `overrides:` section, identical to this file's), and
  a frozen install **fails** when they differ. Observed: with the `serialize-javascript` or the
  `js-yaml` override removed, `pnpm install --frozen-lockfile` ended with
  `ERR_PNPM_LOCKFILE_CONFIG_MISMATCH`. Changing them therefore means regenerating the lockfile in
  the same change.

What each allowed or denied install script does:

- `esbuild`: checks that the platform's binary, installed as an optional dependency, is in place,
  and repairs a missing one. Observed: with its entry set to deny, the install succeeded and
  esbuild built.
- `@vscode/vsce-sign`: copies the platform's signing executable into the package. `vsce` uses it
  only to sign or verify a package (`--sign-tool`, signature files, `generate-manifest`); no
  repository command does that (`package:vsix` runs `vsce package`; `publish.yml` runs
  `vsce verify-pat` and `vsce publish --packagePath`).
- `keytar`: builds a native module. `vsce` uses it only to keep publisher credentials in the
  system keychain after `vsce login`; CI passes tokens through the environment. Denying it keeps
  installs free of a native build toolchain.

What the overrides change today (requested ranges from the registry, versions from the lockfile):

| Override                                 | Requested by                                                                                                                   | Locked | Effect                                               |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------ | ---------------------------------------------------- |
| `js-yaml@>=4.0.0 <4.3.2` → `^4.3.2`      | `mocha` 11.8.0 `^4.1.0`, `@eslint/eslintrc` 3.3.6 `^4.3.0`, `@textlint/linter-formatter` `^4.3.0`, `rc-config-loader` `^4.1.1` | 4.3.2  | none against these ranges; forbids an older lock     |
| `qs@<6.16.0` → `^6.16.0`                 | `typed-rest-client` 1.8.11 `^6.9.1`                                                                                            | 6.16.0 | none against this range; forbids an older lock       |
| `serialize-javascript@<7.0.5` → `^7.1.1` | `mocha` 11.8.0 `^6.0.2`                                                                                                        | 7.1.2  | replaces a 6.x with 7.x, outside the requested range |
| `vite@>=8.0.0 <8.0.16` → `^8.0.16`       | `vitest` and `@vitest/mocker` 4.1.11 `^6.0.0 \|\| ^7.0.0 \|\| ^8.0.0`                                                          | 8.3.1  | none against these ranges; forbids an older 8.x lock |

### 10.2 Entries

| #   | Entry                               | Class | Exact value (A) or requirement (B)                                                                          |
| --- | ----------------------------------- | ----- | ----------------------------------------------------------------------------------------------------------- |
| P1  | File name and place                 | A     | `pnpm-workspace.yaml` at the repository root                                                                |
| P2  | `@vscode/vsce-sign` listed          | A     | an entry for `@vscode/vsce-sign` under `allowBuilds`                                                        |
| P3  | `esbuild` listed                    | A     | an entry for `esbuild` under `allowBuilds`                                                                  |
| P4  | `keytar` listed                     | A     | an entry for `keytar` under `allowBuilds`                                                                   |
| P5  | Decision for `@vscode/vsce-sign`    | B     | `vsce` must be able to package and publish as the scripts and workflows call it. Today allowed (build Q13). |
| P6  | Decision for `esbuild`              | B     | esbuild must run after a frozen install on Linux, Windows and macOS. Today allowed (build Q13).             |
| P7  | Decision for `keytar`               | B     | Installs must not need a native build toolchain; nothing uses the keychain. Today denied.                   |
| P8  | Comment on the overrides            | B     | Explain why the overrides exist (security fixes in development tools' dependencies) and when they can go.   |
| P9  | Override for `js-yaml`              | A     | `js-yaml@>=4.0.0 <4.3.2: ^4.3.2`                                                                            |
| P10 | Override for `qs`                   | A     | `qs@<6.16.0: ^6.16.0`                                                                                       |
| P11 | Override for `serialize-javascript` | A     | `serialize-javascript@<7.0.5: ^7.1.1`                                                                       |
| P12 | Override for `vite`                 | A     | `vite@>=8.0.0 <8.0.16: ^8.0.16`                                                                             |

Counts for `pnpm-workspace.yaml`: **(A) 8, (B) 4, (C) 0**; 12 entries.

The four overrides are (A) because the lockfile must match them character for character, not
because each is still needed; build Q8 asks about that. Each selector and replacement must parse
to exactly the strings above (a YAML key that starts with `@`, such as `@vscode/vsce-sign`, has
to be quoted).

---

## 11. `src/webview/tsconfig.json` (not rewritten; context)

This file was rewritten under `shared-types.md` (module H) and is not part of this rewrite. It
matters here because it extends `tsconfig.base.json` and `tests/webview/tsconfig.json` extends it.
Its current content, which the rewritten files must keep working with:

| Option                | Value                      | Used by                                                                                                      |
| --------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `extends`             | `../../tsconfig.base.json` | relies on the base file's name and place (B1)                                                                |
| `compilerOptions.jsx` | `react-jsx`                | `tsc`; Vite for every `.tsx` under `src/webview/` (3.2); esbuild when the build options do not set JSX (2.4) |
| `jsxImportSource`     | `preact`                   | as above; observed: without it a component test fails to resolve `react/jsx-dev-runtime`                     |
| `lib`                 | `esnext`, `dom`            | replaces the base's library list (B5): the webview gets the DOM                                              |

Everything else comes from the base. Three base entries matter to this project in particular:

- **B18 `skipLibCheck`**: the webview project reaches `src/backend/utils/remoteVisibility.ts`,
  which imports `simple-git`, so `simple-git`'s declarations are part of the project; checked,
  they fail for lack of Node types.
- **B6 `types`** (obsolete under TypeScript 7): the webview must not see Node's globals.
  `tests/webview/globals.test.ts` fails the type check if it does. TypeScript 7 includes no
  `@types` package by default, so the base entry is not what guarantees this today.
- **B19 `paths`**: `@/` is inherited from the base and resolves relative to the base file.

It is compiled by `tsc -p src/webview` in `typecheck`. The webview project has no `include`: it
compiles every TypeScript file under `src/webview/` (the folder of this file) and whatever they
import.

---

## 12. Summary of the classification

| File                          | Entries | (A)     | (B)    | (C)   | Obsolete entries                                                      |
| ----------------------------- | ------- | ------- | ------ | ----- | --------------------------------------------------------------------- |
| `esbuild.js`                  | 32      | 19      | 12     | 1     | X22 the script's own `@/` resolver                                    |
| `vitest.config.ts`            | 23      | 17      | 6      | 0     | —                                                                     |
| `.vscode-test.mjs`            | 37      | 27      | 10     | 0     | —                                                                     |
| `tsconfig.base.json`          | 20      | 10      | 7      | 3     | B6 `types`, B15 `isolatedModules`, B16 `noUncheckedSideEffectImports` |
| `tsconfig.json`               | 7       | 5       | 1      | 1     | R4 `vscode` in `types`                                                |
| `tests/tsconfig.json`         | 3       | 2       | 1      | 0     | —                                                                     |
| `tests/webview/tsconfig.json` | 4       | 4       | 0      | 0     | —                                                                     |
| `tests-ext/tsconfig.json`     | 14      | 8       | 4      | 2     | E7 `@tests/` path, E10 `vscode` in `types`                            |
| `pnpm-workspace.yaml`         | 12      | 8       | 4      | 0     | —                                                                     |
| **Total**                     | **152** | **100** | **45** | **7** |                                                                       |

Three (A) entries also equal TypeScript 7's defaults: B2 `module`, B3 `moduleResolution` and B8
`strict`. Their values are dictated, but leaving them out changes nothing with the pinned compiler
(build Q12).

Two kinds of (A) entry are guarded by no automated check; a mistake in them would pass every
command of section 1.4 on a typical machine:

- X27, X28: the console lines are read only by the VS Code problem matcher; no test checks them.
- T30 `--locale=en`: on a machine whose VS Code already runs in English, leaving it out changes
  nothing; it matters on other display languages.

---

## 13. Questions

Each question states the current behaviour; none is decided here.

- **build Q1 — errors without a location.** An esbuild error that has no file (a missing entry
  point, or running from another folder) makes the build's reporter fail while printing it: a
  second error names the reporter, the `[watch] build finished` line never appears, and in watch
  mode the VS Code task would stay busy (2.6). Should the rewrite print such errors without a
  location line and always print the finish line, or keep today's output?
- **build Q2 — two ways to resolve `@/` and JSX.** The build resolves `@/` itself and sets Preact's
  JSX in its options, although esbuild would take both from the `tsconfig` files and produce
  byte-identical bundles. Keeping the resolver but dropping the JSX options silently produces
  `React.createElement` calls in some modules (2.4). Should the build keep its own resolver and
  JSX options, rely on the `tsconfig` files for both, or keep one and not the other?
- **build Q3 — `NODE_ENV` changes the stylesheet.** Tailwind optimises its output only when
  `NODE_ENV=production`, which nothing in the repository sets; with it set, the production
  stylesheet differs (2.2). Should the build fix Tailwind's optimisation on or off explicitly, or
  leave it to the environment?
- **build Q4 — stale source maps.** A production build does not remove the maps of an earlier
  development build, and `.vscodeignore` ships everything in `out/`. `vscode:prepublish` cleans
  first, so no VSIX has contained them, but `test:ui-harness` and `benchmark:ui` run with stale
  maps next to the production files (2.3). Should the build remove its own outputs before writing,
  or is cleaning in `vscode:prepublish` enough?
- **build Q5 — stylesheet errors point at PostCSS.** When Tailwind rejects `styles.css`, the error
  line names line 1, column 1 of the stylesheet inside the message and a file inside PostCSS's own
  package as the location, and Tailwind prints a stack trace first (2.6). Should the build report
  the stylesheet (and Tailwind's line, where it gives one) as the location?
- **build Q6 — language levels of the bundles.** The extension bundle is lowered to ES2015
  (`async` functions become generator helpers), yet the extension already calls ES2023 and ES2024
  library functions (`findLast`, `toSorted`, `Promise.withResolvers`) that ES2015 hosts lack, and
  the oldest supported VS Code runs its extensions on Node 24.15. A newer level (for example
  ES2022 or Node 20) gave a production bundle of 186 755 instead of 194 263 bytes and keeps
  native `async` in stack traces. The webview's ES2020 level changes the output by 3 bytes against
  ES2022. Should the levels stay as they are, or follow the oldest supported VS Code?
- **build Q7 — two builds, one finish line.** In watch mode both bundles build at once, so the
  first round prints two start lines and then two finish lines (2.7). The problem matcher treats
  the first finish line as the end, while the second bundle may still be building. Should watch
  mode report one start and one finish per round of both bundles, or keep one pair per bundle?
- **build Q8 — overrides that no longer change anything.** Of the four overrides, only
  `serialize-javascript` changes today's resolution (it replaces the 6.x that `mocha` asks for
  with 7.x). The `js-yaml`, `qs` and `vite` overrides match versions the requesting packages'
  ranges already allow (10.1). Removing any of them requires regenerating the lockfile. Keep all
  four, or remove those that no longer change the resolution?
- **build Q9 — the Vitest configuration's module form.** `vitest.config.ts` mixes `import` syntax
  with CommonJS's `__dirname`; it loads because Vite bundles it, and every run prints a notice that
  Vite's future native loader will not accept it (3.1). Should the rewrite use only ES-module
  means (for example the module's own URL) so that it would load natively, or keep today's form?
- **build Q10 — the watch type check covers only the extension side.** `watch:tsc` checks the root
  project, which excludes `src/webview/`; webview type errors appear only in `pnpm run typecheck`
  (6.1). Should the root project, or the watch task, cover the webview too? (The task file is not
  part of this rewrite.)
- **build Q11 — files no project type-checks.** `tests/git-config.ts` (TypeScript) is in no
  project's `include` and imported by no checked file. The JavaScript configuration files
  (`esbuild.js`, `.vscode-test.mjs`) are not checked either (6.2). Should `tests/tsconfig.json`
  include `tests/git-config.ts`, and should the JavaScript files be checked?
- **build Q12 — options that repeat the compiler's defaults.** With TypeScript 7, leaving out
  `types` (B6), `noUncheckedSideEffectImports` (B16), `module` (B2), `moduleResolution` (B3) and
  `strict` (B8) changes nothing; `isolatedModules` (B15) is covered by `verbatimModuleSyntax`
  wherever that is on; `vscode` in `types` (R4, E10) and the `@tests/` path of `tests-ext` (E7)
  are unused. Should the rewrite state such options explicitly, so that the files do not depend on
  the compiler's defaults, or leave them out?
- **build Q13 — install scripts nobody needs.** `esbuild` and `@vscode/vsce-sign` are allowed to
  run their install scripts. esbuild worked with its script denied, and no repository command
  uses the signing executable that `@vscode/vsce-sign`'s script installs (10.1). Keep both
  allowed, or deny them?
- **build Q14 — warnings and columns.** The build never reports esbuild's warnings, though the
  problem matcher accepts `▲ [WARNING]` lines (none occur today). Columns are printed as esbuild
  counts them, from 0, while the matcher counts from 1, so VS Code marks one column to the left
  (2.5). Should warnings be reported, and should columns be converted?
- **build Q15 — the debugging port.** `.vscode-test.mjs` finds a free port by opening and
  closing a server on it, then passes the number to VS Code, which binds it later; another process
  could take it in between (4.3). Is this acceptable, or should the runner let VS Code choose the
  port and report it?

---

## Decisions

These decisions are the maintainer's answers to the questions above; where they differ from the rest of this specification, they win.

- **Q1.** Fix it. An error without a location is reported like any other, and the finished line is printed after every build, failed or not.
- **Q2.** Take both the `@/` resolution and the JSX settings from the `tsconfig` files, and drop the build's own resolver and JSX options. Verify that the webview bundle contains no `React.createElement` and that the UI harness passes.
- **Q3.** The build decides Tailwind's mode from `--production` alone, so `NODE_ENV` does not change the output.
- **Q4.** A production build writes no source maps and removes any left from an earlier development build.
- **Q5.** Yes: Tailwind errors point at `src/webview/styles.css`.
- **Q6.** Raise the extension's target to ES2024, which the oldest supported VS Code's Node runs. Keep the webview's target.
- **Q7.** In watch mode the build prints one start line and one finished line for each round that rebuilds both bundles, so the problem matcher ends when both are done (`config-repo.md` Q10).
- **Q8.** Keep all four overrides; this batch does not change `pnpm-lock.yaml`.
- **Q9.** Yes: write `vitest.config.ts` as a plain ES module, without `__dirname`, so Vite's notice goes away.
- **Q10.** Keep `watch:tsc` on the extension side only.
- **Q11.** Out of scope here.
- **Q12.** State only the options that change behaviour or that the code depends on; leave out those that repeat TypeScript 7's defaults.
- **Q13.** Keep the three install-script packages allowed as they are.
- **Q14.** Yes: report esbuild's warnings, and give columns as the problem matcher expects them.
- **Q15.** Leave the port selection as it is.
