"use strict";

const MAX_REQUEST_BYTES = 131072;
const ERROR_CODES = ["provider-unavailable", "provider-timeout", "provider-refusal", "context-too-large"];
const UTC_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

function object(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function exact(value, keys) { return object(value) && Object.keys(value).length === keys.length && Object.keys(value).every((key) => keys.includes(key)); }
function text(value, maximum = 2000) { return typeof value === "string" && value.trim() === value && value.length > 0 && value.length <= maximum; }
function utc(value) { return typeof value === "string" && UTC_PATTERN.test(value) && !Number.isNaN(new Date(value).getTime()) && new Date(value).toISOString() === value; }
function relationship(value) {
  return exact(value, ["situationId", "situationRevision", "candidateMoveId", "candidateMoveRevision"]) &&
    (value.situationId === null || text(value.situationId, 200)) && (value.situationRevision === null || Number.isInteger(value.situationRevision) && value.situationRevision > 0) &&
    (value.candidateMoveId === null || text(value.candidateMoveId, 200)) && (value.candidateMoveRevision === null || Number.isInteger(value.candidateMoveRevision) && value.candidateMoveRevision > 0);
}
function recordId(sourceType, value) {
  const patterns = { situation: /^situation_[a-z0-9]+_[a-z0-9]+$/, "candidate-move": /^candidate_move_[a-z0-9]+_[a-z0-9]+$/, hold: /^candidate_move_hold_[a-z0-9]+_[a-z0-9]+$/, dependency: /^candidate_move_dependency_[a-z0-9]+_[a-z0-9]+$/, availability: /^candidate_move_availability_[a-z0-9]+_[a-z0-9]+$/, commitment: /^commitment_[a-z0-9]+_[a-z0-9]+$/, routine: /^routine_[a-z0-9]+_[a-z0-9]+$/ };
  return typeof value === "string" && patterns[sourceType].test(value);
}
function reference(value, authority, sourceType) {
  if (!exact(value, ["authority", "sourceType", "recordId", "revision", "status", "recordedAt", "relationships"]) || value.authority !== authority || value.sourceType !== sourceType || !relationship(value.relationships)) return false;
  if (sourceType === "move-state") return value.recordId === null && value.revision === null && value.recordedAt === null && ["hold", "waiting", "actionable", "clarify"].includes(value.status);
  const statuses = { situation: ["active", "closed"], "candidate-move": ["active", "withdrawn"], hold: ["active", "released"], dependency: ["unresolved", "resolved"], availability: ["confirmed", "withdrawn"], commitment: ["active", "completed", "canceled"], routine: ["active", "paused", "retired"] };
  return recordId(sourceType, value.recordId) && Number.isInteger(value.revision) && value.revision > 0 && utc(value.recordedAt) && statuses[sourceType].includes(value.status);
}
function window(value) { return exact(value, ["kind", "dueAt"]) && value.kind === "deadline" && utc(value.dueAt); }
function utcTime(value) { return typeof value === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\dZ$/.test(value); }
function schedule(value) { return exact(value, ["kind", "weekday", "opensAtUtc", "closesAtUtc"]) && value.kind === "weekly-utc" && Number.isInteger(value.weekday) && value.weekday >= 1 && value.weekday <= 7 && utcTime(value.opensAtUtc) && utcTime(value.closesAtUtc) && value.opensAtUtc < value.closesAtUtc; }
function basis(value) {
  if (!exact(value, ["kind", "references"]) || !["hold", "dependency", "availability", "insufficient-operating-truth"].includes(value.kind) || !Array.isArray(value.references)) return false;
  if (value.kind === "insufficient-operating-truth") return value.references.length === 0;
  const expectedType = { hold: "candidate-move-hold", dependency: "candidate-move-dependency", availability: "candidate-move-availability" }[value.kind];
  return value.references.length === 1 && exact(value.references[0], ["type", "id", "revision"]) && value.references[0].type === expectedType && text(value.references[0].id, 200) && Number.isInteger(value.references[0].revision) && value.references[0].revision > 0;
}
function data(sourceType, value) {
  if (sourceType === "situation") return exact(value, ["subject", "currentReality", "carryStatus"]) && text(value.subject, 160) && text(value.currentReality) && ["active", "closed"].includes(value.carryStatus);
  if (sourceType === "candidate-move") return exact(value, ["action", "status"]) && text(value.action) && ["active", "withdrawn"].includes(value.status);
  if (sourceType === "hold") return exact(value, ["status"]) && ["active", "released"].includes(value.status);
  if (sourceType === "dependency") return exact(value, ["description", "status"]) && text(value.description) && ["unresolved", "resolved"].includes(value.status);
  if (sourceType === "availability") return exact(value, ["status", "isCurrent", "conditionsConfirmed"]) && ["confirmed", "withdrawn"].includes(value.status) && typeof value.isCurrent === "boolean" && text(value.conditionsConfirmed);
  if (sourceType === "commitment") return exact(value, ["acceptedAction", "status", "window"]) && text(value.acceptedAction) && ["active", "completed", "canceled"].includes(value.status) && window(value.window);
  if (sourceType === "routine") return exact(value, ["action", "status", "schedule"]) && text(value.action) && ["active", "paused", "retired"].includes(value.status) && schedule(value.schedule);
  return sourceType === "move-state" && exact(value, ["state", "basis"]) && ["hold", "waiting", "actionable", "clarify"].includes(value.state) && basis(value.basis);
}
function slot(value, authority, sourceType) {
  if (!exact(value, ["authority", "sourceType", "status", "reason", "facts"]) || value.authority !== authority || value.sourceType !== sourceType || !Array.isArray(value.facts) || !["available", "absent", "unavailable", "not-applicable"].includes(value.status)) return false;
  if (value.status !== "available") return value.facts.length === 0 && (value.status === "absent" ? value.reason === null : text(value.reason, 160));
  if (value.reason !== null || (!["commitment", "routine"].includes(sourceType) && value.facts.length !== 1)) return false;
  const ids = new Set();
  for (const fact of value.facts) {
    if (!exact(fact, ["reference", "data"]) || !reference(fact.reference, authority, sourceType) || !data(sourceType, fact.data)) return false;
    const expected = sourceType === "situation" ? fact.data.carryStatus : sourceType === "move-state" ? fact.data.state : fact.data.status;
    if (fact.reference.status !== expected || fact.reference.recordId !== null && ids.has(fact.reference.recordId)) return false;
    ids.add(fact.reference.recordId);
  }
  return !["commitment", "routine"].includes(sourceType) || value.facts.every((fact, index, facts) => index === 0 || facts[index - 1].reference.recordId < fact.reference.recordId);
}
function validateContext(context) {
  if (!exact(context, ["schemaVersion", "type", "requestType", "asOf", "status", "scope", "authoritative", "derived", "issues"]) || context.schemaVersion !== 1 || context.type !== "operating-context" || context.requestType !== "situation-explanation" || !utc(context.asOf) || !["available", "partial", "unavailable"].includes(context.status) || !exact(context.scope, ["situationId", "candidateMoveId", "candidateMoveRevision"]) || !exact(context.authoritative, ["situation", "candidateMove", "hold", "dependency", "availability", "commitment", "routine"]) || !exact(context.derived, ["moveState"]) || !Array.isArray(context.issues)) return false;
  const entries = [["situation", "situation"], ["candidateMove", "candidate-move"], ["hold", "hold"], ["dependency", "dependency"], ["availability", "availability"], ["commitment", "commitment"], ["routine", "routine"]];
  if (!entries.every(([key, type]) => slot(context.authoritative[key], "authoritative-operating-truth", type)) || !slot(context.derived.moveState, "derived-operating-state", "move-state")) return false;
  const situation = context.authoritative.situation.status === "available" ? context.authoritative.situation.facts[0] : null;
  const move = context.authoritative.candidateMove.status === "available" ? context.authoritative.candidateMove.facts[0] : null;
  if (context.scope.situationId !== (situation ? situation.reference.recordId : null) || context.scope.candidateMoveId !== (move ? move.reference.recordId : null) || context.scope.candidateMoveRevision !== (move ? move.reference.revision : null) || move && move.reference.relationships.situationId !== context.scope.situationId) return false;
  if (!validateRelationships(context) || !validateActionSnapshots(context) || !validateMoveState(context)) return false;
  const slots = [...Object.values(context.authoritative), context.derived.moveState];
  const expectedStatus = context.authoritative.situation.status === "unavailable" || context.authoritative.candidateMove.status === "unavailable" ? "unavailable" : slots.some((item) => item.status === "unavailable") ? "partial" : "available";
  const issues = slots.filter((item) => item.status === "unavailable").map((item) => ({ sourceType: item.sourceType, status: "unavailable", reason: item.reason }));
  return context.status === expectedStatus && context.issues.length === issues.length && context.issues.every((issue, index) =>
    exact(issue, ["sourceType", "status", "reason"]) && issue.sourceType === issues[index].sourceType &&
    issue.status === issues[index].status && issue.reason === issues[index].reason);
}
function validateRelationships(context) {
  const situation = context.authoritative.situation; const move = context.authoritative.candidateMove;
  const dependents = [context.authoritative.hold, context.authoritative.dependency, context.authoritative.availability, context.authoritative.commitment, context.authoritative.routine, context.derived.moveState];
  if (situation.status !== "available") return move.status === "not-applicable" && dependents.every((item) => item.status === "not-applicable");
  if (Object.values(situation.facts[0].reference.relationships).some((item) => item !== null)) return false;
  if (move.status !== "available") return dependents.every((item) => item.status === "not-applicable");
  const moveRelationship = move.facts[0].reference.relationships;
  if (moveRelationship.situationId !== context.scope.situationId || moveRelationship.situationRevision !== null || moveRelationship.candidateMoveId !== null || moveRelationship.candidateMoveRevision !== null) return false;
  for (const sourceType of ["hold", "dependency", "availability", "commitment", "routine"]) {
    for (const fact of context.authoritative[sourceType].facts) {
      const link = fact.reference.relationships;
      if (link.candidateMoveId !== context.scope.candidateMoveId) return false;
      if (["commitment", "routine"].includes(sourceType) ? link.candidateMoveRevision !== context.scope.candidateMoveRevision : link.candidateMoveRevision !== null) return false;
      if (sourceType === "availability") {
        if (link.situationId !== context.scope.situationId) return false;
      } else if (link.situationId !== null || link.situationRevision !== null) return false;
    }
  }
  const state = context.derived.moveState;
  if (state.status === "available") {
    const link = state.facts[0].reference.relationships;
    if (link.candidateMoveId !== context.scope.candidateMoveId || link.candidateMoveRevision !== context.scope.candidateMoveRevision) return false;
  }
  return true;
}
function validateActionSnapshots(context) {
  const move = context.authoritative.candidateMove;
  if (move.status !== "available") return true;
  const action = move.facts[0].data.action;
  return context.authoritative.commitment.facts.every((fact) => fact.data.acceptedAction === action) && context.authoritative.routine.facts.every((fact) => fact.data.action === action);
}
function validateMoveState(context) {
  const move = context.authoritative.candidateMove; const slot = context.derived.moveState;
  if (move.status !== "available") return true;
  if (move.facts[0].data.status === "withdrawn") return slot.status === "not-applicable" && slot.reason === "candidate-move-withdrawn";
  if (slot.status === "unavailable") return true;
  if (slot.status !== "available") return false;
  const state = slot.facts[0].data;
  const match = (sourceType, expectedType) => {
    const source = context.authoritative[sourceType];
    if (source.status !== "available" || source.facts.length !== 1 || state.basis.references.length !== 1) return false;
    const expected = source.facts[0].reference; const actual = state.basis.references[0];
    return actual.type === expectedType && actual.id === expected.recordId && actual.revision === expected.revision;
  };
  const hold = context.authoritative.hold; if (hold.status === "unavailable") return false;
  if (hold.status === "available" && hold.facts[0].data.status === "active") return state.state === "hold" && state.basis.kind === "hold" && match("hold", "candidate-move-hold");
  const dependency = context.authoritative.dependency; if (dependency.status === "unavailable") return false;
  if (dependency.status === "available" && dependency.facts[0].data.status === "unresolved") return state.state === "waiting" && state.basis.kind === "dependency" && match("dependency", "candidate-move-dependency");
  const availability = context.authoritative.availability; if (availability.status === "unavailable") return false;
  if (availability.status === "available" && availability.facts[0].data.status === "confirmed" && availability.facts[0].data.isCurrent === true) return state.state === "actionable" && state.basis.kind === "availability" && match("availability", "candidate-move-availability");
  return state.state === "clarify" && state.basis.kind === "insufficient-operating-truth" && state.basis.references.length === 0;
}
function validateProviderRequest(value) {
  return exact(value, ["schemaVersion", "type", "requestType", "asOf", "context"]) && value.schemaVersion === 1 && value.type === "ai-provider-request" && value.requestType === "situation-explanation" && utc(value.asOf) && validateContext(value.context) && value.context.requestType === value.requestType && value.context.asOf === value.asOf;
}
function errorEnvelope(code) { return { schemaVersion: 1, type: "ai-provider-error", code: ERROR_CODES.includes(code) ? code : "provider-unavailable" }; }

module.exports = { MAX_REQUEST_BYTES, ERROR_CODES, validateProviderRequest, errorEnvelope };