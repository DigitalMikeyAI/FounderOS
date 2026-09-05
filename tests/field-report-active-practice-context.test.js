const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const widgetPath = path.join(root, "js", "widgets", "field-report.widget.js");
const widgetSource = fs.readFileSync(widgetPath, "utf8");
const indexSource = fs.readFileSync(path.join(root, "index.html"), "utf8");

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function makeElement() {
  return {
    value: "",
    checked: false,
    textContent: "",
    innerHTML: "",
    hidden: false,
    style: {},
    children: [],
    handlers: {},
    addEventListener(type, handler) { this.handlers[type] = handler; },
    appendChild(child) { this.children.push(child); },
    reset() {},
  };
}

function activeContext(competency = "trial-close", missionIntent = "practice-trial-close") {
  return {
    type: "active-practice-mission-context",
    version: 1,
    domain: "camping.sales",
    competency,
    missionIntent,
  };
}

function objectives(competency = "trial-close") {
  return [
    "Prepare the practice.",
    {
      text: "Perform only if an opportunity arises.",
      competencyRef: { domain: "camping.sales", competency },
    },
    "Record what happened.",
  ];
}

function reportingContext(competency, missionIntent, label) {
  return {
    type: "practice-reporting-context",
    version: 1,
    domain: "camping.sales",
    competency,
    label,
    missionIntent,
    source: { basis: "active-practice-mission" },
  };
}

function createHarness({
  founder = {
    missionStatus: "active",
    missionObjectives: objectives(),
    missionObjectiveCompletion: [],
    activePracticeMissionContext: activeContext(),
  },
  resolver = () => reportingContext(
    "trial-close",
    "practice-trial-close",
    "Practice a Trial Close",
  ),
  dependencyAvailable = true,
  resolverThrows = false,
} = {}) {
  const elements = new Map();
  const expanded = makeElement();
  const collapsed = makeElement();
  const persistenceWrites = [];
  const getElementById = (id) => {
    if (!elements.has(id)) elements.set(id, makeElement());
    return elements.get(id);
  };
  for (const id of [
    "field-report-enter",
    "fr-add-interaction",
    "fr-interactions-container",
    "fr-save",
    "fr-cancel",
    "fr-feedback",
    "fr-date",
    "fr-dailyWin",
    "fr-keyLearning",
    "fr-biggestChallenge",
    "fr-nextFocus",
    "fr-notes",
    "fr-capturebay",
    "field-report-form",
    "field-report-active-practice-context",
    "field-report-active-practice-label",
  ]) getElementById(id);
  getElementById("fr-interactions-container").children = [];

  const MissionIntelligenceSystem = dependencyAvailable
    ? {
        buildActivePracticeReportingContext(context, mission) {
          if (resolverThrows) throw new Error("resolver unavailable");
          return resolver(context, mission);
        },
      }
    : undefined;
  const context = vm.createContext({
    console: { log() {}, warn() {}, error() {} },
    Date,
    Math,
    Set,
    JSON,
    window: {},
    founder,
    MissionIntelligenceSystem,
    MemorySystem: {
      getArtifact() { return null; },
      saveArtifact(value) { persistenceWrites.push(clone(value)); return value; },
    },
    document: {
      readyState: "complete",
      getElementById,
      querySelector(selector) {
        if (selector === ".field-report-expanded") return expanded;
        if (selector === ".field-report-collapsed") return collapsed;
        return null;
      },
      querySelectorAll() { return []; },
      createElement() { return makeElement(); },
    },
  });
  vm.runInContext(widgetSource, context, { filename: widgetPath });
  return {
    context,
    elements,
    expanded,
    collapsed,
    founder,
    persistenceWrites,
  };
}

test("Field Report card places passive active practice context outside the form", () => {
  const cardStart = indexSource.indexOf('id="field-report-card"');
  const formStart = indexSource.indexOf('id="field-report-form"', cardStart);
  const contextStart = indexSource.indexOf('id="field-report-active-practice-context"', cardStart);
  const interactionsStart = indexSource.indexOf('id="fr-interactions-container"', cardStart);
  assert.ok(contextStart > cardStart);
  assert.ok(contextStart < formStart);
  assert.ok(contextStart < interactionsStart);
  assert.match(indexSource, />Active practice context<\/h4>/);
  assert.match(
    indexSource,
    /This is context only\. Nothing is reported or treated as evidence until you choose what to enter and save\./,
  );
});

test("all six canonical contexts render the resolver label with exact passive copy", () => {
  const practices = [
    ["rapport", "practice-rapport", "Practice Referencing Customer Context"],
    ["discovery", "practice-customer-discovery", "Practice Customer Discovery"],
    ["product-selection", "practice-product-selection", "Practice Product Selection"],
    ["presentation", "practice-presentation", "Practice a Customer-Need Presentation"],
    ["objection-handling", "practice-objection-handling", "Practice Objection Handling"],
    ["trial-close", "practice-trial-close", "Practice a Trial Close"],
  ];
  for (const [competency, missionIntent, label] of practices) {
    const harness = createHarness({
      founder: {
        missionStatus: "active",
        missionObjectives: objectives(competency),
        missionObjectiveCompletion: [true, false, true],
        activePracticeMissionContext: activeContext(competency, missionIntent),
      },
      resolver: (context, mission) => {
        assert.deepEqual(clone(context), activeContext(competency, missionIntent));
        assert.deepEqual(clone(mission), {
          status: "active",
          objectives: objectives(competency),
        });
        return reportingContext(competency, missionIntent, label);
      },
    });
    assert.equal(harness.elements.get("field-report-active-practice-context").hidden, false);
    assert.equal(harness.elements.get("field-report-active-practice-label").textContent, label);
  }
});

test("null inactive missing malformed mismatch and generic contexts remain hidden", () => {
  const cases = [
    { resolver: () => null },
    {
      founder: {
        missionStatus: "inactive",
        missionObjectives: objectives(),
        activePracticeMissionContext: activeContext(),
      },
      resolver: () => null,
    },
    {
      founder: {
        missionStatus: "active",
        missionObjectives: objectives(),
        activePracticeMissionContext: null,
      },
      resolver: () => null,
    },
    {
      founder: {
        missionStatus: "active",
        missionObjectives: objectives(),
        activePracticeMissionContext: { competency: "trial-close" },
      },
      resolver: () => null,
    },
    {
      founder: {
        missionStatus: "active",
        missionObjectives: objectives("rapport"),
        activePracticeMissionContext: activeContext(),
      },
      resolver: () => null,
    },
    {
      founder: {
        missionStatus: "active",
        missionObjectives: ["Define a business idea"],
        activePracticeMissionContext: null,
      },
      resolver: () => null,
    },
  ];
  for (const options of cases) {
    const harness = createHarness(options);
    assert.equal(harness.elements.get("field-report-active-practice-context").hidden, true);
    assert.equal(harness.elements.get("field-report-active-practice-label").textContent, "");
  }
});

test("context rendering is independent of objective completion and does not mutate Founder or persist", () => {
  for (const completion of [[], [false, false, false], [true, false, true], [true, true, true]]) {
    const founder = {
      missionStatus: "active",
      missionObjectives: objectives(),
      missionObjectiveCompletion: completion,
      activePracticeMissionContext: activeContext(),
    };
    const before = clone(founder);
    const harness = createHarness({ founder });
    assert.equal(harness.elements.get("field-report-active-practice-context").hidden, false);
    assert.deepEqual(clone(founder), before);
    assert.deepEqual(harness.persistenceWrites, []);
  }
});

test("resolver failure or absence hides context and preserves normal Field Report controls", () => {
  for (const options of [
    { dependencyAvailable: false },
    { resolverThrows: true },
  ]) {
    const harness = createHarness(options);
    assert.equal(harness.elements.get("field-report-active-practice-context").hidden, true);
    assert.equal(typeof harness.elements.get("field-report-enter").handlers.click, "function");
    assert.equal(typeof harness.elements.get("fr-add-interaction").handlers.click, "function");
    assert.equal(typeof harness.elements.get("fr-save").handlers.click, "function");
  }
});

test("context does not enter buildReport output", () => {
  const source = widgetSource.replace(
    /\}\)\(\);\s*$/,
    "window.__fieldReportTestApi = { buildReport }; })();",
  );
  const values = new Map([
    ["fr-date", { value: "2026-09-01" }],
    ["fr-dailyWin", { value: "" }],
    ["fr-keyLearning", { value: "" }],
    ["fr-biggestChallenge", { value: "" }],
    ["fr-nextFocus", { value: "" }],
    ["fr-notes", { value: "" }],
    ["fr-capturebay", { value: "" }],
  ]);
  const context = vm.createContext({
    window: {},
    Date,
    Math,
    document: {
      readyState: "loading",
      addEventListener() {},
      getElementById(id) { return values.get(id) || null; },
      querySelectorAll() { return []; },
    },
  });
  vm.runInContext(source, context, { filename: widgetPath });
  const report = context.window.__fieldReportTestApi.buildReport();
  const serialized = JSON.stringify(report);
  for (const forbidden of [
    "activePracticeMissionContext",
    "practice-reporting-context",
    "missionIntent",
    "Practice a Trial Close",
  ]) assert.equal(serialized.includes(forbidden), false, forbidden);
});

test("production context path uses only canonical resolver and contains no forbidden authority", () => {
  const start = widgetSource.indexOf("function renderActivePracticeReportingContext()");
  const end = widgetSource.indexOf("\n  // Create a compact interaction block DOM", start);
  const renderer = widgetSource.slice(start, end);
  assert.match(renderer, /MissionIntelligenceSystem\.buildActivePracticeReportingContext/);
  assert.match(renderer, /activePracticeMissionContext/);
  assert.doesNotMatch(
    renderer,
    /currentMission|missionDescription|missionObjectiveCompletion|\bxp\b|commandLog|pendingMissionRequest|recommendPractice|developmentFocus|profile|identifyBehavioralEvidence|reviewBehavioralEvidence|\bE3\b|\bE4\b|MemorySystem|saveArtifact|localStorage|sessionStorage|URLSearchParams|location|buildReport|salesStepOutcomes|customerInteraction/i,
  );
});

test("passive copy contains no causal or performance claim", () => {
  const contextMarkup = indexSource.slice(
    indexSource.indexOf('id="field-report-active-practice-context"'),
    indexSource.indexOf('class="field-report-collapsed"'),
  );
  assert.doesNotMatch(
    contextMarkup,
    /you came here from|you just practiced|completed|performed|attempted|recommended/i,
  );
});