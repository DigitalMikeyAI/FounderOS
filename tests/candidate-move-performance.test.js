const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const files = ["js/storage.js", "systems/commander.system.js", "systems/situation.system.js", "systems/candidate-move.system.js", "systems/candidate-move-performance.system.js"];
const sources = files.map((file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8"));
const clone = (value) => JSON.parse(JSON.stringify(value));
const performedAt = "2026-09-20T18:00:00.000Z";
const canonicalPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

function load(snapshot, behavior = {}) {
  const values = new Map(snapshot ? [["digitalMikeyFounder", snapshot]] : []);
  const writes = [];
  const storage = {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { writes.push([key, value]); if (behavior.write) behavior.write(key, value); values.set(key, value); },
    removeItem(key) { values.delete(key); },
    get length() { return values.size; },
    key(index) { return [...values.keys()][index] ?? null; },
  };
  const context = vm.createContext({ console: { log() {}, warn() {}, error() {} }, localStorage: storage, sessionStorage: storage });
  files.forEach((file, index) => vm.runInContext(sources[index], context, { filename: file }));
  const api = vm.runInContext("({ founder, loadFounder, CommanderSystem, SituationSystem, CandidateMoveSystem, system: CandidateMovePerformanceSystem })", context);
  api.loadFounder();
  return { ...api, context, values, writes };
}

function setup() {
  const h = load();
  const situation = h.SituationSystem.createSituation({ subject: "Proposal", currentReality: "Ready." });
  h.move = h.CandidateMoveSystem.createCandidateMove({ situationId: situation.id, action: "Call Bob." });
  return { h, situation };
}

function report(h, revision = 1, time = performedAt) {
  return h.system.reportPerformance({ candidateMoveId: h.move.id, candidateMoveRevision: revision, performedAt: time });
}

function unchanged(h, fn) {
  const before = JSON.stringify(h.founder);
  const writes = h.writes.length;
  assert.throws(fn);
  assert.equal(JSON.stringify(h.founder), before);
  assert.equal(h.writes.length, writes);
}

function retractionOf(record) {
  return {
    ...clone(record.revisions[0]),
    revision: 2,
    status: "retracted",
    provenance: { authority: "commander", operation: "retract" },
  };
}

function installFixedClock(h, instant) {
  vm.runInContext(`
    const PerformanceNativeDate = Date;
    globalThis.__performanceClock = ${JSON.stringify(instant)};
    globalThis.Date = class extends PerformanceNativeDate {
      constructor(...args) { super(...(args.length ? args : [globalThis.__performanceClock])); }
      static now() { return new PerformanceNativeDate(globalThis.__performanceClock).getTime(); }
    };
  `, h.context);
}

test("absent optional storage, exact historical binding, timestamps, and multiplicity", () => {
  const { h } = setup();
  assert.equal(h.system.getPerformances().status, "absent");
  assert.equal(Object.hasOwn(h.founder, "candidateMovePerformances"), false);
  const a = report(h); const b = report(h);
  assert.notEqual(a.id, b.id);
  assert.equal(a.revisions[0].performedAt, performedAt);
  assert.match(a.revisions[0].recordedAt, canonicalPattern);
  assert.deepEqual(clone(a.revisions[0].provenance), { authority: "commander", operation: "report" });
  assert.equal(h.system.getPerformance({ id: a.id }).current.candidateMoveRevision, 1);
  assert.equal(h.system.getPerformance({ id: a.id }).current.acceptedAction, "Call Bob.");
  assert.equal(h.system.getPerformances().records.length, 2);
});

test("historical reporting and reads survive correction, withdrawal, and Situation closure", () => {
  const { h, situation } = setup();
  const first = report(h);
  h.CandidateMoveSystem.correctCandidateMove({ id: h.move.id, expectedRevision: 1, action: "Call Alice." });
  assert.equal(h.system.getPerformance({ id: first.id }).current.acceptedAction, "Call Bob.");
  const afterCorrection = report(h, 1);
  h.CandidateMoveSystem.withdrawCandidateMove({ id: h.move.id, expectedRevision: 2 });
  assert.equal(h.system.getPerformance({ id: first.id }).current.status, "reported");
  const afterWithdrawal = report(h, 1);
  h.SituationSystem.closeSituation({ id: situation.id, expectedRevision: 1 });
  assert.equal(h.system.getPerformance({ id: first.id }).current.acceptedAction, "Call Bob.");
  const afterClosure = report(h, 1);
  assert.deepEqual([afterCorrection, afterWithdrawal, afterClosure].map((record) => record.candidateMoveRevision), [1, 1, 1]);
});

test("report rejects nonexistent, withdrawn, malformed, and noncanonical historical bindings without saving", () => {
  const { h } = setup();
  for (const input of [
    { candidateMoveId: "wrong" }, { candidateMoveRevision: 2 }, { candidateMoveRevision: 0 }, { candidateMoveRevision: -1 }, { candidateMoveRevision: 1.5 }, { candidateMoveRevision: "1" },
    ...[null, "bad", "2026-09-20T18:00:00Z", "2026-09-20T18:00:00.000+00:00", "2026-02-30T00:00:00.000Z"].map((value) => ({ performedAt: value })),
  ]) unchanged(h, () => h.system.reportPerformance({ candidateMoveId: h.move.id, candidateMoveRevision: 1, performedAt, ...input }));
  h.CandidateMoveSystem.withdrawCandidateMove({ id: h.move.id, expectedRevision: 1 });
  unchanged(h, () => report(h, 2));
});

test("retraction appends terminal history, rejects stale commands, and remains possible after Move changes", () => {
  for (const change of ["correction", "withdrawal", "closure"]) {
    const { h, situation } = setup(); const record = report(h);
    if (change === "correction") h.CandidateMoveSystem.correctCandidateMove({ id: h.move.id, expectedRevision: 1, action: "Call Alice." });
    if (change === "withdrawal") h.CandidateMoveSystem.withdrawCandidateMove({ id: h.move.id, expectedRevision: 1 });
    if (change === "closure") h.SituationSystem.closeSituation({ id: situation.id, expectedRevision: 1 });
    const retracted = h.system.retractPerformance({ id: record.id, expectedRevision: 1 });
    assert.equal(retracted.revisions.length, 2);
    assert.deepEqual(clone(retracted.revisions[1].provenance), { authority: "commander", operation: "retract" });
    assert.equal(retracted.revisions[1].performedAt, performedAt);
    assert.equal(h.system.getPerformance({ id: record.id }).current.status, "retracted");
    unchanged(h, () => h.system.retractPerformance({ id: record.id, expectedRevision: 1 }));
    unchanged(h, () => h.system.retractPerformance({ id: record.id, expectedRevision: 2 }));
  }
});

for (const failure of ["false", "throw", "missing"]) test(`save ${failure} never publishes report or retraction`, () => {
  const { h } = setup();
  h.founder.unrelatedPerformanceSentinel = { value: "unchanged" };
  h.CommanderSystem.save = failure === "missing" ? undefined : () => { if (failure === "throw") throw new Error("failed"); return false; };
  unchanged(h, () => report(h));
  h.CommanderSystem.save = () => true;
  const record = report(h); const live = h.founder.candidateMovePerformances; const snapshot = clone(live);
  h.CommanderSystem.save = failure === "missing" ? undefined : () => { if (failure === "throw") throw new Error("failed"); return false; };
  unchanged(h, () => h.system.retractPerformance({ id: record.id, expectedRevision: 1 }));
  assert.equal(h.founder.candidateMovePerformances, live);
  assert.deepEqual(clone(live), snapshot);
  assert.deepEqual(clone(h.founder.unrelatedPerformanceSentinel), { value: "unchanged" });
});

for (const returned of [undefined, 1, "true", {}]) test(`save ${String(returned)} is not confirmed for report or retraction`, () => {
  const { h } = setup();
  h.founder.unrelatedPerformanceSentinel = { value: "unchanged" };
  h.CommanderSystem.save = () => returned;
  unchanged(h, () => report(h));
  assert.equal(Object.hasOwn(h.founder, "candidateMovePerformances"), false);
  assert.deepEqual(clone(h.founder.unrelatedPerformanceSentinel), { value: "unchanged" });
  h.CommanderSystem.save = () => true;
  const record = report(h); const live = h.founder.candidateMovePerformances; const snapshot = clone(live);
  h.CommanderSystem.save = () => returned;
  unchanged(h, () => h.system.retractPerformance({ id: record.id, expectedRevision: 1 }));
  assert.equal(h.founder.candidateMovePerformances, live);
  assert.deepEqual(clone(live), snapshot);
  assert.deepEqual(clone(h.founder.unrelatedPerformanceSentinel), { value: "unchanged" });
});

const corruptions = [
  ["bad schemaVersion", (c) => { c.schemaVersion = 2; }],
  ["extra collection key", (c) => { c.extra = true; }],
  ["missing records", (c) => { delete c.records; }],
  ["records not array", (c) => { c.records = {}; }],
  ["malformed record ID", (c) => { c.records[0].id = "bad"; }],
  ["duplicate record IDs", (c) => { c.records.push(clone(c.records[0])); }],
  ["extra record key", (c) => { c.records[0].extra = true; }],
  ["invalid candidateMoveId", (c) => { c.records[0].candidateMoveId = "wrong"; }],
  ["zero candidateMoveRevision", (c) => { c.records[0].candidateMoveRevision = 0; }],
  ["negative candidateMoveRevision", (c) => { c.records[0].candidateMoveRevision = -1; }],
  ["fractional candidateMoveRevision", (c) => { c.records[0].candidateMoveRevision = 1.5; }],
  ["empty revisions", (c) => { c.records[0].revisions = []; }],
  ["null revision", (c) => { c.records[0].revisions = [null]; }],
  ["non-object revision", (c) => { c.records[0].revisions = ["bad"]; }],
  ["first revision number not 1", (c) => { c.records[0].revisions[0].revision = 2; }],
  ["gapped revisions", (c) => { c.records[0].revisions.push({ ...retractionOf(c.records[0]), revision: 3 }); }],
  ["out-of-order revisions", (c) => { const initial = clone(c.records[0].revisions[0]); c.records[0].revisions = [retractionOf(c.records[0]), initial]; }],
  ["first revision retracted", (c) => { c.records[0].revisions[0].status = "retracted"; c.records[0].revisions[0].provenance.operation = "retract"; }],
  ["report operation with retracted status", (c) => { c.records[0].revisions[0].status = "retracted"; }],
  ["retract operation with reported status", (c) => { c.records[0].revisions.push({ ...retractionOf(c.records[0]), status: "reported" }); }],
  ["non-Commander provenance", (c) => { c.records[0].revisions[0].provenance.authority = "system"; }],
  ["extra revision key", (c) => { c.records[0].revisions[0].extra = true; }],
  ["extra provenance key", (c) => { c.records[0].revisions[0].provenance.extra = true; }],
  ["malformed performedAt", (c) => { c.records[0].revisions[0].performedAt = "bad"; }],
  ["Date-parseable noncanonical performedAt", (c) => { c.records[0].revisions[0].performedAt = "2026-09-20T18:00:00Z"; }],
  ["malformed recordedAt", (c) => { c.records[0].revisions[0].recordedAt = "bad"; }],
  ["Date-parseable noncanonical recordedAt", (c) => { c.records[0].revisions[0].recordedAt = "2026-09-20T18:00:00Z"; }],
  ["performedAt changed during retraction", (c) => { c.records[0].revisions.push({ ...retractionOf(c.records[0]), performedAt: "2026-09-21T18:00:00.000Z" }); }],
  ["third revision after retraction", (c) => { c.records[0].revisions.push(retractionOf(c.records[0]), { ...clone(c.records[0].revisions[0]), revision: 3, status: "reported", provenance: { authority: "commander", operation: "report" } }); }],
];

for (const [label, corrupt] of corruptions) test(`malformed ${label} poisons the whole collection without repair`, () => {
  const { h } = setup();
  const record = report(h); report(h);
  corrupt(h.founder.candidateMovePerformances);
  const before = JSON.stringify(h.founder);
  for (const read of [h.system.getPerformances(), h.system.getPerformance({ id: record.id }), h.system.getPerformanceHistory({ id: record.id })]) {
    assert.equal(read.status, "unavailable");
    assert.equal(Object.hasOwn(read, "records"), false);
  }
  unchanged(h, () => report(h));
  unchanged(h, () => h.system.retractPerformance({ id: record.id, expectedRevision: 1 }));
  assert.equal(JSON.stringify(h.founder), before);
});

test("all public Performance read APIs are fully detached", () => {
  const { h } = setup(); const record = report(h); const expected = JSON.stringify(h.founder);
  const list = h.system.getPerformances();
  list.extra = true;
  list.performances.extra = true;
  list.performances.records.push({ id: "performance_fake_fake" });
  list.performances.records[0].candidateMoveId = "wrong";
  list.performances.records[0].revisions[0].performedAt = "2026-01-01T00:00:00.000Z";
  list.performances.records[0].revisions[0].provenance.authority = "other";
  list.records.push({ id: "fake" });
  list.records[0].acceptedAction = "Mutated";
  const detail = h.system.getPerformance({ id: record.id });
  detail.extra = true;
  detail.performance.extra = true;
  detail.performance.revisions.length = 0;
  detail.current.extra = true;
  detail.current.acceptedAction = "Mutated";
  const history = h.system.getPerformanceHistory({ id: record.id });
  history.extra = true;
  history.revisions.push({ revision: 2 });
  history.revisions[0].performedAt = "2026-01-01T00:00:00.000Z";
  history.revisions[0].provenance.operation = "mutated";
  assert.equal(JSON.stringify(h.founder), expected);
  const reread = h.system.getPerformances();
  assert.equal(reread.performances.records.length, 1);
  assert.equal(reread.performances.records[0].candidateMoveId, h.move.id);
  assert.equal(reread.records[0].acceptedAction, "Call Bob.");
  assert.equal(h.system.getPerformance({ id: record.id }).performance.revisions.length, 1);
  assert.equal(h.system.getPerformanceHistory({ id: record.id }).revisions[0].provenance.operation, "report");
});

test("Performance reads never ask the implicit clock, write, or mutate lifecycle", () => {
  const { h } = setup(); const record = report(h); const before = JSON.stringify(h.founder); const writes = h.writes.length;
  vm.runInContext("const PerformanceReadNativeDate = Date; globalThis.Date = class extends PerformanceReadNativeDate { constructor(...args) { if (!args.length) throw new Error('implicit clock'); super(...args); } static now() { throw new Error('implicit clock'); } };", h.context);
  assert.equal(h.system.getPerformances().records[0].status, "reported");
  assert.equal(h.system.getPerformance({ id: record.id }).current.status, "reported");
  assert.equal(h.system.getPerformanceHistory({ id: record.id }).revisions.length, 1);
  assert.equal(JSON.stringify(h.founder), before);
  assert.equal(h.writes.length, writes);
});

test("deterministic Performance ID collision rejects without publication, overwrite, or aliasing", () => {
  const { h } = setup();
  installFixedClock(h, "2026-09-20T18:00:00.000Z");
  vm.runInContext("Math.random = () => 0.5;", h.context);
  const first = report(h); const live = h.founder.candidateMovePerformances; const before = clone(live); const writes = h.writes.length;
  assert.throws(() => report(h));
  assert.equal(h.founder.candidateMovePerformances, live);
  assert.deepEqual(clone(live), before);
  assert.equal(live.records.length, 1);
  assert.equal(live.records[0].id, first.id);
  assert.equal(h.writes.length, writes);
});

test("timestamp boundaries preserve Commander supplied performedAt and revision-specific recordedAt", () => {
  const equal = setup().h;
  installFixedClock(equal, performedAt);
  const equalRecord = report(equal, 1, performedAt);
  assert.equal(equalRecord.revisions[0].performedAt, equalRecord.revisions[0].recordedAt);

  const future = setup().h;
  const recordedAt = "2026-09-19T18:00:00.000Z";
  installFixedClock(future, recordedAt);
  const futureRecord = report(future, 1, performedAt);
  assert.equal(futureRecord.revisions[0].performedAt, performedAt);
  assert.equal(futureRecord.revisions[0].recordedAt, recordedAt);
  assert.ok(futureRecord.revisions[0].performedAt > futureRecord.revisions[0].recordedAt);

  const retraction = setup().h;
  installFixedClock(retraction, "2026-09-20T18:00:00.000Z");
  const reported = report(retraction, 1, "2026-09-01T18:00:00.000Z");
  vm.runInContext("globalThis.__performanceClock = '2026-09-21T18:00:00.000Z';", retraction.context);
  const retracted = retraction.system.retractPerformance({ id: reported.id, expectedRevision: 1 });
  assert.equal(retracted.revisions[1].performedAt, "2026-09-01T18:00:00.000Z");
  assert.equal(retracted.revisions[0].recordedAt, "2026-09-20T18:00:00.000Z");
  assert.equal(retracted.revisions[1].recordedAt, "2026-09-21T18:00:00.000Z");
  assert.match(retracted.revisions[1].recordedAt, canonicalPattern);
});

test("owner has no downstream, storage, UI, timer, completion, or automatic-time dependencies", () => {
  assert.doesNotMatch(sources[4], /CandidateMoveCommitmentSystem|CandidateMoveRoutineSystem|CandidateMoveScheduleSystem|SituationSystem|AttentionSystem|AttentionCandidateSystem|TemporalProjectionSystem|OperatingBriefingSystem|localStorage|document\.|window\.|dispatchEvent|setTimeout|setInterval/);
  const { h } = setup();
  const refs = { move: h.founder.candidateMove, situation: h.founder.situation, commitments: h.founder.commitments, schedules: h.founder.candidateMoveSchedules, routines: h.founder.routines };
  report(h);
  assert.equal(h.founder.candidateMove, refs.move);
  assert.equal(h.founder.situation, refs.situation);
  assert.equal(h.founder.commitments, refs.commitments);
  assert.equal(h.founder.candidateMoveSchedules, refs.schedules);
  assert.equal(h.founder.routines, refs.routines);
  for (const method of ["complete", "correct", "cancel", "reschedule", "restore", "getCurrentPerformance", "getDuePerformances"]) assert.equal(h.system[method], undefined);
});