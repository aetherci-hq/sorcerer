# Task Queue Phase 1 — Implementation Plan

**Date:** 2026-04-28
**Status:** Proposed
**Depends On:** `2026-04-28-task-queue-phase-1-design.md`
**Priority:** High

## Summary

This plan turns the phase-1 task queue design into an implementation sequence that fits Sorcerer's current architecture.

The goal is to ship a review-first task system with:

- durable task records
- FIFO sidebar presentation
- pop-out task dashboard
- approval-gated dedicated task session launch
- minimal but credible ingestion from multiple sources

The implementation should preserve Sorcerer's existing product center of gravity:

- sessions remain the execution primitive
- worktrees remain the isolation primitive
- provider-aware launch behavior remains the execution substrate
- tasks become the supervisory layer above those systems

## Delivery Strategy

The feature should be built in vertical slices, not as a giant backend-first branch.

Recommended sequencing:

1. establish the task domain model and persistence
2. expose read/write APIs and state transitions
3. land a minimal sidebar rail with manual task creation
4. wire approval into dedicated task session launch
5. add ingestion from session analysis and live promotion
6. add the pop-out dashboard
7. add conservative detector-based ingestion
8. polish recovery, linkage, and empty/error states

This sequence gives Sorcerer a usable thin slice early while keeping the launch model honest.

## Workstreams

The work breaks into five coordinated tracks:

1. data model and persistence
2. main-process task services
3. renderer state and sidebar UX
4. pop-out dashboard UX
5. session-launch integration and recovery

These tracks should converge around the same task state machine and not invent separate task notions.

## Phase 1 State Model

The implementation should hard-code the initial state machine rather than making it dynamic.

Supported states:

- `review`
- `approved`
- `running`
- `blocked`
- `done`
- `dismissed`

Allowed transitions:

- `review` -> `approved`
- `review` -> `dismissed`
- `approved` -> `running`
- `approved` -> `blocked`
- `running` -> `done`
- `running` -> `blocked`
- `blocked` -> `approved`
- `blocked` -> `dismissed`

Anything outside that set should be rejected centrally in the main process.

## Slice 1: Persistence And Domain Types

### Goals

- define a durable task record
- make task lifecycle state explicit
- create a foundation for both sidebar and dashboard views

### Files likely involved

- `src/main/services/database-service.ts`
- `src/renderer/src/types.ts`
- shared type modules if introduced during this work

### Required changes

Add a `tasks` table with fields covering:

- identity
- title and summary
- lifecycle state
- source metadata
- optional linkage to source session/project/agent
- optional linkage to launched task session
- optional richer-ticket fields
- timestamps for creation and lifecycle events

Suggested phase-1 fields:

- `id`
- `title`
- `summary`
- `status`
- `source_type`
- `source_session_id`
- `source_project_id`
- `source_agent_id`
- `linked_session_id`
- `rationale`
- `suggested_files_json`
- `dependencies_json`
- `acceptance_criteria_json`
- `created_at`
- `updated_at`
- `approved_at`
- `launched_at`
- `completed_at`
- `dismissed_at`

### Database service methods

Add explicit methods rather than overloading generic settings helpers:

- `createTask(data)`
- `getTask(id)`
- `listTasks(filters?)`
- `updateTask(id, patch)`
- `transitionTask(id, action)`
- `linkTaskToSession(taskId, sessionId)`

Optional for later:

- `listTaskEvents(taskId)`
- `appendTaskEvent(taskId, type, payload)`

### Acceptance criteria

- database migration is additive and restart-safe
- task rows survive app restart
- invalid states cannot be written through the public service methods

## Slice 2: Main-Process Task Service

### Goals

- centralize task lifecycle logic
- avoid scattering task transitions across IPC handlers
- keep launch gating and mutation rules in one place

### Recommended shape

Create a dedicated `TaskService` in the main process.

Likely file:

- `src/main/services/task-service.ts`

Responsibilities:

- validate task creation payloads
- normalize source metadata
- enforce state transitions
- prepare sidebar and dashboard view models
- delegate launch to existing session creation mechanisms

### Why a dedicated service

This keeps task logic out of:

- ad hoc renderer stores
- random IPC handlers
- session-specific codepaths

It also gives a stable seam for future detector and analysis ingestion.

### Suggested API surface

- `createManualTask(input)`
- `createTaskFromSessionAnalysis(input)`
- `createTaskFromLivePromotion(input)`
- `createTaskFromDetector(input)`
- `approveTask(taskId)`
- `dismissTask(taskId)`
- `markTaskBlocked(taskId, reason?)`
- `markTaskDone(taskId, summary?)`
- `promoteTaskToTicket(taskId, extras)`
- `launchTaskSession(taskId)`
- `listSidebarTasks()`
- `listDashboardTasks()`
- `getTaskDetails(taskId)`

### Acceptance criteria

- lifecycle rules are enforced in one place
- sidebar/dashboard consumers do not need to understand raw DB rules
- launch behavior can be tested without renderer involvement

## Slice 3: IPC And Preload Surface

### Goals

- expose task operations to the renderer cleanly
- keep renderer code dumb about backend internals

### Files likely involved

- `src/main/ipc/handlers.ts`
- `src/main/ipc/shared-handlers.ts`
- `src/preload/index.ts`
- `src/renderer/src/api/remote-client.ts`

### Required APIs

Read APIs:

- `task:listSidebar`
- `task:listDashboard`
- `task:get`

Mutation APIs:

- `task:create`
- `task:approve`
- `task:dismiss`
- `task:block`
- `task:promote`
- `task:launch`

Live update events:

- `task:created`
- `task:updated`
- `task:removed` only if hard deletion exists, otherwise avoid

### Design rules

- keep the renderer on action-level commands, not raw status writes
- avoid exposing unrestricted `updateTaskStatus(taskId, status)`
- align task APIs with existing Sorcerer RPC naming conventions

### Acceptance criteria

- renderer can render rail and dashboard without polling loops
- task state changes propagate live

## Slice 4: Renderer Store And Shared UI Model

### Goals

- represent tasks consistently in the renderer
- support rail and dashboard from one store

### Files likely involved

- `src/renderer/src/stores/useTaskStore.ts` or equivalent new store
- `src/renderer/src/types.ts`

### Store responsibilities

- fetch sidebar tasks
- fetch dashboard tasks
- cache task details
- subscribe to task updates
- expose action methods for context-menu and dashboard operations

### Store design rules

- use one store for task state, not separate per-surface stores
- separate lightweight list models from full detail payloads
- avoid UI-specific mutation logic in components

### Acceptance criteria

- sidebar updates when tasks are created or changed
- dashboard and sidebar remain semantically consistent
- task detail fetching does not block rail responsiveness

## Slice 5: Sidebar Operations Rail

### Goals

- add a compact FIFO queue in the sidebar
- make it attractive without turning it into a PM board
- preserve existing sidebar interaction conventions

### Files likely involved

- sidebar composition components
- project/agent tree neighboring components
- context menu integration
- global stylesheet or component-scoped styles

Likely touch points:

- `src/renderer/src/components/Sidebar.tsx`
- `src/renderer/src/components/ContextMenu.tsx`
- neighboring tree components depending on current sidebar architecture

### Functional requirements

- show only `review`, `approved`, `running`, `blocked`
- strict chronological order
- scrollable list
- no single-click navigation side effect
- context-menu driven actions

### Visual requirements

- compact row height
- strong but restrained state differentiation
- subtle entry animation for new tasks
- readable under long titles and narrow widths

### Empty/loading/error states

- empty rail must still feel intentional
- loading should use skeletal placeholders, not spinners
- errors should degrade locally, not destabilize the whole sidebar

### Acceptance criteria

- rail remains usable with 0, 5, and 50 visible tasks
- hidden states do not appear in the rail
- task actions are available via context menu

## Slice 6: Manual Task Creation

### Goals

- give users a direct way to seed the queue before automation lands
- validate the interaction model end to end

### Recommended phase-1 UI

Keep manual creation lightweight:

- title
- short summary
- optional project/source hints
- optional rationale/details

This should not become a full ticketing form.

### Files likely involved

- a new dialog component
- task store action wiring
- optional entry point in sidebar context or toolbar

### Acceptance criteria

- users can create a review task manually
- created tasks appear immediately in the rail and dashboard models

## Slice 7: Dedicated Task Session Launch

### Goals

- turn approved tasks into clean execution sessions
- reuse Sorcerer's existing launch, project, and worktree logic

### Critical design rule

Phase 1 always launches a new dedicated session.

No reuse of existing idle sessions.

### Files likely involved

- session creation helpers in main process
- provider launch flows
- worktree naming/allocation code
- session persistence models

Potential touch points:

- `src/main/ipc/shared-handlers.ts`
- `src/main/services/provider-registry.ts`
- session creation helpers already used by `session:create`

### Launch envelope requirements

The task session should receive:

- task title
- task summary
- rationale if present
- source linkage if present
- relevant files if known
- explicit instruction to work inside the dedicated task scope

### Session/task linkage

On successful launch:

- task moves to `running`
- `linked_session_id` is stored
- launch timestamp is written

On launch failure:

- task remains recoverable
- user gets a clear failure surface
- task should not silently disappear from review/approved flows

### Acceptance criteria

- approving and launching a task creates a real isolated session
- linked session is visible and inspectable
- the task can be recovered if launch fails midway

## Slice 8: Pop-out Task Dashboard

### Goals

- create the atmospheric supervisory surface
- keep the main working surface untouched

### Delivery strategy

Do not block early slices on the full dashboard.

Land the dashboard after:

- persistence
- sidebar rail
- manual creation
- launch integration

That keeps the first useful system shippable even before the richer visual layer is complete.

### Functional requirements

- pop-out surface can open independently
- renders the actionable front-plane set
- supports focus and detail inspection
- exposes approve/dismiss/launch/promote/block actions
- supports empty, loading, and failure states

### Visual requirements

- depth by state
- focus lift and expansion
- ambient lower layer for supporting matter
- subtle motion only
- no Kanban metaphors

### Files likely involved

- pop-out app routing/window plumbing
- dedicated dashboard components
- task store dashboard selectors
- dashboard-specific styles

### Acceptance criteria

- dashboard can supervise the same tasks as the rail
- visual hierarchy remains legible under load
- motion does not impair performance

## Slice 9: Session Analysis Ingestion

### Goals

- create tasks from finished session output
- make the queue feel like a real orchestration layer

### Likely integration point

This should sit near or on top of existing session summarization / Engram-adjacent logic rather than duplicating transcript parsing elsewhere.

### Requirements

- task generation must be conservative
- generated tasks should include source session linkage
- generated tasks land in `review`
- generation failures should not affect session shutdown or recovery

### Acceptance criteria

- at least one end-of-session path can create credible review tasks
- source session is traceable from the task

## Slice 10: Live Promotion

### Goals

- let users promote future work without waiting for a session to end

### Recommended first cut

Keep this explicit and simple:

- context-menu action from session surface
- maybe optional selected-text capture later

The first version can start with:

- title
- summary
- source session id

### Acceptance criteria

- user can create a review task directly from an active session context
- promoted task appears immediately in the queue

## Slice 11: Conservative Detectors

### Goals

- prove that automatic ingestion is useful without flooding the queue

### Phase-1 detector candidates

- file conflict detector
- repeated TODO or FIXME cluster detector

Avoid ambitious semantic detectors at first.

### Detector design rules

- every detector must declare its source type
- detector-generated tasks go to `review`
- detector duplication should be coalesced when possible

### Acceptance criteria

- detector tasks are infrequent and understandable
- users can dismiss them without side effects

## Slice 12: Recovery And Session Linkage Polish

### Goals

- make tasks feel durable and trustworthy across restart and failures

### Requirements

- task/sidebar/dashboard state reloads cleanly after restart
- linked running task sessions reconcile correctly on startup
- stale `running` tasks can be repaired to `blocked` or similar recoverable state

### Acceptance criteria

- no orphaned “running” tasks after app restart without reconciliation behavior
- linked task/session relationships remain inspectable

## UX Fit And Design Guardrails

This implementation should preserve the design intent from the phase-1 design doc.

Non-negotiables:

- no Kanban view
- no silent reprioritization
- no auto-navigation on sidebar click
- no heavyweight ticket chrome in the rail
- no task surface that takes over existing work panels by default

The dashboard should feel like a desirable command surface, but the rail must remain operational first.

## Testing Plan

### Unit / service level

- state transition validation
- task creation normalization per source type
- launch precondition checks
- task/session linkage writes

### Integration level

- task create -> list -> approve -> launch -> running path
- task create -> dismiss path
- session-analysis ingestion path
- live-promotion path

### UI level

- rail filtering and ordering
- context menu actions
- dashboard focus behavior
- empty/loading/error states

### Regression focus

- no impact to existing project/session sidebar behavior
- no breakage to session launch or worktree isolation flows
- no broken pop-out behavior

## Suggested Milestones

### Milestone 1: Backend Foundation

- schema
- task service
- IPC
- renderer store

### Milestone 2: Thin Usable Slice

- sidebar rail
- manual task creation
- approve/dismiss actions

### Milestone 3: Execution Loop

- dedicated task session launch
- task/session linkage
- running/done/blocked handling

### Milestone 4: Rich Supervisory UX

- pop-out dashboard
- detail surfaces
- motion and empty-state polish

### Milestone 5: Automated Ingestion

- session-analysis task creation
- live promotion
- one or two conservative detectors

### Milestone 6: Reliability

- restart reconciliation
- stale state repair
- performance and UX polish

## Risks

### Risk: The rail becomes visually noisy

Mitigation:

- keep row design compact
- use restrained state styling
- hide `done` and `dismissed`

### Risk: Task logic leaks into session codepaths

Mitigation:

- centralize lifecycle in `TaskService`
- keep task launch orchestration behind explicit methods

### Risk: Generated tasks feel low quality

Mitigation:

- keep detector set conservative
- require human review
- prefer fewer tasks with higher credibility

### Risk: Dashboard polish delays useful functionality

Mitigation:

- deliver the rail and launch loop first
- treat the dashboard as a distinct milestone, not a blocker for task persistence

## Commit Boundary Recommendation

The implementation itself should likely be split into several commits:

1. schema + task service + IPC
2. renderer store + sidebar rail
3. manual creation + context menu actions
4. dedicated task session launch
5. pop-out dashboard
6. ingestion sources + polish

That commit structure will make the rollout inspectable and easier to review.

## Decision

The right implementation path is to ship the task queue as an operational Sorcerer feature in stages:

- first make tasks durable
- then make them visible
- then make them launchable
- then make them beautiful
- then make them smarter

That ordering preserves trust and lets the UI become exciting on top of a real system rather than a speculative mock surface.
