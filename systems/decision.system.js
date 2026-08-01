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
    const commander =
      state.commander || (typeof founder !== "undefined" ? founder : null);

    if (!commander) {
      return this.saveDecision({
        type: "none",
        reason: "commander-unavailable",
        confidence: 1,
        context: {},
      });
    }

    const missionTitle = String(commander.currentMission || "").trim();

    const hasActiveMission =
      commander.missionStatus === "active" && missionTitle.length > 0;

    if (hasActiveMission) {
      return this.saveDecision({
        type: "mission",
        reason: "active-mission",
        confidence: 1,

        context: {
          title: missionTitle,
          description: String(commander.missionDescription || "").trim(),
          reward: Number(commander.missionReward) || 0,
        },
      });
    }

    return this.saveDecision({
      type: "none",
      reason: "no-active-mission",
      confidence: 1,
      context: {},
    });
  },

  // =====================================================
  // DECISION MEMORY
  // Stores the latest result for other systems to read.
  // =====================================================

  saveDecision(decision) {
    this.lastDecision = {
      ...decision,
      createdAt: new Date().toISOString(),
    };

    console.log("🧠 Decision System analysis complete:", this.lastDecision);

    return this.lastDecision;
  },

  getLastDecision() {
    return this.lastDecision;
  },
};
