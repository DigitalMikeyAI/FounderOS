const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const files = ["js/storage.js", "systems/commander.system.js", "systems/situation.system.js", "systems/candidate-move.system.js", "systems/candidate-move-schedule.system.js"];
const sources = files.map((file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8"));
const clone = (value) => JSON.parse(JSON.stringify(value));
const time = "2026-09-29T18:00:00.000Z";
const later = "2026-09-29T19:00:00.000Z";
function load(snapshot, behavior = {}) {
  const values = new Map(snapshot ? [["digitalMikeyFounder", snapshot]] : []);
  const writes = [];
  const storage = { getItem(key) { return values.get(key) ?? null; }, setItem(key, value) { writes.push([key, value]); if (behavior.write) behavior.write(key, value); values.set(key, value); }, removeItem(key) { values.delete(key); }, get length() { return values.size; }, key(index) { return [...values.keys()][index] ?? null; } };
  const context = vm.createContext({ console: { log() {}, warn() {}, error() {} }, localStorage: storage, sessionStorage: storage });
  files.forEach((file, index) => vm.runInContext(sources[index], context, { filename: file }));
  const api = vm.runInContext("({ founder, loadFounder, saveFounder, CommanderSystem, SituationSystem, CandidateMoveSystem, system: CandidateMoveScheduleSystem })", context);
  api.loadFounder();
  return { ...api, context, values, writes };
}
function setup() {
  const h = load();
  const situation = h.SituationSystem.createSituation({ subject: "Proposal", currentReality: "Ready to discuss." });
  h.move = h.CandidateMoveSystem.createCandidateMove({ situationId: situation.id, action: "Call Bob." });
  return h;
}
function create(h, occursAt = time) { return h.system.scheduleOccurrence({ candidateMoveId: h.move.id, expectedCandidateMoveRevision: h.CandidateMoveSystem.getCandidateMove().current.revision, occursAt }); }
function unchanged(h, fn) {
  const before = JSON.stringify(h.founder); const count = h.writes.length;
  assert.throws(fn); assert.equal(JSON.stringify(h.founder), before); assert.equal(h.writes.length, count);
}

test("creation binds exact accepted action and permits independent identical instants", () => {
  const h = setup(); assert.equal(h.system.getSchedules().status, "absent");
  assert.equal(Object.hasOwn(h.founder, "candidateMoveSchedules"), false);
  const a = create(h); const b = create(h);
  assert.notEqual(a.id, b.id); assert.equal(a.candidateMoveRevision, 1);
  assert.equal(a.revisions[0].occursAt, time); assert.equal(a.revisions[0].status, "scheduled");
  assert.equal(a.revisions[0].revision, 1); assert.equal(h.system.getSchedule({ id: a.id }).current.acceptedAction, "Call Bob.");
  assert.deepEqual(clone(a.revisions[0].provenance), { authority: "commander", operation: "create" });
  assert.equal(h.system.getSchedules().records.length, 2);
});

test("creation rejects stale or wrong Move identity and noncanonical instants without saving", () => {
  const h = setup();
  for (const overrides of [{ candidateMoveId: "wrong" }, { expectedCandidateMoveRevision: 0 }, { expectedCandidateMoveRevision: "1" }, ...[null, 1, "tomorrow", "2026-02-30T00:00:00.000Z", "2026-09-29T18:00:00Z", "2026-09-29T18:00:00.000+00:00", "2026-09-29T18:00"].map((occursAt) => ({ occursAt }))]) {
    unchanged(h, () => h.system.scheduleOccurrence({ candidateMoveId: h.move.id, expectedCandidateMoveRevision: 1, occursAt: time, ...overrides }));
  }
});

test("reschedule and cancel keep identity, history, accepted binding, and other records unchanged", () => {
  const h = setup(); const a = create(h); const b = create(h); const other = JSON.stringify(h.system.getSchedule({ id: b.id }));
  const changed = h.system.rescheduleOccurrence({ id: a.id, expectedRevision: 1, occursAt: later });
  assert.equal(changed.id, a.id); assert.equal(changed.candidateMoveRevision, 1);
  assert.deepEqual(clone(changed.revisions[0]), clone(a.revisions[0]));
  assert.equal(changed.revisions[1].revision, 2); assert.equal(changed.revisions[1].occursAt, later);
  const live = h.founder.candidateMoveSchedules; const count = h.writes.length;
  assert.deepEqual(clone(h.system.rescheduleOccurrence({ id: a.id, expectedRevision: 2, occursAt: later })), clone(changed));
  assert.equal(h.writes.length, count); assert.equal(h.founder.candidateMoveSchedules, live);
  unchanged(h, () => h.system.rescheduleOccurrence({ id: a.id, expectedRevision: 1, occursAt: time }));
  unchanged(h, () => h.system.cancelOccurrence({ id: a.id, expectedRevision: 1 }));
  unchanged(h, () => h.system.rescheduleOccurrence({ id: a.id, expectedRevision: 2, occursAt: "bad" }));
  unchanged(h, () => h.system.cancelOccurrence({ id: "missing", expectedRevision: 2 }));
  const canceled = h.system.cancelOccurrence({ id: a.id, expectedRevision: 2 });
  assert.equal(canceled.id, a.id); assert.equal(canceled.candidateMoveRevision, 1);
  assert.equal(canceled.revisions[2].status, "canceled"); assert.equal(canceled.revisions[2].occursAt, later);
  unchanged(h, () => h.system.cancelOccurrence({ id: a.id, expectedRevision: 3 }));
  unchanged(h, () => h.system.rescheduleOccurrence({ id: a.id, expectedRevision: 3, occursAt: time }));
  assert.equal(JSON.stringify(h.system.getSchedule({ id: b.id })), other);
  assert.notEqual(create(h).id, a.id);
});

for (const withdraw of [false, true]) test(`existing lifecycle preserves accepted action after Move ${withdraw ? "withdrawal" : "correction"}`, () => {
  const h = setup(); const a = create(h); const b = create(h);
  h.CandidateMoveSystem.correctCandidateMove({ id: h.move.id, expectedRevision: 1, action: "Call Alice." });
  if (withdraw) h.CandidateMoveSystem.withdrawCandidateMove({ id: h.move.id, expectedRevision: 2 });
  h.system.rescheduleOccurrence({ id: a.id, expectedRevision: 1, occursAt: later });
  h.system.cancelOccurrence({ id: b.id, expectedRevision: 1 });
  for (const id of [a.id, b.id]) {
    const read = h.system.getSchedule({ id }).current;
    assert.equal(read.acceptedAction, "Call Bob."); assert.equal(read.candidateMoveRevision, 1);
    assert.equal(read.currentMoveStatus, withdraw ? "withdrawn" : "active");
  }
  if (withdraw) unchanged(h, () => create(h));
  else { const c = create(h); assert.equal(c.candidateMoveRevision, 2); assert.equal(h.system.getSchedule({ id: c.id }).current.acceptedAction, "Call Alice."); }
});

for (const operation of ["create", "reschedule", "cancel"]) for (const failure of ["false", "throw", "missing"]) test(`${operation}: ${failure} persistence leaves live authority unchanged`, () => {
  const h = setup(); const a = create(h); const before = JSON.stringify(h.founder);
  h.CommanderSystem.save = failure === "missing" ? undefined : () => { if (failure === "throw") throw new Error("failed"); return false; };
  const run = operation === "create" ? () => create(h) : operation === "reschedule" ? () => h.system.rescheduleOccurrence({ id: a.id, expectedRevision: 1, occursAt: later }) : () => h.system.cancelOccurrence({ id: a.id, expectedRevision: 1 });
  unchanged(h, run); assert.equal(JSON.stringify(h.founder), before);
});

test("publication follows primary save; mirror failure does not undo confirmed commit", () => {
  const seed = setup(); const snapshot = seed.values.get("digitalMikeyFounder"); let h; let enabled = false; let observed;
  h = load(snapshot, { write(key) { if (!enabled) return; if (key === "digitalMikeyFounder") observed = h.founder.candidateMoveSchedules; if (key === "founder") throw new Error("mirror failed"); } });
  h.move = seed.move; enabled = true; const a = create(h);
  assert.equal(observed, undefined); assert.equal(h.founder.candidateMoveSchedules.records[0].id, a.id);
  const primary = load(snapshot, { write(key) { if (key === "digitalMikeyFounder") throw new Error("primary failed"); } }); primary.move = seed.move;
  const before = JSON.stringify(primary.founder); assert.throws(() => create(primary)); assert.equal(JSON.stringify(primary.founder), before);
});

test("unsafe publication fails before any save", () => {
  for (const mode of ["frozen", "accessor", "nonextensible"]) {
    const h = setup();
    if (mode === "frozen") Object.defineProperty(h.founder, "candidateMoveSchedules", { value: { schemaVersion: 1, records: [] }, writable: false });
    if (mode === "accessor") Object.defineProperty(h.founder, "candidateMoveSchedules", { get() { return { schemaVersion: 1, records: [] }; }, set() { throw new Error("unsafe"); } });
    if (mode === "nonextensible") Object.preventExtensions(h.founder);
    unchanged(h, () => create(h));
  }
});

test("reload preserves each lifecycle step and unrelated owner data; existing owner save preserves schedules", () => {
  let h = setup(); h.founder.commitments = { sentinel: "unchanged" }; h.founder.routines = { sentinel: "unchanged" }; h.founder.profile.custom = [1, 2];
  const unrelated = clone({ commitments: h.founder.commitments, routines: h.founder.routines, profile: h.founder.profile });
  const a = create(h); const b = create(h);
  const reload = () => { const expected = clone(h.founder.candidateMoveSchedules); h = load(h.values.get("digitalMikeyFounder")); assert.deepEqual(clone(h.founder.candidateMoveSchedules), expected); };
  reload(); h.system.rescheduleOccurrence({ id: a.id, expectedRevision: 1, occursAt: later }); reload();
  h.system.cancelOccurrence({ id: a.id, expectedRevision: 2 }); reload();
  assert.equal(h.system.getScheduleHistory({ id: a.id }).revisions.length, 3);
  assert.equal(h.system.getSchedule({ id: b.id }).current.status, "scheduled");
  const expected = clone(h.founder.candidateMoveSchedules);
  const move = h.CandidateMoveSystem.getCandidateMove().current;
  h.CandidateMoveSystem.correctCandidateMove({ id: move.id, expectedRevision: move.revision, action: "Call Alice." });
  assert.deepEqual(clone(h.founder.candidateMoveSchedules), expected); reload();
  for (const key of Object.keys(unrelated)) assert.deepEqual(clone(h.founder[key]), unrelated[key]);
});

test("inputs, command returns, collection, detail and history are detached", () => {
  const h = setup(); const input = { candidateMoveId: h.move.id, expectedCandidateMoveRevision: 1, occursAt: time };
  const a = h.system.scheduleOccurrence(input); const expected = JSON.stringify(h.founder);
  input.occursAt = later; a.revisions[0].occursAt = later;
  const list = h.system.getSchedules(); list.schedules.records[0].revisions[0].status = "canceled"; list.records[0].acceptedAction = "Other";
  const detail = h.system.getSchedule({ id: a.id }); detail.schedule.revisions.length = 0; detail.current.occursAt = later;
  h.system.getScheduleHistory({ id: a.id }).revisions[0].provenance.authority = "other";
  assert.equal(JSON.stringify(h.founder), expected); assert.equal(h.system.getSchedule({ id: a.id }).current.occursAt, time);
});

test("past, present and future plans remain scheduled; reads never ask the clock or write", () => {
  const h = setup(); const now = new Date().toISOString();
  for (const instant of ["2000-01-01T00:00:00.000Z", now, "9999-01-01T00:00:00.000Z"]) create(h, instant);
  const before = JSON.stringify(h.founder); const count = h.writes.length;
  vm.runInContext("const NativeDate = Date; globalThis.Date = class extends NativeDate { constructor(...args) { if (!args.length) throw new Error('implicit clock'); super(...args); } static now() { throw new Error('implicit clock'); } };", h.context);
  for (const record of h.system.getSchedules().records) { assert.equal(record.status, "scheduled"); assert.equal(h.system.getSchedule({ id: record.id }).current.status, "scheduled"); assert.equal(h.system.getScheduleHistory({ id: record.id }).revisions.length, 1); }
  assert.equal(JSON.stringify(h.founder), before); assert.equal(h.writes.length, count);
});

const corruptions = [
  ["schema", (c) => { c.schemaVersion = 2; }], ["records", (c) => { c.records = {}; }],
  ["duplicate ID", (c) => { c.records.push(clone(c.records[0])); }],
  ["missing linkage", (c) => { delete c.records[0].candidateMoveId; }],
  ["wrong linkage", (c) => { c.records[0].candidateMoveId = "other"; }],
  ["unknown accepted revision", (c) => { c.records[0].candidateMoveRevision = 999; }],
  ["invalid accepted revision", (c) => { c.records[0].candidateMoveRevision = 0; }],
  ["empty history", (c) => { c.records[0].revisions = []; }],
  ["null revision", (c) => { c.records[0].revisions = [null]; }],
  ["nonconsecutive history", (c) => { c.records[0].revisions[0].revision = 2; }],
  ["illegal initial status", (c) => { c.records[0].revisions[0].status = "canceled"; }],
  ["occursAt", (c) => { c.records[0].revisions[0].occursAt = "2026-02-30T00:00:00.000Z"; }],
  ["recordedAt", (c) => { c.records[0].revisions[0].recordedAt = "today"; }],
  ["provenance", (c) => { c.records[0].revisions[0].provenance.authority = "system"; }],
  ["independent action", (c) => { c.records[0].action = "Other"; }],
  ["revision linkage", (c) => { c.records[0].revisions[0].candidateMoveRevision = 2; }],
  ["extra collection field", (c) => { c.priority = 1; }],
  ["cancel changes time", (c) => { const r = clone(c.records[0].revisions[0]); c.records[0].revisions.push({ ...r, revision: 2, status: "canceled", occursAt: later, provenance: { authority: "commander", operation: "cancel" } }); }],
  ["reschedule no-op history", (c) => { const r = clone(c.records[0].revisions[0]); c.records[0].revisions.push({ ...r, revision: 2, provenance: { authority: "commander", operation: "reschedule" } }); }],
  ["post-terminal history", (c) => { const r = clone(c.records[0].revisions[0]); c.records[0].revisions.push({ ...r, revision: 2, status: "canceled", provenance: { authority: "commander", operation: "cancel" } }, { ...r, revision: 3, occursAt: later, provenance: { authority: "commander", operation: "reschedule" } }); }],
];
for (const [label, corrupt] of corruptions) test(`malformed ${label} poisons entire collection without repair`, () => {
  const h = setup(); const a = create(h); create(h); corrupt(h.founder.candidateMoveSchedules);
  const before = JSON.stringify(h.founder);
  for (const read of [h.system.getSchedules(), h.system.getSchedule({ id: a.id }), h.system.getScheduleHistory({ id: a.id })]) { assert.equal(read.status, "unavailable"); assert.equal(Object.hasOwn(read, "records"), false); }
  unchanged(h, () => create(h)); unchanged(h, () => h.system.rescheduleOccurrence({ id: a.id, expectedRevision: 1, occursAt: later })); unchanged(h, () => h.system.cancelOccurrence({ id: a.id, expectedRevision: 1 }));
  assert.equal(JSON.stringify(h.founder), before);
});

test("unavailable or inconsistent Move history cannot authorize schedules", () => {
  for (const damage of ["missing", "corrupt", "throw"]) {
    const h = setup(); const a = create(h);
    if (damage === "missing") delete h.founder.candidateMove;
    if (damage === "corrupt") h.founder.candidateMove.revisions[0].action = "";
    if (damage === "throw") h.CandidateMoveSystem.getCandidateMoveHistory = () => { throw new Error("unavailable"); };
    assert.equal(h.system.getSchedules().status, "unavailable");
    unchanged(h, () => h.system.cancelOccurrence({ id: a.id, expectedRevision: 1 }));
  }
});

test("ID collisions fail without deduplicating or overwriting an occurrence", () => {
  const h = setup(); vm.runInContext("Date.now = () => 1; Math.random = () => 0.5;", h.context);
  create(h); unchanged(h, () => create(h)); assert.equal(h.system.getSchedules().records.length, 1);
});

test("storage not loaded or failed cannot expose or change authority", () => {
  for (const status of ["not-loaded", "failed", "unknown"]) {
    const h = setup(); const a = create(h);
    vm.runInContext(`getFounderStorageLoadStatus = () => ${JSON.stringify(status)};`, h.context);
    assert.equal(h.system.getSchedules().status, "unavailable");
    unchanged(h, () => create(h)); unchanged(h, () => h.system.cancelOccurrence({ id: a.id, expectedRevision: 1 }));
  }
});

test("accepted linkage to a withdrawn revision and corrupted Move history fail closed", () => {
  const h = setup(); create(h);
  h.CandidateMoveSystem.withdrawCandidateMove({ id: h.move.id, expectedRevision: 1 });
  h.founder.candidateMoveSchedules.records[0].candidateMoveRevision = 2;
  assert.equal(h.system.getSchedules().status, "unavailable");
});

test("production has no downstream, direct storage, UI, timer or completion dependencies", () => {
  assert.doesNotMatch(sources[4], /CandidateMoveCommitmentSystem|CandidateMoveRoutineSystem|AttentionSystem|AttentionCandidateSystem|TemporalProjectionSystem|OperatingBriefingSystem|localStorage|document\.|window\.|dispatchEvent|setTimeout|setInterval/);
  const h = setup(); for (const method of ["complete", "markPerformed", "getCurrentSchedule", "getMissedSchedules", "getDueSchedules", "getUpcomingSchedules"]) assert.equal(h.system[method], undefined);
});
