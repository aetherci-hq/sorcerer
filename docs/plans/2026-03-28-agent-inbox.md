# Agent Inbox — Design Plan

**Date:** 2026-03-28
**Status:** Planned
**Priority:** High (next feature for scheduled missions)

## Vision

A persistent inbox in the sidebar where agent findings are surfaced. Replaces ephemeral toasts for scheduled mission results. Users see what their agents found without having to check each agent's run history manually.

## Problem

Currently, when a scheduled agent finds something notable (output differs from last run), it shows a toast that disappears after 3 seconds. Users miss findings if they're not watching. There's no persistent place to see "what did my agents find while I was away?"

## Design

### Inbox Location
- Top of the sidebar, below the action bar, above agents/projects
- Collapsible section with a notification count badge
- Or: a bell icon in the sidebar footer that opens an overlay (like quick notes)

### Inbox Items
Each item represents a notable finding from an agent run:

```typescript
interface InboxItem {
  id: string
  agent_id: string
  agent_name: string
  run_id: string          // Links to the agent_runs table
  preview: string         // First ~200 chars of output
  status: 'unread' | 'read' | 'dismissed'
  created_at: number
}
```

### When Items Are Created
The orchestrator's decision layer already detects:
- **Output changed from previous run** — new findings
- **Error exit** — agent failed
- **First run** — baseline established

Each of these creates an inbox item (except "no change" which stays silent).

### UI Components

**InboxSection (sidebar)**
- Shows unread count badge on section header
- List of inbox items, newest first
- Each item: agent icon, agent name, timestamp, preview snippet
- Click → opens the agent's Mission Panel with that run selected
- Swipe/button to dismiss

**InboxOverlay (alternative)**
- Bell icon in sidebar footer with unread count badge
- Click opens a panel overlay (like quick notes or briefing)
- Scrollable list of all inbox items
- Mark all as read button

### Database

```sql
CREATE TABLE inbox (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  run_id TEXT NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
  preview TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'unread',
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
```

### Integration Points

- **Agent Orchestrator** (`agent-orchestrator.ts`): Create inbox items in `handleRunComplete` when findings are notable
- **Briefing Service** (`briefing-service.ts`): Include unread inbox count and recent items in briefing context
- **Sidebar** (`Sidebar.tsx`): Render inbox section or bell icon
- **App.tsx**: Listen for `agent:run-complete` IPC events to update inbox store in real-time

### Implementation Order

1. Database table + CRUD operations
2. Orchestrator integration (create items on notable findings)
3. Inbox store (Zustand)
4. Sidebar UI (section or bell icon)
5. Click-to-navigate (open Mission Panel for that run)
6. Mark as read / dismiss
7. Briefing integration

### Open Questions

- Sidebar section vs. overlay? Sidebar section is more visible but takes space. Overlay is cleaner but requires a click.
- Should inbox items auto-expire? (e.g., after 7 days)
- Should dismissed items be deleted or just hidden?
- Should the inbox badge pulse/animate for urgent findings (errors)?
