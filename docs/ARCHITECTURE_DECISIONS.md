
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

**Date:** Phase 3 (3A, 3B-1, 3B-2 — in progress)
**Status:** Accepted / In Progress


**Decision**
`CommunicationSystem` (`systems/communication.system.js`) is the owning
system for message *delivery infrastructure*: DOM target resolution,
the outbound transmission queue, and routing decisions about where a
message should render. `Archie` (`js/archie.js`) remains the owning
system for *intelligence and personality*: message wording, typing
animation, holo visual effects, and Archie's operational status
indicator. `Archie.deliver()`/`Archie.typeMessage()` remain the single
place where a message is actually rendered and animated — this
decision does not duplicate that logic inside `CommunicationSystem`.

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
- A **separate, pre-existing** issue was identified but intentionally left unresolved in this phase: the `dashboard`/`briefing` targets set status to `"briefing"` via `CommunicationSystem.send()` → `Archie.deliver()`, bypassing `Archie.processQueue()`'s reset-to-`ready` logic, leaving the status indicator stuck on "BRIEFING" after those deliveries. This was confirmed present before Phase 3B-1 as well (via `git stash` comparison) and is out of scope for this ADR's phases; it is flagged here for a future decision.
- **Phase 3B-2:** `showNotification()`'s notification typing now routes through `CommunicationSystem.send()` instead of calling `Archie.typeMessage()` directly, guarded with fallback. A new `notification-message` target was introduced in `Archie.deliver()`, distinct from the existing `notification` target (which calls `showNotification()` itself) — this separation was required to prevent infinite recursion, since `CommunicationSystem`'s default target is also `"notification"`. The `force` flag is now forwarded end-to-end (`CommunicationSystem.send({force:true})` → `transmission.force` → `Archie.typeMessage(el, text, {force})`), preserving the ability to type while `Archie.paused === true`. Per the same precedent as hero delivery, the `notification-message` branch omits `setStatus()` to preserve original no-status-change behavior. `CommunicationSystem`'s queue was deliberately left as plain FIFO (`push()`/`shift()`) — force does not queue-jump — to avoid modifying queue *behavior* in this phase; this was an explicit decision, not an oversight.
- Two independent queue/pause states (`Archie.queue`/`Archie.paused` vs. `CommunicationSystem.queue`/`CommunicationSystem.paused`) remain unreconciled — this ADR does not unify them; that remains a candidate for a future phase.

**Migration Notes**

- All changes in this ADR use the guarded-fallback pattern: `typeof CommunicationSystem !== "undefined" && typeof CommunicationSystem.send === "function"`, else call `Archie.typeMessage()` directly — consistent with ADR-001 and ADR-002's migration approach.
- Message wording, delivery timing (including the 600ms hero greeting→brief cadence), and visual effects (holo pop, typing pulse) are unchanged by this ADR — only the *entry point* into the delivery pipeline changed.
- Each call-site migration was implemented and committed as its own isolated, revertible step rather than one large change, per "small migrations beat large rewrites."

**Related Phases**
- Commit `8556c9c` — Checkpoint before Phase 3A
- Commit `83f02ac` — Phase 3A: DOM target de-duplication between Archie and CommunicationSystem
- Commit `7318345` — Checkpoint before Phase 3B-1
- Commit `7267c2e` — Phase 3B-1: Route hero greeting/brief delivery through CommunicationSystem.send()
- Commit `0160704` — Checkpoint before Phase 3B-2
- Commit `34f3b9d` — Phase 3B-2: Route notification typing through CommunicationSystem.send() (target: notification-message, force preserved, FIFO queue, no recursion)
- The `dashboard`/`briefing` status-reset issue: **not yet implemented**, pending future approval.

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

## Related Phases
- Phase 3C-1
- Commit: 6bbdefd
- Checkpoint: 9eb283f
- Phase 3C-2A
- Commit: d37df19 (Migrate Archie log note generation to PersonalitySystem)
