// =====================================================
// FOUNDEROS
// MEMORY SYSTEM
// Archie Core v0.3
//
// Responsibility:
// Preserve long-term Commander knowledge.
//
// Important:
// This system does not make decisions.
// It does not generate guidance.
// It simply stores and retrieves operational
// knowledge for future use.
// =====================================================

const MemorySystem = {
  version: "0.1.0",

  lastArtifact: null,

  // =====================================================
  // SAVE ARTIFACT
  // =====================================================

  saveArtifact(artifact = null) {
    if (!artifact) {
      console.warn("⚠️ Memory System received an invalid artifact.");

      return null;
    }

    if (!artifact.type) {
      console.warn("⚠️ Memory System cannot store an artifact without a type.");

      return null;
    }

    if (typeof founder === "undefined") {
      console.warn("⚠️ Founder data unavailable.");

      return null;
    }

    if (
      typeof CommanderSystem === "undefined" ||
      typeof CommanderSystem.save !== "function"
    ) {
      throw new Error("Founder persistence is unavailable.");
    }

    const existingArtifact = founder.memory?.artifacts?.[artifact.type] || null;
    const now = new Date().toISOString();
    const preparedArtifact = {
      ...JSON.parse(JSON.stringify(artifact)),
      createdAt: existingArtifact?.createdAt || now,
      updatedAt: now,
    };
    const candidateFounder = JSON.parse(JSON.stringify(founder));

    if (!candidateFounder.memory || typeof candidateFounder.memory !== "object") {
      candidateFounder.memory = {};
    }

    if (
      !candidateFounder.memory.artifacts ||
      typeof candidateFounder.memory.artifacts !== "object"
    ) {
      candidateFounder.memory.artifacts = {};
    }

    candidateFounder.memory.artifacts[preparedArtifact.type] = preparedArtifact;

    if (preparedArtifact.type === "strength-profile") {
      if (!candidateFounder.profile || typeof candidateFounder.profile !== "object") {
        candidateFounder.profile = {};
      }
      candidateFounder.profile.strengths = Array.isArray(preparedArtifact.strengths)
        ? [...preparedArtifact.strengths]
        : [];
    }

    const confirmed = CommanderSystem.save(candidateFounder);

    if (confirmed !== true) {
      throw new Error("Founder persistence was not confirmed.");
    }

    if (!founder.memory) {
      founder.memory = {};
    }

    if (!founder.memory.artifacts) {
      founder.memory.artifacts = {};
    }

    founder.memory.artifacts[preparedArtifact.type] = preparedArtifact;

    if (preparedArtifact.type === "strength-profile") {
      if (!founder.profile) {
        founder.profile = {};
      }
      founder.profile.strengths = Array.isArray(preparedArtifact.strengths)
        ? [...preparedArtifact.strengths]
        : [];
    }

    this.lastArtifact = preparedArtifact;

    console.log("🧠 Memory System stored artifact:", this.lastArtifact);

    return this.lastArtifact;

  },

  // =====================================================
  // GET ARTIFACT
  // =====================================================

  getArtifact(type = "") {
    return founder?.memory?.artifacts?.[type] || null;
  },

  // =====================================================
  // ARTIFACT RECALL
  // Retrieves a remembered artifact in a consistent format.
  // =====================================================

  recall(type = "") {
    const artifactType = String(type || "").trim();

    if (!artifactType) {
      console.warn(
        "⚠️ Memory System cannot recall an artifact without a type.",
      );

      return null;
    }

    const artifact = this.getArtifact(artifactType);

    if (!artifact) {
      console.log(`🧠 No remembered artifact found: ${artifactType}`);

      return {
        found: false,
        type: artifactType,
        artifact: null,
        recalledAt: new Date().toISOString(),
      };
    }

    const recall = {
      found: true,
      type: artifactType,

      artifact: {
        ...artifact,
      },

      createdAt: artifact.createdAt || null,
      updatedAt: artifact.updatedAt || null,

      recalledAt: new Date().toISOString(),
    };

    console.log("🧠 Memory System recalled artifact:", recall);

    return recall;
  },

  // =====================================================
  // UPDATE COMMANDER PROFILE
  // Synchronizes remembered artifacts with the
  // living Commander Profile.
  // =====================================================

  updateProfileFromArtifact(artifact = null) {
    if (!artifact) {
      console.warn(
        "⚠️ Memory System cannot update profile without an artifact.",
      );

      return null;
    }

    if (typeof founder === "undefined") {
      console.warn("⚠️ Founder unavailable.");

      return null;
    }

    if (!founder.profile) {
      founder.profile = {};
    }

    switch (artifact.type) {
      case "strength-profile":
        founder.profile.strengths = Array.isArray(artifact.strengths)
          ? [...artifact.strengths]
          : [];

        break;

      default:
        console.log(`🧠 No profile mapping exists for ${artifact.type}.`);
    }

    console.log("🧠 Commander Profile updated:", founder.profile);

    return founder.profile;
  },

  // =====================================================
  // GET ALL ARTIFACTS
  // =====================================================

  getArtifacts() {
    return founder?.memory?.artifacts || {};
  },

  // =====================================================
  // LAST SAVED
  // =====================================================

  getLastArtifact() {
    return this.lastArtifact;
  },
};
