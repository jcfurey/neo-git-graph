import { execFile } from "node:child_process";
import { promisify } from "node:util";

import type { SimpleGit } from "simple-git";

import { gitProcessOf, PARSED_OUTPUT_ARGS } from "@/backend/gitClient";

const execute = promisify(execFile);

/**
 * Run Git with exact exit-code handling, for commands with editors or stdout-only failures, and
 * for network commands. Git never prompts on a terminal, which nobody can answer here; it fails
 * instead. Cancelling the client's abort signal stops the process.
 */
export async function runGit(
  git: SimpleGit,
  args: string[],
  binary = gitProcessOf(git)?.gitPath ?? "git",
  env: NodeJS.ProcessEnv = process.env
) {
  const cwd = (await git.raw(["rev-parse", "--show-toplevel"])).replace(/\n$/, "");
  const signal = gitProcessOf(git)?.abort;
  try {
    return (
      await execute(binary, [...PARSED_OUTPUT_ARGS, ...args], {
        cwd,
        env: { ...env, GIT_TERMINAL_PROMPT: "0" },
        windowsHide: true,
        maxBuffer: 16 * 1024 * 1024,
        ...(signal ? { signal } : {})
      })
    ).stdout;
  } catch (error) {
    const result = error as Error & { stdout?: string; stderr?: string };
    throw new Error([result.stdout, result.stderr].filter(Boolean).join("\n") || result.message, {
      cause: error
    });
  }
}

/** Store `content` byte for byte as a Git blob, without filters, and return its object ID. */
export async function writeBlob(git: SimpleGit, content: Buffer) {
  const cwd = (await git.raw(["rev-parse", "--show-toplevel"])).replace(/\n$/, "");
  const run = execute(
    gitProcessOf(git)?.gitPath ?? "git",
    [...PARSED_OUTPUT_ARGS, "hash-object", "-w", "--no-filters", "--stdin"],
    { cwd, env: { ...process.env, GIT_TERMINAL_PROMPT: "0" }, windowsHide: true }
  );
  run.child.stdin?.end(content);
  return (await run).stdout.trim();
}

/** A blob's exact bytes, which a string result would corrupt for binary files. */
export async function readBlob(git: SimpleGit, blob: string): Promise<Buffer> {
  const cwd = (await git.raw(["rev-parse", "--show-toplevel"])).replace(/\n$/, "");
  const { stdout } = await execute(
    gitProcessOf(git)?.gitPath ?? "git",
    [...PARSED_OUTPUT_ARGS, "cat-file", "blob", blob],
    { cwd, encoding: "buffer", windowsHide: true, maxBuffer: 1024 * 1024 * 1024 }
  );
  return stdout;
}
