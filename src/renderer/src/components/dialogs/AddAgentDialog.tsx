import { useState } from 'react'
import { Dialog, DialogField, DialogActions, DialogButton } from '../Dialog'
import { useUIStore } from '../../stores/useUIStore'
import { useAgentStore } from '../../stores/useAgentStore'
import { useSessionStore } from '../../stores/useSessionStore'
import { useToastStore } from '../../stores/useToastStore'
import { ChevronIcon } from '../icons'

export function AddAgentDialog() {
  const { activeDialog, closeDialog } = useUIStore()
  const { addAgent, startAgent } = useAgentStore()
  const { setActiveSession } = useSessionStore()
  const { addToast } = useToastStore()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [mission, setMission] = useState('')
  const [systemPrompt, setSystemPrompt] = useState('')
  const [mcpConfig, setMcpConfig] = useState('')
  const [bypassPermissions, setBypassPermissions] = useState(true)
  const [remoteControl, setRemoteControl] = useState(false)
  const [autoStart, setAutoStart] = useState(false)
  const [autoRestart, setAutoRestart] = useState(false)
  const [restartDelay, setRestartDelay] = useState('30')
  const [showAdvanced, setShowAdvanced] = useState(false)

  const open = activeDialog === 'add-agent'
  const isAutonomous = mission.trim().length > 0

  const handleClose = () => {
    setName('')
    setDescription('')
    setMission('')
    setSystemPrompt('')
    setMcpConfig('')
    setBypassPermissions(true)
    setRemoteControl(false)
    setAutoStart(false)
    setAutoRestart(false)
    setRestartDelay('30')
    setShowAdvanced(false)
    closeDialog()
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    const id = await addAgent({
      name: name.trim(),
      description: description.trim(),
      mission: mission.trim(),
      system_prompt: systemPrompt.trim(),
      mcp_config: mcpConfig.trim(),
      bypass_permissions: bypassPermissions,
      remote_control: remoteControl,
      auto_start: autoStart,
      auto_restart: autoRestart,
      restart_delay: parseInt(restartDelay) || 30
    })
    if (id) {
      await startAgent(id)
      setActiveSession(id)
      addToast(`Agent "${name.trim()}" created${isAutonomous ? ' — mission started' : ''}`, 'success')
    }
    handleClose()
  }

  return (
    <Dialog open={open} onClose={handleClose} title="New Agent">
      <form onSubmit={handleSubmit}>
        <DialogField label="Name">
          <input
            className="dialog-input"
            type="text"
            placeholder='e.g. "Sentry Monitor", "Email Assistant"'
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </DialogField>
        <DialogField label="Description">
          <input
            className="dialog-input"
            type="text"
            placeholder="What does this agent do? (optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </DialogField>

        <DialogField label="Mission">
          <textarea
            className="dialog-input dialog-textarea"
            placeholder="Give this agent a task to run autonomously...&#10;&#10;Leave empty for an interactive Claude Code session."
            value={mission}
            onChange={(e) => setMission(e.target.value)}
            rows={4}
          />
        </DialogField>

        {isAutonomous && (
          <div className="dialog-hint" style={{ marginBottom: 8 }}>
            This agent will run its mission autonomously using <span className="dialog-hint-mono">claude -p</span>.
          </div>
        )}

        <label className="dialog-checkbox">
          <input
            type="checkbox"
            checked={bypassPermissions}
            onChange={(e) => setBypassPermissions(e.target.checked)}
          />
          Auto-accept permissions
        </label>
        {!isAutonomous && (
          <label className="dialog-checkbox">
            <input
              type="checkbox"
              checked={remoteControl}
              onChange={(e) => setRemoteControl(e.target.checked)}
            />
            Enable Session Remote Control
          </label>
        )}
        {isAutonomous && (
          <>
            <label className="dialog-checkbox">
              <input
                type="checkbox"
                checked={autoStart}
                onChange={(e) => setAutoStart(e.target.checked)}
              />
              Auto-start when Sorcerer launches
            </label>
            <label className="dialog-checkbox">
              <input
                type="checkbox"
                checked={autoRestart}
                onChange={(e) => setAutoRestart(e.target.checked)}
              />
              Auto-restart when mission completes
            </label>
            {autoRestart && (
              <DialogField label="Restart delay (seconds)">
                <input
                  className="dialog-input"
                  type="number"
                  min="5"
                  max="3600"
                  value={restartDelay}
                  onChange={(e) => setRestartDelay(e.target.value)}
                  style={{ width: 100 }}
                />
              </DialogField>
            )}
          </>
        )}

        {!isAutonomous && (
          <div className="dialog-hint">
            A standalone Claude Code session — not tied to any git repo.
          </div>
        )}

        {/* Collapsible advanced options */}
        <button
          type="button"
          className="dialog-advanced-toggle"
          onClick={() => setShowAdvanced(!showAdvanced)}
        >
          <ChevronIcon className={`dialog-advanced-chevron ${showAdvanced ? 'dialog-advanced-chevron--open' : ''}`} />
          <span>Configure MCP &amp; System Prompt</span>
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
              <div className="dialog-hint" style={{ marginTop: 4, marginBottom: 0 }}>
                Connect external tools via Model Context Protocol servers.
              </div>
            </DialogField>
            <DialogField label="System Prompt">
              <textarea
                className="dialog-input dialog-textarea"
                placeholder="Custom instructions for this agent..."
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                rows={4}
              />
              <div className="dialog-hint" style={{ marginTop: 4, marginBottom: 0 }}>
                Appended to Claude's system prompt via <span className="dialog-hint-mono">--append-system-prompt</span>.
              </div>
            </DialogField>
          </div>
        )}

        <DialogActions>
          <DialogButton onClick={handleClose}>Cancel</DialogButton>
          <DialogButton variant="primary" type="submit">
            {isAutonomous ? 'Create & Start Mission' : 'Create Agent'}
          </DialogButton>
        </DialogActions>
      </form>
    </Dialog>
  )
}
