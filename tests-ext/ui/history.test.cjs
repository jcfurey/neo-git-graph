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
const connections = [];
const dirs = [];
let graph;
let repo;
function git(args, cwd = repo) {
  return cp.execFileSync("git", args, { cwd, stdio: "pipe" }).toString().trim();
}
function directory() {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "ngg-ui-")));
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
  const connection = {
    ws,
    contexts,
    call(method, params = {}) {
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
        for (const context of connection.contexts) {
          try {
            if (
              await connection.evaluate(
                '!!document.querySelector("header") && !!document.querySelector("[data-history-search]")',
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
    await button("Repository Tools ▾", 'document.querySelector("header")');
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
  suiteTeardown(() => {
    for (const connection of connections) {
      connection.ws.close();
    }
    for (const dir of dirs) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
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
    await menu("Rebase Commits After This…");
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
    await button("Repository Tools ▾");
    await menu("Reflog & Recovery");
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
    await menu("Create Fixup Commit…");
    await button("Create Fixup Commit");
    await finished();
    assert.equal(git(["log", "-1", "--format=%s"], fix), "fixup! fixup target");
    await contextCommit("fixup base");
    await menu("Rebase Commits After This…");
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
    await graph.evaluate(
      `(() => { const row=document.querySelector('tr[data-commit-hash]'); row.focus(); row.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true})); })()`
    );
    assert.equal(
      await graph.evaluate(
        'document.activeElement === document.querySelectorAll("tr[data-commit-hash]")[1]'
      ),
      true
    );
    await button("Repository Tools ▾");
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
          `(() => { const b=document.querySelector('aside button[title=${JSON.stringify(module.replaceAll("\\", "/"))}]'); if(!b)return false;b.click();return true; })()`
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
          `!!document.querySelector('aside button[title=${JSON.stringify(parent.replaceAll("\\", "/"))}]')`
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
    await button("Repository Tools ▾");
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
    await button("Repository Tools ▾");
    await menu("Workspace Fetch & Update");
    for (const dir of [local, broken]) {
      await until(
        () =>
          graph.evaluate(
            `(() => {const label=[...document.querySelectorAll('[role=dialog] label')].find(e=>e.textContent.trim()===${JSON.stringify(dir.replaceAll("\\", "/"))});if(!label)return false;label.querySelector('input').click();return true;})()`
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
    await button("Repository Tools ▾");
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
    await page.call("Emulation.setDeviceMetricsOverride", {
      width: 1440,
      height: 1000,
      deviceScaleFactor: 1,
      mobile: false
    });
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
