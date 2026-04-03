import { useState, useEffect } from 'react'
import { Dialog, DialogField, DialogActions, DialogButton } from '../Dialog'
import { getApi } from '../../api/client'
import { useUIStore } from '../../stores/useUIStore'
import { useAgentStore } from '../../stores/useAgentStore'
import { useSessionStore } from '../../stores/useSessionStore'
import { useToastStore } from '../../stores/useToastStore'
import { ChevronIcon, BotIcon, TerminalIcon } from '../icons'
import { PROVIDERS } from '../../constants'

type AgentMode = null | 'interactive' | 'autonomous'

export function AddAgentDialog() {
  const { activeDialog, closeDialog } = useUIStore()
  const { addAgent, startAgent } = useAgentStore()
  const { setActiveSession } = useSessionStore()
  const { addToast } = useToastStore()
  const [mode, setMode] = useState<AgentMode>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [mission, setMission] = useState('')
  const [systemPrompt, setSystemPrompt] = useState('')
  const [mcpConfig, setMcpConfig] = useState('')
  const [bypassPermissions, setBypassPermissions] = useState(true)
  const [remoteControl, setRemoteControl] = useState(false)
  const [autoStart, setAutoStart] = useState(false)
  const [scheduleMinutes, setScheduleMinutes] = useState('0')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [provider, setProvider] = useState('claude')
  const [model, setModel] = useState(PROVIDERS[0].models[0])

  const open = activeDialog === 'add-agent'

  // Load user defaults when dialog opens
  useEffect(() => {
    if (!open) return
    Promise.all([
      getApi().settings.get('defaultProvider'),
      getApi().settings.get('defaultModel')
    ]).then(([p, m]) => {
      const provId = (p as string) || 'claude'
      setProvider(provId)
      const prov = PROVIDERS.find((pr) => pr.id === provId)
      if (prov) {
        setModel((m as string) && prov.models.includes(m as string) ? (m as string) : prov.models[0])
      }
    })
  }, [open])

  // Reset model when provider changes and current model isn't valid for new provider
  useEffect(() => {
    const p = PROVIDERS.find(p => p.id === provider)
    if (p && !p.models.includes(model)) setModel(p.models[0])
  }, [provider])

  const handleClose = () => {
    setMode(null)
    setName('')
    setDescription('')
    setMission('')
    setSystemPrompt('')
    setMcpConfig('')
    setBypassPermissions(true)
    setRemoteControl(false)
    setAutoStart(false)
    setScheduleMinutes('0')
    setShowAdvanced(false)
    setProvider('claude')
    setModel(PROVIDERS[0].models[0])
    closeDialog()
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    if (mode === 'autonomous' && !mission.trim()) return
    const id = await addAgent({
      name: name.trim(),
      description: description.trim(),
      mission: mode === 'autonomous' ? mission.trim() : '',
      system_prompt: systemPrompt.trim(),
      mcp_config: mcpConfig.trim(),
      bypass_permissions: bypassPermissions,
      remote_control: mode === 'interactive' ? remoteControl : false,
      auto_start: mode === 'autonomous' ? autoStart : false,
      auto_restart: mode === 'autonomous' && parseInt(scheduleMinutes) > 0,
      schedule_minutes: mode === 'autonomous' ? parseInt(scheduleMinutes) || 0 : 0,
      provider,
      model
    })
    if (id) {
      await startAgent(id)
      setActiveSession(id)
      addToast(`Agent "${name.trim()}" created${mode === 'autonomous' ? ' — mission started' : ''}`, 'success')
    }
    handleClose()
  }

  if (!open) return null

  // Step 1: Choose mode
  if (!mode) {
    return (
      <Dialog open={open} onClose={handleClose} title="New Agent">
        <div className="dialog-hint" style={{ marginBottom: 12 }}>What kind of agent do you want to create?</div>
        <div className="agent-mode-picker">
          <button type="button" className="agent-mode-option" onClick={() => setMode('interactive')}>
            <TerminalIcon className="agent-mode-icon" />
            <div className="agent-mode-info">
              <span className="agent-mode-label">Interactive Session</span>
              <span className="agent-mode-desc">A standalone agent session you interact with directly. Not tied to any git repo.</span>
            </div>
          </button>
          <button type="button" className="agent-mode-option" onClick={() => setMode('autonomous')}>
            <BotIcon className="agent-mode-icon" />
            <div className="agent-mode-info">
              <span className="agent-mode-label">Scheduled Mission</span>
              <span className="agent-mode-desc">Runs a mission on a schedule — monitor, scan, report, or remediate. Results are captured and diffed between runs.</span>
            </div>
          </button>
        </div>
        <DialogActions>
          <DialogButton onClick={handleClose}>Cancel</DialogButton>
        </DialogActions>
      </Dialog>
    )
  }

  // Step 2: Configure agent
  return (
    <Dialog open={open} onClose={handleClose} title={mode === 'autonomous' ? 'New Scheduled Mission' : 'New Interactive Agent'}>
      <form onSubmit={handleSubmit}>
        {mode === 'autonomous' && (
          <div className="dialog-hint" style={{ marginBottom: 10, color: 'var(--accent)' }}>
            Scheduled missions are experimental. Start with longer intervals and monitor results before increasing frequency.
          </div>
        )}
        <DialogField label="Name">
          <input
            className="dialog-input"
            type="text"
            placeholder={mode === 'autonomous' ? 'e.g. "Sentry Monitor", "Email Responder"' : 'e.g. "Research Assistant", "Code Helper"'}
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </DialogField>
        
        <div style={{ display: 'flex', gap: 12 }}>
          <DialogField label="AI Provider" style={{ flex: 1 }}>
            <select
              className="dialog-input"
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
            >
              {PROVIDERS.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </DialogField>
          <DialogField label="Model" style={{ flex: 1 }}>
            <select
              className="dialog-input"
              value={model}
              onChange={(e) => setModel(e.target.value)}
            >
              {PROVIDERS.find(p => p.id === provider)?.models.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </DialogField>
        </div>
        {PROVIDERS.find(p => p.id === provider)?.apiKeyEnv && (
          <div className="dialog-hint" style={{ marginTop: 4 }}>
            Requires <code style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{PROVIDERS.find(p => p.id === provider)?.apiKeyEnv}</code> in your environment.
          </div>
        )}

        <DialogField label="Description">
          <input
            className="dialog-input"
            type="text"
            placeholder="What does this agent do? (optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </DialogField>

        {mode === 'autonomous' && (
          <>
            <DialogField label="Mission">
              <textarea
                className="dialog-input dialog-textarea"
                placeholder={"Describe what this agent should do...\\n\\ne.g. Monitor the Sentry project for new errors. Triage severity and investigate root causes. For critical errors, draft a fix."}
                value={mission}
                onChange={(e) => setMission(e.target.value)}
                rows={4}
              />
            </DialogField>
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
        {mode === 'interactive' && provider === 'claude' && (
          <label className="dialog-checkbox">
            <input type="checkbox" checked={remoteControl} onChange={(e) => setRemoteControl(e.target.checked)} />
            Enable Session Remote Control
          </label>
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
                Appended to agent's system prompt (if supported).
              </div>
            </DialogField>
          </div>
        )}

        <DialogActions>
          <DialogButton onClick={() => setMode(null)}>Back</DialogButton>
          <DialogButton variant="primary" type="submit">
            {mode === 'autonomous' ? 'Create & Start Mission' : 'Create Agent'}
          </DialogButton>
        </DialogActions>
      </form>
    </Dialog>
  )
}
