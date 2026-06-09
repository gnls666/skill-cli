# Contributing Agent Packages

Contributors should submit reusable GitHub Copilot agents, skills, prompts, and instructions as packages under `packages/`.

You do not need to write `agentpkg.yml` by hand. Start from whatever shape you already have:

```text
my-contribution/.agentpkg/{agents,skills,instructions,prompts}
my-contribution/.github/{agents,skills,instructions,prompts}
my-contribution/{agents,skills,instructions,prompts}
```

Then import it:

```bash
node bin/agentpkg.mjs import ./my-contribution --root ./packages/my-package --name my-package
```

The import command creates or updates:

```text
packages/my-package/
  agentpkg.yml
  .agentpkg/
  .github/
  agentpkg.lock.json
```

Before opening a PR, run:

```bash
npm run validate
npm test
```

Contribution rules:

- Use kebab-case package, agent, and skill names.
- Keep source files in `.agentpkg/`; `.github/` is compiled output.
- Do not edit managed `.github/` files directly.
- Put skill-local references and scripts inside that skill folder.
- Avoid introducing dependencies unless the package really needs them.
