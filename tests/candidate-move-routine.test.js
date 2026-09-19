const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(__dirname, "..");
const files = ["js/storage.js", "systems/commander.system.js", "systems/situation.system.js", "systems/candidate-move.system.js", "systems/candidate-move-hold.system.js", "systems/candidate-move-dependency.system.js", "systems/candidate-move-availability.system.js", "systems/candidate-move-commitment.system.js", "systems/candidate-move-routine.system.js", "systems/move-state.system.js"];
const source = Object.fromEntries(files.map((file) => [file, fs.readFileSync(path.join(root, file), "utf8")]));
const clone = (value) => JSON.parse(JSON.stringify(value));
const schedule = { kind: "weekly-utc", weekday: 5, opensAtUtc: "09:00:00Z", closesAtUtc: "17:00:00Z" };
// Keep lifecycle writes before the fixed evaluation dates, independent of the wall clock.
function testClock(now = "2026-09-18T08:00:00.000Z") {
  let time = Date.parse(now);
  return class extends Date {
    constructor(...args) { super(...(args.length ? args : [time])); }
    static now() { return time; }
    static setTime(value) { time = Date.parse(value); }
  };
}
function storage(initial = {}, behavior = {}) { const values = new Map(Object.entries(initial)); const operations = []; return { get length() { return values.size; }, key(index) { return Array.from(values.keys())[index] || null; }, getItem(key) { operations.push(["get", key]); return values.has(key) ? values.get(key) : null; }, setItem(key, value) { operations.push(["set", key]); if (behavior.setItem) behavior.setItem(key, String(value), values); else values.set(key, String(value)); }, removeItem(key) { values.delete(key); }, values, operations }; }
function load({ initial = {}, behavior = {}, commander = true, now } = {}) { const clock = testClock(now); const localStorage = storage(initial, behavior); const calls = { memory: 0, notification: 0, refresh: 0 }; const context = vm.createContext({ Date: clock, Math, JSON, localStorage, sessionStorage: storage(), console: { warn() {}, error() {} }, MemorySystem: { saveArtifact() { calls.memory += 1; } }, showNotification() { calls.notification += 1; }, refreshSession() { calls.refresh += 1; } }); for (const file of files) { if (file === "systems/commander.system.js" && !commander) continue; vm.runInContext(source[file], context, { filename: file }); } vm.runInContext(";globalThis.__api={founder,loadFounder,saveFounder,CommanderSystem:typeof CommanderSystem==='undefined'?null:CommanderSystem,SituationSystem,CandidateMoveSystem,CandidateMoveCommitmentSystem,CandidateMoveRoutineSystem,MoveStateSystem};", context); return { api: context.__api, localStorage, calls, context, clock }; }
function setup(options = {}) { const h = load(options); h.api.loadFounder(); const situation = h.api.SituationSystem.createSituation({ subject: "Package", currentReality: "Ready." }); const move = h.api.CandidateMoveSystem.createCandidateMove({ situationId: situation.id, action: "Send package." }); return { h, situation, move }; }
function create(h, move, value = schedule) { return h.api.CandidateMoveRoutineSystem.createRoutine({ candidateMoveId: move.id, expectedCandidateMoveRevision: h.api.CandidateMoveSystem.getCandidateMove().current.revision, schedule: value }); }
function writes(h) { return h.localStorage.operations.filter(([type]) => type === "set").length; }
function corruptRead(mutator) { const { h, move } = setup(); const routine = create(h, move); mutator(h.api.founder.routines, routine); return h.api.CandidateMoveRoutineSystem.getRoutines(); }

test("Routine authority is explicit, schema-bound, and independent of Candidate Move and Commitment activity", () => {
  const { h, move } = setup(); const system = h.api.CandidateMoveRoutineSystem;
  assert.equal(system.getRoutines().status, "absent");
  h.api.CandidateMoveCommitmentSystem.createCommitment({ candidateMoveId: move.id, expectedCandidateMoveRevision: 1, window: { kind: "deadline", dueAt: "2026-09-18T19:00:00.000Z" } });
  assert.equal(system.getRoutines().status, "absent");
  assert.throws(() => system.createRoutine({ candidateMoveId: move.id, expectedCandidateMoveRevision: 1, schedule: { ...schedule, priority: 1 } }));
  assert.throws(() => system.createRoutine({ candidateMoveId: move.id, expectedCandidateMoveRevision: 1, schedule: { ...schedule, opensAtUtc: "17:00:00Z", closesAtUtc: "09:00:00Z" } }));
  const routine = create(h, move); assert.match(routine.id, /^routine_[a-z0-9]+_[a-z0-9]+$/); assert.deepEqual(clone(h.api.founder.routines), { schemaVersion: 1, records: [routine] });
  assert.equal(Object.hasOwn(routine, "action"), false); assert.equal(h.api.founder.commitments.records.length, 1);
});

test("Routine binding uses exact active Candidate Move history and correction or withdrawal suppresses eligibility without mutation", () => {
  const { h, move } = setup(); const routine = create(h, move); const system = h.api.CandidateMoveRoutineSystem;
  const before = clone(routine); h.api.CandidateMoveSystem.correctCandidateMove({ id: move.id, expectedRevision: 1, action: "Send revised package." });
  const read = system.getRoutine({ id: routine.id }); assert.equal(read.routine.action, "Send package."); assert.equal(read.current.candidateMoveRevision, 1);
  assert.equal(system.getRoutineOccurrence({ id: routine.id, asOf: "2026-09-18T10:00:00.000Z" }).occurrence, "none");
  assert.throws(() => system.resumeRoutine({ id: routine.id, expectedRevision: 1 }));
  assert.deepEqual(clone(h.api.founder.routines.records[0].revisions), before.revisions);
  h.api.CandidateMoveSystem.withdrawCandidateMove({ id: move.id, expectedRevision: 2 });
  assert.equal(system.getRoutineOccurrence({ id: routine.id, asOf: "2026-09-18T10:00:00.000Z" }).occurrence, "none");
  assert.throws(() => create(h, move));
});

test("Routine lifecycle is append-only, schedule-preserving, terminal, and permits explicit replacement only after retirement", () => {
  const { h, move } = setup(); const system = h.api.CandidateMoveRoutineSystem; const first = create(h, move);
  assert.throws(() => create(h, move)); system.pauseRoutine({ id: first.id, expectedRevision: 1 }); assert.throws(() => create(h, move));
  system.resumeRoutine({ id: first.id, expectedRevision: 2 }); system.retireRoutine({ id: first.id, expectedRevision: 3 });
  assert.equal(system.getRoutine({ id: first.id }).current.status, "retired"); assert.throws(() => system.resumeRoutine({ id: first.id, expectedRevision: 4 }));
  const second = create(h, move); assert.notEqual(second.id, first.id); assert.deepEqual(first.revisions[0].schedule, h.api.founder.routines.records[0].revisions[3].schedule);
  const paused = system.pauseRoutine({ id: second.id, expectedRevision: 1 }); system.retireRoutine({ id: second.id, expectedRevision: 2 }); assert.equal(paused.revisions[1].status, "paused");
});

test("UTC occurrence is read-only, inclusive, deterministic, and has no backlog or persisted occurrence ledger", () => {
  const { h, move } = setup(); const routine = create(h, move); const system = h.api.CandidateMoveRoutineSystem; const before = JSON.stringify(h.api.founder); const writes = h.localStorage.operations.filter(([type]) => type === "set").length;
  for (const [asOf, expected] of [["2026-09-18T08:59:59.999Z", "none"], ["2026-09-18T09:00:00.000Z", "current"], ["2026-09-18T12:00:00.000Z", "current"], ["2026-09-18T17:00:00.000Z", "current"], ["2026-09-18T17:00:00.001Z", "none"], ["2026-09-25T10:00:00.000Z", "current"], ["2026-09-19T10:00:00.000Z", "none"]]) assert.equal(system.getRoutineOccurrence({ id: routine.id, asOf }).occurrence, expected);
  const one = system.getRoutineOccurrence({ id: routine.id, asOf: "2026-09-18T10:00:00.000Z" }); const two = system.getRoutineOccurrence({ id: routine.id, asOf: "2026-09-18T12:00:00.000Z" });
  assert.equal(one.occurrenceKey, two.occurrenceKey); assert.equal(one.scheduledDateUtc, "2026-09-18"); assert.equal(one.opensAt, "2026-09-18T09:00:00.000Z"); assert.equal(system.getRoutineOccurrence({ id: routine.id, asOf: "2026-09-18T10:00:00Z" }).status, "unavailable");
  assert.equal(JSON.stringify(h.api.founder), before); assert.equal(h.localStorage.operations.filter(([type]) => type === "set").length, writes); assert.equal(JSON.stringify(h.api.founder).includes("occurrence"), false);
  assert.equal(move.id, routine.candidateMoveId);
});

test("Routine reads distinguish absence/corruption, detach results, and do not affect Move State or operating domains", () => {
  const absent = load(); absent.api.loadFounder(); assert.equal(absent.api.CandidateMoveRoutineSystem.getRoutines().status, "absent");
  const { h, move } = setup(); const routine = create(h, move); const baseline = h.api.MoveStateSystem.getMoveState(); const read = h.api.CandidateMoveRoutineSystem.getRoutine({ id: routine.id }); read.routine.schedule.opensAtUtc = "00:00:00Z"; read.current.schedule.opensAtUtc = "00:00:00Z";
  assert.equal(h.api.founder.routines.records[0].revisions[0].schedule.opensAtUtc, "09:00:00Z"); assert.deepEqual(h.api.MoveStateSystem.getMoveState(), baseline);
  h.api.founder.routines = { schemaVersion: 1, records: [{ ...routine, priority: 1 }] }; assert.equal(h.api.CandidateMoveRoutineSystem.getRoutines().status, "unavailable"); assert.deepEqual(h.api.MoveStateSystem.getMoveState(), baseline);
});

test("Routine persistence requires confirmed save and preserves live collection on failure or unsafe publication", () => {
  const failed = setup(); const system = failed.h.api.CandidateMoveRoutineSystem; const save = failed.h.api.CommanderSystem.save; failed.h.api.CommanderSystem.save = () => false;
  assert.throws(() => create(failed.h, failed.move)); assert.equal(Object.hasOwn(failed.h.api.founder, "routines"), false); failed.h.api.CommanderSystem.save = save;
  const routine = create(failed.h, failed.move); const live = failed.h.api.founder.routines; failed.h.api.CommanderSystem.save = () => null;
  assert.throws(() => system.pauseRoutine({ id: routine.id, expectedRevision: 1 })); assert.equal(failed.h.api.founder.routines, live); assert.equal(live.records[0].revisions.length, 1);
  const unsafe = setup(); Object.defineProperty(unsafe.h.api.founder, "routines", { configurable: true, set() { throw new Error("unsafe"); } }); assert.throws(() => create(unsafe.h, unsafe.move));
});

test("absent and structurally valid empty Routine collections are distinct and empty reads need no Candidate Move or writes", () => {
  const absent = load(); absent.api.loadFounder(); assert.equal(absent.api.CandidateMoveRoutineSystem.getRoutines().status, "absent");
  const h = load({ initial: { digitalMikeyFounder: JSON.stringify({ routines: { schemaVersion: 1, records: [] } }) } }); h.api.loadFounder(); const before = writes(h);
  assert.deepEqual(clone(h.api.CandidateMoveRoutineSystem.getRoutines()), { status: "available", routines: [] });
  assert.equal(h.api.CandidateMoveRoutineSystem.getRoutine({ id: "routine_none_x" }).status, "absent");
  assert.equal(h.api.CandidateMoveRoutineSystem.getRoutineHistory({ id: "routine_none_x" }).status, "absent");
  assert.equal(h.api.CandidateMoveRoutineSystem.getRoutineOccurrence({ id: "routine_none_x" }).status, "absent"); assert.equal(writes(h), before);
  h.api.founder.routines = { schemaVersion: 1, records: [], extra: true }; assert.equal(h.api.CandidateMoveRoutineSystem.getRoutines().status, "unavailable");
});

test("strict Routine schema rejects each extra level and malformed newest lifecycle never revives earlier truth", () => {
  for (const mutate of [
    (collection) => { collection.extra = true; },
    (collection) => { collection.records[0].extra = true; },
    (collection) => { collection.records[0].revisions[0].extra = true; },
    (collection) => { collection.records[0].revisions[0].provenance.extra = true; },
    (collection) => { collection.records[0].revisions[0].schedule.extra = true; },
  ]) assert.equal(corruptRead(mutate).status, "unavailable");
  const { h, move } = setup(); const routine = create(h, move); h.api.CandidateMoveRoutineSystem.pauseRoutine({ id: routine.id, expectedRevision: 1 }); h.api.founder.routines.records[0].revisions[1].status = "active";
  assert.equal(h.api.CandidateMoveRoutineSystem.getRoutine({ id: routine.id }).status, "unavailable");
});

test("asOf lifecycle safety, paused/retired states, move changes, and future projections are exact and write-free", () => {
  const { h, move } = setup(); const system = h.api.CandidateMoveRoutineSystem; const routine = create(h, move); const at = h.api.founder.routines.records[0].revisions[0].recordedAt;
  assert.equal(system.getRoutineOccurrence({ id: routine.id, asOf: "2000-01-01T00:00:00.000Z" }).status, "unavailable");
  assert.equal(system.getRoutineOccurrence({ id: routine.id, asOf: at }).occurrence, "none");
  const before = writes(h); system.getRoutineOccurrence({ id: routine.id, asOf: "2099-09-18T10:00:00.000Z" }); assert.equal(writes(h), before);
  system.pauseRoutine({ id: routine.id, expectedRevision: 1 }); assert.equal(system.getRoutineOccurrence({ id: routine.id, asOf: "2099-09-18T10:00:00.000Z" }).occurrence, "none");
  system.retireRoutine({ id: routine.id, expectedRevision: 2 }); assert.equal(system.getRoutineOccurrence({ id: routine.id, asOf: "2099-09-18T10:00:00.000Z" }).occurrence, "none");
  const changed = setup(); const bound = create(changed.h, changed.move); changed.h.api.CandidateMoveSystem.correctCandidateMove({ id: changed.move.id, expectedRevision: 1, action: "Corrected." }); assert.equal(changed.h.api.CandidateMoveRoutineSystem.getRoutineOccurrence({ id: bound.id, asOf: "2099-09-18T10:00:00.000Z" }).occurrence, "none"); changed.h.api.CandidateMoveSystem.withdrawCandidateMove({ id: changed.move.id, expectedRevision: 2 }); assert.equal(changed.h.api.CandidateMoveRoutineSystem.getRoutineOccurrence({ id: bound.id, asOf: "2099-09-18T10:00:00.000Z" }).occurrence, "none");
});

test("closed Situation does not suppress exact active Routine occurrence, and create/resume in-window project immediately without occurrence history", () => {
  const { h, situation, move } = setup({ now: "2026-09-18T10:00:00.000Z" }); const system = h.api.CandidateMoveRoutineSystem; const routine = create(h, move); h.api.SituationSystem.closeSituation({ id: situation.id, expectedRevision: 1 });
  const asOf = "2026-09-18T10:00:00.000Z"; assert.equal(system.getRoutineOccurrence({ id: routine.id, asOf }).occurrence, "current");
  assert.equal(system.pauseRoutine({ id: routine.id, expectedRevision: 1 }).revisions.length, 2); assert.equal(system.getRoutineOccurrence({ id: routine.id, asOf }).occurrence, "none");
  assert.equal(system.resumeRoutine({ id: routine.id, expectedRevision: 2 }).revisions.length, 3); assert.equal(system.getRoutineOccurrence({ id: routine.id, asOf }).occurrence, "current");
  assert.equal(Object.keys(h.api.founder.routines.records[0]).includes("occurrences"), false); assert.equal(JSON.stringify(h.api.founder.routines).includes("backlog"), false);
});

test("real storage persistence failures, publication ordering, PIH, mirror degradation, and lifecycle failure references are exact", () => {
  let failPrimary = false; const primary = setup({ behavior: { setItem(key, value, values) { if (failPrimary && key === "digitalMikeyFounder") throw new Error("primary failed"); values.set(key, value); } } }); failPrimary = true;
  assert.throws(() => create(primary.h, primary.move), /primary failed/); assert.equal(Object.hasOwn(primary.h.api.founder, "routines"), false);
  for (const confirmation of [false, null, undefined]) { const item = setup(); item.h.api.CommanderSystem.save = () => confirmation; assert.throws(() => create(item.h, item.move)); assert.equal(Object.hasOwn(item.h.api.founder, "routines"), false); }
  const unsafe = setup(); const beforeUnsafe = writes(unsafe.h); Object.defineProperty(unsafe.h.api.founder, "routines", { configurable: true, set() { throw new Error("unsafe"); } }); assert.throws(() => create(unsafe.h, unsafe.move)); assert.equal(writes(unsafe.h), beforeUnsafe);
  const pih = load({ initial: { digitalMikeyFounder: "{bad" } }); pih.api.loadFounder(); pih.localStorage.values.clear(); pih.api.founder.situation = { schemaVersion: 1, id: "situation_test_abc", revisions: [{ revision: 1, subject: "S", currentReality: "R", carryStatus: "active", provenance: { authority: "commander", operation: "create" }, recordedAt: "2026-09-12T00:00:00.000Z" }] }; pih.api.founder.candidateMove = { schemaVersion: 1, id: "candidate_move_test_abc", situationId: "situation_test_abc", revisions: [{ revision: 1, action: "A", status: "active", provenance: { authority: "commander", operation: "create" }, recordedAt: "2026-09-12T00:00:00.000Z" }] }; assert.throws(() => pih.api.CandidateMoveRoutineSystem.createRoutine({ candidateMoveId: "candidate_move_test_abc", expectedCandidateMoveRevision: 1, schedule }), /storage/);
  let observed; let observePrimary = false; let legacyFail = false; const mirror = setup({ behavior: { setItem(key, value, values) { if (observePrimary && key === "digitalMikeyFounder") observed = mirror.h.api.founder.routines; if (legacyFail && key === "founder") throw new Error("legacy failed"); values.set(key, value); } } }); observePrimary = true; legacyFail = true; const saved = create(mirror.h, mirror.move); assert.equal(observed, undefined); assert.equal(mirror.h.api.founder.routines.records[0].id, saved.id);
  for (const operation of ["pauseRoutine", "resumeRoutine", "retireRoutine"]) {
    const item = setup(); const routine = create(item.h, item.move); if (operation !== "pauseRoutine") item.h.api.CandidateMoveRoutineSystem.pauseRoutine({ id: routine.id, expectedRevision: 1 }); const live = item.h.api.founder.routines; const history = clone(live); item.h.api.CommanderSystem.save = () => { throw new Error("save failed"); }; const expectedRevision = live.records[0].revisions.length;
    assert.throws(() => item.h.api.CandidateMoveRoutineSystem[operation]({ id: routine.id, expectedRevision }), /save failed/); assert.equal(item.h.api.founder.routines, live); assert.deepEqual(clone(live), history);
  }
});

test("Routine lifecycle and occurrence reads never mutate an existing Commitment or persist materialization truth", () => {
  const { h, move } = setup(); const commitment = h.api.CandidateMoveCommitmentSystem.createCommitment({ candidateMoveId: move.id, expectedCandidateMoveRevision: 1, window: { kind: "deadline", dueAt: "2026-09-30T19:00:00.000Z" } }); const before = clone(h.api.founder.commitments);
  const routine = create(h, move); const system = h.api.CandidateMoveRoutineSystem; system.getRoutineOccurrence({ id: routine.id, asOf: "2026-09-18T10:00:00.000Z" }); system.pauseRoutine({ id: routine.id, expectedRevision: 1 }); system.resumeRoutine({ id: routine.id, expectedRevision: 2 }); system.retireRoutine({ id: routine.id, expectedRevision: 3 });
  assert.deepEqual(clone(h.api.founder.commitments), before); assert.equal(Object.hasOwn(h.api.founder.commitments.records[0], "routineId"), false); assert.equal(Object.hasOwn(h.api.founder.commitments.records[0], "occurrenceId"), false); assert.equal(JSON.stringify(h.api.founder.routines).includes("materialized"), false); assert.equal(commitment.id, before.records[0].id);
});
test("Routine occurrence distinguishes absence, pre-lifecycle checks, and current projection without writes", () => {
  const { h, move } = setup({ now: "2026-09-18T10:00:00.000Z" });
  const system = h.api.CandidateMoveRoutineSystem;
  assert.deepEqual(clone(system.getRoutineOccurrence({ id: "routine_missing_x", asOf: "2026-09-18T10:00:00.000Z" })), { status: "absent" });
  const routine = create(h, move);
  assert.equal(routine.revisions[0].recordedAt, "2026-09-18T10:00:00.000Z");
  const beforeLifecycle = { status: "unavailable", reason: "routine-occurrence-before-lifecycle" };
  const current = { status: "available", occurrence: "current", routineId: routine.id, occurrenceKey: `${routine.id}:2026-09-18`, scheduledDateUtc: "2026-09-18", opensAt: "2026-09-18T09:00:00.000Z", closesAt: "2026-09-18T17:00:00.000Z" };
  function check(asOf, expected) {
    const before = JSON.stringify(h.api.founder); const operations = h.localStorage.operations.length;
    assert.deepEqual(clone(system.getRoutineOccurrence({ id: routine.id, asOf })), expected);
    assert.deepEqual(clone(system.getRoutineOccurrence({ id: routine.id, asOf })), expected);
    assert.equal(JSON.stringify(h.api.founder), before); assert.equal(h.localStorage.operations.length, operations);
  }
  check("2026-09-18T09:59:59.999Z", beforeLifecycle);
  check("2026-09-18T10:00:00.000Z", current);
  h.clock.setTime("2026-09-18T11:00:00.000Z");
  system.pauseRoutine({ id: routine.id, expectedRevision: 1 });
  check("2026-09-18T10:59:59.999Z", beforeLifecycle);
  check("2026-09-18T11:00:00.000Z", { status: "available", occurrence: "none", id: routine.id, evaluatedAt: "2026-09-18T11:00:00.000Z" });
  h.clock.setTime("2026-09-18T12:00:00.000Z");
  system.resumeRoutine({ id: routine.id, expectedRevision: 2 });
  check("2026-09-18T11:59:59.999Z", beforeLifecycle);
  check("2026-09-18T12:00:00.000Z", current);
  h.clock.setTime("2099-01-01T00:00:00.000Z");
  check("2026-09-18T12:00:00.000Z", current);
  assert.deepEqual(h.calls, { memory: 0, notification: 0, refresh: 0 });
});
