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

    // =====================================================
    // WELCOME BACK
    // =====================================================

    if (decision.type === "welcome-back") {
      const visits = decision.context?.totalVisits || 0;

      const hours = decision.context?.hoursAway || 0;

      return this.saveBriefing({
        type: "welcome-back",

        text:
          `Welcome back, Commander. ` +
          `Mission Control has been standing by during your ${hours}-hour absence. ` +
          `This marks visit #${visits}. ` +
          `Let's continue building your future.`,

        decision,
      });
    }

    // =====================================================
    // MISSION NEEDED
    // =====================================================

    if (decision.type === "mission-needed") {
      return this.saveBriefing({
        type: "mission-needed",

        text:
          "Commander, no active mission is currently assigned. " +
          "Mission Control recommends selecting your next objective " +
          "before beginning today's operations.",

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

  // =====================================================
  // APPEND RECOMMENDATION
  // Additively extends an existing briefing with a
  // Mission Intelligence recommendation.
  // =====================================================

  appendRecommendation(briefing = null, recommendation = null) {
    if (!briefing || !briefing.text) {
      return briefing; // Cannot append to an empty or invalid briefing
    }

    if (
      !recommendation ||
      !recommendation.nextAction ||
      typeof recommendation.nextAction !== "string"
    ) {
      return briefing; // No valid recommendation to append
    }

    const nextActionSentence = `Your next step: ${recommendation.nextAction}.`;

    // Avoid duplication if the next action is already part of the briefing
    if (briefing.text.includes(recommendation.nextAction)) {
      return briefing;
    }

    const newBriefingText = `${briefing.text} ${nextActionSentence}`;

    // If the Mission Intelligence system provided a concise
    // explanation for why this specific next action matters,
    // append a single sentence after the next-action sentence.
    if (
      recommendation &&
      typeof recommendation.whyThisActionMatters === "string" &&
      recommendation.whyThisActionMatters.trim().length > 0
    ) {
      const explanationSentence = `We begin here because ${recommendation.whyThisActionMatters}.`;

      // Avoid duplication: ensure explanation does not repeat the nextAction verbatim
      if (!newBriefingText.includes(recommendation.whyThisActionMatters)) {
        return {
          ...briefing,
          text: `${newBriefingText} ${explanationSentence}`,
        };
      }
    }

    return {
      ...briefing,
      text: newBriefingText,
    };
  },

  // =====================================================
  // APPEND LEARNING SIGNAL
  // Additively extends an existing briefing with a
  // Field Report learningSignal insight.
  //
  // Mirrors appendRecommendation: same defensive guards
  // and the same intra-briefing text duplicate check.
  // =====================================================

  appendLearningSignal(briefing = null, learningSignal = null) {
    if (!briefing || !briefing.text) {
      return briefing; // Cannot append to an empty or invalid briefing
    }

    if (
      !learningSignal ||
      !learningSignal.insight ||
      typeof learningSignal.insight !== "string"
    ) {
      return briefing; // No valid learning signal to append
    }

    // Avoid duplication: ensure the insight text is not already
    // present in the briefing (same pattern as appendRecommendation).
    if (briefing.text.includes(learningSignal.insight)) {
      return briefing;
    }

    const newBriefingText = `${briefing.text} ${learningSignal.insight}`;

    return {
      ...briefing,
      text: newBriefingText,
    };
  },
};
