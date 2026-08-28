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

function loadHarness(initialStorage = null) {
  const storage = new Map();
  if (initialStorage) {
    const serialized = JSON.stringify(initialStorage);
    storage.set("digitalMikeyFounder", serialized);
    storage.set("founder", serialized);
  }
  const elements = new Map();
  const makeElement = () => ({
    textContent: "",
    dataset: {},
    handlers: {},
    addEventListener(type, handler) {
      this.handlers[type] = handler;
    },
  });
  const getElementById = (id) => {
    if (!elements.has(id)) elements.set(id, makeElement());
    return elements.get(id);
  };
  getElementById("select-trial-close-mission");
  getElementById("pending-mission-request-status");

  const context = vm.createContext({
    console: { log() {}, warn() {}, error() {} },
    JSON,
    Object,
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
      querySelectorAll() {
        return [];
      },
    },
  });

  for (const relativePath of ["js/storage.js", "js/missions.js"]) {
    const file = path.join(root, relativePath);
    vm.runInContext(fs.readFileSync(file, "utf8"), context, { filename: file });
  }
  vm.runInContext(
    ";globalThis.__api = { founder, saveFounder, loadFounder, validatePendingMissionRequest, setPendingMissionRequest, clearPendingMissionRequestAfterAcceptance, selectTrialCloseMissionRequest, generateMission };",
    context,
  );
  return { context, storage, elements, api: context.__api };
}

test("validation accepts only the exact canonical pending request", () => {
  const { api } = loadHarness();
  assert.deepEqual(clone(api.validatePendingMissionRequest(canonicalRequest)), {
    valid: true,
    request: canonicalRequest,
  });

  for (const invalid of [
    null,
    {},
    { missionIntent: canonicalRequest.missionIntent },
    { domain: canonicalRequest.domain },
    { ...canonicalRequest, domain: "Camping Sales" },
    { ...canonicalRequest, domain: "CAMPING.SALES" },
    { ...canonicalRequest, missionIntent: "Practice Trial Close" },
    { ...canonicalRequest, missionIntent: "trial-close" },
  ]) {
    assert.equal(api.validatePendingMissionRequest(invalid).valid, false);
  }
});

test("validated and stored requests are defensive canonical copies", () => {
  const { api } = loadHarness();
  const input = { ...canonicalRequest, ignored: "not-authority" };
  const result = api.setPendingMissionRequest(input);
  input.domain = "changed";

  assert.equal(result.success, true);
  assert.deepEqual(clone(result.request), canonicalRequest);
  assert.deepEqual(clone(api.founder.pendingMissionRequest), canonicalRequest);
  assert.equal(Object.hasOwn(api.founder.pendingMissionRequest, "ignored"), false);
});

test("the Missions control is the explicit setter and uses truthful pending copy", () => {
  const { api, elements } = loadHarness();
  api.selectTrialCloseMissionRequest();

  assert.deepEqual(clone(api.founder.pendingMissionRequest), canonicalRequest);
  assert.equal(
    elements.get("pending-mission-request-status").textContent,
    "Selected for next mission.",
  );
});

test("pending request persists through save and reload without migration", () => {
  const { context, storage, api } = loadHarness();
  api.setPendingMissionRequest(canonicalRequest);
  vm.runInContext("founder.pendingMissionRequest = null", context);
  api.loadFounder();

  assert.deepEqual(clone(api.founder.pendingMissionRequest), canonicalRequest);
  const persisted = JSON.parse(storage.get("digitalMikeyFounder"));
  assert.deepEqual(persisted.pendingMissionRequest, canonicalRequest);
  assert.equal(persisted.profile.schemaVersion, "COMMANDER_PROFILE_SCHEMA_v1");
  assert.deepEqual(persisted.missionObjectives, []);
});

test("legacy missing request is compatible while malformed stored input fails closed", () => {
  const legacy = loadHarness({ missionGoal: "Master AI Tools" });
  legacy.api.loadFounder();
  assert.equal(legacy.api.founder.pendingMissionRequest, null);
  assert.equal(legacy.api.generateMission().title, "Your First AI Workflow");

  const malformed = loadHarness({
    missionGoal: "Master AI Tools",
    pendingMissionRequest: {
      domain: "Camping Sales",
      missionIntent: "practice-trial-close",
    },
  });
  malformed.api.loadFounder();
  const result = malformed.api.generateMission();
  assert.deepEqual(clone(result), {
    success: false,
    reason: "invalid-pending-mission-request",
  });
  assert.equal(malformed.api.founder.currentMission, "");
});

test("explicit pending request outranks generic goals and authors its definition", () => {
  const { api } = loadHarness();
  api.founder.missionGoal = "Master AI Tools";
  api.setPendingMissionRequest(canonicalRequest);
  const result = api.generateMission();

  assert.equal(result.title, "Practice a Trial Close");
  assert.notEqual(result.title, "Your First AI Workflow");
  assert.deepEqual(clone(api.founder.pendingMissionRequest), canonicalRequest);
});

test("all five generic mission routes remain unchanged without a pending request", () => {
  const cases = [
    ["Master AI Tools", "Your First AI Workflow"],
    ["Build an Online Business", "Build Your Foundation"],
    ["Grow an Audience", "Launch Your Content Engine"],
    ["Automate My Workflow", "Design Your First System"],
    ["Help Finding My Direction", "Discover Your Direction"],
  ];
  for (const [goal, title] of cases) {
    const { api } = loadHarness();
    api.founder.missionGoal = goal;
    const mission = api.generateMission();
    assert.equal(mission.title, title);
    assert.equal(api.founder.pendingMissionRequest, null);
  }
});

test("explicit selection replaces one prior request without creating a queue", () => {
  const { api } = loadHarness();
  api.founder.pendingMissionRequest = {
    domain: "old.invalid",
    missionIntent: "old-invalid-request",
  };
  api.setPendingMissionRequest(canonicalRequest);

  assert.deepEqual(clone(api.founder.pendingMissionRequest), canonicalRequest);
  assert.equal(Array.isArray(api.founder.pendingMissionRequest), false);
});

test("selecting and routing a pending request never overwrites an active mission", () => {
  const { api } = loadHarness();
  Object.assign(api.founder, {
    currentMission: "Your First AI Workflow",
    missionDescription: "Existing mission",
    missionReward: 100,
    missionObjectives: ["Existing objective"],
    missionStatus: "active",
  });
  const activeBefore = clone({
    title: api.founder.currentMission,
    description: api.founder.missionDescription,
    reward: api.founder.missionReward,
    objectives: api.founder.missionObjectives,
    status: api.founder.missionStatus,
  });

  api.setPendingMissionRequest(canonicalRequest);
  const result = api.generateMission();

  assert.deepEqual(
    clone({
      title: api.founder.currentMission,
      description: api.founder.missionDescription,
      reward: api.founder.missionReward,
      objectives: api.founder.missionObjectives,
      status: api.founder.missionStatus,
    }),
    activeBefore,
  );
  assert.equal(result.reason, "active-mission-replacement-required");
});

test("only matching successful acceptance lifecycle clearing removes the request", () => {
  const { api } = loadHarness();
  api.setPendingMissionRequest(canonicalRequest);
  api.generateMission();
  assert.deepEqual(clone(api.founder.pendingMissionRequest), canonicalRequest);

  const unrelated = api.clearPendingMissionRequestAfterAcceptance({
    domain: "camping.sales",
    missionIntent: "another-mission",
  });
  assert.equal(unrelated.success, false);
  assert.deepEqual(clone(api.founder.pendingMissionRequest), canonicalRequest);

  const cleared = api.clearPendingMissionRequestAfterAcceptance(canonicalRequest);
  assert.deepEqual(clone(cleared), { success: true, changed: true });
  assert.equal(api.founder.pendingMissionRequest, null);
});

test("the UI exposes selection without claiming activation or leaking authority keys", () => {
  const html = fs.readFileSync(path.join(root, "missions.html"), "utf8");
  assert.match(html, /id="select-trial-close-mission"/);
  assert.match(html, />\s*Practice a Trial Close\s*</);
  assert.doesNotMatch(html, /Mission started/i);
  assert.doesNotMatch(html, /camping\.sales|practice-trial-close/);
  for (const existing of [
    "Build Your Foundation",
    "Launch Your Content Engine",
    "Your First AI Workflow",
    "Design Your First System",
    "Discover Your Direction",
  ]) {
    assert.match(html, new RegExp(existing));
  }
});

test("no intelligence, evidence, Profile, coaching, or reflection system can write routing", () => {
  const forbiddenFiles = [
    "systems/guidance.system.js",
    "systems/mission-intelligence.system.js",
    "systems/briefing.system.js",
    "systems/reflection.system.js",
    "systems/workshop.system.js",
    "systems/commander.system.js",
    "js/widgets/field-report.widget.js",
    "js/core/archie-core.js",
  ];
  for (const relativePath of forbiddenFiles) {
    const source = fs.readFileSync(path.join(root, relativePath), "utf8");
    assert.doesNotMatch(source, /pendingMissionRequest/);
  }

  const onboarding = fs.readFileSync(path.join(root, "js/main.js"), "utf8");
  assert.doesNotMatch(onboarding, /setPendingMissionRequest/);
});
