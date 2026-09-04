# Development Focus Schema v1

## Purpose

`camping.developmentFocus` stores one current Development Focus explicitly chosen by the Commander. A Development Focus is Commander-authored intention.

A Development Focus Option is an evidence-supported consideration. It is not a choice. Only an explicit Commander operation may turn one exact current option into a Development Focus.

## Artifact

```js
{
  type: "camping.developmentFocus",
  schemaVersion: "DEVELOPMENT_FOCUS_SCHEMA_v1",
  focus: {
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
  } | null,
  createdAt,
  updatedAt
}
```

## Authority boundary

A Development Focus is not evidence, evaluation, recommendation, Profile identity, or mission authority. It does not establish a score, rank, confidence, mastery, weakness, proficiency, deficiency, need, urgency, or proof that practice is required.

It cannot create a Practice Recommendation, mission intent, pending mission request, mission, Guidance, Profile capability, XP, or completion state.

## Exact source binding

The source tuple records the exact Development Focus Option the Commander chose at that time:

- `patternId`
- `patternVersionIdentity`
- `patternReviewId`

`competency`, `label`, and `observation` are snapshots copied from that resolved canonical option. The observation is preserved verbatim. The source tuple is lineage, not current evidence authority.

## Persistence and currentness

Loading a persisted focus means:

> The Commander chose this exact Development Focus from this exact source-backed option at `chosenAt`.

It does not mean:

> This remains currently supported.

Evidence changes must not silently migrate, clear, refresh, or rewrite the saved focus, its observation, source, or `chosenAt`.

Phase 9.4 derives support ephemerally by comparing the complete five-field source tuple against canonical current Development Focus Options. The persisted v1 artifact shape is unchanged. No support state is persisted, no migration occurs, and artifact timestamps are not updated by support derivation.

Exact-source absence means only that the source represented by the saved focus is not represented in the current canonical options. It does not invalidate, clear, replace, or reinterpret the Commander's intention. `competency`, `label`, `observation`, `source`, and `chosenAt` remain historical snapshots of the explicit choice.

## Choose, change, and clear

Choosing a different exact source replaces the singleton focus and creates a new `chosenAt`. Re-selecting the same exact source is idempotent and preserves the original snapshot and timestamp.

Clear is represented by `focus: null`. A missing artifact means no focus has yet been persisted. A malformed artifact is distinct from a valid null focus. An explicit valid choose or clear may replace malformed state; reads do not repair or migrate it.

## History boundary

Version 1 stores current state only. It creates no decision ID, focus ID, version identity, status field, history ledger, or supersession chain.

## Persistence ownership

ArchieCore validates explicit Commander operations and assembles the artifact. MemorySystem alone persists it. Storage loading preserves typed artifacts but does not validate current evidence or create a default focus.
