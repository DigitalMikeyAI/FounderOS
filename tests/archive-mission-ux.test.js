const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function load(relativePath, context) {
  const file = path.join(root, relativePath);
  vm.runInContext(fs.readFileSync(file, "utf8"), context, { filename: file });
}

function createElement({ hidden = false } = {}) {
  return {
    textContent: "",
    innerHTML: "",
    style: {},
    dataset: {},
    checked: false,
    hidden,
    children: [],
    handlers: {},
    addEventListener(type, handler) {
      this.handlers[type] = handler;
    },
    appendChild(child) {
      this.children.push(child);
    },
  };
}

function loadHarness() {
  const storage = new Map();
  const elements = new Map();
  const removedKeys = [];
  const getElementById = (id) => {
    if (!elements.has(id)) {
      elements.set(
        id,
        createElement({ hidden: id === "archive-mission-button" }),
      );
    }
    return elements.get(id);
  };
  const context = vm.createContext({
    console: { log() {}, warn() {}, error() {} },
    Date,
    Math,
    JSON,
    localStorage: {
      getItem(key) {
        return storage.has(key) ? storage.get(key) : null;
      },
      setItem(key, value) {
        storage.set(key, String(value));
      },
      removeItem(key) {
        removedKeys.push(key);
        storage.delete(key);
      },
    },
    document: {
      getElementById,
      createElement() {
        return createElement();
      },
      querySelectorAll(selector) {
        return selector === ".mission-task" ? context.__testTasks : [];
      },
    },
    CommanderSystem: {
      save() {
        context.saveFounder();
        return true;
      },
    },
    updateFounderLevel() {},
    updateFounderDisplay() {},
    updateCommandLog() {},
    updateXP() {},
    updateMissionProgress() {},
    updateMissionStatus() {},
    generateArchieLogNote() {
      return "Archived by Commander";
    },
    ArchieCore: {
      refreshSession() {
        return Promise.resolve();
      },
    },
    __testTasks: [],
  });

  load("js/storage.js", context);
  load("systems/domain-competency.contract.js", context);
  load("systems/mission.system.js", context);
  load("js/missions.js", context);
  load("js/endday.js", context);
  vm.runInContext(
    ";globalThis.__api = { founder, updateActiveMission, setPendingMissionRequest, archiveMissionDay };",
    context,
  );

  function setTasks(states) {
    const testTasks = states.map((checked, index) => ({
      id: `objective-${index}`,
      checked,
      dataset: { xp: "25" },
      handlers: {},
      addEventListener(type, handler) {
        this.handlers[type] = handler;
      },
    }));
    context.__testTasks = testTasks;
    vm.runInContext("tasks = __testTasks;", context);
    return testTasks;
  }

  return {
    context,
    storage,
    elements,
    removedKeys,
    api: context.__api,
    setTasks,
  };
}

test("Missions page places one Archive Mission action beside the active mission", () => {
  const html = fs.readFileSync(path.join(root, "missions.html"), "utf8");
  const spotlight = html.match(
    /<section class="mission-spotlight">[\s\S]*?<\/section>/,
  )?.[0];

  assert.ok(spotlight);
  assert.match(spotlight, /id="archive-mission-button"/);
  assert.match(spotlight, />\s*Archive Mission\s*</);
  assert.match(spotlight, /archive-mission-button" type="button" hidden/);
  assert.equal((html.match(/id="archive-mission-button"/g) || []).length, 1);
  assert.match(html, /id="end-day-button"/);
  assert.match(html, /id="select-presentation-mission"/);
});

test("Archive Mission is visible only for a current active mission", () => {
  const { elements, api } = loadHarness();
  const button = elements.get("archive-mission-button");

  Object.assign(api.founder, { currentMission: "", missionStatus: "inactive" });
  api.updateActiveMission();
  assert.equal(button.hidden, true);
  assert.equal(elements.get("confirm-day").hidden, true);

  Object.assign(api.founder, {
    currentMission: "Practice Customer Discovery",
    missionStatus: "inactive",
  });
  api.updateActiveMission();
  assert.equal(button.hidden, true);
  assert.equal(elements.get("confirm-day").hidden, true);

  api.founder.missionStatus = "active";
  api.updateActiveMission();
  assert.equal(button.hidden, false);
  assert.equal(elements.get("confirm-day").hidden, false);
});

test("incomplete Archive Mission requires confirmation and cancel preserves activity", () => {
  const { elements, api, setTasks } = loadHarness();
  Object.assign(api.founder, {
    currentMission: "Practice Product Selection",
    missionStatus: "active",
  });
  setTasks([false, false, false]);
  api.updateActiveMission();

  elements.get("archive-mission-button").handlers.click();

  assert.equal(api.founder.missionStatus, "active");
  assert.equal(elements.get("confirmation-box").style.display, "flex");
  assert.equal(
    elements.get("archive-confirmation-title").textContent,
    "Archive this mission?",
  );
  assert.equal(
    elements.get("archive-confirmation-message").textContent,
    "Some objectives are incomplete (0 of 3 complete). They will remain incomplete.",
  );
  assert.equal(elements.get("abort-confirm").textContent, "Cancel");

  elements.get("abort-confirm").handlers.click();
  assert.equal(elements.get("confirmation-box").style.display, "none");
  assert.notEqual(elements.get("mission-report").style.display, "flex");
  assert.equal(api.founder.missionStatus, "active");
});

test("confirmed incomplete archive reuses authority without fabricating XP", () => {
  const { elements, removedKeys, api, setTasks } = loadHarness();
  Object.assign(api.founder, {
    currentMission: "Practice a Customer-Need Presentation",
    missionStatus: "active",
    xp: 10,
    streak: 4,
    commandLog: [],
  });
  const tasks = setTasks([false, false, false]);
  api.updateActiveMission();

  elements.get("archive-mission-button").handlers.click();
  elements.get("finalize-day").handlers.click();

  assert.equal(api.founder.missionStatus, "inactive");
  assert.equal(api.founder.xp, 10);
  assert.equal(api.founder.streak, 4);
  assert.equal(api.founder.memory.lastMissionXP, 0);
  assert.equal(api.founder.memory.lastCompletedTaskCount, 0);
  assert.deepEqual(tasks.map((task) => task.checked), [false, false, false]);
  assert.deepEqual(removedKeys, ["objective-0", "objective-1", "objective-2"]);
  assert.equal(api.founder.commandLog[0].xp, 0);
  assert.equal(api.founder.commandLog[0].objectives, 0);
  assert.equal(elements.get("archive-mission-button").hidden, true);
  assert.equal(elements.get("confirm-day").hidden, true);
});

test("completed mission still requires confirmation and preserves exact XP rules", () => {
  const { elements, api, setTasks } = loadHarness();
  Object.assign(api.founder, {
    currentMission: "Practice a Trial Close",
    missionStatus: "active",
    xp: 25,
    streak: 2,
    commandLog: [],
  });
  setTasks([true, true, true]);
  api.updateActiveMission();

  elements.get("archive-mission-button").handlers.click();

  assert.equal(api.founder.missionStatus, "active");
  assert.equal(
    elements.get("archive-confirmation-title").textContent,
    "Archive completed mission?",
  );
  assert.equal(
    elements.get("archive-confirmation-message").textContent,
    "All objectives are complete. Confirm to archive this mission.",
  );

  elements.get("finalize-day").handlers.click();
  assert.equal(api.founder.missionStatus, "inactive");
  assert.equal(api.founder.xp, 100);
  assert.equal(api.founder.streak, 3);
  assert.equal(api.founder.commandLog[0].xp, 75);
  assert.equal(api.founder.commandLog[0].objectives, 3);
});

test("archive preserves pending preview behavior without auto-accept", () => {
  const { elements, api, setTasks } = loadHarness();
  Object.assign(api.founder, {
    onboardingComplete: true,
    currentMission: "Practice Customer Discovery",
    missionStatus: "active",
    commandLog: [],
  });
  setTasks([false, false, false]);
  api.setPendingMissionRequest({
    domain: "camping.sales",
    missionIntent: "practice-presentation",
  });

  elements.get("archive-mission-button").handlers.click();
  elements.get("finalize-day").handlers.click();

  assert.equal(api.founder.missionStatus, "inactive");
  assert.equal(
    elements.get("mission-title").textContent,
    "Practice a Customer-Need Presentation",
  );
  assert.notEqual(elements.get("accept-mission").style.display, "none");
  assert.deepEqual(clone(api.founder.pendingMissionRequest), {
    domain: "camping.sales",
    missionIntent: "practice-presentation",
  });
});

test("End Day retains its report, XP summary, and return-to-report flow", () => {
  const { elements, api, setTasks } = loadHarness();
  Object.assign(api.founder, {
    currentMission: "Practice Customer Discovery",
    missionStatus: "active",
  });
  setTasks([true, false, true]);

  elements.get("end-day-button").handlers.click();
  assert.equal(elements.get("mission-report").style.display, "flex");
  assert.equal(elements.get("report-xp").textContent, "50 XP");
  assert.equal(
    elements.get("report-tasks").textContent,
    "2 / 3 objectives completed",
  );

  elements.get("confirm-day").handlers.click();
  assert.equal(elements.get("mission-report").style.display, "none");
  assert.equal(elements.get("confirmation-box").style.display, "flex");
  assert.equal(elements.get("abort-confirm").textContent, "Return To Debrief");
  assert.equal(api.founder.missionStatus, "active");

  elements.get("abort-confirm").handlers.click();
  assert.equal(elements.get("confirmation-box").style.display, "none");
  assert.equal(elements.get("mission-report").style.display, "flex");
  assert.equal(api.founder.missionStatus, "active");
});

test("Archive Mission adds no evidence, Profile, or alternate archive authority", () => {
  const endDaySource = fs.readFileSync(path.join(root, "js/endday.js"), "utf8");
  const missionSource = fs.readFileSync(path.join(root, "js/missions.js"), "utf8");

  assert.equal((endDaySource.match(/function archiveMissionDay\(/g) || []).length, 1);
  assert.equal((endDaySource.match(/archiveMissionDay\(\);/g) || []).length, 1);
  assert.doesNotMatch(
    `${endDaySource}\n${missionSource}`,
    /processFieldReport|salesStepOutcomes|learningSignals|coachingSignals|behavioralEvidence|profile\.capabilities|profileCapability/,
  );
});
