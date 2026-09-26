import * as fs from "node:fs";
import * as path from "node:path";

import { afterEach, beforeEach, expect, it } from "vitest";

import { pushBranch, fetchRemote } from "@/backend/actions/remote";
import { createGit } from "@/backend/gitClient";

import { git, gitOutput, makeRepo } from "@tests/backend/helpers";

let repo: string;
let marker: string;
// Some environments already set it; the extension must not depend on that.
const inheritedPrompt = process.env.GIT_TERMINAL_PROMPT;

/** A remote whose SSH connection records Git's prompt setting and then never answers. */
beforeEach(() => {
  delete process.env.GIT_TERMINAL_PROMPT;
  repo = makeRepo();
  marker = path.join(repo, ".git", "ssh-started");
  const target = marker.split(path.sep).join("/");
  git(["remote", "add", "origin", "ssh://git@example.invalid/repository.git"], repo);
  git(
    ["config", "core.sshCommand", `echo "$GIT_TERMINAL_PROMPT" > "${target}"; sleep 20; :`],
    repo
  );
});
afterEach(() => {
  if (inheritedPrompt !== undefined) {
    process.env.GIT_TERMINAL_PROMPT = inheritedPrompt;
  }
  fs.rmSync(repo, { recursive: true, force: true, maxRetries: 5 });
});

async function started() {
  for (let attempt = 0; attempt < 100 && !fs.existsSync(marker); attempt++) {
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  expect(fs.existsSync(marker)).toBe(true);
}

it.each([
  [
    "fetch",
    (client: ReturnType<typeof createGit>) =>
      fetchRemote(client, { requestId: "", remote: "origin", prune: false })
  ],
  [
    "push",
    (client: ReturnType<typeof createGit>) =>
      pushBranch(client, {
        requestId: "",
        branchName: "main",
        remote: "origin",
        remoteBranch: "main",
        setUpstream: false
      })
  ]
])(
  "stops a stalled %s without a terminal prompt",
  async (_name, run) => {
    const controller = new AbortController();
    const action = run(createGit(repo, "git", controller.signal));
    const outcome = action.then(
      () => "finished",
      () => "stopped"
    );
    await started();
    expect(fs.readFileSync(marker, "utf8").trim()).toBe("0");
    const stoppedAt = Date.now();
    controller.abort();
    expect(await outcome).toBe("stopped");
    expect(Date.now() - stoppedAt).toBeLessThan(5000);
    expect(gitOutput(["for-each-ref", "refs/remotes"], repo)).toBe("");
  },
  20_000
);
