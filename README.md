# Sorcerer

The desktop workbench for AI command-line coding tools. Not an IDE — a mission control for the agents that do the work.

![Sorcerer](Sorcerer_Screenshot.png)


## Download

Grab the latest release for your platform:

**[Download for Windows, macOS, and Linux](https://github.com/aetherci-hq/sorcerer/releases/latest)**

Requires an AI CLI tool like [Claude Code](https://docs.anthropic.com/en/docs/claude-code) installed and available on PATH.

> **Windows note:** The installer is not yet code-signed. SmartScreen may show "Windows protected your PC" — click **More info** → **Run anyway** to proceed. macOS users may need to right-click → Open on first launch.

## Features

- **Multi-session management** — Run multiple AI agent sessions side-by-side with persistent terminals
- **Project & worktree isolation** — Automatically create git worktrees so each session works in its own branch
- **Split view** — View and interact with multiple sessions simultaneously
- **Team awareness** — Monitor Claude Code teams and tasks via filesystem integration
- **Standalone sessions** — Launch quick agent sessions without a project
- **Session recovery** — Resume previous sessions, detect orphaned worktrees, recover from crashes
- **Quick Notes** — Per-session scratchpad that persists across restarts
- **Remote access** — Built-in HTTP + WebSocket server with token auth for browser-based access
- **Cross-platform** — Windows, macOS, and Linux

## Permissions

By default, Sorcerer runs Claude Code with `--dangerously-skip-permissions` to enable unattended multi-session workflows. This can be toggled per-session and per-agent at creation time. Review [Anthropic's documentation](https://docs.anthropic.com/en/docs/claude-code) to understand the implications.

## Terms of Service & Licensing

Sorcerer is an independent orchestration workbench. It operates as a wrapper around existing CLI-based AI agents (such as Claude Code, Gemini CLI, etc.). 

- **Independent Tool**: Sorcerer is not affiliated with, endorsed by, or sponsored by Anthropic, Google, or any other AI service provider.
- **No Circumvention**: Sorcerer does not bypass, modify, or multiplex user authentication or subscriptions. It relies entirely on the user's own local installation and valid authentication for these CLI tools.
- **Compliance**: Users are responsible for ensuring their use of underlying CLI tools through Sorcerer complies with the respective providers' Terms of Service. Sorcerer interacts with these tools via standard terminal interfaces (PTY) and does not modify their binary code or internal logic.

## How it works

Sorcerer wraps Claude Code CLI sessions in native pseudo-terminals (node-pty + xterm.js), manages git worktrees for branch isolation, and watches `~/.claude/teams/` to detect team activity. All session data is stored locally in SQLite.

## Built with

Electron, React 19, TypeScript, electron-vite, xterm.js, node-pty, sql.js, Zustand, chokidar, simple-git

## Project Charter

Sorcerer exists for people who build with AI. Not people who happen to use AI inside their editor — people whose primary workflow *is* the AI.

**Sorcerer is not an IDE.** While it's tempting to add features like a code editor, file tree, syntax highlighting, or debugger. Those tools already exist and they're excellent. Sorcerer is the layer above: it manages the AI sessions, the branching, the orchestration, and the context — so you can focus on directing the work, not typing the code.

### Guiding Principles

1. **AI-first, always.** Every feature should make AI-driven development better. If a feature doesn't involve AI sessions, agents, or their orchestration, it probably doesn't belong here.

2. **Direct, don't type.** Sorcerer users are directors, not typists. Features should help users give better instructions, monitor progress, and manage multiple streams of AI work — not manually edit files.

3. **Stay out of the IDE's lane.** No code editor. No file browser. No terminal emulator for general use. If VS Code, Cursor, or Zed already does it well, we don't rebuild it.

4. **Multi-agent is the default.** The whole point is running several AI sessions at once. Single-session convenience is fine, but features should scale to many concurrent agents.

5. **Tools, not opinions.** Support Claude Code, Codex, Gemini CLI, Aider, and whatever comes next. Sorcerer is the workbench, not the tool on it.

6. **Simple over powerful.** Resist feature creep. A clean interface with five things done well beats a cluttered one with fifty. When in doubt, leave it out.

### The Litmus Test

Before adding any feature, ask: *"Does this help someone orchestrate AI coding agents, or does this turn Sorcerer into an IDE?"* If the answer is the latter, stop.

## License

[MIT](LICENSE) — Built by [AetherCI](https://aetherci.com)
