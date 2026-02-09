import type { SorcererAPI } from '../preload/index'

declare global {
  interface Window {
    sorcerer: SorcererAPI
  }
}

export interface Project {
  id: string
  name: string
  path: string
  setup_script: string | null
  created_at: number
}

export interface Session {
  id: string
  project_id: string
  name: string
  branch: string
  worktree_path: string
  status: string
  parent_session_id: string | null
  team_name: string | null
  pid: number | null
  created_at: number
  archived_at: number | null
}

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
