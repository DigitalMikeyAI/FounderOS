// =====================================================
// FOUNDEROS
// MISSION INTELLIGENCE SYSTEM
// Archie Core v0.3 — Phase 4A-1 Foundation
//
// Responsibility:
// Provide judgment on "what matters most right now" based on
// existing FounderOS context.
//
// Important:
// This system does not own source data.
// It does not replace existing systems.
// It synthesizes outputs from existing systems into clear
// Commander recommendations.
// =====================================================

const MissionIntelligenceSystem = {
  version: "0.1.0",

  // =====================================================
  // RECOMMEND TODAY
  // Provides a structured recommendation for the Commander's
  // highest-value mission for today.
  // =====================================================

  recommendToday(session = {}, decision = null, guidance = null) {
    const mission = session.mission || {};
    const commander = session.commander || {};

    const hasActiveMission =
      mission.status === "active" &&
      String(mission.title || "").trim().length > 0;

    if (hasActiveMission) {
      const recommendedMission = mission.title;
      const whyItMatters =
        mission.description ||
        `Your active mission, "${mission.title}", is the current focus for your progress.`;
      const nextAction =
        mission.objectives && mission.objectives.length > 0
          ? `Review your objectives and begin with: "${mission.objectives[0]}".`
          : "Review your mission details and identify your next step.";
      const whatCanWait = "Other tasks not directly contributing to your active mission.";

      return {
        recommendedMission,
        whyItMatters,
        nextAction,
        whatCanWait,
        confidence: 0.9, // High confidence for an active mission
      };
    } else {
      // No active mission
      const recommendedMission = "Define your next mission.";
      const whyItMatters =
        "Without a clear mission, your efforts may be scattered. Defining your next mission will provide clarity and focus.";
      const nextAction = "Visit the Missions screen to select or create a new mission.";
      const whatCanWait = "Unplanned tasks and distractions.";

      return {
        recommendedMission,
        whyItMatters,
        nextAction,
        whatCanWait,
        confidence: 0.7, // Moderate confidence, as it's a general recommendation
      };
    }
  },
};
