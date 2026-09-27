import * as fs from "node:fs";
import * as path from "node:path";

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { scanRepos } from "@/extension/handlers/scan-repo";
import { logger } from "@/extension/util/logger";

import { makeRepo } from "@tests/backend/helpers";

const workspace = vi.hoisted(() => ({
  workspaceFolders: [] as { uri: { scheme: string; fsPath: string; toString(): string } }[],
  getConfiguration: () => ({ get: (_key: string, def: unknown) => def })
}));

vi.mock("vscode", () => ({ workspace }));

function folder(scheme: string, fsPath: string) {
  return { uri: { scheme, fsPath, toString: () => `${scheme}://${fsPath}` } };
}

let repo: string;
let virtualRepo: string;

beforeAll(() => {
  repo = makeRepo();
  virtualRepo = makeRepo();
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(() => {
  for (const dir of [repo, virtualRepo]) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("scanRepos", () => {
  it("skips a missing folder without hiding other repositories", async () => {
    const warn = vi.spyOn(logger, "warn");
    const missing = `${repo}-deleted`;
    workspace.workspaceFolders = [folder("file", missing), folder("file", repo)];

    expect(await scanRepos()).toEqual({ repos: [{ name: path.basename(repo), path: repo }] });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining(missing));
  });

  it("skips folders of virtual workspaces", async () => {
    const warn = vi.spyOn(logger, "warn");
    workspace.workspaceFolders = [folder("vscode-vfs", virtualRepo), folder("file", repo)];

    expect(await scanRepos()).toEqual({ repos: [{ name: path.basename(repo), path: repo }] });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining(virtualRepo));
  });
});
