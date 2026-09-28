# Specification: filterable dropdown (`src/webview/components/ui/Dropdown.tsx`)

This is a clean-room specification. It describes what the module must do, as seen from outside,
and the numbers, attributes and text that other code depends on. It says nothing about how the
current file is written. The behaviour below was observed by running the current module in jsdom
(Vitest) and by reading its callers, its tests, the VS Code UI harness and the stylesheet.

In short: the module exports a Preact component that shows a labelled button (the "trigger")
holding the current choice. Activating the trigger opens a panel just below it (or above it).
The panel has a text filter, a list of options narrowed by the filter, and, for long lists, a
status line. The module also exports the pure function that works out where the panel goes, and
the number of options shown at once.

---

## 1. Interface

Module path: `src/webview/components/ui/Dropdown.tsx`, imported as
`@/webview/components/ui/Dropdown`. It has three named exports and no default export. Callers
depend on these names and shapes, so they must not change.

### 1.1 `DROPDOWN_PAGE`

- A number constant with the value **200**.
- It is the largest number of option elements the open panel ever renders at once (see 3.5).
- `RefsScale.test.ts` compares the rendered option count against it.

### 1.2 `fitPanel`

Signature, in TypeScript notation:

`fitPanel(trigger: { left: number; right: number; top: number; bottom: number }, width: number, height: number, viewport: { width: number; height: number }): { left: number; maxWidth: number; maxHeight: number; up: boolean }`

- `trigger`: the trigger's box in window (viewport) coordinates, in CSS pixels. The type needs
  only the four edge fields, because the tests pass plain objects that have no
  `width`/`height`/`x`/`y`. A `DOMRect` must also be accepted, and its extra fields are ignored.
- `width`, `height`: the panel's size as it lays out before any placement limits are applied
  (see 3.6.2).
- `viewport`: the window's usable size in CSS pixels.
- Returns an object with exactly these four fields:
  - `left`: the horizontal distance from the trigger's left side to the panel's left side. 0
    means the two left sides coincide, and a negative value puts the panel further left.
  - `maxWidth`: the largest width the panel may take.
  - `maxHeight`: the largest height the panel may take.
  - `up`: `true` when the panel opens above the trigger, `false` when it opens below.
- It must be pure: no DOM access, no side effects, and the same result for the same inputs.
- It does no rounding. Fractional inputs give fractional outputs.

The exact rules are in 3.6.1, and a table of outputs is in 4.1.

### 1.3 `Dropdown`

A Preact function component, exported by name as `Dropdown`. Its props:

| Prop       | Type                                      | Required                 | Meaning                                                                                                                                                                                              |
| ---------- | ----------------------------------------- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `label`    | `string`                                  | yes                      | A short visible name, such as "Branch". It is shown before the trigger followed by a colon, it names the trigger and the list for assistive technology, and it is put into the filter's placeholder. |
| `options`  | `Array<{ label: string; value: string }>` | yes                      | The choices, in display order. `label` is the text shown and the text the filter searches. `value` identifies the choice and is what `onChange` receives. Values are assumed to be unique (see Q15). |
| `value`    | `string \| undefined`                     | yes (may be `undefined`) | The value currently chosen. The component is controlled: it always shows the option whose `value` equals this prop, and it keeps no chosen value of its own.                                         |
| `onChange` | `(value: string) => void`                 | yes                      | Called with an option's `value` when the user chooses an option whose value differs from `value`.                                                                                                    |
| `class`    | `string`                                  | no                       | Extra class names added to the trigger button. MainHeader passes `max-w-56`, which limits the trigger to 224 px. The prop is named `class`, not `className`.                                         |
| `disabled` | `boolean`                                 | no, default `false`      | Disables the trigger and hides an open panel (see 3.2).                                                                                                                                              |

The option and prop types do not need to be exported, and no caller imports them.

### 1.4 Who uses what

| Caller                                                        | Uses                                         | How                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------------------------------------- | -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/webview/layout/MainHeader.tsx`                           | `Dropdown`                                   | Three instances inside the page `<header>`: **Repo** (label `window.l10n.repo`; options are repository names with their paths as values), **Branch** (label `window.l10n.branch`; a first "Show All" option with the value `*`, then branches with any leading `remotes/` removed from the label while the value keeps it; disabled while the branch list is loading) and **View** (label `window.l10n.branchDisplay`; options with the values `filter`, `focus` and `ancestors`; disabled while the branch list is loading). All three pass `class="max-w-56"`. |
| `tests/webview/components/ui/Dropdown.test.ts`                | `Dropdown`, `fitPanel`                       | Unit tests of `fitPanel`, and placement of the rendered panel.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `tests/webview/components/repository/RefsScale.test.ts`       | `Dropdown`, `DROPDOWN_PAGE` (dynamic import) | 10,000 options: one page rendered, the status line, End reaching the last option.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `tests/webview/components/repository/RefsTiming.test.ts`      | `Dropdown` (dynamic import)                  | An opt-in benchmark (runs only with `NGG_BENCH_REFS=1`) that times opening with 3,000 and 10,000 options.                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `tests-ext/ui/history.test.cjs`, `tests-ext/ui/benchmark.cjs` | none (DOM only)                              | They open header dropdowns and choose options through the DOM (see 3.8).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |

`src/webview/components/ui/Select.tsx` mentions `Dropdown` only in a comment and does not import it.

---

## 2. Dependencies the implementation must use

- **`ChevronDownIcon` from `./Icons`** (that is, `@/webview/components/ui/Icons`). It is the
  arrow at the trigger's right end. It accepts SVG attributes such as `class` and renders a
  16 × 16 SVG with `aria-hidden="true"` and `focusable="false"`, drawn in `currentColor`.
- **The global `window.l10n`** (not an import; typed in `src/webview/global.d.ts` as
  `LocalizedStrings` from `@/old-extension/l10n/webviewL10n`). The component reads three keys:
  - `filterPlaceholder`, in English `Filter {0}...`, where `{0}` is replaced by the `label` prop.
  - `noResultsFound`, in English `No results found.`
  - `dropdownPage`, in English `{0}–{1} of {2}. Type to narrow the list, or use the arrow keys.`
    Here `{0}` is the 1-based position of the first rendered match, `{1}` is the position of the
    last rendered match, and `{2}` is the number of matches.

  In the webview tests `window.l10n` is a proxy that returns each key's own name. The tests
  therefore expect, for example, the status text to be exactly `dropdownPage`, so no other text
  may be added around these strings. The repository's lint rule (`oxlint/webview-text.cjs`)
  rejects hard-coded readable text in the webview. The colon after the label contains no letters,
  so the rule allows it.

- **Theme tokens from `src/webview/styles.css`**, used through Tailwind utilities (see 3.9):
  `dropdown`, `dropdown-fg`, `dropdown-border`, `menu`, `menu-fg`, `menu-active`,
  `menu-active-fg`, `input`, `input-fg`, `line`, `btn-hover`, `focus` and `muted`, plus the
  theme radius `--radius-md` (5 px).
- Hooks come from the `preact/hooks` npm package. Nothing else from the repository is needed: the
  component must not read application stores or actions.

---

## 3. Behaviour

### 3.1 The closed trigger

- The control shows the `label` text followed immediately by a colon (for example `Branch:`),
  then the trigger button.
- **Selected value:** when an option's `value` equals the `value` prop, the trigger shows that
  option's `label`, and its tooltip (`title` attribute) is that option's **value**, not its label.
  For example, the Branch trigger showing `origin/x` has the tooltip `remotes/origin/x`. The
  Repo trigger's tooltip is the repository path. "Show All" has the tooltip `*`, and the View
  choices have `filter`, `focus` or `ancestors`.
- **No value (`undefined`)** or **a value that no option has:** the trigger shows no text (only
  the chevron) and has no tooltip. The `title` attribute is either missing or empty; today it is
  missing on first render and becomes empty after having had a value.
- The trigger's text content is exactly the chosen label, with no other text (the icon adds none).
- **Disabled** (`disabled` is true): the button is natively disabled (it has the `disabled`
  attribute and `.disabled === true`), cannot be focused or activated, reports
  `aria-expanded="false"`, and looks disabled (see 3.9).

### 3.2 Opening and closing

The panel exists in the DOM only while it is open. When closed, the filter, the list and the
status line are all absent. The trigger's `aria-expanded` is `"true"` while the panel is open and
`"false"` otherwise.

Opening:

| Action                                                                                                                           | Result                                                                   |
| -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Click on the trigger (a `click` event; a real pointer, `element.click()`, or Enter/Space through the native button) while closed | Opens.                                                                   |
| ArrowDown or ArrowUp keydown on the trigger while closed                                                                         | Opens. The key's default action is prevented. Both keys behave the same. |
| Any other key on the trigger                                                                                                     | Nothing happens, and the default action is not prevented.                |

Every time the panel opens:

- The filter is empty.
- The active option is the option whose value equals `value`. When there is none, it is the
  first option.
- Keyboard focus moves into the filter.
- The active option is scrolled into view.

Closing:

| Action                                                                                                                 | Closes?                                                            | Focus afterwards                                                                                                            | `onChange`                                           |
| ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Choosing an option (click, or Enter on the active option)                                                              | yes                                                                | moved to the trigger                                                                                                        | called only if the chosen value differs from `value` |
| Escape in the filter                                                                                                   | yes; default prevented                                             | moved to the trigger                                                                                                        | not called                                           |
| Tab or Shift+Tab in the filter                                                                                         | yes; default **not** prevented                                     | not moved by the component, so the browser's normal tab navigation continues (in jsdom it ends on `<body>`)                 | not called                                           |
| Clicking the trigger while open                                                                                        | yes                                                                | not moved by the component (a real pointer press has already focused the button; after a scripted `.click()` focus is lost) | not called                                           |
| ArrowDown or ArrowUp on the trigger while open (possible only if the trigger has focus while open)                     | yes                                                                | unchanged                                                                                                                   | not called                                           |
| A `pointerdown` anywhere in the document outside the component's root (the label, trigger and panel)                   | yes                                                                | not moved by the component                                                                                                  | not called                                           |
| A `pointerdown` inside the component's root (on the label text, the trigger, the filter, an option or the status line) | no                                                                 | —                                                                                                                           | —                                                    |
| `disabled` becoming true while open                                                                                    | the panel disappears at once and `aria-expanded` becomes `"false"` | lost to `<body>`, because the filter disappears and the trigger is disabled                                                 | not called                                           |

Details:

- The outside-press check must see the event in the **capture** phase at the document level, so
  it still closes the panel when another handler stops the event's propagation.
- Only `pointerdown` counts as an outside press. A `mousedown` or `click` on its own (for
  example a scripted `.click()` on another element), focus moving elsewhere, and the window losing
  focus all leave the panel open (see Q14).
- Pressing another dropdown's trigger with a real pointer is an outside press for the first
  dropdown, so the first one closes and the second one opens.
- When a choice is made, focus is already back on the trigger when `onChange` runs, and the panel
  is gone by the next render. A caller that moves focus inside `onChange` therefore keeps the
  focus where it put it.
- **Current behaviour worth knowing** (see Q1): while a panel hidden by `disabled` stays hidden,
  the component remembers that it was open. If `disabled` becomes false again, the panel
  reappears with its earlier filter text and active option, and focus jumps back into the filter.
  An ArrowDown or ArrowUp keydown dispatched from script on a disabled trigger does the same: it
  shows nothing at the time, but the panel opens once the trigger is enabled.

### 3.3 The filter

- The filter is a native single-line text `<input>`. Its placeholder is `filterPlaceholder` with
  `{0}` replaced by `label` (in English, `Filter Branch...`).
- An option matches when its **label** contains the filter text anywhere, ignoring case. Case is
  ignored by lower-casing both sides with the default JavaScript lower-casing, which does not
  depend on the locale.
- Only labels are searched. Values are not: `remotes` finds nothing when the labels are `aa` and
  `ba` and the values are `remotes/aa` and `remotes/ba`.
- The filter text is used exactly as typed: it is not trimmed, and a leading space is part of
  the text to find. Characters have no special meaning (no wildcards or regular expressions).
  An empty filter matches every option.
- Matches keep the order of `options`.
- Every change to the filter text makes the **first match** active, even when the chosen option
  is still among the matches. The visible block therefore returns to the first one (see 3.5).
- **No matches:** the list is replaced by the `noResultsFound` text, shown in italics. There is no
  listbox, no option elements and no `aria-activedescendant`. Arrow keys do nothing. Enter does
  nothing, but its default is still prevented and the panel stays open.
- The filter text is **not kept** between openings: it is empty every time the panel opens. The
  only exception is the `disabled` round trip described in 3.2.
- Typing never calls `onChange`.

### 3.4 The active option and the keyboard

At most one option is **active**: the one the keyboard is on. It is highlighted and exposed
through `aria-activedescendant` (see 3.7). Keyboard focus stays in the filter throughout. The
active option is different from the **selected** option, which is the one whose value equals the
`value` prop.

Keys handled while focus is in the filter:

| Key                                                           | Effect                                                                                        | Default prevented |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ----------------- |
| ArrowDown                                                     | Makes the next match active. From the last match it wraps to the first.                       | yes               |
| ArrowUp                                                       | Makes the previous match active. From the first match it wraps to the last.                   | yes               |
| Home                                                          | Makes the first match active. The text caret does not move.                                   | yes               |
| End                                                           | Makes the last match active. The text caret does not move.                                    | yes               |
| Enter                                                         | Chooses the active option, which closes the panel as in 3.2. With no matches it does nothing. | yes               |
| Escape                                                        | Closes the panel and returns focus to the trigger.                                            | yes               |
| Tab (with or without Shift)                                   | Closes the panel; the browser's tab navigation continues.                                     | no                |
| PageUp, PageDown                                              | **Not handled**: nothing changes (see Q4).                                                    | no                |
| Anything else (letters, Space, ArrowLeft/Right, Backspace, …) | Ordinary text editing in the filter.                                                          | no                |

- Modifier keys are not checked: Alt+ArrowDown behaves like ArrowDown, and so on.
- Keyboard events are not stopped from propagating.
- With no matches, ArrowDown and ArrowUp do nothing. Home and End change nothing that can be seen.
- **Pointer:** moving the pointer over a rendered option (a `pointermove` event on it) makes that
  option active. `mouseover` alone does not, so a list scrolled under a still pointer keeps its
  active option. Leaving the list keeps the last active option. There is no separate CSS hover
  style: the highlight follows the pointer because the option under it becomes active.
- **Keeping the active option visible:** when the panel opens, and whenever the active option
  changes (by keyboard or pointer), the active option is scrolled into view with the least
  movement that shows it (the `scrollIntoView` API with the `nearest` block alignment does this). The list does not scroll when
  the option is already fully visible. A partly visible option under the pointer is scrolled
  fully into view.
- **Options changing while open:** the active position is kept as a position among the matches.
  If fewer matches remain, it is shown on the last match. If the list later grows back, the
  earlier position becomes active again (see Q8). A change of `value` while open moves the
  selected highlight but not the active option.
- **What is announced** to assistive technology:
  - The active option, through `aria-activedescendant` on the focused filter.
  - The status line (`role="status"`, a polite live region) when there are more than
    `DROPDOWN_PAGE` matches. Its text changes when the visible block or the match count changes.
  - Nothing else. The no-results text is not a live region.

### 3.5 Large lists

- The matches are divided into consecutive, fixed blocks of `DROPDOWN_PAGE` (200): matches
  1–200, 201–400, and so on. The last block may be shorter.
- The open panel renders **only the block that contains the active option**: at most 200 option
  elements, however many options there are. It is not a sliding window: moving from match 200 to
  match 201 swaps the whole block.
- The block changes only when the active option moves into another block:
  - ArrowDown past the end of a block shows the next block with its first option active.
  - ArrowUp past the start of a block shows the previous block with its last option active.
  - Wrapping from the last match shows the first block; wrapping from the first match shows the
    last block.
  - Home shows the first block and End shows the last block.
  - Opening shows the block that contains the chosen option.
  - Typing in the filter shows the first block.
- A pointer can reach only the rendered block. Reaching other blocks takes the keyboard or the
  filter (see Q18).
- **Status line:** shown only when the number of matches is greater than 200. Its text is
  `dropdownPage` with `{0}` = position of the block's first match, `{1}` = position of the block's
  last rendered match, and `{2}` = the number of matches (not the number of options). The numbers
  are plain integers without locale grouping. For example, with 450 matches and the active option
  in the second block, it reads `201–400 of 450. Type to narrow the list, or use the arrow keys.`
  With exactly 200 matches there is no status line. With 201 matches, the second block reads
  `201–201 of 201. …`.
- Each option's id is tied to its position among the current matches (see 3.7), so ids for
  positions 201 and up are distinct from those of the first block.

### 3.6 Placement

#### 3.6.1 What `fitPanel` computes

Fixed numbers:

| Name         | Value  | Meaning                                                              |
| ------------ | ------ | -------------------------------------------------------------------- |
| Margin       | 8 px   | The minimum clearance between the panel and each side of the window. |
| Gap          | 4 px   | The vertical clearance that separates the panel from the trigger.    |
| Width limit  | 384 px | The widest the panel may be (Tailwind `max-w-96`).                   |
| Height limit | 288 px | The tallest the panel may be (Tailwind `max-h-72`).                  |

Width:

- `maxWidth` is the **smaller** of 384 px and the window's width less both 8 px margins. It is
  **never below 0**.
- `maxWidth` depends only on the viewport width, not on the panel's width. In any window at
  least 400 px wide, it is 384.

Horizontal position:

- Let **W** be the panel's width capped at `maxWidth`.
- The panel's left edge, in window coordinates, is the **largest** position that meets both of
  these conditions:
  - the panel's right edge is no further right than the trigger's right edge (`trigger.right`);
  - the panel's right edge is at least 8 px inside the window's right edge
    (`viewport.width − 8`).
- The left edge is never less than 8 px from the window's left edge. When this left margin
  conflicts with the conditions above, the left margin wins.
- Put differently:
  - When the panel fits, its right edge lines up exactly with the trigger's right edge.
  - When lining up would push it within 8 px of the window's right edge, it sits exactly 8 px
    from that edge.
  - When either of those would put its left edge less than 8 px from the window's left edge, it
    sits exactly 8 px from that edge.
- The returned `left` is that window position minus `trigger.left`.

Vertical direction and height:

- **Room below** is the distance from the trigger's bottom edge to the window's bottom edge, less
  the 4 px gap and the 8 px margin. It may be negative.
- **Room above** is the distance from the window's top edge to the trigger's top edge, less the
  4 px gap and the 8 px margin. It may be negative.
- `up` is **true exactly when** the panel's `height` is greater than the room below **and** the
  room above is strictly greater than the room below. Otherwise the panel opens below. In
  particular:
  - A panel that fits below opens below, even if there is more room above.
  - Equal room on both sides means below.
- `maxHeight` is the room on the chosen side, capped at 288 and never below 0.

#### 3.6.2 How the open panel is placed

- **Measure:**
  - The trigger is the trigger **button's own** bounding box. The tests intercept
    `getBoundingClientRect` and return the trigger's box only for the `button[aria-haspopup]`
    element.
  - The window size is `document.documentElement.clientWidth` and `.clientHeight`. The tests mock
    these two getters, so `window.innerWidth`/`innerHeight` must not be used.
  - The panel size is its bounding box as laid out **without any constraint left over from an
    earlier placement**, that is, under its default layout (3.9). Otherwise a panel narrowed
    once could never widen again.
- **Apply** the result as inline styles on the panel element. The panel element is the element
  that directly contains the filter input:
  - `left` is the returned value in px, counted from the trigger's left side. The panel is
    positioned inside a box whose left, top and bottom edges coincide with the trigger's.
  - `right` is `auto`.
  - `max-width` is `maxWidth` in px and `max-height` is `maxHeight` in px. `max-width` is always
    written, even when the panel is narrower (the tests expect `384px` in wide windows).
  - Opening below: the panel's top edge is 4 px below the trigger's bottom edge.
  - Opening above: the panel's bottom edge is 4 px above the trigger's top edge. The current code
    happens to write this as `top: auto; bottom: 100%; margin-top: 0; margin-bottom: 4px`;
    the tests do not require that form.
  - A later placement that opens below must drop every trace of an earlier placement above.
- **When:** the panel is placed:
  - when it opens, before it is first painted, so it never appears in the wrong place first;
  - again on every window `resize` event while it is open (listened for on `window`);
  - again whenever the **number of matches** changes;
  - again whenever the **visible block** changes.

  It is **not** placed again when only the active option moves within a block, on scroll, when
  the filter changes which options match without changing how many (see Q3), or when the
  trigger moves without a window resize.

### 3.7 Accessibility

Each instance has its own ids. They are unique in the document (the header has three instances)
and stable for the instance's lifetime. There are four kinds: a label id, a value id, a list id
and an id per rendered option.

- **Label element:** holds the text `label + ":"` and carries the label id.
- **Trigger** (a native `<button type="button">`):
  - `aria-haspopup="listbox"`;
  - `aria-expanded` `"true"`/`"false"` (see 3.2);
  - `aria-controls` = the list id. It is present even when the list is not in the DOM (see Q11).
  - `aria-labelledby` = the label id, a space, then the value id. The **label id must come
    first**. The value id is on the element holding the chosen label, so the accessible name
    reads like "Branch: main".
- **Filter:**
  - `<input type="text">` with `role="combobox"`;
  - `aria-expanded="true"` (it exists only while open);
  - `aria-controls` = the list id;
  - `aria-autocomplete="list"`;
  - `aria-activedescendant` = the id of the active option, and absent when there are no matches.
  - It has no `aria-label`. Its only name is the placeholder (see Q12).
- **List:** `role="listbox"`, carries the list id, and has `aria-labelledby` = the label id. It is
  absent when there are no matches.
- **Each rendered option:**
  - `role="option"`;
  - a unique id. Today it is derived from the option's position among the current matches, so it
    changes as the filter changes. The tests only need `aria-activedescendant` to equal the active
    option's id.
  - `aria-selected` is `"true"` when the option's value equals the `value` prop and `"false"`
    otherwise. It marks the chosen option, not the active one (see Q11).
  - `data-active` is `"true"` on the active option and `"false"` on the others.
  - A `title` equal to the option's value **only when the value differs from the label**, and no
    title otherwise.
  - Its text content is exactly the label.
- **Status line:** `role="status"`.
- **Chevron:** hidden from assistive technology (the icon already sets `aria-hidden`).

### 3.8 DOM contract other code relies on

| Requirement                                                                                                                                                                                                                                | Relied on by                                                                                                                                                               |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The trigger is a `<button>` with `aria-haspopup="listbox"`; `button[aria-haspopup]` finds it.                                                                                                                                              | Dropdown.test (`button[aria-haspopup]`), UI harness (`header button[aria-haspopup="listbox"]`, at least 3 in the header)                                                   |
| The trigger is the **first `<button>`** in the component's DOM.                                                                                                                                                                            | RefsScale.test and RefsTiming.test (`container.querySelector("button").click()`)                                                                                           |
| Opening responds to the `click` event alone (no `pointerdown`/`mousedown` first).                                                                                                                                                          | All tests and the harness use `.click()`                                                                                                                                   |
| The trigger's `title` equals the chosen option's value, so `header button[title="<value>"]` finds it (values seen: repository paths, `*`, `main`, `focus`, `filter`, `ancestors`, `pane-feature`, `renamed-topic`, `remotes/mirror/main`). | UI harness (`openRepo`, many assertions), benchmark.cjs (opens the Branch dropdown this way)                                                                               |
| The first id in the trigger's `aria-labelledby` resolves to an element whose `textContent` is exactly `label + ":"` (for example `Branch:`, `View:`, `Repo:`).                                                                             | UI harness `headerChoice`                                                                                                                                                  |
| `trigger.disabled` reflects `disabled`.                                                                                                                                                                                                    | UI harness `headerChoice` waits until it is false                                                                                                                          |
| Clicking the trigger while open closes the panel.                                                                                                                                                                                          | UI harness (opens `header button[title="*"]`, inspects the options, clicks it again)                                                                                       |
| While open there is exactly one element with `role="combobox"` in the instance. It is inside the component's own DOM subtree (so inside `header`), not moved elsewhere in the document.                                                    | UI harness (`header [role="combobox"]`), Dropdown.test, RefsScale.test                                                                                                     |
| The combobox's **parent element is the panel**: the element that carries the inline placement styles, whose bounding box is the panel's.                                                                                                   | Dropdown.test (`combobox.parentElement.style.left/right/maxWidth`), UI harness (`input.parentElement.getBoundingClientRect()` must be inside the window at 400 and 700 px) |
| Inline styles `left: <n>px`, `right: auto`, `max-width: <n>px` on that panel after opening, after a resize, and after a block change.                                                                                                      | Dropdown.test                                                                                                                                                              |
| After Escape (a keydown dispatched on the combobox with `bubbles: true`), the combobox is removed from the DOM.                                                                                                                            | UI harness                                                                                                                                                                 |
| Options are `<li>` elements with `role="option"`. The component renders no other `<li>`, and while open the number of `<li>` equals the rendered block size.                                                                               | RefsScale.test (`querySelectorAll("li")` has length `DROPDOWN_PAGE`), UI harness and benchmark (`[role="option"]`)                                                         |
| An option's `textContent` is exactly its label (the harness trims it; RefsScale compares it without trimming).                                                                                                                             | RefsScale.test (`"branch-9999"`), UI harness, benchmark.cjs                                                                                                                |
| Choosing an option responds to the `click` event alone.                                                                                                                                                                                    | UI harness, benchmark.cjs (`option.click()`)                                                                                                                               |
| An option's `title` is its value when the value differs from its label.                                                                                                                                                                    | UI harness (`option.title.startsWith('remotes/origin/')`)                                                                                                                  |
| The active option has `data-active="true"`.                                                                                                                                                                                                | RefsScale.test (`li[data-active="true"]`)                                                                                                                                  |
| The combobox's `aria-activedescendant` equals the active `<li>`'s `id`.                                                                                                                                                                    | RefsScale.test                                                                                                                                                             |
| The combobox receives the keyboard events (`keydown` dispatched on it: End, Escape).                                                                                                                                                       | Dropdown.test, RefsScale.test, UI harness                                                                                                                                  |
| The status element has `role="status"`, and its `textContent` is exactly the substituted `dropdownPage` string.                                                                                                                            | RefsScale.test (expects `"dropdownPage"` under the key-echo proxy)                                                                                                         |
| The filter is a native `<input>`. The global shortcut handler in `src/webview/components/history/NavigationEffects.tsx` ignores `/` typed into inputs, so `/` in branch names must reach the filter instead of opening history search.     | Application behaviour                                                                                                                                                      |
| The component's root contains the label, the trigger and the panel. Presses anywhere inside it do not count as outside presses.                                                                                                            | Behaviour in 3.2                                                                                                                                                           |

The stylesheet (`src/webview/styles.css`) targets no selector of this component. It only
supplies the theme tokens listed in section 2.

### 3.9 Appearance

These are requirements for the look. Tailwind utilities are named where they are the simplest
way to state a value. All class names must appear as complete literal strings in the source,
because Tailwind builds the stylesheet by scanning `src/webview` for them.

- **The control as a whole:**
  - A single horizontal row: the label text, an 8 px gap, then the trigger, centred vertically.
  - It may shrink inside the header's wrapping row (minimum width 0). The trigger is the part
    that shrinks.
  - The text size comes from the header (13 px, `text-ui`).
- **Trigger:**
  - Fills its slot's width.
  - Content is laid out in a row with a 4 px gap: the chosen label is left-aligned, takes the
    free space and is cut off with an ellipsis when too long; then the 16 × 16 chevron, which
    never shrinks.
  - Padding 4 px top and bottom, 12 px left, 8 px right.
  - Corner radius 5 px (`rounded-md`, which uses the theme's `--radius-md`).
  - Background `--color-dropdown` (`bg-dropdown`) and text `--color-dropdown-fg`
    (`text-dropdown-fg`).
  - A constant 1 px solid outline in `--color-dropdown-border` (`outline-1
outline-dropdown-border`). With keyboard focus (`:focus-visible`), the outline becomes 2 px in
    `--color-focus` (`focus-visible:outline-2 focus-visible:outline-focus`).
  - Pointer cursor. When disabled: `not-allowed` cursor and 60 % opacity.
  - The caller's `class` is added.
- **Panel:**
  - Stacked above neighbouring content (z-index 10, inside the header's own stacking context).
  - Default layout, before placement: right edges lined up with the trigger, 4 px below it;
    width fits the content (`w-max`), no narrower than the trigger, at most 384 px wide
    (`max-w-96`) and at most 288 px tall (`max-h-72`).
  - A vertical column: the filter at the top, then the list or the no-results text, then the
    status line. When space is short, only the list shrinks and scrolls; the filter and the
    status line stay visible.
  - 1 px border in `--color-line`, radius 5 px, background `--color-menu` (`bg-menu`), text
    `--color-menu-fg` (`text-menu-fg`), and a medium drop shadow (`shadow-md`).
- **Filter field:**
  - 4 px margin on every side; padding 4 px vertical and 8 px horizontal; radius 4 px
    (`rounded-sm`).
  - Background `--color-input` and text `--color-input-fg`.
  - A 1 px outline in `--color-line`, which turns `--color-focus` while focused.
- **List:** 4 px padding at top and bottom. It scrolls vertically and can shrink to zero height
  (`min-h-0 overflow-y-auto`).
- **Option rows:**
  - Padding 4 px vertical and 12 px horizontal; a single line cut off with an ellipsis; pointer
    cursor.
  - **Active:** background `--color-menu-active` and text `--color-menu-active-fg`
    (`bg-menu-active text-menu-active-fg`).
  - **Selected but not active:** background `--color-btn-hover` (`bg-btn-hover`, a 20 % grey).
  - **Otherwise:** no background.
  - Active wins over selected.
- **No-results text:** italic, with padding 4 px vertical and 12 px horizontal.
- **Status line:** a 1 px top border in `--color-line`; padding 4 px vertical and 12 px
  horizontal; small text (`text-xs`, 12 px) in the muted colour `--color-muted` (`text-muted`).

---

## 4. Concrete examples

### 4.1 `fitPanel` outputs

The trigger is given as (left, top, right, bottom). All outputs are exact.

| #   | Trigger (l, t, r, b)       | width × height | viewport      | → left | maxWidth | maxHeight | up    | Case                                                                  |
| --- | -------------------------- | -------------- | ------------- | ------ | -------- | --------- | ----- | --------------------------------------------------------------------- |
| 1   | 250, 40, 350, 64           | 300 × 200      | 1200 × 800    | −200   | 384      | 288       | false | Right edges lined up (panel spans 50–350)                             |
| 2   | 250, 40, 350, 64           | 80 × 100       | 1200 × 800    | 20     | 384      | 288       | false | Panel narrower than trigger, still lined up on the right              |
| 3   | 60, 40, 160, 64            | 300 × 200      | 400 × 800     | −52    | 384      | 288       | false | Would start at −140; held at the 8 px left margin                     |
| 4   | 290, 40, 396, 64           | 300 × 200      | 400 × 800     | −198   | 384      | 288       | false | Trigger ends 4 px from the right edge; panel right edge held at 392   |
| 5   | 350, 40, 450, 64           | 200 × 200      | 400 × 800     | −158   | 384      | 288       | false | Trigger runs past the window; panel spans 192–392                     |
| 6   | 10, 40, 110, 64            | 380 × 200      | 300 × 800     | −2     | 284      | 288       | false | Window narrower than 384 + 16: width capped at 284, panel spans 8–292 |
| 7   | 700, 40, 800, 64           | 500 × 200      | 1200 × 800    | −284   | 384      | 288       | false | Panel wider than 384: treated as 384 wide, spans 416–800              |
| 8   | 0, 0, 10, 10               | 100 × 100      | 10 × 30       | 8      | 0        | 8         | false | Window under 16 px wide: maxWidth floored at 0, left margin still 8   |
| 9   | 0, 0, 10, 10               | 100 × 100      | 16 × 100      | 8      | 0        | 78        | false | Window exactly 16 px wide                                             |
| 10  | 10, 680, 110, 704          | 200 × 288      | 800 × 800     | −2     | 384      | 288       | true  | Room below 84, above 668: opens up                                    |
| 11  | 10, 40, 110, 64            | 200 × 288      | 800 × 800     | −2     | 384      | 288       | false | Fits below (room 724)                                                 |
| 12  | 10, 120, 110, 144          | 200 × 288      | 800 × 300     | −2     | 384      | 144       | false | Short window: below 144 > above 108, so down, limited to 144          |
| 13  | 10, 200, 110, 224          | 200 × 288      | 800 × 300     | −2     | 384      | 188       | true  | Short window: above 188 > below 64, so up, limited to 188             |
| 14  | 10, 500, 110, 524          | 200 × 150      | 800 × 800     | −2     | 384      | 264       | false | Fits below (150 ≤ 264) although above (488) is larger                 |
| 15  | 10, 388, 110, 412          | 200 × 500      | 800 × 800     | −2     | 384      | 288       | false | Equal room (376 each): stays down                                     |
| 16  | 10, 40, 110, 64            | 200 × 724      | 800 × 800     | −2     | 384      | 288       | false | Height equal to room below (724) is not "more": down                  |
| 17  | 10, 900, 110, 924          | 200 × 100      | 800 × 800     | −2     | 384      | 288       | true  | Trigger below the window: room below −136, so up                      |
| 18  | 10, −100, 110, −76         | 200 × 100      | 800 × 800     | −2     | 384      | 288       | false | Trigger above the window: down                                        |
| 19  | 10, 5, 110, 25             | 200 × 100      | 800 × 35      | −2     | 384      | 0         | false | Room below −2, above −7: down, maxHeight floored at 0                 |
| 20  | 10.5, 40.25, 110.75, 64.75 | 150.5 × 100.75 | 500.5 × 600.5 | −2.5   | 384      | 288       | false | Fractions kept, no rounding                                           |
| 21  | 100, 40, 200, 64           | 0 × 0          | 800 × 800     | 100    | 384      | 288       | false | Zero-width panel sits at the trigger's right edge                     |

### 4.2 Component interaction sequences (observed)

Unless stated, `window.l10n` is the tests' key-echo proxy. Sequences that quote English text use
the English strings from section 2.

**E1. Filter and no results.** Options `alpha`, `Beta`, `gamma`, `ALPHABET`, `delta` (each value
the same as its label); `value` = `gamma`.

1. Click the trigger. The panel opens and focus is in the empty filter. All five options are
   rendered. `gamma` is active and selected, `aria-activedescendant` points at `gamma`, and
   `gamma` is scrolled into view (`block: "nearest"`).
2. Type `al`. The matches are `alpha` and `ALPHABET`, and `alpha` is active. Typing `AL` gives
   the same result.
3. Type `et`. The matches are `Beta` and `ALPHABET`.
4. Type ` alpha` (with a leading space). Nothing matches. The panel holds the filter and the
   no-results text; there is no listbox and no `aria-activedescendant`.
5. Press Enter. Its default is prevented, the panel stays open and `onChange` is not called.
6. Clear the filter. All five options are back, and `alpha` (the first match) is active.

**E2. Keyboard.** Options `a1`–`a4`; `value` = `a2`.

1. Press `x` on the trigger: nothing happens.
2. Press ArrowDown on the trigger: default prevented; the panel opens with `a2` active and focus
   in the filter.
3. In the filter, the keys and the resulting active option are: ArrowDown → `a3`, ArrowDown →
   `a4`, ArrowDown → `a1` (wrap), ArrowUp → `a4` (wrap), Home → `a1`, ArrowUp → `a4`, End → `a4`,
   ArrowDown → `a1`. PageDown, PageUp, ArrowLeft and Space change nothing and are not prevented.
4. Press Escape: default prevented, the panel is closed, focus is on the trigger and
   `aria-expanded` is `"false"`.
5. Press ArrowUp on the trigger: the panel opens with `a2` active (not the last option).
6. Press ArrowDown, then Enter: `onChange("a3")` is called once, the panel closes and focus is on
   the trigger. The parent did not update `value`, so the trigger still shows `a2`.
7. Reopen and press Enter on `a2`: the panel closes and `onChange` is not called.
8. Reopen and press Tab: not prevented, the panel closes, and focus is not on the trigger.

**E3. The filter is reset on reopening.** Options `x1`, `x2`, `y1`, `y2`; `value` = `y1`.

1. Open, type `x`, press ArrowDown: the matches are `x1` and `x2`, and `x2` is active.
2. Click the trigger: the panel closes.
3. Click it again: the filter is empty, all four options show, and `y1` is active.

**E4. Pointer.** Options `p1`–`p3`; `value` = `p1`. An unrelated focusable button sits elsewhere
on the page.

1. Open. A `pointermove` over `p3` makes `p3` active. A `mouseover` over `p2` changes nothing.
2. A `pointerdown` on an option, or on the `Branch:` label, leaves the panel open.
3. A `pointerdown` on the outside button closes the panel, and focus is not moved to the trigger.
   It still closes when a listener on that button stops the event's propagation.
4. Reopen. A `mousedown` plus a `click` on the outside button, without `pointerdown`, leaves the
   panel open.
5. Click `p3`: `onChange("p3")` is called, the panel closes and focus is on the trigger.
6. Reopen and click `p1` (the current value): the panel closes and `onChange` is not called again.
7. Reopen, then move focus to the outside button with `focus()`, or fire a window `blur`: the
   panel stays open.

**E5. Disabled while open.** Options `d1`–`d3`; `value` = `d1`.

1. Open, type `d`, press ArrowDown: `d2` is active.
2. The parent sets `disabled`: the panel is gone, `aria-expanded` is `"false"` and focus is on
   `<body>`.
3. The parent clears `disabled`: the panel is back with the filter still `d` and `d2` active,
   and focus is in the filter (see Q1).

**E6. Options change while open.** Options `o1`–`o4`; `value` = `o4`.

1. Open: `o4` is active.
2. The parent passes only `o1` and `o2`: `o2` is active.
3. The parent passes `o1`–`o4` again: `o4` is active again.
4. The parent changes `value` to `o1`: `o4` stays active, and `o1` now has
   `aria-selected="true"`.

**E7. Paging.** English strings. 450 options `branch-0` … `branch-449`; `value` =
`branch-230`.

| Step                           | Rendered `li`                   | Active       | Status text                                                       |
| ------------------------------ | ------------------------------- | ------------ | ----------------------------------------------------------------- |
| Open                           | 200 (`branch-200`…`branch-399`) | `branch-230` | `201–400 of 450. Type to narrow the list, or use the arrow keys.` |
| Home                           | 200 (`branch-0`…`branch-199`)   | `branch-0`   | `1–200 of 450. …`                                                 |
| ArrowUp (wrap)                 | 50 (`branch-400`…`branch-449`)  | `branch-449` | `401–450 of 450. …`                                               |
| ArrowDown (wrap)               | 200 (`branch-0`…)               | `branch-0`   | `1–200 of 450. …`                                                 |
| End, then ArrowUp              | 50                              | `branch-448` | `401–450 of 450. …`                                               |
| Home, then ArrowDown ×199      | 200 (`branch-0`…)               | `branch-199` | `1–200 of 450. …`                                                 |
| ArrowDown                      | 200 (`branch-200`…)             | `branch-200` | `201–400 of 450. …`                                               |
| ArrowUp                        | 200 (`branch-0`…)               | `branch-199` | `1–200 of 450. …`                                                 |
| Type `branch-1`                | 111                             | `branch-1`   | none (111 ≤ 200)                                                  |
| Type `branch-44`               | 11                              | `branch-44`  | none                                                              |
| `pointermove` over the 6th row | 11                              | `branch-444` | none                                                              |

The placeholder reads `Filter Branch...`. On opening, `branch-230` is scrolled into view.

**E8. The 200 boundary.**

- With exactly 200 options: 200 `li` and no status. ArrowUp from the first option makes
  `branch-199` active in the same block.
- With 201 options: 200 `li` and the status `1–200 of 201. …`. ArrowUp from the first option
  shows a single `li` (`branch-200`) with the status `201–201 of 201. …`.

**E9. 10,000 options** (from RefsScale.test). `value` = `branch-0`.

1. Click: 200 `li`, and the status text is `dropdownPage`.
2. End: the active `li` reads `branch-9999`, the combobox's `aria-activedescendant` equals its
   id, and at most 200 `li` are rendered.

**E10. Placement in the component** (`getBoundingClientRect` and the window size mocked as in
Dropdown.test; the trigger is (600, 40, 700, 64); the window is 1000 × 800; every other element
measures `panelWidth` × 120).

| Step                                                        | Panel inline style afterwards                                                                                                  |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `panelWidth` = 200, open                                    | `left: -100px; right: auto; max-width: 384px; max-height: 288px`                                                               |
| `panelWidth` = 300, type `branch-1` (match count 20 → 11)   | `left: -200px; …`                                                                                                              |
| `panelWidth` = 350, type `branch-2` (11 → 1)                | `left: -250px; …`                                                                                                              |
| `panelWidth` = 360, ArrowDown (same block)                  | unchanged (`-250px`)                                                                                                           |
| Trigger moved to top 700, panel height 288, window `resize` | `left: -260px; right: auto; max-width: 384px; max-height: 288px; top: auto; bottom: 100%; margin-top: 0px; margin-bottom: 4px` |
| Trigger back at top 40, `resize`                            | `left: -260px; right: auto; max-width: 384px; max-height: 288px` (the upward styles are gone)                                  |
| `scroll` event                                              | no new measurement                                                                                                             |

A second run: options with labels `aa`, `ab`, `ba`, `bb` and the trigger's right edge at 700.
Typing `a` (3 matches) with a 100 px panel gives `left: 0px`. Typing `b` (again 3 matches) with a
150 px panel leaves `left: 0px`: the panel is not placed again because the count did not change
(see Q3).

From Dropdown.test:

- A 400 px window with the trigger at (60, 40) and a 300 × 120 panel gives `left: -52px`,
  `right: auto` and `max-width: 384px`.
- After the window becomes 1200 px, the trigger moves to x = 250 and a `resize` fires, the panel
  gets `left: -200px`.
- With 250 options, a 200 px panel and the trigger at x = 600 in a 1200 px window, the panel gets
  `-100px`. After End, with the panel now 380 px wide, it gets `-280px`.

**E11. Listeners.**

- Mounted and closed: no document or window listeners.
- Open: one `pointerdown` listener on `document` in the capture phase, and one `resize` listener
  on `window`.
- After Escape: both removed.
- Unmounted while open: both removed.

**E12. Two instances.**

- Their ids differ: two different label ids, value ids and list ids.
- With the first open, a `pointerdown` then a `click` on the second trigger leaves only the
  second panel open (exactly one combobox in the DOM).

---

## 5. Non-functional requirements

- **Performance with thousands of options:**
  - No more than `DROPDOWN_PAGE` option elements may exist at any time, however many options
    there are.
  - A closed dropdown renders no option elements.
  - Opening, one filter keystroke and one arrow key must each take roughly one pass over the
    options (to find the matches and the selected option) plus the rendering of at most 200 rows.
  - Nothing may be quadratic in the number of options, such as looking up each option's position
    by searching the list again.
  - Reference figures (jsdom, medians, from `docs/performance.md` and
    `docs/benchmarks/2026-09-26-refs.json`): opening took 10.3 ms with 3,000 options and 6.4 ms
    with 10,000. The earlier version, which rendered every option, took 88.7 ms and 500.5 ms.
  - Measured on the current code in this container, with 10,000 options: mount about 1 ms, open
    about 14 ms, a filter keystroke leaving 1,111 matches about 12 ms, and an arrow key about
    2 ms.
  - `RefsScale.test.ts` asserts the 200-row limit. `RefsTiming.test.ts` (opt-in with
    `NGG_BENCH_REFS=1`) prints the `openDropdown` median for 3,000 and 10,000 options. A
    replacement should stay in the same range and must not grow with the option count beyond
    that linear pass.
- **Listener cleanup:**
  - While closed, the component holds no global listeners, observers or timers.
  - While open it may hold only what the behaviour needs: an outside-press listener in the
    capture phase and a window resize listener.
  - All of them are removed when the panel closes for any reason, including `disabled`, and when
    the component unmounts while open.
- **jsdom compatibility (the test environment):**
  - jsdom has no `ResizeObserver`. The component must not require one, or must guard against its
    absence.
  - jsdom has no `scrollIntoView`. The tests stub `Element.prototype.scrollIntoView` in
    `beforeAll`, so calling it is safe in tests. Any other scrolling method must also work in
    jsdom.
  - Layout sizes in jsdom are 0, so `clientWidth` and `clientHeight` are 0 unless mocked. The
    component must not throw then; the panel simply gets `max-width: 0px`.
  - Placement must be applied synchronously within the render that opens the panel, so that
    `act()` followed by reading `style.left` sees the result.
- **Controlled component:**
  - The trigger always reflects the `value` prop.
  - `onChange` is called at most once per choice, never for the value already chosen, and never
    for filtering, moving the active option or closing without a choice.
  - Changes to `options`, `value` or `label` while open take effect on the next render.
- **Several instances:** any number may be mounted in one document with no clashing ids and no
  shared state. The header mounts three.
- **Where it renders:** the panel stays inside the component's own subtree (no portal), inside the
  header's stacking context. It must work under the sticky header (`z-20`) without being clipped
  by it.
- **Localisation:** all visible text comes from `window.l10n` or from props. The only literal
  text is the colon after the label.

---

## 6. Test coverage

### 6.1 What the existing tests check

- **`tests/webview/components/ui/Dropdown.test.ts`**
  - `fitPanel`:
    - held at the 8 px left margin in a 400 px window, and staying inside the right margin;
    - right edges lined up in a 1200 px window, with `maxWidth` 384;
    - the 8 px right margin when the trigger ends at the window edge;
    - `maxWidth` 284 in a 300 px window;
    - opening up with more room above (`maxHeight` 288), down when the panel fits below, and
      down with `maxHeight` 144 in a 300 px tall window.
  - Component:
    - the open panel (the combobox's parent) gets inline `left`, `right: auto` and `max-width`;
    - it is placed again on a window `resize`;
    - it is placed again when End moves to another block of a 250-option list.
- **`tests/webview/components/repository/RefsScale.test.ts`**
  - With 10,000 options: exactly `DROPDOWN_PAGE` `li` after opening by clicking the first
    `button`.
  - A `role="status"` element with the text `dropdownPage`.
  - End makes `branch-9999` the `li[data-active="true"]`, `aria-activedescendant` matches its id,
    and there are still at most 200 `li`.
- **`tests/webview/components/repository/RefsTiming.test.ts`**
  - Opt-in timing of opening with 3,000 and 10,000 options. It makes no assertion about speed.
- **`tests-ext/ui/history.test.cjs`** (a real VS Code window):
  - It finds the header triggers by `aria-haspopup="listbox"` and each one's label through the
    first `aria-labelledby` id (`"Label:"`), and waits until the trigger is enabled.
  - It opens with `.click()` and chooses an option by its trimmed label with `.click()`.
  - The trigger's `title` equals the chosen value (repository path, `*`, `main`, `focus`,
    `filter`, `ancestors`, …).
  - Clicking an open trigger closes it.
  - Option titles carry `remotes/origin/…` values, and none are offered when that remote is
    hidden.
  - Every header dropdown's panel (the combobox's parent) stays inside the window at 400 and
    700 px.
  - Escape on the combobox removes it.
- **`tests-ext/ui/benchmark.cjs`**
  - Opens the Branch dropdown through `header button[title="<branch>"]` and chooses an option by
    its text.

### 6.2 Gaps: behaviour no test checks

Each gap is given as setup → interaction → expected result. Unless stated: jsdom, the key-echo
`window.l10n`, a stubbed `scrollIntoView`, and a mounted `Dropdown` with the label `Branch`.

1. **Trigger with a chosen value.**
   - Setup: options `{Show All, *}`, `{main, main}`, `{origin/x, remotes/origin/x}`; `value` =
     `remotes/origin/x`.
   - Interaction: render.
   - Expected: the trigger's `textContent` is `origin/x`, its `title` is `remotes/origin/x`, and
     the ids in `aria-labelledby` resolve to `Branch:` then `origin/x`.
2. **Missing or undefined value.**
   - Setup: same options; `value` = `nope`, then `undefined`.
   - Interaction: render each.
   - Expected: the trigger's `textContent` is empty and its `title` is missing or empty.
3. **`aria-expanded` and `aria-controls`.**
   - Setup: three options.
   - Interaction: open, then Escape.
   - Expected: `aria-expanded` goes `"false"` → `"true"` → `"false"`. While open, the trigger's
     and the combobox's `aria-controls` equal the listbox's `id`.
4. **Opening with the arrow keys.**
   - Setup: `a1`–`a4`, `value` = `a2`.
   - Interaction: keydown `x` on the trigger, then `ArrowDown`, then (after Escape) `ArrowUp`.
   - Expected: `x` does nothing and is not prevented. Each arrow key opens the panel, is
     prevented, and makes `a2` active.
5. **Focus and the starting active option.**
   - Setup: `a1`–`a4`, `value` = `a3`.
   - Interaction: click the trigger.
   - Expected: `document.activeElement` is the combobox, `a3` has `data-active="true"`, and
     `scrollIntoView` was called on `a3` with `{ block: "nearest" }`.
   - A second case: `value` = `zzz` (no such option) makes `a1` active.
6. **Filter rules.**
   - Setup: `alpha`, `Beta`, `gamma`, `ALPHABET`, `delta`.
   - Interaction: type `AL`, then `et`, then ` alpha`.
   - Expected: `[alpha, ALPHABET]` with `alpha` active; then `[Beta, ALPHABET]`; then no `li`
     and the text `noResultsFound`.
7. **The filter ignores values.**
   - Setup: labels `aa`, `ba` with values `remotes/aa`, `remotes/ba`.
   - Interaction: type `remotes`.
   - Expected: no matches.
8. **No-results state.**
   - Setup: any options; the filter matches nothing.
   - Interaction: press Enter, ArrowDown and End.
   - Expected: no `role="listbox"` and no `aria-activedescendant`; each key is prevented; the
     panel stays open; `onChange` is never called.
9. **The filter is reset on reopening.**
   - Setup: `x1`, `x2`, `y1`, `y2`, `value` = `y1`.
   - Interaction: open, type `x`, close with the trigger, open again.
   - Expected: the filter is empty, 4 `li` are shown, and `y1` is active.
10. **Wrapping, Home and End.**
    - Setup: `a1`–`a4`, `value` = `a2`, open.
    - Interaction: ArrowDown ×3, ArrowUp, Home, ArrowUp, End.
    - Expected: the active option goes `a3`, `a4`, `a1`, `a4`, `a1`, `a4`, `a4`, and every key is
      prevented.
11. **Unhandled keys.**
    - Setup: open.
    - Interaction: PageDown, PageUp, ArrowLeft.
    - Expected: the active option is unchanged and the events are not prevented.
12. **Enter chooses.**
    - Setup: `a1`–`a4`, `value` = `a2`, open.
    - Interaction: ArrowDown, then Enter.
    - Expected: `onChange` is called once with `a3`, the combobox is removed, and focus is on the
      trigger.
13. **Choosing the current value.**
    - Setup: as in gap 12.
    - Interaction: Enter on `a2`; separately, click on `a2`.
    - Expected: the panel closes and `onChange` is not called.
14. **Escape.**
    - Setup: open, with the filter typed.
    - Interaction: Escape.
    - Expected: prevented; the panel closes; focus is on the trigger; `onChange` is not called.
15. **Tab.**
    - Setup: open.
    - Interaction: keydown `Tab`, and separately `Tab` with `shiftKey`.
    - Expected: not prevented; the panel closes; `onChange` is not called.
16. **Pointer makes an option active.**
    - Setup: `p1`–`p3`, open.
    - Interaction: `pointermove` on `p3`.
    - Expected: `p3` has `data-active="true"` and the combobox's `aria-activedescendant` equals
      `p3`'s id.
17. **Clicking an option.**
    - Setup: `p1`–`p3`, `value` = `p1`, open.
    - Interaction: `.click()` on `p3`.
    - Expected: `onChange("p3")` is called, the panel closes, and focus is on the trigger.
18. **Outside and inside presses.**
    - Setup: open, plus an element outside the component.
    - Interaction: `pointerdown` on the label text, then on an option, then on the outside
      element; repeat with a listener on the outside element that stops propagation.
    - Expected: presses inside keep the panel open; presses outside close it in both cases; focus
      is not moved to the trigger.
19. **Clicking the trigger while open.**
    - Setup: open.
    - Interaction: `.click()` on the trigger.
    - Expected: the panel closes and `aria-expanded` is `"false"`.
20. **Disabled.**
    - Setup: `disabled: true`.
    - Interaction: `.click()` and ArrowDown on the trigger.
    - Expected: `trigger.disabled` is true, there is no combobox, and `aria-expanded` is
      `"false"`.
    - Then: open while enabled and re-render with `disabled: true`. Expected: the combobox is gone
      and the listeners are removed.
    - What should happen when it is enabled again, in both cases, is Q1: today the panel appears.
21. **Block boundaries and the status text.**
    - Setup: English `dropdownPage` string, 450 options, `value` = `branch-230`.
    - Interaction: follow the E7 table.
    - Expected: each step's `li` count, active option and status text as listed in E7.
22. **The status line threshold.**
    - Setup: 200, then 201 options.
    - Interaction: open.
    - Expected: no `role="status"` at 200; `1–200 of 201. …` at 201. ArrowUp at 201 gives one
      `li` and `201–201 of 201. …`.
23. **Filtering resets the block.**
    - Setup: 450 options, open, End.
    - Interaction: type `branch-1`.
    - Expected: 111 `li`, `branch-1` active, no status.
24. **Placement opening upwards and back.**
    - Setup: the trigger at (600, 700, 700, 724) in a 1000 × 800 window, the panel measuring
      200 × 288.
    - Interaction: open, then move the trigger to top 40 and fire `resize`.
    - Expected: first `bottom: 100%`, `top: auto`, `margin-bottom: 4px`, `max-height: 288px`;
      after the resize, none of the upward styles remain.
25. **Placement when the match count changes.**
    - Setup: the trigger's right edge at 700 in a 1000 px window, 20 options, the panel 200 px
      wide.
    - Interaction: open; set the panel width to 300 and type `branch-1`.
    - Expected: `left` goes from `-100px` to `-200px`.
26. **Remaining `fitPanel` cases.**
    - Setup: none.
    - Interaction: call `fitPanel` with rows 2, 5, 7, 8, 13, 14, 15, 16, 17, 19 and 20 of the
      table in 4.1.
    - Expected: exactly the listed outputs.
27. **Listener cleanup.**
    - Setup: spy on `document`/`window` `addEventListener`/`removeEventListener`.
    - Interaction: mount; open; Escape; open; unmount.
    - Expected: nothing is added while closed; each addition while open (a capture-phase
      `pointerdown` on `document` and a `resize` on `window`) has a matching removal after Escape
      and after unmount.
28. **Option attributes.**
    - Setup: labels `aa`, `ab` with values `remotes/aa`, `ab`; `value` = `ab`.
    - Interaction: open.
    - Expected: `aa` has `title="remotes/aa"` and `aria-selected="false"`; `ab` has no `title`
      and has `aria-selected="true"`; each `li` has `role="option"` and a unique `id`.
29. **Placeholder.**
    - Setup: English `filterPlaceholder`, label `Branch`.
    - Interaction: open.
    - Expected: the placeholder is `Filter Branch...`.
30. **Two instances.**
    - Setup: two dropdowns in one container.
    - Interaction: read their ids; open the first; `pointerdown` then `.click()` on the second
      trigger.
    - Expected: all ids are distinct, and only the second panel is open.
31. **The `class` prop.**
    - Setup: `class: "max-w-56"`.
    - Interaction: render.
    - Expected: the trigger button's class list contains `max-w-56`.
32. **Options change while open.**
    - Setup: `o1`–`o4`, `value` = `o4`, open.
    - Interaction: re-render with `o1`, `o2`.
    - Expected: `o2` is active and `aria-activedescendant` points at it. (What should happen when
      the list grows back is Q8.)
33. **`/` in the filter reaches the input.**
    - Setup: `NavigationEffects` mounted with the dropdown open.
    - Interaction: keydown `/` on the combobox.
    - Expected: `focusSearch` is not triggered, the event is not prevented, and the panel stays
      open.
34. **Size bound while filtering a huge list.**
    - Setup: 10,000 options, open.
    - Interaction: type `branch-1` (1,111 matches).
    - Expected: 200 `li` and the status `1–200 of 1111. …` (English), and `branch-1` active.

---

## 7. Questions

Each question records the current behaviour and what might be intended, without deciding.

1. **Re-enabled after being disabled while open.**
   - Current: the panel reappears with its old filter and active option, and focus moves into the
     filter. In MainHeader, Branch and View are disabled while the branch list loads, so a panel
     open during a reload pops back open, and takes focus, once loading ends.
   - Related: an ArrowDown keydown dispatched from script on a disabled trigger shows nothing and
     is prevented, but the panel then appears as soon as the trigger is enabled. A real user
     cannot do this, because a disabled button cannot take focus.
   - Possibly intended: disabling closes the panel for good, and a disabled trigger ignores
     everything.
2. **Focus when disabled while open.**
   - Current: focus falls to `<body>`, because the filter disappears and the trigger cannot take
     focus.
   - Possibly intended: some other place, for example the trigger once it is enabled again.
3. **Placing the panel again.**
   - Current: the panel is placed again only on open, on resize, on a match-count change and on a
     block change. A filter change that keeps the count but brings longer labels, new `options`
     of the same length, or the trigger moving because the header re-wraps (without a window
     resize) leave a stale position, so the panel can overflow the window.
   - Possibly intended: placing again whenever the panel's content or the trigger's position
     changes.
4. **PageUp and PageDown.**
   - Current: not handled; they do nothing.
   - The status line speaks of the arrow keys only, and the brief mentions page keys. Possibly
     intended: move by one block (200) or by one visible screen of options.
5. **Home and End.**
   - Current: they always move the active option, so the caret cannot jump to the start or end
     of the filter text.
   - Possibly intended: leave Home/End to the text field (the ARIA combobox pattern allows
     either).
6. **Arrow keys on the trigger.**
   - Current: ArrowUp opens with the chosen option active, the same as ArrowDown. The ARIA
     pattern often makes the last option active instead. And an arrow key on the trigger while
     the panel is open closes it.
   - The second behaviour is likely unintended.
7. **Tab.**
   - Current: closes without choosing, and focus goes wherever the browser's tab order goes after
     the filter is removed (in jsdom, `<body>`).
   - Possibly intended: Tab chooses the active option (as some comboboxes do), or Shift+Tab lands
     on the trigger.
8. **Active option when options change.**
   - Current: the active position is kept as a number. Different options can become active
     silently, and after a shrink and regrow the old position comes back.
   - Possibly intended: follow the active option by value, or reset it to the chosen option.
9. **The trigger's tooltip shows raw values.**
   - Current: `*` for Show All; `filter`, `focus` and `ancestors` for View. These are internal
     identifiers and are not translated.
   - Possibly intended: the full label, or no tooltip when label and value are the same. Note that
     the UI harness finds triggers by `header button[title="<value>"]`, so changing this means
     changing the harness too.
10. **A value not among the options.**
    - Current: a blank trigger without a tooltip.
    - Possibly intended: show the raw value or a placeholder. MainHeader already works around this
      for Repo by appending the missing repository.
11. **ARIA details.**
    - Current: `aria-selected` marks the chosen option rather than the active one (the ARIA
      combobox pattern usually puts it on the active one). The trigger's and the filter's
      `aria-controls` point at a listbox id that is not in the DOM while closed or when nothing
      matches.
    - Possibly intended: follow the pattern more closely.
12. **The filter's accessible name and "No results found".**
    - Current: the filter has only a placeholder as its name, and the no-results text is not
      announced.
    - Possibly intended: an explicit label, such as `aria-labelledby` pointing at the label, and a
      live announcement.
13. **Matching rules.**
    - Current: labels only, not values; no trimming; case folded with locale-independent
      lower-casing. A Repo dropdown cannot be filtered by path, and trailing spaces pasted into
      the filter hide everything.
    - Possibly intended: also search values, or trim the filter text.
14. **What closes the panel.**
    - Current: only `pointerdown` outside, Escape, Tab, choosing, the trigger and `disabled`.
      Focus leaving by other means leaves the panel open: Ctrl+F moving to history search,
      scripted focus, or the webview losing focus to another VS Code part.
    - Possibly intended: close when focus leaves the component.
15. **Duplicate values.**
    - Current: every option with the chosen value is marked selected, the trigger shows the first,
      and rendering relies on values being distinct.
    - Question: may callers pass duplicate values, and what should happen if they do?
16. **Closing with the trigger.**
    - Current: focus is not explicitly returned to the trigger, unlike Escape and choosing. After a
      scripted `.click()`, focus is lost.
    - Possibly intended: every close that does not come from Tab or an outside press returns
      focus to the trigger.
17. **`aria-expanded` versus the remembered open state.**
    - Current: while disabled, `aria-expanded` is `"false"` although the component will reopen by
      itself (see Q1).
    - Once Q1 is decided, the two should agree.
18. **Reaching other blocks with a pointer.**
    - Current: pointer users can reach only the block that holds the active option, and have to
      type a filter or use the keyboard for the rest. Scrolling to the end of the list does not
      bring the next block.
    - Possibly intended: a "show more" row, or loading the next block on scroll.
19. **Number format in the status line.**
    - Current: counts are not grouped by locale (`10000`, not `10,000`).
    - Possibly intended: locale grouping.
20. **Hover scrolling.**
    - Current: because a hovered option becomes active and the active option is scrolled into
      view, pointing at a partly visible row at the list's edge scrolls the list under the
      pointer.
    - Question: is this intended?

---

## 8. Decisions on §7 (from the project maintainer's side)

These decisions replace the "current behaviour" wherever they differ. Build to these, and test the decided behaviour.

- **Q1: disabling closes the panel for good.** When `disabled` becomes true while the panel is open, the panel closes as if Escape had been pressed without moving focus, and it stays closed when `disabled` becomes false again; the next opening starts fresh (empty filter, chosen option active). While disabled, no key or event on the trigger opens it, now or later.
- **Q2: keep.** Focus is not moved when disabling closes the panel.
- **Q3: place again whenever the panel's content changes.** Besides opening, a window resize and a block change, the panel is placed again whenever the rendered options change: after every change of the filter text and whenever the `options` prop changes while open, even when the number of matches stays the same. A trigger that moves without a window resize is out of scope.
- **Q4: keep.** Page Up and Page Down are not handled.
- **Q5: keep.** Home and End move the active option.
- **Q6: arrow keys on the trigger only open.** ArrowUp and ArrowDown on the trigger open the panel with the chosen option active, as now; while the panel is already open they keep it open (their default is still prevented) and move focus into the filter. They never close it.
- **Q7: keep.** Tab closes without choosing.
- **Q8: keep.** The active option is kept by position, shown on the last match when fewer remain.
- **Q9: keep.** The trigger's tooltip is the chosen value; the UI harness finds triggers by it.
- **Q10: keep.** A value not among the options leaves the trigger blank.
- **Q11: keep.** `aria-selected` marks the chosen option, and both `aria-controls` stay as specified.
- **Q12: the filter is named by the label.** The filter gets `aria-labelledby` = the label id, so its accessible name is the `label:` text; the placeholder stays. The no-results text stays as specified.
- **Q13: keep.** Labels only, no trimming, locale-independent lower-casing.
- **Q14: keep.** Only the listed actions close the panel.
- **Q15: values are unique.** Callers pass distinct values; behaviour with duplicates is unspecified, and nothing may throw.
- **Q16: closing with the trigger leaves focus on it.** Every close that comes from the trigger, Escape or a choice leaves focus on the trigger; only Tab, an outside press and disabling do not move it.
- **Q17:** follows Q1: `aria-expanded` is `"true"` exactly while the panel is shown.
- **Q18: keep.**
- **Q19: keep.** Counts are plain integers.
- **Q20: the pointer does not scroll the list.** An option made active by the pointer is highlighted but not scrolled into view; opening the panel and every keyboard move still scroll the active option into view with the least movement.
