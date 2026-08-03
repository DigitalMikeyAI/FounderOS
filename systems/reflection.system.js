// =====================================================
// FOUNDEROS
// REFLECTION SYSTEM
// Archie Core v0.1
//
// Responsibility:
// Analyze completed workshops and transform the
// Commander's responses into structured artifacts.
//
// Important:
// This system does not save memory.
// It does not update the Commander Profile.
// It does not communicate with the Commander.
// It only creates knowledge.
// =====================================================

const ReflectionSystem = {
  version: "0.1.0",

  lastArtifact: null,

  strengthRules: [
    {
      name: "Teaching",
      keywords: ["teach", "teaching", "help", "explain", "instruction"],
    },

    {
      name: "Technology",
      keywords: ["technology", "tech", "tools", "software", "digital"],
    },

    {
      name: "Simplifying Complexity",
      keywords: [
        "simpler",
        "simple",
        "simplify",
        "breaking",
        "steps",
        "process",
        "processes",
      ],
    },

    {
      name: "Communication",
      keywords: ["communication", "communicate", "explain", "teach"],
    },

    {
      name: "Building",
      keywords: ["build", "building", "create", "making", "make"],
    },

    {
      name: "Learning Agility",
      keywords: ["learning", "learn", "new tools", "adapt", "figure out"],
    },

    {
      name: "Goal-Oriented Execution",
      keywords: [
        "clear instructions",
        "clear goals",
        "goals",
        "task",
        "instructions",
      ],
    },
  ],

  // =====================================================
  // BUILD
  // Creates an artifact from a completed workshop.
  // =====================================================

  build(workshop = null) {
    if (!workshop) {
      console.warn("⚠️ Reflection System cannot analyze an empty workshop.");

      return null;
    }

    if (!Array.isArray(workshop.answers)) {
      console.warn("⚠️ Workshop answers are unavailable.");

      return null;
    }

    const normalizedAnswers = workshop.answers
      .map((entry) =>
        String(entry?.answer || "")
          .trim()
          .toLowerCase(),
      )
      .filter(Boolean);

    const strengths = [];
    const evidence = [];

    this.strengthRules.forEach((rule) => {
      const matchingAnswers = workshop.answers.filter((entry) => {
        const answer = String(entry?.answer || "").toLowerCase();

        return rule.keywords.some((keyword) => answer.includes(keyword));
      });

      if (!matchingAnswers.length) {
        return;
      }

      strengths.push(rule.name);

      evidence.push({
        strength: rule.name,

        matches: matchingAnswers.map((entry) => ({
          question: entry.question,
          answer: entry.answer,
        })),

        matchCount: matchingAnswers.length,
      });
    });

    const artifact = {
      type: "strength-profile",

      strengths,
      evidence,

      sourceWorkshopId: workshop.id,
      sourceMission: workshop.mission,
      sourceObjective: workshop.objective,

      analyzedAnswerCount: normalizedAnswers.length,

      createdAt: new Date().toISOString(),
    };

    this.lastArtifact = artifact;

    console.log("🧠 Reflection System generated artifact:", artifact);

    return artifact;
  },

  // =====================================================
  // LAST ARTIFACT
  // =====================================================

  getLastArtifact() {
    return this.lastArtifact;
  },
};
