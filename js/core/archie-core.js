// =====================================================
// FOUNDEROS
// ARCHIE CORE v0.3
// Session Orchestrator
// =====================================================

const ArchieCore = {
  version: "0.3.0",

  initialized: false,
  sessionStarted: false,
  briefingStarted: false,

  state: "idle",
  systems: {},

  currentDecision: null,
  pendingBriefing: null,

  session: {
    commander: null,
    memory: null,
    mission: null,
    progress: null,
    decision: null,
    guidance: null,
    briefing: null,
    startedAt: null,
  },

  // =====================================================
  // SESSION LIFECYCLE
  // Coordinates startup without owning system logic.
  // =====================================================

  async beginSession() {
    if (this.sessionStarted) {
      console.warn("⚠️ Archie Core session has already started.");
      return;
    }

    this.sessionStarted = true;
    this.setState("booting");

    console.log(`🧠 Archie Core v${this.version} booting...`);

    this.createSessionContext();

    try {
      await this.initialize();

      await this.loadCommander();

      await this.loadMemory();

      this.captureOperationalState();

      const decision = await this.analyzeState();

      await this.buildGuidance(decision);

      await this.buildRecommendation(decision, this.session.guidance);

      await this.buildBriefing(decision);

      await this.restoreInterface();

      this.setState("ready");

      console.log("🟢 Archie Core session ready.");
    } catch (error) {
      this.handleError(error);
    }
  },

  // =====================================================
  // SESSION REFRESH
  // Rebuilds the operational picture after FounderOS data
  // changes during an active session.
  //
  // Important:
  // This does not reload the page, record another visit,
  // or automatically deliver the resulting briefing.
  // =====================================================

  async refreshSession(options = {}) {
    if (!this.sessionStarted) {
      console.warn(
        "⚠️ Archie Core cannot refresh before a session has started.",
      );

      return null;
    }

    console.log("🔄 Archie Core refreshing session context...");

    try {
      this.setState("refreshing");

      // Reconnect the session to the latest Commander data.
      this.session.commander =
        typeof founder !== "undefined" ? founder : this.session.commander;

      // Refresh memory from the updated Commander object.
      this.session.memory = this.session.commander?.memory || null;

      // Rebuild mission and progress snapshots.
      this.captureOperationalState();

      // Reevaluate what currently deserves attention.
      const decision = await this.analyzeState();

      const guidance = await this.buildGuidance(decision);

      const recommendation = await this.buildRecommendation(decision, guidance);

      let briefing = await this.buildBriefing(decision);

      // =====================================================
      // FIELD REPORT INTELLIGENCE (v0.1)
      // Deterministic, guarded derivation of learningSignals from
      // persisted Field Reports. Orchestrated here (ArchieCore owns
      // orchestration); MissionIntelligence performs interpretation;
      // MemorySystem owns persistence.
      //
      // Trigger: refreshSession only. NOT beginSession (v0.1) —
      // refreshSession does not run on initial page load.
      // Failure is isolated by processFieldReports' own guard so it
      // can never break briefing delivery or session state.
      // =====================================================

      await this.processFieldReports();

      // =====================================================
      // LEARNING SIGNAL CONSUMPTION (v0.1)
      // Surface a persisted learningSignal through the existing
      // briefing path. Reads from MemorySystem (persistence owner),
      // consumes via MissionIntelligenceSystem (interpretation owner),
      // appends via BriefingSystem (surfacing owner).
      // =====================================================

      briefing = await this.surfaceLearningSignals(briefing);

      // =====================================================
      // OPTIONAL BRIEFING DELIVERY
      // =====================================================

      if (
        options.deliver === true &&
        briefing &&
        typeof CommunicationSystem !== "undefined"
      ) {
        await CommunicationSystem.send({
          text: briefing.text,
          target: "dashboard",
        });
      }

      this.setState("ready");

      console.log("🟢 Archie Core session refresh complete.");

      return {
        session: this.session,
        decision,
        guidance,
        briefing,
      };
    } catch (error) {
      this.handleError(error);

      return null;
    }
  },

  // =====================================================
  // CORE INITIALIZATION
  // Discovers systems that are currently installed.
  // =====================================================

  async initialize() {
    if (this.initialized) {
      return;
    }

    this.setState("initializing");

    this.registerAvailableSystems();

    await this.loadExternalModules();

    await this.initializeCommunication();

    this.initialized = true;

    console.log("🤖 Archie Core initialized.");
  },

  // =====================================================
  // EXTERNAL MODULE LOADING
  // Dormant until a module manifest is provided.
  // Reserved for future modules (SalesOS, MarketingOS, etc.)
  // registered via window.FounderOSModuleManifest.
  // =====================================================

  async loadExternalModules() {
    if (
      typeof ModuleLoader === "undefined" ||
      typeof ModuleLoader.loadAll !== "function"
    ) {
      return;
    }

    const manifest =
      typeof window !== "undefined" &&
      Array.isArray(window.FounderOSModuleManifest)
        ? window.FounderOSModuleManifest
        : [];

    if (!manifest.length) {
      return;
    }

    await ModuleLoader.loadAll(manifest);
  },

  registerAvailableSystems() {

    const availableSystems = {
      communication:
        typeof CommunicationSystem !== "undefined" ? CommunicationSystem : null,

      commander:
        typeof CommanderSystem !== "undefined" ? CommanderSystem : null,

      memory: typeof MemorySystem !== "undefined" ? MemorySystem : null,

      mission: typeof MissionSystem !== "undefined" ? MissionSystem : null,

      briefing: typeof BriefingSystem !== "undefined" ? BriefingSystem : null,

      decision: typeof DecisionSystem !== "undefined" ? DecisionSystem : null,

      guidance: typeof GuidanceSystem !== "undefined" ? GuidanceSystem : null,

      workshop: typeof WorkshopSystem !== "undefined" ? WorkshopSystem : null,

      reflection: typeof ReflectionSystem !== "undefined" ? ReflectionSystem : null,

      personality:
        typeof PersonalitySystem !== "undefined" ? PersonalitySystem : null,

      missionIntelligence:
        typeof MissionIntelligenceSystem !== "undefined" ? MissionIntelligenceSystem : null,
    };

    Object.entries(availableSystems).forEach(([name, system]) => {
      if (system) {
        this.registerSystem(name, system);
      }
    });
  },

  registerSystem(name, system) {
    if (!name || !system) {
      console.warn("⚠️ Archie Core rejected an invalid system registration.");
      return;
    }

    this.systems[name] = system;

    // Additive mirror into Module Registry for observability only.
    // Nothing currently reads from ModuleRegistry; ArchieCore.systems
    // remains the canonical source consumed by all existing code.
    if (
      typeof ModuleRegistry !== "undefined" &&
      typeof ModuleRegistry.register === "function"
    ) {
      ModuleRegistry.register(name, system, {
        status: "ready",
        source: "archie-core",
        type: "core-system",
      });
    }

    console.log(`🔌 ${name} system registered.`);
  },


  // =====================================================
  // COMMUNICATION INITIALIZATION
  // CommunicationSystem is preferred.
  // Archie remains the compatibility fallback.
  // =====================================================

  async initializeCommunication() {
    // Archie remains the compatibility communication engine during v0.3.
    if (typeof Archie !== "undefined" && typeof Archie.init === "function") {
      Archie.init();
    }

    const communication = this.systems.communication;

    if (!communication) {
      console.warn(
        "⚠️ Communication System unavailable. Archie compatibility mode active.",
      );

      return;
    }

    if (typeof communication.initialize === "function") {
      await communication.initialize();
      return;
    }

    if (typeof communication.init === "function") {
      await communication.init();
      return;
    }

    console.warn(
      "⚠️ Communication System registered without an initialization method.",
    );
  },

  // =====================================================
  // SESSION CONTEXT
  // Creates the shared operational picture used by systems.
  // =====================================================

  createSessionContext() {
    this.session = {
      commander: null,
      memory: null,
      mission: null,
      progress: null,
      decision: null,
      guidance: null,
      briefing: null,
      startedAt: new Date().toISOString(),
    };

    console.log("🛰️ Session Context created.");

    return this.session;
  },

  // =====================================================
  // COMMANDER RESTORATION
  // CommanderSystem will eventually own this completely.
  // =====================================================

  async loadCommander() {
    const commanderSystem = this.systems.commander;

    if (commanderSystem && typeof commanderSystem.load === "function") {
      this.session.commander = await commanderSystem.load();

      return this.session.commander;
    }

    if (typeof loadFounder === "function") {
      loadFounder();
    }

    this.session.commander = typeof founder !== "undefined" ? founder : null;

    return this.session.commander;
  },

  // =====================================================
  // MEMORY RESTORATION
  // MemorySystem will eventually replace compatibility calls.
  // =====================================================

  async loadMemory() {
    const memorySystem = this.systems.memory;

    if (memorySystem && typeof memorySystem.load === "function") {
      this.session.memory = await memorySystem.load();

      return this.session.memory;
    }

    if (typeof recordFounderVisit === "function") {
      recordFounderVisit();
    }

    this.session.memory = this.session.commander?.memory || null;

    return this.session.memory;
  },

  // =====================================================
  // SESSION SNAPSHOTS
  // Collects current operational facts without deciding.
  // =====================================================

  captureOperationalState() {
    const commander = this.session.commander;

    if (!commander) {
      this.session.mission = null;
      this.session.progress = null;

      return this.session;
    }

    this.session.mission = {
      title: String(commander.currentMission || "").trim(),

      description: String(commander.missionDescription || "").trim(),

      status: commander.missionStatus || "inactive",

      reward: Number(commander.missionReward) || 0,

      objectives: Array.isArray(commander.missionObjectives)
        ? [...commander.missionObjectives]
        : [],
    };

    this.session.progress = {
      level: Number(commander.level) || 1,
      title: commander.title || "Explorer",
      xp: Number(commander.xp) || 0,
      streak: Number(commander.streak) || 0,
    };

    return this.session;
  },

  // =====================================================
  // STATE ANALYSIS
  // No decision logic belongs here.
  // This only delegates to the installed system.
  // =====================================================

  async analyzeState() {
    const decisionSystem = this.systems.decision;

    if (!decisionSystem || typeof decisionSystem.analyze !== "function") {
      return null;
    }

    const decision = await decisionSystem.analyze(this.session);

    this.currentDecision = decision;
    this.session.decision = decision;

    return decision;
  },

  // =====================================================
  // GUIDANCE PREPARATION
  // Converts the active mission into an execution plan.
  // =====================================================

  async buildGuidance(decision = this.session.decision) {
    const guidanceSystem = this.systems.guidance;

    if (!guidanceSystem || typeof guidanceSystem.build !== "function") {
      this.session.guidance = null;

      return null;
    }

    const guidance = await guidanceSystem.build(this.session, decision);

    this.session.guidance = guidance;

    return guidance;
  },

  // =====================================================
  // RECOMMENDATION PREPARATION
  // Calls MissionIntelligenceSystem to get a recommendation.
  // =====================================================

  async buildRecommendation(decision = this.session.decision, guidance = this.session.guidance) {
    const missionIntelligenceSystem = this.systems.missionIntelligence;

    if (!missionIntelligenceSystem || typeof missionIntelligenceSystem.recommendToday !== "function") {
      this.session.recommendation = null;
      return null;
    }

    try {
      const recommendation = await missionIntelligenceSystem.recommendToday(this.session, decision, guidance);

      // Ensure the recommendation is a valid object before storing.
      if (recommendation && typeof recommendation === "object") {
        this.session.recommendation = recommendation;
        return recommendation;
      } else {
        console.warn("⚠️ Mission Intelligence System returned an invalid recommendation object.");
        this.session.recommendation = null;
        return null;
      }
    } catch (error) {
      console.warn("⚠️ Mission Intelligence System encountered an error during recommendation:", error);
      this.session.recommendation = null;
      return null;
    }
  },

  // =====================================================
  // BRIEFING PREPARATION
  // Turns the current decision into a briefing,
  // but does not display it yet.
  // =====================================================

  async buildBriefing(decision = null) {
    const briefingSystem = this.systems.briefing;

    this.currentDecision = decision;

    if (!briefingSystem || typeof briefingSystem.build !== "function") {
      console.warn("⚠️ Briefing System is unavailable.");

      this.pendingBriefing = null;

      return null;
    }

    let newBriefing = await briefingSystem.build(decision);

    // Additively apply Mission Intelligence recommendation if available
    if (briefingSystem && typeof briefingSystem.appendRecommendation === "function") {
      newBriefing = briefingSystem.appendRecommendation(newBriefing, this.session.recommendation);
    }

    this.pendingBriefing = newBriefing;
    this.session.briefing = this.pendingBriefing;

    return this.pendingBriefing;
  },

  // =====================================================
  // FIELD REPORT INTELLIGENCE (v0.1)
  // Deterministic, guarded derivation of learningSignals from
  // persisted Field Reports.
  //
  // Ownership:
  //   - MemorySystem  = persistence (reads + saves the container)
  //   - MissionIntelligenceSystem = interpretation (derives one signal)
  //   - ArchieCore    = orchestration (replaces changed, persists if dirty)
  //
  // Trigger: refreshSession only (v0.1). NOT beginSession.
  // refreshSession does not run on initial page load.
  // =====================================================

  async processFieldReports() {
    // Isolation boundary: never let Field Report intelligence
    // break session refresh. Mirrors the guarded-step convention
    // used by buildRecommendation/buildBriefing.
    try {
      const memorySystem = this.systems.memory;
      const missionIntelligenceSystem = this.systems.missionIntelligence;

      if (
        !memorySystem ||
        typeof memorySystem.getArtifact !== "function" ||
        !missionIntelligenceSystem ||
        typeof missionIntelligenceSystem.processFieldReport !== "function"
      ) {
        return null;
      }

      // 1. Read: Field Report container from MemorySystem (persistence owner).
      const container = memorySystem.getArtifact("camping.fieldReports");

      // 2. Safely no-op when no container/reports exist.
      if (!container || !Array.isArray(container.reports) || container.reports.length === 0) {
        return null;
      }

      // 3. Process each report; replace ONLY changed reports.
      let changed = false;

      const updatedReports = container.reports.map((report) => {
        const result = missionIntelligenceSystem.processFieldReport(report);

        if (result && result.changed) {
          changed = true;
          return result.report;
        }

        return report; // preserve unchanged reports EXACTLY
      });

      // 4. Persist ONLY if at least one report changed.
      if (!changed) {
        return null;
      }

      const now = new Date().toISOString();

      const updatedContainer = {
        ...container,
        reports: updatedReports,
        updatedAt: now,
      };

      // Persistence remains MemorySystem's responsibility.
      memorySystem.saveArtifact(updatedContainer);

      console.log("🧠 Field Report intelligence applied:", updatedContainer);

      return updatedContainer;
    } catch (error) {
      // Isolation: never let Field Report intelligence break session refresh.
      console.warn("⚠️ Field Report intelligence step failed:", error);
      return null;
    }
  },

  // =====================================================
  // LEARNING SIGNAL CONSUMPTION (v0.1)
  // Reads persisted learningSignals from Field Reports and
  // surfaces one through the existing BriefingSystem path.
  //
  // Ownership:
  //   - MemorySystem           = persistence (reads the container)
  //   - MissionIntelligenceSystem = interpretation (consumes signals)
  //   - BriefingSystem         = surfacing (appends to briefing text)
  //   - ArchieCore             = orchestration (wires the flow)
  //
  // Trigger: refreshSession only (v0.1). NOT beginSession.
  // Failure is isolated so it can never break briefing delivery.
  // =====================================================

  async surfaceLearningSignals(briefing = null) {
    try {
      const memorySystem = this.systems.memory;
      const missionIntelligenceSystem = this.systems.missionIntelligence;
      const briefingSystem = this.systems.briefing;

      if (
        !memorySystem ||
        typeof memorySystem.getArtifact !== "function" ||
        !missionIntelligenceSystem ||
        typeof missionIntelligenceSystem.identifyLearningSignal !== "function" ||
        !briefingSystem ||
        typeof briefingSystem.appendLearningSignal !== "function"
      ) {
        return briefing;
      }

      // 1. Read: Field Report container from MemorySystem (persistence owner).
      const container = memorySystem.getArtifact("camping.fieldReports");

      // 2. Safely no-op when no container/reports exist.
      if (!container || !Array.isArray(container.reports) || container.reports.length === 0) {
        return briefing;
      }

      // 3. Consume: MissionIntelligenceSystem selects one signal (newest first).
      const learningSignal = missionIntelligenceSystem.identifyLearningSignal(container.reports);

      if (!learningSignal) {
        return briefing; // nothing to surface
      }

      // 4. Surface: BriefingSystem appends the insight to the briefing text.
      const updatedBriefing = briefingSystem.appendLearningSignal(briefing, learningSignal);

      // 5. Keep session state consistent with the updated briefing.
      this.pendingBriefing = updatedBriefing;
      this.session.briefing = updatedBriefing;

      console.log("🧠 Learning signal surfaced in briefing:", learningSignal);

      return updatedBriefing;
    } catch (error) {
      // Isolation: never let signal consumption break session refresh.
      console.warn("⚠️ Learning signal consumption step failed:", error);
      return briefing;
    }
  },

  // =====================================================
  // BRIEFING DELIVERY
  // Sends the prepared briefing through CommunicationSystem.
  // =====================================================

  async deliverBriefing(briefing = this.pendingBriefing) {
    if (!briefing || !briefing.text) {
      console.warn("⚠️ No prepared briefing is available.");

      return false;
    }

    const communication = this.systems.communication;

    if (communication && typeof communication.send === "function") {
      return communication.send({
        text: briefing.text,
        target: "dashboard",
      });
    }

    // Temporary compatibility fallback.
    if (typeof Archie !== "undefined" && typeof Archie.say === "function") {
      Archie.say({
        text: briefing.text,
        target: "dashboard",
      });

      return true;
    }

    console.warn("⚠️ No communication engine is available.");

    return false;
  },

  // =====================================================
  // INTERFACE RESTORATION
  // Temporary compatibility layer for current UI functions.
  // =====================================================

  async restoreInterface() {
    if (typeof restoreMissionControl === "function") {
      restoreMissionControl();
    }

    if (typeof updateArchieDashboard === "function") {
      updateArchieDashboard();
    }

    if (typeof updateCommandLog === "function") {
      updateCommandLog();
    }
  },

  // =====================================================
  // BRIEFING ENTRY POINT
  // Gives FounderOS one canonical way to begin a briefing.
  // =====================================================

  async beginBriefing() {
    if (this.briefingStarted) {
      console.warn("⚠️ Archie briefing has already started.");

      return;
    }

    this.briefingStarted = true;
    this.setState("briefing");

    try {
      // Rebuild only when startup did not prepare one.
      if (!this.pendingBriefing) {
        const decision =
          this.currentDecision ||
          (this.systems.decision &&
          typeof this.systems.decision.getLastDecision === "function"
            ? this.systems.decision.getLastDecision()
            : await this.analyzeState());

        await this.buildBriefing(decision);
      }

      const delivered = await this.deliverBriefing();

      // Preserve the old briefing as an emergency fallback.
      if (
        !delivered &&
        typeof Archie !== "undefined" &&
        typeof Archie.beginDailyBriefing === "function"
      ) {
        await Archie.beginDailyBriefing();
      }

      this.setState("ready");
    } catch (error) {
      this.briefingStarted = false;
      this.handleError(error);
    }
  },

  // =====================================================
  // CORE STATE
  // =====================================================

  setState(nextState) {
    this.state = nextState;

    if (typeof document !== "undefined") {
      document.documentElement.dataset.archieCoreState = nextState;
    }
  },

  getSystem(name) {
    return this.systems[name] || null;
  },

  getSnapshot() {
    return {
      version: this.version,
      state: this.state,
      initialized: this.initialized,
      sessionStarted: this.sessionStarted,
      briefingStarted: this.briefingStarted,
      installedSystems: Object.keys(this.systems),

      hasDecision: Boolean(this.session?.decision),
      hasBriefing: Boolean(this.session?.briefing),
    };
  },

  // =====================================================
  // ERROR CONTAINMENT
  // =====================================================

  handleError(error) {
    this.setState("error");

    console.error("🔴 Archie Core encountered a session error.", error);
  },
};
