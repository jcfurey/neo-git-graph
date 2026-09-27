import { readFileSync } from "node:fs";

import { expect, it, vi } from "vitest";
import * as vscode from "vscode";

import { extConfig, wholeNumber } from "@/extension/config";

type Manifest = {
  contributes: {
    configuration: {
      properties: Record<string, { type: string; minimum?: number; default: unknown }>;
    };
  };
};

const manifest = JSON.parse(
  readFileSync(new URL("../../package.json", import.meta.url), "utf8")
) as Manifest;
const declared = manifest.contributes.configuration.properties;

it("reads numeric settings as whole numbers within their range", () => {
  expect(wholeNumber(300.5, 1, 300)).toBe(300);
  expect(wholeNumber(-1, 1, 300)).toBe(1);
  expect(wholeNumber(0, 1, 300)).toBe(1);
  expect(wholeNumber(-2, 0, 0)).toBe(0);
  expect(wholeNumber(Number.NaN, 1, 300)).toBe(300);
  expect(wholeNumber(Number.POSITIVE_INFINITY, 1, 300)).toBe(300);
  expect(wholeNumber("500", 1, 300)).toBe(300);
  expect(wholeNumber(null, 1, 300)).toBe(300);
  expect(wholeNumber(42, 1, 300)).toBe(42);

  const settings: Record<string, unknown> = {
    initialLoadCommits: 300.5,
    loadMoreCommits: -1,
    maxDepthOfRepoSearch: "2"
  };
  const read = vi
    .spyOn(vscode.workspace, "getConfiguration")
    .mockReturnValue({ get: (key: string) => settings[key] } as never);
  try {
    expect(extConfig.initialLoadCommits()).toBe(300);
    expect(extConfig.loadMoreCommits()).toBe(1);
    expect(extConfig.maxDepth()).toBe(0);
  } finally {
    read.mockRestore();
  }
});

it("declares the numeric settings as integers with minimums", () => {
  expect(declared["neo-git-graph.initialLoadCommits"]).toMatchObject({
    type: "integer",
    minimum: 1
  });
  expect(declared["neo-git-graph.loadMoreCommits"]).toMatchObject({ type: "integer", minimum: 1 });
  expect(declared["neo-git-graph.maxDepthOfRepoSearch"]).toMatchObject({
    type: "integer",
    minimum: 0
  });
});

// The vscode mock hands back each fallback, so this compares the fallbacks with the manifest.
it("falls back to the numeric defaults declared in package.json", () => {
  expect(extConfig.initialLoadCommits()).toBe(
    declared["neo-git-graph.initialLoadCommits"]?.default
  );
  expect(extConfig.loadMoreCommits()).toBe(declared["neo-git-graph.loadMoreCommits"]?.default);
  expect(extConfig.maxDepth()).toBe(declared["neo-git-graph.maxDepthOfRepoSearch"]?.default);
});
