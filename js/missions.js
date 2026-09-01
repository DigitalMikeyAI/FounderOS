const activeMissionTitle = document.getElementById("active-mission-title");

const activeMissionDescription = document.getElementById(
  "active-mission-description",
);
const missionObjectiveSummary = document.getElementById(
  "mission-objective-summary",
);

// =====================================================
// MISSION MODULE STATE
// =====================================================

let tasks = [];
let generatedMissionRequest = null;

const TRIAL_CLOSE_MISSION_REQUEST = Object.freeze({
  domain: "camping.sales",
  missionIntent: "practice-trial-close",
});

const CUSTOMER_DISCOVERY_MISSION_REQUEST = Object.freeze({
  domain: "camping.sales",
  missionIntent: "practice-customer-discovery",
});

const PRODUCT_SELECTION_MISSION_REQUEST = Object.freeze({
  domain: "camping.sales",
  missionIntent: "practice-product-selection",
});

const PRESENTATION_MISSION_REQUEST = Object.freeze({
  domain: "camping.sales",
  missionIntent: "practice-presentation",
});

const OBJECTION_HANDLING_MISSION_REQUEST = Object.freeze({
  domain: "camping.sales",
  missionIntent: "practice-objection-handling",
});

const RAPPORT_MISSION_REQUEST = Object.freeze({
  domain: "camping.sales",
  missionIntent: "practice-rapport",
});

// =====================================================
// PENDING MISSION REQUEST
// Commander-owned routing authority for one explicitly
// selected future mission. Exact matching only.
// =====================================================

function validatePendingMissionRequest(request = null) {
  if (!request || typeof request !== "object" || Array.isArray(request)) {
    return { valid: false, reason: "invalid-pending-mission-request" };
  }

  if (request.domain !== TRIAL_CLOSE_MISSION_REQUEST.domain) {
    return { valid: false, reason: "invalid-pending-mission-domain" };
  }

  if (
    request.missionIntent !== TRIAL_CLOSE_MISSION_REQUEST.missionIntent &&
    request.missionIntent !== CUSTOMER_DISCOVERY_MISSION_REQUEST.missionIntent &&
    request.missionIntent !== PRODUCT_SELECTION_MISSION_REQUEST.missionIntent &&
    request.missionIntent !== PRESENTATION_MISSION_REQUEST.missionIntent &&
    request.missionIntent !== OBJECTION_HANDLING_MISSION_REQUEST.missionIntent &&
    request.missionIntent !== RAPPORT_MISSION_REQUEST.missionIntent
  ) {
    return { valid: false, reason: "invalid-pending-mission-intent" };
  }

  return {
    valid: true,
    request: {
      domain: request.domain,
      missionIntent: request.missionIntent,
    },
  };
}

function savePendingMissionRequest() {
  if (
    typeof CommanderSystem !== "undefined" &&
    typeof CommanderSystem.save === "function"
  ) {
    return CommanderSystem.save();
  }

  if (typeof saveFounder === "function") {
    saveFounder();
    return true;
  }

  return false;
}

function setPendingMissionRequest(request = null) {
  const validated = validatePendingMissionRequest(request);
  if (!validated.valid) return validated;

  founder.pendingMissionRequest = { ...validated.request };
  const saved = savePendingMissionRequest();

  return {
    success: saved,
    changed: true,
    request: { ...founder.pendingMissionRequest },
    ...(saved ? {} : { reason: "pending-mission-request-save-failed" }),
  };
}

function clearPendingMissionRequestAfterAcceptance(acceptedRequest = null) {
  const pending = validatePendingMissionRequest(founder.pendingMissionRequest);
  const accepted = validatePendingMissionRequest(acceptedRequest);

  if (
    !pending.valid ||
    !accepted.valid ||
    pending.request.domain !== accepted.request.domain ||
    pending.request.missionIntent !== accepted.request.missionIntent
  ) {
    return { success: false, changed: false, reason: "pending-request-mismatch" };
  }

  founder.pendingMissionRequest = null;
  const saved = savePendingMissionRequest();

  return {
    success: saved,
    changed: saved,
    ...(saved ? {} : { reason: "pending-mission-request-save-failed" }),
  };
}

function renderPendingMissionRequestStatus() {
  const status = document.getElementById("pending-mission-request-status");
  if (!status) return;

  const pending = validatePendingMissionRequest(founder.pendingMissionRequest);
  status.textContent = !pending.valid
    ? ""
    : founder.missionStatus === "active"
      ? "Selected for next mission. Archive the active mission before previewing it."
      : "Selected for next mission.";
}

function presentPendingMissionRequestForPreview() {
  const pending = validatePendingMissionRequest(founder.pendingMissionRequest);
  if (!pending.valid || !founder.onboardingComplete) {
    return {
      success: false,
      reason: pending.valid
        ? "returning-commander-required"
        : "invalid-pending-mission-request",
    };
  }

  const mission = generateMission();
  const briefing = document.getElementById("mission-briefing");
  const result = document.getElementById("mission-result");
  const title = document.getElementById("mission-title");
  const description = document.getElementById("mission-description");
  const objectives = document.getElementById("mission-preview-objectives");
  const accept = document.getElementById("accept-mission");
  const experience = document.getElementById("experience-question");

  if (!mission || mission.success === false) {
    renderPendingMissionRequestStatus();
    return mission;
  }

  document.querySelectorAll(".mission-choice").forEach((choice) => {
    choice.style.display = "none";
  });
  if (experience) experience.style.display = "none";
  if (briefing) briefing.style.display = "flex";
  if (result) result.style.display = "block";
  if (title) title.textContent = mission.title;
  if (description) description.textContent = mission.description;
  if (objectives) {
    objectives.innerHTML = "";
    mission.objectives.forEach((objective) => {
      const normalized = MissionSystem.normalizeMissionObjective(objective);
      if (!normalized) return;
      const item = document.createElement("li");
      item.textContent = normalized.text;
      objectives.appendChild(item);
    });
  }
  if (accept) accept.style.display = "";
  renderPendingMissionRequestStatus();
  return mission;
}

function selectTrialCloseMissionRequest() {
  const result = setPendingMissionRequest(TRIAL_CLOSE_MISSION_REQUEST);
  if (result.success) {
    renderPendingMissionRequestStatus();
    if (founder.onboardingComplete) {
      presentPendingMissionRequestForPreview();
    }
  }
  return result;
}

function selectCustomerDiscoveryMissionRequest() {
  const result = setPendingMissionRequest(CUSTOMER_DISCOVERY_MISSION_REQUEST);
  if (result.success) {
    renderPendingMissionRequestStatus();
    if (founder.onboardingComplete) {
      presentPendingMissionRequestForPreview();
    }
  }
  return result;
}

function selectProductSelectionMissionRequest() {
  const result = setPendingMissionRequest(PRODUCT_SELECTION_MISSION_REQUEST);
  if (result.success) {
    renderPendingMissionRequestStatus();
    if (founder.onboardingComplete) {
      presentPendingMissionRequestForPreview();
    }
  }
  return result;
}

function selectPresentationMissionRequest() {
  const result = setPendingMissionRequest(PRESENTATION_MISSION_REQUEST);
  if (result.success) {
    renderPendingMissionRequestStatus();
    if (founder.onboardingComplete) {
      presentPendingMissionRequestForPreview();
    }
  }
  return result;
}

function selectObjectionHandlingMissionRequest() {
  const result = setPendingMissionRequest(OBJECTION_HANDLING_MISSION_REQUEST);
  if (result.success) {
    renderPendingMissionRequestStatus();
    if (founder.onboardingComplete) {
      presentPendingMissionRequestForPreview();
    }
  }
  return result;
}

function selectRapportMissionRequest() {
  const result = setPendingMissionRequest(RAPPORT_MISSION_REQUEST);
  if (result.success) {
    renderPendingMissionRequestStatus();
    if (founder.onboardingComplete) {
      presentPendingMissionRequestForPreview();
    }
  }
  return result;
}

function clearAcceptedGeneratedMissionRequest() {
  if (!generatedMissionRequest) {
    return { success: false, changed: false, reason: "no-generated-request" };
  }

  const result = clearPendingMissionRequestAfterAcceptance(
    generatedMissionRequest,
  );
  if (result.success) generatedMissionRequest = null;
  return result;
}

// =====================================================
// ARCHIE MISSION GENERATOR
// =====================================================

function generateMission() {
  if (
    Object.prototype.hasOwnProperty.call(founder, "pendingMissionRequest") &&
    founder.pendingMissionRequest !== null &&
    founder.pendingMissionRequest !== undefined
  ) {
    const pending = validatePendingMissionRequest(founder.pendingMissionRequest);

    if (!pending.valid) {
      return {
        success: false,
        reason: "invalid-pending-mission-request",
      };
    }

    if (founder.missionStatus === "active") {
      return {
        success: false,
        reason: "active-mission-replacement-required",
        request: { ...pending.request },
      };
    }

    let mission;
    if (
      pending.request.missionIntent ===
      CUSTOMER_DISCOVERY_MISSION_REQUEST.missionIntent
    ) {
      mission = {
            title: "Practice Customer Discovery",
            description:
              "Practice purposeful customer Discovery during one real interaction by asking open-ended questions, listening for the customer's goals and needs, and recording what they shared.",
            reward: 100,
            objectives: [
              "Prepare two open-ended questions about the customer's RV goals, travel plans, and priorities.",
              {
                text: "Ask purposeful Discovery questions during one customer interaction and listen for the customer's goals and needs.",
                competencyRef: {
                  domain: "camping.sales",
                  competency: "discovery",
                },
              },
              "Record what you asked, what the customer shared, and what happened next in a Field Report.",
            ],
          };
    } else if (
      pending.request.missionIntent ===
      PRODUCT_SELECTION_MISSION_REQUEST.missionIntent
    ) {
      mission = {
        title: "Practice Product Selection",
        description:
          "Practice connecting one recorded customer need to one RV recommendation during a real customer interaction, then record what you selected and what happened next.",
        reward: 100,
        objectives: [
          "Review one customer goal or need that should guide the RV recommendation.",
          {
            text: "Select or recommend one RV based on a recorded customer need during a real customer interaction.",
            competencyRef: {
              domain: "camping.sales",
              competency: "product-selection",
            },
          },
          "Record the customer need, selected RV reference, and what happened next in a Field Report.",
        ],
      };
    } else if (
      pending.request.missionIntent ===
      PRESENTATION_MISSION_REQUEST.missionIntent
    ) {
      mission = {
        title: "Practice a Customer-Need Presentation",
        description:
          "Practice connecting one relevant RV feature or benefit to one recorded customer need during a real customer interaction, then record what you presented and how the customer responded.",
        reward: 100,
        objectives: [
          "Review one recorded customer need and choose one relevant RV feature or benefit.",
          {
            text: "Connect that feature or benefit to the customer's need during the interaction.",
            competencyRef: {
              domain: "camping.sales",
              competency: "presentation",
            },
          },
          "Record the need, RV reference, feature or benefit, and customer response in a Field Report.",
        ],
      };
    } else if (
      pending.request.missionIntent ===
      OBJECTION_HANDLING_MISSION_REQUEST.missionIntent
    ) {
      mission = {
        title: "Practice Objection Handling",
        description:
          "When a customer naturally raises an objection during a real interaction, practice responding deliberately and record the objection, your response, and what happened next.",
        reward: 100,
        objectives: [
          "Review one respectful way to respond if a customer raises an objection.",
          {
            text: "When a customer naturally raises an objection, respond deliberately during the interaction.",
            competencyRef: {
              domain: "camping.sales",
              competency: "objection-handling",
            },
          },
          "Record the objection, your response, and what happened next in a Field Report.",
        ],
      };
    } else if (
      pending.request.missionIntent === RAPPORT_MISSION_REQUEST.missionIntent
    ) {
      mission = {
        title: "Practice Referencing Customer Context",
        description:
          "Practice noticing one appropriate, non-sensitive context detail a customer voluntarily shares and, when natural, referencing it back during the same interaction without probing for private information.",
        reward: 100,
        objectives: [
          "Notice one appropriate, non-sensitive context detail the customer voluntarily provides.",
          {
            text: "Reference that detail back naturally during the same interaction.",
            competencyRef: {
              domain: "camping.sales",
              competency: "rapport",
            },
          },
          "Record only the context category and performed action in a Field Report.",
        ],
      };
    } else {
      mission = {
            title: "Practice a Trial Close",
            description:
              "Practice one appropriate, low-pressure Trial Close to check whether a selected RV aligns with the customer's desired solution, then record the customer's response.",
            reward: 100,
            objectives: [
              "Prepare an appropriate alignment-check question for a customer interaction.",
              {
                text: "Perform one appropriate Trial Close to check whether the selected RV is moving toward the customer's desired solution.",
                competencyRef: {
                  domain: "camping.sales",
                  competency: "trial-close",
                },
              },
              "Record the customer's response in a Field Report.",
            ],
          };
    }

    founder.currentMission = mission.title;
    founder.missionDescription = mission.description;
    founder.missionReward = mission.reward;
    founder.missionObjectives = mission.objectives;
    founder.missionObjectiveCompletion = [];
    generatedMissionRequest = { ...pending.request };
    savePendingMissionRequest();

    return mission;
  }

  generatedMissionRequest = null;

  const mission = {
    title: "",
    description: "",
    reward: 100,
    objectives: [],
  };

  const missionGoal = founder.missionGoal || "";

  if (missionGoal.includes("AI")) {
    mission.title = "Your First AI Workflow";
    mission.description =
      "Choose an AI tool, test its abilities, and create your first repeatable system.";
    mission.objectives = [
      "Choose your first AI tool",
      "Complete your first AI experiment",
      "Create your first repeatable workflow",
      "Document what you learned",
    ];
  } else if (missionGoal.includes("Business")) {
    mission.title = "Build Your Foundation";
    mission.description =
      "Define your idea, identify your audience, and create the first version of your roadmap.";
    mission.objectives = [
      "Define your business idea",
      "Identify your target audience",
      "Research your first opportunity",
      "Create your first action plan",
    ];
  } else if (missionGoal.includes("Audience")) {
    mission.title = "Launch Your Content Engine";
    mission.description =
      "Create your first content system and publish your first piece of valuable content.";
    mission.objectives = [
      "Choose your content topic",
      "Create your first script",
      "Record your first piece of content",
      "Publish your first post",
    ];
  } else if (missionGoal.includes("Workflow")) {
    mission.title = "Design Your First System";
    mission.description =
      "Find a repetitive task and improve it with automation.";
    mission.objectives = [
      "Identify a repetitive task",
      "Choose an improvement tool",
      "Build your first automation",
      "Review your results",
    ];
  } else {
    mission.title = "Discover Your Direction";
    mission.description =
      "Explore your strengths and identify your first opportunity.";
    mission.objectives = [
      "Explore your interests",
      "Identify your strengths",
      "Choose your first direction",
    ];
  }

  founder.currentMission = mission.title;
  founder.missionDescription = mission.description;
  founder.missionReward = mission.reward;
  founder.missionObjectives = mission.objectives;
  founder.missionObjectiveCompletion = [];

  if (typeof CommanderSystem !== "undefined" && typeof CommanderSystem.save === "function") {
    CommanderSystem.save();
  } else {
    saveFounder();
  }

  return mission;
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

  if (typeof updateArchiveMissionActionVisibility === "function") {
    updateArchiveMissionActionVisibility();
  }
}

// =====================================================
// SALES PRACTICE — FIELD REPORT HANDOFF (navigation-only)
//
// Renders a single plain anchor beside objective #3
// (index 2) ONLY for an exact supported production sales
// mission title. The anchor navigates to the
// Field Report card in index.html. It performs no save,
// no prefill, no evidence, and no mission-state change.
// =====================================================

function renderFieldReportHandoff(index) {
  const isSupportedSalesMission =
    typeof founder.currentMission === "string" &&
    [
      "Practice a Trial Close",
      "Practice Customer Discovery",
      "Practice Product Selection",
      "Practice a Customer-Need Presentation",
      "Practice Objection Handling",
      "Practice Referencing Customer Context",
    ].includes(
      founder.currentMission,
    );

  if (index !== 2 || !isSupportedSalesMission) return "";

  return `
        <a
          class="field-report-handoff"
          href="index.html#field-report-card"
          >Open Field Report</a
        >
      `;
}

// =====================================================
// DYNAMIC MISSION CHECKLIST
// Archie Generated Objectives
// =====================================================

function updateMissionChecklist() {
  const container = document.getElementById("mission-task-container");

  if (!container) {
    tasks = getReadOnlyMissionTasks();
    updateMissionObjectiveSummary();
    if (typeof updateMissionProgress === "function") updateMissionProgress();
    if (typeof updateMissionStatus === "function") updateMissionStatus();
    return;
  }

  container.innerHTML = "";

  tasks = [];

  const objectives = Array.isArray(founder.missionObjectives)
    ? founder.missionObjectives
    : [];

  objectives.forEach((objective, index) => {
    const normalizedObjective =
      typeof MissionSystem !== "undefined" &&
      typeof MissionSystem.normalizeMissionObjective === "function"
        ? MissionSystem.normalizeMissionObjective(objective)
        : typeof objective === "string" && objective.trim().length > 0
          ? { text: objective, competencyRef: null }
          : objective &&
              typeof objective === "object" &&
              typeof objective.text === "string" &&
              objective.text.trim().length > 0
            ? { text: objective.text, competencyRef: null }
            : null;
    if (!normalizedObjective) return;

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
        ${normalizedObjective.text}
      </label>

      ${renderFieldReportHandoff(index)}
    `;

    container.appendChild(div);
  });

  tasks = document.querySelectorAll(".mission-task");

  activateTaskListeners();
  if (typeof updateXP === "function") updateXP();
  if (typeof updateMissionStatus === "function") updateMissionStatus();
  if (typeof updateMissionProgress === "function") updateMissionProgress();
  updateMissionObjectiveSummary();
}

function getReadOnlyMissionTasks() {
  const objectives = Array.isArray(founder.missionObjectives)
    ? founder.missionObjectives
    : [];

  return objectives.flatMap((objective, index) => {
    const normalized =
      typeof MissionSystem !== "undefined" &&
      typeof MissionSystem.normalizeMissionObjective === "function"
        ? MissionSystem.normalizeMissionObjective(objective)
        : typeof objective === "string" && objective.trim().length > 0
          ? { text: objective }
          : objective && typeof objective.text === "string"
            ? { text: objective.text }
            : null;
    if (!normalized) return [];

    return [{
      id: `objective-${index}`,
      checked: founder.missionObjectiveCompletion?.[index] === true,
      dataset: { xp: "25" },
    }];
  });
}

function updateMissionObjectiveSummary() {
  if (!missionObjectiveSummary) return;

  const completed = Array.from(tasks).filter((task) => task.checked).length;
  missionObjectiveSummary.textContent =
    `${completed} of ${tasks.length} objectives complete.`;
}

// =====================================================
// TASK LISTENER SYSTEM
// Handles Dynamic Tasks
// =====================================================

function activateTaskListeners() {
  tasks.forEach((task) => {
    const objectiveIndex = Number(task.id.replace("objective-", ""));
    task.checked = founder.missionObjectiveCompletion?.[objectiveIndex] === true;

    task.addEventListener("change", () => {
      founder.missionObjectiveCompletion = Array.from(
        tasks,
        (currentTask, index) =>
          index === objectiveIndex
            ? task.checked
            : founder.missionObjectiveCompletion?.[index] === true,
      );

      if (
        typeof CommanderSystem !== "undefined" &&
        typeof CommanderSystem.save === "function"
      ) {
        CommanderSystem.save();
      } else if (typeof saveFounder === "function") {
        saveFounder();
      }

      updateXP();

      updateMissionStatus();

      updateMissionProgress();

      updateMissionObjectiveSummary();
    });
  });
}
