# Code Cleanup

Deferred findings from release review that are real, but broader than the current push scope.

## Settings / UX

- `src/renderer/src/components/dialogs/SettingsDialog.tsx`
  `Clear local UI state` resets browser-side preferences, but there is still no true “clear app data” flow for DB-backed projects, sessions, agents, and persisted settings. If a destructive reset is desired later, it should be implemented explicitly instead of overloading the current UI-state reset.

- `src/renderer/src/components/dialogs/SettingsDialog.tsx`
  The worktree path surface is now truthful and read-only, but there is still no user-configurable workspace-root setting. If that capability is wanted later, it needs a real backend setting and migration path, not just a UI control.

## Main Process / Lifecycle

- `src/renderer/src/App.tsx`
  Popout restore is stable now, but the main-window restore path still reopens detached windows from staggered timeouts rather than a single synchronized state hydration path. If that path is revisited later, it should move toward one explicit restore transaction instead of layered load-and-reopen effects.
