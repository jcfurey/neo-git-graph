import * as assert from "node:assert";

import { ExtensionState } from "@/old-extension/extensionState";
import { createRepoManager } from "@/old-extension/repoManager";
import { GitRepoSet } from "@/types";

function makeManager(initialRepos: GitRepoSet = {}) {
  const store = { repos: { ...initialRepos } };
  let saveCount = 0;
  const extensionState = {
    getRepos: () => store.repos,
    saveRepos: (r: GitRepoSet) => {
      store.repos = r;
      saveCount++;
    }
  };
  const manager = createRepoManager(extensionState as unknown as ExtensionState);
  return { manager, store, getSaveCount: () => saveCount };
}

suite("repoManager", () => {
  suite("addRepo", () => {
    test("adds a repo with null columnWidths", () => {
      const { manager, store } = makeManager();
      manager.addRepo("/ws/a");
      assert.deepStrictEqual(store.repos["/ws/a"], { columnWidths: null });
    });

    test("persists after adding", () => {
      const { manager, getSaveCount } = makeManager();
      manager.addRepo("/ws/a");
      assert.strictEqual(getSaveCount(), 1);
    });

    test("reports a repo that is already known", () => {
      const { manager, getSaveCount } = makeManager({ "/ws/a": { columnWidths: null } });
      assert.strictEqual(manager.addRepo("/ws/a"), false);
      assert.strictEqual(getSaveCount(), 0);
    });
  });

  suite("removeRepo", () => {
    test("removes an existing repo", () => {
      const { manager, store } = makeManager({ "/ws/a": { columnWidths: null } });
      manager.removeRepo("/ws/a");
      assert.strictEqual(store.repos["/ws/a"], undefined);
    });

    test("persists after removing", () => {
      const { manager, getSaveCount } = makeManager({ "/ws/a": { columnWidths: null } });
      manager.removeRepo("/ws/a");
      assert.strictEqual(getSaveCount(), 1);
    });
  });

  suite("setRepoState", () => {
    test("updates the state of an existing repo", () => {
      const { manager, store } = makeManager({ "/ws/a": { columnWidths: null } });
      manager.setRepoState("/ws/a", { columnWidths: [100, 200] });
      assert.deepStrictEqual(store.repos["/ws/a"], { columnWidths: [100, 200] });
    });

    test("persists after updating state", () => {
      const { manager, getSaveCount } = makeManager({ "/ws/a": { columnWidths: null } });
      manager.setRepoState("/ws/a", { columnWidths: [1] });
      assert.strictEqual(getSaveCount(), 1);
    });
  });

  suite("setRepos", () => {
    test("adds new repos with null columnWidths", () => {
      const { manager, store } = makeManager();
      manager.setRepos(["/ws/a", "/ws/b"]);
      assert.deepStrictEqual(store.repos, {
        "/ws/a": { columnWidths: null },
        "/ws/b": { columnWidths: null }
      });
    });

    test("preserves columnWidths of repos that are still present", () => {
      const { manager, store } = makeManager({ "/ws/a": { columnWidths: [100, 200] } });
      manager.setRepos(["/ws/a", "/ws/b"]);
      assert.deepStrictEqual(store.repos["/ws/a"], { columnWidths: [100, 200] });
    });

    test("removes repos that are not in the new list", () => {
      const { manager, store } = makeManager({
        "/ws/a": { columnWidths: [100] },
        "/ws/b": { columnWidths: null }
      });
      manager.setRepos(["/ws/a"]);
      assert.strictEqual(store.repos["/ws/b"], undefined);
    });

    test("persists once after setting", () => {
      const { manager, getSaveCount } = makeManager({ "/ws/a": { columnWidths: null } });
      manager.setRepos(["/ws/a", "/ws/b"]);
      assert.strictEqual(getSaveCount(), 1);
    });
  });

  suite("getRepos", () => {
    test("returns repos sorted by path", () => {
      const { manager } = makeManager({
        "/z": { columnWidths: null },
        "/a": { columnWidths: null },
        "/m": { columnWidths: null }
      });
      assert.deepStrictEqual(Object.keys(manager.getRepos()), ["/a", "/m", "/z"]);
    });
  });

  suite("removeReposWithinFolder", () => {
    test("removes repos at the exact folder path and returns true", () => {
      const { manager, store } = makeManager({
        "/ws/proj": { columnWidths: null },
        "/ws/other": { columnWidths: null }
      });
      const changed = manager.removeReposWithinFolder("/ws/proj");
      assert.strictEqual(changed, true);
      assert.deepStrictEqual(Object.keys(store.repos), ["/ws/other"]);
    });

    test("removes repos nested within the folder", () => {
      const { manager, store } = makeManager({
        "/ws/proj/sub": { columnWidths: null },
        "/ws/other": { columnWidths: null }
      });
      manager.removeReposWithinFolder("/ws/proj");
      assert.deepStrictEqual(Object.keys(store.repos), ["/ws/other"]);
    });

    test("returns false when no repos are removed", () => {
      const { manager } = makeManager({ "/ws/other": { columnWidths: null } });
      assert.strictEqual(manager.removeReposWithinFolder("/ws/proj"), false);
    });

    test("does not remove repos with a shared path prefix", () => {
      const { manager, store } = makeManager({
        "/ws/proj": { columnWidths: null },
        "/ws/projectx": { columnWidths: null }
      });
      manager.removeReposWithinFolder("/ws/proj");
      assert.deepStrictEqual(Object.keys(store.repos), ["/ws/projectx"]);
    });
  });
});
