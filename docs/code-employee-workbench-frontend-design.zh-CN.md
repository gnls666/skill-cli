# Code Employee Workbench Frontend Design

## 定位

`Code Employee Workbench` 是一个本地代码数字员工操作台。它不是聊天工具，而是一个能让用户清楚地发任务、看计划、批准动作、观察执行、检查证据、验收结果的工程驾驶舱。

核心判断：

- 用户不是来闲聊的，是来把一个代码任务交给数字员工。
- 数字员工不是黑盒，它的计划、工具调用、命令输出、文件修改和验证结果都要可见。
- UI 的第一目标不是“像聊天一样轻”，而是“像工程控制台一样可信”。

一句话：

```text
Task in the center, context on the right, history on the left, evidence at the bottom.
```

## 产品名称

推荐名称：

```text
Code Employee Workbench
```

备选：

- `Agent Workbench`
- `Code Worker Console`
- `Local Agent Desk`
- `Developer Employee Cockpit`

我更推荐 `Code Employee Workbench`，因为它同时表达了三件事：

1. `Code`: 工作对象是代码。
2. `Employee`: 这是被管理的数字员工，不只是模型。
3. `Workbench`: 这是操作台，有任务、工具、证据和交付物。

## 设计原则

### 1. 任务优先

页面中心永远是当前任务。不要让聊天流、装饰卡片、员工头像或营销式 hero 抢走注意力。

### 2. 可控执行

用户必须清楚知道：

- 员工准备做什么。
- 员工正在做什么。
- 哪些动作需要审批。
- 哪些文件被改了。
- 哪些验证跑过了。

### 3. 证据优先

完成不是一句“done”。完成必须有证据：

- plan
- tool calls
- terminal output
- git diff
- verification result
- final summary

### 4. 本地边界明显

这个产品会操作本地仓库，所以 UI 必须持续展示：

- 当前 repo
- 当前 branch
- 当前 session
- 当前 employee
- 当前权限状态

### 5. 密度适中

这是工程工具，不是营销页。首屏应该信息密度高，但不能拥挤。卡片只用于独立信息块，不做层层嵌套。

## 用户链路

完整链路：

```text
Select repo
  -> Create task
  -> Generate plan
  -> Review plan
  -> Approve or edit task
  -> Run employee
  -> Watch timeline and terminal
  -> Handle approvals
  -> Review diff
  -> Run verification
  -> Accept / discard / continue
```

对应产品状态：

```text
empty
  -> draft
  -> planning
  -> plan_ready
  -> running
  -> waiting_for_approval
  -> verifying
  -> review_required
  -> accepted
```

失败状态：

```text
failed
blocked
stopped
permission_denied
```

## 桌面布局

桌面端采用四区结构：

```text
+----------------------------------------------------------------------------------+
| Top Bar                                                                          |
| Code Employee Workbench                 Repo: skill-cli  Branch: main  Health: OK |
+----------------------+-----------------------------------------+-----------------+
| Left Rail            | Task Workspace                          | Context Panel   |
|                      |                                         |                 |
| Projects             | +-------------------------------------+ | Employee        |
| > skill-cli          | | Task Composer                       | | Code Worker    |
|   hello-react        | | Fix build error and explain cause   | | Status: idle   |
|                      | | [Plan] [Run] [Stop] [Review Diff]   | | Mode: local    |
| Sessions             | +-------------------------------------+ |                 |
| > current            |                                         | Approvals       |
|   previous fix       | +-------------------------------------+ | npm install     |
|   refactor api       | | Execution Timeline                  | | git commit     |
|                      | | 1. Read repo instructions           | |                 |
| Employees            | | 2. Inspect package scripts          | | Context Sources |
| > Code Worker        | | 3. Run build                        | | AGENTS.md       |
|   Reviewer           | | 4. Patch module                     | | package.json    |
|   Tester             | | 5. Re-run verification              | | changed files   |
|                      | +-------------------------------------+ |                 |
+----------------------+-----------------------------------------+-----------------+
| Evidence Dock                                                                    |
| [Diff] [Terminal] [Tool Calls] [Logs] [Summary]                                  |
|                                                                                  |
| src/App.jsx                                                                      |
| - old line                                                                       |
| + new line                                                                       |
+----------------------------------------------------------------------------------+
```

### 区域职责

```text
Top Bar
  显示全局身份、repo、branch、health、当前运行状态。

Left Rail
  管项目、历史 session、员工类型。它负责导航，不负责执行。

Task Workspace
  当前任务主舞台。输入任务、看计划、看 timeline。

Context Panel
  当前员工的权限、审批、上下文来源、风险提示。

Evidence Dock
  diff、terminal、tool calls、logs、summary。它是验收区。
```

## 信息架构

```text
Workbench
  Project
    repo root
    branch
    health
    scripts
  Session
    task
    plan
    events
    status
    result
  Employee
    model
    mode
    permissions
    tools
  Context
    instructions
    files
    package metadata
    git state
  Evidence
    diff
    terminal
    tool calls
    verification
    final summary
```

## 首屏默认状态

用户第一次打开页面，不要展示空白 dashboard。应该直接给出可操作的任务入口。

```text
+----------------------------------------------------------------------------------+
| Code Employee Workbench                                      No repo selected     |
+----------------------+-----------------------------------------+-----------------+
| Recent Projects      | Start a Task                            | Setup           |
|                      |                                         |                 |
| No recent repo       | Repo root                               | Runtime         |
|                      | [ /path/to/repository                 ] | Node: ready     |
|                      |                                         | Git: ready      |
|                      | Task                                    | Copilot: check  |
|                      | [ Describe the code task...           ] |                 |
|                      |                                         |                 |
|                      | [Create Session]                       |                 |
+----------------------+-----------------------------------------+-----------------+
| Evidence Dock: hidden until a session exists                                      |
+----------------------------------------------------------------------------------+
```

原因：

- 空状态直接引导用户选择 repo 和输入任务。
- 没有 session 时隐藏 Evidence Dock，减少噪音。
- health 不阻塞输入，但明确提示真实执行需要 Copilot CLI ready。

## 当前任务状态

### Draft

```text
+-----------------------------------------+
| Task                                    |
| [ Fix failing build...                ] |
|                                         |
| Scope                                   |
| Repo: skill-cli                         |
| Branch: main                            |
|                                         |
| [Plan] [Run Directly]                   |
+-----------------------------------------+
```

### Planning

```text
+-----------------------------------------+
| Task                                    |
| Fix failing build...                    |
|                                         |
| Status: planning                        |
|                                         |
| Timeline                                |
| 1. Read AGENTS.md                       |
| 2. Inspect package.json                 |
| 3. Check test command                   |
+-----------------------------------------+
```

### Plan Ready

```text
+-----------------------------------------+
| Proposed Plan                           |
|                                         |
| 1. Reproduce build failure              |
| 2. Locate failing module                |
| 3. Apply minimal fix                    |
| 4. Run npm test                         |
|                                         |
| [Approve Run] [Edit Task] [Cancel]      |
+-----------------------------------------+
```

### Running

```text
+-----------------------------------------+
| Running                                 |
|                                         |
| Current step: npm run build             |
|                                         |
| Timeline                                |
| [done] Read instructions                |
| [done] Inspect scripts                  |
| [run ] Execute build                    |
| [wait] Patch files                      |
+-----------------------------------------+
```

### Waiting For Approval

审批必须显眼，不能埋在日志里。

```text
+---------------- Context Panel ----------------+
| Approval Required                              |
|                                                |
| Tool: shell                                    |
| Command: npm install @mui/material             |
| Reason: package install changes dependencies   |
|                                                |
| [Approve Once] [Reject] [Always Ask]           |
+------------------------------------------------+
```

### Review Required

```text
+----------------------------------------------------------------------------------+
| Review Required                                                                   |
+----------------------+-----------------------------------------+-----------------+
| Timeline             | Final Summary                           | Result          |
| build passed         | Fixed import path in src/foo.ts         | Tests: passed   |
| tests passed         | Added regression test                   | Diff: 2 files   |
|                      |                                         | [Accept]        |
|                      |                                         | [Continue]      |
|                      |                                         | [Discard]       |
+----------------------+-----------------------------------------+-----------------+
| Diff                                                                             |
| src/foo.ts                                                                       |
| - import oldPath                                                                 |
| + import newPath                                                                 |
+----------------------------------------------------------------------------------+
```

## Evidence Dock

底部不是普通 tab，它是验收证据区。

```text
+----------------------------------------------------------------------------------+
| Evidence Dock                                                                    |
| [Diff] [Terminal] [Tool Calls] [Logs] [Summary]                                  |
+----------------------------------------------------------------------------------+
| Diff                                                                             |
|                                                                                  |
| Changed files                                                                    |
| - src/foo.ts                                                                     |
| - tests/foo.test.ts                                                              |
|                                                                                  |
| Patch                                                                            |
| - old                                                                            |
| + new                                                                            |
+----------------------------------------------------------------------------------+
```

Tab 说明：

```text
Diff
  用户验收修改的主入口。

Terminal
  展示 build/test/lint 输出。

Tool Calls
  展示 read/write/shell/mcp 等工具调用记录。

Logs
  展示系统事件、错误、重试、连接状态。

Summary
  展示员工最终交付说明。
```

## Context Panel

右侧面板要回答三个问题：

```text
Who is working?
What can it access?
What does it know?
```

布局：

```text
+-----------------------------+
| Employee                    |
| Code Worker                 |
| Status: running             |
| Model: gpt-5                |
| Mode: local                 |
+-----------------------------+
| Permissions                 |
| read repo: allowed          |
| write repo: allowed         |
| shell: ask                  |
| network: ask                |
| git push: denied            |
+-----------------------------+
| Context Sources             |
| AGENTS.md                   |
| package.json                |
| git status                  |
| selected files              |
+-----------------------------+
| Approvals                   |
| No pending approvals        |
+-----------------------------+
```

## Left Rail

左侧导航不要做复杂树。第一版只保留三个分组。

```text
+----------------------+
| Projects             |
| > skill-cli          |
|   employee-hello     |
|                      |
| Sessions             |
| > Fix build          |
|   Add tests          |
|   Refactor API       |
|                      |
| Employees            |
| > Code Worker        |
|   Reviewer           |
|   Tester             |
+----------------------+
```

V1 可以只实现 `Projects` 和 `Sessions`。`Employees` 先作为信息架构预留，不要急着做多员工编排。

## Task Composer

任务输入区需要比聊天输入更结构化。

```text
+--------------------------------------------------+
| Task                                             |
| [ Fix failing build and explain root cause     ] |
|                                                  |
| Scope                                            |
| Repo: skill-cli                                  |
| Branch: main                                     |
| Worktree: optional                               |
|                                                  |
| Verification                                     |
| [x] npm test                                     |
| [ ] npm run build                                |
| [ ] npm run lint                                 |
|                                                  |
| [Plan] [Run]                                     |
+--------------------------------------------------+
```

设计理由：

- 用户输入自然语言任务。
- UI 同时让用户显式确认 repo、branch、验证命令。
- 这比单一聊天框更安全。

## Timeline

Timeline 是主反馈流，不是聊天记录。

事件类型：

```text
session.created
agent.message
plan.created
tool.started
tool.completed
permission.requested
permission.resolved
file.changed
verification.started
verification.completed
session.completed
session.failed
```

视觉结构：

```text
+--------------------------------------------------+
| Timeline                                         |
|                                                  |
| 01  Read instructions                  done      |
|     AGENTS.md                                     |
|                                                  |
| 02  Run command                        done      |
|     npm test                                     |
|                                                  |
| 03  Edit file                          running   |
|     src/foo.ts                                   |
|                                                  |
| 04  Verify                             waiting   |
|     npm run build                                |
+--------------------------------------------------+
```

每条 event 最少包含：

```text
time
type
title
detail
status
optional evidence link
```

## 宽屏布局

宽屏可以让底部 Evidence Dock 和主区域同时可见。

```text
Breakpoint: >= 1440px

+----------------+---------------------------------------------+------------------+
| Left Rail      | Task Workspace                              | Context Panel    |
+----------------+---------------------------------------------+------------------+
|                | Timeline                                    |                  |
|                |                                             |                  |
+----------------+---------------------------------------------+------------------+
| Evidence Dock spans full width                                                    |
+-----------------------------------------------------------------------------------+
```

## 中等屏布局

中等屏隐藏左侧细节，只保留项目切换按钮。

```text
Breakpoint: 960px - 1439px

+----------------------------------------------------------------------------+
| Top Bar                         [Projects] [Context]                       |
+---------------------------------------------+------------------------------+
| Task Workspace                              | Context Panel                |
+---------------------------------------------+------------------------------+
| Evidence Dock                                                              |
+----------------------------------------------------------------------------+
```

## 移动端布局

移动端不做三栏，使用 tab。

```text
+--------------------------------+
| Code Employee Workbench        |
| Repo: skill-cli                |
+--------------------------------+
| Task                           |
| [ Fix build...               ] |
| [Plan] [Run] [Stop]            |
+--------------------------------+
| Tabs                           |
| [Timeline] [Context] [Diff]    |
+--------------------------------+
| Timeline content               |
| 1. Read instructions           |
| 2. Run build                   |
+--------------------------------+
```

移动端优先级：

1. Task
2. Timeline
3. Approval
4. Diff
5. Terminal

不要在移动端强行展示完整 terminal，默认折叠。

## 视觉风格

推荐风格：

```text
Industrial clarity
```

关键词：

- 清晰
- 克制
- 工具感
- 稳定
- 可审计

不要做：

- 大 hero
- 营销式渐变
- 大量装饰图形
- 聊天软件风格
- 一屏很多圆角卡片

配色建议：

```text
background:     #F6F7F9
surface:        #FFFFFF
text:           #17202A
muted text:     #5D6673
border:         #DFE4EA
primary:        #155EEF
success:        #168256
warning:        #B76E00
danger:         #C8312B
terminal bg:    #111827
terminal text:  #D1FAE5
```

密度：

```text
Top bar height:       56
Left rail width:      240
Context panel width:  320
Evidence dock height: 280-420
Card radius:          8
Grid gap:             16
```

## MUI 组件映射

```text
App shell
  AppBar
  Toolbar
  Drawer or Box
  Grid

Controls
  Button
  TextField
  Select
  Checkbox
  ToggleButtonGroup

Status
  Chip
  Alert
  LinearProgress

Panels
  Paper
  Tabs
  List
  ListItem

Review
  Table or virtual list
  Code block
  Dialog for approval
```

图标建议：

```text
Plan:        AutoFixHigh
Run:         PlayArrow
Stop:        Stop
Approve:     CheckCircle
Reject:      Cancel
Diff:        Difference
Terminal:    Terminal
Tool call:   Build
Warning:     WarningAmber
Repo:        Folder
Session:     History
Employee:    Engineering
```

## 前端状态模型

页面状态不要全塞进一个大 `App`。建议拆成：

```text
server state
  health
  repositories
  sessions
  session detail
  events
  diff

client state
  selected repo
  selected session
  active evidence tab
  composer draft
  panel collapsed states
```

推荐：

```text
TanStack Query
  管 HTTP 数据获取和缓存。

EventSource
  管 session event stream。

Zustand or local reducer
  管 UI 本地状态。
```

## 数据到 UI 的链路

```text
User clicks Plan
  |
  v
POST /api/sessions/:id/plan
  |
  v
Backend creates Copilot SDK task
  |
  v
SDK emits events
  |
  v
Session Store appends events
  |
  v
SSE pushes events
  |
  v
Timeline updates
  |
  v
Evidence Dock updates diff / terminal / tool calls
```

审批链路：

```text
SDK requests permission
  |
  v
Policy Engine classifies request
  |
  +-- allow -> continue
  +-- deny  -> event + feedback to worker
  +-- ask   -> approval card in Context Panel
                  |
                  v
              user approve/reject
                  |
                  v
              resume worker
```

交付链路：

```text
Worker finishes
  |
  v
Run verification
  |
  v
Collect diff + terminal + summary
  |
  v
Status: review_required
  |
  v
User accepts, continues, or discards
```

## V1 页面清单

V1 只需要一个主页面：

```text
/workbench
```

该页面包含：

- repo selector
- task composer
- session timeline
- context panel
- evidence dock
- approval UI

不要先做：

- settings page
- employee marketplace
- dashboard overview
- onboarding guide
- cloud PR page

## V1 可交互控件

必须可用：

- select repo
- create session
- plan
- run
- stop
- approve permission
- reject permission
- switch evidence tab
- refresh diff

可以先是假数据或 mock：

- employee list
- session history
- context source list
- health details

## 空状态

### 无 repo

```text
No repository selected

Choose a local repository to start a task.

[Select Repo]
```

### 无 session

```text
No active session

Describe a task and create a session.
```

### 无 diff

```text
No file changes yet

Diff will appear after the employee edits files.
```

### 无 approvals

```text
No pending approvals

Risky tool calls will appear here before execution.
```

## 错误状态

### Copilot CLI missing

```text
Copilot CLI is not ready

Planning can run in mock mode, but real execution requires GitHub Copilot CLI.

[Check Again]
```

### Repo invalid

```text
Repository not found

The selected path is not a readable local repository.
```

### Permission denied

```text
Action denied by policy

Reason: git push is disabled in MVP.
```

### Worker failed

```text
Worker stopped with an error

Last event: npm run build failed

[View Terminal] [Continue Task]
```

## 组件拆分

```text
WorkbenchPage
  WorkbenchTopBar
  ProjectRail
  TaskComposer
  SessionTimeline
  ContextPanel
    EmployeeStatus
    PermissionSummary
    ApprovalQueue
    ContextSources
  EvidenceDock
    DiffTab
    TerminalTab
    ToolCallsTab
    LogsTab
    SummaryTab
```

每个组件只做一件事：

- `TaskComposer`: 产生任务意图。
- `SessionTimeline`: 展示过程。
- `ContextPanel`: 展示当前边界和审批。
- `EvidenceDock`: 展示验收证据。
- `ProjectRail`: 切换项目和 session。

## 实现优先级

```text
P0
  Layout shell
  Task composer
  Session timeline
  Evidence dock
  Mock events

P1
  Real SSE event stream
  Diff tab
  Terminal tab
  Health status

P2
  Approval queue
  Context sources
  Session history

P3
  Multi employee
  MCP source management
  Cloud agent handoff
```

## 最小验收标准

```text
1. 用户能看懂当前 repo、task、employee、status。
2. 用户能从中心区域发起 Plan 和 Run。
3. 用户能在 Timeline 看到执行过程。
4. 用户能在右侧看到权限和审批。
5. 用户能在底部看到 diff、terminal、tool calls。
6. 页面在桌面端不需要滚动就能看见主链路。
7. 移动端退化成清楚的 tab，不横向溢出。
```

## 最终设计总结

这个 Workbench 的核心不是“AI 在说什么”，而是“数字员工正在对我的代码做什么”。

所以布局必须服务于一个工程闭环：

```text
Task
  -> Plan
  -> Permission
  -> Execution
  -> Evidence
  -> Review
  -> Accept
```

最终界面要让用户形成稳定心智：

```text
Left  = where I am
Center = what I asked for and what is happening
Right = what the employee can access and what needs my approval
Bottom = what changed and whether it worked
```

这就是 `Code Employee Workbench` 的前端设计骨架。
