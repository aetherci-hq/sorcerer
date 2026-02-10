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
  const [systemPrompt, setSystemPrompt] = useState('')
  const [mcpConfig, setMcpConfig] = useState('')
  const [showAdvanced, setShowAdvanced] = useState(false)

  const open = activeDialog === 'add-agent'

  const handleClose = () => {
    setName('')
    setDescription('')
    setSystemPrompt('')
    setMcpConfig('')
    setShowAdvanced(false)
    closeDialog()
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    const id = await addAgent({
      name: name.trim(),
      description: description.trim(),
      system_prompt: systemPrompt.trim(),
      mcp_config: mcpConfig.trim()
    })
    if (id) {
      await startAgent(id)
      setActiveSession(id)
      addToast(`Agent "${name.trim()}" created`, 'success')
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
            placeholder='e.g. "Email Assistant", "DevOps Manager"'
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
        <div className="dialog-hint">
          A standalone Claude Code session — not tied to any git repo.
        </div>

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
          <DialogButton variant="primary" type="submit">Create Agent</DialogButton>
        </DialogActions>
      </form>
    </Dialog>
  )
}
