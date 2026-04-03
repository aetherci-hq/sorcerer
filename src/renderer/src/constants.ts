export const PROVIDERS = [
  {
    id: 'claude',
    name: 'Claude Code',
    apiKeyEnv: 'ANTHROPIC_API_KEY',
    models: ['claude-sonnet-4-6', 'claude-opus-4-6', 'claude-haiku-4-5', 'claude-3-7-sonnet-latest', 'claude-3-5-sonnet-latest']
  },
  {
    id: 'gemini',
    name: 'Gemini CLI',
    apiKeyEnv: 'GEMINI_API_KEY',
    models: ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.5-flash-lite']
  },
  {
    id: 'codex',
    name: 'Codex CLI',
    apiKeyEnv: 'OPENAI_API_KEY',
    models: ['o4-mini', 'o3', 'gpt-4.1', 'gpt-4o']
  },
  {
    id: 'opencode',
    name: 'OpenCode',
    apiKeyEnv: null,
    models: ['anthropic/claude-sonnet-4-6', 'anthropic/claude-opus-4-6', 'google/gemini-2.5-pro', 'google/gemini-2.5-flash', 'openai/gpt-4.1', 'openai/o4-mini', 'openai/o3']
  }
]
