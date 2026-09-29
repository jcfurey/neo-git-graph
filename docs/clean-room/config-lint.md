# Clean-room specification: lint and format configuration

This document is for someone who will write Branchwise's lint and format configuration again
without seeing the current files or their history. It gives the facts the new configuration has to
fit: which tools read it and how, which entries the repository's layout and existing formatting
dictate, a survey of what oxlint reports on the current tree for each category of rules, the
conventions visible in Branchwise's code, and the entries that no longer do anything. It does not
list the rules the current files enable, does not quote their comments, and does not follow their
layout. The rule selection was upstream's choice; the rewrite derives its own from section 3 and
the maintainer's answers to section 5.

| Section | Content                                             |
| ------- | --------------------------------------------------- |
| 0       | How the facts were observed                         |
| 1       | Scope, consumers, and how a rewrite is verified     |
| 2       | Dictated entries (A)                                |
| 3       | Rule survey, conventions and requirements (B)       |
| 4       | Obsolete entries (C)                                |
| 5       | Questions for the maintainer (`lint Q1`, `Q2`, ...) |

---

## 0. How the facts were observed

- Worktree at commit `cd1b5db`, Linux x64, Node v22.22.2, pnpm 11.15.1, oxlint 1.79.0, oxfmt
  0.64.0 (the versions `pnpm install --frozen-lockfile` installs), and the system's Git 2.43.0
  (for `git archive`, `git ls-files` and the blame behind `pnpm run provenance`).
- `pnpm run lint`, `pnpm run format` and `pnpm run test:lint-rules` were run on the unchanged
  worktree. All three pass; oxlint reports no diagnostic of any severity on 468 files, oxfmt checks
  556 files, and the lint-rule tests pass 3 of 3.
- Every experiment ran on a copy of the tracked tree in `/tmp` (made with `git archive`, with the
  worktree's `node_modules` linked in), never in the repository. Temporary configurations were
  written into that copy and passed with `-c`, or replaced the copy's own files one change at a
  time. The copy is not a Git repository, but oxlint and oxfmt read its `.gitignore` all the same
  (checked in 2.3).
- The category survey (3.2) turned on one category at a time at `error`, with every other category
  off, for thirteen plugins, and counted diagnostics per rule with `-f json`.
- No repository file other than this document was changed.

---

## 1. Scope, consumers and verification

### 1.1 The files

| File                             | Inherited lines (`pnpm run provenance --lines`) | Role today                              |
| -------------------------------- | ----------------------------------------------- | --------------------------------------- |
| `.oxlintrc.json`                 | 65                                              | the lint configuration oxlint loads     |
| `oxlint/baseline.config.json`    | 13                                              | extended by `.oxlintrc.json`            |
| `oxlint/pedantic.config.json`    | 7                                               | extended by `.oxlintrc.json`            |
| `oxlint/restriction.config.json` | 10                                              | extended by `.oxlintrc.json`            |
| `oxlint/style.config.json`       | 4                                               | extended by `.oxlintrc.json`            |
| `.oxfmtrc.jsonc`                 | 5                                               | the formatter configuration oxfmt loads |

All six are deleted and written again. The rewrite may use fewer or more files (see `lint Q3`), but
it must keep the two entry points that the tools discover by name (2.1).

Branchwise's own lint code is **not** part of this rewrite and has no inherited lines:

| File                           | What it is                                                                                                                                                                                                                                                                                                       |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `oxlint/webview-text.cjs`      | An oxlint JS plugin whose `meta.name` is `webview`. It defines one rule, `no-hard-coded-text`, which reports text people read or hear in JSX that does not come from `window.l10n`: JSX text, string children, and string values of `aria-*`, `alt`, `placeholder` and `title`. Text without letters is allowed. |
| `oxlint/webview-text.test.cjs` | Three `node:test` tests. Each writes its own throw-away configuration (the plugin and that one rule only) and a sample `view.tsx` into a fresh folder under the OS temporary folder, runs `node_modules/.bin/oxlint -c` on it with `-f json`, and compares the reported texts.                                   |

The new configuration must keep loading that plugin and keep its rule in force (2.6). Because the
tests bring their own configuration, `pnpm run test:lint-rules` does not read the repository's
configuration at all; it only needs `node_modules/.bin/oxlint` to exist and to accept the plugin.
Both files are themselves linted and formatted by the repository's configuration, since they live
in `oxlint/`.

### 1.2 Consumers

| Consumer                                                     | What it runs                                                                                                          | What it needs from the configuration                                                                           |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `pnpm run lint`                                              | `oxlint` from the repository root, no arguments                                                                       | the root configuration is found by name; the exit status is 0 only when nothing at error level is reported     |
| `pnpm run lint:fix`                                          | `oxlint --fix`                                                                                                        | fixes that do not fight the formatter (3.6)                                                                    |
| `pnpm run test:lint-rules`                                   | `node --test oxlint/webview-text.test.cjs`                                                                            | nothing from the configuration (1.1)                                                                           |
| `pnpm run format`                                            | `oxfmt --check` from the root                                                                                         | the formatter configuration is found by name; the whole tree already conforms                                  |
| `pnpm run format:fix`                                        | `oxfmt .`                                                                                                             | the same options, so that fixing does not reformat conforming files                                            |
| `pnpm run l10n:export` / `l10n:check`                        | `vscode-l10n-dev export` then `oxfmt ./l10n/bundle.l10n.json`; `l10n:check` then diffs the file with Git              | JSON formatting must reproduce the committed `l10n/bundle.l10n.json` exactly                                   |
| `pnpm run package` (and `vscode:prepublish`, `package:vsix`) | `typecheck`, then `lint`, then the production build                                                                   | lint passes on the tree, so a VSIX can be built                                                                |
| CI, job `lint` (matrix `node: [24]`)                         | `pnpm run format`, then `pnpm run lint && pnpm run test:lint-rules`, then typecheck, l10n, release, links, provenance | all pass on Linux; `todo.md` records the intent to make the status `lint (24)` required on `main`              |
| `publish.yml`                                                | reuses the CI workflow before publishing                                                                              | the same                                                                                                       |
| Editors (`.vscode/`)                                         | nothing today: `.vscode/settings.json`, `extensions.json` and `tasks.json` mention neither tool                       | a developer who installs the oxc extension gets the root configurations by the same discovery (see `lint Q13`) |
| Other clean-room specifications                              | text only                                                                                                             | several specifications state lint expectations as premises for modules already rewritten (3.5, `lint Q12`)     |

### 1.3 How a rewrite is verified

A rewrite is complete when all of the following hold on the whole tree, with nothing else changed:

1. `pnpm run lint` exits 0, and `pnpm exec oxlint -f json` reports an empty `diagnostics` array
   (no warnings either, unless the maintainer decides otherwise in `lint Q4`).
2. `pnpm exec oxlint --debug=files` lists the same 468 files as today (2.3), or the difference is
   one the maintainer agreed to.
3. `pnpm run format` passes and checks the same 556 files; `pnpm run format:fix` changes nothing.
4. `pnpm run test:lint-rules` passes.
5. `pnpm run l10n:check` passes (it re-formats the l10n bundle and diffs it).
6. The rules in 2.6 still fire. In a scratch copy of the tree (not the repository), each of these
   must produce exactly one diagnostic when linted with the new configuration:
   - a `.tsx` file under `src/webview/components/` containing `<p>Hello</p>` (the webview text
     rule);
   - any other probes the maintainer's answers to section 5 call for, such as a response handler
     that imports the page's VS Code API object (`lint Q8`).
7. `pnpm run check:provenance` passes after `pnpm run provenance --update` lowers the counts for the
   six files, and `pnpm run provenance --lines` shows nothing for them except lines reviewed as
   coincidences (such as the schema path of 2.1, which any configuration must spell the same way).

---

## 2. Dictated entries (A)

These follow from the tools, the repository's layout, or the formatting the tree already has. The
rewrite states them exactly as given here.

### 2.1 Tools, entry points and schema

- **Packages.** `oxlint` (`^1.79.0`) and `oxfmt` (`^0.64.0`) are devDependencies; `pnpm exec`
  and the `package.json` scripts run the copies in `node_modules/.bin`. `eslint-plugin-import`
  (`^2.32.0`) is a devDependency that nothing but the lint configuration uses (as a JS plugin); if
  the rewrite stops using it, the dependency becomes dead (`lint Q6`).
- **Lint entry point.** `pnpm run lint` passes no `-c`, so oxlint must find the root configuration
  by name in the repository root. oxlint 1.79 discovers `.oxlintrc.json` and `.oxlintrc.jsonc`
  (both checked); it does not discover `oxlint.config.json`. JavaScript or TypeScript configuration
  files are marked experimental. Comments are accepted in either JSON name. Keep the name
  `.oxlintrc.json`: other specifications and `scripts/provenance-baseline.json` refer to it.
- **Format entry point.** `oxfmt` finds `.oxfmtrc.jsonc` or `.oxfmtrc.json` in the directory it runs
  from. Keep `.oxfmtrc.jsonc`, for the same reason.
- **Nested configurations.** Both tools also load files with those names from subfolders and apply
  them to that folder (checked for both: a `.oxlintrc.json` or `.oxfmtrc.json` placed in a subfolder
  changed the result for a file in it). Any extra configuration files that a root configuration
  `extends` must therefore have names the tools do not discover by themselves, as the files in
  `oxlint/` do today.
- **`extends`.** Paths in `extends` are relative to the file that names them. Override `files`
  globs inside an extended file are matched against paths relative to the repository root, not to
  the extended file's folder (checked: an override in a file under `oxlint/` for a glob under
  `src/webview/` takes effect).
- **Schema.** oxlint ships its JSON schema at `node_modules/oxlint/configuration_schema.json`. A
  configuration at the root that declares `$schema` spells it
  `"./node_modules/oxlint/configuration_schema.json"`; a file one folder down spells it
  `"../node_modules/oxlint/configuration_schema.json"`. oxfmt ships
  `node_modules/oxfmt/configuration_schema.json`; the current formatter configuration does not
  declare it (a choice).

### 2.2 Names as the tools spell them

- **Built-in plugins** (values of `plugins`): `eslint`, `typescript`, `unicorn`, `oxc`, `import`,
  `node`, `promise`, `jsdoc`, `react`, `react-perf`, `jsx-a11y`, `vitest`, `jest`, `nextjs`, `vue`.
  Setting `plugins` replaces the default set (`typescript`, `unicorn`, `oxc`); `eslint` rules stay
  available whatever `plugins` says. The project uses neither Next.js nor Vue.
- **Rule names** in configuration are `plugin/rule`, for example `eslint/no-debugger` or
  `typescript/no-explicit-any`. The React hook rules belong to the `react` plugin
  (`react/exhaustive-deps`; `react-hooks/exhaustive-deps` is accepted too). Diagnostics print names
  as `plugin(rule)`, with `react-hooks(...)` for the hook rules.
- **Categories** (keys of `categories`): `correctness`, `suspicious`, `pedantic`, `perf`, `style`,
  `restriction`, `nursery`. The CLI's `all` covers all but `nursery` and does not turn plugins on.
  A rule set in `rules` or in an override takes precedence over its category.
- **Levels**: `"off"` or `"allow"`, `"warn"`, `"error"` or `"deny"`, or `0`, `1`, `2`.
- **Options** (the `options` object): `denyWarnings`, `maxWarnings`,
  `reportUnusedDisableDirectives`, `respectEslintDisableDirectives` (default `true`), `typeAware`,
  `typeCheck`. The schema says the two directive options are honoured only in the root file.
- **JS plugins.** A `jsPlugins` entry is a specifier or `{ "name": …, "specifier": … }`; bare
  specifiers resolve from the configuration file's folder, so from the root's `node_modules`. The
  name `import` is reserved for the native plugin: naming `eslint-plugin-import` `import` is a
  configuration error whose message proposes the alias `import-js`. The native `import` plugin has
  no ordering rule; `eslint-plugin-import` has one.
- **The local plugin** is loaded by its path from the root, `./oxlint/webview-text.cjs`. Its rules
  take the prefix from the plugin's `meta.name`, so the rule is `webview/no-hard-coded-text`.
- **Type-aware rules.** 59 of oxlint's rules need type information: the `oxlint-tsgolint` package
  (not a dependency) and `--type-aware` or `options.typeAware`. Without them oxlint skips those
  rules silently, so naming one has no effect; the current configuration names one (`lint Q11`).

### 2.3 Files that are linted and formatted, and files that must not be

**Linted today: 468 files**, which is every tracked JavaScript and TypeScript file: 401 `.ts`,
45 `.tsx`, 18 `.cjs`, 2 `.js`, 2 `.mjs`. They sit in `src/`, `tests/`, `tests-ext/`, `scripts/`,
`oxlint/`, and at the root (`.vscode-test.mjs`, `esbuild.js`, `vitest.config.ts`). The rewrite
keeps every one of them linted.

**Formatted today: 556 files**: 401 `.ts`, 55 `.md`, 45 `.tsx`, 27 `.json`, 18 `.cjs`, 4 `.yaml` or
`.yml`, 2 `.js`, 2 `.mjs`, 1 `.jsonc`, 1 `.css`. oxfmt skips the other 16 tracked files by itself:
`.envrc`, `.gitattributes`, `.github/CODEOWNERS`, `.gitignore`, `.vscodeignore`, `LICENSE`,
`flake.lock`, `flake.nix`, `pnpm-lock.yaml`, the five images under `resources/`, and the two
`tests/fixtures/*gitconfig` files. The rewrite keeps the same set.

**Never linted or formatted.** These folders hold generated or third-party JavaScript:

| Folder           | Produced by                                                   |
| ---------------- | ------------------------------------------------------------- |
| `node_modules/`  | `pnpm install`                                                |
| `out/`           | `node esbuild.js` (the extension and webview bundles)         |
| `tests-ext/out/` | `pnpm run compile-tests` (`tsc` and `tsc-alias`)              |
| `.vscode-test/`  | the VS Code test runner, which downloads whole VS Code builds |
| `test-results/`  | UI test diagnostics and benchmarks                            |
| `.direnv/`       | direnv with the Nix flake                                     |

Today `.gitignore` names all six, and **both tools honour `.gitignore`**: with every ignore pattern
removed from both configurations, stand-in JavaScript files placed in each folder of a scratch copy
were neither linted nor formatted, and the lint set stayed at 468 files. With `.gitignore` removed
instead and the current ignore patterns kept, oxlint lints `.vscode-test/`, `test-results/`,
`.direnv/` and `tests-ext/out/` (the current pattern for `out/` matches only the root folder).
**oxlint 1.79 does not skip `node_modules` by itself** (checked in a fresh folder with an empty
configuration and no `.gitignore`), while oxfmt does. The current configurations list the root
`out/` and `node_modules/` in addition to `.gitignore`. Whether the rewrite relies on
`.gitignore` or lists the folders is `lint Q10`; either way the six folders stay out.

### 2.4 The environments the code runs in

In every measurement below, removing an environment only ever added `eslint/no-undef` diagnostics
(a `nursery` rule). If the rewrite enables that rule anywhere, these are the facts:

| Files                       | Runs in                                                                                           | Globals it uses that Node's environment lacks                                                                                                                                                                                                                                                              |
| --------------------------- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| everything not listed below | Node: the extension host, backend, scripts, root configuration files, backend and extension tests | none                                                                                                                                                                                                                                                                                                       |
| `src/webview/**`            | a browser page inside VS Code; Node globals do not exist there                                    | the DOM, and `acquireVsCodeApi`, which VS Code defines on the page. It is declared in `src/webview/global.d.ts` and called in one place, `src/webview/lib/vscode.ts`.                                                                                                                                      |
| `tests/webview/**`          | Vitest's `webview` project, with a DOM set up by `tests/webview/setup.ts`                         | `document` (291 uses), `window` (131), `MouseEvent` (54), `KeyboardEvent` (22), `Element` (16), `acquireVsCodeApi` (10, the setup's stand-in), `HTMLElement` (5), `Node` (4), `FocusEvent`, `PointerEvent` (3 each), `WheelEvent` (2), `HTMLTableCellElement`, `requestAnimationFrame`, `DOMRect` (1 each) |
| `tests-ext/**/*.{ts,cjs}`   | Mocha inside VS Code (`.vscode-test.mjs`); the UI tests under `tests-ext/ui/` are `.cjs`          | Mocha's globals                                                                                                                                                                                                                                                                                            |

The Vitest suites import `describe`, `it`, `expect` and the rest from `vitest` explicitly; none
relies on Vitest globals. With `eslint/no-undef` at error and the Node environment everywhere,
dropping the browser environment for `src/webview/**` adds 480 diagnostics in 35 files, dropping
Mocha's for `tests-ext` adds 55 in 5 files, and dropping Node's at the root adds 285 in 33 files.

### 2.5 Formatter options whose effect is fixed

Each row was checked by changing only that option in a scratch copy and counting the files
`oxfmt --list-different` reports, not counting the formatter configuration itself. The whole tree
conforms to the current effect, so each count is what a different value would reformat.

| Effect that must stay                                                         | oxfmt option and value          | oxfmt 0.64 default | Other files that would change          |
| ----------------------------------------------------------------------------- | ------------------------------- | ------------------ | -------------------------------------- |
| No trailing commas in multi-line lists, objects, parameters and imports       | `trailingComma: "none"`         | `"all"`            | 409 with the default, 365 with `"es5"` |
| Lines wrap at 100 columns                                                     | `printWidth: 100`               | `100`              | 429 at 80, 319 at 120                  |
| Indentation with spaces, two per level                                        | `useTabs: false`, `tabWidth: 2` | the same           | 501 with tabs, 528 at width 4          |
| Semicolons                                                                    | `semi`                          | `true`             | 481 without                            |
| Double quotes                                                                 | `singleQuote`                   | `false`            | 471 with single quotes                 |
| Parentheses around a sole arrow parameter                                     | `arrowParens`                   | `"always"`         | 287 with `"avoid"`                     |
| Spaces inside object braces                                                   | `bracketSpacing`                | `true`             | 451 without                            |
| Objects keep the author's one-line or multi-line choice                       | `objectWrap`                    | `"preserve"`       | 55 with `"collapse"`                   |
| Property keys quoted only where needed                                        | `quoteProps`                    | `"as-needed"`      | 12 with `"consistent"`                 |
| A multi-line JSX element's `>` on its own line                                | `bracketSameLine`               | `false`            | 30 with `true`                         |
| Operators at the end of a wrapped line                                        | `experimentalOperatorPosition`  | `"end"`            | 52 with `"start"`                      |
| LF line endings (also forced by `.gitattributes`)                             | `endOfLine`                     | `"lf"`             | all 555 with `"crlf"`                  |
| A final newline                                                               | `insertFinalNewline`            | `true`             | all 555 without                        |
| Markdown prose wrapping left as written                                       | `proseWrap`                     | `"preserve"`       | 53 Markdown files with `"always"`      |
| JSDoc comments left as written                                                | `jsdoc`                         | off                | 110 with `true`                        |
| Imports left in the order written (ordering is not the formatter's job today) | `sortImports`                   | off                | 160 with `true`                        |

Only `trailingComma` differs from oxfmt's default today; the current file also states `printWidth`,
`useTabs` and `tabWidth` at their default values. Removing those three or the ignore list changes
no file. `sortPackageJson` (default on) changes nothing either way, because `package.json` is
already in that order. Whether the rewrite states default values explicitly is `lint Q14`.

The `l10n:export` script formats `l10n/bundle.l10n.json` with these options and `l10n:check`
diffs it against the committed file, so JSON output must stay exactly as it is.

### 2.6 What must keep working

- **The webview text rule.** The plugin stays loaded and its rule stays at error for every `.tsx`
  file under `src/webview/`. This part is Branchwise's own configuration and may be kept verbatim:
  the root configuration's `jsPlugins` list contains the string `"./oxlint/webview-text.cjs"`, and
  one override reads

  ```jsonc
  {
    // Every word the webview shows comes from window.l10n.
    "files": ["src/webview/**/*.tsx"],
    "rules": {
      "webview/no-hard-coded-text": "error"
    }
  }
  ```

  The rule only looks at JSX, so `.ts` files do not need it; `lint Q7` asks whether its scope
  should change.

- **Disable directives in the code.** The tree carries 36 disable comments. 35 use the `eslint-`
  prefix and one the `oxlint-` prefix, so `options.respectEslintDisableDirectives` must stay at
  its default, `true`. They name four rules (`tests-ext/ui/benchmark.cjs` has two file-wide
  comments):

  | Rule named                          | File-wide (`/* eslint-disable … */`)                                                   | Single line                                                                                                                                   |
  | ----------------------------------- | -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
  | `no-await-in-loop`                  | `scripts/benchmark.mjs`, `tests-ext/ui/history.test.cjs`, `tests-ext/ui/benchmark.cjs` | 21 lines in `src/backend/`, `src/extension/`, `src/webview/lib/`, `scripts/` and `tests/backend/`                                             |
  | `no-console`                        | `scripts/provenance.cjs`, `scripts/test-ui-harness.cjs`                                | 8 lines: `src/backend/gitClient.ts` (3), `src/webview/lib/dispatcher.ts`, `src/webview/components/ui/ErrorBoundary.tsx`, and three test files |
  | `import/no-relative-parent-imports` | `tests-ext/ui/benchmark.cjs`                                                           | none                                                                                                                                          |
  | `no-template-curly-in-string`       | none                                                                                   | 1 line in `oxlint/webview-text.test.cjs`                                                                                                      |

  A directive for a rule that is not enabled for its file is harmless, unless unused directives
  are reported (`lint Q5`). With today's configuration none is unused
  (`oxlint --report-unused-disable-directives` reports nothing). A rule that the rewrite enables
  and that these comments do not cover must produce no diagnostic on the tree, or the code has to
  change, which is outside this rewrite.

- **Build scripts print to the terminal.** `esbuild.js` (5 calls) and `scripts/check-l10n.js`
  (2 calls) use `console` without a directive; `scripts/provenance.cjs` and
  `scripts/test-ui-harness.cjs` print under their file-wide directives.

---

## 3. What the rewrite chooses (B), and the facts to choose from

The rewrite chooses, with the maintainer's answers to section 5:

- which plugins to turn on, and which categories at which level;
- which single rules to add to or remove from those categories, at which level and with which
  options, and for which files (overrides);
- ignore patterns beyond the folders of 2.3;
- the `options` object (warnings, unused directives);
- whether to split the lint configuration across several files, and how;
- comments.

It does not start from the current rule list. This section gives what a selection can be derived
from: what each category reports on the tree today (3.1–3.3), where those reports come from (3.4),
the conventions the code already follows (3.5), and what the commands and CI require (3.6).

### 3.1 How the survey was made

For each category in turn, oxlint ran on the scratch copy with this configuration and
`-f json`, the category named at `"error"` and the six others at `"off"`:

```jsonc
{
  "plugins": [
    "eslint",
    "typescript",
    "unicorn",
    "oxc",
    "import",
    "node",
    "promise",
    "jsdoc",
    "react",
    "react-perf",
    "jsx-a11y",
    "vitest",
    "jest"
  ],
  "categories": {/* one category "error", the others "off" */},
  "ignorePatterns": ["out/**", "node_modules/**"],
  "env": { "node": true },
  "overrides": [
    { "files": ["tests-ext/**/*.{ts,cjs}"], "env": { "mocha": true } },
    { "files": ["src/webview/**/*.{ts,tsx}"], "env": { "node": false, "browser": true } }
  ]
}
```

No rule was set singly and no rule options were given, so every rule ran with its defaults. The
tree's disable directives (2.6) were in force, so the counts leave out what those comments
suppress. `nextjs` and `vue` were left out because the project uses neither. Rule names below are
as diagnostics print them, without the plugin prefix; "(hooks)" marks the React hook rules.
**A rule that a category contains but that is not listed reported nothing**, so turning it on
costs nothing on today's tree.

### 3.2 Totals

| Category    | Rules run | Rules that report | Diagnostics | `src/webview` | other `src` | `tests` | `tests-ext` | `scripts` | `oxlint` | root files |
| ----------- | --------: | ----------------: | ----------: | ------------: | ----------: | ------: | ----------: | --------: | -------: | ---------: |
| correctness |       205 |                30 |         825 |            81 |           0 |     698 |          46 |         0 |        0 |          0 |
| suspicious  |        52 |                 7 |         883 |           863 |           7 |      12 |           1 |         0 |        0 |          0 |
| perf        |        15 |                 6 |         218 |           218 |           0 |       0 |           0 |         0 |        0 |          0 |
| nursery     |         9 |                 2 |         546 |             1 |           0 |     544 |           0 |         0 |        0 |          1 |
| pedantic    |       105 |                39 |        2541 |           477 |         353 |    1476 |         140 |        81 |        6 |          8 |
| style       |       261 |               126 |       35251 |          4149 |        2262 |   27293 |         838 |       585 |       33 |         91 |
| restriction |        97 |                43 |        9553 |          1552 |         732 |    6642 |         282 |       271 |       26 |         48 |

How many rules each plugin has in each category in oxlint 1.79 ("t" counts the type-aware rules of
2.2, which do not run without `oxlint-tsgolint` and are not in "Rules run" above):

| Plugin     | correctness | suspicious | perf | nursery |  pedantic |    style | restriction |
| ---------- | ----------: | ---------: | ---: | ------: | --------: | -------: | ----------: |
| eslint     |          57 |         13 |    2 |       4 |        33 |       54 |          24 |
| typescript |   27 (15 t) |   12 (9 t) |    – | 2 (2 t) | 26 (21 t) | 25 (9 t) |    18 (3 t) |
| unicorn    |          13 |         10 |    3 |       1 |        48 |       49 |          14 |
| oxc        |          14 |          4 |    2 |       – |         1 |        – |           6 |
| import     |           2 |          6 |    – |       2 |         1 |       13 |           9 |
| node       |           – |          – |    – |       – |         – |        6 |           5 |
| promise    |           3 |          3 |    – |       1 |         – |        7 |           2 |
| jsdoc      |           9 |          – |    – |       – |         9 |        3 |           2 |
| react      |          31 |         11 |    4 |       1 |         6 |       14 |          18 |
| react-perf |           – |          – |    4 |       – |         – |        – |           – |
| jsx-a11y   |          35 |          – |    – |       – |         – |        – |           1 |
| vitest     |          17 |          1 |    – |       – |         1 |       53 |           1 |
| jest       |          12 |          1 |    – |       – |         1 |       46 |           – |
| nextjs     |          21 |          – |    – |       – |         – |        – |           – |
| vue        |          31 |          2 |    – |       – |         – |       10 |           3 |

### 3.3 Diagnostics per category and rule

Plugins that reported nothing in a category are left out of its table.

**correctness (825).** `eslint`, `typescript`, `unicorn`, `oxc`, `import`, `node` and `jsdoc`
report nothing.

| Plugin   | Diagnostics | Rules (diagnostics)                                                                                                                                                                                                                                                                                                                                               |
| -------- | ----------: | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| vitest   |         534 | require-mock-type-parameters 379, require-to-throw-message 78, no-conditional-expect 25, valid-expect 21, expect-expect 17, no-standalone-expect 12, no-disabled-tests 1, no-conditional-tests 1                                                                                                                                                                  |
| jest     |         207 | require-to-throw-message 78, expect-expect 54, valid-expect 37, no-conditional-expect 25, no-standalone-expect 12, no-disabled-tests 1                                                                                                                                                                                                                            |
| react    |          45 | immutability 29, refs 8, exhaustive-deps (hooks) 5, globals 2, purity 1                                                                                                                                                                                                                                                                                           |
| jsx-a11y |          38 | prefer-tag-over-role 20, click-events-have-key-events 4, control-has-associated-label 3, no-noninteractive-element-interactions 2, no-static-element-interactions 2, no-interactive-element-to-noninteractive-role 2, no-noninteractive-element-to-interactive-role 2, mouse-events-have-key-events 1, no-noninteractive-tabindex 1, interactive-supports-focus 1 |
| promise  |           1 | no-callback-in-promise 1                                                                                                                                                                                                                                                                                                                                          |

**suspicious (883).**

| Plugin  | Diagnostics | Rules (diagnostics)                                                          |
| ------- | ----------: | ---------------------------------------------------------------------------- |
| react   |         847 | react-in-jsx-scope 837, style-prop-object 6, no-unstable-nested-components 4 |
| unicorn |          26 | require-post-message-target-origin 26                                        |
| promise |           9 | always-return 8, no-promise-in-callback 1                                    |
| import  |           1 | no-unassigned-import 1                                                       |

**perf (218).** Everything is in `src/webview`.

| Plugin     | Diagnostics | Rules (diagnostics)                                                                                              |
| ---------- | ----------: | ---------------------------------------------------------------------------------------------------------------- |
| react-perf |         208 | jsx-no-new-function-as-prop 173, jsx-no-jsx-as-prop 17, jsx-no-new-object-as-prop 11, jsx-no-new-array-as-prop 7 |
| react      |          10 | no-array-index-key 9, no-object-type-as-default-prop 1                                                           |

**nursery (546).**

| Plugin | Diagnostics | Rules (diagnostics)                                                                                                                        |
| ------ | ----------: | ------------------------------------------------------------------------------------------------------------------------------------------ |
| eslint |         545 | no-undef 545 (544 in `tests/webview`, the DOM globals and `acquireVsCodeApi` of 2.4; 1 in `src/webview/lib/vscode.ts`, `acquireVsCodeApi`) |
| import |           1 | named 1 (`.vscode-test.mjs`)                                                                                                               |

**pedantic (2541).**

| Plugin     | Diagnostics | Rules (diagnostics)                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ---------- | ----------: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| jsdoc      |        1164 | require-param 592, require-returns 572                                                                                                                                                                                                                                                                                                                                                                                                           |
| eslint     |         732 | max-lines-per-function 317, require-unicode-regexp 226, require-await 68, max-lines 53, no-promise-executor-return 33, no-loop-func 10, no-inline-comments 7, no-useless-return 6, no-negated-condition 4, max-depth 3, max-classes-per-file 2, no-new-wrappers 1, prefer-promise-reject-errors 1, no-inner-declarations 1                                                                                                                       |
| vitest     |         216 | no-conditional-in-test 216                                                                                                                                                                                                                                                                                                                                                                                                                       |
| jest       |         216 | no-conditional-in-test 216                                                                                                                                                                                                                                                                                                                                                                                                                       |
| unicorn    |         158 | no-useless-undefined 58, no-array-callback-reference 28, prefer-dom-node-dataset 26, prefer-query-selector 9, explicit-length-check 6, no-negated-condition 4, prefer-string-replace-all 4, prefer-top-level-await 4, prefer-dom-node-append 3, prefer-number-coercion 3, escape-case 3, no-object-as-default-parameter 3, prefer-code-point 2, new-for-builtins 2, prefer-native-coercion-functions 1, prefer-array-some 1, prefer-type-error 1 |
| import     |          47 | max-dependencies 47                                                                                                                                                                                                                                                                                                                                                                                                                              |
| react      |           7 | rules-of-hooks (hooks) 5, jsx-no-useless-fragment 2                                                                                                                                                                                                                                                                                                                                                                                              |
| typescript |           1 | ban-types 1                                                                                                                                                                                                                                                                                                                                                                                                                                      |

**style (35251).**

| Plugin     | Diagnostics | Rules (diagnostics)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ---------- | ----------: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| eslint     |       15606 | no-magic-numbers 5565, one-var 3218, sort-keys 2176, func-style 1230, sort-imports 914, id-length 676, no-ternary 604, max-statements 440, init-declarations 269, prefer-template 145, capitalized-comments 121, prefer-destructuring 72, max-params 63, prefer-named-capture-group 46, no-nested-ternary 27, no-continue 16, func-names 13, prefer-object-spread 6, no-duplicate-imports 3, prefer-const 1, default-param-last 1                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| vitest     |        7286 | prefer-expect-assertions 2217, prefer-strict-equal 1450, require-top-level-describe 692, consistent-test-it 436, max-expects 433, no-hooks 406, prefer-to-be-truthy 278, no-importing-vitest-globals 260, prefer-to-be-falsy 244, prefer-expect-resolves 236, prefer-import-in-mock 216, prefer-called-times 109, require-hook 83, prefer-lowercase-title 42, prefer-describe-function-title 41, prefer-called-once 41, prefer-hooks-in-order 18, prefer-mock-return-shorthand 14, padding-around-test-blocks 12, padding-around-after-all-blocks 8, no-alias-methods 8, prefer-called-exactly-once-with 7, prefer-to-be 7, prefer-hooks-on-top 5, prefer-expect-type-of 5, prefer-importing-vitest-globals 5, prefer-mock-promise-shorthand 3, prefer-called-with 3, prefer-strict-boolean-matchers 2, prefer-to-have-been-called-times 2, prefer-each 2, no-duplicate-hooks 1 |
| jest       |        6496 | prefer-expect-assertions 2217, prefer-strict-equal 1450, require-top-level-describe 692, consistent-test-it 436, max-expects 433, no-hooks 406, prefer-expect-resolves 236, no-untyped-mock-factory 216, prefer-ending-with-an-expect 196, require-hook 83, prefer-lowercase-title 42, prefer-hooks-in-order 18, prefer-mock-return-shorthand 14, padding-around-test-blocks 12, padding-around-after-all-blocks 8, no-alias-methods 8, prefer-to-be 7, prefer-hooks-on-top 5, prefer-importing-jest-globals 5, prefer-mock-promise-shorthand 3, prefer-called-with 3, prefer-to-have-been-called-times 2, prefer-each 2, no-duplicate-hooks 1, no-done-callback 1                                                                                                                                                                                                              |
| unicorn    |        2384 | no-null 1166, prefer-global-this 585, no-await-expression-member 160, filename-case 153, switch-case-braces 97, max-nested-calls 85, prefer-string-raw 37, numeric-separators-style 31, no-nested-ternary 24, number-literal-case 9, consistent-existence-index-check 8, prefer-structured-clone 7, catch-error-name 6, no-unreadable-array-destructuring 3, no-useless-collection-argument 3, error-message 3, prefer-ternary 2, relative-url-style 2, explicit-timer-delay 1, prefer-spread 1, prefer-export-from 1                                                                                                                                                                                                                                                                                                                                                           |
| import     |        2035 | no-named-export 651, group-exports 528, no-nodejs-modules 357, no-namespace 196, exports-last 184, prefer-default-export 86, consistent-type-specifier-style 30, first 3                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| node       |         600 | no-sync 596, global-require 2, callback-return 1, exports-style 1                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| typescript |         498 | array-type 237, consistent-type-definitions 129, consistent-type-imports 106, method-signature-style 20, parameter-properties 4, no-inferrable-types 1, consistent-indexed-object-style 1                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| react      |         243 | jsx-max-depth 197, jsx-props-no-spreading 41, hook-use-state 3, jsx-handler-names 2                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| promise    |         103 | avoid-new 51, prefer-await-to-then 40, prefer-await-to-callbacks 10, param-names 2                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |

**restriction (9553).** `jsdoc` and `promise` report nothing.

| Plugin     | Diagnostics | Rules (diagnostics)                                                                                                                                                                                                          |
| ---------- | ----------: | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| typescript |        3182 | explicit-function-return-type 1793, no-non-null-assertion 852, explicit-module-boundary-types 271, no-require-imports 86, no-var-requires 86, explicit-member-accessibility 80, no-invalid-void-type 12, no-dynamic-delete 2 |
| oxc        |        2298 | no-async-await 1301, no-optional-chaining 556, no-rest-spread-properties 441                                                                                                                                                 |
| vitest     |        2209 | require-test-timeout 2209                                                                                                                                                                                                    |
| eslint     |         973 | no-undefined 547, no-empty-function 135, no-plusplus 87, no-void 66, no-use-before-define 45, class-methods-use-this 41, default-case 12, no-bitwise 11, complexity 11, no-implicit-globals 9, no-console 7, no-empty 2      |
| react      |         550 | no-unknown-property 378, no-multi-comp 63, jsx-filename-extension 43, only-export-components 34, jsx-no-literals 20, button-has-type 11, prefer-function-component 1                                                         |
| import     |         157 | no-commonjs 99, no-cycle 35, unambiguous 21, no-default-export 2                                                                                                                                                             |
| unicorn    |         105 | import-style 62, no-array-for-each 18, prefer-module 17, no-array-reduce 4, prefer-number-properties 3, no-process-exit 1                                                                                                    |
| node       |          79 | no-process-env 67, no-top-level-await 12                                                                                                                                                                                     |

### 3.4 Where the reports come from

These facts explain groups of the numbers above. They are observations about the code and the
tools, not decisions.

- **The webview is Preact, not React.** `src/webview/tsconfig.json` compiles JSX with the automatic
  runtime from `preact` (`"jsx": "react-jsx"`, `"jsxImportSource": "preact"`), components write
  `class` (397 uses, no `className`), and some pass `style` as a string. The `react` plugin
  assumes React: `react-in-jsx-scope` (837), `no-unknown-property` (378, the `class` attributes),
  `style-prop-object` (6) and `jsx-filename-extension` (43, which objects to `.tsx`) all come from
  that. `only-export-components` (34) concerns React Fast Refresh, which the esbuild build does not
  use. The hook rules recognise `preact/hooks` calls by name and report real candidates
  (`exhaustive-deps` 5, `rules-of-hooks` 5, the latter in test harnesses).
- **Jest and Vitest rules overlap.** The project has no Jest: `tests/` uses Vitest, `tests-ext/`
  uses Mocha with `node:assert`. oxlint's `jest` rules also run on Vitest files, and most have a
  `vitest` twin, so turning both plugins on reports the same finding twice (for example
  `require-to-throw-message` 78 + 78). Both plugins also report on the Mocha files in `tests-ext/`
  (for example `expect-expect` 41 there, because Mocha tests assert with `node:assert`).
  `vitest/no-importing-vitest-globals` (260) and `vitest/prefer-importing-vitest-globals` (5)
  contradict each other; the Vitest suites import their API explicitly (2.4).
- **`postMessage` without a target origin.** All 26 `unicorn/require-post-message-target-origin`
  reports are calls on VS Code's messaging objects, which take one argument: the page's API object
  from `acquireVsCodeApi()` in `src/webview` (15), `webview.postMessage` in the extension host
  (4), and test doubles (7). The rule is written for `window.postMessage`.
- **The stylesheet import.** `import/no-unassigned-import` reports `src/webview/main.tsx`, which
  imports `./styles.css` for its side effect; esbuild bundles it.
- **`.vscode-test.mjs`.** `import/named` reports that `defineConfig` is not exported by
  `@vscode/test-cli`. The package does export it (the test runner loads this file); the import
  plugin does not resolve it.
- **CommonJS scripts.** The package has no `"type": "module"`, and the scripts, the lint plugin and
  its test, and the UI tests are CommonJS by design (`.cjs`, plus `esbuild.js` and
  `scripts/check-l10n.js`). `import/no-commonjs` (99), `typescript/no-require-imports` (86),
  `typescript/no-var-requires` (86), `import/unambiguous` (21), `unicorn/prefer-module` (17) and
  `node/global-require` (2) report that choice.
- **Modern syntax.** `oxc/no-async-await` (1301), `oxc/no-optional-chaining` (556) and
  `oxc/no-rest-spread-properties` (441) forbid syntax for old targets. The source is written for
  `esnext` (`tsconfig.base.json`) and uses all three throughout; esbuild lowers syntax to each
  bundle's target when it builds `out/` (`esbuild.js`).
- **Console and sequential awaits.** With the directives of 2.6 in force, `eslint/no-console`
  reports only `esbuild.js` (5) and `scripts/check-l10n.js` (2), and `eslint/no-await-in-loop`
  reports nothing.
- **Environments.** `eslint/no-undef` reports only the globals of 2.4.
- **Real findings.** Some groups point at code rather than at a mismatch between rule and project:
  `import/no-cycle` (35, of which 31 in `src/webview`), the `jsx-a11y` reports (38),
  `react/immutability` (29 in 9 files) and `react/refs` (8, all in `CommitTable.tsx`), and
  `react/no-unstable-nested-components` (4). Enabling such a rule means changing the code first,
  which is outside this rewrite (`lint Q2`).
- **Rules that fight the formatter.** `unicorn/number-literal-case` wants upper-case hexadecimal
  digits; oxfmt prints them in lower case. On a sample, `oxlint --fix` turned `0xff` into `0xFF`
  and `oxfmt --check` then failed, and formatting undid the fix. `unicorn/escape-case` and
  `unicorn/empty-brace-spaces` were checked the same way and do not conflict (oxfmt keeps string
  escapes as written and prints empty braces as `{}`).
- **Rules about import order.** `eslint/sort-imports` (914) orders imports by a scheme that
  disagrees with the grouped layout of 3.5 on 335 files. `import/consistent-type-specifier-style`
  (30) objects to inline `type` specifiers, which the tree uses alongside `import type`.
- **Naming.** `unicorn/filename-case` (153) expects one case for file names; the tree mixes
  kebab-case (`rpc-client.ts`), PascalCase for Preact components (`CommitTable.tsx`), camelCase
  (`gitClient.ts`) and dotted names (`config.watcher.ts`).
- **Duplicates of the type checker.** `pnpm run typecheck` already runs `tsc` with `strict`,
  `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`, `noUncheckedIndexedAccess`,
  `exactOptionalPropertyTypes`, `verbatimModuleSyntax` (type-only imports must say `type`) and
  `noUncheckedSideEffectImports` (`tsconfig.base.json`). Lint rules that check the same things add
  a second report, not a new guarantee.

### 3.5 Conventions visible in the code

These hold across the tree today, and several Branchwise specifications state them as premises
for modules already rewritten (see the end of this section).

- **Localized webview text.** Every word the webview shows comes from `window.l10n` (Branchwise's
  rule, 2.6).
- **Import layout.** Each file's imports come in groups separated by one blank line: Node
  built-ins, always with the `node:` prefix; then packages (`vscode`, `preact`, `@preact/signals`,
  `vitest`, `simple-git`, and so on); then `@/…` imports; then `@tests/…` imports; then relative
  `./…` imports. Within a group, imports are in alphabetical order of the module path, ignoring
  case. Type-only imports are written either as `import type { … }` or with inline `type`
  specifiers, and sit in the group of their path.
- **Path aliases instead of parent paths.** `@/` means `src/` and `@tests/` means `tests/`
  (`tsconfig.base.json` paths, Vitest aliases, `tsc-alias` for `tests-ext`). No module imports from
  a parent folder with `../`, except `tests-ext/ui/benchmark.cjs`, which requires
  `../../scripts/benchmark-fixture.cjs` under a file-wide directive. Sibling imports (`./…`) are
  used.
- **Response handlers only update state.** Nothing under `src/webview/lib/handler/` imports
  `@/webview/lib/vscode` (the page's one VS Code API object); requests start from the action
  modules. `webview-state.md` (§0.3) records this as a repository rule that lint enforces, and
  today an override does enforce it (the probe in 1.3 is reported).
- **Intentionally unused names start with `_`** (181 parameters in `src/` and `tests/`, such as
  `(_name, run)`). oxlint's `eslint/no-unused-vars` already treats a leading `_` as intentional by
  default; so does TypeScript's `noUnusedParameters`.
- **Braces on every `if`, `for` and `while` body.** No single-statement body without braces
  exists in the tree.
- **Console output and sequential awaits are deliberate and marked.** Outside the build and check
  scripts, each `console` call and each `await` inside a loop carries a disable comment (2.6).
  Branchwise's newer comments give the reason after `--`, for example
  `// eslint-disable-next-line no-await-in-loop -- A lane runs one task at a time.` in
  `src/backend/utils/promise.ts` and
  `/* eslint-disable no-console -- This script reports provenance to the terminal. */` at the top
  of `scripts/provenance.cjs`.

Specifications that state lint expectations as premises: `webview-state.md` (§0.3),
`backend-queries.md`, `tests-backend-queries.md`, `tests-webview-menus.md` (§1.3),
`tests-webview-utils.md` (§1.4), `ui-wording.md`, `dialog.md`, `menus.md`, `dropdown.md` and
`extension-watchers.md`. They describe the import layout, the `node:` prefix, the ban on `../`
imports, braces, the `_` prefix, `console` and the handler rule as things `pnpm run lint`
checks (`lint Q12`).

### 3.6 What the commands and CI require

- **Exit status.** oxlint exits with 1 only when an error-level diagnostic is reported. With
  warnings alone it exits 0 (checked); `--deny-warnings` or `options.denyWarnings: true` makes
  warnings fail too (checked). No script passes `--deny-warnings`, `--max-warnings` or `--quiet`,
  and CI runs `pnpm run lint` unchanged. So a rule at `"warn"` would print in CI and still pass.
  Today there are no diagnostics at any level (`lint Q4`).
- **Unused directives.** Nothing reports disable comments that suppress nothing. Today there are
  none (`lint Q5`).
- **Order in CI.** The `lint` job runs `pnpm run format` first, then
  `pnpm run lint && pnpm run test:lint-rules`; any failure fails the job.
- **Fixes.** `pnpm run lint:fix` runs `oxlint --fix`, which applies the fixes rules mark as safe
  and leaves suggestions and dangerous fixes alone (`--fix-suggestions` and `--fix-dangerously`
  are not used). Some rules take options that change what their fix does; the current
  configuration uses such an option for unused imports and variables (`lint Q9`).
- **Formatter first.** oxfmt owns layout: indentation, wrapping, quotes, semicolons, commas and
  blank lines. The lint configuration must not enable a rule whose fix the formatter reverses
  (3.4). oxfmt's own import sorting is off (2.5); import order is a lint concern today (`lint Q6`).
- **Speed.** The full lint of 468 files took about 1.7 s on 4 threads with the current
  configuration, including the two JS plugins; the format check of 556 files took about 7 to 11
  s. Nothing depends on these times.

### 3.7 Splitting the configuration

The current lint configuration is a root file that `extends` four files in `oxlint/`. Facts for
any split (`lint Q3`):

- `extends` takes paths relative to the extending file. Settings in the extending file take
  precedence over those it extends (checked in both directions with one rule).
- Overrides in extended files match paths from the repository root (2.1).
- Extended files must not be named `.oxlintrc.json` or `.oxlintrc.jsonc`, or oxlint also loads them
  as nested configurations for their own folder (2.1). The `oxlint/` folder also holds the
  Branchwise plugin and its test, which the configuration lints like any other code.
- The directive options (`reportUnusedDisableDirectives`, `respectEslintDisableDirectives`) are
  honoured only in the root file.
- Each extended file needs its own `$schema` path relative to its folder, if it declares one (2.1).

---

## 4. Obsolete entries (C)

Each entry below was removed on its own from a scratch copy of the current configuration, and the
lint or format result was compared with the unchanged one. None of these needs an equivalent in
the rewrite.

| Entry today                                                                                                               | Why it no longer applies                                                                                                                                                                                                       | Effect of removing it  |
| ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------- |
| An exception that allows awaiting inside loops in `src/backend/utils/repoSearch.ts`, with a comment asking for a refactor | The module was rewritten in `39e0d81` and no longer awaits in a loop. (`715fa1b` already removed `src/backend/queries/loadCommits.ts` from the same exception for the same reason.)                                            | none                   |
| A rule entry that turns `eslint/no-underscore-dangle` off                                                                 | The rule reports nothing on the tree with its default options, so turning it off changes nothing.                                                                                                                              | none                   |
| The lint ignore pattern `*.config.js`                                                                                     | No file matches, tracked or generated. The one configuration file of that kind, `vitest.config.ts`, is TypeScript and is linted.                                                                                               | none                   |
| The format ignore pattern `**/*.ctx.md`                                                                                   | No such file exists, and nothing in the repository creates one.                                                                                                                                                                | none                   |
| The ignore patterns `.pnpm-store/**` and `.idea/**`, in both configurations                                               | Neither folder exists in the repository, `.gitignore` does not mention them, and no script creates them. They matter only on a machine where pnpm's store or a JetBrains project folder sits inside the checkout (`lint Q10`). | none in the tree or CI |
| The `argsIgnorePattern` and `varsIgnorePattern` options of `eslint/no-unused-vars`                                        | They restate oxlint's defaults: an unused variable or parameter whose name starts with `_` is not reported either way (checked on a sample).                                                                                   | none                   |
| The one type-aware rule the configuration names                                                                           | It needs `oxlint-tsgolint`, which is not installed, so oxlint skips it (2.2, `lint Q11`).                                                                                                                                      | none                   |

Not obsolete, though they may look it:

- The root `out/**` and `node_modules/**` ignore patterns change nothing today because
  `.gitignore` already covers them, but they are the explicit form of a requirement (2.3);
  whether to keep that form is `lint Q10`.
- The exceptions for `eslint/no-undef` still suppress 544 reports in `tests/webview` and 1 in
  `src/webview/lib/vscode.ts`. They are broader than needed: `tests/backend` and `tests/extension`
  need none (`lint Q15`).
- Every other exception in today's configuration, per file or per rule, still suppresses reports
  that 2.4 and 3.4 describe, for as long as the rule concerned is on.

Also wrong rather than obsolete: the comments beside the category settings in the root file are
partly mistaken. The comments on the `nursery` and `restriction` lines each describe the other
category. The rewrite writes its own comments.

---

## 5. Questions for the maintainer

Each question states what happens today and decides nothing.

- **lint Q1 — categories.** Today `correctness`, `suspicious`, `perf` and `nursery` are errors and
  `pedantic`, `style` and `restriction` are off, with single rules from the last three turned on
  one by one. With the plugins the survey used, `correctness` reports 825 diagnostics and
  `suspicious` 883, almost all from plugins the current configuration does not enable (3.3).
  `nursery` rules may change between oxlint releases. Which categories should be errors, which
  warnings (see Q4), and which off, and are single rules from the other categories wanted?
- **lint Q2 — plugins.** Today the configuration lists `typescript`, `unicorn`, `oxc`, `import`
  and `node` (`eslint` is always on), plus the two JS plugins. The survey shows what `react`,
  `react-perf`, `jsx-a11y`, `vitest`, `jest`, `promise` and `jsdoc` would report, including the
  Preact mismatches, the Jest/Vitest duplicates and the reports on Mocha files (3.4), and the
  groups that point at real code (import cycles, accessibility, hook dependencies). Should any of
  these plugins be added, perhaps for some folders only, with the code fixed first where needed?
- **lint Q3 — one file or several.** Today a root file extends four files in `oxlint/`: one holds
  only per-file exceptions, and three hold single rules, each named after the category its rules
  come from. Keep a split (the same or another), or write one `.oxlintrc.json`?
- **lint Q4 — warnings.** oxlint fails only on errors, and no script or setting denies warnings;
  every rule today is an error and none reports. Should the rewrite use `"warn"` at all, and if
  so, should `options.denyWarnings` (or `--deny-warnings` in the script) make warnings fail CI?
- **lint Q5 — unused directives.** Nothing reports disable comments that suppress nothing, and
  today none does. Should `options.reportUnusedDisableDirectives` be set, and at which level? It
  would flag the directives of 2.6 for any rule the rewrite leaves off.
- **lint Q6 — import order.** The layout of 3.5 is enforced today through `eslint-plugin-import`,
  loaded as a JS plugin under the alias `import-js` and used for nothing else. The alternatives are
  to keep a lint rule for it, to switch to oxfmt's `sortImports` (160 files would change, and its
  grouping differs), or to stop enforcing it. Which? If the JS plugin goes, should the
  devDependency go too?
- **lint Q7 — scope of the webview text rule.** It applies to `src/webview/**/*.tsx`. JSX occurs
  only in `.tsx` files, so `.ts` files cannot trigger it. Keep the scope, or also apply it to
  `.tsx` files elsewhere (there are none today)? `react/jsx-no-literals` would overlap with it and
  is stricter (it reports punctuation such as `: `, 20 times).
- **lint Q8 — the response-handler rule.** Today an override forbids files under
  `src/webview/lib/handler/` from importing `@/webview/lib/vscode`, by the alias or by a relative
  path, and the report explains why. `webview-state.md` relies on it. Keep the rule, in the
  rewrite's own wording, for the same folder?
- **lint Q9 — fixes and unused names.** The current configuration sets how `lint:fix` fixes unused
  imports and unused variables, and restates the `_` ignore patterns that are oxlint's defaults
  (section 4). Should the rewrite configure that fix behaviour, or take oxlint's defaults?
- **lint Q10 — ignore lists.** Both tools already skip the folders of 2.3 through `.gitignore`.
  Should the configurations also list all six folders (today they list only the root `out/` and
  `node_modules/`), rely on `.gitignore` alone, or list only `node_modules/` for oxlint, which does
  not skip it by itself? Keep the developer-environment entries `.pnpm-store/` and `.idea/`?
- **lint Q11 — type-aware rules.** 59 rules need `oxlint-tsgolint`, which is not a dependency; the
  current configuration names one of them, to no effect. Add the package and enable type-aware
  linting (in the script or `options.typeAware`), or leave type-aware rules out?
- **lint Q12 — premises in other specifications.** Between them, ten specifications (listed at the
  end of 3.5) say that `pnpm run lint` checks the webview text, the import layout, the `node:`
  prefix, the ban on `../` imports, braces, the `_` prefix, `console` and the handler rule, and
  rewritten modules were written against that. Must the new configuration keep checking each of
  these? If some are dropped, should those specifications be updated in the same change?
- **lint Q13 — editors.** `.vscode/` configures neither tool: no recommended extension, no
  formatter, no format-on-save. Should the repository recommend the oxc extension or set it as the
  default formatter? (`.vscode/` is outside this rewrite; the answer would be a separate change.)
- **lint Q14 — formatter options at their defaults.** `.oxfmtrc.jsonc` states `printWidth`,
  `useTabs` and `tabWidth` at oxfmt's default values, states `trailingComma` (the one real
  difference), and has no `$schema`. Should the rewrite state every option of 2.5 whose effect is
  fixed, so that a change of default in a later oxfmt release cannot reformat the tree, or only
  the non-default one? Add `$schema`? Keep `sortPackageJson` at its default (on)?
- **lint Q15 — undefined globals.** Today `eslint/no-undef` is on (as part of `nursery`) but off
  for every `.ts` file under `tests/` and `src/webview/`. The reports it would make are exactly the
  DOM globals in `tests/webview` and `acquireVsCodeApi` (2.4). Keep it off for those files, or
  declare the browser environment for `tests/webview` and `acquireVsCodeApi` as a global
  (`globals`), so that the rule also checks those files?
- **lint Q16 — where exceptions live.** `esbuild.js` and `scripts/check-l10n.js` may print because
  the configuration exempts them, while `scripts/provenance.cjs` and `scripts/test-ui-harness.cjs`
  carry file-wide directives. Should exceptions for single files be in the configuration or in the
  files? (Changing the files is outside this rewrite.)
- **lint Q17 — obsolete entries.** Drop every entry of section 4?

---

## Decisions

These decisions are the maintainer's answers to the questions above; where they differ from the rest of this specification, they win. The aim is a configuration derived from Branchwise's needs, at about the strictness of today's, not a copy of the current rule list.

- **Q1.** Enable the `correctness`, `suspicious` and `perf` categories at `error` for the plugins the code uses (the core eslint rules, `typescript`, `unicorn`, `oxc`, `import`, `node`). Leave `nursery`, `pedantic`, `style` and `restriction` off as categories. Enable individual rules from them only where Q12 needs them or where the rule guards a mistake the code base has a reason to fear, each with a one-line comment saying why. Turn off, with a comment, any rule that does not apply to this code (such as the `postMessage` target-origin rule, which does not apply to VS Code's API).
- **Q2.** Add no further plugins in this batch.
- **Q3.** One `.oxlintrc.json`; remove the `oxlint/*.config.json` files. Branchwise's own `oxlint/webview-text.cjs` stays.
- **Q4.** No warnings: every rule is `error` or off.
- **Q5.** Report unused disable directives as errors if the tree has none today; if it has some, remove them in this change.
- **Q6.** Keep enforcing today's import layout with `eslint-plugin-import`'s ordering rule (3.5), so no file is reformatted.
- **Q7.** Keep the webview text rule's scope at `src/webview/**/*.tsx`.
- **Q8.** Keep the handler import rule, with a message in new words.
- **Q9.** Take oxlint's default fixes.
- **Q10.** Rely on `.gitignore` for the ignored folders, and also ignore `node_modules/**` explicitly, since oxlint does not skip it on its own. Drop `.pnpm-store` and `.idea`.
- **Q11.** No type-aware rules; do not add `oxlint-tsgolint`.
- **Q12.** Yes: the new configuration keeps checking every convention in 3.5 that other specifications state as a premise: the webview text, the import layout, the `node:` prefix, the ban on `../` imports, braces, the `_` prefix for unused names, `console` and `await` in loops only where marked, and the handler rule.
- **Q13.** No change to `.vscode/` here.
- **Q14.** `.oxfmtrc.jsonc` gets a `$schema` and states only the options that differ from oxfmt's defaults (`trailingComma`), plus any ignore patterns still needed. Keep `sortPackageJson` at its default, since the manifest's field order relies on it.
- **Q15.** Enable `no-undef` for all code, and declare the environments instead of turning it off: Node for the extension, scripts and backend tests; the browser for `src/webview` and `tests/webview`; mocha for `tests-ext`; and `acquireVsCodeApi` as a global where the page uses it.
- **Q16.** Keep one-file exceptions in the configuration as overrides, each with a comment.
- **Q17.** Yes: drop every obsolete entry in section 4.
