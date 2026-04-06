import os from 'os'
import path from 'path'
import fs from 'fs'

export interface ProviderRunner {
  id: string
  name: string
  resolveBinary(): string
  getArgs(data: {
    mission?: string
    systemPrompt?: string
    mcpConfig?: string
    bypassPermissions?: boolean
    hasHistory?: boolean
    model?: string
  }): string[]
  getEnv(id: string): Record<string, string>
}

export class ClaudeRunner implements ProviderRunner {
  id = 'claude'
  name = 'Claude Code'

  private _binary: string | null = null

  resolveBinary(): string {
    if (this._binary) return this._binary

    const home = os.homedir()
    const candidates =
      os.platform() === 'win32'
        ? [
            path.join(home, '.local', 'bin', 'claude.exe'),
            path.join(home, 'AppData', 'Roaming', 'npm', 'claude.cmd'),
            path.join(home, 'AppData', 'Roaming', 'npm', 'claude')
          ]
        : [
            path.join(home, '.local', 'bin', 'claude'),
            '/usr/local/bin/claude',
            path.join(home, '.npm-global', 'bin', 'claude')
          ]

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        this._binary = candidate
        return candidate
      }
    }

    this._binary = 'claude'
    return 'claude'
  }

  getArgs(data: {
    mission?: string
    systemPrompt?: string
    mcpConfig?: string
    bypassPermissions?: boolean
    hasHistory?: boolean
    model?: string
  }): string[] {
    const args: string[] = []
    if (data.bypassPermissions) args.push('--dangerously-skip-permissions')
    if (data.mcpConfig) args.push('--mcp-config', data.mcpConfig)
    if (data.systemPrompt) args.push('--append-system-prompt', data.systemPrompt)
    if (data.model) args.push('--model', data.model)

    // hasHistory: used by the orchestrator to --continue the last conversation,
    // then write the mission as input. For session flows, --resume/--session-id
    // are pushed directly by the caller — do not pass hasHistory there.
    if (data.hasHistory) {
      args.push('--continue')
    } else if (data.mission) {
      args.push('-p', data.mission)
    }

    return args
  }

  getEnv(id: string): Record<string, string> {
    return {
      CLAUDE_CODE_TASK_LIST_ID: id
    }
  }
}

export class GeminiRunner implements ProviderRunner {
  id = 'gemini'
  name = 'Gemini CLI'

  private _binary: string | null = null

  resolveBinary(): string {
    if (this._binary) return this._binary

    const home = os.homedir()
    const candidates =
      os.platform() === 'win32'
        ? [
            path.join(home, '.local', 'bin', 'gemini.exe'),
            path.join(home, 'AppData', 'Roaming', 'npm', 'gemini.cmd'),
            path.join(home, 'AppData', 'Roaming', 'npm', 'gemini')
          ]
        : [
            path.join(home, '.local', 'bin', 'gemini'),
            '/usr/local/bin/gemini',
            path.join(home, '.npm-global', 'bin', 'gemini')
          ]

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        this._binary = candidate
        return candidate
      }
    }

    this._binary = 'gemini'
    return 'gemini'
  }

  getArgs(data: {
    mission?: string
    systemPrompt?: string
    mcpConfig?: string
    bypassPermissions?: boolean
    hasHistory?: boolean
    model?: string
  }): string[] {
    const args: string[] = []
    // --yolo auto-accepts all tool calls, equivalent to --dangerously-skip-permissions
    if (data.bypassPermissions) args.push('--yolo')
    if (data.model) args.push('--model', data.model)

    // Gemini CLI has no session resume — hasHistory is ignored
    if (data.mission) {
      args.push('-p', data.mission)
    }

    // systemPrompt: Gemini CLI has no --append-system-prompt equivalent.
    // Users should configure system prompts via GEMINI_SYSTEM_PROMPT env var or gemini config.

    return args
  }

  getEnv(_id: string): Record<string, string> {
    return {}
  }
}

export class CodexRunner implements ProviderRunner {
  id = 'codex'
  name = 'Codex CLI'

  private _binary: string | null = null

  resolveBinary(): string {
    if (this._binary) return this._binary

    const home = os.homedir()
    const candidates =
      os.platform() === 'win32'
        ? [
            path.join(home, '.local', 'bin', 'codex.exe'),
            path.join(home, 'AppData', 'Roaming', 'npm', 'codex.cmd'),
            path.join(home, 'AppData', 'Roaming', 'npm', 'codex')
          ]
        : [
            path.join(home, '.local', 'bin', 'codex'),
            '/usr/local/bin/codex',
            path.join(home, '.npm-global', 'bin', 'codex')
          ]

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        this._binary = candidate
        return candidate
      }
    }

    this._binary = 'codex'
    return 'codex'
  }

  getArgs(data: {
    mission?: string
    systemPrompt?: string
    mcpConfig?: string
    bypassPermissions?: boolean
    hasHistory?: boolean
    model?: string
  }): string[] {
    const args: string[] = []
    // Closest equivalent to Claude's --dangerously-skip-permissions:
    // skip approvals and disable sandboxing for unattended runs.
    if (data.bypassPermissions) args.push('--dangerously-bypass-approvals-and-sandbox')
    if (data.model) args.push('--model', data.model)

    // Codex CLI has no session resume — hasHistory is ignored
    if (data.mission) {
      args.push(data.mission)
    }

    return args
  }

  getEnv(_id: string): Record<string, string> {
    return {}
  }
}

export class OpenCodeRunner implements ProviderRunner {
  id = 'opencode'
  name = 'OpenCode'

  private _binary: string | null = null

  resolveBinary(): string {
    if (this._binary) return this._binary

    const home = os.homedir()
    const candidates =
      os.platform() === 'win32'
        ? [
            path.join(home, 'AppData', 'Roaming', 'npm', 'opencode.cmd'),
            path.join(home, 'AppData', 'Roaming', 'npm', 'opencode'),
            path.join(home, '.local', 'bin', 'opencode.exe')
          ]
        : [
            path.join(home, '.local', 'bin', 'opencode'),
            '/usr/local/bin/opencode',
            path.join(home, '.npm-global', 'bin', 'opencode')
          ]

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        this._binary = candidate
        return candidate
      }
    }

    this._binary = 'opencode'
    return 'opencode'
  }

  getArgs(data: {
    mission?: string
    systemPrompt?: string
    mcpConfig?: string
    bypassPermissions?: boolean
    hasHistory?: boolean
    model?: string
  }): string[] {
    if (data.mission) {
      // Non-interactive: `opencode run [--model m] <message>`
      const args: string[] = ['run']
      if (data.model) args.push('--model', data.model)
      args.push(data.mission)
      return args
    }

    // Interactive TUI: `opencode [--model m]`
    const args: string[] = []
    if (data.model) args.push('--model', data.model)

    // OpenCode has no session resume flag — hasHistory, systemPrompt, mcpConfig
    // are managed via opencode's own project config, not CLI flags.

    return args
  }

  getEnv(_id: string): Record<string, string> {
    return {}
  }
}

const runners: ProviderRunner[] = [
  new ClaudeRunner(),
  new GeminiRunner(),
  new CodexRunner(),
  new OpenCodeRunner()
]

export function getProviderRunner(id: string): ProviderRunner {
  return runners.find((r) => r.id === id) || runners[0]
}
