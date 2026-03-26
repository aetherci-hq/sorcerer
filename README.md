# Sorcerer

Desktop workbench for [Claude Code](https://docs.anthropic.com/en/docs/claude-code). Manage multiple sessions, projects, worktrees, and monitor teams from a single interface.

![Sorcerer](Sorcerer_Screenshot.png)

## Download

Grab the latest release for your platform:

**[Download for Windows, macOS, and Linux](https://github.com/aetherci-hq/sorcerer/releases/latest)**

Requires [Claude Code](https://docs.anthropic.com/en/docs/claude-code) CLI installed and available on PATH.

> **Windows note:** The installer is not yet code-signed. SmartScreen may show "Windows protected your PC" — click **More info** → **Run anyway** to proceed. macOS users may need to right-click → Open on first launch.

## Features

- **Multi-session management** — Run multiple Claude Code sessions side-by-side with persistent terminals
- **Project & worktree isolation** — Automatically create git worktrees so each session works in its own branch
- **Split view** — View and interact with multiple sessions simultaneously
- **Team awareness** — Monitor Claude Code teams and tasks via filesystem integration
- **Standalone sessions** — Launch non-project Claude Code sessions for quick tasks
- **Session recovery** — Resume previous sessions, detect orphaned worktrees, recover from crashes
- **Quick Notes** — Per-session scratchpad that persists across restarts
- **Remote access** — Built-in HTTP + WebSocket server with token auth for browser-based access
- **Cross-platform** — Windows, macOS, and Linux

## Permissions

By default, Sorcerer runs Claude Code with `--dangerously-skip-permissions` to enable unattended multi-session workflows. This can be toggled per-session and per-agent at creation time. Review [Anthropic's documentation](https://docs.anthropic.com/en/docs/claude-code) to understand the implications.

## How it works

Sorcerer wraps Claude Code CLI sessions in native pseudo-terminals (node-pty + xterm.js), manages git worktrees for branch isolation, and watches `~/.claude/teams/` to detect team activity. All session data is stored locally in SQLite.

## Built with

Electron, React 19, TypeScript, electron-vite, xterm.js, node-pty, sql.js, Zustand, chokidar, simple-git

## License

[MIT](LICENSE) — Built by [AetherCI](https://aetherci.com)
