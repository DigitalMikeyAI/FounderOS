# Know What To Practice Next

> A recommendation is a pointer to reviewed experience. It is never a judgment of ability.

## Purpose

FounderOS answers one bounded product question for the Commander:

**"What should I practice next, and why?"**

It answers that question using only evidence the Commander has personally reviewed, diversified by the Commander's own recent practice history, and contextualized â€” never ranked â€” by patterns the Commander has confirmed. The Commander always decides whether to act on the answer.

## The Core Question

How can FounderOS recommend meaningful practice from the Commander's own reviewed experience without ever turning that experience into a score, a weakness, or a verdict?

## Mission Statement

FounderOS recommends practice drawn exclusively from confirmed reviewed evidence, explains the recommendation in language the evidence actually supports, diversifies suggestions across the Commander's real practice history, and leaves the decision â€” every time â€” with the Commander.

## Philosophy

The Commander's reviewed experience is the only door to a practice recommendation.

FounderOS does not measure how good the Commander is at a skill. It observes which skills the Commander has reported practicing, waits for the Commander to confirm the record is accurate, and then points back at that confirmed experience when practice is due. If there is no reviewed evidence, there is no recommendation â€” silence is the truthful answer.

## The Commander's Authority

The Commander owns every gate in this capability:

- Only the Commander's review makes evidence recommendation-eligible.
- Only the Commander's confirmation makes a recurring pattern descriptive.
- Only the Commander's explicit acceptance starts a mission.

FounderOS proposes. The Commander decides. A recommendation is rendered, previewed, and dismissed without consequence until the Commander accepts it.

## Authority Chain

The runtime authority chain is strict and one-directional:

1. **E3 qualifies** â€” a current, Commander-confirmed-as-recorded E3 evidence occurrence is the *only* source of practice-candidate eligibility.
2. **Bounded mission history diversifies** â€” the Commander's recognized recent practice missions choose *among* already-qualified candidates. History never creates evidence and never creates eligibility.
3. **E4 contextualizes the final selection** â€” a current, Commander-confirmed recurring pattern may add one descriptive sentence to the *already-selected* candidate. E4 never creates eligibility and never selects, ranks, or replaces a candidate.
4. **Commander controls identity** â€” Profile capabilities never influence practice recommendations.

## Decision Boundaries

This capability may:

- recommend practice drawn from confirmed reviewed E3 evidence
- diversify suggestions using bounded recognized mission history
- describe a Commander-confirmed recurring pattern on the already-selected candidate
- explain its reasoning in evidence-accurate language
- offer a preview that the Commander may dismiss or accept

This capability may not:

- create eligibility from history, XP, completion, archive data, or Profile
- score, rank, or weight candidates
- infer mastery, weakness, proficiency, deficiency, or confidence
- expire or age out evidence
- start a mission without explicit Commander acceptance
- treat mission completion, archive history, or XP as evidence

## Implementation Status

### Implemented Scope

- **Slice 7.1 â€” Recommendation from reviewed E3.** Current, confirmed-as-recorded E3 evidence occurrences produce qualified practice candidates. Unreviewed, corrected, or rejected evidence produces none. A recommendation is not produced when no candidate qualifies.
- **Slice 7.2 â€” Rotation among qualified candidates.** Bounded recognized mission history rotates the rendered selection among already-qualified candidates to avoid dumb repetition. One qualified candidate is always returned regardless of history.
- **Slice 7.3 â€” E4 recurring-pattern context.** A current, Commander-confirmed-as-pattern E4 matching the already-selected competency appends exactly one descriptive sentence. E4 is computed only after final selection and only attaches to the selected candidate. Unreviewed, rejected, corrected, stale-version, or mismatched E4 adds nothing.
- **Slice 7.4 â€” Bounded diversity.** Bounded recent-practice history (the five most recent recognized practice missions) diversifies among already E3-qualified competencies, preferring qualified options absent from recent practice. When history gives no distinction, deterministic E3 order is preserved. History alone can never create candidates.
- **Slice 7.5 â€” Truthful recommendation language.** Recommendation language claims only what the evidence proves. No recency is asserted, because confirmed reviewed evidence remains valid indefinitely and bounded diversity may intentionally select an older reviewed interaction.

### Candidate Selection Contract

- Candidates are built only from evidence whose latest exact-occurrence review is `confirmed-as-recorded`.
- Candidates are ordered by review timestamp (newest first), then canonical competency order, then evidence identity. No freshness thresholds exist; this ordering observes recency without judging it.
- Bounded history rotation operates only on the already-qualified candidate set and only over the five most recent recognized practice-mission titles. Unknown, non-sales, and malformed archive entries are ignored.

### Recommendation Contract (v1)

The recommendation is an ephemeral, render-time object. It is **not persisted** â€” it lives only long enough to be displayed and previewed.

```text
type:                  "practice-recommendation"
version:               1
domain:                "camping.sales"
recommendedCompetency: <canonical competency>
missionIntent:         <canonical mission intent>
reasonType:            "reviewed-interaction"
reasonText:            "An interaction you reviewed involved <Competency>. You may want to practice <Competency> again."
evidenceRefs:          [ one exact reference to the selected reviewed E3 evidence ]
generatedAt:           <ISO timestamp>
status:                "recommended"
```

`evidenceRefs` remain bound to the exact reviewed E3 evidence behind the selection: the evidence identity, the source fingerprint, the review that confirmed it, the recorded outcome entry, and the canonical source reference. When a confirmed E4 pattern matches the selected competency, exactly one sentence is appended:

```text
"You have also reviewed this as a recurring pattern across several customer interactions."
```

The recommendation object gains no other fields. There is no score, rank, confidence, mastery, weakness, proficiency, deficiency, priorityWeight, history reference, or pattern reference on the object.

### Supported Sales Competencies

Six canonical competencies are supported, each mapped to exactly one mission intent and one recognized practice mission title:

| Competency | Mission Intent | Recognized Mission Title |
|---|---|---|
| `rapport` | `practice-rapport` | Practice Referencing Customer Context |
| `discovery` | `practice-customer-discovery` | Practice Customer Discovery |
| `product-selection` | `practice-product-selection` | Practice Product Selection |
| `presentation` | `practice-presentation` | Practice a Customer-Need Presentation |
| `objection-handling` | `practice-objection-handling` | Practice Objection Handling |
| `trial-close` | `practice-trial-close` | Practice a Trial Close |

### Preview and Acceptance

- "Preview Recommendation" opens the existing mission preview for the recommended intent. It does **not** start a mission and does not create a pending request by itself.
- The mission preview exposes separate "Not Now" and "Accept Mission" controls. Not Now, Escape, and backdrop dismissal close the preview without accepting.
- Only explicit Commander acceptance activates the mission through the normal mission lifecycle.

### Current Limitations

- One recommendation is rendered at a time; alternates are reachable only through bounded rotation.
- Only the camping.sales practice domain exists.
- The recommendation is display-only and is not persisted; nothing is stored about which recommendations were shown.
- E4 context requires an exact current pattern version and an exact match to the selected competency.
- Reviewed evidence never expires; a long-ago confirmed occurrence remains fully eligible, by design.

### Verification

- Focused practice recommendation suite: **60/60 passed**.
- Full test suite at closeout: **635/635 passed, 0 failed, 0 skipped, 0 todo**.
- `git diff --check main...HEAD`: clean.
- Founder browser smoke test passed: a reviewed E3 produced a Recommended Practice card (selected competency: Rapport) displaying "An interaction you reviewed involved Rapport. You may want to practice Rapport again." with no unsupported "recent" wording. The recommendation did not auto-start a mission. Preview Recommendation opened "Practice Referencing Customer Context" with separate "Not Now" and "Accept Mission" controls; Not Now and Escape each dismissed without accepting; explicit Commander acceptance activated "Practice Referencing Customer Context" through the normal mission lifecycle.
- Out-of-scope pre-existing observation (not a Phase 7 failure): during smoke testing, a pre-existing mission-state UX defect was noted â€” after mission archival, stale mission UI can remain visible and End Day can enter a Cancel-only dead end. Reconstruction proved this defect exists on main (2ca3900) and predates Phase 7 entirely. It is tracked separately and does not affect this capability.

### Implementation Reference

Phase 7 implementation commits, in order:

- `ce60bea` â€” recommend practice from reviewed E3
- `9c74316` â€” rotate reviewed practice recommendations
- `854cb7a` â€” make mission preview dismissible
- `11fd97f` â€” simplify sales practice copy
- `fb6623e` â€” add recurring-pattern practice context
- `7d49573` â€” diversify reviewed practice recommendations
- `f6d4769` â€” make practice recommendation language truthful

Final implementation HEAD before documentation: `f6d47698a110f6ee8f172f3f9e6f23c5577d563d`.

Runtime ownership: `MissionIntelligenceSystem` (candidate building, bounded rotation, formatting, E4 context helper) with render orchestration in `js/practice-recommendation.js` on the Missions surface. No new system was created.

## Future Evolution

High-level possibilities, none committed:

- additional evidence-backed practice domains
- Commander-facing visibility into alternates beyond bounded rotation
- richer (still judgment-free) explanation of why a candidate was diversified

Any future change must preserve the authority chain: E3 qualifies, history diversifies, E4 contextualizes, the Commander decides.

## FounderOS Principle

FounderOS recommends only what the Commander has already confirmed, and says only what the evidence can prove.

A recommendation that must guess is worse than no recommendation at all.
