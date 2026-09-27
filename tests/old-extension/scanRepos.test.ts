import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { scanRepos } from "@/extension/handlers/scan-repo";

import { makeRepo } from "@tests/backend/helpers";

const workspace = vi.hoisted(() => ({
  workspaceFolders: [] as { uri: { fsPath: string } }[],
  getConfiguration: () => ({ get: (_key: string, defaultValue: unknown) => defaultValue })
}));

vi.mock("vscode", () => ({ workspace }));

let repo: string;
let outside: string;

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
});

afterAll(() => {
  for (const directory of [repo, outside]) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("scanRepos", () => {
  it("offers a subfolder or a symlink of a repository once, under its real top level", async () => {
    setFolders(path.join(repo, "src"), path.join(outside, "linked repo"), repo);
    expect(await scanRepos()).toEqual({ repos: [entry(repo)] });
  });
});
