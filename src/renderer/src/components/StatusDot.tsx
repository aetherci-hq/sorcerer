import { Tooltip } from './Tooltip'

const statusClass: Record<string, string> = {
  active: 'status-dot status-dot--active',
  idle: 'status-dot status-dot--idle',
  archived: 'status-dot status-dot--archived',
  waiting: 'status-dot status-dot--waiting',
  starting: 'status-dot status-dot--starting',
  deleted: 'status-dot status-dot--archived'
}

const statusLabel: Record<string, string> = {
  active: 'Active',
  idle: 'Idle',
  archived: 'Archived',
  waiting: 'Waiting',
  starting: 'Starting',
  deleted: 'Deleted'
}

export function StatusDot({ status }: { status: string }) {
  return (
    <Tooltip label={statusLabel[status] || status}>
      <span className={statusClass[status] || 'status-dot status-dot--idle'} />
    </Tooltip>
  )
}
