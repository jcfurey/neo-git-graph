// @vitest-environment jsdom
import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { GitCommitNode } from "@/backend/types";
import { ErrorBoundary } from "@/webview/components/ui/ErrorBoundary";
import { GraphView } from "@/webview/layout/GraphView";
import { refresh } from "@/webview/lib/actions";
import { resetGraphRequests } from "@/webview/lib/graph-requests";
import { handleLoadCommits } from "@/webview/lib/handler/load-commits";
import * as stores from "@/webview/lib/stores";
import { getWebviewConfig } from "@/webview/lib/webview-config";
import { getCommitDate, getFullDate } from "@/webview/utils/date";

import { latestGraphRequest, setupWebviewTest } from "@tests/webview/test-utils";

// Git accepts each of these; none fits in a JavaScript date.
const OUT_OF_RANGE = [99_999_999_999_999, -99_999_999_999_999, Number.NaN, Infinity];

beforeAll(() => setupWebviewTest());

describe("date formatting", () => {
  it.each(["Date & Time", "Date Only", "Relative"] as const)(
    "shows a placeholder for unrepresentable dates in the %s format",
    (dateFormat) => {
      Object.assign(getWebviewConfig(), { dateFormat });
      for (const seconds of OUT_OF_RANGE) {
        expect(getCommitDate(seconds)).toEqual({ title: "unknownDate", value: "unknownDate" });
        expect(getFullDate(seconds)).toBe("unknownDate");
      }
      expect(getCommitDate(0).value).not.toBe("unknownDate");
      expect(getFullDate(8_640_000_000_000)).not.toBe("unknownDate");
    }
  );
});

describe("graph rendering", () => {
  let container: HTMLDivElement;
  beforeEach(() => {
    resetGraphRequests();
    stores.selectedRepo.value = "/repo";
    stores.selectedBranch.value = "*";
    stores.commitList.value = undefined;
    stores.expandedCommit.value = null;
    container = document.createElement("div");
    document.body.append(container);
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        disconnect() {}
      }
    );
  });
  afterEach(() => {
    act(() => render(null, container));
    container.remove();
    vi.unstubAllGlobals();
  });

  it("renders every row when one commit has an out-of-range date", () => {
    const commits: GitCommitNode[] = [
      {
        hash: "b".repeat(40),
        parentHashes: ["a".repeat(40)],
        author: "A",
        email: "a@x",
        date: 99_999_999_999_999,
        message: "far future",
        refs: []
      },
      {
        hash: "a".repeat(40),
        parentHashes: [],
        author: "A",
        email: "a@x",
        date: 0,
        message: "epoch",
        refs: []
      }
    ];
    refresh();
    act(() => {
      handleLoadCommits({
        ...latestGraphRequest("loadCommits"),
        commits,
        head: commits[0]!.hash,
        moreCommitsAvailable: false,
        uncommittedChanges: 0
      });
      render(h(GraphView, {}), container);
    });
    const text = container.textContent ?? "";
    expect(text).toContain("far future");
    expect(text).toContain("epoch");
    expect(text).toContain("unknownDate");
  });

  it("replaces only a failing view with its error and a retry", () => {
    let fail = true;
    function Fragile() {
      if (fail) {
        throw new Error("cannot draw");
      }
      return h("p", null, "drawn");
    }
    act(() =>
      render(
        h("div", null, h("span", null, "header"), h(ErrorBoundary, null, h(Fragile, null))),
        container
      )
    );
    expect(container.textContent).toContain("header");
    expect(container.querySelector('[role="alert"]')?.textContent).toBe("viewFailedretryView");
    fail = false;
    act(() => container.querySelector("button")!.click());
    expect(container.textContent).toBe("headerdrawn");
  });
});
