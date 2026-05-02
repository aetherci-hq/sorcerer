# Code Cleanup

Deferred findings from release review that are real, but broader than the current push scope.

## Settings / UX

- `src/renderer/src/components/dialogs/SettingsDialog.tsx`
  `Browse` in `Custom shell` and `Worktree base directory` currently calls `getApi().project.add()`, which opens the add-project directory flow instead of a generic filesystem picker.

- `src/renderer/src/components/dialogs/SettingsDialog.tsx`
  `Clear all data` only clears browser `localStorage`. It does not remove DB-backed projects, sessions, agents, or persisted settings, so the label and description are misleading.

- `src/renderer/src/components/dialogs/SettingsDialog.tsx`
  `Worktree base directory` is component-local only. It is not persisted and does not appear to drive any worktree creation path.

- `src/renderer/src/components/dialogs/SettingsDialog.tsx`
  Remote access URL derivation is inconsistent when bound to `0.0.0.0`. One path uses `localhost`, another uses the LAN IP.

- `src/renderer/src/components/dialogs/FeedbackDialog.tsx`
  Feedback draft state is cleared only on successful submit. Cancel, Escape, and backdrop close leave the previous draft in memory.

- `src/renderer/src/components/dialogs/SettingsDialog.tsx`
  Profile avatar preview can keep showing a stale Gravatar after the email is cleared, depending on the last resolved image path.

## Main Process / Lifecycle

- `src/main/index.ts`
  Service initialization failures are caught and logged, but startup continues with global service variables potentially unset. That can turn one startup error into harder-to-diagnose follow-on failures later in app boot.

- `src/renderer/src/App.tsx`
  Restored popout windows still rely on repeated polling during startup. It is stable now, but the restore/load loop could be consolidated so popouts reopen from a single synchronized snapshot instead of multiple fetch cycles.
