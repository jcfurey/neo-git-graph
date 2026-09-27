/* eslint-disable no-console -- This script reports provenance to the terminal. */
const { execFile, execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { promisify } = require("node:util");

const execFileAsync = promisify(execFile);

/**
 * The last commit of asispts/neo-git-graph that Branchwise was built on. It and every commit it
 * reaches are upstream work; everything after it is Branchwise's.
 */
const FORK_POINT = "f8ed5df0f4fb1340f6a30d72a088f38a6b3e64fd";
const BASELINE = path.join(__dirname, "provenance-baseline.json");
/** Generated, or this script's own record. */
const SKIPPED = new Set(["pnpm-lock.yaml", "scripts/provenance-baseline.json"]);

/**
 * Which lines carry authorship. Blank lines, punctuation, bare keywords and module wiring are
 * dictated by the code around them, so they do not count; comments and prose do.
 */
function substantiveLines(lines) {
  let importing = false;
  return lines.map((line) => {
    const text = line.trim();
    if (importing) {
      importing = !/\bfrom\s+["']/.test(text);
      return false;
    }
    if (/^(?:import\b|export\s*(?:\*|\{))/.test(text)) {
      importing = !/\bfrom\s+["']|^import\s+["']|;$/.test(text);
      return false;
    }
    return !(
      text.length <= 3 ||
      /^[{}()[\];,.:<>/*\s-]*$/.test(text) ||
      /^(?:\}\s*)?else(?:\s*\{)?$/.test(text) ||
      /^(?:return|break|continue);$/.test(text) ||
      /^<\/[\w.]+>$/.test(text)
    );
  });
}

/** The commits that belong to upstream, or null when this repository has none of its history. */
function upstreamCommits(cwd, forkPoint) {
  const git = (args) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
  if (git(["rev-parse", "--is-shallow-repository"]) === "true") {
    throw new Error("Provenance needs the full history: fetch with fetch-depth: 0");
  }
  try {
    git(["cat-file", "-e", `${forkPoint}^{commit}`]);
  } catch {
    return null;
  }
  return new Set(git(["rev-list", forkPoint]).split("\n"));
}

function isText(file) {
  const handle = fs.openSync(file, "r");
  try {
    const buffer = Buffer.alloc(8000);
    const read = fs.readSync(handle, buffer, 0, buffer.length, 0);
    return !buffer.subarray(0, read).includes(0);
  } finally {
    fs.closeSync(handle);
  }
}

/**
 * Substantive lines of each tracked file whose origin is an upstream commit, following lines
 * moved or copied between files. Uncommitted changes count as Branchwise's.
 */
async function inheritedLines({ cwd, forkPoint = FORK_POINT }) {
  const upstream = upstreamCommits(cwd, forkPoint);
  if (upstream === null) {
    return null;
  }
  const files = execFileSync("git", ["ls-files", "-z"], { cwd, encoding: "utf8" })
    .split("\0")
    .filter((file) => file && !SKIPPED.has(file))
    .filter((file) => fs.existsSync(path.join(cwd, file)) && isText(path.join(cwd, file)));

  const counts = {};
  const blame = async (file) => {
    const { stdout } = await execFileAsync(
      "git",
      ["blame", "-w", "-M", "-C", "--line-porcelain", "--", file],
      { cwd, maxBuffer: 256 * 1024 * 1024 }
    );
    const origins = [];
    const lines = [];
    let commit = "";
    for (const line of stdout.split("\n")) {
      if (/^[0-9a-f]{40} /.test(line)) {
        commit = line.slice(0, 40);
      } else if (line.startsWith("\t")) {
        origins.push(commit);
        lines.push(line.slice(1));
      }
    }
    const substantive = substantiveLines(lines);
    const count = origins.filter(
      (origin, index) => substantive[index] && upstream.has(origin)
    ).length;
    if (count > 0) {
      counts[file] = count;
    }
  };

  const queue = [...files];
  const worker = async () => {
    for (let file = queue.shift(); file !== undefined; file = queue.shift()) {
      // eslint-disable-next-line no-await-in-loop -- Each worker blames one file at a time.
      await blame(file);
    }
  };
  await Promise.all(Array.from({ length: os.availableParallelism() }, worker));
  return Object.fromEntries(Object.entries(counts).toSorted(([a], [b]) => a.localeCompare(b)));
}

/** Files whose inherited lines went up, including new ones, and files whose count went down. */
function compare(baseline, current) {
  const files = new Set([...Object.keys(baseline), ...Object.keys(current)]);
  const increased = [];
  const decreased = [];
  for (const file of [...files].toSorted()) {
    const before = baseline[file] ?? 0;
    const after = current[file] ?? 0;
    if (after > before) {
      increased.push([file, before, after]);
    } else if (after < before) {
      decreased.push([file, before, after]);
    }
  }
  return { increased, decreased };
}

const total = (counts) => Object.values(counts).reduce((sum, count) => sum + count, 0);

module.exports = { compare, inheritedLines, substantiveLines };

async function main() {
  const mode = process.argv[2];
  const cwd = path.join(__dirname, "..");
  const current = await inheritedLines({ cwd });
  if (current === null) {
    console.log("This repository has no upstream history, so no line can be inherited.");
    return;
  }

  if (mode === "--update") {
    const record = { forkPoint: FORK_POINT, total: total(current), files: current };
    fs.writeFileSync(BASELINE, JSON.stringify(record, null, 2) + "\n");
    console.log(`Recorded ${record.total} inherited lines in ${path.relative(cwd, BASELINE)}`);
    return;
  }

  if (mode === "--check") {
    const baseline = JSON.parse(fs.readFileSync(BASELINE, "utf8")).files;
    const { increased, decreased } = compare(baseline, current);
    for (const [file, before, after] of increased) {
      console.error(`${file}: ${before} → ${after} inherited lines`);
    }
    if (increased.length > 0) {
      console.error(
        "Inherited lines went up. Replace the code instead of restoring or moving upstream lines."
      );
      process.exitCode = 1;
      return;
    }
    console.log(`${total(current)} inherited lines, none added (baseline ${total(baseline)}).`);
    if (decreased.length > 0) {
      console.log("Some files went down; record that with: pnpm run provenance --update");
    }
    return;
  }

  const rows = Object.entries(current).toSorted(([, a], [, b]) => b - a);
  for (const [file, count] of rows) {
    console.log(`${String(count).padStart(6)}  ${file}`);
  }
  console.log(`${String(total(current)).padStart(6)}  inherited lines in ${rows.length} files`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
