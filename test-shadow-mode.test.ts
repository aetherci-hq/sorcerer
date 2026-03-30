import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import path from 'path'
import fs from 'fs'
import os from 'os'
import { DatabaseService } from './src/main/services/database-service'
import { FileWatcherService } from './src/main/services/file-watcher-service'
import { collectBriefingData } from './src/main/services/briefing-service'

// Mock Electron's BrowserWindow and safeStorage
const mockWindow = {
  isDestroyed: () => false,
  webContents: {
    send: (channel: string, data: any) => {}
  }
} as any

describe('Shadow Mode Backend', () => {
  let db: DatabaseService
  let watcher: FileWatcherService
  let testProjectPath: string
  let testFile: string
  let projectId: string
  let projectName: string

  beforeAll(async () => {
    // Setup temporary test project INSIDE THE WORKSPACE
    testProjectPath = path.join(process.cwd(), `shadow-mode-test-dir-${Date.now()}`)
    if (!fs.existsSync(testProjectPath)) {
        fs.mkdirSync(testProjectPath, { recursive: true })
    }
    testFile = path.join(testProjectPath, 'hello.txt')
    fs.writeFileSync(testFile, 'initial content')

    // Init Services
    db = new DatabaseService()
    await db.ensureReady()
    db.runMigrations()

    // Fixed project ID for the entire suite
    projectId = `shadow-id-${Date.now()}`
    projectName = `Shadow Project ${Date.now()}`
    db.addProject(projectId, projectName, testProjectPath)

    watcher = new FileWatcherService(mockWindow, db)
    
    // Wait for READY state
    console.log('[test] Waiting for watcher to be READY...')
    await new Promise(resolve => setTimeout(resolve, 3000))
  })

  afterAll(async () => {
    await new Promise(resolve => setTimeout(resolve, 1000))
    if (watcher) watcher.close()
    if (db) db.close()
    if (testProjectPath && fs.existsSync(testProjectPath)) {
        try {
            fs.rmSync(testProjectPath, { recursive: true, force: true })
        } catch (e) {}
    }
  })

  it('should detect and log manual file changes', async () => {
    console.log('[test] Project Path:', testProjectPath)
    
    // 1. Simulate Manual Change
    console.log('[test] Writing to file:', testFile)
    fs.writeFileSync(testFile, 'manual update by human ' + Date.now())

    // 2. Wait longer for Chokidar (it can be slow on Windows)
    console.log('[test] Waiting for watcher (10s)...')
    await new Promise(resolve => setTimeout(resolve, 10000))

    // 3. Verify Database Entry
    const activity = db.listActivity(projectId, 10)
    console.log('[test] Activity found items:', JSON.stringify(activity, null, 2))
    
    const humanChanges = activity.filter(a => a.source === 'human' && a.type === 'file_change')
    
    // IF THIS STILL FAILS, we check the global activity log to see if it went to the wrong project
    if (humanChanges.length === 0) {
        const allActivity = db.listActivity(projectId, 100) // This actually only lists for projectId
        // Let's check if the table has ANY data
        console.log('[test] Checking for ANY human activity in DB...')
    }

    expect(humanChanges.length).toBeGreaterThan(0)
    expect(humanChanges[0].data.path).toBe('hello.txt')
    expect(humanChanges[0].data.event).toBe('change')
  }, 30000)

  it('should include human activity in briefing data', () => {
    const mockPty = { scrollback: { getScrollback: () => '' } } as any
    const briefingData = collectBriefingData(db, mockPty)
    
    expect(briefingData.humanActivity).toBeDefined()
    expect(briefingData.humanActivity?.[projectName]).toBeDefined()
    expect(briefingData.humanActivity?.[projectName].length).toBeGreaterThan(0)
  })
})
