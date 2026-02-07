# Sorcerer: Claude Code Agent Orchestration App

## Design Document — 2026-02-06

---

## Overview

Sorcerer is an Electron desktop app that orchestrates multiple Claude Code sessions in isolated git worktrees, managed through a sidebar-driven UI. It targets Windows first via a cross-platform stack (Electron + React + TypeScript).

---

## Key Decisions

| Decision | Choice |
|----------|--------|
| Framework | Electron + React + TypeScript |
| Claude Code interaction | CLI subprocess via PTY (node-pty) |
| UI layout | Sidebar + single terminal view |
| Workspace isolation | Git worktrees |
| Agent team display | Transparent nesting in sidebar |
| Persistence | SQLite via better-sqlite3 + Drizzle ORM |
| Build tooling | Single Electron app with Vite (electron-vite) |
| Styling | Tailwind CSS + Radix UI primitives |

---

## Architecture

### Process Architecture

- **Main process** — Manages the application lifecycle, spawns and manages Claude Code child processes via `node-pty`, handles git worktree creation/deletion, and owns the SQLite database connection. All filesystem and process operations happen here.
- **Renderer process** — React app that renders the UI. Communicates with main via Electron IPC. Renders terminal output using xterm.js. Never touches Node.js APIs directly.
- **Preload script** — Exposes a typed IPC bridge (`window.sorcerer`) to the renderer, keeping the context bridge secure.

### Key Dependencies

| Concern | Library |
|---------|---------|
| Desktop shell | Electron |
| Bundler | Vite (via electron-vite) |
| UI framework | React + TypeScript |
| Terminal | xterm.js + node-pty |
| Styling | Tailwind CSS |
| UI primitives | Radix UI |
| State management | Zustand |
| Database | better-sqlite3 + Drizzle ORM |
| Git operations | simple-git |

### Directory Structure

```
sorcerer/
  src/
    main/           # Electron main process
      ipc/          # IPC handlers
      services/     # Worktree, PTY, DB, FileWatcher services
      db/           # Schema, migrations
    preload/        # Context bridge
    renderer/       # React app
      components/   # UI components
      stores/       # Zustand stores
      hooks/        # Custom hooks
      layouts/      # App layout
  resources/        # Icons, assets
  electron.vite.config.ts
  package.json
```

---

## Data Model

### Projects & Sessions

A **project** is a registered git repository. A **session** is one Claude Code instance in its own worktree. Multiple sessions can run against the same project simultaneously, and sessions can span different projects.

Sidebar structure:

```
My App (project)
  ├── feature-auth (session, active)
  │   ├── teammate-1
  │   └── teammate-2
  ├── fix-bug-123 (session, idle)
  └── refactor-api (session, active)
Another Project (project)
  └── add-tests (session, active)
```

No artificial limits — as many sessions as the machine can handle across as many projects as needed.

### Database Schema (SQLite)

**`projects` table:**

| Column | Type | Description |
|--------|------|-------------|
| id | TEXT (UUID) | Primary key |
| name | TEXT | Display name (derived from repo folder name) |
| path | TEXT | Absolute path to the git repo |
| setup_script | TEXT | Optional script to run after worktree creation |
| created_at | INTEGER | Timestamp |

**`sessions` table:**

| Column | Type | Description |
|--------|------|-------------|
| id | TEXT (UUID) | Primary key |
| project_id | TEXT (FK) | Links to projects table |
| name | TEXT | User-given session name |
| branch | TEXT | Git branch name for this worktree |
| worktree_path | TEXT | Absolute path to the worktree directory |
| status | TEXT | `active`, `idle`, `archived`, `deleted` |
| parent_session_id | TEXT (FK, nullable) | Self-referencing FK for teammates |
| team_name | TEXT (nullable) | Links to `~/.claude/teams/{team_name}/` |
| pid | INTEGER (nullable) | Claude Code process ID while running |
| created_at | INTEGER | Timestamp |
| archived_at | INTEGER (nullable) | When session was archived |

**`settings` table:**

| Column | Type | Description |
|--------|------|-------------|
| key | TEXT | Primary key |
| value | TEXT | JSON-encoded value |

---

## Session & Worktree Lifecycle

### Creating a session

1. User clicks "New Session" and selects a target git repository
2. Sorcerer calls `git worktree add` to create a new worktree under `~/.sorcerer/workspaces/<repo-name>/<session-name>/` on a new branch
3. A setup script runs if configured for that repo (e.g., `npm install`, symlink `.env`)
4. Sorcerer spawns `claude` via `node-pty` with the worktree directory as CWD
5. The xterm.js instance in the renderer connects to the PTY output stream
6. Session metadata is persisted to SQLite

### Active session

- Terminal I/O flows: `xterm.js (renderer) → IPC → node-pty (main) → claude process`
- Session status tracked: `active`, `idle`, `waiting` (for permission prompt), `completed`

### Ending a session

1. User can close the session, which sends SIGTERM to the claude process
2. Optionally archive (keeps history in SQLite, removes worktree)
3. Or delete entirely (removes worktree, cleans git branch, removes DB record)

---

## Main Process Services

### WorktreeService

- Wraps `simple-git` to manage git worktree operations
- `create(projectPath, sessionName)` — creates worktree, checks out new branch
- `remove(worktreePath)` — deletes worktree directory and prunes git references
- `list(projectPath)` — returns all active worktrees for a project
- Runs per-project setup scripts after worktree creation

### PTYService

- Manages `node-pty` instances, one per session
- `spawn(worktreePath)` — starts `claude` process with CWD set to the worktree
- `write(sessionId, data)` — forwards terminal input from the renderer
- `onData(sessionId, callback)` — streams terminal output back to the renderer
- `kill(sessionId)` — sends SIGTERM to gracefully stop a Claude Code process

### DatabaseService

- Owns the SQLite connection via `better-sqlite3`
- Drizzle ORM schema defines `projects`, `sessions`, and `settings` tables
- Database file stored at `~/.sorcerer/sorcerer.db`

### FileWatcherService

- Watches `~/.claude/teams/`, `~/.claude/tasks/`, and optionally `~/.claude/projects/` using `chokidar`
- Parses `config.json` for team membership
- Parses task JSON files for status/owner/activeForm
- Emits structured events: `team-created`, `team-updated`, `task-updated`, `agent-status-changed`
- Caches parsed data with short TTL to avoid redundant reads
- Debounced at ~500ms

### IPCService

- Registers all `ipcMain.handle` handlers
- Groups handlers by domain: `workspace:*`, `session:*`, `project:*`, `settings:*`, `teams:*`, `terminal:*`
- Validates inputs before forwarding to the appropriate service

---

## Team & Agent Detection

Claude Code stores all team/task state as JSON files under `~/.claude/`. Sorcerer reads and watches these files — it is **purely observational** for teams that Claude Code spawns itself.

### Claude Code filesystem layout

```
~/.claude/
  teams/{team-name}/
    config.json                # Team metadata + member roster
    inboxes/
      team-lead.json           # Per-agent message inbox
      worker-1.json
  tasks/{team-name}/
    .highwatermark             # Next task ID counter
    .lock                      # Concurrency lock
    1.json                     # Individual task files
    2.json
  task-history.jsonl           # Append-only log of completed tasks
```

### Team config.json structure

```json
{
  "name": "my-project",
  "description": "Working on feature X",
  "leadAgentId": "team-lead@my-project",
  "members": [
    {
      "agentId": "team-lead@my-project",
      "name": "team-lead",
      "agentType": "team-lead",
      "backendType": "in-process"
    },
    {
      "agentId": "worker-1@my-project",
      "name": "worker-1",
      "agentType": "general-purpose",
      "model": "haiku"
    }
  ]
}
```

### Task file structure

```json
{
  "id": "1",
  "subject": "Task title",
  "description": "Detailed description",
  "activeForm": "Working on task",
  "status": "in_progress",
  "owner": "worker-1",
  "blocks": [],
  "blockedBy": []
}
```

### How Sorcerer uses this

1. **Team detection** — FileWatcherService watches for `config.json` creation in `~/.claude/teams/`
2. **Sidebar population** — Each member from `config.json` becomes a child node under the parent session
3. **Task status** — Task file changes update agent status indicators via the `owner` and `status` fields
4. **Agent messaging** — Inbox files can be read for visibility into inter-agent coordination
5. **Real-time updates** — File watcher events propagated to renderer via IPC

---

## Renderer Architecture

### Layout

```
┌──────────────────────────────────────────┐
│  Title Bar (drag region, window controls)│
├────────────┬─────────────────────────────┤
│            │                             │
│  Sidebar   │     Terminal View           │
│  (240px)   │     (xterm.js)              │
│            │                             │
│  Projects  │                             │
│   └ Sessions                             │
│     └ Teammates                          │
│            │                             │
│            │                             │
│            ├─────────────────────────────┤
│  ────────  │  Status Bar                 │
│  + New     │  (session info, branch,     │
│  Session   │   agent status)             │
└────────────┴─────────────────────────────┘
```

### Zustand Stores

- `useProjectStore` — list of registered projects, active project selection
- `useSessionStore` — all sessions, active session ID, session status updates
- `useSettingsStore` — app-level preferences (theme, font size, default shell)

### Key Components

- `AppLayout` — top-level shell with sidebar and main content area
- `Sidebar` — collapsible tree of projects/sessions/teammates with status indicators
- `TerminalView` — wraps xterm.js, connects to active session's PTY stream via IPC
- `StatusBar` — current session name, git branch, agent status
- `NewSessionDialog` — Radix dialog for creating a session
- `ProjectSettingsDialog` — configure setup scripts, default branch, per-project options

### Terminal Connection Flow

1. User clicks a session in sidebar
2. `useSessionStore` updates `activeSessionId`
3. `TerminalView` calls `window.sorcerer.terminal.onData(id, callback)` to subscribe to PTY output
4. Keystrokes flow back via `window.sorcerer.terminal.write(id, data)`

---

## IPC Contract

All methods return promises. Callback-based methods return unsubscribe functions.

### Project operations

```typescript
sorcerer.project.list()                    // → Project[]
sorcerer.project.add(path: string)         // → Project
sorcerer.project.update(id, settings)      // → Project
sorcerer.project.remove(id: string)        // → void
```

### Session operations

```typescript
sorcerer.session.create(projectId, name)   // → Session
sorcerer.session.kill(sessionId)           // → void
sorcerer.session.archive(sessionId)        // → void
sorcerer.session.delete(sessionId)         // → void
sorcerer.session.list(projectId?)          // → Session[]
```

### Terminal I/O

```typescript
sorcerer.terminal.write(sessionId, data)   // → void
sorcerer.terminal.onData(sessionId, cb)    // → unsubscribe fn
sorcerer.terminal.resize(sessionId, cols, rows) // → void
```

### Team/agent monitoring

```typescript
sorcerer.teams.list()                      // → Team[]
sorcerer.teams.getTasks(teamName)          // → Task[]
sorcerer.teams.getInbox(teamName, agent)   // → Message[]
sorcerer.teams.onUpdate(cb)               // → unsubscribe fn
```

### Settings

```typescript
sorcerer.settings.get(key)                 // → any
sorcerer.settings.set(key, value)          // → void
```

---

## Implementation Roadmap

### Phase 1 — Skeleton (get a window with a terminal)

- Initialize Electron + Vite project with `electron-vite`
- Set up Tailwind CSS + Radix UI
- Basic app layout: sidebar (hardcoded placeholder) + main area
- Embed xterm.js in the main area, spawn a single `claude` process via `node-pty`
- Verify terminal I/O works end-to-end
- **Result:** Interact with Claude Code inside Sorcerer

### Phase 2 — Projects & Sessions

- Set up SQLite + Drizzle ORM, create schema/migrations
- Implement ProjectService and WorktreeService in main process
- Build "Add Project" and "New Session" dialogs
- Sidebar dynamically lists projects and sessions from the database
- Clicking a session switches the terminal view to that session's PTY
- Multiple concurrent sessions with independent worktrees
- **Result:** Multi-session orchestration works

### Phase 3 — Session Lifecycle

- Session status tracking (active/idle/archived)
- Archive and delete flows (cleanup worktree, branch, DB)
- Setup script support per project
- Status indicators in sidebar (colored dots)
- Status bar showing current branch and session info
- **Result:** Full session lifecycle management

### Phase 4 — Team Integration

- FileWatcherService watching `~/.claude/teams/` and `~/.claude/tasks/`
- Sidebar tree nesting: teammates appear under parent sessions
- Task status reflected in agent status indicators
- Read-only team/task/inbox viewer panel (optional, toggleable)
- **Result:** Full visibility into Claude Code agent teams

### Phase 5 — Polish

- Settings dialog (theme, font size, shell config)
- Keyboard shortcuts (new session, switch sessions, focus sidebar)
- Window state persistence (size, position, sidebar width)
- Error handling and edge cases (process crashes, orphaned worktrees)

---

## Inspirations

- **Conductor** (conductor.build) — macOS-native orchestrator, git worktree isolation, diff viewer, checkpoint/revert, Linear/GitHub integration
- **Superset** (superset-sh/superset) — Electron + React, Turborepo monorepo, Claude Agent SDK + MCP, Monaco editor, mosaic panels, durable sessions
- **Supacode** (supabitapp/supacode) — Native Swift/SwiftUI, embedded Ghostty terminal, TCA architecture, deep GitHub PR integration
