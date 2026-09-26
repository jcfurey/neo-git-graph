import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { expect, it } from "vitest";

import { configuredGitPath, extConfig } from "@/extension/config";

type Manifest = {
  contributes: { configuration: { properties: Record<string, { default: unknown }> } };
};

// The vscode mock hands back each fallback, so this compares the fallbacks with the manifest.
it("falls back to the defaults declared in package.json", () => {
  const manifest = JSON.parse(
    readFileSync(new URL("../../package.json", import.meta.url), "utf8")
  ) as Manifest;
  const declared = manifest.contributes.configuration.properties;
  const fallbacks = {
    autoCenterCommitDetailsView: extConfig.autoCenterCommitDetailsView(),
    dateFormat: extConfig.dateFormat(),
    dateType: extConfig.dateType(),
    graphColours: extConfig.graphColours(),
    graphStyle: extConfig.graphStyle(),
    initialLoadCommits: extConfig.initialLoadCommits(),
    loadMoreCommits: extConfig.loadMoreCommits(),
    maxDepthOfRepoSearch: extConfig.maxDepthOfRepoSearch(),
    showCurrentBranchByDefault: extConfig.showCurrentBranchByDefault(),
    showUncommittedChanges: extConfig.showUncommittedChanges(),
    tabIconColourTheme: extConfig.tabIconColourTheme()
  };
  for (const [key, value] of Object.entries(fallbacks)) {
    expect(value, key).toEqual(declared[`neo-git-graph.${key}`]?.default);
  }
  expect(extConfig.gitPath()).toBe("git");
});

it("resolves git.path values the way VS Code does", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "ngg-git path ("));
  const existing = path.join(dir, "git");
  writeFileSync(existing, "");
  try {
    expect(configuredGitPath(undefined)).toBe("git");
    expect(configuredGitPath(null)).toBe("git");
    expect(configuredGitPath(" ")).toBe("git");
    expect(configuredGitPath(existing)).toBe(existing);
    expect(configuredGitPath("git-custom")).toBe("git-custom");
    expect(configuredGitPath([path.join(dir, "missing"), existing])).toBe(existing);
    expect(configuredGitPath([path.join(dir, "missing"), path.join(dir, "gone")])).toBe(
      path.join(dir, "missing")
    );
    expect(configuredGitPath([])).toBe("git");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
