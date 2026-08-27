// =====================================================
// FOUNDEROS
// GUIDANCE SYSTEM
// Archie Core v0.3
//
// Responsibility:
// Convert an active mission objective into an actionable
// execution path the Commander can follow.
//
// Important:
// This system does not choose priorities.
// It does not update the interface.
// It does not deliver messages.
// =====================================================

const GuidanceSystem = {
  version: "0.1.0",

  lastGuidance: null,

  build(session = {}, decision = null) {
    const mission = session.mission || {};

    const hasActiveMission =
      mission.status === "active" &&
      String(mission.title || "").trim().length > 0;

    if (!hasActiveMission) {
      return null;
    }

    const missionTitle = String(mission.title || "").trim();

    const objectives = Array.isArray(mission.objectives)
      ? mission.objectives
          .map((item) => {
            if (
              typeof MissionSystem !== "undefined" &&
              typeof MissionSystem.normalizeMissionObjective === "function"
            ) {
              return MissionSystem.normalizeMissionObjective(item);
            }
            return typeof item === "string" && item.trim().length > 0
              ? { text: item, competencyRef: null }
              : null;
          })
          .filter(Boolean)
      : [];

    const selectedObjective =
      objectives.find((item) =>
        item.text.toLowerCase().includes("strength"),
      ) ||
      objectives[0] ||
      null;

    const isDirectionMission = missionTitle === "Discover Your Direction";

    if (!isDirectionMission || !selectedObjective) {
      return null;
    }

    return this.saveGuidance({
      mission: missionTitle,
      objective: selectedObjective.text,
      competencyRef: selectedObjective.competencyRef
        ? { ...selectedObjective.competencyRef }
        : null,
      profileCapabilityContext: null,

      mode: "guided-workshop",

      explanation:
        "Your strengths are abilities you use effectively, repeatedly, and often more naturally than other people.",

      steps: [
        "Recall three situations where someone relied on you.",
        "Write down what you did well in each situation.",
        "Look for abilities that appear more than once.",
        "Group those repeated abilities into strength themes.",
        "Choose one strength you would like to test in a real project.",
      ],

      questions: [
        "What do people regularly ask you for help with?",
        "What tasks feel easier to you than they seem to others?",
        "When have you felt especially capable or useful?",
      ],

      artifact: {
        type: "strength-profile",
        status: "not-started",
      },

      completionCriteria: [
        "At least three possible strengths identified",
        "Repeated patterns grouped into themes",
        "One strength selected for further testing",
      ],
    });
  },

  // Profile capabilities currently belong to the implicit camping.sales
  // vocabulary. This v0.1 bridge requires an explicit Guidance domain ref;
  // it does not add or infer domain metadata on persisted Profile records.
  appendProfileCapabilityContext(
    selectedGuidance = null,
    personalizationContext = [],
  ) {
    if (!selectedGuidance || typeof selectedGuidance !== "object") {
      return selectedGuidance;
    }

    const result = {
      ...selectedGuidance,
      profileCapabilityContext: null,
    };
    const competencyValidation =
      typeof DomainCompetencyContract !== "undefined" &&
      typeof DomainCompetencyContract.validateDomainCompetencyReference ===
        "function"
        ? DomainCompetencyContract.validateDomainCompetencyReference(
            selectedGuidance.competencyRef,
          )
        : null;
    const competencyRef =
      competencyValidation && competencyValidation.valid
        ? competencyValidation.reference
        : null;

    if (!competencyRef || competencyRef.domain !== "camping.sales") {
      return result;
    }

    const capabilities = Array.isArray(personalizationContext)
      ? personalizationContext
      : [];
    const matchingCapability = capabilities.find(
      (capability) =>
        capability &&
        typeof capability === "object" &&
        capability.type === "developing-capability" &&
        capability.competency === competencyRef.competency &&
        typeof capability.label === "string" &&
        capability.label.trim().length > 0 &&
        [
          "current",
          "support-changed",
          "insufficient-current-support",
        ].includes(capability.evidenceSupportState),
    );

    if (!matchingCapability) {
      return result;
    }

    const label = matchingCapability.label.trim();
    const copyBySupportState = {
      current: `You've chosen to recognize ${label} as a developing capability, and this guidance relates to that same competency.`,
      "support-changed": `You've chosen to recognize ${label} as a developing capability. This guidance relates to that same competency, though the reviewed evidence supporting your Profile choice has changed since adoption.`,
      "insufficient-current-support": `You've chosen to recognize ${label} as a developing capability. This guidance relates to that same competency, though there is not currently enough reviewed evidence to reproduce the original recommendation.`,
    };

    result.profileCapabilityContext =
      copyBySupportState[matchingCapability.evidenceSupportState];
    return result;
  },

  saveGuidance(guidance) {
    this.lastGuidance = {
      ...guidance,
      createdAt: new Date().toISOString(),
    };

    console.log("🧭 Guidance System prepared:", this.lastGuidance);

    return this.lastGuidance;
  },

  getLastGuidance() {
    return this.lastGuidance;
  },
};
