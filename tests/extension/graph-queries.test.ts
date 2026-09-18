import { beforeEach, expect, it, vi } from "vitest";

import type { QueryResult } from "@/backend/types";
import { registerMessageHandlers } from "@/old-extension/messageHandler";

const mocks = vi.hoisted(() => ({
  factory: vi.fn(),
  commits: vi.fn(),
  branches: vi.fn(),
  details: vi.fn()
}));
vi.mock("@/backend/gitClient", () => ({ gitClientFactory: mocks.factory }));
vi.mock("@/backend/queries/loadCommits", () => ({ loadCommits: mocks.commits }));
vi.mock("@/backend/queries/loadBranches", () => ({ loadBranches: mocks.branches }));
vi.mock("@/backend/queries/commitDetails", () => ({ commitDetails: mocks.details }));

beforeEach(() => {
  vi.resetAllMocks();
  mocks.factory.mockImplementation((repo: string, _binary: string, signal: AbortSignal) => ({
    getInstance: () => ({ repo, signal })
  }));
});

function setup() {
  const handlers = new Map<string, (message: unknown) => void | Promise<void>>();
  const post = vi.fn();
  const lifetime = registerMessageHandlers(
    {
      post,
      onMessage: (command: string, handler: (message: unknown) => void | Promise<void>) =>
        handlers.set(command, handler)
    } as unknown as Parameters<typeof registerMessageHandlers>[0],
    {
      config: {
        gitPath: () => "git",
        dateType: () => "Author Date",
        showUncommittedChanges: () => true
      },
      gitClient: { setRepo: vi.fn() },
      extensionState: { setLastActiveRepo: vi.fn() }
    } as unknown as Parameters<typeof registerMessageHandlers>[1]
  );
  return {
    post,
    lifetime,
    receive: (message: { command: string; [key: string]: unknown }) =>
      handlers.get(message.command)!(message)
  };
}

const commitsRequest = {
  command: "loadCommits",
  repo: "/repo",
  requestId: "first",
  branchName: "",
  maxCommits: 300,
  hiddenRemotes: [],
  showRemoteBranches: true,
  visibilityKey: "visible",
  hard: true
};
const emptyCommits = {
  commits: [],
  head: null,
  moreCommitsAvailable: false,
  hard: true,
  uncommittedChanges: 0
};

it("aborts superseded graph reads and echoes identity only for the latest reply", async () => {
  const { post, lifetime, receive } = setup();
  const first = Promise.withResolvers<typeof emptyCommits>();
  const second = Promise.withResolvers<typeof emptyCommits>();
  mocks.commits.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
  const oldRead = receive(commitsRequest);
  const newRead = receive({ ...commitsRequest, requestId: "second", maxCommits: 400 });
  expect(mocks.commits.mock.calls[0]?.[0].signal.aborted).toBe(true);
  expect(mocks.commits.mock.calls[1]?.[0].signal.aborted).toBe(false);
  // Even a query that finishes despite cancellation must never post its stale result.
  second.resolve(emptyCommits);
  await newRead;
  first.resolve(emptyCommits);
  await oldRead;
  expect(post).toHaveBeenCalledExactlyOnceWith({
    command: "loadCommits",
    repo: "/repo",
    requestId: "second",
    branchName: "",
    visibilityKey: "visible",
    ...emptyCommits
  });
  lifetime.dispose();
});

it("cancels reads across repository changes and panel disposal", async () => {
  const { post, lifetime, receive } = setup();
  const first = Promise.withResolvers<typeof emptyCommits>();
  const second = Promise.withResolvers<typeof emptyCommits>();
  mocks.commits.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
  const oldRead = receive(commitsRequest);
  await receive({ command: "selectRepo", repo: "/other" });
  expect(mocks.commits.mock.calls[0]?.[0].signal.aborted).toBe(true);
  const newRead = receive({ ...commitsRequest, repo: "/other", requestId: "second" });
  first.reject(new Error("cancelled"));
  await oldRead;
  lifetime.dispose();
  expect(mocks.commits.mock.calls[1]?.[0].signal.aborted).toBe(true);
  second.resolve(emptyCommits);
  await newRead;
  expect(post).not.toHaveBeenCalled();
});

it("keeps branch and commit reads independent and preserves branch response identity", async () => {
  const { post, lifetime, receive } = setup();
  const branchRead = Promise.withResolvers<QueryResult<"loadBranches">>();
  mocks.branches.mockReturnValue(branchRead.promise);
  const pending = receive({ ...commitsRequest, command: "loadBranches", requestId: "branches" });
  mocks.commits.mockResolvedValue(emptyCommits);
  await receive(commitsRequest);
  expect(mocks.branches.mock.calls[0]?.[0].signal.aborted).toBe(false);
  branchRead.resolve({ repo: "/repo", branches: ["main"], head: "main", hard: true, isRepo: true });
  await pending;
  expect(post).toHaveBeenCalledWith(
    expect.objectContaining({ command: "loadBranches", requestId: "branches", repo: "/repo" })
  );
  lifetime.dispose();
});

it("cancels obsolete details queries and includes identity on a current details error", async () => {
  const { post, lifetime, receive } = setup();
  const first = Promise.withResolvers<QueryResult<"commitDetails">>();
  mocks.details.mockReturnValueOnce(first.promise).mockResolvedValueOnce({ commitDetails: null });
  const oldRead = receive({
    command: "commitDetails",
    repo: "/repo",
    requestId: "first",
    commitHash: "old"
  });
  await receive({
    command: "commitDetails",
    repo: "/repo",
    requestId: "second",
    commitHash: "new"
  });
  expect(mocks.details.mock.calls[0]?.[0].signal.aborted).toBe(true);
  first.resolve({ commitDetails: null });
  await oldRead;
  expect(post).toHaveBeenCalledExactlyOnceWith({
    command: "commitDetails",
    requestId: "second",
    repo: "/repo",
    commitDetails: null
  });
  lifetime.dispose();
});
