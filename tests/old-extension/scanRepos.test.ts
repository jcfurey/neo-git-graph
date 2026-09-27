import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { scanRepos } from "@/extension/handlers/scan-repo";

import { git, makeRepo } from "@tests/backend/helpers";

const workspace = vi.hoisted(() => ({
  workspaceFolders: [] as { uri: { fsPath: string } }[],
  getConfiguration: () => ({ get: (_key: string, defaultValue: unknown) => defaultValue })
}));

vi.mock("vscode", () => ({ workspace }));

const allowFile = ["-c", "protocol.file.allow=always"];

let repo: string;
let outside: string;
let parent: string;
let childSource: string;
let nestedSource: string;
let child: string;
let nested: string;

function setFolders(...folders: string[]) {
  workspace.workspaceFolders = folders.map((fsPath) => ({ uri: { fsPath } }));
}

function entry(repoPath: string) {
  return { name: path.basename(repoPath), path: repoPath };
}

beforeAll(() => {
  repo = fs.realpathSync.native(makeRepo());
  fs.mkdirSync(path.join(repo, "src"));
  outside = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "ngg-test-outside-")));
  // Windows creates directory junctions without extra privileges.
  fs.symlinkSync(repo, path.join(outside, "linked repo"), "junction");

  parent = fs.realpathSync.native(makeRepo());
  childSource = makeRepo();
  nestedSource = makeRepo();
  git([...allowFile, "submodule", "add", nestedSource, "nested module"], childSource);
  git(["commit", "-m", "Add nested submodule"], childSource);
  git([...allowFile, "submodule", "add", childSource, "src/child module"], parent);
  git([...allowFile, "submodule", "update", "--init", "--recursive"], parent);
  git([...allowFile, "submodule", "add", nestedSource, "not initialized"], parent);
  git(["submodule", "deinit", "--force", "--", "not initialized"], parent);
  child = path.join(parent, "src", "child module");
  nested = path.join(child, "nested module");
});

afterAll(() => {
  for (const directory of [repo, outside, parent, childSource, nestedSource]) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("scanRepos", () => {
  it("offers a subfolder or a symlink of a repository once, under its real top level", async () => {
    setFolders(path.join(repo, "src"), path.join(outside, "linked repo"), repo);
    expect(await scanRepos()).toEqual({ repos: [entry(repo)] });
  });

  it("offers a repository with its initialized submodules at the default depth", async () => {
    setFolders(parent);
    expect(await scanRepos()).toEqual({ repos: [entry(parent), entry(child), entry(nested)] });
  });

  it("offers a submodule once when it is also a workspace folder", async () => {
    setFolders(parent, child);
    expect(await scanRepos()).toEqual({ repos: [entry(parent), entry(child), entry(nested)] });
  });
});
