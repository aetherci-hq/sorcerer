# Task Queue System — Design Plan

**Date:** 2026-03-28
**Status:** Planned
**Priority:** Medium (after autonomous agents)

## Vision

A **task queue** is a system where users (or other agents) place discrete units of work, and an available agent picks them up automatically. Tasks have a clear start, a clear end, and produce a deliverable.

This is complementary to — but architecturally distinct from — the autonomous agent system. Agents are persistent watchers; tasks are fire-and-forget work items.

## How It Differs From Agents

| | Agents | Tasks |
|---|---|---|
| **Lifecycle** | Persistent, always running | Start → execute → complete |
| **Trigger** | Events (MCP, timer, external) | User creates or agent submits |
| **End condition** | None — runs until stopped | Work is done, deliverable produced |
| **Worker** | Dedicated agent with identity | Any available agent or a task-specific spawn |
| **Example** | "Monitor Sentry for errors" | "Fix issue #42 on project X" |

## Use Cases

- **User-submitted tasks:** "Review this PR", "Write tests for auth module", "Refactor the database layer"
- **Agent-submitted tasks:** Sentry agent finds a bug → creates a task "Fix null pointer in UserService.getProfile()"
- **Batch operations:** "Run this migration on all 5 projects"
- **Briefing-generated tasks:** The AI briefing identifies stale branches → creates tasks to land or archive them

## Core Concepts

### Task
```typescript
interface Task {
  id: string
  title: string              // "Fix issue #42"
  description: string        // Detailed instructions for the AI
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'
  priority: 'low' | 'normal' | 'high' | 'urgent'
  project_id?: string        // Optional: which project this task belongs to
  assigned_agent_id?: string // Optional: specific agent to handle this
  result?: string            // Output/summary when completed
  error?: string             // Error message if failed
  created_by: 'user' | 'agent' | 'briefing' | 'system'
  source_agent_id?: string   // If created by an agent, which one
  created_at: number
  started_at?: number
  completed_at?: number
}
```

### Task Queue
- FIFO by default, priority-weighted
- Tasks can target a specific project (runs in that project's directory)
- Tasks can target a specific agent (only that agent picks it up)
- Unassigned tasks are picked up by a general-purpose task worker

### Task Worker
- A special type of agent that polls the queue
- Spawns `claude -p "{task.description}"` in the appropriate working directory
- Captures output as the task result
- Marks task complete or failed based on exit code
- Picks up the next task

## Architecture

```
User/Agent creates task
        ↓
   [Task Queue DB]
        ↓
   Task Worker polls queue
        ↓
   Spawns Claude Code with task description
        ↓
   Captures result on completion
        ↓
   Updates task status + result
        ↓
   Notifies user (toast, briefing, badge)
```

## Database Schema

```sql
CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  priority TEXT NOT NULL DEFAULT 'normal',
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  assigned_agent_id TEXT REFERENCES agents(id) ON DELETE SET NULL,
  result TEXT,
  error TEXT,
  created_by TEXT NOT NULL DEFAULT 'user',
  source_agent_id TEXT,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  started_at INTEGER,
  completed_at INTEGER
);
```

## UI Components

### Task Panel (new sidebar section or tab)
- List of tasks with status indicators
- Queued (dot), Running (spinner), Completed (check), Failed (x)
- Click to see result/output
- Create task button → dialog with title, description, project, priority
- Filter by status, project, priority

### Task Creation Dialog
- Title (required)
- Description/instructions (required, multiline)
- Project (optional dropdown)
- Priority (dropdown: low/normal/high/urgent)
- Assign to agent (optional)

### Task Result View
- Show the full Claude Code output
- Summary at top (AI-generated from the output)
- Status badge, duration, token usage
- "Re-run" button to retry failed tasks
- "Create follow-up" to chain tasks

### Integration Points
- **Context menu on sessions:** "Create task for this session" (pre-fills project)
- **Briefing panel:** Tasks completed since last briefing shown in summary
- **Agent context menu:** "Submit task to this agent"
- **Keyboard shortcut:** Quick-create task from anywhere

## Task Worker Implementation

```typescript
class TaskWorkerService {
  private running = false
  private currentTask: string | null = null

  start() {
    this.running = true
    this.poll()
  }

  stop() {
    this.running = false
  }

  private async poll() {
    while (this.running) {
      const task = db.getNextTask() // Highest priority queued task
      if (task) {
        await this.execute(task)
      }
      await sleep(5000) // Poll every 5 seconds
    }
  }

  private async execute(task: Task) {
    db.updateTask(task.id, { status: 'running', started_at: now() })

    const cwd = task.project_id
      ? db.getProject(task.project_id)?.path
      : os.homedir()

    // Spawn Claude Code with the task description
    const result = await spawnAndCapture('claude', [
      '-p', task.description,
      '--dangerously-skip-permissions'
    ], { cwd })

    if (result.exitCode === 0) {
      db.updateTask(task.id, {
        status: 'completed',
        result: result.output,
        completed_at: now()
      })
    } else {
      db.updateTask(task.id, {
        status: 'failed',
        error: result.output,
        completed_at: now()
      })
    }
  }
}
```

## Agent ↔ Task Integration

Autonomous agents can create tasks:

```
System prompt for Sentry agent:
"When you find a critical error, create a task by writing a JSON file
to ~/.sorcerer/task-inbox/ with the format:
{ "title": "Fix ...", "description": "...", "priority": "high" }"
```

Sorcerer watches the inbox directory and ingests tasks into the queue. This keeps the interface simple — agents don't need special IPC, they just write files.

## Implementation Order

1. **Database schema + task CRUD** — Foundation
2. **Task creation dialog** — User can create tasks
3. **Task list UI** — View and manage tasks
4. **Task worker service** — Executes tasks via Claude Code -p
5. **Task result view** — See output of completed tasks
6. **Agent → task submission** — File-based inbox
7. **Briefing integration** — Surface completed/failed tasks
8. **Priority queue logic** — Weighted scheduling

## Open Questions

- Should tasks have a time limit? (prevent runaway Claude Code sessions)
- Should completed task output be stored in DB or as files?
- How to handle tasks that need human approval before execution?
- Should the task worker be a dedicated agent or a system-level service?
- Rate limit awareness — should the task worker pause when quota is low?
- Can tasks be chained? (task A completes → triggers task B)

## Relationship to Claude Code Teams/Tasks

Claude Code has its own teams/tasks system (filesystem-based at ~/.claude/teams/ and ~/.claude/tasks/). Sorcerer already watches and displays these. The Sorcerer task queue is a **higher-level orchestration layer** — it decides what work to do and uses Claude Code as the execution engine.

The two systems can coexist:
- Claude Code tasks = intra-session task tracking (what Claude is doing right now)
- Sorcerer tasks = cross-session work queue (what needs to be done next)
