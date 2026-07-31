// =====================================================
// FOUNDEROS
// COMMUNICATION SYSTEM
// Archie Core v0.3
//
// Responsibilities:
// • Register Archie communication targets
// • Normalize transmissions
// • Queue messages
// • Deliver messages to the correct target
// • Prevent overlapping transmissions
//
// Migration rule:
// Existing Archie communication remains operational while
// responsibilities are moved here gradually.
// =====================================================

const CommunicationSystem = {
  version: "0.1.0",

  initialized: false,

  targets: {
    briefing: null,
    dashboardGreeting: null,
    dashboardBrief: null,
    heroGreeting: null,
    heroBrief: null,
    notification: null,
    notificationMessage: null,
    statusLight: null,
    statusText: null,
  },

  queue: [],

  isBusy: false,

  paused: false,

  typingSpeed: 45,

  cursorCharacter: "▋",

  // =====================================================
  // INITIALIZATION
  // =====================================================

  initialize() {
    if (this.initialized) {
      return;
    }

    this.registerTargets();

    this.initialized = true;

    console.log("📡 Communication System initialized.");
  },

  // =====================================================
  // TARGET REGISTRATION
  // Archie-related DOM connections belong here.
  // =====================================================

  registerTargets(customTargets = {}) {
    const defaultTargets = {
      briefing: document.getElementById("archie-message"),

      dashboardGreeting: document.getElementById("archie-greeting"),

      dashboardBrief: document.getElementById("archie-daily-brief"),

      heroGreeting: document.getElementById("greeting"),

      heroBrief: document.querySelector(".hero-sub"),

      notification: document.getElementById("system-notification"),

      notificationMessage: document.getElementById(
        "notification-message",
      ),

      statusLight: document.getElementById("archie-status-light"),

      statusText: document.getElementById("archie-status-text"),
    };

    this.targets = {
      ...defaultTargets,
      ...customTargets,
    };

    return this.targets;
  },

  // =====================================================
  // PUBLIC COMMUNICATION API
  // =====================================================

  send(message, options = {}) {
    const transmission = this.normalizeTransmission(message, options);

    if (!transmission) {
      return false;
    }

    this.queue.push(transmission);

    this.processQueue();

    return true;
  },

  // =====================================================
  // TRANSMISSION NORMALIZATION
  // Allows both:
  //
  // CommunicationSystem.send("Hello");
  //
  // CommunicationSystem.send({
  //   text: "Hello",
  //   target: "dashboard",
  //   delay: 500
  // });
  // =====================================================

  normalizeTransmission(message, options = {}) {
    let transmission;

    if (typeof message === "string") {
      transmission = {
        text: message,
        target: options.target || "notification",
        delay: Number(options.delay) || 0,
        priority: options.priority || "normal",
        force: Boolean(options.force),
      };
    } else if (message && typeof message === "object") {
      transmission = {
        text: message.text || "",
        target: message.target || options.target || "notification",
        delay: Number(message.delay ?? options.delay) || 0,
        priority:
          message.priority || options.priority || "normal",
        force: Boolean(message.force ?? options.force),
      };
    } else {
      return null;
    }

    transmission.text = String(transmission.text).trim();

    if (!transmission.text) {
      return null;
    }

    return transmission;
  },

  // =====================================================
  // MESSAGE QUEUE
  // =====================================================

  async processQueue() {
    if (this.paused || this.isBusy || this.queue.length === 0) {
      return;
    }

    this.isBusy = true;

    const transmission = this.queue.shift();

    try {
      if (transmission.delay > 0) {
        await this.wait(transmission.delay);
      }

      await this.deliver(transmission);
    } catch (error) {
      console.error(
        "Communication System transmission failed:",
        error,
      );
    } finally {
      this.isBusy = false;

      this.processQueue();
    }
  },

  // =====================================================
  // DELIVERY
  // Temporary bridge:
  // Archie still performs the existing visual delivery.
  //
  // We will move Archie's deliver/typeMessage logic here
  // later without changing visible behavior.
  // =====================================================

  async deliver(transmission) {
    if (
      typeof Archie !== "undefined" &&
      typeof Archie.deliver === "function"
    ) {
      await Archie.deliver(transmission);
      return;
    }

    const target = this.resolveTarget(transmission.target);

    if (!target) {
      console.warn(
        `Communication target not found: ${transmission.target}`,
      );

      console.log(`ARCHIE: ${transmission.text}`);

      return;
    }

    target.textContent = transmission.text;
  },

  // =====================================================
  // TARGET RESOLUTION
  // Maps friendly communication names to DOM targets.
  // =====================================================

  resolveTarget(targetName) {
    const targetMap = {
      briefing: this.targets.briefing,

      dashboard: this.targets.dashboardBrief,

      "dashboard-greeting": this.targets.dashboardGreeting,

      "dashboard-brief": this.targets.dashboardBrief,

      "hero-greeting": this.targets.heroGreeting,

      "hero-brief": this.targets.heroBrief,

      notification: this.targets.notificationMessage,

      status: this.targets.statusText,
    };

    return targetMap[targetName] || null;
  },

  // =====================================================
  // PAUSE / RESUME
  // Used when modal windows or notifications temporarily
  // block Archie from continuing his message queue.
  // =====================================================

  pause() {
    this.paused = true;
  },

  resume() {
    this.paused = false;

    this.processQueue();
  },

  // =====================================================
  // QUEUE UTILITIES
  // =====================================================

  clearQueue() {
    this.queue.length = 0;
  },

  getQueueLength() {
    return this.queue.length;
  },

  // =====================================================
  // GENERAL UTILITIES
  // =====================================================

  wait(milliseconds) {
    return new Promise((resolve) => {
      setTimeout(resolve, milliseconds);
    });
  },
};