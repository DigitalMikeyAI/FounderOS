# COACHING_REVIEW_SCHEMA_v1

**Status:** Persistence Contract — v0.1
**Domain:** Camping World Academy
**Artifact Type:** `camping.coachingReviews`

## Purpose

The Coaching Review Ledger records whether the Commander agrees that FounderOS
accurately captured a self-assessment. Review improves record fidelity only. It
does not verify competence, demonstrate ability, or increase evidence authority.

## Container

```js
{
  type: "camping.coachingReviews",
  schemaVersion: "COACHING_REVIEW_SCHEMA_v1",
  reviews: [],
  createdAt,
  updatedAt
}
```

## Review Record

```js
{
  id,
  signalId,
  signalCreatedAt,
  sourceRef: {
    artifactId,
    subType,
    subId
  },
  originalInsight,
  status,
  correctedStrength,
  note,
  reviewedAt,
  supersedesReviewId
}
```

An exact occurrence is identified by all of `signalId`, `signalCreatedAt`, and
the canonical three-field `sourceRef`. IDs must never be parsed to infer missing
provenance.

## Status Semantics

- `confirmed-as-recorded`: the Commander agrees FounderOS accurately recorded
  what they originally reported. This does not confirm the strength itself.
- `corrected`: the Commander says the historical coaching observation was
  inaccurately recorded. `correctedStrength` or `note` must explain the correction.
- `rejected`: the Commander says the observation should not represent what they
  intended. The historical record remains preserved.
- No matching review record means `unreviewed`; `unreviewed` is never persisted.

Every status remains E1 self-assessment evidence. Review never promotes evidence
to demonstrated, verified, repeated, or profile-approved ability.

## Append-Only and Supersession

Reviews are append-only. A later review stores the prior latest review ID in
`supersedesReviewId`; the earlier record is never overwritten or deleted. An
identical repeat of the latest review is an idempotent no-op.

The latest review is selected by `reviewedAt`, with stable append order as the
fallback when timestamps tie.

## Reconciliation Survival

The ledger is separate from Field Reports. Rule #3 may remove a stale owned
coaching signal without deleting its review history. If the same deterministic
signal ID is regenerated with a new `signalCreatedAt`, it is a new occurrence
and begins unreviewed. The older review remains historically resolvable.

## Mutation Boundary

Review never modifies `explicitStrengths[]`, a Field Report, its coaching signal,
Commander Profile, Guidance, or Reflection. A future raw-data correction is a
separate deliberate operation.
