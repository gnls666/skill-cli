import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { basename, dirname, join, relative, resolve, sep } from "node:path";

const SOURCE_ROOT = ".agentpkg";
const LOCK_FILE = "agentpkg.lock.json";
const MANAGED_MARKER = "managed by agentpkg";
const COPILOT_MAPPINGS = [
  { source: "agents", target: ".github/agents" },
  { source: "skills", target: ".github/skills" },
  { source: "instructions", target: ".github/instructions" },
  { source: "prompts", target: ".github/prompts" },
];

function normalizeName(value, fallback = "agent-package") {
  return String(value || fallback)
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function requireKebab(value, label) {
  if (!/^[a-z][a-z0-9-]*$/.test(value)) {
    throw new Error(`${label} must be kebab-case: ${value}`);
  }
}

function titleize(value) {
  return value
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function ensureInside(root, path) {
  const relativePath = relative(root, path);
  if (relativePath.startsWith("..") || relativePath === "" || relativePath.split(sep).includes("..")) {
    throw new Error(`Path escapes package root: ${path}`);
  }
}

function ensureDir(path) {
  mkdirSync(path, { recursive: true });
}

function writeNewFile(path, content, force = false) {
  if (existsSync(path) && !force) {
    throw new Error(`Refusing to overwrite existing file: ${path}`);
  }
  ensureDir(dirname(path));
  writeFileSync(path, content.trimStart(), "utf8");
}

function hashContent(content) {
  return `sha256:${createHash("sha256").update(content).digest("hex")}`;
}

function readText(path) {
  return readFileSync(path, "utf8");
}

function listFiles(root) {
  if (!existsSync(root)) {
    return [];
  }

  const files = [];
  const entries = readdirSync(root, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFiles(fullPath));
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }
  return files.sort();
}

function readManifestName(root) {
  const manifestPath = join(root, "agentpkg.yml");
  if (!existsSync(manifestPath)) {
    return normalizeName(basename(root));
  }

  const match = readText(manifestPath).match(/^name:\s*([^\n]+)/m);
  return normalizeName(match?.[1], basename(root));
}

function loadLock(root) {
  const lockPath = join(root, LOCK_FILE);
  if (!existsSync(lockPath)) {
    return { version: 1, target: "copilot", files: {} };
  }

  return JSON.parse(readText(lockPath));
}

function writeLock(root, lock) {
  writeFileSync(join(root, LOCK_FILE), `${JSON.stringify(lock, null, 2)}\n`, "utf8");
}

function hasManagedMarker(content) {
  return content.includes(MANAGED_MARKER);
}

function insertManagedMarker(content, sourceRelativePath) {
  const marker = [
    `<!-- managed by agentpkg -->`,
    `<!-- source: ${sourceRelativePath} -->`,
  ].join("\n");

  if (content.startsWith("---\n")) {
    const endIndex = content.indexOf("\n---", 4);
    if (endIndex !== -1) {
      const frontmatterEnd = endIndex + "\n---".length;
      return `${content.slice(0, frontmatterEnd)}\n${marker}\n${content.slice(frontmatterEnd).replace(/^\n/, "")}`;
    }
  }

  return `${marker}\n${content}`;
}

function parseFrontmatter(content) {
  if (!content.startsWith("---\n")) {
    return {};
  }
  const endIndex = content.indexOf("\n---", 4);
  if (endIndex === -1) {
    return {};
  }
  const yaml = content.slice(4, endIndex);
  const result = {};
  for (const line of yaml.split("\n")) {
    const match = line.match(/^([a-zA-Z0-9_-]+):\s*(.*)$/);
    if (match) {
      result[match[1]] = match[2].replace(/^["']|["']$/g, "");
    }
  }
  return result;
}

function assertNoHiddenUnicode(content, path) {
  if (/[\u202A-\u202E\u2066-\u2069]/u.test(content)) {
    throw new Error(`Hidden bidirectional Unicode control character found: ${path}`);
  }
}

function validateSourceFile(relativePath, content) {
  assertNoHiddenUnicode(content, relativePath);

  if (relativePath.startsWith(".agentpkg/agents/")) {
    const frontmatter = parseFrontmatter(content);
    if (!frontmatter.name || !frontmatter.description || !frontmatter.target) {
      throw new Error(`Invalid agent frontmatter: ${relativePath}`);
    }
  }

  if (relativePath.endsWith("/SKILL.md")) {
    const frontmatter = parseFrontmatter(content);
    if (!frontmatter.name || !frontmatter.description) {
      throw new Error(`Invalid skill frontmatter: ${relativePath}`);
    }
  }
}

function targetPathFor(root, sourceFile) {
  const sourceRoot = join(root, SOURCE_ROOT);
  const sourceRelative = relative(sourceRoot, sourceFile);
  for (const mapping of COPILOT_MAPPINGS) {
    if (sourceRelative === mapping.source || sourceRelative.startsWith(`${mapping.source}${sep}`)) {
      const nested = sourceRelative.slice(mapping.source.length).replace(/^[/\\]/, "");
      return join(root, mapping.target, nested);
    }
  }
  return null;
}

function copyTree(sourceRoot, targetRoot, options = {}) {
  if (!existsSync(sourceRoot)) {
    throw new Error(`Package source does not exist: ${sourceRoot}`);
  }

  let filesCopied = 0;
  for (const sourceFile of listFiles(sourceRoot)) {
    const relativePath = relative(sourceRoot, sourceFile);
    const targetFile = join(targetRoot, relativePath);
    ensureInside(targetRoot, targetFile);
    if (existsSync(targetFile) && !options.force) {
      throw new Error(`Refusing to overwrite existing source file: ${targetFile}`);
    }
    ensureDir(dirname(targetFile));
    copyFileSync(sourceFile, targetFile);
    filesCopied += 1;
  }
  return filesCopied;
}

function copyMappedTree(sourceRoot, targetRoot, options = {}) {
  if (!existsSync(sourceRoot)) {
    throw new Error(`Import source does not exist: ${sourceRoot}`);
  }

  let filesCopied = 0;
  for (const mapping of COPILOT_MAPPINGS) {
    const sourceDir = join(sourceRoot, mapping.source);
    if (!existsSync(sourceDir)) {
      continue;
    }

    for (const sourceFile of listFiles(sourceDir)) {
      const relativePath = relative(sourceRoot, sourceFile);
      const targetFile = join(targetRoot, relativePath);
      ensureInside(targetRoot, targetFile);
      if (existsSync(targetFile) && !options.force) {
        throw new Error(`Refusing to overwrite existing source file: ${targetFile}`);
      }
      ensureDir(dirname(targetFile));
      writeFileSync(targetFile, stripManagedMarkers(readText(sourceFile)), "utf8");
      filesCopied += 1;
    }
  }

  return filesCopied;
}

function stripManagedMarkers(content) {
  return content
    .split("\n")
    .filter((line) => line !== "<!-- managed by agentpkg -->" && !line.startsWith("<!-- source: "))
    .join("\n");
}

function importSourceRoot(path) {
  const agentpkgRoot = join(path, SOURCE_ROOT);
  if (existsSync(agentpkgRoot)) {
    return { root: agentpkgRoot, kind: "agentpkg" };
  }

  const githubRoot = join(path, ".github");
  if (existsSync(githubRoot)) {
    return { root: githubRoot, kind: "copilot" };
  }

  for (const mapping of COPILOT_MAPPINGS) {
    if (existsSync(join(path, mapping.source))) {
      return { root: path, kind: "copilot" };
    }
  }

  throw new Error(`Import source must contain ${SOURCE_ROOT}, .github, or Copilot source directories.`);
}

function listPackageRoots(repoRoot) {
  const packagesRoot = join(repoRoot, "packages");
  if (!existsSync(packagesRoot)) {
    return [];
  }

  return readdirSync(packagesRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(packagesRoot, entry.name))
    .filter((packageRoot) => existsSync(join(packageRoot, "agentpkg.yml")) || existsSync(join(packageRoot, SOURCE_ROOT)))
    .sort();
}

export function initPackage(root, options = {}) {
  ensureDir(root);
  ensureDir(join(root, SOURCE_ROOT, "agents"));
  ensureDir(join(root, SOURCE_ROOT, "skills"));
  ensureDir(join(root, SOURCE_ROOT, "instructions"));
  ensureDir(join(root, SOURCE_ROOT, "prompts"));

  const manifestPath = join(root, "agentpkg.yml");
  if (!existsSync(manifestPath) || options.force) {
    const name = normalizeName(options.name, basename(root));
    writeFileSync(
      manifestPath,
      [
        `name: ${name}`,
        "version: 0.1.0",
        "target: copilot",
        "",
      ].join("\n"),
      "utf8",
    );
  }

  return { manifestPath };
}

export function createAgent(root, options = {}) {
  const agentName = normalizeName(options.agentName);
  requireKebab(agentName, "agent name");
  const skillName = normalizeName(options.skillName, `${agentName}-workflow`);
  requireKebab(skillName, "skill name");

  const humanName = titleize(agentName);
  const domain = options.domain || "maintain and improve software projects";
  const description =
    options.description || `Use ${humanName} for repository-aware engineering work`;
  const verification =
    options.verification || "<replace with the smallest relevant verification command>";

  initPackage(root, {});

  const agentPath = join(root, SOURCE_ROOT, "agents", `${agentName}.agent.md`);
  const promptPath = join(root, SOURCE_ROOT, "prompts", `${agentName}.prompt.md`);
  const skillPath = join(root, SOURCE_ROOT, "skills", skillName, "SKILL.md");

  writeNewFile(
    agentPath,
    `---
name: ${agentName}
description: ${description}
target: vscode
tools: ["vscode", "execute", "read", "edit", "search", "todo"]
---

# ${humanName}

## Identity

You are \`${agentName}\`, a GitHub Copilot custom agent for ${domain}.

## Scope

- Inspect repository context before broad edits.
- Keep changes scoped to the user's request.
- Use focused skills for repeatable domain workflow.

## Skill Routing

1. Start with \`${skillName}\`.
2. Use narrower skills only when their trigger conditions are met.
3. Verify before reporting completion.

## Completion Policy

Do not report completion until the requested verification passes or a concrete blocker is recorded.
`,
    options.force,
  );

  writeNewFile(
    promptPath,
    `---
agent: ${agentName}
description: Use ${humanName} for ${domain}
---

# /${agentName}

Use \`${agentName}\` for the requested task.

## Rules

1. Inspect local context first.
2. Use \`${skillName}\` before domain-specific edits.
3. Run the smallest relevant verification before completion.
`,
    options.force,
  );

  writeNewFile(
    skillPath,
    `---
name: ${skillName}
description: Use when ${agentName} needs repository-aware planning, implementation, or verification for ${domain}.
user-invokable: true
---

# ${titleize(skillName)}

Use this skill when working on ${domain}.

## Workflow

1. Inspect local project rules, source roots, manifests, and validation commands.
2. Choose direct execution for small safe tasks, or plan first for risky multi-file work.
3. Make only scoped changes.
4. Run verification:

\`\`\`bash
${verification}
\`\`\`

5. Report files changed, verification output, and blockers.

## Guardrails

- Preserve local conventions.
- Do not overwrite user work.
- Do not report completion without verification evidence.
`,
    options.force,
  );

  let authoringPromptPath = "";
  if (options.withCopilot) {
    authoringPromptPath = join(
      root,
      SOURCE_ROOT,
      "authoring",
      `${agentName}.copilot-prompt.md`,
    );
    writeNewFile(
      authoringPromptPath,
      `# Copilot Authoring Prompt: ${agentName}

Refine the source package for \`${agentName}\`.

## Editable Files

- \`.agentpkg/agents/${agentName}.agent.md\`
- \`.agentpkg/prompts/${agentName}.prompt.md\`
- \`.agentpkg/skills/${skillName}/SKILL.md\`

## Rules

- Keep valid GitHub Copilot custom-agent frontmatter.
- Keep the agent focused on ${domain}.
- Do not edit compiled \`.github/\` files.
- Do not create unrelated docs, apps, workflows, or dependencies.
- Preserve deterministic install and compile behavior.
`,
      options.force,
    );
  }

  return {
    agentName,
    skillName,
    files: [agentPath, promptPath, skillPath].concat(authoringPromptPath ? [authoringPromptPath] : []),
    authoringPromptPath,
  };
}

export function compilePackage(root, options = {}) {
  const sourceRoot = join(root, SOURCE_ROOT);
  if (!existsSync(sourceRoot)) {
    throw new Error(`Missing ${SOURCE_ROOT}. Run agentpkg init first.`);
  }

  const packageName = readManifestName(root);
  const sourceFiles = listFiles(sourceRoot).filter((file) => targetPathFor(root, file));
  const previousLock = loadLock(root);
  const nextLock = {
    version: 1,
    target: "copilot",
    package: packageName,
    files: {},
  };
  const compiled = [];

  for (const sourceFile of sourceFiles) {
    const sourceRelative = relative(root, sourceFile);
    const outputFile = targetPathFor(root, sourceFile);
    const outputRelative = relative(root, outputFile);
    const sourceContent = readText(sourceFile);
    validateSourceFile(sourceRelative, sourceContent);

    const outputContent = insertManagedMarker(sourceContent, sourceRelative);
    if (existsSync(outputFile)) {
      const existing = readText(outputFile);
      const locked = previousLock.files?.[outputRelative];
      const unchangedManaged =
        locked &&
        hasManagedMarker(existing) &&
        hashContent(existing) === locked.outputHash;
      if (!unchangedManaged && !options.force) {
        throw new Error(`Refusing to overwrite unmanaged file: ${outputRelative}`);
      }
    }

    ensureDir(dirname(outputFile));
    writeFileSync(outputFile, outputContent, "utf8");
    nextLock.files[outputRelative] = {
      package: packageName,
      source: sourceRelative,
      sourceHash: hashContent(sourceContent),
      outputHash: hashContent(outputContent),
    };
    compiled.push(outputRelative);
  }

  writeLock(root, nextLock);
  return { files: compiled };
}

export function installPackage(root, packageRoot, options = {}) {
  initPackage(root, {});

  const packageSourceRoot = join(packageRoot, SOURCE_ROOT);
  const targetSourceRoot = join(root, SOURCE_ROOT);
  const sourceStat = statSync(packageSourceRoot);
  if (!sourceStat.isDirectory()) {
    throw new Error(`Package source is not a directory: ${packageSourceRoot}`);
  }

  const filesCopied = copyTree(packageSourceRoot, targetSourceRoot, options);
  const compileResult = compilePackage(root, options);
  return {
    filesCopied,
    filesCompiled: compileResult.files.length,
  };
}

export function importPackage(root, contributionRoot, options = {}) {
  initPackage(root, {
    name: options.name,
    force: options.forceManifest === true,
  });

  const source = importSourceRoot(contributionRoot);
  const targetSourceRoot = join(root, SOURCE_ROOT);
  const filesCopied =
    source.kind === "agentpkg"
      ? copyTree(source.root, targetSourceRoot, options)
      : copyMappedTree(source.root, targetSourceRoot, options);
  const compileResult = compilePackage(root, options);

  return {
    filesCopied,
    filesCompiled: compileResult.files.length,
  };
}

export function auditPackage(root) {
  const lock = loadLock(root);
  const files = Object.entries(lock.files || {});
  let filesChecked = 0;

  for (const [outputRelative, entry] of files) {
    const outputPath = join(root, outputRelative);
    if (!existsSync(outputPath)) {
      throw new Error(`Managed file is missing: ${outputRelative}`);
    }

    const outputContent = readText(outputPath);
    if (!hasManagedMarker(outputContent)) {
      throw new Error(`Managed marker is missing: ${outputRelative}`);
    }
    assertNoHiddenUnicode(outputContent, outputRelative);
    if (hashContent(outputContent) !== entry.outputHash) {
      throw new Error(`Managed file hash changed: ${outputRelative}`);
    }

    if (entry.source) {
      const sourcePath = join(root, entry.source);
      if (existsSync(sourcePath)) {
        const sourceContent = readText(sourcePath);
        validateSourceFile(entry.source, sourceContent);
        if (hashContent(sourceContent) !== entry.sourceHash) {
          throw new Error(`Source file hash changed since compile: ${entry.source}`);
        }
      }
    }

    filesChecked += 1;
  }

  return { filesChecked };
}

export function validateAllPackages(repoRoot, options = {}) {
  const packageRoots = listPackageRoots(repoRoot);
  const packages = [];
  let filesCompiled = 0;
  let filesChecked = 0;

  for (const packageRoot of packageRoots) {
    const compileResult = compilePackage(packageRoot, {
      force: options.force === true,
    });
    const auditResult = auditPackage(packageRoot);
    packages.push({
      name: readManifestName(packageRoot),
      root: packageRoot,
      filesCompiled: compileResult.files.length,
      filesChecked: auditResult.filesChecked,
    });
    filesCompiled += compileResult.files.length;
    filesChecked += auditResult.filesChecked;
  }

  return {
    packages,
    filesCompiled,
    filesChecked,
  };
}
