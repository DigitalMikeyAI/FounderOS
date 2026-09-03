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
    "Ask one low-pressure question to see whether the selected RV feels like a fit, then record the customer's response.",
  reward: 100,
  objectives: [
    "Prepare one low-pressure question about whether the selected RV fits what the customer wants.",
    {
      text: "Ask the question during a customer interaction.",
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
const expectedDiscoveryMission = {
  title: "Practice Customer Discovery",
  description:
    "Ask open-ended questions to understand what the customer wants, then record what they share.",
  reward: 100,
  objectives: [
    "Prepare two open-ended questions about the customer's RV goals, travel plans, or priorities.",
    {
      text: "Ask the questions during one customer interaction and listen for their goals and needs.",
      competencyRef: {
        domain: "camping.sales",
        competency: "discovery",
      },
    },
    "Record your questions, what the customer shared, and what happened next in a Field Report.",
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
  return { context, storage, elements, renderedItems, api: context.__api };
}

function generateSalesMission(api) {
  api.setPendingMissionRequest(request);
  return api.generateMission();
}

test("exact Commander request authors the exact Trial Close mission", () => {
  const { api } = loadHarness();
  api.founder.missionGoal = "Master AI Tools";
  const mission = generateSalesMission(api);

  assert.deepEqual(clone(mission), expectedMission);
  assert.deepEqual(clone(api.founder.pendingMissionRequest), request);
  assert.equal(api.founder.currentMission, expectedMission.title);
  assert.deepEqual(clone(api.founder.missionObjectives), expectedMission.objectives);
});

test("exact Commander request authors the exact Customer Discovery mission", () => {
  const { api } = loadHarness();
  api.setPendingMissionRequest(discoveryRequest);
  const mission = api.generateMission();

  assert.deepEqual(clone(mission), expectedDiscoveryMission);
  assert.deepEqual(clone(api.founder.pendingMissionRequest), discoveryRequest);
  assert.equal(api.founder.currentMission, expectedDiscoveryMission.title);
  assert.deepEqual(
    clone(api.founder.missionObjectives),
    expectedDiscoveryMission.objectives,
  );
  assert.equal(
    api.MissionSystem.validateMissionObjective(mission.objectives[1]).valid,
    true,
  );
});

test("Customer Discovery uses the same explicit acceptance and active-mission boundaries", () => {
  const { api } = loadHarness();
  api.founder.currentMission = "Existing active mission";
  api.founder.missionStatus = "active";
  api.setPendingMissionRequest(discoveryRequest);

  assert.deepEqual(clone(api.generateMission()), {
    success: false,
    reason: "active-mission-replacement-required",
    request: discoveryRequest,
  });
  assert.equal(api.founder.currentMission, "Existing active mission");
  assert.deepEqual(clone(api.founder.pendingMissionRequest), discoveryRequest);

  api.founder.missionStatus = "inactive";
  const preview = api.generateMission();
  assert.equal(preview.title, expectedDiscoveryMission.title);
  assert.deepEqual(clone(api.founder.pendingMissionRequest), discoveryRequest);

  api.founder.missionStatus = "active";
  assert.deepEqual(clone(api.clearAcceptedGeneratedMissionRequest()), {
    success: true,
    changed: true,
  });
  assert.equal(api.founder.pendingMissionRequest, null);
});

test("Customer Discovery remains Guidance-free and text-safe in MI and Briefing", () => {
  const { api } = loadHarness();
  api.setPendingMissionRequest(discoveryRequest);
  const mission = api.generateMission();
  const missionContext = { ...clone(mission), status: "active" };
  const guidance = api.GuidanceSystem.build({ mission: missionContext });
  assert.equal(guidance, null);

  const recommendation =
    api.MissionIntelligenceSystem.buildActiveMissionRecommendation(
      missionContext,
      guidance,
    );
  assert.equal(recommendation.nextAction, expectedDiscoveryMission.objectives[0]);
  const briefing = api.BriefingSystem.appendRecommendation(
    api.BriefingSystem.build({
      type: "mission",
      context: { title: mission.title, description: mission.description },
    }),
    recommendation,
  );
  assert.match(briefing.text, /Practice Customer Discovery/);
  assert.match(briefing.text, /Prepare two open-ended questions/);
  assert.doesNotMatch(briefing.text, /\[object Object\]|camping\.sales|competencyRef/);
});

test("only exact pending authority can route to Trial Close", () => {
  const { api } = loadHarness();
  api.founder.missionGoal = "Practice a Trial Close";
  assert.equal(api.generateMission().title, "Discover Your Direction");

  for (const invalid of [
    { domain: "camping.sales", missionIntent: "trial-close" },
    { domain: "Camping Sales", missionIntent: "practice-trial-close" },
  ]) {
    const harness = loadHarness();
    harness.api.founder.pendingMissionRequest = invalid;
    assert.equal(
      harness.api.generateMission().reason,
      "invalid-pending-mission-request",
    );
    assert.equal(harness.api.founder.currentMission, "");
  }
});

test("all three objectives satisfy their exact authority boundaries", () => {
  const { api } = loadHarness();
  const mission = generateSalesMission(api);
  assert.equal(mission.objectives.length, 3);
  assert.equal(typeof mission.objectives[0], "string");
  assert.equal(typeof mission.objectives[2], "string");
  assert.equal(Object.hasOwn(mission.objectives[0], "competencyRef"), false);
  assert.equal(Object.hasOwn(mission.objectives[2], "competencyRef"), false);

  const taggedBefore = clone(mission.objectives[1]);
  const validated = api.MissionSystem.validateMissionObjective(
    mission.objectives[1],
  );
  const normalized = api.MissionSystem.normalizeMissionObjective(
    mission.objectives[1],
  );
  assert.equal(validated.valid, true);
  assert.deepEqual(clone(normalized), taggedBefore);
  assert.deepEqual(clone(mission.objectives[1]), taggedBefore);
  assert.deepEqual(
    clone(api.DomainCompetencyContract.validateDomainCompetencyReference(
      mission.objectives[1].competencyRef,
    )),
    { valid: true, reference: request.domain === "camping.sales"
      ? { domain: "camping.sales", competency: "trial-close" }
      : null },
  );
});

test("preview retains request and matching acceptance clears it", () => {
  const { api } = loadHarness();
  const mission = generateSalesMission(api);
  assert.deepEqual(clone(api.founder.pendingMissionRequest), request);

  api.founder.missionStatus = "active";
  const cleared = api.clearAcceptedGeneratedMissionRequest();
  assert.deepEqual(clone(cleared), { success: true, changed: true });
  assert.equal(api.founder.pendingMissionRequest, null);
  assert.deepEqual(
    clone(api.founder.missionObjectives),
    clone(mission.objectives),
  );
});

test("accepted mixed mission shape survives save and reload", () => {
  const { context, api } = loadHarness();
  generateSalesMission(api);
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
  assert.equal(typeof api.founder.missionObjectives[0], "string");
  assert.equal(typeof api.founder.missionObjectives[1], "object");
  assert.equal(typeof api.founder.missionObjectives[2], "string");
});

test("Guidance stays unavailable while MI and Briefing use text safely", () => {
  const { api } = loadHarness();
  const mission = generateSalesMission(api);
  const missionContext = { ...clone(mission), status: "active" };
  const guidance = api.GuidanceSystem.build({ mission: missionContext });
  assert.equal(guidance, null);

  const recommendation =
    api.MissionIntelligenceSystem.buildActiveMissionRecommendation(
      missionContext,
      guidance,
    );
  assert.equal(recommendation.nextAction, expectedMission.objectives[0]);
  assert.equal(typeof recommendation.nextAction, "string");
  assert.equal(recommendation.confidence.level, "high");
  const briefing = api.BriefingSystem.appendRecommendation(
    api.BriefingSystem.build({
      type: "mission",
      context: {
        title: mission.title,
        description: mission.description,
      },
    }),
    recommendation,
  );
  assert.match(briefing.text, /Practice a Trial Close/);
  assert.match(briefing.text, /Prepare one low-pressure question/);
  assert.doesNotMatch(briefing.text, /\[object Object\]|camping\.sales|trial-close/);
});

test("checklist renders human text without exposing competency metadata", () => {
  const { api, renderedItems } = loadHarness();
  generateSalesMission(api);
  api.founder.missionStatus = "active";
  api.updateMissionChecklist();
  const output = renderedItems.join(" ");
  for (const objective of expectedMission.objectives) {
    const text = typeof objective === "string" ? objective : objective.text;
    assert.match(output, new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.doesNotMatch(output, /\[object Object\]|camping\.sales|trial-close|competencyRef|\{/);
});

test("mission definition is identical across Profile capability states", () => {
  const states = [
    [],
    [{ competency: "rapport", status: "active" }],
    [{ competency: "trial-close", status: "active" }],
    [{ competency: "trial-close", status: "withdrawn" }],
  ];
  const projections = states.map((capabilities) => {
    const { api } = loadHarness();
    api.founder.profile.capabilities = clone(capabilities);
    const mission = generateSalesMission(api);
    const recommendation =
      api.MissionIntelligenceSystem.buildActiveMissionRecommendation(
        { ...clone(mission), status: "active" },
        null,
      );
    return { mission: clone(mission), recommendation: clone(recommendation) };
  });
  projections.forEach((projection) =>
    assert.deepEqual(projection, projections[0]),
  );
});

test("production firewalls remain structurally absent", () => {
  const missionSource = fs.readFileSync(path.join(root, "js/missions.js"), "utf8");
  assert.doesNotMatch(
    missionSource,
    /fieldReports|learningSignals|coachingSignals|behavioralEvidence|profile\.capabilities/,
  );
  for (const relativePath of [
    "systems/guidance.system.js",
    "systems/briefing.system.js",
    "js/widgets/field-report.widget.js",
  ]) {
    assert.equal(
      fs.readFileSync(path.join(root, relativePath), "utf8").includes(
        "Practice a Trial Close",
      ),
      false,
    );
  }
  const intelligenceSource = fs.readFileSync(
    path.join(root, "systems/mission-intelligence.system.js"),
    "utf8",
  );
  assert.equal(
    (intelligenceSource.match(/Practice a Trial Close/g) || []).length,
    1,
  );
  const progressSource = fs.readFileSync(path.join(root, "js/progress.js"), "utf8");
  assert.doesNotMatch(progressSource, /competencyRef|fieldReports|profile\.capabilities/);
});
