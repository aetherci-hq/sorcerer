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
    send: (channel: string, data: any) => console.log(`[IPC SEND] ${channel}`, data)
  }
} as any

async function runTest() {
  console.log('--- Starting Shadow Mode Backend Test ---')

  // 1. Setup temporary test project
  const testProjectPath = path.join(os.tmpdir(), `sorcerer-test-${Date.now()}`)
  fs.mkdirSync(testProjectPath, { recursive: true })
  const testFile = path.join(testProjectPath, 'hello.txt')
  fs.writeFileSync(testFile, 'initial content')
  console.log(`Created test project at: ${testProjectPath}`)

  // 2. Init Services
  const db = new DatabaseService()
  await db.ensureReady()
  
  // Clean up any old test data
  db.runMigrations() // Ensure table exists

  // Add the project to DB
  const projectId = 'test-project-123'
  try {
    db.addProject(projectId, 'Test Project', testProjectPath)
  } catch (e) {
    console.log('Project might already exist in DB, continuing...')
  }

  const watcher = new FileWatcherService(mockWindow, db)
  console.log('Services initialized and watching...')

  // 3. Simulate Manual Change
  console.log('Simulating manual file change...')
  fs.writeFileSync(testFile, 'manual update by human')

  // 4. Wait for Chokidar (it's async and debounced)
  console.log('Waiting for file watcher to pick up change (2s)...')
  await new Promise(resolve => setTimeout(resolve, 2000))

  // 5. Verify Database Entry
  const activity = db.listActivity(projectId, 5)
  console.log('Recent Activity in DB:', JSON.stringify(activity, null, 2))

  const humanChanges = activity.filter(a => a.source === 'human' && a.type === 'file_change')
  if (humanChanges.length > 0) {
    console.log('✅ SUCCESS: Manual file change detected and logged to activity_log!')
  } else {
    console.error('❌ FAILURE: No human file change detected in activity_log.')
  }

  // 6. Verify Briefing Context
  // Mock PTYService as it's not needed for basic data collection here
  const mockPty = { scrollback: { getScrollback: () => '' } } as any
  const briefingData = collectBriefingData(db, mockPty)
  
  if (briefingData.humanActivity && briefingData.humanActivity['Test Project']) {
    console.log('✅ SUCCESS: Human activity included in Briefing Data!')
    console.log('Human Activity context snippet:', JSON.stringify(briefingData.humanActivity['Test Project'], null, 2))
  } else {
    console.error('❌ FAILURE: Human activity missing from Briefing Data.')
  }

  // Cleanup
  watcher.close()
  db.close()
  // fs.rmSync(testProjectPath, { recursive: true, force: true })
  console.log('--- Test Complete ---')
}

runTest().catch(err => {
  console.error('Test Failed:', err)
  process.exit(1)
})
