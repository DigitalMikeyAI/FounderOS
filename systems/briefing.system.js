// =====================================================
// FOUNDEROS
// BRIEFING SYSTEM
// Archie Core v0.3
//
// Responsibility:
// Turn a structured decision into a Commander briefing.
//
// Important:
// This system does not decide priorities.
// It does not directly update the interface.
// =====================================================

const BriefingSystem = {
  version: "0.1.0",

  lastBriefing: null,

  // =====================================================
  // BUILD
  // Converts one DecisionSystem result into a briefing.
  // =====================================================

  build(decision = null) {
    if (!decision) {
      return this.saveBriefing({
        type: "system",
        text: "Commander, Mission Control is online.",
        decision: null,
      });
    }

    if (decision.type === "mission") {
      const title = decision.context?.title || "your active mission";

      const description = decision.context?.description || "";

      const text = description
        ? `Commander, your primary objective is ${title}. ${description}`
        : `Commander, your primary objective is ${title}.`;

      return this.saveBriefing({
        type: "mission",
        text,
        decision,
      });
    }

    return this.saveBriefing({
      type: "system",
      text: "Commander, no active mission currently requires your attention.",
      decision,
    });
  },

  // =====================================================
  // BRIEFING MEMORY
  // =====================================================

  saveBriefing(briefing) {
    this.lastBriefing = {
      ...briefing,
      createdAt: new Date().toISOString(),
    };

    console.log("📋 Briefing System prepared:", this.lastBriefing);

    return this.lastBriefing;
  },

  getLastBriefing() {
    return this.lastBriefing;
  },
};
