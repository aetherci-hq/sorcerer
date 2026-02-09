import React, { useState, useEffect } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { useProjectStore } from '../stores/project-store'
import type { Project } from '../types'

interface SettingsDialogProps {
  onClose: () => void
}

export function SettingsDialog({ onClose }: SettingsDialogProps) {
  const [activeTab, setActiveTab] = useState<'general' | 'projects'>('general')
  const [fontSize, setFontSize] = useState('13')
  const [shell, setShell] = useState('')

  useEffect(() => {
    window.sorcerer.settings.get('fontSize').then((v) => { if (v) setFontSize(v) })
    window.sorcerer.settings.get('shell').then((v) => { if (v) setShell(v) })
  }, [])

  const saveGeneral = async () => {
    await window.sorcerer.settings.set('fontSize', fontSize)
    if (shell) await window.sorcerer.settings.set('shell', shell)
    onClose()
  }

  const tabs = [
    { id: 'general' as const, label: 'General' },
    { id: 'projects' as const, label: 'Projects' },
  ]

  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content w-[540px] max-h-[70vh] flex flex-col p-0">
          <div className="px-7 pt-7 pb-0">
            <Dialog.Title className="text-base font-semibold text-[var(--text-primary)]">
              Settings
            </Dialog.Title>
          </div>

          {/* Tabs */}
          <div className="flex gap-0 px-7 pt-5 border-b border-[var(--border)]">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`text-[13px] pb-3 px-1 mr-6 border-b-2 transition-colors font-medium ${
                  activeTab === tab.id
                    ? 'border-[var(--accent)] text-[var(--text-primary)]'
                    : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-7 py-6">
            {activeTab === 'general' && (
              <GeneralSettings fontSize={fontSize} setFontSize={setFontSize} shell={shell} setShell={setShell} />
            )}
            {activeTab === 'projects' && <ProjectSettings />}
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 px-7 py-5 border-t border-[var(--border)]">
            <button onClick={onClose} className="btn-ghost">
              Cancel
            </button>
            {activeTab === 'general' && (
              <button onClick={saveGeneral} className="btn-primary">
                Save
              </button>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function GeneralSettings({
  fontSize, setFontSize, shell, setShell
}: {
  fontSize: string; setFontSize: (v: string) => void
  shell: string; setShell: (v: string) => void
}) {
  return (
    <div className="space-y-6">
      <div>
        <label className="form-label">Terminal Font Size</label>
        <input
          type="number"
          min="8"
          max="24"
          value={fontSize}
          onChange={(e) => setFontSize(e.target.value)}
          className="form-input w-28"
        />
      </div>
      <div>
        <label className="form-label">Shell</label>
        <input
          type="text"
          value={shell}
          onChange={(e) => setShell(e.target.value)}
          placeholder="Leave empty for default"
          className="form-input"
        />
        <p className="text-[11px] text-[var(--text-faint)] mt-2">
          e.g. pwsh.exe, bash, wsl.exe
        </p>
      </div>
    </div>
  )
}

function ProjectSettings() {
  const projects = useProjectStore((s) => s.projects)
  const updateProject = useProjectStore((s) => s.updateProject)

  return (
    <div className="space-y-4">
      {projects.length === 0 ? (
        <p className="text-xs text-[var(--text-muted)] py-4">No projects configured yet.</p>
      ) : (
        projects.map((project) => (
          <ProjectSettingItem key={project.id} project={project} onUpdate={updateProject} />
        ))
      )}
    </div>
  )
}

function ProjectSettingItem({
  project,
  onUpdate
}: {
  project: Project
  onUpdate: (id: string, updates: Partial<Project>) => Promise<void>
}) {
  const [setupScript, setSetupScript] = useState(project.setup_script || '')
  const [saved, setSaved] = useState(false)

  const handleSave = async () => {
    await onUpdate(project.id, { setup_script: setupScript || null } as any)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="p-5 bg-[var(--bg-primary)] rounded-lg border border-[var(--border)]">
      <div className="flex items-center justify-between mb-4">
        <span className="text-[13px] font-semibold text-[var(--text-primary)]">{project.name}</span>
        <span className="text-[11px] font-mono text-[var(--text-faint)] truncate ml-4 max-w-[220px]">{project.path}</span>
      </div>
      <label className="form-label">
        Setup Script
      </label>
      <textarea
        value={setupScript}
        onChange={(e) => setSetupScript(e.target.value)}
        placeholder="e.g. npm install && npm run dev"
        rows={2}
        className="form-input font-mono text-xs resize-none"
      />
      <p className="text-[11px] text-[var(--text-faint)] mt-2 mb-4">
        Runs when a new session starts in this project.
      </p>
      <div className="flex justify-end">
        <button
          onClick={handleSave}
          className={`btn-primary ${saved ? 'bg-[var(--status-active)]' : ''}`}
        >
          {saved ? 'Saved' : 'Save'}
        </button>
      </div>
    </div>
  )
}
