const { readFileSync } = require("node:fs");
const path = require("node:path");

/** Prevent accidentally packaging upstream or publishing a tag for a different version. */
function checkRelease(manifest, tag) {
  if (manifest.publisher !== "jcfurey" || manifest.name !== "neo-git-graph") {
    throw new Error("Expected extension identity jcfurey.neo-git-graph");
  }
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(manifest.version)) {
    throw new Error("Expected a stable major.minor.patch extension version");
  }
  if (tag !== undefined && tag !== `v${manifest.version}`) {
    throw new Error(`Release tag ${tag} must match v${manifest.version}`);
  }
  return `${manifest.publisher}.${manifest.name}@${manifest.version}`;
}

module.exports = { checkRelease };

if (require.main === module) {
  try {
    const manifest = JSON.parse(
      readFileSync(process.argv[3] || path.join(__dirname, "..", "package.json"), "utf8")
    );
    process.stdout.write(checkRelease(manifest, process.argv[2]) + "\n");
  } catch (error) {
    process.stderr.write(error.message + "\n");
    process.exitCode = 1;
  }
}
