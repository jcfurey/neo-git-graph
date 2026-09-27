import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ExtensionContext } from "vscode";

import { ExtensionState } from "@/old-extension/extensionState";

const tick = (ms = 150) => new Promise<void>((r) => setTimeout(r, ms));

function memento(values: Record<string, unknown> = {}) {
  return {
    get: vi.fn((key: string, def?: unknown) => (key in values ? values[key] : def)),
    update: vi.fn(() => Promise.resolve())
  };
}

let storage: string;

beforeEach(() => {
  storage = fs.mkdtempSync(path.join(os.tmpdir(), "ngg-state-"));
});

afterEach(() => {
  fs.rmSync(storage, { recursive: true, force: true });
});

function createState(globalState = memento()) {
  return new ExtensionState({
    globalState,
    workspaceState: memento(),
    globalStoragePath: storage
  } as unknown as ExtensionContext);
}

describe("ExtensionState", () => {
  it("removes the avatar cache that earlier versions kept", async () => {
    const avatars = path.join(storage, "avatars");
    fs.mkdirSync(avatars);
    fs.writeFileSync(path.join(avatars, "author.png"), "");
    const globalState = memento({ avatarCache: { "author@example.com": {} } });

    createState(globalState);

    await vi.waitFor(() => expect(fs.existsSync(avatars)).toBe(false));
    expect(globalState.update).toHaveBeenCalledWith("avatarCache", undefined);
  });

  it("does not create an avatar folder in global storage", async () => {
    const globalState = memento();

    createState(globalState);
    await tick();

    expect(fs.readdirSync(storage)).toEqual([]);
    expect(globalState.update).not.toHaveBeenCalled();
  });
});
