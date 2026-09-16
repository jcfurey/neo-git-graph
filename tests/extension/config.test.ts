import { readFileSync } from "node:fs";

import { expect, it } from "vitest";

import { extConfig } from "@/extension/config";

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
    fetchAvatars: extConfig.fetchAvatars(),
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
