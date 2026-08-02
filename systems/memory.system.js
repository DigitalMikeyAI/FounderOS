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

    if (typeof founder === "undefined") {
      console.warn("⚠️ Founder data unavailable.");

      return null;
    }

    if (!founder.memory) {
      founder.memory = {};
    }

    if (!founder.memory.artifacts) {
      founder.memory.artifacts = {};
    }

    founder.memory.artifacts[artifact.type] = {
      ...artifact,

      createdAt:
        founder.memory.artifacts[artifact.type]?.createdAt ||
        new Date().toISOString(),

      updatedAt: new Date().toISOString(),
    };

    this.lastArtifact = founder.memory.artifacts[artifact.type];

    if (typeof saveFounder === "function") {
      saveFounder();
    }

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
