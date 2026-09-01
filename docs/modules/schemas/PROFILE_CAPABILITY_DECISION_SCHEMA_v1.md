# Profile Capability Decision Schema v1

## Purpose

`camping.profileCapabilityDecisions` is the append-only record of Commander decisions about read-only Profile Capability Candidates.

Evidence may suggest identity, and FounderOS may recommend identity, but only the Commander may approve it. This ledger records that decision; it is not the Commander Profile and does not modify `profile.capabilities`.

## Artifact

```js
{
  type: "camping.profileCapabilityDecisions",
  schemaVersion: "PROFILE_CAPABILITY_DECISION_SCHEMA_v1",
  decisions: [
    {
      id,
      capabilityId,
      candidateId,
      candidateVersionIdentity,
      competency,
      label,
      proposedProfileType,
      proposedProfileWording,
      sourcePatternId,
      sourcePatternVersionIdentity,
      sourcePatternReviewId,
      contributorActiveIdentities,
      originalAdoptionDecisionId,
      adoptedAt,
      evidenceSupportState,
      decision,
      note,
      decidedAt,
      supersedesDecisionId
    }
  ],
  createdAt,
  updatedAt
}
```

`capabilityId`, `originalAdoptionDecisionId`, `adoptedAt`, and
`evidenceSupportState` are withdrawal-only snapshot fields. Candidate decisions
do not need them.

## Candidate, decision, and Profile boundaries

- A candidate is a current, derived recommendation. It is not persisted.
- A decision is the Commander's recorded response to one exact candidate version.
- The Profile is the Commander's adopted identity record. This schema does not write to it.

Even `adopt` means only that the Commander approved the exact recommendation for future Profile incorporation. Profile projection is a separate responsibility.

## Decisions

- `adopt`: approve this exact candidate version for future Profile adoption.
- `defer`: choose “not now” for this exact candidate version.
- `reject`: reject this exact candidate version without changing its evidence.
- `suppress`: record that this stable logical candidate should not be suggested again. Consumption and reversal are future responsibilities.
- `withdraw`: explicitly remove an adopted developing capability from current Commander identity while preserving its adoption and evidence history.

Withdrawal is an identity decision, not a candidate review. It targets the stable adopted capability and snapshots the exact adoption authority being withdrawn. Reject and suppress do not withdraw identity.

## Exact-version semantics

Every decision is validated against the current combination of `candidateId` and `candidateVersionIdentity`. A stale or missing candidate version is rejected without saving. A decision about version A does not automatically govern version B of the same logical candidate.

The record stores the candidate snapshot and exact E4 provenance directly. Consumers must not reconstruct provenance by parsing IDs.

## Append-only history and supersession

Existing records are never overwritten. A changed decision or note appends a new record. `supersedesDecisionId` points to the previous latest record for the same exact candidate version. The first record uses `null`.

The latest exact-version decision is selected by `decidedAt`, with append order as the tie-break when timestamps match.

## Idempotency

Repeating the same `decision` and normalized `note` as the latest record for the exact candidate version returns success with `changed: false`. It does not append or save again.

Repeating withdrawal for an already-withdrawn capability also returns `changed: false` and creates no additional record.

## Withdrawal and re-adoption

Withdrawal never deletes the capability, its prior adopt decision, or supporting evidence. The Profile capability remains stored with `status: "withdrawn"` and `withdrawnAt` taken from the withdrawal decision. Evidence changes never cause automatic withdrawal or reactivation.

A later explicit adopt decision may reactivate the same stable capability ID with new adoption provenance and `withdrawnAt: null`. The prior adopt and withdrawal records remain append-only history.

## Persistence authority

ArchieCore validates and assembles the decision. MemorySystem alone persists the artifact. The ledger does not persist candidates, mutate evidence, modify Commander Profile, or trigger UI, coaching, Guidance, Reflection, Briefing, or Communication behavior.
