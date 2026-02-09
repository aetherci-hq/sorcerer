import { SettingsIcon } from './icons'
import { useSessionStore } from '../stores/useSessionStore'
import { useUIStore } from '../stores/useUIStore'

export function SidebarFooter({ collapsed }: { collapsed: boolean }) {
  const sessions = useSessionStore((s) => s.sessions)
  const openDialog = useUIStore((s) => s.openDialog)

  const activeCount = sessions.filter((s) => s.status === 'active').length

  if (collapsed) {
    return (
      <div className="sidebar-footer sidebar-footer--collapsed stagger-10">
        <button className="footer-settings-btn" onClick={() => openDialog('settings')}>
          <SettingsIcon />
        </button>
      </div>
    )
  }

  return (
    <div className="sidebar-footer stagger-10">
      <div className="user-avatar">J</div>
      <div className="user-info">
        <div className="user-name">Joe</div>
        <div className="user-status">
          <span className="user-status-dot" />
          {activeCount} session{activeCount !== 1 ? 's' : ''} active
        </div>
      </div>
      <button className="footer-settings-btn" onClick={() => openDialog('settings')}>
        <SettingsIcon />
      </button>
    </div>
  )
}
