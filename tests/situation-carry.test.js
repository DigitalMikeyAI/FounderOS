const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const storageSource = fs.readFileSync(path.join(root, "js", "storage.js"), "utf8");
const commanderSource = fs.readFileSync(path.join(root, "systems", "commander.system.js"), "utf8");
const situationSource = fs.readFileSync(path.join(root, "systems", "situation.system.js"), "utf8");
const memorySource = fs.readFileSync(path.join(root, "systems", "memory.system.js"), "utf8");

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createStorage(initial = {}, behavior = {}) {
  const values = new Map(Object.entries(initial));
  const operations = [];
  return {
    get length() { return values.size; },
    key(index) { return Array.from(values.keys())[index] || null; },
    getItem(key) {
      operations.push(["get", key]);
      if (behavior.getItem) return behavior.getItem(key, values);
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      operations.push(["set", key, String(value)]);
      if (behavior.setItem) behavior.setItem(key, String(value), values);
      else values.set(key, String(value));
    },
    removeItem(key) { values.delete(key); },
    get values() { return values; },
    operations,
  };
}

function loadHarness({ initial = {}, behavior = {}, commander = true, memory = false } = {}) {
  const localStorage = createStorage(initial, behavior);
  const calls = { memory: 0, intelligence: 0, delivery: 0, notification: 0 };
  const context = vm.createContext({
    Date,
    Math,
    JSON,
    localStorage,
    sessionStorage: createStorage(),
    console: { log() {}, warn() {}, error() {} },
    MemorySystem: memory ? { saveArtifact() { calls.memory += 1; } } : undefined,
    MissionIntelligenceSystem: { process() { calls.intelligence += 1; } },
    CommunicationSystem: { deliver() { calls.delivery += 1; } },
    showNotification() { calls.notification += 1; },
  });
  vm.runInContext(storageSource, context, { filename: "js/storage.js" });
  if (commander) vm.runInContext(commanderSource, context, { filename: "systems/commander.system.js" });
  if (memory) vm.runInContext(memorySource, context, { filename: "systems/memory.system.js" });
  vm.runInContext(situationSource, context, { filename: "systems/situation.system.js" });
  vm.runInContext(
    ";globalThis.__api = { founder, loadFounder, saveFounder, getFounderStorageLoadStatus, CommanderSystem: typeof CommanderSystem === 'undefined' ? null : CommanderSystem, MemorySystem: typeof MemorySystem === 'undefined' ? null : MemorySystem, SituationSystem };",
    context,
  );
  return { api: context.__api, localStorage, calls };
}

function readyHarness(options = {}) {
  const harness = loadHarness(options);
  harness.api.loadFounder();
  return harness;
}

function createActive(harness) {
  return harness.api.SituationSystem.createSituation({
    subject: "Customer financing",
    currentReality: "The lender needs one corrected document.",
  });
}

function makeSituation(revisions, overrides = {}) {
  return {
    schemaVersion: 1,
    id: "situation_test_abc",
    revisions,
    ...overrides,
  };
}

function createRevision(overrides = {}) {
  return {
    revision: 1,
    subject: "Customer financing",
    currentReality: "The lender needs one corrected document.",
    carryStatus: "active",
    provenance: { authority: "commander", operation: "create" },
    recordedAt: "2026-09-12T12:00:00.000Z",
    ...overrides,
  };
}

test("create, correction, and close preserve one stable Situation history", () => {
  const harness = readyHarness();
  const created = createActive(harness);
  const id = created.id;
  const first = clone(created.revisions[0]);

  const corrected = harness.api.SituationSystem.correctSituation({
    id,
    expectedRevision: 1,
    currentReality: "The lender confirmed the corrected document is under review.",
  });
  assert.equal(corrected.id, id);
  assert.deepEqual(corrected.revisions[0], first);
  assert.equal(corrected.revisions[1].revision, 2);
  assert.equal(corrected.revisions[1].subject, first.subject);
  assert.equal(corrected.revisions[1].provenance.operation, "correct");

  const available = harness.api.SituationSystem.getSituation();
  assert.equal(available.status, "available");
  assert.equal(available.current.currentReality, corrected.revisions[1].currentReality);
  const closed = harness.api.SituationSystem.closeSituation({ id, expectedRevision: 2 });
  assert.equal(closed.id, id);
  assert.equal(closed.revisions[2].revision, 3);
  assert.equal(closed.revisions[2].subject, first.subject);
  assert.equal(closed.revisions[2].currentReality, corrected.revisions[1].currentReality);
  assert.equal(closed.revisions[2].carryStatus, "closed");
  assert.equal(closed.revisions[2].provenance.operation, "close");
});

test("closed, duplicate, mismatched, stale, and invalid Situation commands reject", () => {
  const harness = readyHarness();
  assert.throws(() => harness.api.SituationSystem.createSituation({ subject: " ", currentReality: "Reality" }));
  assert.throws(() => harness.api.SituationSystem.createSituation({ subject: "Subject", currentReality: " " }));
  const created = createActive(harness);
  assert.throws(() => createActive(harness), /already exists/);
  assert.throws(() => harness.api.SituationSystem.correctSituation({ id: "wrong", expectedRevision: 1, currentReality: "Changed" }));
  assert.throws(() => harness.api.SituationSystem.correctSituation({ id: created.id, expectedRevision: 2, currentReality: "Changed" }));
  assert.throws(() => harness.api.SituationSystem.correctSituation({ id: created.id, expectedRevision: 1, currentReality: created.revisions[0].currentReality }));
  const closed = harness.api.SituationSystem.closeSituation({ id: created.id, expectedRevision: 1 });
  assert.throws(() => harness.api.SituationSystem.correctSituation({ id: closed.id, expectedRevision: 2, currentReality: "Changed" }));
  assert.throws(() => harness.api.SituationSystem.closeSituation({ id: closed.id, expectedRevision: 2 }));
  assert.throws(() => createActive(harness), /already exists/);
});

test("create trims boundary whitespace and returns detached data", () => {
  const harness = readyHarness();
  const created = harness.api.SituationSystem.createSituation({
    subject: "  Customer financing  ",
    currentReality: "  One document remains.  ",
  });
  assert.equal(created.revisions[0].subject, "Customer financing");
  assert.equal(created.revisions[0].currentReality, "One document remains.");
  created.revisions[0].subject = "Mutated";
  assert.equal(harness.api.founder.situation.revisions[0].subject, "Customer financing");
  const history = harness.api.SituationSystem.getSituationHistory();
  history.revisions[0].currentReality = "Mutated";
  assert.equal(harness.api.founder.situation.revisions[0].currentReality, "One document remains.");
});

test("not-loaded and failed storage are unavailable; absent and loaded classify truthfully", () => {
  const notLoaded = loadHarness();
  assert.equal(notLoaded.api.SituationSystem.getSituation().status, "unavailable");
  assert.throws(() => createActive(notLoaded), /storage is unavailable/);

  const failed = loadHarness({ initial: { digitalMikeyFounder: "{bad json" } });
  failed.api.loadFounder();
  assert.equal(failed.api.getFounderStorageLoadStatus(), "failed");
  assert.equal(failed.api.SituationSystem.getSituation().status, "unavailable");
  assert.throws(() => createActive(failed), /storage is unavailable/);

  const absent = readyHarness();
  assert.equal(absent.api.getFounderStorageLoadStatus(), "absent");
  assert.deepEqual(clone(absent.api.SituationSystem.getSituation()), { status: "absent", situation: null });

  const loaded = readyHarness({ initial: { digitalMikeyFounder: JSON.stringify({ name: "Loaded" }) } });
  assert.equal(loaded.api.SituationSystem.getSituation().status, "absent");
});

test("primary failure, false confirmations, missing persistence, and PIH-1 guard publish nothing", () => {
  const primaryFailure = readyHarness({ behavior: { setItem(key) {
    if (key === "digitalMikeyFounder") throw new Error("primary failed");
  } } });
  const founder = primaryFailure.api.founder;
  assert.throws(() => createActive(primaryFailure), /primary failed/);
  assert.equal(Object.hasOwn(founder, "situation"), false);

  for (const confirmation of [false, null, undefined]) {
    const harness = readyHarness();
    harness.api.CommanderSystem.save = () => confirmation;
    assert.throws(() => createActive(harness), /not confirmed/);
    assert.equal(Object.hasOwn(harness.api.founder, "situation"), false);
  }

  const missing = readyHarness({ commander: false });
  assert.throws(() => createActive(missing), /persistence is unavailable/);
  assert.equal(Object.hasOwn(missing.api.founder, "situation"), false);

  const guarded = loadHarness({ initial: { digitalMikeyFounder: "{bad json" } });
  guarded.api.loadFounder();
  guarded.localStorage.values.clear();
  guarded.api.loadFounder();
  assert.equal(guarded.api.getFounderStorageLoadStatus(), "absent");
  assert.throws(() => createActive(guarded), /refusing to overwrite/);
  assert.equal(Object.hasOwn(guarded.api.founder, "situation"), false);
});

test("nonstandard Situation assignment is rejected before persistence", () => {
  const harness = readyHarness();
  Object.defineProperty(harness.api.founder, "situation", {
    configurable: true,
    set() { throw new Error("setter must not run"); },
  });

  assert.throws(() => createActive(harness), /already exists|cannot be published safely/);
  assert.equal(
    harness.localStorage.operations.some(([operation]) => operation === "set"),
    false,
  );
});

test("correction and close persistence failure preserve the prior live Situation reference", () => {
  const harness = readyHarness();
  const created = createActive(harness);
  const live = harness.api.founder.situation;
  harness.api.CommanderSystem.save = () => { throw new Error("persistence failed"); };
  assert.throws(() => harness.api.SituationSystem.correctSituation({ id: created.id, expectedRevision: 1, currentReality: "Changed" }));
  assert.equal(harness.api.founder.situation, live);
  assert.equal(live.revisions.length, 1);
  assert.throws(() => harness.api.SituationSystem.closeSituation({ id: created.id, expectedRevision: 1 }));
  assert.equal(harness.api.founder.situation, live);
  assert.equal(live.revisions[0].carryStatus, "active");
});

test("primary-write observation and legacy mirror failure respect confirmed publication", () => {
  let observed;
  const harness = readyHarness({ behavior: { setItem(key, value, values) {
    if (key === "digitalMikeyFounder") observed = harness.api.founder.situation;
    if (key === "founder") throw new Error("legacy failed");
    values.set(key, value);
  } } });
  const created = createActive(harness);
  assert.equal(observed, undefined);
  assert.equal(harness.api.founder.situation.id, created.id);
  assert.equal(JSON.parse(harness.localStorage.values.get("digitalMikeyFounder")).situation.id, created.id);
});

test("complete-history validation rejects corruption without repairing or reviving older truth", () => {
  const cases = [
    makeSituation([createRevision()], { schemaVersion: 2 }),
    makeSituation([createRevision(), createRevision({ revision: 2, currentReality: "Changed", carryStatus: "closed", provenance: { authority: "commander", operation: "correct" } })]),
    makeSituation([createRevision(), createRevision({ revision: 2, currentReality: "Changed", provenance: { authority: "commander", operation: "correct" } }), createRevision({ revision: 3, currentReality: "Changed", carryStatus: "closed", provenance: { authority: "commander", operation: "close" } }), createRevision({ revision: 4, currentReality: "Again", provenance: { authority: "commander", operation: "correct" } })]),
    makeSituation([createRevision(), createRevision({ revision: 2, subject: "Changed subject", currentReality: "Changed", provenance: { authority: "commander", operation: "correct" } })]),
    makeSituation([createRevision(), createRevision({ revision: 2, carryStatus: "closed", provenance: { authority: "commander", operation: "close" }, currentReality: "Changed" })]),
  ];
  for (const situation of cases) {
    const harness = readyHarness({ initial: { digitalMikeyFounder: JSON.stringify({ situation }) } });
    const live = harness.api.founder.situation;
    assert.equal(harness.api.SituationSystem.getSituation().status, "unavailable");
    assert.equal(harness.api.founder.situation, live);
    assert.throws(() => harness.api.SituationSystem.correctSituation({ id: situation.id, expectedRevision: 1, currentReality: "Changed" }));
  }
});

test("reload, ordinary saves, artifact saves, migration, identities, and firewall preserve Situation boundaries", () => {
  const first = readyHarness({ memory: true });
  first.api.founder.memory.artifacts = { unrelated: { id: "artifact" } };
  first.api.founder.profile = { strengths: ["Existing"] };
  first.api.founder.missions = [{ id: "mission" }];
  first.api.founder.developmentFocus = { id: "focus" };
  const refs = {
    founder: first.api.founder,
    memory: first.api.founder.memory,
    artifacts: first.api.founder.memory.artifacts,
    artifact: first.api.founder.memory.artifacts.unrelated,
    profile: first.api.founder.profile,
    missions: first.api.founder.missions,
    focus: first.api.founder.developmentFocus,
  };
  const created = createActive(first);
  assert.equal(first.api.founder, refs.founder);
  assert.equal(first.api.founder.memory, refs.memory);
  assert.equal(first.api.founder.memory.artifacts, refs.artifacts);
  assert.equal(first.api.founder.memory.artifacts.unrelated, refs.artifact);
  assert.equal(first.api.founder.profile, refs.profile);
  assert.equal(first.api.founder.missions, refs.missions);
  assert.equal(first.api.founder.developmentFocus, refs.focus);
  assert.deepEqual(first.calls, { memory: 0, intelligence: 0, delivery: 0, notification: 0 });
  first.api.saveFounder();
  first.api.MemorySystem.saveArtifact({ type: "another", value: true });
  assert.equal(first.api.founder.situation.id, created.id);

  const second = loadHarness({ initial: { digitalMikeyFounder: first.localStorage.values.get("digitalMikeyFounder") } });
  second.api.loadFounder();
  assert.equal(second.api.getFounderStorageLoadStatus(), "loaded");
  assert.deepEqual(clone(second.api.SituationSystem.getSituation().situation), clone(first.api.founder.situation));

  const migration = readyHarness({ initial: {
    digitalMikeyFounder: JSON.stringify({ situation: first.api.founder.situation, missionObjectives: ["One"] }),
    "objective-0": "true",
  } });
  assert.equal(migration.api.SituationSystem.getSituation().status, "available");
});