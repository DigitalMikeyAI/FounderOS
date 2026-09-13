const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(__dirname, "..");
const paths = ["js/storage.js", "systems/commander.system.js", "systems/situation.system.js", "systems/candidate-move.system.js", "systems/candidate-move-hold.system.js", "systems/candidate-move-dependency.system.js", "systems/candidate-move-availability.system.js", "systems/move-state.system.js", "systems/candidate-move-commitment.system.js", "systems/memory.system.js"];
const source = Object.fromEntries(paths.map((file) => [file, fs.readFileSync(path.join(root, file), "utf8")]));
const clone = (value) => JSON.parse(JSON.stringify(value));
const due = "2026-09-18T19:00:00.000Z";
function store(initial = {}, behavior = {}) { const values = new Map(Object.entries(initial)); const operations = []; return { get length() { return values.size; }, key(i) { return Array.from(values.keys())[i] || null; }, getItem(key) { operations.push(["get", key]); return behavior.getItem ? behavior.getItem(key, values) : (values.has(key) ? values.get(key) : null); }, setItem(key, value) { operations.push(["set", key, String(value)]); if (behavior.setItem) behavior.setItem(key, String(value), values); else values.set(key, String(value)); }, removeItem(key) { values.delete(key); }, get values() { return values; }, operations }; }
function load({ initial = {}, behavior = {}, commander = true, memory = false } = {}) { const localStorage = store(initial, behavior); const calls = { memory: 0, intelligence: 0, guidance: 0, briefing: 0, delivery: 0, notification: 0, refresh: 0 }; const context = vm.createContext({ Date, Math, JSON, localStorage, sessionStorage: store(), console: { log() {}, warn() {}, error() {} }, MemorySystem: memory ? { saveArtifact() { calls.memory += 1; } } : undefined, MissionIntelligenceSystem: { process() { calls.intelligence += 1; } }, GuidanceSystem: { build() { calls.guidance += 1; } }, BriefingSystem: { build() { calls.briefing += 1; } }, CommunicationSystem: { deliver() { calls.delivery += 1; } }, showNotification() { calls.notification += 1; }, refreshSession() { calls.refresh += 1; } }); for (const file of paths.slice(0, 9)) { if (file === "systems/commander.system.js" && !commander) continue; vm.runInContext(source[file], context, { filename: file }); } if (memory) vm.runInContext(source["systems/memory.system.js"], context); vm.runInContext(";globalThis.__api={founder,loadFounder,saveFounder,CommanderSystem:typeof CommanderSystem==='undefined'?null:CommanderSystem,MemorySystem:typeof MemorySystem==='undefined'?null:MemorySystem,SituationSystem,CandidateMoveSystem,CandidateMoveCommitmentSystem,MoveStateSystem};", context); return { api: context.__api, localStorage, calls }; }
function setup(options = {}) { const h = load(options); h.api.loadFounder(); const s = h.api.SituationSystem.createSituation({ subject: "Package", currentReality: "Final package is ready." }); const m = h.api.CandidateMoveSystem.createCandidateMove({ situationId: s.id, action: "Send the final package." }); return { h, s, m }; }
function create(h, m, window = { kind: "deadline", dueAt: due }) { return h.api.CandidateMoveCommitmentSystem.createCommitment({ candidateMoveId: m.id, expectedCandidateMoveRevision: h.api.CandidateMoveSystem.getCandidateMove().current.revision, window }); }
function records(overrides = {}) { return { schemaVersion: 1, records: [{ id: "commitment_test_abc", candidateMoveId: "candidate_move_test_abc", candidateMoveRevision: 1, revisions: [{ revision: 1, status: "active", window: { kind: "deadline", dueAt: due }, provenance: { authority: "commander", operation: "create" }, recordedAt: "2026-09-12T12:00:00.000Z" }] }], ...overrides }; }
function situationRecord() { return { schemaVersion: 1, id: "situation_test_abc", revisions: [{ revision: 1, subject: "Package", currentReality: "Final package is ready.", carryStatus: "active", provenance: { authority: "commander", operation: "create" }, recordedAt: "2026-09-12T12:00:00.000Z" }] }; }
function moveRecord() { return { schemaVersion: 1, id: "candidate_move_test_abc", situationId: "situation_test_abc", revisions: [{ revision: 1, action: "Send the final package.", status: "active", provenance: { authority: "commander", operation: "create" }, recordedAt: "2026-09-12T12:00:00.000Z" }] }; }

test("only explicit create establishes Commitment and stores exact accepted Candidate Move revision", () => {
  const { h, m } = setup(); assert.equal(Object.hasOwn(h.api.founder, "commitments"), false); const created = create(h, m);
  assert.equal(created.candidateMoveId, m.id); assert.equal(created.candidateMoveRevision, 1); assert.equal(created.revisions[0].status, "active"); assert.equal(h.api.founder.commitments.records.length, 1);
  const read = h.api.CandidateMoveCommitmentSystem.getCommitment({ id: created.id }); assert.equal(read.current.acceptedAction, "Send the final package."); assert.equal(read.current.currentMoveStatus, "active");
});

test("deadline validation, correction, and window state are exact and write-free", () => {
  const { h, m } = setup(); for (const bad of ["2026-09-18T19:00:00Z", "2026-09-18T19:00:00.000+00:00", "2026-02-30T19:00:00.000Z", "tomorrow", "2026-09-18T19:00:00.00Z"]) assert.throws(() => create(h, m, { kind: "deadline", dueAt: bad })); assert.throws(() => create(h, m, { kind: "range", dueAt: due })); assert.throws(() => create(h, m, { kind: "deadline", dueAt: due, startAt: due }));
  const created = create(h, m, { kind: "deadline", dueAt: "2020-01-01T00:00:00.000Z" }); assert.equal(h.api.CandidateMoveCommitmentSystem.getCommitmentWindowState({ id: created.id, asOf: "2020-01-01T00:00:00.000Z" }).windowState, "open"); assert.equal(h.api.CandidateMoveCommitmentSystem.getCommitmentWindowState({ id: created.id, asOf: "2020-01-01T00:00:00.001Z" }).windowState, "passed");
  const corrected = h.api.CandidateMoveCommitmentSystem.correctCommitmentWindow({ id: created.id, expectedRevision: 1, window: { kind: "deadline", dueAt: due } }); assert.equal(corrected.revisions.length, 2); assert.equal(corrected.revisions[0].window.dueAt, "2020-01-01T00:00:00.000Z"); const writes = h.localStorage.operations.filter(([type]) => type === "set").length; assert.equal(h.api.CandidateMoveCommitmentSystem.correctCommitmentWindow({ id: created.id, expectedRevision: 2, window: { kind: "deadline", dueAt: due } }).revisions.length, 2); assert.equal(h.localStorage.operations.filter(([type]) => type === "set").length, writes);
});

test("completion, cancellation, repeated episodes, and move/situation changes preserve Commitment binding", () => {
  const { h, s, m } = setup(); const first = create(h, m); const completed = h.api.CandidateMoveCommitmentSystem.completeCommitment({ id: first.id, expectedRevision: 1 }); assert.equal(completed.revisions[1].status, "completed"); assert.deepEqual(completed.revisions[1].window, completed.revisions[0].window); assert.throws(() => h.api.CandidateMoveCommitmentSystem.cancelCommitment({ id: first.id, expectedRevision: 2 }));
  const second = create(h, m); assert.notEqual(second.id, first.id); const canceled = h.api.CandidateMoveCommitmentSystem.cancelCommitment({ id: second.id, expectedRevision: 1 }); assert.equal(canceled.revisions[1].status, "canceled"); const third = create(h, m); assert.notEqual(third.id, second.id);
  h.api.CandidateMoveSystem.correctCandidateMove({ id: m.id, expectedRevision: 1, action: "Send the revised final package." }); h.api.SituationSystem.closeSituation({ id: s.id, expectedRevision: 1 }); assert.equal(h.api.CandidateMoveCommitmentSystem.getCommitment({ id: third.id }).current.candidateMoveRevision, 1); assert.equal(h.api.CandidateMoveCommitmentSystem.correctCommitmentWindow({ id: third.id, expectedRevision: 1, window: { kind: "deadline", dueAt: "2026-09-19T19:00:00.000Z" } }).revisions.length, 2);
});

test("withdrawn Candidate Move preserves active Commitment lifecycle but rejects new commitments", () => {
  const { h, m } = setup(); const created = create(h, m); h.api.CandidateMoveSystem.withdrawCandidateMove({ id: m.id, expectedRevision: 1 }); assert.equal(h.api.CandidateMoveCommitmentSystem.getCommitment({ id: created.id }).current.status, "active"); assert.throws(() => create(h, m)); assert.equal(h.api.CandidateMoveCommitmentSystem.completeCommitment({ id: created.id, expectedRevision: 1 }).revisions[1].status, "completed");
});

test("collection corruption and read distinctions fail closed without reviving older records", () => {
  const absent = setup().h; assert.equal(absent.api.CandidateMoveCommitmentSystem.getCommitments().status, "absent"); absent.api.founder.commitments = { schemaVersion: 1, records: [] }; assert.equal(absent.api.CandidateMoveCommitmentSystem.getCommitments().status, "available"); assert.equal(absent.api.CandidateMoveCommitmentSystem.getCommitment({ id: "missing" }).status, "absent");
  const bads = [records({ schemaVersion: 2 }), records({ records: {} }), records({ records: [records().records[0], records().records[0]] }), records({ records: [{ ...records().records[0], candidateMoveRevision: 99 }] }), records({ records: [{ ...records().records[0], revisions: [...records().records[0].revisions, { revision: 2, status: "completed", window: { kind: "deadline", dueAt: "2026-09-19T19:00:00.000Z" }, provenance: { authority: "commander", operation: "complete" }, recordedAt: "2026-09-12T13:00:00.000Z" }] }] })];
  for (const commitments of bads) { const h = load({ initial: { digitalMikeyFounder: JSON.stringify({ situation: situationRecord(), candidateMove: moveRecord(), commitments }) } }); h.api.loadFounder(); assert.equal(h.api.CandidateMoveCommitmentSystem.getCommitments().status, "unavailable"); }
});

test("Commitment persistence failures, publication ordering, and mirror degradation are truthful", () => {
  let fail = false; const primary = setup({ behavior: { setItem(key, value, values) { if (fail && key === "digitalMikeyFounder") throw new Error("primary failed"); values.set(key, value); } } }); fail = true; assert.throws(() => create(primary.h, primary.m), /primary failed/); assert.equal(Object.hasOwn(primary.h.api.founder, "commitments"), false);
  for (const result of [false, null, undefined]) { const item = setup(); item.h.api.CommanderSystem.save = () => result; assert.throws(() => create(item.h, item.m), /not confirmed/); assert.equal(Object.hasOwn(item.h.api.founder, "commitments"), false); }
  const unsafe = setup(); Object.defineProperty(unsafe.h.api.founder, "commitments", { configurable: true, set() { throw new Error("setter"); } }); const writes = unsafe.h.localStorage.operations.filter(([type]) => type === "set").length; assert.throws(() => create(unsafe.h, unsafe.m)); assert.equal(unsafe.h.localStorage.operations.filter(([type]) => type === "set").length, writes);
  let observed; let failLegacy = false; const mirror = setup({ behavior: { setItem(key, value, values) { if (failLegacy && key === "digitalMikeyFounder") observed = mirror.h.api.founder.commitments; if (failLegacy && key === "founder") throw new Error("legacy failed"); values.set(key, value); } } }); failLegacy = true; const created = create(mirror.h, mirror.m); assert.equal(observed, undefined); assert.equal(mirror.h.api.founder.commitments.records[0].id, created.id);
});

test("Commitment reads, reload, preservation, and Move State isolation remain bounded", () => {
  const { h, s, m } = setup({ memory: true }); h.api.founder.memory.artifacts = { artifact: { id: "a" } }; h.api.founder.profile = { strengths: ["Existing"] }; const refs = { founder: h.api.founder, situation: h.api.founder.situation, move: h.api.founder.candidateMove, memory: h.api.founder.memory, artifacts: h.api.founder.memory.artifacts, profile: h.api.founder.profile }; const created = create(h, m); const before = h.localStorage.operations.length; const read = h.api.CandidateMoveCommitmentSystem.getCommitment({ id: created.id }); read.commitment.revisions[0].window.dueAt = "2020-01-01T00:00:00.000Z"; h.api.CandidateMoveCommitmentSystem.getCommitmentWindowState({ id: created.id, asOf: due }); assert.equal(h.localStorage.operations.length, before); assert.equal(h.api.founder.commitments.records[0].revisions[0].window.dueAt, due); assert.equal(h.api.MoveStateSystem.getMoveState().state, "clarify");
  assert.equal(h.api.founder, refs.founder); assert.equal(h.api.founder.situation, refs.situation); assert.equal(h.api.founder.candidateMove, refs.move); assert.equal(h.api.founder.memory, refs.memory); assert.equal(h.api.founder.memory.artifacts, refs.artifacts); assert.equal(h.api.founder.profile, refs.profile); assert.deepEqual(h.calls, { memory: 0, intelligence: 0, guidance: 0, briefing: 0, delivery: 0, notification: 0, refresh: 0 }); h.api.saveFounder(); h.api.MemorySystem.saveArtifact({ type: "artifact", value: true }); const second = load({ initial: { digitalMikeyFounder: h.localStorage.values.get("digitalMikeyFounder") } }); second.api.loadFounder(); assert.equal(second.api.CandidateMoveCommitmentSystem.getCommitment({ id: created.id }).current.acceptedAction, "Send the final package.");
});

const strictSchemaCases = [
  ["collection metadata", (c) => { c.metadata = {}; }],
  ["record recommendation", (c) => { c.records[0].recommendation = "act"; }],
  ["revision metadata", (c) => { c.records[0].revisions[0].metadata = {}; }],
  ["provenance metadata", (c) => { c.records[0].revisions[0].provenance.metadata = {}; }],
  ["record priority", (c) => { c.records[0].priority = 1; }],
  ["revision priority", (c) => { c.records[0].revisions[0].priority = 1; }],
  ["provenance urgency", (c) => { c.records[0].revisions[0].provenance.urgency = true; }],
  ["provenance attention", (c) => { c.records[0].revisions[0].provenance.attention = true; }],
  ["provenance inferredUrgency", (c) => { c.records[0].revisions[0].provenance.inferredUrgency = true; }],
  ["window extra field", (c) => { c.records[0].revisions[0].window.priority = 1; }],
  ["unsupported newest revision", (c) => {
    c.records[0].revisions.push({ ...clone(c.records[0].revisions[0]), revision: 2,
      window: { kind: "deadline", dueAt: "2026-09-19T19:00:00.000Z" },
      provenance: { authority: "commander", operation: "correct-window" }, priority: 1 });
  }],
];

for (const [label, corrupt] of strictSchemaCases) {
  test(`strict Commitment schema rejects persisted ${label} without fallback or writes`, () => {
    const commitments = records(); corrupt(commitments);
    const h = load({ initial: { digitalMikeyFounder: JSON.stringify({
      situation: situationRecord(), candidateMove: moveRecord(), commitments,
    }) } });
    h.api.loadFounder();
    const system = h.api.CandidateMoveCommitmentSystem;
    const before = JSON.stringify(h.api.founder);
    const operations = h.localStorage.operations.length;
    const id = commitments.records[0].id;
    for (const result of [system.getCommitments(), system.getCommitment({ id }),
      system.getCommitmentHistory({ id }), system.getCommitmentWindowState({ id, asOf: due })]) {
      assert.equal(result.status, "unavailable");
      assert.equal(result.reason, "commitment-collection-corrupt");
      assert.equal(Object.hasOwn(result, "current"), false);
    }
    assert.throws(() => system.createCommitment({ candidateMoveId: "candidate_move_test_abc", expectedCandidateMoveRevision: 1, window: { kind: "deadline", dueAt: due } }));
    assert.throws(() => system.correctCommitmentWindow({ id, expectedRevision: 1, window: { kind: "deadline", dueAt: due } }));
    assert.throws(() => system.completeCommitment({ id, expectedRevision: 1 }));
    assert.throws(() => system.cancelCommitment({ id, expectedRevision: 1 }));
    assert.equal(JSON.stringify(h.api.founder), before);
    assert.equal(h.localStorage.operations.length, operations);
  });
}

test("canonical persisted collection and every Commitment operation retain exact schema", () => {
  const canonical = load({ initial: { digitalMikeyFounder: JSON.stringify({
    situation: situationRecord(), candidateMove: moveRecord(), commitments: records(),
  }) } });
  canonical.api.loadFounder();
  assert.equal(canonical.api.CandidateMoveCommitmentSystem.getCommitments().status, "available");
  const { h, m } = setup(); const system = h.api.CandidateMoveCommitmentSystem;
  const exact = (value, keys) => assert.deepEqual(Object.keys(value).sort(), [...keys].sort());
  const verify = () => {
    assert.equal(system.getCommitments().status, "available");
    const collection = h.api.founder.commitments;
    exact(collection, ["schemaVersion", "records"]);
    for (const record of collection.records) {
      exact(record, ["id", "candidateMoveId", "candidateMoveRevision", "revisions"]);
      for (const revision of record.revisions) {
        exact(revision, ["revision", "status", "window", "provenance", "recordedAt"]);
        exact(revision.provenance, ["authority", "operation"]);
        exact(revision.window, ["kind", "dueAt"]);
      }
    }
    const reloaded = load({ initial: { digitalMikeyFounder: h.localStorage.values.get("digitalMikeyFounder") } });
    reloaded.api.loadFounder();
    assert.equal(reloaded.api.CandidateMoveCommitmentSystem.getCommitments().status, "available");
    assert.deepEqual(clone(reloaded.api.founder.commitments), clone(collection));
  };
  const first = create(h, m); verify();
  system.correctCommitmentWindow({ id: first.id, expectedRevision: 1, window: { kind: "deadline", dueAt: "2026-09-19T19:00:00.000Z" } }); verify();
  system.completeCommitment({ id: first.id, expectedRevision: 2 }); verify();
  const second = create(h, m); verify();
  system.cancelCommitment({ id: second.id, expectedRevision: 1 }); verify();
});
