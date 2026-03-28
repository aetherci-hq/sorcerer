import { useState, useEffect } from 'react'
import { Dialog, DialogField, DialogActions, DialogButton } from '../Dialog'
import { getApi } from '../../api/client'
import { useUIStore } from '../../stores/useUIStore'
import { useAgentStore } from '../../stores/useAgentStore'
import { useToastStore } from '../../stores/useToastStore'
import { ChevronIcon } from '../icons'

export function EditMissionDialog() {
  const { activeDialog, dialogTargetId, closeDialog } = useUIStore()
  const agents = useAgentStore((s) => s.agents)
  const { addToast } = useToastStore()
  const [mission, setMission] = useState('')
  const [scheduleMinutes, setScheduleMinutes] = useState('0')
  const [autoStart, setAutoStart] = useState(false)
  const [systemPrompt, setSystemPrompt] = useState('')
  const [mcpConfig, setMcpConfig] = useState('')
  const [bypassPermissions, setBypassPermissions] = useState(true)
  const [showAdvanced, setShowAdvanced] = useState(false)

  const open = activeDialog === 'edit-agent-mission'
  const agent = agents.find((a) => a.id === dialogTargetId)

  useEffect(() => {
    if (open && agent) {
      setMission(agent.mission || '')
      setScheduleMinutes(String(agent.schedule_minutes || 0))
      setAutoStart(agent.auto_start === 1)
      setSystemPrompt(agent.system_prompt || '')
      setMcpConfig(agent.mcp_config || '')
      setBypassPermissions(agent.bypass_permissions !== 0)
      setShowAdvanced(!!(agent.system_prompt || agent.mcp_config))
    }
  }, [open, agent])

  const handleClose = () => {
    setShowAdvanced(false)
    closeDialog()
  }

  const handleSave = async () => {
    if (!dialogTargetId) return
    const updates: any = {
      mission: mission.trim(),
      schedule_minutes: parseInt(scheduleMinutes) || 0,
      auto_start: autoStart ? 1 : 0,
      auto_restart: parseInt(scheduleMinutes) > 0 ? 1 : 0,
      system_prompt: systemPrompt.trim(),
      mcp_config: mcpConfig.trim(),
      bypass_permissions: bypassPermissions ? 1 : 0
    }
    await getApi().agent.update(dialogTargetId, updates)
    useAgentStore.getState().updateAgentInStore(dialogTargetId, updates)
    addToast('Agent settings updated', 'success')
    handleClose()
  }

  if (!open || !agent) return null

  const hasMission = mission.trim().length > 0

  return (
    <Dialog open={open} onClose={handleClose} title={`Edit Agent — ${agent.name}`}>
      <DialogField label="Mission">
        <textarea
          className="dialog-input dialog-textarea"
          placeholder="Describe what this agent should do...&#10;&#10;Leave empty for an interactive session."
          value={mission}
          onChange={(e) => setMission(e.target.value)}
          rows={5}
          autoFocus
        />
      </DialogField>

      {hasMission && (
        <>
          <DialogField label="Run Schedule">
            <select
              className="dialog-input"
              value={scheduleMinutes}
              onChange={(e) => setScheduleMinutes(e.target.value)}
              style={{ width: 200 }}
            >
              <option value="0">Run once (manual)</option>
              <option value="5">Every 5 minutes</option>
              <option value="15">Every 15 minutes</option>
              <option value="30">Every 30 minutes</option>
              <option value="60">Every hour</option>
              <option value="120">Every 2 hours</option>
              <option value="360">Every 6 hours</option>
              <option value="720">Every 12 hours</option>
              <option value="1440">Daily</option>
            </select>
          </DialogField>
          <label className="dialog-checkbox">
            <input type="checkbox" checked={autoStart} onChange={(e) => setAutoStart(e.target.checked)} />
            Auto-start when Sorcerer launches
          </label>
        </>
      )}

      <label className="dialog-checkbox">
        <input type="checkbox" checked={bypassPermissions} onChange={(e) => setBypassPermissions(e.target.checked)} />
        Auto-accept permissions
      </label>

      <button
        type="button"
        className="dialog-advanced-toggle"
        onClick={() => setShowAdvanced(!showAdvanced)}
      >
        <ChevronIcon className={`dialog-advanced-chevron ${showAdvanced ? 'dialog-advanced-chevron--open' : ''}`} />
        <span>MCP &amp; System Prompt</span>
      </button>

      {showAdvanced && (
        <div className="dialog-advanced-body">
          <DialogField label="MCP Config">
            <input
              className="dialog-input"
              type="text"
              placeholder="Path to mcp-config.json"
              value={mcpConfig}
              onChange={(e) => setMcpConfig(e.target.value)}
            />
          </DialogField>
          <DialogField label="System Prompt">
            <textarea
              className="dialog-input dialog-textarea"
              placeholder="Custom instructions appended to Claude's system prompt..."
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              rows={4}
            />
          </DialogField>
        </div>
      )}

      <div className="dialog-hint">
        {hasMission ? 'Changes take effect on the next scheduled run.' : 'Clearing the mission converts this to an interactive agent.'}
      </div>
      <DialogActions>
        <DialogButton onClick={handleClose}>Cancel</DialogButton>
        <DialogButton variant="primary" onClick={handleSave}>Save</DialogButton>
      </DialogActions>
    </Dialog>
  )
}
