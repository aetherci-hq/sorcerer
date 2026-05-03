# Code Cleanup

Deferred findings after the current performance cleanup pass. These are real, but broader than the safe incremental fixes already landed.

## Settings / UX

- `src/renderer/src/components/dialogs/SettingsDialog.tsx`
  `Clear local UI state` resets browser-side preferences, but there is still no true “clear app data” flow for DB-backed projects, sessions, agents, and persisted settings. If a destructive reset is desired later, it should be implemented explicitly instead of overloading the current UI-state reset.

- `src/renderer/src/components/dialogs/SettingsDialog.tsx`
  The worktree path surface is now truthful and read-only, but there is still no user-configurable workspace-root setting. If that capability is wanted later, it needs a real backend setting and migration path, not just a UI control.

## Renderer / Performance

- `src/renderer/src/PopoutApp.tsx`
  Each popout still refreshes by reloading the full `session.list()`, `agent.list()`, and `project.list()` payloads on a fixed interval. Hidden popouts are skipped now, but visible multi-popout use still scales as `windows × full-entity reloads`. A better long-term shape would be targeted hydration for only the panels mounted in that popout, or push-based updates from the main window.

- `src/renderer/src/components/ProjectTree.tsx`
  Expanding a project still triggers per-session git metadata fetches in each visible `SessionItem` (`divergence` and `gitStatus`). On large projects, that becomes a burst of git-backed IPC calls with no batching or project-level cache.

## Main Process / Lifecycle

- `src/main/index.ts`
  Startup still performs several heavy workspace and git scans serially on the Electron main process: provider refresh, Codex reconciliation, orphan worktree auto-commit, worktree sync, agent auto-start, remote startup checks, and Claude statusline wiring. It is functionally correct, but larger workspaces can still pay for this in early app responsiveness. If revisited later, it should move toward explicit task prioritization and more parallel/background scheduling.

## Tooling

- `package.json`
  There is still no dedicated lint script or repo-standard lint configuration. Current verification is `npx tsc --noEmit` plus `npm run build`, which catches type/build regressions but not style-level or broader static-analysis issues.
