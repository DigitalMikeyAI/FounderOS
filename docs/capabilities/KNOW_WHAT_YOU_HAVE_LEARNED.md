# Capability 4A-4 — Know What You've Learned

> FounderOS does not merely record what the Commander completed.
> It helps preserve what the Commander came to understand.

## Purpose

Completed work should produce retained understanding, not just a faster backlog. This capability exists to capture evidence-backed insight that emerges from completed missions and workshop activities so the Commander can reuse that understanding in future decisions.

FounderOS treats learning as a distinct outcome from completion: ending a task does not automatically imply an insight. When an actual, demonstrable change in understanding occurs, FounderOS helps preserve that lesson rather than inventing one.

## The Core Question

What changed in the Commander's understanding because of this work?

This differs from "What did the Commander finish?" which is a record of completion rather than a measure of acquired understanding.

## Mission Statement

FounderOS surfaces concise, evidence-backed insights that clearly describe how the Commander's understanding has changed following completed work. These insights are grounded in completed artifacts, explicit Commander input, or mission/workshop outputs, and are presented as suggestions for future use — never as definitive personality claims.

## Philosophy

Completion is an event. Learning is a change in mental model.

- Completion: a task or mission reaches a defined end state.
- Progress: measurable forward motion toward goals.
- Insight: a retained understanding that meaningfully alters subsequent decisions.
- Retained learning: documented, evidence-backed understanding stored for future reference.

FounderOS prioritizes preserving useful understanding over producing superficial summaries. Archie may highlight a possible insight when the evidence supports it; he does not manufacture meaning from a checklist.

## Evidence Before Insight

Archie may surface a learning only when it is anchored to observable evidence:

- completed mission or workshop outputs
- explicit Commander-provided answers or selections
- before/after state captured in structured inputs

If the evidence is insufficient, Archie should acknowledge uncertainty and avoid asserting a lesson.

## Sources of Truth

Acceptable sources for identifying an insight include:

- completed mission or workshop artifacts (e.g., strength-profile produced by the Direction Workshop)
- explicit Commander responses captured during guided steps
- recorded choices or decisions made during a mission
- guidance artifacts that demonstrate a before/after change in state

FounderOS will not invent new data sources for this capability. If the required evidence is not present, Archie returns no insight.

## Decision Boundaries

Mission Intelligence may:

- summarize a single, evidence-backed learning
- identify that a Commander's understanding changed in a specific way
- state uncertainty and invite Commander confirmation

Mission Intelligence may not:

- infer personality or permanent traits
- create psychological interpretations
- manufacture lessons from mere completion
- claim permanent transformation without explicit evidence

## Commander Authority

The Commander is the final authority on whether an identified insight is accurate and meaningful. Archie may propose: "This appears to be something we learned." He must not declare: "This is who you are."

Archie should invite confirmation, correction, or richer detail from the Commander before preserving any insight for future use.

## Commander Experience

When an insight is identified, the Commander should feel:

- more aware of what changed in their understanding
- supported rather than analyzed
- empowered to reuse that learning in later decisions

Avoid presenting insights as evaluations. Keep them concise, factual, and invite the Commander's judgment.

## Non-Goals

This capability is not:

- psychological profiling or personality labeling
- generalized encouragement or platitudes
- an automated journaling system
- a guarantee that every completed task created meaningful learning
- a substitute for Commander reflection

## Success Criteria

This capability succeeds when:

- identified insight is traceable to clear evidence
- the insight adds understanding beyond a completion message
- the Commander can confirm, reject, or refine the insight
- no unsupported personal conclusions are made

North Star:

"The Commander should leave with a clearer understanding of what they now know that they did not know before."

## Initial Scope

Keep v0.1 deliberately narrow and conservative:

- support one Direction Workshop learning path only
- produce one evidence-backed insight when present
- return null when evidence is insufficient
- no UI changes
- no new persistence or memory schema
- no psychological inference or broad natural-language interpretation

## Future Evolution

High-level possibilities (non-technical):

- learning that spans multiple missions
- recurring lessons surfaced over time
- making insights reusable as lightweight, evidence-linked notes

Any future growth must continue to respect the Commander’s authority and the principle that intelligence is earned before it is expressed.

## FounderOS Principle

FounderOS remembers understanding, not just activity.

FounderOS does not merely record what the Commander completed. It helps preserve what the Commander came to understand.

## Learning Is Not Teaching

FounderOS does not attempt to "teach lessons."

Instead, it helps the Commander recognize understanding that emerged naturally through their own work.

Archie is a mirror, not a lecturer.

The value comes from helping the Commander notice meaningful patterns they have already created, rather than manufacturing wisdom on their behalf.

## Implementation Status

### Implemented Scope

- MissionIntelligenceSystem now exposes identifyLearning(artifact).
- v0.1 supports one learning path: strength-awareness from an existing strength-profile artifact.
- Learning identification consumes evidence already produced by ReflectionSystem.
- ReflectionSystem analysis is not duplicated.
- identifyLearning() returns null when evidence is insufficient.
- No new persistence or MemorySystem schema was introduced.
- No UI, BriefingSystem, CommunicationSystem, or ArchieCore behavior was changed.
- The capability remains internal and is not automatically surfaced to the Commander.

### Current Evidence Contract

The supported artifact must:

- be a valid object
- have type === "strength-profile"
- contain at least one non-empty strength
- contain supporting evidence for that strength

The resulting learning object contains:

- type
- insight
- evidence
- source

### Current Limitations

- only strength-profile artifacts are supported
- only one evidence-backed insight is selected
- no generalized learning interpretation exists
- no cross-mission learning exists
- no automatic Commander confirmation flow exists
- no separate persistence has been added
- no learning insight is currently surfaced automatically

### Verification

- Code inspection was completed by the implementation engineer.
- Founder browser smoke test passed.
- No new console errors of concern were observed.
- Existing visible FounderOS behavior remained intact.

### Future Evolution

See the existing Future Evolution section above for high-level possibilities. Any future growth must remain consistent with the principle that intelligence is earned before it is expressed.