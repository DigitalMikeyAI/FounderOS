# FIELD_REPORT_SCHEMA_v1

**Status:** Conceptual Schema — v1  
**Domain:** Camping World Academy  
**System:** FounderOS Official  
**Purpose:** Define the structured learning-data model used by FounderOS Field Reports.

---

# 1. Purpose

The FounderOS Field Report exists to capture useful learning signals from real-world work experience without requiring the user to behave like a database.

The Field Report is **not** intended to recreate Camping World's CRM, customer records, VIN systems, deal records, or other operational infrastructure.

Its purpose is to help FounderOS understand how the user is developing through experience.

Core system boundary:

> **The salesperson supplies the experience.**  
> **FounderOS supplies the structure.**  
> **Archie supplies the coaching.**

Camping World's systems remain the system of record for customers and deals.

FounderOS becomes the user's **learning system of record**.

---

# 2. Design Principles

## 2.1 Capture Signals, Not Paperwork

The Field Report should capture useful signals from the workday without becoming a large mandatory form.

The existence of potentially useful information does not automatically justify creating a dedicated field for it.

A dedicated field should generally exist when FounderOS expects to:

- search it
- compare it
- filter it
- validate it
- analyze it independently over time

Otherwise, information may remain contextual or freeform.

---

## 2.2 Structured Data Does Not Require Structured User Input

The desired future experience is:

```text
Natural language / voice capture
        ↓
Archie extracts meaningful signals
        ↓
Structured Field Report
        ↓
User reviews/corrects when necessary
        ↓
FounderOS stores structured learning data
        ↓
Longitudinal pattern analysis
        ↓
Targeted coaching
```

The user should be able to say:

> "Okay Archie, here's what happened today..."

FounderOS and Archie should perform the organizational work.

---

## 2.3 Preserve Freeform Information

Structured fields capture information FounderOS already knows it wants to analyze.

Freeform fields preserve information FounderOS did not know in advance would matter.

The schema should therefore maintain appropriate escape hatches for meaningful context.

---

## 2.4 Optional Storage

A Field Report should not fail simply because every possible signal cannot be extracted.

Most learning data is optional.

Missing information is preferable to invented information.

Archie should not manufacture values merely to populate fields.

---

## 2.5 No Shadow CRM

FounderOS should avoid unnecessary customer personally identifiable information.

Customer information stored inside Field Reports should be sanitized and limited to learning-relevant context.

Example:

```text
"First-time RV family with a toddler."
```

Not:

```text
Customer name
Phone number
Email address
Home address
```

unless a future architecture explicitly establishes a legitimate need and appropriate boundary for such information.

PII sanitization requirement (v1)

Before persistence, the capture pipeline MUST sanitize obvious customer identifiers when they appear inside learning-context or freeform fields (for example: `buyerContext`, `notes`, `captureBay.content`). At minimum, implementations should redact the following patterns:

- email addresses -> `[redacted-email]`
- phone numbers -> `[redacted-phone]`
- VINs / obvious vehicle identifiers -> `[redacted-vehicle-id]`

Do NOT claim reliable automatic personal-name detection as part of v1. Do NOT design a complete privacy subsystem within this schema. Do NOT store an unredacted duplicate of any sanitized content inside FounderOS. The exact sanitization implementation and any optional metadata indicating sanitization are implementation concerns and are intentionally deferred to module-level code.

---

## 2.6 Longitudinal Value

The individual Field Report is not the final product.

The longitudinal pattern is the product.

Over time, Field Reports should make it possible for FounderOS and Archie to identify patterns such as:

- recurring objections
- frequently missed sales steps
- sales stages becoming strengths
- stages repeatedly skipped
- product-knowledge gaps
- recurring mentor or manager advice
- customer types the user connects strongly with
- improvement following practice
- scenarios that should become future roleplays

Long-term learning loop:

```text
WORK
  ↓
EXPERIENCE
  ↓
CAPTURE
  ↓
STRUCTURE
  ↓
PATTERN
  ↓
COACHING
  ↓
PRACTICE
  ↓
WORK
```

---

# 3. Field Ownership

Fields may use the following conceptual ownership types.

### SYSTEM

FounderOS creates and manages the value automatically.

### USER

The user explicitly provides the value.

### ARCHIE

Archie derives or generates the value from available evidence.

### USER/ARCHIE

The value may be explicitly supplied by the user or extracted by Archie from natural-language input, with the user able to review or correct it.

Ownership definitions describe responsibility.

They do not necessarily dictate the eventual UI.

---

# 4. Full Schema Backbone

```text
FieldReport
├── id
├── date
├── reportType
├── customerInteractions[] 0..N
│   ├── id
│   ├── createdAt
│   ├── updatedAt
│   ├── interactionType
│   ├── buyerContext
│   ├── customerGoal
│   ├── keyNeeds[]
│   ├── hotButtons[]
│   ├── productsConsidered[]
│   ├── objections[]
│   ├── buyingSignals[]
│   ├── salesStepsObserved[]
│   ├── salesStepsPerformed[]
│   ├── myRole
│   ├── outcome
│   ├── notableMoment
│   └── explicitStrengths[]
│
├── learningSignals[] 0..N
│   ├── id
│   ├── createdAt
│   ├── updatedAt
│   ├── learning
│   ├── relatedSalesSteps[]
│   ├── sourceRefs[]
│   └── notes
│
├── coachingSignals[] 0..N
│   ├── id
│   ├── createdAt
│   ├── updatedAt
│   ├── signal
│   ├── signalType
│   ├── relatedSalesSteps[]
│   ├── sourceRefs[]
│   └── notes
│
├── captureBay[] 0..N
│   ├── id
│   ├── createdAt
│   ├── updatedAt
│   ├── content
│   └── sourceRefs[]
│
└── systemMetadata
    ├── schemaVersion
    ├── updatedAt
    └── processingStatus
```

`0..N` means a Field Report may contain zero, one, or many records in that collection.

---

# 5. Report Identity

```text
FieldReport
├── id
├── date
├── reportType
├── shiftContext
└── createdAt
```

## `id`

**Ownership:** SYSTEM  
**Required:** Yes

Unique FounderOS identity for the Field Report.

---

## `date`

**Ownership:** USER/ARCHIE  
**Required:** Yes

The workday or experience date described by the report.

Required format (v1): normalized ISO date-only string `YYYY-MM-DD`.

Example:

```text
2026-08-15
```

This is distinct from `createdAt`.

A report may be created after the day it describes.

---

## `reportType`

**Ownership:** USER/ARCHIE  
**Required:** Yes

Describes the general kind of Field Report.

Potential concepts may eventually include:

- shift
- training
- customer interaction
- quick capture

Exact enum values are intentionally **not finalized in v1 conceptual design**.

---

## `shiftContext`

**Ownership:** USER/ARCHIE  
**Required:** No

Short human-readable context describing the overall work environment.

Example:

> "Saturday onboarding/training shift; mostly shadowing with limited floor traffic."

This field should remain intentionally broad.

Do not prematurely explode this context into dedicated fields such as:

- trafficLevel
- weekend
- trainingDay
- weather
- staffingLevel

unless future longitudinal analysis demonstrates a genuine need.

---

## `createdAt`

**Ownership:** SYSTEM  
**Required:** Yes

Exact timestamp indicating when FounderOS created the Field Report record.

---

# 6. Daily Core

```text
dailyCore
├── dailyWin
├── keyLearning
├── biggestChallenge
├── nextFocus
└── notes
```

All Daily Core fields are optional.

---

## `dailyWin`

**Ownership:** USER/ARCHIE  
**Required:** No

The most meaningful progress, success, or positive development from the day.

Primary question:

> What progress am I making?

---

## `keyLearning`

**Ownership:** USER/ARCHIE  
**Required:** No

The primary overall takeaway from the day.

Primary question:

> What did I learn today?

This is intentionally broader than individual records inside `learningSignals[]`.

---

## `biggestChallenge`

**Ownership:** USER/ARCHIE  
**Required:** No

The most meaningful difficulty experienced during the day.

Primary question:

> What created difficulty today?

Repeated values may eventually contribute to longitudinal coaching patterns.

---

## `nextFocus`

**Ownership:** USER/ARCHIE  
**Required:** No

The skill, knowledge area, behavior, or sales-process element the user intends to focus on next.

Primary question:

> What am I deliberately working on next?

---

## `notes`

**Ownership:** Primarily USER  
**Required:** No  
**Type:** Freeform

Escape hatch for meaningful information about the day that does not naturally belong elsewhere.

Example:

> "Learned the dealership closes at 18:00 on weekends. Also had a great conversation with a customer about software engineering and mentioned FounderOS."

`notes` should primarily preserve information the user personally wanted remembered.

Archie may clean or organize user-provided notes but should not invent content merely to populate this field.

---

# 7. Customer Interactions

```text
customerInteractions[]  // 0..N

├── id
├── interactionType
├── buyerContext
├── customerGoal
├── keyNeeds[]
├── hotButtons[]
├── productsConsidered[]
├── objections[]
├── buyingSignals[]
├── salesStepsObserved[]
├── salesStepsPerformed[]
├── myRole
├── outcome
├── notableMoment
└── explicitStrengths[]
```

A Field Report may contain zero, one, or many meaningful customer interactions.

The purpose of this section is **learning capture**, not customer-record management.

---

## `id`

**Ownership:** SYSTEM  
**Required:** Yes when an interaction record exists

Unique identity for the interaction within FounderOS.

Allows other learning records to reference the interaction without duplicating its contents.

---

## `interactionType`

**Ownership:** USER/ARCHIE  
**Required:** No

Describes the general nature of the user's participation.

Potential concepts include:

- observed
- assisted
- led
- follow-up

Exact enum values are intentionally deferred.

---

## `buyerContext`

**Ownership:** USER/ARCHIE  
**Required:** No

Sanitized description of relevant customer context.

Example:

> "First-time RV family with a toddler."

The purpose is to preserve learning-relevant context without unnecessary PII.

---

## `customerGoal`

**Ownership:** USER/ARCHIE  
**Required:** No

The underlying lifestyle or outcome the customer is attempting to achieve.

Example:

> "Get the family camping while the children are young."

This should capture the desired outcome rather than merely a requested product.

---

## `keyNeeds[]`

**Ownership:** USER/ARCHIE  
**Required:** No

Concrete requirements discovered during the interaction.

Examples:

```text
- towability
- sleeping capacity
- family-friendly bathroom configuration
- usable interior space during bad weather
```

---

## `hotButtons[]`

**Ownership:** USER/ARCHIE  
**Required:** No

Features, benefits, experiences, or ideas that produced especially strong customer interest or emotional engagement.

A need and a hot button are not necessarily the same thing.

---

## `productsConsidered[]`

**Ownership:** USER/ARCHIE  
**Required:** No

Relevant RVs, product categories, floorplans, or features considered during the interaction.

This does not automatically require VIN-level specificity.

---

## `objections[]`

**Ownership:** USER/ARCHIE  
**Required:** No

Meaningful resistance, concerns, hesitation, or barriers expressed during the interaction.

Examples:

```text
- towing safety
- payment
- interior space
```

---

## `buyingSignals[]`

**Ownership:** USER/ARCHIE  
**Required:** No

Observable signs of customer interest, preference, or purchase readiness.

Examples:

```text
- both spouses rated the unit 10/10
- asked about delivery timing
```

---

## `salesStepsObserved[]`

**Ownership:** USER/ARCHIE  
**Required:** No

Camping World sales-process steps the user observed another salesperson perform.

---

## `salesStepsPerformed[]`

**Ownership:** USER/ARCHIE  
**Required:** No

Camping World sales-process steps the user personally performed.

Observed and performed steps must remain separate.

This distinction enables future analysis such as:

> "You have observed 30 Worksheets but personally performed only 4."

---

## `myRole`

**Ownership:** USER/ARCHIE  
**Required:** No

Short contextual description of the user's participation when `interactionType`, `salesStepsObserved[]`, and `salesStepsPerformed[]` do not fully explain the role.

Example:

> "Shadowed salesperson; participated casually in rapport-building."

---

## `outcome`

**Ownership:** USER/ARCHIE  
**Required:** No

Describes what ultimately happened during or after the interaction.

Potential concepts include:

- sold
- no sale
- follow-up
- still shopping
- unknown

Exact enum values are intentionally deferred.

---

## `notableMoment`

**Ownership:** USER/ARCHIE  
**Required:** No

The moment from the interaction that was especially memorable, surprising, or potentially meaningful.

Example:

> "Customer with young child raised the importance of having a tub-style shower."

A notable moment may later become evidence for a Learning Signal or Coaching Signal.

---

## `explicitStrengths[]`

**Ownership:** USER
**Required:** No

User-selected self-assessed strengths from Coaching Strength Vocabulary v0.1.

Each value represents a competency the user explicitly believes they performed well during this customer interaction.

**Type:** `string[]`
**Cardinality:** 0..N per customer interaction

Allowed values:

- `rapport`
- `discovery`
- `product-selection`
- `presentation`
- `objection-handling`
- `trial-close`

Example:

```text
explicitStrengths:
- discovery
- objection-handling
```

Selecting a value means:

> "The user explicitly self-identified this competency as a strength during this customer interaction."

It does **not** mean FounderOS independently determined that the user demonstrated this strength.

FounderOS must not infer, score, classify, or independently evaluate these selections.

If this field is absent, it means only that the user did not explicitly select a Coaching Strength Vocabulary v0.1 strength for this interaction. Absence must not be interpreted as evidence that the user demonstrated no strengths.

Existing Field Reports without this field remain valid. No migration or backfill is required.

---

# 8. Learning Signals

```text
learningSignals[]  // 0..N

├── id
├── learning
├── relatedSalesSteps[]
├── sourceRefs[]
└── notes
```

A Learning Signal represents:

> **A reusable piece of knowledge gained from real experience that FounderOS may want to compare, reinforce, or coach against later.**

A Learning Signal is different from `dailyCore.keyLearning`.

`keyLearning` captures the primary overall takeaway from the day.

`learningSignals[]` captures individual reusable lessons that may become meaningful across many Field Reports.

---

## `id`

**Ownership:** SYSTEM  
**Required:** Yes when a Learning Signal exists

Unique identity for the Learning Signal.

---

## `learning`

**Ownership:** USER/ARCHIE  
**Required:** No

The reusable lesson.

Example:

> "Discovery with families should include normal home routines, not just sleeping capacity."

---

## `relatedSalesSteps[]`

**Ownership:** ARCHIE / USER/ARCHIE  
**Required:** No

Camping World sales-process steps to which the learning applies.

Example:

```text
- Interview
- Product Selection
- Presentation
```

Not every Learning Signal must relate to a formal sales step.

---

## `sourceRefs[]`

**Ownership:** SYSTEM/ARCHIE  
**Required:** No

References to existing Field Report records that provide evidence or context for the Learning Signal.

Example:

```text
sourceRefs:
{
  "artifactId": "field_report_001",
  "subType": "customerInteraction",
  "subId": "interaction_001"
}
```

This avoids duplicating information already stored elsewhere.

---

## `notes`

**Ownership:** USER/ARCHIE  
**Required:** No

Optional supporting context that does not belong inside the primary learning statement.

---

## Confidence

A dedicated `confidence` field is intentionally excluded from v1.

Confidence may eventually be inferred by Archie from:

- language
- repeated experiences
- corroborating evidence
- longitudinal patterns

The user should not be required to manually grade their own certainty.

If persistent confidence becomes independently useful for analysis later, it may be introduced in a future schema version.

---

# 9. Coaching Signals

```text
coachingSignals[]  // 0..N

├── id
├── signal
├── signalType
├── relatedSalesSteps[]
├── sourceRefs[]
└── notes
```

A Coaching Signal represents:

> **Evidence from the workday that may justify future coaching, practice, reinforcement, or feedback.**

Coaching Signals may represent strengths as well as weaknesses.

The coaching system should not become a record of mistakes only.

---

## `id`

**Ownership:** SYSTEM  
**Required:** Yes when a Coaching Signal exists

Unique identity for the Coaching Signal.

---

## `signal`

**Ownership:** USER/ARCHIE  
**Required:** No

The actual coaching-relevant observation or evidence.

Examples:

> "I understood the customer's towing concern but wasn't confident explaining the weight numbers."

> "Rapport-building felt much more natural today."

> "I watched the salesperson use a Trial Close and realized I probably would have moved straight into more presentation."

The signal captures the evidence.

It does not necessarily prescribe the solution.

---

## `signalType`

**Ownership:** ARCHIE / USER/ARCHIE  
**Required:** No

Lightweight classification of the developmental signal.

Potential concepts include:

```text
strength
improvement_area
knowledge_gap
practice_opportunity
```

Exact enum values are intentionally not finalized.

Real Field Report usage should inform the final classification vocabulary.

---

## `relatedSalesSteps[]`

**Ownership:** ARCHIE / USER/ARCHIE  
**Required:** No

Camping World sales-process steps related to the Coaching Signal.

Example:

```text
signal:
"I keep presenting features without checking how the customer feels."

relatedSalesSteps:
- Presentation
- Trial Close
```

---

## `sourceRefs[]`

**Ownership:** SYSTEM/ARCHIE  
**Required:** No

References to existing evidence supporting the Coaching Signal.

A Coaching Signal may be supported by one or many records.
Example:

```text
sourceRefs:
{
  "artifactId": "field_report_001",
  "subType": "customerInteraction",
  "subId": "interaction_001"
}
```
- learning_001
```

This allows future Archie systems to preserve an evidence chain without duplicating source information.

---

## `notes`

**Ownership:** USER/ARCHIE  
**Required:** No

Optional supporting context.

---

## Recommended Actions

A dedicated `recommendedAction` field is intentionally excluded from v1.

The Field Report captures evidence.

The coaching layer should later use:

```text
Customer Interactions
        +
Learning Signals
        +
Coaching Signals
        +
Historical Patterns
        ↓
Archie Coaching
```

Coaching recommendations may change as additional evidence becomes available.

They should therefore not automatically become permanent facts inside the Field Report that produced the original evidence.

---

# 10. Capture Bay

```text
captureBay[]  // 0..N

├── id
├── content
└── sourceRefs[]
```

The Capture Bay preserves potentially useful information that does not yet deserve a formal structured home.

Core principle:

> **Capture first. Classify later.**

Potential examples include:

- product question
- content idea
- process idea
- question for a manager
- Academy idea
- unusual customer observation
- possible pattern noticed for the first time
- random thought that may become valuable later

---

## `id`

**Ownership:** SYSTEM  
**Required:** Yes when a Capture Bay record exists

Unique identity for the captured item.

---

## `content`

**Ownership:** USER primarily  
**Required:** No

The raw thought, question, observation, or idea.

FounderOS should preserve the user's meaning without requiring premature classification.

---

## `sourceRefs[]`

**Ownership:** SYSTEM/ARCHIE  
**Required:** No

Optional references to existing records when the captured thought clearly originated from another part of the Field Report.

---

## Capture Types

A dedicated `captureType` field is intentionally excluded from v1.

Categories such as:

```text
question
idea
research
content
```

may eventually become useful.

For v1, however, requiring classification works against the Capture Bay's purpose.

The user should be able to capture something without first deciding what kind of thing it is.

---

# 11. System Metadata

```text
systemMetadata
├── schemaVersion
├── updatedAt
└── processingStatus
```

System Metadata exists for operational integrity.

It should remain invisible to the user during normal Field Report capture.

---

## `schemaVersion`

**Ownership:** SYSTEM  
**Required:** Yes

Identifies the schema version governing the record.

Example:

```text
FIELD_REPORT_SCHEMA_v1
```

This supports future schema evolution and migration.

---

## `updatedAt`

**Ownership:** SYSTEM  
**Required:** Yes

Timestamp representing the most recent modification to the Field Report.

---

## `processingStatus`

**Ownership:** SYSTEM  
**Required:** Yes

Represents the report's current processing state.

This may eventually distinguish between concepts such as:

- raw capture
- partially processed
- structured

Exact status values are intentionally deferred until the processing workflow is designed.

---

## Metadata Intentionally Excluded from v1

The following are not currently justified as first-class Field Report metadata:

- capture method
- device information
- AI model name
- prompt version
- AI confidence scores
- internal telemetry

These may be added later if demonstrated operational requirements justify them.

---

# 12. Relationship and Reference Rules

FounderOS should minimize redundant information between Field Report sections.

Sections should communicate through references rather than copying source information.

Example:

```text
customerInteraction:
  id: interaction_001

learningSignal:
  id: learning_001
sourceRefs:
  - {
      "artifactId": "field_report_001",
      "subType": "customerInteraction",
      "subId": "interaction_001"
    }

coachingSignal:
  id: coaching_001
  sourceRefs:
    - {
        "artifactId": "field_report_001",
        "subType": "customerInteraction",
        "subId": "interaction_001"
      }
    - learning_001
```

This preserves the evidence chain:

```text
CUSTOMER EXPERIENCE
        ↓
LEARNING
        ↓
COACHING SIGNAL
```

without storing the same customer context or event multiple times.

---

## Reference Principles

A `sourceRef` should point to an existing identifiable FounderOS record.

A record may have:

```text
0 source references
1 source reference
many source references
```

References should only be created when a meaningful relationship exists.

FounderOS should not create references merely for completeness.

Canonical v1 sourceRef contract

For v1 we define a minimal canonical `sourceRef` object. This is a conceptual contract (implementation of resolution/validation remains an implementation concern):

sourceRef
├── artifactId
├── subType
└── subId

Example (conceptual):

```json
{
  "artifactId": "fieldReport_abc123",
  "subType": "customerInteraction",
  "subId": "interaction_xyz789"
}
```

Requirements (v1):

- `sourceRefs[]` remains a collection of reference objects.
- `artifactId` identifies the Field Report containing the referenced record.
- `subType` identifies the kind of sub-record being referenced (for example: `customerInteraction`, `learningSignal`, `coachingSignal`, `captureEntry`).
- `subId` identifies the specific sub-record inside the Field Report.
- Do NOT use array-position paths such as `customerInteractions[0]`. Stable IDs must be used instead.
- References should only be created when a meaningful relationship exists.
- Exact resolver/validator implementation is deferred to implementation work; modules should validate references at save-time when possible.

---

# 13. Example Field Report

The following example demonstrates how the schema can represent a real-world learning experience.

It is conceptual and does not define final serialization syntax.

---

## Report Identity

```text
id:
field_report_001

date:
2026-08-15

reportType:
shift

shiftContext:
"Saturday onboarding/training shift; mostly shadowing with limited floor traffic."

createdAt:
SYSTEM GENERATED
```

---

## Daily Core

```text
dailyWin:
"Started recognizing how customer lifestyle details can change product selection."

keyLearning:
"Discovery needs to go deeper than obvious requirements like sleeping capacity."

biggestChallenge:
null

nextFocus:
"Listen for everyday routines that reveal less-obvious product needs."

notes:
null
```

---

## Customer Interaction

```text
id:
interaction_001

interactionType:
observed / assisted

buyerContext:
"Family with a young child."

customerGoal:
"Find an RV that makes family camping practical and comfortable."

keyNeeds:
- sleeping capacity
- family-friendly bathroom configuration

hotButtons:
- tub-style shower

productsConsidered:
- RV with tub-style shower configuration

objections:
[]

buyingSignals:
[]

salesStepsObserved:
- Interview
- Product Selection
- Presentation

salesStepsPerformed:
[]

myRole:
"Primarily shadowing and observing the interaction."

outcome:
unknown

notableMoment:
"Customer explained why having a tub-style shower would make traveling with their young child easier."
```

---

## Learning Signal

```text
id:
learning_001

learning:
"Discovery with families should include normal home routines, not just obvious requirements such as sleeping capacity."

relatedSalesSteps:
- Interview
- Product Selection
- Presentation

sourceRefs:
- interaction_001

notes:
"The important insight was not simply that some RVs have tubs. The customer's family routine created the product need."
```

---

## Coaching Signal

```text
id:
coaching_001

signal:
"Look for opportunities to ask lifestyle-routine questions that reveal needs the customer may not initially state as RV requirements."

signalType:
practice_opportunity

relatedSalesSteps:
- Interview

  sourceRefs:
    - {
        "artifactId": "field_report_001",
        "subType": "customerInteraction",
        "subId": "interaction_001"
      }
    - {
        "artifactId": "field_report_001",
        "subType": "learningSignal",
        "subId": "learning_001"
      }

notes:
null
```

---

## Capture Bay

```text
[]
```

No Capture Bay entry is required simply because the section exists.

---

## System Metadata

```text
schemaVersion:
FIELD_REPORT_SCHEMA_v1

updatedAt:
SYSTEM GENERATED

processingStatus:
structured
```

---

# 14. v1 Boundaries and Deferred Decisions

`FIELD_REPORT_SCHEMA_v1` intentionally does **not** attempt to solve every future Camping World Academy requirement.

The following remain future-stage concerns:

- exact enum values
- final serialization format
- production JavaScript implementation
- UI implementation
- voice capture
- natural-language extraction
- Archie review/correction workflow
- confidence inference
- longitudinal pattern detection
- semantic search
- Knowledge Base retrieval
- automated coaching recommendations
- objection-library generation
- customer-pattern detection
- RV Knowledge Cards
- roleplay generation
- Capture Bay classification
- multi-agent architecture
- Shared Context / Agent Handoff Layer
- Field Report prototype integration

These are valid future capabilities.

They are not requirements for defining the v1 data foundation.

---

# 15. Architectural Success Criteria

`FIELD_REPORT_SCHEMA_v1` succeeds if it allows FounderOS to preserve enough structured learning data to answer increasingly useful questions over time without turning the Field Report into paperwork.

The schema should support the eventual transition from:

> "What happened today?"

to:

> "What keeps happening?"

to:

> "What does that tell us?"

to:

> "What should we practice next?"

The Field Report therefore serves as the data foundation for the larger learning loop:

```text
EXPERIENCE
    ↓
CAPTURE
    ↓
STRUCTURE
    ↓
PATTERN
    ↓
COACHING
    ↓
PRACTICE
    ↓
IMPROVED EXPERIENCE
```

---

# 16. Guiding Principle

When future schema changes are considered, use the following test:

> **Does FounderOS need this information as independently structured data in order to provide meaningfully better longitudinal learning or coaching?**

If yes, consider promoting it into the schema.

If no, preserve it as context rather than adding another field.

The goal is not to capture everything.

The goal is to capture **enough of the right things** for FounderOS to learn what matters.