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
};
