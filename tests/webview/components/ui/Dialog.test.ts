// @vitest-environment jsdom

import { Fragment, h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { GitCommitNode, GitRef } from "@/backend/types";

import { vscodeApi } from "@tests/webview/setup";
import { setupWebviewTest } from "@tests/webview/test-utils";

let Dialog: typeof import("@/webview/components/ui/Dialog").Dialog;
let ContextMenu: typeof import("@/webview/components/ui/ContextMenu").ContextMenu;
let menus: typeof import("@/webview/lib/menus");
let stores: typeof import("@/webview/lib/stores");
let container: HTMLDivElement;

const commit: GitCommitNode = {
  hash: "c".repeat(40),
  parentHashes: ["p".repeat(40)],
  author: "Author",
  email: "author@example.com",
  date: 0,
  message: "Message",
  refs: []
};
const tag: GitRef = { type: "tag", name: "v1", hash: commit.hash };
const branch: GitRef = { type: "head", name: "topic", hash: commit.hash };

beforeAll(async () => {
  setupWebviewTest();

  ({ Dialog } = await import("@/webview/components/ui/Dialog"));
  ({ ContextMenu } = await import("@/webview/components/ui/ContextMenu"));
  menus = await import("@/webview/lib/menus");
  stores = await import("@/webview/lib/stores");
});

beforeEach(() => {
  vscodeApi.postMessage.mockClear();
  stores.selectedRepo.value = "repo";
  container = document.createElement("div");
  document.body.append(container);
  act(() => render(h(Fragment, null, h(ContextMenu, null), h(Dialog, null)), container));
});

afterEach(() => {
  act(() => {
    stores.dialog.value = null;
    stores.contextMenu.value = null;
  });
  render(null, container);
  container.remove();
});

function pressEnter(target: Element, repeat: boolean) {
  const event = new KeyboardEvent("keydown", {
    key: "Enter",
    repeat,
    bubbles: true,
    cancelable: true
  });
  act(() => {
    target.dispatchEvent(event);
  });
  return event;
}

/** Choose a menu entry with the keyboard, then keep Enter held down. */
function holdEnterOn(entries: ReturnType<typeof menus.commitMenu>, title: string) {
  act(() => {
    stores.contextMenu.value = { x: 0, y: 0, entries, source: "source" };
  });
  const menu = container.querySelector<HTMLElement>('[role="menu"]')!;
  const index = entries
    .filter((entry) => entry !== null)
    .findIndex((entry) => entry.title === title);
  expect(index).toBeGreaterThanOrEqual(0);
  for (let step = 0; step <= index; step++) {
    act(() => {
      menu.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    });
  }

  // Only a fresh press runs the item. A held key repeats on whatever has focus next.
  pressEnter(menu, true);
  expect(stores.dialog.value).toBeNull();
  pressEnter(menu, false);
  return [1, 2, 3].map(() => pressEnter(document.activeElement!, true));
}

describe("held Enter", () => {
  it.each([
    ["deleteTag…", () => menus.refMenu(tag, false)],
    ["deleteBranch…", () => menus.refMenu(branch, false)],
    ["reset…", () => menus.commitMenu(commit, new Map())]
  ])("does not confirm %s", (title, entries) => {
    const repeats = holdEnterOn(entries(), title);

    expect(stores.dialog.value).toMatchObject({ kind: "form", destructive: true });
    expect(document.activeElement?.hasAttribute("data-dialog-cancel")).toBe(true);
    expect(repeats.every((event) => event.defaultPrevented)).toBe(true);
    expect(vscodeApi.postMessage).not.toHaveBeenCalled();

    // A fresh press still reaches the dialog's controls.
    const submit = container.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    submit.focus();
    expect(pressEnter(submit, false).defaultPrevented).toBe(false);
    act(() => submit.click());
    expect(vscodeApi.postMessage).toHaveBeenCalledTimes(1);
  });

  it("keeps focus on the action of other dialogs", () => {
    const repeats = holdEnterOn(menus.refMenu(tag, false), "pushTag…");

    expect(stores.dialog.value).toMatchObject({ kind: "form", destructive: false });
    expect(document.activeElement?.getAttribute("type")).toBe("submit");
    expect(repeats.every((event) => event.defaultPrevented)).toBe(true);
  });

  it("does not run a menu item on a repeated Enter", () => {
    const onClick = vi.fn();
    act(() => {
      stores.contextMenu.value = {
        x: 0,
        y: 0,
        entries: [{ title: "Run", onClick }],
        source: "source"
      };
    });
    const menu = container.querySelector<HTMLElement>('[role="menu"]')!;
    act(() => {
      menu.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    });

    expect(pressEnter(menu, true).defaultPrevented).toBe(true);
    expect(onClick).not.toHaveBeenCalled();
    pressEnter(menu, false);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe("accessible names", () => {
  const mergeCommit: GitCommitNode = { ...commit, parentHashes: ["a".repeat(40), "b".repeat(40)] };

  it.each([
    ["reset…", () => menus.commitMenu(commit, new Map())],
    ["cherryPick…", () => menus.commitMenu(mergeCommit, new Map())],
    ["revert…", () => menus.commitMenu(mergeCommit, new Map())]
  ])("names the unlabelled choice of %s by the dialog message", (title, entries) => {
    act(() =>
      entries()
        .find((entry) => entry?.title === title)!
        .onClick()
    );

    const select = container.querySelector("select")!;
    const name = document.getElementById(select.getAttribute("aria-labelledby") ?? "");
    expect(name?.textContent?.trim()).toBeTruthy();
    expect(container.querySelector('[role="dialog"]')?.contains(name)).toBe(true);
  });
});
