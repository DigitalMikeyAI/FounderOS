const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const request = { domain: "camping.sales", missionIntent: "practice-rapport" };
const existingIntents = [
  "practice-trial-close",
  "practice-customer-discovery",
  "practice-product-selection",
  "practice-presentation",
  "practice-objection-handling",
];
const expectedMission = {
  title: "Practice Referencing Customer Context",
  description:
    "Notice one non-sensitive detail the customer chooses to share, bring it up naturally later in the same conversation, and record it in your Field Report.",
  reward: 100,
  objectives: [
    "Notice one non-sensitive detail the customer chooses to share without asking for private information.",
    {
      text: "Bring that detail up naturally later in the same conversation.",
      competencyRef: { domain: "camping.sales", competency: "rapport" },
    },
    "Record only the detail's category and what you did in a Field Report.",
  ],
};

const clone = (value) => JSON.parse(JSON.stringify(value));

function element() {
  return {
    textContent: "", innerHTML: "", style: {}, dataset: {}, checked: false,
    handlers: {}, children: [],
    addEventListener(type, handler) { this.handlers[type] = handler; },
    appendChild(child) { this.children.push(child); },
  };
}

function loadHarness() {
  const storage = new Map();
  const elements = new Map();
  const renderedItems = [];
  const context = vm.createContext({
    console: { log() {}, warn() {}, error() {} }, Date, Math, JSON, __tasks: [],
    localStorage: {
      getItem(key) { return storage.has(key) ? storage.get(key) : null; },
      setItem(key, value) { storage.set(key, String(value)); },
      removeItem(key) { storage.delete(key); },
    },
    document: {
      getElementById(id) {
        if (!elements.has(id)) {
          const item = element();
          if (id === "mission-task-container") {
            item.appendChild = (child) => {
              item.children.push(child);
              renderedItems.push(child.textContent || child.innerHTML || "");
            };
          }
          elements.set(id, item);
        }
        return elements.get(id);
      },
      createElement: element,
      querySelectorAll(selector) {
        return selector === ".mission-task" ? context.__tasks : [];
      },
    },
    CommanderSystem: { save() { context.saveFounder(); return true; } },
    updateFounderLevel() {}, updateFounderDisplay() {}, updateCommandLog() {},
    updateXP() {}, updateMissionProgress() {}, updateMissionStatus() {},
    generateArchieLogNote() { return "Archived by Commander"; },
    ArchieCore: { refreshSession: async () => {} },
  });
  for (const relative of [
    "js/storage.js", "systems/domain-competency.contract.js",
    "systems/mission.system.js", "js/missions.js", "js/endday.js",
    "systems/guidance.system.js", "systems/mission-intelligence.system.js",
    "systems/briefing.system.js",
  ]) {
    const filename = path.join(root, relative);
    vm.runInContext(fs.readFileSync(filename, "utf8"), context, { filename });
  }
  vm.runInContext(
    ";globalThis.__api={founder,saveFounder,loadFounder,MissionSystem,GuidanceSystem,MissionIntelligenceSystem,BriefingSystem,validatePendingMissionRequest,setPendingMissionRequest,selectRapportMissionRequest,presentPendingMissionRequestForPreview,generateMission,clearAcceptedGeneratedMissionRequest,updateMissionChecklist,archiveMissionDay};",
    context,
  );
  const setTasks = (states) => {
    context.__tasks = states.map((checked, index) => ({
      id: `objective-${index}`, checked, dataset: { xp: "25" }, addEventListener() {},
    }));
    vm.runInContext("tasks=__tasks;", context);
  };
  return { context, storage, elements, renderedItems, api: context.__api, setTasks };
}

function generate(api) {
  api.setPendingMissionRequest(request);
  return api.generateMission();
}

test("exact request validates; malformed requests and aliases fail closed", () => {
  const { api } = loadHarness();
  assert.deepEqual(clone(api.validatePendingMissionRequest(request)), { valid: true, request });
  for (const missionIntent of existingIntents) {
    assert.equal(api.validatePendingMissionRequest({ domain: "camping.sales", missionIntent }).valid, true);
  }
  for (const invalid of [
    null, [], { domain: "camping.sales", missionIntent: "rapport" },
    { domain: "Camping Sales", missionIntent: "practice-rapport" },
    { domain: "camping.sales", missionIntent: "Practice Rapport" },
    { domain: "camping.sales", missionIntent: "practice-customer-context" },
  ]) assert.equal(api.validatePendingMissionRequest(invalid).valid, false);
});

test("mission definition is exact, opportunistic, and only PERFORM is tagged", () => {
  const { api } = loadHarness();
  const mission = generate(api);
  assert.deepEqual(clone(mission), expectedMission);
  assert.equal(mission.objectives.length, 3);
  assert.equal(typeof mission.objectives[0], "string");
  assert.deepEqual(clone(mission.objectives[1].competencyRef), {
    domain: "camping.sales", competency: "rapport",
  });
  assert.equal(typeof mission.objectives[2], "string");
  const wording = `${mission.description} ${mission.objectives.map((item) => item.text || item).join(" ")}`;
  assert.match(wording, /chooses to share/);
  assert.match(wording, /when natural|naturally/);
  assert.match(wording, /without asking for private information/);
  assert.doesNotMatch(wording, /obtain|required personal|build trust|like you|comfort|chemistry|fake|manipulat/i);
});

test("selection creates an inactive preview and never auto-accepts", () => {
  const { api, elements } = loadHarness();
  api.founder.onboardingComplete = true;
  api.founder.missionStatus = "inactive";
  assert.equal(api.selectRapportMissionRequest().success, true);
  assert.equal(elements.get("mission-title").textContent, expectedMission.title);
  assert.equal(elements.get("mission-description").textContent, expectedMission.description);
  assert.equal(api.founder.missionStatus, "inactive");
  assert.deepEqual(clone(api.founder.pendingMissionRequest), request);
});

test("active mission is protected and blocked Rapport intent remains pending", () => {
  const { api } = loadHarness();
  Object.assign(api.founder, { currentMission: "Existing mission", missionStatus: "active" });
  api.setPendingMissionRequest(request);
  assert.deepEqual(clone(api.generateMission()), {
    success: false, reason: "active-mission-replacement-required", request,
  });
  assert.equal(api.founder.currentMission, "Existing mission");
  assert.deepEqual(clone(api.founder.pendingMissionRequest), request);
});

test("matching acceptance clears only matching intent and persists truthfully", () => {
  const harness = loadHarness();
  generate(harness.api);
  harness.api.founder.missionStatus = "active";
  assert.equal(harness.api.clearAcceptedGeneratedMissionRequest().success, true);
  harness.api.saveFounder();
  vm.runInContext("founder.currentMission='';founder.missionStatus='inactive';loadFounder();", harness.context);
  assert.equal(harness.api.founder.currentMission, expectedMission.title);
  assert.equal(harness.api.founder.missionStatus, "active");
  assert.equal(harness.api.founder.pendingMissionRequest, null);
  const mismatch = loadHarness();
  generate(mismatch.api);
  mismatch.api.founder.pendingMissionRequest = { domain: "camping.sales", missionIntent: "practice-trial-close" };
  assert.equal(mismatch.api.clearAcceptedGeneratedMissionRequest().success, false);
  assert.equal(mismatch.api.founder.pendingMissionRequest.missionIntent, "practice-trial-close");
});

test("only objective three renders a navigation-only Field Report handoff", () => {
  const { api, renderedItems, storage } = loadHarness();
  generate(api);
  api.founder.missionStatus = "active";
  api.updateMissionChecklist();
  assert.equal(renderedItems.length, 3);
  assert.doesNotMatch(renderedItems[0], /Open Field Report/);
  assert.doesNotMatch(renderedItems[1], /Open Field Report/);
  assert.match(renderedItems[2], /href="index\.html#field-report-card"/);
  assert.doesNotMatch(renderedItems.join(" "), /\[object Object\]|competencyRef|camping\.sales|sourceRef/);
  assert.equal([...storage.keys()].filter((key) => /^objective-/.test(key)).length, 0);
  assert.equal(api.founder.salesStepOutcomes, undefined);
});

test("no-opportunity mission may archive incomplete without fabricated evidence", () => {
  const { api, setTasks } = loadHarness();
  generate(api);
  Object.assign(api.founder, { missionStatus: "active", xp: 20, streak: 4, commandLog: [] });
  setTasks([false, false, false]);
  const profileBefore = clone(api.founder.profile);
  assert.equal(api.archiveMissionDay().success, true);
  assert.equal(api.founder.missionStatus, "inactive");
  assert.equal(api.founder.commandLog[0].xp, 0);
  assert.equal(api.founder.commandLog[0].objectives, 0);
  assert.equal(api.founder.salesStepOutcomes, undefined);
  assert.equal(api.founder.behavioralEvidence, undefined);
  assert.deepEqual(clone(api.founder.profile), profileBefore);
});

test("mission is Profile-independent, adds no Guidance, and leaks no metadata", () => {
  const outputs = [[], [{ competency: "rapport", status: "active" }],
    [{ competency: "rapport", status: "withdrawn" }],
    [{ competency: "discovery", status: "active" }]].map((capabilities) => {
      const { api } = loadHarness();
      api.founder.profile.capabilities = clone(capabilities);
      const mission = generate(api);
      const guidance = api.GuidanceSystem.build({ mission: { ...clone(mission), status: "active" } });
      const recommendation = api.MissionIntelligenceSystem.buildActiveMissionRecommendation(
        { ...clone(mission), status: "active" }, null,
      );
      return { mission: clone(mission), guidance, recommendation: clone(recommendation) };
    });
  outputs.forEach((output) => assert.deepEqual(output, outputs[0]));
  assert.equal(outputs[0].guidance, null);
  assert.equal(outputs[0].recommendation.nextAction, expectedMission.objectives[0]);
});

test("Missions page exposes one exact Rapport selector", () => {
  const html = fs.readFileSync(path.join(root, "missions.html"), "utf8");
  assert.match(html, /id="select-rapport-mission"/);
  assert.match(html, /onclick="selectRapportMissionRequest\(\)"/);
  assert.match(html, />\s*Practice Referencing Customer Context\s*</);
  assert.equal((html.match(/select-rapport-mission/g) || []).length, 1);
});

test("implementation remains mission-layer only", () => {
  const source = fs.readFileSync(path.join(root, "js/missions.js"), "utf8");
  assert.doesNotMatch(source, /fieldReports|salesStepOutcomes|behavioralEvidence|profile\.capabilities|CRM|inventory|VIN/);
  for (const relative of [
    "js/widgets/field-report.widget.js",
    "systems/guidance.system.js", "js/endday.js", "js/progress.js",
  ]) assert.equal(fs.readFileSync(path.join(root, relative), "utf8").includes("practice-rapport"), false);
  const intelligenceSource = fs.readFileSync(path.join(root, "systems/mission-intelligence.system.js"), "utf8");
  assert.equal((intelligenceSource.match(/practice-rapport/g) || []).length, 1);
});
