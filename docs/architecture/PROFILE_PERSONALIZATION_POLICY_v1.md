# FounderOS Profile Personalization Policy v1

## Status and purpose

**Version:** 1.0
**Status:** Active architecture policy
**Scope:** Downstream use of Commander-approved Profile capabilities

This document answers two questions:

1. What may FounderOS do with Commander-approved Profile identity?
2. What must FounderOS never infer from that identity?

It documents the current Reflection, Briefing, and Guidance boundaries. It does not approve any additional personalization consumer or change production behavior beyond those recorded boundaries.

## Core authority invariant

> Evidence may suggest identity.
> FounderOS may recommend identity.
> Only the Commander may approve identity.
> Only the Commander may withdraw identity.

**Commander-approved identity is not evidence.**

A `developing-capability` is not:

- E5;
- a verified skill;
- a proven strength;
- objective performance;
- coaching priority; or
- mission-selection authority.

## Mandatory personalization doorway

Every downstream personalization consumer must use the canonical sanitized projection:

```text
CommanderSystem.getProfilePersonalizationContext()
→ ArchieCore.getProfilePersonalizationContext()
```

The approved projection shape is:

```js
{
  capabilityId,
  competency,
  label,
  type: "developing-capability",
  adoptedWording,
  evidenceSupportState,
  adoptedAt
}
```

The projection contains validated, active capabilities only and returns defensive copies. Withdrawn and malformed capabilities are excluded.

Generic personalization consumers must not read `founder.profile.capabilities` directly. Direct access is reserved for explicitly legitimate lifecycle, validation, storage, withdrawal, and Profile UI responsibilities.

### Prohibited raw inputs

Generic personalization must not consume:

- `candidateId`;
- `candidateVersionIdentity`;
- `patternId`;
- `patternVersionIdentity`;
- `patternReviewId`;
- `contributorActiveIdentities`;
- `decisionId`;
- raw provenance;
- evidence counts; or
- review internals.

These fields exist for auditability and evidence lineage. They do not belong in ordinary personalization and must not be used to infer proficiency, relevance, confidence, or priority.

## Selection before personalization

Operational and intelligence selection happens first. Personalization may annotate or frame the already-selected result afterward.

A Profile capability must not determine:

- coaching eligibility or priority;
- learning selection;
- mission selection;
- evidence derivation; or
- Profile Candidate generation.

Any future exception requires a separately reviewed and explicitly approved architecture policy. This document grants no exception.

## Identity is not evidence

The allowed authority direction is one-way:

```text
Evidence
→ reviewed pattern
→ suggestion
→ Commander identity decision
```

The reverse direction is prohibited:

```text
Commander identity
↛ synthetic evidence
```

A capability must not create or contribute to:

- a learning signal;
- a coaching signal;
- E3 behavioral evidence;
- an E4 recurring behavioral pattern;
- Profile Candidate evidence;
- an evidence-support calculation;
- automatic strength promotion; or
- automatic skill promotion.

## Evidence-support states

Identity status and evidence support are separate concepts.

### `current`

The Commander-owned identity remains active, and current reviewed evidence matches the version the Commander adopted.

### `support-changed`

The Commander-owned identity remains active, while current reviewed evidence differs from the adopted version.

### `insufficient-current-support`

The Commander-owned identity remains active, while current reviewed evidence cannot reproduce the original recommendation.

For every state:

- identity remains Commander-owned;
- identity is not withdrawn automatically;
- coaching and intelligence do not change automatically; and
- the state must not be reframed as proof of skill or lack of skill.

## Withdrawn capabilities

Withdrawn capabilities may:

- appear in historical Profile views; and
- support explicitly historical reflection under a separately approved policy.

They must not influence current:

- Briefing;
- Reflection;
- Guidance;
- coaching;
- Mission Intelligence;
- mission selection; or
- recommendation selection.

The canonical personalization projection enforces the current withdrawn firewall.

## Copy authority

Approved framing includes:

- “You've chosen to recognize…”
- “Your Profile includes…”
- “developing capability”
- “reviewed evidence”
- “Profile choice”
- “the evidence supporting this choice has changed”

Forbidden framing includes:

- “You are skilled at…”
- “You are strong at…”
- “You have proven…”
- “Verified capability”
- “Mastered”
- “FounderOS knows you're good at…”
- “Demonstrated strength”

Consumer wording must preserve Commander choice and must not turn identity into an objective performance claim.

## Responsibility boundaries

| Owner | Responsibility |
|---|---|
| `CommanderSystem` | Validates capability state and owns the safe personalization projection |
| `ArchieCore` | Orchestrates access and consumer calls only |
| `ReflectionSystem` | Owns capability-aware reflection wording |
| `WorkshopSystem` | Owns separate contextual-response storage |
| `WorkshopController` | Presents the generic contextual stage |
| `BriefingSystem` | Owns capability-context briefing wording |
| `CommunicationSystem` | Delivers prepared content only |
| `MissionIntelligenceSystem` | Owns evidence and intelligence; does not consume identity as evidence |
| Progress UI | Displays and controls capability lifecycle state |

## Reflection-specific policy

A Profile capability may influence a reflection **question**.

The resulting answer is Commander reflection, not capability evidence. Capability-aware reflection answers must remain in:

```js
contextualReflections[]
```

They must not enter:

```js
workshop.answers
```

They also must not enter any future combined or merged evidentiary answer collection. `ReflectionSystem.build()` currently reads only `workshop.answers`; preserving that separation is a structural authority boundary.

Current cadence is at most one capability reflection per workshop. There is no separate session marker and no reload persistence for the contextual response.

## Briefing-specific policy

Capability context may annotate only an already-selected relevant item.

The current v0.1 relevance rule is exact canonical competency equality. Selection occurs before the capability context is requested.

Capability context must not:

- create a briefing by itself;
- change coaching eligibility or priority;
- change learning selection;
- promote a lower-priority item;
- suppress another item; or
- create a separate session marker.

At most one capability annotation may appear. It inherits the selected item's delivery lifecycle.

## Relevance requirement for every consumer

Before integration, each future consumer must define an explicit, deterministic relevance rule.

Allowed inputs include:

- exact canonical identifiers;
- explicit deterministic context; and
- existing owner-provided `sourceRef` or contract fields.

Unless separately approved, relevance must not use:

- prose similarity;
- label guessing;
- ID parsing;
- keyword guessing;
- NLP inference; or
- semantic scoring.

## Cadence requirement for every consumer

Before integration, each future consumer must define:

- when capability context appears;
- its maximum frequency;
- whether deduplication applies;
- whether a session marker is necessary; and
- what happens after reload.

“Mention every active capability everywhere” is not an acceptable cadence policy.

## New-consumer checklist

Every proposed personalization consumer must answer:

1. What exact safe projection does it consume?
2. What is its deterministic relevance rule?
3. Does operational selection happen before personalization?
4. Can the context or a response to it become evidence?
5. How does it handle every evidence-support state?
6. How are withdrawn capabilities excluded?
7. Which system owns the wording?
8. What is the cadence and deduplication behavior?
9. What objects and systems are forbidden from mutation?
10. What tests prove there is no identity-to-evidence loop?

## Parked E1 and learning limitation

E1 and learning currently do not expose an approved canonical competency for Briefing capability matching. They therefore remain unpersonalized.

This gap must not be filled through prose matching, label matching, ID parsing, or keyword guessing. A future owner-provided canonical competency projection is required before either path may use Profile capability context.

## Current consumer matrix

| System | Consumer status | Doorway | Relevance rule | May affect selection? | Evidence effect? | Support policy | Withdrawn allowed? | Wording owner |
|---|---|---|---|---|---|---|---|---|
| Reflection | ACTIVE CONSUMER | Canonical sanitized projection | First canonical active capability for one optional workshop reflection | No | None; response stays outside `workshop.answers` | Truthfully distinguishes all three states | No | `ReflectionSystem` |
| Briefing | ACTIVE CONSUMER | Canonical sanitized projection | Exact canonical competency match after E3/E2 selection | No | None | Truthfully distinguishes all three states | No | `BriefingSystem` |
| Guidance | ACTIVE CONSUMER | Canonical sanitized projection | Exact explicit `camping.sales` Guidance reference to capability competency after Guidance selection | No | None; presentation field only | Truthfully distinguishes all three states | No | `GuidanceSystem` |
| Communication | DELIVERY ONLY | None | None | No | None | Does not interpret state | No capability input | Upstream consumer |
| Mission Intelligence | NEVER AS EVIDENCE CONSUMER | None | None | Not from Profile identity | Must never treat identity as evidence | Does not interpret personalization state | No current identity input | Not applicable |

“No capability input” for Communication means it receives prepared text and does not inspect capability records; withdrawn filtering belongs upstream.

## Guidance gate

The approved Guidance capability boundary defines and reviews:

- relevance;
- the mission-selection boundary;
- the difficulty boundary;
- the recommendation boundary;
- copy authority; and
- cadence.

Guidance personalization remains limited to copy-only annotation after selection, through the canonical safe doorway and exact relevance rule recorded above. Any expansion requires separate approval.

## Architectural test expectations

Regression tests should continue to enforce:

- one canonical safe doorway;
- no raw Profile reads by generic personalization consumers;
- separation of `contextualReflections` from `workshop.answers`;
- no Mission Intelligence dependency on Profile identity;
- selection before personalization;
- withdrawn-capability filtering;
- exact evidence-support semantics;
- read-only consumer behavior; and
- no identity-to-evidence loop.

## Approval boundary

This policy records the currently implemented Reflection and Briefing architecture. It does not authorize new consumers, new inference techniques, new persistence, or changes to evidence and intelligence behavior.
