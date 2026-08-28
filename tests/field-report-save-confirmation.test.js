const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function makeElement(value = "") {
  const classes = new Set();
  return {
    value,
    checked: false,
    textContent: "",
    innerHTML: "",
    children: [],
    style: {},
    handlers: {},
    resetCount: 0,
    classList: {
      add(name) {
        classes.add(name);
      },
      remove(name) {
        classes.delete(name);
      },
      contains(name) {
        return classes.has(name);
      },
    },
    addEventListener(type, handler) {
      this.handlers[type] = handler;
    },
    appendChild(child) {
      this.children.push(child);
    },
    reset() {
      this.resetCount += 1;
    },
  };
}

function loadHarness({ existingContainer = null, saveError = null } = {}) {
  const elements = new Map();
  const getElementById = (id) => {
    if (!elements.has(id)) elements.set(id, makeElement());
    return elements.get(id);
  };
  const expanded = makeElement();
  const collapsed = makeElement();
  const persisted = [];
  const communicationCalls = { pause: 0, resume: 0 };
  const authorityCalls = {
    missionAccept: 0,
    missionComplete: 0,
    evidence: 0,
    profile: 0,
    guidance: 0,
    briefing: 0,
    coaching: 0,
  };
  const founder = {
    currentMission: "Practice a Trial Close",
    missionStatus: "active",
    missionProgress: 2,
    missionComplete: false,
    profile: { capabilities: [] },
    behavioralEvidence: [],
    coachingSignals: [],
  };
  const location = { href: "index.html#field-report-card" };
  const MemorySystem = {
    getArtifact() {
      return existingContainer;
    },
    saveArtifact(artifact) {
      if (saveError) throw saveError;
      persisted.push(clone(artifact));
      return artifact;
    },
  };
  const context = vm.createContext({
    console: { log() {}, warn() {}, error() {} },
    Date,
    Math,
    JSON,
    Set,
    clearTimeout() {},
    setTimeout(callback) {
      callback();
      return 1;
    },
    location,
    window: {},
    founder,
    MemorySystem,
    CommunicationSystem: {
      pause() {
        communicationCalls.pause += 1;
      },
      resume() {
        communicationCalls.resume += 1;
      },
    },
    MissionSystem: {
      accept() {
        authorityCalls.missionAccept += 1;
      },
      complete() {
        authorityCalls.missionComplete += 1;
      },
    },
    MissionIntelligenceSystem: {
      processFieldReport() {
        authorityCalls.evidence += 1;
      },
    },
    ProfileSystem: {
      update() {
        authorityCalls.profile += 1;
      },
    },
    GuidanceSystem: {
      build() {
        authorityCalls.guidance += 1;
      },
    },
    ArchieCore: {
      beginBriefing() {
        authorityCalls.briefing += 1;
      },
    },
    CoachingSystem: {
      update() {
        authorityCalls.coaching += 1;
      },
    },
    document: {
      readyState: "complete",
      getElementById,
      querySelector(selector) {
        if (selector === ".field-report-expanded") return expanded;
        if (selector === ".field-report-collapsed") return collapsed;
        return null;
      },
      querySelectorAll(selector) {
        return selector === ".fr-interaction-block" ? [] : [];
      },
      createElement() {
        return makeElement();
      },
    },
  });

  getElementById("fr-date").value = "2026-08-28";
  getElementById("fr-dailyWin").value = "Kept the save path bounded";
  for (const id of [
    "field-report-enter",
    "fr-add-interaction",
    "fr-interactions-container",
    "fr-save",
    "fr-cancel",
    "fr-feedback",
    "fr-keyLearning",
    "fr-biggestChallenge",
    "fr-nextFocus",
    "fr-notes",
    "fr-capturebay",
    "field-report-form",
    "system-notification",
    "notification-message",
    "system-close",
  ]) {
    getElementById(id);
  }

  for (const relativePath of [
    "js/notifications.js",
    "js/widgets/field-report.widget.js",
  ]) {
    const file = path.join(root, relativePath);
    vm.runInContext(fs.readFileSync(file, "utf8"), context, { filename: file });
  }

  return {
    authorityCalls,
    collapsed,
    communicationCalls,
    context,
    elements,
    expanded,
    founder,
    location,
    persisted,
  };
}

async function save(harness) {
  await harness.elements.get("fr-save").handlers.click();
}

function assertConfirmation(harness) {
  assert.equal(
    harness.elements.get("notification-message").textContent,
    "Field Report saved",
  );
  assert.equal(harness.elements.get("system-close").textContent, "Confirm");
  assert.equal(harness.elements.get("system-notification").style.display, "flex");
  assert.equal(harness.communicationCalls.pause, 1);
  assert.equal(harness.authorityCalls.briefing, 0);
}

test("both save branches use the exact bounded confirmation configuration", () => {
  const widgetSource = fs.readFileSync(
    path.join(root, "js/widgets/field-report.widget.js"),
    "utf8",
  );
  const confirmations = widgetSource.match(
    /showNotification\('Field Report saved', \{\s*buttonLabel: 'Confirm',\s*beginBriefing: false\s*\}\);/g,
  );

  assert.equal(confirmations?.length, 2);
  assert.doesNotMatch(widgetSource, /buttonLabel: 'Done'/);
});

test("successful new-container save persists once and displays Confirm", async () => {
  const harness = loadHarness();

  await save(harness);

  assert.equal(harness.persisted.length, 1);
  assert.equal(harness.persisted[0].type, "camping.fieldReports");
  assert.equal(harness.persisted[0].reports.length, 1);
  assert.equal(
    harness.persisted[0].reports[0].dailyCore.dailyWin,
    "Kept the save path bounded",
  );
  assertConfirmation(harness);
});

test("successful existing-container save appends once and displays Confirm", async () => {
  const existingReport = { id: "existing-report", reportType: "quick-capture" };
  const harness = loadHarness({
    existingContainer: {
      type: "camping.fieldReports",
      reports: [existingReport],
      createdAt: "2026-08-27T12:00:00.000Z",
      updatedAt: "2026-08-27T12:00:00.000Z",
    },
  });

  await save(harness);

  assert.equal(harness.persisted.length, 1);
  assert.equal(harness.persisted[0].reports.length, 2);
  assert.deepEqual(harness.persisted[0].reports[0], existingReport);
  assert.equal(harness.persisted[0].reports[1].reportType, "quick-capture");
  assertConfirmation(harness);
});

test("acknowledgment dismisses only and leaves mission and authority state untouched", async () => {
  const harness = loadHarness();
  const founderBefore = clone(harness.founder);
  const locationBefore = clone(harness.location);

  await save(harness);
  const persistedAfterSave = clone(harness.persisted);
  harness.elements.get("system-close").onclick();

  assert.equal(harness.elements.get("system-notification").style.display, "none");
  assert.equal(harness.communicationCalls.resume, 1);
  assert.deepEqual(harness.persisted, persistedAfterSave);
  assert.deepEqual(clone(harness.founder), founderBefore);
  assert.deepEqual(clone(harness.location), locationBefore);
  assert.deepEqual(harness.authorityCalls, {
    missionAccept: 0,
    missionComplete: 0,
    evidence: 0,
    profile: 0,
    guidance: 0,
    briefing: 0,
    coaching: 0,
  });
});

test("existing failed save paths do not display a success confirmation", async () => {
  const invalidShape = loadHarness({
    existingContainer: { type: "camping.fieldReports" },
  });
  await save(invalidShape);
  assert.equal(invalidShape.persisted.length, 0);
  assert.equal(invalidShape.elements.get("notification-message").textContent, "");
  assert.match(invalidShape.elements.get("fr-feedback").textContent, /Save aborted/);

  const thrownSave = loadHarness({ saveError: new Error("persistence failed") });
  await save(thrownSave);
  assert.equal(thrownSave.persisted.length, 0);
  assert.equal(thrownSave.elements.get("notification-message").textContent, "");
  assert.equal(thrownSave.elements.get("fr-feedback").textContent, "Save failed");
});

test("legitimate mission and handoff copy remains unchanged", () => {
  const indexHtml = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const missionsHtml = fs.readFileSync(path.join(root, "missions.html"), "utf8");
  const missionsSource = fs.readFileSync(path.join(root, "js/missions.js"), "utf8");

  for (const html of [indexHtml, missionsHtml]) {
    assert.match(html, />🚀 Begin Your Mission<\/button>/);
    assert.match(html, />ACCEPT MISSION<\/button>/);
  }
  assert.match(missionsSource, />Open Field Report<\/a/);
});
