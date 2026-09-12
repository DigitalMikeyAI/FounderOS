const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const sources = Object.fromEntries([
  ["storage", "js/storage.js"], ["commander", "systems/commander.system.js"],
  ["situation", "systems/situation.system.js"], ["move", "systems/candidate-move.system.js"],
  ["hold", "systems/candidate-move-hold.system.js"], ["state", "systems/move-state.system.js"],
  ["dependency", "systems/candidate-move-dependency.system.js"],
  ["memory", "systems/memory.system.js"],
].map(([key, file]) => [key, fs.readFileSync(path.join(root, file), "utf8")]));

function clone(value) { return JSON.parse(JSON.stringify(value)); }
function storage(initial = {}, behavior = {}) {
  const values = new Map(Object.entries(initial)); const operations = [];
  return {
    get length() { return values.size; }, key(index) { return Array.from(values.keys())[index] || null; },
    getItem(key) { operations.push(["get", key]); return behavior.getItem ? behavior.getItem(key, values) : (values.has(key) ? values.get(key) : null); },
    setItem(key, value) { operations.push(["set", key, String(value)]); if (behavior.setItem) behavior.setItem(key, String(value), values); else values.set(key, String(value)); },
    removeItem(key) { values.delete(key); }, get values() { return values; }, operations,
  };
}
function load({ initial = {}, behavior = {}, commander = true, memory = false, statusApi = true } = {}) {
  const localStorage = storage(initial, behavior); const calls = { memory: 0, intelligence: 0, guidance: 0, briefing: 0, delivery: 0, notification: 0, refresh: 0 };
  const context = vm.createContext({ Date, Math, JSON, localStorage, sessionStorage: storage(), console: { log() {}, warn() {}, error() {} },
    MemorySystem: memory ? { saveArtifact() { calls.memory += 1; } } : undefined,
    MissionIntelligenceSystem: { process() { calls.intelligence += 1; } }, GuidanceSystem: { build() { calls.guidance += 1; } }, BriefingSystem: { build() { calls.briefing += 1; } }, CommunicationSystem: { deliver() { calls.delivery += 1; } }, showNotification() { calls.notification += 1; }, refreshSession() { calls.refresh += 1; },
  });
  vm.runInContext(sources.storage, context, { filename: "js/storage.js" });
  if (!statusApi) vm.runInContext("getFounderStorageLoadStatus = undefined;", context);
  if (commander) vm.runInContext(sources.commander, context, { filename: "systems/commander.system.js" });
  if (memory) vm.runInContext(sources.memory, context, { filename: "systems/memory.system.js" });
  for (const key of ["situation", "move", "hold", "dependency", "state"]) vm.runInContext(sources[key], context, { filename: key });
  vm.runInContext(";globalThis.__api={founder,loadFounder,saveFounder,getFounderStorageLoadStatus:typeof getFounderStorageLoadStatus==='function'?getFounderStorageLoadStatus:null,CommanderSystem:typeof CommanderSystem==='undefined'?null:CommanderSystem,MemorySystem:typeof MemorySystem==='undefined'?null:MemorySystem,SituationSystem,CandidateMoveSystem,CandidateMoveHoldSystem,CandidateMoveDependencySystem,MoveStateSystem};", context);
  return { api: context.__api, localStorage, calls };
}
function ready(options = {}) { const harness = load(options); harness.api.loadFounder(); return harness; }
function situation(harness) { return harness.api.SituationSystem.createSituation({ subject: "Customer financing", currentReality: "One corrected document remains." }); }
function move(harness, situationId) { return harness.api.CandidateMoveSystem.createCandidateMove({ situationId, action: "Send the corrected document." }); }
function setup(options = {}) { const harness = ready(options); const record = situation(harness); const candidateMove = move(harness, record.id); return { harness, record, candidateMove }; }
function holdRecord(overrides = {}) { return { schemaVersion: 1, id: "candidate_move_hold_test_abc", candidateMoveId: "candidate_move_test_abc", revisions: [{ revision: 1, status: "active", releaseCondition: { kind: "commander-release" }, provenance: { authority: "commander", operation: "create" }, recordedAt: "2026-09-12T12:00:00.000Z" }], ...overrides }; }
function situationRecord() { return { schemaVersion: 1, id: "situation_test_abc", revisions: [{ revision: 1, subject: "Customer financing", currentReality: "One corrected document remains.", carryStatus: "active", provenance: { authority: "commander", operation: "create" }, recordedAt: "2026-09-12T12:00:00.000Z" }] }; }
function moveRecord() { return { schemaVersion: 1, id: "candidate_move_test_abc", situationId: "situation_test_abc", revisions: [{ revision: 1, action: "Send the corrected document.", status: "active", provenance: { authority: "commander", operation: "create" }, recordedAt: "2026-09-12T12:00:00.000Z" }] }; }

test("Situation alone has no Move State; Candidate Move absent is not-applicable", () => {
  const harness = ready(); situation(harness);
  assert.deepEqual(clone(harness.api.MoveStateSystem.getMoveState()), { status: "not-applicable", reason: "candidate-move-absent" });
  assert.equal(Object.hasOwn(harness.api.founder, "moveState"), false);
});

test("active Candidate Move without Hold is clarify, while explicit Commander Hold derives hold with basis", () => {
  const { harness, candidateMove } = setup();
  assert.equal(harness.api.MoveStateSystem.getMoveState().state, "clarify");
  const hold = harness.api.CandidateMoveHoldSystem.createHold({ candidateMoveId: candidateMove.id });
  const state = harness.api.MoveStateSystem.getMoveState();
  assert.equal(hold.candidateMoveId, candidateMove.id);
  assert.equal(hold.revisions[0].releaseCondition.kind, "commander-release");
  assert.equal(state.state, "hold");
  assert.deepEqual(clone(state.basis), { kind: "hold", references: [{ type: "candidate-move-hold", id: hold.id, revision: 1 }] });
  assert.equal(Object.hasOwn(harness.api.founder, "moveState"), false);
});

test("release appends terminal history, returns clarify, and never implies actionable", () => {
  const { harness, candidateMove } = setup(); const created = harness.api.CandidateMoveHoldSystem.createHold({ candidateMoveId: candidateMove.id });
  const released = harness.api.CandidateMoveHoldSystem.releaseHold({ id: created.id, expectedRevision: 1 });
  assert.equal(released.revisions.length, 2); assert.equal(released.revisions[1].status, "released"); assert.equal(released.revisions[1].provenance.operation, "release");
  assert.equal(released.revisions[1].releaseCondition.kind, "commander-release");
  assert.equal(harness.api.MoveStateSystem.getMoveState().state, "clarify");
  assert.throws(() => harness.api.CandidateMoveHoldSystem.releaseHold({ id: created.id, expectedRevision: 2 }));
  assert.throws(() => harness.api.CandidateMoveHoldSystem.createHold({ candidateMoveId: candidateMove.id }), /already exists/);
});

test("Candidate Move and Situation lifecycles preserve Hold according to stable relationships", () => {
  const { harness, record, candidateMove } = setup(); const hold = harness.api.CandidateMoveHoldSystem.createHold({ candidateMoveId: candidateMove.id }); const holdRef = harness.api.founder.candidateMoveHold;
  harness.api.CandidateMoveSystem.correctCandidateMove({ id: candidateMove.id, expectedRevision: 1, action: "Send the complete corrected package." });
  assert.equal(harness.api.founder.candidateMoveHold, holdRef); assert.equal(harness.api.MoveStateSystem.getMoveState().state, "hold");
  harness.api.SituationSystem.correctSituation({ id: record.id, expectedRevision: 1, currentReality: "The lender is reviewing the corrected document." });
  harness.api.SituationSystem.closeSituation({ id: record.id, expectedRevision: 2 });
  assert.equal(harness.api.founder.candidateMoveHold, holdRef); assert.equal(harness.api.MoveStateSystem.getMoveState().state, "hold");
  harness.api.CandidateMoveSystem.withdrawCandidateMove({ id: candidateMove.id, expectedRevision: 2 });
  assert.equal(harness.api.founder.candidateMoveHold, holdRef);
  assert.deepEqual(clone(harness.api.MoveStateSystem.getMoveState()), { status: "not-applicable", reason: "candidate-move-withdrawn", candidateMoveId: candidateMove.id });
  assert.throws(() => harness.api.CandidateMoveHoldSystem.createHold({ candidateMoveId: candidateMove.id }), /already exists/);
  assert.equal(hold.id, holdRef.id);
});

test("status, malformed domain records, and broken relationships are unavailable rather than clarify", () => {
  const notLoaded = load(); assert.equal(notLoaded.api.MoveStateSystem.getMoveState().status, "unavailable");
  const failed = load({ initial: { digitalMikeyFounder: "{bad json" } }); failed.api.loadFounder(); assert.equal(failed.api.MoveStateSystem.getMoveState().reason, "founder-storage-failed");
  const missing = load({ statusApi: false }); assert.equal(missing.api.MoveStateSystem.getMoveState().status, "unavailable");
  const malformedHold = ready({ initial: { digitalMikeyFounder: JSON.stringify({ situation: situationRecord(), candidateMove: moveRecord(), candidateMoveHold: holdRecord({ schemaVersion: 2 }) }) } });
  assert.equal(malformedHold.api.MoveStateSystem.getMoveState().status, "unavailable");
  const broken = ready({ initial: { digitalMikeyFounder: JSON.stringify({ situation: { ...situationRecord(), id: "situation_other_abc" }, candidateMove: moveRecord(), candidateMoveHold: holdRecord() }) } });
  assert.equal(broken.api.MoveStateSystem.getMoveState().status, "unavailable");
});

test("Hold history validates completely and read APIs are detached with zero writes", () => {
  const invalids = [
    holdRecord({ revisions: [{ ...holdRecord().revisions[0], releaseCondition: { kind: "time" } }] }),
    holdRecord({ revisions: [...holdRecord().revisions, { revision: 2, status: "released", releaseCondition: { kind: "changed" }, provenance: { authority: "commander", operation: "release" }, recordedAt: "2026-09-12T13:00:00.000Z" }] }),
    holdRecord({ revisions: [...holdRecord().revisions, { revision: 2, status: "released", releaseCondition: { kind: "commander-release" }, provenance: { authority: "commander", operation: "release" }, recordedAt: "2026-09-12T13:00:00.000Z" }, { revision: 3, status: "active", releaseCondition: { kind: "commander-release" }, provenance: { authority: "commander", operation: "create" }, recordedAt: "2026-09-12T14:00:00.000Z" }] }),
  ];
  for (const candidateMoveHold of invalids) {
    const harness = ready({ initial: { digitalMikeyFounder: JSON.stringify({ situation: situationRecord(), candidateMove: moveRecord(), candidateMoveHold }) } });
    assert.equal(harness.api.CandidateMoveHoldSystem.getHold().status, "unavailable"); assert.equal(harness.api.MoveStateSystem.getMoveState().status, "unavailable");
  }
  const { harness, candidateMove } = setup(); harness.api.CandidateMoveHoldSystem.createHold({ candidateMoveId: candidateMove.id });
  let commanderSaves = 0; const originalSave = harness.api.CommanderSystem.save;
  harness.api.CommanderSystem.save = (...args) => { commanderSaves += 1; return originalSave(...args); };
  const before = harness.localStorage.operations.length; const hold = harness.api.CandidateMoveHoldSystem.getHold(); const history = harness.api.CandidateMoveHoldSystem.getHoldHistory(); const state = harness.api.MoveStateSystem.getMoveState();
  assert.equal(harness.localStorage.operations.length, before); hold.hold.revisions[0].status = "released"; history.revisions[0].status = "released";
  assert.equal(commanderSaves, 0); assert.equal(harness.api.founder.candidateMoveHold.revisions[0].status, "active"); assert.equal(state.state, "hold");
});

test("persistence failures, non-confirmation, PIH-1 guard, unsafe destination, primary observation, and mirror degradation are truthful", () => {
  let failPrimary = false; const primary = setup({ behavior: { setItem(key, value, values) { if (failPrimary && key === "digitalMikeyFounder") throw new Error("primary failed"); values.set(key, value); } } }); failPrimary = true;
  assert.throws(() => primary.harness.api.CandidateMoveHoldSystem.createHold({ candidateMoveId: primary.candidateMove.id }), /primary failed/); assert.equal(Object.hasOwn(primary.harness.api.founder, "candidateMoveHold"), false);
  for (const result of [false, null, undefined]) { const item = setup(); item.harness.api.CommanderSystem.save = () => result; assert.throws(() => item.harness.api.CandidateMoveHoldSystem.createHold({ candidateMoveId: item.candidateMove.id }), /not confirmed/); }
  const missing = ready({ commander: false }); missing.api.founder.situation = situationRecord(); missing.api.founder.candidateMove = moveRecord(); assert.throws(() => missing.api.CandidateMoveHoldSystem.createHold({ candidateMoveId: "candidate_move_test_abc" }), /persistence is unavailable/);
  const guarded = load({ initial: { digitalMikeyFounder: "{bad json" } }); guarded.api.loadFounder(); guarded.localStorage.values.clear(); guarded.api.loadFounder(); guarded.api.founder.situation = situationRecord(); guarded.api.founder.candidateMove = moveRecord(); assert.throws(() => guarded.api.CandidateMoveHoldSystem.createHold({ candidateMoveId: "candidate_move_test_abc" }), /refusing to overwrite/);
  const unsafe = setup(); Object.defineProperty(unsafe.harness.api.founder, "candidateMoveHold", { configurable: true, set() { throw new Error("setter"); } }); const writes = unsafe.harness.localStorage.operations.filter(([type]) => type === "set").length; assert.throws(() => unsafe.harness.api.CandidateMoveHoldSystem.createHold({ candidateMoveId: unsafe.candidateMove.id })); assert.equal(unsafe.harness.localStorage.operations.filter(([type]) => type === "set").length, writes);
  let failLegacy = false; let observed;
  const mirror = setup({ behavior: { setItem(key, value, values) {
    if (failLegacy && key === "digitalMikeyFounder") observed = mirror.harness.api.founder.candidateMoveHold;
    if (failLegacy && key === "founder") throw new Error("legacy failed");
    values.set(key, value);
  } } });
  failLegacy = true;
  const saved = mirror.harness.api.CandidateMoveHoldSystem.createHold({ candidateMoveId: mirror.candidateMove.id });
  assert.equal(observed, undefined); assert.equal(mirror.harness.api.founder.candidateMoveHold.id, saved.id);
});

test("release failure, reload, ordinary saves, identities, firewall, and elapsed time preserve Hold-only semantics", () => {
  const item = setup({ memory: true }); item.harness.api.founder.memory.artifacts = { unrelated: { id: "artifact" } }; item.harness.api.founder.profile = { strengths: ["Existing"] }; item.harness.api.founder.missions = [{ id: "mission" }]; item.harness.api.founder.developmentFocus = { id: "focus" };
  const refs = { founder: item.harness.api.founder, situation: item.harness.api.founder.situation, memory: item.harness.api.founder.memory, artifacts: item.harness.api.founder.memory.artifacts, artifact: item.harness.api.founder.memory.artifacts.unrelated, profile: item.harness.api.founder.profile, missions: item.harness.api.founder.missions, focus: item.harness.api.founder.developmentFocus };
  const hold = item.harness.api.CandidateMoveHoldSystem.createHold({ candidateMoveId: item.candidateMove.id }); const live = item.harness.api.founder.candidateMoveHold;
  item.harness.api.CommanderSystem.save = () => { throw new Error("release failed"); }; assert.throws(() => item.harness.api.CandidateMoveHoldSystem.releaseHold({ id: hold.id, expectedRevision: 1 })); assert.equal(item.harness.api.founder.candidateMoveHold, live);
  assert.equal(item.harness.api.founder, refs.founder); assert.equal(item.harness.api.founder.situation, refs.situation); assert.equal(item.harness.api.founder.memory, refs.memory); assert.equal(item.harness.api.founder.memory.artifacts, refs.artifacts); assert.equal(item.harness.api.founder.memory.artifacts.unrelated, refs.artifact); assert.equal(item.harness.api.founder.profile, refs.profile); assert.equal(item.harness.api.founder.missions, refs.missions); assert.equal(item.harness.api.founder.developmentFocus, refs.focus);
  assert.deepEqual(item.harness.calls, { memory: 0, intelligence: 0, guidance: 0, briefing: 0, delivery: 0, notification: 0, refresh: 0 }); assert.equal(Object.hasOwn(item.harness.api.founder, "moveState"), false);
  item.harness.api.CommanderSystem.save = (candidate) => { item.harness.api.saveFounder(candidate); return true; }; item.harness.api.saveFounder(); item.harness.api.MemorySystem.saveArtifact({ type: "artifact", value: true }); assert.equal(item.harness.api.founder.candidateMoveHold.id, hold.id);
  const later = item.harness.api.MoveStateSystem.getMoveState(); assert.equal(later.state, "hold");
  const second = load({ initial: { digitalMikeyFounder: item.harness.localStorage.values.get("digitalMikeyFounder") } }); second.api.loadFounder(); assert.equal(second.api.MoveStateSystem.getMoveState().state, "hold"); assert.deepEqual(clone(second.api.CandidateMoveHoldSystem.getHold().hold), clone(item.harness.api.founder.candidateMoveHold));
});
