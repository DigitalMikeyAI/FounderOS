# FounderOS Modules

> FounderOS provides the operating system.
> Modules provide the mission context.
> The Commander defines success.

## Purpose

FounderOS is evolving from an AI assistant into an AI operating system for human growth. No single experience, curriculum, or workflow can cover every human ambition. Growth happens across distinct domains — a sales floor, a founder journey, a learning path, a personal mission — each with its own knowledge, language, and measures of progress.

A FounderOS Module exists to make a domain of growth first-class within FounderOS without fragmenting FounderOS into disconnected applications.

Modules exist so that:

- The Commander can pursue a meaningful mission area with continuity and context, not as a one-off task.
- Domain knowledge compounds inside FounderOS memory and progression, rather than evaporating after a session.
- FounderOS can scale to many mission areas while preserving a coherent identity, a single Commander history, and a single trusted guide — Archie.

A module is not a plugin that replaces FounderOS. It is a bounded context that **extends** FounderOS for one mission domain and integrates through FounderOS Core Systems.

## Core Principle

**A module represents a mission domain, not a separate application.**

A mission domain is a meaningful area of growth that the Commander has chosen to pursue — for example, mastering RV sales, building a business, or completing a learning path. The domain has its own knowledge, patterns, and practice, but the Commander's progress belongs to one person, one identity, one Mission Workspace.

If a module requires its own login, its own AI personality, its own memory store, or its own progression system, it has violated this principle. It has become an isolated application. FounderOS Modules are intentionally constrained so that this cannot happen.

## Ownership Boundaries

Ownership follows `docs/ENGINEERING_CONSTITUTION.md:98` — *Prefer extending existing systems. Ask: Does an existing owner already exist?* — and `docs/FounderOS Docs/ENGINEERING_PRINCIPLES.md:13` — *Every feature has one owner.*

### FounderOS Core Owns

FounderOS Core owns all shared capabilities that must remain singular and consistent across every module. Modules must not duplicate or replace these.

- **Identity** — Who the Commander is. Managed by `systems/commander.system.js` delegating to `js/storage.js`. The Commander has one identity, one name, one level/title, one onboarding state.
- **Memory** — What has been learned and archived. Managed by `systems/memory.system.js` (`founder.memory.artifacts`, `founder.profile`, `founder.commandLog`). Domain artifacts are stored as typed entries inside core memory, not in module-private stores.
- **Communication** — How FounderOS speaks to the Commander. Managed by `systems/communication.system.js` as the authoritative delivery pipeline and `js/archie.js` as the intelligence/personality renderer (ADR-003). Modules present information *through* this pipeline.
- **Progression** — How growth is recognized. XP, streak, rank thresholds, and `founder.commandLog` history. Modules may contribute domain-relevant signals to progression; they do not own the progression ledger.
- **Mission Workspace** — Where meaningful work happens. Defined in `docs/capabilities/MISSION_WORKSPACE.md`. The Workspace presents the current Mission, its context, purpose, resources, Archie partnership, and reflection — one active Mission and one active Mission Plan at a time (v0.1). Modules supply *mission context* for the Workspace; they do not define a competing workspace.
- **AI Reasoning** — What deserves attention, what guidance to offer, what judgment to surface. Owned by `systems/decision.system.js`, `systems/guidance.system.js`, `systems/briefing.system.js`, and `systems/mission-intelligence.system.js` per ADR-005/006 and Separation of Intelligence (`docs/FounderOS Docs/ENGINEERING_PRINCIPLES.md:44`). Modules supply domain evidence; they do not own reasoning or produce competing decisions.
- **System Orchestration** — How systems coordinate. Owned by `js/core/archie-core.js` (`beginSession`, `refreshSession`, `deliverBriefing`) and `modules/registry.js` / `modules/loader.js` (dormant manifest `window.FounderOSModuleManifest`, ADR-001). Modules register and are discovered; they do not own boot, session, or orchestration order.

### Modules Own

Within those boundaries, a module owns everything that is specific to its mission domain and has no reason to exist outside it.

- **Domain knowledge** — The canonical facts, concepts, and terminology that define competence in the domain.
- **Domain-specific learning material** — Curated inputs the Commander studies within the domain (for example, Knowledge Cards, reference notes, or curriculum entries — conceptual only at this stage).
- **Mission context** — The current domain-relevant objectives, scenarios, and examples that give the active Mission its meaning inside the Workspace (per `docs/capabilities/MISSION_WORKSPACE.md:58` — *Mission Resources* and *Context Before Content*).
- **Domain-specific workflows** — The practice sequences that are meaningful only in this domain (for example, handling a customer conversation, logging a field observation, or rehearsing a skill). Workflows produce evidence that Core memory then preserves.
- **Domain-specific resources** — Supporting material that helps complete the current Mission in this domain and nothing else. Resources exist because the Mission needs them, not because they are generally useful.

## Module Rules

These rules are constraints. A module that cannot satisfy them should not exist as a module.

1. **Modules extend FounderOS; they do not replace it.** A module adds domain context to the existing Mission Workspace, Command Log, and Archie partnership. It does not provide an alternate shell, navigation, or home screen.

2. **Modules must not duplicate core systems.** No module may implement its own memory store, communication queue, progression ledger, decision/guidance/briefing logic, or orchestration. If a capability already has an owner in FounderOS Core, the module uses that owner.

3. **Modules must not create independent AI personalities.** FounderOS has one trusted guide — Archie. Personality, tone, and voice are owned by `systems/personality.system.js` (ADR-004). A module may inform Archie's domain understanding; it may not introduce a second assistant, second voice, or second briefing.

4. **Modules must not own global user state.** The Commander is singular. `founder` and its sub-fields (`identity`, `memory`, `profile`, `commandLog`, `mission`) are owned by Core. A module's persistent state is modeled as typed artifacts inside `founder.memory.artifacts` via `MemorySystem.saveArtifact()` and recalled via `MemorySystem.recall()`, not as a parallel user object.

5. **Modules must communicate through FounderOS systems.** Any Commander-facing message, recommendation, or reflection prompt flows through `CommunicationSystem` / Archie delivery (ADR-003). Any judgment about what matters next flows through Mission Intelligence's evidence boundary (ADR-006). Direct DOM or global side-effects from a module are not permitted.

6. **Modules must preserve the Commander's authority.** Per `docs/capabilities/MISSION_WORKSPACE.md:66`, the Workspace supports — it does not control. A module may not pressure, invent deadlines, generate productivity guilt, or override Mission Planning. The Commander always chooses whether to follow guidance.

7. **Modules are designed for the Mission Workspace.** A module's value is measured by whether the Commander immediately understands *Where am I? Why am I here? What should I do next?* (`docs/capabilities/MISSION_WORKSPACE.md:44`). If a module's content distracts from the current Mission rather than focusing attention on it, it fails the Focus Before Features test (`docs/capabilities/MISSION_WORKSPACE.md:30`).

## Example Module

### Camping World Academy — The First Real-World FounderOS Module

**Camping World Academy is the first real-world FounderOS Module.** It is not a Camping World CRM, not a sales dashboard, and not a productivity tracker for managers. It is a **learning and growth environment for developing RV sales expertise** inside FounderOS.

The Commander's mission in this domain is to become more capable as an advisor to customers — someone who understands the product, reads the situation, communicates clearly, follows through, and reflects honestly on what was learned. The module's purpose is to make that growth visible and supported, mission by mission, inside the shared FounderOS systems.

As a FounderOS Module, Camping World Academy is bounded by the ownership rules above:

- Archie remains the Commander's guide; the module informs Archie's domain context but does not create a second assistant.
- Progress remains the Commander's single progression history; domain practice contributes to the same XP/streak/rank and `commandLog` that every other mission contributes to.
- Knowledge is preserved as typed artifacts in core memory, so lessons learned on the sales floor compound with the Commander's broader growth.

Conceptually, Camping World Academy exercises the module-owned areas without prescribing UI or schemas (schemas remain in `docs/modules/schemas/` as separate concerns):

- **Knowledge Cards** — Concise, reusable domain knowledge that the Commander can study and Archie can reference as evidence. They represent *what the Commander needs to know* to handle the Mission well.
- **Field Reports** — Structured capture of real-world observations and actions taken on the floor, producing evidence for `ReflectionSystem` rather than disappearing after a shift.
- **Customer Patterns** — Recurring situations and intents that help the Commander recognize what a customer is actually trying to accomplish, informing guidance without inventing urgency.
- **Objection Library** — Documented objections and principled responses that support *how* the Commander accomplishes the Mission, owned as domain knowledge, not as a script the system enforces.
- **Reflection** — Post-execution capture of what was attempted, what worked, and what will be tried next — consumed by `ReflectionSystem` to produce artifacts that `MemorySystem` preserves and `founder.profile` learns from.
- **Practice** — Rehearsal sequences for skills that matter in this domain, expressed as mission-specific workflows whose completion produces evidence, not as a generic task list.

The success criterion for Camping World Academy is not that it looks like a sales tool. It is that a new associate can open the Mission Workspace, immediately understand the current learning Mission, receive evidence-backed guidance, practice deliberately, and see that practice reflected in FounderOS memory and progression — per `docs/capabilities/MISSION_WORKSPACE.md:88`.

## Future Expansion

The same architecture applies to any meaningful mission area the Commander chooses to pursue. Future modules use the identical boundaries — FounderOS Core continues to own identity, memory, communication, progression, Mission Workspace, AI reasoning, and orchestration; the module supplies domain context.

Potential mission areas (examples, not commitments):

- **Career growth** — Developing capability within a role or trade. Domain knowledge and practice live in the module; career progress remains the Commander's single progression and profile.
- **Entrepreneurship** — Exploring an idea, validating an audience, shaping an offer. Each could be a module or a mission domain under the same Workspace, without duplicating planning or intelligence.
- **Learning** — A structured learning path or curriculum. The module owns knowledge organization and learning-specific workflows; FounderOS owns the learning record and recommendations.
- **Health** — A physical or well-being domain where consistency and reflection matter more than dashboards. The module owns domain resources and practice patterns; FounderOS owns encouragement and accountability.
- **Personal goals** — Any long-running ambition that benefits from mission framing — creative projects, community goals, or personal development.

In each case, the test is: *Does this represent a domain of growth worth pursuing mission by mission?* If yes, it is a candidate for a module. If it is simply a feature, it belongs as an extension of a core system instead.

No calendar, project-management suite, notification center, or multi-workspace is authorized by this document. Such needs require their own capability philosophy and ADR before implementation, per `docs/ENGINEERING_CONSTITUTION.md:54`.

## Non-Goals

Explicitly, FounderOS Modules are **not**:

- **Separate applications.** They are not standalone apps embedded inside FounderOS with their own shell, auth, or navigation.
- **Replacements for FounderOS Core.** They do not replace `commander.system`, `memory.system`, `communication.system`, progression, the Mission Workspace, or Mission Control orchestration.
- **Generic productivity dashboards.** The Mission Workspace organizes attention, not widgets (`docs/capabilities/MISSION_WORKSPACE.md:22`). A module that becomes a task list or metrics screen has failed the Workspace philosophy.
- **Independent AI assistants.** There is one guide. Modules inform Archie's context; they do not create a second AI to compete with Archie.
- **Designs for UI, schemas, or data models at this stage.** This document defines *architecture and ownership*. Conceptual areas like Knowledge Cards or Field Reports are descriptive; schemas, storage shapes, and interfaces require separate, approved capability documents before implementation.

## Architectural Principle

**FounderOS provides the operating system.**
**Modules provide the mission context.**
**The Commander defines success.**

FounderOS Core guarantees that identity, memory, communication, progression, and the Mission Workspace remain coherent — so the Commander never has to reassemble themselves across tools. Modules make each meaningful mission domain rich enough to learn, practice, and reflect within — so growth in one domain strengthens the whole Commander. And the Commander, never the system, decides what a meaningful life of missions adds up to.

When workflow becomes more important than the work itself, FounderOS has failed (`docs/capabilities/MISSION_WORKSPACE.md:132`). This architecture exists to keep that from happening — at one module, and at any number of modules.

---

*Alignment: This document is a direct expression of `docs/ENGINEERING_CONSTITUTION.md` (Philosophy Before Architecture, Smallest Truthful Implementation, Documentation Is Part of Product), `docs/FounderOS Docs/ENGINEERING_PRINCIPLES.md` (Every Feature Has One Owner, Communication Through Systems, Separation of Intelligence), `docs/ARCHITECTURE_DECISIONS.md` (ADR-001 Module Registry, ADR-003 Communication Ownership, ADR-005/006 Mission Intelligence), and `docs/capabilities/MISSION_WORKSPACE.md` (Focus Before Features, Context Before Content, Presence Without Pressure, One Active Mission).*
