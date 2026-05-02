# Code Cleanup

Deferred findings from release review that are real, but broader than the current push scope.

## Settings / UX

- `src/renderer/src/components/dialogs/SettingsDialog.tsx`
  `Clear local UI state` resets browser-side preferences, but there is still no true “clear app data” flow for DB-backed projects, sessions, agents, and persisted settings. If a destructive reset is desired later, it should be implemented explicitly instead of overloading the current UI-state reset.

- `src/renderer/src/components/dialogs/SettingsDialog.tsx`
  The worktree path surface is now truthful and read-only, but there is still no user-configurable workspace-root setting. If that capability is wanted later, it needs a real backend setting and migration path, not just a UI control.

- `src/renderer/src/components/dialogs/FeedbackDialog.tsx`
  Consider pre-filling the contact email from the profile email, if present. Current behavior is correct, but the form is still slightly repetitive for users who already configured profile identity.

## Main Process / Lifecycle

- `src/main/index.ts`
  Service initialization failures are caught and logged, but startup continues with global service variables potentially unset. That can turn one startup error into harder-to-diagnose follow-on failures later in app boot.

- `src/renderer/src/App.tsx`
  Restored popout windows still rely on repeated polling during startup. It is stable now, but the restore/load loop could be consolidated so popouts reopen from a single synchronized snapshot instead of multiple fetch cycles.
