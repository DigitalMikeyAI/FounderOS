const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const canonicalRequest = {
  domain: "camping.sales",
  missionIntent: "practice-trial-close",
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function loadSource(relativePath, context) {
  const file = path.join(root, relativePath);
  vm.runInContext(fs.readFileSync(file, "utf8"), context, { filename: file });
}

function createElement(textContent = "") {
  return {
    textContent,
    innerHTML: "",
    style: {},
    dataset: {},
    checked: false,
    children: [],
    handlers: {},
    classList: { add() {}, remove() {} },
    addEventListener(type, handler) {
      this.handlers[type] = handler;
    },
    appendChild(child) {
      this.children.push(child);
    },
    querySelector() {
      return null;
    },
  };
}

function loadHarness({
  storageMap = new Map(),
  sessionMap = new Map(),
  notifier = [],
} = {}) {
  const storage = storageMap;
  const elements = new Map();
  const documentHandlers = {};
  const missionChoices = [createElement("Build a Business")];
  const experienceChoices = [createElement("Beginner")];
  const getElementById = (id) => {
    if (id === "mission-task-container") return null;
    if (!elements.has(id)) elements.set(id, createElement());
    return elements.get(id);
  };

  const context = vm.createContext({
    console: { log() {}, info() {}, warn() {}, error() {} },
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
        storage.delete(key);
      },
    },
    sessionStorage: {
      getItem(key) {
        return sessionMap.has(key) ? sessionMap.get(key) : null;
      },
      setItem(key, value) {
        sessionMap.set(key, String(value));
      },
      removeItem(key) {
        sessionMap.delete(key);
      },
    },
    document: {
      body: { classList: { add() {}, remove() {} } },
      addEventListener(type, handler) {
        documentHandlers[type] = handler;
      },
      getElementById,
      createElement() {
        return createElement();
      },
      querySelectorAll(selector) {
        if (selector === ".mission-choice") return missionChoices;
        if (selector === ".experience-choice") return experienceChoices;
        if (selector === ".mission-task") return [];
        return [];
      },
      querySelector() {
        return null;
      },
    },
    window: {},
    setTimeout() {
      return 1;
    },
    clearTimeout() {},
    MissionSystem: {
      normalizeMissionObjective(objective) {
        return typeof objective === "string" ? { text: objective } : objective;
      },
    },
    CommanderSystem: {
      save() {
        context.saveFounder();
        return true;
      },
    },
    ArchieCore: {
      async beginSession() {},
      async refreshSession() {},
      getSnapshot() {
        return {};
      },
      session: { previousVisitAt: "" },
    },
    Archie: {
      getMissionWorkspaceProjection() {
        return null;
      },
      speak() {},
    },
    WorkshopController: { initialize() {} },
    updateFounderLevel() {},
    updateFounderDisplay() {},
    updateMissionProgress() {},
    updateMissionStatus() {},
    updateXP() {},
    updateCommandLog() {},
    generateArchieLogNote() {
      return "Archived by Commander";
    },
    showNotification(message) {
      notifier.push(message);
    },
  });

  loadSource("js/storage.js", context);
  loadSource("js/missions.js", context);
  loadSource("js/endday.js", context);
  loadSource("js/main.js", context);
  vm.runInContext(
    ";globalThis.__api = { founder, saveFounder, loadFounder, selectTrialCloseMissionRequest, presentPendingMissionRequestForPreview, generateMission, archiveMissionDay, dismissMissionPreview, restoreMissionControl, recordFounderVisit };",
    context,
  );

  return {
    context,
    storage,
    sessionMap,
    elements,
    missionChoices,
    experienceChoices,
    documentHandlers,
    notifier,
    archieCore: context.ArchieCore,
    api: context.__api,
  };
}

test("preview copy and visible Not Now action are explicit", () => {
  const html = fs.readFileSync(path.join(root, "missions.html"), "utf8");
  assert.match(html, />🚀 Mission Preview<\/h3>/);
  assert.match(html, /<button id="dismiss-mission-preview">Not Now<\/button>/);
  assert.doesNotMatch(html, /Mission Assigned/);
});

test("Not Now closes only the visual preview and preserves every authority boundary", () => {
  const { elements, api } = loadHarness();
  Object.assign(api.founder, {
    onboardingComplete: true,
    missionStatus: "inactive",
    currentMission: "Existing inactive mission",
    missionDescription: "Existing description",
    missionReward: 75,
    missionObjectives: ["Existing objective"],
    missionObjectiveCompletion: [true],
    xp: 125,
    commandLog: [{ mission: "Earlier mission" }],
    profile: { capabilities: [{ competency: "rapport" }] },
    memory: {
      artifacts: {
        "camping.fieldReports": { reports: [{ id: "report-1" }] },
        "camping.behavioralEvidenceReviews": { reviews: [{ id: "review-1" }] },
      },
    },
  });

  api.selectTrialCloseMissionRequest();
  const before = clone(api.founder);
  const dismissed = elements.get("dismiss-mission-preview").handlers.click();

  assert.equal(dismissed, true);
  assert.equal(elements.get("mission-briefing").style.display, "none");
  assert.deepEqual(clone(api.founder), before);
  assert.deepEqual(clone(api.founder.pendingMissionRequest), canonicalRequest);
});

test("Escape and backdrop dismiss returning previews but not onboarding", () => {
  const escapeHarness = loadHarness();
  escapeHarness.api.founder.onboardingComplete = true;
  escapeHarness.api.founder.missionStatus = "inactive";
  escapeHarness.api.selectTrialCloseMissionRequest();
  escapeHarness.documentHandlers.keydown({ key: "Escape" });
  assert.equal(
    escapeHarness.elements.get("mission-briefing").style.display,
    "none",
  );
  assert.deepEqual(
    clone(escapeHarness.api.founder.pendingMissionRequest),
    canonicalRequest,
  );

  const backdropHarness = loadHarness();
  backdropHarness.api.founder.onboardingComplete = true;
  backdropHarness.api.founder.missionStatus = "inactive";
  backdropHarness.api.selectTrialCloseMissionRequest();
  const briefing = backdropHarness.elements.get("mission-briefing");
  briefing.handlers.click({ target: briefing });
  assert.equal(briefing.style.display, "none");

  const onboardingHarness = loadHarness();
  const onboardingBriefing = onboardingHarness.elements.get("mission-briefing");
  onboardingBriefing.style.display = "flex";
  onboardingHarness.elements.get("mission-result").style.display = "block";
  onboardingHarness.documentHandlers.keydown({ key: "Escape" });
  assert.equal(onboardingBriefing.style.display, "flex");
});

test("returning Commander reaches the exact Trial Close preview and explicitly accepts", async () => {
  const { elements, missionChoices, api } = loadHarness();
  Object.assign(api.founder, {
    onboardingComplete: true,
    missionStatus: "inactive",
    currentMission: "",
    missionObjectives: [],
  });

  const selected = api.selectTrialCloseMissionRequest();

  assert.equal(selected.success, true);
  assert.deepEqual(clone(api.founder.pendingMissionRequest), canonicalRequest);
  assert.equal(elements.get("mission-briefing").style.display, "flex");
  assert.equal(elements.get("mission-result").style.display, "block");
  assert.equal(elements.get("mission-title").textContent, "Practice a Trial Close");
  assert.match(elements.get("mission-description").textContent, /low-pressure question/);
  assert.equal(elements.get("mission-preview-objectives").children.length, 3);
  assert.deepEqual(clone(api.founder.missionObjectives[1].competencyRef), {
    domain: "camping.sales",
    competency: "trial-close",
  });
  assert.equal(api.founder.missionStatus, "inactive");
  assert.equal(missionChoices[0].style.display, "none");
  assert.equal(elements.get("experience-question").style.display, "none");

  await elements.get("accept-mission").handlers.click();

  assert.equal(api.founder.missionStatus, "active");
  assert.equal(api.founder.currentMission, "Practice a Trial Close");
  assert.equal(api.founder.pendingMissionRequest, null);
  assert.equal(
    elements.get("pending-mission-request-status").textContent,
    "",
  );
});

test("active mission is untouched while the explicit request remains pending", () => {
  const { elements, api } = loadHarness();
  Object.assign(api.founder, {
    onboardingComplete: true,
    missionStatus: "active",
    currentMission: "Build Your Foundation",
    missionDescription: "Existing mission",
    missionReward: 100,
    missionObjectives: ["Existing objective"],
  });
  const before = clone(api.founder);

  api.selectTrialCloseMissionRequest();

  assert.equal(api.founder.currentMission, before.currentMission);
  assert.equal(api.founder.missionDescription, before.missionDescription);
  assert.deepEqual(clone(api.founder.missionObjectives), before.missionObjectives);
  assert.equal(api.founder.missionStatus, "active");
  assert.deepEqual(clone(api.founder.pendingMissionRequest), canonicalRequest);
  assert.notEqual(elements.get("mission-briefing").style.display, "flex");
  assert.match(
    elements.get("pending-mission-request-status").textContent,
    /Archive the active mission/,
  );
});

test("malformed pending request fails closed without a generic preview", () => {
  const { elements, api } = loadHarness();
  Object.assign(api.founder, {
    onboardingComplete: true,
    missionStatus: "inactive",
    missionGoal: "Master AI Tools",
    pendingMissionRequest: {
      domain: "Camping Sales",
      missionIntent: "practice-trial-close",
    },
  });

  const result = api.presentPendingMissionRequestForPreview();

  assert.equal(result.success, false);
  assert.equal(result.reason, "invalid-pending-mission-request");
  assert.notEqual(api.founder.currentMission, "Your First AI Workflow");
  assert.notEqual(elements.get("mission-title").textContent, "Your First AI Workflow");
});

test("explicit archive releases the slot, previews the pending request, and survives reload", async () => {
  const { context, elements, api } = loadHarness();
  Object.assign(api.founder, {
    onboardingComplete: true,
    missionStatus: "active",
    currentMission: "Build Your Foundation",
    missionDescription: "Existing mission",
    missionReward: 100,
    missionObjectives: ["Existing objective"],
  });
  api.selectTrialCloseMissionRequest();

  api.archiveMissionDay();

  assert.equal(api.founder.missionStatus, "inactive");
  assert.equal(elements.get("mission-title").textContent, "Practice a Trial Close");
  assert.notEqual(elements.get("accept-mission").style.display, "none");
  assert.deepEqual(clone(api.founder.pendingMissionRequest), canonicalRequest);

  vm.runInContext("founder.missionStatus = 'active';", context);
  api.loadFounder();
  assert.equal(api.founder.missionStatus, "inactive");
  assert.deepEqual(clone(api.founder.pendingMissionRequest), canonicalRequest);

  await elements.get("accept-mission").handlers.click();
  assert.equal(api.founder.missionStatus, "active");
  assert.equal(api.founder.pendingMissionRequest, null);
});

test("first-time onboarding still owns its original generation path", () => {
  const { elements, api } = loadHarness();
  api.founder.onboardingComplete = false;

  api.selectTrialCloseMissionRequest();

  assert.deepEqual(clone(api.founder.pendingMissionRequest), canonicalRequest);
  assert.notEqual(elements.get("mission-briefing").style.display, "flex");
  assert.equal(api.founder.missionStatus, "inactive");
});

test("lifecycle production files do not gain evidence or Profile authority", () => {
  for (const relativePath of ["js/missions.js", "js/main.js", "js/endday.js"]) {
    const source = fs.readFileSync(path.join(root, relativePath), "utf8");
    assert.doesNotMatch(source, /processFieldReport|identifyBehavioralEvidence/);
    assert.doesNotMatch(source, /profile\.capabilities|profileCapability/);
  }
});

test("genuine return shows the welcome once; same-tab page and new tab do not repeat it", () => {
  const sharedStorage = new Map();
  const returnInstant = new Date(
    Date.now() - 25 * 60 * 60 * 1000,
  ).toISOString();

  const firstPage = loadHarness({ storageMap: sharedStorage });
  firstPage.api.founder.onboardingComplete = true;
  firstPage.api.founder.memory.lastVisit = returnInstant;
  firstPage.archieCore.session.previousVisitAt = returnInstant;
  firstPage.api.recordFounderVisit();

  firstPage.api.restoreMissionControl();

  assert.equal(firstPage.notifier.length, 1);
  assert.match(firstPage.notifier[0], /Welcome back/);

  // Same-tab page B: same sessionStorage + same localStorage.
  const pageB = loadHarness({
    storageMap: sharedStorage,
    sessionMap: firstPage.sessionMap,
  });
  pageB.api.loadFounder();
  pageB.archieCore.session.previousVisitAt = returnInstant;
  pageB.api.restoreMissionControl();
  assert.equal(pageB.notifier.length, 0);

  // New tab in the same return window: fresh sessionStorage, shared
  // localStorage return-window marker suppresses the second welcome.
  const newTab = loadHarness({ storageMap: sharedStorage });
  newTab.api.loadFounder();
  newTab.archieCore.session.previousVisitAt = returnInstant;
  newTab.api.restoreMissionControl();
  assert.equal(newTab.notifier.length, 0);
});

test("a later genuine return becomes eligible again and advances the return window", () => {
  const sharedStorage = new Map();
  const firstReturn = new Date(
    Date.now() - 25 * 60 * 60 * 1000,
  ).toISOString();
  const laterReturn = new Date(
    Date.now() - 2 * 24 * 60 * 60 * 1000,
  ).toISOString();

  const firstVisit = loadHarness({ storageMap: sharedStorage });
  firstVisit.api.founder.onboardingComplete = true;
  firstVisit.api.founder.memory.lastVisit = firstReturn;
  firstVisit.archieCore.session.previousVisitAt = firstReturn;
  firstVisit.api.recordFounderVisit();
  firstVisit.api.restoreMissionControl();
  assert.equal(firstVisit.notifier.length, 1);

  // Next-day genuine return: the pre-boot previous visit stamp is again
  // >=24h old, producing a new return window id that is eligible again.
  const laterVisit = loadHarness({ storageMap: sharedStorage });
  laterVisit.api.loadFounder();
  laterVisit.api.founder.memory.lastVisit = laterReturn;
  laterVisit.archieCore.session.previousVisitAt = laterReturn;
  laterVisit.api.recordFounderVisit();
  laterVisit.api.restoreMissionControl();
  assert.equal(laterVisit.notifier.length, 1);
});

test("a recent prior visit (<24h) receives no welcome even in a fresh tab", () => {
  const sharedStorage = new Map();
  const recent = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  const tab = loadHarness({ storageMap: sharedStorage });
  tab.api.founder.onboardingComplete = true;
  tab.api.founder.memory.lastVisit = recent;
  tab.archieCore.session.previousVisitAt = recent;
  tab.api.recordFounderVisit();
  tab.api.restoreMissionControl();

  assert.equal(tab.notifier.length, 0);
});
