const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const request = {
  domain: "camping.sales",
  missionIntent: "practice-trial-close",
};
const expectedMission = {
  title: "Practice a Trial Close",
  description:
    "Practice one appropriate, low-pressure Trial Close to check whether a selected RV aligns with the customer's desired solution, then record the customer's response.",
  reward: 100,
  objectives: [
    "Prepare an appropriate alignment-check question for a customer interaction.",
    {
      text: "Perform one appropriate Trial Close to check whether the selected RV is moving toward the customer's desired solution.",
      competencyRef: {
        domain: "camping.sales",
        competency: "trial-close",
      },
    },
    "Record the customer's response in a Field Report.",
  ],
};
const discoveryRequest = {
  domain: "camping.sales",
  missionIntent: "practice-customer-discovery",
};

const HANDOFF_TEXT = "Open Field Report";
const HANDOFF_LINK =
  /href="index\.html#field-report-card"[^>]*>\s*Open Field Report\s*<\/a\s*>/;

const GENERIC_MISSIONS = [
  "Your First AI Workflow",
  "Build Your Foundation",
  "Launch Your Content Engine",
  "Design Your First System",
  "Discover Your Direction",
];

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function load(relativePath, context) {
  const file = path.join(root, relativePath);
  vm.runInContext(fs.readFileSync(file, "utf8"), context, { filename: file });
}

function loadHarness() {
  const storage = new Map();
  const checkpoints = new Map();
  const renderedItems = [];
  const elements = new Map();
  const element = () => ({
    textContent: "",
    innerHTML: "",
    style: {},
    handlers: {},
    checked: false,
    addEventListener(type, handler) {
      this.handlers[type] = handler;
    },
    appendChild(child) {
      renderedItems.push(child.textContent || child.innerHTML || "");
    },
  });
  const getElementById = (id) => {
    if (!elements.has(id)) elements.set(id, element());
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
    },
    document: {
      getElementById,
      createElement: element,
      querySelectorAll(selector) {
        return selector === ".mission-task" ? [] : [];
      },
    },
  });
  for (const relativePath of [
    "js/storage.js",
    "systems/domain-competency.contract.js",
    "systems/mission.system.js",
    "js/missions.js",
    "systems/guidance.system.js",
    "systems/mission-intelligence.system.js",
    "systems/briefing.system.js",
  ]) {
    load(relativePath, context);
  }
  vm.runInContext(
    ";globalThis.__api = { founder, saveFounder, loadFounder, DomainCompetencyContract, MissionSystem, GuidanceSystem, MissionIntelligenceSystem, BriefingSystem, setPendingMissionRequest, generateMission, clearAcceptedGeneratedMissionRequest, updateMissionChecklist };",
    context,
  );
  return { context, storage, renderedItems, elements, api: context.__api };
}

function generateSalesMission(api) {
  api.setPendingMissionRequest(request);
  return api.generateMission();
}

function handoffSource() {
  const source = fs.readFileSync(path.join(root, "js/missions.js"), "utf8");
  const match = source.match(
    /function renderFieldReportHandoff\(index\) \{([\s\S]*?)^\}/m,
  );
  assert.ok(match, "renderFieldReportHandoff function body found");
  return match[1];
}

function renderTrialClose(api) {
  generateSalesMission(api);
  api.updateMissionChecklist();
  return api;
}

// 1. Practice mission objective #3 renders the handoff.
test("Practice a Trial Close objective #3 renders Open Field Report", () => {
  const { api, renderedItems } = loadHarness();
  renderTrialClose(api);
  assert.ok(renderedItems.length >= 3, `expected >=3, got ${renderedItems.length}`);
  assert.match(renderedItems[2], new RegExp(HANDOFF_TEXT));
  assert.match(renderedItems[2], HANDOFF_LINK);
  const label = renderedItems[2].match(/<label[^>]*>([\s\S]*?)<\/label>/);
  assert.ok(label, "objective #3 label present");
  assert.match(label[1], /Record the customer's response/);
});

// 2. Objective #1 (index 0) does not render the handoff.
test("objective #1 does not render Open Field Report", () => {
  const { api, renderedItems } = loadHarness();
  renderTrialClose(api);
  assert.doesNotMatch(renderedItems[0], new RegExp(HANDOFF_TEXT));
});

// 3. Objective #2 (index 1) does not render the handoff.
test("objective #2 does not render Open Field Report", () => {
  const { api, renderedItems } = loadHarness();
  renderTrialClose(api);
  assert.doesNotMatch(renderedItems[1], new RegExp(HANDOFF_TEXT));
});

// 4. Target is exactly index.html#field-report-card.
test("handoff target is exactly index.html#field-report-card", () => {
  const { api, renderedItems } = loadHarness();
  renderTrialClose(api);
  const anchors = renderedItems[2].match(/<a\b[\s\S]*?<\/a\s*>/g) || [];
  assert.equal(anchors.length, 1, "exactly one anchor on objective #3");
  assert.match(anchors[0], /href="index\.html#field-report-card"/);
  assert.doesNotMatch(anchors[0], /href="index\.html#field-report-card[^\s"]+"/);
});

// 5. Generic missions never render the handoff.
test("generic missions do not render the handoff", () => {
  const triggers = ["with AI", "with Business", "with Audience", "with Workflow", "anything else"];
  triggers.forEach((missionGoal, i) => {
    const { api, renderedItems } = loadHarness();
    api.founder.missionGoal = missionGoal;
    assert.equal(api.generateMission().title, GENERIC_MISSIONS[i]);
    api.updateMissionChecklist();
    renderedItems.forEach((item, j) => {
      assert.doesNotMatch(
        item,
        new RegExp(HANDOFF_TEXT),
        `unexpected handoff for ${GENERIC_MISSIONS[i]} objective ${j + 1}`,
      );
      assert.doesNotMatch(item, HANDOFF_LINK);
    });
  });
});

// 6. Handoff introduces no prefill behavior.
test("handoff introduces no prefill behavior", () => {
  const { api, renderedItems } = loadHarness();
  renderTrialClose(api);
  const anchor = renderedItems[2].match(/<a\b[\s\S]*?<\/a\s*>/)[0];
  assert.doesNotMatch(anchor, /onclick|onchange|addEventListener/i);
  assert.doesNotMatch(anchor, /input|select|textarea|value=|selected|checked|onfocus/i);
});

// 7. Navigation introduces no Field Report save behavior.
test("handoff introduces no Field Report save behavior", () => {
  const block = handoffSource();
  assert.doesNotMatch(block, /saveFounder|CommanderSystem\.save|localStorage|setItem/i);
  assert.doesNotMatch(block, /fieldReport|submit|form|salesStepOutcomes/i);
  assert.match(block, /index\.html#field-report-card/);
  assert.match(block, /Open Field Report/);
});

// 8. Handoff does not alter objective checkbox state.
test("handoff does not alter objective checkbox state", () => {
  const { api, renderedItems } = loadHarness();
  renderTrialClose(api);
  assert.match(renderedItems[2], /id="objective-2"/);
  assert.doesNotMatch(renderedItems[2], /id="objective-2"[^>]*checked/);
  assert.doesNotMatch(handoffSource(), /localStorage|\.checked|missionProg|objective-/);
});

// 9. Handoff does not alter mission progress / state.
test("handoff does not alter mission progress or state", () => {
  const { api } = loadHarness();
  generateSalesMission(api);
  const before = clone({
    currentMission: api.founder.currentMission,
    missionStatus: api.founder.missionStatus,
    missionProgress: api.founder.missionProgress,
    missionComplete: api.founder.missionComplete,
  });
  api.updateMissionChecklist();
  assert.deepEqual(
    clone({
      currentMission: api.founder.currentMission,
      missionStatus: api.founder.missionStatus,
      missionProgress: api.founder.missionProgress,
      missionComplete: api.founder.missionComplete,
    }),
    before,
  );
});

// 10. Handoff does not auto-complete the mission or mark objective #3 done.
test("handoff does not auto-complete the mission", () => {
  const { api, storage } = loadHarness();
  renderTrialClose(api);
  assert.equal(api.founder.missionComplete, undefined);
  assert.equal(Array.from(storage.entries()).filter(([k]) => /objective/.test(k)).length, 0);
});
// 11. No evidence systems are invoked by the handoff path.
test("no evidence systems are invoked", () => {
  const { api, renderedItems } = loadHarness();
  const profileBefore = JSON.stringify(api.founder.profile);
  renderTrialClose(api);
  assert.equal(api.founder.salesStepOutcomes, undefined);
  assert.equal(JSON.stringify(api.founder.profile), profileBefore);
  // The anchor is a plain hyperlink, not form wiring backed by evidence.
  assert.doesNotMatch(renderedItems[2], /submit|form|salesStepOutcomes/i);
  assert.doesNotMatch(
    handoffSource(),
    /salesStepOutcomes|learningSignal|coachingSignal|behavioralEvidence|E3|E4|profile\./i,
  );
});

// 12. Profile capability state does not affect handoff visibility.
test("Profile state does not affect handoff visibility", () => {
  const states = [
    [{ competency: "rapport", status: "active" }],
    [{ competency: "trial-close", status: "active" }],
    [{ competency: "trial-close", status: "withdrawn" }],
  ];
  for (const capabilities of [[], ...states]) {
    const { api, renderedItems } = loadHarness();
    api.founder.profile.capabilities = clone(capabilities);
    renderTrialClose(api);
    assert.match(renderedItems[2], new RegExp(HANDOFF_TEXT));
    assert.match(renderedItems[2], HANDOFF_LINK);
  }
});

// 13. Trial Close generation remains unchanged.
test("Trial Close generation remains unchanged", () => {
  const { api } = loadHarness();
  const mission = generateSalesMission(api);
  assert.deepEqual(clone(mission), expectedMission);
  assert.deepEqual(clone(api.founder.missionObjectives), expectedMission.objectives);
});

// 14. Trial Close acceptance remains unchanged.
test("Trial Close acceptance remains unchanged", () => {
  const { api } = loadHarness();
  generateSalesMission(api);
  assert.deepEqual(clone(api.founder.pendingMissionRequest), request);
  api.founder.missionStatus = "active";
  const cleared = api.clearAcceptedGeneratedMissionRequest();
  assert.deepEqual(clone(cleared), { success: true, changed: true });
  assert.equal(api.founder.pendingMissionRequest, null);
});

// 15. Mission Intelligence behavior remains unchanged.
test("Mission Intelligence behavior remains unchanged", () => {
  const { api } = loadHarness();
  const mission = generateSalesMission(api);
  const recommendation = api.MissionIntelligenceSystem.buildActiveMissionRecommendation(
    { ...clone(mission), status: "active" },
    null,
  );
  assert.equal(recommendation.nextAction, expectedMission.objectives[0]);
  assert.equal(typeof recommendation.nextAction, "string");
});

// 16. Briefing behavior remains unchanged.
test("Briefing behavior remains unchanged", () => {
  const { api } = loadHarness();
  const mission = generateSalesMission(api);
  const recommendation =
    api.MissionIntelligenceSystem.buildActiveMissionRecommendation(
      { ...clone(mission), status: "active" },
      null,
    );
  const briefing = api.BriefingSystem.appendRecommendation(
    api.BriefingSystem.build({
      type: "mission",
      context: { title: mission.title, description: mission.description },
    }),
    recommendation,
  );
  assert.match(briefing.text, /Practice a Trial Close/);
  assert.match(briefing.text, /Prepare an appropriate alignment-check question/);
  assert.doesNotMatch(briefing.text, /\[object Object\]|camping\.sales|trial-close/);
});

// 17. Discover Your Direction Guidance remains unchanged (no handoff in production).
test("Discover Your Direction Guidance remains unchanged", () => {
  const { api } = loadHarness();
  api.founder.missionGoal = "something unrelated";
  const mission = api.generateMission();
  assert.equal(mission.title, "Discover Your Direction");
  assert.deepEqual(clone(mission.objectives), [
    "Explore your interests",
    "Identify your strengths",
    "Choose your first direction",
  ]);
  const guidance = api.GuidanceSystem.build({
    mission: { ...clone(mission), status: "active" },
  });
  assert.equal(guidance.mission, "Discover Your Direction");
  assert.equal(guidance.objective, "Identify your strengths");
});

test("Practice Customer Discovery renders the same navigation-only handoff on objective #3", () => {
  const { api, renderedItems } = loadHarness();
  api.setPendingMissionRequest(discoveryRequest);
  api.generateMission();
  const before = clone({
    status: api.founder.missionStatus,
    objectives: api.founder.missionObjectives,
    completed: api.founder.missionCompleted,
  });
  api.updateMissionChecklist();

  assert.doesNotMatch(renderedItems[0], new RegExp(HANDOFF_TEXT));
  assert.doesNotMatch(renderedItems[1], new RegExp(HANDOFF_TEXT));
  assert.match(renderedItems[2], HANDOFF_LINK);
  assert.match(renderedItems[2], /Record what you asked/);
  assert.deepEqual(
    clone({
      status: api.founder.missionStatus,
      objectives: api.founder.missionObjectives,
      completed: api.founder.missionCompleted,
    }),
    before,
  );
  assert.doesNotMatch(renderedItems[2], /prefill|sourceRef|missionIntent/);
});
