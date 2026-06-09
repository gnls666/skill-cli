import test from "node:test";
import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

const cli = "bin/agentpkg.mjs";

function runAgentpkg(args) {
  return execFileSync("node", [cli, ...args], {
    encoding: "utf8",
  });
}

function writeText(path, content) {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, `${content.trim()}\n`, "utf8");
}

test("contributor bundle can be imported, validated, installed, and audited end to end", () => {
  const sandboxRoot = mkdtempSync(join(tmpdir(), "agentpkg-e2e-"));

  try {
    const contributionRoot = join(sandboxRoot, "contribution");
    const catalogRoot = join(sandboxRoot, "catalog");
    const packageRoot = join(catalogRoot, "packages/release-kit");
    const consumerRoot = join(sandboxRoot, "consumer-repo");

    writeText(
      join(contributionRoot, ".github/agents/release-manager.agent.md"),
      `
---
name: release-manager
description: Coordinate release preparation with project-aware checks
target: vscode
tools: ["read", "search", "edit", "execute"]
---

# Release Manager

Use the release workflow skill before editing release files.
`,
    );
    writeText(
      join(contributionRoot, ".github/skills/release-workflow/SKILL.md"),
      `
---
name: release-workflow
description: Use when preparing, checking, or publishing a software release.
user-invokable: true
---

# Release Workflow

1. Inspect release notes and package metadata.
2. Check tests and version state.
3. Report blockers before publishing.
`,
    );
    writeText(
      join(contributionRoot, ".github/prompts/release-plan.prompt.md"),
      `
---
description: Plan a release from local repository context
---

# /release-plan

Create a concise release plan from repository state.
`,
    );
    writeText(
      join(contributionRoot, ".github/instructions/release.instructions.md"),
      `
---
applyTo: "**/*"
---

Keep release changes small, reviewable, and verified.
`,
    );

    const importOutput = runAgentpkg([
      "import",
      contributionRoot,
      "--root",
      packageRoot,
      "--name",
      "release-kit",
    ]);
    assert.match(importOutput, /Imported 4 source files and compiled 4 GitHub Copilot files/);

    const validateOutput = runAgentpkg(["validate-all", "--root", catalogRoot]);
    assert.match(validateOutput, /Validated 1 package: release-kit/);

    const installOutput = runAgentpkg(["install", packageRoot, "--root", consumerRoot]);
    assert.match(installOutput, /Installed 4 source files and compiled 4 GitHub Copilot files/);

    const auditOutput = runAgentpkg(["audit", "--root", consumerRoot]);
    assert.match(auditOutput, /Audit passed: 4 managed files checked/);

    assert.equal(existsSync(join(packageRoot, "agentpkg.yml")), true);
    assert.equal(existsSync(join(packageRoot, "agentpkg.lock.json")), true);
    assert.equal(existsSync(join(consumerRoot, "agentpkg.lock.json")), true);

    assert.equal(
      existsSync(join(consumerRoot, ".agentpkg/agents/release-manager.agent.md")),
      true,
    );
    assert.equal(
      existsSync(join(consumerRoot, ".agentpkg/skills/release-workflow/SKILL.md")),
      true,
    );
    assert.equal(
      existsSync(join(consumerRoot, ".github/agents/release-manager.agent.md")),
      true,
    );
    assert.equal(
      existsSync(join(consumerRoot, ".github/skills/release-workflow/SKILL.md")),
      true,
    );
    assert.equal(
      existsSync(join(consumerRoot, ".github/prompts/release-plan.prompt.md")),
      true,
    );
    assert.equal(
      existsSync(join(consumerRoot, ".github/instructions/release.instructions.md")),
      true,
    );

    const compiledAgent = readFileSync(
      join(consumerRoot, ".github/agents/release-manager.agent.md"),
      "utf8",
    );
    assert.match(compiledAgent, /managed by agentpkg/);
    assert.match(compiledAgent, /source: \.agentpkg\/agents\/release-manager\.agent\.md/);
  } finally {
    rmSync(sandboxRoot, { recursive: true, force: true });
  }
});
