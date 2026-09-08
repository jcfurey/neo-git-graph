import * as fs from "node:fs";
import * as path from "node:path";

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { scanRepos } from "@/extension/handlers/scan-repo";

import { git, makeRepo } from "@tests/backend/helpers";

const workspace = vi.hoisted(() => ({
  workspaceFolders: [] as { uri: { fsPath: string } }[],
  getConfiguration: () => ({ get: (_key: string, defaultValue: unknown) => defaultValue })
}));

vi.mock("vscode", () => ({ workspace }));

let parent: string;
let childSource: string;
let child: string;

beforeAll(() => {
  parent = makeRepo();
  childSource = makeRepo();
  git(
    ["-c", "protocol.file.allow=always", "submodule", "add", childSource, "src/child module"],
    parent
  );
  child = path.join(parent, "src/child module").split(path.sep).join("/");
});

beforeEach(() => {
  workspace.workspaceFolders = [{ uri: { fsPath: parent } }];
});

afterAll(() => {
  for (const repo of [parent, childSource]) {
    if (repo) {
      fs.rmSync(repo, { recursive: true, force: true });
    }
  }
});

describe("repository picker scan", () => {
  it("offers the parent and submodule at the default search depth", async () => {
    expect(await scanRepos()).toEqual({
      repos: [
        { name: path.basename(parent), path: parent },
        { name: "child module", path: child }
      ].toSorted((a, b) => a.path.localeCompare(b.path))
    });
  });

  it("offers each repository once when workspace folders overlap", async () => {
    workspace.workspaceFolders.push({ uri: { fsPath: child } });
    const { repos } = await scanRepos();
    expect(repos.map((repo) => repo.path).toSorted()).toEqual([parent, child].toSorted());
  });

  it("returns an empty picker when there are no workspace folders", async () => {
    workspace.workspaceFolders = [];
    expect(await scanRepos()).toEqual({ repos: [] });
  });
});
