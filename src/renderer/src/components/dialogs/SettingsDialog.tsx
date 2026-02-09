import React, { useState, useRef, useEffect } from 'react'
import { useUIStore } from '../../stores/useUIStore'
import { useToastStore } from '../../stores/useToastStore'
import {
  TerminalIcon, GitBranchIcon, SettingsIcon
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
  { keys: 'Ctrl + \\', action: 'Split right' },
  { keys: 'Ctrl + Shift + \\', action: 'Split down' },
  { keys: 'Ctrl + W', action: 'Close focused panel' },
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

/** Helper to load a setting with a fallback */
function useSetting(key: string, fallback: string) {
  const [value, setValue] = useState(fallback)
  useEffect(() => {
    window.sorcerer.settings.get(key).then((v: string | undefined) => {
      if (v !== undefined) setValue(v)
    })
  }, [key])
  const save = (v: string) => {
    setValue(v)
    window.sorcerer.settings.set(key, v)
  }
  return [value, save] as const
}

function SessionsTab() {
  const { addToast } = useToastStore()
  const [shell, setShell] = useSetting('shell', '')
  const [branchPrefix, setBranchPrefix] = useSetting('branchPrefix', 'sorcerer/')
  const [autoArchive, setAutoArchive] = useSetting('autoArchive', 'false')
  const [idleTimeout, setIdleTimeout] = useSetting('idleTimeout', '30m')
  const [confirmDelete, setConfirmDelete] = useSetting('confirmDelete', 'true')

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
          />
          <button
            className="settings-browse-btn"
            type="button"
            onClick={async () => {
              const result = await window.sorcerer.project.add()
              if (result) {
                setShell(result.path)
                addToast('Shell setting saved', 'success')
              }
            }}
          >
            Browse
          </button>
        </div>
      </SettingRow>

      <SectionTitle>Branch &amp; Worktrees</SectionTitle>
      <SettingRow label="Branch prefix" description="Prefix for auto-created git branches">
        <input
          className="settings-input"
          value={branchPrefix}
          onChange={(e) => setBranchPrefix(e.target.value)}
        />
      </SettingRow>

      <SectionTitle>Lifecycle</SectionTitle>
      <SettingRow label="Auto-archive idle sessions" description="Automatically archive sessions after idle timeout">
        <Toggle checked={autoArchive === 'true'} onChange={(v) => setAutoArchive(v ? 'true' : 'false')} />
      </SettingRow>
      <SettingRow label="Idle timeout" description="How long before a session is considered idle">
        <select
          className="settings-select"
          value={idleTimeout}
          onChange={(e) => setIdleTimeout(e.target.value)}
          disabled={autoArchive !== 'true'}
        >
          <option value="15m">15 minutes</option>
          <option value="30m">30 minutes</option>
          <option value="1h">1 hour</option>
          <option value="2h">2 hours</option>
        </select>
      </SettingRow>
      <SettingRow label="Confirm before delete" description="Show confirmation dialog when deleting sessions">
        <Toggle checked={confirmDelete === 'true'} onChange={(v) => setConfirmDelete(v ? 'true' : 'false')} />
      </SettingRow>
    </>
  )
}

function GitTab() {
  const [defaultRemote, setDefaultRemote] = useSetting('defaultRemote', 'origin')
  const [autoPush, setAutoPush] = useSetting('autoPush', 'false')
  const [worktreeBase, setWorktreeBase] = useState('~/.sorcerer/workspaces')

  return (
    <>
      <SectionTitle>Remote</SectionTitle>
      <SettingRow label="Default remote" description="Remote to push/pull from by default">
        <input
          className="settings-input"
          value={defaultRemote}
          onChange={(e) => setDefaultRemote(e.target.value)}
        />
      </SettingRow>
      <SettingRow label="Auto-push on create" description="Push branch to remote when creating a session">
        <Toggle checked={autoPush === 'true'} onChange={(v) => setAutoPush(v ? 'true' : 'false')} />
      </SettingRow>

      <SectionTitle>Worktrees</SectionTitle>
      <SettingRow label="Worktree base directory" description="Where git worktrees are created on disk">
        <div className="settings-path-row">
          <input
            className="settings-input settings-input--path"
            value={worktreeBase}
            onChange={(e) => setWorktreeBase(e.target.value)}
            readOnly
          />
          <button className="settings-browse-btn" type="button" onClick={async () => {
            const result = await window.sorcerer.project.add()
            if (result) setWorktreeBase(result.path)
          }}>Browse</button>
        </div>
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
      <SettingRow label="Clear all data" description="Remove all projects, sessions, and settings">
        <button
          className="settings-action-btn settings-action-btn--danger"
          type="button"
          onClick={() => {
            localStorage.clear()
            addToast('All data cleared — reload to see defaults', 'info')
          }}
        >
          Clear Data
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
