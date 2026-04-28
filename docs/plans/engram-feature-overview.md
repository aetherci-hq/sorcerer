# Engram: Feature Overview

Engram is Sorcerer's built-in knowledge system. It remembers what happens across your Claude Code sessions so that each new session starts informed, not from scratch.

---

## Automatic Session Memory

**What it does:** Every time a session ends, Engram reads the conversation and extracts the important parts — decisions made, insights discovered, progress logged, questions left open, and next steps identified. These are saved permanently.

**What problem it solves:** Without this, everything Claude learns during a session is gone when the session ends. The next session on the same feature has no idea what was already decided or tried. Engram makes sessions cumulative instead of disposable.

---

## Smart Session Startup

**What it does:** When you start a new session, Engram automatically gives Claude a briefing covering what was decided before, what's in progress, what files matter, and what to watch out for. Claude reads this before you type your first message.

**What problem it solves:** Manually re-explaining context to Claude at the start of every session. Instead of pasting notes or re-describing what happened last time, Claude already knows.

---

## Work Item Tracking

**What it does:** Engram organizes knowledge into epics (features or work streams) with child tasks. Claude can read, update, and create work items directly during a session using a built-in command-line tool. Progress and status stay current without you managing a separate tracker.

**What problem it solves:** Keeping track of what's done, what's in progress, and what's next across many sessions on a feature — without maintaining a separate project board or doc.

---

## Multi-Epic Filing

**What it does:** A single session can touch multiple features. Engram figures out which parts of the conversation belong to which work stream and files each piece to the right place automatically.

**What problem it solves:** Sessions don't always stay on one topic. Without this, knowledge from a session that touched three features would either get lost or dumped into the wrong bucket.

---

## Semantic Search and Auto-Linking

**What it does:** Engram creates vector embeddings for all stored knowledge and automatically discovers meaningful connections between items across different work streams. Related decisions, insights, and tasks get linked together.

**What problem it solves:** Knowledge silos. A decision made on one feature might be directly relevant to another, but nobody would think to check. Engram surfaces these connections automatically.

---

## Cross-Epic Context

**What it does:** At session start, Engram searches the entire knowledge graph for items semantically related to the current work — even from different epics — and includes them in Claude's briefing.

**What problem it solves:** Working on a feature without knowing that a related decision was already made elsewhere. This prevents duplicate work and contradictory approaches across features.

---

## Decision Conflict Detection

**What it does:** When a new decision is extracted, Engram checks it against all existing decisions in the project. If it contradicts or supersedes an earlier decision, a warning is posted to the relevant epic's activity log.

**What problem it solves:** Forgetting that something was already decided and making a conflicting choice weeks later. Engram catches these contradictions as they happen.

---

## Cross-Session Awareness

**What it does:** When multiple sessions are running in parallel on related work, Engram passes decisions and file-change warnings between them in real time. If one session makes a decision that affects another, the other session finds out immediately.

**What problem it solves:** Parallel sessions making conflicting changes or duplicating work because they don't know what each other are doing. This is especially important when using worktrees to run multiple agents simultaneously.

---

## Research Briefs

**What it does:** Before a session starts, Engram synthesizes an orientation from prior session history and recent git activity — which files are important, what changed recently, and what the current state looks like. For deeper dives, you can trigger a full codebase research agent that reads actual files and explores architecture.

**What problem it solves:** Claude starting a session and immediately asking "which files should I look at?" or making changes to code it doesn't understand. Research briefs give Claude spatial awareness of the codebase from the first prompt.

---

## Session Handoff

**What it does:** When starting a new session on a feature that had prior sessions, Engram generates a handoff brief: what was accomplished, what decisions were made, where the last session left off, and what to start with next.

**What problem it solves:** The "cold start" problem when picking up work after a break. Instead of re-reading old conversations or trying to remember where things stood, the handoff brief gets Claude (and you) oriented in seconds.

---

## Librarian Maintenance

**What it does:** A maintenance routine (run manually or on a schedule) that keeps the knowledge graph healthy: resolves questions that were answered by later decisions, flags stale work items, detects decisions that have been superseded, and generates current-state summaries for each active feature.

**What problem it solves:** Knowledge decay. Without maintenance, the graph fills up with outdated questions, zombie work items, and decisions that were quietly replaced. The Librarian keeps everything current so the context Claude receives is accurate.

---

## Automatic Recovery

**What it does:** If Sorcerer is closed when a session ends, the transcript is still saved to disk. When Sorcerer restarts, it automatically detects unprocessed sessions and queues them for extraction. Failed extractions retry up to 5 times.

**What problem it solves:** Lost knowledge from sessions that ended while the app was closed, or from temporary API failures. Nothing falls through the cracks.

---

## In Summary

Engram turns Claude Code from a tool with amnesia into one with a working memory. Sessions build on each other. Decisions persist. Context flows automatically. The more you use it, the smarter each new session starts.
