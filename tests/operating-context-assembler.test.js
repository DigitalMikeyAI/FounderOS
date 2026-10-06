const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const file = path.join(root, "systems", "operating-context-assembler.system.js");
const source = fs.readFileSync(file, "utf8");
const asOf = "2026-10-02T12:00:00.000Z";
const recordedAt = "2026-09-30T12:00:00.000Z";
const clone = (value) => JSON.parse(JSON.stringify(value));

function states() {
  return {
    situation: { status: "available", situation: { revisions: [{ revision: 1, recordedAt }] }, current: { id: "situation_test_aaa", revision: 1, subject: "Customer approval", currentReality: "The revised package is awaiting approval.", carryStatus: "active" } },
    move: { status: "available", candidateMove: { revisions: [{ revision: 1, recordedAt }] }, current: { id: "candidate_move_test_aaa", situationId: "situation_test_aaa", revision: 1, action: "Send the revised package.", status: "active" } },
    hold: { status: "absent", hold: null },
    dependency: { status: "absent", dependency: null },
    availability: { status: "absent", availability: null },
    commitments: { status: "absent", commitments: null },
    routines: { status: "absent" },
    moveState: { status: "available", state: "clarify", candidateMoveId: "candidate_move_test_aaa", candidateMoveRevision: 1, basis: { kind: "insufficient-operating-truth", references: [] } },
  };
}

function harness(values = states(), DateClass = Date) {
  const calls = { situation: 0, move: 0, hold: 0, dependency: 0, availability: 0, commitments: 0, routines: 0, moveState: 0 };
  const runtime = vm.createContext({
    Date: DateClass, JSON,
    SituationSystem: { getSituation() { calls.situation += 1; return values.situation; } },
    CandidateMoveSystem: { getCandidateMove() { calls.move += 1; return values.move; } },
    CandidateMoveHoldSystem: { getHold() { calls.hold += 1; return values.hold; } },
    CandidateMoveDependencySystem: { getDependency() { calls.dependency += 1; return values.dependency; } },
    CandidateMoveAvailabilitySystem: { getAvailability() { calls.availability += 1; return values.availability; } },
    CandidateMoveCommitmentSystem: { getCommitments() { calls.commitments += 1; return values.commitments; } },
    CandidateMoveRoutineSystem: { getRoutines() { calls.routines += 1; return values.routines; } },
    MoveStateSystem: { getMoveState() { calls.moveState += 1; return values.moveState; } },
  });
  vm.runInContext(source, runtime, { filename: file });
  const api = vm.runInContext("OperatingContextAssembler", runtime);
  return { api, values, calls, runtime };
}

function assemble(h, request = { requestType: "situation-explanation", asOf }) {
  return clone(h.api.assemble(request));
}

test("public API exists, request validation is exact, canonical, and performs zero reads on rejection", () => {
  const h = harness();
  assert.equal(typeof h.api.assemble, "function");
  assert.equal(typeof h.api.validateContext, "function");
  const invalid = [undefined, null, [], {}, { requestType: "situation-explanation" }, { asOf },
    { requestType: "other", asOf }, { requestType: "situation-explanation", asOf: "2026-10-02T12:00:00Z" },
    { requestType: "situation-explanation", asOf: "2026-10-02T12:00:00.000+00:00" },
    { requestType: "situation-explanation", asOf: "2026-02-30T12:00:00.000Z" },
    { requestType: "situation-explanation", asOf: 1 }, { requestType: "situation-explanation", asOf, extra: true }];
  for (const request of invalid) assert.throws(() => h.api.assemble(request), /invalid/);
  assert.deepEqual(h.calls, { situation: 0, move: 0, hold: 0, dependency: 0, availability: 0, commitments: 0, routines: 0, moveState: 0 });
});

test("assembly is deterministic, deeply detached, minimal, and uses no implicit clock", () => {
  class ExplicitDate extends Date {
    constructor(...args) { if (args.length === 0) throw new Error("implicit clock"); super(...args); }
    static now() { throw new Error("implicit clock"); }
  }
  const h = harness(states(), ExplicitDate); const before = clone(h.values);
  const first = assemble(h); const second = assemble(h);
  assert.deepEqual(first, second); assert.equal(first.status, "available");
  first.authoritative.situation.facts[0].data.currentReality = "mutated";
  first.authoritative.candidateMove.facts[0].reference.relationships.situationId = "mutated";
  assert.deepEqual(h.values, before);
  assert.equal(JSON.stringify(second).includes("revisions"), false);
  assert.doesNotMatch(JSON.stringify(second), /planned|performance|action.?result|attention|briefing|profile|memory|mission|priority|urgency|recommendation/i);
});

test("Situation absence and unavailability preserve mandatory scope semantics without dependent reads", () => {
  const absent = states(); absent.situation = { status: "absent", situation: null };
  const a = harness(absent); const known = assemble(a);
  assert.equal(known.status, "available"); assert.equal(known.scope.situationId, null);
  assert.equal(known.authoritative.situation.status, "absent");
  for (const slot of [known.authoritative.candidateMove, known.authoritative.hold, known.authoritative.dependency, known.authoritative.availability, known.authoritative.commitment, known.authoritative.routine, known.derived.moveState]) assert.equal(slot.status, "not-applicable");
  assert.deepEqual(a.calls, { situation: 1, move: 0, hold: 0, dependency: 0, availability: 0, commitments: 0, routines: 0, moveState: 0 });
  const unavailable = states(); unavailable.situation = { status: "unavailable", reason: "situation-corrupt" };
  const u = harness(unavailable); const failed = assemble(u);
  assert.equal(failed.status, "unavailable"); assert.deepEqual(failed.issues, [{ sourceType: "situation", status: "unavailable", reason: "situation-corrupt" }]);
  assert.equal(u.calls.move, 0);
});

test("Candidate Move absence, unavailability, and terminal lifecycle remain distinct", () => {
  const absent = states(); absent.move = { status: "absent", candidateMove: null };
  const known = assemble(harness(absent)); assert.equal(known.status, "available");
  assert.equal(known.authoritative.candidateMove.status, "absent"); assert.equal(known.authoritative.hold.status, "not-applicable");
  const unavailable = states(); unavailable.move = { status: "unavailable", reason: "candidate-move-corrupt" };
  const failed = assemble(harness(unavailable)); assert.equal(failed.status, "unavailable"); assert.equal(failed.authoritative.candidateMove.status, "unavailable");
  const withdrawn = states(); withdrawn.move.current.status = "withdrawn"; withdrawn.moveState = { status: "not-applicable", reason: "candidate-move-withdrawn", candidateMoveId: withdrawn.move.current.id };
  const terminal = assemble(harness(withdrawn));
  assert.equal(terminal.authoritative.candidateMove.facts[0].data.status, "withdrawn"); assert.equal(terminal.derived.moveState.status, "not-applicable");
});

test("optional statuses stay absent, unavailable, available-empty, or available-terminal without inference", () => {
  const values = states();
  values.hold = { status: "available", hold: { revisions: [{ revision: 2, recordedAt }] }, current: { id: "candidate_move_hold_test_aaa", candidateMoveId: values.move.current.id, revision: 2, status: "released" } };
  values.dependency = { status: "available", dependency: { revisions: [{ revision: 2, recordedAt }] }, current: { id: "candidate_move_dependency_test_aaa", candidateMoveId: values.move.current.id, revision: 2, description: "Approval was required.", status: "resolved" } };
  values.availability = { status: "unavailable", reason: "availability-corrupt" };
  values.commitments = { status: "available", commitments: { records: [] }, records: [] };
  values.routines = { status: "available", routines: [] };
  const result = assemble(harness(values));
  assert.equal(result.status, "partial"); assert.equal(result.authoritative.hold.facts[0].data.status, "released");
  assert.equal(result.authoritative.dependency.facts[0].data.status, "resolved");
  assert.equal(result.authoritative.availability.status, "unavailable");
  assert.equal(result.authoritative.commitment.status, "available"); assert.deepEqual(result.authoritative.commitment.facts, []);
  assert.equal(result.authoritative.routine.status, "available"); assert.deepEqual(result.authoritative.routine.facts, []);
});

test("current-revision collection selection is bounded, terminal-preserving, and ID-stable", () => {
  const values = states(); values.move.current.revision = 2; values.move.candidateMove.revisions = [{ revision: 2, recordedAt }]; values.moveState.candidateMoveRevision = 2;
  const commitment = (id, moveRevision, status) => ({ id, candidateMoveId: values.move.current.id, candidateMoveRevision: moveRevision, revision: 1, status, acceptedAction: moveRevision === 2 ? "Current action." : "Historical action.", window: { kind: "deadline", dueAt: "2026-10-10T12:00:00.000Z" } });
  values.commitments = { status: "available", commitments: { records: [
    { id: "commitment_test_b", revisions: [{ revision: 1, recordedAt }] }, { id: "commitment_test_old", revisions: [{ revision: 1, recordedAt }] }, { id: "commitment_test_a", revisions: [{ revision: 1, recordedAt }] },
  ] }, records: [commitment("commitment_test_b", 2, "completed"), commitment("commitment_test_old", 1, "canceled"), commitment("commitment_test_a", 2, "canceled")] };
  const routine = (id, moveRevision, status) => ({ id, candidateMoveId: values.move.current.id, candidateMoveRevision: moveRevision, action: "Current action.", lifecycle: status, schedule: { kind: "weekly-utc", weekday: 5, opensAtUtc: "09:00:00Z", closesAtUtc: "10:00:00Z" }, revisions: [{ revision: 1, status, recordedAt }] });
  values.routines = { status: "available", routines: [routine("routine_test_z", 2, "retired"), routine("routine_test_old", 1, "retired"), routine("routine_test_a", 2, "paused")] };
  const result = assemble(harness(values));
  assert.deepEqual(result.authoritative.commitment.facts.map((fact) => [fact.reference.recordId, fact.reference.status]), [["commitment_test_a", "canceled"], ["commitment_test_b", "completed"]]);
  assert.deepEqual(result.authoritative.routine.facts.map((fact) => [fact.reference.recordId, fact.reference.status]), [["routine_test_a", "paused"], ["routine_test_z", "retired"]]);
  assert.equal(JSON.stringify(result).includes("commitment_test_old"), false); assert.equal(JSON.stringify(result).includes("routine_test_old"), false);
});

test("source references preserve only witnessed relationships and derived identity", () => {
  const values = states();
  values.availability = { status: "available", availability: { revisions: [{ revision: 1, recordedAt }] }, current: { id: "candidate_move_availability_test_aaa", candidateMoveId: values.move.current.id, situationId: values.situation.current.id, revision: 1, status: "confirmed", isCurrent: true, assertion: { kind: "commander-operating-sufficiency", candidateMoveRevision: 1, situationRevision: 1, conditionsConfirmed: "Required conditions were checked." } } };
  values.moveState = { status: "available", state: "actionable", candidateMoveId: values.move.current.id, candidateMoveRevision: 1, basis: { kind: "availability", references: [{ type: "candidate-move-availability", id: values.availability.current.id, revision: 1 }] } };
  const result = assemble(harness(values)); const move = result.authoritative.candidateMove.facts[0].reference;
  assert.deepEqual(move.relationships, { situationId: values.situation.current.id, situationRevision: null, candidateMoveId: null, candidateMoveRevision: null });
  const availability = result.authoritative.availability.facts[0].reference;
  assert.deepEqual(availability.relationships, { situationId: values.situation.current.id, situationRevision: 1, candidateMoveId: values.move.current.id, candidateMoveRevision: 1 });
  const derived = result.derived.moveState.facts[0].reference;
  assert.equal(derived.authority, "derived-operating-state"); assert.equal(derived.recordId, null); assert.equal(derived.revision, null); assert.equal(derived.recordedAt, null);
});

test("context validation rejects slot relabeling, legacy injection, relationship fabrication, and unwitnessed derived basis", () => {
  const h = harness(); const context = assemble(h); assert.equal(h.api.validateContext(context), true);
  const cases = [];
  const authority = clone(context); authority.derived.moveState.authority = "authoritative-operating-truth"; cases.push(authority);
  const swap = clone(context); swap.authoritative.hold.sourceType = "dependency"; cases.push(swap);
  const legacy = clone(context); legacy.authoritative.memory = clone(context.authoritative.hold); cases.push(legacy);
  const witness = clone(context); witness.authoritative.candidateMove.facts[0].reference.relationships.situationRevision = 1; cases.push(witness);
  const derived = clone(context); derived.derived.moveState.facts[0].data = { state: "hold", basis: { kind: "hold", references: [{ type: "candidate-move-hold", id: "candidate_move_hold_invented_x", revision: 1 }] } }; derived.derived.moveState.facts[0].reference.status = "hold"; cases.push(derived);
  for (const item of cases) assert.equal(h.api.validateContext(item), false);
});

test("real frozen owners integrate through public reads with exact current-revision selection and zero assembly writes", () => {
  const files = ["js/storage.js", "systems/commander.system.js", "systems/situation.system.js", "systems/candidate-move.system.js",
    "systems/candidate-move-hold.system.js", "systems/candidate-move-dependency.system.js", "systems/candidate-move-availability.system.js",
    "systems/candidate-move-commitment.system.js", "systems/candidate-move-routine.system.js", "systems/move-state.system.js",
    "systems/operating-context-assembler.system.js"];
  const values = new Map(); const operations = [];
  const storage = { get length() { return values.size; }, key(index) { return [...values.keys()][index] || null; },
    getItem(key) { operations.push(["get", key]); return values.get(key) || null; },
    setItem(key, value) { operations.push(["set", key]); values.set(key, String(value)); }, removeItem(key) { values.delete(key); } };
  const runtime = vm.createContext({ Date, Math, JSON, localStorage: storage, sessionStorage: storage, console: { log() {}, warn() {}, error() {} } });
  for (const name of files) vm.runInContext(fs.readFileSync(path.join(root, name), "utf8"), runtime, { filename: name });
  const api = vm.runInContext("({ founder, loadFounder, SituationSystem, CandidateMoveSystem, CandidateMoveCommitmentSystem, CandidateMoveRoutineSystem, OperatingContextAssembler })", runtime);
  api.loadFounder();
  const situation = api.SituationSystem.createSituation({ subject: "Approval", currentReality: "Approval is pending." });
  const move = api.CandidateMoveSystem.createCandidateMove({ situationId: situation.id, action: "Send first package." });
  const oldCommitment = api.CandidateMoveCommitmentSystem.createCommitment({ candidateMoveId: move.id, expectedCandidateMoveRevision: 1, window: { kind: "deadline", dueAt: "2026-10-10T12:00:00.000Z" } });
  api.CandidateMoveCommitmentSystem.completeCommitment({ id: oldCommitment.id, expectedRevision: 1 });
  const oldRoutine = api.CandidateMoveRoutineSystem.createRoutine({ candidateMoveId: move.id, expectedCandidateMoveRevision: 1, schedule: { kind: "weekly-utc", weekday: 5, opensAtUtc: "09:00:00Z", closesAtUtc: "10:00:00Z" } });
  api.CandidateMoveRoutineSystem.retireRoutine({ id: oldRoutine.id, expectedRevision: 1 });
  api.CandidateMoveSystem.correctCandidateMove({ id: move.id, expectedRevision: 1, action: "Send revised package." });
  const currentCommitment = api.CandidateMoveCommitmentSystem.createCommitment({ candidateMoveId: move.id, expectedCandidateMoveRevision: 2, window: { kind: "deadline", dueAt: "2026-10-12T12:00:00.000Z" } });
  const currentRoutine = api.CandidateMoveRoutineSystem.createRoutine({ candidateMoveId: move.id, expectedCandidateMoveRevision: 2, schedule: { kind: "weekly-utc", weekday: 6, opensAtUtc: "11:00:00Z", closesAtUtc: "12:00:00Z" } });
  const ownerBefore = clone({ situation: api.SituationSystem.getSituation(), move: api.CandidateMoveSystem.getCandidateMove(), commitments: api.CandidateMoveCommitmentSystem.getCommitments(), routines: api.CandidateMoveRoutineSystem.getRoutines(), founder: api.founder });
  const writes = operations.filter(([kind]) => kind === "set").length;
  const result = clone(api.OperatingContextAssembler.assemble({ requestType: "situation-explanation", asOf }));
  assert.equal(result.status, "available"); assert.deepEqual(result.authoritative.commitment.facts.map((fact) => fact.reference.recordId), [currentCommitment.id]);
  assert.deepEqual(result.authoritative.routine.facts.map((fact) => fact.reference.recordId), [currentRoutine.id]);
  assert.equal(result.authoritative.commitment.facts[0].data.acceptedAction, "Send revised package.");
  assert.equal(result.authoritative.routine.facts[0].data.action, "Send revised package.");
  assert.equal(JSON.stringify(result).includes(oldCommitment.id), false); assert.equal(JSON.stringify(result).includes(oldRoutine.id), false);
  assert.equal(JSON.stringify(result).includes("revisions"), false); assert.equal(operations.filter(([kind]) => kind === "set").length, writes);
  result.authoritative.situation.facts[0].data.currentReality = "mutated"; result.authoritative.commitment.facts[0].data.status = "canceled";
  assert.deepEqual(clone({ situation: api.SituationSystem.getSituation(), move: api.CandidateMoveSystem.getCandidateMove(), commitments: api.CandidateMoveCommitmentSystem.getCommitments(), routines: api.CandidateMoveRoutineSystem.getRoutines(), founder: api.founder }), ownerBefore);
});

test("source firewall contains only public reads and no authority, persistence, network, timer, or legacy path", () => {
  for (const pattern of [/\bfounder\b/, /CommanderSystem/, /saveFounder/, /localStorage/, /MemorySystem/, /ArchieCore/, /CommunicationSystem/, /DecisionSystem/, /fetch\s*\(/, /XMLHttpRequest/, /WebSocket/, /setTimeout/, /setInterval/, /Date\.now/, /new Date\(\)/]) assert.doesNotMatch(source, pattern);
  for (const method of ["getSituation", "getCandidateMove", "getHold", "getDependency", "getAvailability", "getCommitments", "getRoutines", "getMoveState"]) assert.match(source, new RegExp(method));
});