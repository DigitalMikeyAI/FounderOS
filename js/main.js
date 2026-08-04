// =====================================================
// FounderOS MISSION CONTROL v0.3
// ARCHIE CORE SYSTEM
// DOM + DATA + MEMORY
// =====================================================

// =====================================================
// DOM CONNECTIONS
// =====================================================

const launchScreen = document.getElementById("launch-screen");
const beginMissionButton = document.getElementById("begin-mission");
const launchMessage = document.getElementById("launch-message");
const missionBriefing = document.getElementById("mission-briefing");
const missionChoices = document.querySelectorAll(".mission-choice");
const experienceChoices = document.querySelectorAll(".experience-choice");
const experienceQuestion = document.getElementById("experience-question");
const archieMessage = document.getElementById("archie-message");
const missionResult = document.getElementById("mission-result");
const missionTitle = document.getElementById("mission-title");
const missionDescription = document.getElementById("mission-description");
const acceptMission = document.getElementById("accept-mission");

// =====================================================
// EXPLORER PATH SELECTION
// Question 001
// =====================================================

missionChoices.forEach((choice) => {
  choice.addEventListener("click", () => {
    founder.missionGoal = choice.textContent;

    if (typeof CommanderSystem !== "undefined" && typeof CommanderSystem.save === "function") {
      CommanderSystem.save();
    } else {
      saveFounder();
    }

    let response;


    if (choice.textContent.includes("Business")) {
      response =
        "Excellent choice, Explorer. Every empire begins with a foundation. Archie will help you create the systems, strategy, and first steps needed to launch.";
    } else if (choice.textContent.includes("Audience")) {
      response =
        "Powerful choice. Your audience is your mission crew. We will build your content system and learn how to attract the right people.";
    } else if (choice.textContent.includes("AI")) {
      response =
        "Perfect choice. AI is your mission equipment. Archie will help you master the tools that allow you to build faster.";
    } else if (choice.textContent.includes("Workflow")) {
      response =
        "Excellent thinking. Systems create freedom. We will identify opportunities to automate and improve your daily operations.";
    } else {
      response =
        "That is exactly why Archie exists. We will explore possibilities until we discover your path.";
    }

    archieMessage.textContent = response;

    missionChoices.forEach((button) => {
      button.style.display = "none";
    });

    experienceQuestion.style.display = "block";
  });
});

// =====================================================
// EXPERIENCE SELECTION
// Question 002
// =====================================================

experienceChoices.forEach((choice) => {
  choice.addEventListener("click", () => {
    founder.experienceLevel = choice.textContent;

    if (typeof CommanderSystem !== "undefined" && typeof CommanderSystem.save === "function") {
      CommanderSystem.save();
    } else {
      saveFounder();
    }

    experienceQuestion.style.display = "none";


    const mission = generateMission();

    missionTitle.textContent = mission.title;

    missionDescription.textContent = mission.description;

    missionResult.style.display = "block";

    archieMessage.textContent = `Excellent, Explorer. Archie understands your starting point.

Your path will be designed around:
${founder.experienceLevel}`;
  });
});

// =====================================================
// ACCEPT FIRST MISSION
// =====================================================

acceptMission.addEventListener("click", async () => {
  missionBriefing.style.display = "none";

  founder.onboardingComplete = true;

  founder.currentMission = "Discover Your Direction";

  founder.missionDescription =
    "Explore your strengths and identify your first opportunity.";

  founder.missionReward = 100;

  founder.missionStatus = "active";

  founder.missionObjectives = [
    "Explore your interests",
    "Identify your strengths",
    "Choose your first direction",
  ];

  generateObjectives();

  updateActiveMission();

  updateMissionChecklist();

  if (typeof CommanderSystem !== "undefined" && typeof CommanderSystem.save === "function") {
    CommanderSystem.save();
  } else {
    saveFounder();
  }

  await ArchieCore.refreshSession();


  Archie.speak(
    `🚀 Mission Accepted, Explorer.

Your journey has officially begun.

Your first objectives are ready.
Let's build something incredible.`,
  );
});

// =====================================================
// CORE SUPPORT SYSTEMS
// Storage, Launch, UI, Founder Progress
// =====================================================

let launchTimers = [];

// =====================================================
// LAUNCH SEQUENCE
// =====================================================

function startLaunchSequence() {
  launchTimers.forEach((timer) => clearTimeout(timer));
  launchTimers = [];

  if (!launchMessage) {
    return;
  }

  launchMessage.textContent = "Initializing Mission Control...";

  launchTimers.push(
    setTimeout(() => {
      launchMessage.textContent = "🛰️ Establishing command uplink...";
    }, 1200),
  );

  launchTimers.push(
    setTimeout(() => {
      launchMessage.textContent = "🤖 Archie online. Welcome, Explorer.";
    }, 2500),
  );

  launchTimers.push(
    setTimeout(() => {
      launchMessage.textContent = "Your mission begins with one question...";
    }, 4000),
  );
}

// =====================================================
// MISSION CONTROL MEMORY SYSTEM
// Returning Explorer Logic
// =====================================================

function restoreMissionControl() {
  updateFounderLevel();

  updateFounderDisplay();

  if (founder.onboardingComplete) {
    // Explorer already boarded

    launchScreen.style.display = "none";

    missionBriefing.style.display = "none";

    if (founder.currentMission) {
      updateActiveMission();
    }

    if (founder.missionObjectives.length > 0) {
      updateMissionChecklist();
    }

    // Show the small Archie notification popup for returning users
    showNotification(`🚀 Welcome back, Explorer.

  Mission Control has restored your progress.

  Your mission is waiting.`);
  } else {
    // New Explorer

    launchScreen.style.display = "flex";

    missionBriefing.style.display = "none";

    startLaunchSequence();
  }
}

// =====================================================
// LAUNCH BUTTON
// Begins Explorer Boarding
// =====================================================

beginMissionButton.addEventListener("click", () => {
  launchScreen.style.display = "none";

  missionBriefing.style.display = "flex";
});

// =====================================================
// START MISSION CONTROL
// Archie Core is now the canonical session entry point.
// Existing systems remain available through compatibility wrappers.
// =====================================================

async function startMissionControl() {
  if (
    typeof ArchieCore === "undefined" ||
    typeof ArchieCore.beginSession !== "function"
  ) {
    console.error(
      "🔴 Archie Core is unavailable. Mission Control cannot begin safely.",
    );

    return;
  }

  await ArchieCore.beginSession();

  // Initialize UI controllers
  WorkshopController.initialize();

  console.log("Loaded founder:", founder);
  console.log("Onboarding complete:", founder.onboardingComplete);
  console.log("Archie memory:", founder.memory);
  console.log("Archie Core:", ArchieCore.getSnapshot());
}

startMissionControl();

// Trigger Archie hologram pop after mission control restores
function triggerArchieHologram(delay = 700) {
  const el = document.querySelector(".archie-core");
  if (!el) return;

  // Remove any previous classes
  el.classList.remove("holo-active");

  // Small timeout to allow CSS to settle
  setTimeout(() => {
    el.classList.add("holo-active");
    const avatar = el.querySelector(".archie-avatar");
    if (avatar) {
      avatar.classList.add("pop-active");
      // remove pop-active after the avatar pop completes
      setTimeout(() => avatar.classList.remove("pop-active"), 700);
    }
  }, delay);
}

// Auto-trigger on load; safe no-op if element missing
setTimeout(() => {
  try {
    // shorter startup delay so messages and visual cues appear quickly
    triggerArchieHologram(120);
  } catch (e) {
    console.warn("Archie hologram trigger failed", e);
  }
}, 120);

// Emergency animation toggle: disable decorative animations to prevent flashing
function disableBridgeAnimations() {
  try {
    document.body.classList.add("reduced-motion");
    console.info("Bridge animations disabled (reduced-motion applied)");
  } catch (e) {
    console.warn("Failed to disable animations", e);
  }
}

function enableBridgeAnimations() {
  try {
    document.body.classList.remove("reduced-motion");
    console.info("Bridge animations enabled");
  } catch (e) {
    console.warn("Failed to enable animations", e);
  }
}

// Animation helpers remain available for manual console/debug use.
// Call `enableBridgeAnimations()` in the console to restore animations.
// disableBridgeAnimations();

// Debug helper: reopen the launch screen and play the launch sequence
window.showLaunchScreen = function showLaunchScreen() {
  try {
    if (!launchScreen) return;
    launchScreen.style.display = "flex";
    missionBriefing.style.display = "none";
    startLaunchSequence();
  } catch (e) {
    console.warn("showLaunchScreen failed", e);
  }
};
