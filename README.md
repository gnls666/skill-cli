# agentpkg-cli

Manage GitHub Copilot custom agents, skills, prompts, and instructions as local packages.

The source of truth is `.agentpkg/`. The compiled output for GitHub Copilot is `.github/`.

```text
.agentpkg/
  agents/
  skills/
  instructions/
  prompts/
        |
        v
.github/
  agents/
  skills/
  instructions/
  prompts/

agentpkg.lock.json
```

## Commands

```bash
agentpkg init [--root <path>] [--name <name>]
agentpkg import <contribution-dir> [--root <path>] [--name <name>] [--force]
agentpkg create agent <name> [--root <path>] [--skill <name>] [--with-copilot]
agentpkg compile [--root <path>] [--force]
agentpkg install <package-dir> [--root <path>] [--force]
agentpkg audit [--root <path>]
agentpkg validate-all [--root <path>] [--force]
```

## Catalog Layout

This repository stores contributed packages under `packages/`.

```text
packages/
  review-kit/
    agentpkg.yml
    .agentpkg/
      agents/
      skills/
      instructions/
      prompts/
    .github/
      agents/
      skills/
      instructions/
      prompts/
    agentpkg.lock.json
```

## Contribution Import

Contributors can provide any of these shapes:

```text
contribution/.agentpkg/{agents,skills,instructions,prompts}
contribution/.github/{agents,skills,instructions,prompts}
contribution/{agents,skills,instructions,prompts}
```

Import normalizes the contribution into package source, creates `agentpkg.yml` when needed, and compiles `.github/` output.

```bash
agentpkg import ./contribution --root ./packages/review-kit --name review-kit
```

Validate the whole catalog before opening a PR:

```bash
npm run validate
npm test
```

## Local Development

```bash
npm test
npm run test:e2e
node bin/agentpkg.mjs init --root /tmp/demo-agentpkg --name demo
node bin/agentpkg.mjs create agent react-reviewer --root /tmp/demo-agentpkg
node bin/agentpkg.mjs compile --root /tmp/demo-agentpkg
```

## Source Bundle

Create a single-file source bundle:

```bash
npm run pack:source
```

Restore it into a complete project directory:

```bash
node scripts/restore-project.mjs /tmp/agentpkg-cli-restored
```

The generated bundle is JavaScript code containing compressed project source data:

```text
dist/agentpkg-cli-source.bundle.mjs
```

Use `--bundle <path>` to restore a different bundle and `--force` to replace a non-empty target directory.

See `docs/internal-agent-package-manager.zh-CN.md` for the design notes.
