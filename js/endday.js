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
const cancelButton = document.getElementById("cancel-day");
const confirmDayButton = document.getElementById("confirm-day");

// Reports

const missionReport = document.getElementById("mission-report");
const reportXP = document.getElementById("report-xp");
const reportTasks = document.getElementById("report-tasks");

// Confirmation

const confirmationBox = document.getElementById("confirmation-box");
const abortConfirm = document.getElementById("abort-confirm");
const finalizeDay = document.getElementById("finalize-day");

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

function openConfirmationBox() {
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

  ArchieCore.refreshSession({
    deliver: true,
  }).catch((error) => {
    console.error("🔴 Mission archive intelligence refresh failed:", error);
  });
}

// =====================================================
// END DAY BUTTON LISTENERS
// =====================================================

if (endDayButton) {
  endDayButton.addEventListener("click", () => {
    openMissionReport();
  });
}

if (cancelButton) {
  cancelButton.addEventListener("click", () => {
    closeMissionReport();
  });
}

if (confirmDayButton) {
  confirmDayButton.addEventListener("click", () => {
    openConfirmationBox();
  });
}

if (abortConfirm) {
  abortConfirm.addEventListener("click", () => {
    closeConfirmationBox();

    if (missionReport) {
      missionReport.style.display = "flex";
    }
  });
}

if (finalizeDay) {
  finalizeDay.addEventListener("click", () => {
    archiveMissionDay();
  });
}
