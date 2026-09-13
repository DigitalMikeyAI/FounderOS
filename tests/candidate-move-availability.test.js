const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(__dirname, "..");
const files = ["js/storage.js", "systems/commander.system.js", "systems/situation.system.js", "systems/candidate-move.system.js", "systems/candidate-move-hold.system.js", "systems/candidate-move-dependency.system.js", "systems/candidate-move-availability.system.js", "systems/move-state.system.js", "systems/memory.system.js"];
const source = Object.fromEntries(files.map((file) => [file, fs.readFileSync(path.join(root, file), "utf8")]));
const clone = (value) => JSON.parse(JSON.stringify(value));
function makeStorage(initial = {}, behavior = {}) { const values = new Map(Object.entries(initial)); const operations = []; return { get length() { return values.size; }, key(i) { return Array.from(values.keys())[i] || null; }, getItem(key) { operations.push(["get", key]); return behavior.getItem ? behavior.getItem(key, values) : (values.has(key) ? values.get(key) : null); }, setItem(key, value) { operations.push(["set", key, String(value)]); if (behavior.setItem) behavior.setItem(key, String(value), values); else values.set(key, String(value)); }, removeItem(key) { values.delete(key); }, get values() { return values; }, operations }; }
function load({ initial = {}, behavior = {}, commander = true, memory = false, availability = true } = {}) { const localStorage = makeStorage(initial, behavior); const calls = { memory: 0, intelligence: 0, guidance: 0, briefing: 0, delivery: 0, notification: 0, refresh: 0 }; const context = vm.createContext({ Date, Math, JSON, localStorage, sessionStorage: makeStorage(), console: { log() {}, warn() {}, error() {} }, MemorySystem: memory ? { saveArtifact() { calls.memory += 1; } } : undefined, MissionIntelligenceSystem: { process() { calls.intelligence += 1; } }, GuidanceSystem: { build() { calls.guidance += 1; } }, BriefingSystem: { build() { calls.briefing += 1; } }, CommunicationSystem: { deliver() { calls.delivery += 1; } }, showNotification() { calls.notification += 1; }, refreshSession() { calls.refresh += 1; } }); vm.runInContext(source["js/storage.js"], context); if (commander) vm.runInContext(source["systems/commander.system.js"], context); if (memory) vm.runInContext(source["systems/memory.system.js"], context); for (const file of files.slice(2, 6)) vm.runInContext(source[file], context); if (availability) vm.runInContext(source["systems/candidate-move-availability.system.js"], context); vm.runInContext(source["systems/move-state.system.js"], context); vm.runInContext(";globalThis.__api={founder,loadFounder,saveFounder,CommanderSystem:typeof CommanderSystem==='undefined'?null:CommanderSystem,MemorySystem:typeof MemorySystem==='undefined'?null:MemorySystem,SituationSystem,CandidateMoveSystem,CandidateMoveHoldSystem,CandidateMoveDependencySystem,CandidateMoveAvailabilitySystem:typeof CandidateMoveAvailabilitySystem==='undefined'?null:CandidateMoveAvailabilitySystem,MoveStateSystem};", context); return { api: context.__api, localStorage, calls }; }
function setup(options = {}) { const h = load(options); h.api.loadFounder(); const s = h.api.SituationSystem.createSituation({ subject: "Approval", currentReality: "Approval is pending." }); const m = h.api.CandidateMoveSystem.createCandidateMove({ situationId: s.id, action: "Send the package." }); return { h, s, m }; }
function confirm(h, s, m, text = "I checked the required execution conditions.") { return h.api.CandidateMoveAvailabilitySystem.confirmAvailability({ candidateMoveId: m.id, expectedCandidateMoveRevision: h.api.CandidateMoveSystem.getCandidateMove().current.revision, expectedSituationRevision: h.api.SituationSystem.getSituation().current.revision, conditionsConfirmed: text }); }

test("current explicit Availability derives actionable; absence derives clarify", () => {
  const { h, s, m } = setup(); assert.equal(h.api.MoveStateSystem.getMoveState().state, "clarify");
  const availability = confirm(h, s, m); const state = h.api.MoveStateSystem.getMoveState();
  assert.equal(state.state, "actionable"); assert.deepEqual(clone(state.basis), { kind: "availability", references: [{ type: "candidate-move-availability", id: availability.id, revision: 1 }] }); assert.equal(state.candidateMoveId, m.id); assert.equal(state.candidateMoveRevision, 1); assert.equal(availability.revisions[0].assertion.conditionsConfirmed, "I checked the required execution conditions.");
});

test("Hold and Dependency suppress Availability without mutating it", () => {
  const { h, s, m } = setup(); const availability = confirm(h, s, m); const ref = h.api.founder.candidateMoveAvailability;
  const hold = h.api.CandidateMoveHoldSystem.createHold({ candidateMoveId: m.id }); assert.equal(h.api.MoveStateSystem.getMoveState().state, "hold"); assert.equal(h.api.founder.candidateMoveAvailability, ref);
  h.api.CandidateMoveHoldSystem.releaseHold({ id: hold.id, expectedRevision: 1 }); h.api.CandidateMoveDependencySystem.createDependency({ candidateMoveId: m.id, description: "Waiting for approval." }); assert.equal(h.api.MoveStateSystem.getMoveState().state, "waiting"); assert.equal(h.api.founder.candidateMoveAvailability, ref);
  assert.equal(availability.id, ref.id);
});

test("Candidate Move and Situation revisions make Availability non-current until explicit reconfirmation", () => {
  const { h, s, m } = setup(); const availability = confirm(h, s, m); const ref = h.api.founder.candidateMoveAvailability;
  h.api.CandidateMoveSystem.correctCandidateMove({ id: m.id, expectedRevision: 1, action: "Send the complete package." }); assert.equal(h.api.MoveStateSystem.getMoveState().state, "clarify"); assert.equal(h.api.founder.candidateMoveAvailability, ref);
  const reconfirmed = h.api.CandidateMoveAvailabilitySystem.reconfirmAvailability({ id: availability.id, expectedRevision: 1, expectedCandidateMoveRevision: 2, expectedSituationRevision: 1, conditionsConfirmed: "I rechecked the package conditions." }); assert.equal(reconfirmed.revisions.length, 2); assert.equal(h.api.MoveStateSystem.getMoveState().state, "actionable");
  h.api.SituationSystem.correctSituation({ id: s.id, expectedRevision: 1, currentReality: "Approval remains pending." }); assert.equal(h.api.MoveStateSystem.getMoveState().state, "clarify");
  const current = h.api.CandidateMoveAvailabilitySystem.reconfirmAvailability({ id: availability.id, expectedRevision: 2, expectedCandidateMoveRevision: 2, expectedSituationRevision: 2, conditionsConfirmed: "I rechecked after the situation update." }); assert.equal(current.revisions.length, 3); assert.equal(h.api.MoveStateSystem.getMoveState().state, "actionable");
});

test("reconfirm no-op, withdrawal, and reconfirmation append only when explicit lifecycle requires it", () => {
  const { h, s, m } = setup(); const availability = confirm(h, s, m); const writes = h.localStorage.operations.filter(([type]) => type === "set").length;
  const duplicate = h.api.CandidateMoveAvailabilitySystem.reconfirmAvailability({ id: availability.id, expectedRevision: 1, expectedCandidateMoveRevision: 1, expectedSituationRevision: 1, conditionsConfirmed: "I checked the required execution conditions." }); assert.equal(duplicate.revisions.length, 1); assert.equal(h.localStorage.operations.filter(([type]) => type === "set").length, writes);
  const withdrawn = h.api.CandidateMoveAvailabilitySystem.withdrawAvailability({ id: availability.id, expectedRevision: 1 }); assert.equal(withdrawn.revisions[1].status, "withdrawn"); assert.deepEqual(withdrawn.revisions[1].assertion, availability.revisions[0].assertion); assert.equal(h.api.MoveStateSystem.getMoveState().state, "clarify");
  const renewed = h.api.CandidateMoveAvailabilitySystem.reconfirmAvailability({ id: availability.id, expectedRevision: 2, expectedCandidateMoveRevision: 1, expectedSituationRevision: 1, conditionsConfirmed: "I checked the required execution conditions." }); assert.equal(renewed.revisions.length, 3); assert.equal(h.api.MoveStateSystem.getMoveState().state, "actionable");
});

test("withdrawn Candidate Move is not-applicable and availability withdrawal remains explicit", () => {
  const { h, s, m } = setup(); const availability = confirm(h, s, m); h.api.CandidateMoveSystem.withdrawCandidateMove({ id: m.id, expectedRevision: 1 }); assert.equal(h.api.MoveStateSystem.getMoveState().status, "not-applicable");
  assert.throws(() => h.api.CandidateMoveAvailabilitySystem.confirmAvailability({ candidateMoveId: m.id, expectedCandidateMoveRevision: 2, expectedSituationRevision: 1, conditionsConfirmed: "Checked" })); assert.throws(() => h.api.CandidateMoveAvailabilitySystem.reconfirmAvailability({ id: availability.id, expectedRevision: 1, expectedCandidateMoveRevision: 2, expectedSituationRevision: 1, conditionsConfirmed: "Checked" }));
  assert.equal(h.api.CandidateMoveAvailabilitySystem.withdrawAvailability({ id: availability.id, expectedRevision: 1 }).revisions[1].status, "withdrawn");
});

test("Availability fails closed for invalid history, missing reader, and persistence failures", () => {
  const missing = setup({ availability: false }); assert.equal(missing.h.api.MoveStateSystem.getMoveState().status, "unavailable");
  const { h, m } = setup(); assert.throws(() => h.api.CandidateMoveAvailabilitySystem.confirmAvailability({ candidateMoveId: m.id, expectedCandidateMoveRevision: 1, expectedSituationRevision: 1, conditionsConfirmed: " " })); assert.throws(() => h.api.CandidateMoveAvailabilitySystem.confirmAvailability({ candidateMoveId: m.id, expectedCandidateMoveRevision: 1, expectedSituationRevision: 1, conditionsConfirmed: "x".repeat(2001) }));
  let fail = false; const failing = setup({ behavior: { setItem(key, value, values) { if (fail && key === "digitalMikeyFounder") throw new Error("primary failed"); values.set(key, value); } } }); fail = true; assert.throws(() => confirm(failing.h, failing.s, failing.m), /primary failed/); assert.equal(Object.hasOwn(failing.h.api.founder, "candidateMoveAvailability"), false);
});

test("Move State requires an exact Availability currentness boolean after no-blocker reader validation", () => {
  const { h } = setup(); const getHold = h.api.CandidateMoveHoldSystem.getHold; const getDependency = h.api.CandidateMoveDependencySystem.getDependency; const getAvailability = h.api.CandidateMoveAvailabilitySystem.getAvailability;
  h.api.CandidateMoveHoldSystem.getHold = () => ({ status: "absent" }); h.api.CandidateMoveDependencySystem.getDependency = () => ({ status: "absent" });
  for (const isCurrent of [undefined, null, "true", 1, {}]) {
    h.api.CandidateMoveAvailabilitySystem.getAvailability = () => ({ status: "available", current: { status: "confirmed", isCurrent } });
    assert.deepEqual(clone(h.api.MoveStateSystem.getMoveState()), { status: "unavailable", reason: "candidate-move-availability-unrecognized" });
  }
  h.api.CandidateMoveAvailabilitySystem.getAvailability = () => ({ status: "available", current: { status: "confirmed", isCurrent: false } }); assert.equal(h.api.MoveStateSystem.getMoveState().state, "clarify");
  h.api.CandidateMoveAvailabilitySystem.getAvailability = () => ({ status: "available", current: { status: "confirmed", isCurrent: true, id: "availability", revision: 1 } }); assert.equal(h.api.MoveStateSystem.getMoveState().state, "actionable");
  h.api.CandidateMoveAvailabilitySystem.getAvailability = getAvailability; h.api.CandidateMoveHoldSystem.getHold = getHold; h.api.CandidateMoveDependencySystem.getDependency = getDependency;
});

test("Hold and Waiting short-circuit missing or corrupt Availability without consultation", () => {
  const { h, s, m } = setup(); const availability = confirm(h, s, m); const getAvailability = h.api.CandidateMoveAvailabilitySystem.getAvailability;
  h.api.CandidateMoveAvailabilitySystem.getAvailability = () => { throw new Error("must not read availability"); };
  h.api.CandidateMoveHoldSystem.createHold({ candidateMoveId: m.id }); assert.equal(h.api.MoveStateSystem.getMoveState().state, "hold");
  h.api.CandidateMoveHoldSystem.releaseHold({ id: h.api.founder.candidateMoveHold.id, expectedRevision: 1 }); h.api.CandidateMoveDependencySystem.createDependency({ candidateMoveId: m.id, description: "Waiting for approval." }); assert.equal(h.api.MoveStateSystem.getMoveState().state, "waiting");
  h.api.CandidateMoveAvailabilitySystem.getAvailability = getAvailability; assert.equal(availability.id, h.api.founder.candidateMoveAvailability.id);
});

test("closed Situation reconfirmation and valid historical bindings follow explicit revision currentness", () => {
  const { h, s, m } = setup(); const availability = confirm(h, s, m); h.api.SituationSystem.closeSituation({ id: s.id, expectedRevision: 1 }); assert.equal(h.api.MoveStateSystem.getMoveState().state, "clarify");
  const reconfirmed = h.api.CandidateMoveAvailabilitySystem.reconfirmAvailability({ id: availability.id, expectedRevision: 1, expectedCandidateMoveRevision: 1, expectedSituationRevision: 2, conditionsConfirmed: "I rechecked conditions for the closed Situation." }); assert.equal(reconfirmed.revisions.length, 2); assert.equal(h.api.MoveStateSystem.getMoveState().state, "actionable");
  h.api.founder.candidateMoveAvailability.revisions[1].assertion.candidateMoveRevision = 1; assert.equal(h.api.CandidateMoveAvailabilitySystem.getAvailability().current.isCurrent, true);
  h.api.CandidateMoveSystem.correctCandidateMove({ id: m.id, expectedRevision: 1, action: "Send the corrected package." }); assert.equal(h.api.CandidateMoveAvailabilitySystem.getAvailability().current.isCurrent, false); assert.equal(h.api.MoveStateSystem.getMoveState().state, "clarify");
  h.api.founder.candidateMoveAvailability.revisions[1].assertion.candidateMoveRevision = 999; assert.equal(h.api.CandidateMoveAvailabilitySystem.getAvailability().status, "unavailable");
});

test("Availability malformed newest revision and confirmation failures preserve publication truthfully", () => {
  const { h, s, m } = setup(); const availability = confirm(h, s, m); h.api.founder.candidateMoveAvailability.revisions.push({ revision: 2, status: "confirmed", assertion: { ...availability.revisions[0].assertion, conditionsConfirmed: "" }, provenance: { authority: "commander", operation: "reconfirm" }, recordedAt: new Date().toISOString() }); assert.equal(h.api.CandidateMoveAvailabilitySystem.getAvailability().status, "unavailable");
  for (const result of [false, null, undefined]) { const item = setup(); item.h.api.CommanderSystem.save = () => result; assert.throws(() => confirm(item.h, item.s, item.m), /not confirmed/); assert.equal(Object.hasOwn(item.h.api.founder, "candidateMoveAvailability"), false); }
  const failures = setup(); const saved = confirm(failures.h, failures.s, failures.m); const live = failures.h.api.founder.candidateMoveAvailability; failures.h.api.CommanderSystem.save = () => { throw new Error("persistence failed"); };
  assert.throws(() => failures.h.api.CandidateMoveAvailabilitySystem.reconfirmAvailability({ id: saved.id, expectedRevision: 1, expectedCandidateMoveRevision: 1, expectedSituationRevision: 1, conditionsConfirmed: "Rechecked." })); assert.equal(failures.h.api.founder.candidateMoveAvailability, live);
  assert.throws(() => failures.h.api.CandidateMoveAvailabilitySystem.withdrawAvailability({ id: saved.id, expectedRevision: 1 })); assert.equal(failures.h.api.founder.candidateMoveAvailability, live);
});

test("Availability PIH-1 guard, unsafe publication, primary observation, and legacy mirror degradation are explicit", () => {
  const guarded = load({ initial: { digitalMikeyFounder: "{bad json" } }); guarded.api.loadFounder(); guarded.localStorage.values.clear(); guarded.api.loadFounder(); guarded.api.founder.situation = { schemaVersion: 1, id: "situation_test_abc", revisions: [{ revision: 1, subject: "Approval", currentReality: "Pending.", carryStatus: "active", provenance: { authority: "commander", operation: "create" }, recordedAt: "2026-09-12T12:00:00.000Z" }] }; guarded.api.founder.candidateMove = { schemaVersion: 1, id: "candidate_move_test_abc", situationId: "situation_test_abc", revisions: [{ revision: 1, action: "Send.", status: "active", provenance: { authority: "commander", operation: "create" }, recordedAt: "2026-09-12T12:00:00.000Z" }] }; assert.throws(() => guarded.api.CandidateMoveAvailabilitySystem.confirmAvailability({ candidateMoveId: "candidate_move_test_abc", expectedCandidateMoveRevision: 1, expectedSituationRevision: 1, conditionsConfirmed: "Checked." }), /refusing to overwrite/);
  const unsafe = setup(); Object.defineProperty(unsafe.h.api.founder, "candidateMoveAvailability", { configurable: true, set() { throw new Error("setter"); } }); const writes = unsafe.h.localStorage.operations.filter(([type]) => type === "set").length; assert.throws(() => confirm(unsafe.h, unsafe.s, unsafe.m)); assert.equal(unsafe.h.localStorage.operations.filter(([type]) => type === "set").length, writes);
  let observe; let failLegacy = false; const mirror = setup({ behavior: { setItem(key, value, values) { if (failLegacy && key === "digitalMikeyFounder") observe = mirror.h.api.founder.candidateMoveAvailability; if (failLegacy && key === "founder") throw new Error("legacy failed"); values.set(key, value); } } }); failLegacy = true; const saved = confirm(mirror.h, mirror.s, mirror.m); assert.equal(observe, undefined); assert.equal(mirror.h.api.founder.candidateMoveAvailability.id, saved.id);
});

test("Availability read/persistence/reload preserve identity and firewall boundaries", () => {
  const { h, s, m } = setup({ memory: true }); h.api.founder.memory.artifacts = { artifact: { id: "a" } }; h.api.founder.profile = { strengths: ["Existing"] }; const refs = { founder: h.api.founder, situation: h.api.founder.situation, move: h.api.founder.candidateMove, memory: h.api.founder.memory, artifacts: h.api.founder.memory.artifacts, profile: h.api.founder.profile };
  const availability = confirm(h, s, m); const before = h.localStorage.operations.length; const read = h.api.CandidateMoveAvailabilitySystem.getAvailability(); read.availability.revisions[0].status = "withdrawn"; h.api.MoveStateSystem.getMoveState(); assert.equal(h.localStorage.operations.length, before); assert.equal(h.api.founder.candidateMoveAvailability.revisions[0].status, "confirmed");
  assert.equal(h.api.founder, refs.founder); assert.equal(h.api.founder.situation, refs.situation); assert.equal(h.api.founder.candidateMove, refs.move); assert.equal(h.api.founder.memory, refs.memory); assert.equal(h.api.founder.memory.artifacts, refs.artifacts); assert.equal(h.api.founder.profile, refs.profile); assert.deepEqual(h.calls, { memory: 0, intelligence: 0, guidance: 0, briefing: 0, delivery: 0, notification: 0, refresh: 0 }); assert.equal(Object.hasOwn(h.api.founder, "moveState"), false);
  h.api.saveFounder(); h.api.MemorySystem.saveArtifact({ type: "artifact", value: true }); const second = load({ initial: { digitalMikeyFounder: h.localStorage.values.get("digitalMikeyFounder") } }); second.api.loadFounder(); assert.equal(second.api.MoveStateSystem.getMoveState().state, "actionable"); assert.equal(second.api.CandidateMoveAvailabilitySystem.getAvailability().current.id, availability.id);
});
