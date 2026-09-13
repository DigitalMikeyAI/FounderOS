// =====================================================
// FOUNDEROS
// CANDIDATE MOVE COMMITMENT SYSTEM
// Commander-accepted responsibility with deadline only.
// =====================================================

const CandidateMoveCommitmentSystem = {
  version: "1.0.0",
  SCHEMA_VERSION: 1,
  UTC_PATTERN: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,

  clone(value) { return JSON.parse(JSON.stringify(value)); },
  hasExactKeys(value, keys) { return value !== null && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === keys.length && Object.keys(value).every((key) => keys.includes(key)); },
  getStorageStatus() { return typeof getFounderStorageLoadStatus === "function" ? getFounderStorageLoadStatus() : null; },
  usableStorage() { const status = this.getStorageStatus(); return status === "loaded" || status === "absent" ? status : null; },
  isCanonicalUtc(value) { return typeof value === "string" && this.UTC_PATTERN.test(value) && !Number.isNaN(new Date(value).getTime()) && new Date(value).toISOString() === value; },
  validWindow(window) { return window && typeof window === "object" && !Array.isArray(window) && Object.keys(window).length === 2 && window.kind === "deadline" && this.isCanonicalUtc(window.dueAt); },
  same(value, other) { return JSON.stringify(value) === JSON.stringify(other); },

  relationships() {
    if (typeof CandidateMoveSystem === "undefined" || typeof CandidateMoveSystem.getCandidateMove !== "function" || typeof CandidateMoveSystem.getCandidateMoveHistory !== "function") return null;
    const move = CandidateMoveSystem.getCandidateMove(); const history = CandidateMoveSystem.getCandidateMoveHistory();
    if (move.status !== "available" || history.status !== "available") return null;
    return { move, history };
  },
  actionForRevision(relationships, revision) {
    const found = relationships.history.revisions.find((item) => item.revision === revision);
    return found && found.status === "active" ? found.action : null;
  },
  validateRecord(record, relationships) {
    if (!this.hasExactKeys(record, ["id", "candidateMoveId", "candidateMoveRevision", "revisions"])) return null;
    if (typeof record.id !== "string" || !/^commitment_[a-z0-9]+_[a-z0-9]+$/.test(record.id)) return null;
    if (record.candidateMoveId !== relationships.move.current.id || !Number.isInteger(record.candidateMoveRevision)) return null;
    const acceptedAction = this.actionForRevision(relationships, record.candidateMoveRevision); if (!acceptedAction) return null;
    if (!Array.isArray(record.revisions) || record.revisions.length === 0) return null;
    let terminal = false; let previousWindow = null;
    for (let index = 0; index < record.revisions.length; index += 1) {
      const revision = record.revisions[index];
      if (!this.hasExactKeys(revision, ["revision", "status", "window", "provenance", "recordedAt"]) || revision.revision !== index + 1 || !this.validWindow(revision.window) || !this.isCanonicalUtc(revision.recordedAt) || !this.hasExactKeys(revision.provenance, ["authority", "operation"]) || revision.provenance.authority !== "commander" || terminal) return null;
      if (index === 0) { if (revision.status !== "active" || revision.provenance.operation !== "create") return null; }
      else if (revision.provenance.operation === "correct-window") { if (revision.status !== "active") return null; }
      else if (revision.provenance.operation === "complete") { if (revision.status !== "completed" || !this.same(revision.window, previousWindow)) return null; terminal = true; }
      else if (revision.provenance.operation === "cancel") { if (revision.status !== "canceled" || !this.same(revision.window, previousWindow)) return null; terminal = true; }
      else return null;
      previousWindow = revision.window;
    }
    const latest = record.revisions[record.revisions.length - 1];
    return { id: record.id, candidateMoveId: record.candidateMoveId, candidateMoveRevision: record.candidateMoveRevision, acceptedAction, revision: latest.revision, status: latest.status, window: this.clone(latest.window), currentMoveRevision: relationships.move.current.revision, currentMoveStatus: relationships.move.current.status };
  },
  validateCollection(collection, relationships) {
    if (!this.hasExactKeys(collection, ["schemaVersion", "records"]) || collection.schemaVersion !== this.SCHEMA_VERSION || !Array.isArray(collection.records)) return null;
    const ids = new Set(); const activeMoves = new Set(); const records = [];
    for (const record of collection.records) { const current = this.validateRecord(record, relationships); if (!current || ids.has(current.id) || (current.status === "active" && activeMoves.has(current.candidateMoveId))) return null; ids.add(current.id); if (current.status === "active") activeMoves.add(current.candidateMoveId); records.push(current); }
    return records;
  },
  getCommitments() {
    const status = this.getStorageStatus(); if (status === "not-loaded") return { status: "unavailable", reason: "founder-storage-not-loaded" }; if (status === "failed") return { status: "unavailable", reason: "founder-storage-failed" }; if ((status !== "loaded" && status !== "absent") || typeof founder === "undefined") return { status: "unavailable", reason: "founder-storage-unavailable" };
    if (!Object.hasOwn(founder, "commitments")) return { status: "absent", commitments: null };
    const relationships = this.relationships(); if (!relationships) return { status: "unavailable", reason: "commitment-candidate-move-unavailable" };
    const records = this.validateCollection(founder.commitments, relationships); if (!records) return { status: "unavailable", reason: "commitment-collection-corrupt" };
    return { status: "available", commitments: this.clone(founder.commitments), records: this.clone(records) };
  },
  getCommitment({ id } = {}) { const state = this.getCommitments(); if (state.status !== "available") return state; const current = state.records.find((record) => record.id === id); if (!current) return { status: "absent", commitment: null }; const record = state.commitments.records.find((item) => item.id === id); return { status: "available", commitment: this.clone(record), current: this.clone(current) }; },
  getCommitmentHistory({ id } = {}) { const state = this.getCommitment({ id }); return state.status === "available" ? { status: "available", id: state.current.id, revisions: this.clone(state.commitment.revisions) } : state; },
  getCommitmentWindowState({ id, asOf } = {}) {
    const state = this.getCommitment({ id }); if (state.status !== "available") return state;
    const evaluatedAt = asOf === undefined ? new Date().toISOString() : asOf; if (!this.isCanonicalUtc(evaluatedAt)) return { status: "unavailable", reason: "commitment-window-evaluation-invalid" };
    return { status: "available", id: state.current.id, lifecycle: state.current.status, windowState: evaluatedAt <= state.current.window.dueAt ? "open" : "passed", evaluatedAt, dueAt: state.current.window.dueAt };
  },
  canPublish() {
    if (typeof founder === "undefined" || !founder || typeof founder !== "object") return false; const own = Object.getOwnPropertyDescriptor(founder, "commitments"); if (own) return "value" in own && own.writable !== false;
    for (let prototype = Object.getPrototypeOf(founder); prototype; prototype = Object.getPrototypeOf(prototype)) { const descriptor = Object.getOwnPropertyDescriptor(prototype, "commitments"); if (!descriptor) continue; if (!("value" in descriptor) || descriptor.writable === false) return false; break; } return Object.isExtensible(founder);
  },
  persist(collection) { if (!this.canPublish()) throw new Error("Founder Commitments cannot be published safely."); if (typeof CommanderSystem === "undefined" || typeof CommanderSystem.save !== "function") throw new Error("Founder persistence is unavailable."); const candidate = this.clone(founder); candidate.commitments = collection; if (CommanderSystem.save(candidate) !== true) throw new Error("Founder persistence was not confirmed."); founder.commitments = collection; },
  requireCreate(candidateMoveId, expectedCandidateMoveRevision, window) { if (!this.usableStorage()) throw new Error("Founder storage is unavailable."); const relationships = this.relationships(); if (!relationships || relationships.move.current.status !== "active") throw new Error("Candidate Move is unavailable."); if (candidateMoveId !== relationships.move.current.id || expectedCandidateMoveRevision !== relationships.move.current.revision) throw new Error("Candidate Move revision does not match."); if (!this.validWindow(window)) throw new Error("Commitment deadline window is invalid."); return relationships; },
  createCommitment({ candidateMoveId, expectedCandidateMoveRevision, window } = {}) {
    const relationships = this.requireCreate(candidateMoveId, expectedCandidateMoveRevision, window); const existing = Object.hasOwn(founder, "commitments") ? this.validateCollection(founder.commitments, relationships) : [];
    if (!existing) throw new Error("Commitment collection is unavailable."); if (existing.some((record) => record.candidateMoveId === candidateMoveId && record.status === "active")) throw new Error("An active Commitment already exists for this Candidate Move.");
    const now = new Date().toISOString(); const record = { id: `commitment_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`, candidateMoveId, candidateMoveRevision: expectedCandidateMoveRevision, revisions: [{ revision: 1, status: "active", window: this.clone(window), provenance: { authority: "commander", operation: "create" }, recordedAt: now }] }; const collection = { schemaVersion: this.SCHEMA_VERSION, records: [...(founder.commitments?.records || []), record] }; this.persist(collection); return this.clone(record);
  },
  mutate({ id, expectedRevision, operation, window = null } = {}) {
    if (!this.usableStorage()) throw new Error("Founder storage is unavailable."); const state = this.getCommitment({ id }); if (state.status !== "available") throw new Error("Commitment is unavailable."); if (expectedRevision !== state.current.revision || state.current.status !== "active") throw new Error("Commitment revision does not match.");
    const nextWindow = operation === "correct-window" ? window : state.current.window; if (!this.validWindow(nextWindow)) throw new Error("Commitment deadline window is invalid."); if (operation === "correct-window" && this.same(nextWindow, state.current.window)) return this.clone(state.commitment);
    const status = operation === "complete" ? "completed" : operation === "cancel" ? "canceled" : "active"; const collection = this.clone(founder.commitments); const record = collection.records.find((item) => item.id === id); record.revisions.push({ revision: state.current.revision + 1, status, window: this.clone(nextWindow), provenance: { authority: "commander", operation }, recordedAt: new Date().toISOString() }); this.persist(collection); return this.clone(record);
  },
  correctCommitmentWindow({ id, expectedRevision, window } = {}) { return this.mutate({ id, expectedRevision, operation: "correct-window", window }); },
  completeCommitment({ id, expectedRevision } = {}) { return this.mutate({ id, expectedRevision, operation: "complete" }); },
  cancelCommitment({ id, expectedRevision } = {}) { return this.mutate({ id, expectedRevision, operation: "cancel" }); },
};
