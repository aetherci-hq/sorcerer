import { useUIStore } from '../stores/useUIStore'

export function EmptyState() {
  const { openDialog } = useUIStore()

  return (
    <div className="empty-state">
      <div className="empty-state-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
          <line x1="12" y1="11" x2="12" y2="17" />
          <line x1="9" y1="14" x2="15" y2="14" />
        </svg>
      </div>
      <p className="empty-state-title">No projects yet</p>
      <p className="empty-state-text">Add a project to start orchestrating AI agent sessions.</p>
      <button
        className="empty-state-btn"
        onClick={() => openDialog('add-project')}
      >
        Add your first project
      </button>
    </div>
  )
}
