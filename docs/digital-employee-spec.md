# Digital Employee Console Spec

## Goal

Build a local web console that lets a user assign repository-aware coding tasks to one controllable digital employee. The employee uses GitHub Copilot SDK behind a local backend, can inspect and modify one selected repository, can run allowed verification commands, and must expose its plan, activity stream, terminal output, diffs, and approval requests to the user.

## First Principles

The product is not a chat page. It is a controlled local coding worker.

The worker needs five boundaries:

1. Task boundary: the user gives one concrete coding task.
2. Workspace boundary: the worker operates inside one selected repository root.
3. Tool boundary: every file, shell, network, and git operation goes through local policy.
4. Visibility boundary: every material event is streamed to the UI.
5. Delivery boundary: the user reviews diff and verification before accepting work.

## MVP Scope

The first version ships one local employee named `Code Worker`.

Included:

- MUI React console for task entry, task state, timeline, terminal output, changed files, and approval queue.
- Local Node backend API.
- Copilot SDK session adapter using `@github/copilot-sdk`.
- Policy layer for file and command permissions.
- Session store with append-only events.
- Mockable worker path for tests and for machines without Copilot CLI ready.
- Runtime health check that reports Node, Git, Copilot CLI, and SDK readiness.

Deferred:

- Multiple employees.
- Cloud Copilot agent delegation.
- GitHub PR creation.
- Persistent auth management UI.
- External MCP integrations.
- Remote team collaboration.

## Required Runtime

- Node.js `^20.19.0 || >=22.12.0`.
- Git installed and available in `PATH`.
- GitHub Copilot CLI installed and authenticated for real Copilot execution.
- npm package `@github/copilot-sdk@1.0.1`.

## Research Basis

This design is based on the public Copilot SDK package and documentation shape, not on a guessed chat abstraction.

Verified SDK capabilities:

- `CopilotClient` starts and stops a local Copilot runtime.
- `createSession()` creates a repository-aware worker session.
- `workingDirectory` sets the local repository context.
- `streaming: true` emits assistant deltas and final messages.
- `tools` and `defineTool()` allow app-owned custom tools.
- `onPermissionRequest` intercepts shell, read, write, URL, MCP, memory, and custom-tool requests.
- `hooks` allow pre-tool, post-tool, failure, prompt, session, and error handling.
- `sendAndWait()` supports a simple task execution loop.
- SDK runtime requires GitHub Copilot CLI in `PATH` for real execution.

Primary references:

- `@github/copilot-sdk` npm metadata: package `1.0.1`, TypeScript SDK for programmatic control of GitHub Copilot CLI via JSON-RPC.
- GitHub Copilot SDK docs: `https://docs.github.com/en/copilot/how-tos/copilot-sdk`.
- GitHub changelog announcing Copilot SDK GA: `https://github.blog/changelog/2026-06-02-copilot-sdk-is-now-generally-available/`.

## Tool Design Rationale

The tool design is intentionally conservative. A digital employee should not receive unrestricted shell or filesystem access just because the UI has a "Run" button.

The first implementation relies on SDK permission interception and local policy. Custom SDK tools can be added later after the policy boundary is stable.

```text
Copilot SDK tool request
  |
  v
onPermissionRequest
  |
  v
Policy Engine
  |
  +-- allow: safe read, safe write, verification command
  +-- ask: install, commit, arbitrary shell, network/MCP/memory
  +-- deny: path escape, destructive command, git push
  |
  v
Session Event Store
```

MVP tool categories:

- Read tools: allowed inside selected repo; denied outside repo.
- Write tools: allowed inside selected repo; every write is audited by events and reviewed through git diff.
- Verification commands: allowlisted commands such as `npm test`, `npm run build`, `npm run lint`, `npm run validate`, `node --test`, `git status`, and `git diff`.
- Package and repo mutation commands: approval-required for install and commit.
- Destructive commands: denied by default.
- Network/MCP/memory: approval-required until explicit product flows exist.

Why this is reasonable:

- It maps directly to Copilot SDK permission kinds instead of inventing a parallel security model.
- It keeps the browser untrusted; the browser only sends task intent and reads events.
- It lets the backend evolve from permission interception to custom `defineTool()` tools without changing the UI contract.
- It creates an audit trail for user trust and later review screens.

## Architecture

```text
Browser UI (MUI React)
  |
  | HTTP + Server-Sent Events
  v
Local Backend
  |
  +-- Session Store
  +-- Policy Engine
  +-- Copilot SDK Adapter
  +-- Tool Broker (next step: custom defineTool tools)
  |
  v
Selected Local Repository
```

## Security Model

The browser never gets direct filesystem or shell access. The Copilot session never receives unrestricted host control from the app. All sensitive actions are represented as policy decisions.

Default policy:

- Allow read-only file access inside the selected repository.
- Allow writes inside the selected repository only through audited tool calls.
- Allow known verification commands such as `npm test`, `npm run build`, `npm run lint`, `git status`, and `git diff`.
- Ask user approval for package installation, arbitrary shell commands, network access, and git commits.
- Deny destructive shell commands and any file path outside the repository.
- Deny `git push` in MVP.

## Session Lifecycle

```text
draft -> planning -> waiting_for_approval -> running -> verifying -> completed
                                  |             |             |
                                  v             v             v
                              rejected       failed        failed
```

The backend records every transition as an event. The UI renders events in order and shows a compact current state.

## UI Layout

```text
+------------------------------------------------------------+
| Code Worker                                      health ok |
+------------------------------------------------------------+
| Repo root: /path/to/repo                                  |
| Task: [ Fix failing build and explain the root cause     ] |
| [Plan] [Run] [Stop]                                      |
+-----------------------------+------------------------------+
| Timeline                    | Review                       |
| - session created           | Changed files                |
| - plan requested            | Approval requests            |
| - npm test                  | Policy decisions             |
+-----------------------------+------------------------------+
| Terminal / streamed output                                 |
+------------------------------------------------------------+
```

Use MUI components for app shell, cards, buttons, status chips, text fields, tabs, and lists. Keep density practical for repeated engineering work.

## Backend API

- `GET /api/health`: runtime readiness and version checks.
- `GET /api/sessions`: list sessions.
- `POST /api/sessions`: create a session for `{ repoRoot, task }`.
- `POST /api/sessions/:id/plan`: ask the worker for an implementation plan.
- `POST /api/sessions/:id/run`: execute the task.
- `POST /api/sessions/:id/stop`: abort current execution.
- `GET /api/sessions/:id/events`: SSE stream for session events.
- `GET /api/sessions/:id/diff`: current git diff summary.

## Copilot SDK Integration

The adapter creates a `CopilotClient` with `workingDirectory` set to the selected repo. It creates a session with:

- `model: "gpt-5"` by default.
- `streaming: true`.
- custom `onPermissionRequest` that calls the local policy engine.
- session hooks for audit events.

The adapter forwards SDK events into the local session event stream:

- `assistant.message_delta`.
- `assistant.message`.
- `tool.execution_start`.
- `tool.execution_complete`.
- `session.idle`.
- permission decisions.

If Copilot CLI is unavailable, the backend returns a clear health warning and can run in mock mode for UI development.

## Test Repository Strategy

Use a separate local repository for end-to-end testing instead of testing against this CLI project itself:

```text
/Users/baizijun/projects/employee-hello-react
  package.json
  index.html
  src/App.jsx
  src/main.jsx
  src/styles.css
```

This keeps the console's own repository clean while validating the real product boundary:

1. The UI accepts an arbitrary repo root.
2. The backend creates a session for that repo.
3. The worker plans or runs against that repo only.
4. The diff API reports changes from that repo only.
5. The policy engine denies path escape attempts.

## Proposed File Structure

Keep the implementation modular. Each file should have one obvious reason to change.

```text
apps/employee-console/
  server/
    index.mjs            # local HTTP API, SSE, static serving
    copilot-worker.mjs   # Copilot SDK session adapter
    policy.mjs           # permission decisions
    session-store.mjs    # append-only sessions and events
    health.mjs           # runtime readiness checks
    git.mjs              # git status and diff summaries
  src/
    App.jsx              # MUI application shell
    api.js               # browser API client
    sessionEvents.js     # SSE event subscription helper
    theme.js             # MUI theme
    components/
      Timeline.jsx
      ReviewPanel.jsx
      TerminalPanel.jsx
      StatusChip.jsx
  tests/
    policy.test.mjs
    session-store.test.mjs
    session-events.test.mjs
```

The first implementation should prioritize:

1. Policy tests before exposing shell or file writes.
2. Mock Copilot mode for UI development.
3. Real Copilot SDK path only after health checks pass.
4. Separate test repository for end-to-end validation.

## Acceptance Criteria

- A developer can run the console locally.
- The UI can create a session for the current repo.
- The UI can request a plan and see streamed events.
- Policy tests cover safe, approval-required, denied command, and path escape cases.
- Existing `agentpkg-cli` tests continue to pass.
- The frontend production build succeeds.
