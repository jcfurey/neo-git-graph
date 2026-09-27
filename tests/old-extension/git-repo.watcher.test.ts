import * as cp from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { selectWatchedRepo, watchGitRepo } from "@/extension/watchers/git-repo.watcher";

import { git, makeRepo } from "@tests/backend/helpers";

type Handler = (uri: { fsPath: string }) => void;
const mocks = vi.hoisted(() => ({
  notify: vi.fn(),
  watchers: [] as { base: string; change: Handler; create: Handler; delete: Handler }[]
}));
vi.mock("vscode", () => ({
  workspace: {
    createFileSystemWatcher: ({ base }: { base: string }) => {
      const watcher = { base } as (typeof mocks.watchers)[number];
      mocks.watchers.push(watcher);
      return {
        onDidChange: (handler: Handler) => (watcher.change = handler),
        onDidCreate: (handler: Handler) => (watcher.create = handler),
        onDidDelete: (handler: Handler) => (watcher.delete = handler),
        dispose: () => mocks.watchers.splice(mocks.watchers.indexOf(watcher), 1)
      };
    }
  },
  RelativePattern: class {
    constructor(
      public base: string,
      public pattern: string
    ) {}
  },
  Disposable: class {
    constructor(public dispose: () => void) {}
  }
}));
vi.mock("@/extension/rpc/rpc-notify", () => ({ rpcNotify: { notify: mocks.notify } }));
vi.mock("@/extension/util/logger", () => ({ logger: { debug: vi.fn(), warn: vi.fn() } }));

function gitOutput(args: string[], cwd: string) {
  return cp.execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

function isWithin(file: string, dir: string) {
  const relativePath = path.relative(dir, file);
  return !relativePath.startsWith("..") && !path.isAbsolute(relativePath);
}

/** The Git directory and the common directory of `repo`. */
function gitDirectories(repo: string) {
  return [
    gitOutput(["rev-parse", "--absolute-git-dir"], repo),
    path.resolve(repo, gitOutput(["rev-parse", "--git-common-dir"], repo))
  ].map((dir) => fs.realpathSync(dir));
}

const dirs: string[] = [];
let main: string;
let worktree: string;
let parent: string;
let submodule: string;

beforeAll(() => {
  // Detached auto-maintenance after a commit adds and removes files while a test lists them.
  vi.stubEnv("GIT_CONFIG_COUNT", "1");
  vi.stubEnv("GIT_CONFIG_KEY_0", "maintenance.auto");
  vi.stubEnv("GIT_CONFIG_VALUE_0", "false");
  main = makeRepo();
  worktree = main + "-worktree";
  git(["worktree", "add", "-b", "topic", worktree], main);
  const child = makeRepo();
  parent = makeRepo();
  git(["-c", "protocol.file.allow=always", "submodule", "add", child, "module"], parent);
  git(["commit", "-m", "add module"], parent);
  submodule = path.join(parent, "module");
  // The clone has none of the local configuration of the repository it came from.
  git(["config", "user.email", "t@t.com"], submodule);
  git(["config", "user.name", "T"], submodule);
  git(["config", "commit.gpgsign", "false"], submodule);
  dirs.push(main, worktree, child, parent);
});

afterAll(() => {
  for (const dir of dirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  vi.unstubAllEnvs();
});

let lifetime: ReturnType<typeof watchGitRepo>;
beforeEach(() => {
  vi.clearAllMocks();
  lifetime = watchGitRepo();
});
afterEach(() => lifetime.dispose());

function waitForWatchers(count: number) {
  return vi.waitFor(() => expect(mocks.watchers).toHaveLength(count), { timeout: 5000 });
}

/** Modification times of every file below `roots`. */
function snapshot(roots: string[]) {
  const files = new Map<string, number>();
  for (const root of roots) {
    for (const entry of fs.readdirSync(root, { recursive: true, withFileTypes: true })) {
      if (entry.isFile()) {
        const file = path.join(entry.parentPath, entry.name);
        files.set(file, fs.statSync(file).mtimeMs);
      }
    }
  }
  return files;
}

/** Commit in `repo` and report each Git file the commit touched to the watchers that cover it. */
async function commitAndReport(repo: string) {
  const gitDirs = gitDirectories(repo);
  const before = snapshot(gitDirs);
  await new Promise((resolve) => setTimeout(resolve, 20));
  fs.writeFileSync(path.join(repo, "change.txt"), repo);
  git(["add", "change.txt"], repo);
  git(["commit", "-m", "change"], repo);
  const after = snapshot(gitDirs);
  const touched = [...new Set([...before.keys(), ...after.keys()])].filter(
    (file) => before.get(file) !== after.get(file)
  );
  // None of them is below the work tree, which is all that used to be watched.
  expect(touched.filter((file) => isWithin(file, repo))).toEqual([]);
  for (const file of touched) {
    for (const watcher of mocks.watchers) {
      if (isWithin(file, watcher.base)) {
        (after.has(file) ? watcher.change : watcher.delete)({ fsPath: file });
      }
    }
  }
  await new Promise((resolve) => setTimeout(resolve, 400));
}

describe("repository watcher", () => {
  it.each([
    ["a linked worktree", () => worktree, 3],
    ["a submodule", () => submodule, 2]
  ])("refreshes once for a commit in %s", async (_name, repo, watcherCount) => {
    selectWatchedRepo(repo(), "git");
    await waitForWatchers(watcherCount);
    await commitAndReport(repo());
    expect(mocks.notify.mock.calls).toEqual([["repo.updated", { path: repo() }]]);
  });

  it("refreshes for an interrupted merge but not for new objects", async () => {
    selectWatchedRepo(worktree, "git");
    await waitForWatchers(3);
    const [gitDir, common] = gitDirectories(worktree) as [string, string];
    const report = (file: string) => {
      for (const watcher of mocks.watchers) {
        if (isWithin(file, watcher.base)) {
          watcher.create({ fsPath: file });
        }
      }
    };
    report(path.join(common, "objects", "ab", "cdef"));
    report(path.join(common, "worktrees", "other", "HEAD"));
    report(path.join(common, "HEAD"));
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(mocks.notify).not.toHaveBeenCalled();
    report(path.join(gitDir, "MERGE_HEAD"));
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(mocks.notify).toHaveBeenCalledOnce();
  });

  it("does not add Git directory watchers for a repository that is no longer selected", async () => {
    selectWatchedRepo(worktree, "git");
    selectWatchedRepo(main, "git");
    await waitForWatchers(2);
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(mocks.watchers.map((watcher) => watcher.base)).toEqual([
      main,
      fs.realpathSync(path.join(main, ".git"))
    ]);
  });
});
