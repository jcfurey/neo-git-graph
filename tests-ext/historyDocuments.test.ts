import * as assert from "node:assert";
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import * as vscode from "vscode";

import { gitClientFactory } from "@/backend/gitClient";
import {
  decodeDiffDocUri,
  DiffDocProvider,
  encodeDiffDocUri
} from "@/old-extension/diffDocProvider";

suite("History documents", () => {
  test("round-trips reserved URI characters in repository and file paths", () => {
    const repo = "/tmp/repo #? with spaces";
    const file = "folder/odd #?\tname.txt";
    const uri = vscode.Uri.parse(encodeDiffDocUri(repo, file, "a".repeat(40)).toString());
    assert.deepStrictEqual(decodeDiffDocUri(uri), { repo, filePath: file, commit: "a".repeat(40) });
  });

  test("loads simultaneous comparisons from their own repositories", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "ngg-document-"));
    const file = "file # with spaces.txt";
    const repos = [path.join(root, "first"), path.join(root, "second")];
    const provider = new DiffDocProvider(
      () => {
        throw new Error("A comparison must use its bound client");
      },
      (repo) => gitClientFactory(repo, "git").getInstance()
    );
    try {
      for (const [index, repo] of repos.entries()) {
        fs.mkdirSync(repo);
        const git = (...args: string[]) => execFileSync("git", args, { cwd: repo, stdio: "pipe" });
        git("init", "-b", "main");
        git("config", "user.name", "History Test");
        git("config", "user.email", "history@example.invalid");
        git("config", "commit.gpgsign", "false");
        fs.writeFileSync(path.join(repo, file), "repository " + index);
        git("add", "--", file);
        git("commit", "-m", "initial");
      }
      const contents = await Promise.all(
        repos.map((repo) =>
          provider.provideTextDocumentContent(encodeDiffDocUri(repo, file, "HEAD"))
        )
      );
      assert.deepStrictEqual(contents, ["repository 0", "repository 1"]);
    } finally {
      provider.dispose();
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
