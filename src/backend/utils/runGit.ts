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
