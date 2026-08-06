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

    if (missionContext.hasActiveMission) {
      return this.buildActiveMissionRecommendation(missionContext, guidance);
    }

    return this.buildNoActiveMissionRecommendation(decision);
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
};
