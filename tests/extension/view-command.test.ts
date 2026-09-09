import { beforeEach, expect, it, vi } from "vitest";

import { createViewCommand } from "@/extension/view-command";

const mocks = vi.hoisted(() => ({
  createPanel: vi.fn(),
  notify: vi.fn(),
  disposable: () => ({ dispose: vi.fn() })
}));

vi.mock("vscode", () => ({
  window: { activeTextEditor: { viewColumn: 2 }, createWebviewPanel: mocks.createPanel },
  ViewColumn: { One: 1 },
  Uri: { joinPath: (...parts: string[]) => parts.join("/") }
}));
vi.mock("@/extension/config", () => ({ extConfig: { tabIconColourTheme: () => "colour" } }));
vi.mock("@/extension/html", () => ({ createWevbviewHtml: () => "<html>graph</html>" }));
vi.mock("@/extension/legacy", () => ({
  createMessageProtocol: () => ({ attach: mocks.disposable })
}));
vi.mock("@/extension/rpc/rpc-server", () => ({
  createRpcServer: () => ({ attach: mocks.disposable })
}));
vi.mock("@/extension/rpc/rpc-notify", () => ({
  initRpcNotify: mocks.disposable,
  rpcNotify: { notify: mocks.notify }
}));
vi.mock("@/extension/watchers/config.watcher", () => ({ initConfigWatcher: mocks.disposable }));
vi.mock("@/extension/watchers/git.watcher", () => ({ watchGitDir: mocks.disposable }));
vi.mock("@/extension/watchers/git-repo.watcher", () => ({ watchGitRepo: mocks.disposable }));

beforeEach(() => {
  vi.clearAllMocks();
});

function sourceControl(fsPath: string) {
  return { rootUri: { fsPath } } as unknown as import("vscode").SourceControl;
}

it("honors SCM clicks on a new or existing panel, including clicks before initialization", () => {
  let receive: ((message: unknown) => void) | undefined;
  const panel = {
    webview: {
      html: "",
      onDidReceiveMessage: (handler: (message: unknown) => void) => {
        receive = handler;
        return mocks.disposable();
      }
    },
    reveal: vi.fn(),
    onDidDispose: mocks.disposable
  };
  mocks.createPanel.mockReturnValue(panel);
  const command = createViewCommand({
    extensionUri: "/extension"
  } as unknown as import("vscode").ExtensionContext);
  command(sourceControl("/workspace/first"));
  command(sourceControl("/workspace/second"));
  expect(mocks.notify).not.toHaveBeenCalled();
  receive?.({ command: "viewReady" });
  expect(mocks.notify).toHaveBeenLastCalledWith("repo.select", {
    name: "second",
    path: "/workspace/second"
  });

  command(sourceControl("/workspace/first"));
  expect(mocks.notify).toHaveBeenLastCalledWith("repo.select", {
    name: "first",
    path: "/workspace/first"
  });
  command();
  expect(mocks.notify).toHaveBeenCalledTimes(2);
  expect(mocks.createPanel).toHaveBeenCalledOnce();
  expect(panel.reveal).toHaveBeenCalledTimes(3);
  expect(panel.webview.html).toBe("<html>graph</html>");
});
