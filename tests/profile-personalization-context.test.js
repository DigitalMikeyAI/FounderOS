const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createStorage() {
  const values = new Map();
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
  };
}

function makeCapability(overrides = {}) {
  return {
    id: "profile_capability_objection-handling",
    type: "developing-capability",
    competency: "objection-handling",
    label: "Objection Handling",
    status: "active",
    adoptedAt: "2026-08-27T12:00:00.000Z",
    withdrawnAt: null,
    adoptedBy: "commander",
    adoptedWording: "Developing capability: Objection Handling",
    evidenceSupportState: "current",
    provenance: {
      candidateId: "profile_candidate_behavioral_capability_objection-handling",
      candidateVersionIdentity: "candidate-version-exact",
      patternId: "behavioral_pattern_objection-handling",
      patternVersionIdentity: "pattern-version-exact",
      patternReviewId: "pattern-review-exact",
      contributorActiveIdentities: ["active-a", "active-b", "active-c"],
      decisionId: "profile-decision-exact",
    },
    ...overrides,
  };
}

function createHarness(capabilities = []) {
  const localStorage = createStorage();
  let persistenceWrites = 0;
  const originalSetItem = localStorage.setItem.bind(localStorage);
  localStorage.setItem = (key, value) => {
    persistenceWrites += 1;
    originalSetItem(key, value);
  };
  const context = vm.createContext({
    console: { log() {}, warn() {}, error() {} },
    localStorage,
    sessionStorage: createStorage(),
  });
  for (const relativePath of [
    "js/storage.js",
    "systems/commander.system.js",
    "js/core/archie-core.js",
  ]) {
    const file = path.resolve(__dirname, "..", relativePath);
    vm.runInContext(fs.readFileSync(file, "utf8"), context, { filename: file });
  }
  vm.runInContext(
    ";globalThis.__api = { founder, CommanderSystem, ArchieCore };",
    context,
  );
  const { founder, CommanderSystem, ArchieCore } = context.__api;
  founder.profile.capabilities = clone(capabilities);
  ArchieCore.systems = { commander: CommanderSystem };
  return {
    founder,
    CommanderSystem,
    ArchieCore,
    getPersistenceWrites: () => persistenceWrites,
  };
}

test("no capabilities returns an empty personalization context", () => {
  const harness = createHarness();
  assert.deepEqual(clone(harness.CommanderSystem.getProfilePersonalizationContext()), []);
  assert.deepEqual(clone(harness.ArchieCore.getProfilePersonalizationContext()), []);
});

test("active capability projects the exact sanitized identity shape", () => {
  const capability = makeCapability();
  const harness = createHarness([capability]);
  assert.deepEqual(clone(harness.CommanderSystem.getProfilePersonalizationContext()), [
    {
      capabilityId: capability.id,
      competency: capability.competency,
      label: capability.label,
      type: capability.type,
      adoptedWording: capability.adoptedWording,
      evidenceSupportState: capability.evidenceSupportState,
      adoptedAt: capability.adoptedAt,
    },
  ]);
});

test("withdrawn and malformed capabilities never enter current context", () => {
  const withdrawn = makeCapability({
    status: "withdrawn",
    withdrawnAt: "2026-08-27T13:00:00.000Z",
  });
  const malformed = makeCapability({ adoptedBy: "system" });
  const active = makeCapability({
    id: "profile_capability_trial-close",
    competency: "trial-close",
    label: "Trial Close",
  });
  const harness = createHarness([withdrawn, malformed, active]);
  const result = clone(harness.CommanderSystem.getProfilePersonalizationContext());
  assert.equal(result.length, 1);
  assert.equal(result[0].capabilityId, active.id);
});

test("projection excludes provenance, history, scores, and inferred authority", () => {
  const harness = createHarness([makeCapability()]);
  const [result] = clone(harness.CommanderSystem.getProfilePersonalizationContext());
  const excluded = [
    "provenance",
    "candidateId",
    "candidateVersionIdentity",
    "patternId",
    "patternVersionIdentity",
    "patternReviewId",
    "contributorActiveIdentities",
    "decisionId",
    "withdrawnAt",
    "score",
    "confidence",
    "proficiency",
  ];
  for (const key of excluded) assert.equal(Object.hasOwn(result, key), false);
  assert.deepEqual(Object.keys(result), [
    "capabilityId",
    "competency",
    "label",
    "type",
    "adoptedWording",
    "evidenceSupportState",
    "adoptedAt",
  ]);
});

test("all support states pass through unchanged without ranking", () => {
  const states = [
    "current",
    "support-changed",
    "insufficient-current-support",
  ];
  for (const evidenceSupportState of states) {
    const harness = createHarness([makeCapability({ evidenceSupportState })]);
    const [result] = clone(harness.CommanderSystem.getProfilePersonalizationContext());
    assert.equal(result.evidenceSupportState, evidenceSupportState);
  }
});

test("stored order is preserved", () => {
  const first = makeCapability();
  const second = makeCapability({
    id: "profile_capability_trial-close",
    competency: "trial-close",
    label: "Trial Close",
  });
  const harness = createHarness([first, second]);
  assert.deepEqual(
    clone(harness.CommanderSystem.getProfilePersonalizationContext()).map(
      (entry) => entry.capabilityId,
    ),
    [first.id, second.id],
  );
});

test("returned arrays and objects are detached and repeated reads stay stable", () => {
  const capability = makeCapability();
  const harness = createHarness([capability]);
  const beforeProfile = clone(harness.founder.profile);
  const first = harness.ArchieCore.getProfilePersonalizationContext();
  first.push({ capabilityId: "injected" });
  first[0].label = "Changed";
  first[0].evidenceSupportState = "changed-by-consumer";
  assert.deepEqual(clone(harness.founder.profile), beforeProfile);
  assert.deepEqual(
    clone(harness.ArchieCore.getProfilePersonalizationContext()),
    clone(harness.CommanderSystem.getProfilePersonalizationContext()),
  );
  assert.equal(harness.getPersistenceWrites(), 0);
});

test("projection has no downstream system or Mission Intelligence dependency", () => {
  const harness = createHarness([makeCapability()]);
  assert.deepEqual(Object.keys(harness.ArchieCore.systems), ["commander"]);
  assert.doesNotThrow(() => harness.ArchieCore.getProfilePersonalizationContext());
  assert.equal(harness.getPersistenceWrites(), 0);
});
