# Record What Happened After Practice

> A practice mission can orient the Commander toward reporting. It cannot report, prove, or evaluate what happened.

## Capability

**Name:** Practice-to-Field-Report Bridge
**Phase:** 11
**Status:** **CLOSED / DONE-DONE**

FounderOS answers one bounded product question:

**â€œAfter a practice mission, what does the Commander choose to record about what actually happened?â€**

Phase 11 connects an accepted, currently active canonical practice mission to the existing Field Report surface without converting mission state into reporting, evidence, or performance claims. The Commander chooses whether to navigate, what to enter, whether to save, and whether later to confirm an exact projected occurrence.

## Core Invariant

> â€œA practice mission may provide non-evidentiary context for an explicit Commander-created Field Report. Mission acceptance, objective completion, archive, XP, and mission history do not establish that the intended behavior occurred. Only Commander-authored structured reporting about an actual interaction, followed by exact Commander review, may become eligible E3 evidence.â€

## Authority Chain

The production authority chain is strict and one-directional:

```text
canonical practice mission
â†’ explicit Commander mission acceptance
â†’ founder.activePracticeMissionContext
â†’ MissionIntelligenceSystem.buildActivePracticeReportingContext(...)
â†’ Record What Happened
â†’ index.html#field-report-card
â†’ passive active practice context
â†’ Commander-authored Field Report
â†’ save
â†’ structured customerInteractions / salesStepOutcomes
â†’ behavioral evidence projection
â†’ unreviewed occurrence
â†’ exact Commander review
â†’ confirmed-as-recorded
â†’ eligible E3
```

Relevant owners include:

| Stage | Owner |
| --- | --- |
| Canonical practice mission generation and active practice context | `js/missions.js` |
| Explicit acceptance and active mission lifecycle | `js/main.js` |
| Active-only context clearing on archive | `js/endday.js` |
| Pure reporting-context projection and behavioral evidence projection | `systems/mission-intelligence.system.js` |
| Mission reporting navigation action | `js/missions.js` (`renderFieldReportHandoff`) |
| Field Report orientation, capture, and save UI | `js/widgets/field-report.widget.js` |
| Field Report card | `index.html` (`#field-report-card`) |
| Exact behavioral evidence review persistence | `ArchieCore.reviewBehavioralEvidence(...)` |

No earlier step authorizes a later one automatically. In particular, mission acceptance and navigation are not evidence, Field Report save is not evidence confirmation, and E3 eligibility requires the separate exact review boundary.

## Canonical Active Practice Context

When the Commander explicitly accepts one of the six canonical Camping Sales practice missions, Founder state may persist this active-only provenance object:

```js
{
  type: "active-practice-mission-context",
  version: 1,
  domain: "camping.sales",
  competency,
  missionIntent
}
```

It means only:

> The Commander explicitly accepted this canonical practice mission, and it is the current active practice assignment.

It does **not** mean:

- the behavior occurred;
- an objective was completed;
- a customer interaction happened;
- the Commander succeeded or failed;
- a Field Report exists;
- evidence exists;
- the mission is recommended;
- the Commander needs practice;
- the Commander has mastery or weakness.

The context is established only through the existing acceptance boundary. It is cleared when the active mission is archived and when mission generation replaces active mission identity. It is not inferred from a mission title, description, objective prose, archive entry, XP, completion state, history, Development Focus, or Practice Recommendation.

## Practice Reporting Context

`MissionIntelligenceSystem.buildActivePracticeReportingContext(...)` owns the pure, fail-closed reporting projection.

```js
MissionIntelligenceSystem.buildActivePracticeReportingContext(
  founder.activePracticeMissionContext,
  {
    status: founder.missionStatus,
    objectives: founder.missionObjectives
  }
)
```

It returns `null` or exactly:

```js
{
  type: "practice-reporting-context",
  version: 1,
  domain: "camping.sales",
  competency,
  label,
  missionIntent,
  source: {
    basis: "active-practice-mission"
  }
}
```

This is an ephemeral, pure derived projection. It is not persisted and is used only for truthful UI orientation. Eligibility belongs to this resolver; consumers do not parse titles, maintain title allowlists, infer from objectives, or reconstruct a mission intent from prose.

The canonical `label` comes from the shared practice definition. It describes what FounderOS assigned as the active practice context, not what the Commander did.

## Commander Reporting Surface

For a valid active practice reporting context, the existing active mission checklist presents:

```text
Record What Happened
```

It is a semantic navigation link to:

```text
index.html#field-report-card
```

The action means only:

> I choose to open the reporting surface for this active practice mission.

It is navigation only. It does not:

- prefill a Field Report;
- save a Field Report;
- create draft data;
- transfer route-state authority;
- add query parameters;
- use `localStorage` or `sessionStorage` handoff state;
- create an interaction or outcome;
- create evidence or a review.

Generic active missions, legacy active missions without canonical context, malformed contexts, inactive missions, and resolver failures show no reporting action. Objective completion does not gate the action: the Commander may choose to record what happened before, after, or without checking objectives.

## Field Report Active Practice Context

The existing Field Report card may display a passive block when a valid canonical reporting context exists at normal Field Report initialization.

Its exact concept is:

```text
Active practice context

<canonical reporting-context label>

This is context only. Nothing is reported or treated as evidence until you choose what to enter and save.
```

The widget resolves the context only during its normal initialization path. It guards missing dependencies and catches resolver failure locally. If no valid context is available, the block remains hidden and ordinary Field Report initialization continues.

This display is passive only:

- it may appear after manual navigation while a valid active practice mission exists;
- it does not claim the Commander arrived through **Record What Happened**;
- it does not claim practice occurred;
- it does not open the Field Report editor;
- it does not live-synchronize if mission state later changes while the page remains open.

Live synchronization is outside v1 scope.

## Field Report Authorship Boundary

The Commander authors all Field Report content.

The active practice context display is outside:

```text
#field-report-form
#fr-interactions-container
```

`buildReport()` does not read the practice context. The bridge does not silently attach any of the following to the saved Field Report:

- active practice context;
- practice reporting context;
- competency;
- mission intent;
- practice label;
- route or navigation origin.

The Field Report remains valid without an active practice mission, after a generic mission, through manual navigation, without the reporting action, and when practice context is hidden or unavailable.

## Save vs Evidence Review Boundary

Field Report save means only:

> The Commander saved a report.

It does **not** mean:

> The Commander confirmed this as behavioral evidence.

If Commander-authored structured `customerInteractions` and `salesStepOutcomes` satisfy an existing bounded behavioral-evidence rule, Mission Intelligence may project an occurrence. That occurrence begins unreviewed.

The separate Behavioral Evidence Review Ledger matches an exact occurrence using its canonical identifiers and source fingerprint. Only the latest exact-occurrence review status:

```text
confirmed-as-recorded
```

makes that occurrence eligible E3. `unreviewed`, `corrected`, and `rejected` occurrences are not eligible E3. Confirmation states only that the source and interpretation reflect what the Commander reported; it does not confirm competence.

## Non-Transitions and Firewalls

None of the following is evidence:

- mission acceptance;
- `activePracticeMissionContext`;
- `practice-reporting-context`;
- objective completion;
- `missionStatus`;
- archive;
- XP;
- `commandLog`;
- clicking **Record What Happened**;
- displaying Field Report practice context.

None may directly create or mutate:

- `customerInteractions`;
- `salesStepOutcomes`;
- E3 or E4;
- Profile;
- Development Focus;
- Practice Recommendation.

Mission state creates an opportunity for Commander reporting. It never creates a record of what happened.

## Persistence Boundaries

### Persisted by Phase 11

Only this active-only Founder state is persisted by the bridge:

```js
founder.activePracticeMissionContext
```

### Not persisted by the bridge

The bridge does not persist:

- `practice-reporting-context`;
- click or navigation origin;
- Field Report context-display state;
- practice label in the report;
- mission intent or competency in a Field Report because of the bridge;
- evidence or review status.

Existing Field Report persistence and review-ledger persistence retain their separate owners and contracts.

## Archive and Historical Scope

The capability is active-mission only.

- Active practice context is cleared or suppressed when the mission becomes inactive or is archived.
- New mission generation safely clears or replaces active practice context.
- `commandLog` is mission/archive history, not reporting context.
- Historical/archive practice reporting context is intentionally out of scope.
- FounderOS does not infer reporting context from archived mission titles.

No historical reporting route, archive metadata expansion, or title-based archive lookup was added.

## Independence Guarantees

The Field Report remains valid:

- with no active practice mission;
- after a generic mission;
- from manual navigation;
- without **Record What Happened**;
- with hidden or unavailable practice context.

The bridge is additive orientation, not a prerequisite for reporting.

## Six Supported Camping Sales Practice Definitions

The canonical shared practice definition owns these existing mappings:

| Competency | Mission intent | Action label |
| --- | --- | --- |
| `rapport` | `practice-rapport` | Practice Referencing Customer Context |
| `discovery` | `practice-customer-discovery` | Practice Customer Discovery |
| `product-selection` | `practice-product-selection` | Practice Product Selection |
| `presentation` | `practice-presentation` | Practice a Customer-Need Presentation |
| `objection-handling` | `practice-objection-handling` | Practice Objection Handling |
| `trial-close` | `practice-trial-close` | Practice a Trial Close |

The bridge reuses these canonical mappings. It does not add a second competency-to-intent or competency-to-label map.

## Slice History

### Phase 11.1 â€” Canonical Active Practice Reporting Context

- Persisted compact active-only provenance after explicit canonical practice acceptance.
- Added pure, fail-closed `buildActivePracticeReportingContext(...)`.
- Preserved canonical mission identity without title or objective-text inference.

### Phase 11.2 â€” Active Practice Reporting Surface

- Replaced title-based practice reporting eligibility with canonical reporting-context eligibility.
- Added the navigation-only **Record What Happened** action to the active practice checklist.

### Phase 11.3 â€” Field Report Active Practice Context

- Added passive Field Report orientation using the canonical resolver label.
- Kept context outside the report form and report data path.
- Added no prefill, context transfer, persistence bridge, or evidence behavior.

### Phase 11.4 â€” Closure Audit and Documentation

- Verified no additional production slice is required for the bounded bridge.
- Recorded authority, persistence, Field Report, review, archive, and evidence boundaries.

## Test Coverage

Focused Phase 11 coverage includes:

- `tests/active-practice-reporting-context.test.js`
- `tests/active-practice-reporting-surface.test.js`
- `tests/trial-close-field-report-handoff.test.js`
- `tests/field-report-active-practice-context.test.js`
- `tests/field-report-save-confirmation.test.js`
- `tests/field-report-structured-outcome.test.js`
- `tests/behavioral-evidence-review-ledger.test.js`
- `tests/behavioral-evidence-review-ui.test.js`

Relevant practice mission and Phase 7â€“10 protection suites include:

- `tests/first-sales-trial-close-mission.test.js`
- `tests/practice-rapport-mission.test.js`
- `tests/practice-product-selection-mission.test.js`
- `tests/practice-presentation-mission.test.js`
- `tests/practice-objection-handling-mission.test.js`
- `tests/practice-recommendation.test.js`
- `tests/coaching-synthesis.test.js`
- `tests/development-focus-options.test.js`
- `tests/focus-practice-option-authority.test.js`
- `tests/focus-practice-mission-handoff.test.js`
- `tests/mission-surface-consistency.test.js`

These suites verify canonical context establishment and clearing, pure resolver contracts, title-free eligibility, navigation-only behavior, Field Report isolation, exact review boundaries, and the absence of evidence or lifecycle authority transfer.

## Non-Goals and Future Scope

Phase 11 does not include:

- auto-prefill;
- auto-created interactions or outcomes;
- auto evidence;
- auto review;
- historical/archive reporting context;
- route-causation tracking;
- mission history as evidence;
- mission completion as evidence;
- automatic Profile, Development Focus, or Practice Recommendation mutation.

Any future work must preserve the Commanderâ€™s authorship of report content and the distinct exact-review boundary for E3 eligibility.

## Closure Statement

Phase 11 truthfully answers:

> â€œAfter a practice mission, what does the Commander choose to record about what actually happened?â€

FounderOS can orient the Commander toward the existing Field Report surface for a valid active practice assignment. The Commander alone chooses what to record, whether to save it, and whether later to confirm an exact projected occurrence.

**Phase 11 â€” Practice-to-Field-Report Bridge is CLOSED / DONE-DONE, subject to final regression proof and commit.**
