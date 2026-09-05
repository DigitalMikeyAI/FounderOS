const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const missionsPath = path.join(root, "js", "missions.js");
const missionsSource = fs.readFileSync(missionsPath, "utf8");

function clone(value) {
  return JSON.parse(JSON.stringify(value));
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
    dataset: {},
    handlers: {},
    children: [],
    addEventListener(type, handler) { this.handlers[type] = handler; },
    appendChild(child) { this.children.push(child); },
  };
}

function createHarness() {
  const elements = new Map();
  const renderedItems = [];
  const saves = [];
  const context = vm.createContext({
    console: { log() {}, warn() {}, error() {} },
    Date,
    Math,
    JSON,
    localStorage: {
      getItem() { return null; },
      setItem(key, value) { saves.push([key, String(value)]); },
      removeItem() {},
    },
    document: {
      getElementById(id) {
        if (!elements.has(id)) elements.set(id, createElement());
        return elements.get(id);
      },
      createElement() {
        const element = createElement();
        element.appendChild = (child) => renderedItems.push(child.innerHTML || child.textContent);
        return element;
      },
      querySelectorAll(selector) { return selector === ".mission-task" ? [] : []; },
    },
    CommanderSystem: { save() { return true; } },
  });
  for (const relativePath of [
    "js/storage.js",
    "systems/domain-competency.contract.js",
    "systems/mission.system.js",
    "systems/mission-intelligence.system.js",
    "js/missions.js",
  ]) load(relativePath, context);
  vm.runInContext(
    ";globalThis.__api = { founder, MissionIntelligenceSystem, renderFieldReportHandoff };",
    context,
  );
  return { api: context.__api, renderedItems, saves };
}

const practices = [
  ["rapport", "practice-rapport"],
  ["discovery", "practice-customer-discovery"],
  ["product-selection", "practice-product-selection"],
  ["presentation", "practice-presentation"],
  ["objection-handling", "practice-objection-handling"],
  ["trial-close", "practice-trial-close"],
];

function contextFor(competency, missionIntent) {
  return {
    type: "active-practice-mission-context",
    version: 1,
    domain: "camping.sales",
    competency,
    missionIntent,
  };
}

function setActivePractice(api, competency, missionIntent, completion = []) {
  api.founder.missionStatus = "active";
  api.founder.missionObjectiveCompletion = completion;
  api.founder.activePracticeMissionContext = contextFor(competency, missionIntent);
  api.founder.missionObjectives = [
    "Prepare a practice.",
    {
      text: "Perform the practice only if an opportunity arises.",
      competencyRef: { domain: "camping.sales", competency },
    },
    "Record what happened.",
  ];
}

test("all six canonical active practice contexts render the exact reporting action", () => {
  for (const [competency, missionIntent] of practices) {
    const { api } = createHarness();
    setActivePractice(api, competency, missionIntent);
    const markup = api.renderFieldReportHandoff(2);
    assert.match(markup, /Record What Happened/);
    assert.match(markup, /href="index\.html#field-report-card"/);
    assert.match(
      markup,
      /Use a Field Report to record what actually happened\. Nothing is reported or treated as evidence until you choose what to enter and save\./,
    );
  }
});

test("reporting action is available regardless of objective completion", () => {
  for (const completion of [[], [false, false, false], [true, false, true], [true, true, true]]) {
    const { api } = createHarness();
    setActivePractice(api, "trial-close", "practice-trial-close", completion);
    assert.match(api.renderFieldReportHandoff(2), /Record What Happened/);
  }
});

test("only the third reporting objective receives the action", () => {
  const { api } = createHarness();
  setActivePractice(api, "trial-close", "practice-trial-close");
  assert.equal(api.renderFieldReportHandoff(0), "");
  assert.equal(api.renderFieldReportHandoff(1), "");
  assert.match(api.renderFieldReportHandoff(2), /Record What Happened/);
});

test("generic legacy malformed and inactive missions fail closed without title fallback", () => {
  const cases = [
    (api) => {
      api.founder.missionStatus = "active";
      api.founder.currentMission = "Practice a Trial Close";
      api.founder.missionObjectives = [{
        text: "Ask a question.",
        competencyRef: { domain: "camping.sales", competency: "trial-close" },
      }];
    },
    (api) => {
      setActivePractice(api, "trial-close", "practice-trial-close");
      api.founder.activePracticeMissionContext = { competency: "trial-close" };
    },
    (api) => {
      setActivePractice(api, "trial-close", "practice-trial-close");
      api.founder.missionStatus = "inactive";
    },
    (api) => {
      api.founder.missionStatus = "active";
      api.founder.currentMission = "Build Your Foundation";
      api.founder.missionObjectives = ["Define your business idea"];
    },
  ];
  for (const configure of cases) {
    const { api } = createHarness();
    configure(api);
    assert.equal(api.renderFieldReportHandoff(2), "");
  }
});

test("action markup is navigation-only and transports no draft context", () => {
  const { api, saves } = createHarness();
  setActivePractice(api, "trial-close", "practice-trial-close");
  const before = clone(api.founder);
  const markup = api.renderFieldReportHandoff(2);
  assert.doesNotMatch(markup, /onclick|onchange|input|select|textarea|value=|selected|checked|prefill|missionIntent|competency|sourceRef/i);
  assert.doesNotMatch(markup, /\?|URLSearchParams|localStorage|sessionStorage/i);
  assert.deepEqual(clone(api.founder), before);
  assert.deepEqual(saves, []);
});

test("handoff production path uses only canonical reporting context eligibility", () => {
  const start = missionsSource.indexOf("function buildActivePracticeReportingContext()");
  const end = missionsSource.indexOf("\n// =====================================================\n// DYNAMIC MISSION CHECKLIST", start);
  const handoff = missionsSource.slice(start, end);
  assert.match(handoff, /MissionIntelligenceSystem\.buildActivePracticeReportingContext/);
  assert.match(handoff, /activePracticeMissionContext/);
  assert.doesNotMatch(
    handoff,
    /currentMission|Practice a Trial Close|Practice Customer Discovery|Practice Product Selection|Practice a Customer-Need Presentation|Practice Objection Handling|Practice Referencing Customer Context|\.includes\(/,
  );
});

test("handoff production path has no Field Report persistence or evidence authority", () => {
  const helperStart = missionsSource.indexOf("function buildActivePracticeReportingContext()");
  const rendererStart = missionsSource.indexOf("function renderFieldReportHandoff(index)");
  const rendererEnd = missionsSource.indexOf("\n// =====================================================", rendererStart);
  const handoff =
    missionsSource.slice(helperStart, rendererStart) +
    missionsSource.slice(rendererStart, rendererEnd);
  assert.doesNotMatch(
    handoff,
    /saveFounder|CommanderSystem\.save|localStorage|sessionStorage|MemorySystem|saveArtifact|buildReport|customerInteraction|salesStepOutcome|identifyBehavioralEvidence|reviewBehavioralEvidence|\bE3\b|\bE4\b|missionStatus\s*=|missionObjectiveCompletion\s*=|\bxp\b/i,
  );
});