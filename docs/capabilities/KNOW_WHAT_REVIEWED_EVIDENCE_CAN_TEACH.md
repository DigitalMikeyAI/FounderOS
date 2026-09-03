# Know What Reviewed Evidence Can Teach

> Reviewed evidence may support an observation. It does not become a performance grade.

## Capability

FounderOS can synthesize current recurring behavioral patterns that the Commander has explicitly confirmed across reviewed interactions. The result helps the Commander notice what their reviewed evidence consistently describes while preserving the difference between an observation, a recommendation, and identity.

Phase 8 closes as **Coaching Synthesis**, not evaluation.

## Product Question

**“What can the Commander learn from the behavioral evidence they have reviewed?”**

FounderOS answers only when the available evidence has passed the required review and currentness gates. When no confirmed recurring pattern qualifies, the truthful result is a complete Coaching Synthesis with no insights.

## What FounderOS Can Now Do

FounderOS can:

- derive an ephemeral Coaching Synthesis from current, Commander-confirmed recurring E4 patterns
- present one observation for each eligible competency in canonical competency order
- preserve the confirmed pattern's competency, label, interaction and report counts, and review provenance in the canonical synthesis object
- display only the label and observation on Progress, without exposing counts or provenance identifiers
- distinguish a true empty evidence state from a runtime or authority failure
- preserve stricter truth boundaries for Rapport

The canonical derivation authority is:

```js
MissionIntelligenceSystem.buildCoachingSynthesis(
  fieldReports,
  behavioralEvidenceReviewContainer,
  behavioralPatternReviewContainer,
)
```

## What Evidence May Create Coaching Synthesis

The runtime reads only these existing in-memory artifacts:

- `camping.fieldReports`
- `camping.behavioralEvidenceReviews`
- `camping.behavioralPatternReviews`

The reports array comes from `camping.fieldReports.reports`. Behavioral Evidence reviews establish which exact E3 occurrences are currently `confirmed-as-recorded`. The canonical recurring-pattern projection aggregates those eligible occurrences into E4 patterns. Behavioral Pattern reviews then establish whether a current E4 pattern has been confirmed by the Commander.

Only a current recurring E4 pattern whose latest valid review status is `confirmed-as-pattern` may create a Coaching Synthesis insight.

There is no E3 fallback in Phase 8 v1. Confirmed E3 evidence can contribute to canonical E4 derivation, but it cannot directly become Coaching Synthesis.

## E4 Authority and Currentness Requirements

`buildCoachingSynthesis()` does not independently derive E3 eligibility, the recurring-pattern threshold, pattern identity, contributor identity, review currentness, or newest-review resolution. It delegates those responsibilities to the existing canonical authority:

```text
buildCoachingSynthesis
  → identifyRecurringBehavioralPatterns
  → latestPatternReviewStatus === "confirmed-as-pattern"
```

The canonical recurring-pattern projection:

- includes only current E3 occurrences whose latest exact-occurrence review is `confirmed-as-recorded`
- requires the existing E4 recurring-pattern threshold across distinct reviewed interaction records
- derives `patternId`, `patternVersionIdentity`, and contributor identities
- matches an E4 review to the exact pattern ID, current pattern version identity, and contributor identities
- resolves matching reviews newest-first by `reviewedAt`, with append order as the tie-breaker
- reports the latest matching status and review ID to downstream consumers

Therefore:

- an unreviewed E4 pattern does not qualify
- a rejected or corrected current E4 pattern does not qualify
- an older confirmation cannot resurface beneath a newer rejection or correction
- a newer confirmation may supersede an older rejection
- a review for a stale pattern version does not qualify
- changing report input order does not create false pattern-version drift

## Surface and Authority Distinctions

### Recurring Behavioral Patterns

Recurring Behavioral Patterns are the canonical E4 projection derived from multiple current, Commander-confirmed E3 interaction records. The Progress surface shows the pattern, its counts, source, and current pattern-review state, and provides the existing Commander controls to confirm, correct, reject, or review the pattern again.

A recurring pattern may exist while remaining unreviewed, corrected, or rejected. Its existence alone does not make it Coaching Synthesis.

### Coaching Synthesis

Coaching Synthesis is a read-only transformation of only those current recurring patterns whose latest valid pattern review is `confirmed-as-pattern`. It expresses what the Commander-confirmed recurring evidence can help the Commander notice.

The Progress surface displays only:

- `COACHING SYNTHESIS · E4`
- the competency label
- the observation

It does not display counts, generated time, basis, or provenance identifiers, and it provides no controls or actions.

### Practice Recommendation

Practice Recommendation remains the separate Phase 7 capability. Current Commander-confirmed E3 evidence creates practice eligibility. Bounded recognized mission history may diversify among already-qualified candidates. A matching current confirmed E4 may add context only after selection.

Coaching Synthesis does not call `recommendPractice()`, does not create a recommendation, and does not supply a suggestion, action, or `missionIntent`.

### Developing Capability and Profile Identity

Developing Capability Suggestions and Profile identity remain separate from Coaching Synthesis. A synthesis observation does not create a capability, adopt an identity, or change the Profile. The Progress copy states this boundary directly, and Profile authority remains governed by the existing Commander-controlled capability decision flow.

## Phase 8.1 — Confirmed Pattern to Coaching Synthesis

Commit: `34220bf7d4244ba07ae50389efe032e5ddd5935c`

`MissionIntelligenceSystem.buildCoachingSynthesis()` introduced the version 1 contract:

```js
{
  type: "coaching-synthesis",
  version: 1,
  domain: "camping.sales",
  generatedAt: "<ISO>",
  insights: [
    {
      basis: "confirmed-recurring-pattern",
      competency,
      label,
      observation,
      interactionCount,
      reportCount,
      provenance: {
        evidenceTier: "E4",
        patternId,
        patternVersionIdentity,
        patternReviewId,
      },
    },
  ],
}
```

The method always returns the full envelope. No eligible patterns produce `insights: []`, not `null`.

Eligible insights use canonical competency order:

1. rapport
2. discovery
3. product-selection
4. presentation
5. objection-handling
6. trial-close

The order is not a rank. It does not use counts, review time, recency, strength, or any quality concept.

## Phase 8.2 — Truth and Currentness Firewall

Commit: `d3f9375769f4de65993a7a869c5e2358a4c44e17`

The Phase 8.2 tests lock the existing authority rather than introducing a second derivation path. They prove:

- malformed E4 review containers fail safely without creating insights
- newest same-version rejection overrides older confirmation
- newest same-version correction overrides older confirmation
- newest same-version confirmation overrides older rejection and supplies its review ID as provenance
- mixed review statuses expose only confirmed current patterns
- stale versions do not qualify
- input report order does not change pattern identity or synthesis truth
- Phase 7 recommendation output and inputs remain unchanged by synthesis

## Rapport Truthfulness Gate

Commit: `9c73d1202c09b983faf7986e7567ba1777e938a3`

Rapport uses a stricter truth boundary because referencing customer-provided context records an action, not the customer's internal experience.

The canonical recurring-pattern observation is:

> Across &lt;interactionCount&gt; Commander-reviewed interaction records, you referenced customer-provided context during Rapport. This recurring pattern does not establish customer trust, comfort, sentiment, likability, or Rapport quality.

The Coaching Synthesis observation is:

> You confirmed a recurring pattern across &lt;interactionCount&gt; reviewed interaction records where you referenced customer-provided context during Rapport. This does not establish customer trust, comfort, sentiment, likability, or Rapport quality.

Neither surface may describe the Rapport pattern as effective or claim that the Commander built trust, created comfort, changed sentiment, became likable, or demonstrated Rapport quality.

The existing non-Rapport recurring-pattern and synthesis wording remains unchanged.

## Phase 8.3 — Progress Surface

Commit: `08afdd246ef9070fc4dce7a4ba5df3e7303460a5`

The display-only card appears on Progress in this order:

```text
Recurring Behavioral Patterns
→ Coaching Synthesis
→ Developing Capability Suggestions
```

Its user-facing framing is:

- **Heading:** Coaching Synthesis
- **Subheading:** What your confirmed recurring patterns can help you notice.
- **Intro:** These observations are derived from recurring behavioral patterns you confirmed across reviewed interactions. They describe evidence you reviewed; they do not score your ability or change your Profile.

The true empty state says:

> No coaching synthesis yet. Insights will appear here after you confirm a recurring behavioral pattern across reviewed interactions.

A missing authority or runtime failure uses the distinct unavailable state:

> Coaching synthesis is temporarily unavailable.

The UI preserves the order supplied by the canonical synthesis, uses `textContent` for the data-derived label and observation, and adds no buttons, review workflow, mission action, or Profile action.

Phase 8.3 also included bounded hardening of pre-existing mission leaf renderers so Progress reload does not fail when mission-owned DOM targets are absent. That hardening changes neither Coaching Synthesis nor mission lifecycle semantics.

## Commander Authority

The Commander remains the authority at every boundary:

- The Commander confirms whether an E3 occurrence was accurately recorded.
- The Commander confirms, corrects, or rejects a recurring E4 pattern.
- Only a current pattern the Commander confirmed may enter Coaching Synthesis.
- The Commander decides whether a separate practice recommendation should be previewed or accepted.
- The Commander decides whether a separate capability belongs in their Profile.

FounderOS may surface an evidence-bounded observation. It does not turn that observation into identity or action.

## What Coaching Synthesis Does Not Mean

A Coaching Synthesis insight does not mean that FounderOS has:

- scored or ranked the Commander or any competency
- established mastery, weakness, proficiency, deficiency, or confidence
- established improvement or decline
- verified skill quality or customer sentiment
- recommended a practice mission
- assigned a mission priority
- created a developing capability
- changed the Commander's Profile

Counts in the canonical synthesis are provenance facts about eligible records. They are not scores, weights, or strength indicators.

## Persistence and Mutation Boundary

Coaching Synthesis is ephemeral and derived at render time.

It does not:

- persist a synthesis artifact
- add a persistence or schema type
- call `MemorySystem.saveArtifact()` or `saveFounder()`
- mutate Field Reports, Behavioral Evidence reviews, or Behavioral Pattern reviews
- mutate mission state, completion state, XP, archive history, or `commandLog`
- mutate Profile state
- consume `coachingSignals` or self-assessment history as synthesis evidence

Historical E4 review records may retain the recurring-pattern wording captured when they were created. Phase 8 does not migrate or rewrite those records.

## Known Limitations and Deferred Work

Phase 8 v1 intentionally includes:

- no E3 fallback
- no Briefing integration
- no persistent synthesis artifact
- no acknowledgment or review workflow for synthesis
- no `suggestion` or `action` field in synthesis
- no scoring, mastery, weakness, or confidence model
- no automatic Profile promotion
- no automatic mission launch

It also remains limited to the current `camping.sales` domain and the existing six canonical competencies. Coaching Synthesis does not read Guidance or Reflection, and no future behavior is implied by this closeout.

## Verification

Phase 8 is protected by:

- Coaching Synthesis derivation tests covering output shape, ordering, empty state, freshness, detachment, mutation, persistence, forbidden fields, and forbidden inference language
- truth and currentness firewalls covering malformed E4 authority, newest matching review resolution, stale versions, mixed statuses, report-order stability, and provenance status
- recurring-pattern tests covering the canonical E4 projection and strict Rapport wording
- Progress UI tests covering supplied ordering, exact observations, empty and unavailable states, absence of controls, authority inputs, and no persistence or state mutation
- Phase 7 recommendation tests proving recommendation eligibility, context, UI, and mission behavior remain separate
- mission-surface tests proving Progress remains free of mission lifecycle controls and secondary-page rendering remains safe
- completed browser proof for true empty, populated Discovery, strict Rapport, runtime unavailable, restored canonical runtime, and clean reload states

Closeout verification baseline at Phase 8.3 is **693 passed, 0 failed**. The Phase 8.4 closeout adds documentation only and does not add tests merely to change that count.

## Phase 8 Closure

Phase 8 — Evidence-Informed Coaching is complete.

FounderOS can now answer what the Commander may learn from behavioral evidence they have reviewed by presenting observations derived only from current recurring patterns the Commander confirmed. It preserves the difference between evidence, synthesis, recommendation, and identity; returns silence when evidence does not qualify; and does not convert reviewed experience into a grade.

FounderOS reflects what the reviewed evidence can support. The Commander remains the authority over what it means and what happens next.