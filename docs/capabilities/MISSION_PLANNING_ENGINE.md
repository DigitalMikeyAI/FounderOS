# Mission Planning Engine

> Mission Plans are not promises. They are evidence-backed hypotheses.

## Purpose

The Mission Planning Engine transforms a Commander's long-term vision into a living, personalized Mission Plan. It bridges the gap between understanding and execution without overriding the Commander's authority.

## The Core Question

How does FounderOS transform a Commander's vision into a personalized, adaptable Mission Plan?

## Mission Statement

FounderOS proposes and continuously refines a Mission Plan that reflects the Commander's chosen destination, current understanding, and demonstrated progress. The Mission Plan is a living hypothesis — not a fixed prescription — and adapts as new evidence becomes available.

## Vision

A Vision is the future the Commander has intentionally chosen to pursue.

Unlike a goal, a Vision is long-term and may require many evolving Mission Plans to achieve.

FounderOS never defines the Commander's Vision.

It helps transform that Vision into meaningful progress.

## Philosophy

A destination belongs to the Commander. Navigation belongs to Archie.

FounderOS never decides what future the Commander should pursue. It helps identify the most reasonable next step toward the future the Commander has chosen. Mission Plans are expected to evolve. Changing direction is not failure; it is new evidence.

## The Mission Plan

A Mission Plan is:

- a living roadmap
- personalized to the Commander's goals and evidence
- evidence-backed and explainable
- adaptable as new evidence appears
- continuously refined

A Mission Plan is not:

- a mere task list
- a rigid curriculum
- a productivity system
- a guarantee of success

## The Commander's Authority

The Commander owns the destination, the vision, and the final decision.

FounderOS owns navigation, recommendations, adaptation, and evidence-backed planning. FounderOS may recommend; the Commander always decides.

## The Navigation Principle

"Archie never owns the destination. He owns the navigation."

This preserves Commander Authority while allowing FounderOS to provide meaningful, evidence-based guidance that adapts as reality changes.

## Evidence Before Planning

Mission Plans should be informed by observable inputs only:

- Commander goals and stated priorities
- completed workshops and artifacts
- demonstrated strengths
- completed missions and outcomes
- identified blockers
- confirmed learning
- explicit Commander feedback

Mission Plans must never be generated from assumptions alone.

## Decision Boundaries

The Mission Planning Engine may:

- recommend milestones and achievable next missions
- adapt recommendations as evidence changes
- explain its reasoning and acknowledge uncertainty

The Mission Planning Engine may not:

- decide the Commander's destination
- force progression or deadlines
- assume motivations or intent
- invent experience or fabricate certainty

## Success Criteria

This capability succeeds when:

- different Commanders receive different, personalized Mission Plans
- recommendations remain traceable to evidence
- Mission Plans evolve without losing context
- the Commander feels guided, not controlled

North Star:

"The Commander should always know where they are going, why they are going there, and what the most reasonable next step is."

## Initial Scope (v0.1)

Keep the first implementation deliberately conservative:

- one long-term Vision supported
- one active Mission Plan at a time
- one current Milestone
- one recommended Mission
- no UI changes
- no persistence changes
- no calendar integration
- no automatic task generation
- no AI-generated life plans

## Future Evolution

High-level possibilities:

- multiple Mission Plans and branching pathways
- dynamic milestone adjustment
- reusable, domain-specific planning templates
- collaborative planning with the Commander

Refer to the Future Evolution section in other capability docs for consistent guidance. Do not treat these items as commitments.

## FounderOS Principle

Mission Plans are evidence-backed hypotheses. FounderOS earns trust by adapting to reality rather than pretending to predict it.

FounderOS does not create futures.

It helps the Commander build the future they choose.

# Planning Principle

Planning is not prediction.

Planning is the disciplined use of current evidence to choose the most reasonable next step while remaining willing to adapt when reality changes.

## Implementation Status

### Implemented Scope (v0.1)

- MissionIntelligenceSystem now exposes generateMissionPlan(session, decision, guidance, reflection).
- v0.1 produces an internal MissionPlan object when sufficient evidence exists.
- MissionIntelligenceSystem remains the owner for v0.1; no new system was created.
- recommendToday(...) may optionally include missionPlan: MissionPlan | null as an internal, non-displayed field.
- Mission Plans produced are evidence-backed, explainable, and non-persistent.

### Current MissionPlan Contract

When present, a MissionPlan contains the following conceptual fields:

- vision — the Commander’s expressed long-term destination
- currentStage — the Commander’s current mission stage (if available)
- currentMilestone — the immediate milestone derived from guidance
- recommendedMission — the mission recommended given current evidence
- whyThisMission — a concise, evidence-backed rationale
- successLooksLike — a conservative success criterion drawn from guidance
- evidence — a list of factual pointers used to build the plan

Each field is intentionally minimal and traceable to the original artifacts or guidance. The MissionPlan is a proposal, not a prescription.

### Current Limitations

- Mission Plans are generated internally and are not yet surfaced to the Commander.
- Only one Mission Plan is supported in v0.1.
- No persistence was added; Mission Plans are not stored in MemorySystem.
- No adaptive replanning or multiple pathways are included in v0.1.
- No automatic task generation or calendar integration.

### Verification

- Implementation engineer performed code inspection and conservative static verification.
- Founder browser smoke test passed: application loaded, console showed no errors of concern, notification/typing and briefing behavior functioned, and the Direction Workshop behaved as expected.
- No visible Commander-facing behavior changed as a result of this internal capability.

### Future Evolution

Refer to the existing Future Evolution section above. Any future changes to how Mission Plans are surfaced, persisted, or adapted will require explicit product and architecture decisions.

### Implementation Reference

Implementation exists in MissionIntelligenceSystem (generateMissionPlan). The implementation commit will be referenced after Founder authorization to create the commit in the repository history.
