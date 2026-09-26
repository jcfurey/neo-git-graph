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
});
