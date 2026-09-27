// @vitest-environment jsdom

import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { GitCommitNode } from "@/backend/types";
import { GraphView } from "@/webview/layout/GraphView";
import * as stores from "@/webview/lib/stores";
import { getWebviewConfig } from "@/webview/lib/webview-config";
import { getCommitDate, getFullDate } from "@/webview/utils/date";

import { setupWebviewTest } from "@tests/webview/test-utils";

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
    stores.commitList.value = undefined;
    stores.commitHead.value = null;
    stores.moreCommitsAvailable.value = false;
    stores.expandedCommit.value = null;
    container = document.createElement("div");
    document.body.append(container);
  });

  afterEach(() => {
    act(() => render(null, container));
    container.remove();
  });

  it("renders every row when one commit has an out-of-range date", () => {
    const commits: Array<GitCommitNode> = [
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

    act(() => {
      stores.commitList.value = commits;
      stores.commitHead.value = commits[0]!.hash;
      render(h(GraphView, {}), container);
    });

    const text = container.textContent ?? "";
    expect(text).toContain("far future");
    expect(text).toContain("epoch");
    expect(text).toContain("unknownDate");
  });
});
