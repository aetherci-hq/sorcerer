# Sorcerer — Development Guide

## Project Charter (READ THIS FIRST)

Sorcerer is a desktop workbench for AI command-line coding tools. It is NOT an IDE and must never become one.

### What Sorcerer IS
- A mission control for AI coding agents (Claude Code, Codex, Gemini CLI, Aider, etc.)
- A multi-session orchestration tool for vibe coders and AI-first developers
- A place to manage, monitor, and direct AI work across projects and branches

### What Sorcerer is NOT
- A code editor (no Monaco, no CodeMirror, no syntax highlighting)
- A file browser or file tree
- A general-purpose terminal emulator
- A debugger, linter, or build tool
- An IDE in any form

### The Litmus Test for New Features

Before implementing ANY feature, ask: **"Does this help someone orchestrate AI coding agents, or does this turn Sorcerer into an IDE?"**

- **YES — build it:** Session management, agent orchestration, AI briefings, multi-agent coordination, better prompting tools, session context/history, worktree management, team monitoring, agent output analysis.
- **NO — don't build it:** Code editing, file trees, syntax highlighting, integrated debugging, package management, git diff viewers, code search, refactoring tools, language servers.

### Guiding Principles

1. **AI-first, always.** Every feature should make AI-driven development better. If it doesn't involve AI sessions, agents, or their orchestration, it probably doesn't belong.
2. **Direct, don't type.** Users are directors, not typists. Help them give better instructions, monitor progress, and manage multiple AI work streams.
3. **Stay out of the IDE's lane.** If VS Code, Cursor, or Zed already does it well, don't rebuild it.
4. **Multi-agent is the default.** Features should scale to many concurrent agents.
5. **Tools, not opinions.** Support multiple AI CLI tools, not just one.
6. **Simple over powerful.** Resist feature creep. When in doubt, leave it out.

## Tech Stack

- Electron + React 19 + TypeScript + electron-vite
- xterm.js + node-pty for terminal sessions
- sql.js (WASM SQLite) for local storage at ~/.sorcerer/sorcerer.db
- Zustand for state management
- Worktrees at ~/.sorcerer/workspaces/<repo>/<session>/

## Architecture

- **Main process:** src/main/ — PTYService, DatabaseService, WorktreeService, FileWatcherService
- **Preload:** src/preload/index.ts — context bridge exposing window.sorcerer API
- **Renderer:** src/renderer/ — React components, Zustand stores, styles
- **IPC handlers:** src/main/ipc/handlers.ts and shared-handlers.ts

## Known Constraints

- Use sql.js, not better-sqlite3 (ABI mismatch with Electron)
- Tailwind v4 utility classes silently fail — use inline styles for padding/spacing
- Claude binary resolved via resolveClaudeBinary(), not PATH
- xterm viewport background must be overridden to match theme (#09090b)
- titleBarOverlay height must match app title bar (52px)
