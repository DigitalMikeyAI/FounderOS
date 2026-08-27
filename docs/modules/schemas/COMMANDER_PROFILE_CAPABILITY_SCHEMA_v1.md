# COMMANDER_PROFILE_CAPABILITY_SCHEMA_v1

## Purpose

This contract prepares the Commander Profile to hold identity that the Commander may explicitly adopt in a future consent flow. It does not generate candidates, grant consent, or connect evidence to Profile automatically.

Architectural invariant:

> Evidence may suggest identity. FounderOS may recommend identity. Only the Commander may approve identity.

## Profile contract

```js
profile: {
  schemaVersion: "COMMANDER_PROFILE_SCHEMA_v1",
  // Existing Profile fields remain unchanged.
  capabilities: []
}
```

Legacy Profiles without `schemaVersion` or `capabilities` normalize safely to this contract. Existing strengths, interests, skills, goals, values, learning style, confidence areas, growth areas, and unknown forward-compatible fields are preserved.

## Capability shape

```js
{
  id: "profile_capability_<canonical-competency>",
  type: "developing-capability",
  competency,
  label,
  status: "active" | "withdrawn",
  adoptedAt,
  withdrawnAt,
  adoptedBy: "commander",
  adoptedWording,
  evidenceSupportState:
    "current"
    | "support-changed"
    | "insufficient-current-support",
  provenance: {
    candidateId,
    candidateVersionIdentity,
    patternId,
    patternVersionIdentity,
    patternReviewId,
    contributorActiveIdentities,
    decisionId
  }
}
```

## Identity

The capability ID is deterministic and stable for the logical canonical competency: `profile_capability_<canonical-competency>`. It is not tied to a changing evidence version and must never be parsed to reconstruct provenance.

The only allowed type is `developing-capability`. Terms such as strength, verified skill, demonstrated competency, and stable capability exceed this contract.

## Status and reversibility

- `active`: current Commander-adopted identity. `withdrawnAt` is `null`.
- `withdrawn`: historical Commander-adopted identity that is no longer current. `withdrawnAt` records when it was withdrawn.

Withdrawal must preserve the capability and its provenance. A future withdrawal flow must append consent history rather than delete evidence or adoption history.

There is no pending or rejected Profile status. Pending recommendations and candidate rejection belong outside Profile.

## Evidence support

Identity status and evidence support are independent:

- `current`: the exact supporting evidence version remains current.
- `support-changed`: the Commander-adopted identity remains active, but its original evidence version changed.
- `insufficient-current-support`: the adopted identity remains, but current evidence no longer reaches the required support threshold.

Evidence changes must never automatically withdraw, adopt, or rewrite identity.

## Provenance

Every capability preserves the exact candidate, source pattern, reviewed pattern version, contributing active identities, and Commander decision that supported adoption. These opaque identities are stored directly and are never reconstructed from counts, wording, or parsed IDs.

## Boundaries

- No pending recommendation enters Profile.
- No Field Report, E3 record, E4 pattern, or E4 review automatically creates a capability.
- A `strength-profile` artifact continues to update only legacy `profile.strengths`; it does not derive or replace `profile.capabilities`.
- This schema adds no candidate projection, consent ledger, adoption flow, withdrawal flow, UI, coaching, Guidance, Reflection, Briefing, or Communication behavior.
