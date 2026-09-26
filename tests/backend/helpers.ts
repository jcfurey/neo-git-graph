import * as cp from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { afterEach, beforeEach } from "vitest";

export function git(args: string[], cwd: string) {
  cp.execFileSync("git", args, { cwd, stdio: "pipe" });
}

/** Git's trimmed output. */
export function gitOutput(args: string[], cwd: string) {
  return cp.execFileSync("git", args, { cwd, stdio: "pipe" }).toString().trim();
}

/** Short names of the refs below a namespace, such as `refs/tags/`, in sorted order. */
export function refNames(namespace: string, cwd: string) {
  return gitOutput(["for-each-ref", "--format=%(refname:lstrip=2)", namespace], cwd)
    .split("\n")
    .filter(Boolean);
}

/**
 * A new repository for every test in the calling file, so tests cannot depend on each other's
 * changes. `setup` prepares each one. Read the current repository through the returned function.
 */
export function freshRepo(setup?: (repo: string) => void) {
  let repo = "";
  beforeEach(() => {
    repo = makeRepo();
    setup?.(repo);
  });
  afterEach(() => {
    fs.rmSync(repo, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });
  return () => repo;
}

export function makeRepo(): string {
  const dir = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "ngg-test-")));
  try {
    git(["init", "-b", "main"], dir);
  } catch {
    git(["init"], dir);
    git(["checkout", "-b", "main"], dir);
  }
  git(["config", "user.email", "t@t.com"], dir);
  git(["config", "user.name", "T"], dir);
  git(["config", "commit.gpgsign", "false"], dir);
  git(["config", "tag.gpgsign", "false"], dir);
  fs.writeFileSync(path.join(dir, "f"), "x");
  git(["add", "."], dir);
  git(["commit", "-m", "init"], dir);
  return dir;
}
