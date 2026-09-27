import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { activate } from "@/main";

const mocks = vi.hoisted(() => ({
  disposable: () => ({ dispose: () => {} }),
  folders: undefined as { uri: { scheme: string; fsPath: string } }[] | undefined,
  registerCommand: vi.fn(() => ({ dispose: () => {} }))
}));

vi.mock("vscode", () => {
  const { disposable } = mocks;
  return {
    commands: { registerCommand: mocks.registerCommand },
    window: {
      createOutputChannel: () => ({
        appendLine: () => {},
        info: () => {},
        warn: () => {},
        error: () => {},
        debug: () => {},
        dispose: () => {}
      }),
      createStatusBarItem: () => ({ show: () => {}, dispose: () => {} })
    },
    workspace: {
      get workspaceFolders() {
        return mocks.folders;
      },
      getConfiguration: () => ({ get: (_key: string, def: unknown) => def }),
      registerTextDocumentContentProvider: disposable,
      onDidCloseTextDocument: disposable
    },
    EventEmitter: class {
      event = disposable;
      dispose() {}
    },
    StatusBarAlignment: { Left: 1 },
    l10n: { t: (message: string) => message }
  };
});

const manifest = JSON.parse(
  fs.readFileSync(path.join(__dirname, "../../package.json"), "utf8")
) as {
  capabilities?: Record<string, { supported: boolean }>;
  contributes: {
    commands: { command: string }[];
    menus: Record<string, { command: string; when?: string }[]>;
  };
};

let storage: string;

function memento(values: Record<string, unknown>) {
  return {
    get: (key: string, def: unknown) => values[key] ?? def,
    update: () => Promise.resolve()
  };
}

function activateWith(workspaceState: Record<string, unknown> = {}) {
  activate({
    subscriptions: [],
    extensionUri: { fsPath: "/extension" },
    globalStoragePath: storage,
    globalState: memento({}),
    workspaceState: memento(workspaceState)
  } as unknown as import("vscode").ExtensionContext);
  return mocks.registerCommand.mock.calls.map((call: unknown[]) => call[0]).toSorted();
}

const contributedCommands = manifest.contributes.commands.map((c) => c.command).toSorted();

describe("activate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storage = fs.mkdtempSync(path.join(os.tmpdir(), "ngg-activation-"));
  });

  afterEach(() => {
    fs.rmSync(storage, { recursive: true, force: true });
  });

  it("offers no commands in a window without a folder, where it does not activate", () => {
    mocks.folders = undefined;
    expect(activateWith()).toEqual([]);
    const { commandPalette = [], "scm/title": scmTitle = [] } = manifest.contributes.menus;
    for (const command of contributedCommands) {
      expect(commandPalette.find((entry) => entry.command === command)?.when).toContain(
        "workspaceFolderCount > 0"
      );
    }
    for (const entry of scmTitle) {
      expect(entry.when).toContain("workspaceFolderCount > 0");
    }
  });

  it("registers every contributed command when the last active repository was deleted", () => {
    mocks.folders = [{ uri: { scheme: "file", fsPath: storage } }];
    const lastActiveRepo = path.join(storage, "deleted");
    expect(activateWith({ lastActiveRepo })).toEqual(contributedCommands);
  });

  it("declares that virtual and untrusted workspaces are unsupported", () => {
    expect(manifest.capabilities?.virtualWorkspaces).toMatchObject({ supported: false });
    expect(manifest.capabilities?.untrustedWorkspaces).toMatchObject({ supported: false });
  });
});
