# Internal Agent Package Manager Blueprint

这份文档总结一套面向企业内部的 Agent Package Manager 设计，用于把 GitHub Copilot custom agents、skills、instructions、prompts 组织成可复用、可审计、可安装的内部包。

目标不是一开始做完整 marketplace，而是先打通最小闭环：

```text
author -> validate -> package -> install -> compile -> audit
```

## 1. 核心判断

GitHub Copilot 的 custom agent 和 skill 本质上是文件，不是远端 API 对象。

典型输出形态是：

```text
.github/
  agents/
    react-reviewer.agent.md
  skills/
    react-review/
      SKILL.md
  instructions/
    react-tsx.instructions.md
  prompts/
    react-reviewer.prompt.md
```

所以内部 package manager 的核心职责不是“调用 Copilot 创建对象”，而是：

- 管理这些文件的源形态
- 校验它们是否合规
- 把它们打包成可分发产物
- 安装到用户仓库
- 保护用户已有文件不被误覆盖

## 2. 三层存储模型

长期维护时，不应该只存最终 package，也不应该只存用户仓库里的 `.github/` 输出。

推荐分三层：

```text
primitive source layer
package source layer
release artifact layer
```

### Primitive Source Layer

这是可复用原子资产。

```text
agent-marketplace/
  agents/
    react-reviewer/
      agent.md
      agent.yml
      README.md

  skills/
    react-review/
      SKILL.md
      README.md
      references/
      scripts/

  instructions/
    react-tsx/
      react-tsx.instructions.md
      instruction.yml
```

原则：

- Skill 是能力原子，应该尽量独立复用。
- Agent 是编排层，负责 identity、scope、routing、completion policy。
- Instruction 是横向规则，适合放路径级或文件类型级约束。
- 不要把大段知识塞进 Agent，应该下沉到 Skill 或 references。

### Package Source Layer

Package source 描述“一整套交付物由哪些原子组成”。

```text
packages/
  react-review-kit/
    agentpkg.yml
    README.md
```

示例：

```yaml
name: react-review-kit
version: 0.1.0
target: copilot

agents:
  - react-reviewer

skills:
  - project-context
  - react-review
  - quality-gate

instructions:
  - react-tsx
```

原则：

- Package manifest 是产品定义。
- 一个 package 可以包含一个或多个 agents。
- 一个 agent 可以绑定多个 skills。
- Package 不应该隐式带上所有 shared skills，只带 manifest 声明的内容。

### Release Artifact Layer

这是给用户安装的发布产物。

```text
dist/
  react-review-kit-0.1.0.agentpkg.tgz
```

原则：

- `dist/` 产物通常不进 PR。
- CI 负责 validate、pack、publish。
- 用户安装 release artifact，而不是复制源码目录。

## 3. 用户仓库安装形态

用户仓库里应该只出现可使用输出和 lockfile。

```text
target-repo/
  .github/
    agents/
    skills/
    instructions/
    prompts/

  agentpkg.lock.json
```

可选保留 source cache：

```text
target-repo/
  .agentpkg/
    agents/
    skills/
    instructions/
    prompts/
```

最重要的边界：

- `.agentpkg/` 是 package source 或 installed source cache。
- `.github/` 是 GitHub Copilot 使用的编译输出。
- `agentpkg.lock.json` 是审计和升级依据。

## 4. GitHub Copilot Authoring 链路

VS Code 里的 GitHub Copilot custom agent 创建能力可以利用，但它应该只是 authoring/draft 阶段，不应该直接成为发布源。

推荐链路：

```text
VS Code / Copilot authoring
        |
        v
draft files
.github/agents/*.agent.md
.github/skills/*/SKILL.md
        |
        v
agentpkg import ./draft --root ./packages/react-review-kit --name react-review-kit
        |
        v
package source
.agentpkg/
        |
        v
agentpkg validate
        |
        v
agentpkg pack
        |
        v
user install
.github/
```

关键规则：

- Copilot 可以帮忙生成草稿。
- `agentpkg import <dir>` 把 `.github/` 草稿导入 `.agentpkg/`。
- 导入后，`.agentpkg/` 才是 source of truth。
- 不要让 Copilot 直接修改 release artifact。

`agentpkg import` 支持三种贡献形态：

```text
contribution/.agentpkg/{agents,skills,instructions,prompts}
contribution/.github/{agents,skills,instructions,prompts}
contribution/{agents,skills,instructions,prompts}
```

贡献者不需要手写 `agentpkg.yml`。导入时传 `--name`，CLI 会自动补齐最小 manifest：

```bash
agentpkg import ./contribution --root ./packages/review-kit --name review-kit
```

## 5. Create Agent 和 Validate Agent

`create agent` 是生成骨架。

```bash
agentpkg create agent react-reviewer \
  --skills project-context,react-review,quality-gate
```

它应该创建：

```text
agents/react-reviewer/
  agent.md
  agent.yml
  README.md
```

或者在 package source 中创建：

```text
.agentpkg/
  agents/react-reviewer.agent.md
  prompts/react-reviewer.prompt.md
  skills/react-reviewer-workflow/SKILL.md
```

`validate agent` 是发布前检查。

它应该检查：

- agent 文件是否存在
- frontmatter 是否包含 `name`、`description`、`target`
- `name` 是否 kebab-case
- agent 引用的 skills 是否存在
- package manifest 声明和真实文件是否一致
- agent 是否过长，是否把大量知识塞进编排层
- 是否引用不存在的文件
- 是否包含隐藏 Unicode 控制字符
- 是否可能覆盖用户未托管文件

简化理解：

```text
create agent   = scaffold
validate agent = lint + policy check + packaging readiness check
```

## 6. Skill 选择模型

Shared skills 不能靠手动复制目录选择，否则很快失控。

需要一个 skill catalog：

```text
skills/
  project-context/
    SKILL.md
  react-review/
    SKILL.md
  quality-gate/
    SKILL.md

skill-catalog.json
```

CLI 行为：

```bash
agentpkg skills scan
agentpkg skills list
agentpkg skills show react-review
```

创建 Agent 时显式选择：

```bash
agentpkg create agent react-reviewer \
  --skills project-context,react-review,quality-gate
```

Package manifest 中记录绑定关系：

```yaml
agents:
  react-reviewer:
    file: agents/react-reviewer/agent.md
    skills:
      - project-context
      - react-review
      - quality-gate
```

原则：

- 不要默认把所有 shared skills 打进 package。
- 不要做复杂 transitive dependency 作为第一版能力。
- 第一版使用显式 skill selection。

## 7. 贡献者流程

贡献者应该提交 source，不提交 dist 成品。

推荐流程：

```text
contributor
  |
  |-- add skill
  |-- add agent
  |-- add package manifest
  |-- run validate
  |-- run pack dry-run
  |-- open PR
```

常用命令：

```bash
agentpkg create skill react-review
agentpkg validate skill react-review

agentpkg create agent react-reviewer \
  --skills project-context,react-review,quality-gate
agentpkg validate agent react-reviewer

agentpkg create package react-review-kit \
  --agents react-reviewer \
  --skills project-context,react-review,quality-gate \
  --instructions react-tsx

agentpkg validate
agentpkg pack packages/react-review-kit --dry-run
```

PR 模板建议：

```md
## Contribution Type

- [ ] Skill
- [ ] Agent
- [ ] Instruction
- [ ] Package

## What It Adds

## Included Agents

## Included Skills

## Validation

- [ ] `agentpkg validate`
- [ ] `agentpkg pack --dry-run`
```

贡献原则：

- 想贡献能力，加 Skill。
- 想贡献 persona 或 workflow 编排，加 Agent。
- 想贡献一整套可交付方案，加 Package manifest。
- `dist/` 由 CI 发布，不由贡献者手工提交。

## 8. CLI MVP

第一版只支持 GitHub Copilot。

不要先做：

- marketplace UI
- 多 target
- 复杂依赖解析
- 自动执行 package scripts
- 自动发布

先做这些命令：

```bash
agentpkg init
agentpkg create agent <name>
agentpkg create skill <name>
agentpkg skills list
agentpkg validate
agentpkg compile
agentpkg install <package>
agentpkg audit
agentpkg pack <package>
```

最小安装流：

```bash
agentpkg install react-review-kit-0.1.0.agentpkg.tgz \
  --root /path/to/user-repo

agentpkg audit --root /path/to/user-repo
```

## 9. 安全和治理

企业内部 package manager 的第一优先级是可复现、可审计、不覆盖用户文件。

必须有这些规则：

- lockfile 记录所有 managed files 的 hash。
- 编译输出文件带 managed marker。
- 非 managed `.github/` 文件不能静默覆盖。
- `--force` 才能覆盖冲突文件。
- 默认不执行 package scripts。
- 检查隐藏 Unicode 控制字符。
- 检查路径穿越。
- 检查 symlink escape。
- registry 来源必须 allowlist。
- CI 使用 frozen install 或 lockfile 校验。

Managed marker 示例：

```md
---
name: react-reviewer
description: Review React code with repository-aware checks
target: vscode
---
<!-- managed by agentpkg -->
<!-- source: .agentpkg/agents/react-reviewer.agent.md -->

# React Reviewer
```

注意：marker 必须放在 frontmatter 后面，不能破坏 GitHub Copilot 对 frontmatter 的解析。

## 10. 推荐迭代路线

### Phase 1: Local MVP

目标：在本地跑通 create、compile、install、audit。

交付：

- `.agentpkg/` source model
- `.github/` Copilot output compiler
- `agentpkg.lock.json`
- conflict detection
- basic audit

### Phase 2: Authoring Flow

目标：接住 VS Code / Copilot 创建出来的 draft。

交付：

- `agentpkg import copilot`
- `agentpkg validate agent`
- `agentpkg validate skill`
- `--with-copilot` authoring prompt

### Phase 3: Skill Catalog

目标：贡献者可以方便选择 shared skills。

交付：

- `agentpkg skills scan`
- `agentpkg skills list`
- `skill-catalog.json`
- `create agent --skills ...`

### Phase 4: Package Release

目标：一整套 Agent + Skills 可以发布给用户。

交付：

- `agentpkg create package`
- `agentpkg pack`
- `agentpkg install *.agentpkg.tgz`
- CI validate and dry-run pack

### Phase 5: Internal Registry

目标：从内部仓库或服务发现和安装 package。

交付：

- `agentpkg search`
- `agentpkg install <name>@<version>`
- registry index
- provenance and policy check

## 11. 一句话原则

源头拆开存，产品用 manifest 组装，发布时打包，安装时编译到 `.github/`。

Copilot 创建的是 draft，`.agentpkg/` 才是 package source of truth。

Skill 是能力，Agent 是编排，Package 是产品。
