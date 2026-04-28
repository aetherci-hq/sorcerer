# Engram Technical Overview

Engram is Sorcerer's knowledge pipeline. It captures what happens in every Claude Code session — decisions made, insights discovered, questions raised, progress logged — and turns that ephemeral conversation into persistent, structured memory that future sessions can read.

The result: Claude doesn't start from zero. Every session picks up where the last one left off.

---

## How It Works

### Stage 1: Transcript Capture

When a Claude Code session ends (killed, archived, or the process exits), Sorcerer grabs the conversation transcript. There are two sources:

- **JSONL (preferred):** Claude Code writes a `.jsonl` log of every conversation turn. Sorcerer copies this file and renders it into clean `User:/Assistant:/[Tool:]` text.
- **PTY scrollback (legacy fallback):** If no JSONL file exists, Sorcerer reads the raw terminal buffer — messier, but still usable.

The raw transcript is archived to `~/.sorcerer/transcripts/` so it's always available for reprocessing.

### Stage 2: Extraction

Sorcerer sends the transcript to the Anthropic API (Haiku by default — configurable in Settings) with a structured prompt. The AI reads the full conversation and extracts:

| Field | What it captures |
|---|---|
| Title | Short label for what the session did |
| Summary | 1-2 sentence overview |
| Decisions | Explicit choices made, with rationale and rejected alternatives |
| Insights | Non-obvious learnings, gotchas, things that surprised you |
| Progress | Concrete accomplishments (files changed, features built) |
| Next Steps | What should happen next, with priority |
| Open Questions | Unresolved uncertainties |
| Topics | Which epics (work streams) this session relates to |
| Quality Signal | How substantive the session was (high/medium/low/noise) |

**Quality gates:** Very short sessions (under 200-500 bytes) are skipped entirely. Sessions classified as "noise" with no substantive content don't get written to the database.

The extraction result is saved as a JSON file in `~/.sorcerer/extractions/`.

### Stage 3: Filing to the Knowledge Graph

The extraction is written into Engram's SQLite database (`engram.db`). This is where the structure lives:

- **Namespaces** group work by project (e.g., `SORCERER`). Created automatically for each Sorcerer project.
- **Epics** are top-level work items (e.g., `SORCERER-12`). Think of them as feature branches or work streams.
- **Grains** are the individual decisions, insights, and questions — filed into per-epic documents (`SORCERER-12-decisions`, `SORCERER-12-insights`, `SORCERER-12-questions`).
- **Session items** link each session to the epics it touched.
- **Links** connect related items across the graph.

A single session can touch multiple epics. The extraction includes a **filing plan** that routes each grain to the correct epic. High-priority next steps get promoted to child task items.

### Stage 4: Enrichment (automatic, after filing)

Once grains are written, three things fire automatically:

1. **Embedding generation:** Voyage AI creates vector embeddings for all updated documents and items. These power semantic search later.

2. **Auto-linking:** Sorcerer finds the 5 most semantically similar items across the entire knowledge graph (minimum 65% similarity). It calls Haiku to classify whether each relationship is meaningful and what type it is (`related_to`, `implements`, `supersedes`, etc.). Real links get stored.

3. **Conflict detection:** New decisions are compared against existing decisions in the same namespace. If a new decision contradicts or supersedes an old one, a warning gets posted to the epic's activity log.

### Retry and Recovery

If any stage fails (API down, database locked), the extraction queue retries up to 5 times at 60-second intervals. On app startup, a reconciliation pass catches any sessions that completed while Sorcerer was closed — their transcripts are on disk, and any missing extractions get queued automatically.

---

## Context Injection: How Sessions Get Smart

When you create or resume a Claude Code session, Sorcerer writes a file called `.claude/engram-context.md` into the session's working directory. Claude reads this automatically at session start.

The context file contains:

- **Epic details:** Title, status, priority, description for the linked epic
- **Recent decisions:** The last 5 decisions made on this epic
- **Recent activity:** The last 5 activity log entries
- **Open tasks:** Child items still in progress
- **Open questions:** Unresolved uncertainties from prior sessions
- **Cross-epic connections:** Up to 3 semantically related items from other epics (surfaced via vector search)
- **Research brief:** A synthesized orientation to the codebase (see below)
- **Session handoff:** What the previous session accomplished, where it left off, and what to start with

If no epic is linked, the context file shows a namespace-level overview of the 10 most recently active work items.

---

## Research Briefs

### Lightweight (automatic)

Generated during context injection. Pulls prior session summaries, file paths mentioned in progress, and recent git history for those files. Haiku synthesizes this into a ~400-token orientation covering key files, recent work, current state, and things to watch out for. Cached for 24 hours.

### Heavy Research (manual)

Right-click a session and choose "Start Research." Sorcerer spawns a real Claude Code sub-agent that explores the actual codebase — reads files, runs git commands, examines architecture — for up to 2 minutes. Produces a deeper orientation with file-level specifics and suggested approaches. Results are written into the session's working directory for immediate use.

---

## Cross-Session Intelligence

When multiple sessions run in parallel on related work:

- **Decision propagation:** When one session makes a decision, related active sessions receive a notification file with the decision and its rationale.
- **File conflict detection:** If two sessions are modifying the same files, both get a warning before it becomes a merge problem.
- **Handoff briefs:** When starting a new session on an epic that has prior sessions, Haiku synthesizes what was accomplished, what decisions were made, and where to pick up.

---

## The Engram CLI (in-session tool)

Claude Code sessions have access to an `engram` CLI that reads and writes directly to the knowledge graph. Claude uses it to:

- List active work items (`engram list --roots`)
- Read full item details (`engram get SORCERER-12`)
- Log progress during work (`engram comment SORCERER-12 "Finished auth refactor"`)
- Update status (`engram update SORCERER-12 --status done`)
- Create subtasks (`engram create --parent SORCERER-12 --title "Add tests"`)
- Search across all knowledge (`engram search "auth middleware"`)

The CLI is injected automatically — Claude knows how to use it via a system prompt that Sorcerer appends to every session.

---

## Librarian: Nightly Maintenance

A standalone Python script (`scripts/librarian-nightly.py`) that runs six maintenance passes:

| Pass | What it does |
|---|---|
| Link discovery | Finds entities that should be linked but aren't yet |
| Quality remediation | Fixes overly long titles, fills missing metadata |
| Stale triage | Flags work items idle for 14+ days — recommends close, deprioritize, or flag |
| Question resolution | Marks open questions as resolved when a later decision answers them |
| Epic summaries | Synthesizes a 3-sentence "Current State" summary for each active epic |
| Supersession detection | Finds old decisions that have been implicitly replaced by newer ones |

Costs roughly $0.01/night using Haiku. Run manually or via cron.

---

## End-to-End User Experience

Here's what happens from start to finish when you work with Engram:

### Setup (one time)
1. Open Sorcerer Settings, go to the Engram tab
2. Enter your Anthropic API key (required for extraction)
3. Optionally enter a Voyage AI key (enables semantic search and auto-linking)
4. Extraction is on by default — toggle it off if you don't want it

### Starting a Session
1. Click "New Session" in Sorcerer
2. Optionally expand "Add epic hint" and pick an epic from the dropdown — this tells Engram where to file the session's knowledge. If you skip this, the AI figures it out from the transcript.
3. Session launches. Behind the scenes, Sorcerer writes `.claude/engram-context.md` with everything Claude needs to know about prior work on this epic.
4. Claude reads the context file and starts the session already knowing: what decisions were made, what's in progress, what files matter, and what to watch out for.

### During the Session
5. Claude has access to the `engram` CLI. It can check active work, log progress, update statuses, and create subtasks — all writing directly to the knowledge graph.
6. If you right-click the session and choose "Start Research," a sub-agent explores the codebase and delivers a detailed orientation.
7. If another parallel session makes a decision that affects this work, a cross-session notification file appears with the details.

### After the Session
8. You kill or archive the session. Sorcerer captures the transcript (JSONL preferred, PTY fallback).
9. The extraction queue picks it up. Haiku reads the full conversation and extracts decisions, insights, progress, questions, and next steps.
10. Grains are filed to the correct epics in the knowledge graph. High-priority next steps become task items.
11. Embeddings are generated. Auto-linking discovers semantic connections to other work. Conflict detection checks for contradicting decisions.
12. The epic's activity log gets a summary of what happened.

### Between Sessions
13. The Librarian (if you run it) cleans up: resolves answered questions, detects superseded decisions, flags stale items, and synthesizes epic summaries.
14. Next time you start a session on the same epic, all of this knowledge is waiting in the context injection — decisions, insights, research, handoff notes.

### The Cycle
Every session feeds the knowledge graph. Every new session reads from it. Over time, the graph becomes a rich record of why things were built the way they were, what was tried and rejected, what questions remain open, and where each work stream stands.
