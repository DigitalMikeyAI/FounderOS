// =====================================================
// STORAGE CONFIGURATION
// =====================================================

const FOUNDER_STORAGE_KEY = "digitalMikeyFounder";
const LEGACY_FOUNDER_STORAGE_KEY = "founder";
const COMMANDER_PROFILE_SCHEMA_VERSION = "COMMANDER_PROFILE_SCHEMA_v1";

// =====================================================
// EXPLORER PROFILE
// =====================================================

const founder = {
  name: "Explorer",

  level: 1,

  title: "Explorer",

  missionGoal: "",

  pendingMissionRequest: null,

  experienceLevel: "Beginner",

  xp: 0,

  streak: 0,

  videosPublished: 0,

  followers: 0,

  revenue: 0,

  currentMission: "",

  missionDescription: "",

  missionReward: 0,

  missionStatus: "inactive",

  missionObjectives: [],

  missionObjectiveCompletion: [],

  // =====================================================
  // COMMANDER INTELLIGENCE
  // =====================================================

  onboardingComplete: false,

  memory: {
    firstVisit: "",
    lastVisit: "",
    totalVisits: 0,

    lastMissionDate: "",
    lastMissionXP: 0,
    lastCompletedTaskCount: 0,
    lastCompletedTasks: [],

    artifacts: {},
  },

  // =====================================================
  // COMMANDER PROFILE
  // Living understanding of the Commander
  // =====================================================

  profile: {
    schemaVersion: COMMANDER_PROFILE_SCHEMA_VERSION,

    strengths: [],

    interests: [],

    skills: [],

    goals: [],

    values: [],

    learningStyle: "",

    confidenceAreas: [],

    growthAreas: [],

    capabilities: [],
  },

  // =====================================================
  // COMMAND LOG
  // =====================================================

  commandLog: [],
};

// =====================================================
// FOUNDER STORAGE
// =====================================================

function saveFounder() {
  localStorage.setItem(FOUNDER_STORAGE_KEY, JSON.stringify(founder));
  localStorage.setItem(LEGACY_FOUNDER_STORAGE_KEY, JSON.stringify(founder));
}

function normalizeCommanderProfile(profile = null) {
  const source =
    profile && typeof profile === "object" && !Array.isArray(profile)
      ? profile
      : {};
  return {
    ...source,
    schemaVersion: COMMANDER_PROFILE_SCHEMA_VERSION,
    strengths: Array.isArray(source.strengths) ? source.strengths : [],
    interests: Array.isArray(source.interests) ? source.interests : [],
    skills: Array.isArray(source.skills) ? source.skills : [],
    goals: Array.isArray(source.goals) ? source.goals : [],
    values: Array.isArray(source.values) ? source.values : [],
    learningStyle:
      typeof source.learningStyle === "string" ? source.learningStyle : "",
    confidenceAreas: Array.isArray(source.confidenceAreas)
      ? source.confidenceAreas
      : [],
    growthAreas: Array.isArray(source.growthAreas) ? source.growthAreas : [],
    capabilities: Array.isArray(source.capabilities)
      ? source.capabilities.map((capability) =>
          capability && typeof capability === "object"
            ? JSON.parse(JSON.stringify(capability))
            : capability,
        )
      : [],
  };
}

function validateCommanderProfileCapability(capability = null) {
  try {
    if (!capability || typeof capability !== "object") {
      return { valid: false, reason: "invalid-capability" };
    }
    const canonicalCompetencies = new Set([
      "rapport",
      "discovery",
      "product-selection",
      "presentation",
      "objection-handling",
      "trial-close",
    ]);
    const competency =
      typeof capability.competency === "string"
        ? capability.competency.trim()
        : "";
    if (!canonicalCompetencies.has(competency)) {
      return { valid: false, reason: "invalid-capability-competency" };
    }
    if (
      capability.id !== `profile_capability_${competency}` ||
      capability.type !== "developing-capability"
    ) {
      return { valid: false, reason: "invalid-capability-identity" };
    }
    if (!["active", "withdrawn"].includes(capability.status)) {
      return { valid: false, reason: "invalid-capability-status" };
    }
    if (
      ![
        "current",
        "support-changed",
        "insufficient-current-support",
      ].includes(capability.evidenceSupportState)
    ) {
      return { valid: false, reason: "invalid-evidence-support-state" };
    }
    if (
      typeof capability.label !== "string" ||
      capability.label.trim().length === 0 ||
      typeof capability.adoptedAt !== "string" ||
      capability.adoptedAt.trim().length === 0 ||
      capability.adoptedBy !== "commander" ||
      typeof capability.adoptedWording !== "string" ||
      capability.adoptedWording.trim().length === 0
    ) {
      return { valid: false, reason: "invalid-capability-adoption" };
    }
    if (
      (capability.status === "active" &&
        capability.withdrawnAt !== null) ||
      (capability.status === "withdrawn" &&
        (typeof capability.withdrawnAt !== "string" ||
          capability.withdrawnAt.trim().length === 0))
    ) {
      return { valid: false, reason: "invalid-capability-withdrawal" };
    }
    const provenance = capability.provenance;
    const requiredProvenanceFields = [
      "candidateId",
      "candidateVersionIdentity",
      "patternId",
      "patternVersionIdentity",
      "patternReviewId",
      "decisionId",
    ];
    if (
      !provenance ||
      typeof provenance !== "object" ||
      requiredProvenanceFields.some(
        (field) =>
          typeof provenance[field] !== "string" ||
          provenance[field].trim().length === 0,
      ) ||
      !Array.isArray(provenance.contributorActiveIdentities) ||
      provenance.contributorActiveIdentities.length === 0 ||
      provenance.contributorActiveIdentities.some(
        (identity) =>
          typeof identity !== "string" || identity.trim().length === 0,
      )
    ) {
      return { valid: false, reason: "invalid-capability-provenance" };
    }
    return {
      valid: true,
      capability: JSON.parse(JSON.stringify(capability)),
    };
  } catch (error) {
    return { valid: false, reason: "capability-validation-failed" };
  }
}

function loadFounder() {
  const savedFounder =
    localStorage.getItem(FOUNDER_STORAGE_KEY) ||
    localStorage.getItem(LEGACY_FOUNDER_STORAGE_KEY);

  if (!savedFounder) {
    // No saved Founder exists. Leave the in-memory default Founder
    // available. Do NOT persist defaults — that would mask accidental
    // origin changes (e.g. localhost vs 127.0.0.1) as legitimate state.
    return;
  }

  try {
    const parsedFounder = JSON.parse(savedFounder);

    Object.assign(founder, parsedFounder);

    if (!Array.isArray(founder.missionObjectives)) {
      founder.missionObjectives = [];
    }

    if (!Array.isArray(founder.missionObjectiveCompletion)) {
      founder.missionObjectiveCompletion = [];
    }

    if (typeof founder.onboardingComplete !== "boolean") {
      founder.onboardingComplete = false;
    }

    founder.profile = normalizeCommanderProfile(founder.profile);

    if (!founder.memory || typeof founder.memory !== "object") {
      founder.memory = {};
    }

    founder.memory = {
      firstVisit: founder.memory.firstVisit || "",
      lastVisit: founder.memory.lastVisit || "",
      totalVisits: Number(founder.memory.totalVisits) || 0,

      lastMissionDate: founder.memory.lastMissionDate || "",
      lastMissionXP: Number(founder.memory.lastMissionXP) || 0,

      lastCompletedTaskCount:
        Number(founder.memory.lastCompletedTaskCount) || 0,

      lastCompletedTasks: Array.isArray(founder.memory.lastCompletedTasks)
        ? founder.memory.lastCompletedTasks
        : [],

      artifacts:
        founder.memory.artifacts && typeof founder.memory.artifacts === "object"
          ? founder.memory.artifacts
          : {},
    };

    if (!Array.isArray(founder.commandLog)) {
      founder.commandLog = [];
    }
  } catch (error) {
    console.error("Founder data could not be loaded:", error);
    // Do NOT overwrite or delete the stored value. Leave the in-memory
    // default Founder available. Do NOT call saveFounder().
  }
}

// =====================================================
// ARCHIE COMMAND SESSION MEMORY
// Records one visit per browser tab session
// =====================================================

function recordFounderVisit() {
  const sessionRecorded = sessionStorage.getItem("founderOSVisitRecorded");

  if (sessionRecorded) {
    return;
  }

  const now = new Date().toISOString();

  if (!founder.memory.firstVisit) {
    founder.memory.firstVisit = now;
  }

  founder.memory.lastVisit = now;

  founder.memory.totalVisits = (Number(founder.memory.totalVisits) || 0) + 1;

  sessionStorage.setItem("founderOSVisitRecorded", "true");

  saveFounder();
}

// =====================================================
// RETURNING-USER WELCOME — TAB-SESSION DELIVERY STATE
// Safe fallback when sessionStorage is unavailable: report "not shown"
// so startup remains usable, even though the welcome may repeat.
// =====================================================

function hasShownSessionWelcome() {
  try {
    return sessionStorage.getItem("founderOSSessionWelcomeShown") === "true";
  } catch (error) {
    return false;
  }
}

function markSessionWelcomeShown() {
  try {
    sessionStorage.setItem("founderOSSessionWelcomeShown", "true");
    return true;
  } catch (error) {
    return false;
  }
}

// =====================================================
// SESSION SIGNAL DELIVERY STATE
// One typed marker per deterministic signal and browser tab.
// =====================================================

const FOUNDEROS_SESSION_SIGNAL_TYPES = new Set([
  "learning",
  "coaching",
  "repeatedCoaching",
  "behavioralEvidence",
]);

function getSessionSignalKey(type, signalId) {
  const normalizedType = typeof type === "string" ? type.trim() : "";
  const normalizedSignalId =
    typeof signalId === "string" ? signalId.trim() : "";

  if (
    !FOUNDEROS_SESSION_SIGNAL_TYPES.has(normalizedType) ||
    !/^[A-Za-z0-9_-]+$/.test(normalizedSignalId)
  ) {
    return null;
  }

  return `founderOSSessionSignal:${normalizedType}:${normalizedSignalId}`;
}

function hasSurfacedSessionSignal(type, signalId) {
  const key = getSessionSignalKey(type, signalId);

  if (!key) {
    return false;
  }

  try {
    return sessionStorage.getItem(key) === "true";
  } catch (error) {
    return false;
  }
}

function markSessionSignalSurfaced(type, signalId) {
  const key = getSessionSignalKey(type, signalId);

  if (!key) {
    return false;
  }

  try {
    sessionStorage.setItem(key, "true");
    return true;
  } catch (error) {
    return false;
  }
}

function loadAchievements() {
  // Achievement loading will be implemented later.
}
