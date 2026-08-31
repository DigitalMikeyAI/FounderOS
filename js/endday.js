// =====================================================
// DAILY MISSION DATA
// =====================================================

let daily = {
  xp: 0,

  completedTasks: [],

  date: "",
};

// =====================================================
// END DAY DOM ELEMENTS
// =====================================================

const endDayButton = document.getElementById("end-day-button");
const archiveMissionButton = document.getElementById("archive-mission-button");
const cancelButton = document.getElementById("cancel-day");
const confirmDayButton = document.getElementById("confirm-day");

// Reports

const missionReport = document.getElementById("mission-report");
const reportXP = document.getElementById("report-xp");
const reportTasks = document.getElementById("report-tasks");

// Confirmation

const confirmationBox = document.getElementById("confirmation-box");
const archiveConfirmationTitle = document.getElementById(
  "archive-confirmation-title",
);
const archiveConfirmationMessage = document.getElementById(
  "archive-confirmation-message",
);
const abortConfirm = document.getElementById("abort-confirm");
const finalizeDay = document.getElementById("finalize-day");
let archiveConfirmationReturnTarget = null;

// =====================================================
// END DAY SEQUENCE
// Mission Report + Confirmation + Archive
// =====================================================

function getCompletedTaskCount() {
  return Array.from(tasks).filter((task) => task.checked).length;
}

function getTodayXP() {
  return Array.from(tasks).reduce((total, task) => {
    return task.checked ? total + Number(task.dataset.xp || 0) : total;
  }, 0);
}

function openMissionReport() {
  const completedTasks = getCompletedTaskCount();
  const todayXP = getTodayXP();

  if (reportXP) {
    reportXP.textContent = `${todayXP} XP`;
  }

  if (reportTasks) {
    reportTasks.textContent = `${completedTasks} / ${tasks.length} objectives completed`;
  }

  if (missionReport) {
    missionReport.style.display = "flex";
  }
}

function closeMissionReport() {
  if (missionReport) {
    missionReport.style.display = "none";
  }
}

function updateArchiveMissionActionVisibility() {
  const hasActiveMission =
    typeof founder.currentMission === "string" &&
    founder.currentMission.trim().length > 0 &&
    founder.missionStatus === "active";

  if (archiveMissionButton) {
    archiveMissionButton.hidden = !hasActiveMission;
  }

  if (confirmDayButton) {
    confirmDayButton.hidden = !hasActiveMission;
  }
}

function renderArchiveConfirmationCopy() {
  const completedTasks = getCompletedTaskCount();
  const totalTasks = Array.from(tasks).length;
  const isComplete = totalTasks > 0 && completedTasks === totalTasks;

  if (archiveConfirmationTitle) {
    archiveConfirmationTitle.textContent = isComplete
      ? "Archive completed mission?"
      : "Archive this mission?";
  }

  if (archiveConfirmationMessage) {
    archiveConfirmationMessage.textContent = isComplete
      ? "All objectives are complete. Confirm to archive this mission."
      : `Some objectives are incomplete (${completedTasks} of ${totalTasks} complete). They will remain incomplete.`;
  }
}

function openConfirmationBox(returnTarget = null) {
  archiveConfirmationReturnTarget = returnTarget;
  renderArchiveConfirmationCopy();
  if (abortConfirm) {
    abortConfirm.textContent =
      returnTarget === "mission-report" ? "Return To Debrief" : "Cancel";
  }
  closeMissionReport();

  if (confirmationBox) {
    confirmationBox.style.display = "flex";
  }
}

function closeConfirmationBox() {
  if (confirmationBox) {
    confirmationBox.style.display = "none";
  }
}

function resetMissionCheckboxes() {
  tasks.forEach((task) => {
    task.checked = false;
    localStorage.removeItem(task.id);
  });
}

function archiveMissionDay() {
  const completedTasks = getCompletedTaskCount();
  const earnedXP = getTodayXP();

  founder.xp = (Number(founder.xp) || 0) + earnedXP;

  if (completedTasks > 0) {
    founder.streak = (Number(founder.streak) || 0) + 1;
  }

  daily = {
    xp: earnedXP,
    completedTasks: Array.from(tasks)
      .filter((task) => task.checked)
      .map((task) => task.id),
    date: new Date().toISOString().split("T")[0],
  };

  founder.memory.lastMissionDate = daily.date;
  founder.memory.lastMissionXP = earnedXP;
  founder.memory.lastCompletedTaskCount = completedTasks;
  founder.memory.lastCompletedTasks = [...daily.completedTasks];

  const logEntry = {
    date: daily.date,
    xp: earnedXP,
    objectives: completedTasks,
    mission: founder.currentMission,
    streak: founder.streak,
    archieNote: generateArchieLogNote(),
  };

  if (!Array.isArray(founder.commandLog)) {
    founder.commandLog = [];
  }

  const existingEntryIndex = founder.commandLog.findIndex((entry) => {
    return entry.date === logEntry.date;
  });

  if (existingEntryIndex === -1) {
    founder.commandLog.unshift(logEntry);
  }

  founder.missionStatus = "inactive";

  localStorage.setItem("digitalMikeyDaily", JSON.stringify(daily));

  updateFounderLevel();
  updateFounderDisplay();

  if (typeof CommanderSystem !== "undefined" && typeof CommanderSystem.save === "function") {
    CommanderSystem.save();
  } else {
    saveFounder();
  }

  updateCommandLog();


  resetMissionCheckboxes();

  updateXP();
  updateMissionProgress();
  updateMissionStatus();

  closeConfirmationBox();
  archiveConfirmationReturnTarget = null;
  updateArchiveMissionActionVisibility();

  if (typeof presentPendingMissionRequestForPreview === "function") {
    presentPendingMissionRequestForPreview();
  }

  if (
    typeof ArchieCore !== "undefined" &&
    typeof ArchieCore.refreshSession === "function"
  ) {
    ArchieCore.refreshSession({
      deliver: true,
    }).catch((error) => {
      console.error("🔴 Mission archive intelligence refresh failed:", error);
    });
  }
}

// =====================================================
// END DAY BUTTON LISTENERS
// =====================================================

if (endDayButton) {
  endDayButton.addEventListener("click", () => {
    openMissionReport();
  });
}

if (archiveMissionButton) {
  archiveMissionButton.addEventListener("click", () => {
    openConfirmationBox();
  });
}

if (cancelButton) {
  cancelButton.addEventListener("click", () => {
    closeMissionReport();
  });
}

if (confirmDayButton) {
  confirmDayButton.addEventListener("click", () => {
    openConfirmationBox("mission-report");
  });
}

if (abortConfirm) {
  abortConfirm.addEventListener("click", () => {
    closeConfirmationBox();

    if (archiveConfirmationReturnTarget === "mission-report" && missionReport) {
      missionReport.style.display = "flex";
    }

    archiveConfirmationReturnTarget = null;
  });
}

if (finalizeDay) {
  finalizeDay.addEventListener("click", () => {
    archiveMissionDay();
  });
}
