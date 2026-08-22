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
  // Deterministic rule (v0.1):
  //   When a single customerInteraction records BOTH:
  //     - a non-empty customerGoal  (a stated customer goal)
  //     - a non-empty objections[]  (unresolved objections)
  //   derive exactly ONE learningSignal:
  //     "A stated customer goal can coexist with unresolved
  //      objections."
  //   No derivation for reports/interactions lacking both.
  //
  // Constraints:
  //   - Accepts ONE FieldReport; never mutates the input.
  //   - Never persists (MissionIntelligence = judgment only).
  //   - Deep-clones before mutation (JSON-safe for Field Reports).
  //   - Stable signal ID guarantees idempotency.
  //   - processingStatus moves raw -> processed ON derivation.
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

      // 1. Inspect ONLY existing evidence fields. (read-only)
      const interactions = Array.isArray(report.customerInteractions)
        ? report.customerInteractions
        : [];

      // 2. Narrow deterministic condition: first interaction with
      //    BOTH a customerGoal and objections present.
      const interaction = interactions.find(
        (i) =>
          i &&
          typeof i.id === "string" &&
          i.id.length > 0 &&
          typeof i.customerGoal === "string" &&
          i.customerGoal.trim().length > 0 &&
          Array.isArray(i.objections) &&
          i.objections.length > 0
      );

      if (!interaction) {
        return { changed: false, report }; // nothing to derive
      }

      // 3. Stable signal identity (rule + report + interaction).
      const signalId =
        `learning_goal_objection_coexistence_${report.id}_${interaction.id}`;

      // 4. Idempotency: check by SIGNAL ID, not by processingStatus.
      const existingSignals = Array.isArray(report.learningSignals)
        ? report.learningSignals
        : [];

      const exists = existingSignals.some(
        (s) => s && typeof s.id === "string" && s.id === signalId
      );

      if (exists) {
        return { changed: false, report };
      }

      // 5. Clone before mutation (deep; Field Reports are JSON-serializable).
      const clone = JSON.parse(JSON.stringify(report));

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
            subId: String(interaction.id || ""),
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

      return { changed: true, report: clone };
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
};
