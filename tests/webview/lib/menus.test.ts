// @vitest-environment jsdom

import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { GitCommitNode, GitRef } from "@/backend/types";
import { handleLoadRemotes } from "@/webview/lib/remote-actions";
import type { ContextMenuEntry } from "@/webview/types";

import { vscodeApi } from "@tests/webview/setup";
import { setupWebviewTest } from "@tests/webview/test-utils";

let commitMenu: typeof import("@/webview/lib/menus").commitMenu;
let checkoutBranchAction: typeof import("@/webview/lib/menus").checkoutBranchAction;
let refMenu: typeof import("@/webview/lib/menus").refMenu;
let commitMenuSource: typeof import("@/webview/lib/menus").commitMenuSource;
let refMenuSource: typeof import("@/webview/lib/menus").refMenuSource;
let stores: typeof import("@/webview/lib/stores");

const commit: GitCommitNode = {
  hash: "commit",
  parentHashes: [],
  author: "Author",
  email: "author@example.com",
  date: 0,
  message: "Message",
  refs: []
};

beforeAll(async () => {
  setupWebviewTest();

  ({ commitMenu, checkoutBranchAction, refMenu, commitMenuSource, refMenuSource } =
    await import("@/webview/lib/menus"));
  stores = await import("@/webview/lib/stores");
});

beforeEach(() => {
  vscodeApi.postMessage.mockClear();
  stores.dialog.value = null;
  stores.selectedRepo.value = "repo";
});

function openAction(command: "cherrypickCommit" | "revertCommit", parentHashes: string[]) {
  const title = command === "cherrypickCommit" ? "cherryPick…" : "revert…";
  const entry = commitMenu({ ...commit, parentHashes }, new Map()).find(
    (item) => item?.title === title
  );

  expect(entry).toBeDefined();
  entry!.onClick();

  const open = stores.dialog.value;
  expect(open?.kind).toBe("form");
  if (open?.kind !== "form") {
    throw new Error("Expected a form dialog");
  }
  return open;
}

describe.each(["cherrypickCommit", "revertCommit"] as const)("%s menu", (command) => {
  it.each([
    ["root", []],
    ["normal", ["parent-1"]]
  ])("treats a %s commit as a normal commit", (_type, parentHashes) => {
    const form = openAction(command, parentHashes);

    expect(form.inputs).toEqual([]);
    form.onSubmit([]);
    expect(vscodeApi.postMessage).toHaveBeenCalledWith({
      command,
      repo: "repo",
      requestId: expect.any(String),
      commitHash: "commit",
      parentIndex: 0
    });
  });

  it("requires a mainline parent for a merge commit", () => {
    const form = openAction(command, ["parent-1", "parent-2"]);

    expect(form.inputs).toEqual([
      {
        kind: "select",
        value: "1",
        options: [
          { label: "parent-1", value: "1" },
          { label: "parent-2", value: "2" }
        ]
      }
    ]);
    form.onSubmit(["2"]);
    expect(vscodeApi.postMessage).toHaveBeenCalledWith({
      command,
      repo: "repo",
      requestId: expect.any(String),
      commitHash: "commit",
      parentIndex: 2
    });
  });
});

describe("remote branch checkout", () => {
  it.each([
    ["origin/main", "main"],
    ["origin/feature/navigation", "feature/navigation"],
    ["team/origin/feature/navigation", "feature/navigation"]
  ])("suggests the full local branch name for %s", (remoteBranch, branchName) => {
    checkoutBranchAction({ type: "remote", name: remoteBranch, hash: "commit" });
    const request = vscodeApi.postMessage.mock.lastCall![0];
    handleLoadRemotes({
      ...request,
      remotes: ["origin", "team", "team/origin"],
      upstream: null,
      pushRemote: null,
      status: null
    });
    const form = stores.dialog.value;
    if (form?.kind !== "form") {
      throw new Error("Expected a checkout dialog");
    }
    expect(form.inputs).toEqual([
      { kind: "ref", value: branchName },
      { kind: "checkbox", label: "fetchBeforeCheckout", value: true }
    ]);
    form.onSubmit([branchName, true]);
    expect(vscodeApi.postMessage).toHaveBeenCalledWith({
      command: "checkoutBranch",
      repo: "repo",
      requestId: request.requestId,
      branchName,
      remoteBranch,
      fetch: true
    });
  });
});

const hash = "0123456789abcdef0123456789abcdef01234567";
const node: GitCommitNode = { ...commit, hash, parentHashes: ["f".repeat(40)] };
const topic: GitRef = { type: "head", name: "topic", hash };
const main: GitRef = { type: "head", name: "main", hash };
const remote: GitRef = { type: "remote", name: "origin/topic", hash };
const tag: GitRef = { type: "tag", name: "v1", hash };

function titles(entries: Array<ContextMenuEntry>) {
  return entries.map((entry) => entry?.title ?? null);
}

/** Choose an entry and return the form it opens. */
function chooseForm(entries: Array<ContextMenuEntry>, title: string) {
  const entry = entries.find((item) => item?.title === title);
  expect(entry, title).toBeDefined();
  entry!.onClick();
  const open = stores.dialog.value;
  if (open?.kind !== "form") {
    throw new Error(`${title} did not open a form`);
  }
  return open;
}

const commitTitles = [
  "addTag…",
  "createBranch…",
  null,
  "checkout…",
  "cherryPick…",
  "revert…",
  null,
  "merge…",
  "reset…",
  null,
  "interactiveRebase…",
  "createFixupMenu…",
  "compareWith",
  "bisectChooseGood",
  "bisectChooseBad",
  "copyCommitHash"
];
const remoteTitles = [
  "focusThisBranch",
  "compareWith",
  null,
  "rebaseOnto…",
  "addWorktree…",
  "deleteRemoteBranch…",
  "fetch…",
  "checkoutBranch…",
  null,
  "copyBranchName"
];
const remoteHeadTitles = [
  "compareWith",
  null,
  "rebaseOnto…",
  "addWorktree…",
  "fetch…",
  null,
  "copyBranchName"
];

describe("menu layout", () => {
  it.each([
    ["root", []],
    ["normal", ["p".repeat(40)]],
    ["merge", ["p".repeat(40), "q".repeat(40)]]
  ])("gives a %s commit the same entries", (_type, parentHashes) => {
    expect(titles(commitMenu({ ...node, parentHashes }, new Map()))).toEqual(commitTitles);
  });

  it("offers the full set of branch actions on a branch that is not checked out", () => {
    expect(titles(refMenu(topic, false))).toEqual([
      "focusThisBranch",
      "compareWith",
      null,
      "configureUpstream…",
      "addWorktree…",
      "rebaseOnto…",
      "checkoutBranch",
      "pushBranch…",
      "renameBranch…",
      "deleteBranch…",
      "merge…",
      null,
      "copyBranchName"
    ]);
  });

  it("offers pull instead of rebase, checkout, delete, and merge on the checked-out branch", () => {
    expect(titles(refMenu(main, true))).toEqual([
      "focusThisBranch",
      "compareWith",
      null,
      "configureUpstream…",
      "addWorktree…",
      "pushBranch…",
      "pullBranch…",
      "renameBranch…",
      null,
      "copyBranchName"
    ]);
  });

  it.each([false, true])("ignores isHeadBranch (%s) for remote branches and tags", (isHead) => {
    expect(titles(refMenu(remote, isHead))).toEqual(remoteTitles);
    expect(titles(refMenu(tag, isHead))).toEqual([
      "compareWith",
      null,
      "deleteTag…",
      "pushTag…",
      "deleteRemoteTag…",
      null,
      "copyTagName"
    ]);
  });

  it("has no effect until an entry is chosen", () => {
    stores.contextMenu.value = null;
    for (const parentHashes of [[], ["p"], ["p", "q"]]) {
      commitMenu({ ...node, parentHashes }, new Map([["p", "Parent"]]));
    }
    for (const isHead of [false, true]) {
      refMenu(topic, isHead);
      refMenu(remote, isHead);
      refMenu({ ...remote, name: "origin/HEAD" }, isHead);
      refMenu(tag, isHead);
    }
    expect(vscodeApi.postMessage).not.toHaveBeenCalled();
    expect(stores.dialog.value).toBeNull();
    expect(stores.contextMenu.value).toBeNull();
  });

  it("returns a new array from every call, so callers can append to it", () => {
    const first = commitMenu(node, new Map());
    first.push(null, { title: "file", onClick: () => {} });
    expect(commitMenu(node, new Map())).toHaveLength(16);
    const branchMenu = refMenu(topic, false);
    branchMenu.length = 0;
    expect(refMenu(topic, false)).toHaveLength(13);
  });
});

describe("source keys", () => {
  it("keys a commit row by its full hash", () => {
    expect(commitMenuSource(hash)).toBe(`commit:${hash}`);
  });

  it.each([
    [{ type: "head", name: "feature/x", hash }, "ref:head:feature/x"],
    [{ type: "remote", name: "origin/feature/x", hash }, "ref:remote:origin/feature/x"],
    [{ type: "tag", name: "v1.0", hash }, "ref:tag:v1.0"],
    [{ type: "tag", name: "feature/x", hash: "other" }, "ref:tag:feature/x"]
  ] as const)("keys %o as %s", (gitRef, key) => {
    expect(refMenuSource(gitRef)).toBe(key);
  });
});

describe("commit menu forms", () => {
  it.each([
    ["addTag…", "dialogAddTagSubmit", false],
    ["createBranch…", "dialogCreateBranchSubmit", false],
    ["checkout…", "dialogYes", false],
    ["cherryPick…", "dialogYesCherryPick", false],
    ["revert…", "dialogYesRevert", false],
    ["merge…", "dialogYesMerge", false],
    ["reset…", "dialogYesReset", true]
  ])("%s is confirmed with %s, destructive: %s", (title, action, destructive) => {
    const form = chooseForm(commitMenu(node, new Map()), title);
    expect(form.action).toBe(action);
    expect(form.destructive).toBe(destructive);
    expect(form.source).toBe(`commit:${hash}`);
  });

  it("asks for a tag's name, type, and optional message", () => {
    expect(chooseForm(commitMenu(node, new Map()), "addTag…").inputs).toEqual([
      { kind: "ref", label: "dialogAddTagName", value: "" },
      {
        kind: "select",
        label: "dialogAddTagType",
        value: "annotated",
        options: [
          { label: "dialogAddTagTypeAnnotated", value: "annotated" },
          { label: "dialogAddTagTypeLightweight", value: "lightweight" }
        ]
      },
      {
        kind: "text",
        label: "dialogAddTagMessage",
        value: "",
        placeholder: "dialogAddTagOptional"
      }
    ]);
  });

  it("drops the message of a lightweight tag and keeps an annotated tag's as entered", () => {
    chooseForm(commitMenu(node, new Map()), "addTag…").onSubmit([
      "v3",
      "lightweight",
      "typed anyway"
    ]);
    expect(vscodeApi.postMessage).toHaveBeenLastCalledWith({
      command: "addTag",
      repo: "repo",
      requestId: expect.any(String),
      tagName: "v3",
      commitHash: hash,
      lightweight: true,
      message: ""
    });

    chooseForm(commitMenu(node, new Map()), "addTag…").onSubmit([
      "v2",
      "annotated",
      "  Release notes  "
    ]);
    expect(vscodeApi.postMessage).toHaveBeenLastCalledWith({
      command: "addTag",
      repo: "repo",
      requestId: expect.any(String),
      tagName: "v2",
      commitHash: hash,
      lightweight: false,
      message: "  Release notes  "
    });
  });

  it("asks for a new branch name with an empty field", () => {
    const form = chooseForm(commitMenu(node, new Map()), "createBranch…");
    expect(form.inputs).toEqual([{ kind: "ref", value: "" }]);
  });

  it("offers the three reset modes in an unlabelled choice, mixed by default", () => {
    const form = chooseForm(commitMenu(node, new Map()), "reset…");
    expect(form.inputs).toEqual([
      {
        kind: "select",
        value: "mixed",
        options: [
          { label: "dialogResetSoft", value: "soft" },
          { label: "dialogResetMixed", value: "mixed" },
          { label: "dialogResetHard", value: "hard" }
        ]
      }
    ]);
    form.onSubmit(["mixed"]);
    expect(vscodeApi.postMessage).toHaveBeenLastCalledWith({
      command: "resetToCommit",
      repo: "repo",
      requestId: expect.any(String),
      commitHash: hash,
      resetMode: "mixed"
    });
  });

  it.each(["cherryPick…", "revert…"])(
    "describes each parent of a merge by its message when %s asks for one",
    (title) => {
      const parents = ["1".repeat(40), "2".repeat(40), "3".repeat(40)];
      const messages = new Map([
        [parents[0]!, "First"],
        [parents[2]!, "Third: x"]
      ]);
      const form = chooseForm(commitMenu({ ...node, parentHashes: parents }, messages), title);
      expect(form.inputs).toEqual([
        {
          kind: "select",
          value: "1",
          options: [
            { label: "11111111: First", value: "1" },
            { label: "22222222", value: "2" },
            { label: "33333333: Third: x", value: "3" }
          ]
        }
      ]);
      form.onSubmit(["3"]);
      expect(vscodeApi.postMessage).toHaveBeenLastCalledWith(
        expect.objectContaining({ commitHash: hash, parentIndex: 3 })
      );
    }
  );

  it("sends nothing when the repository changes while the form is open", () => {
    const form = chooseForm(commitMenu(node, new Map()), "createBranch…");
    stores.selectedRepo.value = "other";
    form.onSubmit(["feature"]);
    expect(vscodeApi.postMessage).not.toHaveBeenCalled();
    expect(stores.dialog.value).toBeNull();
  });
});

describe("ref menu forms", () => {
  it.each([
    {
      gitRef: topic,
      title: "renameBranch…",
      action: "dialogRenameBranchSubmit",
      destructive: false
    },
    { gitRef: topic, title: "deleteBranch…", action: "deleteBranch", destructive: true },
    { gitRef: topic, title: "merge…", action: "dialogYesMerge", destructive: false },
    { gitRef: tag, title: "deleteTag…", action: "dialogYes", destructive: true }
  ])("$title is confirmed with $action, destructive: $destructive", (row) => {
    const form = chooseForm(refMenu(row.gitRef, false), row.title);
    expect(form.action).toBe(row.action);
    expect(form.destructive).toBe(row.destructive);
    expect(form.source).toBe(`ref:${row.gitRef.type}:${row.gitRef.name}`);
  });

  it("asks for the new name of a branch, starting from its current name", () => {
    expect(chooseForm(refMenu(topic, false), "renameBranch…").inputs).toEqual([
      { kind: "ref", value: "topic" }
    ]);
  });

  it.each([false, true])("closes an unchanged rename without sending it (current: %s)", (head) => {
    const form = chooseForm(refMenu(topic, head), "renameBranch…");
    form.onSubmit(["topic"]);
    expect(vscodeApi.postMessage).not.toHaveBeenCalled();
    expect(stores.dialog.value).toBeNull();

    chooseForm(refMenu(topic, head), "renameBranch…").onSubmit(["Topic"]);
    expect(vscodeApi.postMessage).toHaveBeenCalledOnce();
    expect(vscodeApi.postMessage).toHaveBeenCalledWith({
      command: "renameBranch",
      repo: "repo",
      requestId: expect.any(String),
      oldName: "topic",
      newName: "Topic"
    });
  });
});

describe("a remote's HEAD", () => {
  it.each(["origin/HEAD", "team/origin/HEAD"])("gets a reduced menu as %s", (name) => {
    for (const isHead of [false, true]) {
      expect(titles(refMenu({ type: "remote", name, hash }, isHead))).toEqual(remoteHeadTitles);
    }
  });

  it.each(["origin/HEADS", "origin/x-HEAD", "origin/HEAD/topic"])(
    "treats %s as an ordinary remote branch",
    (name) => {
      expect(titles(refMenu({ type: "remote", name, hash }, false))).toEqual(remoteTitles);
    }
  );

  it("acts on the full ref name from its reduced menu", () => {
    const originHead: GitRef = { type: "remote", name: "origin/HEAD", hash };
    const worktree = chooseForm(refMenu(originHead, false), "addWorktree…");
    expect(worktree.inputs[3]).toMatchObject({ value: "refs/remotes/origin/HEAD" });

    refMenu(originHead, false)
      .find((entry) => entry?.title === "fetch…")!
      .onClick();
    expect(vscodeApi.postMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({ command: "loadRemotes", branchName: null })
    );
  });
});

describe("checkoutBranchAction", () => {
  it("checks out a local branch at once, without a fetch", () => {
    checkoutBranchAction(topic);
    expect(vscodeApi.postMessage).toHaveBeenCalledOnce();
    const message = vscodeApi.postMessage.mock.calls[0]![0];
    expect(message).toEqual({
      command: "checkoutBranch",
      repo: "repo",
      requestId: expect.any(String),
      branchName: "topic",
      remoteBranch: null
    });
    expect(message).not.toHaveProperty("fetch");
  });

  it.each<[string, GitRef]>([
    ["a tag", tag],
    ["a remote's HEAD", { type: "remote", name: "origin/HEAD", hash }],
    ["a nested remote's HEAD", { type: "remote", name: "team/origin/HEAD", hash }]
  ])("does nothing for %s", (_kind, gitRef) => {
    stores.contextMenu.value = null;
    checkoutBranchAction(gitRef);
    expect(vscodeApi.postMessage).not.toHaveBeenCalled();
    expect(stores.dialog.value).toBeNull();
    expect(stores.contextMenu.value).toBeNull();
  });

  it("still asks how to check out a remote branch whose name merely contains HEAD", () => {
    checkoutBranchAction({ type: "remote", name: "origin/HEADS", hash });
    expect(vscodeApi.postMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({ command: "loadRemotes", branchName: null })
    );
  });

  it("does nothing without a selected repository", () => {
    stores.selectedRepo.value = undefined;
    checkoutBranchAction(topic);
    checkoutBranchAction(remote);
    expect(vscodeApi.postMessage).not.toHaveBeenCalled();
    expect(stores.dialog.value).toBeNull();
  });
});
