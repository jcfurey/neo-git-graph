/* eslint-disable no-await-in-loop -- UI interactions and polling depend on the previous step. */
const assert = require("node:assert/strict");
const cp = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const vscode = require("vscode");
const port = Number(process.env.NGG_CDP_PORT);
const artifacts = process.env.NGG_ARTIFACTS || path.join(os.tmpdir(), "ngg-ui-artifacts");
fs.mkdirSync(artifacts, { recursive: true });
const repoKey = (value) =>
  value.replaceAll("\\", "/").replace(/^[A-Z]:/, (drive) => drive.toLowerCase());
const connections = [];
const dirs = [];
let graph;
let repo;
const visible = (hash) => `!!document.querySelector('tr[data-commit-hash="${hash}"]')`;
function git(args, cwd = repo) {
  return cp.execFileSync("git", args, { cwd, stdio: "pipe" }).toString().trim();
}
function directory() {
  const dir = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "ngg-ui-")));
  dirs.push(dir);
  return dir;
}
function init(dir) {
  git(["init", "-b", "main"], dir);
  git(["config", "user.name", "UI Test"], dir);
  git(["config", "user.email", "ui@test"], dir);
  git(["config", "commit.gpgsign", "false"], dir);
  git(["config", "rerere.enabled", "false"], dir);
}
function commit(file, value, cwd = repo) {
  fs.writeFileSync(path.join(cwd, file), value);
  git(["add", "--", file], cwd);
  git(["commit", "-m", value], cwd);
}
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(fn, label, timeout = 15000) {
  const deadline = Date.now() + timeout;
  let last;
  while (Date.now() < deadline) {
    try {
      const value = await fn();
      if (value) {
        return value;
      }
    } catch (error) {
      last = error;
    }
    await delay(100);
  }
  throw new Error("Timed out: " + label + (last ? "\n" + last : ""));
}
async function connect(url, type) {
  const ws = new WebSocket(url);
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", reject, { once: true });
  });
  const pending = new Map();
  const contexts = new Set();
  let sequence = 0;
  ws.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.method === "Runtime.executionContextCreated") {
      contexts.add(message.params.context.id);
    }
    if (message.method === "Runtime.executionContextDestroyed") {
      contexts.delete(message.params.executionContextId);
    }
    if (message.method === "Runtime.executionContextsCleared") {
      contexts.clear();
    }
    if (message.id && pending.has(message.id)) {
      const { resolve, reject, timer } = pending.get(message.id);
      pending.delete(message.id);
      clearTimeout(timer);
      if (message.error) {
        reject(new Error(message.error.message));
      } else {
        resolve(message.result);
      }
    }
  });
  ws.addEventListener("close", () => {
    contexts.clear();
    for (const { reject, timer } of pending.values()) {
      clearTimeout(timer);
      reject(new Error("CDP connection closed"));
    }
    pending.clear();
  });
  const connection = {
    ws,
    contexts,
    call(method, params = {}) {
      if (ws.readyState !== WebSocket.OPEN) {
        return Promise.reject(new Error("CDP connection is not open"));
      }
      return new Promise((resolve, reject) => {
        const id = ++sequence;
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error("CDP timeout: " + method));
        }, 5000);
        pending.set(id, { resolve, reject, timer });
        ws.send(JSON.stringify({ id, method, params }));
      });
    },
    async evaluate(expression, contextId) {
      const response = await this.call("Runtime.evaluate", {
        expression,
        contextId,
        returnByValue: true,
        awaitPromise: true
      });
      if (response.exceptionDetails) {
        throw new Error(JSON.stringify(response.exceptionDetails));
      }
      return response.result.value;
    }
  };
  await connection.call("Runtime.enable");
  if (type === "page") {
    await connection.call("Emulation.setDeviceMetricsOverride", {
      width: 1440,
      height: 1000,
      deviceScaleFactor: 1,
      mobile: false
    });
  }
  connections.push(connection);
  return connection;
}
async function findGraph() {
  const connected = new Set();
  return until(
    async () => {
      const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      for (const target of targets.filter(
        (t) => t.webSocketDebuggerUrl && ["page", "iframe"].includes(t.type)
      )) {
        if (!connected.has(target.id)) {
          connected.add(target.id);
          await connect(target.webSocketDebuggerUrl, target.type);
        }
      }
      for (const connection of connections) {
        if (connection.ws.readyState !== WebSocket.OPEN) {
          continue;
        }
        for (const context of connection.contexts) {
          try {
            if (
              await connection.evaluate(
                '!!document.querySelector("header") && !!document.querySelector("[data-git-graph]")',
                context
              )
            ) {
              return {
                evaluate: (expression) => connection.evaluate(expression, context),
                connection
              };
            }
          } catch {}
        }
      }
    },
    "graph context",
    25000
  );
}
async function button(text, scope = '(document.querySelector("[role=dialog]") || document)') {
  if (["Remotes", "Stashes", "Worktrees"].includes(text)) {
    await button("Settings & Tools", 'document.querySelector("header")');
    await menu(text);
    return;
  }

  await until(
    () =>
      graph.evaluate(
        `(() => { const root = ${scope}; const button = [...root.querySelectorAll('button')].find(b => (b.textContent.trim() === ${JSON.stringify(text)} || b.getAttribute('aria-label') === ${JSON.stringify(text)}) && !b.disabled); if (!button) return false; button.click(); return true; })()`
      ),
    "button " + text
  );
}
async function menu(text) {
  await until(
    () =>
      graph.evaluate(
        `(() => { const item = [...document.querySelectorAll('[role="menuitem"]')].find(e => e.textContent.trim() === ${JSON.stringify(text)}); if (!item) return false; item.click(); return true; })()`
      ),
    "menu " + text
  );
}
async function fill(values) {
  await graph.evaluate(
    `(() => { const inputs = [...document.querySelectorAll('[role="dialog"] input[type="text"]')]; ${JSON.stringify(values)}.forEach((value, i) => { inputs[i].value = value; inputs[i].dispatchEvent(new Event('input', {bubbles: true})); }); })()`
  );
}
async function select(value) {
  await until(
    () => graph.evaluate('!!document.querySelector("[role=dialog] select")'),
    "select field"
  );
  await graph.evaluate(
    `(() => { const input = document.querySelector('[role="dialog"] select'); input.value = ${JSON.stringify(value)}; input.dispatchEvent(new Event('change', {bubbles: true})); })()`
  );
}
async function finished() {
  await until(
    async () => {
      const text = await graph.evaluate('document.querySelector("[role=dialog]")?.innerText || ""');
      if (text.startsWith("Unable")) {
        throw new Error(text);
      }
      return text === "";
    },
    "Git action completion",
    20000
  );
}
async function contextRef(name) {
  await until(
    () =>
      graph.evaluate(
        `(() => { const element = [...document.querySelectorAll('span[title]')].find(e => e.title.split(String.fromCharCode(10))[0] === ${JSON.stringify(name)} && e.querySelector('svg')); if (!element) return false; element.dispatchEvent(new MouseEvent('contextmenu', {bubbles: true, clientX: 150, clientY: 220})); return true; })()`
      ),
    "ref " + name
  );
}
async function openRepo(dir) {
  await vscode.commands.executeCommand("neo-git-graph.view", { rootUri: vscode.Uri.file(dir) });
  graph = await findGraph();
  await button("Refresh");
  await until(
    () => graph.evaluate('document.querySelectorAll("tbody tr").length > 0'),
    "loaded commits"
  );
}
async function headerChoice(label, option) {
  await until(
    () =>
      graph.evaluate(`(() => {
      const trigger = [...document.querySelectorAll('header button[aria-haspopup="listbox"]')]
        .find(button => document.getElementById(button.getAttribute('aria-labelledby').split(' ')[0])?.textContent === ${JSON.stringify(label + ":")});
      if (!trigger || trigger.disabled) return false;
      trigger.click(); return true;
    })()`),
    "header choice " + label
  );
  await until(
    () =>
      graph.evaluate(`(() => {
      const option = [...document.querySelectorAll('[role="option"]')].find(item => item.textContent.trim() === ${JSON.stringify(option)});
      if (!option) return false;
      option.click(); return true;
    })()`),
    "option " + option
  );
}
suite("Git Graph workflow UI", function () {
  this.timeout(120000);
  suiteSetup(async () => {
    repo = directory();
    init(repo);
    commit("f", "ui-base");
    commit("a", "ui-first");
    commit("b", "ui-second");
    git(["tag", "v-ui"]);
    const extension = vscode.extensions.getExtension("asispts.neo-git-graph");
    assert.ok(extension);
    await extension.activate();
    await vscode.commands.executeCommand("workbench.action.closeSidebar");
    await vscode.commands.executeCommand("workbench.action.closeAuxiliaryBar");
    await openRepo(repo);
  });
  teardown(async function () {
    if (this.currentTest?.state === "failed") {
      try {
        const body = await graph.evaluate("document.body.innerText");
        process.stderr.write("FAILED UI BODY\n" + body + "\n");
        fs.writeFileSync(
          path.join(artifacts, this.currentTest.title.replace(/[^a-z0-9]+/gi, "-") + ".txt"),
          body
        );
      } catch {}
    }
  });
  suiteTeardown(async function () {
    if (this.currentTest?.state === "failed") {
      try {
        fs.writeFileSync(
          path.join(artifacts, "failed-body.txt"),
          await graph.evaluate("document.body.innerText")
        );
      } catch {}
    }
  });
  suiteTeardown(async () => {
    await vscode.commands.executeCommand("workbench.action.closeAllEditors");
    for (const connection of connections) {
      connection.ws.close();
    }
    for (const dir of dirs) {
      await fs.promises.rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    }
  });

  test("focuses direct or merged branch history without hiding rows or changing checkout", async () => {
    const dir = directory();
    init(dir);
    commit("base", "focus-base", dir);
    const base = git(["rev-parse", "HEAD"], dir);
    git(["checkout", "-b", "topic"], dir);
    commit("topic", "focus-merged", dir);
    const topic = git(["rev-parse", "HEAD"], dir);
    git(["checkout", "main"], dir);
    commit("main", "focus-main", dir);
    git(["merge", "--no-ff", "topic", "-m", "focus-merge"], dir);
    const tip = git(["rev-parse", "HEAD"], dir);
    git(["checkout", "-b", "side", base], dir);
    commit("side", "focus-unrelated", dir);
    const side = git(["rev-parse", "HEAD"], dir);
    git(["checkout", "main"], dir);
    await openRepo(dir);
    await until(
      () => graph.evaluate(`!!document.querySelector('tr[data-commit-hash="${side}"]')`),
      "all focus fixture rows"
    );
    const geometry = () =>
      graph.evaluate(`({
      rows: [...document.querySelectorAll('tr[data-commit-hash]')].map(row => row.dataset.commitHash),
      vertices: [...document.querySelectorAll('svg[aria-hidden] circle[data-branch-relation]')].map(dot => [dot.getAttribute('cx'), dot.getAttribute('cy')])
    })`);
    const before = await geometry();
    const graphColours = () =>
      graph.evaluate(`({
      dots: [...document.querySelectorAll('circle[data-branch-relation]')].map(dot => ({
        relation: dot.dataset.branchRelation,
        fill: getComputedStyle(dot).fill,
        stroke: getComputedStyle(dot).stroke
      })),
      paths: [...document.querySelectorAll('path[data-branch-relation]')].map(line => ({
        relation: line.dataset.branchRelation,
        stroke: getComputedStyle(line).stroke
      })),
      text: getComputedStyle(document.querySelector('tr[data-commit-hash="${side}"]')).color
    })`);
    const fullColour = await graphColours();
    await contextRef("main");
    await menu("Focus this branch");
    await until(
      () =>
        graph.evaluate(`
      document.querySelector('tr[data-commit-hash="${topic}"]')?.dataset.branchRelation === 'merged' &&
      document.querySelector('tr[data-commit-hash="${side}"]')?.dataset.branchRelation === 'unrelated' &&
      document.querySelector('tr[data-commit-hash="${tip}"]')?.dataset.branchRelation === 'direct'
    `),
      "three focus levels"
    );
    assert.deepEqual(await geometry(), before);
    assert.equal(
      await graph.evaluate(
        `document.querySelectorAll('[data-focus-branch="main"][data-focus-paused="false"]').length`
      ),
      2
    );
    assert.ok(
      await graph.evaluate(
        `!!document.querySelector('path[data-branch-relation="merged"][stroke^="color-mix"]')`
      )
    );
    await graph.evaluate(`document.querySelector('tr[data-commit-hash="${side}"]').focus()`);
    assert.equal(
      await graph.evaluate(`(() => {
      const row = document.querySelector('tr[data-commit-hash="${side}"]');
      return getComputedStyle(row).color === getComputedStyle(document.querySelector('tr[data-commit-hash="${tip}"]')).color;
    })()`),
      true
    );
    await graph.evaluate(`document.querySelector('tr[data-commit-hash="${tip}"]').focus()`);
    const subtle = await graphColours();
    await graph.evaluate(`(() => {
      const select = document.querySelector('select[aria-label="Dimming"]');
      select.value = 'strong';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    })()`);
    await until(
      async () =>
        (await graphColours()).paths.some(
          (line, index) =>
            line.relation === "unrelated" && line.stroke !== subtle.paths[index].stroke
        ),
      "strong graph dimming"
    );
    const strong = await graphColours();
    assert.equal(strong.text, subtle.text, "strong dimming preserves text readability");
    for (let i = 0; i < strong.dots.length; i++) {
      if (strong.dots[i].relation === "direct") {
        assert.deepEqual(strong.dots[i], subtle.dots[i]);
      } else {
        assert.notEqual(strong.dots[i].fill, subtle.dots[i].fill);
      }
    }
    await button("Pause focus");
    await until(
      () =>
        graph.evaluate(
          `document.querySelectorAll('[data-focus-branch="main"][data-focus-paused="true"]').length === 2`
        ),
      "paused target markers"
    );
    const paused = await graphColours();
    assert.deepEqual(paused.dots, fullColour.dots);
    assert.deepEqual(paused.paths, fullColour.paths);
    assert.deepEqual(await geometry(), before);
    await button("Resume focus");
    await until(
      async () => (await graphColours()).paths.some((line) => line.relation === "unrelated"),
      "resumed graph focus"
    );
    assert.deepEqual(await graphColours(), strong);
    const screenshot = await connections[0].call("Page.captureScreenshot");
    fs.writeFileSync(
      path.join(artifacts, "branch-focus.png"),
      Buffer.from(screenshot.data, "base64")
    );
    await headerChoice("View", "Focus all ancestors");
    await until(
      () =>
        graph.evaluate(
          `document.querySelector('tr[data-commit-hash="${topic}"]')?.dataset.branchRelation === 'direct'`
        ),
      "merged history stays bright"
    );
    assert.deepEqual(await geometry(), before);
    await contextRef("side");
    await menu("Focus this branch");
    await until(
      () =>
        graph.evaluate(
          `document.querySelector('tr[data-commit-hash="${side}"]')?.dataset.branchRelation === 'direct'`
        ),
      "focus another branch"
    );
    assert.deepEqual(await geometry(), before);
    assert.equal(
      await graph.evaluate(`document.querySelectorAll('[data-focus-branch="side"]').length`),
      2
    );
    assert.equal(
      await graph.evaluate(`document.querySelectorAll('[data-focus-branch="main"]').length`),
      0
    );
    assert.equal(git(["branch", "--show-current"], dir), "main");
    assert.equal(git(["rev-parse", "HEAD"], dir), tip);
    await button("Clear focus");
    await until(
      () =>
        graph.evaluate(
          `![...document.querySelectorAll('tr[data-commit-hash]')].some(row => row.dataset.branchRelation !== 'normal')`
        ),
      "clear focus"
    );
    assert.deepEqual(await geometry(), before);
    assert.equal(
      await graph.evaluate(`document.querySelectorAll('[data-focus-branch]').length`),
      0
    );
    await headerChoice("Branch", "side");
    await headerChoice("View", "Filter to branch");
    await until(
      () => graph.evaluate(`document.querySelectorAll('tr[data-commit-hash]').length === 2`),
      "filter branch history"
    );
    await openRepo(repo);
  });

  test("configures remotes and upstreams, pushes/deletes tags, pops stashes, and manages worktrees", async () => {
    const bare = directory();
    git(["clone", "--bare", repo, bare]);
    await button("Remotes");
    await button("Add Remote");
    await fill(["upstream", bare]);
    await button("Add Remote");
    await finished();
    assert.equal(git(["remote", "get-url", "upstream"]), bare);
    await button("Configure Upstream");
    await select("refs/remotes/upstream/main");
    await button("Save");
    await finished();
    assert.equal(git(["config", "branch.main.remote"]), "upstream");
    await contextRef("v-ui");
    await menu("Push Tag…");
    await button("Push Tag");
    await finished();
    assert.equal(git(["tag", "--list"], bare), "v-ui");
    await contextRef("v-ui");
    await menu("Delete Remote Tag…");
    await button("Delete Remote Tag");
    await button("Delete Remote Tag");
    await finished();
    assert.equal(git(["tag", "--list"], bare), "");
    assert.equal(git(["tag", "--list"]), "v-ui");
    fs.writeFileSync(path.join(repo, "f"), "ui-stash");
    await button("Stashes");
    await button("Save Stash");
    await fill(["UI saved work"]);
    await button("Save Stash");
    await finished();
    assert.match(git(["stash", "list"]), /UI saved work/);
    await button("Stashes");
    await button("Pop Stash");
    await button("Pop Stash");
    await finished();
    assert.equal(git(["stash", "list"]), "");
    assert.equal(fs.readFileSync(path.join(repo, "f"), "utf8"), "ui-stash");
    git(["restore", "f"]);
    const worktree = path.join(directory(), "worktree");
    await button("Worktrees");
    await button("Create Worktree");
    await fill([worktree, "ui-worktree", "HEAD"]);
    await button("Create Worktree");
    await finished();
    assert.equal(git(["branch", "--show-current"], worktree), "ui-worktree");
    await button("Worktrees");
    await button("Remove Worktree");
    await button("Remove Worktree");
    await finished();
    assert.equal(fs.existsSync(worktree), false);
  });

  test("recovers from a merge conflict through the status controls", async () => {
    git(["checkout", "-b", "ui-conflict"]);
    commit("f", "other side");
    git(["checkout", "main"]);
    commit("f", "main side");
    await button("Refresh");
    await contextRef("ui-conflict");
    await menu("Merge into current branch…");
    await button("Yes, merge");
    await until(
      () =>
        graph.evaluate(
          'document.querySelector("[role=dialog]")?.innerText.includes("Unable to Merge")'
        ),
      "merge rejection"
    );
    await button("Dismiss");
    await until(
      () => graph.evaluate('document.body.innerText.includes("Merge in progress")'),
      "operation status"
    );
    fs.writeFileSync(path.join(repo, "f"), "resolved by UI");
    await button("Stage Resolution");
    await button("Stage Resolution");
    await finished();
    await button("Continue");
    await button("Continue");
    await finished();
    assert.equal(git(["show", "-s", "--format=%P", "HEAD"]).split(" ").length, 2);
    assert.equal(fs.existsSync(path.join(repo, ".git", "MERGE_HEAD")), false);
  });

  test("switches repositories through SCM and runs an interactive rebase from a commit menu", async () => {
    const second = directory();
    init(second);
    commit("f", "ui-rebase-base", second);
    const base = git(["rev-parse", "HEAD"], second);
    commit("a", "first rebase item", second);
    commit("b", "second rebase item", second);
    commit("c", "third rebase item", second);
    await openRepo(second);
    await until(
      () =>
        graph.evaluate(
          `(() => { const row = [...document.querySelectorAll('tbody tr')].find(r => r.textContent.includes('ui-rebase-base')); if (!row) return false; row.dispatchEvent(new MouseEvent('contextmenu', {bubbles: true, clientX: 160, clientY: 220})); return true; })()`
        ),
      "rebase base row"
    );
    await menu("Edit commits after this (interactive rebase)…");
    await until(
      () => graph.evaluate('document.querySelectorAll("[role=dialog] select").length === 3'),
      "interactive plan"
    );
    await graph.evaluate(
      `(() => { const selects = [...document.querySelectorAll('[role=dialog] select')]; ['reword', 'squash', 'drop'].forEach((value, i) => { selects[i].value = value; selects[i].dispatchEvent(new Event('change', {bubbles: true})); }); })()`
    );
    await until(
      () => graph.evaluate('!!document.querySelector("[role=dialog] textarea")'),
      "reword input"
    );
    await graph.evaluate(
      `(() => { const input = document.querySelector('[role=dialog] textarea'); input.value = 'UI rewritten commit'; input.dispatchEvent(new Event('input', {bubbles: true})); })()`
    );
    await button("Start Rebase");
    await finished();
    assert.equal(git(["rev-list", "--count", base + "..HEAD"], second), "1");
    assert.match(git(["log", "-1", "--format=%B"], second), /UI rewritten commit/);
    assert.equal(fs.existsSync(path.join(second, "c")), false);
    const page = connections[0];
    try {
      const screenshot = await page.call("Page.captureScreenshot");
      fs.writeFileSync(
        path.join(artifacts, "workflow.png"),
        Buffer.from(screenshot.data, "base64")
      );
    } catch {}
  });
  test("searches past the loaded graph and keeps saved filters per repository", async () => {
    const history = directory();
    init(history);
    commit("old.txt", "original content", history);
    git(["commit", "--allow-empty", "-m", "historical needle"], history);
    git(["mv", "old.txt", "current.txt"], history);
    git(["commit", "-m", "rename historical file"], history);
    for (let i = 0; i < 305; i++) {
      git(["commit", "--allow-empty", "-m", "recent commit " + i], history);
    }
    await openRepo(history);
    assert.equal(
      await graph.evaluate(
        'document.querySelector("tbody").innerText.includes("historical needle")'
      ),
      false
    );
    if (!(await graph.evaluate('!!document.querySelector("[data-history-search]")'))) {
      await button("Search history", 'document.querySelector("header")');
    }
    await graph.evaluate(
      `(() => { const input = document.querySelector('[data-history-search]'); input.value = 'historical needle'; input.dispatchEvent(new Event('input', {bubbles:true})); })()`
    );
    await button("Search", 'document.querySelector("form[role=search]")');
    await until(
      () =>
        graph.evaluate(
          'document.querySelectorAll("tr[data-commit-hash]").length === 1 && document.querySelector("tbody").innerText.includes("historical needle")'
        ),
      "full history search"
    );
    await button("Filters");
    await button("Save Filter");
    await fill(["Historical needle"]);
    await button("Save");
    await finished();
    await openRepo(repo);
    assert.equal(await graph.evaluate('document.querySelector("[data-history-search]").value'), "");
    await openRepo(history);
    assert.equal(
      await graph.evaluate('document.querySelector("[data-history-search]").value'),
      "historical needle"
    );
    assert.equal(
      await graph.evaluate(
        '[...document.querySelectorAll("select")].some(select => select.textContent.includes("Historical needle"))'
      ),
      true
    );
    await button("Return to Graph");
    await vscode.commands.executeCommand(
      "neo-git-graph.fileHistory",
      vscode.Uri.file(path.join(history, "current.txt"))
    );
    await until(
      () =>
        graph.evaluate(
          'document.querySelector("main").innerText.includes("current.txt") && document.querySelector("tbody").innerText.includes("original content")'
        ),
      "Explorer file history follows rename"
    );
    await contextCommit("original content");
    await menu("Restore File Contents");
    assert.equal(
      await graph.evaluate('document.querySelector("[role=dialog] input").value'),
      "current.txt"
    );
    await button("Preview Restore");
    await until(
      () =>
        graph.evaluate(
          'document.querySelector("[role=dialog]").innerText.includes("Historical source: old.txt")'
        ),
      "historical path restore preview"
    );
    await button("Preview Restore");
    await until(
      () => vscode.window.activeTextEditor?.document.uri.scheme === "neo-git-graph",
      "native restore diff"
    );
    await vscode.commands.executeCommand("neo-git-graph.view", {
      rootUri: vscode.Uri.file(history)
    });
    await button("Restore File Contents");
    await finished();
    assert.equal(fs.readFileSync(path.join(history, "current.txt"), "utf8"), "original content");
    assert.equal(git(["diff", "--cached"], history), "");
    await button("Return to Graph");
  });

  test("compares branch contributions, opens native diffs and recovers a reflog commit", async () => {
    const history = directory();
    init(history);
    commit("base", "common base", history);
    const base = git(["rev-parse", "HEAD"], history);
    git(["checkout", "-b", "ui-left"], history);
    commit("left.txt", "left change", history);
    git(["checkout", "-b", "ui-right", base], history);
    commit("right.txt", "right change", history);
    await openRepo(history);
    await button("Compare", 'document.querySelector("header")');
    await until(
      () => graph.evaluate('document.querySelectorAll("[role=dialog] input").length >= 3'),
      "comparison fields"
    );
    await fill(["ui-left", "ui-right"]);
    await button("Compare");
    await until(
      () =>
        graph.evaluate(
          'document.querySelector("[role=dialog]").innerText.includes("left.txt") && document.querySelector("[role=dialog]").innerText.includes("right.txt")'
        ),
      "endpoint files"
    );
    await graph.evaluate(
      `(() => { const input = document.querySelector('[role=dialog] input[type=checkbox]'); input.click(); })()`
    );
    await button("Compare");
    await until(
      () =>
        graph.evaluate(
          'document.querySelector("[role=dialog]").innerText.includes("Changed Files (1)")'
        ),
      "merge-base changes"
    );
    await graph.evaluate(
      `(() => { const button = [...document.querySelectorAll('[role=dialog] li button')].find(b => b.textContent.includes('right.txt')); button.click(); })()`
    );
    await until(
      () => vscode.window.activeTextEditor?.document.uri.scheme === "neo-git-graph",
      "native comparison diff"
    );
    await vscode.commands.executeCommand("neo-git-graph.view", {
      rootUri: vscode.Uri.file(history)
    });
    assert.equal(
      await graph.evaluate(
        'document.querySelector("[role=dialog]").innerText.includes("Compare Revisions")'
      ),
      true
    );
    await button("Close");
    commit("lost", "lost contents", history);
    const lost = git(["rev-parse", "HEAD"], history);
    git(["reset", "--hard", "HEAD^"], history);
    await button("Refresh");
    await delay(400);
    await button("Settings & Tools");
    await menu("Recover lost commits (reflog)");
    await until(
      () =>
        graph.evaluate(
          `document.querySelector('[role=dialog]').innerText.includes(${JSON.stringify(lost.slice(0, 12))})`
        ),
      "reflog commit"
    );
    await graph.evaluate(
      `(() => { const item = [...document.querySelectorAll('[role=dialog] li')].find(li => li.textContent.includes(${JSON.stringify(lost.slice(0, 12))})); [...item.querySelectorAll('button')].find(b => b.textContent === 'Create Recovery Branch').click(); })()`
    );
    await fill(["ui-recovered"]);
    await button("Create Recovery Branch");
    await finished();
    assert.equal(git(["rev-parse", "ui-recovered"], history), lost);
    assert.notEqual(git(["rev-parse", "HEAD"], history), lost);
  });

  test("runs ordered selected cherry-picks and reverts, then creates and autosquashes a fixup", async () => {
    const history = directory();
    init(history);
    commit("f", "batch base", history);
    const base = git(["rev-parse", "HEAD"], history);
    git(["checkout", "-b", "topic"], history);
    commit("one", "batch first", history);
    commit("two", "batch second", history);
    git(["checkout", "main"], history);
    await openRepo(history);
    await selectCommits(["batch second", "batch first"]);
    await button("Cherry-pick Selected");
    await until(
      () => graph.evaluate('document.querySelectorAll("[role=dialog] ol li").length === 2'),
      "batch plan"
    );
    const order = await graph.evaluate(
      '[...document.querySelectorAll("[role=dialog] ol li")].map(li => li.textContent)'
    );
    assert.match(order[0], /batch first/);
    assert.match(order[1], /batch second/);
    await button("Cherry-pick Selected");
    await finished();
    assert.equal(
      git(["log", "-2", "--reverse", "--format=%s"], history),
      "batch first\nbatch second".replace("\\n", "\n")
    );
    await button("Clear Selection");
    await selectCommits(["batch second", "batch first"]);
    await button("Revert Selected");
    await button("Revert Selected");
    await finished();
    assert.equal(git(["diff", base, "HEAD"], history), "");
    await button("Clear Selection");
    const fix = directory();
    init(fix);
    commit("f", "fixup base", fix);
    const fixBase = git(["rev-parse", "HEAD"], fix);
    commit("a", "fixup target", fix);
    commit("b", "unrelated commit", fix);
    fs.writeFileSync(path.join(fix, "a"), "corrected");
    git(["add", "a"], fix);
    await openRepo(fix);
    await contextCommit("fixup target");
    await menu("Fold staged changes into this commit (fixup)…");
    await button("Create Fixup Commit");
    await finished();
    assert.equal(git(["log", "-1", "--format=%s"], fix), "fixup! fixup target");
    await contextCommit("fixup base");
    await menu("Edit commits after this (interactive rebase)…");
    await button("Arrange Fixup / Squash Commits");
    assert.equal(
      await graph.evaluate(
        '[...document.querySelectorAll("[role=dialog] select")].map(s=>s.value).join(",")'
      ),
      "pick,fixup,pick"
    );
    await button("Start Rebase");
    await finished();
    assert.equal(git(["rev-list", "--count", fixBase + "..HEAD"], fix), "2");
    assert.equal(fs.readFileSync(path.join(fix, "a"), "utf8"), "corrected");
    const rebasedHead = git(["rev-parse", "HEAD"], fix);
    await until(
      () =>
        graph.evaluate(
          `document.querySelector('tr[data-commit-hash]')?.dataset.commitHash === ${JSON.stringify(rebasedHead)}`
        ),
      "refreshed rebase history"
    );
    await graph.evaluate(
      `(() => { const row=document.querySelector('tr[data-commit-hash]'); row.focus(); row.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true})); })()`
    );
    await until(
      () =>
        graph.evaluate(
          'document.activeElement === document.querySelectorAll("tr[data-commit-hash]")[1]'
        ),
      "keyboard focus on the next commit"
    );
    await button("Settings & Tools");
    await menu("Git Activity");
    assert.equal(
      await graph.evaluate(
        'document.querySelector("[role=dialog]").innerText.includes("Create Fixup Commit")'
      ),
      true
    );
    await button("Close");
  });

  test("shows nested repository status, updates a submodule and switches its graph from the sidebar", async () => {
    const child = directory();
    init(child);
    commit("f", "submodule base", child);
    commit("a", "submodule latest", child);
    const parent = directory();
    init(parent);
    commit("f", "parent repository", parent);
    git(["-c", "protocol.file.allow=always", "submodule", "add", child, "module"], parent);
    git(["commit", "-am", "record module"], parent);
    const module = path.join(parent, "module");
    const pin = git(["rev-parse", "HEAD"], module);
    git(["checkout", "HEAD^"], module);
    await openRepo(parent);
    if (!(await graph.evaluate('!!document.querySelector("aside")'))) {
      await button("Workspace");
    }
    await until(
      () =>
        graph.evaluate(
          'document.querySelector("aside").innerText.includes("Different from parent revision")'
        ),
      "submodule mismatch"
    );
    await graph.evaluate(
      `document.querySelector('button[aria-label="module Repository Tools"]').click()`
    );
    await menu("Update to Recorded Revision");
    await button("Update to Recorded Revision");
    await finished();
    assert.equal(git(["rev-parse", "HEAD"], module), pin);
    await until(
      () =>
        graph.evaluate(
          `(() => { const b=document.querySelector('aside button[title=${JSON.stringify(repoKey(module))}]'); if(!b)return false;b.click();return true; })()`
        ),
      "submodule sidebar switch"
    );
    await until(
      () =>
        graph.evaluate('document.querySelector("tbody").innerText.includes("submodule latest")'),
      "submodule graph"
    );
    await until(
      () =>
        graph.evaluate(
          `!!document.querySelector('aside button[title=${JSON.stringify(repoKey(parent))}]')`
        ),
      "parent remains in workspace after switching"
    );
    const page = connections[0];
    const screenshot = await page.call("Page.captureScreenshot");
    fs.writeFileSync(path.join(artifacts, "workspace.png"), Buffer.from(screenshot.data, "base64"));
  });

  test("reviews submodule commits and stages only the parent pointer", async () => {
    const child = directory();
    init(child);
    commit("f", "pointer base", child);
    const parent = directory();
    init(parent);
    commit("f", "pointer parent", parent);
    git(["-c", "protocol.file.allow=always", "submodule", "add", child, "module"], parent);
    git(["commit", "-am", "record pointer"], parent);
    const module = path.join(parent, "module");
    git(["config", "user.name", "UI Test"], module);
    git(["config", "user.email", "ui@test"], module);
    commit("a", "pointer update", module);
    fs.writeFileSync(path.join(parent, "other"), "staged unrelated");
    git(["add", "other"], parent);
    await openRepo(module);
    await openRepo(parent);
    if (!(await graph.evaluate('!!document.querySelector("aside")'))) {
      await button("Workspace");
    }
    await button("Different from parent revision", 'document.querySelector("aside")');
    await until(
      () =>
        graph.evaluate(
          'document.querySelector("[role=dialog]").innerText.includes("pointer update")'
        ),
      "child commit preview"
    );
    await button("Stage Submodule Pointer");
    await finished();
    assert.equal(
      git(["diff", "--cached", "--name-only"], parent),
      "module\nother".replace("\\n", "\n")
    );
    await button("Parent has a staged revision change", 'document.querySelector("aside")');
    await until(
      () =>
        graph.evaluate(
          'document.querySelector("[role=dialog]").innerText.includes("pointer update")'
        ),
      "staged pointer comparison"
    );
    await button("Unstage Submodule Pointer");
    await finished();
    assert.equal(git(["diff", "--cached", "--name-only"], parent), "other");
  });

  test("previews pushes and fast-forward pulls and removes only selected merged branches", async () => {
    const local = directory();
    init(local);
    commit("f", "sync base", local);
    const bare = directory();
    git(["clone", "--bare", local, bare]);
    git(["remote", "add", "origin", bare], local);
    git(["fetch", "origin"], local);
    git(["branch", "--set-upstream-to=origin/main"], local);
    const original = git(["rev-parse", "HEAD"], bare);
    commit("out", "outgoing preview", local);
    await openRepo(local);
    await contextRef("main");
    await menu("Push Branch…");
    await button("Preview Push");
    await until(
      () =>
        graph.evaluate(
          'document.querySelector("[role=dialog]").innerText.includes("outgoing preview")'
        ),
      "outgoing commits"
    );
    assert.equal(git(["rev-parse", "HEAD"], bare), original);
    await button("Push Branch");
    await finished();
    assert.equal(git(["rev-parse", "HEAD"], bare), git(["rev-parse", "HEAD"], local));
    const peer = directory();
    git(["clone", bare, peer]);
    git(["config", "user.name", "UI Test"], peer);
    git(["config", "user.email", "ui@test"], peer);
    commit("in", "incoming preview", peer);
    git(["push", "origin", "main"], peer);
    await contextRef("main");
    await menu("Pull Branch…");
    await button("Fetch & Preview Pull");
    await until(
      () =>
        graph.evaluate(
          'document.querySelector("[role=dialog]")?.innerText.includes("incoming preview")'
        ),
      "incoming commits"
    );
    assert.equal(fs.existsSync(path.join(local, "in")), false);
    await button("Apply Reviewed Fast-forward");
    await finished();
    assert.equal(fs.readFileSync(path.join(local, "in"), "utf8"), "incoming preview");
    git(["branch", "merged-cleanup"], local);
    git(["checkout", "-b", "unmerged-keep"], local);
    commit("keep", "unmerged work", local);
    git(["checkout", "main"], local);
    await button("Refresh");
    await delay(400);
    await button("Settings & Tools");
    await menu("Clean Up Merged Branches");
    await until(
      () =>
        graph.evaluate(
          `(() => {const label=[...document.querySelectorAll('[role=dialog] label')].find(e=>e.textContent.includes('merged-cleanup'));if(!label)return false;label.querySelector('input').click();return true;})()`
        ),
      "merged branch candidate"
    );
    assert.equal(
      await graph.evaluate(
        'document.querySelector("[role=dialog]").innerText.includes("unmerged-keep")'
      ),
      false
    );
    await button("Delete Selected Branches");
    await button("Delete Selected Branches");
    await finished();
    assert.equal(git(["branch", "--list", "merged-cleanup"], local), "");
    assert.match(git(["branch", "--list", "unmerged-keep"], local), /unmerged-keep/);
  });

  test("fetches selected workspace repositories and keeps independent failure results", async () => {
    const local = directory();
    init(local);
    commit("f", "workspace sync base", local);
    const bare = directory();
    git(["clone", "--bare", local, bare]);
    git(["remote", "add", "origin", bare], local);
    git(["fetch", "origin"], local);
    git(["branch", "--set-upstream-to=origin/main"], local);
    const peer = directory();
    git(["clone", bare, peer]);
    git(["config", "user.name", "UI Test"], peer);
    git(["config", "user.email", "ui@test"], peer);
    commit("new", "workspace incoming", peer);
    git(["push", "origin", "main"], peer);
    const broken = directory();
    init(broken);
    commit("f", "workspace failure", broken);
    git(["remote", "add", "origin", path.join(broken, "missing-remote")], broken);
    await openRepo(broken);
    await openRepo(local);
    await button("Settings & Tools");
    await menu("Workspace Fetch & Update");
    for (const dir of [local, broken]) {
      await until(
        () =>
          graph.evaluate(
            `(() => {const label=[...document.querySelectorAll('[role=dialog] label')].find(e=>e.textContent.trim()===${JSON.stringify(repoKey(dir))});if(!label)return false;label.querySelector('input').click();return true;})()`
          ),
        "workspace selection"
      );
    }
    await button("Fetch Selected Repositories");
    await until(
      () =>
        graph.evaluate(
          'document.querySelector("[role=dialog]").innerText.includes("Failed") && document.querySelector("[role=dialog]").innerText.includes("Review Update")'
        ),
      "independent fetch results"
    );
    await button("Close");
    await button("Settings & Tools");
    await menu("Workspace Fetch & Update");
    assert.equal(
      await graph.evaluate('document.querySelector("[role=dialog]").innerText.includes("Failed")'),
      true
    );
    await until(
      () =>
        graph.evaluate(
          `(() => {const b=[...document.querySelectorAll('[role=dialog] button')].find(e=>e.textContent.startsWith('Review Update'));if(!b)return false;b.click();return true;})()`
        ),
      "review workspace update"
    );
    await until(
      () =>
        graph.evaluate(
          'document.querySelector("[role=dialog]").innerText.includes("workspace incoming")'
        ),
      "workspace incoming preview"
    );
    await button("Apply Reviewed Fast-forward");
    await until(() => fs.existsSync(path.join(local, "new")), "workspace fast-forward");
    await button("Close");
  });

  test("guides bisect to a regression, restores the branch, and restores keyboard focus", async () => {
    const history = directory();
    init(history);
    commit("f", "bisect good", history);
    const hashes = [git(["rev-parse", "HEAD"], history)];
    for (let i = 1; i <= 8; i++) {
      git(["commit", "--allow-empty", "-m", "bisect revision " + i], history);
      hashes.push(git(["rev-parse", "HEAD"], history));
    }
    await openRepo(history);
    await contextCommit("bisect good");
    await menu("Use as Good Bisect Commit");
    await button("Start Bisect");
    await finished();
    for (let step = 0; step < 5; step++) {
      await button("Find a Regression (Bisect)");
      await until(
        () =>
          graph.evaluate(
            'document.querySelector("[role=dialog]").innerText.includes("Original checkout")'
          ),
        "bisect candidate"
      );
      if (
        await graph.evaluate(
          'document.querySelector("[role=dialog]").innerText.includes("First bad commit")'
        )
      ) {
        break;
      }
      const head = git(["rev-parse", "HEAD"], history);
      await button(hashes.indexOf(head) >= 4 ? "Mark Bad" : "Mark Good");
      await finished();
    }
    assert.equal(
      await graph.evaluate(
        `document.querySelector('[role=dialog]').innerText.includes(${JSON.stringify(hashes[4])})`
      ),
      true
    );
    await button("Reset Bisect");
    await button("Reset Bisect");
    await finished();
    assert.equal(git(["branch", "--show-current"], history), "main");
    assert.equal(git(["rev-parse", "HEAD"], history), hashes[8]);
    await graph.evaluate(
      `(() => {const b=[...document.querySelectorAll('header button')].find(e=>e.textContent.trim()==='Compare');b.focus();b.click();})()`
    );
    await button("Close");
    await until(
      () => graph.evaluate('document.activeElement.textContent.trim()==="Compare"'),
      "focus returns to toolbar"
    );
    const page = connections[0];
    await page.call("Emulation.setDeviceMetricsOverride", {
      width: 520,
      height: 850,
      deviceScaleFactor: 1,
      mobile: false
    });
    await button("Compare", 'document.querySelector("header")');
    assert.equal(
      await graph.evaluate(
        '(() => {const r=document.querySelector("[role=dialog]").getBoundingClientRect();return r.left>=0 && r.right<=innerWidth;})()'
      ),
      true
    );
    const screenshot = await page.call("Page.captureScreenshot");
    fs.writeFileSync(
      path.join(artifacts, "narrow-window.png"),
      Buffer.from(screenshot.data, "base64")
    );
    await button("Close");
    await contextCommit("bisect revision 8");
    await graph.evaluate(
      `document.querySelector('[role=menu]').dispatchEvent(new KeyboardEvent('keydown',{key:'End',bubbles:true}))`
    );
    await until(
      () =>
        graph.evaluate(
          `(() => {const menu=document.querySelector('[role=menu]');if(!menu)return false;const active=document.getElementById(menu.getAttribute('aria-activedescendant'));return active && active.getBoundingClientRect().bottom<=menu.getBoundingClientRect().bottom;})()`
        ),
      "long menu keyboard scrolling"
    );
    await graph.evaluate(
      `document.querySelector('[role=menu]').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`
    );
    await page.call("Emulation.setDeviceMetricsOverride", {
      width: 1440,
      height: 1000,
      deviceScaleFactor: 1,
      mobile: false
    });
  });
  test("shows a graph error and retries after a Git configuration failure is repaired", async () => {
    const dir = directory();
    init(dir);
    commit("base", "retry-graph-base", dir);
    await openRepo(dir);
    const config = path.join(dir, ".git", "config");
    const original = fs.readFileSync(config, "utf8");
    try {
      fs.writeFileSync(config, original + "\n[invalid config\n");
      await button("Refresh");
      await until(
        () => graph.evaluate('!!document.querySelector("[data-graph-error] [role=alert]")'),
        "recoverable graph error"
      );
      assert.match(
        await graph.evaluate('document.querySelector("[data-graph-error]").innerText'),
        /Unable to load Git Graph/
      );
      assert.doesNotMatch(
        await graph.evaluate('document.querySelector("main").innerText'),
        /No commits yet/
      );
    } finally {
      fs.writeFileSync(config, original);
    }
    await button("Retry", 'document.querySelector("[data-graph-error]")');
    await until(
      () =>
        graph.evaluate(
          '!document.querySelector("[data-graph-error]") && [...document.querySelectorAll("tbody tr")].some(row => row.innerText.includes("retry-graph-base"))'
        ),
      "graph recovery after retry"
    );
  });

  test("keeps a renamed remote hidden across panel reopening and clears its removed preference", async () => {
    const dir = directory();
    init(dir);
    commit("base", "rename-remote-base", dir);
    git(["remote", "add", "team/upstream", dir], dir);
    const base = git(["rev-parse", "HEAD"], dir);
    const tree = git(["rev-parse", "HEAD^{tree}"], dir);
    const tip = git(["commit-tree", tree, "-p", base, "-m", "rename-remote-only"], dir);
    git(["update-ref", "refs/remotes/team/upstream/topic", tip], dir);
    await openRepo(dir);
    if (!(await graph.evaluate('!!document.querySelector("nav[aria-label=Branches]")'))) {
      await button("Branches", 'document.querySelector("header")');
    }
    const nav = `document.querySelector('nav[aria-label="Branches"]')`;
    const eye = (name) =>
      `${nav}.querySelector('button[aria-label="Show remote ${name} in the graph"]')`;
    await until(() => graph.evaluate(visible(tip)), "remote history before hiding");
    await button("Show remote team/upstream in the graph");
    await until(
      () => graph.evaluate(`${eye("team/upstream")}?.getAttribute('aria-pressed') === 'false'`),
      "hidden remote"
    );
    await button("Actions for remote team/upstream");
    await menu("Rename Remote…");
    await fill(["team/mirror"]);
    await button("Rename Remote");
    await finished();
    await until(
      () =>
        graph.evaluate(
          `${eye("team/mirror")}?.getAttribute('aria-pressed') === 'false' && !${visible(tip)}`
        ),
      "hidden renamed remote"
    );
    await vscode.commands.executeCommand("workbench.action.closeActiveEditor");
    await openRepo(dir);
    await until(
      () =>
        graph.evaluate(
          `${eye("team/mirror")}?.getAttribute('aria-pressed') === 'false' && !${visible(tip)}`
        ),
      "restored hidden remote in fresh panel"
    );
    await button("Actions for remote team/mirror");
    await menu("Remove Remote…");
    await button("Remove Remote");
    await finished();
    assert.equal(git(["remote"], dir), "");
    git(["remote", "add", "team/mirror", dir], dir);
    git(["update-ref", "refs/remotes/team/mirror/topic", tip], dir);
    await button("Refresh");
    await until(
      () =>
        graph.evaluate(
          `${eye("team/mirror")}?.getAttribute('aria-pressed') === 'true' && ${visible(tip)}`
        ),
      "re-added remote is visible"
    );
  });

  test("hides individual remotes and restores their visibility without changing Git refs", async () => {
    const dir = directory();
    init(dir);
    commit("base", "remote-base", dir);
    const base = git(["rev-parse", "HEAD"], dir);
    const tree = git(["rev-parse", "HEAD^{tree}"], dir);
    const origin = git(["commit-tree", tree, "-p", base, "-m", "remote-origin-only"], dir);
    const upstream = git(["commit-tree", tree, "-p", base, "-m", "remote-upstream-only"], dir);
    git(["remote", "add", "origin", dir], dir);
    git(["remote", "add", "upstream", dir], dir);
    git(["update-ref", "refs/remotes/origin/topic", origin], dir);
    git(["update-ref", "refs/remotes/upstream/topic", upstream], dir);
    git(["update-ref", "refs/remotes/origin/shared", base], dir);
    const refsBefore = git(["show-ref"], dir);
    await openRepo(dir);
    const nav = `document.querySelector('nav[aria-label="Branches"]')`;
    if (!(await graph.evaluate("!!" + nav))) {
      await button("Branches", 'document.querySelector("header")');
    }
    const eye = (remote) =>
      `${nav}.querySelector('button[aria-label="Show remote ${remote} in the graph"]')`;
    await until(
      () => graph.evaluate(`${visible(origin)} && ${visible(upstream)} && !!${eye("origin")}`),
      "both remote histories"
    );
    await graph.evaluate(`${eye("origin")}.click()`);
    await until(
      () => graph.evaluate(`!${visible(origin)} && ${visible(upstream)} && ${visible(base)}`),
      "one remote hidden"
    );
    assert.equal(await graph.evaluate(`${eye("origin")}.getAttribute('aria-pressed')`), "false");
    assert.ok(await graph.evaluate(`${nav}.innerText.includes('origin')`));
    assert.equal(
      await graph.evaluate(`!!document.querySelector('tbody span[title^="origin/"]')`),
      false
    );
    if (!(await graph.evaluate('!!document.querySelector("[data-history-search]")'))) {
      await button("Search history", 'document.querySelector("header")');
    }
    await graph.evaluate(`(() => {
      const input = document.querySelector('[data-history-search]');
      input.value = 'remote-'; input.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);
    await button("Search", 'document.querySelector("form[role=search]")');
    await until(
      () =>
        graph.evaluate(
          `!${visible(origin)} && ${visible(upstream)} && !!document.querySelector('main').innerText.includes('Filtered history')`
        ),
      "search respects hidden remote"
    );
    await button("Return to Graph");
    await headerChoice("Branch", "Show All");
    await graph.evaluate(`document.querySelector('header button[title="*"]').click()`);
    assert.equal(
      await graph.evaluate(
        `[...document.querySelectorAll('[role=option]')].some(option => option.title.startsWith('remotes/origin/'))`
      ),
      false
    );
    await graph.evaluate(`document.querySelector('header button[title="*"]').click()`);
    await openRepo(repo);
    await openRepo(dir);
    await until(
      () =>
        graph.evaluate(
          `!${visible(origin)} && ${visible(upstream)} && ${eye("origin")}?.getAttribute('aria-pressed') === 'false'`
        ),
      "saved remote visibility"
    );
    await graph.evaluate(`${nav}.querySelector('button[title="origin/topic"]').click()`);
    await until(
      () =>
        graph.evaluate(
          `${visible(origin)} && ${eye("origin")}.getAttribute('aria-pressed') === 'true'`
        ),
      "selecting hidden branch reveals it"
    );
    await graph.evaluate(`${eye("origin")}.click()`);
    await until(
      () =>
        graph.evaluate(
          `!${visible(origin)} && ${visible(upstream)} && !!document.querySelector('header button[title="*"]')`
        ),
      "hiding selected remote clears selection"
    );
    await button("Show Remote Branches", nav);
    await until(
      () => graph.evaluate(`!${visible(origin)} && !${visible(upstream)} && ${visible(base)}`),
      "all remotes hidden"
    );
    await button("Show Remote Branches", nav);
    await until(
      () => graph.evaluate(`!${visible(origin)} && ${visible(upstream)}`),
      "individual choice retained after global toggle"
    );
    await graph.evaluate(`${eye("origin")}.click()`);
    await until(
      () => graph.evaluate(`${visible(origin)} && ${visible(upstream)}`),
      "remote restored"
    );
    assert.equal(git(["show-ref"], dir), refsBefore);
    assert.equal(git(["branch", "--show-current"], dir), "main");
    const screenshot = await connections[0].call("Page.captureScreenshot");
    fs.writeFileSync(
      path.join(artifacts, "remote-visibility.png"),
      Buffer.from(screenshot.data, "base64")
    );
    await openRepo(repo);
  });

  test("clips wide graphs to their column and scrolls lanes without moving commit text", async () => {
    const dir = directory();
    init(dir);
    commit("base", "wide-base", dir);
    const base = git(["rev-parse", "HEAD"], dir);
    const tree = git(["rev-parse", "HEAD^{tree}"], dir);
    for (let index = 0; index < 14; index++) {
      const hash = git(["commit-tree", tree, "-p", base, "-m", "wide-lane-" + index], dir);
      git(["branch", "lane-" + index, hash], dir);
    }
    await openRepo(dir);
    const measure = () =>
      graph.evaluate(`(() => {
      const viewport = document.querySelector('[data-graph-viewport]');
      const scroll = document.querySelector('[data-graph-scroll]');
      const table = document.querySelector('table');
      const description = table.querySelector('thead th:nth-child(2)').getBoundingClientRect();
      return { clipRight: viewport.getBoundingClientRect().right, descriptionLeft: description.left,
        width: viewport.clientWidth, scrollWidth: scroll.scrollWidth, scrollLeft: scroll.scrollLeft,
        viewportScroll: viewport.scrollLeft, overflow: getComputedStyle(viewport).overflowX,
        dots: [...viewport.querySelectorAll('circle')].map(dot => dot.getBoundingClientRect().x),
        rows: [...table.querySelectorAll('tr[data-commit-hash]')].map(row => row.dataset.commitHash) };
    })()`);
    await until(async () => {
      const state = await measure();
      return state.rows.length === 15 && state.scrollWidth > state.width;
    }, "wide graph overflow");
    let before = await measure();
    assert.ok(
      before.clipRight <= before.descriptionLeft + 1,
      "graph cannot paint over description"
    );
    assert.equal(before.overflow, "hidden");
    await graph.evaluate(`(() => {
      const scroll = document.querySelector('[data-graph-scroll]');
      scroll.scrollLeft = 10000; scroll.dispatchEvent(new Event('scroll'));
    })()`);
    let after = await measure();
    assert.ok(after.scrollLeft > 0);
    assert.equal(after.viewportScroll, after.scrollLeft);
    assert.equal(after.descriptionLeft, before.descriptionLeft);
    assert.deepEqual(after.rows, before.rows);
    assert.ok(after.dots[0] < before.dots[0]);
    before = after;
    await graph.evaluate(`document.querySelector('[data-graph-scroll]').focus()`);
    await connections[0].call("Input.dispatchKeyEvent", {
      type: "keyDown",
      key: "ArrowLeft",
      code: "ArrowLeft",
      windowsVirtualKeyCode: 37
    });
    await connections[0].call("Input.dispatchKeyEvent", {
      type: "keyUp",
      key: "ArrowLeft",
      code: "ArrowLeft",
      windowsVirtualKeyCode: 37
    });
    await until(
      async () => (await measure()).scrollLeft < before.scrollLeft,
      "keyboard graph scrolling"
    );
    const keyboard = await measure();
    assert.equal(keyboard.viewportScroll, keyboard.scrollLeft);
    await graph.evaluate(
      `document.querySelector('tbody td').dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, shiftKey: true, deltaY: 20 }))`
    );
    assert.ok((await measure()).scrollLeft > keyboard.scrollLeft, "Shift+wheel scrolls graph");
    await connections[0].call("Emulation.setDeviceMetricsOverride", {
      width: 650,
      height: 850,
      deviceScaleFactor: 1,
      mobile: false
    });
    await until(async () => {
      const state = await measure();
      return (
        (await graph.evaluate("innerWidth < 700")) && state.clipRight <= state.descriptionLeft + 1
      );
    }, "narrow window graph clipping");
    await connections[0].call("Emulation.setDeviceMetricsOverride", {
      width: 1440,
      height: 1000,
      deviceScaleFactor: 1,
      mobile: false
    });
    await until(() => graph.evaluate("innerWidth > 1000"), "restored window size");
    await graph.evaluate(`(() => {
      const cell = document.querySelector('thead th');
      const grip = cell.querySelector('[role=separator]');
      const rect = cell.getBoundingClientRect();
      grip.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: rect.right }));
      window.dispatchEvent(new MouseEvent('mousemove', { clientX: rect.left + 40 }));
      window.dispatchEvent(new MouseEvent('mouseup'));
    })()`);
    await until(async () => (await measure()).width < before.width, "narrower graph column");
    before = await measure();
    assert.ok(before.clipRight <= before.descriptionLeft + 1);
    await graph.evaluate(
      `document.querySelector('tbody td').dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaX: -50 }))`
    );
    after = await measure();
    assert.ok(after.scrollLeft < before.scrollLeft);
    assert.equal(after.viewportScroll, after.scrollLeft);
    assert.equal(after.descriptionLeft, before.descriptionLeft);
    await graph.evaluate(`document.querySelector('tr[data-commit-hash] td:nth-child(2)').click()`);
    await until(
      () =>
        graph.evaluate(
          `(() => {
            const selected = document.querySelector('tr[aria-selected="true"]');
            return selected && document.querySelector('td[colspan="4"]')?.textContent.includes(selected.dataset.commitHash);
          })()`
        ),
      "commit selection and expansion after scrolling"
    );
    assert.ok(
      await graph.evaluate(`(() => {
      const rows = [...document.querySelectorAll('tr[data-commit-hash]')];
      return [...document.querySelectorAll('[data-graph-viewport] circle')].every((dot, index) => {
        const vertex = dot.getBoundingClientRect(); const row = rows[index].getBoundingClientRect();
        return Math.abs(vertex.top + vertex.height / 2 - (row.top + row.height / 2)) < 2;
      });
    })()`),
      "graph stays aligned with rows and expanded details"
    );
    const screenshot = await connections[0].call("Page.captureScreenshot");
    fs.writeFileSync(
      path.join(artifacts, "wide-graph-scroll.png"),
      Buffer.from(screenshot.data, "base64")
    );
    await headerChoice("Branch", "main");
    await until(
      async () => (await measure()).rows.length === 1 && (await measure()).viewportScroll === 0,
      "scroll clamps after graph shrinks"
    );
    await openRepo(repo);
  });

  test("lists branches, remotes, tags and stashes beside the graph and switches the graph from them", async () => {
    const pane = directory();
    init(pane);
    commit("f", "pane-base", pane);
    git(["branch", "pane-feature"], pane);
    git(["tag", "-a", "pane-tag", "-m", "pane tag"], pane);
    git(["update-ref", "refs/remotes/mirror/main", "HEAD"], pane);
    fs.writeFileSync(path.join(pane, "f"), "stashed");
    git(["stash", "push", "-m", "pane stash"], pane);
    await openRepo(pane);
    const nav = `document.querySelector('nav[aria-label="Branches"]')`;
    if (!(await graph.evaluate("!!" + nav))) {
      await button("Branches", 'document.querySelector("header")');
    }
    await until(
      () =>
        graph.evaluate(
          `(() => { const nav = ${nav}; return !!nav && ["pane-feature", "mirror", "pane-tag", "pane stash"].every((text) => nav.innerText.includes(text)); })()`
        ),
      "branches pane contents"
    );
    await button("pane-feature", nav);
    await until(
      () => graph.evaluate(`!!document.querySelector('header button[title="pane-feature"]')`),
      "graph filtered to pane-feature"
    );
    await button("Show All", nav);
    await until(
      () => graph.evaluate(`!!document.querySelector('header button[title="*"]')`),
      "graph shows all branches"
    );
    const eye = `${nav}.querySelector('button[aria-pressed]')`;
    await graph.evaluate(`${eye}.click()`);
    await until(
      () =>
        graph.evaluate(
          `${eye}.getAttribute('aria-pressed') === 'false' && ${nav}.innerText.includes('Hidden from the graph')`
        ),
      "remote branches hidden"
    );
    await button("main", `${nav}.querySelector('[aria-labelledby]:nth-of-type(2)')`);
    await until(
      () =>
        graph.evaluate(
          `${eye}.getAttribute('aria-pressed') === 'true' && !!document.querySelector('header button[title="remotes/mirror/main"]')`
        ),
      "remote branch selected and shown again"
    );
    await button("Show All", nav);
    await graph.evaluate(`${nav}.querySelector('input').focus()`);
    const page = connections[0];
    const screenshot = await page.call("Page.captureScreenshot");
    fs.writeFileSync(
      path.join(artifacts, "branches-pane.png"),
      Buffer.from(screenshot.data, "base64")
    );
  });
});

async function contextCommit(subject) {
  await until(
    () =>
      graph.evaluate(
        `(() => { const row=[...document.querySelectorAll('tr[data-commit-hash]')].find(r=>r.textContent.includes(${JSON.stringify(subject)})); if(!row)return false;row.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,clientX:180,clientY:240}));return true; })()`
      ),
    "commit menu " + subject
  );
}
async function selectCommits(subjects) {
  for (const subject of subjects) {
    await until(
      () =>
        graph.evaluate(
          `(() => { const row=[...document.querySelectorAll('tr[data-commit-hash]')].find(r=>r.textContent.includes(${JSON.stringify(subject)}));if(!row)return false;row.dispatchEvent(new MouseEvent('click',{bubbles:true,ctrlKey:true}));return true; })()`
        ),
      "select " + subject
    );
  }
}
