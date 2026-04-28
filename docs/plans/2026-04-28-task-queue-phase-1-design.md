# Task Queue Phase 1 — Design Plan

**Date:** 2026-04-28
**Status:** Proposed
**Priority:** High

## Summary

Sorcerer should add a first-class task queue as a supervisory layer above sessions.

Phase 1 is deliberately narrow:

- tasks are durable records, separate from sessions
- tasks can be created by users, session analysis, live promotion, and background detectors
- all auto-created tasks land in human review first
- approving a task launches a brand-new dedicated task session in its own worktree
- the task queue lives in the sidebar as a compact FIFO stream
- the rich task experience lives in a pop-out dashboard, not on the main working surface

This is not Kanban, not a PM board, and not a generic planner. It is a beautiful intake-and-launch surface for AI coding work.

## Why This Matters

Sorcerer already manages concurrent sessions, worktrees, provider-aware lifecycle behavior, and cross-session memory. What it does not yet have is a durable unit of work above individual sessions.

That gap creates friction:

- good follow-up work discovered by sessions gets buried in transcripts or notes
- background signals like conflicts or TODO clusters have nowhere durable to land
- users can supervise sessions, but they cannot supervise queued work as a system

The task queue solves that by introducing a stable object:

- a task can exist before a session starts
- a task can outlive the session that discovered it
- a task can be reviewed, approved, dismissed, launched, and inspected independently

This adds orchestration depth without pulling Sorcerer into a Paperclip-style company model.

## Product Position

Sorcerer should treat tasks as a supervisory abstraction for coding work.

It should not:

- become a general project-management tool
- adopt Kanban as the primary mental model
- reorder work with hidden intelligence in phase 1
- auto-execute discovered work without approval
- let the task view displace the coding surface

It should:

- feel operational, alive, and desirable
- make discovered work durable and visible
- turn approved work into clean execution sessions
- keep user trust through predictable queue behavior

## Phase 1 Product Rules

### Core behavior

- The queue is chronological by default.
- The sidebar shows a limited operational slice, not the full task archive.
- Single-click in the sidebar does not navigate or mutate layout.
- Task actions are exposed through context menus and the dedicated task dashboard.
- Approval always launches a new dedicated task session.
- Dedicated task sessions get their own worktree and prompt envelope.
- The task dashboard is pop-out first.
- Optionally, the dashboard may be sent to an empty active panel later, but it should not take over existing working panels by default.

### Scope limits

Phase 1 does not include:

- auto-execution of discovered tasks
- automatic assignment to existing sessions
- task dependency graphs
- hidden prioritization or score-based reordering
- rich workflow playbooks as a requirement
- merge queue semantics
- generalized company/org abstractions

### Rollout posture

Phase 1 is review-first.

Phase 2 can expand toward:

- policy-based auto-run for safe task classes
- optional task playbooks
- smart assignment
- richer workflow orchestration above tasks

## UX Model

The task system has two surfaces:

### 1. Sidebar Operations Rail

This is the compressed operational surface.

It should behave like a live FIFO intake strip:

- compact rows
- chronological ordering
- limited visible window
- scrollable through active queue items
- no `done` or `dismissed` in the default stream

Visible states:

- `review`
- `approved`
- `running`
- `blocked`

Hidden from the default rail:

- `done`
- `dismissed`

Sidebar interaction rules:

- single-click: selection only
- no automatic panel navigation
- no automatic expansion into details
- context menu opens the action model

Recommended context menu actions:

- `View Details`
- `Approve`
- `Dismiss`
- `Launch Task Session` if approved
- `Promote to Ticket`
- `Mark Blocked`
- `Copy Summary`

Sidebar row design goals:

- elegant, narrow, and scan-fast
- enough visual differentiation to read state instantly
- no heavy “ticket card” treatment
- subtle project tint or source signal is acceptable
- age should be legible without dominating

### 2. Pop-out Task Dashboard

This is the immersive supervisory surface.

It should feel like a calm task cloud or shallow flow field, not a board or table.

Design rules:

- front plane contains actionable work
- depth is primarily driven by state
- focus temporarily changes depth and scale
- a lower swipeable layer carries adjacent or supporting task matter
- motion is subtle and low-frequency

Front-plane states:

- `review`
- `approved`
- `running`
- `blocked`

Backplane / lower-band candidates:

- recent context
- nearby related work
- parked non-current items
- recent completions if explicitly enabled

Visual primitive:

- important tasks render as soft floating cards
- lower-attention items render as lighter particles or reduced nodes
- focused tasks pull forward and expand

Interaction rules:

- focus is deliberate
- actions stay sparse and high-confidence
- the dashboard should never feel like a game or screensaver
- the dashboard must still work when there are 0, 5, or 100 tasks

## Visual Direction

The visual language should make the queue feel desirable to use.

Recommended tone:

- refined control room
- soft atmosphere
- restrained motion
- neutral base with one disciplined accent
- no purple-glow AI cliché
- no Kanban board metaphors

The memorable idea should be:

> Sorcerer turns queued coding work into a living flow of mission packets.

### Motion principles

- New items settle softly into the stream.
- Running items may breathe very lightly.
- Focus pulls a task card forward with depth and clarity.
- Background motion should create presence, not distraction.
- Use transform and opacity only for continuous animation.

### Empty-state requirement

The empty queue must still feel premium.

It should communicate:

- Sorcerer is watching
- new work will appear here
- the system is calm, not inactive or broken

## Task Object Model

Phase 1 should support two levels of structure:

### Task Card

The ingestion-first record.

Suggested shape:

```ts
interface TaskCard {
  id: string
  title: string
  summary: string
  status: 'review' | 'approved' | 'running' | 'blocked' | 'done' | 'dismissed'
  sourceType: 'user' | 'session-analysis' | 'live-promotion' | 'detector'
  sourceSessionId?: string
  sourceProjectId?: string
  sourceAgentId?: string
  createdAt: number
  updatedAt: number
  approvedAt?: number
  launchedAt?: number
  completedAt?: number
}
```

### Task Ticket

A promoted richer form for tasks worth deeper tracking.

Suggested additive fields:

```ts
interface TaskTicketExtras {
  rationale?: string
  suggestedFiles?: string[]
  dependencies?: string[]
  acceptanceCriteria?: string[]
  notes?: string
}
```

Not every task needs a ticket. Promotion should be explicit.

## Task Lifecycle

Phase 1 lifecycle:

`review` -> `approved` -> `running` -> `done`

Side exits:

- `review` -> `dismissed`
- `approved` -> `blocked`
- `running` -> `blocked`
- `blocked` -> `approved`

### State meanings

- `review`: discovered or created, awaiting user judgment
- `approved`: accepted for future execution, not yet launched
- `running`: a dedicated task session exists and is active
- `blocked`: known to need intervention before continuation
- `done`: task session completed successfully enough to close the task
- `dismissed`: explicitly rejected or no longer relevant

### Phase 1 closure rule

Phase 1 does not need deep automatic “did the agent really solve it?” semantics.

A practical first cut:

- task session exits
- user reviews result
- user or simple rule marks task `done` or `blocked`

If lightweight auto-suggestions are added later, they must remain explainable.

## Ingestion Sources

Phase 1 accepts four sources:

### 1. User-created

Explicit task creation by the user.

### 2. Session analysis

When a session ends, Sorcerer can extract follow-up work into task cards.

This pairs naturally with Engram-style summarization and handoff logic.

### 3. Live promotion

During a live session, a user can promote something into a task directly.

This is useful for:

- “do this later”
- “spawn separate work for this”
- “capture this follow-up before it gets lost”

### 4. Background detectors

Examples:

- file conflict warnings
- repeated TODO patterns
- repeated blockers
- detector-defined hygiene issues

Detector output should be conservative in phase 1. Better fewer credible tasks than noisy flood.

## Launch Model

Approval is the gate from supervision into execution.

When a task is approved and launched:

- Sorcerer creates a new dedicated task session
- that session gets a fresh worktree
- the task is linked to that session
- the task prompt envelope includes task context and evidence

### Phase 1 execution envelope

Use a generic task-runner prompt by default.

That prompt should include:

- task title
- short summary
- rationale if present
- source session reference if present
- relevant files if known
- expected output format for the session

Optional playbooks can come later. They should not be required in phase 1.

### Why dedicated sessions only

Phase 1 should not assign approved tasks into existing idle sessions.

Dedicated sessions provide:

- clean audit trail
- clean worktree boundary
- cleaner mental model
- lower risk of branch confusion
- easier recovery and inspection

## Presentation Architecture

Task presentation should be fed from one underlying model and two different view models.

### Shared domain model

- task records
- state transition rules
- source metadata
- links to session/project/agent/runtime artifacts

### Sidebar view model

Optimized for:

- strict ordering
- compact display
- limited fields
- scroll performance

### Dashboard view model

Optimized for:

- visual clustering by state depth
- focus/expansion behavior
- richer details and actions
- support-layer rendering

The important rule is:

- the dashboard must not invent a different truth than the rail

It can change presentation, not lifecycle semantics.

## Suggested Data Model

The exact schema can evolve, but phase 1 likely wants a dedicated `tasks` table plus optional event history.

Suggested task fields:

```sql
CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_session_id TEXT,
  source_project_id TEXT,
  source_agent_id TEXT,
  linked_session_id TEXT,
  rationale TEXT,
  suggested_files_json TEXT,
  dependencies_json TEXT,
  acceptance_criteria_json TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  approved_at INTEGER,
  launched_at INTEGER,
  completed_at INTEGER,
  dismissed_at INTEGER
);
```

Optional follow-on table:

```sql
CREATE TABLE task_events (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  type TEXT NOT NULL,
  payload_json TEXT,
  created_at INTEGER NOT NULL
);
```

The event log is useful but not strictly required if it slows phase 1.

## Main Process Architecture

Phase 1 wants three main slices:

### 1. Task Ingestion Service

Owns:

- create task
- ingest from analysis
- ingest from live promotion
- ingest from detectors
- normalize source metadata

### 2. Task Control Service

Owns:

- state transitions
- approval
- dismissal
- promotion to ticket
- launch orchestration
- links between tasks and dedicated task sessions

### 3. Task Presentation / IPC Layer

Owns:

- list tasks for sidebar
- list tasks for dashboard
- fetch details
- mutate state from renderer actions
- emit update events for live UI refresh

### Integration with existing systems

This should build on existing Sorcerer primitives:

- session creation
- project/worktree isolation
- provider-aware launch behavior
- Engram or session-analysis extraction
- quick context-menu action patterns

The queue should reuse those primitives rather than inventing a parallel execution stack.

## UI States

The task UI must be designed as a system, not a happy-path mockup.

Required states:

- loading
- empty
- queue with mixed states
- focused task detail
- blocked task
- launch in progress
- failed fetch or failed mutation

Special requirement:

- the empty pop-out dashboard still needs to feel beautiful and intentional

## Testing Priorities

### Product behavior

- tasks ingest correctly from each source type
- default queue ordering remains chronological
- hidden states stay hidden from the sidebar stream
- context menu actions update state correctly
- approving and launching create a dedicated task session
- linked task/session state stays coherent

### UI behavior

- sidebar remains legible with long titles and many items
- pop-out dashboard remains performant under sustained live updates
- motion degrades gracefully on lower-power machines
- focus state is obvious without disorienting movement

### Failure handling

- launch failure leaves task in a recoverable state
- missing project/session references degrade gracefully
- stale detector tasks can still be dismissed cleanly

## Open Questions

- Should task completion in phase 1 always require human confirmation?
- Should live promotion capture selected terminal text, a manual note, or both?
- How much detector noise is acceptable before users stop trusting the queue?
- Should the pop-out dashboard support saved filters in phase 1 or stay fixed and simple?
- Should task details support inline editing immediately, or read-mostly with explicit edit mode?

## Implementation Strategy

Recommended order:

1. define task schema and task domain types
2. implement task CRUD + state transition service
3. add session-analysis ingestion path
4. add live-promotion path
5. add one or two conservative detectors
6. build sidebar operations rail
7. build task context menu actions
8. build pop-out task dashboard
9. wire approval -> dedicated task session launch
10. add task/session detail linkage and recovery polish

## Relationship to the Earlier Task Queue Draft

`docs/plans/2026-03-28-task-queue-system.md` described a more generic worker-polling queue with broader automation assumptions.

This phase-1 plan supersedes that direction in three important ways:

- it is review-first rather than auto-pickup-first
- it is session-native rather than a generic task-worker daemon
- it is heavily shaped by UI/UX goals, not just execution mechanics

## Decision

Sorcerer should build a phase-1 task queue as a beautiful, review-first supervisory layer for coding work.

The right first version is:

- durable tasks
- FIFO sidebar intake
- pop-out task cloud dashboard
- approval-gated dedicated task sessions
- strict trust-preserving behavior

That is enough to feel new, desirable, and meaningfully more orchestrated without overreaching into generic autonomy or PM tooling.
