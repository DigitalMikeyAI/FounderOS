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

  // =====================================================
  // APPEND COACHING SIGNAL
  // Appends persisted self-assessment wording verbatim.
  // =====================================================

  appendCoachingSignal(briefing = null, coachingSignal = null) {
    if (!briefing || !briefing.text) {
      return briefing;
    }

    if (
      !coachingSignal ||
      !coachingSignal.insight ||
      typeof coachingSignal.insight !== "string"
    ) {
      return briefing;
    }

    let newBriefingText = briefing.text;

    if (!newBriefingText.includes(coachingSignal.insight)) {
      newBriefingText = `${newBriefingText} ${coachingSignal.insight}`;
    }

    if (
      typeof coachingSignal.followUpPrompt === "string" &&
      coachingSignal.followUpPrompt.trim().length > 0 &&
      !newBriefingText.includes(coachingSignal.followUpPrompt)
    ) {
      newBriefingText = `${newBriefingText} ${coachingSignal.followUpPrompt}`;
    }

    if (newBriefingText === briefing.text) {
      return briefing;
    }

    return {
      ...briefing,
      text: newBriefingText,
    };
  },

  // =====================================================
  // APPEND ACTIVE BEHAVIORAL EVIDENCE (E3)
  // Appends Mission Intelligence wording verbatim without changing authority.
  // =====================================================

  appendBehavioralEvidence(briefing = null, activeEvidence = null) {
    if (!briefing || !briefing.text) {
      return briefing;
    }

    if (
      !activeEvidence ||
      !activeEvidence.insight ||
      typeof activeEvidence.insight !== "string"
    ) {
      return briefing;
    }

    let newBriefingText = briefing.text;

    if (!newBriefingText.includes(activeEvidence.insight)) {
      newBriefingText = `${newBriefingText} ${activeEvidence.insight}`;
    }

    if (
      typeof activeEvidence.followUpPrompt === "string" &&
      activeEvidence.followUpPrompt.trim().length > 0 &&
      !newBriefingText.includes(activeEvidence.followUpPrompt)
    ) {
      newBriefingText = `${newBriefingText} ${activeEvidence.followUpPrompt}`;
    }

    if (newBriefingText === briefing.text) {
      return briefing;
    }

    return {
      ...briefing,
      text: newBriefingText,
    };
  },

  // =====================================================
  // APPEND REPEATED SELF-ASSESSMENT (E2)
  // Appends Mission Intelligence wording verbatim without changing authority.
  // =====================================================

  appendRepeatedSelfAssessment(briefing = null, summary = null) {
    if (!briefing || !briefing.text) {
      return briefing;
    }

    if (!summary || !summary.insight || typeof summary.insight !== "string") {
      return briefing;
    }

    let newBriefingText = briefing.text;

    if (!newBriefingText.includes(summary.insight)) {
      newBriefingText = `${newBriefingText} ${summary.insight}`;
    }

    if (
      typeof summary.followUpPrompt === "string" &&
      summary.followUpPrompt.trim().length > 0 &&
      !newBriefingText.includes(summary.followUpPrompt)
    ) {
      newBriefingText = `${newBriefingText} ${summary.followUpPrompt}`;
    }

    if (newBriefingText === briefing.text) {
      return briefing;
    }

    return {
      ...briefing,
      text: newBriefingText,
    };
  },
};
