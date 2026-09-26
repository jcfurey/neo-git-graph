import path from "node:path";

import { defineConfig } from "vitest/config";

const alias = [
  { find: /^@\//, replacement: path.resolve(__dirname, "src") + "/" },
  { find: /^@tests\//, replacement: path.resolve(__dirname, "tests") + "/" }
];

export default defineConfig({
  test: {
    // Measured with `pnpm run test:coverage`, which CI runs on Linux.
    coverage: {
      provider: "v8",
      include: ["src/webview/lib/menus.tsx"],
      reporter: ["text"],
      thresholds: { "src/webview/lib/menus.tsx": { functions: 80 } }
    },
    projects: [
      {
        resolve: { alias },
        test: {
          name: "backend",
          // Real Git workflows need additional process-launch time on Windows runners.
          testTimeout: 30000,
          hookTimeout: 30000,
          include: ["tests/backend/**/*.test.ts"],
          setupFiles: ["tests/git-config.ts"]
        }
      },
      {
        resolve: {
          alias: [
            ...alias,
            {
              find: "vscode",
              replacement: path.resolve(__dirname, "tests/extension/__mocks__/vscode.ts")
            }
          ]
        },
        test: {
          name: "extension",
          include: ["tests/extension/**/*.test.ts"],
          setupFiles: ["tests/git-config.ts"]
        }
      },
      {
        resolve: { alias },
        test: {
          name: "webview",
          include: ["tests/webview/**/*.test.ts"],
          setupFiles: ["tests/webview/setup.ts"]
        }
      }
    ]
  }
});
