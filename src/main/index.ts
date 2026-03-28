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
import { syncWorktrees, checkResumeFailed, resolveClaudeBinary } from './ipc/shared-handlers'
import { AgentOrchestrator } from './services/agent-orchestrator'

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

// ── Dev mode isolation ───────────────────────────────────────
// Use a separate user data directory in dev so the dev instance doesn't
// collide with an installed Sorcerer (GPU cache locks, port conflicts, etc.)
if (!app.isPackaged) {
  app.setPath('userData', path.join(app.getPath('userData'), '-dev'))
}

// ── Memory optimizations ─────────────────────────────────────
// Disable GPU entirely — Sorcerer is a terminal app, no WebGL/3D needed.
// This eliminates the GPU process, its memory overhead, and disk cache lock
// errors on Windows when restarting quickly or running multiple instances.
app.disableHardwareAcceleration()
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

  // Clean up idle quick terminals — they can never be recovered
  const idleQTs = dbService.listSessions().filter(
    (s: any) => s.type === 'quick-terminal' && s.status === 'idle'
  )
  for (const qt of idleQTs) {
    dbService.removeSession(qt.id)
  }
  if (idleQTs.length > 0) {
    console.log(`[startup] Cleaned up ${idleQTs.length} idle quick terminal(s)`)
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

  // Start the agent orchestrator — handles scheduled runs, output capture, decisions
  const orchestrator = new AgentOrchestrator(dbService, ptyService, mainWindow, resolveClaudeBinary)
  orchestrator.start()

  // Auto-start agents configured for auto_start (immediate, outside of schedule)
  const autoStartAgents = dbService.listAgents().filter((a: any) => a.auto_start === 1 && a.mission)
  if (autoStartAgents.length > 0) {
    for (const agent of autoStartAgents) {
      try {
        orchestrator.runNow(agent.id)
        console.log(`[startup] Auto-started agent: ${agent.name}`)
      } catch (err) {
        console.error(`[startup] Failed to auto-start agent ${agent.name}:`, err)
      }
    }
  }

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

  // Auto-restart autonomous agents on exit
  const agentRestartCounts = new Map<string, { count: number; date: string }>()
  ptyService.onExit((sessionId, exitCode) => {
    const agent = dbService.getAgent(sessionId)
    if (!agent || !agent.auto_restart || !agent.mission) return

    // Check daily restart budget
    const today = new Date().toISOString().slice(0, 10)
    let tracker = agentRestartCounts.get(sessionId)
    if (!tracker || tracker.date !== today) {
      tracker = { count: 0, date: today }
      agentRestartCounts.set(sessionId, tracker)
    }

    if (tracker.count >= (agent.max_restarts || 10)) {
      console.log(`[agent-restart] ${agent.name} hit max restarts (${tracker.count}) for today, stopping`)
      dbService.updateAgent(sessionId, { status: 'idle', pid: null })
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('session:resume-failed', {
          sessionId,
          reason: `Agent "${agent.name}" hit restart limit (${agent.max_restarts}/day). Restart manually tomorrow.`
        })
      }
      return
    }

    const delay = (agent.restart_delay || 30) * 1000
    console.log(`[agent-restart] ${agent.name} exited (code ${exitCode}), restarting in ${delay / 1000}s (restart ${tracker.count + 1}/${agent.max_restarts})`)
    dbService.updateAgent(sessionId, { status: 'idle', pid: null })

    setTimeout(async () => {
      // Re-check agent still exists and auto_restart is still on
      const current = dbService.getAgent(sessionId)
      if (!current || !current.auto_restart) return

      try {
        const { startAgent } = await import('./ipc/shared-handlers')
        const restarted = startAgent({ db: dbService, pty: ptyService, worktree: worktreeService, fileWatcher: fileWatcherService }, sessionId)
        tracker!.count++
        console.log(`[agent-restart] ${current.name} restarted successfully`)
        // Notify renderer so TerminalView re-attaches
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('agent:restarted', sessionId, restarted.status, restarted.pid)
        }
      } catch (err) {
        console.error(`[agent-restart] Failed to restart ${current.name}:`, err)
      }
    }, delay)
  })

  // Auto-start remote access if previously enabled
  const remoteEnabled = dbService.getSetting('remoteEnabled')
  if (remoteEnabled === 'true') {
    import('./server/api-server').then(async ({ ApiServer }) => {
      const { getOrCreateAuthToken } = await import('./server/auth')
      const port = parseInt(dbService.getSetting('remotePort') || '7437')
      const bindAddress = dbService.getSetting('remoteBindAddress') || '127.0.0.1'
      const authToken = getOrCreateAuthToken(dbService)

      // Check if port is already in use (e.g. previous instance still running)
      const net = await import('net')
      const portAvailable = await new Promise<boolean>((resolve) => {
        const tester = net.createServer()
        tester.once('error', () => resolve(false))
        tester.listen(port, bindAddress, () => {
          tester.close(() => resolve(true))
        })
      })

      if (!portAvailable) {
        console.log(`[remote-access] Port ${port} already in use, skipping auto-start (another instance may be running)`)
        return
      }

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
ipcMain.handle('window:openExternal', (_e, url: string) => shell.openExternal(url))
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

  // Look up project name and branch for the popout header
  let projectName: string | undefined
  let branch: string | undefined
  const session = dbService?.getSession(panelId)
  if (session) {
    branch = session.branch as string | undefined
    const project = session.project_id ? dbService?.getProject(session.project_id as string) : null
    if (project) projectName = project.name as string
  }

  const win = popoutService.open({ panelType, panelId, entityName, themeId, projectName, branch })

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
