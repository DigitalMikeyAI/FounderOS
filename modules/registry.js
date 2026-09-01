// =====================================================
// FOUNDEROS
// MODULE REGISTRY
// Foundation v0.1
//
// Responsibility:
// Maintain a single authoritative record of which
// FounderOS modules/systems currently exist, and their
// lifecycle status.
//
// Important:
// This registry does not initialize modules.
// It does not decide load order.
// It does not contain business logic.
// It only remembers what has been registered.
// =====================================================

const ModuleRegistry = {
  version: "0.1.0",

  modules: {},

  // =====================================================
  // REGISTER
  // =====================================================

  register(id, instance = null, metadata = {}) {
    const moduleId = String(id || "").trim();

    if (!moduleId) {
      console.warn("⚠️ Module Registry rejected a module without an id.");

      return null;
    }

    const existing = this.modules[moduleId];

    this.modules[moduleId] = {
      id: moduleId,

      instance,

      status: metadata.status || "registered",

      source: metadata.source || "unknown",

      type: metadata.type || "module",

      registeredAt: existing?.registeredAt || new Date().toISOString(),

      updatedAt: new Date().toISOString(),
    };

    console.log(`🧩 Module Registry: "${moduleId}" registered.`);

    return this.modules[moduleId];
  },

  // =====================================================
  // STATUS
  // =====================================================

  setStatus(id, status) {
    const entry = this.modules[id];

    if (!entry) {
      console.warn(`⚠️ Module Registry cannot update unknown module: ${id}`);

      return null;
    }

    entry.status = status;
    entry.updatedAt = new Date().toISOString();

    return entry;
  },

  // =====================================================
  // READ HELPERS
  // =====================================================

  get(id) {
    return this.modules[id]?.instance || null;
  },

  getEntry(id) {
    return this.modules[id] || null;
  },

  has(id) {
    return Boolean(this.modules[id]);
  },

  list() {
    return Object.keys(this.modules);
  },

  getAll() {
    return { ...this.modules };
  },
};
