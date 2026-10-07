const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const assemblerFile = path.join(root, "systems", "operating-context-assembler.system.js");
const gatewayFile = path.join(root, "systems", "founderos-ai-gateway.system.js");
const assemblerSource = fs.readFileSync(assemblerFile, "utf8");
const gatewaySource = fs.readFileSync(gatewayFile, "utf8");
const asOf = "2026-10-02T12:00:00.000Z";
const recordedAt = "2026-09-30T12:00:00.000Z";
const request = { requestType: "situation-explanation", asOf };
const clone = (value) => JSON.parse(JSON.stringify(value));

function harness() {
  const owner = {
    situation: { status: "available", situation: { revisions: [{ revision: 1, recordedAt }] }, current: { id: "situation_test_aaa", revision: 1, subject: "Approval", currentReality: "Approval is pending.", carryStatus: "active" } },
    move: { status: "available", candidateMove: { revisions: [{ revision: 1, recordedAt }] }, current: { id: "candidate_move_test_aaa", situationId: "situation_test_aaa", revision: 1, action: "Send package.", status: "active" } },
  };
  const runtime = vm.createContext({ Date, JSON,
    SituationSystem: { getSituation() { return clone(owner.situation); } }, CandidateMoveSystem: { getCandidateMove() { return clone(owner.move); } },
    CandidateMoveHoldSystem: { getHold() { return { status: "absent", hold: null }; } }, CandidateMoveDependencySystem: { getDependency() { return { status: "absent", dependency: null }; } },
    CandidateMoveAvailabilitySystem: { getAvailability() { return { status: "absent", availability: null }; } }, CandidateMoveCommitmentSystem: { getCommitments() { return { status: "absent", commitments: null }; } },
    CandidateMoveRoutineSystem: { getRoutines() { return { status: "absent" }; } }, MoveStateSystem: { getMoveState() { return { status: "available", state: "clarify", candidateMoveId: owner.move.current.id, candidateMoveRevision: 1, basis: { kind: "insufficient-operating-truth", references: [] } }; } },
  });
  vm.runInContext(assemblerSource, runtime, { filename: assemblerFile }); vm.runInContext(gatewaySource, runtime, { filename: gatewayFile });
  const api = vm.runInContext("({ assembler: OperatingContextAssembler, gateway: FounderOSAiGateway })", runtime);
  return { ...api, owner, runtime };
}

function context(h) { return clone(h.assembler.assemble(request)); }
function response(ctx, overrides = {}) {
  return { schemaVersion: 1, type: "ai-response", requestType: "situation-explanation", status: "available", authority: "non-authoritative-ai-output", explanation: "The Situation records pending approval and the current Move is to send the package.", uncertainties: [], citations: [clone(ctx.authoritative.situation.facts[0].reference)], proposal: null, ...overrides };
}
async function failure(h, ctx, output) {
  const provider = { async invoke() { return output; } };
  return clone(await h.gateway.invoke({ request, context: ctx, provider }));
}

function relationships(situationId = null, situationRevision = null, candidateMoveId = null, candidateMoveRevision = null) {
  return { situationId, situationRevision, candidateMoveId, candidateMoveRevision };
}

function reference(sourceType, recordId, revision, status, relationship = relationships()) {
  return { authority: "authoritative-operating-truth", sourceType, recordId, revision, status, recordedAt, relationships: relationship };
}

function availableSlot(sourceType, fact) {
  return { authority: "authoritative-operating-truth", sourceType, status: "available", reason: null, facts: fact ? [fact] : [] };
}

function unavailableSlot(sourceType, reason) {
  return { authority: "authoritative-operating-truth", sourceType, status: "unavailable", reason, facts: [] };
}

function setContextStatus(ctx) {
  const slots = [...Object.values(ctx.authoritative), ctx.derived.moveState];
  ctx.status = ctx.authoritative.situation.status === "unavailable" || ctx.authoritative.candidateMove.status === "unavailable"
    ? "unavailable" : slots.some((slot) => slot.status === "unavailable") ? "partial" : "available";
  ctx.issues = slots.filter((slot) => slot.status === "unavailable").map((slot) => ({
    sourceType: slot.sourceType, status: "unavailable", reason: slot.reason,
  }));
}

function setMoveState(ctx, state, kind, basisReferences = []) {
  ctx.derived.moveState = {
    authority: "derived-operating-state", sourceType: "move-state", status: "available", reason: null,
    facts: [{
      reference: { authority: "derived-operating-state", sourceType: "move-state", recordId: null, revision: null,
        status: state, recordedAt: null, relationships: relationships(null, null, ctx.scope.candidateMoveId, ctx.scope.candidateMoveRevision) },
      data: { state, basis: { kind, references: basisReferences } },
    }],
  };
  setContextStatus(ctx);
}

function setHold(ctx, status = "active") {
  ctx.authoritative.hold = availableSlot("hold", {
    reference: reference("hold", "candidate_move_hold_test_aaa", 1, status, relationships(null, null, ctx.scope.candidateMoveId)),
    data: { status },
  });
  setContextStatus(ctx);
}

function setDependency(ctx, status = "unresolved") {
  ctx.authoritative.dependency = availableSlot("dependency", {
    reference: reference("dependency", "candidate_move_dependency_test_aaa", 1, status, relationships(null, null, ctx.scope.candidateMoveId)),
    data: { description: "Waiting for approval.", status },
  });
  setContextStatus(ctx);
}

function setAvailability(ctx, status = "confirmed", isCurrent = true) {
  ctx.authoritative.availability = availableSlot("availability", {
    reference: reference("availability", "candidate_move_availability_test_aaa", 1, status,
      relationships(ctx.scope.situationId, 1, ctx.scope.candidateMoveId, ctx.scope.candidateMoveRevision)),
    data: { status, isCurrent, conditionsConfirmed: "Required conditions were checked." },
  });
  setContextStatus(ctx);
}

function setCommitment(ctx, acceptedAction = ctx.authoritative.candidateMove.facts[0].data.action) {
  ctx.authoritative.commitment = availableSlot("commitment", {
    reference: reference("commitment", "commitment_test_aaa", 1, "active",
      relationships(null, null, ctx.scope.candidateMoveId, ctx.scope.candidateMoveRevision)),
    data: { acceptedAction, status: "active", window: { kind: "deadline", dueAt: "2026-10-10T12:00:00.000Z" } },
  });
  setContextStatus(ctx);
}

function setRoutine(ctx, action = ctx.authoritative.candidateMove.facts[0].data.action) {
  ctx.authoritative.routine = availableSlot("routine", {
    reference: reference("routine", "routine_test_aaa", 1, "active",
      relationships(null, null, ctx.scope.candidateMoveId, ctx.scope.candidateMoveRevision)),
    data: { action, status: "active", schedule: { kind: "weekly-utc", weekday: 5, opensAtUtc: "09:00:00Z", closesAtUtc: "10:00:00Z" } },
  });
  setContextStatus(ctx);
}

async function invokeCount(h, ctx) {
  let calls = 0;
  let result = null;
  let error = null;
  try {
    result = clone(await h.gateway.invoke({ request, context: ctx, provider: { async invoke() {
      calls += 1; return response(ctx, { citations: [] });
    } } }));
  } catch (caught) {
    error = caught;
  }
  return { calls, result, error };
}

async function assertRejectedBeforeProvider(h, ctx) {
  const outcome = await invokeCount(h, ctx);
  assert.equal(outcome.calls, 0);
  assert.match(outcome.error && outcome.error.message, /Operating Context is invalid/);
}

async function assertAccepted(h, ctx) {
  const outcome = await invokeCount(h, ctx);
  assert.equal(outcome.error, null);
  assert.equal(outcome.calls, 1);
  assert.equal(outcome.result.status, "available");
}

test("gateway and deterministic fake provider APIs validate one detached successful response", async () => {
  const h = harness(); const ctx = context(h); const fixture = response(ctx); const provider = h.gateway.createFakeProvider({ response: fixture });
  const first = clone(await h.gateway.invoke({ request, context: ctx, provider })); const second = clone(await h.gateway.invoke({ request, context: ctx, provider }));
  assert.deepEqual(first, second); assert.equal(first.status, "available"); assert.equal(first.response.proposal, null); assert.equal(provider.getInvocationCount(), 2);
  first.response.explanation = "mutated"; assert.notEqual(fixture.explanation, "mutated");
});

test("provider request, caller context, owner output, provider fixture, and returned result are deeply detached", async () => {
  const h = harness(); const ctx = context(h); const ownerBefore = clone(h.owner); const callerBefore = clone(ctx); const fixture = response(ctx);
  const provider = { async invoke(input) { input.context.authoritative.situation.facts[0].data.currentReality = "provider mutation"; input.context.scope.situationId = "changed"; return fixture; } };
  const result = clone(await h.gateway.invoke({ request, context: ctx, provider }));
  assert.deepEqual(ctx, callerBefore); assert.deepEqual(h.owner, ownerBefore); assert.equal(result.status, "available");
  result.response.citations[0].relationships.situationId = "caller mutation";
  assert.notEqual(fixture.citations[0].relationships.situationId, "caller mutation");
});

test("caller mutation during provider wait cannot change the validated grounding snapshot", async () => {
  const h = harness(); const ctx = context(h); let release; let received;
  const provider = { invoke(input) { received = clone(input); return new Promise((resolve) => { release = () => resolve(response(received.context)); }); } };
  const pending = h.gateway.invoke({ request, context: ctx, provider });
  ctx.authoritative.situation.facts[0].reference.recordId = "situation_mutated_x";
  ctx.authoritative.situation.facts[0].data.currentReality = "Caller changed this while waiting.";
  release(); const result = clone(await pending);
  assert.equal(result.status, "available"); assert.equal(result.response.citations[0].recordId, "situation_test_aaa");
  assert.equal(received.context.authoritative.situation.facts[0].data.currentReality, "Approval is pending.");
});

test("unavailable context short-circuits provider and missing provider is structured unavailable", async () => {
  const h = harness(); h.owner.situation = { status: "unavailable", reason: "situation-corrupt" }; const ctx = context(h);
  let calls = 0; const provider = { async invoke() { calls += 1; } };
  const unavailable = clone(await h.gateway.invoke({ request, context: ctx, provider }));
  assert.equal(unavailable.failure.code, "context-unavailable"); assert.equal(unavailable.response, null); assert.equal(calls, 0);
  const healthy = harness(); const noProvider = clone(await healthy.gateway.invoke({ request, context: context(healthy), provider: null })); assert.equal(noProvider.failure.code, "provider-unavailable");
});

test("gateway classifies an oversized provider request before provider invocation", async () => {
  const h = harness(); const ctx = context(h); let calls = 0;
  ctx.authoritative.situation.facts[0].data.currentReality = "é".repeat(70000);
  const original = h.assembler.validateContext; h.assembler.validateContext = () => true;
  const result = clone(await h.gateway.invoke({ request, context: ctx, provider: { async invoke() { calls += 1; } } }));
  h.assembler.validateContext = original;
  assert.equal(result.failure.code, "context-too-large"); assert.equal(calls, 0);
});

test("AiResponseV1 rejects every malformed exact-shape and every non-null proposal", async () => {
  const h = harness(); const ctx = context(h); const valid = response(ctx);
  const variants = [null, undefined, "", {}, { ...valid, extra: true }, { ...valid, schemaVersion: 2 }, { ...valid, type: "other" }, { ...valid, requestType: "other" }, { ...valid, status: "failed" }, { ...valid, authority: "commander" }, { ...valid, explanation: " " }, { ...valid, explanation: "x".repeat(4001) }, { ...valid, uncertainties: null }, { ...valid, citations: null }, ...[{}, false, "", 0, { command: "save" }].map((proposal) => ({ ...valid, proposal }))];
  for (const value of variants) {
    const result = await failure(h, ctx, value); assert.equal(result.status, "failed"); assert.equal(result.response, null);
    const expected = value === null || value === undefined || value === "" ? "provider-empty-response" : value && value.schemaVersion === 2 ? "provider-unsupported-schema" : "provider-invalid-response";
    assert.equal(result.failure.code, expected);
  }
  const cyclic = {}; cyclic.self = cyclic;
  for (const value of [cyclic, { value: 1n }, { ...valid, extra: undefined }, { ...valid, extra: Number.NaN }, { ...valid, extra: Infinity }]) {
    assert.equal((await failure(h, ctx, value)).failure.code, "provider-invalid-response");
  }
});

test("citations require exact supplied references with semantic key-order independence and no duplicates", async () => {
  const h = harness(); const ctx = context(h); const citation = clone(ctx.authoritative.situation.facts[0].reference);
  const reordered = { relationships: clone(citation.relationships), recordedAt: citation.recordedAt, status: citation.status, revision: citation.revision, recordId: citation.recordId, sourceType: citation.sourceType, authority: citation.authority };
  assert.equal((await failure(h, ctx, response(ctx, { citations: [reordered] }))).status, "available");
  const attacks = [
    { ...citation, sourceType: "performance" }, { ...citation, recordId: "situation_invented_x" }, { ...citation, revision: 2 },
    { ...citation, status: "closed" }, { ...citation, recordedAt: "2026-09-29T12:00:00.000Z" },
    { ...citation, relationships: { ...citation.relationships, situationRevision: 1 } },
  ];
  for (const invented of attacks) assert.equal((await failure(h, ctx, response(ctx, { citations: [invented] }))).failure.code, "provider-invalid-response");
  assert.equal((await failure(h, ctx, response(ctx, { citations: [citation, clone(citation)] }))).failure.code, "provider-invalid-response");
  const absentCitation = clone(citation); absentCitation.sourceType = "hold"; absentCitation.recordId = null;
  assert.equal((await failure(h, ctx, response(ctx, { citations: [absentCitation] }))).failure.code, "provider-invalid-response");
});

test("uncertainties are narrow, status-bound explanatory metadata", async () => {
  const h = harness(); const ctx = context(h); const valid = [
    { kind: "source-absent", sourceType: "hold", detail: "No Hold is recorded." },
    { kind: "relationship-not-witnessed", sourceType: "candidate-move", detail: "The Move does not witness an exact Situation revision." },
    { kind: "unsupported-conclusion", sourceType: null, detail: "The context does not support that conclusion." },
  ];
  assert.equal((await failure(h, ctx, response(ctx, { uncertainties: valid }))).status, "available");
  const attacks = [
    { kind: "recommendation", sourceType: null, detail: "Act now." }, { kind: "source-absent", sourceType: "performance", detail: "Missing." },
    { kind: "source-unavailable", sourceType: "hold", detail: "Unavailable." }, { kind: "unsupported-conclusion", sourceType: "situation", detail: "Unknown." },
    { kind: "unsupported-conclusion", sourceType: null, detail: " " }, { kind: "unsupported-conclusion", sourceType: null, detail: "Unknown.", priority: 1 },
  ];
  for (const entry of attacks) assert.equal((await failure(h, ctx, response(ctx, { uncertainties: [entry] }))).failure.code, "provider-invalid-response");
});

test("known adapter failures classify once without retry while programming errors escape", async () => {
  const h = harness(); const ctx = context(h);
  for (const code of ["provider-unavailable", "provider-timeout", "provider-refusal", "context-too-large", "canceled"]) {
    const provider = h.gateway.createFakeProvider({ failure: code }); const result = clone(await h.gateway.invoke({ request, context: ctx, provider }));
    assert.equal(result.failure.code, code); assert.equal(result.response, null); assert.equal(provider.getInvocationCount(), 1);
  }
  let calls = 0; const programmingError = { async invoke() { calls += 1; throw new Error("bug"); } };
  await assert.rejects(() => h.gateway.invoke({ request, context: ctx, provider: programmingError }), /bug/); assert.equal(calls, 1);
  const rejected = { invoke() { calls += 1; return Promise.reject(h.gateway.createProviderError("provider-timeout")); } };
  assert.equal((await h.gateway.invoke({ request, context: ctx, provider: rejected })).failure.code, "provider-timeout");
});

test("gateway rejects malformed/relabelled context before provider invocation", async () => {
  const h = harness(); const cases = [];
  const authority = context(h); authority.derived.moveState.authority = "authoritative-operating-truth"; cases.push(authority);
  const swapped = context(h); swapped.authoritative.hold.sourceType = "dependency"; cases.push(swapped);
  const legacy = context(h); legacy.authoritative.memory = clone(legacy.authoritative.hold); cases.push(legacy);
  const wrongTime = context(h); wrongTime.asOf = "2026-10-02T12:00:01.000Z"; cases.push(wrongTime);
  for (const malformed of cases) { let calls = 0; await assert.rejects(() => h.gateway.invoke({ request, context: malformed, provider: { async invoke() { calls += 1; } } }), /invalid/); assert.equal(calls, 0); }
});

test("Commitment and Routine action snapshots require exact current Move action before provider invocation", async () => {
  const h = harness();
  const validCommitment = context(h); setCommitment(validCommitment); await assertAccepted(h, validCommitment);
  for (const acceptedAction of ["Send a different package.", "SEND PACKAGE.", "Send package. "]) {
    const attacked = context(h); setCommitment(attacked, acceptedAction); await assertRejectedBeforeProvider(h, attacked);
  }
  const validRoutine = context(h); setRoutine(validRoutine); await assertAccepted(h, validRoutine);
  for (const action of ["Send a different package.", "SEND PACKAGE.", "Send package. "]) {
    const attacked = context(h); setRoutine(attacked, action); await assertRejectedBeforeProvider(h, attacked);
  }
});

test("Move State validation reproduces Hold, Dependency, Availability, and clarify precedence", async () => {
  const h = harness();
  const hold = context(h); setHold(hold); setMoveState(hold, "hold", "hold", [{ type: "candidate-move-hold", id: "candidate_move_hold_test_aaa", revision: 1 }]); await assertAccepted(h, hold);
  for (const [state, kind, refs] of [
    ["clarify", "insufficient-operating-truth", []],
    ["waiting", "dependency", [{ type: "candidate-move-dependency", id: "candidate_move_dependency_test_aaa", revision: 1 }]],
    ["actionable", "availability", [{ type: "candidate-move-availability", id: "candidate_move_availability_test_aaa", revision: 1 }]],
  ]) {
    const attacked = context(h); setHold(attacked); if (state === "waiting") setDependency(attacked); if (state === "actionable") setAvailability(attacked);
    setMoveState(attacked, state, kind, refs); await assertRejectedBeforeProvider(h, attacked);
  }

  const waiting = context(h); setDependency(waiting); setMoveState(waiting, "waiting", "dependency", [{ type: "candidate-move-dependency", id: "candidate_move_dependency_test_aaa", revision: 1 }]); await assertAccepted(h, waiting);
  for (const [state, kind, refs] of [
    ["clarify", "insufficient-operating-truth", []],
    ["actionable", "availability", [{ type: "candidate-move-availability", id: "candidate_move_availability_test_aaa", revision: 1 }]],
  ]) {
    const attacked = context(h); setDependency(attacked); if (state === "actionable") setAvailability(attacked);
    setMoveState(attacked, state, kind, refs); await assertRejectedBeforeProvider(h, attacked);
  }

  const actionable = context(h); setAvailability(actionable); setMoveState(actionable, "actionable", "availability", [{ type: "candidate-move-availability", id: "candidate_move_availability_test_aaa", revision: 1 }]); await assertAccepted(h, actionable);
  const availabilityClarify = context(h); setAvailability(availabilityClarify); setMoveState(availabilityClarify, "clarify", "insufficient-operating-truth"); await assertRejectedBeforeProvider(h, availabilityClarify);
  await assertAccepted(h, context(h));
});

test("Move State unavailable-source validation matches actual read order and short-circuit semantics", async () => {
  const h = harness();
  const unavailableHold = context(h); unavailableHold.authoritative.hold = unavailableSlot("hold", "hold-corrupt"); setContextStatus(unavailableHold); await assertRejectedBeforeProvider(h, unavailableHold);
  const inapplicableHold = context(h); inapplicableHold.authoritative.hold = { authority: "authoritative-operating-truth", sourceType: "hold", status: "not-applicable", reason: "candidate-move-absent", facts: [] }; setContextStatus(inapplicableHold); await assertRejectedBeforeProvider(h, inapplicableHold);

  const unavailableDependency = context(h); setHold(unavailableDependency); unavailableDependency.authoritative.dependency = unavailableSlot("dependency", "dependency-corrupt");
  setMoveState(unavailableDependency, "hold", "hold", [{ type: "candidate-move-hold", id: "candidate_move_hold_test_aaa", revision: 1 }]); await assertRejectedBeforeProvider(h, unavailableDependency);
  const inapplicableDependency = context(h); setHold(inapplicableDependency); inapplicableDependency.authoritative.dependency = { authority: "authoritative-operating-truth", sourceType: "dependency", status: "not-applicable", reason: "candidate-move-absent", facts: [] };
  setMoveState(inapplicableDependency, "hold", "hold", [{ type: "candidate-move-hold", id: "candidate_move_hold_test_aaa", revision: 1 }]); await assertRejectedBeforeProvider(h, inapplicableDependency);

  const holdShortCircuit = context(h); setHold(holdShortCircuit); holdShortCircuit.authoritative.availability = unavailableSlot("availability", "availability-corrupt");
  setMoveState(holdShortCircuit, "hold", "hold", [{ type: "candidate-move-hold", id: "candidate_move_hold_test_aaa", revision: 1 }]); await assertAccepted(h, holdShortCircuit);

  const dependencyShortCircuit = context(h); setDependency(dependencyShortCircuit); dependencyShortCircuit.authoritative.availability = unavailableSlot("availability", "availability-corrupt");
  setMoveState(dependencyShortCircuit, "waiting", "dependency", [{ type: "candidate-move-dependency", id: "candidate_move_dependency_test_aaa", revision: 1 }]); await assertAccepted(h, dependencyShortCircuit);

  const unavailableAvailability = context(h); unavailableAvailability.authoritative.availability = unavailableSlot("availability", "availability-corrupt"); setContextStatus(unavailableAvailability);
  await assertRejectedBeforeProvider(h, unavailableAvailability);
});

test("Move State terminal and currentness semantics reject impossible available states", async () => {
  const h = harness();
  const released = context(h); setHold(released, "released"); setMoveState(released, "hold", "hold", [{ type: "candidate-move-hold", id: "candidate_move_hold_test_aaa", revision: 1 }]); await assertRejectedBeforeProvider(h, released);
  const resolved = context(h); setDependency(resolved, "resolved"); setMoveState(resolved, "waiting", "dependency", [{ type: "candidate-move-dependency", id: "candidate_move_dependency_test_aaa", revision: 1 }]); await assertRejectedBeforeProvider(h, resolved);
  const withdrawnAvailability = context(h); setAvailability(withdrawnAvailability, "withdrawn", false); setMoveState(withdrawnAvailability, "actionable", "availability", [{ type: "candidate-move-availability", id: "candidate_move_availability_test_aaa", revision: 1 }]); await assertRejectedBeforeProvider(h, withdrawnAvailability);
  const staleAvailability = context(h); setAvailability(staleAvailability, "confirmed", false); setMoveState(staleAvailability, "actionable", "availability", [{ type: "candidate-move-availability", id: "candidate_move_availability_test_aaa", revision: 1 }]); await assertRejectedBeforeProvider(h, staleAvailability);
});

test("withdrawn Candidate Move requires the exact not-applicable Move State representation", async () => {
  const h = harness();
  for (const [state, kind, refs] of [
    ["clarify", "insufficient-operating-truth", []],
    ["hold", "hold", [{ type: "candidate-move-hold", id: "candidate_move_hold_test_aaa", revision: 1 }]],
    ["waiting", "dependency", [{ type: "candidate-move-dependency", id: "candidate_move_dependency_test_aaa", revision: 1 }]],
    ["actionable", "availability", [{ type: "candidate-move-availability", id: "candidate_move_availability_test_aaa", revision: 1 }]],
  ]) {
    const attacked = context(h); attacked.authoritative.candidateMove.facts[0].reference.status = "withdrawn"; attacked.authoritative.candidateMove.facts[0].data.status = "withdrawn";
    if (state === "hold") setHold(attacked); if (state === "waiting") setDependency(attacked); if (state === "actionable") setAvailability(attacked);
    setMoveState(attacked, state, kind, refs); await assertRejectedBeforeProvider(h, attacked);
  }
  const valid = context(h); valid.authoritative.candidateMove.facts[0].reference.status = "withdrawn"; valid.authoritative.candidateMove.facts[0].data.status = "withdrawn";
  valid.derived.moveState = { authority: "derived-operating-state", sourceType: "move-state", status: "not-applicable", reason: "candidate-move-withdrawn", facts: [] };
  setContextStatus(valid); await assertAccepted(h, valid);
});

test("Move State basis source, identity, revision, and cardinality are exact", async () => {
  const h = harness(); const attacks = [];
  const wrongSource = context(h); setHold(wrongSource); setMoveState(wrongSource, "hold", "hold", [{ type: "candidate-move-dependency", id: "candidate_move_hold_test_aaa", revision: 1 }]); attacks.push(wrongSource);
  const wrongId = context(h); setHold(wrongId); setMoveState(wrongId, "hold", "hold", [{ type: "candidate-move-hold", id: "candidate_move_hold_other_aaa", revision: 1 }]); attacks.push(wrongId);
  const wrongRevision = context(h); setHold(wrongRevision); setMoveState(wrongRevision, "hold", "hold", [{ type: "candidate-move-hold", id: "candidate_move_hold_test_aaa", revision: 2 }]); attacks.push(wrongRevision);
  const missing = context(h); setHold(missing); setMoveState(missing, "hold", "hold", []); attacks.push(missing);
  const extra = context(h); setHold(extra); setMoveState(extra, "hold", "hold", [{ type: "candidate-move-hold", id: "candidate_move_hold_test_aaa", revision: 1 }, { type: "candidate-move-hold", id: "candidate_move_hold_other_aaa", revision: 1 }]); attacks.push(extra);
  for (const attacked of attacks) await assertRejectedBeforeProvider(h, attacked);
});

test("every canonical source fact and nested structure retains exact-key validation", async () => {
  const h = harness();
  const builders = [
    ["situation", (ctx) => ctx.authoritative.situation.facts[0]],
    ["candidateMove", (ctx) => ctx.authoritative.candidateMove.facts[0]],
    ["hold", (ctx) => { setHold(ctx); return ctx.authoritative.hold.facts[0]; }],
    ["dependency", (ctx) => { setDependency(ctx); return ctx.authoritative.dependency.facts[0]; }],
    ["availability", (ctx) => { setAvailability(ctx); return ctx.authoritative.availability.facts[0]; }],
    ["commitment", (ctx) => { setCommitment(ctx); return ctx.authoritative.commitment.facts[0]; }],
    ["routine", (ctx) => { setRoutine(ctx); return ctx.authoritative.routine.facts[0]; }],
    ["moveState", (ctx) => ctx.derived.moveState.facts[0]],
  ];
  for (const [name, build] of builders) {
    const attacked = context(h); build(attacked).data.hidden = name; await assertRejectedBeforeProvider(h, attacked);
  }
  const assertion = context(h); setAvailability(assertion); assertion.authoritative.availability.facts[0].data.assertion = { hidden: true }; await assertRejectedBeforeProvider(h, assertion);
  const window = context(h); setCommitment(window); window.authoritative.commitment.facts[0].data.window.hidden = true; await assertRejectedBeforeProvider(h, window);
  const schedule = context(h); setRoutine(schedule); schedule.authoritative.routine.facts[0].data.schedule.hidden = true; await assertRejectedBeforeProvider(h, schedule);
  const basis = context(h); basis.derived.moveState.facts[0].data.basis.hidden = true; await assertRejectedBeforeProvider(h, basis);
});

test("gateway source has no owner, global truth, persistence, network, retry, timer, command, or legacy dependency", () => {
  for (const pattern of [/SituationSystem/, /CandidateMoveSystem/, /CommanderSystem/, /\bfounder\b/, /saveFounder/, /localStorage/, /MemorySystem/, /ArchieCore/, /CommunicationSystem/, /DecisionSystem/, /fetch\s*\(/, /XMLHttpRequest/, /WebSocket/, /setTimeout/, /setInterval/, /retry/i, /proposal\s*\(/]) assert.doesNotMatch(gatewaySource, pattern);
  assert.doesNotMatch(gatewaySource, /OpenAI|Anthropic|Gemini|Authorization|HTTP/i);
});

test("index composition is inert and ordered after Move State without Archie registration or startup invocation", () => {
  const index = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const state = index.indexOf('systems/move-state.system.js'); const assembler = index.indexOf('systems/operating-context-assembler.system.js'); const gateway = index.indexOf('systems/founderos-ai-gateway.system.js'); const widget = index.indexOf('js/widgets/operating-setup.widget.js');
  assert.ok(state < assembler && assembler < gateway && gateway < widget);
  assert.equal(index.match(/operating-context-assembler\.system\.js/g).length, 1); assert.equal(index.match(/founderos-ai-gateway\.system\.js/g).length, 1);
  assert.doesNotMatch(index.slice(assembler, widget), /OperatingContextAssembler\.assemble|FounderOSAiGateway\.invoke|ArchieCore|fetch\s*\(/);
});