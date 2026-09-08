import { expect, it, vi } from "vitest";

import { registerMessageHandlers } from "@/extension/messageHandler";

const mocks = vi.hoisted(() => ({ factory: vi.fn(), push: vi.fn() }));
vi.mock("vscode", () => ({
  window: {
    createOutputChannel: () => ({
      appendLine: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    })
  }
}));
vi.mock("@/backend/gitClient", () => ({ gitClientFactory: mocks.factory }));
vi.mock("@/backend/actions/remote", () => ({
  pushBranch: mocks.push,
  pullBranch: vi.fn(),
  fetchRemote: vi.fn()
}));

it("runs an action against its requested repository even if the selected repository changes", async () => {
  const handlers = new Map<string, (msg: unknown) => void | Promise<void>>();
  const post = vi.fn();
  const boundGit = { repo: "/original-repo" };
  mocks.factory.mockReturnValue({ getInstance: () => boundGit });
  let finish!: () => void;
  mocks.push.mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      })
  );
  const bridge = {
    post,
    onMessage: (command: string, handler: (msg: unknown) => void | Promise<void>) =>
      handlers.set(command, handler)
  };
  const deps = {
    config: { gitPath: () => "git" },
    gitClient: { getInstance: () => ({ repo: "/another-repo" }), setRepo: vi.fn() },
    repoManager: {},
    avatarManager: {},
    extensionState: { setLastActiveRepo: vi.fn() },
    repoFileWatcher: { start: vi.fn() }
  };
  registerMessageHandlers(
    bridge as unknown as Parameters<typeof registerMessageHandlers>[0],
    deps as unknown as Parameters<typeof registerMessageHandlers>[1]
  );
  const request = {
    command: "pushBranch",
    repo: "/original-repo",
    requestId: "push-1",
    branchName: "main",
    remote: "origin",
    remoteBranch: "main",
    setUpstream: false
  };
  const pending = handlers.get("pushBranch")!(request);
  handlers.get("selectRepo")!({ command: "selectRepo", repo: "/another-repo" });
  finish();
  await pending;
  expect(mocks.factory).toHaveBeenCalledWith("/original-repo", "git");
  expect(mocks.push).toHaveBeenCalledWith(boundGit, request);
  expect(post).toHaveBeenCalledWith({
    command: "pushBranch",
    repo: "/original-repo",
    requestId: "push-1",
    status: null
  });
});
