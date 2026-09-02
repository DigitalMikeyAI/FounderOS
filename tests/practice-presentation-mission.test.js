const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const request = {
  domain: "camping.sales",
  missionIntent: "practice-presentation",
};
const otherRequests = [
  { domain: "camping.sales", missionIntent: "practice-customer-discovery" },
  { domain: "camping.sales", missionIntent: "practice-product-selection" },
  { domain: "camping.sales", missionIntent: "practice-trial-close" },
];
const expectedMission = {
  title: "Practice a Customer-Need Presentation",
  description:
    "Choose one RV feature that fits something the customer told you they need. Explain the connection, then record their response.",
  reward: 100,
  objectives: [
    "Review one need recorded in this interaction and choose one relevant RV feature or benefit.",
    {
      text: "Explain how that feature or benefit connects to the customer's need.",
      competencyRef: {
        domain: "camping.sales",
        competency: "presentation",
      },
    },
    "Record the need, RV reference, feature or benefit, and the customer's response in a Field Report.",
  ],
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function load(relativePath, context) {
  const file = path.join(root, relativePath);
  vm.runInContext(fs.readFileSync(file, "utf8"), context, { filename: file });
}

function loadHarness() {
  const storage = new Map();
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
      querySelectorAll() {
        return [];
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
    ";globalThis.__api = { founder, saveFounder, loadFounder, MissionSystem, GuidanceSystem, MissionIntelligenceSystem, BriefingSystem, validatePendingMissionRequest, setPendingMissionRequest, selectPresentationMissionRequest, presentPendingMissionRequestForPreview, generateMission, clearAcceptedGeneratedMissionRequest, updateMissionChecklist };",
    context,
  );
  return { context, storage, renderedItems, elements, api: context.__api };
}

function generatePresentation(api) {
  api.setPendingMissionRequest(request);
  return api.generateMission();
}

test("exact Presentation request validates while malformed requests and aliases fail closed", () => {
  const { api } = loadHarness();
  assert.deepEqual(clone(api.validatePendingMissionRequest(request)), {
    valid: true,
    request,
  });
  otherRequests.forEach((candidate) => {
    assert.equal(api.validatePendingMissionRequest(candidate).valid, true);
  });
  for (const malformed of [
    null,
    [],
    { domain: "camping.sales", missionIntent: "presentation" },
    { domain: "Camping Sales", missionIntent: "practice-presentation" },
    { domain: "camping.sales", missionIntent: "Practice Presentation" },
    { domain: "camping.sales", missionIntent: "practice-presentation-mission" },
  ]) {
    assert.equal(api.validatePendingMissionRequest(malformed).valid, false);
  }
});

test("exact request authors the bounded Presentation mission definition", () => {
  const { api } = loadHarness();
  const mission = generatePresentation(api);

  assert.deepEqual(clone(mission), expectedMission);
  assert.deepEqual(clone(api.founder.pendingMissionRequest), request);
  assert.equal(api.founder.currentMission, expectedMission.title);
  assert.equal(typeof mission.objectives[0], "string");
  assert.equal(typeof mission.objectives[2], "string");
  assert.equal(api.MissionSystem.validateMissionObjective(mission.objectives[1]).valid, true);
  assert.equal(Object.hasOwn(mission.objectives[0], "competencyRef"), false);
  assert.equal(Object.hasOwn(mission.objectives[2], "competencyRef"), false);
});

test("active mission is never overwritten and blocked Presentation stays pending", () => {
  const { api } = loadHarness();
  api.founder.currentMission = "Existing active mission";
  api.founder.missionDescription = "Existing description";
  api.founder.missionStatus = "active";
  api.setPendingMissionRequest(request);

  assert.deepEqual(clone(api.generateMission()), {
    success: false,
    reason: "active-mission-replacement-required",
    request,
  });
  assert.equal(api.founder.currentMission, "Existing active mission");
  assert.equal(api.founder.missionDescription, "Existing description");
  assert.deepEqual(clone(api.founder.pendingMissionRequest), request);
});

test("returning Commander receives an inactive Presentation preview", () => {
  const { api, elements, renderedItems } = loadHarness();
  api.founder.onboardingComplete = true;
  api.founder.missionStatus = "inactive";

  const selected = api.selectPresentationMissionRequest();
  assert.equal(selected.success, true);
  assert.equal(elements.get("mission-title").textContent, expectedMission.title);
  assert.equal(elements.get("mission-description").textContent, expectedMission.description);
  assert.deepEqual(clone(api.founder.pendingMissionRequest), request);
  assert.equal(api.founder.missionStatus, "inactive");
  assert.deepEqual(
    renderedItems.slice(-3),
    expectedMission.objectives.map((objective) =>
      typeof objective === "string" ? objective : objective.text,
    ),
  );
});

test("explicit matching acceptance clears only the matching request", () => {
  const matching = loadHarness();
  generatePresentation(matching.api);
  matching.api.founder.missionStatus = "active";
  assert.deepEqual(clone(matching.api.clearAcceptedGeneratedMissionRequest()), {
    success: true,
    changed: true,
  });
  assert.equal(matching.api.founder.pendingMissionRequest, null);

  const mismatched = loadHarness();
  generatePresentation(mismatched.api);
  mismatched.api.founder.pendingMissionRequest = clone(otherRequests[0]);
  assert.equal(mismatched.api.clearAcceptedGeneratedMissionRequest().success, false);
  assert.deepEqual(clone(mismatched.api.founder.pendingMissionRequest), otherRequests[0]);
});

test("accepted Presentation mission survives save and reload unchanged", () => {
  const { context, api } = loadHarness();
  generatePresentation(api);
  api.founder.missionStatus = "active";
  api.clearAcceptedGeneratedMissionRequest();
  api.saveFounder();
  vm.runInContext(
    "founder.currentMission = ''; founder.missionDescription = ''; founder.missionReward = 0; founder.missionObjectives = []; founder.missionStatus = 'inactive';",
    context,
  );
  api.loadFounder();

  assert.equal(api.founder.currentMission, expectedMission.title);
  assert.equal(api.founder.missionDescription, expectedMission.description);
  assert.equal(api.founder.missionReward, 100);
  assert.equal(api.founder.missionStatus, "active");
  assert.deepEqual(clone(api.founder.missionObjectives), expectedMission.objectives);
});

test("checklist renders human text and Field Report handoff only on objective three", () => {
  const { api, renderedItems } = loadHarness();
  generatePresentation(api);
  api.updateMissionChecklist();

  assert.equal(renderedItems.length, 3);
  assert.doesNotMatch(renderedItems[0], /Open Field Report/);
  assert.doesNotMatch(renderedItems[1], /Open Field Report/);
  assert.match(renderedItems[2], /Open Field Report/);
  assert.match(renderedItems[2], /href="index\.html#field-report-card"/);
  assert.doesNotMatch(
    renderedItems.join(" "),
    /\[object Object\]|competencyRef|camping\.sales|sourceRef/,
  );
});

test("mission lifecycle and handoff create no Presentation facts or evidence", () => {
  const { api, storage } = loadHarness();
  const profileBefore = clone(api.founder.profile);
  api.setPendingMissionRequest(request);
  api.generateMission();
  api.updateMissionChecklist();
  api.founder.missionStatus = "active";
  api.clearAcceptedGeneratedMissionRequest();

  assert.equal(api.founder.salesStepOutcomes, undefined);
  assert.equal(api.founder.behavioralEvidence, undefined);
  assert.deepEqual(clone(api.founder.profile), profileBefore);
  assert.equal([...storage.keys()].filter((key) => /^objective-/.test(key)).length, 0);
});

test("Presentation mission is Profile-independent and Guidance-free", () => {
  const states = [
    [],
    [{ competency: "rapport", status: "active" }],
    [{ competency: "presentation", status: "active" }],
    [{ competency: "presentation", status: "withdrawn" }],
  ];
  const projections = states.map((capabilities) => {
    const { api } = loadHarness();
    api.founder.profile.capabilities = clone(capabilities);
    const mission = generatePresentation(api);
    const guidance = api.GuidanceSystem.build({
      mission: { ...clone(mission), status: "active" },
    });
    return { mission: clone(mission), guidance };
  });
  projections.forEach((projection) => assert.deepEqual(projection, projections[0]));
  assert.equal(projections[0].guidance, null);
});

test("MI and Briefing consume Presentation objective text without metadata leakage", () => {
  const { api } = loadHarness();
  const mission = generatePresentation(api);
  const recommendation =
    api.MissionIntelligenceSystem.buildActiveMissionRecommendation(
      { ...clone(mission), status: "active" },
      null,
    );
  assert.equal(recommendation.nextAction, expectedMission.objectives[0]);
  const briefing = api.BriefingSystem.appendRecommendation(
    api.BriefingSystem.build({
      type: "mission",
      context: { title: mission.title, description: mission.description },
    }),
    recommendation,
  );
  assert.match(briefing.text, /Practice a Customer-Need Presentation/);
  assert.match(briefing.text, /Review one need recorded in this interaction/);
  assert.doesNotMatch(
    briefing.text,
    /\[object Object\]|competencyRef|camping\.sales|sourceRef/,
  );
});

test("Missions page exposes one exact Presentation selection control", () => {
  const html = fs.readFileSync(path.join(root, "missions.html"), "utf8");
  assert.match(html, /id="select-presentation-mission"/);
  assert.match(html, /onclick="selectPresentationMissionRequest\(\)"/);
  assert.match(html, />\s*Practice a Customer-Need Presentation\s*</);
  assert.equal((html.match(/select-presentation-mission/g) || []).length, 1);
});

test("mission implementation preserves Presentation evidence and integration firewalls", () => {
  const source = fs.readFileSync(path.join(root, "js/missions.js"), "utf8");
  assert.doesNotMatch(
    source,
    /fieldReports|salesStepOutcomes|learningSignals|coachingSignals|behavioralEvidence|profile\.capabilities|CRM|inventory|VIN/,
  );
  for (const relativePath of [
    "js/widgets/field-report.widget.js",
    "systems/guidance.system.js",
    "js/main.js",
    "js/endday.js",
  ]) {
    assert.equal(
      fs.readFileSync(path.join(root, relativePath), "utf8").includes(
        "practice-presentation",
      ),
      false,
    );
  }
  const intelligenceSource = fs.readFileSync(
    path.join(root, "systems/mission-intelligence.system.js"),
    "utf8",
  );
  assert.equal(
    (intelligenceSource.match(/practice-presentation/g) || []).length,
    1,
  );
});
