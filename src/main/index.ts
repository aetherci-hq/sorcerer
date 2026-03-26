import { app, BrowserWindow, ipcMain, shell } from 'electron'
import path from 'path'
import fs from 'fs'
import { execSync } from 'child_process'
import { PTYService } from './services/pty-service'
import { DatabaseService } from './services/database-service'
import { WorktreeService } from './services/worktree-service'
import { FileWatcherService } from './services/file-watcher-service'
import { PopoutService } from './services/popout-service'
import { registerIPC } from './ipc/handlers'
import { syncWorktrees, checkResumeFailed } from './ipc/shared-handlers'

// On macOS/Linux, Electron doesn't inherit the user's shell PATH.
// Fix process.env.PATH so spawned processes (e.g. 'claude') can be found.
if (process.platform !== 'win32') {
  try {
    const userShell = process.env.SHELL || '/bin/bash'
    const shellPath = execSync(`${userShell} -ilc 'echo -n $PATH'`, {
      encoding: 'utf8',
      timeout: 5000
    })
    if (shellPath) process.env.PATH = shellPath
  } catch { /* keep existing PATH */ }
}

// ── Memory optimizations ─────────────────────────────────────
// Reduce GPU process memory overhead (terminals are text-only)
app.commandLine.appendSwitch('disable-gpu-compositing')
// Limit renderer JS heap to 128 MB (default is ~4 GB on 64-bit)
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=128')
// Disable background tab throttling workarounds that bloat memory
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows')

let mainWindow: BrowserWindow | null = null
let ptyService: PTYService
let dbService: DatabaseService
let worktreeService: WorktreeService
let fileWatcherService: FileWatcherService
let popoutService: PopoutService

function getWindowBounds(): { x?: number; y?: number; width: number; height: number; maximized: boolean } {
  const defaults = { width: 1200, height: 800, maximized: false }
  if (!dbService) return defaults
  try {
    const saved = dbService.getSetting('windowBounds')
    if (saved) return JSON.parse(saved)
  } catch { /* use defaults */ }
  return defaults
}

function saveWindowBounds(): void {
  if (!mainWindow || !dbService || mainWindow.isDestroyed()) return
  const maximized = mainWindow.isMaximized()
  // Only save non-maximized bounds so we restore to a good size
  if (!maximized) {
    const bounds = mainWindow.getBounds()
    dbService.setSetting('windowBounds', JSON.stringify({ ...bounds, maximized: false }))
  } else {
    // Preserve previous x/y/width/height but mark as maximized
    try {
      const prev = dbService.getSetting('windowBounds')
      const parsed = prev ? JSON.parse(prev) : { width: 1200, height: 800 }
      dbService.setSetting('windowBounds', JSON.stringify({ ...parsed, maximized: true }))
    } catch {
      dbService.setSetting('windowBounds', JSON.stringify({ width: 1200, height: 800, maximized: true }))
    }
  }
}

async function createWindow(): Promise<void> {
  // Initialize database first so we can read window bounds
  dbService = new DatabaseService()
  await dbService.ensureReady()

  const bounds = getWindowBounds()

  mainWindow = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
    minWidth: 800,
    minHeight: 600,
    frame: false,
    titleBarStyle: 'hidden',
    ...(process.platform === 'darwin'
      ? { trafficLightPosition: { x: 12, y: 10 } }
      : {
          titleBarOverlay: {
            color: '#1a1714',
            symbolColor: '#a69e8e',
            height: 36
          }
        }),
    backgroundColor: '#111114',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: true,
      v8CacheOptions: 'bypassHeatCheck'
    }
  })

  if (bounds.maximized) {
    mainWindow.maximize()
  }

  // Initialize remaining services
  ptyService = new PTYService(mainWindow)
  worktreeService = new WorktreeService()
  popoutService = new PopoutService(mainWindow)
  fileWatcherService = new FileWatcherService(mainWindow, dbService)

  // Mark all previously-active sessions as idle (PTY processes died on app exit)
  const staleSessions = dbService.listSessions().filter((s: any) => s.status === 'active')
  for (const s of staleSessions) {
    dbService.updateSession(s.id, { status: 'idle', pid: null })
  }

  // Same for agents — their PTY processes also die on app exit
  const staleAgents = dbService.listAgents().filter((a: any) => a.status === 'active')
  for (const a of staleAgents) {
    dbService.updateAgent(a.id, { status: 'idle', pid: null })
  }

  // Crash recovery: auto-commit orphaned worktrees
  try {
    const allProjects = dbService.listProjects()
    const allSessions = dbService.listSessions()
    for (const project of allProjects) {
      try {
        // Skip non-git projects — no worktrees to recover
        const gitDir = path.join(project.path as string, '.git')
        if (!fs.existsSync(gitDir)) continue

        const worktrees = await worktreeService.list(project.path)
        const root = worktreeService.getWorkspacesRoot()

        for (const wt of worktrees) {
          // Only process worktrees under our managed root
          if (!wt.startsWith(root)) continue

          // Check if there's a matching non-deleted session
          const hasSession = allSessions.some(
            (s: any) => s.worktree_path === wt && s.status !== 'deleted'
          )

          if (!hasSession) {
            console.log('[crash-recovery] Orphaned worktree found:', wt)
            const commitResult = await worktreeService.autoCommit(wt)
            if (commitResult.committed) {
              console.log('[crash-recovery] Auto-committed orphaned work:', commitResult.message)
            }
          }
        }
      } catch (err) {
        console.log('[crash-recovery] Failed to check project:', project.name, err)
      }
    }
  } catch (err) {
    console.error('[crash-recovery] Failed:', err)
  }

  // Recover orphaned worktree directories that lack DB session records
  // (e.g. session was deleted from DB but worktree dir still exists on disk)
  try {
    const services = { db: dbService, pty: ptyService, worktree: worktreeService, fileWatcher: fileWatcherService }
    const allProjects = dbService.listProjects()
    for (const project of allProjects) {
      try {
        const result = await syncWorktrees(services, project.id)
        if (result.created > 0 || result.removed > 0) {
          console.log(`[startup-sync] ${project.name}: recovered ${result.created}, cleaned ${result.removed}`)
        }
      } catch (err) {
        console.log('[startup-sync] Failed for project:', project.name, err)
      }
    }
  } catch (err) {
    console.error('[startup-sync] Failed:', err)
  }

  // One-time cleanup: clear mock team_name values from sessions
  if (!dbService.getSetting('teamLinkCleanupDone')) {
    const allSessions = dbService.listSessions()
    for (const s of allSessions) {
      if (s.team_name) {
        dbService.updateSession(s.id, { team_name: null })
      }
    }
    dbService.setSetting('teamLinkCleanupDone', '1')
  }

  // Register IPC handlers
  registerIPC(ptyService, dbService, worktreeService, fileWatcherService)

  // Detect failed resumes (e.g. "No conversation found to continue")
  ptyService.onExit((sessionId, exitCode) => {
    const scrollbackText = ptyService.scrollback.getScrollback(sessionId)
    const reason = checkResumeFailed(sessionId, scrollbackText)
    if (reason) {
      console.log(`[resume-failed] ${sessionId}: ${reason} (exit code ${exitCode})`)
      // Update DB status back to idle
      const session = dbService.getSession(sessionId)
      if (session) {
        dbService.updateSession(sessionId, { status: 'idle', pid: null })
      } else {
        const agent = dbService.getAgent(sessionId)
        if (agent) {
          dbService.updateAgent(sessionId, { status: 'idle', pid: null })
        }
      }
      // Notify renderer
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('session:resume-failed', { sessionId, reason })
      }
    }
  })

  // Auto-start remote access if previously enabled
  const remoteEnabled = dbService.getSetting('remoteEnabled')
  if (remoteEnabled === 'true') {
    import('./server/api-server').then(async ({ ApiServer }) => {
      const { getOrCreateAuthToken } = await import('./server/auth')
      const port = parseInt(dbService.getSetting('remotePort') || '7437')
      const bindAddress = dbService.getSetting('remoteBindAddress') || '127.0.0.1'
      const authToken = getOrCreateAuthToken(dbService)

      const { setGlobalApiServer } = await import('./ipc/handlers')
      const server = new ApiServer(
        { db: dbService, pty: ptyService, worktree: worktreeService, fileWatcher: fileWatcherService },
        { port, bindAddress, authToken }
      )
      await server.start()
      setGlobalApiServer(server)
      console.log(`[remote-access] Auto-started on ${bindAddress}:${port}`)
    }).catch((err) => {
      console.error('[remote-access] Auto-start failed:', err)
    })
  }

  // Save window bounds on resize/move
  mainWindow.on('resize', saveWindowBounds)
  mainWindow.on('move', saveWindowBounds)
  mainWindow.on('maximize', saveWindowBounds)
  mainWindow.on('unmaximize', saveWindowBounds)

  // Load the renderer
  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  mainWindow.on('closed', () => {
    popoutService.closeAll()
    mainWindow = null
  })

  // Open external links in browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })
}

app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  // Clean up services
  if (ptyService) ptyService.killAll()
  if (fileWatcherService) fileWatcherService.close()
  if (dbService) dbService.close()

  // Stop remote access server
  import('./ipc/handlers').then(({ getGlobalApiServer }) => {
    const server = getGlobalApiServer()
    if (server) server.stop()
  }).catch(() => {})

  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// Handle window control IPC
ipcMain.on('window:minimize', () => mainWindow?.minimize())
ipcMain.on('window:maximize', () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize()
  } else {
    mainWindow?.maximize()
  }
})
ipcMain.on('window:close', () => mainWindow?.close())
ipcMain.handle('window:isMaximized', () => mainWindow?.isMaximized() ?? false)
ipcMain.on('window:setTitleBarOverlay', (_e, options: { color: string; symbolColor: string }) => {
  if (process.platform !== 'darwin') {
    // Update main window
    if (mainWindow) {
      try { mainWindow.setTitleBarOverlay({ ...options, height: 36 }) } catch { /* unsupported */ }
    }
    // Update all pop-out windows
    if (popoutService) {
      for (const win of popoutService.getAllWindows()) {
        try { win.setTitleBarOverlay({ ...options, height: 36 }) } catch { /* ignore */ }
      }
    }
  }
})

// ── Pop-out window IPC ──────────────────────────────────────
ipcMain.handle('popout:open', (_e, panelType: string, panelId: string, entityName: string) => {
  const themeId = dbService?.getSetting('theme') || 'default'
  const win = popoutService.open({ panelType, panelId, entityName, themeId })

  // Register the pop-out window as a listener for terminal data
  if (panelType === 'terminal') {
    const wc = win.webContents
    ptyService.addListener(panelId, wc)
    win.on('closed', () => {
      ptyService.removeListener(panelId, wc)
    })
  }

  return { opened: true }
})

ipcMain.handle('popout:close', (_e, panelId: string) => {
  popoutService.close(panelId)
  return { closed: true }
})

ipcMain.handle('popout:isOpen', (_e, panelId: string) => {
  return popoutService.isOpen(panelId)
})

ipcMain.handle('popout:getScrollback', (_e, sessionId: string) => {
  return ptyService.scrollback.getScrollback(sessionId)
})

// When a popout window resumes/restarts a session, notify the main window
// so its Zustand store updates the status dot
ipcMain.on('popout:sessionUpdated', (_e, sessionId: string, status: string, pid: number | null) => {
  try {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('popout:sessionUpdated', sessionId, status, pid)
    }
  } catch { /* main window already destroyed */ }
})

ipcMain.on('popout:broadcastTheme', (_e, themeId: string) => {
  for (const win of popoutService.getAllWindows()) {
    try {
      if (!win.isDestroyed()) {
        win.webContents.send('popout:theme-update', themeId)
      }
    } catch { /* window already destroyed */ }
  }
})
