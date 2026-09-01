# BEHAVIORAL_PATTERN_REVIEW_SCHEMA_v1

## Purpose

This artifact preserves the Commander's reviews of E4 recurring behavioral-pattern interpretations. It does not persist the derived E4 projection itself.

## Artifact

```js
{
  type: "camping.behavioralPatternReviews",
  schemaVersion: "BEHAVIORAL_PATTERN_REVIEW_SCHEMA_v1",
  reviews: [
    {
      id,
      patternId,
      patternVersionIdentity,
      competency,
      originalInsight,
      contributorIdentities,
      status,
      correctedInterpretation,
      note,
      reviewedAt,
      supersedesReviewId
    }
  ],
  createdAt,
  updatedAt
}
```

## Statuses

- `confirmed-as-pattern`: the current reviewed source records support the displayed aggregate interpretation.
- `corrected`: the Commander records different wording or a correction note.
- `rejected`: the Commander does not accept the aggregate interpretation.
- `unreviewed` is a derived UI state and is never persisted.

## Exact-version identity

A review applies only when both `patternId` and `patternVersionIdentity` match the current E4 projection. `contributorIdentities` preserves the complete, sorted opaque `activeIdentity` values reviewed and must also match exactly. Identities are never parsed or reconstructed from counts or evidence IDs.

When contributor membership changes, the logical `patternId` may remain while `patternVersionIdentity` changes. The new version starts unreviewed. An exact former version may reuse its historical review if that exact identity and contributor membership return.

## Append-only and idempotent behavior

Changed reviews append a new record and set `supersedesReviewId` to the previous latest review for the exact pattern version. Earlier records remain intact. Repeating the exact latest status, corrected interpretation, and note is an idempotent no-op and does not save.

The latest exact-version review is selected by `reviewedAt`, with append order as the tie-break.

## Authority boundary

An E4 review says only whether the contributing Commander-reviewed records support the recurring-pattern interpretation. It does not verify a skill, establish a permanent strength or identity, create a Profile candidate, or mutate Profile, Guidance, Reflection, E3 evidence, or raw Field Reports. It does not enable active E4 coaching.
