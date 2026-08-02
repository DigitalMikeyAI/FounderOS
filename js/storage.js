// =====================================================
// STORAGE CONFIGURATION
// =====================================================

const FOUNDER_STORAGE_KEY = "digitalMikeyFounder";
const LEGACY_FOUNDER_STORAGE_KEY = "founder";

// =====================================================
// EXPLORER PROFILE
// =====================================================

const founder = {
  name: "Explorer",

  level: 1,

  title: "Explorer",

  missionGoal: "",

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
    strengths: [],

    interests: [],

    skills: [],

    goals: [],

    values: [],

    learningStyle: "",

    confidenceAreas: [],

    growthAreas: [],
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

function loadFounder() {
  const savedFounder =
    localStorage.getItem(FOUNDER_STORAGE_KEY) ||
    localStorage.getItem(LEGACY_FOUNDER_STORAGE_KEY);

  if (!savedFounder) {
    saveFounder();
    return;
  }

  try {
    const parsedFounder = JSON.parse(savedFounder);

    Object.assign(founder, parsedFounder);

    if (!Array.isArray(founder.missionObjectives)) {
      founder.missionObjectives = [];
    }

    if (typeof founder.onboardingComplete !== "boolean") {
      founder.onboardingComplete = false;
    }

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

    saveFounder();
  } catch (error) {
    console.error("Founder data could not be loaded:", error);
    saveFounder();
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

function loadAchievements() {
  // Achievement loading will be implemented later.
}
