# Clean-room specification: the webview UI kit, the three plain pages and the stylesheet

This document covers ten modules of the Branchwise webview:

| §   | Module                                       | What it is                                                                                   |
| --- | -------------------------------------------- | -------------------------------------------------------------------------------------------- |
| 1   | `src/webview/components/ui/Loading.tsx`      | A "loading" indicator, inline or full-page                                                   |
| 2   | `src/webview/components/ui/Select.tsx`       | A styled native `<select>`                                                                   |
| 3   | `src/webview/components/ui/Button.tsx`       | The standard button, in a neutral and a primary look                                         |
| 4   | `src/webview/components/ui/Icons.tsx`        | A generic SVG icon wrapper and thirteen named 16 × 16 icons                                  |
| 5   | `src/webview/components/ui/Checkbox.tsx`     | A themed checkbox with its label                                                             |
| 6   | `src/webview/components/ui/ScrollShadow.tsx` | A decorative shade at the top edge of the window that depends on scrolling                   |
| 7   | `src/webview/pages/NoRepoPage.tsx`           | The page shown when the workspace has no Git repository                                      |
| 8   | `src/webview/pages/NoCommitsPage.tsx`        | The page shown when the repository has no commits yet                                        |
| 9   | `src/webview/pages/LoadingPage.tsx`          | The full-window loading page                                                                 |
| 10  | `src/webview/styles.css`                     | The webview's only stylesheet: Tailwind, the design tokens, and three hand-written rule sets |

It says what each module must do as seen from outside: its exports, what it renders, how it reacts, and how it must look. It was written by reading the modules, every file that imports them, the modules they import, the unit tests, the VS Code UI workflow tests (`tests-ext/ui/history.test.cjs`, `benchmark.cjs`, `diagnostics.cjs`) and the UI harness (`scripts/test-ui-harness.cjs`), and by running the current code. An engineer who has not seen the current source must be able to build replacements from this document and the repository's tests.

---

## 0. Context shared by all ten modules

### 0.1 Observation environment

- Linux, Node v22.22.2, Vitest 4.1.11, jsdom 30.0.1, Preact 10.29.8, Tailwind CSS 4.3.3 through `@tailwindcss/postcss`, all from the repository's `node_modules`.
- Components were rendered in jsdom by scratch Vitest files outside the repository, using the repository's `@/` alias. The stylesheet was compiled by running `@tailwindcss/postcss` over `src/webview/styles.css` with its real path as `from`, writing the result outside the repository. All scratch files have been deleted.
- Browser-only behaviour (hover, focus rings, animation, scroll timelines, computed colours) comes from CSS semantics and from what the UI workflow tests assert. The VS Code UI tests were not run for this document. The existing unit tests that touch these modules were run and pass.

### 0.2 Framework and language facts every replacement must respect

- Preact 10 with the automatic JSX runtime: `src/webview/tsconfig.json` sets `"jsx": "react-jsx"` and `"jsxImportSource": "preact"`, and `esbuild.js` bundles the webview with `jsx: "automatic"`, `jsxImportSource: "preact"`. The codebase writes the `class` attribute (not `className`).
- TypeScript settings from `tsconfig.base.json` that shape the signatures: `strict`, `exactOptionalPropertyTypes` (an optional prop typed `x?: string` does **not** accept an explicit `undefined`; a prop that callers pass as possibly-undefined must be typed `string | undefined`), `noUncheckedIndexedAccess`, `verbatimModuleSyntax` (type-only imports must be written `import type`), `noUnusedLocals`, `noUnusedParameters`.
- Every export described here is a **named** export. None of the modules has a default export.
- Lint (`pnpm run lint`, oxlint with `.oxlintrc.json`):
  - The local rule `webview/no-hard-coded-text` applies to every `src/webview/**/*.tsx`. It rejects JSX text, string children and string values of `aria-label`, `aria-description`, `aria-roledescription`, `aria-valuetext`, `alt`, `placeholder` and `title` that contain a letter in any script. Every word a replacement shows must come from `window.l10n` or, for the loading text, from the HTML shell (§1). An SVG `<title>` with words would also be reported; icons carry no text anyway.
  - `import-js/order` requires import groups builtin, external, internal (`@/…`), then parent/sibling, separated by blank lines and alphabetised case-insensitively.
- Styling is done with Tailwind CSS v4 utility classes written in the component source. Tailwind generates only the classes it finds **as complete literal words** in files under `src/webview` (see §10.3.2), so class names must never be assembled from fragments at run time.
- Sizes below are given in `rem` with pixels at the default root font size of 16 px.

### 0.3 Colour and size vocabulary

When this document says "colour token `line`" it means the design token `--color-line` defined by the stylesheet (§10.3.3). Tailwind turns each token into utilities such as `bg-line`, `text-line`, `border-line`, `outline-line`, `fill-line` and `stroke-line`. Every token resolves to a VS Code theme variable or to a fixed translucent grey; §10 lists them all. The ones used most here:

| Token                                   | Meaning (value)                                                   |
| --------------------------------------- | ----------------------------------------------------------------- |
| `fg`                                    | Normal text: `--vscode-foreground`                                |
| `muted`                                 | Secondary text: `--vscode-descriptionForeground`                  |
| `focus`                                 | Focus outlines and accents: `--vscode-focusBorder`                |
| `editor`                                | Editor background: `--vscode-editor-background`                   |
| `line`                                  | Borders: grey at 50 % alpha                                       |
| `line-soft`                             | Faint borders and tracks: grey at 25 % alpha                      |
| `btn` / `btn-hover`                     | Neutral button fill: grey at 10 % / 20 % alpha                    |
| `action` / `action-fg` / `action-hover` | VS Code's primary button background, foreground, hover background |
| `git-deleted`                           | VS Code's "deleted file" decoration colour, used for error text   |

"Text size `ui`" is the stylesheet's 13 px interface size (§10.3.3).

### 0.4 Unit-test conventions that affect expectations

- `tests/webview/setup.ts` stubs `acquireVsCodeApi`. `setupWebviewTest()` in `tests/webview/test-utils.ts` installs a `window.l10n` proxy that returns **each key's own name**, so `window.l10n.noCommits` reads `"noCommits"` in tests. Tests that need a template override the proxy for that key.
- CSS is never loaded in the unit tests; only markup, attributes and class tokens can be checked there.

---

## 1. `src/webview/components/ui/Loading.tsx`

### 1.1 Interface

- Path: `src/webview/components/ui/Loading.tsx`, imported as `@/webview/components/ui/Loading`.
- One export: the function component **`Loading`**.
  - Props (the props type itself is not exported):
    - `class?: string`: extra class names added to the component's root element (after its own). Callers use it for layout, for example `"h-full"`.
    - `variant?: "inline" | "page"`: the presentation. Default `"inline"`.
  - Returns the indicator's root element. It never returns `null`.
- Callers:

  | Caller                                             | Use                                                                                                                                             |
  | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
  | `src/webview/pages/LoadingPage.tsx`                | `variant="page"`                                                                                                                                |
  | `src/webview/layout/GraphView.tsx`                 | inline, inside a centred `<main>` while the commit list is still unknown; and inline in place of the "Load More" button while more commits load |
  | `src/webview/components/history/QueryControls.tsx` | inline, inside `QueryStatus`'s own `role="status"` wrapper while a query loads                                                                  |
  | `src/webview/components/repository/RefsPane.tsx`   | inline, while the repository state is not known                                                                                                 |
  | `src/webview/components/commit/CommitDetails.tsx`  | inline with `class="h-full"`, while a commit's details load                                                                                     |
  | `tests/webview/components/ui/Loading.test.ts`      | both variants                                                                                                                                   |

### 1.2 Dependencies the implementation must use

- `shellText` from `@/webview/lib/shell-text`, called with the name `"loading"`. It returns the string the HTML shell put on the `<html>` element's `data-loading` attribute (set by `src/extension/html.ts` to VS Code's translation of "Loading…"), or `""` when the attribute is absent.
- The component must **not** read `window.l10n`: it is rendered before the webview has received its strings (see §9).

### 1.3 Behaviour

**Text.** The indicator shows exactly one piece of text: the value of `shellText("loading")`, read at render time. Re-rendering after the attribute changes shows the new value. When the attribute is missing the text is empty and nothing else changes (no error, the element is still rendered).

**Rendered structure (both variants).**

1. The root is a `<div>` with `role="status"` and `aria-live="polite"`. Its class list is the variant's own classes followed by the caller's `class` string, if any.
2. Its first child is a decorative graphic block that carries **no text** (so the root's `textContent` is exactly the loading text). It contains:
   - a spinning ring (a `<div>`), and
   - an inline SVG glyph with `aria-hidden="true"`.
3. Then the text:
   - `variant="inline"`: a `<span>` containing the text. There is no heading.
   - `variant="page"`: an `<h1>` containing the text.
4. `variant="page"` only: after the heading, a thin decorative progress track (a `<div>` with `aria-hidden="true"` containing one inner `<div>`). It has no text.

Tests rely on: `[role="status"]` whose `textContent` equals the loading text (inline), and the first `h1`'s `textContent` equal to the loading text (page).

**Look, inline variant.** The root is a horizontal flex row, centred on both axes, with 0.75 rem (12 px) between the graphic and the text and 1 rem (16 px) of padding above and below. The graphic block is 2 rem (32 px) square, never shrinks, and centres its contents. The glyph inside it is 1 rem (16 px) square.

**Look, page variant.** The root centres its text. The graphic block is 5 rem (80 px) square, centred horizontally, with 1.5 rem (24 px) below it. The glyph is 2.5 rem (40 px) square. The progress track sits 0.75 rem (12 px) below the heading, centred, 3 rem (48 px) wide and 1 px tall, filled with `line-soft` and clipping its content. The inner bar is half the track's width, filled with `focus`, and pulses: its opacity eases to 50 % and back over 2 s, forever (Tailwind's `animate-pulse`).

**Look, common parts.**

- The ring fills the graphic block, is a perfect circle with a 2 px border in `line-soft` except the top quarter, which is `focus`, and rotates clockwise one full turn per second, linearly, forever (Tailwind's `animate-spin`).
- For people who ask for reduced motion (`prefers-reduced-motion: reduce`) neither the ring nor the page bar animates.
- The glyph is a tiny commit graph drawn in a 40-unit square view box with 2-unit round-capped lines in `muted`: a vertical trunk that bends right at the bottom towards a lower-right commit, and a side line that leaves the trunk part-way down and curves up to an upper-right commit. There are three small commit dots: the upper-left one is filled and outlined in `focus`; the other two are hollow (filled with `editor`, outlined in `fg`). The drawing must be made afresh; its exact geometry is free as long as it reads as a small branching graph with one highlighted commit.
- The text uses text size `ui` (13 px), medium weight (500) and colour `fg`, in both variants (the page heading is not larger than the inline text).

### 1.4 Concrete examples

Shell: `<html data-loading="Loading…">` unless stated.

| Render                                                               | Observed                                                                                                                                                     |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `<Loading />`                                                        | `div[role=status][aria-live=polite]` whose `textContent` is `Loading…`; the text is in a `span`; no `h1`; one `svg[aria-hidden=true]`                        |
| `<Loading variant="inline" />`                                       | Same as above                                                                                                                                                |
| `<Loading class="h-full" />`                                         | Same, and the root's class list also contains `h-full` (CommitDetails uses this so the row's full height is used and the indicator stays vertically centred) |
| `<Loading variant="page" />`                                         | Root `textContent` `Loading…`; `h1` with text `Loading…`; a second `aria-hidden="true"` element (the track) after the `h1`                                   |
| `<Loading variant="page" />` with `data-loading="正在加载…"` (zh-cn) | `h1` text `正在加载…` (this is the existing unit test, run without `window.l10n`)                                                                            |
| `<Loading />` with no `data-loading`                                 | Renders; the `span` is empty; root `textContent` is `""`                                                                                                     |

### 1.5 Non-functional requirements

- Pure: output depends only on props and the shell attribute at render time. No hooks, timers, listeners or effects; animation is CSS only.
- Import-time: importing the module touches neither the DOM nor `window.l10n`.
- Works in jsdom without `window.l10n` defined.
- Cheap: it is rendered in several places at once (for example a loading pane and a loading details row).

### 1.6 Test coverage

Already checked:

- `tests/webview/components/ui/Loading.test.ts`, "shows the loading text that the page shell carries, before window.l10n exists": page variant puts the shell text in an `h1`; inline variant's `[role="status"]` `textContent` equals the shell text; works without `window.l10n`.

Not checked (gaps), with test cases:

1. **Default variant is inline.** Setup: `data-loading="L"`. Call: render `h(Loading, {})`. Expected: `[role="status"]` exists with `aria-live="polite"`, contains a `span` with text `L`, and `container.querySelector("h1")` is `null`.
2. **Caller class is added.** Call: render `h(Loading, { class: "h-full" })`. Expected: the `[role="status"]` element's `classList` contains `h-full`.
3. **Missing shell attribute.** Setup: no `data-loading` on `<html>`. Call: render both variants. Expected: no exception; `[role="status"]` exists; its `textContent` is `""`.
4. **Decoration is hidden and wordless.** Call: render `h(Loading, { variant: "page" })`. Expected: every `svg` has `aria-hidden="true"`; the track element after the `h1` has `aria-hidden="true"` and empty `textContent`; the root's `textContent` equals the shell text exactly.
5. **Text follows the attribute on re-render.** Setup: `data-loading="A"`, render; set `data-loading="B"`. Call: render again. Expected: text `B`.

Not testable in jsdom (check by eye in VS Code): sizes, colours, spin and pulse, their suppression under reduced motion.

### 1.7 Questions

- **Loading Q1.** With no `data-loading` attribute the live region is empty. Is a fallback wanted (for example `window.l10n` once it exists), or is the shell always trusted?
- **Loading Q2.** `role="status"` already implies polite announcements; the explicit `aria-live="polite"` is redundant. Keep it for older screen readers, or drop it?
- **Loading Q3.** `QueryStatus` (in `QueryControls.tsx`) wraps an inline `Loading` in a second `role="status"` element, so there are nested live regions and the text may be announced twice. Should `Loading` offer a way to render without its own role, or is the caller to change?
- **Loading Q4.** The page variant uses an `h1` whose typography equals the inline text. Is the heading meant for document structure on the start-up page (it is the only heading there), or should it be plain text?
- **Loading Q5.** The glyph's SVG has `aria-hidden="true"` but, unlike every icon from `Icons.tsx`, no `focusable="false"`. Intended difference?
- **Loading Q6.** Without a `class` prop the root's class attribute ends with a stray space. Cosmetic only; no test depends on it.

---

## 2. `src/webview/components/ui/Select.tsx`

### 2.1 Interface

- Path: `src/webview/components/ui/Select.tsx`, imported as `@/webview/components/ui/Select`.
- One export: the function component **`Select`**. Props (the props type is not exported):

  | Prop                | Type                                      | Meaning                                                                                                                         |
  | ------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
  | `options`           | `Array<{ label: string; value: string }>` | The choices, in display order. `label` is the visible text, `value` the string reported back.                                   |
  | `value`             | `string`                                  | The value of the option to show as chosen.                                                                                      |
  | `onChange`          | `(value: string) => void`                 | Called with the chosen option's `value` when the user commits a choice.                                                         |
  | `id`                | `string` (optional)                       | Put on the `<select>` so a `<label for>` can name it.                                                                           |
  | `"aria-label"`      | `string` (optional)                       | Accessible name, when there is no visible label element.                                                                        |
  | `"aria-labelledby"` | `string \| undefined` (optional)          | Id(s) of the element(s) naming the control. Must accept an explicit `undefined` (the Dialog passes one when a form has labels). |

  No other props are accepted (no `class`, `disabled`, `name`).

- Callers:

  | Caller                                                | Props used                                                                                                                        |
  | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
  | `src/webview/components/ui/Dialog.tsx`                | `id`, `options`, `value`, `onChange`, `aria-labelledby` (the dialog message's id for an unlabelled form, otherwise `undefined`)   |
  | `src/webview/layout/GraphView.tsx`                    | `aria-label` = `l10n.focusDimming`, options Subtle/`subtle` and Strong/`strong`, inside a `<label>` that also shows the same word |
  | `src/webview/components/history/SearchBar.tsx`        | `aria-label` = `l10n.savedFilters`; first option has value `""`; inside a fixed-width wrapper                                     |
  | `src/webview/components/history/HistoryTools.tsx`     | mainline parent choice (values `"1"`, `"2"`, …) inside a `<label>`                                                                |
  | `src/webview/components/repository/RebaseEditor.tsx`  | `aria-label` = `"<8-char hash> <l10n.rebasePlanTitle>"`; options pick/reword/squash/fixup/drop                                    |
  | `src/webview/components/repository/RemoteManager.tsx` | default push remote, first option value `""`, inside a `<label>`                                                                  |

### 2.2 Dependencies the implementation must use

None beyond Preact's JSX runtime. It must render a **native** `<select>` (not a custom list box): the UI tests drive it with native type-ahead and by setting `.value` and dispatching `change`.

### 2.3 Behaviour

**Rendered structure.** The component's root element **is** the `<select>` itself, with no wrapper. (The Dialog's layout test requires a checkbox's `<label>` and the `<select>` to share the same parent element.) It contains one `<option>` per entry of `options`, in the given order, each with its `value` attribute set to the entry's `value` and its text set to the entry's `label`. Nothing else is added: no placeholder option, no empty option. Because the options are real children, the select's `textContent` contains every label (the UI test for saved filters relies on that).

The `<select>` is the only focusable element the component renders (the Dialog's Tab containment counts `select` elements and starts focus at the first text field or button, so the component must add no button or `tabindex` element).

**Attributes.** `id`, `aria-label` and `aria-labelledby` are set on the `<select>` exactly when given; when absent (or `undefined`) the attribute does not appear at all. Both labels may be given together; then `aria-labelledby` names the control, per ARIA rules.

**Chosen value.** After every render the select's DOM value equals `value` when some option has that value. If several options share it, the first one is shown. If no option has it, no option is selected (`selectedIndex` is `-1`, the DOM `value` reads `""`, and the closed control appears blank). The component re-applies `value` on every render, so if the parent ignores a change and re-renders, the control snaps back to the parent's value; if the parent does not re-render, the control keeps showing the user's choice.

**Reporting.** When the element fires a `change` event (the user picked an option with the mouse or keyboard, including closed-control type-ahead, or a script set `.value` and dispatched a bubbling `change`), `onChange` is called once with the select's current value (a string). An `input` event on its own does not call `onChange`. A `change` event with an unchanged value still calls `onChange` (the component does not filter). Nothing is called on render.

**Look.**

- Fills the width of its container (width 100 %); pointer cursor.
- 1 px solid border in colour token `input-border` (`--vscode-input-border`, or 50 % grey when that variable is not defined), 0.25 rem (4 px) corner radius, background `dropdown`, text `dropdown-fg`, padding 0.25 rem (4 px) top and bottom and 0.5 rem (8 px) left and right. Font inherits from the page (13 px VS Code font in practice).
- Each `<option>` also has background `dropdown` and text `dropdown-fg`, so the opened list matches on platforms that honour option colours.
- When focused (by any means), a 1 px solid outline in `focus` drawn **just outside** the border (outline offset 0). It must not be drawn inside the element's background: the UI test measures the outline's contrast against what is behind the select, and requires at least 3 : 1 in the light, dark and both high-contrast themes.

### 2.4 Concrete examples

| Render / action                                                                 | Observed                                                                                                                      |
| ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `options=[A/a, B/b]`, `value="b"`                                               | `<select>` with `<option value="a">A</option><option value="b">B</option>`; `selectedIndex` 1; no `id` or `aria-*` attributes |
| `id="s1"`, `aria-label="Lbl"`, `aria-labelledby="t1"`, `options=[]`, `value=""` | `<select id="s1" aria-label="Lbl" aria-labelledby="t1">` with no options; `selectedIndex` -1                                  |
| Same as the first row, then `select.value = "a"` and a bubbling `change`        | `onChange("a")` once                                                                                                          |
| Same, but only an `input` event                                                 | `onChange` not called                                                                                                         |
| Same `change` dispatched twice                                                  | `onChange("a")` twice                                                                                                         |
| After the change, parent re-renders with `value="b"` unchanged                  | DOM value back to `b`                                                                                                         |
| `value="zzz"` (not an option)                                                   | `selectedIndex` -1, DOM value `""`                                                                                            |
| Two options with value `a`, `value="a"`                                         | `selectedIndex` 0                                                                                                             |
| GraphView focus bar, keyboard: focus the select, type "Subtle" (UI test)        | value becomes `subtle`; `setFocusDimming("subtle")` runs; focus outline visible                                               |

### 2.5 Non-functional requirements

- Stateless: no hooks or effects; everything is derived from props on each render.
- No import-time behaviour.
- Must stay a native, keyboard-operable select that is a Tab stop.

### 2.6 Test coverage

Already checked (through callers):

- `tests/webview/components/ui/Dialog.behaviour.test.ts`: initial value shown ("shows every kind of field with its initial value" asserts `select.value` `"2"`); in "lays out a labelled form in label and field pairs" a `label[for]` points at the select's `id`; in "names the fields of an unlabelled form by its message and keeps checkboxes in line" the select's `aria-labelledby` is the dialog title's id and the select and the checkbox label share a parent; a `change` event reports the new value to the form's submit.
- `tests/webview/components/ui/Dialog.test.ts` ("names the unlabelled choice of %s by the dialog's question", for Reset and a merge's Cherry-pick and Revert): the select's `aria-labelledby` resolves to the question's text.
- `tests/webview/lib/history-tools.test.ts` ("preserves reword edits when arranging fixup commits") and `tests/webview/lib/repository-actions.test.ts` ("edits and reorders an interactive plan…"): a `change` event on the rebase editor's select reaches the caller.
- UI workflow tests: `select[aria-label="Dimming"]` exists, is a Tab stop, changes by keyboard type-ahead, shows a visible focus outline with at least 3 : 1 contrast ("keeps focus and remote controls readable and keyboard accessible", four themes); dialog selects react to `.value` plus bubbling `change` ("configures remotes and upstreams…"); a saved-filter select's `textContent` includes a filter's name ("searches past the loaded graph and keeps saved filters per repository").

Gaps, with test cases:

1. **Options in order, nothing extra.** Call: render with options `[{label:"One",value:"1"},{label:"Two",value:"2"}]`, `value="1"`. Expected: the container's first element child is a `SELECT`; it has exactly two `option` children with values `1`, `2` and texts `One`, `Two`.
2. **No stray attributes.** Call: render without `id` or labels. Expected: `select.hasAttribute("id")`, `hasAttribute("aria-label")`, `hasAttribute("aria-labelledby")` are all `false`. Then render with `"aria-labelledby": undefined`: still no attribute.
3. **Only `change` reports.** Call: set `.value="2"`, dispatch bubbling `input`, then bubbling `change`. Expected: `onChange` not called after `input`; called once with `"2"` after `change`.
4. **Unmatched value.** Call: render with `value="x"` not among options. Expected: `selectedIndex === -1`; no exception; `onChange` not called.
5. **Controlled on re-render.** Call: change to `"2"` via `change`, then re-render with `value="1"`. Expected: `select.value === "1"`.

Not testable in jsdom: colours, outline placement, width.

### 2.7 Questions

- **Select Q1.** An unmatched `value` shows a blank control while the caller keeps the unmatched value (for example a default push remote that no longer exists, or a saved-filter name after its filter was deleted). Should the control fall back to the first option, add a placeholder, or stay blank? (The Dialog specification raised the same point for forms.)
- **Select Q2.** The focus outline appears on any focus, including a mouse click; the checkbox (§5) shows its ring only for keyboard focus (`:focus-visible`). Should these match?
- **Select Q3.** The control has no `disabled` or `class` prop and always takes the full container width, so callers wrap it in sized elements. Intended to stay minimal?
- **Select Q4.** Duplicate option values are accepted silently (first one wins; Preact also sees duplicate keys). Should duplicates be rejected or deduplicated?

---

## 3. `src/webview/components/ui/Button.tsx`

### 3.1 Interface

- Path: `src/webview/components/ui/Button.tsx`, imported as `@/webview/components/ui/Button` (or `./components/ui/Button` from `main.tsx`).
- One export: the function component **`Button`**. Its props are every attribute and event handler Preact allows on a native `<button>` (`ComponentProps<"button">` from `preact`), plus:
  - `variant?: "default" | "primary"`: the look. Default `"default"`.
  - The native `class` prop is accepted and **added to** the component's own classes (it does not replace them).
  - The native `type` prop is accepted; when it is not given the button's type is `"button"`.
  - `children`: the button's content (text, icons or both).
- Every other prop (for example `onClick`, `disabled`, `title`, `aria-label`, `aria-expanded`, `aria-haspopup`, `data-*`) is passed to the `<button>` unchanged.
- Callers: `src/webview/main.tsx` (repository-list Retry), `src/webview/pages/NoRepoPage.tsx` (primary), `src/webview/layout/GraphView.tsx`, `src/webview/layout/MainHeader.tsx` (passes `class="bg-row-selected"` or `""` for its pressed toggles, plus `aria-expanded`, `aria-label`, `title`, `aria-haspopup="menu"`, `disabled`), `src/webview/components/ui/Dialog.tsx` (`type="submit"`, `disabled`, `data-dialog-cancel="true"`, `data-dialog-start=""`), `src/webview/components/ui/ErrorBoundary.tsx`, `src/webview/components/history/QueryControls.tsx`, `WorkflowTools.tsx` (primary), `WorkspacePane.tsx`, `ActivityView.tsx`, `SearchBar.tsx` (`type="submit"`, `aria-expanded`), `HistoryTools.tsx` (primary, `type="submit"`), `src/webview/components/repository/BisectView.tsx` (`type="submit"`), `RepositoryStatus.tsx`, `WorktreeManager.tsx`, `RebaseEditor.tsx` (`type="submit"`, and spreads `data-move` and `aria-label` from `moveButton` in `@/webview/lib/use-list-move`), `RemoteManager.tsx`, `StashManager.tsx`, `src/webview/components/commit/WorkingTreeDetails.tsx`.

### 3.2 Dependencies the implementation must use

- `ComponentProps` (type only) from `preact`, or an equivalent type that accepts every native button attribute.

### 3.3 Behaviour

**Rendered structure.** Exactly one `<button>` element, with the children inside it and nothing else. The button's `textContent` is exactly the text of its children (tests find buttons by `textContent === "retry"` and similar, and by `aria-label`). Attributes:

- `type`: the caller's value, else `"button"`, so a `Button` inside a `<form>` never submits it unless asked (`Dialog.behaviour.test.ts` asserts the Cancel button's `type` is `"button"`; the tests' submit helpers find `button[type="submit"]`).
- `disabled`: as given. A disabled button ignores clicks (native behaviour); tests and the UI harness skip disabled buttons.
- `class`: the component's classes followed by the caller's class string. An empty or missing caller class adds nothing.
- All other props as given, including `data-*` and `aria-*` attributes that other code selects on: `[data-dialog-cancel]` and `[data-dialog-start]` (Dialog focus handling), `button[data-move]` (list-move focus), `button[aria-label="…"]`.

**Refs.** No caller passes a `ref`. Today a `ref` given to `Button` receives the component instance, not the DOM button; forwarding is not required.

**Look.**

- Inline flex box; content centred on both axes with 0.25 rem (4 px) between children (an icon and its text); pointer cursor; text cannot be selected.
- 1 px solid border, 0.25 rem (4 px) corner radius, padding 0.25 rem (4 px) top and bottom and 0.625 rem (10 px) left and right, text size `ui` (13 px), medium weight (500).
- On focus (any focus, including a mouse click), a 1 px solid outline in `focus` at the browser's default offset (0). The UI tests require keyboard focus on a `Button` to show an outline at least 1 px wide with at least 3 : 1 contrast against the background behind it, in four themes.
- **Default variant:** border `line`, background `btn`, text colour inherited. While hovered and enabled, background `btn-hover`.
- **Primary variant:** border present but transparent (so both variants have the same size), background `action`, text `action-fg`. While hovered and enabled, background `action-hover`.
- **Disabled (either variant):** not-allowed cursor, the whole button at 50 % opacity, and no hover change.
- Hover styles apply only on devices that can hover (Tailwind v4 wraps `hover:` in `@media (hover: hover)`).
- **Caller background wins over the default background.** `MainHeader` passes `bg-row-selected` to show a pressed toggle; that background must replace the default variant's `btn` background. While such a button is hovered the ordinary hover background (`btn-hover`) shows instead. Today this outcome comes from the order of the generated CSS (the `bg-row-selected` rule follows `bg-btn`, and the hover rule follows both); a replacement must produce the same visible result.

### 3.4 Concrete examples

| Render                                                                                            | Observed markup (attribute order irrelevant)                                              |
| ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `<Button>Go</Button>`                                                                             | `<button type="button" class="…">Go</button>`                                             |
| `<Button variant="primary" class="extra" type="submit" disabled data-x="1" title="T">Go</Button>` | `<button type="submit" disabled="" data-x="1" title="T" class="… extra">Go</button>`      |
| `<Button class="">Go</Button>`                                                                    | Same classes as `<Button>`; no trailing caller token                                      |
| Default button inside a `<form>`, clicked                                                         | `onClick` runs once; the form is **not** submitted                                        |
| `type="submit"` button inside a `<form>`, clicked                                                 | The form's `submit` fires                                                                 |
| `disabled` button clicked                                                                         | `onClick` not called                                                                      |
| RebaseEditor's move button for hash `aaaaaaaa…`                                                   | `<button type="button" data-move="later" aria-label="moveLater aaaaaaaa">` (test strings) |

### 3.5 Non-functional requirements

- Stateless and cheap: it is rendered dozens of times per view. No hooks.
- No import-time behaviour.
- Must remain a native `<button>` so Enter and Space activate it and it takes part in form submission.

### 3.6 Test coverage

Already checked (through callers):

- `tests/webview/components/ui/Dialog.behaviour.test.ts`: `button[type="submit"]` exists and its `disabled` state follows validation; Cancel has `data-dialog-cancel`, `type === "button"`, text `dialogCancel`; clicking works.
- `tests/webview/components/ui/Dialog.test.ts`: focus lands on the element carrying `data-dialog-cancel` for destructive dialogs; the submit button.
- `tests/webview/components/history/ListEditors.test.ts`: `button[aria-label="moveLater aaaaaaaa"]` and similar exist; `disabled` is set; focus moves between `button[data-move]` buttons.
- `tests/webview/components/commit/GraphErrors.test.ts`: a `Button` whose `textContent` is exactly `retry`; clicking it retries.
- `tests/webview/lib/repository-actions.test.ts`: `button[type="submit"]` disabled state.
- UI workflow tests: buttons found by trimmed text or `aria-label` and clicked when not disabled (throughout); `button:focus` shows a visible outline with at least 3 : 1 contrast after keyboard activation of Pause/Resume focus ("keeps focus and remote controls readable…").

Gaps, with test cases:

1. **Default type.** Call: render `h(Button, {}, "x")`. Expected: `button.type === "button"` and `getAttribute("type") === "button"`.
2. **Explicit type kept.** Call: render with `type: "submit"`. Expected: `type === "submit"`.
3. **Pass-through.** Call: render with `title: "T"`, `"aria-label": "L"`, `"data-x": "1"`, `"aria-expanded": true`. Expected: all four attributes present with those values (`aria-expanded="true"`).
4. **Caller class appended.** Call: render with `class: "extra"`. Expected: `classList.contains("extra")` and the class list also still contains the component's own tokens (it is longer than one token).
5. **No form submission by default.** Setup: a `<form>` with an `onSubmit` spy containing `h(Button, { onClick }, "x")`. Call: `button.click()`. Expected: `onClick` called once; submit spy not called.
6. **Disabled blocks clicks.** Call: render with `disabled: true, onClick`, click. Expected: `onClick` not called.
7. **Children only.** Call: render `h(Button, {}, h("svg", null), "Go")`. Expected: `button.textContent === "Go"` and the svg is inside the button.
8. **Caller background wins (stylesheet order).** See §10.6 gap 2.

### 3.7 Questions

- **Button Q1.** Overriding the default background with a caller class works only because of the generated CSS order. Should `Button` offer an explicit "pressed" or "selected" state (for example driven by `aria-pressed` or `aria-expanded`) instead? And should a hovered pressed toggle keep a pressed look? Today it shows the ordinary, lighter hover colour.
- **Button Q2.** The focus outline appears on mouse focus as well, unlike the checkbox's keyboard-only ring. Intended?
- **Button Q3.** A `ref` passed to `Button` receives the component instance rather than the DOM element. No caller needs it; should it be forwarded anyway?
- **Button Q4.** A disabled primary button is shown at 50 % opacity, which can drop its text contrast below 4.5 : 1 on some themes. Acceptable for disabled controls (WCAG exempts them)?

---

## 4. `src/webview/components/ui/Icons.tsx`

### 4.1 Interface

- Path: `src/webview/components/ui/Icons.tsx`, imported as `@/webview/components/ui/Icons` (or `./Icons` from `Checkbox.tsx`).
- Exports (all function components, all named):

  | Export            | Props                                                                                                                                                                                 | Draws                                |
  | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
  | `Icon`            | every SVG attribute Preact allows on `<svg>` (`SVGAttributes<SVGSVGElement>` from `preact`) except `children`, plus a **required** `children: ComponentChildren` (the shapes to draw) | whatever the caller passes           |
  | `ChevronDownIcon` | every SVG attribute except `children`                                                                                                                                                 | a downward chevron                   |
  | `RefreshIcon`     | same                                                                                                                                                                                  | a circular "reload" arrow            |
  | `KebabIcon`       | same                                                                                                                                                                                  | three dots in a row ("more actions") |
  | `GearIcon`        | same                                                                                                                                                                                  | a cog                                |
  | `RevealIcon`      | same                                                                                                                                                                                  | a crosshair / target                 |
  | `EyeIcon`         | same                                                                                                                                                                                  | an open eye                          |
  | `EyeClosedIcon`   | same                                                                                                                                                                                  | a struck-through eye                 |
  | `PlusIcon`        | same                                                                                                                                                                                  | a plus sign                          |
  | `BranchIcon`      | same                                                                                                                                                                                  | a Git branch mark                    |
  | `TagIcon`         | same                                                                                                                                                                                  | a price tag                          |
  | `StashIcon`       | same                                                                                                                                                                                  | a storage box                        |
  | `RemoteIcon`      | same                                                                                                                                                                                  | a cloud                              |
  | `SearchIcon`      | same                                                                                                                                                                                  | a magnifying glass                   |

  The shared props type is not exported.

- Callers:

  | Caller                                             | Exports used and how                                                                                                                                                                                                                          |
  | -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | `src/webview/components/ui/Checkbox.tsx`           | `Icon` for the tick                                                                                                                                                                                                                           |
  | `src/webview/components/ui/Dialog.tsx`             | `Icon` with its own `viewBox="0 0 12 16"`, `fill="none"`, `stroke`, `stroke-width` and classes including `animate-spin` and `motion-reduce:animate-none` (running spinner), and another stroked glyph                                         |
  | `src/webview/components/commit/CommitDetails.tsx`  | `Icon` with `viewBox="0 0 12 16"` (close button)                                                                                                                                                                                              |
  | `src/webview/components/commit/FileTree.tsx`       | `Icon` for folder and file glyphs, class includes `text-fg/60`                                                                                                                                                                                |
  | `src/webview/pages/NoRepoPage.tsx`                 | `Icon` for the button's glyph                                                                                                                                                                                                                 |
  | `src/webview/components/ui/Dropdown.tsx`           | `ChevronDownIcon` (trigger)                                                                                                                                                                                                                   |
  | `src/webview/components/repository/RefsPane.tsx`   | `ChevronDownIcon` (section toggle; rotated −90° when collapsed), `BranchIcon`, `TagIcon`, `StashIcon`, `RemoteIcon` (row and section icons, coloured `muted`), `EyeIcon`/`EyeClosedIcon` (remote visibility toggles), `PlusIcon`, `KebabIcon` |
  | `src/webview/components/commit/RefLabel.tsx`       | `BranchIcon`, `TagIcon` on a coloured tile: class sets `bg-graph`, `fill-editor`, 2 px padding, 18 px size                                                                                                                                    |
  | `src/webview/components/commit/CommitRow.tsx`      | `KebabIcon` (row actions button)                                                                                                                                                                                                              |
  | `src/webview/components/commit/CommitTable.tsx`    | `RevealIcon` (reveal selected lane)                                                                                                                                                                                                           |
  | `src/webview/components/history/WorkspacePane.tsx` | `KebabIcon`                                                                                                                                                                                                                                   |
  | `src/webview/layout/MainHeader.tsx`                | `SearchIcon`, `RefreshIcon`, `GearIcon`                                                                                                                                                                                                       |

### 4.2 Dependencies the implementation must use

- Types `ComponentChildren` and `SVGAttributes` from `preact` (type-only imports).

### 4.3 Behaviour

**`Icon`.** Renders one `<svg>` element as the root, with no wrapper, containing the caller's `children`. Its default attributes are:

- `width="16"` and `height="16"` (so an icon with no CSS size is 16 × 16 px; a CSS size class such as `size-3.5` overrides them);
- `viewBox="0 0 16 16"`;
- `fill="currentColor"` (shapes take the text colour);
- `aria-hidden="true"` and `focusable="false"` (decorative, never a Tab stop).

Any attribute the caller passes (including `class`, `viewBox`, `fill`, `stroke`, `stroke-width`, `width`, `aria-hidden`) is set on the `<svg>`, and a caller value **replaces** the default of the same name. Class tokens reach the element unchanged (`Dialog.behaviour.test.ts` checks that the spinner's `classList` contains `animate-spin` and `motion-reduce:animate-none`). `Icon` adds no `id`, no `role`, no `tabindex`, no `<title>` and no text: `FileTreeView.test.ts` asserts that a tree drawn with `Icon` glyphs has no element with an `id`, no element with a `role`, and that each `svg`'s `textContent` is `""`.

**Named icons.** Each renders exactly one root `<svg>` (never wrapped: `RefLabel.test.ts` finds the ref name with the selector `span > span` inside a label that starts with `BranchIcon` or `TagIcon`, so a `span` around the icon would be found first) with `width="16"`, `height="16"`, `aria-hidden="true"`, `focusable="false"`, no `id`, no `role`, no text, and the caller's other attributes (in practice only `class`). They fall into two drawing styles:

- **Outline icons** (`GearIcon`, `RevealIcon`, `EyeIcon`, `EyeClosedIcon`, `PlusIcon`, `StashIcon`, `RemoteIcon`, `SearchIcon`): 16-unit view box; no fill; stroked in the current text colour, 1.5 units wide, with round caps and round joins. Today these four stroke settings and `fill="none"` win over caller attributes of the same names; no caller passes them.
- **Filled icons** (`ChevronDownIcon`, `RefreshIcon`, `KebabIcon`, `BranchIcon`, `TagIcon`): solid shapes filled with the current text colour and no stroke. `BranchIcon` and `TagIcon` **must** be filled glyphs whose colour follows the CSS `fill` property: `RefLabel` paints them by setting `fill` to the editor background (`fill-editor`) on a tile coloured with the row's branch colour, while `RefsPane` colours them through `color` (`text-muted`). Today `BranchIcon` uses a 10 × 16 view box and `TagIcon` a 15 × 16 view box, which the 16 × 16 box centres (so they draw a little narrower); those view boxes win over a caller `viewBox`. No caller relies on the exact view box.

**Shapes.** All glyphs must be drawn afresh. What each must depict, at 16 px:

| Icon              | Required picture                                                                                                                                                                                                                               |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ChevronDownIcon` | A "V" chevron pointing down, symmetric about the vertical centre line and centred in the box (callers rotate it −90° to point right, so it must look right when rotated about the centre).                                                     |
| `RefreshIcon`     | A circular arrow: an almost-closed ring about three quarters of the box wide with an arrowhead at one end, the conventional "reload" symbol.                                                                                                   |
| `KebabIcon`       | Three equal round dots in a **horizontal** row across the middle of the box, evenly spaced.                                                                                                                                                    |
| `GearIcon`        | A cog wheel: a toothed ring (eight teeth today) with a central hole, reaching nearly to the box edge.                                                                                                                                          |
| `RevealIcon`      | A crosshair: a small circle at the centre and four short ticks pointing at it from the top, bottom, left and right edges.                                                                                                                      |
| `EyeIcon`         | An eye: an almond outline across the box with a round pupil in the middle.                                                                                                                                                                     |
| `EyeClosedIcon`   | The same almond outline **without** the pupil and with a diagonal stroke across it (bottom-left to top-right). Its markup must differ from `EyeIcon`'s: the UI test compares the toggle button's `innerHTML` before and after hiding a remote. |
| `PlusIcon`        | A centred plus sign with arms about 9 units long.                                                                                                                                                                                              |
| `BranchIcon`      | The Git branch mark: two commit nodes stacked on one side joined by a straight line, and a third node on the other side joined to that line by a curve.                                                                                        |
| `TagIcon`         | A price tag pointing diagonally down to the right, with a small hole near its upper-left corner.                                                                                                                                               |
| `StashIcon`       | A storage box: a flat lid across the top over a slightly narrower open box, with a short horizontal handle on the box front.                                                                                                                   |
| `RemoteIcon`      | A cloud outline.                                                                                                                                                                                                                               |
| `SearchIcon`      | A magnifying glass: a circle in the upper left and a straight handle to the lower-right corner.                                                                                                                                                |

### 4.4 Concrete examples

| Render                                                                        | Observed                                                                                                                                               |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `<Icon class="size-4"><path d="M0 0" /></Icon>`                               | `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" focusable="false" class="size-4"><path d="M0 0"></path></svg>` |
| `<Icon width="24" aria-hidden="false" fill="none" viewBox="0 0 8 8">…</Icon>` | `width="24"`, `height="16"`, `viewBox="0 0 8 8"`, `fill="none"`, `aria-hidden="false"`, `focusable="false"` (caller wins)                              |
| `<KebabIcon />`                                                               | `svg` with the five default attributes and three `circle` children                                                                                     |
| `<PlusIcon class="k" fill="red" stroke="blue" viewBox="0 0 4 4" />`           | `class="k"`, `viewBox="0 0 4 4"` (caller wins), but `fill="none"`, `stroke="currentColor"`, `stroke-width="1.5"`, round caps and joins (icon wins)     |
| `<BranchIcon viewBox="0 0 4 4" fill="red" />`                                 | `viewBox="0 0 10 16"` (icon wins), `fill="red"` (caller wins)                                                                                          |
| `<EyeIcon />` vs `<EyeClosedIcon />`                                          | Different inner markup                                                                                                                                 |
| Any named icon                                                                | `textContent === ""`; no `id`; no `role`                                                                                                               |

### 4.5 Non-functional requirements

- Pure and hook-free; rendered thousands of times (the Branches pane test `RefsScale.test.ts` renders 3,000 refs per list, each row with an icon). Keep each icon to a handful of SVG elements; the UI benchmark records the page's `svg path` count and DOM node count.
- No import-time behaviour.
- Colours come only from `currentColor` or the CSS `fill`/`stroke`/`color` the caller sets, so icons follow theme changes without re-rendering.

### 4.6 Test coverage

Already checked:

- `tests/webview/components/commit/FileTreeView.test.ts` ("renders folders and files to the agreed shape", "changes the folder glyph when the folder closes"): `Icon` output has `aria-hidden="true"`, `focusable="false"`, empty text, no `id`, no `role`; children are rendered and change with them.
- `tests/webview/components/ui/Dialog.behaviour.test.ts` ("keeps the spinner still for people who prefer reduced motion"): `Icon` keeps `aria-hidden`/`focusable` and the caller's class tokens.
- UI workflow tests: `EyeIcon` and `EyeClosedIcon` render different markup ("keeps focus and remote controls readable…"); ref labels are `span[title]` elements containing an `svg` ("checks VS Code compatibility and graph controls" and others that use `contextRef`).

Gaps, with test cases:

1. **Every named icon's contract.** For each export except `Icon`: render `h(Component, { class: "k" })`. Expected: the container has exactly one element child, an `svg`, with `width="16"`, `height="16"`, `aria-hidden="true"`, `focusable="false"`, `classList.contains("k")`, `textContent === ""`, no descendant or self with `id` or `role`, and at least one drawing child.
2. **Eye states differ.** Render `EyeIcon` and `EyeClosedIcon`. Expected: their `innerHTML` strings differ.
3. **`Icon` defaults and overrides.** Render `h(Icon, {}, h("path"))`: expected the five defaults plus `viewBox="0 0 16 16"`. Render `h(Icon, { viewBox: "0 0 12 16" }, h("path"))`: expected `viewBox="0 0 12 16"`.
4. **Filled branch and tag glyphs.** Render `BranchIcon` and `TagIcon`. Expected: no element inside has a `stroke` attribute other than `none`, and the root's `fill` is not `none` (so CSS `fill` colours them, as `RefLabel` needs).

### 4.7 Questions

- **Icons Q1.** Attribute precedence is inconsistent: `Icon` lets a caller override everything, even `aria-hidden`; the outline icons ignore a caller's `fill`/`stroke`/`stroke-width`/caps/joins; `BranchIcon` and `TagIcon` ignore a caller's `viewBox`. Should the named icons accept overrides like `Icon`, or should `Icon` protect `aria-hidden` and `focusable`?
- **Icons Q2.** The set mixes filled glyphs (chevron, refresh, kebab, branch, tag) with 1.5-unit outline glyphs. Should the redraw unify the style, given that `RefLabel` needs branch and tag to be coloured by `fill`?
- **Icons Q3.** `KebabIcon` draws a horizontal row of dots, while "kebab" usually names the vertical form. Keep the name and the horizontal picture?
- **Icons Q4.** `BranchIcon` and `TagIcon` use non-square view boxes inside a square box, so they sit narrower than their neighbours in the Branches pane. Should they be redrawn in the common 16-unit square?

---

## 5. `src/webview/components/ui/Checkbox.tsx`

### 5.1 Interface

- Path: `src/webview/components/ui/Checkbox.tsx`, imported as `@/webview/components/ui/Checkbox`.
- One export: the function component **`Checkbox`**. Props:
  - `label: string` (required): the visible text beside the box, which also names the checkbox.
  - Every attribute and event handler Preact allows on an `<input>` (`ComponentProps<"input">`) **except** `class`, `type` and `children`, all passed to the native checkbox input. In practice: `checked`, `onInput`, `id`, `disabled`.
- Callers:

  | Caller                                             | Props used                                                                                                                                                                 |
  | -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | `src/webview/components/ui/Dialog.tsx`             | `id`, `label`, `checked`, `onInput` (reads `event.currentTarget.checked`)                                                                                                  |
  | `src/webview/components/history/WorkflowTools.tsx` | `label`, `checked`, `onInput` (staged pointer; select-all and per-repository selection, labels are repository paths; cleanup selection, labels like `name · 1234567890ab`) |
  | `src/webview/components/history/WorkspacePane.tsx` | `label`, `checked`, `onInput` (changed repositories only)                                                                                                                  |
  | `src/webview/components/history/SearchBar.tsx`     | `label`, `checked`, `onInput` (follow renames)                                                                                                                             |
  | `src/webview/components/history/HistoryTools.tsx`  | `label`, `checked`, `onInput` (compare from merge base)                                                                                                                    |

### 5.2 Dependencies the implementation must use

- `ComponentProps` (type only) from `preact`.
- `Icon` from `./Icons` (or `@/webview/components/ui/Icons`) for the tick, so the tick is decorative (`aria-hidden="true"`, `focusable="false"`).

### 5.3 Behaviour

**Rendered structure.** The root is a `<label>` element with **no** `for` attribute (it names the input by containing it; the Dialog test asserts `label[for]` is absent in a form whose only labels are checkboxes). Inside it, in order:

1. A box element (a `<span>`) containing the native `<input type="checkbox">` followed by the tick `svg`.
2. The label text as a plain text node.

So `label.textContent` equals `label` exactly (the tick has no text); `input.closest("label")` is the root; `label.querySelector("input")` is the checkbox. The root must be the outermost element (no wrapper): the Dialog test requires the checkbox's `<label>` to have the same parent as a `<select>` in the same form.

**Focusable parts.** The input is the only focusable element the component renders: no `<button>`, no element with a `tabindex`, and the tick is not focusable. The Dialog relies on this. It starts focus on the first `input[type="text"]` or `button` it finds and keeps Tab inside the elements matching `a[href], button, input:not([type="hidden"]), select, textarea, [tabindex]`; a checkbox built from a button, or with an extra `tabindex`, would change where a checkbox-only confirmation starts and how Tab cycles.

**Input.** Always `type="checkbox"`. Every other prop is set on it: `id`, `checked`, `disabled`, event handlers. Clicking the input or anywhere in the label toggles it natively and fires `input` then `change` (both bubble); a caller's `onInput` receives the event with `currentTarget` being the input, whose `checked` is the new state. Clicking a disabled checkbox or its label does nothing.

**Controlled state.** The `checked` prop is re-applied on every render. If a click toggles the DOM and the parent re-renders without changing `checked`, the box returns to the prop's state. If the parent does not re-render, the DOM keeps the toggled state.

**Look.**

- The label is a **block-level** flex row (it takes the full width of its container), items vertically centred, 0.5 rem (8 px) between box and text, text never wraps, text not selectable, pointer cursor. When the label contains a disabled control, the whole label is at 60 % opacity with a not-allowed cursor.
- The box is 1 rem (16 px) square and centres its contents.
- The input has its native appearance removed and is drawn as a 16 px square with 0.25 rem (4 px) corners, background `checkbox` (VS Code's checkbox background) and a 1 px solid outline in `line` (so it stays visible when the checkbox background equals the surrounding background). When checked, both the background and the outline become `checkbox-checked` (VS Code's primary button background). With keyboard focus (`:focus-visible` only), the outline becomes 2 px of `focus` offset 1 px outward. When disabled, the cursor is not-allowed.
- The tick is 0.875 rem (14 px), centred over the input, coloured `checkbox-check` (VS Code's primary button foreground), and does not receive pointer events (clicks pass to the input). It is invisible (opacity 0) unless the input is currently checked; this follows the live DOM state through CSS, not the prop.
- The tick glyph is a conventional check mark drawn afresh within a 16-unit box.

### 5.4 Concrete examples

| Render / action                                                     | Observed                                                                                                                     |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `<Checkbox label="Push" id="c1" checked />`                         | `label` (no `for`) › [`span` › `input#c1[type=checkbox]` (checked) + `svg[aria-hidden=true][focusable=false]`] + text `Push` |
| `label.textContent`                                                 | `"Push"`                                                                                                                     |
| `<Checkbox label="Push" disabled />`                                | `input` has `disabled`; clicking the label leaves it unchecked and calls nothing                                             |
| `checked={false}`, `onInput`, click the input                       | `onInput` once with `currentTarget.checked === true`; a caller `onChange` also runs once                                     |
| Then parent re-renders with `checked={false}`                       | DOM `checked` back to `false`                                                                                                |
| Click the label text                                                | Toggles and calls `onInput` like a click on the input                                                                        |
| Dialog "Merge into current branch…" with checkbox "No fast-forward" | `label` text `No fast-forward`; input checked when the input's `value` is `true`                                             |

### 5.5 Non-functional requirements

- Stateless; no hooks; no import-time behaviour.
- Rendered in long lists (one per repository in the Workspace Sync dialog), so keep it small.
- Must remain a native checkbox for keyboard (Space) and assistive technology.

### 5.6 Test coverage

Already checked (through callers):

- `tests/webview/components/ui/Dialog.behaviour.test.ts`: initial `checked`; clicking the input changes the submitted value to `true`; `closest("label").textContent` equals the label; no `label[for]` in an unlabelled form; the checkbox label and a select share a parent.
- `tests/webview/components/ui/Dialog.test.ts` ("focuses the first field or button of other dialogs"): in a checkbox-only form ("No fast-forward") the dialog's initial focus goes to the submit button, not the checkbox.
- `tests/webview/lib/workflows.test.ts` ("keeps a clean submodule with a staged pointer in the changed-only view"): clicking `input[type="checkbox"]` in the Workspace pane calls the caller's handler.
- UI workflow tests: `[role=dialog] input[type=checkbox]` clicked in the compare dialog ("compares branch contributions…"); a `[role=dialog] label` found by its text (`includes` or trimmed equality) and its `input` clicked ("previews pushes and fast-forward pulls and removes only selected merged branches", "fetches selected workspace repositories…").

Gaps, with test cases:

1. **Structure.** Call: render `h(Checkbox, { label: "Box" })`. Expected: the container's only child is a `LABEL` without `for`; it contains exactly one `input[type="checkbox"]` and one `svg[aria-hidden="true"][focusable="false"]`; `label.textContent === "Box"`.
2. **Props reach the input.** Call: render with `id: "c1"`, `checked: true`, `disabled: true`. Expected: `input.id === "c1"`, `input.checked`, `input.disabled`.
3. **Label click toggles.** Setup: `checked: false`, `onInput` spy. Call: `label.click()`. Expected: spy called once; `event.currentTarget.checked === true`.
4. **Disabled ignores clicks.** Setup: `disabled: true`, `onInput` spy. Call: `label.click()`. Expected: spy not called; `input.checked === false`.
5. **Controlled on re-render.** Call: click, then re-render with the same `checked: false`. Expected: `input.checked === false`.

Not testable in jsdom: colours, outline, tick visibility, opacity when disabled.

### 5.7 Questions

- **Checkbox Q1.** The label never wraps, so long labels (repository paths in the Workspace Sync list, branch names with hashes in the cleanup list) overflow their container even though the callers wrap them in elements that ask for `break-all`. Should the label wrap?
- **Checkbox Q2.** Because the native appearance is removed, an `indeterminate` checkbox looks unchecked. No caller uses it (the "select all" box computes plain `checked`). Should a mixed state be drawn?
- **Checkbox Q3.** The label is block-level, so it fills the row and ignores centred text alignment (the Dialog specification noted this for unlabelled forms). Intended?

---

## 6. `src/webview/components/ui/ScrollShadow.tsx`

### 6.1 Interface

- Path: `src/webview/components/ui/ScrollShadow.tsx`, imported as `./components/ui/ScrollShadow` from `src/webview/App.tsx`.
- One export: the function component **`ScrollShadow`**, with no props. `App` renders it once, as a direct child of its root, after the main content and before the context menu and dialog.
- No test uses it.

### 6.2 Dependencies the implementation must use

- The class `animate-scroll-shadow` and the token `--shadow-scroll` (utility `shadow-scroll`) from `src/webview/styles.css` (§10). These three pieces (the component, the class and the token) exist only for each other; they may be renamed together, but the stylesheet and the component must agree.

### 6.3 Behaviour

**Rendered structure.** One empty `<div>` with `aria-hidden="true"`. No text, no role, no children.

**Look and motion (CSS only).**

- Fixed to the viewport: stretched from the left edge to the right edge at the very top, zero height, stacking level 1 (`z-index: 1`), and it never receives pointer events.
- It casts a box shadow `0 -6px 6px 6px` in `--vscode-scrollbar-shadow` (VS Code's "scrolled content" shadow colour). With a zero-height box, this shows as a soft band about 6 px deep just below the top edge of the window.
- Its opacity is driven by how far the document (root scroller, vertical axis) has scrolled: 0 at the very top, rising linearly to 1 over the first 1 px of scrolling, and staying at 1 beyond (a scroll-driven animation with fill both ways). See §6.5 for the run-time constraints.

**Interaction with the rest of the page.** The main header (`MainHeader`) is `position: sticky` at the top with `z-index: 20` and an opaque editor-coloured background, and the commit table's header row is sticky just below it with `z-index: 10`. The shade (z-index 1, in the top ~6 px) therefore sits under the header whenever the App is shown. See ScrollShadow Q1.

### 6.4 Concrete examples

| Render / state              | Observed                                                                    |
| --------------------------- | --------------------------------------------------------------------------- |
| `<ScrollShadow />` in jsdom | `<div aria-hidden="true" class="…"></div>`, `textContent` `""`              |
| Browser, `scrollY = 0`      | Shade fully transparent                                                     |
| Browser, `scrollY ≥ 1`      | Shade fully opaque (though covered by the sticky header in the App, see Q1) |

### 6.5 Non-functional requirements

- Zero run-time cost: no hooks, listeners, timers or re-renders.
- Needs a browser with CSS scroll-driven animations (`animation-timeline: scroll()`; Chromium 115 or later). VS Code 1.125, the declared minimum (`engines.vscode: ^1.125.0`), ships a newer Chromium.

### 6.6 Test coverage

Already checked: nothing.

Gaps, with test cases:

1. **Markup.** Call: render `h(ScrollShadow, null)`. Expected: one `div` child with `aria-hidden="true"`, no `role`, `textContent === ""`, no children.
2. **Styles exist.** See §10.6 gap 1 (the compiled stylesheet contains the `animate-scroll-shadow` rule with a root scroll timeline and the `shadow-scroll` utility).

Not testable in jsdom: the fade and whether it is visible.

### 6.7 Questions

- **ScrollShadow Q1.** Since the main header became sticky (and opaque, above it in stacking order), the shade is hidden behind the header in every App state, so it probably never shows. Should it move below the sticky header (and table header), or be removed?
- **ScrollShadow Q2.** In a browser without scroll-driven animations the declaration degrades to a zero-length animation that fills forwards, so the shade would show at full strength even at the top. Acceptable given the minimum VS Code version?

---

## 7. `src/webview/pages/NoRepoPage.tsx`

### 7.1 Interface

- Path: `src/webview/pages/NoRepoPage.tsx`, imported as `./pages/NoRepoPage` from `src/webview/main.tsx`.
- One export: the function component **`NoRepoPage`**, with no props.
- Caller: `main.tsx`'s root view renders it when the repository list has loaded and is empty. When the list later gains a repository (the extension's watcher and rescans update the repository store), the root replaces this page with the App; this page does not navigate by itself.
- No test uses it.

### 7.2 Dependencies the implementation must use

- `useState` from `preact/hooks` (or equivalent local state) for the in-progress flag and the error text.
- `Button` from `@/webview/components/ui/Button` (primary variant).
- `Icon` from `@/webview/components/ui/Icons` for the button's glyph.
- `rpcClient` from `@/webview/lib/rpc/rpc-client`: `rpcClient.request("git.init", null)` asks the extension to start VS Code's own "Initialize Repository" flow. The method's result type is `boolean` (`RpcMethodMap` in `src/types/rpc.types.ts`).
- `window.l10n` (type `LocalizedStrings`), keys:

  | Key                      | English text (from `src/old-extension/l10n/webviewL10n.ts`) |
  | ------------------------ | ----------------------------------------------------------- |
  | `noRepo`                 | `No Git repository found`                                   |
  | `initializeRepo`         | `Initialize Repository`                                     |
  | `unableToInitializeRepo` | `Unable to initialize the repository: {0}`                  |

  Chinese translations exist in `l10n/bundle.l10n.zh-cn.json` and `zh-tw.json` (for example `未找到 Git 仓库`, `初始化仓库`, `无法初始化仓库：{0}`).

### 7.3 Behaviour

**Rendered structure.**

- A `<main>` landmark containing one `<section>` with `aria-labelledby="no-repo-title"`.
- In the section, in order:
  1. A decorative illustration: a circular badge containing an inline SVG with `aria-hidden="true"`. No text.
  2. An `<h1 id="no-repo-title">` with `window.l10n.noRepo`.
  3. A container holding one primary `Button` whose content is a decorative glyph (`Icon`) followed by `window.l10n.initializeRepo`. Its `textContent` is exactly that string.
  4. Only when an error is set: a `<p role="alert">` with the error text.

**Initializing.**

1. Clicking the button (or pressing Enter/Space on it) at once: marks the page as busy, which disables the button; clears any previous error, so the alert disappears; and sends one request, `rpcClient.request("git.init", null)`.
2. While busy the button is `disabled`, so further clicks are ignored and no second request is sent.
3. When the request **resolves** (with any value, including `false`): the page stops being busy (the button is enabled again) and shows no error. Nothing else happens; the page stays until the repository list changes.
4. When the request **rejects** (or `request` throws synchronously): the page stops being busy and shows the alert. Its text is the `unableToInitializeRepo` template with its first `{0}` replaced by the reason's message: `reason.message` when the reason is an `Error`, otherwise `String(reason)` (so `"plain string"` for a string, `"undefined"` for `undefined`). An empty message leaves the template's text with nothing in place of `{0}`. The substitution uses JavaScript's string-replacement rules, so `$` sequences in the message are interpreted (observed: a message `boom $& $1` shows as `boom {0} $1`; `$$` would show as `$`). Only the first `{0}` is replaced. See NoRepoPage Q1.
5. If the page is unmounted while the request is pending, the later settlement changes nothing and raises no error.

**Failures callers can observe.** Through `rpcClient`:

- The extension answers with an error: the rejection's message is the extension's error text. For example, when VS Code's Git extension is disabled the extension reports `command 'git.init' not found`.
- No answer within the client's deadline (30 s for every method, `rpc-client.ts`): the message is the shell's `data-rpc-timeout` template with the method name, in English `The extension did not answer in time: git.init`.
- The request cannot be posted: the posting error's message.

This module runs no Git command itself; VS Code's `git.init` command (the built-in Git extension's "Git: Initialize Repository") asks the user where to create the repository and runs `git init` there, and the extension's handler resolves once that flow ends, whether or not the user cancelled.

**Look.**

- `<main>`: at least the full viewport height, content centred on both axes, padding 1.5 rem (24 px) left and right and 4 rem (64 px) top and bottom.
- Section: full width up to 32 rem (512 px), text centred.
- Badge: a 7 rem (112 px) circle centred horizontally with 1.5 rem (24 px) below it, a 1 px border in `line-soft` and background `btn`; the SVG inside is 5 rem (80 px) square, centred, drawn with 2-unit strokes in `muted`. The picture: a folder outline (tab on its upper left) filled with `editor`, and inside it a small commit graph of three hollow commit dots (filled with `editor`, outlined in `muted`), two on a horizontal line and one below the middle of that line, the connecting lines drawn in `focus`. Draw it afresh.
- Heading: 1.25 rem (20 px) text with 1.75 rem line height, semibold (600).
- Button row: 1.5 rem (24 px) above the button. The button's glyph is a 16 px outline of a folder with a small plus inside, stroked in the button's text colour, no fill.
- Alert: 1.25 rem (20 px) below the button row, text colour `git-deleted` (the colour this webview uses for all error text).

### 7.4 Concrete examples

English strings, `rpcClient.request` stubbed.

| Situation                                                    | Observed                                                                                                                                    |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| First render                                                 | `h1#no-repo-title` "No Git repository found"; enabled button "Initialize Repository"; no `[role="alert"]`; the only `id` is `no-repo-title` |
| Click; request pending                                       | One call `request("git.init", null)`; button `disabled`; a second click sends nothing                                                       |
| Request rejects with `Error("command 'git.init' not found")` | Button enabled; `p[role=alert]` "Unable to initialize the repository: command 'git.init' not found"                                         |
| Click again; pending                                         | Alert removed immediately; button disabled                                                                                                  |
| Request resolves `true`                                      | Button enabled; no alert; page unchanged                                                                                                    |
| Request resolves `false`                                     | Same as `true`                                                                                                                              |
| Request rejects with the string `"plain string"`             | Alert "Unable to initialize the repository: plain string"                                                                                   |
| Request rejects with `undefined`                             | Alert "Unable to initialize the repository: undefined"                                                                                      |
| Request rejects with `Error("")`                             | Alert "Unable to initialize the repository: " (alert present)                                                                               |
| `request` throws synchronously `Error("sync")`               | Alert "Unable to initialize the repository: sync"                                                                                           |
| No answer for 30 s                                           | Alert "Unable to initialize the repository: The extension did not answer in time: git.init"                                                 |
| Template `"… {0} ({0})"`, reason `Error("boom $& $1 {0}")`   | Alert "… boom {0} $1 {0} ({0})": only the first placeholder is filled, and `$&` became the placeholder text                                 |

### 7.5 Non-functional requirements

- Reads `window.l10n` only while rendering or handling the click, never at import time (the strings arrive over RPC after the bundle loads).
- One request per click at most; no retries, timers or polling of its own.
- No cleanup is needed on unmount; a late settlement must not throw.

### 7.6 Test coverage

Already checked: nothing in the webview. The extension side of `git.init` is covered by `tests/extension/initialize-repo.test.ts`, `tests/extension/rpc-handlers.test.ts` and `tests/extension/rpc-wire.test.ts` (including the `command 'git.init' not found` failure).

Gaps, with test cases (use `setupWebviewTest()`, then give `window.l10n` a proxy that returns `"Unable: {0}"` for `unableToInitializeRepo` and key names otherwise; stub with `vi.spyOn(rpcClient, "request")`):

1. **Initial render.** Expected: `main > section[aria-labelledby="no-repo-title"]`; `#no-repo-title` is an `H1` with text `noRepo`; exactly one `button`, enabled, `type="button"`, `textContent === "initializeRepo"`; no `[role="alert"]`; decorative `svg`s all `aria-hidden="true"`.
2. **Busy while pending.** Setup: `request` returns a never-settling promise. Call: click the button, flush with `act`. Expected: `request` called once with `("git.init", null)`; button `disabled`; clicking again leaves the call count at 1.
3. **Error shown.** Setup: `request` rejects `new Error("boom")`. Call: click, flush. Expected: `[role="alert"]` text `Unable: boom`; button enabled.
4. **Non-Error reason.** Setup: rejects `"text"`. Expected: alert `Unable: text`.
5. **Retry clears the error.** Setup: first call rejects, second never settles. Call: click, flush, click, flush. Expected: after the second click no `[role="alert"]` and the button is disabled.
6. **Success leaves the page quiet.** Setup: resolves `true`. Expected: button enabled; no alert; the heading unchanged.
7. **Unmount while pending.** Setup: a deferred promise. Call: click, unmount, then reject. Expected: no exception.

### 7.7 Questions

- **NoRepoPage Q1.** The error text is built with plain string replacement, so `$&`, `` $` ``, `$'` and `$$` in an error message are interpreted, and only the first `{0}` is filled. `rpc-client.ts` fills its own templates literally and everywhere. Should this page do the same?
- **NoRepoPage Q2.** VS Code's init flow waits for the user to choose a folder, but the RPC deadline is 30 s. A slow choice shows "did not answer in time" while the picker is still open, and the re-enabled button lets the user start a second flow. Should `git.init` get a longer or no deadline, or should the page stay busy until the flow ends?
- **NoRepoPage Q3.** After a successful or cancelled flow there is no feedback; the page waits for the repository watcher. If the user creates the repository outside the workspace, nothing changes. The resolved `boolean` is ignored. Is any message wanted?
- **NoRepoPage Q4.** Disabling the focused button during the request makes the browser drop focus (HTML's focus fix-up), and focus is not restored when the button is enabled again. Should focus return to the button, or should the button use `aria-disabled` instead?
- **NoRepoPage Q5.** The heading id `no-repo-title` is fixed; two instances would clash. Only one is ever rendered today. Generate it instead?

---

## 8. `src/webview/pages/NoCommitsPage.tsx`

### 8.1 Interface

- Path: `src/webview/pages/NoCommitsPage.tsx`, imported as `@/webview/pages/NoCommitsPage`.
- One export: the function component **`NoCommitsPage`**, with no props.
- Caller: `src/webview/layout/GraphView.tsx`, which returns it **instead of** its own `<main>` when the view is not in filtered-history mode, the commit list has loaded and is empty, and the repository has no `HEAD` commit (`commitHead` is `null`). It is not shown while a graph error is displayed.
- Tests: `tests/webview/components/commit/GraphErrors.test.ts` (through `GraphView`).

### 8.2 Dependencies the implementation must use

- `window.l10n`, keys `noCommits` (English `No commits yet`; zh-cn `尚无提交`; zh-tw `尚無提交`) and `createFirstCommit` (English `Create the first commit to start the graph.`; zh-cn `创建第一个提交以开始显示提交图。`).

### 8.3 Behaviour

**Rendered structure.** A `<main>` element (it replaces GraphView's `<main>`, so the graph area still has one main landmark) containing one block with, in order:

1. a decorative inline SVG with `aria-hidden="true"`;
2. an `<h1>` with `window.l10n.noCommits`;
3. a `<p>` with `window.l10n.createFirstCommit`.

It contains no `role="alert"`, no buttons, no ids and no other text; its `textContent` is the heading text followed by the paragraph text.

**Look.**

- `<main>`: at least 24 rem (384 px) tall, content centred on both axes, padding 1.5 rem (24 px) left and right and 4 rem (64 px) top and bottom.
- Content block: up to 28 rem (448 px) wide, text centred.
- Illustration: 5 rem (80 px) square, centred, 1.25 rem (20 px) below it, drawn with 2-unit strokes in `muted` and no fill: three hollow commit dots (filled with `editor`), two near the top (left and right) and one at the lower right; a trunk from the upper-left dot runs down and curves right into the lower-right dot, and a branch leaves the trunk part-way down and curves up into the upper-right dot. Draw it afresh.
- Heading: 1.25 rem (20 px) with 1.75 rem line height, semibold, 0.5 rem (8 px) below it.
- Paragraph: colour `muted`.

### 8.4 Concrete examples

| Situation                                                                                   | Observed                                                                  |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Test strings (key-name proxy)                                                               | `main` › … `h1` "noCommits", `p` "createFirstCommit"; no `[role="alert"]` |
| English                                                                                     | "No commits yet" / "Create the first commit to start the graph."          |
| GraphView after a `loadCommits` error, then Retry succeeds with `commits: []`, `head: null` | Alert gone; text contains `noCommits` (existing test)                     |

### 8.5 Non-functional requirements

- Pure; no hooks; reads `window.l10n` at render time only; no import-time behaviour.

### 8.6 Test coverage

Already checked:

- `tests/webview/components/commit/GraphErrors.test.ts` ("shows Git failures with Retry, then recovers to the normal empty-repository view"): the page's text appears (`noCommits`) and there is no `[role="alert"]`; while the error shows, `noCommits` is absent.
- UI workflow test "shows a graph error and retries after a Git configuration failure is repaired": `main`'s text does not contain "No commits yet" while a graph error is shown.

Gaps, with test cases:

1. **Structure.** Setup: `setupWebviewTest()`. Call: render `h(NoCommitsPage, null)`. Expected: root is `MAIN`; it contains one `H1` with text `noCommits` and one `P` with text `createFirstCommit`; every `svg` has `aria-hidden="true"`; no `button`, no `[role]`, no `[id]`.

### 8.7 Questions

- **NoCommitsPage Q1.** The page offers no action (for example opening Source Control to make the first commit); the text tells the user what to do. Intended?
- **NoCommitsPage Q2.** Its `h1` sits below the App's header, whose controls are not headings, while GraphView's error view uses an `h2`. Should the empty state use the same heading level as the error state?

---

## 9. `src/webview/pages/LoadingPage.tsx`

### 9.1 Interface

- Path: `src/webview/pages/LoadingPage.tsx`, imported as `./pages/LoadingPage` from `src/webview/main.tsx`.
- One export: the function component **`LoadingPage`**, with no props.
- Caller: `main.tsx`, twice: rendered into `#app` as soon as the bundle runs, **before** the webview has asked for its strings (`window.l10n` does not exist yet); and by the root view while the repository list is still unknown.
- No test uses it.

### 9.2 Dependencies the implementation must use

- `Loading` from `@/webview/components/ui/Loading`, with `variant="page"`.

### 9.3 Behaviour

Renders a `<main>` element containing exactly one page-variant `Loading` (§1). The `<main>` is at least the full viewport height, centres its content on both axes, and has padding 1.5 rem (24 px) left and right and 4 rem (64 px) top and bottom. It must not read `window.l10n`.

### 9.4 Concrete examples

| Situation                                   | Observed                                                                    |
| ------------------------------------------- | --------------------------------------------------------------------------- |
| `data-loading="Loading…"`, no `window.l10n` | `main` › `div[role=status][aria-live=polite]` containing an `h1` "Loading…" |
| `data-loading="正在載入…"` (zh-tw)          | `h1` "正在載入…"                                                            |

### 9.5 Non-functional requirements

- Pure; no hooks; no import-time behaviour; safe without `window.l10n`.

### 9.6 Test coverage

Already checked: nothing directly (the page variant of `Loading` is covered by `Loading.test.ts`).

Gaps, with test cases:

1. **Structure without strings.** Setup: `data-loading="L"`; `window.l10n` not defined (do not call `setupWebviewTest`). Call: render `h(LoadingPage, null)`. Expected: root `MAIN`; one `[role="status"]` inside; its `h1` text `L`; no exception.

### 9.7 Questions

None.

---

## 10. `src/webview/styles.css`

### 10.1 Interface

The stylesheet has no JavaScript exports. Its interface is:

1. **Its path and how it is loaded.** It stays at `src/webview/styles.css`. `src/webview/main.tsx` imports it for its side effect (`import "./styles.css"`; `global.d.ts` declares `*.css` modules and the lint rule `import/no-unassigned-import` allows `**/*.css`). `esbuild.js` runs every `.css` file through PostCSS with `@tailwindcss/postcss` and bundles the result next to the webview script as `out/web.min.css`. `src/extension/html.ts` links `out/web.min.css`, `scripts/package-smoke.cjs` requires it to be non-empty in the packaged extension, and `tests/extension/webview-page.test.ts` checks the link.
2. **The design tokens** (§10.3.3), whose names become Tailwind utility class names used across the whole webview.
3. **Three hand-written rule sets** whose class names other modules put in the markup: `graph-scrollbar` (by `CommitTable.tsx`), `branch-focus-row` (by `CommitRow.tsx`) and `animate-scroll-shadow` (by `ScrollShadow.tsx`), plus the attribute and custom-property contract of `branch-focus-row`.

### 10.2 Dependencies the implementation must use

- The `tailwindcss` package (v4), imported by the stylesheet, with Tailwind's preflight, default theme and utilities. The build plugin is `@tailwindcss/postcss` through `esbuild.js`.
- VS Code's theme variables. VS Code exposes each theme colour to webviews as a CSS custom property named `--vscode-` followed by the colour id with dots replaced by dashes (for example `focusBorder` → `--vscode-focusBorder`, `editor.background` → `--vscode-editor-background`), plus `--vscode-font-family`, `--vscode-editor-font-family` and others, and updates them live when the user switches themes. It also puts `vscode-light`, `vscode-dark`, `vscode-high-contrast` or `vscode-high-contrast-light` on `<body>` (the UI tests wait for these; the stylesheet does not use them).

### 10.3 Behaviour (what the compiled stylesheet must contain)

#### 10.3.1 Cascade layers

The layer order is declared first: `theme`, then `base`, then `components`, then `utilities`. Tailwind's theme variables go in `theme`, preflight in `base`, the three hand-written rule sets in `components`, and utilities in `utilities`, so any utility class overrides a hand-written rule of the same property.

#### 10.3.2 Tailwind import and class detection

Tailwind is imported whole (preflight, theme, utilities) with automatic class detection restricted to the directory that contains the stylesheet, `src/webview/` (Tailwind's `source("./")` form of the import). Consequences callers depend on:

- Every class name written literally in any file under `src/webview/` (`.tsx`, `.ts` such as `components/ui/Input.ts` and `lib/use-page.tsx`, and so on) gets a rule; names that appear only elsewhere (tests, scripts) do not.
- Tailwind emits a theme variable only if some generated utility uses it or the variable is referenced literally (as `var(--color-…)`) in a scanned file or in the stylesheet. Observed: a token referenced only as `fill="var(--color-zzz)"` in a scanned `.tsx` is emitted; a token referenced nowhere is not. The pages use `var(--color-editor)` and `var(--color-focus)` directly in SVG attributes; both are also used by utilities.

#### 10.3.3 Design tokens (facts: names and values)

Defined in Tailwind's `@theme`. Each token name below is a Tailwind theme variable; the "Utility" column is the class family it creates.

Typography, shape and layout:

| Token                              | Value                                           | Utility / effect                                                                                   | Used by                                                                         |
| ---------------------------------- | ----------------------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `--default-font-family`            | `var(--vscode-font-family)`                     | Preflight's base font for the whole page                                                           | everything                                                                      |
| `--default-mono-font-family`       | `var(--vscode-editor-font-family)`              | Preflight's font for `code`, `kbd`, `samp`, `pre` (not for the `font-mono` utility; see styles Q2) | `<code>` in callers                                                             |
| `--text-ui`                        | `13px`                                          | `text-ui` (sets `font-size` only; no line height)                                                  | Button, Loading, CommitTable, MainHeader, GraphView, QueryControls, … (15 uses) |
| `--radius-md`                      | `5px` (replaces Tailwind's default)             | `rounded-md`                                                                                       | Dialog, ContextMenu, Dropdown, RefLabel (5 uses)                                |
| `--container-dialog`               | `min(360px, calc(100vw - 2rem))`                | would create `max-w-dialog`/`w-dialog`; **unused** (styles Q1)                                     | nothing                                                                         |
| `--grid-template-columns-labelled` | `auto 1fr`                                      | `grid-cols-labelled`                                                                               | Dialog's labelled forms (`sm:grid-cols-labelled`)                               |
| `--shadow-head`                    | `inset 2px 0 0 var(--color-graph)`              | `shadow-head`: a 2 px bar on the inside left edge in the row's graph colour                        | CommitRow (HEAD commit's description cell)                                      |
| `--shadow-dialog`                  | `0 0 30px 5px var(--vscode-widget-shadow)`      | `shadow-dialog`                                                                                    | Dialog panel                                                                    |
| `--shadow-scroll`                  | `0 -6px 6px 6px var(--vscode-scrollbar-shadow)` | `shadow-scroll`                                                                                    | ScrollShadow                                                                    |

Colours (each creates `bg-`, `text-`, `border-`, `outline-`, `fill-`, `stroke-`… utilities, and they must be real Tailwind colour tokens so opacity modifiers work: the codebase uses `text-fg/60` in FileTree and `stroke-editor/75` in CommitGraph):

| Token                        | Value                                                                                  | Used by (files under `src/webview/`)                                                   |
| ---------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `--color-fg`                 | `var(--vscode-foreground)`                                                             | Loading, ActivityView, BranchFocusBadge, FileTree, lib/use-page; `.branch-focus-row`   |
| `--color-muted`              | `var(--vscode-descriptionForeground)`                                                  | 18 files incl. Loading, both pages, Dialog, Dropdown; `.branch-focus-row`              |
| `--color-dropdown`           | `var(--vscode-dropdown-background)`                                                    | Select, Dropdown                                                                       |
| `--color-dropdown-fg`        | `var(--vscode-dropdown-foreground)`                                                    | Select, Dropdown                                                                       |
| `--color-dropdown-border`    | `var(--vscode-dropdown-border, rgba(128, 128, 128, 0.5))`                              | Dropdown                                                                               |
| `--color-menu`               | `var(--vscode-menu-background, var(--vscode-dropdown-background))`                     | Dialog, ContextMenu, Dropdown                                                          |
| `--color-menu-fg`            | `var(--vscode-menu-foreground, var(--vscode-dropdown-foreground))`                     | Dialog, ContextMenu, Dropdown                                                          |
| `--color-menu-active`        | `var(--vscode-menu-selectionBackground, var(--vscode-list-activeSelectionBackground))` | ContextMenu, Dropdown                                                                  |
| `--color-menu-active-fg`     | `var(--vscode-menu-selectionForeground, var(--vscode-list-activeSelectionForeground))` | ContextMenu, Dropdown                                                                  |
| `--color-input`              | `var(--vscode-input-background)`                                                       | Input.ts, Dropdown, RebaseEditor                                                       |
| `--color-input-fg`           | `var(--vscode-input-foreground)`                                                       | Input.ts, Dropdown, RebaseEditor                                                       |
| `--color-input-border`       | `var(--vscode-input-border, rgba(128, 128, 128, 0.5))`                                 | Input.ts, Select                                                                       |
| `--color-checkbox`           | `var(--vscode-checkbox-background)`                                                    | Checkbox                                                                               |
| `--color-checkbox-checked`   | `var(--vscode-button-background)`                                                      | Checkbox                                                                               |
| `--color-checkbox-check`     | `var(--vscode-button-foreground)`                                                      | Checkbox                                                                               |
| `--color-focus`              | `var(--vscode-focusBorder)`                                                            | 17 files incl. Button, Select, Checkbox, Loading, NoRepoPage (as `var(--color-focus)`) |
| `--color-line`               | `rgba(128, 128, 128, 0.5)`                                                             | 15 files incl. Button, Checkbox, Dialog                                                |
| `--color-line-soft`          | `rgba(128, 128, 128, 0.25)`                                                            | 14 files incl. Loading, NoRepoPage, App, MainHeader                                    |
| `--color-btn`                | `rgba(128, 128, 128, 0.1)`                                                             | Button, RefLabel, CommitDetails, NoRepoPage                                            |
| `--color-btn-hover`          | `rgba(128, 128, 128, 0.2)`                                                             | Button, Dropdown, WorkspacePane, RefsPane, RefLabel, CommitRow, CommitTable, GraphView |
| `--color-action`             | `var(--vscode-button-background)`                                                      | Button, ActivityView                                                                   |
| `--color-action-fg`          | `var(--vscode-button-foreground)`                                                      | Button                                                                                 |
| `--color-action-hover`       | `var(--vscode-button-hoverBackground)`                                                 | Button                                                                                 |
| `--color-git-added`          | `var(--vscode-gitDecoration-addedResourceForeground)`                                  | WorkspacePane, HistoryTools, FileTree                                                  |
| `--color-git-modified`       | `var(--vscode-gitDecoration-modifiedResourceForeground)`                               | WorkflowTools, WorkspacePane, HistoryTools, FileTree                                   |
| `--color-git-deleted`        | `var(--vscode-gitDecoration-deletedResourceForeground)`                                | NoRepoPage and five other files (error text)                                           |
| `--color-editor`             | `var(--vscode-editor-background)`                                                      | 10 files incl. Loading, both pages (as `var(--color-editor)`), MainHeader, RefLabel    |
| `--color-row-head`           | `var(--vscode-list-inactiveSelectionBackground)`                                       | WorkspacePane, RefsPane, CommitRow, GraphView                                          |
| `--color-row-hover`          | `var(--vscode-list-hoverBackground)`                                                   | 7 files                                                                                |
| `--color-row-selected`       | `rgba(128, 128, 128, 0.25)`                                                            | CommitRow, MainHeader (passed to `Button`)                                             |
| `--color-row-selected-hover` | `rgba(128, 128, 128, 0.35)`                                                            | CommitRow                                                                              |
| `--color-graph`              | `var(--vscode-focusBorder)` by default; overridden per commit row (§10.3.5)            | RefLabel, CommitRow; `--shadow-head`                                                   |

Tokens must stay `var()` references to the VS Code variables (not values resolved at build time), so that switching the theme recolours the open page; the UI tests switch among four themes in one session.

#### 10.3.4 `graph-scrollbar`

`CommitTable` puts `graph-scrollbar` on the horizontal scroller under the graph column (`[data-graph-scroll]`). For elements with this class, using WebKit scrollbar pseudo-elements:

- the scrollbar is 8 px tall;
- its thumb has background `--vscode-scrollbarSlider-background` and 4 px rounded corners;
- while the pointer is over the thumb, its background is `--vscode-scrollbarSlider-hoverBackground`.

#### 10.3.5 `branch-focus-row`

`CommitRow` puts `branch-focus-row` on every commit `<tr>`, together with:

- `data-branch-relation`: `"normal"`, `"direct"`, `"merged"` or `"unrelated"` (the row's relation to a focused branch);
- `data-emphasized`: `"true"` or `"false"` (HEAD, uncommitted changes, expanded, marked, or menu open);
- inline custom properties `--branch-colour` (the branch's full colour) and `--branch-display-colour` (the colour to show for the row's relation, possibly dimmed).

Other modules set two more custom properties this rule reads: `--main-header-height` on `<html>` (by `MainHeader`, the measured header height) and `--graph-top` on the commit table's container (by the graph-scroll hook, the table header row's height).

Required effects:

1. **Graph colour inside the row.** Within the row, `--color-graph` is `--branch-display-colour`. So `bg-graph`, `border-graph` and `shadow-head` inside the row (ref label tiles, the HEAD marker, the HEAD bar) take the row's displayed branch colour.
2. **Text colour by relation.**
   - `merged`: a mix of 80 % `fg` and 20 % `muted` in sRGB (`color-mix(in srgb, var(--color-fg) 80%, var(--color-muted))`); where `color-mix` is unsupported, plain `fg`.
   - `unrelated`: `muted`.
   - `normal` and `direct`: no rule; the row inherits the normal text colour.
3. **Emphasis.** While the row is hovered, contains focus, or has `data-emphasized="true"`, its text colour is `fg` and `--color-graph` is `--branch-colour`, whatever the relation. This must beat the relation rules.
4. **Scrolling a row into view.** The row's `scroll-margin-top` is `--main-header-height` (default 0 px) plus `--graph-top` (default 32 px). Keyboard navigation that scrolls a focused row into view then stops below both sticky headers.

The dimming level (subtle or strong) changes only the graph lines, not the row text: the UI test asserts that an unrelated row's computed text colour is the same under both levels, and that direct, merged and unrelated rows' description text has at least 4.5 : 1 contrast in the light, dark and both high-contrast themes.

#### 10.3.6 Scroll shade animation

- A keyframes rule named `scroll-shadow` that animates `opacity` from 0 to 1.
- The class `animate-scroll-shadow` runs that animation with linear timing and fill in both directions, on the **root element's vertical scroll timeline**, over the scroll range from 0 to 1 px. (Note for implementers: in CSS, the `animation` shorthand resets `animation-timeline`, so the timeline must be declared after any shorthand.)

### 10.4 Concrete examples

| Input (class or state)                                                                                             | Computed effect                                                                             |
| ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| `text-ui`                                                                                                          | `font-size: 13px`                                                                           |
| `bg-btn`                                                                                                           | background `rgba(128, 128, 128, 0.1)`                                                       |
| `border-input-border`, theme without `input.border`                                                                | border colour `rgba(128, 128, 128, 0.5)`                                                    |
| `rounded-md`                                                                                                       | `border-radius: 5px`                                                                        |
| `shadow-head` inside a `branch-focus-row` with `--branch-display-colour: #f00`                                     | inset 2 px red bar on the left                                                              |
| `tr.branch-focus-row[data-branch-relation="unrelated"]`                                                            | text colour `--vscode-descriptionForeground`                                                |
| Same row hovered                                                                                                   | text colour `--vscode-foreground`; `--color-graph` = `--branch-colour`                      |
| `tr.branch-focus-row[data-emphasized="true"][data-branch-relation="merged"]`                                       | text colour `--vscode-foreground`                                                           |
| `tr.branch-focus-row` with `--main-header-height: 48px` on `<html>` and `--graph-top: 30px` on its table container | `scroll-margin-top: 78px`                                                                   |
| Same without either property                                                                                       | `scroll-margin-top: 32px`                                                                   |
| `.graph-scrollbar` with overflow                                                                                   | 8 px scrollbar, rounded slider in VS Code's slider colours                                  |
| `code` element                                                                                                     | VS Code editor font                                                                         |
| `font-mono` utility                                                                                                | Tailwind's default monospace stack (`ui-monospace, SFMono-Regular, …`), not the editor font |

### 10.5 Non-functional requirements

- Only CSS; no JavaScript.
- Keep the compiled file small (about 37 KB unminified today); the webview loads it on every panel open.
- Everything themable comes from VS Code variables at run time, so theme switches need no reload.
- Scroll-driven animation, `color-mix()` and `:has()` (used by `Checkbox` through Tailwind's `has-*` variant) all require the Chromium in VS Code 1.125 or later; that is the declared minimum.

### 10.6 Test coverage

Already checked:

- No unit test loads CSS.
- UI workflow tests, in a real VS Code: relation text contrast and equal text colour across dimming levels, focus outlines with at least 3 : 1 contrast for `Button`, the Dimming `Select`, the graph scroller and others, in four themes ("keeps focus and remote controls readable and keyboard accessible", ×4); a keyboard-focused row is never hidden behind the sticky headers and the table header follows the sticky main header ("reveals selected lanes and keeps graph scrolling accessible deep in history"); `path[data-branch-relation="merged"]` strokes use `color-mix` (graph code, not this file).
- `tests/extension/webview-page.test.ts`: the page links `out/web.min.css`.

Gaps, with test cases:

1. **Compiled output.** Setup: a Vitest file (node environment) that loads `postcss` and `@tailwindcss/postcss`. Call: process the contents of `src/webview/styles.css` with `from` set to its absolute path. Expected: the output contains
   - the layer order declaration `theme, base, components, utilities`;
   - `--text-ui: 13px`, `--radius-md: 5px`, `--color-line: rgba(128, 128, 128, 0.5)`, `--color-focus: var(--vscode-focusBorder)` and `--color-graph: var(--vscode-focusBorder)` in the theme layer;
   - `.graph-scrollbar::-webkit-scrollbar` with `height: 8px`;
   - `.branch-focus-row` with `scroll-margin-top: calc(var(--main-header-height, 0px) + var(--graph-top, 32px))`, `.branch-focus-row[data-branch-relation="unrelated"]` with `color: var(--color-muted)`, and a rule for `:hover`, `:focus-within` and `[data-emphasized="true"]` setting `color: var(--color-fg)`;
   - `@keyframes scroll-shadow` and `.animate-scroll-shadow` with `animation-timeline: scroll(root block)` and `animation-range: 0 1px`;
   - rules for `.text-ui`, `.shadow-head`, `.shadow-scroll`, `.text-fg\/60`, and `.sm\:grid-cols-labelled` inside the `sm` (40 rem) media query (only the `sm:` form is used, so the bare `.grid-cols-labelled` is not generated).
2. **Caller background beats the Button default.** Same setup. Expected: in the utilities layer, the rule for `.bg-row-selected` appears after the rule for `.bg-btn`, and the rule for `.not-disabled\:hover\:bg-btn-hover` appears after both.
3. **Emphasis beats relation.** Same setup. Expected: the `:hover`/`:focus-within`/`[data-emphasized="true"]` rule for `.branch-focus-row` appears after the `merged` and `unrelated` rules (equal specificity, so order decides).

### 10.7 Questions

- **styles Q1.** `--container-dialog` is defined but unused; the Dialog uses its own widths (600 px, or 960 px when wide). Remove the token, or have the Dialog use it?
- **styles Q2.** `--default-mono-font-family` gives `code`, `kbd`, `samp` and `pre` VS Code's editor font, but the `font-mono` utility (8 uses) still uses Tailwind's generic monospace stack. Should `--font-mono` also point at `--vscode-editor-font-family`?
- **styles Q3.** The graph scrollbar is 8 px inside a 10 px-tall scroller, and its thumb has no pressed colour (VS Code has `scrollbarSlider.activeBackground`). Intended?
- **styles Q4.** The 32 px fallback for `--graph-top` repeats `TABLE_HEADER_HEIGHT` from `src/webview/constants.ts`; the two can drift apart. Acceptable?
- **styles Q5.** Borders and neutral fills (`line`, `line-soft`, `btn`, `btn-hover`, `row-selected`) are fixed translucent greys rather than theme colours (for example `--vscode-contrastBorder` in high-contrast themes). The high-contrast UI tests pass today; should high-contrast themes use their contrast border instead?

---

## 11. Summary of test gaps

| Module        | Gap                                                                                                                                                                                                 |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Loading       | default variant is inline with no `h1`; caller class added; missing shell attribute; decoration hidden and wordless; text follows attribute on re-render                                            |
| Select        | options in order with nothing extra; no stray attributes; only `change` reports; unmatched value; controlled on re-render                                                                           |
| Button        | default `type="button"`; explicit type kept; attribute pass-through; caller class appended; no form submission by default; disabled blocks clicks; children only; caller background order (via §10) |
| Icons         | contract of every named icon; eye states differ; `Icon` defaults and overrides; branch and tag are filled glyphs                                                                                    |
| Checkbox      | structure (label without `for`, input, hidden tick, exact text); props reach the input; label click toggles; disabled ignores clicks; controlled on re-render                                       |
| ScrollShadow  | markup; stylesheet rules exist (via §10)                                                                                                                                                            |
| NoRepoPage    | initial render; busy while pending; error shown; non-Error reason; retry clears error; success quiet; unmount while pending                                                                         |
| NoCommitsPage | structure                                                                                                                                                                                           |
| LoadingPage   | structure without `window.l10n`                                                                                                                                                                     |
| styles.css    | compiled output contents; caller background order; emphasis rule after relation rules                                                                                                               |

## 12. Summary of questions

Loading Q1–Q6, Select Q1–Q4, Button Q1–Q4, Icons Q1–Q4, Checkbox Q1–Q3, ScrollShadow Q1–Q2, NoRepoPage Q1–Q5, NoCommitsPage Q1–Q2, styles Q1–Q5 (LoadingPage has none). Each is stated in its module's section.

---

## 13. Decisions

These decisions are the maintainer's answers to the questions above. Where they differ from "current behaviour" elsewhere in this specification, they win.

### Loading

- **Q1, Q3, Q4.** Keep the current behaviour.
- **Q2.** Drop the redundant `aria-live`; `role="status"` stays.
- **Q5.** The glyph's SVG also gets `focusable="false"`.
- **Q6.** No stray trailing space in the root's class attribute.

### Select

- **Q1–Q4.** Keep the current behaviour.

### Button

- **Q1–Q4.** Keep the current behaviour, including the requirement that a caller's background class wins over the default through the generated CSS order.

### Icons

- **Q1.** Make precedence consistent: for `Icon` and every named icon, an attribute the caller passes replaces the icon's own value of the same name (including `viewBox`, `fill`, `stroke` and `stroke-width`). The defaults `width`, `height`, `aria-hidden="true"` and `focusable="false"` apply whenever the caller does not pass them.
- **Q2, Q3.** Keep: mixed styles stay, `BranchIcon` and `TagIcon` stay filled, and `KebabIcon` keeps its name and its horizontal row of dots.
- **Q4.** Draw `BranchIcon` and `TagIcon` in the common 16 × 16 view box, like the other icons.

### Checkbox

- **Q1.** The label text wraps, breaking long unbroken words (paths, branch names) so they never overflow their container.
- **Q2, Q3.** Keep the current behaviour.

### ScrollShadow

- **Q1, Q2.** Keep the current behaviour and markup.

### NoRepoPage

- **Q1.** Fill `{0}` so the reason appears literally (no `$` expansion).
- **Q2, Q3, Q5.** Keep the current behaviour.
- **Q4.** When the request settles and focus was lost while the button was disabled (the document's active element is `body` or nothing), move focus back to the button.

### NoCommitsPage

- **Q1, Q2.** Keep the current behaviour.

### styles.css

- **Q1.** Remove the unused `--container-dialog` token.
- **Q2, Q4, Q5.** Keep the current behaviour.
- **Q3.** While the graph scrollbar's thumb is pressed, its background is `--vscode-scrollbarSlider-activeBackground`.
