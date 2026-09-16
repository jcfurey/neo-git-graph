// @vitest-environment jsdom

import { h, render } from "preact";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import type { GitCommitNode } from "@/backend/types";

import { setupWebviewTest } from "@tests/webview/test-utils";

let CommitRow: typeof import("@/webview/components/commit/CommitRow").CommitRow;
let stores: typeof import("@/webview/lib/stores");
let container: HTMLTableSectionElement;

beforeAll(async () => {
  setupWebviewTest();
  ({ CommitRow } = await import("@/webview/components/commit/CommitRow"));
  stores = await import("@/webview/lib/stores");
});

afterEach(() => {
  render(null, container);
});

describe("CommitRow", () => {
  it("reserves description space and exposes truncated content", () => {
    const branch = "feature/a-very-long-branch-name";
    const message = "Commit message after the branch label";
    const commit: GitCommitNode = {
      hash: "abc123456789",
      parentHashes: [],
      author: "Author",
      email: "author@example.com",
      date: 0,
      message,
      refs: [{ hash: "abc123456789", name: branch, type: "head" }]
    };
    container = document.createElement("tbody");

    render(
      h(CommitRow, {
        commit,
        isHead: false,
        headBranch: null,
        messages: new Map(),
        colour: undefined,
        expanded: false,
        onSelect: undefined
      }),
      container
    );

    const description = container.querySelector("td:nth-child(2)");
    const refRegion = description?.querySelector(":scope > div > span:first-child");
    const messageRegion = description?.querySelector(":scope > div > span:last-of-type");

    expect(refRegion?.classList.contains("max-w-1/2")).toBe(true);
    expect(refRegion?.querySelector("[title]")?.getAttribute("title")).toBe(branch);
    expect(messageRegion?.classList.contains("flex-1")).toBe(true);
    expect(messageRegion?.getAttribute("title")).toBe(message);
    expect(messageRegion?.textContent).toBe(message);
  });

  it("opens the commit menu from the button at the end of the row", () => {
    const commit: GitCommitNode = {
      hash: "abc123456789",
      parentHashes: [],
      author: "Author",
      email: "author@example.com",
      date: 0,
      message: "message",
      refs: []
    };
    container = document.createElement("tbody");
    document.body.append(container);
    stores.contextMenu.value = null;

    render(
      h(CommitRow, {
        commit,
        isHead: false,
        headBranch: null,
        messages: new Map(),
        colour: undefined,
        expanded: false,
        onSelect: undefined
      }),
      container
    );
    const button = container.querySelector<HTMLButtonElement>("button[aria-haspopup]");
    // The test l10n proxy answers with the key, so the label is the key itself.
    expect(button?.getAttribute("aria-label")).toBe("commitActions");
    button?.click();

    expect(stores.contextMenu.peek()?.source).toBe("commit:abc123456789");
    stores.contextMenu.value = null;
    container.remove();
  });
});
