// =====================================================
// FOUNDEROS
// COMMANDER SYSTEM
// Archie Core v0.3 — Phase 2 Foundation
//
// Responsibility:
// Own the single call-site contract for loading and
// saving Commander (founder) data.
//
// Important:
// This system does not own field-level mutations yet
// (e.g. XP changes, mission assignment). Those remain
// in their existing locations until a future phase.
//
// This system does not change the founder data shape,
// storage keys, or persistence mechanics defined in
// js/storage.js. It delegates to them.
// =====================================================

const CommanderSystem = {
  version: "0.1.0",

  // =====================================================
  // LOAD
  // Delegates to the existing loadFounder() mechanics.
  // =====================================================

  async load() {
    if (typeof loadFounder === "function") {
      loadFounder();
    }

    return typeof founder !== "undefined" ? founder : null;
  },

  // =====================================================
  // SAVE
  // Delegates to the existing saveFounder() mechanics.
  // =====================================================

  save() {
    if (typeof saveFounder === "function") {
      saveFounder();

      return true;
    }

    console.warn("⚠️ Commander System could not save — saveFounder unavailable.");

    return false;
  },

  // =====================================================
  // GET
  // Returns the live Commander reference.
  // Never clones — other systems depend on shared
  // reference semantics with the global founder object.
  // =====================================================

  get() {
    return typeof founder !== "undefined" ? founder : null;
  },

  // =====================================================
  // GET PROFILE
  // Preserved from the original Commander System stub.
  // =====================================================

  getProfile() {
    return this.get()?.profile || null;
  },

  validateProfileCapability(capability = null) {
    if (typeof validateCommanderProfileCapability !== "function") {
      return { valid: false, reason: "profile-capability-validator-unavailable" };
    }
    return validateCommanderProfileCapability(capability);
  },

  getActiveProfileCapabilities() {
    const profile = this.getProfile();
    return profile && Array.isArray(profile.capabilities)
      ? profile.capabilities
          .filter((capability) => capability && capability.status === "active")
          .map((capability) => JSON.parse(JSON.stringify(capability)))
      : [];
  },

  // Canonical read-only doorway for future identity-aware personalization.
  // This is Commander-owned Profile context, never evidence or proficiency.
  getProfilePersonalizationContext() {
    const profile = this.getProfile();
    if (!profile || !Array.isArray(profile.capabilities)) return [];

    return profile.capabilities.reduce((context, capability) => {
      const validated = this.validateProfileCapability(capability);
      if (
        !validated ||
        validated.valid !== true ||
        validated.capability.status !== "active"
      ) {
        return context;
      }

      const activeCapability = validated.capability;
      context.push({
        capabilityId: activeCapability.id,
        competency: activeCapability.competency,
        label: activeCapability.label,
        type: activeCapability.type,
        adoptedWording: activeCapability.adoptedWording,
        evidenceSupportState: activeCapability.evidenceSupportState,
        adoptedAt: activeCapability.adoptedAt,
      });
      return context;
    }, []);
  },

  // =====================================================
  // REPLACE PROFILE CAPABILITIES
  // Validates the complete replacement before changing or saving Profile.
  // =====================================================

  replaceProfileCapabilities(capabilities = null) {
    try {
      const commander = this.get();
      if (
        !commander ||
        !commander.profile ||
        !Array.isArray(capabilities) ||
        typeof validateCommanderProfileCapability !== "function"
      ) {
        return { success: false, reason: "invalid-profile-capabilities" };
      }
      const validatedCapabilities = [];
      for (const capability of capabilities) {
        const validated = validateCommanderProfileCapability(capability);
        if (!validated || validated.valid !== true) {
          return {
            success: false,
            reason:
              validated && validated.reason
                ? validated.reason
                : "invalid-profile-capability",
          };
        }
        validatedCapabilities.push(
          JSON.parse(JSON.stringify(validated.capability)),
        );
      }
      if (
        JSON.stringify(commander.profile.capabilities || []) ===
        JSON.stringify(validatedCapabilities)
      ) {
        return {
          success: true,
          changed: false,
          capabilities: JSON.parse(JSON.stringify(validatedCapabilities)),
        };
      }
      const previousCapabilities = JSON.parse(
        JSON.stringify(commander.profile.capabilities || []),
      );
      commander.profile.capabilities = validatedCapabilities;
      if (!this.save()) {
        commander.profile.capabilities = previousCapabilities;
        return { success: false, reason: "profile-capability-save-failed" };
      }
      return {
        success: true,
        changed: true,
        capabilities: JSON.parse(JSON.stringify(validatedCapabilities)),
      };
    } catch (error) {
      return { success: false, reason: "profile-capability-save-failed" };
    }
  },
};
