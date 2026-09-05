const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const request = {
  domain: "camping.sales",
  missionIntent: "practice-objection-handling",
};
const existingRequests = [
  "practice-trial-close",
  "practice-customer-discovery",
  "practice-product-selection",
  "practice-presentation",
].map((missionIntent) => ({ domain: "camping.sales", missionIntent }));
const expectedMission = {
  title: "Practice Objection Handling",
  description:
    "When a customer raises an objection, respond respectfully and record what happened next.",
  reward: 100,
  objectives: [
    "Prepare one respectful way to respond to an objection.",
    {
      text: "When a customer raises an objection during the interaction, respond respectfully.",
      competencyRef: {
        domain: "camping.sales",
        competency: "objection-handling",
      },
    },
    "Record the objection, your response, and what happened next in a Field Report.",
  ],
};

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
    dataset: {},
    checked: false,
    hidden: false,
    handlers: {},
    children: [],
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
  const renderedItems = [];
  const context = vm.createContext({
    console: { log() {}, warn() {}, error() {} },
    Date,
    Math,
    JSON,
    __tasks: [],
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
    document: {
      getElementById(id) {
        if (!elements.has(id)) {
          const element = createElement();
          if (id === "mission-task-container") {
            element.appendChild = (child) => {
              element.children.push(child);
              renderedItems.push(child.textContent || child.innerHTML || "");
            };
          }
          elements.set(id, element);
        }
        return elements.get(id);
      },
      createElement() {
        const element = createElement();
        const appendChild = element.appendChild.bind(element);
        element.appendChild = (child) => {
          appendChild(child);
          renderedItems.push(child.textContent || child.innerHTML || "");
        };
        return element;
      },
      querySelectorAll(selector) {
        return selector === ".mission-task" ? context.__tasks : [];
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
    ArchieCore: { refreshSession: async () => {} },
  });

  for (const relativePath of [
    "js/storage.js",
    "systems/domain-competency.contract.js",
    "systems/mission.system.js",
    "js/missions.js",
    "js/endday.js",
    "systems/guidance.system.js",
    "systems/mission-intelligence.system.js",
    "systems/briefing.system.js",
  ]) {
    load(relativePath, context);
  }
  vm.runInContext(
    ";globalThis.__api = { founder, saveFounder, loadFounder, MissionSystem, GuidanceSystem, MissionIntelligenceSystem, BriefingSystem, validatePendingMissionRequest, setPendingMissionRequest, selectObjectionHandlingMissionRequest, presentPendingMissionRequestForPreview, generateMission, clearAcceptedGeneratedMissionRequest, updateMissionChecklist, archiveMissionDay };",
    context,
  );

  function setTasks(states) {
    context.__tasks = states.map((checked, index) => ({
      id: `objective-${index}`,
      checked,
      dataset: { xp: "25" },
      addEventListener() {},
    }));
    vm.runInContext("tasks = __tasks;", context);
  }

  return { context, storage, elements, renderedItems, api: context.__api, setTasks };
}

function generateObjectionMission(api) {
  api.setPendingMissionRequest(request);
  return api.generateMission();
}

function makeReport(result = "customer-concern-resolved") {
  return {
    id: "report-objection",
    date: "2026-08-31",
    createdAt: "2026-08-31T12:00:00.000Z",
    customerInteractions: [
      {
        id: "interaction-objection",
        createdAt: "2026-08-31T12:05:00.000Z",
        objections: ["payment"],
        salesStepOutcomes: [
          {
            id: "outcome-objection",
            step: "objection-handling",
            performedBy: "commander",
            result,
          },
        ],
      },
    ],
  };
}

test("exact request validates and malformed aliases fail closed", () => {
  const { api } = loadHarness();
  assert.deepEqual(clone(api.validatePendingMissionRequest(request)), {
    valid: true,
    request,
  });
  existingRequests.forEach((candidate) => {
    assert.equal(api.validatePendingMissionRequest(candidate).valid, true);
  });
  for (const malformed of [
    null,
    [],
    { domain: "camping.sales", missionIntent: "objection-handling" },
    { domain: "Camping Sales", missionIntent: request.missionIntent },
    { domain: "camping.sales", missionIntent: "Practice Objection Handling" },
    { domain: "camping.sales", missionIntent: "practice-objections" },
  ]) {
    assert.equal(api.validatePendingMissionRequest(malformed).valid, false);
  }
});

test("exact request authors the opportunistic three-objective mission", () => {
  const { api } = loadHarness();
  const mission = generateObjectionMission(api);

  assert.deepEqual(clone(mission), expectedMission);
  assert.equal(mission.objectives.length, 3);
  assert.equal(typeof mission.objectives[0], "string");
  assert.equal(typeof mission.objectives[2], "string");
  assert.deepEqual(clone(mission.objectives[1].competencyRef), {
    domain: "camping.sales",
    competency: "objection-handling",
  });
  assert.match(mission.description, /When a customer raises an objection/);
  assert.doesNotMatch(
    `${mission.description} ${mission.objectives.map((item) => item.text || item).join(" ")}`,
    /manufacture|provoke|overcome every|win the argument|pressure|guarantee|success/i,
  );
});

test("active mission is not overwritten and Objection Handling remains pending", () => {
  const { api } = loadHarness();
  Object.assign(api.founder, {
    currentMission: "Existing active mission",
    missionDescription: "Existing description",
    missionStatus: "active",
  });
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

test("returning Commander gets an inactive preview before explicit acceptance", () => {
  const { api, elements } = loadHarness();
  api.founder.onboardingComplete = true;
  api.founder.missionStatus = "inactive";

  const selected = api.selectObjectionHandlingMissionRequest();
  assert.equal(selected.success, true);
  assert.equal(elements.get("mission-title").textContent, expectedMission.title);
  assert.equal(
    elements.get("mission-description").textContent,
    expectedMission.description,
  );
  assert.equal(api.founder.missionStatus, "inactive");
  assert.deepEqual(clone(api.founder.pendingMissionRequest), request);
});

test("matching acceptance clears only the matching request and survives reload", () => {
  const matching = loadHarness();
  generateObjectionMission(matching.api);
  matching.api.founder.missionStatus = "active";
  assert.deepEqual(clone(matching.api.clearAcceptedGeneratedMissionRequest()), {
    success: true,
    changed: true,
  });
  matching.api.saveFounder();
  vm.runInContext(
    "founder.currentMission = ''; founder.missionObjectives = []; founder.missionStatus = 'inactive'; loadFounder();",
    matching.context,
  );
  assert.equal(matching.api.founder.currentMission, expectedMission.title);
  assert.equal(matching.api.founder.missionStatus, "active");
  assert.deepEqual(
    clone(matching.api.founder.missionObjectives),
    expectedMission.objectives,
  );
  assert.equal(matching.api.founder.pendingMissionRequest, null);

  const mismatched = loadHarness();
  generateObjectionMission(mismatched.api);
  mismatched.api.founder.pendingMissionRequest = clone(existingRequests[0]);
  assert.equal(mismatched.api.clearAcceptedGeneratedMissionRequest().success, false);
  assert.deepEqual(
    clone(mismatched.api.founder.pendingMissionRequest),
    existingRequests[0],
  );
});

test("checklist renders human text and a navigation-only handoff on objective three", () => {
  const { api, renderedItems, storage } = loadHarness();
  generateObjectionMission(api);
  api.founder.missionStatus = "active";
  api.founder.activePracticeMissionContext = {
    type: "active-practice-mission-context", version: 1, domain: "camping.sales",
    competency: "objection-handling", missionIntent: "practice-objection-handling",
  };
  api.updateMissionChecklist();

  assert.equal(renderedItems.length, 3);
  assert.doesNotMatch(renderedItems[0], /Record What Happened/);
  assert.doesNotMatch(renderedItems[1], /Record What Happened/);
  assert.match(renderedItems[2], /Record What Happened/);
  assert.match(renderedItems[2], /href="index\.html#field-report-card"/);
  assert.doesNotMatch(
    renderedItems.join(" "),
    /\[object Object\]|competencyRef|camping\.sales|sourceRef/,
  );
  assert.equal([...storage.keys()].filter((key) => /^objective-/.test(key)).length, 0);
  assert.equal(api.founder.salesStepOutcomes, undefined);
});

test("no-opportunity incomplete archive remains truthful and creates no evidence", () => {
  const { api, setTasks } = loadHarness();
  generateObjectionMission(api);
  Object.assign(api.founder, {
    missionStatus: "active",
    xp: 20,
    streak: 4,
    commandLog: [],
  });
  setTasks([true, false, false]);
  const profileBefore = clone(api.founder.profile);

  const result = api.archiveMissionDay();

  assert.equal(result.success, true);
  assert.equal(api.founder.missionStatus, "inactive");
  assert.equal(api.founder.xp, 45);
  assert.equal(api.founder.streak, 5);
  assert.equal(api.founder.commandLog[0].xp, 25);
  assert.equal(api.founder.commandLog[0].objectives, 1);
  assert.equal(api.founder.commandLog[0].mission, expectedMission.title);
  assert.equal(api.founder.salesStepOutcomes, undefined);
  assert.equal(api.founder.behavioralEvidence, undefined);
  assert.deepEqual(clone(api.founder.profile), profileBefore);
});

test("mission is Profile-independent and adds no Guidance", () => {
  const states = [
    [],
    [{ competency: "objection-handling", status: "active" }],
    [{ competency: "objection-handling", status: "withdrawn" }],
    [{ competency: "rapport", status: "active" }],
  ];
  const outputs = states.map((capabilities) => {
    const { api } = loadHarness();
    api.founder.profile.capabilities = clone(capabilities);
    const mission = generateObjectionMission(api);
    const guidance = api.GuidanceSystem.build({
      mission: { ...clone(mission), status: "active" },
    });
    return { mission: clone(mission), guidance };
  });
  outputs.forEach((output) => assert.deepEqual(output, outputs[0]));
  assert.equal(outputs[0].guidance, null);
});

test("Mission Intelligence and Briefing use objective text without metadata leakage", () => {
  const { api } = loadHarness();
  const mission = generateObjectionMission(api);
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
  assert.match(briefing.text, /Practice Objection Handling/);
  assert.match(briefing.text, /Prepare one respectful way/);
  assert.doesNotMatch(
    briefing.text,
    /\[object Object\]|competencyRef|camping\.sales|sourceRef/,
  );
});

test("existing Objection Handling outcome and E3 qualification remain exact", () => {
  const { api } = loadHarness();
  const report = makeReport();
  const evidence = api.MissionIntelligenceSystem.identifyBehavioralEvidence([
    report,
  ]);
  assert.equal(evidence.length, 1);
  assert.equal(evidence[0].competency, "objection-handling");
  assert.deepEqual(clone(evidence[0].evidenceRefs), [
    { field: "objections" },
    { field: "salesStepOutcomes", entryId: "outcome-objection" },
  ]);
  assert.equal(
    api.MissionIntelligenceSystem.identifyActiveBehavioralEvidence([report]),
    null,
  );
  const confirmedReview = {
    id: "review-objection",
    evidenceId: evidence[0].evidenceId,
    sourceRef: clone(evidence[0].sourceRef),
    outcomeEntryId: "outcome-objection",
    sourceFingerprint: evidence[0].sourceFingerprint,
    status: "confirmed-as-recorded",
    reviewedAt: "2026-08-31T13:00:00.000Z",
  };
  assert.equal(
    api.MissionIntelligenceSystem.identifyActiveBehavioralEvidence(
      [report],
      { reviews: [confirmedReview] },
    ).competency,
    "objection-handling",
  );

  for (const nonqualifier of [
    makeReport("customer-concern-partially-resolved"),
    { ...makeReport(), customerInteractions: [{ ...makeReport().customerInteractions[0], objections: [] }] },
    { ...makeReport(), customerInteractions: [{ ...makeReport().customerInteractions[0], notableMoment: "I handled an objection", salesStepOutcomes: [] }] },
  ]) {
    assert.deepEqual(
      clone(api.MissionIntelligenceSystem.identifyBehavioralEvidence([nonqualifier])),
      [],
    );
  }
});

test("Missions page exposes one exact Objection Handling selector", () => {
  const html = fs.readFileSync(path.join(root, "missions.html"), "utf8");
  assert.match(html, /id="select-objection-handling-mission"/);
  assert.match(html, /onclick="selectObjectionHandlingMissionRequest\(\)"/);
  assert.match(html, />\s*Practice Objection Handling\s*</);
  assert.equal((html.match(/select-objection-handling-mission/g) || []).length, 1);
});

test("implementation stays mission-only and preserves evidence ownership", () => {
  const missionSource = fs.readFileSync(path.join(root, "js/missions.js"), "utf8");
  assert.doesNotMatch(
    missionSource,
    /fieldReports|salesStepOutcomes|learningSignals|coachingSignals|behavioralEvidence|profile\.capabilities|CRM|inventory|VIN/,
  );
  for (const relativePath of [
    "js/widgets/field-report.widget.js",
    "systems/guidance.system.js",
    "js/endday.js",
    "progress.html",
  ]) {
    assert.equal(
      fs.readFileSync(path.join(root, relativePath), "utf8").includes(
        "practice-objection-handling",
      ),
      false,
    );
  }
  const intelligenceSource = fs.readFileSync(
    path.join(root, "systems/mission-intelligence.system.js"),
    "utf8",
  );
  assert.equal(
    (intelligenceSource.match(/practice-objection-handling/g) || []).length,
    1,
  );
});
