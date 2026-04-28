# Sidebar Teams & Tasks Integration

## Problem
Teams and tasks from Claude Code sessions display in a disconnected "Teams" section at the bottom of the sidebar. No relationship to the sessions that spawned them. Confusing and uninformative.

## Design Decisions
- Teams/tasks nest **only** under the session that owns them (via `session.team_name`)
- Remove the separate "Teams" section entirely
- Session row shows `active/total` member badge when a team exists
- Expanded session shows two sub-sections: **Members** and **Tasks**
- Auto-expand sessions when team has active members (respect manual collapse)
- Completed tasks hidden by default with "Show N completed" toggle
- Clicking a team member focuses the parent session's terminal

## Sidebar Hierarchy

```
Project
  └── Session                               2/5
        ├── Members                           3
        │     ├── ● backend-dev    "Implementing auth middleware"
        │     └── ○ frontend-dev   idle
        └── Tasks                  2 remaining · 5 done
              ├── ◐ Implement login endpoint       backend-dev
              ├── ⊘ Add JWT validation              blocked
              └── ▸ Show 5 completed
```

## Visual Specs

### Session Row (with team)
- Existing: `[status dot] session-name`
- Added: right-aligned `2/5` badge (11px, --text-faint) showing active/total members
- Expand chevron appears (same as sessions with child sessions)

### Member Row
- `[colored dot] name    activeForm-or-idle`
- Green dot = active (owns in_progress task), dim dot = idle
- Active task text from `activeForm`, fallback to task `subject`, fallback to "idle"
- Italic muted text for the task/idle label, truncated
- Click → focus parent session terminal

### Task Row
- `[status icon] subject    owner-tag`
- Icons: ○ pending (faint), ◐ in_progress (accent), ✓ completed (green), ⊘ blocked (red)
- Blocked = has unresolved `blockedBy` entries
- Owner tag right-aligned, 11px, muted. Omitted if no owner.
- Tasks are not clickable (informational only)

### Section Headers
- "Members" + count right-aligned. Clickable to collapse/expand.
- "Tasks" + "N remaining · M done" right-aligned. Clickable to collapse/expand.
- Both independently collapsible.

### Completed Tasks Toggle
- "▸ Show N completed" in faint text, clickable
- Expands inline showing completed tasks with ✓ icon and muted styling

## Auto-Expand Logic
- When `team_name` first detected on a session with active members → auto-expand session + both sub-sections
- If user manually collapses → don't re-expand on file watcher updates
- Track in `autoExpandedTeams: Set<string>` (session IDs that were auto-expanded)

## Implementation

### Files to Modify

1. **`Sidebar.tsx`** — Major rewrite of session rendering:
   - Remove the "Teams" bottom section entirely
   - Add team data loading per-session (from team store)
   - Add Members + Tasks sub-sections under SessionNode
   - Add auto-expand logic with manual override tracking
   - Add "Show completed" toggle state
   - Wire member clicks to focus parent session

2. **`team-store.ts`** — Add method to get team data by session's team_name:
   - `getTeamForSession(teamName)` → returns members + tasks together
   - Or just use existing `loadTeams` + `loadTasks` and filter in component

3. **`file-watcher-service.ts`** — No changes needed (already provides all data)

4. **`types.ts`** — No changes needed (TeamConfig, TaskData already defined)

### No New Files
Everything fits within existing components. The SessionNode component grows but stays self-contained.
