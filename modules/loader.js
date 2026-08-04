// =====================================================
// FOUNDEROS
// MODULE LOADER
// Foundation v0.1
//
// Responsibility:
// Initialize modules described in a manifest and record
// their outcome in the Module Registry.
//
// Important:
// This loader does not contain business logic.
// It does not replace ArchieCore session orchestration.
// It is dormant until a manifest is provided.
// =====================================================

const ModuleLoader = {
  version: "0.1.0",

  loaded: false,

  // =====================================================
  // LOAD ALL
  // manifest: [{ id, global, dependsOn?, type? }]
  // =====================================================

  async loadAll(manifest = []) {
    if (!Array.isArray(manifest) || manifest.length === 0) {
      console.log("🧩 Module Loader: no external modules to load.");

      return [];
    }

    const results = [];

    for (const descriptor of manifest) {
      // eslint-disable-next-line no-await-in-loop
      const result = await this.loadModule(descriptor);

      results.push(result);
    }

    this.loaded = true;

    return results;
  },

  // =====================================================
  // LOAD ONE MODULE
  // =====================================================

  async loadModule(descriptor = {}) {
    const id = String(descriptor.id || "").trim();

    if (!id) {
      console.warn("⚠️ Module Loader received a descriptor without an id.");

      return null;
    }

    const dependencies = Array.isArray(descriptor.dependsOn)
      ? descriptor.dependsOn
      : [];

    const missingDependency = dependencies.find(
      (dependencyId) =>
        typeof ModuleRegistry === "undefined" ||
        !ModuleRegistry.has(dependencyId),
    );

    if (missingDependency) {
      console.warn(
        `⚠️ Module Loader cannot load "${id}" — missing dependency "${missingDependency}".`,
      );

      if (typeof ModuleRegistry !== "undefined") {
        ModuleRegistry.register(id, null, {
          status: "error",
          source: "module-loader",
        });
      }

      return null;
    }

    const globalName = descriptor.global || id;

    const instance =
      typeof window !== "undefined" ? window[globalName] : undefined;

    if (!instance) {
      console.warn(
        `⚠️ Module Loader could not find global "${globalName}" for module "${id}".`,
      );

      if (typeof ModuleRegistry !== "undefined") {
        ModuleRegistry.register(id, null, {
          status: "error",
          source: "module-loader",
        });
      }

      return null;
    }

    try {
      if (typeof instance.initialize === "function") {
        await instance.initialize();
      } else if (typeof instance.init === "function") {
        await instance.init();
      }

      if (typeof ModuleRegistry !== "undefined") {
        ModuleRegistry.register(id, instance, {
          status: "ready",
          source: "module-loader",
          type: descriptor.type || "module",
        });
      }

      console.log(`🧩 Module Loader: "${id}" ready.`);

      return instance;
    } catch (error) {
      console.error(`🔴 Module Loader failed to initialize "${id}".`, error);

      if (typeof ModuleRegistry !== "undefined") {
        ModuleRegistry.register(id, instance, {
          status: "error",
          source: "module-loader",
        });
      }

      return null;
    }
  },

  // =====================================================
  // STATUS
  // =====================================================

  getStatus() {
    return typeof ModuleRegistry !== "undefined"
      ? ModuleRegistry.getAll()
      : {};
  },
};
