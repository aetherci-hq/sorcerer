import React, { useState, useRef, useEffect } from 'react'
import { useUIStore } from '../../stores/useUIStore'
import { useToastStore } from '../../stores/useToastStore'
import {
  TerminalIcon, GitBranchIcon, SettingsIcon, KeyboardIcon
} from '../icons'

type SettingsTab = 'sessions' | 'git' | 'general'

const TABS: { id: SettingsTab; label: string; icon: React.ReactNode }[] = [
  { id: 'sessions', label: 'Sessions', icon: <TerminalIcon /> },
  { id: 'git', label: 'Git', icon: <GitBranchIcon /> },
  { id: 'general', label: 'General', icon: <SettingsIcon /> }
]

const SHORTCUTS = [
  { keys: 'Ctrl + K', action: 'Search sessions' },
  { keys: 'Ctrl + N', action: 'New session' },
  { keys: 'Ctrl + B', action: 'Toggle sidebar' },
  { keys: 'Escape', action: 'Clear search / close dialog' },
  { keys: 'F2', action: 'Rename selected item' }
]

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      className={`settings-toggle ${checked ? 'settings-toggle--on' : ''}`}
      onClick={() => onChange(!checked)}
      type="button"
    >
      <span className="settings-toggle-dot" />
    </button>
  )
}

function SettingRow({ label, description, children }: { label: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="settings-row">
      <div className="settings-row-info">
        <span className="settings-row-label">{label}</span>
        {description && <span className="settings-row-desc">{description}</span>}
      </div>
      <div className="settings-row-control">
        {children}
      </div>
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="settings-section-title">{children}</h3>
}

function SessionsTab() {
  const [shell, setShell] = useState('')
  const { addToast } = useToastStore()

  // Load current shell setting
  useEffect(() => {
    window.sorcerer.settings.get('shell').then((value: string | undefined) => {
      if (value) setShell(value)
    })
  }, [])

  const saveShell = () => {
    window.sorcerer.settings.set('shell', shell)
    addToast('Shell setting saved', 'success')
  }

  return (
    <>
      <SectionTitle>Shell</SectionTitle>
      <SettingRow label="Custom shell" description="Shell executable for new sessions (leave empty for system default)">
        <div className="settings-path-row">
          <input
            className="settings-input settings-input--path"
            value={shell}
            onChange={(e) => setShell(e.target.value)}
            placeholder="e.g. powershell.exe, /bin/zsh"
            onBlur={saveShell}
          />
        </div>
      </SettingRow>
    </>
  )
}

function GitTab() {
  return (
    <>
      <SectionTitle>Worktrees</SectionTitle>
      <SettingRow label="Worktree base directory" description="Managed by Sorcerer">
        <input
          className="settings-input"
          value="~/.sorcerer/workspaces"
          readOnly
        />
      </SettingRow>
    </>
  )
}

function GeneralTab() {
  const { addToast } = useToastStore()

  return (
    <>
      <SectionTitle>Keyboard Shortcuts</SectionTitle>
      <div className="settings-shortcuts">
        {SHORTCUTS.map((s) => (
          <div key={s.keys} className="settings-shortcut-row">
            <kbd className="settings-kbd">{s.keys}</kbd>
            <span className="settings-shortcut-action">{s.action}</span>
          </div>
        ))}
      </div>

      <SectionTitle>Data</SectionTitle>
      <SettingRow label="Reset sidebar layout" description="Restore default sidebar width and expanded state">
        <button
          className="settings-action-btn"
          type="button"
          onClick={() => {
            localStorage.removeItem('sorcerer-ui-store')
            addToast('Layout reset — reload to apply', 'success')
          }}
        >
          Reset
        </button>
      </SettingRow>
    </>
  )
}

const TAB_CONTENT: Record<SettingsTab, () => React.JSX.Element> = {
  sessions: SessionsTab,
  git: GitTab,
  general: GeneralTab
}

export function SettingsDialog() {
  const { activeDialog, dialogClosing, closeDialog } = useUIStore()
  const overlayRef = useRef<HTMLDivElement>(null)
  const [activeTab, setActiveTab] = useState<SettingsTab>('sessions')

  const open = activeDialog === 'settings'

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeDialog()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, closeDialog])

  if (!open) return null

  const TabContent = TAB_CONTENT[activeTab]

  return (
    <div
      className={`dialog-overlay ${dialogClosing ? 'dialog-overlay--closing' : ''}`}
      ref={overlayRef}
      onClick={(e) => { if (e.target === overlayRef.current) closeDialog() }}
    >
      <div className={`settings-dialog ${dialogClosing ? 'dialog--closing' : ''}`}>
        <div className="dialog-header">
          <h2 className="dialog-title">Settings</h2>
          <button className="dialog-close" onClick={closeDialog}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="settings-body">
          <nav className="settings-nav">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                className={`settings-nav-item ${activeTab === tab.id ? 'settings-nav-item--active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                <span className="settings-nav-icon">{tab.icon}</span>
                <span className="settings-nav-label">{tab.label}</span>
              </button>
            ))}
          </nav>
          <div className="settings-content">
            <TabContent />
          </div>
        </div>
      </div>
    </div>
  )
}
