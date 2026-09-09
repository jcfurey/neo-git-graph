import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { simpleGit } from "simple-git";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { runRepositoryAction } from "@/backend/actions/repository";
import {
  loadBatchPlan,
  loadComparison,
  loadHistory,
  loadReflog,
  loadRestorePlan,
  loadStagedPlan
} from "@/backend/queries/history";
import { loadOperation, repositoryQuery } from "@/backend/queries/repository";
import { loadWorkspace } from "@/backend/queries/workspace";
import type { HistoryFilter, RepositoryAction } from "@/backend/types";

import { makeRepo } from "@tests/backend/helpers";

let repo: string;
let dirs: string[];
const read = (args: string[], cwd = repo) =>
  execFileSync("git", args, { cwd, stdio: "pipe" }).toString().trim();
const run = (action: RepositoryAction) =>
  runRepositoryAction(simpleGit({ baseDir: repo, trimmed: false }), action);
const git = () => simpleGit({ baseDir: repo, trimmed: false });
const filter = (patch: Partial<HistoryFilter> = {}): HistoryFilter => ({
  text: "",
  author: "",
  since: "",
  until: "",
  path: "",
  revision: "",
  follow: false,
  ...patch
});
function commit(file: string, contents: string | Buffer, message: string, cwd = repo) {
  fs.writeFileSync(path.join(cwd, file), contents);
  read(["add", "--", file], cwd);
  read(["commit", "-m", message], cwd);
  return read(["rev-parse", "HEAD"], cwd);
}
beforeEach(() => {
  repo = makeRepo();
  dirs = [repo];
});
afterEach(() => {
  vi.unstubAllEnvs();
  for (const dir of dirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("history inspection", () => {
  it("handles unborn repositories, ordinary hexadecimal words and invalid calendar dates", async () => {
    const wanted = commit("word", "word", "a dead branch");
    expect((await loadHistory(git(), filter({ text: "dead" }), 0)).entries[0]?.hash).toBe(wanted);
    await expect(loadHistory(git(), filter({ since: "2026-02-31" }), 0)).rejects.toThrow("dates");
    read(["checkout", "--orphan", "unborn"]);
    read(["branch", "-D", "main"]);
    expect(await loadHistory(git(), filter(), 0)).toEqual({ entries: [], more: false });
  });
  it("searches beyond the first page with literal message/author filters and SHA lookup", async () => {
    const wanted = commit("old", "old", "needle [literal]");
    for (let index = 0; index < 105; index++) {
      read(["commit", "--allow-empty", "-m", "later " + index]);
    }
    const first = await loadHistory(git(), filter(), 0);
    expect(first.entries).toHaveLength(100);
    expect(first.more).toBe(true);
    expect((await loadHistory(git(), filter(), 100)).entries).toHaveLength(7);
    expect(
      (await loadHistory(git(), filter({ text: "[literal]", author: "t@t.com" }), 0)).entries.map(
        (entry) => entry.hash
      )
    ).toEqual([wanted]);
    expect(
      (await loadHistory(git(), filter({ text: wanted.slice(0, 10) }), 0)).entries[0]?.hash
    ).toBe(wanted);
    await expect(loadHistory(git(), filter({ since: "--all" }), 0)).rejects.toThrow("dates");
    await expect(
      loadHistory(git(), filter({ since: "2026-09-10", until: "2026-09-01" }), 0)
    ).rejects.toThrow("start date");
  });

  it("follows renames and preserves unusual file names", async () => {
    const before = process.platform === "win32" ? "old [name] file.txt" : "old\tname\nfile.txt";
    const after = "new [name].txt";
    const first = commit(before, "old", "old name");
    read(["mv", "--", before, after]);
    read(["commit", "-m", "rename file"]);
    commit(after, "new", "edit new name");
    const result = await loadHistory(git(), filter({ path: after, follow: true }), 0);
    expect(result.entries).toHaveLength(3);
    expect(result.entries.at(-1)).toMatchObject({ hash: first, filePath: before });
    expect(result.entries[1]).toMatchObject({
      filePath: after,
      previousPath: before,
      change: "R100"
    });
  });

  it("compares endpoints and changes since a common ancestor with unique commits", async () => {
    const base = read(["rev-parse", "HEAD"]);
    read(["checkout", "-b", "left"]);
    const left = commit("left", "left", "left only");
    read(["checkout", "-b", "right", base]);
    const right = commit("right", "right", "right only");
    const endpoints = await loadComparison(git(), "left", "right", false);
    expect(endpoints.files.map((file) => file.status).toSorted()).toEqual(["A", "D"]);
    const contribution = await loadComparison(git(), "left", "right", true);
    expect(contribution.base).toBe(base);
    expect(contribution.files).toEqual([{ status: "A", before: "right", after: "right" }]);
    expect(contribution.leftOnly.entries.map((entry) => entry.hash)).toEqual([left]);
    expect(contribution.rightOnly.entries.map((entry) => entry.hash)).toEqual([right]);
  });

  it("recovers a reflog commit into a new branch without changing HEAD", async () => {
    const lost = commit("lost", "lost", "recover me");
    read(["reset", "--hard", "HEAD^"]);
    const head = read(["rev-parse", "HEAD"]);
    expect(
      (await loadReflog(git(), 0)).entries.some((entry) => entry.hash === lost && entry.date > 0)
    ).toBe(true);
    await run({ kind: "recoverBranch", hash: lost, name: "recovered" });
    expect(read(["rev-parse", "recovered"])).toBe(lost);
    expect(read(["rev-parse", "HEAD"])).toBe(head);
    await expect(run({ kind: "recoverBranch", hash: lost, name: "recovered" })).rejects.toThrow();
  });
});

describe("file restoration", () => {
  it("restores binary content to the current name while preserving staged changes", async () => {
    const bytes = Buffer.from([0, 255, 128, 10, 42]);
    const original = commit("before.bin", bytes, "binary original");
    read(["mv", "before.bin", "after.bin"]);
    read(["commit", "-m", "rename"]);
    fs.writeFileSync(path.join(repo, "after.bin"), "staged");
    read(["add", "after.bin"]);
    fs.writeFileSync(path.join(repo, "after.bin"), "unstaged");
    const index = read(["write-tree"]);
    const plan = await loadRestorePlan(git(), original, "before.bin", "after.bin");
    expect(plan.dirty).toBe(true);
    await run({ kind: "restoreFile", plan });
    expect(fs.readFileSync(path.join(repo, "after.bin"))).toEqual(bytes);
    expect(read(["write-tree"])).toBe(index);
    expect(fs.existsSync(path.join(repo, "before.bin"))).toBe(false);
  });

  it("refuses stale previews and paths through a symlink or outside the repository", async () => {
    const plan = await loadRestorePlan(git(), "HEAD", "f", "f");
    fs.writeFileSync(path.join(repo, "f"), "new local edits");
    await expect(run({ kind: "restoreFile", plan })).rejects.toThrow("changed");
    await expect(loadRestorePlan(git(), "HEAD", "f", "../outside")).rejects.toThrow("inside");
    await expect(loadRestorePlan(git(), "HEAD", "f", ".git/config")).rejects.toThrow("inside");
    fs.symlinkSync(
      path.dirname(repo),
      path.join(repo, "link"),
      process.platform === "win32" ? "junction" : "dir"
    );
    await expect(loadRestorePlan(git(), "HEAD", "f", "link/outside")).rejects.toThrow(
      "normal directory"
    );
    expect(fs.readFileSync(path.join(repo, "f"), "utf8")).toBe("new local edits");
  });
});

describe("ordered actions and fixup", () => {
  it("uses the submitted order for multiple cherry-picks and reverts", async () => {
    const base = read(["rev-parse", "HEAD"]);
    read(["checkout", "-b", "topic"]);
    const first = commit("a", "a", "first");
    const second = commit("b", "b", "second");
    read(["checkout", "main"]);
    await run({
      kind: "batch",
      operation: "cherry-pick",
      plan: await loadBatchPlan(git(), [second, first]),
      mainline: 0
    });
    expect(read(["log", "-2", "--reverse", "--format=%s"]).split("\n")).toEqual([
      "second",
      "first"
    ]);
    const picks = read(["rev-list", base + "..HEAD"]).split("\n");
    await run({
      kind: "batch",
      operation: "revert",
      plan: await loadBatchPlan(git(), picks),
      mainline: 0
    });
    expect(read(["diff", base, "HEAD"])).toBe("");
  });

  it("keeps the Git sequencer for conflict recovery across a batch", async () => {
    read(["checkout", "-b", "topic"]);
    const first = commit("f", "topic", "conflict");
    const second = commit("b", "b", "after conflict");
    read(["checkout", "main"]);
    commit("f", "main", "main edit");
    await expect(
      run({
        kind: "batch",
        operation: "cherry-pick",
        plan: await loadBatchPlan(git(), [first, second]),
        mainline: 0
      })
    ).rejects.toThrow();
    const operation = await loadOperation(git());
    expect(operation?.kind).toBe("cherry-pick");
    fs.writeFileSync(path.join(repo, "f"), "resolved");
    read(["add", "f"]);
    await run({ kind: "recover", operation: operation!, resolution: "continue" });
    expect(read(["log", "-1", "--format=%s"])).toBe("after conflict");
    expect(await loadOperation(git())).toBeNull();
  });

  it("accepts a mainline for a batch mixing merge and ordinary commits", async () => {
    const base = read(["rev-parse", "HEAD"]);
    read(["checkout", "-b", "side"]);
    commit("side", "side", "side");
    read(["checkout", "-b", "topic", base]);
    commit("topic", "topic", "topic");
    read(["merge", "--no-ff", "--no-edit", "side"]);
    const merge = read(["rev-parse", "HEAD"]);
    const normal = commit("normal", "normal", "normal");
    read(["checkout", "main"]);
    await run({
      kind: "batch",
      operation: "cherry-pick",
      plan: await loadBatchPlan(git(), [merge, normal]),
      mainline: 1
    });
    expect(fs.existsSync(path.join(repo, "side"))).toBe(true);
    expect(fs.existsSync(path.join(repo, "normal"))).toBe(true);
  });

  it("rejects a batch after HEAD changes", async () => {
    const target = commit("a", "a", "a");
    const plan = await loadBatchPlan(git(), [target]);
    commit("b", "b", "b");
    await expect(run({ kind: "batch", operation: "revert", plan, mainline: 0 })).rejects.toThrow();
  });

  it("creates a staged fixup and autosquashes it into the selected commit", async () => {
    const base = read(["rev-parse", "HEAD"]);
    const target = commit("a", "a", "target change");
    commit("b", "b", "unrelated change");
    fs.writeFileSync(path.join(repo, "a"), "fixed");
    read(["add", "a"]);
    await run({ kind: "fixup", plan: await loadStagedPlan(git(), target) });
    expect(read(["log", "-1", "--format=%s"])).toBe("fixup! target change");
    const data = await repositoryQuery(git(), { kind: "rebasePlan", base, autosquash: true });
    if (data.kind !== "rebasePlan") {
      throw new Error("No plan");
    }
    expect(data.plan.entries.map((entry) => entry.action)).toEqual(["pick", "fixup", "pick"]);
    await run({ kind: "interactiveRebase", plan: data.plan });
    expect(read(["rev-list", "--count", base + "..HEAD"])).toBe("2");
    expect(read(["log", "--reverse", "--format=%s", base + "..HEAD"])).toBe(
      "target change\nunrelated change"
    );
    expect(fs.readFileSync(path.join(repo, "a"), "utf8")).toBe("fixed");
  });

  it("rejects a fixup when the index changes after its preview", async () => {
    fs.writeFileSync(path.join(repo, "f"), "first");
    read(["add", "f"]);
    const plan = await loadStagedPlan(git(), "HEAD");
    fs.writeFileSync(path.join(repo, "f"), "second");
    read(["add", "f"]);
    await expect(run({ kind: "fixup", plan })).rejects.toThrow("changed");
  });
});

describe("workspace overview", () => {
  it("shows nested, moved and uninitialized submodules and initializes their recorded revisions", async () => {
    vi.stubEnv("GIT_CONFIG_COUNT", "1");
    vi.stubEnv("GIT_CONFIG_KEY_0", "protocol.file.allow");
    vi.stubEnv("GIT_CONFIG_VALUE_0", "always");
    const child = makeRepo();
    const nested = makeRepo();
    dirs.push(child, nested);
    read(["submodule", "add", nested, "nested module"], child);
    read(["commit", "-am", "nested"], child);
    read(["submodule", "add", child, "module"]);
    read(["commit", "-am", "module"]);
    const initial = await loadWorkspace([repo, path.join(repo, "module")], "git");
    expect(initial).toHaveLength(3);
    expect(initial.find((entry) => entry.submodulePath === "nested module")?.initialized).toBe(
      false
    );
    const module = initial.find((entry) => entry.submodulePath === "module")!;
    await run({
      kind: "submodule",
      operation: "initialize",
      path: "module",
      recorded: module.recorded!
    });
    expect((await loadWorkspace([repo], "git")).every((entry) => entry.initialized)).toBe(true);
    read(["checkout", "HEAD^"], path.join(repo, "module"));
    const moved = (await loadWorkspace([repo], "git")).find(
      (entry) => entry.submodulePath === "module"
    )!;
    expect(moved.head).not.toBe(moved.recorded);
    await run({
      kind: "submodule",
      operation: "update",
      path: "module",
      recorded: moved.recorded!
    });
    expect(read(["rev-parse", "HEAD"], path.join(repo, "module"))).toBe(moved.recorded);
    const childGit = read(["rev-parse", "--absolute-git-dir"], path.join(repo, "module"));
    fs.writeFileSync(path.join(childGit, "MERGE_HEAD"), moved.recorded! + "\n");
    await expect(
      run({ kind: "submodule", operation: "update", path: "module", recorded: moved.recorded! })
    ).rejects.toThrow("progress");
    fs.rmSync(path.join(childGit, "MERGE_HEAD"));
    await run({ kind: "submodule", operation: "sync", path: "module", recorded: moved.recorded! });
    await expect(
      run({ kind: "submodule", operation: "update", path: "module", recorded: "0".repeat(40) })
    ).rejects.toThrow("changed");
  });
});
