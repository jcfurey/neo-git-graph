import { contextMenu, dialog } from "@/webview/lib/stores";

let anchor: HTMLElement | null = null;
let hash: string | null = null;

/** Keep the original graph/control anchor throughout menu → form → result transitions. */
export function captureFocus(target?: EventTarget | null) {
  if (anchor) {
    return;
  }
  const element = target instanceof HTMLElement ? target : document.activeElement;
  if (!(element instanceof HTMLElement) || element.closest('[role="dialog"], [role="menu"]')) {
    return;
  }
  anchor = element.closest<HTMLElement>("button, input, select, textarea, [tabindex]") ?? element;
  hash = anchor.closest<HTMLElement>("[data-commit-hash]")?.dataset.commitHash ?? null;
}

export function restoreFocus() {
  // A synchronous dialog transition retains its anchor; a real dismissal restores it.
  queueMicrotask(() => {
    if (dialog.value || contextMenu.value || !anchor) {
      return;
    }
    const target = anchor.isConnected
      ? anchor
      : hash
        ? [...document.querySelectorAll<HTMLElement>("[data-commit-hash]")].find(
            (row) => row.dataset.commitHash === hash
          )
        : null;
    const focus = target ?? document.querySelector<HTMLElement>("[data-history-search]");
    anchor = null;
    hash = null;
    focus?.focus({ preventScroll: true });
  });
}
