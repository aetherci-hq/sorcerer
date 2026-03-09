import React, { useState, useRef, useEffect } from 'react'
import { getApi, isElectron } from '../../api/client'
import { useUIStore } from '../../stores/useUIStore'
import { useToastStore } from '../../stores/useToastStore'
import {
  TerminalIcon, GitBranchIcon, SettingsIcon, UserIcon, WifiIcon, CopyIcon, RefreshIcon, EyeIcon, EyeOffIcon, PaletteIcon
} from '../icons'
import { THEMES, getThemeById, applyTheme } from '../../themes'
import { gravatarUrl } from '../SidebarFooter'

type SettingsTab = 'profile' | 'appearance' | 'sessions' | 'git' | 'remote' | 'general'

const TABS: { id: SettingsTab; label: string; icon: React.ReactNode }[] = [
  { id: 'profile', label: 'Profile', icon: <UserIcon /> },
  { id: 'appearance', label: 'Appearance', icon: <PaletteIcon /> },
  { id: 'sessions', label: 'Sessions', icon: <TerminalIcon /> },
  { id: 'git', label: 'Git', icon: <GitBranchIcon /> },
  { id: 'remote', label: 'Remote', icon: <WifiIcon /> },
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
    getApi().settings.get(key).then((v: string | undefined) => {
      if (v !== undefined) setValue(v)
    })
  }, [key])
  const save = (v: string) => {
    setValue(v)
    getApi().settings.set(key, v)
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
    getApi().system.userInfo().then((info: { username: string }) => {
      setOsUsername(info.username.charAt(0).toUpperCase() + info.username.slice(1))
    })
    getApi().system.accountPicture().then((pic: string | null) => {
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
          {isElectron && (
            <button
              className="settings-browse-btn"
              type="button"
              onClick={async () => {
                const result = await getApi().project.add()
                if (result) {
                  setShell(result.path)
                  addToast('Shell setting saved', 'success')
                }
              }}
            >
              Browse
            </button>
          )}
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
          {isElectron && (
            <button className="settings-browse-btn" type="button" onClick={async () => {
              const result = await getApi().project.add()
              if (result) setWorktreeBase(result.path)
            }}>Browse</button>
          )}
        </div>
      </SettingRow>
    </>
  )
}

function RemoteTab() {
  const { addToast } = useToastStore()
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [port, setPort] = useState('7437')
  const [bindAddress, setBindAddress] = useState('127.0.0.1')
  const [token, setToken] = useState('')
  const [tokenVisible, setTokenVisible] = useState(false)
  const [toggling, setToggling] = useState(false)

  const fetchStatus = async () => {
    try {
      const status = await getApi().remote.status()
      setRunning(status.running)
      setPort(status.port)
      setBindAddress(status.bindAddress)
      setToken(status.token)
    } catch {
      // remote API may not be available
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchStatus() }, [])

  const handleToggle = async (enable: boolean) => {
    setToggling(true)
    try {
      if (enable) {
        // Save config before enabling
        await getApi().remote.updateConfig({
          port: parseInt(port),
          bindAddress
        })
        const result = await getApi().remote.enable()
        setRunning(true)
        setToken(result.token)
        addToast(`Remote access started on ${result.bindAddress}:${result.port}`, 'success')
      } else {
        await getApi().remote.disable()
        setRunning(false)
        addToast('Remote access stopped', 'success')
      }
    } catch (err: any) {
      addToast(`Failed to ${enable ? 'start' : 'stop'} remote access: ${err.message}`, 'error')
    } finally {
      setToggling(false)
    }
  }

  const handleRegenerate = async () => {
    try {
      const newToken = await getApi().remote.regenerateToken()
      setToken(newToken)
      addToast('Auth token regenerated', 'success')
    } catch (err: any) {
      addToast(`Failed to regenerate token: ${err.message}`, 'error')
    }
  }

  const handleCopyToken = () => {
    navigator.clipboard.writeText(token)
    addToast('Token copied to clipboard', 'success')
  }

  const accessUrl = `http://${bindAddress === '0.0.0.0' ? 'localhost' : bindAddress}:${port}`

  const handleCopyUrl = () => {
    navigator.clipboard.writeText(accessUrl)
    addToast('URL copied to clipboard', 'success')
  }

  if (loading) {
    return <div className="settings-row"><span className="settings-row-label">Loading...</span></div>
  }

  return (
    <>
      <SectionTitle>Server</SectionTitle>

      <SettingRow label="Enable remote access" description="Start an HTTP API server for browser-based access">
        <Toggle checked={running} onChange={handleToggle} />
      </SettingRow>

      {running && (
        <div className="settings-remote-preview">
          <div className="settings-remote-preview-header">
            <span className="settings-status-dot" />
            <span>Server running</span>
          </div>
          <div className="settings-remote-preview-url-row">
            <code className="settings-remote-preview-url">{accessUrl}</code>
            <button className="settings-copy-inline-btn" type="button" onClick={handleCopyUrl} title="Copy URL">
              <CopyIcon style={{ width: 13, height: 13 }} />
            </button>
          </div>
          <span className="settings-remote-preview-hint">
            Open this URL in any browser on your network to access Sorcerer remotely.
          </span>
        </div>
      )}

      <SectionTitle>Configuration</SectionTitle>
      <SettingRow label="Port" description="Port the API server listens on">
        <input
          className="settings-input"
          value={port}
          onChange={(e) => setPort(e.target.value)}
          onBlur={() => getApi().remote.updateConfig({ port: parseInt(port) })}
          disabled={running}
          type="number"
          min={1024}
          max={65535}
          style={{ width: 100 }}
        />
      </SettingRow>
      <SettingRow label="Bind address" description="Network interface to listen on (127.0.0.1 = local only, 0.0.0.0 = all)">
        <select
          className="settings-select"
          value={bindAddress}
          onChange={(e) => {
            setBindAddress(e.target.value)
            getApi().remote.updateConfig({ bindAddress: e.target.value })
          }}
          disabled={running}
        >
          <option value="127.0.0.1">127.0.0.1 (localhost only)</option>
          <option value="0.0.0.0">0.0.0.0 (all interfaces)</option>
        </select>
      </SettingRow>

      <SectionTitle>Authentication</SectionTitle>
      <SettingRow label="Auth token" description="Bearer token required for all API requests">
        <div className="settings-path-row">
          <input
            className="settings-input settings-input--path"
            value={tokenVisible ? token : (token ? '\u2022'.repeat(24) : '(none)')}
            readOnly
            style={{ fontFamily: tokenVisible ? 'monospace' : 'inherit' }}
          />
          <button
            className="settings-browse-btn"
            type="button"
            onClick={() => setTokenVisible(!tokenVisible)}
            title={tokenVisible ? 'Hide token' : 'Show token'}
          >
            {tokenVisible ? <EyeOffIcon style={{ width: 14, height: 14 }} /> : <EyeIcon style={{ width: 14, height: 14 }} />}
          </button>
          <button
            className="settings-browse-btn"
            type="button"
            onClick={handleCopyToken}
            title="Copy token"
          >
            <CopyIcon style={{ width: 14, height: 14 }} />
          </button>
          <button
            className="settings-browse-btn"
            type="button"
            onClick={handleRegenerate}
            title="Regenerate token"
          >
            <RefreshIcon style={{ width: 14, height: 14 }} />
          </button>
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
              getApi().settings.set('dismissedWorkspaces', '[]'),
              getApi().settings.set('dismissedAgents', '[]')
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

      <SectionTitle>About</SectionTitle>
      <SettingRow label="Version" description="Sorcerer">
        <span className="settings-version">{__APP_VERSION__}</span>
      </SettingRow>
    </>
  )
}

function AppearanceTab() {
  const [themeId, setThemeId] = useSetting('theme', 'default')
  const themes = Object.values(THEMES)

  const selectTheme = (id: string) => {
    setThemeId(id)
    applyTheme(getThemeById(id))
  }

  return (
    <>
      <SectionTitle>Theme</SectionTitle>
      <div className="theme-selector">
        {themes.map((theme) => (
          <button
            key={theme.id}
            className={`theme-option ${themeId === theme.id ? 'theme-option--active' : ''}`}
            onClick={() => selectTheme(theme.id)}
            type="button"
          >
            <div className="theme-option-swatches">
              <span className="theme-option-swatch" style={{ background: theme.colors['bg-root'] }} title="Background" />
              <span className="theme-option-swatch" style={{ background: theme.colors['bg-sidebar'] }} title="Sidebar" />
              <span className="theme-option-swatch" style={{ background: theme.colors['accent'] }} title="Accent" />
              <span className="theme-option-swatch" style={{ background: theme.colors['text-primary'] }} title="Text" />
            </div>
            <div className="theme-option-info">
              <span className="theme-option-name">{theme.name}</span>
            </div>
          </button>
        ))}
      </div>
    </>
  )
}

const TAB_CONTENT: Record<SettingsTab, () => React.JSX.Element> = {
  profile: ProfileTab,
  appearance: AppearanceTab,
  sessions: SessionsTab,
  git: GitTab,
  remote: RemoteTab,
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
