const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const request = { domain: "camping.sales", missionIntent: "practice-rapport" };

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function load(relative, context) {
  const filename = path.join(root, relative);
  vm.runInContext(fs.readFileSync(filename, "utf8"), context, { filename });
}

function createElement() {
  return {
    textContent: "", innerHTML: "", style: {}, hidden: false, checked: false,
    dataset: {}, handlers: {}, children: [],
    addEventListener(type, handler) { this.handlers[type] = handler; },
    appendChild(child) { this.children.push(child); },
  };
}

function loadPage(storage, surface = "missions") {
  const elements = new Map();
  const taskElements = [0, 1, 2].map((index) => ({
    id: `objective-${index}`,
    checked: false,
    dataset: { xp: "25" },
    handlers: {},
    addEventListener(type, handler) { this.handlers[type] = handler; },
  }));
  let writes = 0;
  const localStorage = {
    getItem(key) { return storage.has(key) ? storage.get(key) : null; },
    setItem(key, value) { writes += 1; storage.set(key, String(value)); },
    removeItem(key) { writes += 1; storage.delete(key); },
  };
  const context = vm.createContext({
    console: { log() {}, warn() {}, error() {}, info() {} },
    Date, Math, JSON, localStorage,
    document: {
      getElementById(id) {
        if (id === "mission-task-container" && surface !== "missions") return null;
        if (id === "archive-mission-button" && surface !== "missions") return null;
        if (!elements.has(id)) elements.set(id, createElement());
        return elements.get(id);
      },
      createElement: createElement,
      querySelectorAll(selector) {
        if (selector === ".mission-task" && surface === "missions") return taskElements;
        return [];
      },
    },
    updateCommandLog() {}, updateGreeting() {},
    generateArchieLogNote() { return "Archived by Commander"; },
    ArchieCore: { refreshSession: async () => {} },
  });
  for (const relative of [
    "js/storage.js", "systems/domain-competency.contract.js",
    "systems/mission.system.js", "systems/commander.system.js",
    "js/progress.js", "js/missions.js", "js/endday.js",
  ]) load(relative, context);
  vm.runInContext("loadFounder();", context);
  vm.runInContext(
    ";globalThis.__api={founder,saveFounder,setPendingMissionRequest,generateMission,clearPendingMissionRequestAfterAcceptance,updateActiveMission,updateMissionChecklist,updateMissionProgress,updateMissionStatus,updateArchiveMissionActionVisibility,archiveMissionDay};",
    context,
  );
  return {
    context,
    elements,
    taskElements,
    api: context.__api,
    get writes() { return writes; },
  };
}

function acceptRapportMission(page) {
  page.api.setPendingMissionRequest(request);
  page.api.generateMission();
  page.api.founder.onboardingComplete = true;
  page.api.founder.missionStatus = "active";
  page.api.clearPendingMissionRequestAfterAcceptance(request);
  page.api.saveFounder();
  page.api.updateActiveMission();
  page.api.updateMissionChecklist();
  page.api.updateArchiveMissionActionVisibility();
}

function checkObjective(page, index) {
  const task = page.taskElements[index];
  task.checked = true;
  task.handlers.change();
}

test("accepted mission completion survives Missions, Dashboard, and Progress navigation", () => {
  const storage = new Map();
  const firstMissions = loadPage(storage, "missions");
  acceptRapportMission(firstMissions);

  assert.equal(firstMissions.api.founder.missionStatus, "active");
  assert.equal(firstMissions.elements.get("archive-mission-button").hidden, false);
  assert.equal(firstMissions.elements.get("mission-progress").textContent, "Mission Progress: 0%");

  checkObjective(firstMissions, 0);
  assert.deepEqual(clone(firstMissions.api.founder.missionObjectiveCompletion), [true, false, false]);
  assert.equal(firstMissions.elements.get("mission-progress").textContent, "Mission Progress: 33%");
  assert.equal(JSON.parse(storage.get("digitalMikeyFounder")).missionStatus, "active");
  assert.deepEqual(
    JSON.parse(storage.get("digitalMikeyFounder")).missionObjectiveCompletion,
    [true, false, false],
  );

  const reloadedMissions = loadPage(storage, "missions");
  reloadedMissions.api.updateActiveMission();
  reloadedMissions.api.updateMissionChecklist();
  reloadedMissions.api.updateArchiveMissionActionVisibility();
  assert.equal(reloadedMissions.taskElements[0].checked, true);
  assert.equal(reloadedMissions.elements.get("mission-progress").textContent, "Mission Progress: 33%");
  assert.equal(reloadedMissions.api.founder.missionStatus, "active");
  assert.equal(reloadedMissions.elements.get("archive-mission-button").hidden, false);

  checkObjective(reloadedMissions, 1);
  assert.equal(reloadedMissions.elements.get("mission-progress").textContent, "Mission Progress: 67%");
  const writesBeforeDashboard = storage.size;
  const dashboard = loadPage(storage, "dashboard");
  const dashboardWritesBeforeRender = dashboard.writes;
  dashboard.api.updateMissionChecklist();
  assert.equal(dashboard.elements.get("mission-progress").textContent, "Mission Progress: 67%");
  assert.equal(
    dashboard.elements.get("mission-objective-summary").textContent,
    "2 of 3 objectives complete.",
  );
  assert.equal(dashboard.writes, dashboardWritesBeforeRender);
  assert.equal(storage.size, writesBeforeDashboard);
  assert.equal(dashboard.api.founder.missionStatus, "active");

  const afterDashboard = loadPage(storage, "missions");
  afterDashboard.api.updateActiveMission();
  afterDashboard.api.updateMissionChecklist();
  afterDashboard.api.updateArchiveMissionActionVisibility();
  assert.deepEqual(afterDashboard.taskElements.map((task) => task.checked), [true, true, false]);
  assert.equal(afterDashboard.elements.get("mission-progress").textContent, "Mission Progress: 67%");
  assert.equal(afterDashboard.api.founder.missionStatus, "active");
  assert.equal(afterDashboard.elements.get("archive-mission-button").hidden, false);

  checkObjective(afterDashboard, 2);
  const progress = loadPage(storage, "progress");
  const progressWritesBeforeRender = progress.writes;
  progress.api.updateMissionChecklist();
  assert.equal(progress.writes, progressWritesBeforeRender);
  const finalMissions = loadPage(storage, "missions");
  finalMissions.api.updateActiveMission();
  finalMissions.api.updateMissionChecklist();
  finalMissions.api.updateArchiveMissionActionVisibility();
  assert.deepEqual(finalMissions.taskElements.map((task) => task.checked), [true, true, true]);
  assert.equal(finalMissions.elements.get("mission-progress").textContent, "Mission Progress: 100%");
  assert.equal(finalMissions.api.founder.missionStatus, "active");
  assert.equal(finalMissions.elements.get("archive-mission-button").hidden, false);

  const archived = finalMissions.api.archiveMissionDay();
  assert.equal(archived.success, true);
  assert.equal(finalMissions.api.founder.missionStatus, "inactive");
  assert.deepEqual(clone(finalMissions.api.founder.missionObjectiveCompletion), []);
  assert.deepEqual(finalMissions.taskElements.map((task) => task.checked), [false, false, false]);
  assert.equal(finalMissions.elements.get("mission-progress").textContent, "Mission Progress: 0%");
  assert.equal(finalMissions.elements.get("mission-objective-summary").textContent, "0 of 3 objectives complete.");
  assert.equal(finalMissions.elements.get("archive-mission-button").hidden, true);
  assert.equal(storage.has("objective-0"), false);
  assert.equal(storage.has("objective-1"), false);
  assert.equal(storage.has("objective-2"), false);
  assert.equal(finalMissions.api.founder.commandLog.length, 1);
  assert.equal(finalMissions.api.founder.commandLog[0].xp, 75);
  assert.equal(finalMissions.api.founder.xp, 75);

  const afterArchiveReload = loadPage(storage, "missions");
  afterArchiveReload.api.updateActiveMission();
  afterArchiveReload.api.updateMissionChecklist();
  afterArchiveReload.api.updateArchiveMissionActionVisibility();
  assert.deepEqual(afterArchiveReload.taskElements.map((task) => task.checked), [false, false, false]);
  assert.deepEqual(clone(afterArchiveReload.api.founder.missionObjectiveCompletion), []);
  assert.equal(afterArchiveReload.api.founder.missionStatus, "inactive");
  assert.equal(afterArchiveReload.elements.get("mission-progress").textContent, "Mission Progress: 0%");
  assert.equal(afterArchiveReload.elements.get("archive-mission-button").hidden, true);

  afterArchiveReload.api.setPendingMissionRequest(request);
  afterArchiveReload.api.generateMission();
  afterArchiveReload.api.updateMissionChecklist();
  assert.deepEqual(afterArchiveReload.taskElements.map((task) => task.checked), [false, false, false]);
  assert.deepEqual(clone(afterArchiveReload.api.founder.missionObjectiveCompletion), []);
  assert.equal(afterArchiveReload.api.founder.commandLog.length, 1);
  assert.equal(afterArchiveReload.api.founder.xp, 75);
  assert.equal(afterArchiveReload.api.founder.pendingMissionRequest.missionIntent, "practice-rapport");
});

test("already-migrated authoritative completion ignores stale legacy objective keys", () => {
  const storage = new Map([
    ["objective-0", "true"],
    ["digitalMikeyFounder", JSON.stringify({
      onboardingComplete: true,
      currentMission: "Legacy active mission",
      missionStatus: "active",
      missionObjectives: ["One", "Two", "Three"],
      missionObjectiveCompletion: [],
      missionObjectiveCompletionMigrated: true,
    })],
  ]);
  const missionsPage = loadPage(storage, "missions");
  missionsPage.api.updateMissionChecklist();
  assert.equal(missionsPage.taskElements[0].checked, false);
  checkObjective(missionsPage, 1);
  assert.deepEqual(clone(missionsPage.api.founder.missionObjectiveCompletion), [false, true, false]);
  assert.equal(storage.get("objective-0"), "true");
  assert.equal(storage.has("objective-1"), false);
  assert.equal(JSON.parse(storage.get("digitalMikeyFounder")).missionStatus, "active");
});
