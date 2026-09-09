import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve as resolvePath } from "node:path";

import { defineConfig } from "@vscode/test-cli";

// Each run gets a disposable repository and a free debugger port, including on CI.
const workspaceFolder = mkdtempSync(join(tmpdir(), "ngg-extension-tests-"));
execFileSync("git", ["init", "-b", "main", workspaceFolder], { stdio: "pipe" });
process.once("exit", () => rmSync(workspaceFolder, { recursive: true, force: true }));
const server = createServer();
await new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", resolve);
});
const port = server.address().port;
await new Promise((resolve, reject) =>
  server.close((error) => (error ? reject(error) : resolve()))
);

export default defineConfig({
  files: ["tests-ext/out/**/*.test.js", "tests-ext/ui/**/*.test.cjs"],
  workspaceFolder,
  version: "stable",
  ...(process.env.NGG_VSCODE_PATH
    ? { useInstallation: { fromPath: process.env.NGG_VSCODE_PATH } }
    : {}),
  env: { NGG_CDP_PORT: String(port), NGG_ARTIFACTS: resolvePath("test-results") },
  launchArgs: [
    "--disable-gpu",
    "--skip-welcome",
    "--skip-release-notes",
    "--disable-workspace-trust",
    "--locale=en",
    `--remote-debugging-port=${port}`,
    ...(process.env.NGG_HEADLESS === "1" ? ["--ozone-platform=headless"] : [])
  ],
  mocha: { timeout: 30000 }
});
