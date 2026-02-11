import React, { useState, useRef, useEffect } from 'react'
import { useUIStore } from '../../stores/useUIStore'
import { useToastStore } from '../../stores/useToastStore'
import {
  TerminalIcon, GitBranchIcon, SettingsIcon, UserIcon
} from '../icons'
import { gravatarUrl } from '../SidebarFooter'

type SettingsTab = 'profile' | 'sessions' | 'git' | 'general'

const TABS: { id: SettingsTab; label: string; icon: React.ReactNode }[] = [
  { id: 'profile', label: 'Profile', icon: <UserIcon /> },
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

function ProfileTab() {
  const { addToast } = useToastStore()
  const [displayName, setDisplayName] = useSetting('display_name', '')
  const [email, setEmail] = useSetting('gravatar_email', '')
  const [osUsername, setOsUsername] = useState('')
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [avatarSource, setAvatarSource] = useState<'gravatar' | 'system' | 'initial'>('initial')
  const [systemPicture, setSystemPicture] = useState<string | null>(null)

  // Load OS username and system picture on mount
  useEffect(() => {
    window.sorcerer.system.userInfo().then((info: { username: string }) => {
      setOsUsername(info.username.charAt(0).toUpperCase() + info.username.slice(1))
    })
    window.sorcerer.system.accountPicture().then((pic: string | null) => {
      if (pic) setSystemPicture(pic)
    })
  }, [])

  // Resolve avatar preview whenever email or system picture changes
  useEffect(() => {
    if (email) {
      const url = gravatarUrl(email, 128)
      const img = new Image()
      img.onload = () => {
        setAvatarPreview(url)
        setAvatarSource('gravatar')
      }
      img.onerror = () => {
        if (systemPicture) {
          setAvatarPreview(systemPicture)
          setAvatarSource('system')
        } else {
          setAvatarPreview(null)
          setAvatarSource('initial')
        }
      }
      img.src = url
    } else if (systemPicture) {
      setAvatarPreview(systemPicture)
      setAvatarSource('system')
    } else {
      setAvatarPreview(null)
      setAvatarSource('initial')
    }
  }, [email, systemPicture])

  const resolvedName = displayName || osUsername
  const initial = resolvedName.charAt(0).toUpperCase()

  const handleSave = () => {
    // Notify SidebarFooter to re-fetch
    window.dispatchEvent(new CustomEvent('sorcerer:profile-updated'))
    addToast('Profile updated', 'success')
  }

  return (
    <>
      <SectionTitle>Avatar</SectionTitle>
      <div className="profile-avatar-section">
        <div className="profile-avatar-preview">
          {avatarPreview ? (
            <img className="profile-avatar-img" src={avatarPreview} alt={resolvedName} />
          ) : (
            <div className="profile-avatar-initial">{initial}</div>
          )}
        </div>
        <div className="profile-avatar-info">
          <span className="profile-avatar-source">
            {avatarSource === 'gravatar' && 'Loaded from Gravatar'}
            {avatarSource === 'system' && 'Windows account picture'}
            {avatarSource === 'initial' && 'Using initial (no image found)'}
          </span>
          <span className="profile-avatar-hint">
            Set an email below to use your Gravatar, or your Windows account picture will be used automatically.
          </span>
        </div>
      </div>

      <SectionTitle>Identity</SectionTitle>
      <SettingRow label="Display name" description="Shown in the sidebar footer. Leave empty to use your system username.">
        <input
          className="settings-input"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          onBlur={handleSave}
          placeholder={osUsername}
        />
      </SettingRow>
      <SettingRow label="Email" description="Used to fetch your Gravatar profile picture.">
        <input
          className="settings-input"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onBlur={handleSave}
          placeholder="you@example.com"
          type="email"
        />
      </SettingRow>
    </>
  )
}

function SessionsTab() {
  const { addToast } = useToastStore()
  const [shell, setShell] = useSetting('shell', '')
  const [fontSize, setFontSize] = useSetting('terminalFontSize', '13')
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

      <SectionTitle>Terminal</SectionTitle>
      <SettingRow label="Font size" description="Font size for terminal text in pixels">
        <select
          className="settings-select"
          value={fontSize}
          onChange={(e) => {
            setFontSize(e.target.value)
            window.dispatchEvent(new CustomEvent('sorcerer:fontSizeChange', { detail: Number(e.target.value) }))
          }}
        >
          <option value="10">10</option>
          <option value="11">11</option>
          <option value="12">12</option>
          <option value="13">13</option>
          <option value="14">14</option>
          <option value="15">15</option>
          <option value="16">16</option>
          <option value="18">18</option>
          <option value="20">20</option>
        </select>
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
      <SettingRow label="Reset dismissed workspaces" description="Re-show orphaned workspace and agent banners you previously dismissed">
        <button
          className="settings-action-btn"
          type="button"
          onClick={async () => {
            await Promise.all([
              window.sorcerer.settings.set('dismissedWorkspaces', '[]'),
              window.sorcerer.settings.set('dismissedAgents', '[]')
            ])
            addToast('Dismissed items cleared — banner will re-scan on next load', 'success')
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
  profile: ProfileTab,
  sessions: SessionsTab,
  git: GitTab,
  general: GeneralTab
}

export function SettingsDialog() {
  const { activeDialog, dialogClosing, closeDialog } = useUIStore()
  const overlayRef = useRef<HTMLDivElement>(null)
  const [activeTab, setActiveTab] = useState<SettingsTab>('profile')

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
