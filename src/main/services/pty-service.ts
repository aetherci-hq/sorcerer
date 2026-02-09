import { BrowserWindow } from 'electron'
import * as pty from 'node-pty'
import os from 'os'

interface PTYSession {
  ptyProcess: pty.IPty
  sessionId: string
}

export class PTYService {
  private sessions: Map<string, PTYSession> = new Map()
  private mainWindow: BrowserWindow
  private customShell: string | undefined

  constructor(mainWindow: BrowserWindow) {
    this.mainWindow = mainWindow
  }

  setCustomShell(shell: string | undefined): void {
    this.customShell = shell
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
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send(`terminal:data:${sessionId}`, data)
      }
    })

    ptyProcess.onExit(({ exitCode }) => {
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send(`terminal:exit:${sessionId}`, exitCode)
      }
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
