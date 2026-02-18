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

    // Add type column to sessions (idempotent migration)
    try {
      this.db.run(`ALTER TABLE sessions ADD COLUMN type TEXT NOT NULL DEFAULT 'session'`)
    } catch { /* column already exists */ }

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
    const stmt = this.db.prepare('SELECT * FROM projects ORDER BY created_at DESC')
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
    this.db.run('INSERT INTO projects (id, name, path) VALUES (?, ?, ?)', [id, name, projectPath])
    this.save()
    return this.getProject(id)
  }

  updateProject(id: string, updates: { name?: string; setup_script?: string | null }): any {
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

    if (setClauses.length > 0) {
      values.push(id)
      this.db.run(`UPDATE projects SET ${setClauses.join(', ')} WHERE id = ?`, values)
      this.save()
    }

    return this.getProject(id)
  }

  removeProject(id: string): void {
    if (!this.db) return
    this.db.run('DELETE FROM projects WHERE id = ?', [id])
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
  }): any {
    if (!this.db) throw new Error('Database not initialized')
    this.db.run(
      `INSERT INTO sessions (id, project_id, name, branch, worktree_path, status, type, team_name, parent_session_id)
       VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?)`,
      [data.id, data.project_id, data.name, data.branch, data.worktree_path,
       data.type || 'session', data.team_name || null, data.parent_session_id || null]
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
  }): any {
    if (!this.db) throw new Error('Database not initialized')
    this.db.run(
      `INSERT INTO agents (id, name, description, system_prompt, mcp_config)
       VALUES (?, ?, ?, ?, ?)`,
      [data.id, data.name, data.description || '', data.system_prompt || '', data.mcp_config || '']
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
