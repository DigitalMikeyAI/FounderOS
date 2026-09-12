const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const source = Object.fromEntries(["js/storage.js", "systems/commander.system.js", "systems/situation.system.js", "systems/candidate-move.system.js", "systems/candidate-move-hold.system.js", "systems/candidate-move-dependency.system.js", "systems/move-state.system.js", "systems/memory.system.js"].map((file) => [file, fs.readFileSync(path.join(root, file), "utf8")]));
const clone = (value) => JSON.parse(JSON.stringify(value));
function makeStorage(initial = {}, behavior = {}) { const values = new Map(Object.entries(initial)); const operations = []; return { get length() { return values.size; }, key(i) { return Array.from(values.keys())[i] || null; }, getItem(key) { operations.push(["get", key]); return behavior.getItem ? behavior.getItem(key, values) : (values.has(key) ? values.get(key) : null); }, setItem(key, value) { operations.push(["set", key, String(value)]); if (behavior.setItem) behavior.setItem(key, String(value), values); else values.set(key, String(value)); }, removeItem(key) { values.delete(key); }, get values() { return values; }, operations }; }
function load({ initial = {}, behavior = {}, commander = true, memory = false, dependency = true, statusApi = true } = {}) {
  const localStorage = makeStorage(initial, behavior); const calls = { memory: 0, intelligence: 0, guidance: 0, briefing: 0, delivery: 0, notification: 0, refresh: 0 };
  const context = vm.createContext({ Date, Math, JSON, localStorage, sessionStorage: makeStorage(), console: { log() {}, warn() {}, error() {} }, MemorySystem: memory ? { saveArtifact() { calls.memory += 1; } } : undefined, MissionIntelligenceSystem: { process() { calls.intelligence += 1; } }, GuidanceSystem: { build() { calls.guidance += 1; } }, BriefingSystem: { build() { calls.briefing += 1; } }, CommunicationSystem: { deliver() { calls.delivery += 1; } }, showNotification() { calls.notification += 1; }, refreshSession() { calls.refresh += 1; } });
  vm.runInContext(source["js/storage.js"], context, { filename: "storage" }); if (!statusApi) vm.runInContext("getFounderStorageLoadStatus=undefined;", context);
  if (commander) vm.runInContext(source["systems/commander.system.js"], context, { filename: "commander" }); if (memory) vm.runInContext(source["systems/memory.system.js"], context, { filename: "memory" });
  for (const file of ["systems/situation.system.js", "systems/candidate-move.system.js", "systems/candidate-move-hold.system.js"]) vm.runInContext(source[file], context, { filename: file });
  if (dependency) vm.runInContext(source["systems/candidate-move-dependency.system.js"], context, { filename: "dependency" });
  vm.runInContext(source["systems/move-state.system.js"], context, { filename: "move-state" });
  vm.runInContext(";globalThis.__api={founder,loadFounder,saveFounder,getFounderStorageLoadStatus:typeof getFounderStorageLoadStatus==='function'?getFounderStorageLoadStatus:null,CommanderSystem:typeof CommanderSystem==='undefined'?null:CommanderSystem,MemorySystem:typeof MemorySystem==='undefined'?null:MemorySystem,SituationSystem,CandidateMoveSystem,CandidateMoveHoldSystem,CandidateMoveDependencySystem:typeof CandidateMoveDependencySystem==='undefined'?null:CandidateMoveDependencySystem,MoveStateSystem};", context);
  return { api: context.__api, localStorage, calls };
}
function ready(options = {}) { const h = load(options); h.api.loadFounder(); return h; }
function setup(options = {}) { const h = ready(options); const s = h.api.SituationSystem.createSituation({ subject: "Lender approval", currentReality: "Approval is pending." }); const m = h.api.CandidateMoveSystem.createCandidateMove({ situationId: s.id, action: "Send the final package." }); return { h, s, m }; }
function dep(overrides = {}) { return { schemaVersion: 1, id: "candidate_move_dependency_test_abc", candidateMoveId: "candidate_move_test_abc", revisions: [{ revision: 1, kind: "external-condition", description: "Waiting for lender approval.", status: "unresolved", provenance: { authority: "commander", operation: "create" }, recordedAt: "2026-09-12T12:00:00.000Z" }], ...overrides }; }
function situation() { return { schemaVersion: 1, id: "situation_test_abc", revisions: [{ revision: 1, subject: "Lender approval", currentReality: "Approval is pending.", carryStatus: "active", provenance: { authority: "commander", operation: "create" }, recordedAt: "2026-09-12T12:00:00.000Z" }] }; }
function move() { return { schemaVersion: 1, id: "candidate_move_test_abc", situationId: "situation_test_abc", revisions: [{ revision: 1, action: "Send the final package.", status: "active", provenance: { authority: "commander", operation: "create" }, recordedAt: "2026-09-12T12:00:00.000Z" }] }; }

test("active Candidate Move with absent Hold and Dependency is clarify; explicit unresolved Dependency derives waiting", () => {
  const { h, m } = setup(); assert.equal(h.api.MoveStateSystem.getMoveState().state, "clarify");
  const created = h.api.CandidateMoveDependencySystem.createDependency({ candidateMoveId: m.id, description: "  Waiting for lender approval.  " });
  const state = h.api.MoveStateSystem.getMoveState();
  assert.equal(created.revisions[0].description, "Waiting for lender approval."); assert.equal(state.state, "waiting");
  assert.deepEqual(clone(state.basis), { kind: "dependency", references: [{ type: "candidate-move-dependency", id: created.id, revision: 1 }] });
  assert.equal(state.candidateMoveId, m.id); assert.equal(state.candidateMoveRevision, 1); assert.equal(Object.hasOwn(h.api.founder, "moveState"), false);
});

test("correction and resolution preserve complete Dependency history and resolved never means actionable", () => {
  const { h, m } = setup(); const created = h.api.CandidateMoveDependencySystem.createDependency({ candidateMoveId: m.id, description: "Waiting for lender approval." }); const first = clone(created.revisions[0]);
  const corrected = h.api.CandidateMoveDependencySystem.correctDependency({ id: created.id, expectedRevision: 1, description: "Waiting for lender approval and customer signature." });
  assert.deepEqual(corrected.revisions[0], first); assert.equal(corrected.revisions[1].status, "unresolved");
  const resolved = h.api.CandidateMoveDependencySystem.resolveDependency({ id: created.id, expectedRevision: 2 });
  assert.equal(resolved.revisions[2].status, "resolved"); assert.equal(resolved.revisions[2].description, corrected.revisions[1].description); assert.equal(h.api.MoveStateSystem.getMoveState().state, "clarify");
  assert.throws(() => h.api.CandidateMoveDependencySystem.correctDependency({ id: created.id, expectedRevision: 3, description: "New blocker" })); assert.throws(() => h.api.CandidateMoveDependencySystem.resolveDependency({ id: created.id, expectedRevision: 3 })); assert.throws(() => h.api.CandidateMoveDependencySystem.createDependency({ candidateMoveId: m.id, description: "Second blocker" }), /already exists/);
});

test("Hold precedence is deterministic and malformed Dependency is never hidden", () => {
  const { h, m } = setup(); const dependency = h.api.CandidateMoveDependencySystem.createDependency({ candidateMoveId: m.id, description: "Waiting for lender approval." }); const hold = h.api.CandidateMoveHoldSystem.createHold({ candidateMoveId: m.id });
  assert.equal(h.api.MoveStateSystem.getMoveState().state, "hold"); h.api.CandidateMoveHoldSystem.releaseHold({ id: hold.id, expectedRevision: 1 }); assert.equal(h.api.MoveStateSystem.getMoveState().state, "waiting");
  h.api.CandidateMoveHoldSystem.getHold().hold; h.api.founder.candidateMoveHold = { ...h.api.founder.candidateMoveHold, revisions: [{ ...h.api.founder.candidateMoveHold.revisions[0] }] }; // retain released Hold validity
  h.api.founder.candidateMoveHold.revisions = [hold.revisions[0]]; // active Hold again for corruption-precedence test
  h.api.founder.candidateMoveDependency = { ...dependency, schemaVersion: 2 };
  assert.equal(h.api.MoveStateSystem.getMoveState().status, "unavailable");
});

test("Candidate Move and Situation lifecycles preserve Dependency while Move State follows active lifecycle", () => {
  const { h, s, m } = setup(); const dependency = h.api.CandidateMoveDependencySystem.createDependency({ candidateMoveId: m.id, description: "Waiting for lender approval." }); const ref = h.api.founder.candidateMoveDependency;
  h.api.CandidateMoveSystem.correctCandidateMove({ id: m.id, expectedRevision: 1, action: "Send the complete final package." }); assert.equal(h.api.founder.candidateMoveDependency, ref); assert.equal(h.api.MoveStateSystem.getMoveState().state, "waiting");
  h.api.SituationSystem.correctSituation({ id: s.id, expectedRevision: 1, currentReality: "Approval remains pending." }); h.api.SituationSystem.closeSituation({ id: s.id, expectedRevision: 2 }); assert.equal(h.api.founder.candidateMoveDependency, ref); assert.equal(h.api.MoveStateSystem.getMoveState().state, "waiting");
  h.api.CandidateMoveSystem.withdrawCandidateMove({ id: m.id, expectedRevision: 2 }); assert.equal(h.api.MoveStateSystem.getMoveState().status, "not-applicable"); const corrected = h.api.CandidateMoveDependencySystem.correctDependency({ id: dependency.id, expectedRevision: 1, description: "Waiting for final approval." }); assert.equal(corrected.revisions.length, 2); const resolved = h.api.CandidateMoveDependencySystem.resolveDependency({ id: dependency.id, expectedRevision: 2 }); assert.equal(resolved.revisions[2].status, "resolved");
});

test("validation, status truthfulness, reads, and required-reader availability fail closed", () => {
  const notLoaded = load(); assert.equal(notLoaded.api.MoveStateSystem.getMoveState().status, "unavailable"); const failed = load({ initial: { digitalMikeyFounder: "{bad json" } }); failed.api.loadFounder(); assert.equal(failed.api.MoveStateSystem.getMoveState().reason, "founder-storage-failed"); const missingStatus = load({ statusApi: false }); assert.equal(missingStatus.api.CandidateMoveDependencySystem.getDependency().status, "unavailable");
  const noReader = setup({ dependency: false }); assert.equal(noReader.h.api.MoveStateSystem.getMoveState().status, "unavailable");
  const { h, m } = setup(); assert.throws(() => h.api.CandidateMoveDependencySystem.createDependency({ candidateMoveId: m.id, description: " " })); assert.throws(() => h.api.CandidateMoveDependencySystem.createDependency({ candidateMoveId: m.id, description: "x".repeat(2001) })); assert.throws(() => h.api.CandidateMoveDependencySystem.createDependency({ candidateMoveId: "candidate_move_wrong_abc", description: "Waiting" }));
  const before = h.localStorage.operations.length; assert.equal(h.api.CandidateMoveDependencySystem.getDependency().status, "absent"); h.api.MoveStateSystem.getMoveState(); assert.equal(h.localStorage.operations.length, before);
});

test("Move State fails closed on unrecognized Hold and Dependency reader contracts", () => {
  const { h } = setup();
  const holdReader = h.api.CandidateMoveHoldSystem.getHold;
  const dependencyReader = h.api.CandidateMoveDependencySystem.getDependency;

  h.api.CandidateMoveHoldSystem.getHold = () => ({ status: "unexpected" });
  assert.deepEqual(clone(h.api.MoveStateSystem.getMoveState()), { status: "unavailable", reason: "candidate-move-hold-unrecognized" });

  h.api.CandidateMoveHoldSystem.getHold = holdReader;
  h.api.CandidateMoveDependencySystem.getDependency = () => ({ status: "unexpected" });
  assert.deepEqual(clone(h.api.MoveStateSystem.getMoveState()), { status: "unavailable", reason: "candidate-move-dependency-unrecognized" });

  h.api.CandidateMoveHoldSystem.getHold = () => ({ status: "available", current: { status: "active", id: "hold", revision: 1 } });
  assert.deepEqual(clone(h.api.MoveStateSystem.getMoveState()), { status: "unavailable", reason: "candidate-move-dependency-unrecognized" });

  h.api.CandidateMoveDependencySystem.getDependency = dependencyReader;
  h.api.CandidateMoveHoldSystem.getHold = () => ({ status: "available", current: { status: "unexpected" } });
  assert.deepEqual(clone(h.api.MoveStateSystem.getMoveState()), { status: "unavailable", reason: "candidate-move-hold-unrecognized" });

  h.api.CandidateMoveHoldSystem.getHold = () => ({ status: "absent" });
  h.api.CandidateMoveDependencySystem.getDependency = () => ({ status: "available", current: { status: "unexpected" } });
  assert.deepEqual(clone(h.api.MoveStateSystem.getMoveState()), { status: "unavailable", reason: "candidate-move-dependency-unrecognized" });

  h.api.CandidateMoveDependencySystem.getDependency = () => ({ status: "absent" });
  assert.equal(h.api.MoveStateSystem.getMoveState().state, "clarify");
  h.api.CandidateMoveHoldSystem.getHold = () => ({ status: "available", current: { status: "active", id: "hold", revision: 1 } });
  h.api.CandidateMoveDependencySystem.getDependency = () => ({ status: "available", current: { status: "unresolved", id: "dependency", revision: 1 } });
  assert.equal(h.api.MoveStateSystem.getMoveState().state, "hold");
  h.api.CandidateMoveHoldSystem.getHold = () => ({ status: "released" });
  assert.deepEqual(clone(h.api.MoveStateSystem.getMoveState()), { status: "unavailable", reason: "candidate-move-hold-unrecognized" });
  h.api.CandidateMoveHoldSystem.getHold = () => ({ status: "absent" });
  assert.equal(h.api.MoveStateSystem.getMoveState().state, "waiting");
});

test("malformed histories and broken relationships are unavailable and do not revive older truth", () => {
  const invalids = [dep({ schemaVersion: 2 }), dep({ revisions: [{ ...dep().revisions[0] }, { revision: 2, kind: "external-condition", description: "Changed", status: "resolved", provenance: { authority: "commander", operation: "correct" }, recordedAt: "2026-09-12T13:00:00.000Z" }] }), dep({ revisions: [{ ...dep().revisions[0] }, { revision: 2, kind: "external-condition", description: "Waiting for lender approval.", status: "resolved", provenance: { authority: "commander", operation: "resolve" }, recordedAt: "2026-09-12T13:00:00.000Z" }, { revision: 3, kind: "external-condition", description: "Again", status: "unresolved", provenance: { authority: "commander", operation: "correct" }, recordedAt: "2026-09-12T14:00:00.000Z" }] })];
  for (const candidateMoveDependency of invalids) { const h = ready({ initial: { digitalMikeyFounder: JSON.stringify({ situation: situation(), candidateMove: move(), candidateMoveDependency }) } }); assert.equal(h.api.CandidateMoveDependencySystem.getDependency().status, "unavailable"); assert.equal(h.api.MoveStateSystem.getMoveState().status, "unavailable"); }
  const broken = ready({ initial: { digitalMikeyFounder: JSON.stringify({ situation: { ...situation(), id: "situation_other_abc" }, candidateMove: move(), candidateMoveDependency: dep() }) } }); assert.equal(broken.api.CandidateMoveDependencySystem.getDependency().status, "unavailable");
});

test("persistence failures, publication ordering, reload, identities, and firewall preserve Dependency boundaries", () => {
  let failPrimary = false; const primary = setup({ behavior: { setItem(key, value, values) { if (failPrimary && key === "digitalMikeyFounder") throw new Error("primary failed"); values.set(key, value); } } }); failPrimary = true; assert.throws(() => primary.h.api.CandidateMoveDependencySystem.createDependency({ candidateMoveId: primary.m.id, description: "Waiting" })); assert.equal(Object.hasOwn(primary.h.api.founder, "candidateMoveDependency"), false);
  for (const result of [false, null, undefined]) { const item = setup(); item.h.api.CommanderSystem.save = () => result; assert.throws(() => item.h.api.CandidateMoveDependencySystem.createDependency({ candidateMoveId: item.m.id, description: "Waiting" })); }
  const missing = ready({ commander: false }); missing.api.founder.situation = situation(); missing.api.founder.candidateMove = move(); assert.throws(() => missing.api.CandidateMoveDependencySystem.createDependency({ candidateMoveId: "candidate_move_test_abc", description: "Waiting" }));
  let observed; let failLegacy = false; const mirror = setup({ behavior: { setItem(key, value, values) { if (failLegacy && key === "digitalMikeyFounder") observed = mirror.h.api.founder.candidateMoveDependency; if (failLegacy && key === "founder") throw new Error("legacy failed"); values.set(key, value); } } }); failLegacy = true; const saved = mirror.h.api.CandidateMoveDependencySystem.createDependency({ candidateMoveId: mirror.m.id, description: "Waiting" }); assert.equal(observed, undefined); assert.equal(mirror.h.api.founder.candidateMoveDependency.id, saved.id);
  const item = setup({ memory: true }); item.h.api.founder.memory.artifacts = { x: { id: "x" } }; item.h.api.founder.profile = { strengths: ["Existing"] }; const refs = { founder: item.h.api.founder, situation: item.h.api.founder.situation, move: item.h.api.founder.candidateMove, memory: item.h.api.founder.memory, artifacts: item.h.api.founder.memory.artifacts, profile: item.h.api.founder.profile }; const created = item.h.api.CandidateMoveDependencySystem.createDependency({ candidateMoveId: item.m.id, description: "Waiting" }); assert.equal(item.h.api.founder, refs.founder); assert.equal(item.h.api.founder.situation, refs.situation); assert.equal(item.h.api.founder.candidateMove, refs.move); assert.equal(item.h.api.founder.memory, refs.memory); assert.equal(item.h.api.founder.memory.artifacts, refs.artifacts); assert.equal(item.h.api.founder.profile, refs.profile); assert.deepEqual(item.h.calls, { memory: 0, intelligence: 0, guidance: 0, briefing: 0, delivery: 0, notification: 0, refresh: 0 }); item.h.api.saveFounder(); item.h.api.MemorySystem.saveArtifact({ type: "artifact", value: true }); assert.equal(item.h.api.founder.candidateMoveDependency.id, created.id); const second = load({ initial: { digitalMikeyFounder: item.h.localStorage.values.get("digitalMikeyFounder") } }); second.api.loadFounder(); assert.equal(second.api.MoveStateSystem.getMoveState().state, "waiting");
});

test("correction and resolution failures preserve Dependency; PIH-1 guard and unsafe destination prevent publication", () => {
  const { h, m } = setup(); const created = h.api.CandidateMoveDependencySystem.createDependency({ candidateMoveId: m.id, description: "Waiting" }); const live = h.api.founder.candidateMoveDependency;
  h.api.CommanderSystem.save = () => { throw new Error("persistence failed"); };
  assert.throws(() => h.api.CandidateMoveDependencySystem.correctDependency({ id: created.id, expectedRevision: 1, description: "Changed" })); assert.equal(h.api.founder.candidateMoveDependency, live);
  assert.throws(() => h.api.CandidateMoveDependencySystem.resolveDependency({ id: created.id, expectedRevision: 1 })); assert.equal(h.api.founder.candidateMoveDependency, live);
  const guarded = load({ initial: { digitalMikeyFounder: "{bad json" } }); guarded.api.loadFounder(); guarded.localStorage.values.clear(); guarded.api.loadFounder(); guarded.api.founder.situation = situation(); guarded.api.founder.candidateMove = move();
  assert.throws(() => guarded.api.CandidateMoveDependencySystem.createDependency({ candidateMoveId: "candidate_move_test_abc", description: "Waiting" }), /refusing to overwrite/);
  const unsafe = setup(); Object.defineProperty(unsafe.h.api.founder, "candidateMoveDependency", { configurable: true, set() { throw new Error("setter"); } }); const writes = unsafe.h.localStorage.operations.filter(([type]) => type === "set").length;
  assert.throws(() => unsafe.h.api.CandidateMoveDependencySystem.createDependency({ candidateMoveId: unsafe.m.id, description: "Waiting" })); assert.equal(unsafe.h.localStorage.operations.filter(([type]) => type === "set").length, writes);
});
