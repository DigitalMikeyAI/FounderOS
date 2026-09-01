// =====================================================
// FOUNDEROS
// DECISION SYSTEM
// Archie Core v0.3
//
// Responsibility:
// Determine what deserves the Commander's attention.
//
// Important:
// This system returns decisions.
// It does not write messages or update the interface.
// =====================================================

const DecisionSystem = {
  version: "0.1.0",

  lastDecision: null,

  // =====================================================
  // ANALYZE
  // Examines current FounderOS state and returns
  // exactly one primary decision.
  // =====================================================

  analyze(state = {}) {
    const commander = state.commander || null;
    const mission = state.mission || null;
    const memory = state.memory || null;

    const lastVisit = memory?.lastVisit ? new Date(memory.lastVisit) : null;

    const now = new Date();

    const hoursAway = lastVisit ? (now - lastVisit) / (1000 * 60 * 60) : 0;

    if (!commander) {
      return this.saveDecision({
        type: "system-error",
        reason: "commander-unavailable",

        priority: 100,
        severity: "critical",
        confidence: 1,

        context: {},
      });
    }

    const missionTitle = String(mission?.title || "").trim();

    const hasActiveMission =
      mission?.status === "active" && missionTitle.length > 0;

    // =====================================================
    // WELCOME BACK
    // =====================================================

    if (hoursAway >= 24) {
      return this.saveDecision({
        type: "welcome-back",
        reason: "returning-commander",

        priority: 90,
        severity: "info",

        confidence: 1,

        context: {
          hoursAway: Math.floor(hoursAway),
          totalVisits: memory?.totalVisits || 0,
        },
      });
    }

    if (hasActiveMission) {
      return this.saveDecision({
        type: "mission",
        reason: "active-mission",

        priority: 80,
        severity: "info",

        confidence: 1,

        context: {
          title: missionTitle,

          description: String(mission?.description || "").trim(),

          reward: Number(mission?.reward) || 0,

          objectives: Array.isArray(mission?.objectives)
            ? [...mission.objectives]
            : [],
        },
      });
    }

    return this.saveDecision({
      type: "mission-needed",
      reason: "no-active-mission",

      priority: 70,
      severity: "advisory",

      confidence: 1,

      context: {
        onboardingComplete: Boolean(commander.onboardingComplete),

        missionGoal: String(commander.missionGoal || "").trim(),

        experienceLevel: String(commander.experienceLevel || "").trim(),
      },
    });
  },

  // =====================================================
  // DECISION MEMORY
  // Stores the latest result for other systems to read.
  // =====================================================

  saveDecision(decision) {
    const requestedPriority = Number(decision.priority);

    const priority = Number.isFinite(requestedPriority)
      ? Math.min(100, Math.max(0, requestedPriority))
      : 0;

    this.lastDecision = {
      ...decision,

      priority,

      severity: decision.severity || "info",

      createdAt: new Date().toISOString(),
    };

    console.log("🧠 Decision System analysis complete:", this.lastDecision);

    return this.lastDecision;
  },

  getLastDecision() {
    return this.lastDecision;
  },
};
