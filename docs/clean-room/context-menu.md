# Clean-room specification: `src/webview/components/ui/ContextMenu.tsx`

This document describes, from the outside, the webview's one and only context menu: the floating
list of actions that appears when the user right-clicks a commit row, a ref label, a row of the
Branches pane or a file, or presses one of the "…" action buttons. It is written for an engineer
who will build a replacement without seeing the current source. It is based on the module's
importers (`src/webview/App.tsx`, `tests/webview/components/ui/Dialog.test.ts`), the store and
actions it uses, the components that open menus, `src/webview/styles.css`, the repository's tests,
the UI harness `tests-ext/ui/history.test.cjs`, and on running the current component under jsdom.

Terms used throughout:

- **Store**: the `contextMenu` signal exported by `src/webview/lib/stores.ts`. It holds either
  `null` (no menu) or one menu state.
- **Anchor**: the point `(x, y)` held in the menu state, in CSS pixels relative to the top-left
  corner of the webview's viewport (the same space as a mouse event's `clientX`/`clientY`).
- **Entry**: one element of the state's `entries` array. A non-null entry is an **item** (a title
  and an action); `null` is a **separator**.
- **Highlight**: the one item, if any, that is currently marked as the keyboard/pointer target.
- **Window size**: `window.innerWidth` × `window.innerHeight`.
- **Menu size**: the rendered menu's border-box width and height, after its size caps (§3.3).

---

## 0. Environment used for the observations

- Node v22.22.2, Vitest 4.1.11, jsdom 30.0.1, Preact 10.29.8, `@preact/signals` 2.11.1,
  Tailwind CSS 4.3.3. Linux.
- The current component was rendered with Preact under jsdom from scratch test files run with the
  repository's aliases and `tests/webview/setup.ts`, the same way `Dialog.test.ts` renders it.
  jsdom performs no layout, so for placement examples the menu's measured size was fixed by
  stubbing `getBoundingClientRect()` on the element with `role="menu"`, and the window size by
  redefining `window.innerWidth`/`window.innerHeight`. jsdom's default window is 1024 × 768.
- Behaviour that needs a real browser (painting, native scrolling, real key auto-repeat) was taken
  from the UI harness, which drives the built extension inside VS Code (Chromium). Where this
  document infers a browser behaviour that was not observed, it says so.
- All scratch files were deleted afterwards. No repository file was changed.

---

## 1. Interface

### 1.1 Module path

`src/webview/components/ui/ContextMenu.tsx`. It is imported as `./components/ui/ContextMenu` by
`src/webview/App.tsx` and as `@/webview/components/ui/ContextMenu` (dynamic import) by
`tests/webview/components/ui/Dialog.test.ts`.

### 1.2 Exports

The module has exactly one export, which must keep its name and shape:

- **`ContextMenu`**, a named export (there is no default export). It is a Preact function
  component that takes no props: `ContextMenu(): JSX.Element | null`. It reads the store and
  renders nothing at all when the store is `null`, otherwise the menu described in §3.

Nothing else is exported. Any internal pieces the implementer creates stay private.

### 1.3 The state it consumes

The component does not define these types; it reads them from `@/webview/types`. Their meaning, as
the menu uses them:

- `ContextMenuEntry` is either an object with `title: string` and `onClick: () => void`, or
  `null`. `title` is the item's visible text, shown literally (not as HTML). `onClick` is the action
  run when the item is chosen. `null` stands for a separator line.
- `ContextMenuState` has:
  - `x: number`, `y: number`: the anchor. Callers pass the pointer position of the gesture that
    opened the menu, or, for a keyboard-activated menu, the bottom-left corner of the control that
    opened it (this choice is made by `openContextMenu` in `src/webview/lib/actions.ts`, not by
    the menu). Values may be fractional, negative, or outside the window.
  - `entries: Array<ContextMenuEntry>`: the rows, in display order.
  - `source: string`: a key naming the element that opened the menu, such as
    `commit:<hash>`, `ref:<type>:<name>`, `file:<path>`, `workspace:<path>`, `remote:<name>`,
    `stash:<hash>` or `repository-tools`. Other components compare it with their own key to style
    themselves while their menu is open (§3.12). The menu itself uses it only to tell one menu
    from the next (§3.8).

### 1.4 Who uses what

| User                                         | What it uses                                                                                                                                                                                                         |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/webview/App.tsx`                        | Renders `<ContextMenu />` once, with no props, inside the app's root element, after the header, sidebar, graph, navigation effects and scroll shadow, and before the dialog. It is not wrapped in an error boundary. |
| `tests/webview/components/ui/Dialog.test.ts` | Imports `ContextMenu`, renders it next to `Dialog` in a fragment inside a test container, sets the store directly, and sends keyboard events to the element with `role="menu"` found inside that container (§6.1).   |
| `tests-ext/ui/history.test.cjs`              | Does not import the module. It finds the rendered menu in the real webview through the DOM (§3.10) and drives it with clicks and real key events.                                                                    |
| All other tests                              | Do not render the component. They set or read the store, or call `openContextMenu`/`closeContextMenu`, and are listed in §6.1 only for completeness.                                                                 |

---

## 2. Dependencies the implementation must use

| Import                                         | From                    | What it is for                                                                                                                                                                                                                                                            |
| ---------------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `contextMenu`                                  | `@/webview/lib/stores`  | The store. The component must read its value during render so that it re-renders whenever the store changes (with `@preact/signals`, reading `.value` inside the component subscribes it). The component never writes an open state into it; opening is the callers' job. |
| `closeContextMenu`                             | `@/webview/lib/actions` | The only way the menu may close itself, for every reason in §3.5 and §3.6. It sets the store to `null` and schedules the return of keyboard focus (§3.7). Writing `null` to the store directly would skip the focus return and is not acceptable.                         |
| `ContextMenuEntry`, `ContextMenuState` (types) | `@/webview/types`       | The shapes in §1.3.                                                                                                                                                                                                                                                       |
| Preact and `preact/hooks`                      | packages                | Rendering and component state.                                                                                                                                                                                                                                            |

It must not import `openContextMenu`; callers use it.

Platform facts the replacement relies on and that tests can control:

- The menu's size is read from the element with `role="menu"` through `getBoundingClientRect()`
  after the menu's content is in the document. The gap tests in §6.2 stub this method to set a
  size, so the measurement must go through it.
- The window size is read from `window.innerWidth` and `window.innerHeight`.
- Dismissal listens to `pointerdown` and `contextmenu` on `document` in the capture phase, to
  `scroll` on `window` in the capture phase (so scrolls of any element are seen), and to `resize`
  and `blur` on `window` (§3.6).
- Keeping the highlighted item visible scrolls only the menu itself. The current component uses
  the element's `scrollIntoView` with the "nearest" block alignment; jsdom does not implement
  `scrollIntoView`, and `Dialog.test.ts` installs a no-op before rendering (§6.3).

Styling uses the Tailwind utilities and theme colours defined through `src/webview/styles.css`
(§3.11). No stylesheet rule targets the menu by selector.

---

## 3. Behaviour

### 3.1 What is rendered

- **Store is `null`.** The component renders nothing: no element, not a hidden one. A container
  holding only the component is empty.
- **Store holds a state.** The component renders one menu element carrying `role="menu"`, in
  place (as a descendant of wherever `<ContextMenu />` is mounted; it must not be moved to another
  part of the document, because `Dialog.test.ts` looks for it inside its own container). Inside
  it, one row per entry, in the order of `entries`:
  - an item (`role="menuitem"`) whose entire text content is the entry's `title`, rendered as
    plain text (markup in a title shows literally; leading and trailing spaces are kept in the
    text content). Nothing else contributes text to an item: no icons with text, no shortcut
    hints, no check marks beyond what the title itself contains (the header menu, for instance,
    prefixes "✓ " to a title itself);
  - a separator (`role="separator"`) for each `null`.
- **Separators are rendered exactly as given.** A separator at the start or the end of the list,
  and two or more separators in a row, are all drawn; nothing is collapsed or dropped. (No current
  caller produces such lists; see Q3.)
- **Entries with the same title** are rendered as separate items and stay distinct: choosing the
  second one runs the second one's action.
- **Empty lists.** `entries: []` renders an empty menu frame (border, background and its vertical
  padding, no rows). A list of only separators renders the frame with the separators. See Q2 for
  how keys behave then.

### 3.2 Placement

The menu is positioned relative to the viewport (it does not move when the page scrolls, and any
scroll outside it closes it anyway). The position is chosen once for each menu state, from the
anchor, the menu size and the window size. It is not recomputed while the menu stays open.

The rules are the same on both axes; they are written here for the horizontal axis with the
vertical axis in brackets.

1. **Preferred direction: right [down] from the anchor.** The menu opens to the right [downward]
   when the anchor coordinate plus the menu's width [height] is strictly less than the window's
   width [height]. Its left [top] edge is then 2 px to the left of [above] the anchor, so the
   anchor lies 2 px inside the menu's top-left corner.
2. **Otherwise, opposite direction.** When the anchor coordinate plus the menu size equals or
   exceeds the window size, the menu opens to the left [upward]: its right [bottom] edge is 2 px
   to the right of [below] the anchor, so the anchor lies 2 px inside the menu's far corner.
3. **Never past the left [top] edge.** If the rule above yields a left [top] edge below 0, the
   menu is placed at 0 on that axis instead.
4. **No correction at the right [bottom] edge.** Nothing moves the menu back when its right
   [bottom] edge ends up beyond the window.
5. **No rounding.** Fractional anchors give fractional positions.
6. **The two axes are independent.** A menu may open rightward and upward, leftward and
   downward, and so on.

Consequences that follow from these rules and the size caps in §3.3:

- A menu that opens right [down] always ends more than 2 px before the window's right [bottom]
  edge.
- A menu that opens left [up] from an anchor inside the window can stick out by less than 2 px
  when the anchor is on the last pixel column [row]: anchor 1023 in a 1024 px window puts the far
  edge at 1025.
- A menu that fits neither after nor before the anchor on an axis is placed at 0 on that axis.
  Because the menu is never wider than the window minus 16 px or taller than the window minus
  16 px, it then fits entirely.
- A menu whose anchor lies within 2 px of the left [top] window edge is placed at 0.
- An anchor outside the window (possible for keyboard-opened menus whose control is partly off
  screen) can put the menu partly or wholly outside the window (Q4).
- For a keyboard-opened menu the anchor is the opening control's bottom-left corner, so a menu
  that opens upward covers the control (Q5).
- Under jsdom every measured size is 0, so the menu lands at 2 px above and left of the anchor,
  but at no less than 0 on either axis. For example, `Dialog.test.ts` opens at (0, 0) and the menu
  is placed at (0, 0).

**Not visible until placed.** The menu must never be painted at a provisional position (for
example in the viewport's top-left corner while its size is being measured). Measuring and placing
happen after the menu's content is in the document and before the browser paints it, and they are
complete by the time a Preact `act()` call that set the store returns (tests read the result
immediately). They must not be deferred to a timer or an animation frame.

**Observable form.** The placed position is the menu element's viewport-relative left and top
edges. In the current component these are its inline `left` and `top` styles, in `px`, with fixed
positioning; the gap tests in §6.2 read them that way.

### 3.3 Size and scrolling

- Width: the natural width of the widest row (the menu shrinks or grows to fit its titles), but
  never more than the viewport width minus 16 px (`100vw - 1rem`).
- Height: the natural height of all rows, but never more than the viewport height minus 16 px
  (`100vh - 1rem`).
- When capped, the menu scrolls inside itself. A title longer than the capped width wraps, and a
  single overlong word may be broken to fit.

### 3.4 The highlight

- At most one item is highlighted at a time. **When a menu opens, nothing is highlighted**, also
  for menus opened from the keyboard. (Both the Dialog test and the UI harness press ArrowDown
  once more than the target item's position, counting from 0, to reach it; an initial highlight
  would make them overshoot.)
- Separators can never be highlighted. Items are counted without separators.
- The highlighted item shows the "active" colours (§3.11). The menu element names it through
  `aria-activedescendant` (§3.9).
- Keyboard and pointer share the highlight: arrow keys continue from an item the pointer
  highlighted, and the pointer can override a keyboard highlight.
- **Pointer.** When the pointer moves over an item (a `pointermove` event on it), that item
  becomes highlighted. Mouse-only events (`mousemove`, `mouseover`) do not change the highlight.
  Moving the pointer off the item, or out of the menu, leaves the highlight where it is.
- **Keeping it visible.** Whenever the highlight changes (by key or by pointer), the menu scrolls
  by the least amount that shows the highlighted item fully. Nothing outside the menu may scroll
  as a result, because an outside scroll would close the menu (§3.6). The UI harness checks this
  on a long commit menu in a 520 × 850 window: after End, the highlighted item's bottom is within
  the menu's bottom.

### 3.5 Choosing an item

**By pointer.** A `click` event on an item chooses that item, whatever is highlighted at the time.
The click alone is enough: no preceding `pointerdown`, `mousedown` or `pointermove` is needed (the
UI harness calls `element.click()` on the item). Clicking a separator, or the menu's own padding,
does nothing and leaves the menu open.

**By keyboard.** A `keydown` of Enter or Space (key value `" "`) on the menu chooses the
highlighted item, provided that:

- an item is highlighted. With nothing highlighted, Enter and Space do nothing, the menu stays
  open, and their default action is not prevented; and
- the keydown is not an auto-repeat (`repeat` is false). An auto-repeated Enter or Space has its
  default action prevented and does nothing else; the menu stays open. The Dialog test and the
  harness test "never confirms a destructive dialog while Enter is held" depend on it; the
  user-facing reason is recorded in `CHANGELOG.md` (the entry about ignoring a held Enter or
  Space in dialogs and menus).

Modifier keys are not examined: Ctrl+Enter or Shift+Space choose like Enter and Space. When a key
chooses an item, its default action is prevented.

**Order of effects when an item is chosen (both ways):**

1. The menu closes through `closeContextMenu`: the store becomes `null`, and the focus return is
   scheduled for a microtask (§3.7).
2. Then, synchronously and within the same event handling, the item's `onClick` runs, exactly
   once. When it runs, the store is already `null`.

Consequences: an action that opens a dialog (most items do) or another menu takes over, and the
scheduled focus return then does nothing, keeping the original control as the place to return to
when the dialog closes (checked by `tests/webview/lib/workflows.test.ts` through the actions). An
action that throws leaves the menu closed.

### 3.6 Closing without choosing

Every close below goes through `closeContextMenu`, so it clears the store and returns focus
(§3.7).

| What happens                                                                                             | Result                                                                                                                                                                                                                                                                                             |
| -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A `pointerdown` anywhere outside the menu                                                                | Closes. Seen in the capture phase, so it also works for presses whose event does not bubble or whose target stops propagation. The press is not cancelled: the element under the pointer still receives its pointer, mouse and click events (clicking another row still selects it; see also Q13). |
| A `contextmenu` event outside the menu (right-click, context-menu key elsewhere)                         | Closes, in the capture phase, before the target's own handlers run. If the target opens its own menu, that menu appears at once and is the only one (§3.8).                                                                                                                                        |
| A `scroll` event whose target is outside the menu: the document or any element                           | Closes. Scroll events do not bubble, so this is watched in the capture phase at the window.                                                                                                                                                                                                        |
| A `scroll` event of the menu itself or of anything inside it                                             | Stays open.                                                                                                                                                                                                                                                                                        |
| The window is resized (`resize` on `window`)                                                             | Closes.                                                                                                                                                                                                                                                                                            |
| The window loses focus (`blur` on `window`), for example when the user clicks into another VS Code panel | Closes.                                                                                                                                                                                                                                                                                            |
| Escape keydown on the menu, including an auto-repeated one                                               | Closes, default prevented.                                                                                                                                                                                                                                                                         |
| Another component sets the store to `null` (for example opening a dialog, which clears the menu)         | The menu disappears. This does not go through the menu, so the menu does not return focus itself.                                                                                                                                                                                                  |
| Another component sets the store to a new state                                                          | The new menu replaces the old one (§3.8).                                                                                                                                                                                                                                                          |

Things that do **not** close the menu:

- A `pointerdown`, `click` or `contextmenu` inside the menu. A `contextmenu` event inside the
  menu has its default action prevented, so the browser's or host's native context menu never
  appears over this one; the menu stays open and nothing is chosen.
- `mousedown` or `click` outside the menu without a `pointerdown` (only happens with synthetic
  events, such as `element.click()` in tests and the harness).
- A `wheel` event that does not scroll anything outside the menu.
- Keyboard focus leaving the menu (Tab, a `focusout`, or script focusing another element). The
  menu stays open with its highlight but no longer receives keys (Q8).
- Escape or any other key pressed while focus is elsewhere; the menu only reacts to keys that
  reach its own element.
- `visibilitychange` and anything else not listed in the table above.

A `scroll` event dispatched with the window object itself as its target (which real scrolling
does not produce; the document is the target of page scrolls) currently raises an error inside
the close check and leaves the menu open (Q12).

The gesture that opened a menu must not close it: after a right-click, a click on an action
button, or a keyboard activation that sets the store, the new menu is open once that event has
been handled.

### 3.7 Keyboard and focus

**Focus on open.** When a menu state arrives, the menu element itself receives keyboard focus
(it is focusable by script but not a Tab stop). Items never receive focus; the highlight is
virtual and exposed through `aria-activedescendant`. Focus is also moved to the menu again when a
new state arrives while a menu is already open, including one for the same source and anchor
(§3.8). Focusing the menu must not scroll anything outside it. The UI harness sends real key
events to whatever has focus, so this is required for its keyboard steps to reach the menu.

**Keys handled** (on `keydown` events that reach the menu element, whether dispatched on it
directly, as `Dialog.test.ts` does, or bubbling up from inside it):

| Key          | Effect                                                                                                                                                                                                                            | Default prevented                                                                  |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| ArrowDown    | Highlight the next item; from the last item wrap to the first; with nothing highlighted, the first item.                                                                                                                          | Yes                                                                                |
| ArrowUp      | Highlight the previous item; from the first item wrap to the last. With nothing highlighted, the current component highlights the second-to-last item when there are two or more items, and the only item when there is one (Q1). | Yes                                                                                |
| Home         | Highlight the first item.                                                                                                                                                                                                         | Yes                                                                                |
| End          | Highlight the last item.                                                                                                                                                                                                          | Yes                                                                                |
| Enter, Space | Choose the highlighted item (§3.5). Nothing highlighted: nothing happens. Auto-repeat: nothing happens.                                                                                                                           | When an item is chosen, and for every auto-repeat; not when nothing is highlighted |
| Escape       | Close (§3.6), including on auto-repeat.                                                                                                                                                                                           | Yes                                                                                |

Modifier keys are ignored for all of these (Shift+ArrowDown moves like ArrowDown).

**Keys not handled.** ArrowLeft, ArrowRight, PageUp, PageDown, Tab, F10, the context-menu key,
letters, digits and every other key do nothing to the menu and keep their default action. There
is no type-ahead: typing a letter does not jump to an item (Q9). Tab therefore moves focus out of
the menu by the browser's normal order while the menu stays open (Q8). In a browser, Space with
nothing highlighted and PageUp/PageDown may scroll the page by default, which would then close the
menu through the scroll rule; this was not observed (Q10).

**Propagation.** The menu does not stop key events from propagating. They continue to ancestors
and the window (with `defaultPrevented` set where the table says so). Global shortcuts ignore
them while a menu is open because `NavigationEffects` checks the store, not because the menu
stops them.

**Focus on close.** The menu does not move focus itself when it closes; `closeContextMenu` does.
Observed behaviour through it: right after the close, focus is on the document body (the menu
element is gone); after the next microtask, focus is back on the control that had focus or was
clicked when the menu was opened (the focusable element around the event target that opened it),
provided no dialog and no other menu is open by then. If that control is no longer in the
document, focus goes to the commit row with the same commit hash, and failing that to the search
field or the first header button. Opening a dialog from an item therefore sends focus into the
dialog, and the original control gets it back when the dialog closes.

### 3.8 One menu at a time, and replacing a menu

- There is only ever one menu: the store holds one state, and the component renders at most one
  element with `role="menu"`.
- **A new state with a different `source`, or a different anchor**, replaces the open menu with a
  fresh one: no highlight, scrolled to its top, placed anew by §3.2, focused, and with new item
  ids. The old menu's listeners are gone.
- **A new state with the same `source` and the same anchor** as the open menu (for example the
  same action button activated from the keyboard again after Tab took focus away) is currently
  treated as an update of the open menu: rows are replaced, the menu is placed and focused again,
  but the highlight keeps its position number (so a different item, or none, may now be
  highlighted) and item ids are kept (Q11).
- The same state value set again causes no change.

### 3.9 Accessibility

- The menu element has `role="menu"` and is focusable by script only (`tabindex="-1"`).
- While an item is highlighted, the menu element's `aria-activedescendant` holds that item's
  `id`. With nothing highlighted, the attribute is absent (not empty).
- Every item has `role="menuitem"` and an `id` that is unique in the whole document, also across
  two menus opened one after the other and against ids used by other components. The format is
  free. Items have no `tabindex`.
- Every separator has `role="separator"`, no `id`, and no explicit orientation (a separator's
  implicit orientation is horizontal).
- The menu currently has no accessible name (`aria-label`, `aria-labelledby`), no
  `aria-orientation` (the implicit value for a menu is vertical), and items have no
  `aria-disabled` (every item is enabled). See Q15.
- Opening controls elsewhere carry `aria-haspopup="menu"`; that is their concern, not the menu's.

### 3.10 DOM contract relied on by other code

| Who                                                                   | What it relies on                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Dialog.test.ts`                                                      | `container.querySelector('[role="menu"]')` finds the menu inside the container the component was rendered into, synchronously after the store is set inside `act()`. `keydown` events created with `bubbles: true` (not cancelable for arrows; cancelable for Enter) and dispatched on that element are handled. The same element stays in place across highlight changes (the test queries it once and keeps sending events to it). Repeated Enter must be `defaultPrevented`. |
| UI harness, helper `menu(text)`                                       | `document.querySelectorAll('[role="menuitem"]')` lists the items; an item is found by `textContent.trim()` equal to the title exactly, and `.click()` on that element chooses it.                                                                                                                                                                                                                                                                                               |
| UI harness, "never confirms a destructive dialog while Enter is held" | The position of the target among `[role="menuitem"]` elements (separators excluded) plus one is the number of ArrowDown presses needed; the presses are real key events sent to the focused element, so the menu must hold focus and start with no highlight. Auto-repeated Enter must not choose anything.                                                                                                                                                                     |
| UI harness, long-menu check                                           | `document.querySelector('[role=menu]')` is the open menu; `document.getElementById(menu.getAttribute('aria-activedescendant'))` resolves to the highlighted item; after an End keydown dispatched on the menu, that item's bottom is at or above the menu's bottom. It then dispatches an Escape keydown on the menu.                                                                                                                                                           |
| UI harness, column-resize steps                                       | They query `[role=separator]` only inside table header cells, so the menu's separators do not collide with them.                                                                                                                                                                                                                                                                                                                                                                |
| `src/webview/lib/focus.ts`                                            | When an item's action opens a dialog, the currently focused element is the menu. Focus capture skips any element inside an element with `role="dialog"` or `role="menu"`, so the focused menu element (or an ancestor of it) must carry `role="menu"`; otherwise the menu itself could be remembered as the place to return focus to.                                                                                                                                           |
| `src/webview/styles.css`                                              | Defines the colour tokens the menu is painted with (§3.11). No rule selects the menu.                                                                                                                                                                                                                                                                                                                                                                                           |

No test, harness step or stylesheet rule depends on the element types used for the menu, its
items or its separators; they find everything by role. There must be no other element with
`role="menu"` or `role="menuitem"` in the webview while a menu is open (currently there is none).

### 3.11 Appearance

Colours and sizes, with the Tailwind utilities (and theme tokens from `styles.css`) that produce
them in the current look. Sizes assume the default root font size of 16 px, which the webview does
not change.

**Menu frame**

| Requirement                                                                                                                                 | Utility / token                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Positioned relative to the viewport                                                                                                         | `fixed`                                                                          |
| Stacking level 20: above the sticky header (also level 20, but earlier in the document), below the dialog backdrop (30) and the dialog (40) | `z-20`                                                                           |
| Width fits the content, capped at viewport width − 16 px; height capped at viewport height − 16 px; scrolls when capped                     | `w-max`, `max-w-[calc(100vw-1rem)]`, `max-h-[calc(100vh-1rem)]`, `overflow-auto` |
| Corner radius 5 px (the theme overrides Tailwind's default for this size)                                                                   | `rounded-md` (`--radius-md: 5px`)                                                |
| 1 px solid border in the neutral line colour `rgba(128, 128, 128, 0.5)`                                                                     | `border`, `border-line` (`--color-line`)                                         |
| Background: VS Code's menu background, falling back to the dropdown background                                                              | `bg-menu` (`--color-menu`)                                                       |
| Text colour: VS Code's menu foreground, falling back to the dropdown foreground                                                             | `text-menu-fg` (`--color-menu-fg`)                                               |
| 4 px padding above the first row and below the last; none at the sides                                                                      | `py-1`                                                                           |
| Medium drop shadow: `0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)`                                                      | `shadow-md`                                                                      |
| No focus outline while the menu holds focus                                                                                                 | `outline-none`                                                                   |
| Invisible (fully transparent) until placed (§3.2)                                                                                           | —                                                                                |

Font family, size and line height are inherited from the page; the menu sets none. There are no
transitions or animations.

**Item**

| Requirement                                                                                                                                                            | Utility / token                                                                            |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| 20 px padding left and right, 6 px top and bottom                                                                                                                      | `px-5`, `py-1.5`                                                                           |
| Pointer cursor                                                                                                                                                         | `cursor-pointer`                                                                           |
| Long titles wrap; overlong words may break                                                                                                                             | `break-words`                                                                              |
| Normal state: no background of its own, menu text colour                                                                                                               | —                                                                                          |
| Highlighted state: background = VS Code's menu selection background (falling back to the list's active selection background); text = the matching selection foreground | `bg-menu-active` (`--color-menu-active`), `text-menu-active-fg` (`--color-menu-active-fg`) |

There is no separate hover style: hovering highlights the item (§3.4), and the highlight is the
only emphasis.

**Separator**

| Requirement                                                                  | Utility / token           |
| ---------------------------------------------------------------------------- | ------------------------- |
| A 1 px horizontal line in the neutral line colour, with no height of its own | `border-t`, `border-line` |
| Inset 10 px from the menu's left and right inner edges                       | `mx-2.5`                  |
| 4 px space above and below                                                   | `my-1`                    |

### 3.12 How the rest of the webview reacts to the store (context, not the menu's job)

These are done by other modules from the store's value. The menu takes part only by clearing the
store (through `closeContextMenu`) whenever it closes.

- `activeSource` in `stores.ts` equals the open menu's `source`. The element whose key matches
  styles itself while its menu is open: a commit row gets the hover background, is marked
  `data-emphasized="true"` and keeps its "…" button visible; a ref label in the graph gets the
  button hover background; a row of the Branches pane gets the same background (unless it is the
  checked-out branch's row, which keeps its own) and keeps its action buttons visible.
- `NavigationEffects` ignores the `/` and Ctrl/Cmd+F shortcuts while a menu is open.
- `hints.ts` dismisses the first-use commit-menu hint when a menu with a `commit:` source opens.
- `focus.ts` postpones returning focus while a menu or dialog is open.
- Opening a dialog clears the store, which removes the menu.

---

## 4. Concrete examples

All observed with the current component under jsdom (§0).

### 4.1 Placement

Positions are the menu's left and top edges in px.

**Window 1024 × 768, menu 200 × 150**

| Anchor         | Placed at      | Why                                                                                                                                |
| -------------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| (10, 20)       | (8, 18)        | Opens right and down, 2 px up-left of the anchor.                                                                                  |
| (150, 220)     | (148, 218)     | Same.                                                                                                                              |
| (0, 0)         | (0, 0)         | Would be (−2, −2); held at 0.                                                                                                      |
| (1, 1)         | (0, 0)         | Would be (−1, −1).                                                                                                                 |
| (2, 2)         | (0, 0)         | Exactly 0.                                                                                                                         |
| (3, 3)         | (1, 1)         |                                                                                                                                    |
| (823, 617)     | (821, 615)     | 823 + 200 = 1023 < 1024 and 617 + 150 = 767 < 768: still right and down; right edge 1021, bottom 765.                              |
| (823.5, 617.5) | (821.5, 615.5) | Not rounded.                                                                                                                       |
| (10.5, 20.25)  | (8.5, 18.25)   | Not rounded.                                                                                                                       |
| (824, 618)     | (626, 470)     | 824 + 200 = 1024 is not less than 1024: opens left; 618 + 150 = 768: opens up. Right edge 826, bottom 620.                         |
| (900, 700)     | (702, 552)     | Left and up.                                                                                                                       |
| (1023, 767)    | (825, 619)     | Left and up; far edges at 1025 and 769, 1 px beyond the window.                                                                    |
| (1000, 40)     | (802, 38)      | Left and down (a keyboard-opened "…" button near the right edge, anchor at its bottom-left).                                       |
| (120, 64)      | (118, 62)      | Keyboard-opened button whose box is left 120, bottom 64 (as in `menu-anchor.test.ts`): the menu overlaps the button's bottom 2 px. |
| (−5, −7)       | (0, 0)         | Anchor left of and above the window.                                                                                               |
| (1024, 768)    | (826, 620)     | Anchor on the window's far corner.                                                                                                 |
| (2000, 900)    | (1802, 752)    | Anchor outside the window: the menu is placed off screen (Q4).                                                                     |

**Window 1024 × 768, menu 1100 × 900 (larger than the window; cannot happen in a browser because
of the size caps, but shows the rule)**

| Anchor      | Placed at |
| ----------- | --------- |
| (500, 300)  | (0, 0)    |
| (0, 0)      | (0, 0)    |
| (1023, 767) | (0, 0)    |

**Window 350 × 400, menu 300 × 380 (a menu nearly as large as a narrow window)**

| Anchor     | Placed at | Why                                                                    |
| ---------- | --------- | ---------------------------------------------------------------------- |
| (20, 10)   | (18, 8)   | 20 + 300 = 320 < 350; 10 + 380 = 390 < 400.                            |
| (48, 18)   | (46, 16)  | 348 < 350; 398 < 400.                                                  |
| (49, 19)   | (47, 17)  | 349 < 350; 399 < 400: the last anchor that still opens right and down. |
| (49, 20)   | (47, 0)   | Right, but 20 + 380 = 400: opens up, 20 − 380 + 2 = −358, held at 0.   |
| (50, 19)   | (0, 17)   | 50 + 300 = 350: opens left, held at 0; still down.                     |
| (50, 20)   | (0, 0)    | Both axes flip and are held at 0.                                      |
| (100, 200) | (0, 0)    | Fits on neither side of the anchor on either axis.                     |
| (340, 390) | (42, 12)  | Left and up; far edges at 342 and 392.                                 |

### 4.2 Interaction sequences

Entries are written as titles, with `—` for a separator. "Highlighted X" means
`aria-activedescendant` names the item whose text is X.

1. **Arrows, Home, End.** Entries `A — B C`. After opening: the menu element is
   `document.activeElement`, no `aria-activedescendant`. ArrowDown ×4 highlights A, B, C, then A
   again (wrap); each is `defaultPrevented`. End highlights C; Home highlights A. ArrowLeft,
   ArrowRight, PageDown, PageUp, Tab, "b", "C", F10 and ContextMenu keydowns leave A highlighted,
   are not `defaultPrevented`, and the menu stays open. Shift+ArrowDown highlights B.
2. **Repeats, then Space.** Continuing: Space with `repeat: true` is prevented, nothing runs, the
   menu stays open. Enter with `repeat: true`: the same. Space (not repeated): B's action runs,
   the store is already `null` inside the action, the keydown is prevented, and the menu is gone.
3. **ArrowUp from nothing.** Entries `A — B C`: ArrowUp highlights B, then A, then C (wrap), then
   B. Entries `A B`: ArrowUp highlights A. Entries `A B C D E`: ArrowUp highlights D. Entries `A`:
   ArrowUp highlights A, and so does every further arrow key.
4. **Enter with nothing highlighted.** Entries `A B`: Enter and Space are not prevented, nothing
   runs, the menu stays open. Ctrl+Enter: the same. After ArrowDown, Ctrl+Enter runs A (prevented;
   menu closed).
5. **Escape.** Entries `A B`: Escape is prevented and the menu closes. Escape with `repeat: true`
   also closes.
6. **Pointer.** Entries `A — B C`. `pointermove` on B highlights B and gives it the active colours.
   `pointerleave` on B and on the menu, and `pointerout`: B stays highlighted. `mouseover` and
   `mousemove` on A: B stays highlighted. ArrowDown then highlights C. A click on the separator,
   and `pointerdown` on the menu or on item A: the menu stays open. A cancelable `contextmenu`
   event on item A: `defaultPrevented`, menu stays open. A click on C: C runs with the store
   already `null`, and the menu is gone.
7. **Click wins over the keyboard highlight.** Entries `A B`: ArrowDown (A highlighted), then a
   click on B: B runs, A does not.
8. **Duplicate titles.** Entries `Same Same` with different actions: two items; ArrowDown ×2 then
   Enter runs the second action.
9. **Dismissal** (entries `A`, one outside button):

   | Event                                                 | Menu afterwards                    |
   | ----------------------------------------------------- | ---------------------------------- |
   | `pointerdown` on the outside button, bubbling or not  | closed                             |
   | `mousedown` on the outside button                     | open                               |
   | `click` on the outside button                         | open                               |
   | `contextmenu` on the outside button                   | closed                             |
   | `scroll` dispatched on `document`                     | closed                             |
   | `scroll` dispatched on the outside button             | closed                             |
   | `scroll` dispatched on the menu                       | open                               |
   | `scroll` dispatched on `window`                       | open, and an error is raised (Q12) |
   | `wheel` on the outside button                         | open                               |
   | `resize` on `window`                                  | closed                             |
   | `blur` on `window`                                    | closed                             |
   | `focusout` from the menu to the outside button        | open                               |
   | `outsideButton.focus()`                               | open                               |
   | `visibilitychange` on `document`                      | open                               |
   | Escape keydown on `document` or on the outside button | open                               |

10. **Focus return.** A focused button opens a menu (entries `A B`) through `openContextMenu` from a
    `contextmenu` event at (50, 60): the menu is placed at (48, 58) and is
    `document.activeElement`. ArrowDown, Enter: A runs; immediately afterwards
    `document.activeElement` is the body; after one microtask it is the button again. The same
    happens after Escape.
11. **Pressing the trigger again.** A button opens its menu on click. Click at (100, 100): menu at
    (98, 98). `pointerdown` on the same button: the menu closes. The following click at (105, 101):
    a new menu at (103, 99). The trigger never toggles the menu off (Q13).
12. **Right-click elsewhere while open.** Row 1's menu is open. A `contextmenu` event on row 2 at
    (20, 20): exactly one menu remains, with row 2's source and entries, and it has focus.
    (Under jsdom, where a synthetic event gives no microtask checkpoint between listeners, Escape
    then returns focus to row 1; see Q14.)
13. **Same source and anchor, new entries.** Entries `A B C`, source "same", anchor (30, 30).
    ArrowDown ×2 (B highlighted). The store is set to entries `X Y Z` with the same source and
    anchor: Y is highlighted and the highlighted id is unchanged. The store is then set with the
    anchor moved to (31, 30): nothing is highlighted. Then a different source: nothing
    highlighted. After focus had been moved to another element, setting a state with the same
    source and anchor puts focus back on the menu.
14. **Shorter list, same source and anchor.** Entries `A B C`, End (C highlighted), then entries
    `A` with the same source and anchor: `aria-activedescendant` still names a third item that no
    longer exists; Enter is not prevented and does nothing (Q11).
15. **Empty menu.** Entries `[]`: an empty frame. ArrowDown: `aria-activedescendant` is set to an
    id that matches no element (it ends in "NaN"), and the keydown is prevented. Enter: nothing,
    not prevented, menu open. On a fresh empty menu, End leaves the attribute absent and Home sets
    it to an id of a first item that does not exist (Q2). Entries `— —`: a frame with two
    separators.
16. **Separators as given.** Entries `— A — — B —` render separator, A, separator, separator, B,
    separator.
17. **Literal titles.** A title of two spaces, `Spaced <b>html</b> ✓`, and a trailing space renders
    that exact text (the angle brackets as text, no bold), with its spaces in `textContent`.
18. **A dialog opens.** With a menu open, `openContentDialog` is called: the menu is gone and the
    dialog is shown.
19. **Keydown propagation.** A `keydown` listener on `window` receives ArrowDown (with
    `defaultPrevented` true), "x" (false) and Escape (true) dispatched on the menu.
20. **Keydown on an item.** An ArrowDown keydown dispatched on an item element (bubbling) is
    handled like one dispatched on the menu.

---

## 5. Non-functional requirements

- **Listener lifetime.** The document and window listeners of §3.6 exist only while a menu is
  shown. They are removed when the menu closes, when it is replaced by a menu for a different
  source or anchor, and when the component unmounts while a menu is open. Observed: opening a
  menu adds `pointerdown` and `contextmenu` on `document` (capture) and `scroll` (capture),
  `resize` and `blur` on `window`; closing removes all five; switching from one menu to another
  removes the first set and adds one new set, so there is never more than one set.
- **One menu at a time** (§3.8). No second menu element may exist even for a moment that a test
  could observe after `act()`.
- **Synchronous under `act()`.** Rendering, placement, focusing and the first highlight change
  are complete when the `act()` call that caused them returns. Nothing depends on timers or
  animation frames. The only asynchronous step, the focus return, belongs to `closeContextMenu`.
- **Store discipline.** The menu never sets the store to an open state, and it clears it only
  through `closeContextMenu`. Everything in §3.12 depends on the store being cleared on every close.
- **Cheap to open.** The menu reads only the `contextMenu` store. Opening, moving the highlight and
  closing must not cause other parts of the webview to re-render beyond what their own
  subscriptions to the store cause (the Branches pane tests count those re-renders; they do not
  render the menu).
- **No visible jump.** The menu is never painted before it is placed (§3.2).
- **No outside scrolling.** Focusing the menu and keeping the highlight visible must not scroll the
  page or any container outside the menu; such a scroll would close the menu.
- **Theme-driven colours.** All colours come from the tokens in §3.11, so the menu follows the
  VS Code theme, light, dark and high contrast alike.

---

## 6. Test coverage

### 6.1 What existing tests already check

- **`tests/webview/components/ui/Dialog.test.ts`**, block "held Enter", is the only Vitest file
  that renders the component. Through it:
  - the menu appears inside its container as `[role="menu"]` once the store is set;
  - ArrowDown keydowns dispatched on that element move the highlight, the first one to the first
    item, and separators are not counted (the target's position is computed among the non-null
    entries of real commit, tag and branch menus, which contain separators);
  - an auto-repeated Enter is `defaultPrevented` and runs nothing, and no dialog opens;
  - a fresh Enter runs the highlighted item exactly once;
  - after that, the destructive dialog it opens has focus on Cancel and ignores repeats (the
    dialog's behaviour, reached through the menu).
    The blocks "accessible names" and "destructive repository confirmations" call entry actions
    directly and do not involve the menu.
- **`tests-ext/ui/history.test.cjs`** (real VS Code): items found by exact trimmed text among
  `[role="menuitem"]` and chosen with `.click()` in many flows; real key events reach the menu, so
  it has focus on open; the first ArrowDown highlights the first item; auto-repeated Enter never
  chooses (test "never confirms a destructive dialog while Enter is held"); End on a long commit
  menu scrolls the highlighted item into the menu's visible area, located through
  `aria-activedescendant`. Escape is dispatched afterwards, but its effect is not asserted.
- **Tests that exercise neighbours, not the component:** `tests/webview/lib/menu-anchor.test.ts`
  (the anchor that `openContextMenu` stores), `tests/webview/lib/menu-actions.test.ts` (the entry
  actions of each menu, called directly), `tests/webview/lib/workflows.test.ts` (focus returns to
  the original control across menu, dialog and close, through the actions),
  `tests/webview/components/commit/CommitRow.test.ts`,
  `tests/webview/components/repository/RefsPane.test.ts` and
  `tests/webview/lib/history-tools.test.ts` (triggers store the right source and entries),
  `tests/webview/components/repository/RefsScale.test.ts` and `RefsTiming.test.ts` (re-render
  counts when the store's source changes), `tests/webview/lib/hints.test.ts` (commit menus dismiss
  the hint).

### 6.2 Gaps, with test cases to add

Common setup for all cases unless stated: jsdom environment, `setupWebviewTest()`, a recording
stub for `Element.prototype.scrollIntoView` (records the element it was called on and its
argument), the component rendered with `act()` into a container attached to `document.body`, and
the store set inside `act()`. For placement cases, additionally stub `getBoundingClientRect` for
the element with `role="menu"` to return the given width and height, and redefine
`window.innerWidth`/`window.innerHeight`. Tear down by clearing the store inside `act()` and
unmounting.

1. **Nothing when closed.** Setup: store `null`. Expect: the container has no child elements and
   no `[role="menu"]` exists in the document.
2. **Rows in order.** Setup: entries `A — B C`. Expect: the menu's children, by role, are
   menuitem "A", separator, menuitem "B", menuitem "C"; three `[role="menuitem"]`, one
   `[role="separator"]`; each item's `textContent` equals its title exactly.
3. **Separators as given** (current behaviour; revisit after Q3). Setup: entries `— A — — B —`.
   Expect: six rows, the four separators in their positions.
4. **Literal titles.** Setup: an entry titled `<b>x</b>`. Expect: the item's `textContent` is
   `<b>x</b>` and it contains no `b` element.
5. **Placement.** Setup: window 1024 × 768, menu 200 × 150. For each anchor in the first table of
   §4.1 (a new source per case), set the store. Expect: the menu's left and top equal the "Placed
   at" column. Repeat with the 350 × 400 window and 300 × 380 menu table, including the boundary
   pairs (49, 19) → (47, 17) and (50, 20) → (0, 0).
6. **Placement under jsdom without stubs.** Setup: no size stub, anchor (0, 0) and (30, 40).
   Expect: (0, 0) and (28, 38).
7. **Focus and no highlight on open.** Setup: another element focused, then entries `A B` set.
   Expect: `document.activeElement` is the `[role="menu"]` element, it has `tabindex="-1"`, and it
   has no `aria-activedescendant` attribute.
8. **ArrowDown, Home, End, wrap, separators.** Setup: entries `A — B C`. Interaction: ArrowDown ×4,
   End, Home. Expect after each: highlighted A, B, C, A, C, A (resolve `aria-activedescendant`
   with `getElementById` and compare text); every keydown `defaultPrevented`; the highlighted item
   has classes `bg-menu-active` and `text-menu-active-fg`, the others do not.
9. **ArrowUp.** Setup: entries `A — B C`. Interaction: ArrowDown (A), ArrowUp. Expect: C (wrap from
   first to last). Separately, from nothing: decide per Q1 (current: B; "last item" would be C).
10. **Choosing with Enter and Space; order.** Setup: entries `A B` whose actions record whether the
    store is `null` when they run. Interaction: ArrowDown ×2, Enter. Expect: B's action ran once,
    saw the store `null`; the keydown was `defaultPrevented`; no `[role="menu"]` remains. Repeat
    with Space.
11. **Enter and Space with nothing highlighted.** Setup: entries `A B`. Interaction: Enter, then
    Space. Expect: neither prevented, no action ran, menu still open.
12. **Auto-repeated Space.** Setup: entries `A`, ArrowDown. Interaction: Space with `repeat: true`.
    Expect: `defaultPrevented`, no action, menu open. (Enter is already covered.)
13. **Escape.** Setup: entries `A`. Interaction: Escape, and in a second menu Escape with
    `repeat: true`. Expect: prevented, store `null`, no menu.
14. **Focus return.** Setup: a focused button whose `contextmenu` handler calls
    `openContextMenu`. Interaction: dispatch `contextmenu` at (50, 60), then Escape, then await a
    microtask. Expect: the menu was at (48, 58) and focused; afterwards the button is
    `document.activeElement`. Repeat choosing an item with ArrowDown and Enter instead of Escape.
15. **Pointer highlight.** Setup: entries `A — B C`. Interaction: `pointermove` on B; then
    `pointerleave` on the menu; then ArrowDown. Expect: B highlighted, still B, then C.
16. **Click chooses the clicked item.** Setup: entries `A B`, ArrowDown (A). Interaction:
    `click()` on B. Expect: B ran, A did not; menu closed.
17. **Inside interactions keep the menu.** Setup: entries `A — B`. Interaction: click on the
    separator; `pointerdown` on the menu and on A; cancelable `contextmenu` on A. Expect: menu
    open after each; the `contextmenu` event is `defaultPrevented`; no action ran.
18. **Outside press closes without swallowing it.** Setup: entries `A`, an outside button with a
    `pointerdown` listener. Interaction: cancelable `pointerdown` on the button, once bubbling and
    once not. Expect: menu closed; the button's listener ran; the event is not
    `defaultPrevented`.
19. **Right-click elsewhere replaces the menu.** Setup: two buttons whose `contextmenu` handlers
    open menus with different sources; open the first. Interaction: `contextmenu` on the second.
    Expect: exactly one `[role="menu"]`, the store holds the second source, the menu has focus and
    nothing is highlighted.
20. **Scroll.** Setup: entries `A`. Interaction: `scroll` on `document`; in a new menu, `scroll` on
    an outside element; in a new menu, `scroll` on the menu. Expect: closed, closed, open.
21. **Resize and blur.** Setup: entries `A`. Interaction: `resize` on `window`; in a new menu,
    `blur` on `window`. Expect: closed both times.
22. **Focus leaving does not close** (current behaviour; revisit after Q8). Setup: entries `A`.
    Interaction: focus an outside button; dispatch `focusout` from the menu. Expect: menu open.
23. **Listener cleanup.** Setup: a menu open; unmount the component with the store still set.
    Interaction: dispatch `resize`, `blur`, `pointerdown` on the body, and `scroll` on `document`.
    Expect: the store still holds the state (no listener closed it) and nothing throws.
    Alternatively spy on `document`/`window` `addEventListener`/`removeEventListener` and check
    that every listener added for a menu is removed on close and on replacement.
24. **Highlight kept visible.** Setup: entries `A B C`. Interaction: ArrowDown, End, then
    `pointermove` on B. Expect: the scroll stub was called on A, C and B in that order, with the
    "nearest" block alignment (or, if the replacement scrolls differently, that the menu's
    `scrollTop` changes accordingly in a layout-capable environment).
25. **Ids and ARIA.** Setup: open entries `A B`, note the item ids; open another source with `A B`.
    Expect: every item has an id, all ids in both menus differ, `document.getElementById` of each
    id returns its item, separators have `role="separator"` and no id, the menu has `role="menu"`.
26. **Replacement resets.** Setup: entries `A B C`, source S, anchor (30, 30), ArrowDown ×2.
    Interaction: set entries `X Y Z` with anchor (31, 30). Expect: no `aria-activedescendant`.
    With the same source and anchor instead: decide per Q11 (current: Y highlighted).
27. **Opening gesture leaves the menu open.** Setup: render the component and a button whose
    `click` handler calls `openContextMenu`. Interaction: `button.click()` inside `act()`. Expect:
    one open menu. Repeat with a row whose `contextmenu` handler opens the menu.
28. **Pressing the trigger again** (current behaviour; revisit after Q13). Setup: the button from
    case 27 with its menu open. Interaction: `pointerdown` then `click` on the button. Expect: the
    menu closes on `pointerdown` and a new one is open after the click.
29. **A dialog closes the menu.** Setup: entries `A`. Interaction: `openContentDialog("x", "y")`
    inside `act()`. Expect: no `[role="menu"]`, the dialog is shown.
30. **Empty menu** (after Q2 is decided). Setup: entries `[]`. Interaction: ArrowDown, Home, End,
    Enter. Expect per the decision; at minimum no `aria-activedescendant` that points at a
    non-existent element, and nothing thrown.

### 6.3 Notes for writing these tests

- jsdom has no `scrollIntoView`; `Dialog.test.ts` installs a no-op in `beforeAll`. A replacement
  that calls it without a guard will throw in any new test file that forgets the stub.
- jsdom reports every size as 0, so placement tests must stub `getBoundingClientRect` on the menu
  element (§2).
- Keyboard events in the existing tests are created with `bubbles: true`; arrows are not
  cancelable there, so do not assert `defaultPrevented` on events that were not created
  cancelable.
- Pointer highlighting must be tested with `pointermove`; `mousemove` does not highlight.
- Synthetic events dispatched from a test give no microtask checkpoint between listeners, unlike
  real user input. Focus-return tests should await a microtask after the close.

---

## 7. Questions

Each states the current behaviour and what may be intended. None is decided here.

1. **ArrowUp with nothing highlighted.** It highlights the second-to-last item (B of `A B C`, D of
   `A B C D E`, A of `A B`), and the only item of a one-item menu. Menus usually go to the last
   item. Intended: probably the last item.
2. **Menus with no items.** With `[]` or only separators, an empty frame is shown; ArrowDown and
   ArrowUp set `aria-activedescendant` to an id that matches nothing (ending in "NaN"), Home to an
   id of a first item that does not exist, End removes it, and Enter does nothing. No caller passes
   such a list today. Intended: perhaps no menu at all, or keys that leave the highlight empty.
3. **Separator clean-up.** Leading, trailing and consecutive separators are drawn as given. Menus
   built from optional groups can produce them; no current caller does. Should the menu drop
   separators at the ends and merge runs of them?
4. **No right/bottom clamp.** A menu that opens left or up ends 2 px past its anchor, so an anchor
   on the last pixel sticks out by up to 2 px; an anchor outside the window (keyboard-opened
   control partly off screen) can put the menu partly or wholly off screen ((2000, 900) in
   1024 × 768 → (1802, 752)). Should the menu always be kept fully inside the window?
5. **Keyboard-opened menus that open upward cover their control.** The anchor is the control's
   bottom-left corner, so an upward menu ends 2 px below the control's bottom edge and hides it.
   Should an upward menu end at the control's top instead? (The anchor comes from
   `openContextMenu`; the menu only sees a point.)
6. **All-or-nothing flipping.** A menu that is 1 px too tall for the space below jumps above the
   anchor, and if it does not fit there either it is pinned to the top ((49, 19) → (47, 17), but
   (49, 20) → (47, 0) in the 350 × 400 example). Is shifting the menu just enough to fit
   preferred over flipping?
7. **Where the pointer lands.** The 2 px offset puts the anchor inside the menu's frame, within
   the 1 px border and 4 px top padding, so no item is under the pointer when the menu appears
   and nothing is highlighted until the pointer moves. Is that the intended relation between the
   pointer and the first item, or should the first item start under the pointer (which would take
   an offset of at least 6 px on the vertical axis)?
8. **Tab.** Not handled: focus leaves the menu, the menu stays open with its highlight, and keys no
   longer reach it; only a pointer press, scroll, resize, blur or another menu closes it. Common
   menu practice closes the menu on Tab (and on focus leaving it).
9. **Type-ahead.** Letters do nothing. Should typing a letter move the highlight to the next item
   starting with it?
10. **Space, PageUp and PageDown with nothing to do.** Space with nothing highlighted and
    PageUp/PageDown keep their default action. In a browser that may scroll the page behind the
    menu, which then closes it through the scroll rule (inferred, not observed). Should Space always
    be swallowed while the menu has focus?
11. **Same source and anchor.** A new state with the same source and anchor keeps the highlight by
    position and keeps item ids, so a different item becomes highlighted when the entries changed,
    and a shorter list leaves `aria-activedescendant` pointing at nothing (Enter then does nothing).
    Should every new state start fresh?
12. **Scroll event targeted at the window.** A `scroll` event whose target is the `window` object
    raises an error in the close check and leaves the menu open. Browsers target page scrolls at
    the document, so this only happens with synthetic events. Should such an event count as
    outside and close the menu?
13. **The trigger does not toggle.** Pressing the "…" button of an open menu closes it on
    `pointerdown` and opens a new one on `click`, at the new pointer position. Should a second
    press on the trigger close the menu instead?
14. **Focus return after replacing a menu with a right-click.** Returning focus is the job of
    `closeContextMenu` and `focus.ts`, but it shows through the menu: under jsdom, where a synthetic
    `contextmenu` event gives no microtask checkpoint between listeners, closing the second menu
    returns focus to the first menu's opener. With real input, a checkpoint runs after the menu's
    capture listener, so focus should go to the second opener (inferred, not observed). A new menu
    opened from the keyboard while another is open (after Tab, Q8) replaces it without a close and
    also keeps the first opener. Should the most recent opener always win?
15. **Accessible name and pointer-leave.** The menu has no accessible name, and the highlight stays
    on the last hovered item after the pointer leaves the menu (Enter then chooses it). Should the
    menu be labelled (for example after the control that opened it), and should leaving the menu
    with the pointer clear the highlight?

---

## 8. Decisions on §7 (from the project maintainer's side)

These decisions replace the "current behaviour" wherever they differ. Build to these, and test the decided behaviour. The utility names in §3.11 state the required look; choose and order your own classes to reach it.

- **Q1: ArrowUp from nothing goes to the last item.**
- **Q2: menus without items show an empty frame, and keys leave the highlight empty.** With no items (an empty list, or only separators), the arrow keys, Home and End highlight nothing and set no `aria-activedescendant`; Enter and Space do nothing; Escape and Tab still close. Nothing throws.
- **Q3: tidy separators.** Separators at the start or the end of the list are not drawn, and a run of consecutive separators is drawn as one. Items are unaffected.
- **Q4: keep the menu inside the window.** After the direction on each axis is chosen as in §3.2, the menu is moved, if needed, so that it lies entirely inside the window: its right [bottom] edge no further than the window's width [height] and its left [top] edge no less than 0. With the size caps of §3.3 it always fits. For example, anchor (2000, 900) in a 1024 × 768 window with a 200 × 150 menu places it at (824, 618).
- **Q5: out of scope.** The anchor comes from `openContextMenu`.
- **Q6: keep.** The direction flips as a whole; Q4 then keeps it inside the window.
- **Q7: keep.** The 2 px offset stays.
- **Q8: Tab closes the menu.** Tab and Shift+Tab close the menu exactly as Escape does: default prevented, closed through `closeContextMenu`, which returns focus to the opener.
- **Q9: keep.** No type-ahead.
- **Q10: Space is always swallowed.** Space's default action is always prevented while the menu has focus, whether or not an item is highlighted. PageUp and PageDown stay unhandled.
- **Q11: every new state starts fresh.** A store value that is a different object from the one shown is a new menu: no highlight, new item ids, placed and focused anew, even when its source and anchor are the same. Setting the same object again changes nothing.
- **Q12: never throw.** A `scroll` event whose target is not a node inside the menu, including the window object itself, closes the menu.
- **Q13: out of scope.** Toggling belongs to the trigger.
- **Q14: out of scope.** Focus return belongs to `closeContextMenu` and `focus.ts`.
- **Q15: keep.** No accessible name, and the highlight stays after the pointer leaves.
