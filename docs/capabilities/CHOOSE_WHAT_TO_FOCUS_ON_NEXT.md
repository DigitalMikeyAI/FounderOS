# Choose What to Focus On Next

> Evidence may present options. Only the Commander chooses a focus.

## Capability

Phase 9 gives the Commander a bounded way to choose what to focus on next from current, evidence-informed possibilities without allowing FounderOS to make that choice for them.

FounderOS may derive and present Development Focus Options. Only explicit Commander action may create, change, or clear a saved Development Focus. The saved focus records intention; it does not become evidence, evaluation, identity, recommendation, mission authority, or proof that practice is needed.

## Product Question

**“Which confirmed pattern, if any, does the Commander choose to focus on next?”**

## Core Invariant

> Confirmed evidence may create an observation. Only the Commander may turn that observation into a development focus. A chosen focus is intention—not evidence, evaluation, identity, recommendation, mission authority, or proof of need.

## Capability Summary

FounderOS can now:

- derive Development Focus Options from canonical Coaching Synthesis
- present those options without ranking, scoring, recommending, weighting, or preselecting them
- allow the Commander to explicitly choose one option as a Development Focus
- allow the Commander to explicitly change that choice by choosing a different exact option
- allow the Commander to explicitly clear the saved focus
- preserve “none chosen” as a valid state
- persist one Commander-authored Development Focus
- preserve the saved focus as a historical snapshot of the explicit choice
- derive exact-source presence ephemerally against current canonical Development Focus Options
- preserve the saved intention when its exact source is no longer represented in current options

## Commander Authority

Only explicit Commander action may:

- create a Development Focus
- change a Development Focus
- clear a Development Focus

FounderOS may present options. FounderOS may report whether the exact source saved with a focus is represented in current canonical Development Focus Options. FounderOS may not choose a focus for the Commander.

“None” is a valid Commander state.

## Authority Chain

The Phase 9 authority chain is one-directional:

```text
Field Report
→ Reviewed E3
→ Confirmed E4
→ Coaching Synthesis
→ Development Focus Options
→ COMMANDER DECISION BOUNDARY
→ Development Focus
→ Ephemeral Exact-Source Support Projection
```

Each transition preserves a distinct authority:

1. **Field Report → Reviewed E3:** structured interaction evidence becomes eligible only through its established review authority.
2. **Reviewed E3 → Confirmed E4:** the canonical recurring-pattern projection and exact pattern-review currentness rules remain authoritative.
3. **Confirmed E4 → Coaching Synthesis:** only current recurring patterns whose latest valid review status is `confirmed-as-pattern` become synthesis observations.
4. **Coaching Synthesis → Development Focus Options:** `buildDevelopmentFocusOptions()` performs a pure, read-only projection. It does not choose, recommend, or persist.
5. **Development Focus Options → Development Focus:** this transition requires explicit Commander action. No option becomes a focus automatically.
6. **Development Focus → support projection:** `buildDevelopmentFocusSupport()` performs an ephemeral exact-source comparison only. It cannot mutate, migrate, clear, replace, or reinterpret the saved intention.

## Phase 9.1 — Development Focus Options

The canonical Phase 9.1 projection is:

```js
MissionIntelligenceSystem.buildDevelopmentFocusOptions(coachingSynthesis)
```

Development Focus Options derive only from a canonical Coaching Synthesis. Phase 9.1 does not independently inspect Field Reports, E3 reviews, E4 reviews, mission state, Profile state, or other downstream authorities.

### Option v1

```js
{
  competency,
  label,
  observation,
  source: {
    basis: "confirmed-recurring-pattern",
    evidenceTier: "E4",
    patternId,
    patternVersionIdentity,
    patternReviewId
  }
}
```

Each option copies the canonical synthesis competency, label, and observation verbatim and preserves exact source lineage.

Options:

- preserve the order supplied by canonical Coaching Synthesis
- contain no score
- contain no rank
- contain no confidence
- contain no priority or priority weight
- contain no recommendation flag or recommendation status
- contain no selected or default state
- contain no mission intent
- contain no interaction or report counts
- contain no recency weighting

History, XP, completion, Profile, mission state, and Practice Recommendation do not create, select, or weight Development Focus Options.

Malformed canonical input, malformed individual insights, duplicate competencies, or duplicate source identities fail closed to the complete empty options envelope. Phase 9.1 does not repair, deduplicate, or partially trust malformed synthesis input.

## Phase 9.2 — Commander Focus Decision

The Commander decision boundary is owned by:

```js
ArchieCore.chooseDevelopmentFocus(selectionInput)
ArchieCore.getDevelopmentFocus()
ArchieCore.clearDevelopmentFocus()
```

### Public choose input

The public choose request identifies only the domain and exact source:

```js
{
  domain: "camping.sales",
  source: {
    basis: "confirmed-recurring-pattern",
    evidenceTier: "E4",
    patternId,
    patternVersionIdentity,
    patternReviewId
  }
}
```

The caller cannot authoritatively supply:

- competency
- label
- observation
- array index
- rank
- score
- counts
- recommendation data
- mission data

ArchieCore reconstructs current canonical eligibility through Coaching Synthesis and Development Focus Options, then resolves the exact source before persisting any semantic fields. The saved competency, label, observation, and source come from the resolved canonical option, not from caller-authored display data.

### Same-source idempotency

Re-selecting the same exact source:

- returns success without a change
- performs no save
- does not refresh `chosenAt`
- does not refresh the persisted label or observation
- preserves the original saved snapshot

Choosing a different exact source requires a new explicit Commander action. A difference in `patternId`, `patternVersionIdentity`, or `patternReviewId` establishes a distinct source choice and creates a new `chosenAt`.

Clear is also explicit. It does not require current evidence, Coaching Synthesis, or Development Focus Options, and it does not alter any evidence source.

## Development Focus v1 Contract

A chosen Development Focus has this exact semantic shape:

```js
{
  type: "development-focus",
  version: 1,
  domain: "camping.sales",
  competency,
  label,
  observation,
  source: {
    basis: "confirmed-recurring-pattern",
    evidenceTier: "E4",
    patternId,
    patternVersionIdentity,
    patternReviewId
  },
  chosenAt
}
```

This means only:

> The Commander chose this as a Development Focus.

It does not mean the focus is:

- currently recommended
- currently needed
- currently evidence-supported in a broad evaluative sense
- a weakness
- a mastery claim
- a priority
- urgent
- Profile identity
- mission authority
- proof of need

## Persistence Contract

Phase 9 persists one singleton artifact through MemorySystem:

```js
{
  type: "camping.developmentFocus",
  schemaVersion: "DEVELOPMENT_FOCUS_SCHEMA_v1",
  focus: <development-focus | null>,
  createdAt,
  updatedAt
}
```

The persistence semantics are:

- one singleton saved Development Focus exists at most
- `focus: null` is the canonical explicit no-focus state after clear
- a missing artifact means no focus has yet been persisted
- a malformed artifact remains distinct from valid null
- competency, label, observation, source, and `chosenAt` are historical snapshots of the explicit choice
- support/currentness state is not persisted
- evidence changes do not rewrite the artifact
- reads do not create defaults, migrate state, or repair malformed state

MemorySystem owns artifact persistence. ArchieCore validates explicit Commander operations and assembles the artifact. Mission Intelligence does not persist Development Focus state.

The established MemorySystem behavior updates the in-memory artifact map before durable Commander persistence success is independently confirmed. Phase 9 uses that existing persistence path and does not claim transactional persistence guarantees.

## Phase 9.3 — Progress Choice Surface

Progress presents a dedicated card after Coaching Synthesis and before Developing Capability Suggestions:

> Choose a Development Focus

Its subheading states:

> Your choice, not a recommendation.

The Progress surface preserves the authority boundary by rendering the saved focus and current options separately.

Current options:

- are presented uniformly
- remain in canonical supplied order
- are never preselected
- receive no recommended, current, best, or priority badge
- display no counts
- display no source identifiers
- are not ranked
- are not hidden or filtered based on the saved focus

Choosing, changing, and clearing require explicit button actions. The UI does not write persistence, Founder state, Profile state, or mission state directly.

Saved-focus copy includes:

> You previously chose this Development Focus.

No-focus copy includes:

> No Development Focus chosen. Choosing none is valid.

The saved label and observation come from the persisted snapshot. They are not refreshed from current options.

## Phase 9.4 — Focus Continuity / Currentness

Phase 9.4 derives exact-source presence through:

```js
MissionIntelligenceSystem.buildDevelopmentFocusSupport(
  developmentFocus,
  developmentFocusOptions,
)
```

The exact contract is:

```js
{
  type: "development-focus-support",
  version: 1,
  domain: "camping.sales",
  state:
    "no-focus"
    | "exact-source-present"
    | "exact-source-not-present"
    | "unavailable"
}
```

The projection is:

- ephemeral only
- deterministic
- not persisted
- derived only from the supplied saved Development Focus and canonical current Development Focus Options
- free of any copied focus snapshot
- free of a matched option
- free of source identifiers
- free of timestamps
- free of counts
- free of score, rank, confidence, and recommendation fields

It reports exact provenance membership only. It does not establish a broader evaluation of the focus or Commander.

## Exact Provenance Semantics

Exact-source presence requires equality across the complete five-field source tuple:

1. `basis`
2. `evidenceTier`
3. `patternId`
4. `patternVersionIdentity`
5. `patternReviewId`

These are insufficient:

- competency only
- label
- observation
- `patternId` only
- `patternId` plus `patternVersionIdentity` only
- similar wording
- array position
- the same competency with a new pattern version
- the same pattern and version with a new confirming review

Exact matching prevents FounderOS from silently migrating the Commander's saved source binding to newer or merely related evidence.

## Exact-Source Absence

`exact-source-not-present` means only:

> The exact source represented by the saved focus is not represented in the current canonical Development Focus Options.

It does not mean:

- the focus is invalid
- the focus is stale
- the focus is expired
- the focus is obsolete
- the focus is unsupported in a broad evaluative sense
- the Commander is weak
- the Commander no longer needs the focus
- the Commander should choose another focus

Exact-source absence must not:

- clear the saved focus
- replace the saved focus
- migrate the saved focus
- refresh its label
- refresh its observation
- rewrite its source
- change `chosenAt`
- update artifact timestamps

## Exact-Source Presence

`exact-source-present` means only that the exact saved source is represented in current canonical Development Focus Options.

It does not:

- recommend the focus
- prove the focus is correct
- prove the focus is needed
- make the focus active
- make the focus confirmed
- establish mastery or weakness
- create mission authority
- create Profile authority

## Saved Focus and Current Options Are Independent

The saved Development Focus is Commander-authored intention. Current Development Focus Options are evidence-derived possibilities.

One does not rewrite the other.

A saved focus remains visible when:

- its exact source is absent
- current options are empty
- current options are unavailable

Current options remain visible independently of the saved focus. FounderOS does not hide a matching option, select a replacement, or migrate the saved focus to another option.

## “None” Is Valid

The Commander is never required to choose a Development Focus.

No focus is not:

- failure
- missing data
- incomplete onboarding
- a recommendation target
- a reason to start a mission

Clearing a focus is an explicit Commander choice and does not erase or alter the evidence that originally made an option available.

## What Commander Development Focus Does Not Do

Phase 9 does not:

- create evidence
- alter E3 evidence or reviews
- alter E4 patterns or reviews
- infer weakness
- infer mastery
- score ability
- rank competencies
- recommend a focus
- prioritize a focus
- preselect a focus
- change Profile
- adopt a Profile capability
- withdraw a Profile capability
- create a Practice Recommendation
- change a Practice Recommendation
- create a mission
- activate a mission
- create `pendingMissionRequest`
- change `missionGoal`
- influence Field Report `dailyCore.nextFocus`
- trigger Guidance
- trigger Briefing
- trigger Reflection
- grant XP
- change completion
- rank using archive or history
- silently clear or migrate a focus

## Downstream Authority Firewall

> Any future use of Development Focus by Practice Recommendation, mission selection, Guidance, Briefing, Reflection, or Profile requires a separate product decision and explicit authority review. Phase 9 grants no such downstream authority.

Development Focus and its support projection are terminal within Phase 9. Neither creates a hidden bridge to another FounderOS authority.

## Current Limitations

Phase 9 v1 intentionally includes:

- one singleton saved Development Focus
- the `camping.sales` domain only
- only competencies available through canonical current Coaching Synthesis
- no focus decision history or supersession ledger
- deliberately narrow exact-source support semantics
- no downstream recommendation, mission, Guidance, Briefing, Reflection, or Profile integration
- the established non-transactional MemorySystem persistence behavior described above

These boundaries keep the capability focused on Commander-authored intention. They are not evidence of incomplete evaluation or missing automation.

## Verification

Phase 9 implementation commits, in order:

### Phase 9.1

```text
31e740d5efe192817f1eb2fa33932598c8908bb6
feat(coaching): add development focus options
```

### Phase 9.2

```text
792972252dab3cbe22eb588f0cd8f01016dc85bf
feat(coaching): add commander development focus
```

### Phase 9.3

```text
b72c1699cf8a5bb571b8f08f922e6ae20e1fc7d0
feat(coaching): add development focus choice surface
```

### Phase 9.4

```text
73f3e34aea0bd0d7803a5e2116fd3355e227e831
feat(coaching): add development focus support state
```

Focused Phase 9 proof at closeout:

- `development-focus-options`: **40/40 passed**
- `development-focus-decision`: **26/26 passed**
- `development-focus-ui`: **26/26 passed**
- `development-focus-support`: **21/21 passed**
- focused Phase 9 total: **113/113 passed**

Relevant Phase 7, Phase 8, and Profile regression proof: **123/123 passed**.

Full suite at closeout: **806/806 passed, 0 failed, 0 skipped, 0 todo**.

The tests prove canonical derivation, unranked ordering, malformed-input firewalls, explicit Commander choice, idempotency, persistence and reload, detachment, valid none state, exact provenance comparison, saved-focus continuity, independent UI surfaces, and absence of downstream authority.

## Phase 9 Closure

Phase 9 — Commander Development Focus is complete.

FounderOS may derive evidence-informed Development Focus Options.

Only the Commander may create, change, or clear a Development Focus.

A saved Development Focus remains intention.

Exact-source support remains an ephemeral provenance fact.

Neither the focus nor its support state gains evidence, evaluation, recommendation, mission, Profile, or other downstream authority.