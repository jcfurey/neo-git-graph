import type { SimpleGit, SimpleGitOptions } from "simple-git";
import { simpleGit as createSimpleGit } from "simple-git";

/**
 * simple-git for the configured Git executable. The executable comes from VS Code's Git extension
 * or the user's `git.path`, and can contain spaces or parentheses, as in
 * `C:\Program Files\Git\cmd\git.exe`. simple-git rejects such paths unless allowed, and then warns
 * on every client it creates.
 */
export function simpleGit(options: Partial<SimpleGitOptions>): SimpleGit {
  // eslint-disable-next-line no-console
  const warn = console.warn;
  // eslint-disable-next-line no-console
  console.warn = () => {};
  try {
    return createSimpleGit({ ...options, unsafe: { allowUnsafeCustomBinary: true } });
  } finally {
    // eslint-disable-next-line no-console
    console.warn = warn;
  }
}
