# Autonomous Agents — Design Plan

**Date:** 2026-03-28
**Status:** Planned
**Priority:** High

## Vision

Agents are **long-running autonomous workers with a purpose, not an end state.** They don't "finish" — they watch, respond, monitor, and act. They're alive.

This is distinct from tasks (discrete units of work with completion). Agents are persistent daemon-like processes powered by Claude Code + MCP integrations.

## Real-World Use Cases

- **Email agent** — Watches inbox via MCP, drafts responses to customers, flags issues for human attention
- **Slack agent** — Monitors channels, answers customer health/status questions, escalates critical issues
- **Sentry agent** — Watches for new errors, triages severity, proactively investigates root causes, potentially opens fix PRs
- **Uptime agent** — Monitors API endpoints on a schedule, alerts on failures
- **PR reviewer agent** — Watches for new PRs on a repo, runs reviews automatically

## What Exists Today

The current agent system already has:
- MCP server configuration (connects to external services)
- System prompt (defines the agent's personality and behavior)
- Persistent working directory (~/.sorcerer/agents/{id}/)
- Start/stop lifecycle with PTY terminal
- Quick terminals and quick notes alongside
- Pop-out windows and split panels
- Remote control capability

## What's Missing

### 1. Mission Prompt
**The initial instruction that kicks off the agent's behavior.**

Currently agents start in interactive mode — blank prompt, waiting for user input. Autonomous agents need a mission:

```
"You are monitoring the Sentry project 'aetherci-production'.
When new errors appear, triage their severity and investigate
the root cause. For critical errors, draft a fix. For all errors,
summarize what happened in a brief report."
```

**Implementation:**
- Add `mission` field to agent schema (TEXT, nullable)
- When `mission` is set and agent starts, spawn with `claude -p "{mission}"` instead of interactive mode
- System prompt (`--append-system-prompt`) still applies on top
- MCP config (`--mcp-config`) still applies
- If mission is empty, fall back to current interactive mode

### 2. Auto-Start on App Launch
**Agents should always be running unless explicitly stopped.**

- Add `auto_start` field to agent schema (INTEGER, default 0)
- On app startup, after stale session cleanup, auto-start agents with `auto_start = 1`
- UI: toggle in AddAgentDialog and agent settings

### 3. Auto-Restart on Exit
**If an agent exits (rate limit, crash, mission complete), bring it back.**

- Add `auto_restart` field to agent schema (INTEGER, default 0)
- Add `restart_delay_seconds` field (INTEGER, default 30)
- When PTY exit is detected for an agent with `auto_restart = 1`:
  - Wait `restart_delay_seconds`
  - Re-spawn the agent with same config
  - Log restart count for health monitoring
- Add `max_restarts` field to prevent infinite restart loops (default 10, resets daily)
- UI: show restart count in sidebar, warning if hitting max

### 4. Notification Surface
**When an agent needs attention, surface it to the user.**

Agents can't directly notify the user today. Options:

- **Terminal output parsing** — Watch for specific patterns in agent output (e.g., "ALERT:", "NEEDS REVIEW:")
- **Briefing integration** — Include agent status and recent activity in the AI briefing
- **Toast notifications** — Agent-triggered toasts for critical events
- **Badge on sidebar** — Unread notification count on the agent's sidebar item

**MVP approach:** Briefing integration (already collects agent data) + toast on agent exit with non-zero exit code.

### 5. Agent Health Dashboard (Future)
- Uptime tracking per agent
- Restart history
- Message/token usage per agent
- Last activity timestamp
- Error rate

## Database Changes

```sql
ALTER TABLE agents ADD COLUMN mission TEXT DEFAULT '';
ALTER TABLE agents ADD COLUMN auto_start INTEGER NOT NULL DEFAULT 0;
ALTER TABLE agents ADD COLUMN auto_restart INTEGER NOT NULL DEFAULT 0;
ALTER TABLE agents ADD COLUMN restart_delay INTEGER NOT NULL DEFAULT 30;
ALTER TABLE agents ADD COLUMN max_restarts INTEGER NOT NULL DEFAULT 10;
```

## UI Changes

### AddAgentDialog
- Add "Mission" textarea — "What should this agent do?"
- Add "Auto-start" toggle — "Start when Sorcerer launches"
- Add "Auto-restart" toggle — "Restart if agent exits"
- Add restart delay field (only visible when auto-restart is on)
- Reorganize: Mission at top (most important), then MCP/system prompt (advanced), then behavior toggles

### AgentTree Sidebar
- Show running/restarting indicator
- Show restart count if > 0
- Different icon or badge for autonomous vs interactive agents

### Context Menu
- "Edit Agent" — modify mission, MCP, system prompt without deleting
- "View Logs" — show agent restart/exit history
- "Pause Agent" — stop without losing config (vs Delete)

### IdleAgentPanel
- Show last mission text
- Show exit reason if available
- "Restart with same mission" button

## Spawn Logic Changes

```typescript
// In startAgent():
if (agent.mission) {
  // Autonomous mode: run mission non-interactively
  args.push('-p', agent.mission)
} else {
  // Interactive mode: current behavior
}

// Always apply system prompt and MCP
if (agent.system_prompt) args.push('--append-system-prompt', agent.system_prompt)
if (agent.mcp_config) args.push('--mcp-config', agent.mcp_config)
```

## Auto-Restart Logic

```typescript
// In main process PTY exit handler:
ptyService.onExit((sessionId, exitCode) => {
  const agent = dbService.getAgent(sessionId)
  if (!agent || !agent.auto_restart) return

  // Check restart budget
  const todayRestarts = getRestartCount(sessionId, today)
  if (todayRestarts >= agent.max_restarts) {
    notify('Agent hit max restart limit')
    return
  }

  // Schedule restart
  setTimeout(() => {
    startAgent(services, sessionId)
    incrementRestartCount(sessionId)
  }, agent.restart_delay * 1000)
})
```

## Implementation Order

1. **Mission field + spawn logic** — Core feature, enables autonomy
2. **Auto-start on launch** — Agents persist across app restarts
3. **Auto-restart on exit** — Resilience
4. **AddAgentDialog updates** — UI for configuring all the above
5. **Notification surface** — Briefing integration + exit toasts
6. **Health dashboard** — Future, after agents are running in production

## Files to Touch

- `src/main/services/database-service.ts` — Schema migration
- `src/main/ipc/shared-handlers.ts` — startAgent spawn logic, auto-restart handler
- `src/main/index.ts` — Auto-start on app launch
- `src/main/ipc/handlers.ts` — New IPC handlers if needed
- `src/preload/index.ts` — Expose new agent fields
- `src/renderer/src/types.ts` — Agent interface update
- `src/renderer/src/components/dialogs/AddAgentDialog.tsx` — Mission, auto-start, auto-restart UI
- `src/renderer/src/components/AgentTree.tsx` — Status indicators
- `src/renderer/src/components/MainContent.tsx` — IdleAgentPanel updates
- `src/renderer/src/components/ContextMenu.tsx` — Edit agent, pause
- `src/main/services/briefing-service.ts` — Include agent mission in briefing context
