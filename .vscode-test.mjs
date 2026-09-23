import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { basename, join, resolve as resolvePath } from "node:path";

import { defineConfig } from "@vscode/test-cli";

const manifest = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));
const minimum = /^\^(\d+\.\d+\.\d+)$/.exec(manifest.engines.vscode)?.[1];
if (!minimum) {
  throw new Error(
    "Update minimum-version resolution for engines.vscode: " + manifest.engines.vscode
  );
}
const requested = process.env.NGG_VSCODE_VERSION || "stable";
const version = requested === "minimum" ? minimum : requested;
const artifacts = resolvePath(process.env.NGG_ARTIFACTS || "test-results");
// Each run gets a disposable repository and a free debugger port, including on CI.
// macOS's default temp path can exceed VS Code's 103-byte IPC socket path limit.
const tempRoot = process.platform === "darwin" ? "/tmp" : tmpdir();
const runRoot = realpathSync.native(mkdtempSync(join(tempRoot, "ngg-extension-tests-")));
const workspaceFolder = join(runRoot, "workspace");
const logs = join(artifacts, "vscode-logs", basename(runRoot));
mkdirSync(logs, { recursive: true });
execFileSync("git", ["init", "-b", "main", workspaceFolder], { stdio: "pipe" });
process.once("exit", () =>
  rmSync(runRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
);
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
  version,
  ...(process.env.NGG_VSCODE_PATH
    ? { useInstallation: { fromPath: process.env.NGG_VSCODE_PATH } }
    : {}),
  env: {
    NGG_CDP_PORT: String(port),
    NGG_ARTIFACTS: artifacts,
    NGG_VSCODE_LOGS: logs,
    NGG_MINIMUM_VSCODE_VERSION: minimum,
    NGG_EXPECTED_VSCODE_VERSION: version,
    NGG_EXTENSION_ID: `${manifest.publisher}.${manifest.name}`
  },
  launchArgs: [
    "--disable-gpu",
    "--skip-welcome",
    "--skip-release-notes",
    "--disable-workspace-trust",
    "--locale=en",
    `--user-data-dir=${join(runRoot, "user-data")}`,
    `--extensions-dir=${join(runRoot, "extensions")}`,
    `--logsPath=${logs}`,
    `--remote-debugging-port=${port}`,
    ...(process.env.NGG_HEADLESS === "1" ? ["--ozone-platform=headless"] : [])
  ],
  mocha: { timeout: 30000 }
});
