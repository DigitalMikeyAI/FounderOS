// =====================================================
// FOUNDEROS
// PERSONALITY SYSTEM
// Archie Core v0.3 — Phase 3C-1 Foundation
//
// Responsibility:
// Reserved as the future single owner of Archie's
// personality/voice logic (tone, phrasing selection,
// character consistency).
//
// Important:
// This system does not yet own any personality behavior.
// No functions have been migrated into it. It exists only
// as a registered, minimal foundation so that future
// phases can move personality logic here incrementally,
// per "small migrations beat large rewrites."
//
// This system does not change js/archie.js, BriefingSystem,
// GuidanceSystem, or CommunicationSystem behavior.
// =====================================================

const PersonalitySystem = {
  version: "0.1.0",

  initialized: false,

  // =====================================================
  // INITIALIZATION
  // =====================================================

  initialize() {
    if (this.initialized) {
      return;
    }

    this.initialized = true;

    console.log("🎭 Personality System initialized.");
  },

  generateArchieLogNote() {
    const streak = founder.streak;

    if (streak === 1) {
      return "Excellent beginning. Every founder starts with a single completed mission.";
    }

    if (streak < 5) {
      return "Momentum is building. Stay consistent.";
    }

    if (streak < 10) {
      return "Consistency is becoming a habit. Keep going.";
    }

    if (streak < 30) {
      return "Your discipline is becoming one of your greatest strengths.";
    }

    return "Outstanding commitment. Mission Control recognizes your consistency.";
  },
};
