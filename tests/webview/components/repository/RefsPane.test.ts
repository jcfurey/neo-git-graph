// @vitest-environment jsdom

import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { RepositoryState } from "@/backend/types";

import { setupWebviewTest } from "@tests/webview/test-utils";

const mocks = vi.hoisted(() => ({ postMessage: vi.fn() }));
vi.mock("@/webview/lib/vscode", () => ({
  vscode: { postMessage: mocks.postMessage, getState: vi.fn(), setState: vi.fn() }
}));

let RefsPane: typeof import("@/webview/components/repository/RefsPane").RefsPane;
let groupRemoteBranches: typeof import("@/webview/components/repository/RefsPane").groupRemoteBranches;
let actions: typeof import("@/webview/lib/repository-actions");
let stores: typeof import("@/webview/lib/stores");
let navigation: typeof import("@/webview/lib/navigation");
let container: HTMLDivElement;

const state: RepositoryState = {
  remotes: [{ name: "origin", fetchUrls: ["https://example.test/repo.git"], pushUrls: [] }],
  pushDefault: null,
  branches: [
    {
      name: "feature",
      hash: "f".repeat(40),
      upstream: "origin/feature",
      ahead: 2,
      behind: 1,
      gone: false
    },
    { name: "main", hash: "a".repeat(40), upstream: "", ahead: 0, behind: 0, gone: false }
  ],
  remoteBranches: [
    { name: "origin/feature", hash: "f".repeat(40) },
    { name: "origin/main", hash: "a".repeat(40) }
  ],
  tags: [{ name: "v1", hash: "1".repeat(40) }],
  worktrees: [],
  head: "main",
  operation: null,
  conflicts: []
};

/** The label button of a row, by its tooltip. Tooltips hold newlines, so no CSS selector. */
function row(title: string) {
  const button = [...container.querySelectorAll<HTMLButtonElement>("button[title]")].find(
    (element) => element.title === title
  );
  if (button === undefined) {
    throw new Error(`Missing row ${title}`);
  }
  return button;
}
function hasRow(title: string) {
  return [...container.querySelectorAll<HTMLButtonElement>("button[title]")].some(
    (element) => element.title === title
  );
}

beforeAll(async () => {
  setupWebviewTest();
  ({ RefsPane, groupRemoteBranches } = await import("@/webview/components/repository/RefsPane"));
  actions = await import("@/webview/lib/repository-actions");
  stores = await import("@/webview/lib/stores");
  navigation = await import("@/webview/lib/navigation");
});

beforeEach(() => {
  mocks.postMessage.mockClear();
  stores.selectedRepo.value = "/repo";
  stores.selectedBranch.value = "*";
  stores.showRemoteBranch.value = true;
  stores.commitHead.value = "a".repeat(40);
  stores.contextMenu.value = null;
  actions.repositoryState.value = state;
  container = document.createElement("div");
  document.body.append(container);
  act(() => render(h(RefsPane, {}), container));
  const request = mocks.postMessage.mock.calls
    .map((call) => call[0] as { command: string; requestId: string; query?: { kind: string } })
    .find((message) => message.command === "repositoryQuery" && message.query?.kind === "stashes");
  act(() =>
    actions.handleRepositoryQuery({
      repo: "/repo",
      requestId: request!.requestId,
      data: {
        kind: "stashes",
        stashes: [{ ref: "stash@{0}", hash: "5".repeat(40), message: "WIP on main: work" }]
      },
      status: null
    })
  );
});

afterEach(() => {
  act(() => render(null, container));
  container.remove();
});

describe("RefsPane", () => {
  it("lists local branches, remotes, tags and stashes", () => {
    const text = container.textContent ?? "";
    expect(row("main").querySelector("span.font-bold")).not.toBeNull();
    expect(row("feature\norigin/feature").textContent).toContain("↑2 ↓1");
    expect(row("origin/feature").textContent).toBe("feature");
    expect(text).toContain("v1");
    expect(text).toContain("WIP on main: work");
    expect(text).toContain("stash@{0}");
  });

  it("limits the graph to a clicked branch", () => {
    act(() => row("feature\norigin/feature").click());
    expect(stores.selectedBranch.value).toBe("feature");
    expect(mocks.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ command: "loadCommits", branchName: "feature" })
    );
  });

  it("dims remote branches hidden from the graph and shows them again when one is selected", () => {
    act(() => {
      stores.showRemoteBranch.value = false;
    });
    const remote = row("origin/feature").parentElement!;
    expect(remote.classList.contains("text-muted")).toBe(true);
    act(() => row("origin/feature").click());
    expect(stores.showRemoteBranch.value).toBe(true);
    expect(stores.selectedBranch.value).toBe("remotes/origin/feature");
    expect(row("origin/feature").parentElement!.classList.contains("text-muted")).toBe(false);
  });

  it("opens the graph at a tag and offers the tag menu", () => {
    act(() => row(`v1\n${"1".repeat(40)}`).click());
    expect(navigation.historyFilter.value.revision).toBe("1".repeat(40));
    act(() => {
      row("main").parentElement!.dispatchEvent(
        new MouseEvent("contextmenu", { bubbles: true, clientX: 10, clientY: 10 })
      );
    });
    expect(stores.contextMenu.value?.source).toBe("ref:head:main");
  });

  it("narrows every section with the filter", () => {
    const input = container.querySelector("input")!;
    input.value = "v1";
    act(() => {
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(hasRow("main")).toBe(false);
    expect(hasRow(`v1\n${"1".repeat(40)}`)).toBe(true);
    expect(container.textContent).not.toContain("origin");
  });

  it("collapses a section and remembers it", () => {
    const toggle = [...container.querySelectorAll<HTMLButtonElement>("button[aria-expanded]")].find(
      (button) => button.textContent?.includes("tags")
    )!;
    act(() => toggle.click());
    expect(hasRow(`v1\n${"1".repeat(40)}`)).toBe(false);
    expect(navigation.collapsedSections.value.has("tags")).toBe(true);
    act(() => toggle.click());
    expect(hasRow(`v1\n${"1".repeat(40)}`)).toBe(true);
  });

  it("groups remote refs under the longest matching remote name", () => {
    const groups = groupRemoteBranches(
      [
        { name: "team", fetchUrls: [], pushUrls: [] },
        { name: "team/origin", fetchUrls: [], pushUrls: [] }
      ],
      [
        { name: "team/origin/main", hash: "a" },
        { name: "team/dev", hash: "b" },
        { name: "gone/main", hash: "c" }
      ]
    );
    expect(groups.map((group) => [group.remote, group.branches.map((ref) => ref.name)])).toEqual([
      ["team", ["team/dev"]],
      ["team/origin", ["team/origin/main"]],
      ["gone", ["gone/main"]]
    ]);
  });
});
