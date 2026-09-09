import { execFile } from "node:child_process";
import { promisify } from "node:util";

import type { SimpleGit } from "simple-git";

const execute = promisify(execFile);

/** Commands with editors or stdout-only failures need exact exit-code handling. */
export async function runGit(git: SimpleGit, args: string[], binary: string, env = process.env) {
  const cwd = (await git.raw(["rev-parse", "--show-toplevel"])).replace(/\n$/, "");
  try {
    return (
      await execute(binary, args, { cwd, env, windowsHide: true, maxBuffer: 16 * 1024 * 1024 })
    ).stdout;
  } catch (error) {
    const result = error as Error & { stdout?: string; stderr?: string };
    throw new Error([result.stdout, result.stderr].filter(Boolean).join("\n") || result.message, {
      cause: error
    });
  }
}
