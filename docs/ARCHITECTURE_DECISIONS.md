
# FounderOS Architecture Decision Records

This document tracks the major architectural decisions made during
FounderOS's incremental core refactor. It exists so that every
significant structural change is explainable, reversible, and
traceable to a specific reason — in line with the Engineering
Principles ("Every architectural decision should be explainable,"
"Every feature has one owner," "Small migrations beat large
rewrites").

Each ADR documents a *decision*, not an implementation diary. For
implementation-level detail, see the corresponding git commits
referenced in each record's Related Phases section.

---

## ADR-001: Module Registry Foundation

**Date:** Phase 1
**Status:** Accepted / Implemented

**Decision**
Introduce a single, authoritative `ModuleRegistry` (`modules/registry.js`)
that records which FounderOS systems/modules exist and their lifecycle
status, alongside a `ModuleLoader` (`modules/loader.js`) responsible for
coordinating registration. The registry itself does not initialize
modules, decide load order, or contain business logic — it only
remembers what has been registered.

**Reason**
Prior to this decision, FounderOS systems (Decision, Guidance,
Briefing, Memory, Workshop, Reflection, Communication, Commander) were
wired together implicitly through global script load order and direct
global references, with no single place to answer "what systems exist
right now, and are they ready?" This made it difficult to reason about
system availability, especially for guarded/optional integrations.

**Consequences**
- Every system now self-registers with `ModuleRegistry.register(id, instance, metadata)` at load time.
- `ArchieCore` can query the registry to confirm a system is available before depending on it, rather than relying solely on `typeof X !== "undefined"` checks scattered across call sites (though those guards remain in place as defense-in-depth, per the "backwards compatibility is preferred" principle).
- The registry is strictly additive — it does not change any existing system's public API or behavior.
- Introduces a small amount of console logging noise (`🧩 Module Registry: "x" registered.`) — accepted as a worthwhile tradeoff for visibility during the refactor period.

**Migration Notes**
- No existing call sites were removed or altered to adopt the registry; systems were updated only to add a registration call.
- Future phases may use `ModuleRegistry.get(id)`/`.has(id)` to replace direct global references, but this has not been done yet — the registry's presence does not itself constitute a migration.

**Related Phases**
- Commit `a4c1bdd` — Checkpoint before Phase 1
- Commit `6e09011` — Phase 1: Module Registry + Loader foundation (additive, no-op integration with ArchieCore)

---

## ADR-002: CommanderSystem Ownership Migration

**Date:** Phase 2
**Status:** Accepted / Implemented

**Decision**
Introduce `CommanderSystem` (`systems/commander.system.js`) as the
single owning call-site contract for loading and saving Commander
(founder) data, delegating internally to the existing
`loadFounder()`/`saveFounder()` mechanics in `js/storage.js` rather
than replacing them.

**Reason**
Commander (founder) load/save calls were previously scattered directly
across `js/main.js`, `js/missions.js`, `js/progress.js`, and
`js/endday.js`, each calling `loadFounder()`/`saveFounder()` globals
independently. This violated the "every feature has one owner"
principle — there was no single place that owned the *contract* for
how Commander data enters/exit memory, even though the underlying
storage mechanics were already centralized in `js/storage.js`.

**Consequences**
- `CommanderSystem.load()` / `.save()` / `.get()` / `.getProfile()` now exist as the preferred call-site API.
- `CommanderSystem` explicitly does **not** change the founder data shape, storage keys, or persistence mechanics — it is a thin ownership/contract layer over `js/storage.js`, not a replacement for it.
- `CommanderSystem` explicitly does not yet own field-level mutations (XP changes, mission assignment) — those remain at their existing call sites until a future phase, to keep this migration small and reversible.
- Call sites in `js/main.js` were updated to prefer `CommanderSystem.save()` when available, falling back to direct `saveFounder()` — preserving compatibility with `missions.html` and `progress.html`, which do not load `commander.system.js`.

**Migration Notes**
- Guarded fallback pattern used throughout: `typeof CommanderSystem !== "undefined" && typeof CommanderSystem.save === "function"`, else call the original global directly.
- No changes were made to `js/storage.js` itself.
- `missions.html` / `progress.html` continue to function unmodified since they never depended on `CommanderSystem` in the first place.

**Related Phases**
- Commit `e3c2f3d` — Checkpoint before Phase 2
- Commit `83d3be2` — Phase 2: CommanderSystem ownership migration (load/save call-site consolidation, additive, missions/progress.html compatible)

---

## ADR-003: CommunicationSystem Owns Delivery; Archie Owns Intelligence/Personality

**Date:** Phase 3 (3A, 3B-1, 3B-2) + Phase 5B (guarded migration + lifecycle synchronization)
**Status:** Accepted / Implemented — Phase 5B completes the migration. Remaining intentionally retained fallback/debt is tracked in Remaining Architectural Debt below.


**Decision**
`CommunicationSystem` (`systems/communication.system.js`) is the owning
system for message *delivery infrastructure*: DOM target resolution,
the outbound transmission queue (queue, busy, pause, order, delivery
orchestration), and routing decisions about where a
message should render. `Archie` (`js/archie.js`) remains the owning
system for *intelligence and personality*: message wording, reasoning
about what should be communicated, personality/tone selection, typing
animation, holo visual effects, and Archie's operational presence/status
indicator (READY, THINKING, BRIEFING, etc.). `Archie.deliver()`/`Archie.typeMessage()`
remain the single place where a message is actually rendered and animated — this
decision does not duplicate that logic inside `CommunicationSystem`.
`Archie.onCommunicationDeliveryComplete()` is the boundary-preserving
contract through which Archie owns presentation-state transitions
after CommunicationSystem completes delivery orchestration.

**Reason**
Before this phase, DOM target lookups existed independently in both
`Archie.init()` and `CommunicationSystem.registerTargets()`, and
several delivery paths (`updateArchieDashboard()`'s hero greeting/brief,
`showNotification()`) called `Archie.typeMessage()` directly, bypassing
`CommunicationSystem`'s queue entirely. This created two parallel,
non-communicating delivery pipelines and duplicate DOM references,
making it unclear which system "owned" delivery and increasing the risk
of divergence (e.g., a DOM element being updated on `Archie.targets`
but stale on `CommunicationSystem.targets`, or vice versa).

  **Consequences**
- **Phase 3A:** `Archie.init()` now delegates DOM target resolution to `CommunicationSystem.registerTargets()` (guarded, with fallback to Archie's original independent lookups). `Archie.targets` and `CommunicationSystem.targets` now hold identical references — verified via console equality checks.
- **Phase 3B-1:** `updateArchieDashboard()`'s hero greeting/brief delivery now routes through `CommunicationSystem.send()` instead of calling `Archie.typeMessage()` directly, guarded with fallback. `CommunicationSystem.deliver()` continues to delegate to `Archie.deliver()` internally whenever `Archie` is present — this decision does not change that delegation, it only changes how messages *enter* the pipeline.
- A regression was discovered and corrected during 3B-1: `Archie.deliver()` calls `setStatus("briefing")` for every target branch, a side effect that hero-greeting/hero-brief never previously triggered (since they bypassed `deliver()` entirely). This was fixed by removing `setStatus()` specifically from the `hero-greeting`/`hero-brief` branches, preserving original status-indicator behavior for hero delivery.
- A **separate, pre-existing** issue was identified during Phase 3B-1: the `dashboard`/`briefing` targets set status to `"briefing"` via `CommunicationSystem.send()` → `Archie.deliver()`, bypassing `Archie.processQueue()`'s reset-to-`ready` logic, leaving the status indicator stuck on "BRIEFING" after those deliveries. This was confirmed present before Phase 3B-1 as well (via `git stash` comparison) and was intentionally left unresolved at that time, flagged for a future decision.
- **Phase 3B-2:** `showNotification()`'s notification typing now routes through `CommunicationSystem.send()` instead of calling `Archie.typeMessage()` directly, guarded with fallback. A new `notification-message` target was introduced in `Archie.deliver()`, distinct from the existing `notification` target (which calls `showNotification()` itself) — this separation was required to prevent infinite recursion, since `CommunicationSystem`'s default target is also `"notification"`. The `force` flag is now forwarded end-to-end (`CommunicationSystem.send({force:true})` → `transmission.force` → `Archie.typeMessage(el, text, {force})`), preserving the ability to type while `Archie.paused === true`. Per the same precedent as hero delivery, the `notification-message` branch omits `setStatus()` to preserve original no-status-change behavior. `CommunicationSystem`'s queue was deliberately left as plain FIFO (`push()`/`shift()`) — force does not queue-jump — to avoid modifying queue *behavior* in this phase; this was an explicit decision, not an oversight.
- **Phase 5B — Guarded communication migration and lifecycle synchronization (Completed):** `Archie.say()`/`Archie.speak()` now delegate to `CommunicationSystem.send()` via guarded migration (`typeof CommunicationSystem !== "undefined" && typeof CommunicationSystem.send === "function"`) when available, preserving the legacy Archie queue as compatibility fallback only (`js/archie.js:164` delegates; `js/archie.js:268` `Archie.processQueue` retained as fallback, noted `FALLBACK ONLY`). `CommunicationSystem.processQueue()` (`systems/communication.system.js:165`) is now the authoritative lifecycle owner (queue, order, busy, pause, delivery orchestration) and, after `deliver()`, invokes `Archie.onCommunicationDeliveryComplete(transmission)` as a boundary-preserving contract so Archie retains ownership of visual/presence state transitions (`READY`/`BRIEFING`, holo/speech) without CommunicationSystem manipulating `Archie.setStatus()` directly. This fixes the `dashboard`/`briefing` `BRIEFING → READY` stuck-status issue: briefing-family targets (`briefing`/`dashboard`/`dashboard-greeting`) now reset to `READY` after a 1200ms post-delivery cadence via `Archie.onCommunicationDeliveryComplete()`, while `hero-greeting`/`hero-brief`/`notification-message` intentionally preserve the historical no-status-change behavior (verified by the absence of `setStatus()` in those `deliver()` branches). Pause/resume lifecycle is now synchronized in `js/notifications.js:28,104` — `showNotification()` pauses both `CommunicationSystem` and `Archie`, and `beginBriefing()` resumes both via guarded additive calls — preserving `force:true` typing for `notification-message` during the blocked popup and FIFO ordering without queue-jump semantics. Verified that `Archie.deliver()`/`Archie.typeMessage()` remain the single rendering site; no wording, timing, animation, or notification behavior changed.

  **Migration Notes**

- All changes in this ADR use the guarded-fallback pattern: `typeof CommunicationSystem !== "undefined" && typeof CommunicationSystem.send === "function"`, else call `Archie.typeMessage()` (or Archie legacy queue) directly — consistent with ADR-001 and ADR-002's migration approach. Phase 5B's `Archie.say/speak → CommunicationSystem.send` delegation also uses this pattern (see `js/archie.js:196`).
- Message wording, delivery timing (including the 600ms hero greeting→brief cadence), and visual effects (holo pop, typing pulse) are unchanged by this ADR — only the *entry point* into the delivery pipeline and the post-delivery presentation reset contract changed.
- Each call-site migration was implemented and committed as its own isolated, revertible step rather than one large change, per "small migrations beat large rewrites."

**Related Phases**
- Commit `8556c9c` — Checkpoint before Phase 3A
- Commit `83f02ac` — Phase 3A: DOM target de-duplication between Archie and CommunicationSystem
- Commit `7318345` — Checkpoint before Phase 3B-1
- Commit `7267c2e` — Phase 3B-1: Route hero greeting/brief delivery through CommunicationSystem.send()
- Commit `0160704` — Checkpoint before Phase 3B-2
- Commit `34f3b9d` — Phase 3B-2: Route notification typing through CommunicationSystem.send() (target: notification-message, force preserved, FIFO queue, no recursion)
- Phase 5B — Guarded migration of Archie.say/speak to CommunicationSystem.send + synchronized pause/resume + boundary-preserving BRIEFING→READY fix via `Archie.onCommunicationDeliveryComplete()` (status reset now implemented)

### Remaining Architectural Debt for ADR-003 (Intentionally Retained — Does Not Indicate Incomplete Migration)

The following are documented, intentional residuals from prior phases. They do not block ADR-003 completion but are recorded per Documentation Is Part of Product (`docs/ENGINEERING_CONSTITUTION.md`) and `docs/FounderOS Docs/ENGINEERING_PRINCIPLES.md`:

- **Archie legacy queue fallback (retained by constraint):** `Archie.queue`/`Archie.isSpeaking`/`Archie.paused`/`Archie.pendingActions` and `Archie.processQueue()`/`Archie.resume()`/`Archie.typeMessage()` pause-deferral remain in `js/archie.js:33,35,54,55,268,509,586` as compatibility fallback only when `CommunicationSystem` is unavailable. Not removed in Phase 5B per explicit constraint; marked `FALLBACK ONLY`. Future phase may fully deprecate once authoritative path coverage is verified.
- **Notification lifecycle ownership:** `js/notifications.js` still owns modal pause/resume orchestration and `startArchieBriefing` dispatch. This is shared orchestration coupling across both pipelines. A future phase could consolidate notification lifecycle into `CommunicationSystem` or `ArchieCore` via an explicit ownership decision.
- **Global coupling:** Bidirectional `typeof Archie` / `typeof CommunicationSystem` guards (`systems/communication.system.js:223`, `js/archie.js:196`) and direct `Archie.paused` property mutation rather than `Archie.pause()` method. `ModuleRegistry`/`ArchieCore.systems` are not yet the resolution mechanism for these globals. Remains for backwards-compatibility; future phase may route resolution through the registry.
- **Typing/timing constant duplication:** `typingSpeed`/`cursorCharacter`/`wait` helpers duplicated across `js/archie.js:39,41,546` and `systems/communication.system.js:41,42,308`. Ownership of timing/presentation constants remains with Archie by design (no duplication introduced in Phase 5B), but duplication is tracked for future consolidation.
- **Direct dashboard textContent bypass:** `updateArchieDashboard()`'s `archie-greeting`/`archie-daily-brief` instant `textContent` writes bypass the queued pipeline, while hero targets are queued. Tracked as a targeted future migration, not required for ADR-003 closure.

---

## ADR-004: Personality Ownership Separation

## Date
2026-08-04

## Status
Accepted

## Decision
Create PersonalitySystem as a dedicated system boundary for Archie personality responsibilities.

## Reason
Personality-related responsibilities were distributed across multiple locations, creating unclear ownership boundaries.

## Consequences
- Personality logic can evolve independently.
- ArchieCore coordinates personality but does not own all personality behavior.
- CommunicationSystem remains responsible for delivery, not personality generation.
- Existing behavior remains unchanged until approved migrations occur.

## Migration Notes
- Phase 3C-1 completed.
- PersonalitySystem foundation created.
- Phase 3C-2A completed: `generateArchieLogNote()` migrated into `PersonalitySystem`.
- Phase 3C-2B completed: `getArchieGreeting()` migrated into `PersonalitySystem`.
- `PersonalitySystem` now owns its first active personality responsibility.
- Phase 3C-2C completed
- getArchieVisitMessage() migrated into PersonalitySystem
- PersonalitySystem now owns three active personality responsibilities:

  - generateArchieLogNote()
  - getArchieGreeting()
  - getArchieVisitMessage()

- Reference implementation commit:
  94b4d7b

- Phase 3C-2D completion
- getArchieMissionMemory() migrated into PersonalitySystem
- PersonalitySystem now owns four active personality responsibilities:

  - generateArchieLogNote()
  - getArchieGreeting()
  - getArchieVisitMessage()
  - getArchieMissionMemory()

- Reference implementation commit:
  501414e

- Phase 3C-2E completion
- Generic Archie brief generation migrated into PersonalitySystem
- PersonalitySystem now owns five active personality responsibilities:

  - generateArchieLogNote()
  - getArchieGreeting()
  - getArchieVisitMessage()
  - getArchieMissionMemory()
  - getArchieGenericBrief()

- Reference implementation commit:
  2a9ac77

## Related Phases
- Phase 3C-1
- Commit: 6bbdefd
- Checkpoint: 9eb283f
- Phase 3C-2A
- Commit: d37df19 (Migrate Archie log note generation to PersonalitySystem)

---

## ADR-005: Mission Intelligence is a Judgment Layer

## Title: Mission Intelligence is a Judgment Layer

## Decision

Mission Intelligence will function as a judgment layer within FounderOS.

It will not own source data.

It will not replace existing systems.

Instead, it will synthesize outputs from existing systems into clear Commander recommendations.

## Rationale

MemorySystem owns memory.
DecisionSystem owns reasoning about current session state.
GuidanceSystem owns actionable guidance.
PersonalitySystem owns tone and personality.
BriefingSystem owns briefing construction.
CommunicationSystem owns delivery.

Mission Intelligence owns only one responsibility:

Judgment.

It interprets existing information to answer:

"Given everything FounderOS currently knows, what matters most right now?"

## Consequences

Positive:

- Preserves single ownership.
- Prevents duplicated logic.
- Supports incremental capability growth.
- Aligns with Engineering Principle:
  "Every feature has one owner."
- Aligns with Separation of Intelligence.

Negative:

- Mission Intelligence depends on other systems.
- Recommendation quality is limited by available context.
- Richer recommendations require future evolution of underlying systems rather than expanding Mission Intelligence's ownership.

## Status

Accepted / Implemented

### Implementation Status
MissionIntelligenceSystem is now fully established as FounderOS's judgment layer. It has been created and registered, and its `recommendToday()` method provides a stable recommendation contract. The system synthesizes outputs from `DecisionSystem` and `GuidanceSystem` rather than duplicating their responsibilities. `ArchieCore` now orchestrates Mission Intelligence between `GuidanceSystem` and `BriefingSystem`, and `BriefingSystem` consumes Mission Intelligence additively. Existing briefing behavior remains unchanged when recommendations are unavailable, successfully preserving single ownership and ensuring backward compatibility.

### Lessons Learned
- Truthful recommendations are more valuable than fabricated intelligence; null is preferable to invented certainty.
- An additive architectural approach prevented regressions in core functionality, with the exception of a legacy syntax regression in `js/archie.js` that was exposed during browser verification, highlighting the value of end-to-end testing.

## Related Documents

Reference:

- PHASE_4A_MISSION_INTELLIGENCE.md
- KNOW_WHAT_MATTERS_TODAY.md
- ENGINEERING_PRINCIPLES.md

---

## ADR-006: Mission Intelligence Identifies Progress Obstacles Through Evidence-Based Judgment

**Date:** Phase 4A-3
**Status:** Proposed

**Decision**

Mission Intelligence will extend its judgment responsibility to include identifying observable conditions that may prevent progress. It will synthesize available evidence and present possible blockers to the Commander without making character judgments or inferring psychological states.

Mission Intelligence does not own source data. It will not replace or duplicate responsibilities held by DecisionSystem, GuidanceSystem, or other owner systems. Instead, it will interpret and explain existing context to answer: "What is preventing progress?"

**Context**

FounderOS's product philosophy assumes that progress most often halts because something unresolved exists, not because the Commander lacks commitment. Blockers are frequently logistical or informational: missing inputs, unresolved decisions, unavailable prerequisites, or unclear next steps. Recording this as an explicit architectural boundary ensures the system remains honest, respectful, and architecturally consistent.

Possible blockers include but are not limited to:

- missing information
- missing decisions
- missing prerequisites
- unresolved dependencies
- insufficient context to make a grounded recommendation

**Architectural Ownership**

Mission Intelligence:
- synthesizes evidence from existing systems
- identifies possible blockers grounded in observable context
- explains the uncertainty and invites Commander confirmation

DecisionSystem:
- owns session-state analysis and the decision contract

GuidanceSystem:
- owns actionable next steps and execution-oriented guidance

BriefingSystem:
- owns Commander-facing presentation of structured judgment

PersonalitySystem:
- owns communication tone and persona

**Evidence Boundary**

Allowed inputs for blocker identification:

- observable conditions in mission context
- missing or incomplete Commander inputs
- known unresolved decisions
- recorded dependencies expressed in project context

Disallowed inferences:

- assumptions about laziness, motivation, or character
- motivation scoring or emotional diagnosis
- psychological conclusions unsupported by explicit Commander input

**Reasoning Principle**

Evidence before conclusions.

When proposing a possible blocker, Mission Intelligence must:

1. Explain what FounderOS currently knows.
2. Explain what FounderOS does not know.
3. Explain why that condition is being considered a blocker.
4. Invite the Commander to confirm or correct the understanding.

**Consequences**

Benefits:

- clearer, evidence-based explanations for stalled progress
- increased trust due to honest treatment of uncertainty
- protection against harmful or demotivating assumptions
- preserved responsibility boundaries among systems

Tradeoffs:

- Mission Intelligence may frequently require Commander clarification before offering a definitive recommendation
- The system may intentionally withhold strong recommendations when context is insufficient, which can feel less decisive but is more honest

**Intervention Boundary**

Mission Intelligence may identify possible obstacles, but identification does not automatically require interruption. FounderOS separates awareness from intervention: a possible blocker may exist without requiring immediate Commander-facing communication. Archie should consider surfacing an observation when it provides meaningful value, for example when:

- the same obstacle recurs across multiple interactions
- progress remains blocked for an extended period
- the condition directly prevents the next recommended action

FounderOS does not optimize for maximum intervention. It optimizes for appropriate, intentional intervention. The Commander remains responsible for pace, decisions, and direction.

**Alternatives Considered**

1. Psychological inference system — Rejected. FounderOS must avoid inferring internal emotional states without explicit Commander input.

2. GuidanceSystem owning blocker identification — Rejected. Guidance produces next steps; judgment about blockers is a distinct responsibility that fits Mission Intelligence's role.

3. Separate BlockerSystem — Rejected. Mission Intelligence already exists as the judgment layer; creating a separate blocker system would duplicate judgment responsibilities and complicate ownership.

**Implementation Boundary**

This ADR does NOT authorize:

- behavioral scoring or psychological profiling
- emotion or motivation analysis
- productivity surveillance
- autonomous changes to missions or commitments
- ingesting external data for psychological inference

**Success Criteria**

The capability is successful when:

- the Commander understands what is preventing progress
- Archie identifies obstacles without assigning blame
- recommendations remain grounded in observable evidence
- the Commander remains the final authority over decisions



