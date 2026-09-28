# Clean-room specification: `src/webview/components/ui/Dialog.tsx`

This document says what the webview's modal dialog must do, as seen from outside it. It is written for an engineer who will build a replacement without seeing the current source. It is based on the module's callers, the `dialog` store and the functions that fill it, the shared types, the UI primitives the dialog is built from, the unit tests, the VS Code UI harness (`tests-ext/ui/history.test.cjs`), the stylesheet, and behaviour observed by running the current component.

In one sentence: the module exports one Preact component. It draws whatever the global `dialog` store holds (a form, a progress notice, an error or free content) as a single centred modal panel over a dimmed page. It handles focus, the keyboard and the ways of closing, and it hands a form's values to the form's callback.

---

## 0. Environment used for the observations

- Linux, Node v22.22.2, Vitest 4.1.11, jsdom 30.0.1 and Preact 10.29.8, all from the repository's `node_modules`.
- Observations came from scratch Vitest files outside the repository (since deleted). They used the repository's aliases and `tests/webview/setup.ts`, called `setupWebviewTest()` from `tests/webview/test-utils.ts`, mounted `Dialog`, and drove it through the public functions of `src/webview/lib/actions.ts` (`openFormDialog`, `openRunningDialog`, `openErrorDialog`, `openContentDialog`, `closeDialog`).
- In the unit tests, `window.l10n` is a proxy that returns each key's own name, so the Cancel button reads `dialogCancel`, Hide reads `hideOperation`, and so on. For readable examples, a second run gave `window.l10n` the English strings from `src/old-extension/l10n/*.ts`. Both forms appear below. They are marked "test text" and "English".
- The real-browser behaviour described here, such as Enter in a text field, native tooltips and focus order, comes from HTML semantics and from what the UI harness asserts. The harness was not run for this document.

---

## 1. Interface

### 1.1 Module path and export

- Path: `src/webview/components/ui/Dialog.tsx`, imported as `@/webview/components/ui/Dialog` or, from `App.tsx`, as `./components/ui/Dialog`.
- The only export is a named function component, `Dialog`:
  - Signature: `export function Dialog(): JSX.Element | null`. It takes no props. Callers write `<Dialog />`, `h(Dialog, null)` or `h(Dialog, {})`.
  - It returns `null` (renders nothing) when the store is empty. Otherwise it returns the overlay and the panel.
- There is no default export and there are no other named exports. Every other name in the current file is internal and must not be exported.

### 1.2 The state it renders (defined elsewhere, listed here for reference)

The component reads the `dialog` signal from `@/webview/lib/stores`. The signal's type is `DialogState | null`, where `DialogState` comes from `@/webview/types`. It is a `DialogBody` plus a numeric `token`. The body is one of four kinds:

| `kind`      | Fields and their meaning                                                                                                                                                                                                                                                                                                                                                                         |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `"form"`    | `message`: any Preact children; the question or title. `inputs`: an array of `DialogInput`, which may be empty (that makes a plain confirmation). `action`: the submit button's label. `onSubmit(values)`: called with one value per input. `source`: a context-menu key, used by `activeSource` in the stores and ignored by this component. `destructive?`: when true, focus starts on Cancel. |
| `"running"` | `message`: plain text for the operation in progress. `detail?`: extra plain text, possibly several lines. `started?`: the start time in epoch milliseconds. `onCancel?`: a callback that asks the host to stop the operation.                                                                                                                                                                    |
| `"error"`   | `message`: plain-text headline. `reason`: extra text (usually Git's output) or `null`.                                                                                                                                                                                                                                                                                                           |
| `"content"` | `message`: plain-text heading. `content`: any Preact children, owned by the caller. `wide?`: asks for the wide panel.                                                                                                                                                                                                                                                                            |

`DialogInput` (one form field; `value` is the initial value):

| `kind`       | Fields                                                            |
| ------------ | ----------------------------------------------------------------- |
| `"text"`     | `label?`, `value: string`, `placeholder?`                         |
| `"ref"`      | `label?`, `value: string` (a Git ref name; validated, see §3.4.5) |
| `"textarea"` | `label?`, `value: string`, `placeholder?`                         |
| `"select"`   | `label?`, `value: string`, `options: {label, value}[]`            |
| `"checkbox"` | `label: string` (required), `value: boolean`                      |

`token` goes up by one each time one of the open functions in `actions.ts` (`openFormDialog`, `openContentDialog`, `openErrorDialog`, `openRunningDialog`) stores a dialog. Two stored states with different tokens are two different dialogs, even when their contents are equal. In production, the store is written only by those open functions (always a new object with a new token) and by `closeDialog` (`null`). Tests also assign `dialog.value = null` directly.

### 1.3 Who uses the export

| User                                           | What it uses                                         | How                                                                                                                                                |
| ---------------------------------------------- | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/webview/App.tsx`                          | `Dialog`                                             | Rendered once, as the last child of the root `div[data-branchwise]`, after `ContextMenu` and wrapped in `ErrorBoundary`.                           |
| `tests/webview/components/ui/Dialog.test.ts`   | `Dialog` (dynamic import after `setupWebviewTest()`) | Mounts `ContextMenu` and `Dialog` side by side in one container. Covers accessible names, held Enter, initial focus and destructive confirmations. |
| `tests/webview/lib/repository-actions.test.ts` | `Dialog` (static import)                             | Renders it to click buttons inside content dialogs (remote manager, stash manager, sync review). Checks that focus survives background refreshes.  |
| `tests/webview/lib/workflows.test.ts`          | `Dialog` (static import)                             | Renders the content dialogs for submodules and bisect, counts their `input`s, and clicks their buttons.                                            |
| `tests/webview/lib/history-tools.test.ts`      | `Dialog` (static import)                             | Renders the restore preview content dialog and an error dialog. Checks the reason text and the copy button.                                        |
| `tests/webview/lib/unseen-failures.test.ts`    | `Dialog` (dynamic import)                            | Clicks the overlay with different click counts.                                                                                                    |
| `tests/webview/lib/cancel-action.test.ts`      | `Dialog` (dynamic import)                            | Reads the exact list of button labels of a running dialog.                                                                                         |
| `tests-ext/ui/history.test.cjs` (UI harness)   | nothing imported; DOM only                           | Finds `[role=dialog]` and the fields and buttons inside it. See §3.10.                                                                             |

Other production code does not import the component, but it depends on the DOM it produces (`src/webview/lib/focus.ts` looks for `[role="dialog"]`) and on it closing only through `closeDialog` (see §5).

---

## 2. Dependencies the implementation must use

| Import path                        | Name                                                         | Purpose                                                                                                                                                                                                            |
| ---------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `@/webview/lib/stores`             | `dialog`                                                     | A `@preact/signals` signal holding `DialogState \| null`. The component must re-render whenever it changes; reading `.value` during render subscribes, as elsewhere in the webview. **Read-only for this module.** |
| `@/webview/lib/actions`            | `closeDialog`                                                | The only way this module closes a dialog. It sets the store to `null` and queues focus restoration (see §3.8).                                                                                                     |
| `@/webview/lib/copy`               | `copyToClipboard(type: string, data: string): Promise<void>` | Used by the error dialog's copy button. It asks the host to copy `data`. On failure it opens a new error dialog titled `l10n.unableToCopyToClipboard` with `{0}` replaced by `type`.                               |
| `@/webview/components/ui/Button`   | `Button`                                                     | Every button the dialog draws. It defaults to `type="button"` and passes through `type`, `disabled`, `onClick` and data attributes. Use the default (non-primary) variant, as today.                               |
| `@/webview/components/ui/Checkbox` | `Checkbox`                                                   | Checkbox fields. Props: `label`, `checked`, `onInput`. It renders a `label` around a native `input type="checkbox"` followed by the label text.                                                                    |
| `@/webview/components/ui/Select`   | `Select`                                                     | Select fields. Props: `id`, `options`, `value`, `onChange(value: string)`, `aria-labelledby`. It renders a native `select`.                                                                                        |
| `@/webview/components/ui/Input`    | `INPUT_CLASS`                                                | The class string for single-line text fields and the textarea, so they look like every other text field in the webview.                                                                                            |
| `@/webview/components/ui/Icons`    | `Icon`                                                       | The SVG wrapper for the two status glyphs. It sets `aria-hidden="true"`, `focusable="false"`, `fill="currentColor"`, 16×16 and a default `viewBox` of `0 0 16 16`, and accepts `class` and `viewBox` overrides.    |
| `@/webview/utils/date`             | `formatSeconds(started: number, finished: number): string`   | The elapsed-time text of a running dialog: whole seconds, in the configured locale, narrow unit (English: `2s`); `0s` for negative or non-finite spans. It reads the webview config at call time.                  |
| `@/webview/utils/ref`              | `hasInvalidRefChars(name: string): boolean`                  | Decides whether a ref field's value is acceptable (see §3.4.5).                                                                                                                                                    |
| `@/webview/types`                  | `DialogInput`, `DialogState` (types only)                    | Field and state typing.                                                                                                                                                                                            |
| `preact`, `preact/hooks`           | as needed                                                    | Rendering, state and effects. Ids must be unique per page; Preact's `useId` gives this.                                                                                                                            |

Globals and platform:

- `window.l10n` (typed in `src/webview/global.d.ts`). The component uses exactly these keys, read **at render time and never at import time** (see §5.6):

  | Key                     | English                                                | Where it appears                                                                        |
  | ----------------------- | ------------------------------------------------------ | --------------------------------------------------------------------------------------- |
  | `dialogCancel`          | Cancel                                                 | the form's Cancel button                                                                |
  | `invalidCharacters`     | Unable to {0}, one or more invalid characters entered. | tooltip on a refused submit; `{0}` is replaced by the form's `action`                   |
  | `dialogDismiss`         | Dismiss                                                | the error dialog's close button                                                         |
  | `copyError`             | Copy Error Details                                     | the error dialog's copy button; also passed as the `type` argument of `copyToClipboard` |
  | `hideOperation`         | Hide                                                   | the running dialog's close button                                                       |
  | `cancelOperation`       | Stop Git                                               | the running dialog's stop button                                                        |
  | `elapsedSeconds`        | {0} elapsed                                            | the running dialog's timer line; `{0}` is replaced by the output of `formatSeconds`     |
  | `operationKeepsRunning` | Git continues running when this dialog is hidden.      | second line under the timer                                                             |
  | `close`                 | Close                                                  | the content dialog's close button                                                       |

- `document`: one `keydown` listener while a dialog is shown (for Escape), plus focus calls on elements inside the panel.
- Timers: one 1-second interval while a running dialog with `started` is shown.

---

## 3. Behaviour

### 3.1 General

- The store is `null`: render nothing. No overlay, no `[role="dialog"]` element, no listeners.
- The store is non-null: render exactly two things, in the component's own place in the tree (no portal; tests query inside the container they mounted into):
  1. an **overlay** covering the whole viewport, and
  2. a **panel**: the dialog itself, placed after the overlay in document order and drawn above it. The panel is not inside the overlay.
- At most one panel exists at a time.
- The component may be mounted while the store already holds a dialog (`cancel-action.test.ts` and `repository-actions.test.ts` do this). It must then render that dialog exactly as if it had opened after mounting.
- **Identity per token.** A store value with a new `token` is a new dialog. Its field values start from the new inputs' initial values, its initial focus is applied again (§3.3.1), and its listener and timer are fresh. The previous dialog's typed values are discarded. The same token rendered again, for example when a parent re-renders, must keep the typed values and must not move focus. Observed: after typing `typed` in form A and then opening form B, B's field shows B's initial value `b0` and has focus. Re-rendering the component, or storing a copy of the same state with the same token, left the edited value and the focused element as they were.
- The component never changes the store object and never writes the store except through `closeDialog()`.

### 3.2 Overlay

- It covers the viewport (`position: fixed` on all four edges), sits above the page and below the panel, and has a 20% black tint in every theme.
- **Click to close.** A `click` on the overlay closes the dialog with `closeDialog()` when the event's `detail` (click count) is below 2, which includes 0 for synthetic or keyboard clicks. A click whose `detail` is 2 or more is ignored and the dialog stays open. Many dialogs open on a double-click, and the second click of that double-click lands on the new overlay; it must not dismiss the dialog. See `unseen-failures.test.ts`, "keeps a dialog open when the second click of the opening double-click hits the backdrop".
- Clicks on the panel, or on anything inside it, never close the dialog. Observed: a `click` with `detail: 1` on the panel left the dialog open.

### 3.3 Panel: common behaviour

The panel is an element with `role="dialog"`, `aria-modal="true"`, `aria-labelledby` set to the id of the element that carries the dialog's message (see each kind below), and `tabindex="-1"`, so it can take focus itself but is not in the Tab order.

#### 3.3.1 Initial focus

Focus moves once per dialog (per token), as part of showing it. It must be in place by the time the component's render has been committed, before the browser paints and before any later key event is handled. The held-Enter tests dispatch the next repeat right after the render inside the same `act()`, and a real auto-repeat can arrive within one frame.

Where focus goes:

- **Destructive form** (`kind: "form"`, `destructive: true`): the Cancel button.
- **Every other dialog:** the first element inside the panel, in document order, that is either an `input` whose `type` attribute is `text` or a `button`. If there is no such element, the panel itself gets focus. What this gives for each kind:
  - A form with at least one text or ref field: the first such field, even when a select comes before it (the push form has a select, then a ref field; focus goes to the ref field).
  - A form without a text or ref field, including one with only checkboxes, selects or textareas, or with no inputs at all: the submit button. Textareas, selects and checkboxes never receive initial focus (see Q3).
  - Running dialog: **Stop Git** when `onCancel` is present, otherwise **Hide**.
  - Error dialog: **Copy Error Details** when the reason is a non-empty string, otherwise **Dismiss** (see Q4).
  - Content dialog: the first `input[type="text"]` or `button` inside the caller's content, in document order; if there is none, the **Close** button.
- Currently, when that first element is a disabled button, the focus attempt does nothing and focus stays wherever it was, possibly on the page behind (observed; see Q5).

#### 3.3.2 Escape

- While a dialog is shown, any `keydown` whose `key` is `Escape` that reaches `document` closes the dialog with `closeDialog()`. It does not matter where focus is (inside the panel, on the page behind, on `body`), whether the key is a repeat, or whether an earlier handler already called `preventDefault()`. The component does not itself cancel the Escape event (observed `defaultPrevented: false`).
- An Escape whose propagation was stopped before it reached `document` does not close the dialog.
- Escape on a running dialog closes it exactly as **Hide** does. The operation keeps running.
- The document listener is added when a dialog appears and removed when it closes, is replaced, or the component unmounts. Observed: opening two dialogs one after the other and then closing added the listener twice and removed it twice.

#### 3.3.3 Tab and Shift+Tab containment

For this rule, the tabbable controls are the panel's `input` elements that are not disabled, its `textarea` and `select` elements (see Q13 about disabled ones), and its `button` elements that are not disabled, taken in document order.

- **Tab** (no Shift), with focus on the last of these controls: focus wraps to the first, and the key's default action is cancelled.
- **Shift+Tab**, with focus on the first of these controls or on the panel itself: focus wraps to the last, and the default is cancelled.
- In every other case, Tab and Shift+Tab are left to the browser, which moves between controls inside the panel in normal order.
- These rules apply only to key events that start inside the panel. If focus is outside the panel, for example on `body`, Tab is not contained (observed; see Q6).
- The UI harness depends on the normal order: on a destructive confirmation with no inputs, focus starts on Cancel, and one Shift+Tab moves it to the submit button (English "Yes"). So the submit button comes directly before Cancel in tab order.
- Observed in jsdom, on a no-input form: Tab on Cancel went to the submit button, with the default prevented. Shift+Tab on the submit button went to Cancel. Shift+Tab with the panel focused went to Cancel.

#### 3.3.4 Held keys (auto-repeat)

- Any `keydown` inside the panel with `repeat === true` and `key` equal to `"Enter"` or `" "` (Space) must have its default prevented. This must happen before any control or content component inside the panel handles the event (capture phase at the panel). The one exception is when the event's target is a `textarea`: then the event is left alone, so holding Enter keeps adding lines.
- The current component also stops such events from propagating further (observed: a repeated Enter or Space inside the panel never reached a `document` listener). A replacement should do the same.
- A key event without the repeat flag is never blocked, so a fresh Enter or Space still activates the focused control. Observed: a non-repeat Enter on the submit button had `defaultPrevented: false`.
- Repeated Escape is not affected.
- Taken together with §3.3.1 and the context menu's own repeat guard, this means holding Enter on a menu item that opens a dialog **never** confirms or submits that dialog, destructive or not, and never passes through a picker to a follow-up confirmation. `Dialog.test.ts` checks this for "held Enter", and the UI harness checks it in a real VS Code: "never confirms a destructive dialog while Enter is held", 15 auto-repeats 40 ms apart.

#### 3.3.5 Width, height and placement

See §3.11. The panel is centred in the viewport. It is never wider than the viewport minus 2rem, is at most 80% of the viewport height, and scrolls vertically inside itself when the content is taller.

### 3.4 Form dialogs (`kind: "form"`)

#### 3.4.1 What is rendered, in order

1. A `form` element that holds everything below, so that native submission works (Enter in a single-line field submits it).
2. The **message**, a paragraph that shows `message` as given (text, bold names, a muted explanation line and so on). Its id is the target of the panel's `aria-labelledby`, and of each unlabelled field's `aria-labelledby` (§3.4.3).
3. The **fields area**, only when `inputs` is not empty: one field per input, in input order.
4. The **button row**, centred: first the submit button, then Cancel.
   - Submit: a `button` with `type="submit"` whose text is exactly `action`.
   - Cancel: a `button` with `type="button"`, the attribute `data-dialog-cancel` (current value `"true"`; only its presence matters), and the text `l10n.dialogCancel` (English "Cancel"). Activating it calls `closeDialog()` and never calls `onSubmit`.
   - The dialog has no other buttons of its own, such as a close "×".

#### 3.4.2 Each input kind

| Kind       | Control                                                                                              | Initial state                           | Placeholder                        | Value handed to `onSubmit`                                                                                    |
| ---------- | ---------------------------------------------------------------------------------------------------- | --------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `text`     | `input type="text"` using `INPUT_CLASS`                                                              | `value`                                 | `placeholder` if given             | the current string, exactly as typed (not trimmed)                                                            |
| `ref`      | `input type="text"` using `INPUT_CLASS`                                                              | `value`                                 | none (the type has no placeholder) | the current string, not trimmed                                                                               |
| `textarea` | `textarea` with 4 visible rows, using `INPUT_CLASS`                                                  | `value`                                 | `placeholder` if given             | the current string (may contain newlines)                                                                     |
| `select`   | native `select` through `Select`, with the options in the given order, showing each option's `label` | the option whose `value` equals `value` | none                               | the chosen option's `value`. If never changed, the initial `value`, even when no option matches it (see Q11). |
| `checkbox` | `Checkbox` with `label` beside the box                                                               | checked when `value === true`           | none                               | `true` or `false`                                                                                             |

Every edit updates the dialog's copy of that field's value right away (`input` events for text fields, the textarea and the checkbox; `change` events for the select). The `inputs` array is never changed.

#### 3.4.3 Labels and layout

- A form is **labelled** when at least one input that is not a checkbox has a `label`. Checkbox labels do not count.
- **Labelled form:**
  - Every non-checkbox input gets a row with two cells: a `label` element whose `for` points at the control's id and which shows `label`, then the control.
  - A non-checkbox input without a `label` still gets its row. The label cell is empty, which keeps the columns aligned, and the control is named by the message through `aria-labelledby` (observed: in a form whose other fields had labels, an unlabelled textarea got an empty label cell and `aria-labelledby` pointing at the message).
  - A checkbox takes a whole row, across both columns.
  - At the Tailwind `sm` breakpoint (viewport ≥ 40rem) and above, the rows form a two-column grid: the label column is as wide as its widest label, the control column takes the rest, and items are centred vertically. Below `sm`, everything is in one column, with each label directly above its control.
  - Long labels wrap, breaking inside words when they have to.
- **Unlabelled form:**
  - Controls are stacked in one column at full width. There are no `label` elements apart from each checkbox's own.
  - Every non-checkbox control has `aria-labelledby` pointing at the message.
  - Checkboxes are currently wrapped in a block meant to centre them, but see Q1.
- Each control gets its own id, unique in the document. The message element's id is unique as well.
- The fields area is left-aligned text, even though the panel as a whole is centred.

#### 3.4.4 Submitting

A submission can come from clicking the submit button, from a fresh Enter or Space on it, from Enter in a single-line field (the browser's implicit submission, which the browser blocks while the submit button is disabled), or from any `submit` event dispatched on the form, including `form.requestSubmit()`.

- **Always:** cancel the event's default action, so the webview never navigates or reloads.
- **Refused** (a ref field is empty or invalid, §3.4.5): nothing else happens. The dialog stays open, keeps its values, and `onSubmit` is not called. Observed: dispatching a cancelable `submit` event while the only ref field held `feature/` left the form open.
- **Accepted:**
  1. call `closeDialog()` first, then
  2. call the state's `onSubmit` with an array of the current values, one per input, in input order (§3.4.2).

  The order matters. `onSubmit` often opens the next dialog (a running notice, or a destructive confirmation after a picker), and that new dialog must survive. Observed: a form whose `onSubmit` opened an error dialog titled "Second" left that error dialog open after the submit.

- `onSubmit` is called at most once per dialog, because the form is gone once it closes.
- `onSubmit` is the wrapper stored by `openFormDialog`. It drops the call and closes when the selected repository changed in the meantime. That is not this module's concern.

#### 3.4.5 Ref-name validation

- Only `ref` inputs can block submission. Text, textarea, select and checkbox values are never checked.
- A form is refused while any of its ref fields is:
  - **empty**: the value is exactly `""` (a value of one space is not empty, but it is invalid); or
  - **invalid**: `hasInvalidRefChars(value)` returns true. Under the current rules this rejects, for example, `-x`, `a..b`, `a b`, `a~`, `a^`, `a:`, `a?`, `a*`, `a[`, `a\b`, `a"b`, `a<b`, `a>b`, `@`, `a@{b`, `a/`, `a.`, `/a`, `a//b`, `a/.b` and `a.lock`. It accepts `main`, `feature/x`, `ünï`, `a@b`, `a{b}`, `.a`, `HEAD`, and names containing tabs or control characters. The rules belong to `hasInvalidRefChars` and must be used as they are; see Q15.
- The check is live. After every keystroke the submit button's state reflects the current values.
- **What the user sees while refused:**
  - The submit button is `disabled`: dimmed to 50% opacity, with a not-allowed cursor, as `Button` styles it. It cannot be clicked, and implicit submission is blocked.
  - A native tooltip (`title`) with `l10n.invalidCharacters`, `{0}` replaced by the form's `action`, appears when hovering the submit button, **only when the reason is invalid characters**. It does not appear when the reason is emptiness. Take the first ref field, in input order, that has any problem: the tooltip shows only when that field's problem is invalid characters. So an empty first ref field hides the tooltip even if a later ref field is invalid (observed; see Q8). English example: `Unable to Create Branch, one or more invalid characters entered.`
  - The `title` currently sits on an element that encloses the submit button, not on the button itself. Tests do not depend on where it is, but hovering the disabled button must show it.
  - Nothing else changes. There is no inline error text, the field is not restyled, and there is no `aria-invalid` (see Q8).
- Once the value is valid again, the button is enabled and the tooltip removed.

### 3.5 Running dialogs (`kind: "running"`)

What is rendered, in order:

1. **Message line**, centred on one row: a spinning "sync" glyph (two curved arrows chasing each other), 20 px, muted colour, decorative and `aria-hidden`, followed by the text `message + " ..."` (a space and three ASCII dots). This line's id is the panel's `aria-labelledby`, so the accessible name is, for example, "Pushing ...".
2. **Detail**, only when `detail` is a non-empty string: a left-aligned paragraph in extra-small text. Line breaks are kept and long tokens such as paths may break anywhere. The text is selectable.
3. **Elapsed time**, only when `started` is defined: a muted paragraph with two lines. The first is `l10n.elapsedSeconds` with `{0}` replaced by `formatSeconds(started, now)`; the second is `l10n.operationKeepsRunning`. "Now" is the time the dialog appeared, then refreshed every 1000 ms while it is shown. The count therefore goes up by one second each second, and may lag the true elapsed time by less than a second (observed: started 2.6 s before opening shows `2s elapsed`, one second later `3s elapsed`, 61 seconds later `63s elapsed`). A `started` in the future shows `0s elapsed`.
4. **Button row**, centred:
   - **Stop Git** (`l10n.cancelOperation`), only when `onCancel` is present. Activating it calls `onCancel()` and does **not** close the dialog. The dialog stays until the host's response replaces or closes it. Observed: one call, dialog still `running`.
   - **Hide** (`l10n.hideOperation`), always present. It calls `closeDialog()`. The Git operation itself goes on, and a later failure is reported elsewhere (Git Activity), not by this module.
   - No other buttons. `cancel-action.test.ts` checks that the buttons are exactly `["cancelOperation", "hideOperation"]` or exactly `["hideOperation"]`.

When a running dialog is replaced (for example by an error dialog, or by another running dialog for a new action), the new dialog starts its own timer from its own mount time. The old timer is stopped.

### 3.6 Error dialogs (`kind: "error"`)

What is rendered, in order:

1. **Message line**, centred: a warning glyph (a triangle with an exclamation mark), 16 px, muted colour, decorative and `aria-hidden`, followed by `message`. There is no suffix. This line's id is the panel's `aria-labelledby`. The dialog's visible text therefore **begins with the message**. The UI harness uses this: its completion helper fails the test when the dialog's `innerText` starts with "Unable".
2. **Reason**, when `reason !== null`: a left-aligned italic paragraph that keeps line breaks and whose text is selectable. It is currently rendered even when `reason` is `""`, as an empty paragraph that only adds space (see Q9).
3. **Button row**, centred:
   - **Copy Error Details** (`l10n.copyError`), only when `reason` is a non-empty string. Activating it calls `copyToClipboard(l10n.copyError, reason)` and leaves the dialog open. If the copy fails, `copyToClipboard` replaces this dialog with a new error dialog (English observed: "Unable to Copy Copy Error Details to Clipboard", with **Dismiss** only; see Q10).
   - **Dismiss** (`l10n.dialogDismiss`), always present. It calls `closeDialog()`.

### 3.7 Content dialogs (`kind: "content"`)

What is rendered, in order:

1. A **heading**, an `h2` in bold with space below it, showing `message`. Its id is the panel's `aria-labelledby`.
2. The caller's `content`, as given (elements, a component or a plain string). The dialog adds no controls of its own to the content. `workflows.test.ts` expects exactly the two `input`s of the bisect view.
3. A block with space above it holding one **Close** button (`l10n.close`), which calls `closeDialog()`. The panel's centred text centres the button.

The content owns its own state and focus after the first focus (§3.3.1). A re-render of the content, for example a background refresh that swaps a review, must not make the dialog refocus anything (`repository-actions.test.ts`, "keeps the sync review and its focus through background refreshes"). Buttons inside the content that close the dialog call `closeDialog()` themselves. Their behaviour belongs to the content.

`wide: true` selects the wide panel (§3.11). Absent or false selects the normal width.

### 3.8 Closing, and focus afterwards

The dialog closes when:

| Trigger                                                                                                                    | Kinds   |
| -------------------------------------------------------------------------------------------------------------------------- | ------- |
| Escape (§3.3.2)                                                                                                            | all     |
| A click on the overlay with `detail < 2` (§3.2)                                                                            | all     |
| Cancel                                                                                                                     | form    |
| Accepted submit (closes first, then calls `onSubmit`)                                                                      | form    |
| Hide                                                                                                                       | running |
| Dismiss                                                                                                                    | error   |
| Close                                                                                                                      | content |
| Anything else writing the store: a new dialog replacing it, `closeDialog()` from elsewhere, a direct `dialog.value = null` | all     |

- All closings that this module starts go through `closeDialog()` and nothing else.
- **Focus on close is not this module's job.** The module must not move focus when a dialog closes or unmounts. `closeDialog()` sets the store to `null` and, after the current microtasks, if neither a dialog nor a context menu is open by then, moves focus back to the control that had it when the chain of menus and dialogs began. If that control is gone, focus goes to the same commit row after a re-render, or else to the search field or the first header button. Because the check runs after the current task, a dialog replaced by another within the same task keeps the original return target. `workflows.test.ts` ("returns keyboard focus to the original control across menu and dialog transitions") and the UI harness (Compare → Close returns focus to the header's Compare button) check this.
- When the store is cleared directly (tests do this), focus is not restored by anyone (see Q16).
- On close, the overlay and panel are removed at once. There is no exit animation. The document listener and any timer are removed.

### 3.9 Keyboard and focus summary

| Situation                                                        | Result                                                             |
| ---------------------------------------------------------------- | ------------------------------------------------------------------ |
| Dialog opens, destructive form                                   | Cancel focused                                                     |
| Dialog opens, any other form                                     | first text or ref field, or else the submit button                 |
| Dialog opens, running                                            | Stop Git if cancellable, or else Hide                              |
| Dialog opens, error                                              | Copy Error Details if the reason is non-empty, or else Dismiss     |
| Dialog opens, content                                            | first `input[type="text"]` or button in the content, or else Close |
| Enter in a text or ref field (fresh press)                       | submits the form, unless refused                                   |
| Enter in a textarea (fresh or held)                              | new line; never submits                                            |
| Enter or Space on a button (fresh press)                         | activates it (native)                                              |
| Enter or Space held (repeat) inside the panel, not in a textarea | default prevented, propagation stopped; nothing activates          |
| Escape anywhere                                                  | closes (§3.3.2)                                                    |
| Tab on the last tabbable control                                 | wraps to the first                                                 |
| Shift+Tab on the first tabbable control or on the panel          | wraps to the last                                                  |
| Dialog replaced by a new one                                     | the new dialog's initial focus applies                             |
| Dialog closed                                                    | focus returns through `closeDialog()` (§3.8)                       |

### 3.10 Accessibility

- Panel: `role="dialog"`, `aria-modal="true"`, `tabindex="-1"`, and `aria-labelledby` holding **exactly one id**. That id refers to the form's message paragraph, the running or error dialog's message line, or the content dialog's `h2`. `Dialog.test.ts` resolves the attribute with `document.getElementById`, so a space-separated list of ids would fail.
- Fields:
  - A labelled non-checkbox field is named by its `label for` element.
  - An unlabelled non-checkbox field has `aria-labelledby` set to the message's id. `Dialog.test.ts` ("accessible names") checks that the unlabelled `select` of the Reset, Cherry-pick and Revert dialogs on a merge commit points at an element with non-empty text inside the dialog.
  - A checkbox is named by the `label` that wraps it.
- Buttons are named by their visible text.
- Both status glyphs are `aria-hidden="true"` and `focusable="false"`.
- The panel does not set `aria-describedby`, `role="alertdialog"` or any live region. Explanations, the error reason and the ticking timer are not announced as descriptions or updates. The page behind is not made `inert`. The modal effect comes from `aria-modal`, the overlay and the Tab containment. See Q17.

### 3.11 DOM contract (what other code and tests rely on)

| Selector or fact                                                                                                                           | Relied on by                                                                                                                                                                                                                                                                                                                     |
| ------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| While a dialog is shown, exactly one element with `role="dialog"`. None once it closes.                                                    | UI harness (`button()` scopes its search to `document.querySelector("[role=dialog]") \|\| document`; `finished()` waits for its `innerText` to be empty or absent); `Dialog.test.ts`; `src/webview/lib/focus.ts` (`closest('[role="dialog"], [role="menu"]')` stops focus inside a dialog from being taken as the return target) |
| The panel's `aria-labelledby` resolves with `getElementById`                                                                               | `Dialog.test.ts`                                                                                                                                                                                                                                                                                                                 |
| The overlay is the first element in the component's output that has both classes `fixed` and `inset-0`. The panel must not have `inset-0`. | `unseen-failures.test.ts` (`container.querySelector(".fixed.inset-0")`)                                                                                                                                                                                                                                                          |
| Output is rendered inside the component's own container                                                                                    | every unit test (`container.querySelector…`)                                                                                                                                                                                                                                                                                     |
| The form dialog has a `form` element; its submit control is the only `button[type="submit"]` in a form dialog                              | `Dialog.test.ts` (`button[type="submit"]`, `.click()`)                                                                                                                                                                                                                                                                           |
| Cancel carries the attribute `data-dialog-cancel`; no other dialog button does                                                             | `Dialog.test.ts` (`hasAttribute("data-dialog-cancel")` on the focused element)                                                                                                                                                                                                                                                   |
| Text and ref fields are `input` elements with the attribute `type="text"`, in input order, inside `[role="dialog"]`                        | UI harness `fill()` (`[role="dialog"] input[type="text"]`, sets `.value` and dispatches a bubbling `input`); initial-focus rule                                                                                                                                                                                                  |
| Select fields are native `select` elements inside `[role="dialog"]` and react to a bubbling `change`                                       | UI harness `select()`; `Dialog.test.ts` (`container.querySelector("select")`)                                                                                                                                                                                                                                                    |
| The textarea is a native `textarea`                                                                                                        | `Dialog.test.ts` (held Enter in a text area)                                                                                                                                                                                                                                                                                     |
| Each dialog-owned button's `textContent` is **exactly** its label, with no extra text, whitespace or text-bearing icons                    | `cancel-action.test.ts`, `history-tools.test.ts`, `repository-actions.test.ts`, `workflows.test.ts` (compare `textContent === label`); UI harness (trimmed comparison; also `document.activeElement.textContent.trim() === "Cancel"`)                                                                                            |
| Running dialog: the only dialog-owned buttons are Stop Git (when cancellable), then Hide                                                   | `cancel-action.test.ts`                                                                                                                                                                                                                                                                                                          |
| Error dialog: the reason is in the dialog's text, and there is a button labelled `copyError`                                               | `history-tools.test.ts`                                                                                                                                                                                                                                                                                                          |
| Error dialog's `innerText` begins with the message                                                                                         | UI harness `finished()`                                                                                                                                                                                                                                                                                                          |
| Content dialog adds no `input` elements                                                                                                    | `workflows.test.ts` (bisect)                                                                                                                                                                                                                                                                                                     |
| In a no-input destructive confirmation, one Shift+Tab from Cancel lands on the submit button                                               | UI harness ("never confirms…": `keypress("Tab", 8)`, where 8 is the Shift modifier, then expects "Yes")                                                                                                                                                                                                                          |
| A wide dialog in a 520 px wide viewport stays within the viewport horizontally (`left ≥ 0`, `right ≤ innerWidth`)                          | UI harness (Compare Revisions at a narrow width)                                                                                                                                                                                                                                                                                 |

The stylesheet (`src/webview/styles.css`) has no selector aimed at the dialog. It provides the theme tokens listed in §3.12.

### 3.12 Appearance (the required look)

The look is stated as values. Build it with Tailwind v4 utilities and the theme tokens in `src/webview/styles.css`, choosing the classes yourself. Every class must appear whole and literally in a source file under `src/webview`, or Tailwind will not generate it (the stylesheet scans that folder). Only the overlay's `fixed` and `inset-0` classes are required by name (§3.11).

- **Overlay:** covers the whole viewport, stacked at z-index 30, tinted black at 20% opacity.
- **Panel position and stacking:** fixed, centred horizontally and vertically in the viewport, stacked at z-index 40: above the overlay (30), context menus (20) and dropdown lists (10).
- **Panel size:**
  - Width `min(600px, calc(100vw - 2rem))`, or `min(960px, calc(100vw - 2rem))` for a wide content dialog. At a 520 px viewport, both come to 488 px.
  - The theme also defines a dialog width token, `--container-dialog: min(360px, calc(100vw - 2rem))`; see Q2.
  - At most 80% of the viewport's height; taller content scrolls vertically inside the panel.
- **Panel surface:** 5 px corner radius (the theme's `--radius-md`); a 1 px border in the theme's line colour; the menu background and foreground colours (`--color-menu`, `--color-menu-fg`); the theme's dialog shadow (`--shadow-dialog`); 20 px padding on every side; centred text; no focus outline on the panel itself.
- **Form:**
  - Fields area: 10 px below the message, 10 px between rows and columns, left-aligned text. The two-column layout of labelled forms (§3.4.3) uses the theme's `labelled` grid template (`auto 1fr`) with items centred vertically, from the `sm` breakpoint up; a checkbox row spans both columns. Labels wrap, breaking inside words when needed.
  - Text fields and the textarea use `INPUT_CLASS`; selects use `Select`'s own look.
  - Button row: 10 px below the fields (or the message), buttons centred with 12 px between them.
- **Running and error:**
  - Message line: glyph and text on one centred row, 6 px apart, vertically centred.
  - Spinner: 20 px square, never shrinking, spinning continuously, in the muted colour; the glyph is drawn in a 12 × 16 box.
  - Warning glyph: 16 px, never shrinking, in the muted colour.
  - Detail: 12 px above it, extra-small text, left-aligned, line breaks kept, long tokens broken anywhere, selectable.
  - Elapsed block: 12 px above it, muted colour, with a line break between its two sentences.
  - Reason: 10 px above it, left-aligned, italic, line breaks kept, selectable.
  - Button row: 16 px above it, buttons centred with 8 px between them.
- **Content:** the heading is bold with 12 px below it; the Close button sits in a block 12 px below the content.
- **Buttons:** all use `Button`'s default (non-primary) look, which already provides the hover, focus and disabled states.
- **Glyphs:** any drawing that reads as the sync (two circular arrows) and warning (triangle with an exclamation mark) glyphs, in `currentColor`, drawn inside the `Icon` wrapper. Draw your own paths.
- Muted text uses the theme's muted colour (`--vscode-descriptionForeground`).

---

## 4. Concrete examples (observed)

Button labels are shown in [brackets]. A **bold** or _**bold italic**_ name is how the callers style it inside the message.

### 4.1 "Add Tag…" on a commit (labelled form)

- Store: form, message "Add tag to commit _**abc1234**_". Inputs: ref `Name` = `""`; select `Type` = `annotated` with options Annotated and Lightweight; text `Message` = `""` with placeholder "Optional". Action "Add Tag".
- Rendered:
  - The message paragraph (id `P0-0` in the run).
  - A two-column grid. Its rows: `label[for=P0-1]` "Name" with the text `input#P0-1`; `label[for=P0-2]` "Type" with `select#P0-2` showing Annotated; `label[for=P0-3]` "Message" with `input#P0-3` showing the placeholder "Optional".
  - [Add Tag] disabled with no tooltip, then [Cancel].
- Focus is in the Name field.
- Typing `v 1` in Name keeps [Add Tag] disabled and adds the tooltip "Unable to Add Tag, one or more invalid characters entered."
- Typing `v1` in Name enables [Add Tag] and removes the tooltip.
- Clicking [Add Tag] closes the dialog, then calls `onSubmit(["v1", "annotated", ""])`. With test inputs that also had a textarea `x` and a checkbox (first checked, then clicked), the observed values were `["good","annotated","","x",false]`.

### 4.2 "Delete Tag…" (destructive confirmation, no inputs)

- Store: form, message "Are you sure you want to delete the tag _**v1**_?", no inputs, action "Yes", `destructive: true`.
- Rendered: the message, then [Yes] [Cancel]. There is no fields area.
- Focus is on [Cancel]. Shift+Tab goes to [Yes]. Tab on [Cancel] wraps to [Yes]. Shift+Tab on [Yes] wraps to [Cancel].
- Enter on [Cancel] closes the dialog, and `onSubmit` is not called.
- Holding Enter on the "Delete Tag…" menu item opens this dialog, and the repeats that follow are all default-prevented on [Cancel]. Nothing is sent.
- A fresh Enter on [Yes] submits: the dialog closes, `runAction` sends one `deleteTag` message, and a running dialog appears.

### 4.3 "Reset current branch to this Commit…" (destructive, unlabelled select)

- Message: "Are you sure you want to reset **the current branch** to commit _**abc1234**_?", followed by a muted explanation line.
- One select without a label: "Soft - Keep all changes, but reset head", "Mixed - Keep working tree, but reset index" (selected), "Hard - Discard all changes".
- The select's `aria-labelledby` is the message paragraph's id.
- Buttons [Yes, reset] [Cancel]. Focus is on [Cancel].

### 4.4 "Merge into current branch…" (checkbox only; unlabelled)

- Message "Are you sure you want to merge _**topic**_ into **the current branch**?".
- One checked checkbox, "Create a new commit even if fast-forward is possible".
- Buttons [Yes, merge] [Cancel]. Focus is on [Yes, merge], because the form has no text field and is not destructive.
- Submitting unchanged passes `[true]`; after unticking, `[false]`.

### 4.5 A textarea-only form

- Inputs: one textarea without a label, `value: ""`, placeholder "p". Action "Save".
- Focus lands on [Save], not on the textarea.
- A repeated Enter keydown on the textarea is not prevented.

### 4.6 Running push, cancellable (English)

- Store: running, message "Pushing", detail `"/repo\ngit push origin main"`, `started` 2.6 s before opening, with `onCancel`.
- Visible text, top to bottom:
  - "Pushing ..." next to the spinning glyph
  - "/repo"
  - "git push origin main"
  - "2s elapsed"
  - "Git continues running when this dialog is hidden."
  - [Stop Git] [Hide]
- Focus is on [Stop Git].
- After 1 s the timer line reads "3s elapsed"; after another 60 s, "63s elapsed".
- [Stop Git] calls `onCancel` once, and the dialog stays.
- [Hide] or Escape closes the dialog.
- Test text: the buttons are `["cancelOperation","hideOperation"]`.

### 4.7 Running without context

- `openRunningDialog("Loading remotes")` shows "Loading remotes ..." and [Hide] only. There is no detail or timer line and no interval timer.
- `openRunningDialog("Future", {detail: "", started: now + 100 s})` shows "Future ...", "0s elapsed", the second sentence, and [Hide]. There is no detail paragraph.

### 4.8 Error with reason (English)

- `openErrorDialog("Unable to Merge Branch", "CONFLICT (content): …\nAutomatic merge failed…")` shows:
  - the warning glyph and "Unable to Merge Branch"
  - the reason in italics, on its original lines, selectable
  - [Copy Error Details] [Dismiss]
- Focus is on [Copy Error Details].
- [Copy Error Details] calls the host's `clipboard.copy` with the reason text. The dialog is unchanged on success.
- If the copy fails, the dialog is replaced by an error dialog "Unable to Copy Copy Error Details to Clipboard" with [Dismiss].
- [Dismiss] closes the dialog.

### 4.9 Error without reason

- `reason: null` gives the glyph, the message and [Dismiss]. Focus is on [Dismiss].
- `reason: ""` gives the glyph, the message, an **empty** reason paragraph, and [Dismiss]. There is no copy button.

### 4.10 Content dialog, wide

- `openContentDialog("Title", <p>body<button>Inner</button></p>, true)` shows the heading `h2` "Title", then the paragraph with the [Inner] button, then [Close].
- The panel is `min(960px, calc(100vw - 2rem))` wide. Focus is on [Inner].
- With `openContentDialog("Title2", <p>no controls</p>)`, the width is `min(600px, …)` and focus is on [Close].
- A plain string as content ("plain string content") renders as text. The dialog's text is "T", then "plain string content", then "Close".

### 4.11 Overlay clicks

- Error dialog open. A bubbling `click` on the overlay with `detail: 2` leaves it open, and so does `detail: 3`.
- The same with `detail: 1` or `detail: 0` closes it.
- A click on the panel with `detail: 1` leaves it open.

### 4.12 Escape from outside the panel

- Error dialog open, focus moved to a button outside the dialog. A bubbling Escape `keydown` on that button closes the dialog. The event's `defaultPrevented` stays false.

### 4.13 Chained dialogs

- "Delete Remote Branch…" on `origin/held-remote` (UI harness):
  1. A running dialog "Loading remotes ..." appears.
  2. It is replaced by a picker form: select `Remote` = `origin`, action "Delete Remote Branch", not destructive. Focus is on the submit button.
  3. Held Enter does nothing.
  4. A fresh Enter submits the picker. It closes, and the follow-up destructive confirmation "Delete _**held-remote**_ from remote **origin**? This changes the remote repository for everyone using it." opens with [Delete Remote Branch] [Cancel] and focus on [Cancel].
  5. Enter on [Cancel] closes the dialog.

---

## 5. Non-functional requirements

1. **The store is read-only for this module.** Never assign `dialog.value` and never change the state object or its arrays. `remote-actions.tsx`, `repository-actions.tsx`, `HistoryTools.tsx` and `handler/action-result.ts` keep the `dialog.value` object and later compare it by identity to tell whether "their" dialog is still showing. Any rewrite of the store would break those checks. Close only with `closeDialog()`.
2. **One dialog at a time.** Show at most one overlay and one panel. A new token replaces the previous dialog completely: fresh values, fresh focus, fresh listener, fresh timer.
3. **Cleanup.**
   - Exactly one document `keydown` listener while a dialog is shown. It is removed on close, on replacement and on unmount.
   - The running dialog's 1-second interval exists only while a running dialog with `started` is shown, and is cleared on close, replacement or unmount. Observed with fake timers: the timer count went back to its baseline after `closeDialog()` and after `render(null, container)`.
   - Unmounting with a dialog open, as test teardown does, must not throw or leave anything behind.
4. **Ordering on submit.** Call `closeDialog()` before `onSubmit`, and never call `onSubmit` for a refused form.
5. **Synchronous initial focus**, applied when the render is committed (§3.3.1). A held key's next repeat must find focus already inside the new dialog.
6. **No reading of globals at import time.** `history-tools.test.ts` and `workflows.test.ts` import the module statically, before `setupWebviewTest()` defines `window.l10n` and the webview config. Read `window.l10n`, the config, `Date.now()` and so on only while rendering or handling events.
7. **Localized text only.** All visible and announced text comes from `window.l10n` or the caller's data. The repository's lint rule `no-hard-coded-text` (`oxlint/webview-text.cjs`, run by `pnpm run lint`) rejects JSX text or `title` or `aria-label` literals that contain letters. The running suffix " ..." has no letters and is allowed.
8. **No focus movement on close** by this module (§3.8). Moving focus on unmount would fight with `closeDialog()`'s restoration and with the next dialog's initial focus.
9. **Robust against re-renders.** Parent re-renders, content re-renders and signal changes elsewhere must not reset typed values or move focus within the same token.
10. **Project gates.** `pnpm run typecheck` (includes `tsc -p src/webview` and `tsc -p tests/webview`), `pnpm run lint` (including the alphabetised, grouped import-order rule), `pnpm run format` (oxfmt) and the webview Vitest project must pass.

---

## 6. Test coverage

### 6.1 Already checked

- `tests/webview/components/ui/Dialog.test.ts`
  - **Accessible names:** the unlabelled `select` in "reset…" (normal commit) and in "cherryPick…" and "revert…" (merge commit) has `aria-labelledby` pointing at an element with non-empty text that appears in the `[role="dialog"]` text.
  - **Held Enter**, for "deleteTag…", "deleteBranch…" and "reset…" opened by keyboard from a context menu. The dialog is a destructive form. The focused element has `data-dialog-cancel`. Three repeated Enter keydowns on the focused element are all default-prevented. No message is posted. A fresh Enter on the submit button is not prevented, and clicking the submit button posts exactly one message.
  - Held Enter on a `textarea` is not prevented.
  - **Initial focus:** in a checkbox-only form, focus is on the button whose text equals the action. Opening a ref form over it moves focus to an `INPUT`.
  - **Destructive repository confirmations** (11 actions through `confirmRepositoryAction`): the focused element has `data-dialog-cancel` exactly when the action is destructive.
- `tests/webview/lib/cancel-action.test.ts`: a running network action shows exactly [Stop Git][Hide] (test text), a local action shows exactly [Hide], and the component can be mounted after the store is set.
- `tests/webview/lib/unseen-failures.test.ts`: an overlay click with `detail: 2` keeps the dialog; `detail: 1` closes it. The overlay is found as `.fixed.inset-0`.
- `tests/webview/lib/history-tools.test.ts`: an error dialog shows its reason and a `copyError` button. Content dialogs render their buttons, and those work, while the dialog state keeps its identity.
- `tests/webview/lib/repository-actions.test.ts`: buttons inside content dialogs can be clicked. Focus inside a content dialog survives background refreshes and is not reset by the dialog.
- `tests/webview/lib/workflows.test.ts`: content dialogs render the caller's inputs and buttons only. Focus returns to the original control after `closeDialog()` (without the component mounted).
- `tests-ext/ui/history.test.cjs` (real VS Code with Chromium, not run for this document):
  - held Enter never confirms delete tag, delete branch, reset, or the remote-branch picker and its confirmation;
  - Cancel has focus in destructive dialogs, and Shift+Tab from Cancel reaches "Yes";
  - Enter on the focused Cancel closes the dialog;
  - text fields are filled through `[role="dialog"] input[type="text"]` and selects through `[role=dialog] select`;
  - buttons are found by their text inside the dialog;
  - dialogs disappear on completion, and error dialogs start with their message;
  - a wide dialog fits a 520 px viewport;
  - Close returns focus to the toolbar button that opened the dialog.

### 6.2 Gaps, each with a test case

Unless stated otherwise: jsdom, `setupWebviewTest()`, `Dialog` mounted in a fresh container, dialogs opened with the functions in `@/webview/lib/actions`, `selectedRepo` set to `"/repo"`, and label text from the test proxy (key names).

1. **Nothing rendered when empty.** Setup: store `null`. Interaction: none. Expected: the container's `innerHTML` is `""`, and `document.querySelector('[role="dialog"]')` is `null`.
2. **Panel attributes.** Setup: `openErrorDialog("E")`. Expected: the panel has `role="dialog"`, `aria-modal="true"` and `tabindex="-1"`, and `getElementById(aria-labelledby)` has text "E". Repeat with a form (the target is the message paragraph) and a content dialog (the target is an `H2` with the heading text).
3. **Escape closes from anywhere.** Setup: `openErrorDialog("E","r")`, then focus a button appended to `document.body` outside the dialog. Interaction: dispatch a bubbling, cancelable Escape `keydown` on that button. Expected: `dialog.value === null`, and `defaultPrevented` is false. Repeat for a form, a running dialog and a content dialog.
4. **Escape listener removed.** Setup: spy on `document.addEventListener` and `removeEventListener`. Interaction: open two dialogs one after the other, then `closeDialog()`, then unmount. Expected: equal numbers of `keydown` adds and removes. After that, an Escape `keydown` with a new dialog absent does not throw and changes nothing.
5. **Tab wraps forward.** Setup: `openFormDialog({message:"Q", inputs:[], action:"Go", destructive:true, …})`, so focus is on Cancel. Interaction: a cancelable Tab `keydown` on Cancel. Expected: `defaultPrevented` is true, and the focus is on the submit button.
6. **Shift+Tab wraps back, from the first control and from the panel.** Same setup. Interaction: focus the submit button and send Shift+Tab; then focus the panel and send Shift+Tab. Expected: both are default-prevented and both end with focus on Cancel.
7. **Tab containment skips a disabled submit.** Setup: a form with one ref field `""` (so submit is disabled) and focus on Cancel. Interaction: Tab on Cancel. Expected: focus on the ref input, because the disabled submit is skipped.
8. **Repeated Space and repeated Enter are blocked, not only in destructive dialogs.** Setup: a form with one text field. Interaction: a repeated `" "` `keydown` on the submit button and a repeated `"Enter"` on the text input, with a `document` keydown listener attached. Expected: both default-prevented, and the document listener not called. A repeated Escape is not prevented.
9. **Empty ref blocks, silently.** Setup: `openFormDialog({message:"N", inputs:[{kind:"ref", value:""}], action:"Create", …})`. Expected: submit disabled; neither the submit button nor any ancestor inside the dialog has a `title`.
10. **Invalid ref blocks with a tooltip.** Same setup; type `a..b` (set `.value`, dispatch `input`). Expected: submit disabled, and the tooltip text equals `window.l10n.invalidCharacters.replace("{0}", "Create")` (use a custom l10n with `{0}` so the substitution is checked). Then type `ok`: enabled, and no `title`.
11. **Refused submit does nothing.** Setup: as test 10 with `a..b`, and `onSubmit` spied. Interaction: dispatch a cancelable `submit` event on the form. Expected: the event's `defaultPrevented` is true, `onSubmit` is not called, and the dialog is still the same form.
12. **Accepted submit closes first, then calls `onSubmit` with ordered values.** Setup: inputs ref `x`, select value `b` of options a and b, text `""`, textarea `"t"`, checkbox `false`. Interaction: type `feature/y` into the ref, choose `a` (dispatch `change`), tick the checkbox, then call `form.requestSubmit()`. Expected: `onSubmit` is called once with `["feature/y","a","","t",true]`, and `dialog.value` is already `null` when `onSubmit` runs (read it inside the spy).
13. **A dialog opened by `onSubmit` survives.** Setup: `onSubmit` calls `openErrorDialog("Second")`. Interaction: click submit. Expected: `dialog.value.kind === "error"`, the message is "Second", and the panel's text includes "Second".
14. **Cancel.** Setup: any form with `onSubmit` spied. Interaction: click `[data-dialog-cancel]`. Expected: the store is `null`, `onSubmit` is not called, and the button's text is `dialogCancel`.
15. **Labelled layout and naming.** Setup: inputs ref "Name", select "Type", text "Message" with placeholder "Optional", unlabelled textarea, checkbox "Push". Expected: three `label[for]` elements whose `for` matches their controls' ids; the text input has placeholder "Optional" and the ref input has none; the textarea has `aria-labelledby` equal to the message's id; the checkbox is inside a `label` whose text is "Push"; all ids are unique.
16. **Unlabelled layout.** Setup: an unlabelled select plus a checkbox. Expected: no `label[for]` elements; the select has `aria-labelledby` equal to the message's id.
17. **Initial values.** Setup: a text `"a0"`, a select `"2"` with options 1 and 2, a textarea `"x"` and a checkbox `true`. Expected: the DOM shows `a0`, `2`, `x` and checked.
18. **Replacement resets values and focus.** Setup: a form with text `"a0"`; type `typed`. Interaction: open a second form with text `"b0"`. Expected: the input shows `b0` and is `document.activeElement`.
19. **Same token keeps values and focus.** Setup: a form with two text fields; edit the first and focus the second. Interaction: render the component again, and set `dialog.value = { ...dialog.value }` (same token). Expected: the first input still shows the edit, and the second still has focus.
20. **Initial focus by kind.** (a) A textarea-only form focuses the submit button. (b) A form with select, then ref, focuses the ref input. (c) A running dialog with `onCancel` focuses `cancelOperation`, and without it focuses `hideOperation`. (d) An error with reason `"r"` focuses `copyError`, and with `null` focuses `dialogDismiss`. (e) A content dialog with an inner button focuses that button, and one with no controls focuses `close`.
21. **Running dialog text and timer.** Setup: fake timers at `now = 100000`, and `openRunningDialog("Pushing", {detail:"/repo\ngit push", started: 97400})` with English l10n. Expected: the text contains "Pushing ...", the detail on two lines, "2s elapsed" and the keeps-running sentence. Advance 1000 ms: "3s elapsed". Then `closeDialog()`, run the pending timers, and expect no interval left (`vi.getTimerCount()` back to its baseline).
22. **Running dialog without `started` or `detail`.** Setup: `openRunningDialog("Loading")`. Expected: the text is "Loading ..." followed only by the Hide label; there is no elapsed line and no interval.
23. **Stop Git does not close.** Setup: a running dialog with `onCancel` spied. Interaction: click `cancelOperation`. Expected: one call, and the store is still the running dialog. Hide then closes it.
24. **Error details.** (a) `reason: null`: there is no reason paragraph, and the buttons are exactly `["dialogDismiss"]`. (b) `reason: "a\nb"`: the reason paragraph's text is `"a\nb"`, and the buttons are `["copyError","dialogDismiss"]`. (c) `reason: ""`: the buttons are exactly `["dialogDismiss"]` (Q9 decides whether an empty paragraph may appear).
25. **Copy button.** Setup: spy `rpcClient.request` (from `@/webview/lib/rpc/rpc-client`) to resolve `true`. Interaction: click `copyError`. Expected: called with `("clipboard.copy", reason)`, and the dialog is unchanged. When it resolves `false`, the store holds an error whose message is `unableToCopyToClipboard` (test text).
26. **Content dialog.** Setup: `openContentDialog("T", h("p", null, "body"), true)`. Expected: an `h2` with text "T" is the `aria-labelledby` target; the only dialog-owned button is `close`; the panel width style contains `960px`. Without `wide`, it contains `600px`. Clicking `close` empties the store.
27. **Overlay with `detail: 0`** (a keyboard or synthetic click) closes. A click on the panel with `detail: 1` does not.
28. **No focus change on close by the component.** Setup: focus a button outside the dialog, then open an error dialog (focus moves to Dismiss). Interaction: set `dialog.value = null` directly, bypassing `closeDialog`, and flush microtasks. Expected: `document.activeElement` is `document.body`; the component did not move focus anywhere. Call `closeDialog()` afterwards to clear the return target that `focus.ts` captured. This pins down the division of work in §3.8; adjust it if Q16 is decided otherwise.
29. **Unmount while open.** Setup: a running dialog with `started`. Interaction: `render(null, container)` inside `act`. Expected: no error; after advancing 5 s, no interval callback runs; the document keydown listener is gone.

---

## 7. Questions

Each item states the current behaviour and a possible intent. None of them is decided here.

1. **Checkbox centring in unlabelled forms.** A checkbox in a form with no labelled fields is wrapped in a block meant to centre it. But the checkbox's own `label` is a block-level flex container, and centred text does not move flex items, so by CSS rules it shows left-aligned in the (left-aligned) fields area. It could not be checked in a real browser for this document. Should it be centred under the message, or is left alignment the intended look?
2. **Two widths.** The panel carries `w-dialog` (360 px maximum, from `--container-dialog`), but an inline width of 600 px (normal) or 960 px (wide) overrides it. Is the 360 px token dead, or was the normal width meant to be narrower?
3. **Initial focus skips textareas, selects and checkboxes.** Forms whose only fields are textareas (Edit URLs), selects (reset, parent picker, remote picker) or checkboxes start on the submit button, or on Cancel when destructive. Is that intended (a quick Enter confirms the default choice), or should the first field of any kind get focus?
4. **Focus starts on a secondary action.** An error with a reason starts on **Copy Error Details**, so a quick Enter copies instead of dismissing. A cancellable running dialog starts on **Stop Git**, so a quick Enter, if it is not a held repeat, stops the push or fetch. Should these start on Dismiss or Hide?
5. **Disabled first button.** When the first text input or button in the panel is a disabled button (possible in content dialogs), focus is not moved into the dialog at all and stays on the page behind. Should it fall back to the next candidate or to the panel?
6. **Containment only when focus is inside.** Tab is contained only for key events that start inside the panel. If focus is on `body` or on the page (after case 5, or after clicking a spot that cannot take focus), Tab reaches controls behind the overlay. Should the dialog pull focus back, or make the page `inert`?
7. **Escape ignores earlier handling.** Escape closes the dialog even when a control inside it has already handled the key and prevented its default (for example a future combobox in dialog content), and it closes a running dialog as well. Should Escape that was already handled (`defaultPrevented`) be left alone?
8. **Invalid-ref feedback.** The only feedback is a hover tooltip, near a disabled button, that keyboard and screen-reader users cannot reach. An empty ref field gives no feedback at all, and when several ref fields have problems, only the first one in order decides whether the tooltip appears. Should the message be visible text tied to the field (`aria-invalid`, `aria-describedby`), and should it name the field?
9. **Empty reason.** `reason: ""` draws an empty italic paragraph that only adds space, but no copy button. Should `""` be treated like `null`?
10. **Copy failure wording and loss.** A failed copy produces "Unable to Copy Copy Error Details to Clipboard", because the button label is passed as the thing being copied. It also replaces the error dialog, so the reason the user wanted to copy is no longer shown. Is a noun such as "error details" intended, and should a failure keep the original dialog?
11. **Select with an unmatched initial value.** When `value` matches no option, the select shows no selection (jsdom shows `""`; a browser typically shows a blank or the first option), yet submitting unchanged passes the unmatched value (observed: `"zzz"`). Should the initial value fall back to the first option, or is this a caller error?
12. **Reduced motion.** The running spinner always animates. The webview's other loading indicator (`Loading.tsx`) stops under `prefers-reduced-motion`. Should the dialog's spinner stop too?
13. **Which elements count as tabbable for containment.** Disabled textareas and selects are counted (disabled inputs and buttons are not). Links, `[tabindex]` elements, `contenteditable` regions and hidden elements in content dialogs are not counted. If the last counted element is disabled, or a link comes last, Tab on the real last control can leave the dialog. Should the tabbable set follow the browser's own rules?
14. **Running suffix.** " ..." (space plus three dots) is appended to translated text outside `window.l10n`, so languages that punctuate differently cannot change it. Keep it, or move it into the strings?
15. **Ref rules come from `hasInvalidRefChars`.** The rules accept some names Git refuses. Observed as accepted: `.a`, names with a tab or other control characters, `HEAD`, and `a/b.lock/c` (a component ending in `.lock` that is not the last one). That belongs to `src/webview/utils/ref.ts`, not this module, but the dialog is where users see it. Should the dialog use a stricter check?
16. **Who restores focus when the store is cleared directly.** Only `closeDialog()` restores focus. Clearing the store any other way (tests, or future code) leaves focus wherever the browser puts it after the panel disappears, usually `body`. Should the component guarantee some fallback on unmount, or is `closeDialog()` the only supported way to close?
17. **Screen-reader semantics.** Error dialogs use `role="dialog"`, not `alertdialog`. The reason, the explanation lines and the running detail are not linked with `aria-describedby`, and the elapsed timer is not a live region, so none of it is announced. The page behind is not `inert`. Is any of this wanted?
18. **Submit styling.** The submit button uses the same neutral style as Cancel, although `Button` has a `primary` variant. Is that deliberate, so destructive confirmations do not draw the eye?

---

## 8. Decisions on §7 (from the project maintainer's side)

These decisions replace the "current behaviour" wherever they differ. Build to these, and test the decided behaviour.

- **Q1: left-aligned.** In an unlabelled form, checkboxes are left-aligned in the fields area like every other control. No centring wrapper.
- **Q2: 600 px and 960 px.** The panel is 600 px or 960 px wide as §3.12 says. Do not use the 360 px `dialog` container token.
- **Q3: keep.** Textareas, selects and checkboxes do not receive initial focus.
- **Q4: start on the safe button.** A running dialog starts on **Hide**, whether or not it can be stopped, and an error dialog starts on **Dismiss**, whether or not it has a reason. Stop Git and Copy Error Details keep their place in the button row.
- **Q5: skip disabled candidates.** Initial focus goes to the first candidate of §3.3.1 that is not disabled; when there is none, to the panel. Focus always ends up inside the dialog when it opens.
- **Q6: keep.** Tab is contained only for key events that start inside the panel (with Q5, focus always starts there).
- **Q7: an Escape already handled is left alone.** An Escape `keydown` whose default was already prevented when it reaches `document` does not close the dialog, so a control inside the dialog can use Escape for itself. Any other Escape closes the dialog as before, including a running dialog.
- **Q8: keep.** The feedback for a refused ref stays as §3.4.5 describes.
- **Q9: an empty reason is no reason.** `reason: ""` is treated like `null`: no reason paragraph and no copy button.
- **Q10: out of scope.** The copy failure's wording belongs to `copyToClipboard` and the strings.
- **Q11: keep.** An unmatched initial select value is the caller's error and is passed through.
- **Q12: respect reduced motion.** The spinner does not animate when the user prefers reduced motion, as the webview's other loading indicator already does.
- **Q13: the browser's tabbable set.** For containment, the tabbable controls are, in document order, the panel's `input`, `select`, `textarea` and `button` elements that are not disabled, its `a` elements with an `href`, and its elements with a `tabindex` other than `-1`. Visibility is not checked.
- **Q14: keep.** The running suffix stays " ...".
- **Q15: out of scope.** The ref rules belong to `hasInvalidRefChars`.
- **Q16: keep.** `closeDialog()` is the only supported way to close; the component moves no focus on close or unmount.
- **Q17: keep.** `role="dialog"`, no description links or live regions.
- **Q18: keep.** The submit button uses the neutral style.
