# Blades — Implementation Plan

## Summary

Blades are named, user-created WIP desktops that let Sorcerer switch between exact saved working states. A blade is not a replacement for the current split/focus/maximize UX. It sits one level above those mechanics and swaps the entire active desktop, similar to a virtual desktop.

Sorcerer should support:

- one always-available `Default Desktop`
- user-created `Project Blades`
- user-created `Agent Blades`
- exact state restore
- full desktop replacement when switching
- a hard scope wall around project/agent blades

The correct mental model is:

- **Default Desktop** = today’s general-purpose mixed workspace
- **Blade** = a scoped, named WIP desktop for one project or one agent family

Internally, both should use the same snapshot engine.

## Product Rules

### Core behavior

- Opening a blade fully replaces the current desktop state.
- Blades are user-created only. Sorcerer must not auto-create them.
- Blades are for WIP, not preferred layouts.
- The current split UX, maximize behavior, focus mode, and panel actions remain intact.
- `Default Desktop` always exists and allows mixed content.

### Scope rules

Every blade has a single owner:

- `scopeType = project` with `scopeId = project.id`
- `scopeType = agent` with `scopeId = agent.id`

Project blade contents may include:

- sessions whose `project_id` matches the blade owner
- quick terminals belonging to those sessions
- quick notes belonging to those sessions
- project-scoped panels that resolve to those sessions

Agent blade contents may include:

- the owning agent
- its quick terminal(s)
- its quick notes
- mission/run history for that agent

Mixed roots are not allowed inside project or agent blades.

### Save semantics

Each workspace has:

- `savedState`: durable snapshot in the DB
- `liveState`: current in-memory working state for this app run
- `dirty`: whether `liveState` differs from `savedState`

Behavior:

- switching away preserves the current workspace into `liveState`
- switching back restores `liveState` if present
- explicit save writes `liveState` to `savedState`
- app restart restores from `savedState`

This is the right tradeoff for WIP: fast switching within a session, explicit save for durable checkpoints.

### Creation semantics

Blade creation starts from an existing live layout via:

- project context menu: `New Blade from Current Layout`
- agent context menu: `New Blade from Current Layout`

Creation must be blocked if the current layout contains out-of-scope panels. Do not silently filter or mutate the layout.

Blocked-creation hint should:

- identify the target scope
- list offending items
- explain the fix briefly

Example:

> This layout includes panels outside Project X. Close or move these panels before creating a blade.

## Current Codebase Fit

Blades should be implemented as a new workspace layer on top of the current renderer state model.

### Existing state sources that matter

- `src/renderer/src/stores/useUIStore.ts`
  - split tree
  - focused panel
  - maximized panel
  - focus mode
  - sidebar width / sidebar pane height
  - sidebar expansion state
- `src/renderer/src/stores/useSessionStore.ts`
  - `activeSessionId`
- `src/renderer/src/stores/useQuickNotesStore.ts`
  - `openNotePanels`
  - overlay note state
- `src/renderer/src/stores/useProjectStore.ts`
  - project list / groups
- `src/renderer/src/stores/useAgentStore.ts`
  - agent list / groups

### Existing persistence boundary

- DB schema: `src/main/services/database-service.ts`
- IPC handlers: `src/main/ipc/handlers.ts` and `src/main/ipc/shared-handlers.ts`
- preload API: `src/preload/index.ts`

This is the correct place for blade persistence. Do not store blade snapshots in localStorage. Use the DB.

## Data Model

Add new workspace/blade types to `src/renderer/src/types.ts`.

### Renderer types

```ts
export type WorkspaceKind = 'default' | 'blade'
export type WorkspaceScopeType = 'none' | 'project' | 'agent'

export interface WorkspaceStateSnapshot {
  splitRoot: SplitNode | null
  focusedPanelId: string | null
  maximizedPanelId: string | null
  focusModeSessionId: string | null
  activeSessionId: string | null
  openNotePanels: string[]
  sidebarExpandedProjects: string[]
  sidebarExpandedSessions: string[]
  sidebarExpandedGroups: string[]
  sidebarWidth: number
  agentPaneHeight: number
}

export interface WorkspaceRecord {
  id: string
  kind: WorkspaceKind
  name: string
  scopeType: WorkspaceScopeType
  scopeId: string | null
  savedStateJson: string
  created_at: number
  updated_at: number
  last_opened_at?: number | null
}
```

### DB schema

Add a new `workspaces` table:

```sql
CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,              -- default | blade
  name TEXT NOT NULL,
  scope_type TEXT NOT NULL,        -- none | project | agent
  scope_id TEXT,
  saved_state_json TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  last_opened_at INTEGER
);
```

Recommended invariants:

- exactly one row where `kind = 'default'`
- `scope_type = 'none'` only for the default desktop
- blade rows require `scope_type in ('project', 'agent')`

For v1, storing snapshot JSON in a single column is the right move. Normalizing panel rows is unnecessary complexity.

## Snapshot Shape

The snapshot should represent exact desktop state, not only panel layout.

### Include

- split tree and panel arrangement
- focused panel
- maximized panel
- focus mode target
- active session/agent/notes panel
- open quick note panel parent ids
- sidebar expansion state
- layout widths/heights that materially affect return-to-work continuity

### Exclude

- transient context menu state
- dialogs
- toasts
- drag state
- async loading flags
- hover state

### Important decision

Persist only stable identifiers in snapshots:

- session ids
- agent ids
- note panel ids (`quicknotes:session:<id>`, `quicknotes:agent:<id>`)

Do not persist ephemeral leaf ids from the current split tree as semantically meaningful identifiers outside the snapshot itself.

## Workspace Store

Add a dedicated store:

- `src/renderer/src/stores/useWorkspaceStore.ts`

Responsibilities:

- list workspaces
- track `activeWorkspaceId`
- hold in-memory `liveStateByWorkspaceId`
- compute `dirty` against `savedState`
- create blade
- rename blade
- delete blade
- save blade
- switch workspace
- validate scope for creation

Suggested state:

```ts
interface WorkspaceStore {
  workspaces: WorkspaceRecord[]
  activeWorkspaceId: string | null
  liveStateByWorkspaceId: Record<string, WorkspaceStateSnapshot>
  dirtyWorkspaceIds: Set<string>
  loadWorkspaces(): Promise<void>
  switchWorkspace(id: string): Promise<void>
  createBladeFromCurrent(input: { name: string; scopeType: 'project' | 'agent'; scopeId: string }): Promise<{ ok: true } | { ok: false; reason: string; offenders: string[] }>
  saveWorkspace(id: string): Promise<void>
  renameWorkspace(id: string, name: string): Promise<void>
  deleteWorkspace(id: string): Promise<void>
}
```

This store should orchestrate existing stores instead of duplicating session/project/agent data.

## Snapshot Capture / Apply

Create a pure utility module:

- `src/renderer/src/workspaces/snapshot.ts`

Functions:

- `captureWorkspaceSnapshot()`
- `applyWorkspaceSnapshot(snapshot)`
- `validateWorkspaceScope(snapshot, scopeType, scopeId, sessions, agents)`
- `listScopeViolations(snapshot, scopeType, scopeId, sessions, agents)`

### Capture

Read from:

- `useUIStore.getState()`
- `useSessionStore.getState()`
- `useQuickNotesStore.getState()`

### Apply

Write to:

- `useUIStore.setState(...)`
- `useSessionStore.setState(...)`
- `useQuickNotesStore.setState(...)`

Apply order matters:

1. restore `openNotePanels`
2. restore split tree / active item / focus mode
3. restore sidebar expansion + widths

That keeps dependent UI state coherent.

## Validation Rules

Validation runs before blade creation and before overwrite-save of a scoped blade.

### Project blade validation

Allowed panel ids:

- session ids where `session.project_id === scopeId`
- quick terminal ids whose underlying session belongs to that project
- quick notes whose parent session belongs to that project

Disallowed:

- agents not explicitly associated with that project scope
- agent notes
- sessions from other projects

### Agent blade validation

Allowed:

- the owning agent id
- quick notes bound to that agent
- quick terminals bound to that agent

Disallowed:

- all project sessions
- other agents
- quick notes for sessions or other agents

### Missing data behavior on open

If a saved item no longer exists:

- restore the rest of the workspace
- replace missing panel content with a missing-state placeholder
- keep layout shape where possible
- show a toast summarizing restoration issues

Do not silently swap in another session or collapse the layout unless unavoidable.

## Renderer Integration Plan

### 1. Workspace engine

Add:

- `useWorkspaceStore.ts`
- `workspaces/snapshot.ts`
- new workspace types in `types.ts`

### 2. App bootstrap

Update `src/renderer/src/App.tsx`:

- load workspaces on startup after sessions/projects/agents
- ensure default desktop exists
- restore last-opened workspace
- if none, restore `Default Desktop`

### 3. Visible switcher

Add a small switcher in the title/header region. This should be a compact current-workspace control, not a new navigation bar.

Good insertion points:

- `src/renderer/src/App.tsx`
- or `src/renderer/src/components/MainContent.tsx` titlebar

Requirements:

- shows current workspace name
- opens a menu/popover of:
  - `Default Desktop`
  - project blades
  - agent blades
- indicates dirty state

### 4. Context menu actions

Extend `src/renderer/src/components/ContextMenu.tsx`:

- project context menu:
  - `New Blade from Current Layout`
- agent context menu:
  - `New Blade from Current Layout`
- blade switcher / blade list later:
  - `Save Blade`
  - `Rename Blade`
  - `Delete Blade`

For v1, creation from project/agent context menus is enough.

### 5. Default Desktop handling

The default desktop should use the same snapshot engine but remain special in UX:

- displayed as `Default Desktop`
- allows mixed scope
- cannot be deleted
- may be auto-saved on app shutdown

## Main Process / IPC Plan

### DatabaseService

Extend `src/main/services/database-service.ts` with:

- `ensureDefaultWorkspace()`
- `listWorkspaces()`
- `getWorkspace(id)`
- `createWorkspace(...)`
- `updateWorkspace(...)`
- `deleteWorkspace(id)`
- `touchWorkspaceOpenedAt(id)`

### IPC

Add IPC channel group:

- `workspaceState:list`
- `workspaceState:createBlade`
- `workspaceState:update`
- `workspaceState:delete`
- `workspaceState:get`
- `workspaceState:touchOpened`

The current `workspace:*` namespace is already used for orphan scanning, so use a distinct namespace such as `desktop:*` or `blade:*` to avoid confusion. Recommended:

- `desktop:list`
- `desktop:createBlade`
- `desktop:update`
- `desktop:delete`
- `desktop:get`
- `desktop:touchOpened`

### Preload API

Extend `src/preload/index.ts` with a new API group:

```ts
desktop: {
  list: () => ipcRenderer.invoke('desktop:list'),
  createBlade: (input) => ipcRenderer.invoke('desktop:createBlade', input),
  update: (id, updates) => ipcRenderer.invoke('desktop:update', id, updates),
  delete: (id) => ipcRenderer.invoke('desktop:delete', id),
  get: (id) => ipcRenderer.invoke('desktop:get', id),
  touchOpened: (id) => ipcRenderer.invoke('desktop:touchOpened', id)
}
```

## UX Details

### Blade naming

Creation flow should prompt for a blade name.

Suggested defaults:

- project blade: `<Project Name> — New Blade`
- agent blade: `<Agent Name> — New Blade`

Do not auto-create unnamed blades.

### Dirty state

Show dirty state in the switcher and blade list.

Examples:

- dot indicator
- `•`
- subtle `Unsaved` suffix

Do not force a modal on every switch in v1. Preserve live state in memory and allow explicit save.

### Overwrite behavior

For an existing blade:

- `Save Blade` overwrites `savedState`
- `Save As New Blade` duplicates into a new blade record

### Deletion behavior

Deleting a blade should:

- remove its saved DB row
- discard its live in-memory state
- if active, switch to `Default Desktop`

## Phased Rollout

### Phase 1 — Workspace engine

- DB table + IPC + preload API
- workspace store
- snapshot capture/apply
- default desktop abstraction
- context-menu creation
- visible workspace switcher
- open/save/delete/rename

This phase provides the core value.

### Phase 2 — Recovery and diagnostics

- missing-panel placeholders
- better violation reporting
- dirty indicators
- last-opened desktop restore polish

### Phase 3 — UX refinement

- keyboard shortcuts for switching
- duplicate blade
- blade grouping/filtering in switcher
- optional “Save current blade” button in switcher menu

## Risks

### 1. Snapshot drift

As UI state grows, snapshots can become version-sensitive. Mitigation:

- version the snapshot JSON
- write tolerant deserializers
- provide sensible defaults for missing fields

### 2. Invalid references

Sessions and agents can be deleted, archived, or changed. Mitigation:

- restore partially
- show missing panel placeholders
- toast summary on degraded restore

### 3. Store coordination bugs

Workspace apply touches multiple zustand stores. Mitigation:

- centralize capture/apply logic in one utility
- do not spread snapshot writes across random UI components

### 4. Ambiguous project/agent ownership

Agent blades are clean. Project blades need a hard rule on what counts as in-scope. For v1, keep it strict:

- project sessions and their dependent panels only
- no standalone agents inside project blades

## Recommended File Changes

### New files

- `src/renderer/src/stores/useWorkspaceStore.ts`
- `src/renderer/src/workspaces/snapshot.ts`
- `src/renderer/src/components/WorkspaceSwitcher.tsx`

### Updated renderer files

- `src/renderer/src/App.tsx`
- `src/renderer/src/components/ContextMenu.tsx`
- `src/renderer/src/components/MainContent.tsx`
- `src/renderer/src/stores/useUIStore.ts`
- `src/renderer/src/stores/useQuickNotesStore.ts`
- `src/renderer/src/types.ts`
- `src/renderer/src/api/client.ts`

### Updated main-process files

- `src/main/services/database-service.ts`
- `src/main/ipc/handlers.ts`
- `src/preload/index.ts`

## Recommended First Implementation Order

1. add DB schema and CRUD for workspaces
2. add preload/API surface
3. add renderer workspace types + store
4. implement snapshot capture/apply utilities
5. create default desktop bootstrap path
6. add workspace switcher UI
7. add project/agent context-menu creation
8. add scope validation and violation messaging
9. add dirty-state indicators

## Recommendation

Implement blades as a new workspace system, not as an extension of split panels.

That keeps the architecture clean:

- split/maximize/focus remain panel mechanics
- blades become desktop mechanics
- default desktop and blades share one snapshot engine

This matches the product intent and fits the current Sorcerer structure cleanly.
