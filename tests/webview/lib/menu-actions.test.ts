// @vitest-environment jsdom

import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { GitCommitNode, GitRef } from "@/backend/types";
import type { DialogState } from "@/webview/types";

import { vscodeApi } from "@tests/webview/setup";
import { setupWebviewTest } from "@tests/webview/test-utils";

let menus: typeof import("@/webview/lib/menus");
let stores: typeof import("@/webview/lib/stores");

const hash = "c".repeat(40);
const commit: GitCommitNode = {
  hash,
  parentHashes: ["p".repeat(40)],
  author: "Author",
  email: "author@example.com",
  date: 0,
  message: "Message",
  refs: []
};
const tag: GitRef = { type: "tag", name: "v1", hash };
const branch: GitRef = { type: "head", name: "topic", hash };
const remote: GitRef = { type: "remote", name: "origin/topic", hash };

beforeAll(async () => {
  setupWebviewTest();
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText: async () => {} },
    configurable: true
  });
  menus = await import("@/webview/lib/menus");
  stores = await import("@/webview/lib/stores");
});

beforeEach(() => {
  vscodeApi.postMessage.mockClear();
  stores.dialog.value = null;
  stores.selectedRepo.value = "/repo";
});

type Entries = ReturnType<typeof menus.commitMenu>;

/** Choose an entry and return the form it opens. */
function open(entries: Entries, title: string) {
  const entry = entries.find((item) => item?.title === title);
  expect(entry, title).toBeDefined();
  entry!.onClick();
  const form = stores.dialog.value;
  if (form?.kind !== "form") {
    throw new Error(`${title} did not open a form`);
  }
  return form as Extract<DialogState, { kind: "form" }>;
}

function lastRequest() {
  return vscodeApi.postMessage.mock.lastCall?.[0] as Record<string, unknown>;
}

describe("commit menu dialogs", () => {
  const entries = () => menus.commitMenu(commit, new Map());

  it("adds a lightweight or an annotated tag", () => {
    open(entries(), "addTag…").onSubmit(["v2", "lightweight", ""]);
    expect(lastRequest()).toEqual({
      command: "addTag",
      repo: "/repo",
      requestId: expect.any(String),
      tagName: "v2",
      commitHash: hash,
      lightweight: true,
      message: ""
    });
    open(entries(), "addTag…").onSubmit(["v3", "annotated", "Release"]);
    expect(lastRequest()).toMatchObject({ tagName: "v3", lightweight: false, message: "Release" });
  });

  it("creates a branch, checks out, merges, and resets with the chosen options", () => {
    open(entries(), "createBranch…").onSubmit(["feature"]);
    expect(lastRequest()).toMatchObject({
      command: "createBranch",
      branchName: "feature",
      commitHash: hash
    });

    open(entries(), "checkout…").onSubmit([]);
    expect(lastRequest()).toMatchObject({ command: "checkoutCommit", commitHash: hash });

    const merge = open(entries(), "merge…");
    expect(merge.inputs[0]).toMatchObject({ kind: "checkbox", value: true });
    merge.onSubmit([false]);
    expect(lastRequest()).toMatchObject({
      command: "mergeCommit",
      commitHash: hash,
      createNewCommit: false
    });

    for (const resetMode of ["soft", "hard"]) {
      const reset = open(entries(), "reset…");
      expect(reset.inputs[0]).toMatchObject({ kind: "select", value: "mixed" });
      expect(reset.destructive).toBe(true);
      reset.onSubmit([resetMode]);
      expect(lastRequest()).toMatchObject({
        command: "resetToCommit",
        commitHash: hash,
        resetMode
      });
    }
  });

  it("opens the history tools for the commit", () => {
    for (const title of [
      "interactiveRebase…",
      "createFixupMenu…",
      "compareWith",
      "bisectChooseGood",
      "bisectChooseBad",
      "copyCommitHash"
    ]) {
      vscodeApi.postMessage.mockClear();
      stores.dialog.value = null;
      entries()
        .find((item) => item?.title === title)!
        .onClick();
      expect(
        vscodeApi.postMessage.mock.calls.length > 0 || stores.dialog.value !== null,
        title
      ).toBe(true);
    }
  });
});

describe("tag menu dialogs", () => {
  const entries = () => menus.refMenu(tag, false);

  it("deletes the tag after a destructive confirmation", () => {
    const form = open(entries(), "deleteTag…");
    expect(form.destructive).toBe(true);
    form.onSubmit([]);
    expect(lastRequest()).toMatchObject({ command: "deleteTag", tagName: "v1" });
  });

  it("loads the remotes before pushing or deleting the tag on a remote", () => {
    for (const title of ["pushTag…", "deleteRemoteTag…"]) {
      entries()
        .find((item) => item?.title === title)!
        .onClick();
      expect(lastRequest()).toMatchObject({ command: "loadRemotes", repo: "/repo" });
    }
  });
});

describe("local branch menu dialogs", () => {
  const entries = (head = false) => menus.refMenu(branch, head);

  it("renames, force-deletes, merges, and checks out the branch", () => {
    open(entries(), "renameBranch…").onSubmit(["renamed"]);
    expect(lastRequest()).toMatchObject({
      command: "renameBranch",
      oldName: "topic",
      newName: "renamed"
    });

    const remove = open(entries(), "deleteBranch…");
    expect(remove.inputs[0]).toMatchObject({ kind: "checkbox", value: false });
    expect(remove.destructive).toBe(true);
    remove.onSubmit([true]);
    expect(lastRequest()).toMatchObject({
      command: "deleteBranch",
      branchName: "topic",
      forceDelete: true
    });

    open(entries(), "merge…").onSubmit([false]);
    expect(lastRequest()).toMatchObject({
      command: "mergeBranch",
      branchName: "topic",
      createNewCommit: false
    });

    entries()
      .find((item) => item?.title === "checkoutBranch")!
      .onClick();
    expect(lastRequest()).toMatchObject({
      command: "checkoutBranch",
      branchName: "topic",
      remoteBranch: null
    });
  });

  it("offers neither checkout, merge, nor delete for the checked-out branch", () => {
    const titles = entries(true).map((item) => item?.title);
    expect(titles).not.toContain("checkoutBranch");
    expect(titles).not.toContain("merge…");
    expect(titles).not.toContain("deleteBranch…");
    expect(titles).toContain("pullBranch…");
  });

  it("opens the branch tools", () => {
    for (const [title, head] of [
      ["focusThisBranch", false],
      ["configureUpstream…", false],
      ["addWorktree…", false],
      ["rebaseOnto…", false],
      ["pushBranch…", false],
      ["pullBranch…", true],
      ["compareWith", false],
      ["copyBranchName", false]
    ] as const) {
      vscodeApi.postMessage.mockClear();
      stores.dialog.value = null;
      const focus = stores.branchFocusTarget?.value;
      entries(head)
        .find((item) => item?.title === title)!
        .onClick();
      expect(
        vscodeApi.postMessage.mock.calls.length > 0 ||
          stores.dialog.value !== null ||
          stores.branchFocusTarget?.value !== focus,
        title
      ).toBe(true);
    }
  });
});

describe("remote branch menu", () => {
  it("loads the remotes before checkout, deletion, or fetch", () => {
    for (const title of ["checkoutBranch…", "deleteRemoteBranch…", "fetch…"]) {
      vscodeApi.postMessage.mockClear();
      menus
        .refMenu(remote, false)
        .find((item) => item?.title === title)!
        .onClick();
      expect(lastRequest(), title).toMatchObject({ command: "loadRemotes", repo: "/repo" });
    }
  });

  it("opens the rebase, worktree, compare, focus, and copy tools", () => {
    for (const title of [
      "rebaseOnto…",
      "addWorktree…",
      "compareWith",
      "focusThisBranch",
      "copyBranchName"
    ]) {
      vscodeApi.postMessage.mockClear();
      stores.dialog.value = null;
      const focus = stores.branchFocusTarget?.value;
      menus
        .refMenu(remote, false)
        .find((item) => item?.title === title)!
        .onClick();
      expect(
        vscodeApi.postMessage.mock.calls.length > 0 ||
          stores.dialog.value !== null ||
          stores.branchFocusTarget?.value !== focus,
        title
      ).toBe(true);
    }
  });
});
