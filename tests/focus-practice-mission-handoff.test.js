const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const missionsSource = fs.readFileSync(path.join(root, "js", "missions.js"), "utf8");
const recommendationSource = fs.readFileSync(
  path.join(root, "js", "practice-recommendation.js"),
  "utf8",
);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function loadMissionAuthority({ active = false, onboarded = true } = {}) {
  const founder = {
    onboardingComplete: onboarded,
    missionStatus: active ? "active" : "inactive",
    pendingMissionRequest: null,
    currentMission: active ? "Existing Mission" : "",
  };
  const calls = { preview: 0, saves: 0 };
  const context = vm.createContext({
    founder,
    console: { log() {}, warn() {}, error() {} },
    saveFounder() { calls.saves += 1; },
    document: {
      getElementById() {
        return { textContent: "", style: {}, innerHTML: "", appendChild() {} };
      },
      querySelectorAll() { return []; },
      createElement() { return { textContent: "" }; },
    },
    MissionSystem: { normalizeMissionObjective(value) { return { text: value.text || value }; } },
  });
  vm.runInContext(missionsSource, context, { filename: "js/missions.js" });
  const originalPreview = context.presentPendingMissionRequestForPreview;
  context.presentPendingMissionRequestForPreview = () => {
    calls.preview += 1;
    return originalPreview();
  };
  vm.runInContext(
    ";globalThis.__api = { founder, selectPracticeMissionRequestByIntent };",
    context,
  );
  return { api: context.__api, calls };
}

const intents = [
  "practice-rapport",
  "practice-customer-discovery",
  "practice-product-selection",
  "practice-presentation",
  "practice-objection-handling",
  "practice-trial-close",
];

test("canonical mission authority routes all six exact practice intents to canonical pending requests", () => {
  for (const missionIntent of intents) {
    const { api, calls } = loadMissionAuthority({ onboarded: false });
    const result = clone(api.selectPracticeMissionRequestByIntent(missionIntent));
    assert.equal(result.success, true);
    assert.deepEqual(clone(api.founder.pendingMissionRequest), {
      domain: "camping.sales",
      missionIntent,
    });
    assert.equal(api.founder.missionStatus, "inactive");
    assert.equal(calls.preview, 0);
  }
});

test("canonical mission authority fails closed without label or competency inference", () => {
  for (const invalid of [null, "discovery", "Practice Customer Discovery", "practice-unknown"]) {
    const { api, calls } = loadMissionAuthority();
    assert.deepEqual(clone(api.selectPracticeMissionRequestByIntent(invalid)), {
      success: false,
      reason: "invalid-practice-mission-intent",
    });
    assert.equal(api.founder.pendingMissionRequest, null);
    assert.equal(api.founder.missionStatus, "inactive");
    assert.equal(calls.preview, 0);
  }
});

test("central router reuses existing returning-Commander preview and active-mission deferral", () => {
  const returning = loadMissionAuthority();
  assert.equal(
    returning.api.selectPracticeMissionRequestByIntent("practice-trial-close").success,
    true,
  );
  assert.equal(returning.calls.preview, 1);
  assert.equal(returning.api.founder.missionStatus, "inactive");

  const active = loadMissionAuthority({ active: true });
  assert.equal(
    active.api.selectPracticeMissionRequestByIntent("practice-trial-close").success,
    true,
  );
  assert.equal(active.calls.preview, 1);
  assert.equal(active.api.founder.missionStatus, "active");
  assert.equal(active.api.founder.currentMission, "Existing Mission");
  assert.deepEqual(clone(active.api.founder.pendingMissionRequest), {
    domain: "camping.sales",
    missionIntent: "practice-trial-close",
  });
});

test("Phase 7 delegates its preview handoff to the canonical mission authority router", () => {
  assert.match(recommendationSource, /selectPracticeMissionRequestByIntent\(recommendation\.missionIntent\)/);
  assert.doesNotMatch(
    recommendationSource,
    /practice-rapport[\s\S]*selectRapportMissionRequest|practice-customer-discovery[\s\S]*selectCustomerDiscoveryMissionRequest/,
  );
});

test("mission authority router remains the only six-intent selector map", () => {
  assert.match(missionsSource, /function selectPracticeMissionRequestByIntent\(/);
  assert.doesNotMatch(recommendationSource, /const selectors\s*=/);
});