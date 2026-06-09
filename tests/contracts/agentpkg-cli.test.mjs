import test from "node:test";
import assert from "node:assert/strict";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

const cli = "bin/agentpkg.mjs";

function runAgentpkg(args, options = {}) {
  return execFileSync("node", [cli, ...args], {
    encoding: "utf8",
    ...options,
  });
}

function createTempRoot(prefix) {
  return mkdtempSync(join(tmpdir(), prefix));
}

test("agentpkg creates and compiles a GitHub Copilot agent package", () => {
  const root = createTempRoot("agentpkg-create-");

  runAgentpkg(["init", "--root", root, "--name", "demo-package"]);
  runAgentpkg([
    "create",
    "agent",
    "react-reviewer",
    "--root",
    root,
    "--description",
    "Review React code with repository-aware checks",
    "--domain",
    "review React applications",
    "--verification",
    "npm test",
  ]);
  runAgentpkg(["compile", "--root", root]);

  const sourceAgent = readFileSync(
    join(root, ".agentpkg/agents/react-reviewer.agent.md"),
    "utf8",
  );
  const compiledAgent = readFileSync(
    join(root, ".github/agents/react-reviewer.agent.md"),
    "utf8",
  );
  const compiledSkill = readFileSync(
    join(root, ".github/skills/react-reviewer-workflow/SKILL.md"),
    "utf8",
  );
  const lock = JSON.parse(readFileSync(join(root, "agentpkg.lock.json"), "utf8"));

  assert.match(sourceAgent, /^---\nname: react-reviewer/m);
  assert.match(sourceAgent, /target: vscode/);
  assert.match(compiledAgent, /^---\nname: react-reviewer/m);
  assert.match(compiledAgent, /managed by agentpkg/);
  assert.match(compiledSkill, /^---\nname: react-reviewer-workflow/m);
  assert.ok(lock.files[".github/agents/react-reviewer.agent.md"]);
  assert.ok(lock.files[".github/skills/react-reviewer-workflow/SKILL.md"]);

  const auditOutput = runAgentpkg(["audit", "--root", root]);
  assert.match(auditOutput, /Audit passed/);
});

test("agentpkg refuses to overwrite unmanaged GitHub Copilot files", () => {
  const root = createTempRoot("agentpkg-conflict-");

  runAgentpkg(["init", "--root", root, "--name", "conflict-package"]);
  runAgentpkg(["create", "agent", "qa-agent", "--root", root]);
  mkdirSync(join(root, ".github/agents"), { recursive: true });
  writeFileSync(
    join(root, ".github/agents/qa-agent.agent.md"),
    "---\nname: qa-agent\n---\n# Manual Agent\n",
    "utf8",
  );

  const result = spawnSync("node", [cli, "compile", "--root", root], {
    encoding: "utf8",
  });

  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}\n${result.stderr}`, /Refusing to overwrite unmanaged file/);
});

test("agentpkg installs a local package into a target repository and compiles it", () => {
  const packageRoot = createTempRoot("agentpkg-package-");
  const targetRoot = createTempRoot("agentpkg-target-");

  runAgentpkg(["init", "--root", packageRoot, "--name", "review-kit"]);
  runAgentpkg(["create", "agent", "api-reviewer", "--root", packageRoot]);
  runAgentpkg(["init", "--root", targetRoot, "--name", "target-repo"]);
  runAgentpkg(["install", packageRoot, "--root", targetRoot]);

  assert.equal(
    existsSync(join(targetRoot, ".agentpkg/agents/api-reviewer.agent.md")),
    true,
  );
  assert.equal(
    existsSync(join(targetRoot, ".github/agents/api-reviewer.agent.md")),
    true,
  );
  assert.equal(existsSync(join(targetRoot, "agentpkg.lock.json")), true);
});

test("agentpkg create agent can prepare a Copilot authoring prompt", () => {
  const root = createTempRoot("agentpkg-copilot-");

  runAgentpkg(["init", "--root", root, "--name", "copilot-package"]);
  const output = runAgentpkg([
    "create",
    "agent",
    "release-manager",
    "--root",
    root,
    "--with-copilot",
  ]);

  const prompt = readFileSync(
    join(root, ".agentpkg/authoring/release-manager.copilot-prompt.md"),
    "utf8",
  );

  assert.match(output, /Copilot authoring prompt/);
  assert.match(prompt, /release-manager/);
  assert.match(prompt, /\.agentpkg\/agents\/release-manager\.agent\.md/);
  assert.match(prompt, /Do not edit compiled `.github\/` files/);
});

test("agentpkg imports a contributed .github bundle into package source", () => {
  const contributorRoot = createTempRoot("agentpkg-contributor-github-");
  const packageRoot = createTempRoot("agentpkg-import-target-");

  mkdirSync(join(contributorRoot, ".github/agents"), { recursive: true });
  mkdirSync(join(contributorRoot, ".github/skills/release-workflow"), { recursive: true });
  writeFileSync(
    join(contributorRoot, ".github/agents/release-manager.agent.md"),
    [
      "---",
      "name: release-manager",
      "description: Manage release preparation",
      "target: vscode",
      "---",
      "",
      "# Release Manager",
      "",
    ].join("\n"),
    "utf8",
  );
  writeFileSync(
    join(contributorRoot, ".github/skills/release-workflow/SKILL.md"),
    [
      "---",
      "name: release-workflow",
      "description: Use when preparing a release",
      "---",
      "",
      "# Release Workflow",
      "",
    ].join("\n"),
    "utf8",
  );

  const output = runAgentpkg([
    "import",
    contributorRoot,
    "--root",
    packageRoot,
    "--name",
    "release-kit",
  ]);

  assert.match(output, /Imported 2 source files/);
  assert.match(
    readFileSync(join(packageRoot, "agentpkg.yml"), "utf8"),
    /^name: release-kit/m,
  );
  assert.equal(
    existsSync(join(packageRoot, ".agentpkg/agents/release-manager.agent.md")),
    true,
  );
  assert.equal(
    existsSync(join(packageRoot, ".agentpkg/skills/release-workflow/SKILL.md")),
    true,
  );
  assert.equal(
    existsSync(join(packageRoot, ".github/agents/release-manager.agent.md")),
    true,
  );
});

test("agentpkg imports an existing .agentpkg source tree and fills missing manifest", () => {
  const contributorRoot = createTempRoot("agentpkg-contributor-source-");
  const packageRoot = createTempRoot("agentpkg-import-source-target-");

  mkdirSync(join(contributorRoot, ".agentpkg/prompts"), { recursive: true });
  writeFileSync(
    join(contributorRoot, ".agentpkg/prompts/deploy.prompt.md"),
    [
      "---",
      "description: Plan deployment work",
      "---",
      "",
      "# /deploy",
      "",
    ].join("\n"),
    "utf8",
  );

  runAgentpkg(["import", contributorRoot, "--root", packageRoot, "--name", "deploy-kit"]);

  assert.match(
    readFileSync(join(packageRoot, "agentpkg.yml"), "utf8"),
    /^name: deploy-kit/m,
  );
  assert.equal(
    existsSync(join(packageRoot, ".agentpkg/prompts/deploy.prompt.md")),
    true,
  );
  assert.equal(
    existsSync(join(packageRoot, ".github/prompts/deploy.prompt.md")),
    true,
  );
});

test("agentpkg validates all packages in a repository catalog", () => {
  const repoRoot = createTempRoot("agentpkg-catalog-");
  const packageRoot = join(repoRoot, "packages/review-kit");

  runAgentpkg(["init", "--root", packageRoot, "--name", "review-kit"]);
  runAgentpkg(["create", "agent", "review-agent", "--root", packageRoot]);

  const output = runAgentpkg(["validate-all", "--root", repoRoot]);

  assert.match(output, /Validated 1 package/);
  assert.match(output, /review-kit/);
  assert.equal(existsSync(join(packageRoot, "agentpkg.lock.json")), true);
});
