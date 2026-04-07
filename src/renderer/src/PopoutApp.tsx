import { useEffect, useRef, useState, useCallback } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { getApi } from './api/client'
import { getThemeById, applyTheme } from './themes'
import type { SorcererTheme } from './themes'
import '@xterm/xterm/css/xterm.css'

interface PopoutParams {
  panelType: string
  panelId: string
  entityName: string
  themeId: string
  projectName?: string
  branch?: string
}

function parsePopoutParams(): PopoutParams | null {
  const params = new URLSearchParams(window.location.search)
  const popout = params.get('popout')
  if (!popout) return null
  const colonIdx = popout.indexOf(':')
  if (colonIdx === -1) return null
  return {
    panelType: popout.slice(0, colonIdx),
    panelId: popout.slice(colonIdx + 1),
    entityName: params.get('name') || 'Sorcerer',
    themeId: params.get('theme') || 'default',
    projectName: params.get('project') || undefined,
    branch: params.get('branch') || undefined
  }
}

function PopoutTerminal({ sessionId, onExited }: { sessionId: string; onExited: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<{ terminal: Terminal; fitAddon: FitAddon } | null>(null)

  useEffect(() => {
    if (!containerRef.current) return

    const cs = getComputedStyle(document.documentElement)
    const cssVar = (name: string, fallback: string) =>
      cs.getPropertyValue(name).trim() || fallback
    const terminalBg = cssVar('--terminal-bg', '#0f0e0c')

    const terminal = new Terminal({
      cursorBlink: true,
      cursorStyle: 'bar',
      cursorInactiveStyle: 'none',
      fontSize: 13,
      fontFamily: "'JetBrains Mono', 'Cascadia Code', 'Consolas', monospace",
      theme: {
        background: terminalBg,
        foreground: cssVar('--text-primary', '#ede6d8'),
        cursor: cssVar('--accent', cssVar('--text-primary', '#ede6d8')),
        cursorAccent: terminalBg,
        selectionBackground: cssVar('--accent-glow-strong', 'rgba(255, 255, 255, 0.22)'),
        selectionForeground: undefined,
        black: terminalBg,
        red: '#e25555',
        green: '#5ec269',
        yellow: cssVar('--accent', cssVar('--text-primary', '#ede6d8')),
        blue: '#5ba4e6',
        magenta: '#c084fc',
        cyan: '#22d3ee',
        white: cssVar('--text-primary', '#ede6d8'),
        brightBlack: cssVar('--text-tertiary', '#6b6355'),
        brightRed: '#f87171',
        brightGreen: '#86efac',
        brightYellow: '#fde68a',
        brightBlue: '#93c5fd',
        brightMagenta: '#d8b4fe',
        brightCyan: '#67e8f9',
        brightWhite: '#ffffff'
      },
      allowTransparency: false,
      scrollback: 3000,
      lineHeight: 1.2
    })

    const fitAddon = new FitAddon()
    terminal.loadAddon(fitAddon)
    terminal.open(containerRef.current)
    termRef.current = { terminal, fitAddon }

    // Load font size setting
    getApi().settings.get('terminalFontSize').then((v: string | undefined) => {
      const size = v ? Number(v) : 13
      if (size && size !== 13) {
        terminal.options.fontSize = size
        try { fitAddon.fit() } catch {}
      }
    })

    // Replay scrollback then subscribe to live data
    getApi().popout.getScrollback(sessionId).then((scrollback: string) => {
      if (scrollback) terminal.write(scrollback)
      requestAnimationFrame(() => {
        try {
          fitAddon.fit()
          getApi().terminal.resize(sessionId, terminal.cols, terminal.rows)
        } catch {}
      })
    })

    // Forward keyboard input to PTY
    terminal.onData((data) => {
      getApi().terminal.write(sessionId, data)
    })

    // Copy selection to clipboard on select
    terminal.onSelectionChange(() => {
      const selection = terminal.getSelection()
      if (selection) {
        navigator.clipboard.writeText(selection).catch(() => {})
      }
    })

    // Handle Ctrl+V paste
    terminal.attachCustomKeyEventHandler((e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'v' && e.type === 'keydown') {
        e.preventDefault()
        navigator.clipboard.readText().then((text) => {
          if (text) terminal.paste(text)
        }).catch(() => {})
        return false
      }
      return true
    })

    // Listen for live PTY output
    const unsubData = getApi().terminal.onData(sessionId, (data: string) => {
      terminal.write(data)
    })

    const unsubExit = getApi().terminal.onExit(sessionId, (exitCode: number) => {
      terminal.writeln(`\r\n\x1b[90m[Process exited with code ${exitCode}]\x1b[0m`)
      // Notify main window so sidebar status dot updates
      getApi().popout.notifySessionUpdated(sessionId, 'idle', null)
      onExited()
    })

    // Fit on resize
    const resizeObserver = new ResizeObserver(() => {
      try {
        fitAddon.fit()
        getApi().terminal.resize(sessionId, terminal.cols, terminal.rows)
      } catch {}
    })
    resizeObserver.observe(containerRef.current)

    // Focus terminal
    requestAnimationFrame(() => terminal.focus())

    return () => {
      resizeObserver.disconnect()
      unsubData()
      unsubExit()
      terminal.dispose()
      termRef.current = null
    }
  }, [sessionId, onExited])

  // Listen for theme changes from main window
  useEffect(() => {
    const handler = (e: Event) => {
      const theme = (e as CustomEvent<SorcererTheme>).detail
      if (!theme || !termRef.current) return
      const termBg = theme.colors['terminal-bg']
      termRef.current.terminal.options.theme = {
        background: termBg,
        foreground: theme.colors['text-primary'],
        cursor: theme.colors['accent'],
        cursorAccent: termBg,
        selectionBackground: theme.terminal.selectionBackground,
        selectionForeground: undefined,
        black: termBg,
        red: theme.terminal.red,
        green: theme.terminal.green,
        yellow: theme.terminal.yellow,
        blue: theme.terminal.blue,
        magenta: theme.terminal.magenta,
        cyan: theme.terminal.cyan,
        white: theme.colors['text-primary'],
        brightBlack: theme.colors['text-tertiary'],
        brightRed: theme.terminal.brightRed,
        brightGreen: theme.terminal.brightGreen,
        brightYellow: theme.terminal.brightYellow,
        brightBlue: theme.terminal.brightBlue,
        brightMagenta: theme.terminal.brightMagenta,
        brightCyan: theme.terminal.brightCyan,
        brightWhite: theme.terminal.brightWhite
      }
    }
    window.addEventListener('sorcerer:themeChange', handler)
    return () => window.removeEventListener('sorcerer:themeChange', handler)
  }, [])

  return <div ref={containerRef} className="popout-terminal" />
}

function PopoutIdleView({ sessionId, entityName, onStarted }: { sessionId: string; entityName: string; onStarted: () => void }) {
  const [loading, setLoading] = useState(false)

  const handleResume = async () => {
    setLoading(true)
    try {
      const session = await getApi().session.resume(sessionId)
      // Notify main window so sidebar status dot updates
      if (session) {
        getApi().popout.notifySessionUpdated(sessionId, session.status, session.pid ?? null)
      }
      onStarted()
    } catch {
      setLoading(false)
    }
  }

  const handleNewSession = async () => {
    setLoading(true)
    try {
      const session = await getApi().session.restart(sessionId)
      // Notify main window so sidebar status dot updates
      if (session) {
        getApi().popout.notifySessionUpdated(sessionId, session.status, session.pid ?? null)
      }
      onStarted()
    } catch {
      setLoading(false)
    }
  }

  return (
    <div className="terminal-placeholder">
      <svg className="terminal-placeholder-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <polyline points="4 17 10 11 4 5" />
        <line x1="12" y1="19" x2="20" y2="19" />
      </svg>
      <div className="terminal-placeholder-text">
        Session <strong>{entityName}</strong> has ended.
      </div>
      <div className="terminal-action-row">
        <button className="terminal-restart-btn terminal-restart-btn--primary" onClick={handleResume} disabled={loading}>
          <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
            <path d="M6 3.5a.5.5 0 0 1 .795-.404l6 4.5a.5.5 0 0 1 0 .808l-6 4.5A.5.5 0 0 1 6 12.5v-9z" />
          </svg>
          Resume
        </button>
        <button className="terminal-restart-btn" onClick={handleNewSession} disabled={loading}>
          <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
            <path d="M11.534 7h3.932a.25.25 0 0 1 .192.41l-1.966 2.36a.25.25 0 0 1-.384 0l-1.966-2.36a.25.25 0 0 1 .192-.41zm-11 2h3.932a.25.25 0 0 0 .192-.41L2.692 6.23a.25.25 0 0 0-.384 0L.342 8.59A.25.25 0 0 0 .534 9z" />
            <path fillRule="evenodd" d="M8 3c-1.552 0-2.94.707-3.857 1.818a.5.5 0 1 1-.771-.636A6.002 6.002 0 0 1 13.917 7H12.9A5.002 5.002 0 0 0 8 3zM3.1 9a5.002 5.002 0 0 0 8.757 2.182.5.5 0 1 1 .771.636A6.002 6.002 0 0 1 2.083 9H3.1z" />
          </svg>
          New Session
        </button>
      </div>
    </div>
  )
}

function PopoutTerminalView({ sessionId, entityName }: { sessionId: string; entityName: string }) {
  const [status, setStatus] = useState<'loading' | 'active' | 'idle'>('loading')

  // Check if session is active on mount
  useEffect(() => {
    getApi().session.list().then((sessions: any[]) => {
      const session = sessions.find((s: any) => s.id === sessionId)
      if (session && session.status === 'active') {
        setStatus('active')
      } else {
        setStatus('idle')
      }
    }).catch(() => {
      setStatus('idle')
    })
  }, [sessionId])

  const handleStarted = useCallback(() => {
    setStatus('active')
  }, [])

  const handleExited = useCallback(() => {
    setStatus('idle')
  }, [])

  if (status === 'loading') {
    return (
      <div className="terminal-placeholder">
        <div className="terminal-placeholder-text">Connecting...</div>
      </div>
    )
  }

  if (status === 'idle') {
    return <PopoutIdleView sessionId={sessionId} entityName={entityName} onStarted={handleStarted} />
  }

  return <PopoutTerminal sessionId={sessionId} onExited={handleExited} />
}

export function PopoutApp() {
  const [params] = useState(() => parsePopoutParams())

  // Apply initial theme
  useEffect(() => {
    if (params?.themeId) {
      applyTheme(getThemeById(params.themeId))
    }
  }, [params?.themeId])

  // Listen for theme broadcasts from main window
  useEffect(() => {
    const unsub = getApi().popout.onThemeUpdate((themeId: string) => {
      const theme = getThemeById(themeId)
      applyTheme(theme)
    })
    return () => { unsub() }
  }, [])

  // Set window title
  useEffect(() => {
    if (params?.entityName) {
      const prefix = params.projectName ? `${params.projectName} / ` : ''
      document.title = `${prefix}${params.entityName} — Sorcerer`
    }
  }, [params?.entityName])

  if (!params) {
    return <div className="popout-error">Invalid popout parameters</div>
  }

  if (params.panelType === 'terminal') {
    return (
      <div className="popout-shell">
        <div className="popout-titlebar">
          <span className="popout-titlebar-text">
            {params.projectName && (
              <>
                <span className="popout-titlebar-project">{params.projectName}</span>
                <span className="popout-titlebar-sep">/</span>
              </>
            )}
            {params.entityName}
            {params.branch && (
              <span className="popout-titlebar-branch">
                <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor"><path fillRule="evenodd" d="M11.75 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5zm-2.25.75a2.25 2.25 0 1 1 3 2.122V6A2.5 2.5 0 0 1 10 8.5H6a1 1 0 0 0-1 1v1.128a2.251 2.251 0 1 1-1.5 0V5.372a2.25 2.25 0 1 1 1.5 0v1.836A2.492 2.492 0 0 1 6 7h4a1 1 0 0 0 1-1v-.628A2.25 2.25 0 0 1 9.5 3.25zM4.25 12a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5zM3.5 3.25a.75.75 0 1 1 1.5 0 .75.75 0 0 1-1.5 0z"/></svg>
                {params.branch}
              </span>
            )}
          </span>
        </div>
        <PopoutTerminalView sessionId={params.panelId} entityName={params.entityName} />
      </div>
    )
  }

  return <div className="popout-error">Unknown panel type: {params.panelType}</div>
}

/** Check if the current window is a popout */
export function isPopout(): boolean {
  return new URLSearchParams(window.location.search).has('popout')
}
