// =====================================================
// FOUNDEROS
// MISSION SYSTEM
// Archie Core v0.3
// =====================================================

const MissionSystem = {
  initialize() {},

  assign() {},

  complete() {},

  validateMissionObjective(objective = null) {
    if (typeof objective === "string") {
      return objective.trim().length > 0
        ? { valid: true, objective }
        : { valid: false, reason: "invalid-mission-objective-text" };
    }

    if (!objective || typeof objective !== "object" || Array.isArray(objective)) {
      return { valid: false, reason: "invalid-mission-objective" };
    }

    if (typeof objective.text !== "string" || objective.text.trim().length === 0) {
      return { valid: false, reason: "invalid-mission-objective-text" };
    }

    const hasCompetencyRef = Object.prototype.hasOwnProperty.call(
      objective,
      "competencyRef",
    );
    let competencyRef = null;
    if (hasCompetencyRef) {
      if (
        typeof DomainCompetencyContract === "undefined" ||
        typeof DomainCompetencyContract.validateDomainCompetencyReference !==
          "function"
      ) {
        return { valid: false, reason: "domain-competency-contract-unavailable" };
      }
      const validated =
        DomainCompetencyContract.validateDomainCompetencyReference(
          objective.competencyRef,
        );
      if (!validated || validated.valid !== true) {
        return {
          valid: false,
          reason:
            validated && validated.reason
              ? validated.reason
              : "invalid-domain-competency-reference",
        };
      }
      competencyRef = { ...validated.reference };
    }

    return {
      valid: true,
      objective: {
        text: objective.text,
        ...(competencyRef ? { competencyRef } : {}),
      },
    };
  },

  normalizeMissionObjective(objective = null) {
    const validated = this.validateMissionObjective(objective);
    if (!validated || validated.valid !== true) return null;

    if (typeof validated.objective === "string") {
      return {
        text: validated.objective,
        competencyRef: null,
      };
    }

    return {
      text: validated.objective.text,
      competencyRef: validated.objective.competencyRef
        ? { ...validated.objective.competencyRef }
        : null,
    };
  },
};
