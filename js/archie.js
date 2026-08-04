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
      this.targets.briefing = document.getElementById("archie-message");

      this.targets.dashboardGreeting = document.getElementById("archie-greeting");

      this.targets.dashboardBrief = document.getElementById("archie-daily-brief");

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

    this.queue.push(transmission);

    this.processQueue();
  },

  // Backward compatibility:
  // Existing Archie.speak() calls continue working.
  speak(message) {
    this.say(message, {
      target: "notification",
    });
  },

  // =====================================================
  // MESSAGE QUEUE
  // Prevents Archie messages from overlapping
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
      await this.typeMessage(
        this.targets.notificationMessage,
        text,
        { force: transmission.force },
      );

      return;
    }

    // Keep notifications instant for now.
    showNotification(text);

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
  // sequentially and then continue processing the main queue.
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

function getArchieGreeting() {
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

// =====================================================
// ARCHIE COMMAND LOG NOTES
// =====================================================

function generateArchieLogNote() {
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

  const today = new Date().toDateString();

  let dateNumber = 0;

  for (let index = 0; index < today.length; index += 1) {
    dateNumber += today.charCodeAt(index);
  }

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


