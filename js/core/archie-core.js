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
  pendingLearningSignalId: null,
  pendingCoachingSignalId: null,
  pendingRepeatedCoachingSummaryId: null,
  pendingBehavioralEvidenceIdentity: null,
  refreshQueue: Promise.resolve(),

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

  refreshSession(options = {}) {
    const refresh = this.refreshQueue.then(() =>
      this.performRefreshSession(options),
    );

    // Keep later refreshes moving even if an unexpected rejection escapes
    // the existing refresh error boundary. The caller still receives the
    // original refresh Promise and its truthful result.
    this.refreshQueue = refresh.catch(() => null);

    return refresh;
  },

  async performRefreshSession(options = {}) {
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

      // Keep Commander-approved Profile capabilities aligned with the latest
      // evidence-support state. Decisions remain the only identity authority.
      await this.synchronizeAdoptedProfileCapabilities();

      // =====================================================
      // LEARNING SIGNAL CONSUMPTION (v0.1)
      // Surface a persisted learningSignal through the existing
      // briefing path. Reads from MemorySystem (persistence owner),
      // consumes via MissionIntelligenceSystem (interpretation owner),
      // appends via BriefingSystem (surfacing owner).
      // =====================================================

      briefing = await this.surfaceLearningSignals(briefing);

      // Coaching follows learning so evidence-derived operational insight
      // remains distinct from the user's self-assessment reminder.
      briefing = await this.surfaceCoachingSignal(briefing);

      // =====================================================
      // OPTIONAL BRIEFING DELIVERY
      // =====================================================

      if (
        options.deliver === true &&
        briefing
      ) {
        await this.deliverBriefing(briefing);
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

    const contextualReflectionPrompt =
      this.buildProfileCapabilityReflectionPrompt();

    if (guidance && contextualReflectionPrompt) {
      guidance.contextualReflectionPrompt = contextualReflectionPrompt;
    }

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
    this.pendingLearningSignalId = null;
    this.pendingCoachingSignalId = null;
    this.pendingRepeatedCoachingSummaryId = null;
    this.pendingBehavioralEvidenceIdentity = null;

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

      const signalId =
        typeof learningSignal.signalId === "string"
          ? learningSignal.signalId.trim()
          : "";

      if (
        signalId &&
        typeof hasSurfacedSessionSignal === "function" &&
        hasSurfacedSessionSignal("learning", signalId)
      ) {
        return briefing;
      }

      // 4. Surface: BriefingSystem appends the insight to the briefing text.
      const updatedBriefing = briefingSystem.appendLearningSignal(briefing, learningSignal);

      // 5. Keep session state consistent with the updated briefing.
      this.pendingBriefing = updatedBriefing;
      this.pendingLearningSignalId = signalId || null;
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
  // COACHING SELECTION (v0.1)
  // Gives one active-ready E2 summary the coaching slot, otherwise falls
  // back to one persisted Rule #3 E1 self-assessment.
  // =====================================================

  async surfaceCoachingSignal(briefing = null) {
    try {
      const memorySystem = this.systems.memory;
      const missionIntelligenceSystem = this.systems.missionIntelligence;
      const briefingSystem = this.systems.briefing;

      if (
        !memorySystem ||
        typeof memorySystem.getArtifact !== "function" ||
        !missionIntelligenceSystem ||
        !briefingSystem
      ) {
        return briefing;
      }

      const container = memorySystem.getArtifact("camping.fieldReports");
      const reviewContainer = memorySystem.getArtifact("camping.coachingReviews");

      if (!container || !Array.isArray(container.reports) || container.reports.length === 0) {
        return briefing;
      }

      this.pendingCoachingSignalId = null;
      this.pendingRepeatedCoachingSummaryId = null;
      this.pendingBehavioralEvidenceIdentity = null;

      const behavioralReviewContainer = memorySystem.getArtifact(
        "camping.behavioralEvidenceReviews",
      );
      let activeBehavioralEvidence = null;
      let behavioralEvidenceAlreadySurfaced = false;

      if (
        typeof missionIntelligenceSystem.identifyActiveBehavioralEvidence ===
          "function" &&
        typeof briefingSystem.appendBehavioralEvidence === "function"
      ) {
        activeBehavioralEvidence =
          missionIntelligenceSystem.identifyActiveBehavioralEvidence(
            container.reports,
            behavioralReviewContainer,
          );
        const activeIdentity =
          activeBehavioralEvidence &&
          typeof activeBehavioralEvidence.activeIdentity === "string"
            ? activeBehavioralEvidence.activeIdentity.trim()
            : "";
        behavioralEvidenceAlreadySurfaced =
          activeIdentity &&
          typeof hasSurfacedSessionSignal === "function" &&
          hasSurfacedSessionSignal("behavioralEvidence", activeIdentity);

        if (
          activeBehavioralEvidence &&
          activeIdentity &&
          !behavioralEvidenceAlreadySurfaced
        ) {
          const updatedBriefing = briefingSystem.appendBehavioralEvidence(
            briefing,
            activeBehavioralEvidence,
          );

          this.pendingBriefing = updatedBriefing;
          this.pendingBehavioralEvidenceIdentity = activeIdentity;
          this.session.briefing = updatedBriefing;

          console.log(
            "🧠 E3 behavioral evidence appended to briefing:",
            activeBehavioralEvidence,
          );

          return updatedBriefing;
        }
      }

      let repeatedSummary = null;
      let repeatedAlreadySurfaced = false;
      let repeatedSuppressedByBehavioralEvidence = false;

      if (
        typeof missionIntelligenceSystem.identifyActiveRepeatedSelfAssessment ===
          "function" &&
        typeof briefingSystem.appendRepeatedSelfAssessment === "function"
      ) {
        repeatedSummary =
          missionIntelligenceSystem.identifyActiveRepeatedSelfAssessment(
            container.reports,
            reviewContainer,
          );
        const summaryId =
          repeatedSummary && typeof repeatedSummary.summaryId === "string"
            ? repeatedSummary.summaryId.trim()
            : "";
        repeatedAlreadySurfaced =
          summaryId &&
          typeof hasSurfacedSessionSignal === "function" &&
          hasSurfacedSessionSignal("repeatedCoaching", summaryId);
        repeatedSuppressedByBehavioralEvidence = Boolean(
          repeatedSummary &&
            activeBehavioralEvidence &&
            behavioralEvidenceAlreadySurfaced &&
            activeBehavioralEvidence.competency === repeatedSummary.strength,
        );

        if (
          repeatedSummary &&
          summaryId &&
          !repeatedAlreadySurfaced &&
          !repeatedSuppressedByBehavioralEvidence
        ) {
          const updatedBriefing =
            briefingSystem.appendRepeatedSelfAssessment(
              briefing,
              repeatedSummary,
            );

          this.pendingBriefing = updatedBriefing;
          this.pendingRepeatedCoachingSummaryId = summaryId;
          this.session.briefing = updatedBriefing;

          console.log("🧠 E2 coaching appended to briefing:", repeatedSummary);

          return updatedBriefing;
        }
      }

      if (
        typeof missionIntelligenceSystem.identifyCoachingSignal !== "function" ||
        typeof briefingSystem.appendCoachingSignal !== "function"
      ) {
        return briefing;
      }

      const excludeSignalIds =
        repeatedSummary &&
        repeatedAlreadySurfaced &&
        Array.isArray(repeatedSummary.occurrences)
          ? repeatedSummary.occurrences
              .map((occurrence) =>
                occurrence && typeof occurrence.signalId === "string"
                  ? occurrence.signalId
                  : null,
              )
              .filter(Boolean)
          : [];

      if (
        activeBehavioralEvidence &&
        behavioralEvidenceAlreadySurfaced &&
        typeof missionIntelligenceSystem.identifyLinkedCoachingSignalIds ===
          "function"
      ) {
        const linkedSignalIds =
          missionIntelligenceSystem.identifyLinkedCoachingSignalIds(
            container.reports,
            {
              sourceRef: activeBehavioralEvidence.sourceRef,
              competency: activeBehavioralEvidence.competency,
            },
          );

        if (Array.isArray(linkedSignalIds)) {
          for (const linkedSignalId of linkedSignalIds) {
            if (
              typeof linkedSignalId === "string" &&
              !excludeSignalIds.includes(linkedSignalId)
            ) {
              excludeSignalIds.push(linkedSignalId);
            }
          }
        }
      }

      const coachingSignal =
        missionIntelligenceSystem.identifyCoachingSignal(
          container.reports,
          reviewContainer,
          { excludeSignalIds },
        );

      if (!coachingSignal) {
        return briefing;
      }

      const signalId =
        typeof coachingSignal.signalId === "string"
          ? coachingSignal.signalId.trim()
          : "";

      if (
        signalId &&
        typeof hasSurfacedSessionSignal === "function" &&
        hasSurfacedSessionSignal("coaching", signalId)
      ) {
        return briefing;
      }

      const updatedBriefing = briefingSystem.appendCoachingSignal(
        briefing,
        coachingSignal,
      );

      this.pendingBriefing = updatedBriefing;
      this.pendingCoachingSignalId = signalId || null;
      this.session.briefing = updatedBriefing;

      console.log("🧠 E1 coaching appended to briefing:", coachingSignal);

      return updatedBriefing;
    } catch (error) {
      console.warn("⚠️ Coaching signal consumption step failed:", error);
      return briefing;
    }
  },

  // =====================================================
  // COACHING REVIEW LEDGER (v0.1)
  // Orchestrates validation and persistence without changing source evidence.
  // =====================================================

  async reviewCoachingSignal(reviewInput = null) {
    try {
      const memorySystem = this.systems.memory;
      const missionIntelligenceSystem = this.systems.missionIntelligence;

      if (
        !memorySystem ||
        typeof memorySystem.getArtifact !== "function" ||
        typeof memorySystem.saveArtifact !== "function" ||
        !missionIntelligenceSystem ||
        typeof missionIntelligenceSystem.validateCoachingReviewTarget !== "function" ||
        typeof missionIntelligenceSystem.buildCoachingReviewRecord !== "function"
      ) {
        return { success: false, reason: "coaching-review-systems-unavailable" };
      }

      const fieldReportContainer = memorySystem.getArtifact("camping.fieldReports");
      if (
        !fieldReportContainer ||
        !Array.isArray(fieldReportContainer.reports)
      ) {
        return { success: false, reason: "field-reports-unavailable" };
      }

      const existingContainer = memorySystem.getArtifact("camping.coachingReviews");
      const existingReviews =
        existingContainer && Array.isArray(existingContainer.reviews)
          ? existingContainer.reviews
          : [];
      const validatedTarget =
        missionIntelligenceSystem.validateCoachingReviewTarget(
          fieldReportContainer.reports,
          reviewInput,
        );
      if (!validatedTarget || validatedTarget.valid !== true) {
        return {
          success: false,
          reason:
            validatedTarget && validatedTarget.reason
              ? validatedTarget.reason
              : "invalid-coaching-review-target",
        };
      }

      const built = missionIntelligenceSystem.buildCoachingReviewRecord(
        validatedTarget,
        reviewInput,
        existingReviews,
      );
      if (!built || built.valid !== true) {
        return {
          success: false,
          reason: built && built.reason ? built.reason : "invalid-coaching-review",
        };
      }

      if (built.changed === false) {
        return { success: true, changed: false, review: built.review };
      }

      const now = new Date().toISOString();
      const updatedContainer = {
        type: "camping.coachingReviews",
        schemaVersion: "COACHING_REVIEW_SCHEMA_v1",
        reviews: existingReviews
          .map((review) => JSON.parse(JSON.stringify(review)))
          .concat([JSON.parse(JSON.stringify(built.review))]),
        createdAt:
          existingContainer && typeof existingContainer.createdAt === "string"
            ? existingContainer.createdAt
            : now,
        updatedAt: now,
      };

      const saved = memorySystem.saveArtifact(updatedContainer);
      if (!saved) {
        return { success: false, reason: "coaching-review-persistence-failed" };
      }

      return {
        success: true,
        changed: true,
        review: JSON.parse(JSON.stringify(built.review)),
        container: saved,
      };
    } catch (error) {
      return { success: false, reason: "coaching-review-persistence-failed" };
    }
  },

  // =====================================================
  // BEHAVIORAL EVIDENCE REVIEW LEDGER (E3, v0.1)
  // Persists review history without changing Field Reports or evidence.
  // =====================================================

  async reviewBehavioralEvidence(reviewInput = null) {
    try {
      const memorySystem = this.systems.memory;
      const missionIntelligenceSystem = this.systems.missionIntelligence;
      if (
        !memorySystem ||
        typeof memorySystem.getArtifact !== "function" ||
        typeof memorySystem.saveArtifact !== "function" ||
        !missionIntelligenceSystem ||
        typeof missionIntelligenceSystem.validateBehavioralEvidenceReviewTarget !==
          "function" ||
        typeof missionIntelligenceSystem.buildBehavioralEvidenceReviewRecord !==
          "function"
      ) {
        return {
          success: false,
          reason: "behavioral-evidence-review-systems-unavailable",
        };
      }

      const fieldReportContainer = memorySystem.getArtifact(
        "camping.fieldReports",
      );
      if (
        !fieldReportContainer ||
        !Array.isArray(fieldReportContainer.reports)
      ) {
        return { success: false, reason: "field-reports-unavailable" };
      }

      const existingContainer = memorySystem.getArtifact(
        "camping.behavioralEvidenceReviews",
      );
      const existingReviews =
        existingContainer && Array.isArray(existingContainer.reviews)
          ? existingContainer.reviews
          : [];
      const validatedTarget =
        missionIntelligenceSystem.validateBehavioralEvidenceReviewTarget(
          fieldReportContainer.reports,
          reviewInput,
        );
      if (!validatedTarget || validatedTarget.valid !== true) {
        return {
          success: false,
          reason:
            validatedTarget && validatedTarget.reason
              ? validatedTarget.reason
              : "invalid-behavioral-evidence-review-target",
        };
      }

      const built =
        missionIntelligenceSystem.buildBehavioralEvidenceReviewRecord(
          validatedTarget,
          reviewInput,
          existingReviews,
        );
      if (!built || built.valid !== true) {
        return {
          success: false,
          reason:
            built && built.reason
              ? built.reason
              : "invalid-behavioral-evidence-review",
        };
      }
      if (built.changed === false) {
        return { success: true, changed: false, review: built.review };
      }

      const now = new Date().toISOString();
      const updatedContainer = {
        type: "camping.behavioralEvidenceReviews",
        schemaVersion: "BEHAVIORAL_EVIDENCE_REVIEW_SCHEMA_v1",
        reviews: existingReviews
          .map((review) => JSON.parse(JSON.stringify(review)))
          .concat([JSON.parse(JSON.stringify(built.review))]),
        createdAt:
          existingContainer && typeof existingContainer.createdAt === "string"
            ? existingContainer.createdAt
            : now,
        updatedAt: now,
      };
      const saved = memorySystem.saveArtifact(updatedContainer);
      if (!saved) {
        return {
          success: false,
          reason: "behavioral-evidence-review-persistence-failed",
        };
      }
      return {
        success: true,
        changed: true,
        review: JSON.parse(JSON.stringify(built.review)),
        container: saved,
      };
    } catch (error) {
      return {
        success: false,
        reason: "behavioral-evidence-review-persistence-failed",
      };
    }
  },

  // =====================================================
  // BEHAVIORAL PATTERN REVIEW LEDGER (E4, v0.1)
  // Persists exact-version interpretation reviews only.
  // =====================================================

  async reviewBehavioralPattern(reviewInput = null) {
    try {
      const memorySystem = this.systems.memory;
      const missionIntelligenceSystem = this.systems.missionIntelligence;
      if (
        !memorySystem ||
        typeof memorySystem.getArtifact !== "function" ||
        typeof memorySystem.saveArtifact !== "function" ||
        !missionIntelligenceSystem ||
        typeof missionIntelligenceSystem.validateBehavioralPatternReviewTarget !==
          "function" ||
        typeof missionIntelligenceSystem.buildBehavioralPatternReviewRecord !==
          "function"
      ) {
        return {
          success: false,
          reason: "behavioral-pattern-review-systems-unavailable",
        };
      }
      const fieldReportContainer = memorySystem.getArtifact(
        "camping.fieldReports",
      );
      if (
        !fieldReportContainer ||
        !Array.isArray(fieldReportContainer.reports)
      ) {
        return { success: false, reason: "field-reports-unavailable" };
      }
      const evidenceReviewContainer = memorySystem.getArtifact(
        "camping.behavioralEvidenceReviews",
      );
      const existingContainer = memorySystem.getArtifact(
        "camping.behavioralPatternReviews",
      );
      const existingReviews =
        existingContainer && Array.isArray(existingContainer.reviews)
          ? existingContainer.reviews
          : [];
      const validatedTarget =
        missionIntelligenceSystem.validateBehavioralPatternReviewTarget(
          fieldReportContainer.reports,
          evidenceReviewContainer,
          reviewInput,
        );
      if (!validatedTarget || validatedTarget.valid !== true) {
        return {
          success: false,
          reason:
            validatedTarget && validatedTarget.reason
              ? validatedTarget.reason
              : "invalid-behavioral-pattern-review-target",
        };
      }
      const built =
        missionIntelligenceSystem.buildBehavioralPatternReviewRecord(
          validatedTarget,
          reviewInput,
          existingReviews,
        );
      if (!built || built.valid !== true) {
        return {
          success: false,
          reason:
            built && built.reason
              ? built.reason
              : "invalid-behavioral-pattern-review",
        };
      }
      if (built.changed === false) {
        return { success: true, changed: false, review: built.review };
      }
      const now = new Date().toISOString();
      const updatedContainer = {
        type: "camping.behavioralPatternReviews",
        schemaVersion: "BEHAVIORAL_PATTERN_REVIEW_SCHEMA_v1",
        reviews: existingReviews
          .map((review) => JSON.parse(JSON.stringify(review)))
          .concat([JSON.parse(JSON.stringify(built.review))]),
        createdAt:
          existingContainer && typeof existingContainer.createdAt === "string"
            ? existingContainer.createdAt
            : now,
        updatedAt: now,
      };
      const saved = memorySystem.saveArtifact(updatedContainer);
      if (!saved) {
        return {
          success: false,
          reason: "behavioral-pattern-review-persistence-failed",
        };
      }
      return {
        success: true,
        changed: true,
        review: JSON.parse(JSON.stringify(built.review)),
        container: saved,
      };
    } catch (error) {
      return {
        success: false,
        reason: "behavioral-pattern-review-persistence-failed",
      };
    }
  },

  // =====================================================
  // PROFILE CAPABILITY DECISION LEDGER (v0.1)
  // Records Commander decisions without changing Commander Profile.
  // =====================================================

  async decideProfileCapabilityCandidate(decisionInput = null) {
    try {
      const memorySystem = this.systems.memory;
      const missionIntelligenceSystem = this.systems.missionIntelligence;
      if (
        !memorySystem ||
        typeof memorySystem.getArtifact !== "function" ||
        typeof memorySystem.saveArtifact !== "function" ||
        !missionIntelligenceSystem ||
        typeof missionIntelligenceSystem.identifyProfileCapabilityCandidates !==
          "function"
      ) {
        return {
          success: false,
          reason: "profile-capability-decision-systems-unavailable",
        };
      }
      if (!decisionInput || typeof decisionInput !== "object") {
        return { success: false, reason: "invalid-profile-capability-decision" };
      }
      const candidateId =
        typeof decisionInput.candidateId === "string"
          ? decisionInput.candidateId.trim()
          : "";
      const candidateVersionIdentity =
        typeof decisionInput.candidateVersionIdentity === "string"
          ? decisionInput.candidateVersionIdentity.trim()
          : "";
      const decision =
        typeof decisionInput.decision === "string"
          ? decisionInput.decision.trim()
          : "";
      const note =
        typeof decisionInput.note === "string" &&
        decisionInput.note.trim().length > 0
          ? decisionInput.note.trim()
          : null;
      if (
        !candidateId ||
        !candidateVersionIdentity ||
        !["adopt", "defer", "reject", "suppress"].includes(decision)
      ) {
        return { success: false, reason: "invalid-profile-capability-decision" };
      }
      const fieldReportContainer = memorySystem.getArtifact(
        "camping.fieldReports",
      );
      if (
        !fieldReportContainer ||
        !Array.isArray(fieldReportContainer.reports)
      ) {
        return { success: false, reason: "field-reports-unavailable" };
      }
      const evidenceReviewContainer = memorySystem.getArtifact(
        "camping.behavioralEvidenceReviews",
      );
      const patternReviewContainer = memorySystem.getArtifact(
        "camping.behavioralPatternReviews",
      );
      const candidates =
        missionIntelligenceSystem.identifyProfileCapabilityCandidates(
          fieldReportContainer.reports,
          evidenceReviewContainer,
          patternReviewContainer,
        );
      const candidate = Array.isArray(candidates)
        ? candidates.find(
            (entry) =>
              entry &&
              entry.candidateId === candidateId &&
              entry.candidateVersionIdentity === candidateVersionIdentity,
          )
        : null;
      if (!candidate) {
        return {
          success: false,
          reason: "profile-capability-candidate-not-current",
        };
      }
      if (
        typeof candidate.competency !== "string" ||
        typeof candidate.label !== "string" ||
        typeof candidate.proposedProfileType !== "string" ||
        typeof candidate.proposedProfileWording !== "string" ||
        typeof candidate.patternId !== "string" ||
        typeof candidate.patternVersionIdentity !== "string" ||
        typeof candidate.patternReviewId !== "string" ||
        !Array.isArray(candidate.contributorActiveIdentities) ||
        candidate.contributorActiveIdentities.some(
          (identity) => typeof identity !== "string" || !identity,
        )
      ) {
        return { success: false, reason: "invalid-profile-capability-candidate" };
      }
      const existingContainer = memorySystem.getArtifact(
        "camping.profileCapabilityDecisions",
      );
      const existingDecisions =
        existingContainer && Array.isArray(existingContainer.decisions)
          ? existingContainer.decisions
          : [];
      const latestExactDecision = existingDecisions.reduce(
        (latest, entry, index) => {
          if (
            !entry ||
            entry.candidateId !== candidateId ||
            entry.candidateVersionIdentity !== candidateVersionIdentity
          ) {
            return latest;
          }
          const decidedAt =
            typeof entry.decidedAt === "string" ? entry.decidedAt : "";
          if (
            !latest ||
            decidedAt > latest.decidedAt ||
            (decidedAt === latest.decidedAt && index > latest.index)
          ) {
            return { entry, decidedAt, index };
          }
          return latest;
        },
        null,
      );
      if (
        latestExactDecision &&
        latestExactDecision.entry.decision === decision &&
        (latestExactDecision.entry.note || null) === note
      ) {
        return {
          success: true,
          changed: false,
          decision: JSON.parse(JSON.stringify(latestExactDecision.entry)),
        };
      }
      const decidedAt = new Date().toISOString();
      const record = {
        id:
          `profile_capability_decision_${Date.now()}_` +
          Math.random().toString(36).slice(2, 10),
        candidateId: candidate.candidateId,
        candidateVersionIdentity: candidate.candidateVersionIdentity,
        competency: candidate.competency,
        label: candidate.label,
        proposedProfileType: candidate.proposedProfileType,
        proposedProfileWording: candidate.proposedProfileWording,
        sourcePatternId: candidate.patternId,
        sourcePatternVersionIdentity: candidate.patternVersionIdentity,
        sourcePatternReviewId: candidate.patternReviewId,
        contributorActiveIdentities:
          candidate.contributorActiveIdentities.slice(),
        decision,
        note,
        decidedAt,
        supersedesDecisionId: latestExactDecision
          ? latestExactDecision.entry.id
          : null,
      };
      const updatedContainer = {
        type: "camping.profileCapabilityDecisions",
        schemaVersion: "PROFILE_CAPABILITY_DECISION_SCHEMA_v1",
        decisions: existingDecisions
          .map((entry) => JSON.parse(JSON.stringify(entry)))
          .concat([JSON.parse(JSON.stringify(record))]),
        createdAt:
          existingContainer && typeof existingContainer.createdAt === "string"
            ? existingContainer.createdAt
            : decidedAt,
        updatedAt: decidedAt,
      };
      const saved = memorySystem.saveArtifact(updatedContainer);
      if (!saved) {
        return {
          success: false,
          reason: "profile-capability-decision-persistence-failed",
        };
      }
      const profileProjection =
        await this.synchronizeAdoptedProfileCapabilities();
      return {
        success: true,
        changed: true,
        decision: JSON.parse(JSON.stringify(record)),
        container: saved,
        profileProjection,
      };
    } catch (error) {
      return {
        success: false,
        reason: "profile-capability-decision-persistence-failed",
      };
    }
  },

  getProfilePersonalizationContext() {
    const commanderSystem = this.systems.commander;
    return commanderSystem &&
      typeof commanderSystem.getProfilePersonalizationContext === "function"
      ? commanderSystem.getProfilePersonalizationContext()
      : [];
  },

  buildProfileCapabilityReflectionPrompt() {
    const reflectionSystem = this.systems.reflection;
    if (
      !reflectionSystem ||
      typeof reflectionSystem.buildProfileCapabilityReflectionPrompt !==
        "function"
    ) {
      return null;
    }

    const capabilityContext = this.getProfilePersonalizationContext();
    const firstCapability = Array.isArray(capabilityContext)
      ? capabilityContext[0]
      : null;
    return reflectionSystem.buildProfileCapabilityReflectionPrompt(
      firstCapability,
    );
  },

  getActionableProfileCapabilityCandidates() {
    try {
      const memorySystem = this.systems.memory;
      const missionIntelligenceSystem = this.systems.missionIntelligence;
      if (
        !memorySystem ||
        typeof memorySystem.getArtifact !== "function" ||
        !missionIntelligenceSystem ||
        typeof missionIntelligenceSystem.identifyProfileCapabilityCandidates !==
          "function"
      ) {
        return [];
      }
      const fieldReportContainer = memorySystem.getArtifact(
        "camping.fieldReports",
      );
      if (
        !fieldReportContainer ||
        !Array.isArray(fieldReportContainer.reports)
      ) {
        return [];
      }
      const candidates =
        missionIntelligenceSystem.identifyProfileCapabilityCandidates(
          fieldReportContainer.reports,
          memorySystem.getArtifact("camping.behavioralEvidenceReviews"),
          memorySystem.getArtifact("camping.behavioralPatternReviews"),
        );
      const decisionContainer = memorySystem.getArtifact(
        "camping.profileCapabilityDecisions",
      );
      const decisions =
        decisionContainer && Array.isArray(decisionContainer.decisions)
          ? decisionContainer.decisions
          : [];
      const suppressedCandidateIds = new Set(
        decisions
          .filter(
            (entry) =>
              entry &&
              entry.decision === "suppress" &&
              typeof entry.candidateId === "string",
          )
          .map((entry) => entry.candidateId),
      );
      return Array.isArray(candidates)
        ? candidates
            .filter((candidate) => {
              if (
                !candidate ||
                suppressedCandidateIds.has(candidate.candidateId)
              ) {
                return false;
              }
              return !decisions.some(
                (entry) =>
                  entry &&
                  ["adopt", "defer", "reject", "suppress"].includes(
                    entry.decision,
                  ) &&
                  entry.candidateId === candidate.candidateId &&
                  entry.candidateVersionIdentity ===
                    candidate.candidateVersionIdentity,
              );
            })
            .map((candidate) => JSON.parse(JSON.stringify(candidate)))
        : [];
    } catch (error) {
      return [];
    }
  },

  // =====================================================
  // ADOPTED PROFILE CAPABILITY PROJECTION (v0.1)
  // Materializes explicit adopt decisions only.
  // =====================================================

  async synchronizeAdoptedProfileCapabilities() {
    try {
      const memorySystem = this.systems.memory;
      const missionIntelligenceSystem = this.systems.missionIntelligence;
      const commanderSystem = this.systems.commander;
      if (
        !memorySystem ||
        typeof memorySystem.getArtifact !== "function" ||
        !missionIntelligenceSystem ||
        typeof missionIntelligenceSystem.identifyProfileCapabilityCandidates !==
          "function" ||
        !commanderSystem ||
        typeof commanderSystem.getProfile !== "function" ||
        typeof commanderSystem.replaceProfileCapabilities !== "function"
      ) {
        return {
          success: false,
          reason: "profile-capability-projection-systems-unavailable",
        };
      }
      const decisionContainer = memorySystem.getArtifact(
        "camping.profileCapabilityDecisions",
      );
      if (!decisionContainer || !Array.isArray(decisionContainer.decisions)) {
        return { success: true, changed: false, capabilities: [] };
      }
      const fieldReportContainer = memorySystem.getArtifact(
        "camping.fieldReports",
      );
      const evidenceReviewContainer = memorySystem.getArtifact(
        "camping.behavioralEvidenceReviews",
      );
      const patternReviewContainer = memorySystem.getArtifact(
        "camping.behavioralPatternReviews",
      );
      const currentCandidates =
        fieldReportContainer && Array.isArray(fieldReportContainer.reports)
          ? missionIntelligenceSystem.identifyProfileCapabilityCandidates(
              fieldReportContainer.reports,
              evidenceReviewContainer,
              patternReviewContainer,
            )
          : [];
      const latestIdentityDecisionsByCompetency = new Map();
      decisionContainer.decisions.forEach((entry, index) => {
        if (
          !entry ||
          !["adopt", "withdraw"].includes(entry.decision) ||
          typeof entry.competency !== "string" ||
          !entry.competency
        ) {
          return;
        }
        const decidedAt =
          typeof entry.decidedAt === "string" ? entry.decidedAt : "";
        const latest = latestIdentityDecisionsByCompetency.get(
          entry.competency,
        );
        if (
          !latest ||
          decidedAt > latest.decidedAt ||
          (decidedAt === latest.decidedAt && index > latest.index)
        ) {
          latestIdentityDecisionsByCompetency.set(entry.competency, {
            entry,
            decidedAt,
            index,
          });
        }
      });
      const projectedCapabilities = [];
      for (const [competency, latest] of latestIdentityDecisionsByCompetency) {
        const decision = latest.entry;
        const currentCandidate = Array.isArray(currentCandidates)
          ? currentCandidates.find(
              (candidate) =>
                candidate && candidate.competency === competency,
            )
          : null;
        const evidenceSupportState = !currentCandidate
          ? "insufficient-current-support"
          : currentCandidate.candidateVersionIdentity ===
              decision.candidateVersionIdentity
            ? "current"
            : "support-changed";
        projectedCapabilities.push({
          id: `profile_capability_${competency}`,
          type: "developing-capability",
          competency,
          label: decision.label,
          status: decision.decision === "withdraw" ? "withdrawn" : "active",
          adoptedAt:
            decision.decision === "withdraw"
              ? decision.adoptedAt
              : decision.decidedAt,
          withdrawnAt:
            decision.decision === "withdraw" ? decision.decidedAt : null,
          adoptedBy: "commander",
          adoptedWording: decision.proposedProfileWording,
          evidenceSupportState,
          provenance: {
            candidateId: decision.candidateId,
            candidateVersionIdentity: decision.candidateVersionIdentity,
            patternId: decision.sourcePatternId,
            patternVersionIdentity: decision.sourcePatternVersionIdentity,
            patternReviewId: decision.sourcePatternReviewId,
            contributorActiveIdentities: Array.isArray(
              decision.contributorActiveIdentities,
            )
              ? decision.contributorActiveIdentities.slice()
              : null,
            decisionId:
              decision.decision === "withdraw"
                ? decision.originalAdoptionDecisionId
                : decision.id,
          },
        });
      }
      const profile = commanderSystem.getProfile();
      const existingCapabilities =
        profile && Array.isArray(profile.capabilities)
          ? profile.capabilities
          : [];
      const adoptedCompetencies = new Set(
        projectedCapabilities.map((capability) => capability.competency),
      );
      const preservedCapabilities = existingCapabilities
        .filter(
          (capability) =>
            !capability || !adoptedCompetencies.has(capability.competency),
        )
        .map((capability) => JSON.parse(JSON.stringify(capability)));
      return commanderSystem.replaceProfileCapabilities(
        projectedCapabilities.concat(preservedCapabilities),
      );
    } catch (error) {
      return {
        success: false,
        reason: "profile-capability-projection-failed",
      };
    }
  },

  // =====================================================
  // COMMANDER PROFILE CAPABILITY WITHDRAWAL (v0.1)
  // Explicit identity withdrawal with append-only history.
  // =====================================================

  async withdrawProfileCapability(withdrawalInput = null) {
    try {
      const memorySystem = this.systems.memory;
      const commanderSystem = this.systems.commander;
      if (
        !memorySystem ||
        typeof memorySystem.getArtifact !== "function" ||
        typeof memorySystem.saveArtifact !== "function" ||
        !commanderSystem ||
        typeof commanderSystem.getProfile !== "function" ||
        typeof commanderSystem.validateProfileCapability !== "function"
      ) {
        return {
          success: false,
          reason: "profile-capability-withdrawal-systems-unavailable",
        };
      }
      if (!withdrawalInput || typeof withdrawalInput !== "object") {
        return { success: false, reason: "invalid-profile-capability-withdrawal" };
      }
      const capabilityId =
        typeof withdrawalInput.capabilityId === "string"
          ? withdrawalInput.capabilityId.trim()
          : "";
      const note =
        typeof withdrawalInput.note === "string" &&
        withdrawalInput.note.trim().length > 0
          ? withdrawalInput.note.trim()
          : null;
      if (!capabilityId) {
        return { success: false, reason: "invalid-profile-capability-withdrawal" };
      }
      const profile = commanderSystem.getProfile();
      const capability =
        profile && Array.isArray(profile.capabilities)
          ? profile.capabilities.find(
              (entry) => entry && entry.id === capabilityId,
            )
          : null;
      if (!capability) {
        return { success: false, reason: "profile-capability-not-found" };
      }
      if (capability.status === "withdrawn") {
        return {
          success: true,
          changed: false,
          capability: JSON.parse(JSON.stringify(capability)),
        };
      }
      if (capability.status !== "active") {
        return { success: false, reason: "profile-capability-not-active" };
      }
      const validated = commanderSystem.validateProfileCapability(capability);
      if (!validated || validated.valid !== true) {
        return {
          success: false,
          reason:
            validated && validated.reason
              ? validated.reason
              : "invalid-profile-capability",
        };
      }
      const decisionContainer = memorySystem.getArtifact(
        "camping.profileCapabilityDecisions",
      );
      if (!decisionContainer || !Array.isArray(decisionContainer.decisions)) {
        return {
          success: false,
          reason: "profile-capability-decision-history-unavailable",
        };
      }
      const existingDecisions = decisionContainer.decisions;
      const latestExactDecision = existingDecisions.reduce(
        (latest, entry, index) => {
          if (
            !entry ||
            entry.candidateId !== capability.provenance.candidateId ||
            entry.candidateVersionIdentity !==
              capability.provenance.candidateVersionIdentity
          ) {
            return latest;
          }
          const decidedAt =
            typeof entry.decidedAt === "string" ? entry.decidedAt : "";
          if (
            !latest ||
            decidedAt > latest.decidedAt ||
            (decidedAt === latest.decidedAt && index > latest.index)
          ) {
            return { entry, decidedAt, index };
          }
          return latest;
        },
        null,
      );
      const decidedAt = new Date().toISOString();
      const record = {
        id:
          `profile_capability_decision_${Date.now()}_` +
          Math.random().toString(36).slice(2, 10),
        capabilityId: capability.id,
        candidateId: capability.provenance.candidateId,
        candidateVersionIdentity:
          capability.provenance.candidateVersionIdentity,
        competency: capability.competency,
        label: capability.label,
        proposedProfileType: capability.type,
        proposedProfileWording: capability.adoptedWording,
        sourcePatternId: capability.provenance.patternId,
        sourcePatternVersionIdentity:
          capability.provenance.patternVersionIdentity,
        sourcePatternReviewId: capability.provenance.patternReviewId,
        contributorActiveIdentities:
          capability.provenance.contributorActiveIdentities.slice(),
        originalAdoptionDecisionId: capability.provenance.decisionId,
        adoptedAt: capability.adoptedAt,
        evidenceSupportState: capability.evidenceSupportState,
        decision: "withdraw",
        note,
        decidedAt,
        supersedesDecisionId: latestExactDecision
          ? latestExactDecision.entry.id
          : null,
      };
      const previousContainer = JSON.parse(JSON.stringify(decisionContainer));
      const updatedContainer = {
        type: "camping.profileCapabilityDecisions",
        schemaVersion: "PROFILE_CAPABILITY_DECISION_SCHEMA_v1",
        decisions: existingDecisions
          .map((entry) => JSON.parse(JSON.stringify(entry)))
          .concat([JSON.parse(JSON.stringify(record))]),
        createdAt:
          typeof decisionContainer.createdAt === "string"
            ? decisionContainer.createdAt
            : decidedAt,
        updatedAt: decidedAt,
      };
      const saved = memorySystem.saveArtifact(updatedContainer);
      if (!saved) {
        return {
          success: false,
          reason: "profile-capability-withdrawal-decision-save-failed",
        };
      }
      const profileProjection =
        await this.synchronizeAdoptedProfileCapabilities();
      if (!profileProjection || profileProjection.success !== true) {
        const rolledBack = memorySystem.saveArtifact(previousContainer);
        return {
          success: false,
          reason: rolledBack
            ? "profile-capability-withdrawal-profile-save-failed"
            : "profile-capability-withdrawal-rollback-failed",
        };
      }
      const withdrawnCapability = Array.isArray(profileProjection.capabilities)
        ? profileProjection.capabilities.find(
            (entry) => entry && entry.id === capabilityId,
          )
        : null;
      return {
        success: true,
        changed: true,
        decision: JSON.parse(JSON.stringify(record)),
        capability: withdrawnCapability
          ? JSON.parse(JSON.stringify(withdrawnCapability))
          : null,
      };
    } catch (error) {
      return {
        success: false,
        reason: "profile-capability-withdrawal-failed",
      };
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
    const learningSignalId =
      briefing === this.pendingBriefing ? this.pendingLearningSignalId : null;
    const coachingSignalId =
      briefing === this.pendingBriefing ? this.pendingCoachingSignalId : null;
    const repeatedCoachingSummaryId =
      briefing === this.pendingBriefing
        ? this.pendingRepeatedCoachingSummaryId
        : null;
    const behavioralEvidenceIdentity =
      briefing === this.pendingBriefing
        ? this.pendingBehavioralEvidenceIdentity
        : null;

    if (communication && typeof communication.send === "function") {
      const transmission = {
        text: briefing.text,
        target: "dashboard",
      };

      if (typeof communication.sendWithReceipt === "function") {
        const delivered = await communication.sendWithReceipt(transmission);

        if (
          delivered &&
          behavioralEvidenceIdentity &&
          typeof markSessionSignalSurfaced === "function"
        ) {
          const markerRecorded = markSessionSignalSurfaced(
            "behavioralEvidence",
            behavioralEvidenceIdentity,
          );
          this.pendingBehavioralEvidenceIdentity = null;
          if (markerRecorded) {
            console.log(
              "🧠 E3 behavioral evidence delivered and session marker recorded:",
              behavioralEvidenceIdentity,
            );
          }
        }

        if (
          delivered &&
          learningSignalId &&
          typeof markSessionSignalSurfaced === "function"
        ) {
          markSessionSignalSurfaced("learning", learningSignalId);
          this.pendingLearningSignalId = null;
        }

        if (
          delivered &&
          coachingSignalId &&
          typeof markSessionSignalSurfaced === "function"
        ) {
          markSessionSignalSurfaced("coaching", coachingSignalId);
          this.pendingCoachingSignalId = null;
        }

        if (
          delivered &&
          repeatedCoachingSummaryId &&
          typeof markSessionSignalSurfaced === "function"
        ) {
          const markerRecorded = markSessionSignalSurfaced(
            "repeatedCoaching",
            repeatedCoachingSummaryId,
          );
          this.pendingRepeatedCoachingSummaryId = null;
          if (markerRecorded) {
            console.log(
              "🧠 E2 coaching delivered and session marker recorded:",
              repeatedCoachingSummaryId,
            );
          }
        }

        return delivered;
      }

      // Legacy send() only confirms queue acceptance, so it must never
      // create a learning-signal delivery marker.
      return communication.send(transmission);
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
