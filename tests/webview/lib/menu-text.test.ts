// @vitest-environment jsdom

import { Fragment, h, render } from "preact";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { GitCommitNode, GitRef } from "@/backend/types";
import type { LocalizedStrings } from "@/old-extension/l10n/webviewL10n";
import type { RpcRequest, RpcResponse } from "@/types";
import { Explain } from "@/webview/components/ui/Explain";
import type { ContextMenuEntry } from "@/webview/types";

import { vscodeApi } from "@tests/webview/setup";
import { setupWebviewTest } from "@tests/webview/test-utils";

/**
 * The webview's strings in their English source form, merged as the extension merges them. The
 * table imports `vscode`, which a DOM test cannot load, so its calls are read from the source.
 */
async function englishStrings() {
  const files = ["repositoryL10n", "historyL10n", "workflowL10n", "webviewL10n"];
  const modules = await Promise.all(
    files.map((file) => import(/* @vite-ignore */ `@/old-extension/l10n/${file}.ts?raw`))
  );
  const strings: Record<string, string> = {};
  for (const { default: source } of modules as Array<{ default: string }>) {
    for (const match of source.matchAll(/(\w+): vscode\.l10n\.t\(\s*("(?:[^"\\]|\\.)*")/g)) {
      strings[match[1]!] = JSON.parse(match[2]!) as string;
    }
  }
  return strings as LocalizedStrings;
}

let menus: typeof import("@/webview/lib/menus");
let stores: typeof import("@/webview/lib/stores");

const hash = "0123456789abcdef0123456789abcdef01234567";
const commit: GitCommitNode = {
  hash,
  parentHashes: ["a".repeat(40)],
  author: "Author",
  email: "author@example.com",
  date: 0,
  message: "Message",
  refs: []
};
const topic: GitRef = { type: "head", name: "topic", hash };
const main: GitRef = { type: "head", name: "main", hash };
const remote: GitRef = { type: "remote", name: "origin/topic", hash };
const tag: GitRef = { type: "tag", name: "v1.0", hash };

beforeAll(async () => {
  setupWebviewTest({ dispatchMessages: true });
  Object.defineProperty(window, "l10n", { value: await englishStrings(), configurable: true });
  menus = await import("@/webview/lib/menus");
  stores = await import("@/webview/lib/stores");
});

beforeEach(() => {
  vscodeApi.postMessage.mockClear();
  stores.dialog.value = null;
  stores.selectedRepo.value = "/repo";
});

function titles(entries: Array<ContextMenuEntry>) {
  return entries.map((entry) => entry?.title ?? "---").join(" | ");
}

function markup(children: Parameters<typeof h>[2]) {
  const container = document.createElement("div");
  render(h(Fragment, null, children), container);
  return container.innerHTML;
}

describe("English titles", () => {
  it.each([0, 1, 2])("lists the commit menu of a commit with %i parents", (count) => {
    const parentHashes = ["a".repeat(40), "b".repeat(40)].slice(0, count);
    expect(titles(menus.commitMenu({ ...commit, parentHashes }, new Map()))).toBe(
      "Add Tag… | Create Branch… | --- | Checkout… | Cherry Pick… | Revert… | --- | " +
        "Merge into current branch… | Reset current branch to this Commit… | --- | " +
        "Edit commits after this (interactive rebase)… | " +
        "Fold staged changes into this commit (fixup)… | Compare with… | " +
        "Use as Good Bisect Commit | Use as Bad Bisect Commit | Copy Commit Hash to Clipboard"
    );
  });

  it("lists the menu of a branch that is not checked out", () => {
    expect(titles(menus.refMenu(topic, false))).toBe(
      "Focus this branch | Compare with… | --- | Configure Upstream… | Create Worktree… | " +
        "Move the current branch onto this (rebase)… | Checkout Branch | Push Branch… | " +
        "Rename Branch… | Delete Branch… | Merge into current branch… | --- | " +
        "Copy Branch Name to Clipboard"
    );
  });

  it("lists the menu of the checked-out branch", () => {
    expect(titles(menus.refMenu(main, true))).toBe(
      "Focus this branch | Compare with… | --- | Configure Upstream… | Create Worktree… | " +
        "Push Branch… | Pull Branch… | Rename Branch… | --- | Copy Branch Name to Clipboard"
    );
  });

  it.each([false, true])("lists the menus of remote branches and tags (%s)", (isHead) => {
    expect(titles(menus.refMenu(remote, isHead))).toBe(
      "Focus this branch | Compare with… | --- | Move the current branch onto this (rebase)… | " +
        "Create Worktree… | Delete Remote Branch… | Fetch… | Checkout Branch… | --- | " +
        "Copy Branch Name to Clipboard"
    );
    expect(titles(menus.refMenu({ ...remote, name: "origin/HEAD" }, isHead))).toBe(
      "Compare with… | --- | Move the current branch onto this (rebase)… | Create Worktree… | " +
        "Fetch… | --- | Copy Branch Name to Clipboard"
    );
    expect(titles(menus.refMenu(tag, isHead))).toBe(
      "Compare with… | --- | Delete Tag… | Push Tag… | Delete Remote Tag… | --- | " +
        "Copy Tag Name to Clipboard"
    );
  });
});

describe("English questions", () => {
  const explain = (text: string) => markup(h(Explain, null, text));
  const hashName = "<b><i>01234567</i></b>";
  const current = "<b>the current branch</b>";

  it.each<[string, () => Array<ContextMenuEntry>, string]>([
    ["Add Tag…", () => menus.commitMenu(commit, new Map()), `Add tag to commit ${hashName}`],
    [
      "Create Branch…",
      () => menus.commitMenu(commit, new Map()),
      `Enter the name of the branch ${hashName}`
    ],
    [
      "Checkout…",
      () => menus.commitMenu(commit, new Map()),
      `Are you sure you want to checkout commit ${hashName}? This will result in a 'detached HEAD' state.` +
        explain(
          "You can build and test here. Create a branch from this commit to keep new work, or check out a branch to return."
        )
    ],
    [
      "Cherry Pick…",
      () => menus.commitMenu(commit, new Map()),
      `Are you sure you want to cherry pick commit ${hashName}?`
    ],
    [
      "Revert…",
      () => menus.commitMenu(commit, new Map()),
      `Are you sure you want to revert commit ${hashName}?`
    ],
    [
      "Merge into current branch…",
      () => menus.commitMenu(commit, new Map()),
      `Are you sure you want to merge ${hashName} into ${current}?`
    ],
    [
      "Reset current branch to this Commit…",
      () => menus.commitMenu(commit, new Map()),
      `Are you sure you want to reset ${current} to commit ${hashName}?` +
        explain(
          "Soft and mixed keep your files. Hard discards uncommitted changes. The previous position stays in the reflog, so Recover lost commits can bring it back."
        )
    ],
    [
      "Rename Branch…",
      () => menus.refMenu(topic, false),
      "Enter the new name for the branch <b><i>topic</i></b>:"
    ],
    [
      "Delete Branch…",
      () => menus.refMenu(topic, false),
      "Are you sure you want to delete the branch <b><i>topic</i></b>?" +
        explain(
          "The commits stay in the repository for a while. Recover lost commits lists the branch tip if you need it back."
        )
    ],
    [
      "Merge into current branch…",
      () => menus.refMenu(topic, false),
      `Are you sure you want to merge <b><i>topic</i></b> into ${current}?`
    ],
    [
      "Delete Tag…",
      () => menus.refMenu(tag, false),
      "Are you sure you want to delete the tag <b><i>v1.0</i></b>?"
    ]
  ])("asks %s with emphasis on the names", (title, entries, expected) => {
    entries()
      .find((entry) => entry?.title === title)!
      .onClick();
    const form = stores.dialog.value;
    if (form?.kind !== "form") {
      throw new Error(`${title} did not open a form`);
    }
    expect(markup(form.message)).toBe(expected);
  });
});

describe("English copy failures", () => {
  it.each<[() => Array<ContextMenuEntry>, string, string]>([
    [
      () => menus.commitMenu(commit, new Map()),
      "Copy Commit Hash to Clipboard",
      "Unable to Copy Commit Hash to Clipboard"
    ],
    [
      () => menus.refMenu(remote, false),
      "Copy Branch Name to Clipboard",
      "Unable to Copy Branch Name to Clipboard"
    ],
    [
      () => menus.refMenu(tag, false),
      "Copy Tag Name to Clipboard",
      "Unable to Copy Tag Name to Clipboard"
    ]
  ])("reports a failed %#: %s", async (entries, title, message) => {
    entries()
      .find((entry) => entry?.title === title)!
      .onClick();
    const request = vscodeApi.postMessage.mock.calls[0]?.[0] as RpcRequest<"clipboard.copy">;
    const response = {
      kind: "rpc.response",
      id: request.id,
      success: true,
      result: false
    } satisfies RpcResponse<"clipboard.copy">;
    window.dispatchEvent(new MessageEvent("message", { data: response }));

    await vi.waitFor(() => {
      expect(stores.dialog.value).toMatchObject({ kind: "error", message });
    });
  });
});
