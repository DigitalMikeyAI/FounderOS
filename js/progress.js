// XP

const xpFill = document.getElementById("xp-fill");

const xpText = document.getElementById("xp-text");

// Mission

const missionStatus = document.getElementById("mission-status");

const missionProgress = document.getElementById("mission-progress");

// Founder

const founderLevel = document.getElementById("founder-level");

const founderXP = document.getElementById("founder-xp");

const founderXPFill = document.getElementById("founder-xp-fill");

const founderXPText = document.getElementById("founder-xp-text");

const nextRank = document.getElementById("next-rank");

const founderStreak = document.getElementById("founder-streak");

const videosPublished = document.getElementById("videos-published");

const followers = document.getElementById("followers");

const revenue = document.getElementById("revenue");

// =====================================================
// XP CALCULATION
// =====================================================

function updateXP() {
  let todayXP = 0;

  tasks.forEach((task) => {
    if (task.checked) {
      todayXP += Number(task.dataset.xp);
    }
  });

  xpText.textContent = `${todayXP} / 500 XP`;

  xpFill.style.width = `${Math.min((todayXP / 500) * 100, 100)}%`;
}

// =====================================================
// FOUNDER LEVEL SYSTEM
// =====================================================

function updateFounderLevel() {
  const xp = Number(founder.xp) || 0;

  if (xp >= 1000) {
    founder.level = 5;
    founder.title = "Architect";
  } else if (xp >= 500) {
    founder.level = 4;
    founder.title = "Founder";
  } else if (xp >= 250) {
    founder.level = 3;
    founder.title = "Builder";
  } else if (xp >= 100) {
    founder.level = 2;
    founder.title = "Apprentice";
  } else {
    founder.level = 1;
    founder.title = "Explorer";
  }
}

function getNextLevelXP() {
  const thresholds = [100, 250, 500, 1000];

  return thresholds.find((threshold) => founder.xp < threshold) || 1000;
}

function updateFounderDisplay() {
  const currentXP = Number(founder.xp) || 0;
  const targetXP = getNextLevelXP();
  const progress = Math.min((currentXP / targetXP) * 100, 100);

  if (founderLevel) {
    founderLevel.textContent = `Level ${founder.level} — ${founder.title}`;
  }

  if (founderXP) {
    founderXP.textContent = currentXP;
  }

  if (founderXPText) {
    founderXPText.textContent = `${currentXP} / ${targetXP} XP`;
  }

  if (founderXPFill) {
    founderXPFill.style.width = `${progress}%`;
  }

  if (nextRank) {
    nextRank.textContent =
      founder.level >= 5
        ? "Maximum Rank Reached"
        : `${targetXP - currentXP} XP until next rank`;
  }

  if (founderStreak) {
    founderStreak.textContent = founder.streak || 0;
  }

  if (videosPublished) {
    videosPublished.textContent = founder.videosPublished || 0;
  }

  if (followers) {
    followers.textContent = founder.followers || 0;
  }

  if (revenue) {
    revenue.textContent = `$${Number(founder.revenue || 0).toFixed(2)}`;
  }
}

// =====================================================
// MISSION PROGRESS
// =====================================================

function updateMissionProgress() {
  let completed = 0;

  tasks.forEach((task) => {
    if (task.checked) {
      completed++;
    }
  });

  let percentage = 0;

  if (tasks.length > 0) {
    percentage = Math.round((completed / tasks.length) * 100);
  }

  missionProgress.textContent = `Mission Progress: ${percentage}%`;
}

// =====================================================
// MISSION STATUS
// =====================================================

function updateMissionStatus() {
  if (founder.missionStatus === "active") {
    let completed = 0;

    tasks.forEach((task) => {
      if (task.checked) {
        completed++;
      }
    });

    if (completed === tasks.length && tasks.length > 0) {
      missionStatus.textContent =
        "🟢 All Objectives Complete. Prepare Debrief.";
    } else {
      missionStatus.textContent = "🟢 Mission Active. Execute your objectives.";
    }

    return;
  }

  missionStatus.textContent = "Mission Awaiting Activation.";
}

// =====================================================
// GREETING SYSTEM
// =====================================================

function updateGreeting() {
  const greeting = document.getElementById("greeting");

  if (!greeting) {
    return;
  }

  const currentHour = new Date().getHours();

  let timeGreeting = "Welcome";

  if (currentHour < 12) {
    timeGreeting = "Good morning";
  } else if (currentHour < 18) {
    timeGreeting = "Good afternoon";
  } else {
    timeGreeting = "Good evening";
  }

  greeting.textContent = `${timeGreeting}, ${founder.name || "Explorer"}.`;
}
