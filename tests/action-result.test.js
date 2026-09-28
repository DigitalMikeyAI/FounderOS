const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const files = ["js/storage.js", "systems/commander.system.js", "systems/situation.system.js", "systems/candidate-move.system.js", "systems/candidate-move-performance.system.js", "systems/action-result.system.js"];
const sources = files.map((file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8"));
const clone = (value) => JSON.parse(JSON.stringify(value));
const performedAt = "2026-09-20T18:00:00.000Z";
const occurredAt = "2026-09-20T18:05:00.000Z";
const canonicalPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

function load(snapshot, behavior = {}) {
  const values = new Map(snapshot ? [["digitalMikeyFounder", snapshot]] : []); const writes = [];
  const storage = { getItem(key) { return values.get(key) ?? null; }, setItem(key, value) { writes.push([key, value]); if (behavior.write) behavior.write(key, value); values.set(key, value); }, removeItem(key) { values.delete(key); }, get length() { return values.size; }, key(index) { return [...values.keys()][index] ?? null; } };
  const context = vm.createContext({ console: { log() {}, warn() {}, error() {} }, localStorage: storage, sessionStorage: storage });
  files.forEach((file, index) => vm.runInContext(sources[index], context, { filename: file }));
  const api = vm.runInContext("({ founder, loadFounder, CommanderSystem, SituationSystem, CandidateMoveSystem, CandidateMovePerformanceSystem, system: ActionResultSystem })", context);
  api.loadFounder(); return { ...api, context, values, writes };
}
function setup() { const h = load(); const situation = h.SituationSystem.createSituation({ subject: "Proposal", currentReality: "Ready." }); h.move = h.CandidateMoveSystem.createCandidateMove({ situationId: situation.id, action: "Call Bob." }); h.performance = h.CandidateMovePerformanceSystem.reportPerformance({ candidateMoveId: h.move.id, candidateMoveRevision: 1, performedAt }); return { h, situation }; }
function report(h, input = {}) { return h.system.reportActionResult({ performanceId: h.performance.id, text: "Customer asked for a revised proposal.", occurredAt, ...input }); }
function unchanged(h, fn) { const before = JSON.stringify(h.founder); const writes = h.writes.length; assert.throws(fn); assert.equal(JSON.stringify(h.founder), before); assert.equal(h.writes.length, writes); }
function retractPerformance(h) { return h.CandidateMovePerformanceSystem.retractPerformance({ id: h.performance.id, expectedRevision: 1 }); }
function installFixedClock(h, instant) { vm.runInContext(`const ActionResultNativeDate = Date; globalThis.__actionResultClock = ${JSON.stringify(instant)}; globalThis.Date = class extends ActionResultNativeDate { constructor(...args) { super(...(args.length ? args : [globalThis.__actionResultClock])); } static now() { return new ActionResultNativeDate(globalThis.__actionResultClock).getTime(); } };`, h.context); }
function plausiblePerformance(state, changes = {}) { return { status: "available", performance: { ...state.performance, ...(changes.performance || {}) }, current: { ...state.current, ...(changes.current || {}) } }; }
function rejectedRelationshipReport(h, input = {}) { let saves = 0; h.CommanderSystem.save = () => { saves += 1; return true; }; unchanged(h, () => report(h, input)); assert.equal(saves, 0); assert.equal(Object.hasOwn(h.founder, "actionResults"), false); }

test("healthy optional storage reports minimal independent records and derives the historical Performance relationship", () => {
  const { h } = setup(); assert.equal(h.system.getActionResults().status, "absent"); assert.equal(Object.hasOwn(h.founder, "actionResults"), false);
  const first = report(h, { text: "  Customer asked for a revised proposal.  " }); const second = report(h);
  assert.notEqual(first.id, second.id); assert.deepEqual(Object.keys(first).sort(), ["id", "performanceId", "revisions"]); assert.equal(first.performanceId, h.performance.id); assert.equal(first.revisions[0].text, "Customer asked for a revised proposal."); assert.equal(first.revisions[0].occurredAt, occurredAt); assert.match(first.revisions[0].recordedAt, canonicalPattern); assert.deepEqual(clone(first.revisions[0].provenance), { authority: "commander", operation: "report" });
  const current = h.system.getActionResult({ id: first.id }).current; assert.deepEqual({ performanceId: current.performanceId, performanceStatus: current.performanceStatus, candidateMoveId: current.candidateMoveId, candidateMoveRevision: current.candidateMoveRevision, acceptedAction: current.acceptedAction }, { performanceId: h.performance.id, performanceStatus: "reported", candidateMoveId: h.move.id, candidateMoveRevision: 1, acceptedAction: "Call Bob." }); assert.equal(Object.hasOwn(current, "performanceRevision"), false); assert.equal(h.system.getActionResults().records.length, 2);
});

test("identical text and instants are not deduplicated and occurredAt has no chronology interpretation", () => {
  const before = setup().h; assert.equal(report(before, { occurredAt: "2026-09-01T00:00:00.000Z" }).revisions[0].occurredAt, "2026-09-01T00:00:00.000Z");
  const equal = setup().h; installFixedClock(equal, performedAt); assert.equal(report(equal, { occurredAt: performedAt }).revisions[0].recordedAt, performedAt);
  const future = setup().h; installFixedClock(future, "2026-09-19T00:00:00.000Z"); const a = report(future, { occurredAt: "2027-01-01T00:00:00.000Z" }); const b = report(future, { occurredAt: "2027-01-01T00:00:00.000Z" }); assert.notEqual(a.id, b.id); assert.equal(a.revisions[0].occurredAt, "2027-01-01T00:00:00.000Z");
});

test("standing historical Performances remain eligible after Move correction, withdrawal, or Situation closure", () => {
  for (const change of ["correction", "withdrawal", "closure"]) {
    const { h, situation } = setup();
    if (change === "correction") h.CandidateMoveSystem.correctCandidateMove({ id: h.move.id, expectedRevision: 1, action: "Call Alice." });
    if (change === "withdrawal") h.CandidateMoveSystem.withdrawCandidateMove({ id: h.move.id, expectedRevision: 1 });
    if (change === "closure") h.SituationSystem.closeSituation({ id: situation.id, expectedRevision: 1 });
    const result = report(h); assert.equal(h.system.getActionResult({ id: result.id }).current.acceptedAction, "Call Bob.");
  }
});

test("retracted Performance rejects new Results while existing Results remain readable and retractable", () => {
  const { h } = setup(); const result = report(h); retractPerformance(h);
  unchanged(h, () => report(h)); const readable = h.system.getActionResult({ id: result.id }); assert.equal(readable.current.performanceStatus, "retracted"); assert.equal(readable.current.status, "reported");
  const retracted = h.system.retractActionResult({ id: result.id, expectedRevision: 1 }); assert.equal(retracted.revisions.length, 2); assert.equal(retracted.revisions[1].text, retracted.revisions[0].text); assert.equal(retracted.revisions[1].occurredAt, retracted.revisions[0].occurredAt); assert.deepEqual(clone(retracted.revisions[1].provenance), { authority: "commander", operation: "retract" });
});

test("Result retraction is terminal and stale protection publishes nothing", () => {
  const { h } = setup(); const result = report(h); unchanged(h, () => h.system.retractActionResult({ id: result.id, expectedRevision: 2 }));
  h.system.retractActionResult({ id: result.id, expectedRevision: 1 }); unchanged(h, () => h.system.retractActionResult({ id: result.id, expectedRevision: 1 })); unchanged(h, () => h.system.retractActionResult({ id: result.id, expectedRevision: 2 }));
});

test("invalid text, noncanonical instants, unavailable Performances, and malformed relationships fail closed", () => {
  const { h } = setup();
  for (const text of [null, "", "   ", "x".repeat(2001)]) unchanged(h, () => report(h, { text }));
  for (const value of [null, "bad", "2026-09-20T18:05:00Z", "2026-09-20T18:05:00.000+00:00", "2026-02-30T00:00:00.000Z"]) unchanged(h, () => report(h, { occurredAt: value }));
  unchanged(h, () => report(h, { performanceId: "performance_missing_abc" }));
  h.CandidateMovePerformanceSystem.getPerformance = () => ({ status: "available", performance: { id: h.performance.id }, current: {} });
  unchanged(h, () => report(h));
});

test("invalid requested Performance identities fail before upstream resolution or publication", () => {
  for (const performanceId of [null, "", "   ", "performance_a_b ", "wrong"]) {
    const { h } = setup(); const genuine = clone(h.CandidateMovePerformanceSystem.getPerformance({ id: h.performance.id })); let reads = 0; h.CandidateMovePerformanceSystem.getPerformance = ({ id }) => { reads += 1; return plausiblePerformance(genuine, { performance: { id }, current: { id } }); };
    rejectedRelationshipReport(h, { performanceId }); assert.equal(reads, 0);
  }
});

test("untrustworthy Performance relationship projections fail closed without publication", () => {
  const cases = [
    ["invalid matching raw identity", "", (h) => plausiblePerformance(h, { performance: { id: "" }, current: { id: "" } })],
    ["different raw identity", "performance_other_abc", (h) => plausiblePerformance(h, { performance: { id: "performance_other_abc" } })],
    ["different current identity", null, (h) => plausiblePerformance(h, { current: { id: "performance_other_abc" } })],
    ["empty Candidate Move identity", null, (h) => plausiblePerformance(h, { performance: { candidateMoveId: "" }, current: { candidateMoveId: "" } })],
    ["untrusted accepted action", null, (h) => plausiblePerformance(h, { current: { acceptedAction: " " } })],
  ];
  for (const [label, performanceId, response] of cases) {
    const { h } = setup(); const genuine = clone(h.CandidateMovePerformanceSystem.getPerformance({ id: h.performance.id })); h.CandidateMovePerformanceSystem.getPerformance = () => response(genuine);
    rejectedRelationshipReport(h, performanceId === null ? {} : { performanceId });
    assert.equal(label.length > 0, true);
  }
});

const corruptions = [
  ["bad schemaVersion", (c) => { c.schemaVersion = 2; }], ["extra collection key", (c) => { c.extra = true; }], ["missing records", (c) => { delete c.records; }], ["duplicate IDs", (c) => { c.records.push(clone(c.records[0])); }], ["extra record key", (c) => { c.records[0].extra = true; }], ["wrong Performance ID", (c) => { c.records[0].performanceId = "performance_missing_abc"; }], ["empty history", (c) => { c.records[0].revisions = []; }], ["wrong initial status", (c) => { c.records[0].revisions[0].status = "retracted"; }], ["untrimmed text", (c) => { c.records[0].revisions[0].text = " text "; }], ["noncanonical occurredAt", (c) => { c.records[0].revisions[0].occurredAt = "2026-09-20T18:05:00Z"; }], ["changed retraction content", (c) => { const r = clone(c.records[0].revisions[0]); c.records[0].revisions.push({ ...r, revision: 2, status: "retracted", text: "Changed", provenance: { authority: "commander", operation: "retract" } }); }], ["post-terminal history", (c) => { const r = clone(c.records[0].revisions[0]); c.records[0].revisions.push({ ...r, revision: 2, status: "retracted", provenance: { authority: "commander", operation: "retract" } }, { ...r, revision: 3 }); }],
];
for (const [label, corrupt] of corruptions) test(`malformed ${label} fails closed without repair`, () => {
  const { h } = setup(); const result = report(h); corrupt(h.founder.actionResults); const before = JSON.stringify(h.founder);
  for (const read of [h.system.getActionResults(), h.system.getActionResult({ id: result.id }), h.system.getActionResultHistory({ id: result.id })]) assert.equal(read.status, "unavailable");
  unchanged(h, () => report(h)); unchanged(h, () => h.system.retractActionResult({ id: result.id, expectedRevision: 1 })); assert.equal(JSON.stringify(h.founder), before);
});

test("all reads are deeply detached and never write or ask the implicit clock", () => {
  const { h } = setup(); const result = report(h); const expected = JSON.stringify(h.founder); const list = h.system.getActionResults(); list.actionResults.records[0].performanceId = "wrong"; list.records[0].acceptedAction = "Mutated"; const detail = h.system.getActionResult({ id: result.id }); detail.actionResult.revisions.length = 0; detail.current.text = "Mutated"; const history = h.system.getActionResultHistory({ id: result.id }); history.revisions[0].text = "Mutated"; assert.equal(JSON.stringify(h.founder), expected);
  vm.runInContext("const ActionResultReadNativeDate = Date; globalThis.Date = class extends ActionResultReadNativeDate { constructor(...args) { if (!args.length) throw new Error('implicit clock'); super(...args); } static now() { throw new Error('implicit clock'); } };", h.context);
  assert.equal(h.system.getActionResults().records[0].status, "reported"); assert.equal(h.system.getActionResultHistory({ id: result.id }).revisions.length, 1); assert.equal(JSON.stringify(h.founder), expected);
});

for (const failure of ["false", "throw", "missing"]) test(`save ${failure} publishes no Action Result state`, () => {
  const { h } = setup(); h.founder.unrelatedResultSentinel = { value: "unchanged" }; h.CommanderSystem.save = failure === "missing" ? undefined : () => { if (failure === "throw") throw new Error("failed"); return false; }; unchanged(h, () => report(h)); assert.equal(Object.hasOwn(h.founder, "actionResults"), false);
  h.CommanderSystem.save = () => true; const result = report(h); const live = h.founder.actionResults; const snapshot = clone(live); h.CommanderSystem.save = failure === "missing" ? undefined : () => { if (failure === "throw") throw new Error("failed"); return false; }; unchanged(h, () => h.system.retractActionResult({ id: result.id, expectedRevision: 1 })); assert.equal(h.founder.actionResults, live); assert.deepEqual(clone(live), snapshot); assert.deepEqual(clone(h.founder.unrelatedResultSentinel), { value: "unchanged" });
});

test("owner has no downstream, direct storage, UI, timer, outcome, completion, or inference API", () => {
  assert.doesNotMatch(sources[5], /CandidateMoveSystem|SituationSystem|CandidateMoveCommitmentSystem|CandidateMoveRoutineSystem|CandidateMoveScheduleSystem|CandidateMoveHoldSystem|CandidateMoveDependencySystem|CandidateMoveAvailabilitySystem|MoveStateSystem|AttentionSystem|TemporalProjectionSystem|MissionIntelligenceSystem|localStorage|document\.|window\.|dispatchEvent|setTimeout|setInterval/);
  const { h } = setup(); const refs = Object.fromEntries(["candidateMove", "situation", "candidateMovePerformances", "commitments", "candidateMoveSchedules", "routines", "profile", "memory"].map((key) => [key, { exists: Object.hasOwn(h.founder, key), value: h.founder[key] }]));
  const result = report(h); h.system.retractActionResult({ id: result.id, expectedRevision: 1 }); for (const [key, ref] of Object.entries(refs)) { assert.equal(Object.hasOwn(h.founder, key), ref.exists); assert.equal(h.founder[key], ref.value); }
  for (const method of ["complete", "succeed", "fail", "correct", "update", "delete", "restore", "reopen", "getCurrentResult", "getDueResults"]) assert.equal(h.system[method], undefined);
});
