import { BrowserWindow } from 'electron'
import path from 'path'

export interface PopoutInfo {
  panelType: string
  panelId: string
  entityName: string
  themeId: string
  projectName?: string
  branch?: string
}

interface PopoutRecord {
  windowId: string
  win: BrowserWindow
  panelIds: Set<string>
  selectionTargetReady: boolean
}

function createWindowId(): string {
  return `popout_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

export class PopoutService {
  private windows: Map<string, PopoutRecord> = new Map()
  private panelToWindow: Map<string, string> = new Map()
  private selectionTargetWindowId: string | null = null
  private mainWindow: BrowserWindow
  private preloadPath: string

  constructor(mainWindow: BrowserWindow) {
    this.mainWindow = mainWindow
    this.preloadPath = path.join(__dirname, '../preload/index.js')
  }

  open(info: PopoutInfo, titleBarOverlay?: { color: string; symbolColor: string }): { win: BrowserWindow; windowId: string } {
    const existingWindowId = this.panelToWindow.get(info.panelId)
    if (existingWindowId) {
      const existing = this.windows.get(existingWindowId)
      if (existing && !existing.win.isDestroyed()) {
        existing.win.focus()
        return { win: existing.win, windowId: existing.windowId }
      }
      this.unregisterWindow(existingWindowId)
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
        sandbox: false,
        backgroundThrottling: true,
        v8CacheOptions: 'none',
        enableWebSQL: false,
        spellcheck: false
      }
    })

    const windowId = createWindowId()
    const record: PopoutRecord = {
      windowId,
      win,
      panelIds: new Set([info.panelId]),
      selectionTargetReady: false
    }
    this.windows.set(windowId, record)
    this.panelToWindow.set(info.panelId, windowId)

    let query = `?popout=${encodeURIComponent(info.panelType)}:${encodeURIComponent(info.panelId)}&windowId=${encodeURIComponent(windowId)}&theme=${encodeURIComponent(info.themeId)}&name=${encodeURIComponent(info.entityName)}`
    if (info.projectName) query += `&project=${encodeURIComponent(info.projectName)}`
    if (info.branch) query += `&branch=${encodeURIComponent(info.branch)}`
    if (process.env.ELECTRON_RENDERER_URL) {
      win.loadURL(`${process.env.ELECTRON_RENDERER_URL}${query}`)
    } else {
      win.loadFile(path.join(__dirname, '../renderer/index.html'), {
        search: query.slice(1)
      })
    }

    win.on('closed', () => {
      this.unregisterWindow(windowId, true)
    })

    this.notifyOpened(info.panelId)
    return { win, windowId }
  }

  close(panelId: string): void {
    const windowId = this.panelToWindow.get(panelId)
    if (!windowId) return
    const record = this.windows.get(windowId)
    if (record?.win && !record.win.isDestroyed()) {
      record.win.close()
    } else {
      this.unregisterWindow(windowId)
    }
  }

  closeAll(): void {
    for (const record of this.windows.values()) {
      if (!record.win.isDestroyed()) record.win.close()
    }
    this.windows.clear()
    this.panelToWindow.clear()
    this.selectionTargetWindowId = null
  }

  isOpen(panelId: string): boolean {
    const windowId = this.panelToWindow.get(panelId)
    if (!windowId) return false
    const record = this.windows.get(windowId)
    return !!record && !record.win.isDestroyed()
  }

  getWindow(panelId: string): BrowserWindow | undefined {
    const windowId = this.panelToWindow.get(panelId)
    if (!windowId) return undefined
    const record = this.windows.get(windowId)
    return record && !record.win.isDestroyed() ? record.win : undefined
  }

  getWindowIdForPanel(panelId: string): string | null {
    return this.panelToWindow.get(panelId) || null
  }

  getAllWindows(): BrowserWindow[] {
    return Array.from(this.windows.values()).map((record) => record.win).filter((w) => !w.isDestroyed())
  }

  getPanelsForWindow(windowId: string): string[] {
    return Array.from(this.windows.get(windowId)?.panelIds || [])
  }

  updatePanels(windowId: string, panelIds: string[]): { added: string[]; removed: string[] } {
    const record = this.windows.get(windowId)
    if (!record) return { added: [], removed: [] }

    const next = new Set(panelIds)
    const added = panelIds.filter((panelId) => !record.panelIds.has(panelId))
    const removed = Array.from(record.panelIds).filter((panelId) => !next.has(panelId))

    for (const panelId of removed) {
      record.panelIds.delete(panelId)
      this.panelToWindow.delete(panelId)
      this.notifyClosed(panelId)
    }
    for (const panelId of added) {
      record.panelIds.add(panelId)
      this.panelToWindow.set(panelId, windowId)
      this.notifyOpened(panelId)
    }

    return { added, removed }
  }

  setSelectionTargetReady(windowId: string, ready: boolean): void {
    const record = this.windows.get(windowId)
    if (!record) return
    record.selectionTargetReady = ready
    if (ready) {
      this.selectionTargetWindowId = windowId
    } else if (this.selectionTargetWindowId === windowId) {
      this.selectionTargetWindowId = null
    }
  }

  assignToSelectionTarget(panelId: string): boolean {
    if (!this.selectionTargetWindowId) return false
    const record = this.windows.get(this.selectionTargetWindowId)
    if (!record || record.win.isDestroyed() || !record.selectionTargetReady) {
      this.selectionTargetWindowId = null
      return false
    }
    record.win.webContents.send('popout:assign-panel', panelId)
    record.selectionTargetReady = false
    this.selectionTargetWindowId = null
    return true
  }

  /** Get the BrowserWindow for a given webContents id */
  getWindowByWebContentsId(webContentsId: number): BrowserWindow | undefined {
    for (const record of this.windows.values()) {
      if (!record.win.isDestroyed() && record.win.webContents.id === webContentsId) return record.win
    }
    return undefined
  }

  private unregisterWindow(windowId: string, notifyClosed = false): void {
    const record = this.windows.get(windowId)
    if (!record) return
    this.windows.delete(windowId)
    if (this.selectionTargetWindowId === windowId) {
      this.selectionTargetWindowId = null
    }
    for (const panelId of record.panelIds) {
      this.panelToWindow.delete(panelId)
      if (notifyClosed) this.notifyClosed(panelId)
    }
  }

  private notifyOpened(panelId: string): void {
    try {
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send('popout:opened', panelId)
      }
    } catch {}
  }

  private notifyClosed(panelId: string): void {
    try {
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send('popout:closed', panelId)
      }
    } catch {}
  }
}
