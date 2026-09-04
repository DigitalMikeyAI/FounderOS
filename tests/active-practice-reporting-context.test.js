const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function load(relativePath, context) {
  const filename = path.join(root, relativePath);
  vm.runInContext(fs.readFileSync(filename, "utf8"), context, { filename });
}

function createElement() {
  return {
    textContent: "",
    innerHTML: "",
    style: {},
    hidden: false,
    checked: false,
    dataset: {},
    handlers: {},
    children: [],
    addEventListener(type, handler) { this.handlers[type] = handler; },
    appendChild(child) { this.children.push(child); },
  };
}

function createHarness() {
  const storage = new Map();
  const elements = new Map();
  const missionChoices = [];
  const experienceChoices = [];
  const context = vm.createContext({
    console: { log() {}, warn() {}, error() {} },
    Date,
    Math,
    JSON,
    localStorage: {
      get length() { return storage.size; },
      key(index) { return Array.from(storage.keys())[index] || null; },
      getItem(key) { return storage.has(key) ? storage.get(key) : null; },
      setItem(key, value) { storage.set(key, String(value)); },
      removeItem(key) { storage.delete(key); },
    },
    document: {
      body: { classList: { add() {}, remove() {} } },
      addEventListener() {},
      getElementById(id) {
        if (!elements.has(id)) elements.set(id, createElement());
        return elements.get(id);
      },
      querySelectorAll(selector) {
        if (selector === ".mission-choice") return missionChoices;
        if (selector === ".experience-choice") return experienceChoices;
        return [];
      },
      querySelector() { return null; },
      createElement,
    },
    window: {},
    setTimeout() { return 1; },
    clearTimeout() {},
    CommanderSystem: { save() { context.saveFounder(); return true; } },
    updateFounderLevel() {},
    updateFounderDisplay() {},
    updateCommandLog() {},
    updateXP() {},
    updateMissionProgress() {},
    updateMissionStatus() {},
    generateArchieLogNote() { return "Archived by Commander"; },
    ArchieCore: {
      session: {},
      beginSession() { return Promise.resolve(); },
      refreshSession() { return Promise.resolve(); },
      getSnapshot() { return {}; },
    },
    Archie: { getMissionWorkspaceProjection() { return null; }, speak() {} },
    WorkshopController: { initialize() {} },
    showNotification() {},
  });
  for (const relativePath of [
    "js/storage.js",
    "systems/domain-competency.contract.js",
    "systems/mission.system.js",
    "systems/mission-intelligence.system.js",
    "js/missions.js",
    "js/endday.js",
  ]) load(relativePath, context);
  vm.runInContext(
    `globalThis.__api = {
      founder, saveFounder, loadFounder, MissionIntelligenceSystem,
      setPendingMissionRequest, generateMission,
      establishAcceptedPracticeMissionContext, archiveMissionDay
    };`,
    context,
  );
  return { context, storage, api: context.__api };
}

function loadAcceptanceHarness() {
  const harness = createHarness();
  load("js/main.js", harness.context);
  return harness;
}

const practices = [
  ["rapport", "practice-rapport", "Practice Referencing Customer Context"],
  ["discovery", "practice-customer-discovery", "Practice Customer Discovery"],
  ["product-selection", "practice-product-selection", "Practice Product Selection"],
  ["presentation", "practice-presentation", "Practice a Customer-Need Presentation"],
  ["objection-handling", "practice-objection-handling", "Practice Objection Handling"],
  ["trial-close", "practice-trial-close", "Practice a Trial Close"],
];

function activeContext(competency = "trial-close", missionIntent = "practice-trial-close") {
  return {
    type: "active-practice-mission-context",
    version: 1,
    domain: "camping.sales",
    competency,
    missionIntent,
  };
}

function missionWithRefs(...competencies) {
  return {
    status: "active",
    objectives: [
      "Prepare without claiming performance.",
      ...competencies.map((competency, index) => ({
        text: `Canonical objective ${index}`,
        competencyRef: { domain: "camping.sales", competency },
      })),
      "Record only what actually happened.",
    ],
  };
}

function project(context = activeContext(), mission = missionWithRefs("trial-close")) {
  return clone(
    createHarness().api.MissionIntelligenceSystem.buildActivePracticeReportingContext(
      context,
      mission,
    ),
  );
}

test("all six canonical contexts produce exact neutral reporting envelopes", () => {
  for (const [competency, missionIntent, label] of practices) {
    assert.deepEqual(project(activeContext(competency, missionIntent), missionWithRefs(competency)), {
      type: "practice-reporting-context",
      version: 1,
      domain: "camping.sales",
      competency,
      label,
      missionIntent,
      source: { basis: "active-practice-mission" },
    });
  }
});

test("output is exact fresh detached and deterministic", () => {
  const harness = createHarness();
  const context = activeContext();
  const mission = missionWithRefs("trial-close");
  const before = clone({ context, mission });
  const first = harness.api.MissionIntelligenceSystem.buildActivePracticeReportingContext(context, mission);
  const second = harness.api.MissionIntelligenceSystem.buildActivePracticeReportingContext(context, mission);
  assert.deepEqual(Object.keys(first), ["type", "version", "domain", "competency", "label", "missionIntent", "source"]);
  assert.deepEqual(clone(first), clone(second));
  assert.notEqual(first, second);
  assert.notEqual(first.source, second.source);
  first.source.basis = "changed";
  assert.deepEqual({ context, mission }, before);
  assert.equal(second.source.basis, "active-practice-mission");
});

test("inactive missing malformed and extra-field persisted contexts fail closed", () => {
  for (const [context, mission] of [
    [activeContext(), { ...missionWithRefs("trial-close"), status: "inactive" }],
    [null, missionWithRefs("trial-close")],
    [{}, missionWithRefs("trial-close")],
    [{ ...activeContext(), extra: true }, missionWithRefs("trial-close")],
    [{ ...activeContext(), version: 2 }, missionWithRefs("trial-close")],
    [{ ...activeContext(), domain: "other" }, missionWithRefs("trial-close")],
    [activeContext("unsupported", "practice-trial-close"), missionWithRefs("trial-close")],
    [activeContext("trial-close", "practice-unknown"), missionWithRefs("trial-close")],
    [activeContext("rapport", "practice-trial-close"), missionWithRefs("rapport")],
  ]) assert.equal(project(context, mission), null);
});

test("objective ambiguity and malformed references fail closed", () => {
  const malformed = {
    status: "active",
    objectives: [{
      text: "Malformed",
      competencyRef: { domain: "camping.sales", competency: "unsupported" },
    }],
  };
  const wrongDomain = clone(malformed);
  wrongDomain.objectives[0].competencyRef = { domain: "other", competency: "trial-close" };
  for (const mission of [
    { status: "active", objectives: [] },
    { status: "active", objectives: ["Legacy only"] },
    malformed,
    wrongDomain,
    missionWithRefs("trial-close", "rapport"),
    missionWithRefs("rapport"),
    { status: "active", objectives: [{ text: "" }, missionWithRefs("trial-close").objectives[1]] },
  ]) assert.equal(project(activeContext(), mission), null);
});

test("duplicate same competency references and valid untagged objectives are allowed", () => {
  const result = project(
    activeContext(),
    missionWithRefs("trial-close", "trial-close"),
  );
  assert.equal(result.competency, "trial-close");
  assert.equal(result.missionIntent, "practice-trial-close");
});

test("titles descriptions objective prose and unrelated state cannot create context", () => {
  const mission = {
    status: "active",
    title: "Practice a Trial Close",
    description: "practice-trial-close trial-close",
    objectives: ["Ask the question during a customer interaction."],
    xp: 999,
    completion: [true],
    commandLog: [{ mission: "Practice a Trial Close" }],
    profile: { capabilities: ["trial-close"] },
    developmentFocus: { competency: "trial-close" },
  };
  assert.equal(project(null, mission), null);
  assert.equal(project(activeContext(), mission), null);
});

test("acceptance helper establishes exact active-only context for all six generated requests", () => {
  for (const [competency, missionIntent] of practices) {
    const { api } = createHarness();
    api.setPendingMissionRequest({ domain: "camping.sales", missionIntent });
    api.generateMission();
    assert.equal(api.founder.activePracticeMissionContext, null);
    api.founder.missionStatus = "active";
    assert.deepEqual(clone(api.establishAcceptedPracticeMissionContext()), activeContext(competency, missionIntent));
    assert.deepEqual(clone(api.founder.activePracticeMissionContext), activeContext(competency, missionIntent));
  }
});

test("real ACCEPT MISSION establishes all six contexts and leaves generic missions without one", async () => {
  for (const [competency, missionIntent] of practices) {
    const { context, api } = loadAcceptanceHarness();
    api.setPendingMissionRequest({ domain: "camping.sales", missionIntent });
    api.generateMission();
    await context.document.getElementById("accept-mission").handlers.click();
    assert.equal(api.founder.missionStatus, "active");
    assert.deepEqual(
      clone(api.founder.activePracticeMissionContext),
      activeContext(competency, missionIntent),
    );
  }

  const { context, api } = loadAcceptanceHarness();
  api.founder.missionGoal = "Build a Business";
  api.generateMission();
  await context.document.getElementById("accept-mission").handlers.click();
  assert.equal(api.founder.missionStatus, "active");
  assert.equal(api.founder.activePracticeMissionContext, null);
});

test("generic generation and missing generated request establish no context", () => {
  const { api } = createHarness();
  api.founder.activePracticeMissionContext = activeContext();
  api.founder.missionGoal = "Build a Business";
  api.generateMission();
  api.founder.missionStatus = "active";
  assert.equal(api.establishAcceptedPracticeMissionContext(), null);
  assert.equal(api.founder.activePracticeMissionContext, null);
});

test("active practice context survives save reload and objective completion state changes", () => {
  const { context, api } = createHarness();
  api.setPendingMissionRequest({ domain: "camping.sales", missionIntent: "practice-trial-close" });
  api.generateMission();
  api.founder.missionStatus = "active";
  api.establishAcceptedPracticeMissionContext();
  api.saveFounder();
  const expected = clone(api.founder.activePracticeMissionContext);
  api.founder.activePracticeMissionContext = null;
  api.loadFounder();
  assert.deepEqual(clone(api.founder.activePracticeMissionContext), expected);
  vm.runInContext("founder.missionObjectiveCompletion = [true, false, true]; saveFounder();", context);
  assert.deepEqual(clone(api.founder.activePracticeMissionContext), expected);
});

test("new mission generation clears stale active practice context", () => {
  const { api } = createHarness();
  api.founder.activePracticeMissionContext = activeContext();
  api.founder.missionStatus = "inactive";
  api.founder.missionGoal = "Build a Business";
  api.generateMission();
  assert.equal(api.founder.activePracticeMissionContext, null);
});

test("archive clears active practice context without adding it to history", () => {
  const { context, api } = createHarness();
  api.setPendingMissionRequest({ domain: "camping.sales", missionIntent: "practice-trial-close" });
  api.generateMission();
  api.founder.missionStatus = "active";
  api.establishAcceptedPracticeMissionContext();
  vm.runInContext("tasks = [];", context);
  const result = api.archiveMissionDay();
  assert.equal(result.success, true);
  assert.equal(api.founder.activePracticeMissionContext, null);
  assert.equal(api.founder.missionStatus, "inactive");
  assert.equal(Object.hasOwn(api.founder.commandLog[0], "activePracticeMissionContext"), false);
  assert.equal(Object.hasOwn(api.founder.commandLog[0], "missionIntent"), false);
});

test("legacy missing and malformed contexts are not inferred or repaired", () => {
  const legacy = createHarness();
  legacy.storage.set("digitalMikeyFounder", JSON.stringify({
    currentMission: "Practice a Trial Close",
    missionStatus: "active",
    missionObjectives: missionWithRefs("trial-close").objectives,
  }));
  legacy.api.loadFounder();
  assert.equal(legacy.api.founder.activePracticeMissionContext, null);

  const malformed = createHarness();
  malformed.storage.set("digitalMikeyFounder", JSON.stringify({
    activePracticeMissionContext: { competency: "trial-close" },
    currentMission: "Practice a Trial Close",
    missionStatus: "active",
    missionObjectives: missionWithRefs("trial-close").objectives,
  }));
  malformed.api.loadFounder();
  assert.deepEqual(clone(malformed.api.founder.activePracticeMissionContext), { competency: "trial-close" });
  assert.equal(
    malformed.api.MissionIntelligenceSystem.buildActivePracticeReportingContext(
      malformed.api.founder.activePracticeMissionContext,
      { status: "active", objectives: malformed.api.founder.missionObjectives },
    ),
    null,
  );
});

test("reporting projection and acceptance context contain no evidence or outcome authority", () => {
  const serialized = JSON.stringify(project());
  for (const key of [
    "performed", "attempted", "completed", "succeeded", "failed", "result",
    "outcome", "evidence", "evidenceTier", "review", "confidence", "score",
    "rank", "mastery", "weakness", "need", "improvement", "xp", "history",
    "recommendation", "developmentFocus",
  ]) assert.equal(serialized.toLowerCase().includes(`\"${key.toLowerCase()}\"`), false, key);
});

test("production context paths do not touch Field Reports or evidence authorities", () => {
  const missionSource = fs.readFileSync(path.join(root, "js", "missions.js"), "utf8");
  const start = missionSource.indexOf("function establishAcceptedPracticeMissionContext(");
  const end = missionSource.indexOf("\n// =====================================================", start);
  const acceptance = missionSource.slice(start, end);
  const intelligenceSource = fs.readFileSync(
    path.join(root, "systems", "mission-intelligence.system.js"),
    "utf8",
  );
  const projectionStart = intelligenceSource.indexOf("  buildActivePracticeReportingContext(");
  const projectionEnd = intelligenceSource.indexOf("\n  // =====================================================", projectionStart);
  const projection = intelligenceSource.slice(projectionStart, projectionEnd);
  assert.doesNotMatch(
    `${acceptance}\n${projection}`,
    /fieldReport|customerInteraction|salesStepOutcome|identifyBehavioralEvidence|behavioralEvidenceReview|E3|E4|Profile|developmentFocus|recommendPractice|commandLog|archive|\bxp\b|completion|saveArtifact/i,
  );
});

test("existing acceptance is the only establishment call site", () => {
  const mainSource = fs.readFileSync(path.join(root, "js", "main.js"), "utf8");
  const production = ["js/storage.js", "js/missions.js", "js/main.js", "js/endday.js"]
    .map((relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8"))
    .join("\n");
  assert.match(
    mainSource,
    /acceptMission\.addEventListener[\s\S]*founder\.missionStatus = "active"[\s\S]*establishAcceptedPracticeMissionContext\(\)/,
  );
  assert.equal(
    (production.match(/establishAcceptedPracticeMissionContext\(\);/g) || []).length,
    1,
  );
});