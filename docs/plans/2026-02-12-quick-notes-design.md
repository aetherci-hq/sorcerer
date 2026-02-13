# Quick Notes Design

Per-session and per-agent persistent plain-text note space for capturing thoughts while working with Claude Code.

## Problem

While waiting for Claude Code responses, users often think of follow-up questions or ideas. There's no place to capture these without interrupting the active session. Notes need to be fast to open, frictionless to write in, and persistent across app restarts.

## Core Concept

Quick Notes adds a plain-text note to every session and agent. Notes persist with their parent — come back to a session later and your notes are still there.

Two access modes:

1. **Split panel** — opens like a Quick Terminal, appears as a child node in the sidebar tree. Lives in the split view system alongside terminals.
2. **Floating overlay** — a right-edge drawer (~300px wide) that slides in on top of the UI. Dismissed with Escape or clicking outside. Opened instantly via `Ctrl+Shift+N`.

A copy-to-clipboard button lets users quickly grab their notes to paste into a Claude Code session.

## Data Model

One new database table:

```sql
CREATE TABLE quick_notes (
  id TEXT PRIMARY KEY,
  parent_id TEXT NOT NULL,       -- session ID or agent ID
  parent_type TEXT NOT NULL,     -- 'session' | 'agent'
  content TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
```

- One note per parent. Created on first use, updated thereafter.
- Auto-saved on every change, debounced at ~500ms.
- Cascade-deleted when the parent session or agent is deleted.

No new session type needed. Unlike Quick Terminal (which creates a `type: 'quick-terminal'` session with a PTY), Quick Notes is purely data. The panel and overlay are views into the `quick_notes` table.

## IPC Contract

Three new channels:

| Channel | Direction | Purpose |
|---------|-----------|---------|
| `quick-notes:load` | renderer -> main | Fetch note content for a parent ID |
| `quick-notes:save` | renderer -> main | Save updated content (debounced) |
| `quick-notes:delete` | renderer -> main | Delete note when parent is deleted |

## UI Components

### QuickNotesEditor

Shared core component used by both the panel and overlay.

- Plain `<textarea>` with monospace font
- Auto-focuses on mount
- Loads content via `quick-notes:load` on mount
- Debounced save (500ms) via `quick-notes:save`
- Small toolbar at top with parent name label and "Copy" button
- Minimal chrome — textarea fills available space

### QuickNotesPanel

Split-view wrapper around `QuickNotesEditor`.

- Opened via right-click context menu on session/agent -> "Open Quick Notes"
- Appears as a child node in the sidebar tree (notepad icon)
- Rendered inside the split panel system — `MainContent` detects `quicknotes:` panel ID prefix and renders `QuickNotesPanel` instead of `TerminalView`
- Close button in panel titlebar removes it from the split tree

### QuickNotesOverlay

Floating right-edge drawer wrapper around `QuickNotesEditor`.

- 300px wide, full height below titlebar
- Slides in/out with CSS transition
- Backdrop click or Escape dismisses it
- Opened via `Ctrl+Shift+N` or toolbar button
- Targets the currently active session/agent

### ChildNotesItem (sidebar)

Sidebar tree entry modeled after `ChildQTItem`.

- Notepad icon
- Click to focus the notes panel in split view
- Only appears when a note panel is open for that session/agent

## State Management

New Zustand store: `useQuickNotesStore`

```typescript
interface QuickNotesState {
  // Overlay state
  overlayOpen: boolean
  overlayParentId: string | null
  overlayParentType: 'session' | 'agent' | null

  // Track which parents have open note panels (for sidebar indicators)
  openNotePanels: Set<string>

  // Actions
  openOverlay: (parentId: string, parentType: 'session' | 'agent') => void
  closeOverlay: () => void
  toggleOverlay: (parentId: string, parentType: 'session' | 'agent') => void
  addNotePanel: (parentId: string) => void
  removeNotePanel: (parentId: string) => void
}
```

## Interaction Flows

### Open via keyboard shortcut (Ctrl+Shift+N)

1. Global keydown listener checks active session/agent from `useSessionStore`
2. Calls `toggleOverlay(activeSessionId, 'session')`
3. Overlay slides in, `QuickNotesEditor` mounts and loads content
4. User types, content auto-saves
5. Escape or click outside closes overlay

### Open via context menu (split panel)

1. Right-click session/agent -> "Open Quick Notes"
2. Creates a split panel via `splitRight()` from `useUIStore`
3. Panel ID tracked with `quicknotes:` prefix to distinguish from terminal panels
4. `addNotePanel(parentId)` updates store, sidebar shows `ChildNotesItem`
5. Close panel removes entry from split tree and store

### Copy to input

1. User clicks "Copy" button in toolbar
2. Content copied to clipboard via `navigator.clipboard.writeText()`
3. Toast confirmation: "Notes copied to clipboard"

### Session/agent deletion cleanup

1. `quick-notes:delete` called in session/agent delete flow
2. If overlay is open for that parent, auto-close it
3. If a note panel is open, remove it from the split tree

## Integration Points

### Existing files to modify

| File | Change |
|------|--------|
| `src/main/ipc/shared-handlers.ts` | Add `quick-notes:load`, `quick-notes:save`, `quick-notes:delete` handlers |
| `src/main/services/DatabaseService.ts` | Add `quick_notes` table in schema init |
| `src/preload/index.ts` | Expose `quickNotes.load()`, `.save()`, `.delete()` on bridge |
| `src/renderer/src/components/MainContent.tsx` | Detect `quicknotes:` panel IDs, render `QuickNotesPanel` |
| `src/renderer/src/components/ProjectTree.tsx` | Add `ChildNotesItem` alongside `ChildQTItem` |
| `src/renderer/src/components/ContextMenu.tsx` | Add "Open Quick Notes" menu item |
| `src/renderer/src/components/App.tsx` | Mount `QuickNotesOverlay`, register `Ctrl+Shift+N` |
| `src/renderer/src/stores/useSessionStore.ts` | Call `quick-notes:delete` in session delete flow |
| `src/renderer/src/stores/useAgentStore.ts` | Call `quick-notes:delete` in agent delete flow |

### New files

| File | Purpose |
|------|---------|
| `src/renderer/src/stores/useQuickNotesStore.ts` | Overlay state and open panel tracking |
| `src/renderer/src/components/QuickNotesEditor.tsx` | Shared textarea with auto-save and copy |
| `src/renderer/src/components/QuickNotesPanel.tsx` | Split view wrapper |
| `src/renderer/src/components/QuickNotesOverlay.tsx` | Right-edge drawer wrapper |
