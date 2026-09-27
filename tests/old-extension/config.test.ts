import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { afterAll, beforeAll, expect, it, vi } from "vitest";

import { extConfig, resolveBuiltInGitPath } from "@/extension/config";
import { scanRepos } from "@/extension/handlers/scan-repo";
import { config } from "@/old-extension/config";

import { makeRepo } from "@tests/backend/helpers";

const mock = vi.hoisted(() => ({
  gitPath: undefined as unknown,
  gitExtension: undefined as unknown,
  folders: [] as Array<{ uri: { fsPath: string } }>
}));

vi.mock("vscode", () => ({
  workspace: {
    get workspaceFolders() {
      return mock.folders;
    },
    getConfiguration: (section: string) => ({
      get: (key: string, def?: unknown) =>
        section === "git" && key === "path" ? (mock.gitPath ?? def) : def
    })
  },
  extensions: {
    getExtension: (id: string) => (id === "vscode.git" ? mock.gitExtension : undefined)
  }
}));

/** The exports of VS Code's Git extension when it found Git at `executable`. */
const gitExtension = (executable: string) => ({ getAPI: () => ({ git: { path: executable } }) });

let repo: string;
let dir: string;
let gitPath: string;

beforeAll(() => {
  repo = makeRepo();
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "ngg-git path ("));
  if (process.platform === "win32") {
    // Git for Windows installs below "C:\Program Files".
    gitPath = execFileSync("where", ["git"]).toString().split(/\r?\n/)[0]!.trim();
  } else {
    gitPath = path.join(dir, "git");
    fs.symlinkSync(execFileSync("sh", ["-c", "command -v git"]).toString().trim(), gitPath);
  }
});

afterAll(() => {
  fs.rmSync(repo, { recursive: true, force: true });
  fs.rmSync(dir, { recursive: true, force: true });
});

it("resolves git.path values the way VS Code does", () => {
  const missing = path.join(dir, "missing");
  const cases: Array<[unknown, string]> = [
    [undefined, "git"],
    [null, "git"],
    [" ", "git"],
    [gitPath, gitPath],
    ["git-custom", "git-custom"],
    [[missing, gitPath], gitPath],
    [[missing, path.join(dir, "gone")], missing],
    [[], "git"]
  ];
  for (const [value, expected] of cases) {
    mock.gitPath = value;
    expect(extConfig.gitBinary(), JSON.stringify(value)).toBe(expected);
    expect(config.gitPath(), JSON.stringify(value)).toBe(expected);
  }
});

it("scans for repositories with a git.path that contains spaces or lists several paths", async () => {
  mock.folders = [{ uri: { fsPath: repo } }];
  mock.gitPath = [path.join(dir, "missing"), gitPath];
  expect(await scanRepos()).toEqual({ repos: [{ name: path.basename(repo), path: repo }] });
});

it("prefers the Git that VS Code's Git extension found", async () => {
  mock.gitPath = "git-custom";

  mock.gitExtension = { isActive: true, exports: gitExtension("/usr/bin/git") };
  await resolveBuiltInGitPath();
  expect(extConfig.gitBinary()).toBe("/usr/bin/git");
  expect(config.gitPath()).toBe("/usr/bin/git");

  mock.gitExtension = {
    isActive: false,
    activate: () => Promise.resolve(gitExtension("/usr/local/bin/git"))
  };
  await resolveBuiltInGitPath();
  expect(extConfig.gitBinary()).toBe("/usr/local/bin/git");

  // The Git extension is enabled but found no Git.
  mock.gitExtension = {
    isActive: true,
    exports: {
      getAPI: () => {
        throw new Error("Git model not found");
      }
    }
  };
  await resolveBuiltInGitPath();
  expect(extConfig.gitBinary()).toBe("git-custom");

  mock.gitExtension = undefined;
  await resolveBuiltInGitPath();
  expect(extConfig.gitBinary()).toBe("git-custom");
});
