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

  getArchieGreeting() {
    const currentHour = new Date().getHours();
    const founderName = founder.name || "Explorer";

    if (currentHour >= 5 && currentHour < 12) {
      return `☀️ Good morning, ${founderName}.`;
    }

    if (currentHour >= 12 && currentHour < 17) {
      return `🚀 Good afternoon, ${founderName}.`;
    }

    if (currentHour >= 17 && currentHour < 22) {
      return `🌙 Good evening, ${founderName}.`;
    }

    return `🌌 Burning the midnight fuel, ${founderName}?`;
  },

  getArchieVisitMessage() {
    const totalVisits = Number(founder.memory?.totalVisits) || 0;

    if (totalVisits === 1) {
      return "This is your first command session. Your mission begins here.";
    }

    if (totalVisits === 2) {
      return "Welcome back. The bridge remembers your first command session.";
    }

    if (totalVisits > 2 && totalVisits <= 5) {
      return `Command session ${totalVisits} is now active. Let's keep building momentum.`;
    }

    if (totalVisits > 5) {
      return `Welcome back. This is command session ${totalVisits}.`;
    }

  return "";
  },

  getArchieMissionMemory() {
    const memory = founder.memory;

    if (!memory || !memory.lastMissionDate) {
      return "";
    }

    const today = getLocalDateKey();
    const yesterday = getYesterdayDateKey();

    const objectiveCount = Number(memory.lastCompletedTaskCount) || 0;

    const missionXP = Number(memory.lastMissionXP) || 0;

    const objectiveWord = objectiveCount === 1 ? "objective" : "objectives";

    if (memory.lastMissionDate === today) {
      return `Today's mission was archived with ${objectiveCount} ${objectiveWord} completed and ${missionXP} XP earned.`;
    }

    if (memory.lastMissionDate === yesterday) {
      return `Yesterday you completed ${objectiveCount} ${objectiveWord} and earned ${missionXP} XP. Today's mission is ready.`;
    }

    return `Your last archived mission earned ${missionXP} XP. Let's continue building momentum.`;
  },

  archieBriefs: [
    "Today's mission is ready. Let's create meaningful progress.",
    "Small wins become powerful systems when repeated consistently.",
    "Progress beats perfection. Choose one objective and begin.",
    "Every founder starts as an Explorer. Keep moving forward.",
    "Your future is built one completed mission at a time.",
    "Consistency compounds faster than motivation.",
    "Today's effort becomes tomorrow's opportunity.",
    "Let's build something worth remembering.",
  ],

  getArchieGenericBrief() {
    const today = new Date().toDateString();

    let dateNumber = 0;

    for (let index = 0; index < today.length; index += 1) {
      dateNumber += today.charCodeAt(index);
    }

    const briefIndex = dateNumber % this.archieBriefs.length;

    return this.archieBriefs[briefIndex];
  },
};
