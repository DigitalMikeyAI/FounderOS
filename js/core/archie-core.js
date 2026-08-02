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

      const briefing = await this.buildBriefing(decision);

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

    await this.initializeCommunication();

    this.initialized = true;

    console.log("🤖 Archie Core initialized.");
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

    this.pendingBriefing = await briefingSystem.build(decision);

    this.session.briefing = this.pendingBriefing;

    return this.pendingBriefing;
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
