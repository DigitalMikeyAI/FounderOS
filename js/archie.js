// =====================================================
//
//               ARCHIE CORE v0.2
//
//        FounderOS Communication Engine
//
//        Responsibilities
//        • Daily Briefings
//        • Mission Intelligence
//        • Commander Communication
//        • Memory
//        • Status
//        • Queue
//        • Routing
//
// =====================================================

const Archie = {
  name: "Archie",

  personality: {
    commanderTitle: "Commander",

    name: "Archie",

    tone: "professional",

    signature: true,

    mood: "focused",
  },

  queue: [],

  isSpeaking: false,

  status: "ready",

  typingSpeed: 45,

  cursorCharacter: "▋",

  targets: {
    notificationMessage: null,
    briefing: null,
    dashboardGreeting: null,
    dashboardBrief: null,
    heroGreeting: null,
    heroBrief: null,
    statusLight: null,
    statusText: null,
  },

  // Pause flag and pending actions while popup blocks interaction
  paused: false,
  pendingActions: [],

  // When true, hero greetings/briefs should not be re-queued
  heroInitialized: false,

  getCommanderTitle() {
    return this.personality.commanderTitle;
  },

  // =====================================================
  // INITIALIZATION
  // Connect Archie to available interface elements
  // =====================================================

  init() {
    // Prefer CommunicationSystem as the single source of DOM target
    // references so Archie and CommunicationSystem always point at the
    // exact same elements. Falls back to Archie's own lookups if
    // CommunicationSystem is unavailable.
    if (
      typeof CommunicationSystem !== "undefined" &&
      typeof CommunicationSystem.registerTargets === "function"
    ) {
      this.targets = CommunicationSystem.registerTargets();
    } else {
      this.targets.notificationMessage = document.getElementById(
        "notification-message",
      );

      this.targets.briefing = document.getElementById("archie-message");

      this.targets.dashboardGreeting =
        document.getElementById("archie-greeting");

      this.targets.dashboardBrief =
        document.getElementById("archie-daily-brief");

      this.targets.heroGreeting = document.getElementById("greeting");

      this.targets.heroBrief = document.querySelector(".hero-sub");

      this.targets.statusLight = document.getElementById("archie-status-light");

      this.targets.statusText = document.getElementById("archie-status-text");
    }

    this.setStatus("ready");

    console.log("🤖 Archie communication engine initialized.");
  },

  // =====================================================
  // PUBLIC COMMUNICATION API
  // =====================================================

  async beginDailyBriefing() {
    this.setStatus("🟡 Analyzing Commander status...");
    await this.wait(600);

    this.setStatus("🟡 Reviewing mission queue...");
    await this.wait(600);

    this.setStatus("🟡 Building daily briefing...");
    await this.wait(600);

    const briefing = this.buildDailyBriefing();

    this.setStatus("🟢 Briefing complete.");
    await this.wait(2000);

    this.setStatus("🟢 Systems Online.");

    this.say({
      text: briefing,
      target: "dashboard",
    });
  },

  buildDailyBriefing() {
    const briefing = [];

    briefing.push(this.buildGreeting());

    briefing.push(this.getSystemStatus());

    briefing.push(this.getMissionIntroduction());

    return briefing.join(" ");
  },

  buildGreeting() {
    const hour = new Date().getHours();

    let greeting;

    if (hour < 12) {
      greeting = "Good morning";
    } else if (hour < 18) {
      greeting = "Good afternoon";
    } else {
      greeting = "Good evening";
    }

    return `${greeting}, ${this.getCommanderTitle()}.`;
  },

  getSystemStatus() {
    return "Mission Control is fully operational.";
  },

  getMissionIntroduction() {
    return "Today's briefing is ready.";
  },

  say(message, options = {}) {
    let transmission;

    if (typeof message === "string") {
      transmission = {
        text: message,
        target: options.target || "notification",
        delay: options.delay || 0,
      };
    } else {
      transmission = {
        text: message.text || "",
        target: message.target || "notification",
        delay: message.delay || 0,
      };
    }

    if (!transmission.text.trim()) {
      return;
    }

    // Ignore duplicate hero-targeted messages once the hero has been initialized.
    // Allow forcing by passing `force: true` on the transmission (transmission.force).
    if (
      (transmission.target === "hero-greeting" ||
        transmission.target === "hero-brief") &&
      this.heroInitialized &&
      !transmission.force
    ) {
      return;
    }

    // Guarded migration: CommunicationSystem is the authoritative queue/lifecycle owner (ADR-003).
    // Prefer delegation when available; legacy Archie queue remains as compatibility fallback only.
    if (
      typeof CommunicationSystem !== "undefined" &&
      typeof CommunicationSystem.send === "function"
    ) {
      const delegated = CommunicationSystem.send(transmission);

      if (delegated) {
        return true;
      }

      // Fall through to legacy queue if delegation was rejected (e.g., invalid transmission)
    }

    this.queue.push(transmission);

    this.processQueue();

    return true;
  },

  // Backward compatibility:
  // Existing Archie.speak() calls continue working.
  speak(message) {
    this.say(message, {
      target: "notification",
    });
  },

  // =====================================================
  // MISSION WORKSPACE PROJECTION HELPERS (v0.1)
  // Read-only projection of authoritative session state.
  // Defensive: never mutates state or persists data.
  // =====================================================

  getMissionWorkspaceProjection() {
    try {
      const session =
        typeof ArchieCore !== "undefined" && ArchieCore.session
          ? ArchieCore.session
          : {};

      const vision =
        session?.vision ||
        (session?.decision &&
          session.decision.context &&
          session.decision.context.vision) ||
        null;

      const missionPlan = session?.recommendation?.missionPlan || null;

      const currentStage =
        missionPlan?.currentStage || session?.mission?.stage || null;

      const currentMilestone =
        missionPlan?.currentMilestone ||
        (session?.guidance &&
          Array.isArray(session.guidance.steps) &&
          session.guidance.steps[0]) ||
        null;

      const recommendedMission =
        missionPlan?.recommendedMission || session?.mission?.title || null;

      const whyThisMission =
        missionPlan?.whyThisMission ||
        session?.recommendation?.whyItMatters ||
        null;

      const nextAction =
        session?.guidance?.steps && session.guidance.steps.length > 0
          ? session.guidance.steps[0]
          : null;

      return {
        vision,
        currentStage,
        currentMilestone,
        recommendedMission,
        whyThisMission,
        nextAction,
      };
    } catch (e) {
      return null;
    }
  },

  // =====================================================
  // MESSAGE QUEUE — FALLBACK ONLY (ADR-003)
  // CommunicationSystem is now the authoritative queue/lifecycle owner.
  // This path remains only for compatibility when CommunicationSystem
  // is unavailable (guarded fallback). Preserved as-is, not removed.
  // =====================================================

  async processQueue() {
    // Do not proceed while paused by a blocking popup
    if (this.paused) return;

    if (this.isSpeaking || this.queue.length === 0) {
      return;
    }

    this.isSpeaking = true;

    const transmission = this.queue.shift();

    if (transmission.delay > 0) {
      await this.wait(transmission.delay);
    }

    this.setStatus("thinking");

    // shorten the pre-delivery pause so messages appear promptly on load
    await this.wait(120);

    try {
      this.triggerHoloOn();
    } catch (e) {
      // silent
    }

    await this.deliver(transmission);

    // Notifications currently remain visible for 4.5 seconds.
    // Dashboard and briefing messages can continue more quickly.
    const transmissionDuration =
      transmission.target === "notification" ? 4700 : 1200;

    await this.wait(transmissionDuration);

    this.setStatus("ready");

    // Turn off holo after transmission completes
    try {
      this.triggerHoloOff();
      this.triggerSpeechOff();
    } catch (e) {
      // silent
    }

    this.isSpeaking = false;

    this.processQueue();
  },

  // =====================================================
  // HOLOGRAPHIC POP HELPERS
  // Adds/removes `holo-active` on the Archie column
  // Respect reduced-motion preferences and existing class toggles
  // =====================================================
  triggerHoloOn() {
    try {
      if (typeof window !== "undefined") {
        const prefersReduced =
          window.matchMedia &&
          window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        if (prefersReduced) return;
      }

      const el = document.querySelector(".archie-core");
      if (!el) return;
      // keep holo-active for aura/fx but also animate only the avatar
      el.classList.add("holo-active");
      const avatar = el.querySelector(".archie-avatar");
      if (avatar) {
        avatar.classList.add("pop-active");
      }
    } catch (e) {
      // ignore
    }
  },

  triggerHoloOff() {
    try {
      const el = document.querySelector(".archie-core");
      if (!el) return;
      el.classList.remove("holo-active");
      const avatar = el.querySelector(".archie-avatar");
      if (avatar) {
        avatar.classList.remove("pop-active");
      }
    } catch (e) {
      // ignore
    }
  },

  // Typing pulse helpers
  triggerHoloTypingOn() {
    try {
      if (typeof window !== "undefined") {
        const prefersReduced =
          window.matchMedia &&
          window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        if (prefersReduced) return;
      }

      const el = document.querySelector(".archie-core");
      if (!el) return;
      el.classList.add("typing");
    } catch (e) {
      // ignore
    }
  },

  triggerHoloTypingOff() {
    try {
      const el = document.querySelector(".archie-core");
      if (!el) return;
      el.classList.remove("typing");
    } catch (e) {
      // ignore
    }
  },

  triggerSpeechOn() {
    try {
      document.body.classList.add("archie-speaking");
    } catch (e) {
      // ignore
    }
  },

  triggerSpeechOff() {
    try {
      document.body.classList.remove("archie-speaking");
    } catch (e) {
      // ignore
    }
  },

  // =====================================================
  // MESSAGE ROUTING
  // Determines where Archie communicates
  // =====================================================

  async deliver(transmission) {
    const { text, target } = transmission;

    if (target === "briefing") {
      this.setStatus("briefing");

      await this.typeMessage(this.targets.briefing, text);

      return;
    }

    if (target === "dashboard-greeting") {
      this.setStatus("briefing");

      await this.typeMessage(this.targets.dashboardGreeting, text);

      return;
    }

    if (target === "hero-greeting") {
      // Note: hero-greeting/hero-brief intentionally do not call
      // setStatus() here. Historically these targets were only ever
      // reached via a direct Archie.typeMessage() call (bypassing
      // deliver() entirely), so the status indicator was never touched
      // for hero delivery. Now that hero delivery can also arrive here
      // via CommunicationSystem.send(), we preserve that original
      // no-status-change behavior exactly.
      await this.typeMessage(this.targets.heroGreeting, text);

      return;
    }

    if (target === "hero-brief") {
      await this.typeMessage(this.targets.heroBrief, text);

      return;
    }

    if (target === "dashboard") {
      this.setStatus("briefing");

      await this.typeMessage(this.targets.dashboardBrief, text);

      return;
    }

    if (target === "notification-message") {
      // Mirrors the hero-greeting/hero-brief precedent from Phase 3B-1:
      // this target never called setStatus() when reached via the
      // direct Archie.typeMessage() call in showNotification(), so we
      // preserve that here. `force` is forwarded so typing still
      // occurs while Archie.paused === true (popup is open).
      await this.typeMessage(this.targets.notificationMessage, text, {
        force: transmission.force,
      });

      return;
    }

    // Keep notifications instant for now.
    showNotification(text);
  },

  // =====================================================
  // COMMUNICATION LIFECYCLE CONTRACT
  // Boundary-preserving hook for CommunicationSystem (ADR-003).
  // CommunicationSystem owns queue/order/pause/busy/delivery.
  // Archie owns presentation-state transitions (status/holo/speech).
  // Called by CommunicationSystem.processQueue() after deliver().
  // =====================================================

  async onCommunicationDeliveryComplete(transmission) {
    const target = transmission?.target || "";

    // Hero and notification-message intentionally preserve no-status-change
    // (historical direct typeMessage bypassed deliver entirely).
    if (
      target === "hero-greeting" ||
      target === "hero-brief" ||
      target === "notification-message"
    ) {
      return;
    }

    // Briefing-family deliveries set status to BRIEFING inside deliver()
    // and must return to READY after the same cadence as Archie's legacy
    // queue (1200ms post-delivery). This restores the missing reset that
    // was bypassed when queue ownership moved to CommunicationSystem.
    if (
      target === "briefing" ||
      target === "dashboard" ||
      target === "dashboard-greeting"
    ) {
      await this.wait(1200);

      this.setStatus("ready");

      try {
        this.triggerHoloOff();
        this.triggerSpeechOff();
      } catch (e) {
        // silent
      }

      return;
    }

    // notification (popup) is user-dismissed; no auto status transition here.
    // Other targets: ensure briefing does not remain stuck if Archie is in that state.
    if (this.status === "briefing") {
      await this.wait(1200);
      this.setStatus("ready");
      try {
        this.triggerHoloOff();
        this.triggerSpeechOff();
      } catch (e) {
        // silent
      }
    }
  },

  // =====================================================
  // ARCHIE OPERATIONAL STATUS
  // =====================================================

  setStatus(status) {
    const statuses = {
      ready: {
        label: "READY",
        light: "🟢",
      },

      thinking: {
        label: "THINKING",
        light: "🟡",
      },

      analyzing: {
        label: "ANALYZING",
        light: "🔵",
      },

      briefing: {
        label: "BRIEFING",
        light: "🟣",
      },

      offline: {
        label: "OFFLINE",
        light: "⚪",
      },
    };

    const selectedStatus = statuses[status] || statuses.ready;

    this.status = statuses[status] ? status : "ready";

    document.body.dataset.archieStatus = this.status;

    if (this.targets.statusLight) {
      this.targets.statusLight.textContent = selectedStatus.light;
    }

    if (this.targets.statusText) {
      this.targets.statusText.textContent = selectedStatus.label;
    }
  },

  // =====================================================
  // TIMING UTILITY
  // =====================================================
  async typeMessage(element, text) {
    if (!element) {
      return;
    }

    // If Archie is paused (popup active) defer the typing until resume,
    // unless caller explicitly forces typing via options.force.
    const options = arguments[2] || {};
    if (this.paused && !options.force) {
      this.pendingActions.push({ type: "typeMessage", element, text });
      return;
    }

    element.textContent = "";

    // Start typing pulse (orb) if available and motion not reduced
    try {
      this.triggerHoloTypingOn();
    } catch (e) {
      // ignore
    }

    for (let index = 0; index < text.length; index += 1) {
      const visibleText = text.slice(0, index + 1);

      element.textContent = visibleText + this.cursorCharacter;

      await this.wait(this.typingSpeed);
    }

    await this.wait(250);

    element.textContent = text;

    // Stop typing pulse
    try {
      this.triggerHoloTypingOff();
    } catch (e) {
      // ignore
    }
  },

  // Resume Archie after a blocking popup is dismissed. Flush pending actions
  // sequentially and then continue processing the fallback queue.
  // When CommunicationSystem is present, js/notifications.js resumes both;
  // this remain fallback-only when CommunicationSystem is unavailable.
  async resume() {
    if (!this.paused) return;
    this.paused = false;

    // Flush pending typing actions in order
    while (this.pendingActions.length > 0) {
      const act = this.pendingActions.shift();
      if (act.type === "typeMessage") {
        try {
          // force typing even if pause flags change
          // eslint-disable-next-line no-await-in-loop
          await this.typeMessage(act.element, act.text, { force: true });
        } catch (e) {
          // ignore individual failures
        }
      }
    }

    // Continue any queued transmissions
    this.processQueue();
  },

  wait(milliseconds) {
    return new Promise((resolve) => {
      setTimeout(resolve, milliseconds);
    });
  },

  // =====================================================
  // FOUNDER RANK RESPONSE
  // =====================================================

  getRankMessage() {
    if (founder.level === 1) {
      return "Welcome, Explorer. Every great mission begins with a first step.";
    }

    if (founder.level === 2) {
      return "Welcome back, Apprentice. Your skills are starting to take shape.";
    }

    if (founder.level === 3) {
      return "Welcome back, Builder. You're no longer just learning — you're creating.";
    }

    if (founder.level === 4) {
      return "Welcome back, Founder. Your mission is becoming something real.";
    }

    return "Welcome back, Architect. It's time to design bigger systems.";
  },
};

// =====================================================
// ARCHIE PERSONALITY ENGINE
// Dynamic Greeting + Daily Mission Brief
// =====================================================

// =====================================================
// ARCHIE COMMAND LOG NOTES
// =====================================================

function getArchieGreeting() {
  if (
    typeof PersonalitySystem !== "undefined" &&
    typeof PersonalitySystem.getArchieGreeting === "function"
  ) {
    return PersonalitySystem.getArchieGreeting();
  }

  const currentHour = new Date().getHours();
  const founderName = founder.name || "Explorer";

  if (currentHour >= 5 && currentHour < 12) {
    return `☀️ Good morning, ${founderName}.`;
  }

  if (currentHour >= 12 && currentHour < 17) {
    return `🚀 Good afternoon, ${founderName}.`;
  }

  if (currentHour >= 17 && currentHour < 22) {
    return `🌙 Good evening, ${founderName}.`;
  }

  return `🌌 Burning the midnight fuel, ${founderName}?`;
}

function generateArchieLogNote() {
  if (
    typeof PersonalitySystem !== "undefined" &&
    typeof PersonalitySystem.generateArchieLogNote === "function"
  ) {
    return PersonalitySystem.generateArchieLogNote();
  }

  const streak = founder.streak;

  if (streak === 1) {
    return "Excellent beginning. Every founder starts with a single completed mission.";
  }

  if (streak < 5) {
    return "Momentum is building. Stay consistent.";
  }

  if (streak < 10) {
    return "Consistency is becoming a habit. Keep going.";
  }

  if (streak < 30) {
    return "Your discipline is becoming one of your greatest strengths.";
  }

  return "Outstanding commitment. Mission Control recognizes your consistency.";
}

// =====================================================
// FOUNDEROS MISSION ARCHIVE DISPLAY
// =====================================================

function updateCommandLog() {
  const commandLog = document.getElementById("command-log");

  if (!commandLog) {
    return;
  }

  commandLog.innerHTML = "";

  if (!Array.isArray(founder.commandLog)) {
    founder.commandLog = [];
  }

  if (founder.commandLog.length === 0) {
    commandLog.innerHTML = `
      <div class="command-log-empty">
        <span class="empty-log-icon">🛰️</span>

        <div>
          <strong>Mission Control Initialized</strong>

          <p>Archie has not recorded any completed missions yet.</p>

          <p class="empty-log-message">
            Complete your first mission to begin the archive.
          </p>
        </div>
      </div>
    `;

    return;
  }

  founder.commandLog.forEach((entry) => {
    const formattedDate = formatCommandLogDate(entry.date);

    const missionName =
      entry.mission && entry.mission.trim()
        ? entry.mission
        : "Daily Founder Mission";

    const record = document.createElement("article");

    record.className = "mission-record";

    record.innerHTML = `
      <header class="mission-record-header">
        <div>
          <span class="mission-record-label">MISSION RECORD</span>

          <h3>${formattedDate}</h3>
        </div>

        <span class="mission-status-badge">
          <span class="mission-status-dot"></span>
          COMPLETE
        </span>
      </header>

      <div class="mission-record-title">
        <span>🚀</span>
        <strong>${missionName}</strong>
      </div>

      <div class="mission-record-stats">
        <div class="mission-record-stat">
          <span class="mission-stat-icon">⭐</span>

          <div>
            <span class="mission-stat-label">FOUNDER XP</span>
            <strong>+${Number(entry.xp) || 0}</strong>
          </div>
        </div>

        <div class="mission-record-stat">
          <span class="mission-stat-icon">🎯</span>

          <div>
            <span class="mission-stat-label">OBJECTIVES</span>
            <strong>${Number(entry.objectives) || 0} completed</strong>
          </div>
        </div>

        <div class="mission-record-stat">
          <span class="mission-stat-icon">🔥</span>

          <div>
            <span class="mission-stat-label">STREAK</span>
            <strong>${Number(entry.streak) || 0} days</strong>
          </div>
        </div>
      </div>

      <div class="archie-observation">
        <div class="archie-observation-header">
          <span>🤖</span>
          <strong>ARCHIE'S OBSERVATION</strong>
        </div>

        <p>
          “${entry.archieNote || "Mission archived successfully."}”
        </p>
      </div>
    `;

    commandLog.appendChild(record);
  });
}

function formatCommandLogDate(dateValue) {
  if (!dateValue) {
    return "Mission Date Unavailable";
  }

  const dateParts = String(dateValue).split("-");

  if (dateParts.length !== 3) {
    return dateValue;
  }

  const year = Number(dateParts[0]);
  const month = Number(dateParts[1]);
  const day = Number(dateParts[2]);

  const localDate = new Date(year, month - 1, day);

  if (Number.isNaN(localDate.getTime())) {
    return dateValue;
  }

  return localDate.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

// =====================================================
// LEARNING HISTORY RENDERER (v0.1)
// Read-only projection of persisted Field Report learningSignals.
// Reuses the Command Log card pattern but does NOT read from
// or write to founder.commandLog.
// =====================================================

function updateLearningHistory() {
  const historyContainer = document.getElementById("learning-signals-history");

  if (!historyContainer) {
    return;
  }

  historyContainer.innerHTML = "";

  // Guard: founder/memory data availability
  let reports = [];
  if (typeof founder !== "undefined" && founder.memory && founder.memory.artifacts) {
    const artifact = founder.memory.artifacts["camping.fieldReports"];
    if (artifact && Array.isArray(artifact.reports)) {
      reports = artifact.reports;
    }
  }

  // Guard: MissionIntelligenceSystem availability
  if (
    typeof MissionIntelligenceSystem === "undefined" ||
    typeof MissionIntelligenceSystem.identifyLearningSignals !== "function"
  ) {
    renderLearningHistoryEmpty(historyContainer);
    return;
  }

  const signals = MissionIntelligenceSystem.identifyLearningSignals(reports, {
    limit: 5,
  });

  if (!Array.isArray(signals) || signals.length === 0) {
    renderLearningHistoryEmpty(historyContainer);
    return;
  }

  const fragment = document.createDocumentFragment();

  signals.forEach((signal) => {
    const record = document.createElement("article");
    record.className = "mission-record";

    // Static card skeleton via innerHTML (no data-derived content)
    record.innerHTML = `
      <header class="mission-record-header">
        <div>
          <span class="mission-record-label">LEARNING INSIGHT</span>
          <h3 class="learning-record-date"></h3>
        </div>
      </header>
      <div class="mission-record-content">
        <p class="learning-insight-text"></p>
        <p class="learning-source"><small></small></p>
      </div>
    `;

    // Data-derived content via textContent (safe from injection)
    const dateEl = record.querySelector(".learning-record-date");
    if (dateEl) {
      dateEl.textContent = signal.reportDate
        ? formatCommandLogDate(signal.reportDate)
        : "Date Unavailable";
    }

    const insightEl = record.querySelector(".learning-insight-text");
    if (insightEl) {
      insightEl.textContent = signal.insight;
    }

    const sourceEl = record.querySelector(".learning-source small");
    if (sourceEl) {
      if (signal.sourceRef && signal.sourceRef.subType) {
        sourceEl.textContent = "Evidence: " + signal.sourceRef.subType;
      } else {
        sourceEl.textContent = "Evidence: Field Report";
      }
    }

    fragment.appendChild(record);
  });

  historyContainer.appendChild(fragment);
}

function renderLearningHistoryEmpty(container) {
  container.innerHTML = `
    <div class="command-log-empty">
      <span class="empty-log-icon">🧠</span>
      <div>
        <strong>No Learning Insights Yet</strong>
        <p>Complete Field Reports to build your learning history.</p>
      </div>
    </div>
  `;
}

// =====================================================
// COACHING HISTORY REVIEW CONTROLS (v0.1)
// Reviews record fidelity without verifying skill or changing raw evidence.
// =====================================================

function getCoachingReviewDisplay(status = "unreviewed") {
  const displays = {
    "confirmed-as-recorded": {
      badge: "CONFIRMED AS RECORDED",
      className: "is-confirmed",
      supportingText: "You confirmed this reflects what you reported.",
    },
    corrected: {
      badge: "CORRECTED",
      className: "is-corrected",
      supportingText:
        "You marked this historical observation as inaccurately recorded.",
    },
    rejected: {
      badge: "REJECTED",
      className: "is-rejected",
      supportingText:
        "You marked this observation as not representing what you intended.",
    },
    unreviewed: {
      badge: "UNREVIEWED",
      className: "is-unreviewed",
      supportingText: "This record has not been reviewed yet.",
    },
  };

  return displays[status] || displays.unreviewed;
}

function buildCoachingReviewPayload(signal, values = {}) {
  if (
    !signal ||
    typeof signal.signalId !== "string" ||
    signal.signalId.trim().length === 0 ||
    typeof signal.createdAt !== "string" ||
    signal.createdAt.trim().length === 0 ||
    !signal.sourceRef ||
    typeof signal.sourceRef !== "object" ||
    typeof signal.sourceRef.artifactId !== "string" ||
    signal.sourceRef.artifactId.trim().length === 0 ||
    signal.sourceRef.subType !== "customerInteraction" ||
    typeof signal.sourceRef.subId !== "string" ||
    signal.sourceRef.subId.trim().length === 0
  ) {
    return { valid: false, reason: "invalid-review-provenance" };
  }

  const allowedStatuses = new Set([
    "confirmed-as-recorded",
    "corrected",
    "rejected",
  ]);
  const status = typeof values.status === "string" ? values.status.trim() : "";
  if (!allowedStatuses.has(status)) {
    return { valid: false, reason: "review-status-required" };
  }

  const correctedStrength =
    status === "corrected" && typeof values.correctedStrength === "string" &&
    values.correctedStrength.trim().length > 0
      ? values.correctedStrength.trim()
      : null;
  const note =
    typeof values.note === "string" && values.note.trim().length > 0
      ? values.note.trim()
      : null;

  if (status === "corrected" && !correctedStrength && !note) {
    return { valid: false, reason: "correction-detail-required" };
  }

  return {
    valid: true,
    payload: {
      signalId: signal.signalId.trim(),
      signalCreatedAt: signal.createdAt.trim(),
      sourceRef: {
        artifactId: signal.sourceRef.artifactId.trim(),
        subType: signal.sourceRef.subType,
        subId: signal.sourceRef.subId.trim(),
      },
      status,
      correctedStrength,
      note: status === "confirmed-as-recorded" ? null : note,
    },
  };
}

async function submitCoachingHistoryReview(
  signal,
  values,
  backend,
  onSuccess = null,
) {
  const built = buildCoachingReviewPayload(signal, values);
  if (!built.valid) {
    return { success: false, reason: built.reason };
  }
  if (!backend || typeof backend.reviewCoachingSignal !== "function") {
    return { success: false, reason: "review-backend-unavailable" };
  }

  try {
    const result = await backend.reviewCoachingSignal(built.payload);
    if (!result || result.success !== true) {
      return {
        success: false,
        reason: result && result.reason ? result.reason : "review-save-failed",
      };
    }

    if (typeof onSuccess === "function") {
      await onSuccess(result);
    }

    return result;
  } catch (e) {
    return { success: false, reason: "review-save-failed" };
  }
}

let activeCoachingReviewSignal = null;

function closeCoachingReviewModal() {
  const modal = document.getElementById("coaching-review-modal");
  if (!modal) return;
  modal.classList.remove("active");
  modal.setAttribute("aria-hidden", "true");
  activeCoachingReviewSignal = null;
}

function openCoachingReviewModal(signal) {
  const modal = document.getElementById("coaching-review-modal");
  const form = document.getElementById("coaching-review-form");
  if (!modal || !form || !signal) return;

  activeCoachingReviewSignal = signal;
  form.reset();
  const insight = document.getElementById("coaching-review-insight");
  const date = document.getElementById("coaching-review-date");
  const currentStatus = document.getElementById("coaching-review-current-status");
  const correctionFields = document.getElementById("coaching-correction-fields");
  const noteFields = document.getElementById("coaching-review-note-fields");
  const error = document.getElementById("coaching-review-error");
  const display = getCoachingReviewDisplay(signal.latestReviewStatus);

  if (insight) insight.textContent = signal.insight;
  if (date) {
    date.textContent = signal.reportDate
      ? `Field Report: ${formatCommandLogDate(signal.reportDate)}`
      : "Field Report date unavailable";
  }
  if (currentStatus) currentStatus.textContent = `Current status: ${display.badge}`;
  if (correctionFields) correctionFields.hidden = true;
  if (noteFields) noteFields.hidden = true;
  if (error) error.textContent = "";

  modal.classList.add("active");
  modal.setAttribute("aria-hidden", "false");
}

function initializeCoachingReviewControls() {
  const form = document.getElementById("coaching-review-form");
  const cancel = document.getElementById("coaching-review-cancel");
  if (!form || form.dataset.reviewInitialized === "true") return;
  form.dataset.reviewInitialized = "true";

  form.addEventListener("change", () => {
    const selected = form.querySelector('input[name="coaching-review-status"]:checked');
    const correctionFields = document.getElementById("coaching-correction-fields");
    const noteFields = document.getElementById("coaching-review-note-fields");
    if (correctionFields) {
      correctionFields.hidden = !selected || selected.value !== "corrected";
    }
    if (noteFields) {
      noteFields.hidden =
        !selected || selected.value === "confirmed-as-recorded";
    }
  });

  if (cancel) cancel.addEventListener("click", closeCoachingReviewModal);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const error = document.getElementById("coaching-review-error");
    const submit = document.getElementById("coaching-review-submit");
    const selected = form.querySelector('input[name="coaching-review-status"]:checked');
    const correctedStrength = document.getElementById("coaching-corrected-strength");
    const note = document.getElementById("coaching-review-note");

    if (error) error.textContent = "";
    if (submit) submit.disabled = true;

    if (
      typeof ArchieCore !== "undefined" &&
      typeof ArchieCore.registerSystem === "function"
    ) {
      if (typeof MemorySystem !== "undefined") {
        ArchieCore.registerSystem("memory", MemorySystem);
      }
      if (typeof MissionIntelligenceSystem !== "undefined") {
        ArchieCore.registerSystem("missionIntelligence", MissionIntelligenceSystem);
      }
    }

    const result = await submitCoachingHistoryReview(
      activeCoachingReviewSignal,
      {
        status: selected ? selected.value : "",
        correctedStrength: correctedStrength ? correctedStrength.value : "",
        note: note ? note.value : "",
      },
      typeof ArchieCore !== "undefined" ? ArchieCore : null,
      async () => {
        closeCoachingReviewModal();
        updateCoachingHistory();
        updateRepeatedSelfAssessmentInsights();
      },
    );

    if (!result.success && error) {
      error.textContent =
        result.reason === "correction-detail-required"
          ? "Choose a corrected strength or add a short correction note."
          : "FounderOS couldn't save this review. Your original record was not changed.";
    }
    if (submit) submit.disabled = false;
  });
}

function updateCoachingHistory() {
  const historyContainer = document.getElementById("coaching-signals-history");

  if (!historyContainer) {
    return;
  }

  historyContainer.innerHTML = "";

  let reports = [];
  let reviewContainer = null;
  if (typeof founder !== "undefined" && founder.memory && founder.memory.artifacts) {
    const artifact = founder.memory.artifacts["camping.fieldReports"];
    if (artifact && Array.isArray(artifact.reports)) {
      reports = artifact.reports;
    }
    reviewContainer = founder.memory.artifacts["camping.coachingReviews"] || null;
  }

  if (
    typeof MissionIntelligenceSystem === "undefined" ||
    typeof MissionIntelligenceSystem.identifyCoachingSignals !== "function"
  ) {
    renderCoachingHistoryEmpty(historyContainer);
    return;
  }

  const signals = MissionIntelligenceSystem.identifyCoachingSignals(reports, {
    limit: 5,
    reviewContainer,
  });

  if (!Array.isArray(signals) || signals.length === 0) {
    renderCoachingHistoryEmpty(historyContainer);
    return;
  }

  const fragment = document.createDocumentFragment();

  signals.forEach((signal) => {
    const record = document.createElement("article");
    record.className = "mission-record";
    record.innerHTML = `
      <header class="mission-record-header">
        <div>
          <span class="mission-record-label">SELF-IDENTIFIED STRENGTH</span>
          <h3 class="coaching-record-date"></h3>
        </div>
        <span class="coaching-review-status"></span>
      </header>
      <div class="mission-record-content">
        <p class="coaching-insight-text"></p>
        <p class="coaching-source"><small></small></p>
        <p class="coaching-review-support"></p>
        <button type="button" class="coaching-review-action"></button>
      </div>
    `;

    const dateEl = record.querySelector(".coaching-record-date");
    if (dateEl) {
      dateEl.textContent = signal.reportDate
        ? formatCommandLogDate(signal.reportDate)
        : "Date Unavailable";
    }

    const insightEl = record.querySelector(".coaching-insight-text");
    if (insightEl) {
      insightEl.textContent = signal.insight;
    }

    const sourceEl = record.querySelector(".coaching-source small");
    if (sourceEl) {
      sourceEl.textContent = "Source: User self-assessment in Field Report";
    }

    const display = getCoachingReviewDisplay(signal.latestReviewStatus);
    const badge = record.querySelector(".coaching-review-status");
    const support = record.querySelector(".coaching-review-support");
    const action = record.querySelector(".coaching-review-action");
    if (badge) {
      badge.textContent = display.badge;
      badge.classList.add(display.className);
    }
    if (support) support.textContent = display.supportingText;
    if (action) {
      action.textContent =
        signal.latestReviewStatus && signal.latestReviewStatus !== "unreviewed"
          ? "Review again"
          : "Review record";
      action.addEventListener("click", () => openCoachingReviewModal(signal));
    }

    fragment.appendChild(record);
  });

  historyContainer.appendChild(fragment);
  initializeCoachingReviewControls();
}

function renderCoachingHistoryEmpty(container) {
  container.innerHTML = `
    <div class="command-log-empty">
      <span class="empty-log-icon">🧭</span>
      <div>
        <strong>No Coaching History Yet</strong>
        <p>No self-identified strengths have been recorded in Field Reports yet.</p>
      </div>
    </div>
  `;
}

function renderRepeatedSelfAssessmentInsights(container, summaries) {
  container.innerHTML = "";

  if (!Array.isArray(summaries) || summaries.length === 0) {
    container.innerHTML = `
      <div class="command-log-empty">
        <span class="empty-log-icon">🔁</span>
        <div>
          <strong>No repeated self-assessment patterns yet.</strong>
          <p>Patterns will appear here after you self-identify the same strength in multiple recorded interactions.</p>
        </div>
      </div>
    `;
    return;
  }

  const fragment = document.createDocumentFragment();
  summaries.forEach((summary) => {
    const record = document.createElement("article");
    record.className = "mission-record repeated-self-assessment-record";
    record.innerHTML = `
      <header class="mission-record-header">
        <div>
          <span class="mission-record-label">REPEATED SELF-ASSESSMENT</span>
          <h3 class="repeated-self-assessment-label"></h3>
        </div>
        <span class="repeated-self-assessment-badge">REPEATED SELF-ASSESSMENT</span>
      </header>
      <div class="mission-record-content">
        <p class="repeated-self-assessment-insight"></p>
        <div class="repeated-self-assessment-counts">
          <span class="repeated-interaction-count"></span>
          <span class="repeated-report-count"></span>
        </div>
        <p class="repeated-self-assessment-support">This pattern reflects repeated self-identification in recorded interactions, not a verified performance assessment.</p>
      </div>
    `;

    record.querySelector(".repeated-self-assessment-label").textContent =
      summary.label;
    record.querySelector(".repeated-self-assessment-insight").textContent =
      summary.insight;
    record.querySelector(".repeated-interaction-count").textContent =
      `${summary.interactionCount} recorded interactions`;
    record.querySelector(".repeated-report-count").textContent =
      `${summary.reportCount} Field ${summary.reportCount === 1 ? "Report" : "Reports"}`;
    fragment.appendChild(record);
  });

  container.appendChild(fragment);
}

function updateRepeatedSelfAssessmentInsights() {
  const container = document.getElementById("repeated-self-assessment-insights");
  if (!container) return;

  let reports = [];
  let reviewContainer = null;
  if (typeof founder !== "undefined" && founder.memory && founder.memory.artifacts) {
    const artifact = founder.memory.artifacts["camping.fieldReports"];
    if (artifact && Array.isArray(artifact.reports)) {
      reports = artifact.reports;
    }
    reviewContainer = founder.memory.artifacts["camping.coachingReviews"] || null;
  }

  if (
    typeof MissionIntelligenceSystem === "undefined" ||
    typeof MissionIntelligenceSystem.identifyRepeatedSelfAssessments !== "function"
  ) {
    renderRepeatedSelfAssessmentInsights(container, []);
    return;
  }

  const summaries = MissionIntelligenceSystem.identifyRepeatedSelfAssessments(
    reports,
    reviewContainer,
  );
  renderRepeatedSelfAssessmentInsights(container, summaries);
}

// =====================================================
// BEHAVIORAL EVIDENCE (E3) REVIEW CONTROLS (v0.1)
// Reviews interpretation fidelity without changing raw Field Reports.
// =====================================================

function getBehavioralEvidenceReviewDisplay(status = "unreviewed") {
  const displays = {
    "confirmed-as-recorded": {
      badge: "CONFIRMED AS RECORDED",
      className: "is-confirmed",
      supportingText:
        "You confirmed that the source and interpretation reflect what you reported. This does not verify the competency.",
    },
    corrected: {
      badge: "CORRECTED",
      className: "is-corrected",
      supportingText:
        "You corrected this interpretation. The original Field Report was not changed.",
    },
    unreviewed: {
      badge: "UNREVIEWED",
      className: "is-unreviewed",
      supportingText: "This evidence interpretation has not been reviewed yet.",
    },
  };
  return displays[status] || displays.unreviewed;
}

function buildBehavioralEvidenceReviewPayload(evidence, values = {}) {
  if (
    !evidence ||
    typeof evidence.evidenceId !== "string" ||
    evidence.evidenceId.trim().length === 0 ||
    typeof evidence.sourceFingerprint !== "string" ||
    evidence.sourceFingerprint.length === 0 ||
    !evidence.sourceRef ||
    typeof evidence.sourceRef !== "object" ||
    typeof evidence.sourceRef.artifactId !== "string" ||
    evidence.sourceRef.artifactId.trim().length === 0 ||
    evidence.sourceRef.subType !== "customerInteraction" ||
    typeof evidence.sourceRef.subId !== "string" ||
    evidence.sourceRef.subId.trim().length === 0 ||
    !Array.isArray(evidence.evidenceRefs)
  ) {
    return { valid: false, reason: "invalid-review-provenance" };
  }
  const outcomeRef = evidence.evidenceRefs.find(
    (ref) =>
      ref &&
      ref.field === "salesStepOutcomes" &&
      typeof ref.entryId === "string" &&
      ref.entryId.trim().length > 0,
  );
  if (!outcomeRef) {
    return { valid: false, reason: "invalid-review-provenance" };
  }

  const allowedStatuses = new Set([
    "confirmed-as-recorded",
    "corrected",
    "rejected",
  ]);
  const status = typeof values.status === "string" ? values.status.trim() : "";
  if (!allowedStatuses.has(status)) {
    return { valid: false, reason: "review-status-required" };
  }
  const canonicalCompetencies = new Set([
    "rapport",
    "discovery",
    "product-selection",
    "presentation",
    "objection-handling",
    "trial-close",
  ]);
  const requestedCompetency =
    typeof values.correctedCompetency === "string"
      ? values.correctedCompetency.trim()
      : "";
  const correctedCompetency =
    status === "corrected" &&
    canonicalCompetencies.has(requestedCompetency) &&
    requestedCompetency !== evidence.competency
      ? requestedCompetency
      : null;
  if (
    status === "corrected" &&
    requestedCompetency &&
    !correctedCompetency
  ) {
    return { valid: false, reason: "invalid-corrected-competency" };
  }
  const note =
    typeof values.note === "string" && values.note.trim().length > 0
      ? values.note.trim()
      : null;
  if (status === "corrected" && !correctedCompetency && !note) {
    return { valid: false, reason: "correction-detail-required" };
  }

  return {
    valid: true,
    payload: {
      evidenceId: evidence.evidenceId.trim(),
      sourceRef: {
        artifactId: evidence.sourceRef.artifactId.trim(),
        subType: evidence.sourceRef.subType,
        subId: evidence.sourceRef.subId.trim(),
      },
      outcomeEntryId: outcomeRef.entryId.trim(),
      sourceFingerprint: evidence.sourceFingerprint,
      status,
      correctedCompetency:
        status === "corrected" ? correctedCompetency : null,
      note: status === "confirmed-as-recorded" ? null : note,
    },
  };
}

async function submitBehavioralEvidenceReview(
  evidence,
  values,
  backend,
  onSuccess = null,
) {
  const built = buildBehavioralEvidenceReviewPayload(evidence, values);
  if (!built.valid) {
    return { success: false, reason: built.reason };
  }
  if (!backend || typeof backend.reviewBehavioralEvidence !== "function") {
    return { success: false, reason: "review-backend-unavailable" };
  }
  try {
    const result = await backend.reviewBehavioralEvidence(built.payload);
    if (!result || result.success !== true) {
      return {
        success: false,
        reason: result && result.reason ? result.reason : "review-save-failed",
      };
    }
    if (typeof onSuccess === "function") {
      await onSuccess(result);
    }
    return result;
  } catch (e) {
    return { success: false, reason: "review-save-failed" };
  }
}

let activeBehavioralEvidenceReview = null;

function closeBehavioralEvidenceReviewModal() {
  const modal = document.getElementById("behavioral-evidence-review-modal");
  if (!modal) return;
  modal.classList.remove("active");
  modal.setAttribute("aria-hidden", "true");
  activeBehavioralEvidenceReview = null;
}

function openBehavioralEvidenceReviewModal(evidence) {
  const modal = document.getElementById("behavioral-evidence-review-modal");
  const form = document.getElementById("behavioral-evidence-review-form");
  if (!modal || !form || !evidence) return;
  activeBehavioralEvidenceReview = evidence;
  form.reset();
  const insight = document.getElementById(
    "behavioral-evidence-review-insight",
  );
  const status = document.getElementById(
    "behavioral-evidence-review-current-status",
  );
  const correctionFields = document.getElementById(
    "behavioral-evidence-correction-fields",
  );
  const noteFields = document.getElementById(
    "behavioral-evidence-note-fields",
  );
  const error = document.getElementById("behavioral-evidence-review-error");
  const display = getBehavioralEvidenceReviewDisplay(
    evidence.latestReviewStatus,
  );
  if (insight) insight.textContent = evidence.insight;
  if (status) status.textContent = `Current status: ${display.badge}`;
  if (correctionFields) correctionFields.hidden = true;
  if (noteFields) noteFields.hidden = true;
  if (error) error.textContent = "";
  modal.classList.add("active");
  modal.setAttribute("aria-hidden", "false");
}

function initializeBehavioralEvidenceReviewControls() {
  const form = document.getElementById("behavioral-evidence-review-form");
  const cancel = document.getElementById("behavioral-evidence-review-cancel");
  if (!form || form.dataset.reviewInitialized === "true") return;
  form.dataset.reviewInitialized = "true";
  form.addEventListener("change", () => {
    const selected = form.querySelector(
      'input[name="behavioral-evidence-review-status"]:checked',
    );
    const correctionFields = document.getElementById(
      "behavioral-evidence-correction-fields",
    );
    const noteFields = document.getElementById(
      "behavioral-evidence-note-fields",
    );
    if (correctionFields) {
      correctionFields.hidden = !selected || selected.value !== "corrected";
    }
    if (noteFields) {
      noteFields.hidden =
        !selected || selected.value === "confirmed-as-recorded";
    }
  });
  if (cancel) {
    cancel.addEventListener("click", closeBehavioralEvidenceReviewModal);
  }
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const error = document.getElementById("behavioral-evidence-review-error");
    const submit = document.getElementById("behavioral-evidence-review-submit");
    const selected = form.querySelector(
      'input[name="behavioral-evidence-review-status"]:checked',
    );
    const correctedCompetency = document.getElementById(
      "behavioral-evidence-corrected-competency",
    );
    const note = document.getElementById("behavioral-evidence-review-note");
    if (error) error.textContent = "";
    if (submit) submit.disabled = true;

    if (
      typeof ArchieCore !== "undefined" &&
      typeof ArchieCore.registerSystem === "function"
    ) {
      if (typeof MemorySystem !== "undefined") {
        ArchieCore.registerSystem("memory", MemorySystem);
      }
      if (typeof MissionIntelligenceSystem !== "undefined") {
        ArchieCore.registerSystem(
          "missionIntelligence",
          MissionIntelligenceSystem,
        );
      }
    }
    const result = await submitBehavioralEvidenceReview(
      activeBehavioralEvidenceReview,
      {
        status: selected ? selected.value : "",
        correctedCompetency: correctedCompetency
          ? correctedCompetency.value
          : "",
        note: note ? note.value : "",
      },
      typeof ArchieCore !== "undefined" ? ArchieCore : null,
      async () => {
        closeBehavioralEvidenceReviewModal();
        updateBehavioralEvidence();
        updateRecurringBehavioralPatterns();
      },
    );
    if (!result.success && error) {
      error.textContent =
        result.reason === "correction-detail-required"
          ? "Choose a different competency or add a short correction note."
          : "FounderOS couldn't save this evidence review. Your original record was not changed.";
    }
    if (submit) submit.disabled = false;
  });
}

function renderBehavioralEvidence(container, evidenceItems) {
  container.innerHTML = "";
  if (!Array.isArray(evidenceItems) || evidenceItems.length === 0) {
    container.innerHTML = `
      <div class="command-log-empty">
        <span class="empty-log-icon">🧾</span>
        <div>
          <strong>No Behavioral Evidence Yet</strong>
          <p>Qualifying structured interaction outcomes will appear here.</p>
        </div>
      </div>
    `;
    return;
  }
  const fragment = document.createDocumentFragment();
  evidenceItems.forEach((evidence) => {
    const record = document.createElement("article");
    record.className = "mission-record behavioral-evidence-record";
    record.innerHTML = `
      <header class="mission-record-header">
        <div>
          <span class="mission-record-label">STRUCTURED INTERACTION EVIDENCE · E3</span>
          <h3 class="behavioral-evidence-label"></h3>
        </div>
        <span class="behavioral-evidence-review-status"></span>
      </header>
      <div class="mission-record-content">
        <p class="behavioral-evidence-insight"></p>
        <p class="behavioral-evidence-source"><small>Source: Commander-reported Field Report outcome</small></p>
        <p class="behavioral-evidence-review-support"></p>
        <p class="behavioral-evidence-correction" hidden></p>
        <button type="button" class="behavioral-evidence-review-action"></button>
      </div>
    `;
    record.querySelector(".behavioral-evidence-label").textContent =
      evidence.label;
    record.querySelector(".behavioral-evidence-insight").textContent =
      evidence.insight;
    const display = getBehavioralEvidenceReviewDisplay(
      evidence.latestReviewStatus,
    );
    const badge = record.querySelector(".behavioral-evidence-review-status");
    badge.textContent = display.badge;
    badge.classList.add(display.className);
    record.querySelector(".behavioral-evidence-review-support").textContent =
      display.supportingText;
    const correction = record.querySelector(".behavioral-evidence-correction");
    if (evidence.latestReviewStatus === "corrected") {
      const details = [];
      if (evidence.latestReviewCorrectedCompetency) {
        details.push(
          `Corrected competency: ${evidence.latestReviewCorrectedCompetency}`,
        );
      }
      if (evidence.latestReviewNote) {
        details.push(`Review note: ${evidence.latestReviewNote}`);
      }
      correction.textContent = details.join(" · ");
      correction.hidden = details.length === 0;
    }
    const action = record.querySelector(".behavioral-evidence-review-action");
    action.textContent =
      evidence.latestReviewStatus === "unreviewed"
        ? "Review evidence"
        : "Review again";
    action.addEventListener("click", () =>
      openBehavioralEvidenceReviewModal(evidence),
    );
    fragment.appendChild(record);
  });
  container.appendChild(fragment);
  initializeBehavioralEvidenceReviewControls();
}

function updateBehavioralEvidence() {
  const container = document.getElementById("behavioral-evidence-history");
  if (!container) return;
  let reports = [];
  let reviewContainer = null;
  if (
    typeof founder !== "undefined" &&
    founder.memory &&
    founder.memory.artifacts
  ) {
    const artifact = founder.memory.artifacts["camping.fieldReports"];
    if (artifact && Array.isArray(artifact.reports)) {
      reports = artifact.reports;
    }
    reviewContainer =
      founder.memory.artifacts["camping.behavioralEvidenceReviews"] || null;
  }
  if (
    typeof MissionIntelligenceSystem === "undefined" ||
    typeof MissionIntelligenceSystem.identifyBehavioralEvidence !== "function"
  ) {
    renderBehavioralEvidence(container, []);
    return;
  }
  const evidenceItems =
    MissionIntelligenceSystem.identifyBehavioralEvidence(
      reports,
      reviewContainer,
    );
  renderBehavioralEvidence(container, evidenceItems);
}

function getBehavioralPatternReviewDisplay(status) {
  if (status === "confirmed-as-pattern") {
    return { label: "Pattern review: Confirmed", className: "is-confirmed" };
  }
  if (status === "corrected") {
    return { label: "Pattern review: Corrected", className: "is-corrected" };
  }
  if (status === "rejected") {
    return { label: "Pattern review: Rejected", className: "is-rejected" };
  }
  return { label: "Pattern review: Not yet reviewed", className: "is-unreviewed" };
}

function buildBehavioralPatternReviewPayload(pattern, values = {}) {
  const contributorIdentities =
    pattern && Array.isArray(pattern.contributors)
      ? pattern.contributors.map((contributor) => contributor.activeIdentity)
      : [];
  if (
    !pattern ||
    typeof pattern.patternId !== "string" ||
    typeof pattern.patternVersionIdentity !== "string" ||
    contributorIdentities.some(
      (identity) => typeof identity !== "string" || identity.length === 0,
    )
  ) {
    return { valid: false, reason: "invalid-pattern-review-target" };
  }
  const status = typeof values.status === "string" ? values.status.trim() : "";
  if (!["confirmed-as-pattern", "corrected", "rejected"].includes(status)) {
    return { valid: false, reason: "invalid-review-status" };
  }
  const correctedInterpretation =
    status === "corrected" &&
    typeof values.correctedInterpretation === "string" &&
    values.correctedInterpretation.trim().length > 0
      ? values.correctedInterpretation.trim()
      : null;
  const note =
    status !== "confirmed-as-pattern" &&
    typeof values.note === "string" &&
    values.note.trim().length > 0
      ? values.note.trim()
      : null;
  if (status === "corrected" && !correctedInterpretation && !note) {
    return { valid: false, reason: "correction-detail-required" };
  }
  return {
    valid: true,
    payload: {
      patternId: pattern.patternId,
      patternVersionIdentity: pattern.patternVersionIdentity,
      contributorIdentities: contributorIdentities.slice().sort(),
      status,
      correctedInterpretation,
      note,
    },
  };
}

async function submitBehavioralPatternReview(
  pattern,
  values,
  backend,
  onSuccess,
) {
  const built = buildBehavioralPatternReviewPayload(pattern, values);
  if (!built.valid) return built;
  if (!backend || typeof backend.reviewBehavioralPattern !== "function") {
    return { success: false, reason: "review-system-unavailable" };
  }
  try {
    const result = await backend.reviewBehavioralPattern(built.payload);
    if (result && result.success === true && typeof onSuccess === "function") {
      await onSuccess(result);
    }
    return result || { success: false, reason: "review-save-failed" };
  } catch (e) {
    return { success: false, reason: "review-save-failed" };
  }
}

let activeBehavioralPatternReview = null;

function closeBehavioralPatternReviewModal() {
  const modal = document.getElementById("behavioral-pattern-review-modal");
  if (!modal) return;
  modal.classList.remove("active");
  modal.setAttribute("aria-hidden", "true");
  activeBehavioralPatternReview = null;
}

function openBehavioralPatternReviewModal(pattern) {
  const modal = document.getElementById("behavioral-pattern-review-modal");
  const form = document.getElementById("behavioral-pattern-review-form");
  if (!modal || !form || !pattern) return;
  activeBehavioralPatternReview = pattern;
  form.reset();
  const insight = document.getElementById("behavioral-pattern-review-insight");
  const status = document.getElementById(
    "behavioral-pattern-review-current-status",
  );
  const correctionFields = document.getElementById(
    "behavioral-pattern-correction-fields",
  );
  const noteFields = document.getElementById(
    "behavioral-pattern-note-fields",
  );
  const error = document.getElementById("behavioral-pattern-review-error");
  if (insight) insight.textContent = pattern.insight;
  if (status) {
    status.textContent = getBehavioralPatternReviewDisplay(
      pattern.latestPatternReviewStatus,
    ).label;
  }
  if (correctionFields) correctionFields.hidden = true;
  if (noteFields) noteFields.hidden = true;
  if (error) error.textContent = "";
  modal.classList.add("active");
  modal.setAttribute("aria-hidden", "false");
}

function initializeBehavioralPatternReviewControls() {
  const form = document.getElementById("behavioral-pattern-review-form");
  const cancel = document.getElementById("behavioral-pattern-review-cancel");
  if (!form || form.dataset.reviewInitialized === "true") return;
  form.dataset.reviewInitialized = "true";
  form.addEventListener("change", () => {
    const selected = form.querySelector(
      'input[name="behavioral-pattern-review-status"]:checked',
    );
    const correctionFields = document.getElementById(
      "behavioral-pattern-correction-fields",
    );
    const noteFields = document.getElementById(
      "behavioral-pattern-note-fields",
    );
    if (correctionFields) {
      correctionFields.hidden = !selected || selected.value !== "corrected";
    }
    if (noteFields) {
      noteFields.hidden =
        !selected || selected.value === "confirmed-as-pattern";
    }
  });
  if (cancel) cancel.addEventListener("click", closeBehavioralPatternReviewModal);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const error = document.getElementById("behavioral-pattern-review-error");
    const submit = document.getElementById("behavioral-pattern-review-submit");
    const selected = form.querySelector(
      'input[name="behavioral-pattern-review-status"]:checked',
    );
    const correction = document.getElementById(
      "behavioral-pattern-corrected-interpretation",
    );
    const note = document.getElementById("behavioral-pattern-review-note");
    if (error) error.textContent = "";
    if (submit) submit.disabled = true;
    if (
      typeof ArchieCore !== "undefined" &&
      typeof ArchieCore.registerSystem === "function"
    ) {
      if (typeof MemorySystem !== "undefined") {
        ArchieCore.registerSystem("memory", MemorySystem);
      }
      if (typeof MissionIntelligenceSystem !== "undefined") {
        ArchieCore.registerSystem(
          "missionIntelligence",
          MissionIntelligenceSystem,
        );
      }
    }
    const result = await submitBehavioralPatternReview(
      activeBehavioralPatternReview,
      {
        status: selected ? selected.value : "",
        correctedInterpretation: correction ? correction.value : "",
        note: note ? note.value : "",
      },
      typeof ArchieCore !== "undefined" ? ArchieCore : null,
      async () => {
        closeBehavioralPatternReviewModal();
        updateRecurringBehavioralPatterns();
      },
    );
    if (!result.success && error) {
      error.textContent =
        result.reason === "correction-detail-required"
          ? "Describe the pattern differently or add a short note."
          : "FounderOS couldn't save this pattern review. The source records were not changed.";
    }
    if (submit) submit.disabled = false;
  });
}

function renderRecurringBehavioralPatterns(container, patterns) {
  container.innerHTML = "";
  if (!Array.isArray(patterns) || patterns.length === 0) {
    container.innerHTML = `
      <div class="command-log-empty">
        <span class="empty-log-icon">🔁</span>
        <div>
          <strong>No recurring behavioral patterns yet.</strong>
          <p>Patterns will appear here after the same competency is supported by at least three confirmed behavioral evidence records from separate interactions.</p>
        </div>
      </div>
    `;
    return;
  }

  const fragment = document.createDocumentFragment();
  patterns.forEach((pattern) => {
    const record = document.createElement("article");
    record.className =
      "mission-record recurring-behavioral-pattern-record";
    record.innerHTML = `
      <header class="mission-record-header">
        <div>
          <span class="mission-record-label">RECURRING BEHAVIORAL PATTERN · E4</span>
          <h3 class="recurring-behavioral-pattern-label"></h3>
        </div>
      </header>
      <div class="mission-record-content">
        <p class="recurring-behavioral-pattern-insight"></p>
        <div class="recurring-behavioral-pattern-counts">
          <span class="recurring-behavioral-pattern-interactions"></span>
          <span class="recurring-behavioral-pattern-reports"></span>
        </div>
        <p class="recurring-behavioral-pattern-source"><small>Source: Aggregated from Commander-reviewed Behavioral Evidence</small></p>
        <p class="recurring-behavioral-pattern-review"></p>
        <p class="recurring-behavioral-pattern-correction" hidden></p>
        <button type="button" class="recurring-behavioral-pattern-review-action"></button>
      </div>
    `;
    record.querySelector(".recurring-behavioral-pattern-label").textContent =
      pattern.label;
    record.querySelector(".recurring-behavioral-pattern-insight").textContent =
      pattern.insight;
    record.querySelector(
      ".recurring-behavioral-pattern-interactions",
    ).textContent = `${pattern.interactionCount} reviewed interaction records`;
    record.querySelector(
      ".recurring-behavioral-pattern-reports",
    ).textContent = `${pattern.reportCount} Field Reports`;
    const reviewDisplay = getBehavioralPatternReviewDisplay(
      pattern.latestPatternReviewStatus,
    );
    const reviewState = record.querySelector(
      ".recurring-behavioral-pattern-review",
    );
    reviewState.textContent = reviewDisplay.label;
    reviewState.classList.add(reviewDisplay.className);
    const correction = record.querySelector(
      ".recurring-behavioral-pattern-correction",
    );
    const correctionDetails = [];
    if (pattern.latestPatternCorrectedInterpretation) {
      correctionDetails.push(
        `Corrected interpretation: ${pattern.latestPatternCorrectedInterpretation}`,
      );
    }
    if (pattern.latestPatternReviewNote) {
      correctionDetails.push(`Review note: ${pattern.latestPatternReviewNote}`);
    }
    correction.textContent = correctionDetails.join(" · ");
    correction.hidden = correctionDetails.length === 0;
    const action = record.querySelector(
      ".recurring-behavioral-pattern-review-action",
    );
    action.textContent =
      pattern.latestPatternReviewStatus === "unreviewed"
        ? "Review pattern"
        : "Review again";
    action.addEventListener("click", () =>
      openBehavioralPatternReviewModal(pattern),
    );
    fragment.appendChild(record);
  });
  container.appendChild(fragment);
  initializeBehavioralPatternReviewControls();
}

function updateRecurringBehavioralPatterns() {
  const container = document.getElementById(
    "recurring-behavioral-patterns",
  );
  if (!container) return;
  let reports = [];
  let reviewContainer = null;
  let patternReviewContainer = null;
  if (
    typeof founder !== "undefined" &&
    founder.memory &&
    founder.memory.artifacts
  ) {
    const artifact = founder.memory.artifacts["camping.fieldReports"];
    if (artifact && Array.isArray(artifact.reports)) {
      reports = artifact.reports;
    }
    reviewContainer =
      founder.memory.artifacts["camping.behavioralEvidenceReviews"] || null;
    patternReviewContainer =
      founder.memory.artifacts["camping.behavioralPatternReviews"] || null;
  }
  if (
    typeof MissionIntelligenceSystem === "undefined" ||
    typeof MissionIntelligenceSystem.identifyRecurringBehavioralPatterns !==
      "function"
  ) {
    renderRecurringBehavioralPatterns(container, []);
    return;
  }
  const patterns =
    MissionIntelligenceSystem.identifyRecurringBehavioralPatterns(
      reports,
      reviewContainer,
      patternReviewContainer,
    );
  renderRecurringBehavioralPatterns(container, patterns);
}

// =====================================================
// PROFILE CAPABILITY UI (v0.1)
// Thin Commander controls over canonical ArchieCore operations.
// =====================================================

function ensureProfileCapabilitySystems() {
  if (typeof ArchieCore === "undefined") return null;
  if (typeof MemorySystem !== "undefined") {
    ArchieCore.registerSystem("memory", MemorySystem);
  }
  if (typeof MissionIntelligenceSystem !== "undefined") {
    ArchieCore.registerSystem(
      "missionIntelligence",
      MissionIntelligenceSystem,
    );
  }
  if (typeof CommanderSystem !== "undefined") {
    ArchieCore.registerSystem("commander", CommanderSystem);
  }
  return ArchieCore;
}

function getProfileCapabilitySupportCopy(state = "") {
  const copy = {
    current:
      "Current reviewed evidence matches the version you adopted.",
    "support-changed":
      "Your Profile choice remains active, but the reviewed evidence supporting it has changed since adoption.",
    "insufficient-current-support":
      "Your Profile choice remains active, but there is not currently enough reviewed evidence to reproduce the original recommendation.",
  };
  return copy[state] || "Current evidence support is unavailable.";
}

function formatProfileCapabilityDate(value = "") {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Date unavailable" : date.toLocaleDateString();
}

function setProfileCapabilityFeedback(message = "", isError = false) {
  const feedback = document.getElementById("profile-capability-feedback");
  if (!feedback) return;
  feedback.textContent = message;
  feedback.classList.toggle("is-error", isError);
}

async function submitProfileCapabilityDecision(
  candidate,
  decision,
  core = typeof ArchieCore !== "undefined" ? ArchieCore : null,
  onSuccess = null,
) {
  if (
    !candidate ||
    !core ||
    typeof core.decideProfileCapabilityCandidate !== "function"
  ) {
    return { success: false, reason: "profile-capability-action-unavailable" };
  }
  const result = await core.decideProfileCapabilityCandidate({
    candidateId: candidate.candidateId,
    candidateVersionIdentity: candidate.candidateVersionIdentity,
    decision,
    note: null,
  });
  if (result && result.success === true && typeof onSuccess === "function") {
    await onSuccess(result);
  }
  return result || { success: false, reason: "profile-capability-action-failed" };
}

async function submitProfileCapabilityWithdrawal(
  capability,
  core = typeof ArchieCore !== "undefined" ? ArchieCore : null,
  confirmWithdrawal =
    typeof window !== "undefined" && typeof window.confirm === "function"
      ? window.confirm.bind(window)
      : null,
  onSuccess = null,
) {
  if (
    !capability ||
    !core ||
    typeof core.withdrawProfileCapability !== "function" ||
    typeof confirmWithdrawal !== "function"
  ) {
    return { success: false, reason: "profile-capability-withdrawal-unavailable" };
  }
  const confirmed = confirmWithdrawal(
    "Withdrawing removes this from your current Profile identity. FounderOS will preserve the adoption, withdrawal, and supporting evidence history.",
  );
  if (!confirmed) {
    return { success: false, changed: false, reason: "withdrawal-cancelled" };
  }
  const result = await core.withdrawProfileCapability({
    capabilityId: capability.id,
    note: null,
  });
  if (result && result.success === true && typeof onSuccess === "function") {
    await onSuccess(result);
  }
  return result || { success: false, reason: "profile-capability-withdrawal-failed" };
}

function renderProfileCapabilitySuggestions(container, candidates) {
  container.innerHTML = "";
  if (!Array.isArray(candidates) || candidates.length === 0) {
    container.innerHTML = `
      <div class="command-log-empty">
        <div><strong>No capability suggestions need your attention.</strong></div>
      </div>
    `;
    return;
  }
  const fragment = document.createDocumentFragment();
  candidates.forEach((candidate) => {
    const record = document.createElement("article");
    record.className = "profile-capability-record profile-capability-suggestion";
    record.innerHTML = `
      <span class="profile-capability-badge">PROFILE SUGGESTION</span>
      <h3 class="profile-capability-label"></h3>
      <p class="profile-capability-recommendation"></p>
      <div class="profile-capability-counts">
        <span class="profile-capability-interactions"></span>
        <span class="profile-capability-reports"></span>
      </div>
      <p class="profile-capability-authority">Adding this to your Profile means you choose to recognize it as a developing capability. FounderOS will preserve the supporting evidence, but this does not represent independent verification or permanent identity.</p>
      <div class="profile-capability-actions">
        <button type="button" data-decision="adopt">Add as developing capability</button>
        <button type="button" class="secondary-action" data-decision="defer">Not now</button>
        <button type="button" class="secondary-action" data-decision="reject">Reject suggestion</button>
        <button type="button" class="secondary-action" data-decision="suppress">Don't suggest again</button>
      </div>
    `;
    record.querySelector(".profile-capability-label").textContent =
      candidate.label;
    record.querySelector(".profile-capability-recommendation").textContent =
      candidate.recommendation;
    record.querySelector(".profile-capability-interactions").textContent =
      `${candidate.interactionCount} supporting interactions`;
    record.querySelector(".profile-capability-reports").textContent =
      `${candidate.reportCount} supporting Field Reports`;
    record.querySelectorAll("[data-decision]").forEach((button) => {
      button.addEventListener("click", async () => {
        const decision = button.dataset.decision;
        record.querySelectorAll("button").forEach((action) => {
          action.disabled = true;
        });
        const result = await submitProfileCapabilityDecision(
          candidate,
          decision,
          ensureProfileCapabilitySystems(),
          updateProfileCapabilitySurface,
        );
        if (result.success) {
          const messages = {
            adopt: "Developing capability added to your Profile.",
            defer: "Suggestion set aside for this evidence version.",
            reject: "This recommendation version was rejected. Supporting evidence was preserved.",
            suppress: "Future suggestions for this capability were suppressed.",
          };
          setProfileCapabilityFeedback(messages[decision] || "Decision saved.");
        } else {
          setProfileCapabilityFeedback(
            "FounderOS couldn't save that decision. Your Profile and suggestion remain unchanged.",
            true,
          );
          record.querySelectorAll("button").forEach((action) => {
            action.disabled = false;
          });
        }
      });
    });
    fragment.appendChild(record);
  });
  container.appendChild(fragment);
}

function renderProfileCapabilities(activeContainer, withdrawnContainer, capabilities) {
  activeContainer.innerHTML = "";
  withdrawnContainer.innerHTML = "";
  const records = Array.isArray(capabilities) ? capabilities : [];
  const active = records.filter((capability) => capability.status === "active");
  const withdrawn = records.filter(
    (capability) => capability.status === "withdrawn",
  );
  if (active.length === 0) {
    activeContainer.innerHTML = `
      <div class="command-log-empty">
        <div><strong>No developing capabilities are currently in your Profile.</strong></div>
      </div>
    `;
  }
  active.forEach((capability) => {
    const record = document.createElement("article");
    record.className = "profile-capability-record active-profile-capability";
    record.innerHTML = `
      <span class="profile-capability-badge">DEVELOPING CAPABILITY</span>
      <h3 class="profile-capability-label"></h3>
      <p class="profile-capability-wording"></p>
      <p class="profile-capability-support"></p>
      <p class="profile-capability-history-meta"></p>
      <button type="button" class="profile-capability-withdraw">Withdraw from Profile</button>
    `;
    record.querySelector(".profile-capability-label").textContent =
      capability.label;
    record.querySelector(".profile-capability-wording").textContent =
      capability.adoptedWording;
    record.querySelector(".profile-capability-support").textContent =
      getProfileCapabilitySupportCopy(capability.evidenceSupportState);
    record.querySelector(".profile-capability-history-meta").textContent =
      `Adopted ${formatProfileCapabilityDate(capability.adoptedAt)}`;
    record
      .querySelector(".profile-capability-withdraw")
      .addEventListener("click", async (event) => {
        event.currentTarget.disabled = true;
        const result = await submitProfileCapabilityWithdrawal(
          capability,
          ensureProfileCapabilitySystems(),
          typeof window !== "undefined" ? window.confirm.bind(window) : null,
          updateProfileCapabilitySurface,
        );
        if (result.success) {
          setProfileCapabilityFeedback(
            "Capability withdrawn from your current Profile. Its history was preserved.",
          );
        } else if (result.reason !== "withdrawal-cancelled") {
          setProfileCapabilityFeedback(
            "FounderOS couldn't withdraw that capability. Your current Profile remains unchanged.",
            true,
          );
          event.currentTarget.disabled = false;
        } else {
          event.currentTarget.disabled = false;
        }
      });
    activeContainer.appendChild(record);
  });
  if (withdrawn.length === 0) {
    withdrawnContainer.innerHTML = `
      <div class="command-log-empty">
        <div><strong>No previously recognized capabilities.</strong></div>
      </div>
    `;
  }
  withdrawn.forEach((capability) => {
    const record = document.createElement("article");
    record.className = "profile-capability-record withdrawn-profile-capability";
    record.innerHTML = `
      <span class="profile-capability-badge">WITHDRAWN</span>
      <h3 class="profile-capability-label"></h3>
      <p class="profile-capability-history-meta"></p>
    `;
    record.querySelector(".profile-capability-label").textContent =
      capability.label;
    record.querySelector(".profile-capability-history-meta").textContent =
      `Adopted ${formatProfileCapabilityDate(capability.adoptedAt)} · Withdrawn ${formatProfileCapabilityDate(capability.withdrawnAt)}`;
    withdrawnContainer.appendChild(record);
  });
}

async function updateProfileCapabilitySurface() {
  const suggestionContainer = document.getElementById(
    "profile-capability-suggestions",
  );
  const activeContainer = document.getElementById("active-profile-capabilities");
  const withdrawnContainer = document.getElementById(
    "withdrawn-profile-capabilities",
  );
  if (!suggestionContainer || !activeContainer || !withdrawnContainer) return;
  const core = ensureProfileCapabilitySystems();
  const candidates =
    core && typeof core.getActionableProfileCapabilityCandidates === "function"
      ? core.getActionableProfileCapabilityCandidates()
      : [];
  const commander = core && core.systems ? core.systems.commander : null;
  const profile =
    commander && typeof commander.getProfile === "function"
      ? commander.getProfile()
      : null;
  renderProfileCapabilitySuggestions(suggestionContainer, candidates);
  renderProfileCapabilities(
    activeContainer,
    withdrawnContainer,
    profile && Array.isArray(profile.capabilities) ? profile.capabilities : [],
  );
}

// =====================================================
// ARCHIE MEMORY HELPERS
// =====================================================

function getLocalDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function getYesterdayDateKey() {
  const yesterday = new Date();

  yesterday.setDate(yesterday.getDate() - 1);

  return getLocalDateKey(yesterday);
}

function getArchieVisitMessage() {
  if (
    typeof PersonalitySystem !== "undefined" &&
    typeof PersonalitySystem.getArchieVisitMessage === "function"
  ) {
    return PersonalitySystem.getArchieVisitMessage();
  }
  const totalVisits = Number(founder.memory?.totalVisits) || 0;

  if (totalVisits === 1) {
    return "This is your first command session. Your mission begins here.";
  }

  if (totalVisits === 2) {
    return "Welcome back. The bridge remembers your first command session.";
  }

  if (totalVisits > 2 && totalVisits <= 5) {
    return `Command session ${totalVisits} is now active. Let's keep building momentum.`;
  }

  if (totalVisits > 5) {
    return `Welcome back. This is command session ${totalVisits}.`;
  }

  return "";
}

function getArchieMissionMemory() {
  if (
    typeof PersonalitySystem !== "undefined" &&
    typeof PersonalitySystem.getArchieMissionMemory === "function"
  ) {
    return PersonalitySystem.getArchieMissionMemory();
  }
  const memory = founder.memory;

  if (!memory || !memory.lastMissionDate) {
    return "";
  }

  const today = getLocalDateKey();
  const yesterday = getYesterdayDateKey();

  const objectiveCount = Number(memory.lastCompletedTaskCount) || 0;

  const missionXP = Number(memory.lastMissionXP) || 0;

  const objectiveWord = objectiveCount === 1 ? "objective" : "objectives";

  if (memory.lastMissionDate === today) {
    return `Today's mission was archived with ${objectiveCount} ${objectiveWord} completed and ${missionXP} XP earned.`;
  }

  if (memory.lastMissionDate === yesterday) {
    return `Yesterday you completed ${objectiveCount} ${objectiveWord} and earned ${missionXP} XP. Today's mission is ready.`;
  }

  return `Your last archived mission earned ${missionXP} XP. Let's continue building momentum.`;
}

function getArchieDailyBrief() {
  const missionMemory = getArchieMissionMemory();

  if (missionMemory) {
    return missionMemory;
  }

  const visitMessage = getArchieVisitMessage();

  if (visitMessage) {
    return visitMessage;
  }

  if (
    typeof PersonalitySystem !== "undefined" &&
    typeof PersonalitySystem.getArchieGenericBrief === "function"
  ) {
    return PersonalitySystem.getArchieGenericBrief();
  }

  const today = new Date().toDateString();

  let dateNumber = 0;

  for (let index = 0; index < today.length; index += 1) {
    dateNumber += today.charCodeAt(index);
  }

  const archieBriefs = [
    "Today's mission is ready. Let's create meaningful progress.",
    "Small wins become powerful systems when repeated consistently.",
    "Progress beats perfection. Choose one objective and begin.",
    "Every founder starts as an Explorer. Keep moving forward.",
    "Your future is built one completed mission at a time.",
    "Consistency compounds faster than motivation.",
    "Today's effort becomes tomorrow's opportunity.",
    "Let's build something worth remembering.",
  ];

  const briefIndex = dateNumber % archieBriefs.length;

  return archieBriefs[briefIndex];
}

function updateArchieDashboard() {
  const heroGreetingText = getArchieGreeting();
  const heroBriefText = getArchieDailyBrief();

  // Type the hero greeting and brief immediately (letter-by-letter)
  const heroEl = document.getElementById("greeting");
  const heroSub = document.querySelector(".hero-sub");

  // mark hero as initialized to avoid duplicate queued retyping
  Archie.heroInitialized = true;

  // Prefer routing hero delivery through CommunicationSystem so the
  // hero greeting/brief share the same queue as other transmissions.
  // Falls back to Archie's direct typing if CommunicationSystem is
  // unavailable. CommunicationSystem.deliver() still delegates to
  // Archie.deliver()/typeMessage() internally, so wording, timing,
  // and visual effects (holo/typing/status) remain unchanged.
  const useCommunicationSystem =
    typeof CommunicationSystem !== "undefined" &&
    typeof CommunicationSystem.send === "function";

  if (heroEl) {
    if (useCommunicationSystem) {
      // fire-and-forget so the page load isn't blocked
      CommunicationSystem.send({
        text: heroGreetingText,
        target: "hero-greeting",
      });
    } else {
      Archie.typeMessage(heroEl, heroGreetingText);
    }
  }

  if (heroSub) {
    // brief types shortly after the greeting starts for a natural cadence
    setTimeout(() => {
      if (useCommunicationSystem) {
        CommunicationSystem.send({
          text: heroBriefText,
          target: "hero-brief",
        });
      } else {
        Archie.typeMessage(heroSub, heroBriefText);
      }
    }, 600);
  }

  const archieGreeting = document.getElementById("archie-greeting");
  const archieDailyBrief = document.getElementById("archie-daily-brief");

  if (archieGreeting) {
    archieGreeting.textContent = heroGreetingText;
  }

  if (archieDailyBrief) {
    archieDailyBrief.textContent = heroBriefText;
  }
}

// =====================================================
// COACHING SYNTHESIS UI (Phase 8.3, v1)
// Display-only surface over canonical buildCoachingSynthesis.
// =====================================================

function renderCoachingSynthesis(container, synthesis) {
  container.innerHTML = "";
  if (
    synthesis &&
    Array.isArray(synthesis.insights) &&
    synthesis.insights.length > 0
  ) {
    const fragment = document.createDocumentFragment();
    synthesis.insights.forEach((insight) => {
      const record = document.createElement("article");
      record.className = "mission-record coaching-synthesis-record";
      record.innerHTML = `
        <header class="mission-record-header">
          <div>
            <span class="mission-record-label">COACHING SYNTHESIS · E4</span>
            <h3 class="coaching-synthesis-label"></h3>
          </div>
        </header>
        <div class="mission-record-content">
          <p class="coaching-synthesis-observation"></p>
        </div>
      `;
      record.querySelector(".coaching-synthesis-label").textContent =
        insight.label;
      record.querySelector(".coaching-synthesis-observation").textContent =
        insight.observation;
      fragment.appendChild(record);
    });
    container.appendChild(fragment);
    return;
  }
  container.innerHTML = `
    <div class="command-log-empty">
      <span class="empty-log-icon">🔁</span>
      <div>
        <strong>No coaching synthesis yet.</strong>
        <p>Insights will appear here after you confirm a recurring behavioral pattern across reviewed interactions.</p>
      </div>
    </div>
  `;
}

function updateCoachingSynthesis() {
  const container = document.getElementById("coaching-synthesis");
  if (!container) return;
  let reports = [];
  let behavioralEvidenceReviewContainer = null;
  let behavioralPatternReviewContainer = null;
  if (
    typeof founder !== "undefined" &&
    founder.memory &&
    founder.memory.artifacts
  ) {
    const reportsArtifact = founder.memory.artifacts["camping.fieldReports"];
    if (reportsArtifact && Array.isArray(reportsArtifact.reports)) {
      reports = reportsArtifact.reports;
    }
    behavioralEvidenceReviewContainer =
      founder.memory.artifacts["camping.behavioralEvidenceReviews"] || null;
    behavioralPatternReviewContainer =
      founder.memory.artifacts["camping.behavioralPatternReviews"] || null;
  }
  try {
    if (
      typeof MissionIntelligenceSystem === "undefined" ||
      typeof MissionIntelligenceSystem.buildCoachingSynthesis !== "function"
    ) {
      container.innerHTML = `
        <div class="command-log-empty">
          <span class="empty-log-icon">🔁</span>
          <div>
            <strong>Coaching synthesis is temporarily unavailable.</strong>
          </div>
        </div>
      `;
      return;
    }
    const synthesis = MissionIntelligenceSystem.buildCoachingSynthesis(
      reports,
      behavioralEvidenceReviewContainer,
      behavioralPatternReviewContainer,
    );
    renderCoachingSynthesis(container, synthesis);
  } catch (e) {
    console.warn("Coaching synthesis unavailable:", e);
    container.innerHTML = `
      <div class="command-log-empty">
        <span class="empty-log-icon">🔁</span>
        <div>
          <strong>Coaching synthesis is temporarily unavailable.</strong>
        </div>
      </div>
    `;
  }
}
