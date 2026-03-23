import { BrowserWindow } from 'electron'
import path from 'path'

export interface PopoutInfo {
  panelType: string   // 'terminal' | 'quicknotes'
  panelId: string     // sessionId, agentId, or 'quicknotes:session:parentId'
  entityName: string  // display name for the title bar
  themeId: string
}

export class PopoutService {
  private windows: Map<string, BrowserWindow> = new Map()
  private mainWindow: BrowserWindow
  private preloadPath: string

  constructor(mainWindow: BrowserWindow) {
    this.mainWindow = mainWindow
    this.preloadPath = path.join(__dirname, '../preload/index.js')
  }

  open(info: PopoutInfo, titleBarOverlay?: { color: string; symbolColor: string }): BrowserWindow {
    // If already open, focus and return
    const existing = this.windows.get(info.panelId)
    if (existing && !existing.isDestroyed()) {
      existing.focus()
      return existing
    }

    const win = new BrowserWindow({
      width: 900,
      height: 650,
      minWidth: 400,
      minHeight: 300,
      frame: false,
      titleBarStyle: 'hidden',
      ...(process.platform === 'darwin'
        ? { trafficLightPosition: { x: 12, y: 10 } }
        : {
            titleBarOverlay: {
              color: titleBarOverlay?.color || '#1a1714',
              symbolColor: titleBarOverlay?.symbolColor || '#a69e8e',
              height: 36
            }
          }),
      backgroundColor: '#060606',
      webPreferences: {
        preload: this.preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false
      }
    })

    this.windows.set(info.panelId, win)

    // Load the same renderer with a popout query param
    const query = `?popout=${encodeURIComponent(info.panelType)}:${encodeURIComponent(info.panelId)}&theme=${encodeURIComponent(info.themeId)}&name=${encodeURIComponent(info.entityName)}`
    if (process.env.ELECTRON_RENDERER_URL) {
      win.loadURL(`${process.env.ELECTRON_RENDERER_URL}${query}`)
    } else {
      win.loadFile(path.join(__dirname, '../renderer/index.html'), {
        search: query.slice(1) // strip leading '?'
      })
    }

    win.on('closed', () => {
      this.windows.delete(info.panelId)
      // Notify main window that the popout was closed
      try {
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
          this.mainWindow.webContents.send('popout:closed', info.panelId)
        }
      } catch { /* main window already destroyed */ }
    })

    // Notify main window that a popout was opened
    try {
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send('popout:opened', info.panelId)
      }
    } catch { /* main window already destroyed */ }

    return win
  }

  close(panelId: string): void {
    const win = this.windows.get(panelId)
    if (win && !win.isDestroyed()) {
      win.close()
    }
    this.windows.delete(panelId)
  }

  closeAll(): void {
    for (const [id, win] of this.windows) {
      if (!win.isDestroyed()) win.close()
    }
    this.windows.clear()
  }

  isOpen(panelId: string): boolean {
    const win = this.windows.get(panelId)
    return !!win && !win.isDestroyed()
  }

  getWindow(panelId: string): BrowserWindow | undefined {
    const win = this.windows.get(panelId)
    return win && !win.isDestroyed() ? win : undefined
  }

  getAllWindows(): BrowserWindow[] {
    return Array.from(this.windows.values()).filter((w) => !w.isDestroyed())
  }

  /** Get the BrowserWindow for a given webContents id */
  getWindowByWebContentsId(webContentsId: number): BrowserWindow | undefined {
    for (const win of this.windows.values()) {
      if (!win.isDestroyed() && win.webContents.id === webContentsId) return win
    }
    return undefined
  }
}
