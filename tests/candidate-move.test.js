const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const storageSource = fs.readFileSync(path.join(root, "js", "storage.js"), "utf8");
const commanderSource = fs.readFileSync(path.join(root, "systems", "commander.system.js"), "utf8");
const situationSource = fs.readFileSync(path.join(root, "systems", "situation.system.js"), "utf8");
const candidateSource = fs.readFileSync(path.join(root, "systems", "candidate-move.system.js"), "utf8");
const memorySource = fs.readFileSync(path.join(root, "systems", "memory.system.js"), "utf8");

function clone(value) { return JSON.parse(JSON.stringify(value)); }

function createStorage(initial = {}, behavior = {}) {
  const values = new Map(Object.entries(initial));
  const operations = [];
  return {
    get length() { return values.size; },
    key(index) { return Array.from(values.keys())[index] || null; },
    getItem(key) { operations.push(["get", key]); return behavior.getItem ? behavior.getItem(key, values) : (values.has(key) ? values.get(key) : null); },
    setItem(key, value) { operations.push(["set", key, String(value)]); if (behavior.setItem) behavior.setItem(key, String(value), values); else values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
    get values() { return values; },
    operations,
  };
}

function loadHarness({ initial = {}, behavior = {}, commander = true, memory = false, statusApi = true } = {}) {
  const localStorage = createStorage(initial, behavior);
  const calls = { memory: 0, intelligence: 0, delivery: 0, notification: 0, refresh: 0 };
  const context = vm.createContext({
    Date, Math, JSON, localStorage, sessionStorage: createStorage(),
    console: { log() {}, warn() {}, error() {} },
    MemorySystem: memory ? { saveArtifact() { calls.memory += 1; } } : undefined,
    MissionIntelligenceSystem: { process() { calls.intelligence += 1; } },
    CommunicationSystem: { deliver() { calls.delivery += 1; } },
    showNotification() { calls.notification += 1; }, refreshSession() { calls.refresh += 1; },
  });
  vm.runInContext(storageSource, context, { filename: "js/storage.js" });
  if (!statusApi) vm.runInContext("getFounderStorageLoadStatus = undefined;", context);
  if (commander) vm.runInContext(commanderSource, context, { filename: "systems/commander.system.js" });
  if (memory) vm.runInContext(memorySource, context, { filename: "systems/memory.system.js" });
  vm.runInContext(situationSource, context, { filename: "systems/situation.system.js" });
  vm.runInContext(candidateSource, context, { filename: "systems/candidate-move.system.js" });
  vm.runInContext(
    ";globalThis.__api = { founder, loadFounder, saveFounder, getFounderStorageLoadStatus: typeof getFounderStorageLoadStatus === 'function' ? getFounderStorageLoadStatus : null, CommanderSystem: typeof CommanderSystem === 'undefined' ? null : CommanderSystem, MemorySystem: typeof MemorySystem === 'undefined' ? null : MemorySystem, SituationSystem, CandidateMoveSystem };",
    context,
  );
  return { api: context.__api, localStorage, calls };
}

function readyHarness(options = {}) { const harness = loadHarness(options); harness.api.loadFounder(); return harness; }
function createSituation(harness) { return harness.api.SituationSystem.createSituation({ subject: "Customer financing", currentReality: "One corrected document remains." }); }
function createMove(harness, situationId) { return harness.api.CandidateMoveSystem.createCandidateMove({ situationId, action: "Send the corrected document to the lender." }); }
function revision(overrides = {}) { return { revision: 1, action: "Send the corrected document to the lender.", status: "active", provenance: { authority: "commander", operation: "create" }, recordedAt: "2026-09-12T12:00:00.000Z", ...overrides }; }
function move(revisions, overrides = {}) { return { schemaVersion: 1, id: "candidate_move_test_abc", situationId: "situation_test_abc", revisions, ...overrides }; }
function situation() { return { schemaVersion: 1, id: "situation_test_abc", revisions: [{ revision: 1, subject: "Customer financing", currentReality: "One corrected document remains.", carryStatus: "active", provenance: { authority: "commander", operation: "create" }, recordedAt: "2026-09-12T12:00:00.000Z" }] }; }

test("explicit Commander create is the only authority and preserves Situation", () => {
  const harness = readyHarness();
  const createdSituation = createSituation(harness);
  const situationRef = harness.api.founder.situation;
  assert.equal(Object.hasOwn(harness.api.founder, "candidateMove"), false);
  const created = createMove(harness, createdSituation.id);
  assert.equal(created.situationId, createdSituation.id);
  assert.equal(created.revisions[0].status, "active");
  assert.equal(created.revisions[0].provenance.operation, "create");
  assert.equal(harness.api.founder.situation, situationRef);
  assert.equal(harness.api.founder.candidateMove.id, created.id);
});

test("correction and withdrawal append one stable history and enforce terminal lifecycle", () => {
  const harness = readyHarness();
  const situationRecord = createSituation(harness);
  const created = createMove(harness, situationRecord.id);
  const first = clone(created.revisions[0]);
  const corrected = harness.api.CandidateMoveSystem.correctCandidateMove({ id: created.id, expectedRevision: 1, action: "Send the complete corrected package to the lender." });
  assert.equal(corrected.id, created.id);
  assert.equal(corrected.situationId, situationRecord.id);
  assert.deepEqual(corrected.revisions[0], first);
  assert.equal(corrected.revisions[1].revision, 2);
  assert.equal(corrected.revisions[1].status, "active");
  const withdrawn = harness.api.CandidateMoveSystem.withdrawCandidateMove({ id: created.id, expectedRevision: 2 });
  assert.equal(withdrawn.revisions[2].status, "withdrawn");
  assert.equal(withdrawn.revisions[2].action, corrected.revisions[1].action);
  assert.throws(() => harness.api.CandidateMoveSystem.withdrawCandidateMove({ id: created.id, expectedRevision: 3 }));
  assert.throws(() => harness.api.CandidateMoveSystem.correctCandidateMove({ id: created.id, expectedRevision: 3, action: "Another action" }));
  assert.throws(() => createMove(harness, situationRecord.id), /already exists/);
});

test("creation requires an active matching Situation and valid bounded action", () => {
  const harness = readyHarness();
  assert.throws(() => createMove(harness, "situation_missing_abc"), /Situation is unavailable/);
  const record = createSituation(harness);
  assert.throws(() => createMove(harness, "situation_wrong_abc"), /does not match/);
  assert.throws(() => harness.api.CandidateMoveSystem.createCandidateMove({ situationId: record.id, action: " " }));
  assert.throws(() => harness.api.CandidateMoveSystem.createCandidateMove({ situationId: record.id, action: "x".repeat(2001) }));
  harness.api.SituationSystem.closeSituation({ id: record.id, expectedRevision: 1 });
  assert.throws(() => createMove(harness, record.id), /closed/);
});

test("Situation changes never create, rewrite, or withdraw Candidate Move and closed Situation permits existing lifecycle", () => {
  const harness = readyHarness();
  const record = createSituation(harness);
  harness.api.SituationSystem.correctSituation({ id: record.id, expectedRevision: 1, currentReality: "The corrected document is under review." });
  assert.equal(Object.hasOwn(harness.api.founder, "candidateMove"), false);
  const created = createMove(harness, record.id);
  const moveRef = harness.api.founder.candidateMove;
  harness.api.SituationSystem.closeSituation({ id: record.id, expectedRevision: 2 });
  assert.equal(harness.api.founder.candidateMove, moveRef);
  assert.equal(harness.api.CandidateMoveSystem.getCandidateMove().status, "available");
  const corrected = harness.api.CandidateMoveSystem.correctCandidateMove({ id: created.id, expectedRevision: 1, action: "Wait for the lender review, then send the requested correction." });
  assert.equal(corrected.revisions.length, 2);
  const withdrawn = harness.api.CandidateMoveSystem.withdrawCandidateMove({ id: created.id, expectedRevision: 2 });
  assert.equal(withdrawn.revisions[2].status, "withdrawn");
});

test("load statuses, reads, detachment, and missing status API classify truthfully", () => {
  const notLoaded = loadHarness();
  assert.deepEqual(clone(notLoaded.api.CandidateMoveSystem.getCandidateMove()), {
    status: "unavailable", reason: "founder-storage-not-loaded",
  });
  const failed = loadHarness({ initial: { digitalMikeyFounder: "{bad json" } });
  failed.api.loadFounder();
  assert.deepEqual(clone(failed.api.CandidateMoveSystem.getCandidateMove()), {
    status: "unavailable", reason: "founder-storage-failed",
  });
  const absent = readyHarness();
  const before = absent.localStorage.operations.length;
  assert.equal(absent.api.CandidateMoveSystem.getCandidateMove().status, "absent");
  assert.equal(absent.api.CandidateMoveSystem.getCandidateMoveHistory().status, "absent");
  assert.equal(absent.localStorage.operations.length, before);
  const missing = loadHarness({ statusApi: false });
  assert.equal(missing.api.CandidateMoveSystem.getCandidateMove().status, "unavailable");
  const record = createSituation(absent);
  const created = createMove(absent, record.id);
  const result = absent.api.CandidateMoveSystem.getCandidateMove();
  result.candidateMove.revisions[0].action = "Mutated";
  assert.equal(absent.api.founder.candidateMove.revisions[0].action, created.revisions[0].action);
  const history = absent.api.CandidateMoveSystem.getCandidateMoveHistory();
  history.revisions[0].action = "Mutated";
  assert.equal(absent.api.founder.candidateMove.revisions[0].action, created.revisions[0].action);
});

test("persistence failures, non-confirmation, PIH-1 guard, and unsafe destination publish nothing", () => {
  let failPrimary = false;
  const primary = readyHarness({ behavior: { setItem(key, value, values) {
    if (failPrimary && key === "digitalMikeyFounder") throw new Error("primary failed");
    values.set(key, value);
  } } });
  const record = createSituation(primary);
  failPrimary = true;
  assert.throws(() => createMove(primary, record.id), /primary failed/);
  assert.equal(Object.hasOwn(primary.api.founder, "candidateMove"), false);

  for (const result of [false, null, undefined]) {
    const harness = readyHarness(); const situationRecord = createSituation(harness);
    harness.api.CommanderSystem.save = () => result;
    assert.throws(() => createMove(harness, situationRecord.id), /not confirmed/);
    assert.equal(Object.hasOwn(harness.api.founder, "candidateMove"), false);
  }
  const missing = readyHarness({ commander: false }); missing.api.founder.situation = situation();
  assert.throws(() => createMove(missing, "situation_test_abc"), /persistence is unavailable/);
  const guarded = loadHarness({ initial: { digitalMikeyFounder: "{bad json" } });
  guarded.api.loadFounder(); guarded.localStorage.values.clear(); guarded.api.loadFounder();
  guarded.api.founder.situation = situation();
  assert.throws(() => guarded.api.CandidateMoveSystem.createCandidateMove({ situationId: "situation_test_abc", action: "Action" }), /refusing to overwrite/);
  assert.equal(Object.hasOwn(guarded.api.founder, "candidateMove"), false);
  const unsafe = readyHarness(); const unsafeSituation = createSituation(unsafe);
  Object.defineProperty(unsafe.api.founder, "candidateMove", { configurable: true, set() { throw new Error("setter"); } });
  const writes = unsafe.localStorage.operations.filter(([type]) => type === "set").length;
  assert.throws(() => createMove(unsafe, unsafeSituation.id), /already exists|cannot be published safely/);
  assert.equal(unsafe.localStorage.operations.filter(([type]) => type === "set").length, writes);
});

test("correction and withdrawal persistence failures preserve live reference, primary observation, and mirror degradation publish", () => {
  const harness = readyHarness(); const record = createSituation(harness); const created = createMove(harness, record.id); const live = harness.api.founder.candidateMove;
  harness.api.CommanderSystem.save = () => { throw new Error("persistence failed"); };
  assert.throws(() => harness.api.CandidateMoveSystem.correctCandidateMove({ id: created.id, expectedRevision: 1, action: "Changed" }));
  assert.equal(harness.api.founder.candidateMove, live);
  assert.throws(() => harness.api.CandidateMoveSystem.withdrawCandidateMove({ id: created.id, expectedRevision: 1 }));
  assert.equal(harness.api.founder.candidateMove, live);

  let observed;
  const mirror = readyHarness({ behavior: { setItem(key, value, values) { if (key === "digitalMikeyFounder") observed = mirror.api.founder.candidateMove; if (key === "founder") throw new Error("legacy failed"); values.set(key, value); } } });
  const mirrorSituation = createSituation(mirror); const saved = createMove(mirror, mirrorSituation.id);
  assert.equal(observed, undefined);
  assert.equal(mirror.api.founder.candidateMove.id, saved.id);
});

test("invalid histories and structural Situation relationships are unavailable without repair", () => {
  const invalids = [
    move([revision()], { schemaVersion: 2 }),
    move([revision(), revision({ revision: 2, action: "Changed", status: "withdrawn", provenance: { authority: "commander", operation: "correct" } })]),
    move([revision(), revision({ revision: 2, action: "Changed", provenance: { authority: "commander", operation: "correct" } }), revision({ revision: 3, action: "Changed", status: "withdrawn", provenance: { authority: "commander", operation: "withdraw" } }), revision({ revision: 4, action: "Again", provenance: { authority: "commander", operation: "correct" } })]),
    move([revision(), revision({ revision: 2, status: "withdrawn", provenance: { authority: "commander", operation: "withdraw" }, action: "Changed" })]),
  ];
  for (const candidateMove of invalids) {
    const harness = readyHarness({ initial: { digitalMikeyFounder: JSON.stringify({ situation: situation(), candidateMove }) } });
    const live = harness.api.founder.candidateMove;
    assert.equal(harness.api.CandidateMoveSystem.getCandidateMove().status, "unavailable");
    assert.equal(harness.api.founder.candidateMove, live);
  }
  const broken = readyHarness({ initial: { digitalMikeyFounder: JSON.stringify({ situation: { ...situation(), id: "situation_other_abc" }, candidateMove: move([revision()]) }) } });
  assert.equal(broken.api.CandidateMoveSystem.getCandidateMove().status, "unavailable");
});

test("reload, ordinary saves, artifact saves, identities, and firewall preserve Candidate Move boundaries", () => {
  const first = readyHarness({ memory: true });
  first.api.founder.memory.artifacts = { unrelated: { id: "artifact" } }; first.api.founder.profile = { strengths: ["Existing"] }; first.api.founder.missions = [{ id: "mission" }]; first.api.founder.developmentFocus = { id: "focus" };
  const refs = { founder: first.api.founder, memory: first.api.founder.memory, artifacts: first.api.founder.memory.artifacts, artifact: first.api.founder.memory.artifacts.unrelated, profile: first.api.founder.profile, missions: first.api.founder.missions, focus: first.api.founder.developmentFocus };
  const record = createSituation(first); const created = createMove(first, record.id);
  assert.equal(first.api.founder, refs.founder); assert.equal(first.api.founder.situation.id, record.id); assert.equal(first.api.founder.memory, refs.memory); assert.equal(first.api.founder.memory.artifacts, refs.artifacts); assert.equal(first.api.founder.memory.artifacts.unrelated, refs.artifact); assert.equal(first.api.founder.profile, refs.profile); assert.equal(first.api.founder.missions, refs.missions); assert.equal(first.api.founder.developmentFocus, refs.focus);
  assert.deepEqual(first.calls, { memory: 0, intelligence: 0, delivery: 0, notification: 0, refresh: 0 });
  first.api.saveFounder(); first.api.MemorySystem.saveArtifact({ type: "artifact", value: true });
  assert.equal(first.api.founder.candidateMove.id, created.id);
  const second = loadHarness({ initial: { digitalMikeyFounder: first.localStorage.values.get("digitalMikeyFounder") } }); second.api.loadFounder();
  assert.equal(second.api.getFounderStorageLoadStatus(), "loaded");
  assert.deepEqual(clone(second.api.CandidateMoveSystem.getCandidateMove().candidateMove), clone(first.api.founder.candidateMove));
});
