# BEHAVIORAL_EVIDENCE_REVIEW_SCHEMA_v1

**Status:** Persistence Contract — v0.1
**Domain:** Camping World Academy
**Artifact Type:** `camping.behavioralEvidenceReviews`

## Purpose

This append-only ledger records whether the Commander agrees that a current E3
source record and FounderOS interpretation accurately reflect what they
reported. Review does not verify competence, prove performance, create E4, or
change the raw Field Report.

## Container

```js
{
  type: "camping.behavioralEvidenceReviews",
  schemaVersion: "BEHAVIORAL_EVIDENCE_REVIEW_SCHEMA_v1",
  reviews: [],
  createdAt,
  updatedAt
}
```

## Review Record

```js
{
  id,
  evidenceId,
  sourceRef: {
    artifactId,
    subType,
    subId
  },
  outcomeEntryId,
  sourceFingerprint,
  originalInsight,
  originalCompetency,
  status,
  correctedCompetency,
  note,
  reviewedAt,
  supersedesReviewId
}
```

An exact occurrence requires matching `evidenceId`, all three canonical
`sourceRef` fields, `outcomeEntryId`, and `sourceFingerprint`. Consumers never
parse IDs or the fingerprint to recover missing provenance.

## Source Fingerprint

Mission Intelligence owns the fingerprint. The v0.1 algorithm:

1. Retain only non-empty string objections.
2. Trim each retained objection and preserve original source order.
3. Construct an object in this field order: `objections`, `outcomeEntryId`,
   `step`, `performedBy`, `result`.
4. Serialize it with `JSON.stringify`.
5. Prefix the result with `behavioral_evidence_source_v1:`.

The complete value is opaque to consumers. It is compared only for exact
equality. It does not use an array position.

## Status Semantics

- `confirmed-as-recorded`: the source and interpretation accurately reflect
  what the Commander reported. This does not confirm competence.
- `corrected`: the interpretation is inaccurate or needs a different canonical
  competency interpretation. A differing `correctedCompetency` or non-empty
  note is required. Raw Field Report data is not changed.
- `rejected`: the interpretation should not represent the current source
  occurrence. An optional note may be retained.
- No exact matching review means `unreviewed`. `unreviewed` is never persisted.

## Append-Only Lifecycle

Every changed review appends a new record. `supersedesReviewId` points to the
latest exact-occurrence review. Previous reviews are never overwritten or
deleted. An exact repeat of status, corrected competency, and note is an
idempotent no-op.

The latest exact review is selected by `reviewedAt` descending, with later
append order as the deterministic tie-break.

## Source Edits

A material evidence-bearing source edit changes the fingerprint. The old review
remains historical but stops applying. A still-qualifying changed occurrence
begins unreviewed; a non-qualifying source produces no current E3 projection.

Known limitation: if source values change and are later restored byte-for-byte
to the same canonical values, the same fingerprint reappears. Raw-source
revision identity is outside v0.1.

## Mutation and Authority Boundary

Review never mutates Field Reports, source outcomes, objections, Profile,
Guidance, Reflection, coaching signals, or learning signals. It does not produce
active coaching, E4 aggregation, confidence, scoring, or causal claims.
