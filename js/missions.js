const activeMissionTitle = document.getElementById("active-mission-title");

const activeMissionDescription = document.getElementById(
  "active-mission-description",
);

// =====================================================
// MISSION MODULE STATE
// =====================================================

let tasks = [];

// =====================================================
// ARCHIE MISSION GENERATOR
// =====================================================

function generateMission() {
  const mission = {
    title: "",
    description: "",
    reward: 100,
  };

  const missionGoal = founder.missionGoal || "";

  if (missionGoal.includes("AI")) {
    mission.title = "Your First AI Workflow";
    mission.description =
      "Choose an AI tool, test its abilities, and create your first repeatable system.";
  } else if (missionGoal.includes("Business")) {
    mission.title = "Build Your Foundation";
    mission.description =
      "Define your idea, identify your audience, and create the first version of your roadmap.";
  } else if (missionGoal.includes("Audience")) {
    mission.title = "Launch Your Content Engine";
    mission.description =
      "Create your first content system and publish your first piece of valuable content.";
  } else if (missionGoal.includes("Workflow")) {
    mission.title = "Design Your First System";
    mission.description =
      "Find a repetitive task and improve it with automation.";
  } else {
    mission.title = "Discover Your Direction";
    mission.description =
      "Explore your strengths and identify your first opportunity.";
  }

  founder.currentMission = mission.title;
  founder.missionDescription = mission.description;
  founder.missionReward = mission.reward;

  saveFounder();

  return mission;
}

// =====================================================
// OBJECTIVE GENERATOR
// =====================================================

function generateObjectives() {
  const currentMission = founder.currentMission || "";

  let objectives = [];

  if (currentMission.includes("AI Workflow")) {
    objectives = [
      "Choose your first AI tool",
      "Complete your first AI experiment",
      "Create your first repeatable workflow",
      "Document what you learned",
    ];
  } else if (currentMission.includes("Foundation")) {
    objectives = [
      "Define your business idea",
      "Identify your target audience",
      "Research your first opportunity",
      "Create your first action plan",
    ];
  } else if (currentMission.includes("Content")) {
    objectives = [
      "Choose your content topic",
      "Create your first script",
      "Record your first piece of content",
      "Publish your first post",
    ];
  } else if (currentMission.includes("System")) {
    objectives = [
      "Identify a repetitive task",
      "Choose an improvement tool",
      "Build your first automation",
      "Review your results",
    ];
  } else {
    objectives = [
      "Explore your interests",
      "Identify your strengths",
      "Choose your first direction",
    ];
  }

  founder.missionObjectives = objectives;

  saveFounder();

  return objectives;
}

// =====================================================
// ACTIVE MISSION DISPLAY
// =====================================================

function updateActiveMission() {
  if (activeMissionTitle) {
    activeMissionTitle.textContent =
      founder.currentMission || "Awaiting Mission";
  }

  if (activeMissionDescription) {
    activeMissionDescription.textContent =
      founder.missionDescription ||
      "Complete onboarding to receive your first mission.";
  }
}

// =====================================================
// DYNAMIC MISSION CHECKLIST
// Archie Generated Objectives
// =====================================================

function updateMissionChecklist() {
  const container = document.getElementById("mission-task-container");

  if (!container) {
    return;
  }

  container.innerHTML = "";

  tasks = [];

  const objectives = Array.isArray(founder.missionObjectives)
    ? founder.missionObjectives
    : [];

  objectives.forEach((objective, index) => {
    const div = document.createElement("div");

    div.className = "task";

    div.innerHTML = `
      <input
        type="checkbox"
        class="mission-task"
        id="objective-${index}"
        data-xp="25"
      />

      <label for="objective-${index}">
        ${objective}
      </label>
    `;

    container.appendChild(div);
  });

  tasks = document.querySelectorAll(".mission-task");

  activateTaskListeners();
}

// =====================================================
// TASK LISTENER SYSTEM
// Handles Dynamic Tasks
// =====================================================

function activateTaskListeners() {
  tasks.forEach((task) => {
    const saved = localStorage.getItem(task.id);

    if (saved === "true") {
      task.checked = true;
    }

    task.addEventListener("change", () => {
      localStorage.setItem(
        task.id,

        task.checked,
      );

      updateXP();

      updateMissionStatus();

      updateMissionProgress();
    });
  });
}
