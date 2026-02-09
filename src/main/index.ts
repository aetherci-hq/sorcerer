import { app, BrowserWindow, ipcMain, shell } from 'electron'
import path from 'path'
import { PTYService } from './services/pty-service'
import { DatabaseService } from './services/database-service'
import { WorktreeService } from './services/worktree-service'
import { FileWatcherService } from './services/file-watcher-service'
import { registerIPC } from './ipc/handlers'

let mainWindow: BrowserWindow | null = null
let ptyService: PTYService
let dbService: DatabaseService
let worktreeService: WorktreeService
let fileWatcherService: FileWatcherService

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
    titleBarOverlay: {
      color: '#111114',
      symbolColor: '#9b9a97',
      height: 36
    },
    backgroundColor: '#111114',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  if (bounds.maximized) {
    mainWindow.maximize()
  }

  // Initialize remaining services
  ptyService = new PTYService(mainWindow)
  worktreeService = new WorktreeService()
  fileWatcherService = new FileWatcherService(mainWindow, dbService)

  // Mark all previously-active sessions as idle (PTY processes died on app exit)
  const staleSessions = dbService.listSessions().filter((s: any) => s.status === 'active')
  for (const s of staleSessions) {
    dbService.updateSession(s.id, { status: 'idle', pid: null })
  }

  // Crash recovery: auto-commit orphaned worktrees
  try {
    const allProjects = dbService.listProjects()
    const allSessions = dbService.listSessions()
    for (const project of allProjects) {
      try {
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
