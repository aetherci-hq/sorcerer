import { Tooltip } from './Tooltip'

const statusLabel: Record<string, string> = {
  active: 'Active',
  idle: 'Idle',
  archived: 'Archived',
  waiting: 'Waiting',
  starting: 'Starting',
  deleted: 'Deleted'
}

function signalClass(status: string): string {
  switch (status) {
    case 'active':
    case 'idle':
    case 'waiting':
    case 'starting':
    case 'archived':
      return status
    case 'deleted':
      return 'archived'
    default:
      return 'idle'
  }
}

export function StatusDot({ status }: { status: string }) {
  const variant = signalClass(status)
  const needsRing = variant === 'active'

  return (
    <Tooltip label={statusLabel[status] || status}>
      <span className={`signal signal--${variant}`}>
        <span className="signal-core" />
        {needsRing && <span className="signal-ring" />}
      </span>
    </Tooltip>
  )
}
