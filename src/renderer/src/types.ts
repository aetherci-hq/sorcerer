// ── Core domain types (flat, matching DB schema) ──────────────────

export interface Project {
  id: string
  name: string
  path: string
  setup_script?: string | null
  sort_order?: number
  group_id?: string | null
  created_at?: number
}

export interface ProjectGroup {
  id: string
  name: string
  sort_order: number
}

export interface Session {
  id: string
  project_id: string
  name: string
  branch: string
  worktree_path: string
  status: 'active' | 'idle' | 'archived' | 'deleted'
  type?: 'session' | 'quick-terminal'
  parent_session_id?: string | null
  agentId?: string
  team_name?: string | null
  bypass_permissions?: number
  remote_control?: number
  pid?: number | null
  created_at?: number
  started_at?: number | null
  archived_at?: number | null
  provider?: string
  model?: string
}

// ── Team / task types (from file watcher) ─────────────────────────

export interface TeamConfig {
  name: string
  description?: string
  members: TeamMember[]
}

export interface TeamMember {
  name: string
  agentType?: string
  status?: string
  activeTask?: string
}

export interface TaskData {
  id: string
  subject: string
  description: string
  activeForm?: string
  status: string
  owner?: string
  blocks: string[]
  blockedBy: string[]
}

// ── Agent (standalone AI CLI session) ─────────────────────────────

export interface Agent {
  id: string
  name: string
  description: string
  system_prompt: string
  mcp_config: string
  bypass_permissions: number
  remote_control: number
  mission: string
  auto_start: number
  auto_restart: number
  restart_delay: number
  max_restarts: number
  schedule_minutes: number
  last_run_at: number | null
  group_id?: string | null
  status: 'active' | 'idle' | 'archived'
  pid: number | null
  team_name: string | null
  created_at: number
  provider?: string
  model?: string
}

export interface AgentGroup {
  id: string
  name: string
  sort_order: number
}

// ── Quick Notes ────────────────────────────────────────────────────

export interface QuickNote {
  id: string
  parent_id: string
  parent_type: 'session' | 'agent'
  content: string
  created_at: number
  updated_at: number
}

// ── Split view — recursive binary tree ────────────────────────────

export type SplitLeaf = { type: 'leaf'; id: string; sessionId: string | null }
export type SplitBranch = { type: 'split'; id: string; direction: 'horizontal' | 'vertical'; ratio: number; children: [SplitNode, SplitNode] }
export type SplitNode = SplitLeaf | SplitBranch
