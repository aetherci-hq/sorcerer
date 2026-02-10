# Sorcerer

Desktop app for orchestrating [Claude Code](https://docs.anthropic.com/en/docs/claude-code) agents. Manage multiple sessions, projects, worktrees, and teams from a single interface.

Built with Electron, React, TypeScript, and xterm.js.

## Features

- **Multi-session management** — Run multiple Claude Code sessions side-by-side with persistent terminals
- **Project & worktree support** — Automatically create git worktrees for isolated agent workspaces
- **Team orchestration** — Monitor Claude Code teams and tasks via filesystem integration
- **Standalone agents** — Launch non-project Claude Code sessions for quick tasks
- **Session resume** — Resume previous Claude Code sessions with full context

## Tech Stack

- **Electron** — Desktop shell with native PTY support
- **React 19** + **TypeScript** — Renderer UI
- **electron-vite** — Build tooling (main/preload/renderer split)
- **xterm.js** — Terminal emulation
- **sql.js** — WASM-based SQLite for local persistence
- **node-pty** — Native pseudo-terminal bindings
- **Zustand** — State management
- **chokidar** — Filesystem watching for team/task detection
- **simple-git** — Git operations (worktree management)

## Prerequisites

- Node.js >= 18
- npm
- Windows: Visual Studio C++ Build Tools + Windows SDK (for `node-pty` native rebuild)
- Claude Code CLI installed and available on PATH

## Getting Started

```bash
# Install dependencies
npm install

# Rebuild native modules for Electron
npm run rebuild

# Start in development mode
npm run dev
```

## Build

```bash
# Build for current platform
npm run build:dist

# Platform-specific builds
npm run build:win
npm run build:mac
npm run build:linux
```

Build output goes to `dist/`.

## Project Structure

```
src/
  main/           # Electron main process
    services/     # PTY, Database, Worktree, FileWatcher
    ipc/          # IPC handlers
    db/           # SQL schema & migrations
  preload/        # Context bridge (window.sorcerer API)
  renderer/       # React app
    components/   # UI components
    layouts/      # App layout (resizable sidebar)
    stores/       # Zustand stores (project, session, team)
    hooks/        # React hooks
```

## Data

All user data is stored under `~/.sorcerer/`:

- `sorcerer.db` — SQLite database (projects, sessions)
- `workspaces/` — Git worktrees for agent sessions

## License

ISC
