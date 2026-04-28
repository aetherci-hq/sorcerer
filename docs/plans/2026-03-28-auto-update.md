# Auto-Update Enhancement

**Status:** Future — blocked on code signing
**Date:** 2026-03-28

## Current Behavior

- App checks for updates 5s after launch, then every 2 hours
- Compares local version against latest GitHub release tag
- Clicking the status bar notification opens the GitHub releases page in the browser

## Goal

Download updates in the background and prompt "Restart to update" (VS Code-style), so users don't leave the app.

## Prerequisites

- **Code signing** (Windows + macOS) — `electron-updater` requires signed builds
- **electron-builder publish pipeline** — release assets must follow `electron-updater`'s expected format (latest.yml / latest-mac.yml)
- Decide on update channel (GitHub Releases vs S3/custom server)

## Implementation Outline

1. Add `electron-updater` dependency
2. Configure `electron-builder` publish settings in package.json/electron-builder.yml
3. Main process: call `autoUpdater.checkForUpdates()` on the existing schedule
4. On `update-downloaded` event, notify renderer via IPC
5. Renderer: replace the "Update available" link with a "Restart to Update" button
6. On click, call `autoUpdater.quitAndInstall()`
7. Warn if active sessions are running before restarting — offer to wait or force

## Considerations

- Active PTY sessions will be killed on restart. Should auto-save session state or at minimum warn the user.
- Differential/delta updates (e.g., `electron-updater`'s blockmap) reduce download size significantly.
- Linux: AppImage supports auto-update; .deb/.rpm do not. May need platform-specific behavior.
