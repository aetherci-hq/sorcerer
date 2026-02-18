// ── Core domain types (flat, matching DB schema) ──────────────────

export interface Project {
  id: string
  name: string
  path: string
  setup_script?: string | null
  created_at?: number
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
  pid?: number | null
  created_at?: number
  archived_at?: number | null
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

// ── Agent (standalone Claude Code session) ────────────────────────

export interface Agent {
  id: string
  name: string
  description: string
  system_prompt: string
  mcp_config: string
  bypass_permissions: number
  status: 'active' | 'idle' | 'archived'
  pid: number | null
  team_name: string | null
  created_at: number
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
