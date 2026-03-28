import initSqlJs, { Database as SqlJsDatabase } from 'sql.js'
import path from 'path'
import os from 'os'
import fs from 'fs'

export class DatabaseService {
  private db: SqlJsDatabase | null = null
  private dbPath: string
  private ready: Promise<void>

  constructor() {
    const dbDir = path.join(os.homedir(), '.sorcerer')
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true })
    }
    this.dbPath = path.join(dbDir, 'sorcerer.db')
    this.ready = this.init()
  }

  private async init(): Promise<void> {
    // Locate the sql.js WASM binary - resolve from the module itself
    const sqlJsDir = path.dirname(require.resolve('sql.js'))
    const wasmPath = path.join(sqlJsDir, 'sql-wasm.wasm')
    const SQL = await initSqlJs({
      locateFile: () => wasmPath
    })

    if (fs.existsSync(this.dbPath)) {
      const buffer = fs.readFileSync(this.dbPath)
      this.db = new SQL.Database(buffer)
    } else {
      this.db = new SQL.Database()
    }

    this.db.run('PRAGMA foreign_keys = ON;')
    this.runMigrations()
  }

  async ensureReady(): Promise<void> {
    await this.ready
  }

  private runMigrations(): void {
    if (!this.db) return

    this.db.run(`
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        path TEXT NOT NULL UNIQUE,
        setup_script TEXT,
        created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
      );
    `)

    this.db.run(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        branch TEXT NOT NULL,
        worktree_path TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        parent_session_id TEXT REFERENCES sessions(id) ON DELETE SET NULL,
        team_name TEXT,
        pid INTEGER,
        created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
        archived_at INTEGER
      );
    `)

    this.db.run(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `)

    this.db.run(`
      CREATE TABLE IF NOT EXISTS agents (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT DEFAULT '',
        system_prompt TEXT DEFAULT '',
        mcp_config TEXT DEFAULT '',
        status TEXT NOT NULL DEFAULT 'idle',
        pid INTEGER,
        team_name TEXT,
        created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
      );
    `)

    this.db.run(`
      CREATE TABLE IF NOT EXISTS quick_notes (
        id TEXT PRIMARY KEY,
        parent_id TEXT NOT NULL,
        parent_type TEXT NOT NULL,
        content TEXT DEFAULT '',
        created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
        updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
      );
    `)

    // Add sort_order column to projects (idempotent migration)
    try {
      this.db.run(`ALTER TABLE projects ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0`)
      // Backfill existing projects: newest first (matching previous created_at DESC order)
      const existing = this.db.prepare('SELECT id FROM projects ORDER BY created_at DESC')
      let idx = 0
      while (existing.step()) {
        const row = existing.getAsObject() as { id: string }
        this.db.run('UPDATE projects SET sort_order = ? WHERE id = ?', [idx, row.id])
        idx++
      }
      existing.free()
    } catch { /* column already exists */ }

    // Add type column to sessions (idempotent migration)
    try {
      this.db.run(`ALTER TABLE sessions ADD COLUMN type TEXT NOT NULL DEFAULT 'session'`)
    } catch { /* column already exists */ }

    // Add bypass_permissions column to sessions and agents (idempotent migration)
    try {
      this.db.run(`ALTER TABLE sessions ADD COLUMN bypass_permissions INTEGER NOT NULL DEFAULT 1`)
    } catch { /* column already exists */ }
    try {
      this.db.run(`ALTER TABLE agents ADD COLUMN bypass_permissions INTEGER NOT NULL DEFAULT 1`)
    } catch { /* column already exists */ }

    // Add remote_control column to sessions and agents (idempotent migration)
    try {
      this.db.run(`ALTER TABLE sessions ADD COLUMN remote_control INTEGER NOT NULL DEFAULT 0`)
    } catch { /* column already exists */ }
    try {
      this.db.run(`ALTER TABLE agents ADD COLUMN remote_control INTEGER NOT NULL DEFAULT 0`)
    } catch { /* column already exists */ }

    // Project groups table
    this.db.run(`
      CREATE TABLE IF NOT EXISTS project_groups (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0
      );
    `)

    // Add group_id column to projects (idempotent migration)
    try {
      this.db.run(`ALTER TABLE projects ADD COLUMN group_id TEXT REFERENCES project_groups(id) ON DELETE SET NULL`)
    } catch { /* column already exists */ }

    // Agent groups table
    this.db.run(`
      CREATE TABLE IF NOT EXISTS agent_groups (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0
      );
    `)

    // Add group_id column to agents (idempotent migration)
    try {
      this.db.run(`ALTER TABLE agents ADD COLUMN group_id TEXT REFERENCES agent_groups(id) ON DELETE SET NULL`)
    } catch { /* column already exists */ }

    // Briefing archive table
    this.db.run(`
      CREATE TABLE IF NOT EXISTS briefings (
        id TEXT PRIMARY KEY,
        content TEXT NOT NULL,
        provider TEXT NOT NULL,
        model TEXT NOT NULL,
        created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
      );
    `)

    this.save()
  }

  // Briefing archive operations
  saveBriefing(id: string, content: string, provider: string, model: string): void {
    if (!this.db) return
    this.db.run(
      'INSERT INTO briefings (id, content, provider, model) VALUES (?, ?, ?, ?)',
      [id, content, provider, model]
    )
    this.save()
  }

  listBriefings(limit: number = 20): any[] {
    if (!this.db) return []
    const stmt = this.db.prepare('SELECT * FROM briefings ORDER BY created_at DESC LIMIT ?')
    stmt.bind([limit])
    const results: any[] = []
    while (stmt.step()) {
      results.push(stmt.getAsObject())
    }
    stmt.free()
    return results
  }

  deleteBriefing(id: string): void {
    if (!this.db) return
    this.db.run('DELETE FROM briefings WHERE id = ?', [id])
    this.save()
  }

  private save(): void {
    if (!this.db) return
    const data = this.db.export()
    fs.writeFileSync(this.dbPath, Buffer.from(data))
  }

  // Project operations
  listProjects(): any[] {
    if (!this.db) return []
    const stmt = this.db.prepare('SELECT * FROM projects ORDER BY sort_order ASC')
    const results: any[] = []
    while (stmt.step()) {
      results.push(stmt.getAsObject())
    }
    stmt.free()
    return results
  }

  getProject(id: string): any | undefined {
    if (!this.db) return undefined
    const stmt = this.db.prepare('SELECT * FROM projects WHERE id = ?')
    stmt.bind([id])
    const result = stmt.step() ? stmt.getAsObject() : undefined
    stmt.free()
    return result
  }

  addProject(id: string, name: string, projectPath: string): any {
    if (!this.db) throw new Error('Database not initialized')
    // Shift all existing projects down to make room at position 0
    this.db.run('UPDATE projects SET sort_order = sort_order + 1')
    this.db.run('INSERT INTO projects (id, name, path, sort_order) VALUES (?, ?, ?, 0)', [id, name, projectPath])
    this.save()
    return this.getProject(id)
  }

  updateProject(id: string, updates: { name?: string; setup_script?: string | null; group_id?: string | null }): any {
    if (!this.db) return undefined
    const setClauses: string[] = []
    const values: any[] = []

    if (updates.name !== undefined) {
      setClauses.push('name = ?')
      values.push(updates.name)
    }
    if (updates.setup_script !== undefined) {
      setClauses.push('setup_script = ?')
      values.push(updates.setup_script)
    }
    if (updates.group_id !== undefined) {
      setClauses.push('group_id = ?')
      values.push(updates.group_id)
    }

    if (setClauses.length > 0) {
      values.push(id)
      this.db.run(`UPDATE projects SET ${setClauses.join(', ')} WHERE id = ?`, values)
      this.save()
    }

    return this.getProject(id)
  }

  reorderProjects(projectIds: string[]): void {
    if (!this.db) return
    for (let i = 0; i < projectIds.length; i++) {
      this.db.run('UPDATE projects SET sort_order = ? WHERE id = ?', [i, projectIds[i]])
    }
    this.save()
  }

  removeProject(id: string): void {
    if (!this.db) return
    this.db.run('DELETE FROM projects WHERE id = ?', [id])
    this.save()
  }

  // Project group operations
  listProjectGroups(): any[] {
    if (!this.db) return []
    const stmt = this.db.prepare('SELECT * FROM project_groups ORDER BY sort_order ASC')
    const results: any[] = []
    while (stmt.step()) {
      results.push(stmt.getAsObject())
    }
    stmt.free()
    return results
  }

  addProjectGroup(id: string, name: string): any {
    if (!this.db) throw new Error('Database not initialized')
    // Get next sort_order
    const stmt = this.db.prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order FROM project_groups')
    stmt.step()
    const nextOrder = (stmt.getAsObject() as { next_order: number }).next_order
    stmt.free()
    this.db.run('INSERT INTO project_groups (id, name, sort_order) VALUES (?, ?, ?)', [id, name, nextOrder])
    this.save()
    return { id, name, sort_order: nextOrder }
  }

  updateProjectGroup(id: string, updates: { name?: string }): any {
    if (!this.db) return undefined
    if (updates.name !== undefined) {
      this.db.run('UPDATE project_groups SET name = ? WHERE id = ?', [updates.name, id])
      this.save()
    }
    const stmt = this.db.prepare('SELECT * FROM project_groups WHERE id = ?')
    stmt.bind([id])
    const result = stmt.step() ? stmt.getAsObject() : undefined
    stmt.free()
    return result
  }

  removeProjectGroup(id: string): void {
    if (!this.db) return
    // Ungroup projects in this group (set group_id to null)
    this.db.run('UPDATE projects SET group_id = NULL WHERE group_id = ?', [id])
    this.db.run('DELETE FROM project_groups WHERE id = ?', [id])
    this.save()
  }

  reorderProjectGroups(groupIds: string[]): void {
    if (!this.db) return
    for (let i = 0; i < groupIds.length; i++) {
      this.db.run('UPDATE project_groups SET sort_order = ? WHERE id = ?', [i, groupIds[i]])
    }
    this.save()
  }

  // Session operations
  listSessions(projectId?: string): any[] {
    if (!this.db) return []
    const query = projectId
      ? 'SELECT * FROM sessions WHERE project_id = ? ORDER BY created_at DESC'
      : 'SELECT * FROM sessions ORDER BY created_at DESC'
    const stmt = this.db.prepare(query)
    if (projectId) stmt.bind([projectId])
    const results: any[] = []
    while (stmt.step()) {
      results.push(stmt.getAsObject())
    }
    stmt.free()
    return results
  }

  getSession(id: string): any | undefined {
    if (!this.db) return undefined
    const stmt = this.db.prepare('SELECT * FROM sessions WHERE id = ?')
    stmt.bind([id])
    const result = stmt.step() ? stmt.getAsObject() : undefined
    stmt.free()
    return result
  }

  addSession(data: {
    id: string
    project_id: string
    name: string
    branch: string
    worktree_path: string
    type?: 'session' | 'quick-terminal'
    team_name?: string
    parent_session_id?: string
    bypass_permissions?: number
    remote_control?: number
    status?: string
  }): any {
    if (!this.db) throw new Error('Database not initialized')
    this.db.run(
      `INSERT INTO sessions (id, project_id, name, branch, worktree_path, status, type, team_name, parent_session_id, bypass_permissions, remote_control)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [data.id, data.project_id, data.name, data.branch, data.worktree_path,
       data.status || 'active',
       data.type || 'session', data.team_name || null, data.parent_session_id || null,
       data.bypass_permissions ?? 1, data.remote_control ?? 0]
    )
    this.save()
    return this.getSession(data.id)
  }

  updateSession(id: string, updates: Partial<{
    name: string
    status: string
    pid: number | null
    team_name: string | null
    archived_at: number | null
    remote_control: number
  }>): any {
    if (!this.db) return undefined
    const setClauses: string[] = []
    const values: any[] = []

    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) {
        setClauses.push(`${key} = ?`)
        values.push(value)
      }
    }

    if (setClauses.length > 0) {
      values.push(id)
      this.db.run(`UPDATE sessions SET ${setClauses.join(', ')} WHERE id = ?`, values)
      this.save()
    }

    return this.getSession(id)
  }

  removeSession(id: string): void {
    if (!this.db) return
    this.db.run('DELETE FROM sessions WHERE id = ?', [id])
    this.save()
  }

  // Agent operations
  listAgents(): any[] {
    if (!this.db) return []
    const stmt = this.db.prepare('SELECT * FROM agents ORDER BY created_at DESC')
    const results: any[] = []
    while (stmt.step()) {
      results.push(stmt.getAsObject())
    }
    stmt.free()
    return results
  }

  getAgent(id: string): any | undefined {
    if (!this.db) return undefined
    const stmt = this.db.prepare('SELECT * FROM agents WHERE id = ?')
    stmt.bind([id])
    const result = stmt.step() ? stmt.getAsObject() : undefined
    stmt.free()
    return result
  }

  addAgent(data: {
    id: string
    name: string
    description?: string
    system_prompt?: string
    mcp_config?: string
    bypass_permissions?: number
    remote_control?: number
  }): any {
    if (!this.db) throw new Error('Database not initialized')
    this.db.run(
      `INSERT INTO agents (id, name, description, system_prompt, mcp_config, bypass_permissions, remote_control)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [data.id, data.name, data.description || '', data.system_prompt || '', data.mcp_config || '',
       data.bypass_permissions ?? 1, data.remote_control ?? 0]
    )
    this.save()
    return this.getAgent(data.id)
  }

  updateAgent(id: string, updates: Partial<{
    name: string
    description: string
    system_prompt: string
    mcp_config: string
    status: string
    pid: number | null
    team_name: string | null
    remote_control: number
  }>): any {
    if (!this.db) return undefined
    const setClauses: string[] = []
    const values: any[] = []

    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) {
        setClauses.push(`${key} = ?`)
        values.push(value)
      }
    }

    if (setClauses.length > 0) {
      values.push(id)
      this.db.run(`UPDATE agents SET ${setClauses.join(', ')} WHERE id = ?`, values)
      this.save()
    }

    return this.getAgent(id)
  }

  removeAgent(id: string): void {
    if (!this.db) return
    this.db.run('DELETE FROM agents WHERE id = ?', [id])
    this.save()
  }

  // Agent group operations
  listAgentGroups(): any[] {
    if (!this.db) return []
    const stmt = this.db.prepare('SELECT * FROM agent_groups ORDER BY sort_order ASC')
    const results: any[] = []
    while (stmt.step()) {
      results.push(stmt.getAsObject())
    }
    stmt.free()
    return results
  }

  addAgentGroup(id: string, name: string): any {
    if (!this.db) throw new Error('Database not initialized')
    const stmt = this.db.prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order FROM agent_groups')
    stmt.step()
    const nextOrder = (stmt.getAsObject() as { next_order: number }).next_order
    stmt.free()
    this.db.run('INSERT INTO agent_groups (id, name, sort_order) VALUES (?, ?, ?)', [id, name, nextOrder])
    this.save()
    return { id, name, sort_order: nextOrder }
  }

  updateAgentGroup(id: string, updates: { name?: string }): any {
    if (!this.db) return undefined
    if (updates.name !== undefined) {
      this.db.run('UPDATE agent_groups SET name = ? WHERE id = ?', [updates.name, id])
      this.save()
    }
    const stmt = this.db.prepare('SELECT * FROM agent_groups WHERE id = ?')
    stmt.bind([id])
    const result = stmt.step() ? stmt.getAsObject() : undefined
    stmt.free()
    return result
  }

  removeAgentGroup(id: string): void {
    if (!this.db) return
    this.db.run('UPDATE agents SET group_id = NULL WHERE group_id = ?', [id])
    this.db.run('DELETE FROM agent_groups WHERE id = ?', [id])
    this.save()
  }

  reorderAgentGroups(groupIds: string[]): void {
    if (!this.db) return
    for (let i = 0; i < groupIds.length; i++) {
      this.db.run('UPDATE agent_groups SET sort_order = ? WHERE id = ?', [i, groupIds[i]])
    }
    this.save()
  }

  // Settings operations
  getSetting(key: string): string | undefined {
    if (!this.db) return undefined
    const stmt = this.db.prepare('SELECT value FROM settings WHERE key = ?')
    stmt.bind([key])
    const result = stmt.step() ? (stmt.getAsObject() as { value: string }).value : undefined
    stmt.free()
    return result
  }

  setSetting(key: string, value: string): void {
    if (!this.db) return
    this.db.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, value])
    this.save()
  }

  // Quick Notes operations
  getQuickNote(parentId: string, parentType: string): any | undefined {
    if (!this.db) return undefined
    const stmt = this.db.prepare('SELECT * FROM quick_notes WHERE parent_id = ? AND parent_type = ?')
    stmt.bind([parentId, parentType])
    const result = stmt.step() ? stmt.getAsObject() : undefined
    stmt.free()
    return result
  }

  saveQuickNote(id: string, parentId: string, parentType: string, content: string): void {
    if (!this.db) return
    this.db.run(
      `INSERT OR REPLACE INTO quick_notes (id, parent_id, parent_type, content, updated_at)
       VALUES (?, ?, ?, ?, strftime('%s','now'))`,
      [id, parentId, parentType, content]
    )
    this.save()
  }

  deleteQuickNote(parentId: string, parentType: string): void {
    if (!this.db) return
    this.db.run('DELETE FROM quick_notes WHERE parent_id = ? AND parent_type = ?', [parentId, parentType])
    this.save()
  }

  listQuickNoteParents(): { parent_id: string; parent_type: string }[] {
    if (!this.db) return []
    const stmt = this.db.prepare("SELECT parent_id, parent_type FROM quick_notes WHERE content != ''")
    const results: { parent_id: string; parent_type: string }[] = []
    while (stmt.step()) {
      const row = stmt.getAsObject() as { parent_id: string; parent_type: string }
      results.push(row)
    }
    stmt.free()
    return results
  }

  close(): void {
    if (this.db) {
      this.save()
      this.db.close()
      this.db = null
    }
  }
}
