# Dev/Production Instance Isolation & Data Architecture

## Problem

When running both the installed (production) app and `npm run dev` simultaneously, both instances share the same data directory at `~/.sorcerer/`. This causes:

- **Settings clobber**: Changes in one instance overwrite the other (e.g. remote access config)
- **Session state conflicts**: Both instances mark sessions active/idle, causing stale state
- **Potential DB corruption**: sql.js (WASM SQLite) has no cross-process locking — concurrent writes from two Electron processes can corrupt the file
- **Port conflicts**: If both enable remote access on the same port

Electron's `userData` path is already isolated for dev (`app.setPath('userData', ...)` in index.ts:30), but the `~/.sorcerer/` data directory — which holds the database, worktrees, and agents — is not.

---

## Current Data Storage Inventory

### `~/.sorcerer/` (shared, the problem)

| Path | Contents | Service |
|------|----------|---------|
| `sorcerer.db` | All structured data: projects, sessions, agents, settings, briefings, quick notes | DatabaseService |
| `workspaces/<repo>/<session>/` | Git worktrees for session isolation | WorktreeService |
| `agents/<agentId>/` | Agent working directories and manifests | AgentOrchestrator |

### Electron `userData` (already isolated for dev)

| Path | Contents |
|------|----------|
| `%AppData%/Sorcerer/` (prod) | GPU cache, Electron internal state |
| `%AppData%/Sorcerer/-dev/` (dev) | Same, isolated copy |

### Browser localStorage (per-origin, inherently isolated)

| Key | Contents |
|-----|----------|
| `sorcerer-ui-store` | Sidebar state, expanded items, width |
| `sorcerer-stats-pinned` | Stats panel pin state |

### External (read-only, shared by design)

| Path | Contents |
|------|----------|
| `~/.claude/projects/` | Claude Code conversation files |
| `~/.claude/teams/` | Team configs (watched by FileWatcherService) |
| `~/.claude/tasks/` | Team task data |
| `~/.claude/stats-cache.json` | Claude Code usage stats |
| `~/.claude/.credentials.json` | OAuth tokens |

### Settings in Database (key-value pairs in `settings` table)

| Category | Keys |
|----------|------|
| Window | `windowBounds` |
| Appearance | `theme`, `terminalFontSize` |
| Shell | `shell` |
| Remote | `remoteEnabled`, `remotePort`, `remoteBindAddress`, `remoteAuthToken` |
| Briefing | `briefingProvider`, `briefingAutoStartup`, `briefingAutoIdle`, `briefingIdleMinutes` |
| API Keys | `apiKey_anthropic`, `apiKey_openai`, `apiKey_google` |
| Housekeeping | `dismissedWorkspaces`, `dismissedAgents`, `teamLinkCleanupDone`, `checkForUpdates` |

---

## Phase 1: Dev/Prod Isolation

### Approach

Introduce a `SORCERER_DATA_DIR` concept that defaults to `~/.sorcerer` but switches to `~/.sorcerer-dev` when `app.isPackaged === false`. This mirrors the existing `userData` isolation pattern.

### Implementation

1. **Create `getDataDir()` utility** in a new `src/main/paths.ts`:
   ```typescript
   export function getDataDir(): string {
     const base = app.isPackaged ? '.sorcerer' : '.sorcerer-dev'
     return path.join(os.homedir(), base)
   }
   ```

2. **Update all hardcoded `~/.sorcerer` references** to use `getDataDir()`:
   - `DatabaseService` constructor (database-service.ts:12)
   - `WorktreeService` workspacesRoot (worktree-service.ts:72)
   - Agent cwd paths in shared-handlers.ts, handlers.ts, agent-orchestrator.ts, api-server.ts
   - Orphan scanning paths

3. **No migration needed** — dev and prod will simply use separate directories from this point forward.

### Risk

Low. The only behavioral change is that dev mode gets a fresh database on first run after this change. Existing prod data is untouched.

---

## Phase 2: Centralized Settings That Persist Across Versions

### Problem

Currently all settings live in the SQLite database. When a user upgrades Sorcerer (new install replaces old), the database persists at `~/.sorcerer/sorcerer.db` — so settings survive. But if the user ever clears data, uninstalls, or the DB gets corrupted, everything is lost: API keys, preferences, window bounds, theme — all of it.

### Approach

Separate **user preferences** from **app state**:

| Category | Storage | Rationale |
|----------|---------|-----------|
| **User preferences** (theme, font size, shell, API keys, briefing config) | `~/.sorcerer/settings.json` | Human-readable, survives DB reset, easy to back up |
| **App state** (window bounds, dismissed banners, migration flags) | Database `settings` table | Ephemeral, tied to this install |
| **Secrets** (API keys, remote auth token) | `~/.sorcerer/settings.json` with file permissions `0600` | Keeps secrets out of SQLite, respects OS file permissions |

### Implementation

1. **New `SettingsService`** that reads/writes `settings.json` with atomic writes (write to temp, rename).
2. **Migrate existing settings** on first launch: read from DB, write to JSON, delete from DB.
3. **DatabaseService** continues to own app-state settings.
4. **IPC handlers** route `settings:get`/`settings:set` to the appropriate backend based on the key.

### Settings.json Schema

```json
{
  "$schema": "1",
  "appearance": {
    "theme": "default",
    "terminalFontSize": 13
  },
  "shell": {
    "default": "bash"
  },
  "remote": {
    "enabled": false,
    "port": 7437,
    "bindAddress": "127.0.0.1"
  },
  "briefing": {
    "provider": "anthropic",
    "autoStartup": false,
    "autoIdle": true,
    "idleMinutes": 30
  },
  "updates": {
    "checkForUpdates": true
  },
  "credentials": {
    "remoteAuthToken": "...",
    "apiKey_anthropic": "...",
    "apiKey_openai": "...",
    "apiKey_google": "..."
  }
}
```

---

## Phase 3: Cloud Backup

### What Gets Backed Up

| Data | Priority | Size | Notes |
|------|----------|------|-------|
| `settings.json` | Critical | < 1 KB | User prefs and API keys (encrypted at rest) |
| `sorcerer.db` | High | ~ 1-10 MB | Projects, sessions, agents, briefings, notes |
| Agent manifests | Medium | < 100 KB | `agents/*/agent.json` files |
| Worktrees | Skip | Potentially GB | Git data — reconstructible from remote repos |

### Architecture Options

| Approach | Pros | Cons |
|----------|------|------|
| **GitHub Gist** (private) | Free, already authed via Claude Code credentials, versioned | Size limits, requires GitHub account |
| **Sorcerer Cloud API** (AetherCI hosted) | Full control, can sync across devices, enables future features (shared sessions, team dashboards) | Requires server infrastructure, auth system |
| **Local export/import** (interim) | Zero infrastructure, user controls their data | Manual, no auto-sync |

### Recommended Path

1. **Immediate**: Local export/import (JSON bundle of settings + DB dump)
2. **Near-term**: GitHub Gist sync for settings.json (leverage existing Claude Code OAuth)
3. **Long-term**: AetherCI cloud sync — full backup with cross-device restore, ties into the web/mobile strategy

### Cloud Sync Design (Phase 3b — AetherCI)

```
┌─────────────┐       ┌──────────────────┐       ┌─────────────┐
│  Sorcerer    │──────▶│  AetherCI API    │◀──────│  Sorcerer   │
│  Desktop A   │       │  /sync endpoint  │       │  Desktop B  │
└─────────────┘       └──────────────────┘       └─────────────┘
                              │
                       ┌──────▼──────┐
                       │  Encrypted  │
                       │  S3 Bucket  │
                       └─────────────┘
```

- **Auth**: AetherCI account (or GitHub OAuth)
- **Encryption**: Client-side encryption before upload (user's passphrase or derived key)
- **Conflict resolution**: Last-write-wins for settings, merge for session/project lists
- **Sync frequency**: On change (debounced 30s) + on app launch
- **Payload**: Encrypted JSON bundle, < 1 MB typical

### Data Privacy Considerations

- API keys must be encrypted client-side before leaving the machine
- Sorcerer should never store user code — only metadata (project names, session names, branches)
- Users must be able to delete their cloud data at any time
- Cloud sync must be opt-in, never default

---

## Implementation Order

1. **Phase 1**: Dev/prod isolation via `getDataDir()` — small, low-risk, immediate value
2. **Phase 2**: Extract settings to `settings.json` — medium effort, unlocks backup
3. **Phase 3a**: Local export/import — simple, no infrastructure
4. **Phase 3b**: GitHub Gist sync for settings — leverages existing auth
5. **Phase 3c**: AetherCI cloud sync — full solution, requires server work

## Priority

Phase 1: High (do now)
Phase 2: Medium (next version cycle)
Phase 3a: Medium (ship with Phase 2)
Phase 3b-c: Low (future roadmap)
