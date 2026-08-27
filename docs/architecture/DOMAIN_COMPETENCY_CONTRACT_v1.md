# FounderOS Domain Competency Contract v1

## Status and purpose

**Version:** 1.0
**Status:** Active contract
**Domain:** `camping.sales`

This contract gives the existing Camping World sales competencies one explicit, reusable owner. It defines vocabulary and exact validation only. It does not change evidence, identity, coaching, missions, Guidance, or personalization.

## Meaning and authority

A canonical competency is a structured concept owned by a domain.

It is not automatically evidence, identity, proficiency, a strength, a skill, a score, coaching priority, or mission priority. The same key can link records across systems without granting those records the same authority.

For example, `trial-close` may identify a Field Report sales step, an E3 or E4 competency, a Commander-approved developing capability, or future objective relevance metadata. Those uses share a concept but retain separate evidence and identity rules.

## Canonical vocabulary

| Domain | Key | Display label |
|---|---|---|
| `camping.sales` | `rapport` | Rapport |
| `camping.sales` | `discovery` | Discovery |
| `camping.sales` | `product-selection` | Product Selection |
| `camping.sales` | `presentation` | Presentation |
| `camping.sales` | `objection-handling` | Objection Handling |
| `camping.sales` | `trial-close` | Trial Close |

Keys and domain identifiers require exact equality. There are no aliases, case folding, label matches, keyword matches, or prose inference.

## Canonical reference

Future structured sources use:

```js
{
  domain: "camping.sales",
  competency: "trial-close"
}
```

Both fields are required for future cross-domain references. A competency key alone is not globally unique.

## Contract owner and operations

`DomainCompetencyContract` in `systems/domain-competency.contract.js` owns:

- the canonical domain identifier;
- the six key/label mappings;
- exact domain-and-key validation;
- exact label lookup; and
- defensive vocabulary projection.

Its public operations are:

```js
getDomainCompetencies(domain)
isCanonicalDomainCompetency(domain, competency)
getDomainCompetencyLabel(domain, competency)
validateDomainCompetencyReference(reference)
```

Unknown domains and invalid keys fail closed.

## Declaration authority

Only a domain-owned structured source may declare a competency reference. Legitimate future declarers may include:

- the Field Report schema and capture contract;
- a domain-owned mission template; or
- a domain-authored structured objective.

Generic systems may validate, preserve, propagate, and compare explicit references. They must not infer, guess, create aliases, translate prose, parse IDs, or map labels to competency keys.

## Consumer boundary

Mission Intelligence may use this vocabulary for validation, label lookup, and stable ordering without changing evidence eligibility or priority. Profile validation may use it without changing adoption, withdrawal, support state, or personalization semantics.

Guidance, Workshop, Reflection, Briefing, and Communication must not use this sales vocabulary to infer meaning. A future generic consumer may receive an explicit reference from a domain-owned source and compare it exactly.

## Exact-match rule

Future cross-domain matching requires:

```js
sourceReference.domain === targetReference.domain &&
sourceReference.competency === targetReference.competency
```

No normalization or fallback inference is permitted.

Existing Profile capabilities store only `competency`. They are implicitly tied to the current Camping World sales vocabulary by their existing schema and validation. This contract does not add a domain field to persisted Profile records and must not silently invent one during storage or reload.

## Backward compatibility

Existing keys remain byte-for-byte unchanged. No saved Field Report, review, E3, E4, Profile capability, candidate, or decision record is migrated or rewritten.

Existing local validation lists remain temporarily in their current runtime owners. Replacing all of them now would require coordinated browser load-order and VM-test harness changes. That migration is intentionally deferred so this contract does not alter working derivation or identity behavior.

## Future domains

Every future domain must define and own its own vocabulary. A shared English label does not establish shared semantics.

For example, a future generic-career concept labeled “Discovery” is not automatically `camping.sales / discovery`. It requires its own domain contract and explicit reference.

## Mission and Guidance boundary

This contract adds no mission templates, mission metadata, structured objectives, or Guidance behavior. A future objective-metadata slice may reference this contract only when the objective is authored by the `camping.sales` domain.

Missing metadata must continue to mean no capability personalization. Capability identity must never select a mission, objective, question, difficulty, or recommendation.
