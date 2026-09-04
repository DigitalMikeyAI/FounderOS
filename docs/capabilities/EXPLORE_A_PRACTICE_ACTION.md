# Explore a Practice Action

> A Development Focus records Commander intention. It may expose a matching practice action, but it never becomes a recommendation or mission authority.

## Capability

Phase 10 closes the **Commander Focus-to-Practice Bridge**.

A Commander who has explicitly saved a Development Focus may see zero or one neutral, pre-authored practice action for that focus. The Commander may explicitly choose to preview that action's existing practice mission. FounderOS does not choose the action for them, and the preview does not activate a mission.

## Product Question

**“Which available practice action, if any, does the Commander choose to explore for their saved Development Focus?”**

## Core Invariant

> A saved Development Focus may identify a matching pre-authored practice option. Only explicit Commander action may turn that option into a mission request, and only explicit mission acceptance may activate it. The focus remains intention—not evidence, recommendation, need, or mission authority.

## What Phase 10 Does

FounderOS can now:

- project one valid saved `development-focus` snapshot onto one matching pre-authored Camping Sales practice relationship
- expose that projection as an ephemeral neutral Focus Practice Option
- display the available action near the saved Development Focus on Progress
- keep the action available for a valid historical focus even when exact-source support is no longer present or cannot be checked
- let the Commander explicitly click **Preview Practice Mission**
- route that exact canonical mission intent through the existing pending-request and Mission Preview lifecycle
- leave mission activation to the existing **ACCEPT MISSION** control

The Phase 10 surface is an intention-to-exploration bridge. It is not a new evidence, recommendation, planning, or mission-lifecycle system.

## What Phase 10 Does Not Do

Phase 10 does not:

- recommend an action
- claim weakness, mastery, need, urgency, or priority
- rank, score, weight, or preselect actions
- infer an action from current evidence
- require exact E4 support to remain current
- create a new evidence record
- alter Profile state
- auto-select a mission
- auto-preview a mission
- auto-activate a mission
- create a new persisted action, choice, or plan artifact
- replace Phase 7 Practice Recommendation
- bypass **ACCEPT MISSION**
- reuse `missionGoal` or `dailyCore.nextFocus`
- use XP, mission completion, archive history, command history, or Profile as a hidden action weight

## Authority Chain

The complete authority chain is strict and one-directional:

```text
Confirmed E4
→ Coaching Synthesis
→ Development Focus Options
→ COMMANDER CHOOSES FOCUS
→ saved Development Focus intention
→ neutral Focus Practice Option
→ COMMANDER clicks Preview Practice Mission
→ existing pendingMissionRequest
→ existing Mission Preview
→ COMMANDER clicks ACCEPT MISSION
→ Active Mission
→ Guidance
```

The Commander decision boundaries are explicit:

1. **Choose Development Focus** — the Commander turns an available evidence-informed option into a saved intention.
2. **Preview Practice Mission** — the Commander turns a neutral matching practice option into an existing pending mission request.
3. **ACCEPT MISSION** — the Commander alone activates the previewed mission through the established lifecycle.

No earlier stage grants authority to a later stage automatically.

## Development Focus Semantics

A saved Development Focus is Commander-authored intention. It is a historical snapshot of the choice the Commander made; it is not evidence, an evaluation, identity, a recommendation, proof of need, or mission state.

Phase 9's exact-source support projection remains separate from Phase 10. `buildDevelopmentFocusSupport()` reports only whether the exact source captured with the saved focus is represented in current Development Focus Options. It cannot reinterpret, replace, clear, or invalidate the saved intention.

Therefore:

- `exact-source-not-present` does not make a valid saved focus invalid
- `unavailable` support does not make a valid saved focus invalid
- a matching Focus Practice Option may still be offered in either state

Support/currentness is descriptive provenance context only. Phase 10 never describes a practice action as currently supported, recommended, needed, best, or evidence-selected.

## Focus Practice Option Contract

The canonical derivation authority is:

```js
MissionIntelligenceSystem.buildFocusPracticeOption(developmentFocus)
```

For one valid saved Development Focus, it returns either `null` or exactly this version 1 envelope:

```js
{
  type: "focus-practice-option",
  version: 1,
  domain: "camping.sales",
  competency,
  label,
  missionIntent,
  source: {
    basis: "commander-development-focus"
  }
}
```

The option is a neutral projection from the saved focus to an existing authored practice relationship. `missionIntent` identifies an existing pre-authored practice mission. It does not itself create a request, preview a mission, activate a mission, or authorize a lifecycle transition.

The projection reads the canonical saved-focus snapshot and shared practice definition only. It does not require support/currentness, raw Field Reports, E3, E4 recomputation, Coaching Synthesis, Development Focus Options, Practice Recommendation, Profile, XP, history, or mission state. It persists nothing and mutates nothing.

## Shared Practice Definition

`MissionIntelligenceSystem.getCampingSalesPracticeDefinition(...)` owns one bounded semantic definition for each supported Camping Sales competency. Each definition contains canonical competency metadata, the Phase 7 label, the mission intent, and the neutral Phase 10 `actionLabel`.

This shared definition:

- prevents Phase 7 and Phase 10 competency-to-intent mappings from diverging
- is used by Phase 7 practice candidate construction
- is used by Phase 10 Focus Practice Option projection
- keeps mission templates and mission lifecycle ownership outside Mission Intelligence

The definition is semantic metadata, not a mission template, recommendation, ranking, or selection mechanism.

## Progress Action Surface

`js/archie.js` owns the Progress rendering and explicit Commander handoff UI. Within a valid saved Development Focus record, it renders:

```text
PRACTICE ACTION

<option.label>

This practice action matches the Development Focus you chose. It is not a recommendation, and choosing to explore it does not start a mission.

Preview Practice Mission
```

The preview control has the accessible label:

```text
Preview <option.label> mission
```

No Practice Action subsection renders when there is no saved focus.

If option construction returns `null`, Progress says:

> No matching practice action is available for this saved Development Focus.

If construction throws unexpectedly, Progress says:

> Practice action is temporarily unavailable.

The control disables only during its synchronous routing call and re-enables immediately afterward on either success or failure. Repeated explicit Commander clicks are allowed; there are no automatic retries, timers, or hidden UI lifecycle state.

## Canonical Mission Router

`js/missions.js` owns the canonical practice mission router:

```js
selectPracticeMissionRequestByIntent(missionIntent)
```

It:

- accepts only the six canonical Camping Sales practice mission intents
- routes by exact intent only, never by label or competency prose
- fails closed for missing, malformed, or unknown input
- delegates to the existing direct mission selectors
- does not activate a mission

Both Phase 7 Practice Recommendation and Phase 10 Progress handoff use this router. This keeps the six-way selector map in the existing mission authority owner and prevents duplicate mappings in recommendation or Progress code.

## Pending Mission Request Semantics

The router uses the existing persisted future-mission request shape:

```js
{
  domain: "camping.sales",
  missionIntent
}
```

`pendingMissionRequest` identifies a selected future mission under the existing mission lifecycle. It is not an active mission and does not itself establish mission acceptance.

## Existing Preview Lifecycle

The existing direct selector behavior remains authoritative:

1. the selector persists the exact pending request
2. a returning Commander may be shown the existing Mission Preview through `presentPendingMissionRequestForPreview()`
3. an active mission remains untouched; the future request may remain pending until the normal archive flow releases the slot
4. **Not Now**, Escape, and backdrop dismissal close only the visible preview under existing behavior
5. dismissal does not reinterpret or clear Development Focus

Phase 10 creates no custom modal and does not implement a second preview lifecycle.

## Activation Authority

**ACCEPT MISSION** in `js/main.js` remains the sole activation boundary.

Phase 10 does not set active mission state, set onboarding state, generate a custom mission, or imitate acceptance. It only reaches the established pending-request and preview path after the Commander's explicit preview click.

## Historical and Currentness Rule

Phase 10 intentionally preserves this decision:

> A valid historical saved Development Focus may expose its matching practice action even when its exact supporting E4 source is no longer present.

The reason is authority, not evidence freshness: the Commander chose the focus. Currentness affects provenance context, not the validity of that saved intention. A matching action remains neutral in this situation; it is not called currently supported, recommended, needed, or evidence-selected.

## Failure Behavior

Progress handles handoff failure locally and does not change the saved focus:

- missing router or invalid exact intent:

  > Practice mission could not be prepared from this Development Focus.

- unexpected request or preview preparation failure:

  > Practice mission could not be previewed right now.

No fallback competency or alternate mission is selected.

## Persistence Model

- Development Focus persists through the existing Phase 9 Commander choice model.
- Focus Practice Option is ephemeral and derived at render time.
- Phase 10 creates no artifact, schema, focus status field, action-choice record, or plan artifact.
- `pendingMissionRequest` uses existing Founder/Commander mission persistence.
- Active mission state uses the existing mission lifecycle and acceptance boundary.

## Important Architectural Boundaries

| Owner | Responsibility |
| --- | --- |
| `MissionIntelligenceSystem` | Neutral Focus Practice Option derivation and shared Camping Sales practice definition. |
| `js/archie.js` | Progress rendering and the explicit Commander preview-handoff control. |
| `js/missions.js` | Canonical practice-intent routing, pending request, authored mission templates, and existing preview lifecycle. |
| `js/main.js` | Existing **ACCEPT MISSION** activation authority. |
| Phase 7 | Evidence-backed Practice Recommendation; it remains distinct and delegates its preview routing to the shared mission router. |
| Phase 9 | Commander Development Focus intention and separate exact-source support context. |
| Phase 10 | The bounded bridge from saved intention to explicit exploration. |

## Current Limitations and v1 Boundaries

Phase 10 v1 intentionally includes:

- only the six supported `camping.sales` competencies and their pre-authored practice missions
- zero or one matching action for one saved Development Focus
- no Commander-authored custom action
- no alternative action list
- no ranking, scoring, or priority order
- no action or plan artifact
- no generalized cross-domain practice router
- no automatic action selection, request creation, preview, or activation
- no mission preview from malformed saved focus or malformed mission intent
- browser/runtime demonstration only when real saved-focus data exists; no runtime data is fabricated for proof

## Verification

The closure proof covers neutral option construction, authority isolation, Progress rendering and handoff, shared Phase 7 routing, exact pending-request behavior, existing preview dismissal, active-mission deferral, and explicit acceptance.

Focused suites at closure:

- `tests/focus-practice-option.test.js`: **17/17 passed**
- `tests/focus-practice-option-authority.test.js`: **19/19 passed**
- `tests/development-focus-ui.test.js`: **33/33 passed**
- `tests/focus-practice-mission-handoff.test.js`: **5/5 passed**
- `tests/practice-recommendation.test.js`: **60/60 passed**
- `tests/pending-mission-request.test.js`: **13/13 passed**
- `tests/returning-commander-mission-lifecycle.test.js`: **12/12 passed**
- `tests/first-sales-trial-close-mission.test.js`: **12/12 passed**

Relevant Phase 8 and Phase 9 regressions at closure:

- `tests/coaching-synthesis.test.js`: **32/32 passed**
- `tests/coaching-synthesis-ui.test.js`: **11/11 passed**
- `tests/development-focus-options.test.js`: **40/40 passed**
- `tests/development-focus-decision.test.js`: **26/26 passed**
- `tests/development-focus-support.test.js`: **21/21 passed**

Full suite at closure: **854/854 passed, 0 failed, 0 skipped, 0 todo**.

## Phase 10 Closure

Phase 10 — Commander Focus-to-Practice Bridge is complete.

FounderOS now answers:

> “Which available practice action, if any, does the Commander choose to explore for their saved Development Focus?”

It does so without granting FounderOS authority to choose, recommend, or activate that mission for the Commander.