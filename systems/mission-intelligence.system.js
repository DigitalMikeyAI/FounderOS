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

    const recommendedMission = title || null;

    const whyItMatters = description
      ? description
      : `FounderOS knows the active mission is "${title}", but does not yet have enough context to explain why it matters today.`;

    const guidanceStep =
      guidance && Array.isArray(guidance.steps) && guidance.steps.length > 0
        ? guidance.steps[0]
        : null;

    const objectiveStep =
      Array.isArray(objectives) && objectives.length > 0
        ? objectives[0]
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

      const objectivesIncludeStrength = Array.isArray(objectives)
        ? objectives.some((o) => String(o || "").toLowerCase().includes("strength"))
        : false;

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
};
