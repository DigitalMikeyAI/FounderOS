// =====================================================
// FOUNDEROS
// MISSION INTELLIGENCE SYSTEM
// Archie Core v0.3 — Phase 4A-1B Correction
//
// Responsibility:
// Judgment only. Synthesizes outputs already produced by
// DecisionSystem and GuidanceSystem into a single, honest
// Commander recommendation answering:
//
//   "Given everything FounderOS currently knows,
//    what matters most right now?"
//
// Important:
// This system does not own source data.
// It does not replace DecisionSystem or GuidanceSystem.
// It does not re-derive their reasoning independently —
// it consumes their outputs first, and falls back to raw
// session context only when neither is available.
// It never fabricates priorities, urgency, or deferrable
// tasks that are not supported by an existing input.
// =====================================================

const MissionIntelligenceSystem = {
  version: "0.2.0",

  // =====================================================
  // MISSION CONTEXT RESOLUTION
  // Determines active-mission status using the input
  // priority order required by ADR-005:
  //   1. decision (DecisionSystem's own interpretation)
  //   2. session  (raw fallback context only)
  //
  // guidance is intentionally not consulted here — guidance
  // never determines *whether* a mission is active, only
  // what the next actionable step is once one is known.
  // =====================================================

  resolveMissionContext(session = {}, decision = null) {
    if (decision && decision.type === "mission") {
      const context = decision.context || {};

      return {
        hasActiveMission: true,
        source: "decision",
        title: String(context.title || "").trim(),
        description: String(context.description || "").trim(),
        objectives: Array.isArray(context.objectives)
          ? context.objectives
          : [],
      };
    }

    if (decision && decision.type === "mission-needed") {
      return {
        hasActiveMission: false,
        source: "decision",
        title: "",
        description: "",
        objectives: [],
      };
    }

    // Fallback: decision is absent, or reflects a decision type
    // that does not itself describe mission status (e.g.
    // welcome-back, system-error). Fall back to raw session
    // context, per input ownership rules.
    const mission = session?.mission || {};

    const hasActiveMission =
      mission.status === "active" &&
      String(mission.title || "").trim().length > 0;

    return {
      hasActiveMission,
      source: "session-fallback",
      title: String(mission.title || "").trim(),
      description: String(mission.description || "").trim(),
      objectives: Array.isArray(mission.objectives)
        ? mission.objectives
        : [],
    };
  },

  // =====================================================
  // RECOMMEND TODAY
  // Returns a stable recommendation object shape in every
  // scenario. Never fabricates content unsupported by the
  // available inputs.
  // =====================================================

  recommendToday(session = {}, decision = null, guidance = null) {
    const missionContext = this.resolveMissionContext(session, decision);

    let recommendation = null;

    if (missionContext.hasActiveMission) {
      recommendation = this.buildActiveMissionRecommendation(missionContext, guidance);
    } else {
      recommendation = this.buildNoActiveMissionRecommendation(decision);
    }

    // Optional blocker observation (v0.1): non-displayed internal awareness only
    let blockerObservation = null;
    let missionPlan = null;

    try {
      if (typeof this.identifyBlocker === "function") {
        blockerObservation = this.identifyBlocker(session, decision, guidance) || null;
      }
    } catch (e) {
      blockerObservation = null; // defensive: do not let observation logic break recommendations
    }

    try {
      if (typeof this.generateMissionPlan === "function") {
        const lastReflection =
          typeof ReflectionSystem !== "undefined" &&
          typeof ReflectionSystem.getLastArtifact === "function"
            ? ReflectionSystem.getLastArtifact()
            : null;

        missionPlan = this.generateMissionPlan(session, decision, guidance, lastReflection) || null;
      }
    } catch (e) {
      missionPlan = null; // defensive
    }

    return {
      ...recommendation,
      blockerObservation,
      missionPlan,
    };
  },

  // =====================================================
  // IDENTIFY BLOCKER
  // Minimal, conservative v0.1 detection for missing commander input
  // Returns either null or a blocker observation with the approved shape.
  // =====================================================

  identifyBlocker(session = {}, decision = null, guidance = null) {
    try {
      const evidence = [];
      const sources = [];

      // Guidance-based evidence: questions awaiting a Commander response
      if (guidance && typeof guidance === "object") {
        if (Array.isArray(guidance.questions) && guidance.questions.length > 0) {
          evidence.push(`guidance.questions.length === ${guidance.questions.length}`);
          sources.push("guidance");
        }

        // Guidance artifact that appears to require Commander participation
        if (
          guidance.artifact &&
          guidance.artifact.status &&
          String(guidance.artifact.status).toLowerCase() === "not-started"
        ) {
          const t = guidance.artifact.type || "unknown";
          evidence.push(`guidance.artifact.type === "${t}"`);
          evidence.push(`guidance.artifact.status === "not-started"`);
          if (!sources.includes("guidance")) sources.push("guidance");
        }
      }

      // Decision/system-level cues may supplement guidance evidence but are not primary for v0.1
      // (Keep detection conservative: do not infer from mission state alone.)

      if (evidence.length === 0) {
        return null;
      }

      // Minimal approved observation shape (v0.1)
      return {
        type: "missing-commander-input",
        evidence,
        source: Array.from(new Set(sources)),
        note: "Progress currently requires information only the Commander can provide.",
      };
    } catch (e) {
      return null; // defensive fallback
    }
  },

  // =====================================================
  // IDENTIFY LEARNING
  // Minimal v0.1: consume a ReflectionSystem artifact and
  // return a single evidence-backed insight when appropriate.
  // Does not persist, surface, or duplicate ReflectionSystem.
  // =====================================================

  identifyLearning(artifact) {
    try {
      if (!artifact || typeof artifact !== "object") return null;

      if (String(artifact.type || "").toLowerCase() !== "strength-profile") {
        return null;
      }

      const strengths = Array.isArray(artifact.strengths) ? artifact.strengths : [];

      if (strengths.length === 0) return null;

      // Evidence must be present in artifact.evidence for the selected strength.
      const evidenceList = Array.isArray(artifact.evidence) ? artifact.evidence : [];

      // Find the first strength which has supporting evidence entries.
      let selected = null;

      for (let i = 0; i < strengths.length; i += 1) {
        const s = strengths[i];

        const match = evidenceList.find((e) => e && e.strength === s && Array.isArray(e.matches) && e.matches.length > 0);

        if (match) {
          selected = { strength: s, evidence: match };
          break;
        }
      }

      if (!selected) return null;

      // Construct conservative insight language (no identity claims)
      const insight = `Your workshop responses consistently pointed to ${selected.strength} as a strength.`;

      // Return the approved contract shape
      return {
        type: "strength-awareness",
        insight,
        evidence: [
          // reuse only factual evidence items: matchCount and samples
          `matchCount === ${selected.evidence.matchCount}`,
          `exampleAnswer: "${String(selected.evidence.matches[0]?.answer || '').replace(/\n/g, ' ')}"`,
        ],
        source: "strength-profile",
      };
    } catch (e) {
      return null;
    }
  },

  // =====================================================
  // GENERATE MISSION PLAN
  // Minimal v0.1: produce a conservative MissionPlan object
  // when sufficient evidence (vision + reflection/guidance) exists.
  // =====================================================

  generateMissionPlan(session = {}, decision = null, guidance = null, reflection = null) {
    try {
      // Minimal required inputs: a commander vision (from session or decision)
      const vision = (session && session.vision) || (decision && decision.context && decision.context.vision) || null;

      // Use guidance and reflection artifacts as supporting evidence
      const hasGuidance = guidance && typeof guidance === 'object';
      const hasReflection = reflection && typeof reflection === 'object' && reflection.type === 'strength-profile';

      if (!vision) return null; // cannot plan without an expressed vision

      // Conservative rule: require either guidance or reflection evidence
      if (!hasGuidance && !hasReflection) return null;

      // currentStage: derived from session.mission.stage or null
      const currentStage = session?.mission?.stage || null;

      // currentMilestone: if guidance.steps exists, take its first step as the milestone
      const currentMilestone = hasGuidance && Array.isArray(guidance.steps) && guidance.steps.length > 0 ? guidance.steps[0] : null;

      // recommendedMission: prefer guidance.mission, else decision.context.title, else null
      const recommendedMission = (hasGuidance && guidance.mission) || (decision && decision.context && decision.context.title) || null;

      // whyThisMission: concise factual rationale pulled from guidance or decision
      const whyThisMission = hasGuidance && guidance.explanation ? guidance.explanation : (decision && decision.context && decision.context.description) || null;

      // successLooksLike: conservative, derived from guidance.completionCriteria if present
      const successLooksLike = hasGuidance && Array.isArray(guidance.completionCriteria) ? guidance.completionCriteria[0] || null : null;

      // evidence: list factual pointers used to build the plan
      const evidence = [];
      if (vision) evidence.push('vision expressed');
      if (hasGuidance) evidence.push('guidance present');
      if (hasReflection) evidence.push('reflection strength-profile present');

      return {
        vision,
        currentStage,
        currentMilestone,
        recommendedMission,
        whyThisMission,
        successLooksLike,
        evidence,
      };
    } catch (e) {
      return null;
    }
  },

  // =====================================================
  // ACTIVE MISSION RECOMMENDATION
  // =====================================================

  buildActiveMissionRecommendation(missionContext, guidance = null) {
    const { title, description, objectives } = missionContext;

    const normalizedObjectives =
      Array.isArray(objectives) &&
      typeof MissionSystem !== "undefined" &&
      typeof MissionSystem.normalizeMissionObjective === "function"
        ? objectives
            .map((objective) =>
              MissionSystem.normalizeMissionObjective(objective),
            )
            .filter(Boolean)
        : [];

    const recommendedMission = title || null;

    const whyItMatters = description
      ? description
      : `FounderOS knows the active mission is "${title}", but does not yet have enough context to explain why it matters today.`;

    const guidanceStep =
      guidance && Array.isArray(guidance.steps) && guidance.steps.length > 0
        ? guidance.steps[0]
        : null;

    const objectiveStep =
      normalizedObjectives.length > 0
        ? normalizedObjectives[0].text
        : null;

    const nextAction = guidanceStep || objectiveStep || null;

    // Given the current single-active-mission data model, there is
    // no competing mission or backlog to compare against. Claiming
    // something "can wait" without that comparison would be
    // fabricated, so this is honestly reported as unknown.
    const whatCanWait = null;

    const hasMeaningfulNextAction = Boolean(nextAction);

    const confidence = hasMeaningfulNextAction
      ? {
          level: "high",
          reason:
            "An active mission is confirmed and a meaningful next action is available.",
        }
      : {
          level: "low",
          reason:
            "An active mission is confirmed, but no meaningful next action could be derived from available guidance or mission objectives.",
        };

    // -----------------------------------------------------
    // Capability 4A-2: Know Why It Matters (first implementation)
    // Only provide `whyThisActionMatters` for the Direction
    // workshop when the mission/guidance indicates the
    // Commander is identifying strengths. Otherwise null.
    // -----------------------------------------------------
    let whyThisActionMatters = null;

    try {
      const normalizedTitle = String(title || "").trim();

      const missionIndicatesDirection =
        normalizedTitle === "Discover Your Direction" ||
        normalizedTitle.toLowerCase() === "discover your direction";

      const objectivesIncludeStrength = normalizedObjectives.some((objective) =>
        objective.text.toLowerCase().includes("strength"),
      );

      const guidanceIndicatesStrength =
        guidance && typeof guidance === "object"
          ? (String(guidance.objective || "").toLowerCase().includes("strength") ||
              String(guidance.mission || "").toLowerCase() === "discover your direction")
          : false;

      if ((missionIndicatesDirection && (objectivesIncludeStrength || guidanceIndicatesStrength)) || guidanceIndicatesStrength) {
        // Deliberately conservative phrasing. No punctuation at end so
        // the BriefingSystem can safely integrate it into a sentence.
        whyThisActionMatters =
          "Understanding your strengths helps FounderOS recommend opportunities that fit you instead of offering generic guidance";
      }
    } catch (e) {
      // Defensive: do not surface failures from optional explanation logic.
      whyThisActionMatters = null;
    }

    return {
      recommendedMission,
      whyItMatters,
      nextAction,
      whatCanWait,
      confidence,
      whyThisActionMatters,
    };
  },

  // =====================================================
  // NO ACTIVE MISSION RECOMMENDATION
  // =====================================================

  buildNoActiveMissionRecommendation(decision = null) {
    const recommendedMission = null;

    const whyItMatters = "No active mission is currently known.";

    // Only offer a next action when the decision itself supports
    // it (i.e. DecisionSystem has already concluded a mission is
    // needed). If decision does not confirm this, remain silent
    // rather than fabricate a suggestion.
    const nextAction =
      decision && decision.type === "mission-needed"
        ? "Choose or define your next mission."
        : null;

    const whatCanWait = null;

    const confidence = {
      level: "low",
      reason:
        "FounderOS has no active mission and insufficient priority context to recommend with confidence.",
    };

    return {
      recommendedMission,
      whyItMatters,
      nextAction,
      whatCanWait,
      confidence,
    };
  },

  // =====================================================
  // PROCESS FIELD REPORT (v0.1 deterministic)
  //
  // Purpose:
  //   Smallest deterministic derivation proving the
  //   Field-Report-intelligence production boundary.
  //   NOT AI. NOT semantic analysis. NOT keyword mining.
  //
  // Deterministic rules (v0.1):
  //   Rule #1: When a customerInteraction records BOTH a non-empty
  //     customerGoal AND a non-empty objections[], derive exactly ONE
  //     learningSignal: "A stated customer goal can coexist with
  //     unresolved objections."
  //   Rule #2: When a customerInteraction records BOTH a non-empty
  //     keyNeeds[] AND a non-empty hotButtons[], derive exactly ONE
  //     learningSignal: "Practical customer needs can coexist with
  //     emotional hot buttons."
  //   Rule #3: For each canonical explicitStrength selected by the
  //     user on a customerInteraction, derive exactly ONE coachingSignal
  //     per strength. Includes reconciliation of stale derived signals.
  //   No derivation for reports/interactions lacking qualifying evidence.
  //
  // Constraints:
  //   - Accepts ONE FieldReport; never mutates the input.
  //   - Never persists (MissionIntelligence = judgment only).
  //   - Deep-clones before mutation (JSON-safe for Field Reports).
  //   - Stable signal ID guarantees idempotency.
  //   - processingStatus is recomputed from derived state after all rules.
  //   - Requires a non-empty string report.id before derivation.
  // =====================================================

  processFieldReport(report) {
    try {
      if (!report || typeof report !== "object") {
        return { changed: false, report };
      }

      // Guard: require a non-empty string report.id before any derivation.
      if (typeof report.id !== "string" || report.id.trim().length === 0) {
        return { changed: false, report };
      }

      // =============================================================
      // DETERMINISTIC DERIVATION RULES
      // -------------------------------------------------------------
      // Each rule independently decides whether IT produces a signal for
      // this report. A rule that does not qualify simply produces no
      // signal and does NOT terminate processing — independent rules may
      // be appended below without coupling to Rule #1.
      //
      // NOTE on processingStatus: "processed" currently means this report
      // has produced AT LEAST ONE derived signal. It does NOT guarantee
      // that every present or future rule has been exhaustively applied.
      // Idempotency is enforced by stable signal IDs, which remain the
      // sole gate for re-derivation — NOT processingStatus.
      //
      // After all rules complete, processingStatus is recomputed from
      // current derived state (learningSignals + coaching_strength_
      // signals). If reconciliation removes the last derived signal,
      // status returns to "raw". User-created coachingSignals do not
      // count toward "processed".
      // =============================================================

      let changed = false;
      let workingClone = null;

      // Lazily create a SINGLE deep clone of the original report on first
      // mutation. All rule blocks append to this same working copy so that
      // independently matching rules accumulate signals within one invocation
      // instead of each re-cloning from the (signal-less) original and
      // overwriting signals added by an earlier rule in the same pass.
      function getWorkingClone() {
        if (!workingClone) {
          workingClone = JSON.parse(JSON.stringify(report));
        }
        return workingClone;
      }

      // 1. Inspect ONLY existing evidence fields. (read-only)
      const interactions = Array.isArray(report.customerInteractions)
        ? report.customerInteractions
        : [];

      // 2. Rule #1 — goal-objection coexistence:
      //    Derive one signal when a customerInteraction records BOTH a
      //    non-empty customerGoal AND a non-empty objections[].
      const rule1Interaction = interactions.find(
        (i) =>
          i &&
          typeof i.id === "string" &&
          i.id.length > 0 &&
          typeof i.customerGoal === "string" &&
          i.customerGoal.trim().length > 0 &&
          Array.isArray(i.objections) &&
          i.objections.length > 0
      );

      // Rule #1 decides whether Rule #1 produces a signal. A non-match
      // does NOT terminate processing (allows independent future rules).
      if (rule1Interaction) {
        // 3. Stable signal identity (rule + report + interaction).
        const signalId =
          `learning_goal_objection_coexistence_${report.id}_${rule1Interaction.id}`;

        // 4. Idempotency: check by SIGNAL ID, not by processingStatus.
        //    Consult the working clone (if any) so duplicate checks are
        //    compatible with signals already appended earlier in this pass.
        const existingSignals = Array.isArray((workingClone || report).learningSignals)
          ? (workingClone || report).learningSignals
          : [];

        const alreadyExists = existingSignals.some(
          (s) => s && typeof s.id === "string" && s.id === signalId
        );

        if (!alreadyExists) {
          // 5. Clone before mutation (deep; Field Reports are JSON-serializable).
          //    Created lazily and shared across all rule blocks.
          const clone = getWorkingClone();

          // 6. Build the single deterministic derived signal.
          const now = new Date().toISOString();

          const signal = {
            id: signalId,
            createdAt: now,
            updatedAt: now,
            learning:
              "A stated customer goal can coexist with unresolved objections.",
            sourceRefs: [
              {
                artifactId: String(report.id || ""),
                subType: "customerInteraction",
                subId: String(rule1Interaction.id || ""),
              },
            ],
            notes:
              "[v0.1 deterministic production rule] Derived from a customerInteraction recording both a customerGoal and objections. This is NOT AI/semantic analysis — it checks field presence only.",
          };

          // 7. Mutate the CLONE only. Append signal; preserve raw evidence untouched.
          clone.learningSignals = Array.isArray(clone.learningSignals)
            ? clone.learningSignals.concat([signal])
            : [signal];

          // 8. Lifecycle metadata transition (only on actual derivation).
          if (clone.systemMetadata && typeof clone.systemMetadata === "object") {
            clone.systemMetadata.processingStatus = "processed";
            clone.systemMetadata.updatedAt = now;
          }

          changed = true;
        }
      }

      // 3. Rule #2 — needs/hot-buttons coexistence:
      //    Derive one signal when a customerInteraction records BOTH a
      //    non-empty keyNeeds[] AND a non-empty hotButtons[].
      //    Independent of Rule #1; appends to the same shared working clone.
      const rule2Interaction = interactions.find(
        (i) =>
          i &&
          typeof i.id === "string" &&
          i.id.length > 0 &&
          Array.isArray(i.keyNeeds) &&
          i.keyNeeds.length > 0 &&
          Array.isArray(i.hotButtons) &&
          i.hotButtons.length > 0
      );

      if (rule2Interaction) {
        const signalId =
          `learning_needs_hotbuttons_coexistence_${report.id}_${rule2Interaction.id}`;

        // Idempotency: check by SIGNAL ID (consult working clone if present).
        const existingSignals = Array.isArray((workingClone || report).learningSignals)
          ? (workingClone || report).learningSignals
          : [];

        const alreadyExists = existingSignals.some(
          (s) => s && typeof s.id === "string" && s.id === signalId
        );

        if (!alreadyExists) {
          const clone = getWorkingClone();
          const now = new Date().toISOString();

          const signal = {
            id: signalId,
            createdAt: now,
            updatedAt: now,
            learning:
              "Practical customer needs can coexist with emotional hot buttons.",
            sourceRefs: [
              {
                artifactId: String(report.id || ""),
                subType: "customerInteraction",
                subId: String(rule2Interaction.id || ""),
              },
            ],
            notes:
              "[v0.1 deterministic production rule] Derived from a customerInteraction recording both keyNeeds and hotButtons. This is NOT AI/semantic analysis — it checks field presence only.",
          };

          clone.learningSignals = Array.isArray(clone.learningSignals)
            ? clone.learningSignals.concat([signal])
            : [signal];

          if (clone.systemMetadata && typeof clone.systemMetadata === "object") {
            clone.systemMetadata.processingStatus = "processed";
            clone.systemMetadata.updatedAt = now;
          }

          changed = true;
        }
      }

      // =====================================================
      // Rule #3 — explicitStrengths → coachingSignals
      //    Derive one coachingSignal per canonical explicit
      //    strength selected by the user on each interaction.
      //    Includes reconciliation: stale derived signals
      //    (whose source evidence no longer exists) are
      //    removed. User-created coachingSignals are preserved.
      // =====================================================

      // Canonical Coaching Strength Vocabulary v0.1
      const CANONICAL_STRENGTHS = [
        "rapport",
        "discovery",
        "product-selection",
        "presentation",
        "objection-handling",
        "trial-close",
      ];

      // Human-readable labels for signal wording
      const STRENGTH_LABELS = {
        rapport: "Rapport",
        discovery: "Discovery",
        "product-selection": "Product Selection",
        presentation: "Presentation",
        "objection-handling": "Objection Handling",
        "trial-close": "Trial Close",
      };

      // 1. Compute the complete expected set of derived signal IDs
      //    from the report's CURRENT explicitStrengths evidence.
      const expectedSignalIds = new Set();

      for (let i = 0; i < interactions.length; i += 1) {
        const interaction = interactions[i];

        if (
          !interaction ||
          typeof interaction.id !== "string" ||
          interaction.id.length === 0 ||
          !Array.isArray(interaction.explicitStrengths) ||
          interaction.explicitStrengths.length === 0
        ) {
          continue;
        }

        for (let s = 0; s < interaction.explicitStrengths.length; s += 1) {
          const strength = interaction.explicitStrengths[s];

          if (
            typeof strength !== "string" ||
            !CANONICAL_STRENGTHS.includes(strength)
          ) {
            continue; // skip non-canonical values safely
          }

          expectedSignalIds.add(
            `coaching_strength_${report.id}_${interaction.id}_${strength}`,
          );
        }
      }

      // 2. Partition existing coachingSignals into derived vs. user-created.
      const existingCoachingSignals = Array.isArray(
        (workingClone || report).coachingSignals,
      )
        ? (workingClone || report).coachingSignals
        : [];

      const userCreatedSignals = [];
      const existingDerivedSignals = [];

      for (let s = 0; s < existingCoachingSignals.length; s += 1) {
        const signal = existingCoachingSignals[s];

        if (
          signal &&
          typeof signal.id === "string" &&
          signal.id.startsWith("coaching_strength_")
        ) {
          existingDerivedSignals.push(signal);
        } else {
          userCreatedSignals.push(signal);
        }
      }

      // 3. Deduplicate owned signals: preserve at most ONE existing
      //    signal per deterministic ID. Discard additional duplicates.
      const dedupedDerivedSignals = [];
      const seenDerivedIds = new Set();

      for (let s = 0; s < existingDerivedSignals.length; s += 1) {
        const signal = existingDerivedSignals[s];

        if (seenDerivedIds.has(signal.id)) {
          continue; // discard duplicate owned signal
        }

        seenDerivedIds.add(signal.id);
        dedupedDerivedSignals.push(signal);
      }

      const duplicateCount =
        existingDerivedSignals.length - dedupedDerivedSignals.length;

      // 4. Reconcile: keep expected derived, remove stale derived.
      const keptDerivedSignals = dedupedDerivedSignals.filter((s) =>
        expectedSignalIds.has(s.id),
      );

      const removedCount =
        dedupedDerivedSignals.length - keptDerivedSignals.length;

      // 5. Create new signals for expected IDs not yet present.
      const newSignals = [];

      for (let i = 0; i < interactions.length; i += 1) {
        const interaction = interactions[i];

        if (
          !interaction ||
          typeof interaction.id !== "string" ||
          interaction.id.length === 0 ||
          !Array.isArray(interaction.explicitStrengths) ||
          interaction.explicitStrengths.length === 0
        ) {
          continue;
        }

        for (let s = 0; s < interaction.explicitStrengths.length; s += 1) {
          const strength = interaction.explicitStrengths[s];

          if (
            typeof strength !== "string" ||
            !CANONICAL_STRENGTHS.includes(strength)
          ) {
            continue;
          }

          const signalId = `coaching_strength_${report.id}_${interaction.id}_${strength}`;

          // Idempotency: skip if this derived signal already exists.
          const alreadyExists = seenDerivedIds.has(signalId);

          if (alreadyExists) {
            continue;
          }

          const now = new Date().toISOString();

          newSignals.push({
            id: signalId,
            createdAt: now,
            updatedAt: now,
            signal: `User self-identified "${STRENGTH_LABELS[strength]}" as a strength during this customer interaction.`,
            signalType: "strength",
            sourceRefs: [
              {
                artifactId: String(report.id || ""),
                subType: "customerInteraction",
                subId: String(interaction.id || ""),
              },
            ],
            notes:
              "[v0.1 deterministic production rule] Derived from explicitStrengths selection. Represents user self-assessment evidence only — not independently verified performance.",
          });

          seenDerivedIds.add(signalId);
        }
      }

      // 6. Apply reconciliation if any changes occurred.
      if (removedCount > 0 || newSignals.length > 0 || duplicateCount > 0) {
        const clone = getWorkingClone();

        clone.coachingSignals = [
          ...userCreatedSignals,
          ...keptDerivedSignals,
          ...newSignals,
        ];

        changed = true;
      }

      // =====================================================
      // ProcessingStatus recomputation
      // After all deterministic rules and reconciliation have
      // completed, recompute processingStatus from the CURRENT
      // deterministic derived state. This ensures that when
      // reconciliation removes the last derived signal, the
      // status correctly returns to "raw".
      //
      // "Derived state" for v0.1 =
      //   - any learningSignals (all system-derived)
      //   - coachingSignals whose IDs start with "coaching_strength_"
      // User-created coachingSignals do NOT count.
      //
      // This evaluation runs on EVERY pass, regardless of whether
      // another rule already cloned the report. If the effective
      // state already has the correct status, no clone is needed.
      // =====================================================

      // Determine the effective final state for status evaluation.
      const effectiveReport = workingClone || report;

      const hasLearningSignals =
        Array.isArray(effectiveReport.learningSignals) &&
        effectiveReport.learningSignals.length > 0;

      const hasDerivedCoachingSignals =
        Array.isArray(effectiveReport.coachingSignals) &&
        effectiveReport.coachingSignals.some(
          (s) =>
            s &&
            typeof s.id === "string" &&
            s.id.startsWith("coaching_strength_"),
        );

      const hasDerivedSignals = hasLearningSignals || hasDerivedCoachingSignals;

      const newStatus = hasDerivedSignals ? "processed" : "raw";

      const currentStatus =
        effectiveReport.systemMetadata &&
        typeof effectiveReport.systemMetadata === "object"
          ? effectiveReport.systemMetadata.processingStatus
          : undefined;

      if (currentStatus !== newStatus) {
        const clone = getWorkingClone();

        if (clone.systemMetadata && typeof clone.systemMetadata === "object") {
          clone.systemMetadata.processingStatus = newStatus;
          clone.systemMetadata.updatedAt = new Date().toISOString();
          changed = true;
        }
      }

      return { changed, report: changed ? workingClone : report };
    } catch (e) {
      // Defensive: judgment failure must never throw into the orchestrator.
      return { changed: false, report };
    }
  },

  // =====================================================
  // IDENTIFY BEHAVIORAL EVIDENCE (E3, v0.1)
  // Read-only projection from structured Field Report outcomes.
  //
  // Rule:
  //   One qualifying salesStepOutcome produces one occurrence when its
  //   competency-specific structured action and, where required, customer
  //   response satisfy the bounded rule. This is consistency evidence for
  //   one interaction, not verified competence, causal proof, or a stable
  //   strength.
  //
  // Ordering (explicitly deterministic):
  //   1. report.date DESC
  //   2. report.createdAt DESC
  //   3. report array index DESC
  //   4. interaction.createdAt DESC
  //   5. interaction array index DESC
  //   6. salesStepOutcomes array index ASC
  //
  // Exact duplicate evidence identities retain the first occurrence in
  // that ordering. No source IDs are parsed, and nothing is persisted.
  // =====================================================

  buildBehavioralEvidenceSourceFingerprint(interaction, outcome) {
    try {
      if (
        !interaction ||
        typeof interaction !== "object" ||
        !outcome ||
        typeof outcome !== "object" ||
        typeof outcome.id !== "string" ||
        outcome.id.trim().length === 0
      ) {
        return null;
      }

      if (outcome.step === "rapport") {
        return `behavioral_evidence_source_v1:${JSON.stringify({
          outcomeEntryId: outcome.id.trim(),
          step: outcome.step,
          performedBy:
            typeof outcome.performedBy === "string" ? outcome.performedBy : "",
          action: typeof outcome.action === "string" ? outcome.action : "",
          customerContextRef:
            outcome.customerContextRef &&
            typeof outcome.customerContextRef === "object"
              ? {
                  type: outcome.customerContextRef.type,
                  category: outcome.customerContextRef.category,
                }
              : null,
        })}`;
      }

      if (["trial-close", "discovery"].includes(outcome.step)) {
        return `behavioral_evidence_source_v1:${JSON.stringify({
          outcomeEntryId: outcome.id.trim(),
          step: typeof outcome.step === "string" ? outcome.step : "",
          performedBy:
            typeof outcome.performedBy === "string" ? outcome.performedBy : "",
          result: typeof outcome.result === "string" ? outcome.result : "",
        })}`;
      }

      if (["product-selection", "presentation"].includes(outcome.step)) {
        return `behavioral_evidence_source_v1:${JSON.stringify({
          outcomeEntryId: outcome.id.trim(),
          step: outcome.step,
          performedBy:
            typeof outcome.performedBy === "string" ? outcome.performedBy : "",
          needRef: outcome.needRef && typeof outcome.needRef === "object"
            ? { field: outcome.needRef.field, index: outcome.needRef.index }
            : null,
          selectedUnitRef:
            outcome.selectedUnitRef && typeof outcome.selectedUnitRef === "object"
              ? { type: outcome.selectedUnitRef.type, value: outcome.selectedUnitRef.value }
              : null,
          ...(outcome.step === "presentation"
            ? {
                presentationRef:
                  outcome.presentationRef && typeof outcome.presentationRef === "object"
                    ? {
                        type: outcome.presentationRef.type,
                        value: outcome.presentationRef.value,
                      }
                    : null,
              }
            : {}),
          result: typeof outcome.result === "string" ? outcome.result : "",
        })}`;
      }

      if (!Array.isArray(interaction.objections)) {
        return null;
      }

      const objections = interaction.objections
        .filter(
          (objection) =>
            typeof objection === "string" && objection.trim().length > 0,
        )
        .map((objection) => objection.trim());
      if (objections.length === 0) {
        return null;
      }

      // v0.1 canonical contract: source order is preserved and every string
      // is trimmed. Consumers treat the complete value as opaque and never
      // parse it. Byte-for-byte restoration recreates the same fingerprint.
      return `behavioral_evidence_source_v1:${JSON.stringify({
        objections,
        outcomeEntryId: outcome.id.trim(),
        step: typeof outcome.step === "string" ? outcome.step : "",
        performedBy:
          typeof outcome.performedBy === "string" ? outcome.performedBy : "",
        result: typeof outcome.result === "string" ? outcome.result : "",
      })}`;
    } catch (e) {
      return null;
    }
  },

  identifyBehavioralEvidence(
    fieldReports,
    reviewContainer = null,
    options = {},
  ) {
    try {
      if (!Array.isArray(fieldReports)) {
        return [];
      }

      const collected = [];

      for (let reportIndex = 0; reportIndex < fieldReports.length; reportIndex += 1) {
        const report = fieldReports[reportIndex];
        if (
          !report ||
          typeof report !== "object" ||
          typeof report.id !== "string" ||
          report.id.trim().length === 0 ||
          !Array.isArray(report.customerInteractions)
        ) {
          continue;
        }

        const reportId = report.id.trim();
        const reportDate =
          typeof report.date === "string" ? report.date.trim() : "";
        const reportCreatedAt =
          typeof report.createdAt === "string" ? report.createdAt.trim() : "";

        for (
          let interactionIndex = 0;
          interactionIndex < report.customerInteractions.length;
          interactionIndex += 1
        ) {
          const interaction = report.customerInteractions[interactionIndex];
          if (
            !interaction ||
            typeof interaction !== "object" ||
            typeof interaction.id !== "string" ||
            interaction.id.trim().length === 0 ||
            !Array.isArray(interaction.salesStepOutcomes)
          ) {
            continue;
          }

          const interactionId = interaction.id.trim();
          const interactionCreatedAt =
            typeof interaction.createdAt === "string"
              ? interaction.createdAt.trim()
              : "";

          for (
            let outcomeIndex = 0;
            outcomeIndex < interaction.salesStepOutcomes.length;
            outcomeIndex += 1
          ) {
            const outcome = interaction.salesStepOutcomes[outcomeIndex];
            const isRapportEvidence = Boolean(
              outcome &&
                outcome.step === "rapport" &&
                outcome.performedBy === "commander" &&
                outcome.action === "referenced-back-to-customer-context" &&
                outcome.customerContextRef &&
                outcome.customerContextRef.type ===
                  "customer-context-category" &&
                new Set([
                  "travel-companions",
                  "pets",
                  "destination",
                  "hobby",
                  "prior-rv-experience",
                  "trip-style",
                  "non-sensitive-preference",
                ]).has(outcome.customerContextRef.category),
            );
            const isObjectionHandlingEvidence = Boolean(
              Array.isArray(interaction.objections) &&
                interaction.objections.some(
                  (objection) =>
                    typeof objection === "string" &&
                    objection.trim().length > 0,
                ) &&
                outcome &&
                outcome.step === "objection-handling" &&
                outcome.performedBy === "commander" &&
                outcome.result === "customer-concern-resolved",
            );
            const isTrialCloseEvidence = Boolean(
              outcome &&
                outcome.step === "trial-close" &&
                outcome.performedBy === "commander" &&
                outcome.result ===
                  "customer-expressed-readiness-to-proceed",
            );
            const isDiscoveryEvidence = Boolean(
              outcome &&
                outcome.step === "discovery" &&
                outcome.performedBy === "commander" &&
                outcome.result === "customer-shared-needs-goals",
            );
            const isProductSelectionEvidence = Boolean(
              outcome &&
                outcome.step === "product-selection" &&
                outcome.performedBy === "commander" &&
                outcome.result === "customer-considered-selected-unit" &&
                outcome.needRef &&
                outcome.needRef.field === "keyNeeds" &&
                Number.isInteger(outcome.needRef.index) &&
                outcome.needRef.index >= 0 &&
                Array.isArray(interaction.keyNeeds) &&
                outcome.needRef.index < interaction.keyNeeds.length &&
                outcome.selectedUnitRef &&
                outcome.selectedUnitRef.type === "unit-reference" &&
                typeof outcome.selectedUnitRef.value === "string" &&
                /^[A-Za-z0-9][A-Za-z0-9 ._\/-]{0,63}$/.test(
                  outcome.selectedUnitRef.value,
                ) &&
                !/\b[A-HJ-NPR-Z0-9]{17}\b/.test(
                  outcome.selectedUnitRef.value,
                ) &&
                !/@/.test(outcome.selectedUnitRef.value) &&
                !/(?:^|\D)(?:\+?\d[\d ()-]{9,}\d)(?:$|\D)/.test(
                  outcome.selectedUnitRef.value,
                ),
            );
            const isPresentationEvidence = Boolean(
              outcome &&
                outcome.step === "presentation" &&
                outcome.performedBy === "commander" &&
                new Set([
                  "customer-considered-presented-feature-benefit",
                  "customer-requested-more-detail",
                  "customer-preferred-different-feature-benefit",
                  "customer-response-unclear",
                ]).has(outcome.result) &&
                outcome.needRef &&
                outcome.needRef.field === "keyNeeds" &&
                Number.isInteger(outcome.needRef.index) &&
                outcome.needRef.index >= 0 &&
                Array.isArray(interaction.keyNeeds) &&
                outcome.needRef.index < interaction.keyNeeds.length &&
                outcome.selectedUnitRef &&
                outcome.selectedUnitRef.type === "unit-reference" &&
                typeof outcome.selectedUnitRef.value === "string" &&
                /^[A-Za-z0-9][A-Za-z0-9 ._\/-]{0,63}$/.test(
                  outcome.selectedUnitRef.value,
                ) &&
                !/\b[A-HJ-NPR-Z0-9]{17}\b/.test(
                  outcome.selectedUnitRef.value,
                ) &&
                !/@/.test(outcome.selectedUnitRef.value) &&
                !/(?:^|\D)(?:\+?\d[\d ()-]{9,}\d)(?:$|\D)/.test(
                  outcome.selectedUnitRef.value,
                ) &&
                outcome.presentationRef &&
                outcome.presentationRef.type === "feature-benefit-reference" &&
                typeof outcome.presentationRef.value === "string" &&
                /^[A-Za-z0-9][A-Za-z0-9 ._\/-]{0,63}$/.test(
                  outcome.presentationRef.value,
                ) &&
                !/\b[A-HJ-NPR-Z0-9]{17}\b/.test(
                  outcome.presentationRef.value,
                ) &&
                !/@/.test(outcome.presentationRef.value) &&
                !/(?:^|\D)(?:\+?\d[\d ()-]{9,}\d)(?:$|\D)/.test(
                  outcome.presentationRef.value,
                ),
            );

            if (
              !outcome ||
              typeof outcome !== "object" ||
              typeof outcome.id !== "string" ||
              outcome.id.trim().length === 0 ||
              (!isRapportEvidence &&
                !isObjectionHandlingEvidence &&
                !isTrialCloseEvidence &&
                !isDiscoveryEvidence &&
                !isProductSelectionEvidence &&
                !isPresentationEvidence)
            ) {
              continue;
            }

            const outcomeId = outcome.id.trim();
            const sourceFingerprint =
              this.buildBehavioralEvidenceSourceFingerprint(
                interaction,
                outcome,
              );
            if (!sourceFingerprint) {
              continue;
            }
            const competency = isRapportEvidence
              ? "rapport"
              : isTrialCloseEvidence
                ? "trial-close"
              : isDiscoveryEvidence
                ? "discovery"
                : isProductSelectionEvidence
                  ? "product-selection"
                  : isPresentationEvidence
                    ? "presentation"
                    : "objection-handling";
            const label = isRapportEvidence
              ? "Rapport"
              : isTrialCloseEvidence
                ? "Trial Close"
              : isDiscoveryEvidence
                ? "Discovery"
                : isProductSelectionEvidence
                  ? "Product Selection"
                  : isPresentationEvidence
                    ? "Presentation"
                    : "Objection Handling";
            const insight = isRapportEvidence
              ? "This interaction records a customer-provided, non-sensitive context category and a Rapport action you reported performing by referencing that context back during the same interaction. It does not establish customer trust, comfort, sentiment, likability, or Rapport quality."
              : isTrialCloseEvidence
                ? "This interaction records a Trial Close you reported performing and a customer response expressing readiness to proceed. That response is consistent with effective Trial Close use in this interaction."
              : isDiscoveryEvidence
                ? "This interaction records purposeful Discovery questions you reported asking and a customer response sharing needs and goals. That response is consistent with effective Discovery use in this interaction."
                : isProductSelectionEvidence
                  ? "This interaction records a Product Selection you reported performing, linking a recorded customer need to a selected RV reference. The customer considered the selected unit; this is consistent with Product Selection use in this interaction."
                  : isPresentationEvidence
                    ? "This interaction records a Presentation you reported performing, connecting one recorded customer need to one bounded RV feature or benefit. The recorded customer response does not establish Presentation quality or success."
                    : "This interaction records an objection, an Objection Handling step you reported performing, and a resolved customer concern. That outcome is consistent with effective Objection Handling in this interaction.";
            const evidenceRefs = isObjectionHandlingEvidence
              ? [
                  { field: "objections" },
                  {
                    field: "salesStepOutcomes",
                    entryId: outcomeId,
                  },
                ]
              : [
                  {
                    field: "salesStepOutcomes",
                    entryId: outcomeId,
                  },
                ];
            collected.push({
              _sortReportDate: reportDate,
              _sortReportCreatedAt: reportCreatedAt,
              _sortReportIndex: reportIndex,
              _sortInteractionCreatedAt: interactionCreatedAt,
              _sortInteractionIndex: interactionIndex,
              _sortOutcomeIndex: outcomeIndex,
              type: "field-report-behavioral-evidence",
              evidenceTier: "E3",
              evidenceId:
                `behavioral_evidence_${reportId}_${interactionId}_${outcomeId}`,
              sourceFingerprint,
              competency,
              label,
              insight,
              source: "fieldReportStructuredOutcome",
              sourceRef: {
                artifactId: reportId,
                subType: "customerInteraction",
                subId: interactionId,
              },
              evidenceRefs,
            });
          }
        }
      }

      collected.sort((a, b) => {
        if (a._sortReportDate !== b._sortReportDate) {
          return a._sortReportDate < b._sortReportDate ? 1 : -1;
        }
        if (a._sortReportCreatedAt !== b._sortReportCreatedAt) {
          return a._sortReportCreatedAt < b._sortReportCreatedAt ? 1 : -1;
        }
        if (a._sortReportIndex !== b._sortReportIndex) {
          return b._sortReportIndex - a._sortReportIndex;
        }
        if (a._sortInteractionCreatedAt !== b._sortInteractionCreatedAt) {
          return a._sortInteractionCreatedAt < b._sortInteractionCreatedAt
            ? 1
            : -1;
        }
        if (a._sortInteractionIndex !== b._sortInteractionIndex) {
          return b._sortInteractionIndex - a._sortInteractionIndex;
        }
        return a._sortOutcomeIndex - b._sortOutcomeIndex;
      });

      const seenEvidenceIds = new Set();
      return collected.reduce((projections, item) => {
        if (seenEvidenceIds.has(item.evidenceId)) {
          return projections;
        }
        seenEvidenceIds.add(item.evidenceId);
        const {
          _sortReportDate,
          _sortReportCreatedAt,
          _sortReportIndex,
          _sortInteractionCreatedAt,
          _sortInteractionIndex,
          _sortOutcomeIndex,
          ...projection
        } = item;
        const occurrence = {
          evidenceId: projection.evidenceId,
          sourceRef: projection.sourceRef,
          outcomeEntryId: projection.evidenceRefs.find(
            (ref) => ref.field === "salesStepOutcomes",
          ).entryId,
          sourceFingerprint: projection.sourceFingerprint,
        };
        const latestReview = reviewContainer
          ? this.identifyLatestBehavioralEvidenceReview(
              reviewContainer,
              occurrence,
            )
          : null;
        if (
          latestReview &&
          latestReview.status === "rejected" &&
          !(options && options.includeRejected === true)
        ) {
          return projections;
        }
        projections.push({
          ...projection,
          sourceRef: { ...projection.sourceRef },
          evidenceRefs: projection.evidenceRefs.map((ref) => ({ ...ref })),
          latestReviewStatus: latestReview
            ? latestReview.status
            : "unreviewed",
          latestReviewId: latestReview ? latestReview.id : null,
          reviewedAt: latestReview ? latestReview.reviewedAt : null,
          latestReviewCorrectedCompetency:
            latestReview && latestReview.status === "corrected"
              ? latestReview.correctedCompetency || null
              : null,
          latestReviewNote:
            latestReview && latestReview.status !== "confirmed-as-recorded"
              ? latestReview.note || null
              : null,
        });
        return projections;
      }, []);
    } catch (e) {
      return [];
    }
  },

  identifyBehavioralEvidenceReviews(reviewContainer) {
    try {
      const reviews =
        reviewContainer && Array.isArray(reviewContainer.reviews)
          ? reviewContainer.reviews
          : [];
      return reviews
        .map((review, index) => ({ review, index }))
        .filter(
          ({ review }) =>
            review &&
            typeof review === "object" &&
            typeof review.reviewedAt === "string" &&
            review.reviewedAt.trim().length > 0,
        )
        .sort((a, b) => {
          if (a.review.reviewedAt !== b.review.reviewedAt) {
            return a.review.reviewedAt < b.review.reviewedAt ? 1 : -1;
          }
          return b.index - a.index;
        })
        .map(({ review }) => JSON.parse(JSON.stringify(review)));
    } catch (e) {
      return [];
    }
  },

  identifyLatestBehavioralEvidenceReview(reviewContainer, occurrence) {
    try {
      if (!occurrence || typeof occurrence !== "object") {
        return null;
      }
      const sourceRef = occurrence.sourceRef;
      if (!sourceRef || typeof sourceRef !== "object") {
        return null;
      }
      const matches = this.identifyBehavioralEvidenceReviews(
        reviewContainer,
      ).filter(
        (review) =>
          review.evidenceId === occurrence.evidenceId &&
          review.outcomeEntryId === occurrence.outcomeEntryId &&
          review.sourceFingerprint === occurrence.sourceFingerprint &&
          review.sourceRef &&
          review.sourceRef.artifactId === sourceRef.artifactId &&
          review.sourceRef.subType === sourceRef.subType &&
          review.sourceRef.subId === sourceRef.subId,
      );
      return matches.length > 0 ? matches[0] : null;
    } catch (e) {
      return null;
    }
  },

  validateBehavioralEvidenceReviewTarget(fieldReports, reviewInput) {
    try {
      if (
        !Array.isArray(fieldReports) ||
        !reviewInput ||
        typeof reviewInput !== "object" ||
        typeof reviewInput.evidenceId !== "string" ||
        reviewInput.evidenceId.trim().length === 0 ||
        typeof reviewInput.outcomeEntryId !== "string" ||
        reviewInput.outcomeEntryId.trim().length === 0 ||
        typeof reviewInput.sourceFingerprint !== "string" ||
        reviewInput.sourceFingerprint.length === 0 ||
        !reviewInput.sourceRef ||
        typeof reviewInput.sourceRef !== "object" ||
        typeof reviewInput.sourceRef.artifactId !== "string" ||
        reviewInput.sourceRef.artifactId.trim().length === 0 ||
        reviewInput.sourceRef.subType !== "customerInteraction" ||
        typeof reviewInput.sourceRef.subId !== "string" ||
        reviewInput.sourceRef.subId.trim().length === 0
      ) {
        return { valid: false, reason: "invalid-target-provenance" };
      }

      const projections = this.identifyBehavioralEvidence(
        fieldReports,
        null,
        { includeRejected: true },
      );
      const evidence = projections.find(
        (candidate) =>
          candidate.evidenceId === reviewInput.evidenceId.trim() &&
          candidate.sourceFingerprint === reviewInput.sourceFingerprint &&
          candidate.sourceRef.artifactId ===
            reviewInput.sourceRef.artifactId.trim() &&
          candidate.sourceRef.subType === reviewInput.sourceRef.subType &&
          candidate.sourceRef.subId === reviewInput.sourceRef.subId.trim() &&
          candidate.evidenceRefs.some(
            (ref) =>
              ref.field === "salesStepOutcomes" &&
              ref.entryId === reviewInput.outcomeEntryId.trim(),
          ),
      );
      if (!evidence) {
        return { valid: false, reason: "behavioral-evidence-target-not-found" };
      }
      return {
        valid: true,
        evidence: JSON.parse(JSON.stringify(evidence)),
        sourceRef: { ...evidence.sourceRef },
        outcomeEntryId: reviewInput.outcomeEntryId.trim(),
      };
    } catch (e) {
      return { valid: false, reason: "review-target-validation-failed" };
    }
  },

  buildBehavioralEvidenceReviewRecord(
    validatedTarget,
    reviewInput,
    existingReviews = [],
  ) {
    try {
      if (!validatedTarget || validatedTarget.valid !== true) {
        return { valid: false, reason: "invalid-validated-target" };
      }
      const allowedStatuses = new Set([
        "confirmed-as-recorded",
        "corrected",
        "rejected",
      ]);
      const status =
        typeof reviewInput.status === "string" ? reviewInput.status.trim() : "";
      if (!allowedStatuses.has(status)) {
        return { valid: false, reason: "invalid-review-status" };
      }
      const canonicalCompetencies = new Set([
        "rapport",
        "discovery",
        "product-selection",
        "presentation",
        "objection-handling",
        "trial-close",
      ]);
      const requestedCompetency =
        typeof reviewInput.correctedCompetency === "string"
          ? reviewInput.correctedCompetency.trim()
          : "";
      const correctedCompetency =
        status === "corrected" &&
        canonicalCompetencies.has(requestedCompetency) &&
        requestedCompetency !== validatedTarget.evidence.competency
          ? requestedCompetency
          : null;
      if (
        status === "corrected" &&
        requestedCompetency &&
        !correctedCompetency
      ) {
        return { valid: false, reason: "invalid-corrected-competency" };
      }
      const note =
        typeof reviewInput.note === "string" &&
        reviewInput.note.trim().length > 0
          ? reviewInput.note.trim()
          : null;
      if (status === "corrected" && !correctedCompetency && !note) {
        return { valid: false, reason: "correction-detail-required" };
      }

      const reviews = Array.isArray(existingReviews)
        ? existingReviews
        : existingReviews && Array.isArray(existingReviews.reviews)
          ? existingReviews.reviews
          : [];
      const occurrence = {
        evidenceId: validatedTarget.evidence.evidenceId,
        sourceRef: validatedTarget.sourceRef,
        outcomeEntryId: validatedTarget.outcomeEntryId,
        sourceFingerprint: validatedTarget.evidence.sourceFingerprint,
      };
      const latestReview = this.identifyLatestBehavioralEvidenceReview(
        { reviews },
        occurrence,
      );
      const effectiveCorrectedCompetency =
        status === "corrected" ? correctedCompetency : null;
      const effectiveNote =
        status === "confirmed-as-recorded" ? null : note;
      if (
        latestReview &&
        latestReview.status === status &&
        (latestReview.correctedCompetency || null) ===
          effectiveCorrectedCompetency &&
        (latestReview.note || null) === effectiveNote
      ) {
        return {
          valid: true,
          changed: false,
          review: JSON.parse(JSON.stringify(latestReview)),
        };
      }

      const reviewedAt = new Date().toISOString();
      return {
        valid: true,
        changed: true,
        review: {
          id: `behavioral_evidence_review_${Date.now()}_${Math.floor(Math.random() * 1000000)}`,
          evidenceId: validatedTarget.evidence.evidenceId,
          sourceRef: { ...validatedTarget.sourceRef },
          outcomeEntryId: validatedTarget.outcomeEntryId,
          sourceFingerprint: validatedTarget.evidence.sourceFingerprint,
          originalInsight: validatedTarget.evidence.insight,
          originalCompetency: validatedTarget.evidence.competency,
          status,
          correctedCompetency: effectiveCorrectedCompetency,
          note: effectiveNote,
          reviewedAt,
          supersedesReviewId: latestReview ? latestReview.id : null,
        },
      };
    } catch (e) {
      return { valid: false, reason: "review-record-build-failed" };
    }
  },

  // =====================================================
  // ACTIVE BEHAVIORAL EVIDENCE READINESS (E3, v0.1)
  // Selects one exact, currently confirmed passive E3 projection.
  // This method never delivers, persists, or increases evidence authority.
  // =====================================================

  buildDeterministicIdentityDigest(input) {
    try {
      if (typeof input !== "string" || typeof BigInt !== "function") {
        return null;
      }

      // FNV-1a 64-bit over the exact UTF-8 input. This is a deterministic,
      // storage-safe identity checksum; it is not a cryptographic hash.
      const bytes = [];
      for (let index = 0; index < input.length; index += 1) {
        const codePoint = input.codePointAt(index);
        if (codePoint > 0xffff) {
          index += 1;
        }
        if (codePoint <= 0x7f) {
          bytes.push(codePoint);
        } else if (codePoint <= 0x7ff) {
          bytes.push(
            0xc0 | (codePoint >> 6),
            0x80 | (codePoint & 0x3f),
          );
        } else if (codePoint <= 0xffff) {
          bytes.push(
            0xe0 | (codePoint >> 12),
            0x80 | ((codePoint >> 6) & 0x3f),
            0x80 | (codePoint & 0x3f),
          );
        } else {
          bytes.push(
            0xf0 | (codePoint >> 18),
            0x80 | ((codePoint >> 12) & 0x3f),
            0x80 | ((codePoint >> 6) & 0x3f),
            0x80 | (codePoint & 0x3f),
          );
        }
      }

      let hash = 14695981039346656037n;
      const prime = 1099511628211n;
      const mask = 0xffffffffffffffffn;
      for (const byte of bytes) {
        hash ^= BigInt(byte);
        hash = (hash * prime) & mask;
      }
      return hash.toString(16).padStart(16, "0");
    } catch (e) {
      return null;
    }
  },

  buildBehavioralEvidenceActiveIdentity(evidenceId, sourceFingerprint) {
    try {
      if (
        typeof evidenceId !== "string" ||
        evidenceId.trim().length === 0 ||
        typeof sourceFingerprint !== "string" ||
        sourceFingerprint.length === 0 ||
        typeof BigInt !== "function"
      ) {
        return null;
      }

      // Canonical digest input uses fixed key insertion order. FNV-1a 64-bit
      // runs over its UTF-8 bytes using exact BigInt arithmetic:
      // offset basis 14695981039346656037, prime 1099511628211, and a
      // 64-bit mask after every multiplication. This is a deterministic,
      // storage-safe identity checksum; it is not a cryptographic hash.
      const input = JSON.stringify({
        evidenceId: evidenceId.trim(),
        sourceFingerprint,
      });
      const digest = this.buildDeterministicIdentityDigest(input);
      if (!digest) {
        return null;
      }
      return `behavioral_evidence_active_v1_${digest}`;
    } catch (e) {
      return null;
    }
  },

  identifyActiveBehavioralEvidence(
    fieldReports,
    behavioralEvidenceReviewContainer = null,
  ) {
    try {
      const evidenceItems = this.identifyBehavioralEvidence(
        fieldReports,
        behavioralEvidenceReviewContainer,
      );
      const evidence = evidenceItems.find(
        (candidate) =>
          candidate &&
          candidate.latestReviewStatus === "confirmed-as-recorded",
      );
      if (!evidence) {
        return null;
      }

      const activeIdentity = this.buildBehavioralEvidenceActiveIdentity(
        evidence.evidenceId,
        evidence.sourceFingerprint,
      );
      if (!activeIdentity) {
        return null;
      }

      return {
        type: "active-behavioral-evidence",
        evidenceTier: "E3",
        activeIdentity,
        evidenceId: evidence.evidenceId,
        competency: evidence.competency,
        label: evidence.label,
        insight: evidence.insight,
        followUpPrompt:
          "What stands out to you about how that interaction unfolded?",
        source: evidence.source,
        sourceFingerprint: evidence.sourceFingerprint,
        sourceRef: evidence.sourceRef ? { ...evidence.sourceRef } : null,
        evidenceRefs: Array.isArray(evidence.evidenceRefs)
          ? evidence.evidenceRefs.map((ref) => ({ ...ref }))
          : [],
        latestReviewId: evidence.latestReviewId,
        reviewedAt: evidence.reviewedAt,
      };
    } catch (e) {
      return null;
    }
  },

  // =====================================================
  // RECURRING BEHAVIORAL PATTERNS (E4, v0.1)
  // Read-only aggregation of current, confirmed E3 occurrences.
  // This projection never persists, delivers, reviews, or changes Profile.
  // =====================================================

  identifyRecurringBehavioralPatterns(
    fieldReports,
    behavioralEvidenceReviewContainer = null,
    behavioralPatternReviewContainer = null,
  ) {
    try {
      const evidenceItems = this.identifyBehavioralEvidence(
        fieldReports,
        behavioralEvidenceReviewContainer,
      );
      const canonicalCompetencyOrder = [
        "rapport",
        "discovery",
        "product-selection",
        "presentation",
        "objection-handling",
        "trial-close",
      ];
      const grouped = new Map();

      for (const evidence of evidenceItems) {
        if (
          !evidence ||
          evidence.latestReviewStatus !== "confirmed-as-recorded" ||
          typeof evidence.competency !== "string" ||
          !canonicalCompetencyOrder.includes(evidence.competency) ||
          typeof evidence.label !== "string" ||
          typeof evidence.evidenceId !== "string" ||
          typeof evidence.sourceFingerprint !== "string" ||
          !evidence.sourceRef ||
          typeof evidence.sourceRef !== "object" ||
          typeof evidence.sourceRef.artifactId !== "string" ||
          typeof evidence.sourceRef.subId !== "string" ||
          !Array.isArray(evidence.evidenceRefs)
        ) {
          continue;
        }

        const outcomeRef = evidence.evidenceRefs.find(
          (ref) =>
            ref &&
            ref.field === "salesStepOutcomes" &&
            typeof ref.entryId === "string" &&
            ref.entryId.length > 0,
        );
        const activeIdentity = this.buildBehavioralEvidenceActiveIdentity(
          evidence.evidenceId,
          evidence.sourceFingerprint,
        );
        if (!outcomeRef || !activeIdentity) {
          continue;
        }

        if (!grouped.has(evidence.competency)) {
          grouped.set(evidence.competency, {
            label: evidence.label,
            contributors: [],
            interactionKeys: new Set(),
            evidenceIds: new Set(),
            activeIdentities: new Set(),
          });
        }
        const group = grouped.get(evidence.competency);
        const interactionKey = JSON.stringify({
          competency: evidence.competency,
          artifactId: evidence.sourceRef.artifactId,
          subId: evidence.sourceRef.subId,
        });
        if (
          group.interactionKeys.has(interactionKey) ||
          group.evidenceIds.has(evidence.evidenceId) ||
          group.activeIdentities.has(activeIdentity)
        ) {
          continue;
        }

        group.interactionKeys.add(interactionKey);
        group.evidenceIds.add(evidence.evidenceId);
        group.activeIdentities.add(activeIdentity);
        group.contributors.push({
          activeIdentity,
          evidenceId: evidence.evidenceId,
          sourceFingerprint: evidence.sourceFingerprint,
          sourceRef: { ...evidence.sourceRef },
          outcomeEntryId: outcomeRef.entryId,
          latestReviewId: evidence.latestReviewId,
          reviewedAt: evidence.reviewedAt,
        });
      }

      const patterns = [];
      for (const [competency, group] of grouped.entries()) {
        if (group.contributors.length < 3) {
          continue;
        }

        const contributorActiveIdentities = group.contributors
          .map((contributor) => contributor.activeIdentity)
          .sort();
        const digest = this.buildDeterministicIdentityDigest(
          JSON.stringify({
            competency,
            contributorActiveIdentities,
          }),
        );
        if (!digest) {
          continue;
        }

        const reportIds = new Set(
          group.contributors.map(
            (contributor) => contributor.sourceRef.artifactId,
          ),
        );
        const newestReviewedAt = group.contributors.reduce(
          (newest, contributor) =>
            typeof contributor.reviewedAt === "string" &&
            contributor.reviewedAt > newest
              ? contributor.reviewedAt
              : newest,
          "",
        );
        patterns.push({
          _newestReviewedAt: newestReviewedAt,
          _canonicalIndex: canonicalCompetencyOrder.indexOf(competency),
          type: "recurring-behavioral-pattern",
          evidenceTier: "E4",
          patternId: `behavioral_pattern_${competency}`,
          patternVersionIdentity:
            `behavioral_pattern_version_v1_${digest}`,
          competency,
          label: group.label,
          interactionCount: group.contributors.length,
          reportCount: reportIds.size,
          insight:
            competency === "rapport"
              ? `Across ${group.contributors.length} Commander-reviewed interaction records, you referenced customer-provided context during Rapport. This recurring pattern does not establish customer trust, comfort, sentiment, likability, or Rapport quality.`
              : `Across ${group.contributors.length} Commander-reviewed interaction records, the available evidence is consistent with effective ${group.label} recurring across those interactions.`,
          source: "confirmedBehavioralEvidenceAggregation",
          contributors: group.contributors.map((contributor) => ({
            ...contributor,
            sourceRef: { ...contributor.sourceRef },
          })),
        });
      }

      patterns.sort((a, b) => {
        if (a.interactionCount !== b.interactionCount) {
          return b.interactionCount - a.interactionCount;
        }
        if (a._newestReviewedAt !== b._newestReviewedAt) {
          return a._newestReviewedAt < b._newestReviewedAt ? 1 : -1;
        }
        return a._canonicalIndex - b._canonicalIndex;
      });

      return patterns.map((pattern) => {
        const { _newestReviewedAt, _canonicalIndex, ...projection } = pattern;
        const latestReview = this.identifyLatestBehavioralPatternReview(
          behavioralPatternReviewContainer,
          projection,
        );
        return {
          ...projection,
          latestPatternReviewStatus: latestReview
            ? latestReview.status
            : "unreviewed",
          latestPatternReviewId: latestReview ? latestReview.id : null,
          patternReviewedAt: latestReview ? latestReview.reviewedAt : null,
          latestPatternCorrectedInterpretation:
            latestReview && latestReview.status === "corrected"
              ? latestReview.correctedInterpretation || null
              : null,
          latestPatternReviewNote:
            latestReview && latestReview.status !== "confirmed-as-pattern"
              ? latestReview.note || null
              : null,
        };
      });
    } catch (e) {
      return [];
    }
  },

  identifyBehavioralPatternReviews(reviewContainer) {
    try {
      const reviews =
        reviewContainer && Array.isArray(reviewContainer.reviews)
          ? reviewContainer.reviews
          : [];
      return reviews
        .map((review, index) => ({ review, index }))
        .filter(
          ({ review }) =>
            review &&
            typeof review === "object" &&
            typeof review.reviewedAt === "string" &&
            review.reviewedAt.trim().length > 0,
        )
        .sort((a, b) => {
          if (a.review.reviewedAt !== b.review.reviewedAt) {
            return a.review.reviewedAt < b.review.reviewedAt ? 1 : -1;
          }
          return b.index - a.index;
        })
        .map(({ review }) => JSON.parse(JSON.stringify(review)));
    } catch (e) {
      return [];
    }
  },

  identifyLatestBehavioralPatternReview(reviewContainer, pattern) {
    try {
      if (
        !pattern ||
        typeof pattern.patternId !== "string" ||
        typeof pattern.patternVersionIdentity !== "string" ||
        !Array.isArray(pattern.contributors)
      ) {
        return null;
      }
      const contributorIdentities = pattern.contributors
        .map((contributor) => contributor && contributor.activeIdentity)
        .filter((identity) => typeof identity === "string")
        .sort();
      const matches = this.identifyBehavioralPatternReviews(
        reviewContainer,
      ).filter(
        (review) =>
          review.patternId === pattern.patternId &&
          review.patternVersionIdentity === pattern.patternVersionIdentity &&
          Array.isArray(review.contributorIdentities) &&
          JSON.stringify(review.contributorIdentities) ===
            JSON.stringify(contributorIdentities),
      );
      return matches.length > 0 ? matches[0] : null;
    } catch (e) {
      return null;
    }
  },

  validateBehavioralPatternReviewTarget(
    fieldReports,
    behavioralEvidenceReviewContainer,
    reviewInput,
  ) {
    try {
      if (
        !reviewInput ||
        typeof reviewInput !== "object" ||
        typeof reviewInput.patternId !== "string" ||
        reviewInput.patternId.trim().length === 0 ||
        typeof reviewInput.patternVersionIdentity !== "string" ||
        reviewInput.patternVersionIdentity.trim().length === 0 ||
        !Array.isArray(reviewInput.contributorIdentities)
      ) {
        return { valid: false, reason: "invalid-pattern-review-target" };
      }
      const patterns = this.identifyRecurringBehavioralPatterns(
        fieldReports,
        behavioralEvidenceReviewContainer,
      );
      const pattern = patterns.find(
        (candidate) =>
          candidate.patternId === reviewInput.patternId.trim() &&
          candidate.patternVersionIdentity ===
            reviewInput.patternVersionIdentity.trim(),
      );
      if (!pattern) {
        return { valid: false, reason: "behavioral-pattern-target-not-current" };
      }
      const contributorIdentities = pattern.contributors
        .map((contributor) => contributor.activeIdentity)
        .sort();
      const requestedIdentities = reviewInput.contributorIdentities.slice();
      if (
        requestedIdentities.some(
          (identity) =>
            typeof identity !== "string" || identity.trim().length === 0,
        ) ||
        JSON.stringify(requestedIdentities) !==
          JSON.stringify(contributorIdentities)
      ) {
        return {
          valid: false,
          reason: "behavioral-pattern-contributors-mismatch",
        };
      }
      return {
        valid: true,
        pattern: JSON.parse(JSON.stringify(pattern)),
        contributorIdentities: contributorIdentities.slice(),
      };
    } catch (e) {
      return { valid: false, reason: "pattern-review-target-validation-failed" };
    }
  },

  buildBehavioralPatternReviewRecord(
    validatedTarget,
    reviewInput,
    existingReviews = [],
  ) {
    try {
      if (!validatedTarget || validatedTarget.valid !== true) {
        return { valid: false, reason: "invalid-validated-target" };
      }
      const allowedStatuses = new Set([
        "confirmed-as-pattern",
        "corrected",
        "rejected",
      ]);
      const status =
        typeof reviewInput.status === "string" ? reviewInput.status.trim() : "";
      if (!allowedStatuses.has(status)) {
        return { valid: false, reason: "invalid-review-status" };
      }
      const correctedInterpretation =
        status === "corrected" &&
        typeof reviewInput.correctedInterpretation === "string" &&
        reviewInput.correctedInterpretation.trim().length > 0
          ? reviewInput.correctedInterpretation.trim()
          : null;
      const note =
        status !== "confirmed-as-pattern" &&
        typeof reviewInput.note === "string" &&
        reviewInput.note.trim().length > 0
          ? reviewInput.note.trim()
          : null;
      if (status === "corrected" && !correctedInterpretation && !note) {
        return { valid: false, reason: "correction-detail-required" };
      }
      const reviews = Array.isArray(existingReviews)
        ? existingReviews
        : existingReviews && Array.isArray(existingReviews.reviews)
          ? existingReviews.reviews
          : [];
      const latestReview = this.identifyLatestBehavioralPatternReview(
        { reviews },
        validatedTarget.pattern,
      );
      if (
        latestReview &&
        latestReview.status === status &&
        (latestReview.correctedInterpretation || null) ===
          correctedInterpretation &&
        (latestReview.note || null) === note
      ) {
        return {
          valid: true,
          changed: false,
          review: JSON.parse(JSON.stringify(latestReview)),
        };
      }
      return {
        valid: true,
        changed: true,
        review: {
          id: `behavioral_pattern_review_${Date.now()}_${Math.floor(Math.random() * 1000000)}`,
          patternId: validatedTarget.pattern.patternId,
          patternVersionIdentity:
            validatedTarget.pattern.patternVersionIdentity,
          competency: validatedTarget.pattern.competency,
          originalInsight: validatedTarget.pattern.insight,
          contributorIdentities:
            validatedTarget.contributorIdentities.slice(),
          status,
          correctedInterpretation,
          note,
          reviewedAt: new Date().toISOString(),
          supersedesReviewId: latestReview ? latestReview.id : null,
        },
      };
    } catch (e) {
      return { valid: false, reason: "pattern-review-record-build-failed" };
    }
  },

  // =====================================================
  // PROFILE CAPABILITY CANDIDATES (read-only, v0.1)
  // Recommends Commander consideration only. Never persists or adopts.
  // =====================================================

  identifyProfileCapabilityCandidates(
    fieldReports,
    behavioralEvidenceReviewContainer = null,
    behavioralPatternReviewContainer = null,
  ) {
    try {
      const patterns = this.identifyRecurringBehavioralPatterns(
        fieldReports,
        behavioralEvidenceReviewContainer,
        behavioralPatternReviewContainer,
      );
      return patterns.reduce((candidates, pattern) => {
        if (
          !pattern ||
          pattern.latestPatternReviewStatus !== "confirmed-as-pattern" ||
          typeof pattern.patternId !== "string" ||
          typeof pattern.patternVersionIdentity !== "string" ||
          typeof pattern.latestPatternReviewId !== "string" ||
          typeof pattern.competency !== "string" ||
          typeof pattern.label !== "string" ||
          !Array.isArray(pattern.contributors)
        ) {
          return candidates;
        }
        const contributorActiveIdentities = pattern.contributors
          .map((contributor) => contributor && contributor.activeIdentity)
          .filter(
            (identity) =>
              typeof identity === "string" && identity.length > 0,
          )
          .sort();
        if (
          contributorActiveIdentities.length !== pattern.contributors.length
        ) {
          return candidates;
        }
        const candidateId =
          `profile_candidate_behavioral_capability_${pattern.competency}`;
        const digest = this.buildDeterministicIdentityDigest(
          JSON.stringify({
            candidateId,
            patternVersionIdentity: pattern.patternVersionIdentity,
            patternReviewId: pattern.latestPatternReviewId,
          }),
        );
        if (!digest) {
          return candidates;
        }
        candidates.push({
          type: "profile-capability-candidate",
          candidateId,
          candidateVersionIdentity:
            `profile_candidate_version_v1_${digest}`,
          candidateType: "behavioral-developing-capability",
          competency: pattern.competency,
          label: pattern.label,
          proposedProfileType: "developing-capability",
          proposedProfileWording:
            `Developing capability: ${pattern.label}`,
          recommendation:
            `Your reviewed interaction records suggest that ${pattern.label} may be a developing capability.`,
          source: "confirmedRecurringBehavioralPattern",
          patternId: pattern.patternId,
          patternVersionIdentity: pattern.patternVersionIdentity,
          patternReviewId: pattern.latestPatternReviewId,
          interactionCount: pattern.interactionCount,
          reportCount: pattern.reportCount,
          contributorActiveIdentities:
            contributorActiveIdentities.slice(),
        });
        return candidates;
      }, []);
    } catch (e) {
      return [];
    }
  },

  // =====================================================
  // REVIEWED E3 PRACTICE RECOMMENDATION (Phase 7.1 / 7.2)
  // Candidate qualification, optional history-only rotation,
  // and public formatting remain separate read-only steps.
  // =====================================================

  getCampingSalesPracticeDefinition(competency = null) {
    const definitions = {
      rapport: {
        competency: "rapport",
        label: "Rapport",
        missionIntent: "practice-rapport",
        actionLabel: "Practice Referencing Customer Context",
      },
      discovery: {
        competency: "discovery",
        label: "Discovery",
        missionIntent: "practice-customer-discovery",
        actionLabel: "Practice Customer Discovery",
      },
      "product-selection": {
        competency: "product-selection",
        label: "Product Selection",
        missionIntent: "practice-product-selection",
        actionLabel: "Practice Product Selection",
      },
      presentation: {
        competency: "presentation",
        label: "Presentation",
        missionIntent: "practice-presentation",
        actionLabel: "Practice a Customer-Need Presentation",
      },
      "objection-handling": {
        competency: "objection-handling",
        label: "Objection Handling",
        missionIntent: "practice-objection-handling",
        actionLabel: "Practice Objection Handling",
      },
      "trial-close": {
        competency: "trial-close",
        label: "Trial Close",
        missionIntent: "practice-trial-close",
        actionLabel: "Practice a Trial Close",
      },
    };
    if (
      typeof competency !== "string" ||
      !Object.prototype.hasOwnProperty.call(definitions, competency)
    ) {
      return null;
    }
    return { ...definitions[competency] };
  },

  buildPracticeCandidates(
    fieldReports,
    behavioralEvidenceReviewContainer = null,
  ) {
    try {
      const competencyOrder = [
        "rapport",
        "discovery",
        "product-selection",
        "presentation",
        "objection-handling",
        "trial-close",
      ];
      const candidates = this.identifyBehavioralEvidence(
        fieldReports,
        behavioralEvidenceReviewContainer,
      ).reduce((qualified, evidence) => {
        const practiceDefinition =
          evidence &&
          this.getCampingSalesPracticeDefinition(evidence.competency);
        const sourceRef = evidence && evidence.sourceRef;
        const outcomeRef =
          evidence && Array.isArray(evidence.evidenceRefs)
            ? evidence.evidenceRefs.find(
                (ref) =>
                  ref &&
                  ref.field === "salesStepOutcomes" &&
                  typeof ref.entryId === "string" &&
                  ref.entryId.length > 0,
              )
            : null;
        const reviewedAtIsValid = Boolean(
          evidence &&
            typeof evidence.reviewedAt === "string" &&
            evidence.reviewedAt.length > 0 &&
            !Number.isNaN(Date.parse(evidence.reviewedAt)),
        );
        if (
          !evidence ||
          evidence.latestReviewStatus !== "confirmed-as-recorded" ||
          !competencyOrder.includes(evidence.competency) ||
          !practiceDefinition ||
          typeof evidence.evidenceId !== "string" ||
          evidence.evidenceId.length === 0 ||
          typeof evidence.sourceFingerprint !== "string" ||
          evidence.sourceFingerprint.length === 0 ||
          typeof evidence.latestReviewId !== "string" ||
          evidence.latestReviewId.length === 0 ||
          !reviewedAtIsValid ||
          !sourceRef ||
          typeof sourceRef.artifactId !== "string" ||
          sourceRef.artifactId.length === 0 ||
          sourceRef.subType !== "customerInteraction" ||
          typeof sourceRef.subId !== "string" ||
          sourceRef.subId.length === 0 ||
          !outcomeRef
        ) {
          return qualified;
        }

        qualified.push({
          competency: evidence.competency,
          label: practiceDefinition.label,
          missionIntent: practiceDefinition.missionIntent,
          reviewedAt: evidence.reviewedAt,
          evidenceRef: {
            evidenceId: evidence.evidenceId,
            sourceFingerprint: evidence.sourceFingerprint,
            reviewId: evidence.latestReviewId,
            outcomeEntryId: outcomeRef.entryId,
            sourceRef: { ...sourceRef },
          },
        });
        return qualified;
      }, []);

      candidates.sort((a, b) => {
        if (a.reviewedAt !== b.reviewedAt) {
          return a.reviewedAt < b.reviewedAt ? 1 : -1;
        }
        const competencyDifference =
          competencyOrder.indexOf(a.competency) -
          competencyOrder.indexOf(b.competency);
        if (competencyDifference !== 0) return competencyDifference;
        return a.evidenceRef.evidenceId.localeCompare(
          b.evidenceRef.evidenceId,
        );
      });

      return candidates;
    } catch (e) {
      return [];
    }
  },

  rotatePracticeCandidate(candidates, archivedMissions) {
    try {
      if (!Array.isArray(candidates) || candidates.length === 0) return null;
      if (candidates.length === 1) return candidates[0];

      const competencyByArchiveTitle = [
        "rapport",
        "discovery",
        "product-selection",
        "presentation",
        "objection-handling",
        "trial-close",
      ].reduce((titles, competency) => {
        const definition = this.getCampingSalesPracticeDefinition(competency);
        if (definition) titles[definition.actionLabel] = competency;
        return titles;
      }, {});
      const recognizedCompetencies = [];
      if (Array.isArray(archivedMissions)) {
        for (const archive of archivedMissions) {
          if (recognizedCompetencies.length >= 5) break;
          if (
            !archive ||
            typeof archive !== "object" ||
            typeof archive.mission !== "string"
          ) {
            continue;
          }
          const competency = competencyByArchiveTitle[archive.mission];
          if (competency) recognizedCompetencies.push(competency);
        }
      }
      const mostRecentIndexByCompetency = new Map();
      for (let index = 0; index < recognizedCompetencies.length; index += 1) {
        const competency = recognizedCompetencies[index];
        if (!mostRecentIndexByCompetency.has(competency)) {
          mostRecentIndexByCompetency.set(competency, index);
        }
      }

      let selected = candidates[0];
      for (let index = 1; index < candidates.length; index += 1) {
        const challenger = candidates[index];
        const selectedPresent = mostRecentIndexByCompetency.has(
          selected.competency,
        );
        const challengerPresent = mostRecentIndexByCompetency.has(
          challenger.competency,
        );
        if (selectedPresent !== challengerPresent) {
          if (!challengerPresent) {
            selected = challenger;
          }
          continue;
        }
        if (
          challengerPresent &&
          mostRecentIndexByCompetency.get(challenger.competency) >
            mostRecentIndexByCompetency.get(selected.competency)
        ) {
          selected = challenger;
        }
      }
      return selected;
    } catch (e) {
      return Array.isArray(candidates) && candidates.length > 0
        ? candidates[0]
        : null;
    }
  },

  formatPracticeRecommendation(candidate, optionalContext = null) {
    try {
      if (
        !candidate ||
        typeof candidate !== "object" ||
        typeof candidate.competency !== "string" ||
        typeof candidate.label !== "string" ||
        typeof candidate.missionIntent !== "string" ||
        !candidate.evidenceRef ||
        typeof candidate.evidenceRef !== "object"
      ) {
        return null;
      }

      const label = candidate.label;
      const baseReason =
        `An interaction you reviewed involved ${label}. ` +
        `You may want to practice ${label} again.`;
      const reasonText = optionalContext
        ? `${baseReason} You have also reviewed this as a recurring pattern across several customer interactions.`
        : baseReason;

      return {
        type: "practice-recommendation",
        version: 1,
        domain: "camping.sales",
        recommendedCompetency: candidate.competency,
        missionIntent: candidate.missionIntent,
        reasonType: "reviewed-interaction",
        reasonText,
        evidenceRefs: [
          {
            evidenceId: candidate.evidenceRef.evidenceId,
            sourceFingerprint: candidate.evidenceRef.sourceFingerprint,
            reviewId: candidate.evidenceRef.reviewId,
            outcomeEntryId: candidate.evidenceRef.outcomeEntryId,
            sourceRef: { ...candidate.evidenceRef.sourceRef },
          },
        ],
        generatedAt: new Date().toISOString(),
        status: "recommended",
      };
    } catch (e) {
      return null;
    }
  },

  // =====================================================
  // E4 RECURRING-PATTERN CONTEXT FOR PRACTICE RECOMMENDATIONS
  // E4 is CONTEXT ONLY. It never creates, selects, ranks,
  // or modifies any recommendation, competency, rotation,
  // missionIntent, evidence, review, Profile, or history.
  // It derives current E4 from field reports + E3/E4 review
  // state and, if it exactly matches the already-selected
  // candidate, returns a neutral context descriptor.
  // =====================================================

  findConfirmedPracticePatternContext(
    selectedCandidate,
    fieldReports,
    behavioralEvidenceReviewContainer,
    behavioralPatternReviewContainer,
  ) {
    try {
      if (
        !selectedCandidate ||
        typeof selectedCandidate !== "object" ||
        typeof selectedCandidate.competency !== "string" ||
        selectedCandidate.competency.length === 0 ||
        !Array.isArray(fieldReports)
      ) {
        return null;
      }

      const patterns = this.identifyRecurringBehavioralPatterns(
        fieldReports,
        behavioralEvidenceReviewContainer,
        behavioralPatternReviewContainer,
      );

      const matching = patterns.find(
        (pattern) =>
          pattern &&
          pattern.competency === selectedCandidate.competency &&
          pattern.latestPatternReviewStatus === "confirmed-as-pattern",
      );

      if (!matching) {
        return null;
      }

      return {
        patternId: matching.patternId,
        patternVersionIdentity: matching.patternVersionIdentity,
      };
    } catch (e) {
      return null;
    }
  },

  // =====================================================
  // COACHING SYNTHESIS (Phase 8.1, v1)
  // Read-only synthesis of confirmed recurring patterns.
  // Derives all pattern state exclusively from the canonical
  // identifyRecurringBehavioralPatterns authority. Never
  // persists, mutates input, or re-derives E3/E4 state.
  // =====================================================

  buildCoachingSynthesis(
    fieldReports,
    behavioralEvidenceReviewContainer = null,
    behavioralPatternReviewContainer = null,
  ) {
    const canonicalCompetencyOrder = [
      "rapport",
      "discovery",
      "product-selection",
      "presentation",
      "objection-handling",
      "trial-close",
    ];
    const patterns = this.identifyRecurringBehavioralPatterns(
      fieldReports,
      behavioralEvidenceReviewContainer,
      behavioralPatternReviewContainer,
    );
    const insights = patterns
      .filter(
        (pattern) =>
          pattern &&
          pattern.latestPatternReviewStatus === "confirmed-as-pattern",
      )
      .sort((a, b) => {
        const indexA = canonicalCompetencyOrder.indexOf(a.competency);
        const indexB = canonicalCompetencyOrder.indexOf(b.competency);
        return (
          (indexA === -1 ? canonicalCompetencyOrder.length : indexA) -
          (indexB === -1 ? canonicalCompetencyOrder.length : indexB)
        );
      })
      .map((pattern) => {
        const label =
          typeof pattern.label === "string" ? pattern.label : "";
        const observation =
          pattern.competency === "rapport"
            ? `You confirmed a recurring pattern across ${pattern.interactionCount} reviewed interaction records where you referenced customer-provided context during Rapport. This does not establish customer trust, comfort, sentiment, likability, or Rapport quality.`
            : `You confirmed a recurring pattern across ${pattern.interactionCount} reviewed interaction records: the evidence you reviewed is consistent with effective ${label} recurring across those interactions.`;
        return {
          basis: "confirmed-recurring-pattern",
          competency: pattern.competency,
          label: pattern.label,
          observation,
          interactionCount: pattern.interactionCount,
          reportCount: pattern.reportCount,
          provenance: {
            evidenceTier: "E4",
            patternId: pattern.patternId,
            patternVersionIdentity: pattern.patternVersionIdentity,
            patternReviewId: pattern.latestPatternReviewId,
          },
        };
      });
    return {
      type: "coaching-synthesis",
      version: 1,
      domain: "camping.sales",
      generatedAt: new Date().toISOString(),
      insights,
    };
  },

  // =====================================================
  // DEVELOPMENT FOCUS OPTIONS (Phase 9.1, v1)
  // Read-only projection of canonical Coaching Synthesis.
  // Preserves the order supplied by canonical Coaching Synthesis.
  // =====================================================

  buildDevelopmentFocusOptions(coachingSynthesis = null) {
    const empty = () => ({
      type: "development-focus-options",
      version: 1,
      domain: "camping.sales",
      options: [],
    });
    if (
      !coachingSynthesis ||
      typeof coachingSynthesis !== "object" ||
      Array.isArray(coachingSynthesis) ||
      coachingSynthesis.type !== "coaching-synthesis" ||
      coachingSynthesis.version !== 1 ||
      coachingSynthesis.domain !== "camping.sales" ||
      !Array.isArray(coachingSynthesis.insights)
    ) {
      return empty();
    }
    const sourceIdentities = new Set();
    const competencies = new Set();
    const options = [];
    for (const insight of coachingSynthesis.insights) {
      if (
        !insight ||
        typeof insight !== "object" ||
        Array.isArray(insight) ||
        insight.basis !== "confirmed-recurring-pattern" ||
        typeof insight.competency !== "string" ||
        insight.competency.trim().length === 0 ||
        typeof insight.label !== "string" ||
        insight.label.trim().length === 0 ||
        typeof insight.observation !== "string" ||
        insight.observation.trim().length === 0 ||
        !insight.provenance ||
        typeof insight.provenance !== "object" ||
        Array.isArray(insight.provenance) ||
        insight.provenance.evidenceTier !== "E4" ||
        typeof insight.provenance.patternId !== "string" ||
        insight.provenance.patternId.trim().length === 0 ||
        typeof insight.provenance.patternVersionIdentity !== "string" ||
        insight.provenance.patternVersionIdentity.trim().length === 0 ||
        typeof insight.provenance.patternReviewId !== "string" ||
        insight.provenance.patternReviewId.trim().length === 0
      ) {
        return empty();
      }
      const sourceIdentity = JSON.stringify([
        insight.provenance.patternId,
        insight.provenance.patternVersionIdentity,
        insight.provenance.patternReviewId,
      ]);
      if (
        sourceIdentities.has(sourceIdentity) ||
        competencies.has(insight.competency)
      ) {
        return empty();
      }
      sourceIdentities.add(sourceIdentity);
      competencies.add(insight.competency);
      options.push({
        competency: insight.competency,
        label: insight.label,
        observation: insight.observation,
        source: {
          basis: insight.basis,
          evidenceTier: insight.provenance.evidenceTier,
          patternId: insight.provenance.patternId,
          patternVersionIdentity:
            insight.provenance.patternVersionIdentity,
          patternReviewId: insight.provenance.patternReviewId,
        },
      });
    }
    return {
      type: "development-focus-options",
      version: 1,
      domain: "camping.sales",
      options,
    };
  },

  // =====================================================
  // DEVELOPMENT FOCUS OPTION RESOLUTION (Phase 9.2, v1)
  // Pure exact-source lookup over canonical Phase 9.1 options.
  // Never selects by order, competency, label, or observation.
  // =====================================================

  findDevelopmentFocusOption(
    developmentFocusOptions = null,
    source = null,
  ) {
    if (
      !developmentFocusOptions ||
      typeof developmentFocusOptions !== "object" ||
      Array.isArray(developmentFocusOptions) ||
      developmentFocusOptions.type !== "development-focus-options" ||
      developmentFocusOptions.version !== 1 ||
      developmentFocusOptions.domain !== "camping.sales" ||
      !Array.isArray(developmentFocusOptions.options) ||
      Object.keys(developmentFocusOptions).length !== 4 ||
      !source ||
      typeof source !== "object" ||
      Array.isArray(source) ||
      Object.keys(source).length !== 5 ||
      source.basis !== "confirmed-recurring-pattern" ||
      source.evidenceTier !== "E4" ||
      typeof source.patternId !== "string" ||
      source.patternId.trim().length === 0 ||
      typeof source.patternVersionIdentity !== "string" ||
      source.patternVersionIdentity.trim().length === 0 ||
      typeof source.patternReviewId !== "string" ||
      source.patternReviewId.trim().length === 0
    ) {
      return null;
    }
    const sourceIdentities = new Set();
    const competencies = new Set();
    let matchedOption = null;
    for (const option of developmentFocusOptions.options) {
      if (
        !option ||
        typeof option !== "object" ||
        Array.isArray(option) ||
        Object.keys(option).length !== 4 ||
        typeof option.competency !== "string" ||
        option.competency.trim().length === 0 ||
        typeof option.label !== "string" ||
        option.label.trim().length === 0 ||
        typeof option.observation !== "string" ||
        option.observation.trim().length === 0 ||
        !option.source ||
        typeof option.source !== "object" ||
        Array.isArray(option.source) ||
        Object.keys(option.source).length !== 5 ||
        option.source.basis !== "confirmed-recurring-pattern" ||
        option.source.evidenceTier !== "E4" ||
        typeof option.source.patternId !== "string" ||
        option.source.patternId.trim().length === 0 ||
        typeof option.source.patternVersionIdentity !== "string" ||
        option.source.patternVersionIdentity.trim().length === 0 ||
        typeof option.source.patternReviewId !== "string" ||
        option.source.patternReviewId.trim().length === 0
      ) {
        return null;
      }
      const sourceIdentity = JSON.stringify([
        option.source.patternId,
        option.source.patternVersionIdentity,
        option.source.patternReviewId,
      ]);
      if (
        sourceIdentities.has(sourceIdentity) ||
        competencies.has(option.competency)
      ) {
        return null;
      }
      sourceIdentities.add(sourceIdentity);
      competencies.add(option.competency);
      if (
        option.source.basis === source.basis &&
        option.source.evidenceTier === source.evidenceTier &&
        option.source.patternId === source.patternId &&
        option.source.patternVersionIdentity ===
          source.patternVersionIdentity &&
        option.source.patternReviewId === source.patternReviewId
      ) {
        matchedOption = option;
      }
    }
    return matchedOption
      ? {
          competency: matchedOption.competency,
          label: matchedOption.label,
          observation: matchedOption.observation,
          source: {
            basis: matchedOption.source.basis,
            evidenceTier: matchedOption.source.evidenceTier,
            patternId: matchedOption.source.patternId,
            patternVersionIdentity:
              matchedOption.source.patternVersionIdentity,
            patternReviewId: matchedOption.source.patternReviewId,
          },
        }
      : null;
  },

  // =====================================================
  // DEVELOPMENT FOCUS SUPPORT (Phase 9.4, v1)
  // Ephemeral exact-source presence over canonical Phase 9.1 options.
  // Never rewrites the Commander's persisted Development Focus.
  // =====================================================

  buildDevelopmentFocusSupport(
    developmentFocus = null,
    developmentFocusOptions = null,
  ) {
    const result = (state) => ({
      type: "development-focus-support",
      version: 1,
      domain: "camping.sales",
      state,
    });
    if (developmentFocus === null) {
      return result("no-focus");
    }
    if (
      !developmentFocus ||
      typeof developmentFocus !== "object" ||
      Array.isArray(developmentFocus) ||
      developmentFocus.type !== "development-focus" ||
      developmentFocus.version !== 1 ||
      developmentFocus.domain !== "camping.sales" ||
      Object.keys(developmentFocus).length !== 8 ||
      typeof developmentFocus.competency !== "string" ||
      developmentFocus.competency.trim().length === 0 ||
      typeof developmentFocus.label !== "string" ||
      developmentFocus.label.trim().length === 0 ||
      typeof developmentFocus.observation !== "string" ||
      developmentFocus.observation.trim().length === 0 ||
      !developmentFocus.source ||
      typeof developmentFocus.source !== "object" ||
      Array.isArray(developmentFocus.source) ||
      Object.keys(developmentFocus.source).length !== 5 ||
      developmentFocus.source.basis !== "confirmed-recurring-pattern" ||
      developmentFocus.source.evidenceTier !== "E4" ||
      typeof developmentFocus.source.patternId !== "string" ||
      developmentFocus.source.patternId.trim().length === 0 ||
      typeof developmentFocus.source.patternVersionIdentity !== "string" ||
      developmentFocus.source.patternVersionIdentity.trim().length === 0 ||
      typeof developmentFocus.source.patternReviewId !== "string" ||
      developmentFocus.source.patternReviewId.trim().length === 0 ||
      typeof developmentFocus.chosenAt !== "string" ||
      developmentFocus.chosenAt.trim().length === 0 ||
      Number.isNaN(Date.parse(developmentFocus.chosenAt)) ||
      new Date(developmentFocus.chosenAt).toISOString() !==
        developmentFocus.chosenAt
    ) {
      return result("unavailable");
    }
    if (
      !developmentFocusOptions ||
      typeof developmentFocusOptions !== "object" ||
      Array.isArray(developmentFocusOptions) ||
      developmentFocusOptions.type !== "development-focus-options" ||
      developmentFocusOptions.version !== 1 ||
      developmentFocusOptions.domain !== "camping.sales" ||
      !Array.isArray(developmentFocusOptions.options) ||
      Object.keys(developmentFocusOptions).length !== 4
    ) {
      return result("unavailable");
    }
    const malformedOption = developmentFocusOptions.options.some(
      (option) =>
        !option ||
        !this.findDevelopmentFocusOption(
          developmentFocusOptions,
          option.source,
        ),
    );
    if (malformedOption) {
      return result("unavailable");
    }
    const matchedOption = this.findDevelopmentFocusOption(
      developmentFocusOptions,
      developmentFocus.source,
    );
    return result(
      matchedOption ? "exact-source-present" : "exact-source-not-present",
    );
  },

  recommendPractice(fieldReports, behavioralEvidenceReviewContainer = null) {
    const candidates = this.buildPracticeCandidates(
      fieldReports,
      behavioralEvidenceReviewContainer,
    );
    return this.formatPracticeRecommendation(candidates[0] || null);
  },

  // =====================================================
  // FOCUS PRACTICE OPTION (Phase 10.1, v1)
  // Pure neutral projection from one saved Commander Development Focus.
  // Does not recommend, persist, create a request, or inspect current support.
  // =====================================================

  buildFocusPracticeOption(developmentFocus = null) {
    if (
      !developmentFocus ||
      typeof developmentFocus !== "object" ||
      Array.isArray(developmentFocus) ||
      developmentFocus.type !== "development-focus" ||
      developmentFocus.version !== 1 ||
      developmentFocus.domain !== "camping.sales" ||
      Object.keys(developmentFocus).length !== 8 ||
      typeof developmentFocus.competency !== "string" ||
      developmentFocus.competency.trim().length === 0 ||
      typeof developmentFocus.label !== "string" ||
      developmentFocus.label.trim().length === 0 ||
      typeof developmentFocus.observation !== "string" ||
      developmentFocus.observation.trim().length === 0 ||
      !developmentFocus.source ||
      typeof developmentFocus.source !== "object" ||
      Array.isArray(developmentFocus.source) ||
      Object.keys(developmentFocus.source).length !== 5 ||
      developmentFocus.source.basis !== "confirmed-recurring-pattern" ||
      developmentFocus.source.evidenceTier !== "E4" ||
      typeof developmentFocus.source.patternId !== "string" ||
      developmentFocus.source.patternId.trim().length === 0 ||
      typeof developmentFocus.source.patternVersionIdentity !== "string" ||
      developmentFocus.source.patternVersionIdentity.trim().length === 0 ||
      typeof developmentFocus.source.patternReviewId !== "string" ||
      developmentFocus.source.patternReviewId.trim().length === 0 ||
      typeof developmentFocus.chosenAt !== "string" ||
      developmentFocus.chosenAt.trim().length === 0 ||
      Number.isNaN(Date.parse(developmentFocus.chosenAt)) ||
      new Date(developmentFocus.chosenAt).toISOString() !==
        developmentFocus.chosenAt
    ) {
      return null;
    }
    const practiceDefinition = this.getCampingSalesPracticeDefinition(
      developmentFocus.competency,
    );
    if (!practiceDefinition) {
      return null;
    }
    return {
      type: "focus-practice-option",
      version: 1,
      domain: "camping.sales",
      competency: developmentFocus.competency,
      label: practiceDefinition.actionLabel,
      missionIntent: practiceDefinition.missionIntent,
      source: {
        basis: "commander-development-focus",
      },
    };
  },

  // =====================================================
  // IDENTIFY LEARNING SIGNAL (v0.1 consumption)
  //
  // Purpose:
  //   Consume already-persisted learningSignals from Field
  //   Reports and return a single evidence-backed insight.
  //   This is CONSUMPTION, not derivation — processFieldReport
  //   already created the signal via the deterministic rule.
  //
  // Selection:
  //   Scan reports[] from newest to oldest (append-ordered,
  //   newest at end). Return the first qualifying signal.
  //   No sorting, scoring, analytics, or relevance logic.
  //
  // Constraints:
  //   - Never mutates input.
  //   - Never persists (MissionIntelligence = judgment only).
  //   - Defensive: never throws into the orchestrator.
  // =====================================================

  identifyLearningSignal(fieldReports) {
    try {
      if (!Array.isArray(fieldReports) || fieldReports.length === 0) {
        return null;
      }

      // Scan from newest to oldest (reports are append-ordered).
      for (let i = fieldReports.length - 1; i >= 0; i -= 1) {
        const report = fieldReports[i];

        if (!report || !Array.isArray(report.learningSignals)) {
          continue;
        }

        for (let j = 0; j < report.learningSignals.length; j += 1) {
          const signal = report.learningSignals[j];

          if (
            signal &&
            typeof signal.learning === "string" &&
            signal.learning.trim().length > 0
          ) {
            const sourceRef =
              Array.isArray(signal.sourceRefs) && signal.sourceRefs.length > 0
                ? signal.sourceRefs[0]
                : null;

            return {
              type: "field-report-learning",
              insight: signal.learning,
              signalId: typeof signal.id === "string" ? signal.id : null,
              evidence: sourceRef
                ? [`artifactId: ${String(sourceRef.artifactId || "")}`]
                : [],
              source: "learningSignal",
            };
          }
        }
      }

      return null;
    } catch (e) {
      return null;
    }
  },

  // =====================================================
  // IDENTIFY LEARNING SIGNALS (plural — HISTORY PROJECTION)
  // v0.1 read-only projection extension of identifyLearningSignal().
  //
  // Purpose:
  //   Return an ordered array of projection objects for already-persisted
  //   learningSignals across Field Reports, enabling chronological history
  //   presentation. NOT a replacement for identifyLearningSignal() (which
  //   remains the single-signal briefing path).
  //
  // Ordering (explicitly deterministic):
  //   1. report.date DESC          (semantic day-level chronology)
  //   2. report.createdAt DESC     (same-day tiebreaker)
  //   3. report array index DESC   (positional fallback: later = newer)
  //   4. learningSignals index ASC (derivation order: Rule #1 before Rule #2)
  //
  // Constraints:
  //   - NEVER mutates fieldReports, reports, or learningSignals
  //   - NEVER persists
  //   - NEVER resolves/copies customer interaction evidence into results
  //   - Returns projection objects only (enriched references)
  //   - Defensive: never throws
  // =====================================================

  identifyLearningSignals(fieldReports, options = {}) {
    try {
      if (!Array.isArray(fieldReports)) {
        return [];
      }

      // Defensive limit normalization (default 5)
      let limit = 5;
      if (
        options &&
        typeof options.limit === "number" &&
        Number.isFinite(options.limit) &&
        options.limit > 0
      ) {
        limit = Math.floor(options.limit);
      }

      const includeNotes = Boolean(options && options.includeNotes);

      // Phase 1: Collect qualifying signals with sort metadata
      const collected = [];

      for (let reportIndex = 0; reportIndex < fieldReports.length; reportIndex += 1) {
        const report = fieldReports[reportIndex];

        if (!report || typeof report !== "object") {
          continue;
        }

        if (!Array.isArray(report.learningSignals)) {
          continue;
        }

        const reportId =
          typeof report.id === "string" && report.id.trim().length > 0
            ? report.id.trim()
            : null;

        const reportDate =
          typeof report.date === "string" && report.date.trim().length > 0
            ? report.date.trim()
            : "";

        const reportCreatedAt =
          typeof report.createdAt === "string" && report.createdAt.trim().length > 0
            ? report.createdAt.trim()
            : "";

        for (let signalIndex = 0; signalIndex < report.learningSignals.length; signalIndex += 1) {
          const signal = report.learningSignals[signalIndex];

          if (!signal || typeof signal !== "object") {
            continue;
          }

          const learning =
            typeof signal.learning === "string" ? signal.learning.trim() : "";

          if (learning.length === 0) {
            continue;
          }

          const sourceRef =
            Array.isArray(signal.sourceRefs) && signal.sourceRefs.length > 0
              ? signal.sourceRefs[0]
              : null;

          const projection = {
            // Sort metadata (stripped before return)
            _sortReportDate: reportDate,
            _sortReportCreatedAt: reportCreatedAt,
            _sortReportIndex: reportIndex,
            _sortSignalIndex: signalIndex,

            // Projection fields
            type: "field-report-learning",
            insight: learning,
            signalId:
              typeof signal.id === "string" && signal.id.trim().length > 0
                ? signal.id.trim()
                : null,
            reportId: reportId,
            reportDate:
              typeof report.date === "string" && report.date.trim().length > 0
                ? report.date.trim()
                : null,
            sourceRef: sourceRef
              ? {
                  artifactId:
                    typeof sourceRef.artifactId === "string"
                      ? sourceRef.artifactId.trim()
                      : "",
                  subType:
                    typeof sourceRef.subType === "string"
                      ? sourceRef.subType.trim()
                      : "",
                  subId:
                    typeof sourceRef.subId === "string"
                      ? sourceRef.subId.trim()
                      : "",
                }
              : null,
            createdAt:
              typeof signal.createdAt === "string" && signal.createdAt.trim().length > 0
                ? signal.createdAt.trim()
                : null,
          };

          if (includeNotes) {
            projection.notes =
              typeof signal.notes === "string" ? signal.notes : "";
          }

          collected.push(projection);
        }
      }

      // Phase 2: Explicit deterministic ordering
      collected.sort((a, b) => {
        // 1. report.date DESC
        if (a._sortReportDate !== b._sortReportDate) {
          return a._sortReportDate < b._sortReportDate ? 1 : -1;
        }

        // 2. report.createdAt DESC
        if (a._sortReportCreatedAt !== b._sortReportCreatedAt) {
          return a._sortReportCreatedAt < b._sortReportCreatedAt ? 1 : -1;
        }

        // 3. original report array index DESC (later index = newer report)
        if (a._sortReportIndex !== b._sortReportIndex) {
          return b._sortReportIndex - a._sortReportIndex;
        }

        // 4. learningSignals array index ASC (derivation order within report)
        return a._sortSignalIndex - b._sortSignalIndex;
      });

      // Phase 3: Apply limit and strip sort helpers
      return collected.slice(0, limit).map((item) => {
        const {
          _sortReportDate,
          _sortReportCreatedAt,
          _sortReportIndex,
          _sortSignalIndex,
          ...projection
        } = item;
        return projection;
      });
    } catch (e) {
      return [];
    }
  },

  // =====================================================
  // IDENTIFY COACHING SIGNAL (v0.1 consumption)
  //
  // Returns one already-persisted FounderOS-owned coaching signal for
  // active briefing use. This consumes Rule #3 output; it never derives,
  // mutates, or persists coaching evidence.
  // =====================================================

  identifyCoachingSignal(
    fieldReports,
    reviewContainer = null,
    options = {},
  ) {
    try {
      if (!Array.isArray(fieldReports) || fieldReports.length === 0) {
        return null;
      }

      const excludeSignalIds = new Set();
      const exclusionInput = options && options.excludeSignalIds;
      if (
        Array.isArray(exclusionInput) ||
        (exclusionInput && typeof exclusionInput[Symbol.iterator] === "function")
      ) {
        for (const signalId of exclusionInput) {
          if (typeof signalId === "string" && signalId.length > 0) {
            excludeSignalIds.add(signalId);
          }
        }
      }

      // Reports are append-ordered, so scan newest to oldest.
      for (let i = fieldReports.length - 1; i >= 0; i -= 1) {
        const report = fieldReports[i];

        if (!report || !Array.isArray(report.coachingSignals)) {
          continue;
        }

        for (let j = 0; j < report.coachingSignals.length; j += 1) {
          const signal = report.coachingSignals[j];

          if (
            !signal ||
            typeof signal.id !== "string" ||
            !signal.id.startsWith("coaching_strength_") ||
            typeof signal.signal !== "string" ||
            signal.signal.trim().length === 0
          ) {
            continue;
          }

          if (excludeSignalIds.has(signal.id)) {
            continue;
          }

          const sourceRef =
            Array.isArray(signal.sourceRefs) && signal.sourceRefs.length > 0
              ? signal.sourceRefs[0]
              : null;

          const occurrence = {
            signalId: signal.id,
            signalCreatedAt:
              typeof signal.createdAt === "string" ? signal.createdAt.trim() : "",
            sourceRef,
          };
          const latestReview = reviewContainer
            ? this.identifyLatestCoachingReview(reviewContainer, occurrence)
            : null;

          if (
            latestReview &&
            (latestReview.status === "corrected" ||
              latestReview.status === "rejected")
          ) {
            continue;
          }

          const projection = {
            type: "field-report-coaching",
            insight: signal.signal,
            followUpPrompt:
              "What happened in that interaction that made this feel like a strength to you?",
            signalId: signal.id,
            evidence: sourceRef
              ? [`artifactId: ${String(sourceRef.artifactId || "")}`]
              : [],
            source: "coachingSignal",
            reportId:
              typeof report.id === "string" && report.id.trim().length > 0
                ? report.id.trim()
                : null,
            reportDate:
              typeof report.date === "string" && report.date.trim().length > 0
                ? report.date.trim()
                : null,
            createdAt:
              typeof signal.createdAt === "string" &&
              signal.createdAt.trim().length > 0
                ? signal.createdAt.trim()
                : null,
            sourceRef: sourceRef
              ? {
                  artifactId:
                    typeof sourceRef.artifactId === "string"
                      ? sourceRef.artifactId.trim()
                      : "",
                  subType:
                    typeof sourceRef.subType === "string"
                      ? sourceRef.subType.trim()
                      : "",
                  subId:
                    typeof sourceRef.subId === "string"
                      ? sourceRef.subId.trim()
                      : "",
                }
              : null,
          };

          if (reviewContainer) {
            projection.latestReviewStatus = latestReview
              ? latestReview.status
              : "unreviewed";
            projection.latestReviewId = latestReview ? latestReview.id : null;
            projection.reviewedAt = latestReview ? latestReview.reviewedAt : null;
          }

          return projection;
        }
      }

      return null;
    } catch (e) {
      return null;
    }
  },

  // =====================================================
  // IDENTIFY CANONICALLY LINKED E1 SIGNAL IDS
  // Matches the deterministic Rule #3 identity and exact source reference.
  // It never parses IDs, mutates reports, or infers from signal wording.
  // =====================================================

  identifyLinkedCoachingSignalIds(fieldReports, linkage = null) {
    try {
      if (
        !Array.isArray(fieldReports) ||
        !linkage ||
        typeof linkage !== "object" ||
        !linkage.sourceRef ||
        typeof linkage.sourceRef !== "object"
      ) {
        return [];
      }

      const artifactId =
        typeof linkage.sourceRef.artifactId === "string"
          ? linkage.sourceRef.artifactId.trim()
          : "";
      const subType =
        typeof linkage.sourceRef.subType === "string"
          ? linkage.sourceRef.subType.trim()
          : "";
      const subId =
        typeof linkage.sourceRef.subId === "string"
          ? linkage.sourceRef.subId.trim()
          : "";
      const competency =
        typeof linkage.competency === "string"
          ? linkage.competency.trim()
          : "";

      if (!artifactId || !subType || !subId || !competency) {
        return [];
      }

      const expectedSignalId =
        `coaching_strength_${artifactId}_${subId}_${competency}`;
      const linkedSignalIds = [];

      for (const report of fieldReports) {
        if (
          !report ||
          typeof report.id !== "string" ||
          report.id.trim() !== artifactId ||
          !Array.isArray(report.coachingSignals)
        ) {
          continue;
        }

        for (const signal of report.coachingSignals) {
          if (
            !signal ||
            signal.id !== expectedSignalId ||
            !Array.isArray(signal.sourceRefs)
          ) {
            continue;
          }

          const hasExactSource = signal.sourceRefs.some(
            (sourceRef) =>
              sourceRef &&
              typeof sourceRef === "object" &&
              sourceRef.artifactId === artifactId &&
              sourceRef.subType === subType &&
              sourceRef.subId === subId,
          );

          if (hasExactSource && !linkedSignalIds.includes(signal.id)) {
            linkedSignalIds.push(signal.id);
          }
        }
      }

      return linkedSignalIds;
    } catch (e) {
      return [];
    }
  },

  // =====================================================
  // IDENTIFY COACHING SIGNALS (HISTORY PROJECTION)
  // Read-only projection of persisted Rule #3 coachingSignals.
  // Includes only signals owned by the coaching_strength_ namespace.
  // =====================================================

  identifyCoachingSignals(fieldReports, options = {}) {
    try {
      if (!Array.isArray(fieldReports)) {
        return [];
      }

      let limit = 5;
      if (
        options &&
        typeof options.limit === "number" &&
        Number.isFinite(options.limit) &&
        options.limit > 0
      ) {
        limit = Math.floor(options.limit);
      }

      const includeNotes = Boolean(options && options.includeNotes);
      const collected = [];

      for (let reportIndex = 0; reportIndex < fieldReports.length; reportIndex += 1) {
        const report = fieldReports[reportIndex];

        if (
          !report ||
          typeof report !== "object" ||
          !Array.isArray(report.coachingSignals)
        ) {
          continue;
        }

        const reportId =
          typeof report.id === "string" && report.id.trim().length > 0
            ? report.id.trim()
            : null;
        const reportDate =
          typeof report.date === "string" && report.date.trim().length > 0
            ? report.date.trim()
            : "";
        const reportCreatedAt =
          typeof report.createdAt === "string" && report.createdAt.trim().length > 0
            ? report.createdAt.trim()
            : "";

        for (
          let signalIndex = 0;
          signalIndex < report.coachingSignals.length;
          signalIndex += 1
        ) {
          const signal = report.coachingSignals[signalIndex];

          if (
            !signal ||
            typeof signal !== "object" ||
            typeof signal.id !== "string" ||
            !signal.id.startsWith("coaching_strength_")
          ) {
            continue;
          }

          const insight =
            typeof signal.signal === "string" ? signal.signal.trim() : "";

          if (insight.length === 0) {
            continue;
          }

          const sourceRef =
            Array.isArray(signal.sourceRefs) && signal.sourceRefs.length > 0
              ? signal.sourceRefs[0]
              : null;

          const projection = {
            _sortReportDate: reportDate,
            _sortReportCreatedAt: reportCreatedAt,
            _sortReportIndex: reportIndex,
            _sortSignalIndex: signalIndex,
            type: "field-report-coaching",
            insight,
            signalId: signal.id.trim().length > 0 ? signal.id.trim() : null,
            reportId,
            reportDate: reportDate || null,
            sourceRef: sourceRef
              ? {
                  artifactId:
                    typeof sourceRef.artifactId === "string"
                      ? sourceRef.artifactId.trim()
                      : "",
                  subType:
                    typeof sourceRef.subType === "string"
                      ? sourceRef.subType.trim()
                      : "",
                  subId:
                    typeof sourceRef.subId === "string"
                      ? sourceRef.subId.trim()
                      : "",
                }
              : null,
            createdAt:
              typeof signal.createdAt === "string" && signal.createdAt.trim().length > 0
                ? signal.createdAt.trim()
              : null,
          };

          if (options && options.reviewContainer) {
            const latestReview = this.identifyLatestCoachingReview(
              options.reviewContainer,
              {
                signalId: projection.signalId,
                signalCreatedAt: projection.createdAt,
                sourceRef: projection.sourceRef,
              },
            );
            projection.latestReviewStatus = latestReview
              ? latestReview.status
              : "unreviewed";
            projection.latestReviewId = latestReview ? latestReview.id : null;
            projection.reviewedAt = latestReview ? latestReview.reviewedAt : null;
          }

          if (includeNotes) {
            projection.notes =
              typeof signal.notes === "string" ? signal.notes : "";
          }

          collected.push(projection);
        }
      }

      collected.sort((a, b) => {
        if (a._sortReportDate !== b._sortReportDate) {
          return a._sortReportDate < b._sortReportDate ? 1 : -1;
        }

        if (a._sortReportCreatedAt !== b._sortReportCreatedAt) {
          return a._sortReportCreatedAt < b._sortReportCreatedAt ? 1 : -1;
        }

        if (a._sortReportIndex !== b._sortReportIndex) {
          return b._sortReportIndex - a._sortReportIndex;
        }

        return a._sortSignalIndex - b._sortSignalIndex;
      });

      return collected.slice(0, limit).map((item) => {
        const {
          _sortReportDate,
          _sortReportCreatedAt,
          _sortReportIndex,
          _sortSignalIndex,
          ...projection
        } = item;
        return projection;
      });
    } catch (e) {
      return [];
    }
  },

  // =====================================================
  // COACHING REVIEW LEDGER (v0.1)
  // Review improves record fidelity only. It never promotes evidence,
  // mutates Field Reports, or persists data.
  // =====================================================

  validateCoachingReviewTarget(fieldReports, reviewInput) {
    try {
      if (!Array.isArray(fieldReports) || !reviewInput || typeof reviewInput !== "object") {
        return { valid: false, reason: "invalid-review-input" };
      }

      const signalId =
        typeof reviewInput.signalId === "string" ? reviewInput.signalId.trim() : "";
      const signalCreatedAt =
        typeof reviewInput.signalCreatedAt === "string"
          ? reviewInput.signalCreatedAt.trim()
          : "";
      const inputRef = reviewInput.sourceRef;
      const sourceRef =
        inputRef && typeof inputRef === "object"
          ? {
              artifactId:
                typeof inputRef.artifactId === "string"
                  ? inputRef.artifactId.trim()
                  : "",
              subType:
                typeof inputRef.subType === "string" ? inputRef.subType.trim() : "",
              subId:
                typeof inputRef.subId === "string" ? inputRef.subId.trim() : "",
            }
          : null;

      if (
        !signalId ||
        !signalId.startsWith("coaching_strength_") ||
        !signalCreatedAt ||
        !sourceRef ||
        !sourceRef.artifactId ||
        sourceRef.subType !== "customerInteraction" ||
        !sourceRef.subId
      ) {
        return { valid: false, reason: "invalid-target-provenance" };
      }

      const report = fieldReports.find(
        (candidate) =>
          candidate &&
          typeof candidate.id === "string" &&
          candidate.id.trim() === sourceRef.artifactId,
      );
      if (!report) {
        return { valid: false, reason: "report-not-found" };
      }

      const interactions = Array.isArray(report.customerInteractions)
        ? report.customerInteractions
        : [];
      const interaction = interactions.find(
        (candidate) =>
          candidate &&
          typeof candidate.id === "string" &&
          candidate.id.trim() === sourceRef.subId,
      );
      if (!interaction) {
        return { valid: false, reason: "interaction-not-found" };
      }

      const signals = Array.isArray(report.coachingSignals)
        ? report.coachingSignals
        : [];
      const signal = signals.find(
        (candidate) =>
          candidate &&
          typeof candidate.id === "string" &&
          candidate.id.trim() === signalId &&
          candidate.id.startsWith("coaching_strength_") &&
          typeof candidate.createdAt === "string" &&
          candidate.createdAt.trim() === signalCreatedAt,
      );
      if (!signal) {
        return { valid: false, reason: "signal-occurrence-not-found" };
      }

      const sourceMatches =
        Array.isArray(signal.sourceRefs) &&
        signal.sourceRefs.some(
          (candidate) =>
            candidate &&
            typeof candidate === "object" &&
            candidate.artifactId === sourceRef.artifactId &&
            candidate.subType === sourceRef.subType &&
            candidate.subId === sourceRef.subId,
        );
      if (!sourceMatches) {
        return { valid: false, reason: "source-ref-mismatch" };
      }

      return {
        valid: true,
        signal: JSON.parse(JSON.stringify(signal)),
        report: JSON.parse(JSON.stringify(report)),
        interaction: JSON.parse(JSON.stringify(interaction)),
        sourceRef: { ...sourceRef },
      };
    } catch (e) {
      return { valid: false, reason: "review-target-validation-failed" };
    }
  },

  identifyCoachingReviews(reviewContainer) {
    try {
      const reviews =
        reviewContainer && Array.isArray(reviewContainer.reviews)
          ? reviewContainer.reviews
          : [];

      return reviews
        .map((review, index) => ({
          review,
          index,
          reviewedAt:
            review && typeof review.reviewedAt === "string"
              ? review.reviewedAt.trim()
              : "",
        }))
        .filter(({ review }) => review && typeof review === "object")
        .sort((a, b) => {
          if (a.reviewedAt !== b.reviewedAt) {
            return a.reviewedAt < b.reviewedAt ? 1 : -1;
          }
          return b.index - a.index;
        })
        .map(({ review }) => JSON.parse(JSON.stringify(review)));
    } catch (e) {
      return [];
    }
  },

  identifyLatestCoachingReview(reviewContainer, occurrence) {
    try {
      if (!occurrence || typeof occurrence !== "object") {
        return null;
      }

      const sourceRef = occurrence.sourceRef;
      if (!sourceRef || typeof sourceRef !== "object") {
        return null;
      }

      const matches = this.identifyCoachingReviews(reviewContainer).filter(
        (review) =>
          review.signalId === occurrence.signalId &&
          review.signalCreatedAt === occurrence.signalCreatedAt &&
          review.sourceRef &&
          review.sourceRef.artifactId === sourceRef.artifactId &&
          review.sourceRef.subType === sourceRef.subType &&
          review.sourceRef.subId === sourceRef.subId,
      );

      return matches.length > 0 ? matches[0] : null;
    } catch (e) {
      return null;
    }
  },

  buildCoachingReviewRecord(validatedTarget, reviewInput, existingReviews = []) {
    try {
      if (!validatedTarget || validatedTarget.valid !== true) {
        return { valid: false, reason: "invalid-validated-target" };
      }

      const allowedStatuses = new Set([
        "confirmed-as-recorded",
        "corrected",
        "rejected",
      ]);
      const status =
        reviewInput && typeof reviewInput.status === "string"
          ? reviewInput.status.trim()
          : "";
      if (!allowedStatuses.has(status)) {
        return { valid: false, reason: "invalid-review-status" };
      }

      const canonicalStrengths = new Set([
        "rapport",
        "discovery",
        "product-selection",
        "presentation",
        "objection-handling",
        "trial-close",
      ]);
      const suppliedStrength = reviewInput.correctedStrength;
      const correctedStrength =
        suppliedStrength === null || suppliedStrength === undefined
          ? null
          : typeof suppliedStrength === "string" &&
              canonicalStrengths.has(suppliedStrength.trim())
            ? suppliedStrength.trim()
            : undefined;
      if (correctedStrength === undefined) {
        return { valid: false, reason: "invalid-corrected-strength" };
      }
      if (status !== "corrected" && correctedStrength !== null) {
        return { valid: false, reason: "corrected-strength-not-allowed" };
      }

      if (
        reviewInput.note !== undefined &&
        reviewInput.note !== null &&
        typeof reviewInput.note !== "string"
      ) {
        return { valid: false, reason: "invalid-review-note" };
      }
      const note =
        typeof reviewInput.note === "string" && reviewInput.note.trim().length > 0
          ? reviewInput.note.trim()
          : null;
      if (status === "corrected" && correctedStrength === null && note === null) {
        return { valid: false, reason: "correction-detail-required" };
      }

      const reviews = Array.isArray(existingReviews)
        ? existingReviews
        : existingReviews && Array.isArray(existingReviews.reviews)
          ? existingReviews.reviews
          : [];
      const occurrence = {
        signalId: validatedTarget.signal.id,
        signalCreatedAt: validatedTarget.signal.createdAt,
        sourceRef: validatedTarget.sourceRef,
      };
      const latestReview = this.identifyLatestCoachingReview(
        { reviews },
        occurrence,
      );

      if (
        latestReview &&
        latestReview.status === status &&
        (latestReview.correctedStrength || null) === correctedStrength &&
        (latestReview.note || null) === note
      ) {
        return {
          valid: true,
          changed: false,
          review: JSON.parse(JSON.stringify(latestReview)),
        };
      }

      const reviewedAt = new Date().toISOString();
      const knownIds = new Set(
        reviews
          .filter((review) => review && typeof review.id === "string")
          .map((review) => review.id),
      );
      let id = `coaching_review_${Date.now()}_${Math.floor(Math.random() * 1000000)}`;
      let collisionIndex = 1;
      while (knownIds.has(id)) {
        id = `${id}_${collisionIndex}`;
        collisionIndex += 1;
      }

      return {
        valid: true,
        changed: true,
        review: {
          id,
          signalId: validatedTarget.signal.id,
          signalCreatedAt: validatedTarget.signal.createdAt,
          sourceRef: { ...validatedTarget.sourceRef },
          originalInsight: validatedTarget.signal.signal,
          status,
          correctedStrength,
          note,
          reviewedAt,
          supersedesReviewId: latestReview ? latestReview.id : null,
        },
      };
    } catch (e) {
      return { valid: false, reason: "review-record-build-failed" };
    }
  },

  // =====================================================
  // REPEATED SELF-ASSESSMENT SUMMARY (E2, v0.1)
  // Groups reviewed, FounderOS-owned Rule #3 occurrences across distinct
  // customer interactions. This is repetition of self-report, not proof.
  // =====================================================

  identifyRepeatedSelfAssessments(fieldReports, reviewContainer = null) {
    try {
      if (!Array.isArray(fieldReports)) {
        return [];
      }

      const canonicalStrengths = [
        "rapport",
        "discovery",
        "product-selection",
        "presentation",
        "objection-handling",
        "trial-close",
      ];
      const labels = {
        rapport: "Rapport",
        discovery: "Discovery",
        "product-selection": "Product Selection",
        presentation: "Presentation",
        "objection-handling": "Objection Handling",
        "trial-close": "Trial Close",
      };
      const grouped = new Map();

      for (let reportIndex = 0; reportIndex < fieldReports.length; reportIndex += 1) {
        const report = fieldReports[reportIndex];
        if (
          !report ||
          typeof report !== "object" ||
          typeof report.id !== "string" ||
          report.id.trim().length === 0 ||
          !Array.isArray(report.customerInteractions) ||
          !Array.isArray(report.coachingSignals)
        ) {
          continue;
        }

        const reportId = report.id.trim();
        const reportDate =
          typeof report.date === "string" && report.date.trim().length > 0
            ? report.date.trim()
            : null;

        for (
          let interactionIndex = 0;
          interactionIndex < report.customerInteractions.length;
          interactionIndex += 1
        ) {
          const interaction = report.customerInteractions[interactionIndex];
          if (
            !interaction ||
            typeof interaction !== "object" ||
            typeof interaction.id !== "string" ||
            interaction.id.trim().length === 0 ||
            !Array.isArray(interaction.explicitStrengths)
          ) {
            continue;
          }

          const interactionId = interaction.id.trim();
          const uniqueStrengths = new Set(
            interaction.explicitStrengths.filter(
              (strength) =>
                typeof strength === "string" &&
                canonicalStrengths.includes(strength),
            ),
          );

          uniqueStrengths.forEach((strength) => {
            // Reproduce Rule #3 identity from canonical source fields and compare
            // for equality. Never parse a signal ID to recover a competency.
            const expectedSignalId =
              `coaching_strength_${reportId}_${interactionId}_${strength}`;
            const matchingSignals = report.coachingSignals
              .map((signal, signalIndex) => ({ signal, signalIndex }))
              .filter(({ signal }) => {
                if (
                  !signal ||
                  typeof signal !== "object" ||
                  signal.id !== expectedSignalId ||
                  !signal.id.startsWith("coaching_strength_") ||
                  signal.signalType !== "strength" ||
                  typeof signal.signal !== "string" ||
                  signal.signal.trim().length === 0 ||
                  typeof signal.createdAt !== "string" ||
                  signal.createdAt.trim().length === 0 ||
                  !Array.isArray(signal.sourceRefs)
                ) {
                  return false;
                }

                return signal.sourceRefs.some(
                  (sourceRef) =>
                    sourceRef &&
                    typeof sourceRef === "object" &&
                    sourceRef.artifactId === reportId &&
                    sourceRef.subType === "customerInteraction" &&
                    sourceRef.subId === interactionId,
                );
              })
              .sort((a, b) => {
                const aCreatedAt = a.signal.createdAt.trim();
                const bCreatedAt = b.signal.createdAt.trim();
                if (aCreatedAt !== bCreatedAt) {
                  return aCreatedAt < bCreatedAt ? 1 : -1;
                }
                return b.signalIndex - a.signalIndex;
              });

            if (matchingSignals.length === 0) {
              return;
            }

            // Duplicate signals for one interaction never create extra evidence.
            // The newest persisted duplicate is the canonical occurrence.
            const signal = matchingSignals[0].signal;
            const sourceRef = {
              artifactId: reportId,
              subType: "customerInteraction",
              subId: interactionId,
            };
            const latestReview = this.identifyLatestCoachingReview(
              reviewContainer,
              {
                signalId: signal.id,
                signalCreatedAt: signal.createdAt.trim(),
                sourceRef,
              },
            );
            const latestReviewStatus = latestReview
              ? latestReview.status
              : "unreviewed";

            if (
              latestReviewStatus === "corrected" ||
              latestReviewStatus === "rejected"
            ) {
              return;
            }

            if (!grouped.has(strength)) {
              grouped.set(strength, []);
            }
            grouped.get(strength).push({
              signalId: signal.id,
              signalCreatedAt: signal.createdAt.trim(),
              reportId,
              reportDate,
              sourceRef: { ...sourceRef },
              latestReviewStatus,
            });
          });
        }
      }

      const summaries = [];
      canonicalStrengths.forEach((strength, canonicalIndex) => {
        const occurrences = grouped.get(strength) || [];
        if (occurrences.length < 2) {
          return;
        }

        occurrences.sort((a, b) => {
          if (a.signalCreatedAt !== b.signalCreatedAt) {
            return a.signalCreatedAt < b.signalCreatedAt ? 1 : -1;
          }
          if ((a.reportDate || "") !== (b.reportDate || "")) {
            return (a.reportDate || "") < (b.reportDate || "") ? 1 : -1;
          }
          if (a.reportId !== b.reportId) {
            return a.reportId < b.reportId ? -1 : 1;
          }
          return a.sourceRef.subId < b.sourceRef.subId ? -1 : 1;
        });

        const reportIds = new Set(
          occurrences.map((occurrence) => occurrence.reportId),
        );
        const label = labels[strength];
        summaries.push({
          _canonicalIndex: canonicalIndex,
          _mostRecentOccurrenceAt: occurrences[0].signalCreatedAt,
          type: "repeated-self-assessment",
          evidenceTier: "E2",
          strength,
          label,
          interactionCount: occurrences.length,
          reportCount: reportIds.size,
          occurrences: occurrences.map((occurrence) => ({
            ...occurrence,
            sourceRef: { ...occurrence.sourceRef },
          })),
          insight: `You have self-identified "${label}" as a strength in ${occurrences.length} recorded interactions.`,
          source: "fieldReportSelfAssessment",
        });
      });

      summaries.sort((a, b) => {
        if (a.interactionCount !== b.interactionCount) {
          return b.interactionCount - a.interactionCount;
        }
        if (a._mostRecentOccurrenceAt !== b._mostRecentOccurrenceAt) {
          return a._mostRecentOccurrenceAt < b._mostRecentOccurrenceAt ? 1 : -1;
        }
        return a._canonicalIndex - b._canonicalIndex;
      });

      return summaries.map((summary) => {
        const {
          _canonicalIndex,
          _mostRecentOccurrenceAt,
          ...projection
        } = summary;
        return projection;
      });
    } catch (e) {
      return [];
    }
  },

  // =====================================================
  // ACTIVE REPEATED SELF-ASSESSMENT READINESS (E2, v0.1)
  // Selects one passive E2 summary for possible future active coaching.
  // This projection does not deliver, persist, or increase evidence authority.
  // =====================================================

  identifyActiveRepeatedSelfAssessment(fieldReports, reviewContainer = null) {
    try {
      const summaries = this.identifyRepeatedSelfAssessments(
        fieldReports,
        reviewContainer,
      );
      const summary = summaries.find(
        (candidate) =>
          candidate &&
          candidate.interactionCount >= 2 &&
          Array.isArray(candidate.occurrences) &&
          candidate.occurrences.some(
            (occurrence) =>
              occurrence &&
              occurrence.latestReviewStatus === "confirmed-as-recorded",
          ),
      );

      if (!summary) {
        return null;
      }

      return {
        ...summary,
        summaryId: `repeated_self_assessment_${summary.strength}`,
        occurrences: summary.occurrences.map((occurrence) => ({
          ...occurrence,
          sourceRef: occurrence.sourceRef ? { ...occurrence.sourceRef } : null,
        })),
        followUpPrompt: "What do you notice repeating across those interactions?",
      };
    } catch (e) {
      return null;
    }
  },
};
