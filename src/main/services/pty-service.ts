import { BrowserWindow, WebContents } from 'electron'
import * as pty from 'node-pty'
import os from 'os'
import { ScrollbackBuffer } from '../server/scrollback'

interface PTYSession {
  ptyProcess: pty.IPty
  sessionId: string
}

export class PTYService {
  private sessions: Map<string, PTYSession> = new Map()
  private mainWindow: BrowserWindow
  private customShell: string | undefined
  private outputListeners: ((sessionId: string, data: string) => void)[] = []
  private exitListeners: ((sessionId: string, exitCode: number) => void)[] = []
  /** Extra windows that should receive terminal data for a given session */
  private extraListeners: Map<string, Set<WebContents>> = new Map()
  /** Scrollback buffer for terminal replay in pop-out windows */
  readonly scrollback: ScrollbackBuffer = new ScrollbackBuffer()

  constructor(mainWindow: BrowserWindow) {
    this.mainWindow = mainWindow
  }

  setCustomShell(shell: string | undefined): void {
    this.customShell = shell
  }

  /** Register a listener for all PTY output (used by API server for WebSocket broadcast) */
  onOutput(listener: (sessionId: string, data: string) => void): void {
    this.outputListeners.push(listener)
  }

  /** Remove a previously registered output listener */
  removeOutputListener(listener: (sessionId: string, data: string) => void): void {
    this.outputListeners = this.outputListeners.filter((l) => l !== listener)
  }

  /** Register a listener for all PTY exits */
  onExit(listener: (sessionId: string, exitCode: number) => void): void {
    this.exitListeners.push(listener)
  }

  /** Remove a previously registered exit listener */
  removeExitListener(listener: (sessionId: string, exitCode: number) => void): void {
    this.exitListeners = this.exitListeners.filter((l) => l !== listener)
  }

  /** Subscribe an extra WebContents to a session's terminal output */
  addListener(sessionId: string, wc: WebContents): void {
    let set = this.extraListeners.get(sessionId)
    if (!set) {
      set = new Set()
      this.extraListeners.set(sessionId, set)
    }
    set.add(wc)
  }

  /** Unsubscribe an extra WebContents from a session's terminal output */
  removeListener(sessionId: string, wc: WebContents): void {
    const set = this.extraListeners.get(sessionId)
    if (set) {
      set.delete(wc)
      if (set.size === 0) this.extraListeners.delete(sessionId)
    }
  }

  /**
   * Spawn a process in a PTY.
   * If command is provided, spawn that directly (e.g. 'claude').
   * Otherwise spawn the user's shell.
   */
  spawn(sessionId: string, cwd: string, options?: {
    command?: string
    args?: string[]
    env?: Record<string, string>
  }): void {
    let file: string
    let args: string[]

    if (options?.command) {
      // Spawn the command directly - no shell wrapper
      file = options.command
      args = options.args || []
    } else {
      // Spawn a shell
      if (this.customShell) {
        file = this.customShell
      } else {
        file = os.platform() === 'win32' ? 'powershell.exe' : process.env.SHELL || '/bin/bash'
      }
      args = os.platform() === 'win32' && !file.includes('bash') ? [] : ['--login']
    }

    const ptyProcess = pty.spawn(file, args, {
      name: 'xterm-256color',
      cols: 120,
      rows: 30,
      cwd,
      env: {
        ...process.env,
        ...options?.env
      } as Record<string, string>
    })

    const session: PTYSession = { ptyProcess, sessionId }
    this.sessions.set(sessionId, session)

    ptyProcess.onData((data: string) => {
      // Store in scrollback for pop-out replay
      this.scrollback.append(sessionId, data)

      // Send to main window
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send(`terminal:data:${sessionId}`, data)
      }

      // Send to any extra listeners (pop-out windows)
      const extras = this.extraListeners.get(sessionId)
      if (extras) {
        for (const wc of extras) {
          try {
            if (!wc.isDestroyed()) {
              wc.send(`terminal:data:${sessionId}`, data)
            } else {
              extras.delete(wc)
            }
          } catch {
            extras.delete(wc)
          }
        }
      }

      for (const listener of this.outputListeners) listener(sessionId, data)
    })

    ptyProcess.onExit(({ exitCode }) => {
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send(`terminal:exit:${sessionId}`, exitCode)
      }

      // Notify extra listeners of exit
      const extras = this.extraListeners.get(sessionId)
      if (extras) {
        for (const wc of extras) {
          try {
            if (!wc.isDestroyed()) {
              wc.send(`terminal:exit:${sessionId}`, exitCode)
            }
          } catch { /* window already destroyed */ }
        }
        this.extraListeners.delete(sessionId)
      }

      for (const listener of this.exitListeners) listener(sessionId, exitCode)
      this.sessions.delete(sessionId)
    })
  }

  write(sessionId: string, data: string): void {
    const session = this.sessions.get(sessionId)
    if (session) {
      session.ptyProcess.write(data)
    }
  }

  resize(sessionId: string, cols: number, rows: number): void {
    const session = this.sessions.get(sessionId)
    if (session) {
      session.ptyProcess.resize(cols, rows)
    }
  }

  kill(sessionId: string): void {
    const session = this.sessions.get(sessionId)
    if (session) {
      session.ptyProcess.kill()
      this.sessions.delete(sessionId)
    }
    // Clean up scrollback and extra listeners
    this.scrollback.remove(sessionId)
    this.extraListeners.delete(sessionId)
  }

  killAll(): void {
    for (const [id] of this.sessions) {
      this.kill(id)
    }
  }

  isRunning(sessionId: string): boolean {
    return this.sessions.has(sessionId)
  }

  getPid(sessionId: string): number | undefined {
    const session = this.sessions.get(sessionId)
    return session?.ptyProcess.pid
  }
}
