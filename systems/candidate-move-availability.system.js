// =====================================================
// FOUNDEROS
// CANDIDATE MOVE AVAILABILITY SYSTEM
// Commander-asserted operating sufficiency only.
// =====================================================

const CandidateMoveAvailabilitySystem = {
  version: "1.0.0",
  SCHEMA_VERSION: 1,
  MAX_CONDITIONS_CONFIRMED_LENGTH: 2000,

  clone(value) { return JSON.parse(JSON.stringify(value)); },
  getStorageStatus() { return typeof getFounderStorageLoadStatus === "function" ? getFounderStorageLoadStatus() : null; },
  getUsableStorageStatus() { const status = this.getStorageStatus(); return status === "loaded" || status === "absent" ? status : null; },
  normalizeConditions(value) { if (typeof value !== "string") return null; const normalized = value.trim(); return normalized.length > 0 && normalized.length <= this.MAX_CONDITIONS_CONFIRMED_LENGTH ? normalized : null; },
  validateRecordedAt(value) { return typeof value === "string" && !Number.isNaN(new Date(value).getTime()); },

  validateAvailability(availability, candidateMoveHistory, situationHistory) {
    if (!availability || typeof availability !== "object" || Array.isArray(availability)) return null;
    if (availability.schemaVersion !== this.SCHEMA_VERSION) return null;
    if (typeof availability.id !== "string" || !/^candidate_move_availability_[a-z0-9]+_[a-z0-9]+$/.test(availability.id)) return null;
    if (typeof availability.candidateMoveId !== "string" || !/^candidate_move_[a-z0-9]+_[a-z0-9]+$/.test(availability.candidateMoveId)) return null;
    if (typeof availability.situationId !== "string" || !/^situation_[a-z0-9]+_[a-z0-9]+$/.test(availability.situationId)) return null;
    if (!Array.isArray(availability.revisions) || availability.revisions.length === 0) return null;
    const moveRevisions = new Set(candidateMoveHistory.revisions.map((revision) => revision.revision));
    const situationRevisions = new Set(situationHistory.revisions.map((revision) => revision.revision));
    let lastAssertion = null;
    for (let index = 0; index < availability.revisions.length; index += 1) {
      const revision = availability.revisions[index];
      if (!revision || typeof revision !== "object" || Array.isArray(revision)) return null;
      if (revision.revision !== index + 1 || !this.validateRecordedAt(revision.recordedAt)) return null;
      if (!revision.provenance || revision.provenance.authority !== "commander") return null;
      const assertion = revision.assertion;
      if (!assertion || typeof assertion !== "object" || Array.isArray(assertion) || assertion.kind !== "commander-operating-sufficiency") return null;
      if (!Number.isInteger(assertion.candidateMoveRevision) || !moveRevisions.has(assertion.candidateMoveRevision)) return null;
      if (!Number.isInteger(assertion.situationRevision) || !situationRevisions.has(assertion.situationRevision)) return null;
      if (this.normalizeConditions(assertion.conditionsConfirmed) !== assertion.conditionsConfirmed) return null;
      if (index === 0 && (revision.status !== "confirmed" || revision.provenance.operation !== "confirm")) return null;
      if (index > 0 && revision.provenance.operation === "reconfirm" && revision.status !== "confirmed") return null;
      if (index > 0 && revision.provenance.operation === "withdraw") {
        if (revision.status !== "withdrawn" || !lastAssertion || JSON.stringify(assertion) !== JSON.stringify(lastAssertion)) return null;
      } else if (index > 0 && revision.provenance.operation !== "reconfirm") return null;
      lastAssertion = assertion;
    }
    const latest = availability.revisions[availability.revisions.length - 1];
    return { id: availability.id, candidateMoveId: availability.candidateMoveId, situationId: availability.situationId, revision: latest.revision, status: latest.status, assertion: this.clone(latest.assertion) };
  },

  getRelationships() {
    if (typeof CandidateMoveSystem === "undefined" || typeof CandidateMoveSystem.getCandidateMove !== "function" || typeof CandidateMoveSystem.getCandidateMoveHistory !== "function") return null;
    if (typeof SituationSystem === "undefined" || typeof SituationSystem.getSituation !== "function" || typeof SituationSystem.getSituationHistory !== "function") return null;
    const candidateMove = CandidateMoveSystem.getCandidateMove(); const candidateMoveHistory = CandidateMoveSystem.getCandidateMoveHistory();
    const situation = SituationSystem.getSituation(); const situationHistory = SituationSystem.getSituationHistory();
    if (candidateMove.status !== "available" || candidateMoveHistory.status !== "available" || situation.status !== "available" || situationHistory.status !== "available") return null;
    if (candidateMove.current.situationId !== situation.current.id) return null;
    return { candidateMove, candidateMoveHistory, situation, situationHistory };
  },

  getAvailability() {
    const storageStatus = this.getStorageStatus();
    if (storageStatus === "not-loaded") return { status: "unavailable", reason: "founder-storage-not-loaded" };
    if (storageStatus === "failed") return { status: "unavailable", reason: "founder-storage-failed" };
    if ((storageStatus !== "loaded" && storageStatus !== "absent") || typeof founder === "undefined") return { status: "unavailable", reason: "founder-storage-unavailable" };
    if (!Object.hasOwn(founder, "candidateMoveAvailability")) return { status: "absent", availability: null };
    const relationships = this.getRelationships();
    if (!relationships) return { status: "unavailable", reason: "candidate-move-availability-relationship-unavailable" };
    const current = this.validateAvailability(founder.candidateMoveAvailability, relationships.candidateMoveHistory, relationships.situationHistory);
    if (!current) return { status: "unavailable", reason: "candidate-move-availability-corrupt" };
    if (current.candidateMoveId !== relationships.candidateMove.current.id || current.situationId !== relationships.situation.current.id) return { status: "unavailable", reason: "candidate-move-availability-relationship-mismatch" };
    return { status: "available", availability: this.clone(founder.candidateMoveAvailability), current: { ...this.clone(current), isCurrent: current.status === "confirmed" && current.assertion.candidateMoveRevision === relationships.candidateMove.current.revision && current.assertion.situationRevision === relationships.situation.current.revision } };
  },

  getAvailabilityHistory() { const state = this.getAvailability(); return state.status === "available" ? { status: "available", id: state.current.id, candidateMoveId: state.current.candidateMoveId, situationId: state.current.situationId, revisions: this.clone(state.availability.revisions) } : state; },
  canPublishAvailability() {
    if (typeof founder === "undefined" || !founder || typeof founder !== "object") return false;
    const own = Object.getOwnPropertyDescriptor(founder, "candidateMoveAvailability");
    if (own) return "value" in own && own.writable !== false;
    for (let prototype = Object.getPrototypeOf(founder); prototype; prototype = Object.getPrototypeOf(prototype)) { const descriptor = Object.getOwnPropertyDescriptor(prototype, "candidateMoveAvailability"); if (!descriptor) continue; if (!("value" in descriptor) || descriptor.writable === false) return false; break; }
    return Object.isExtensible(founder);
  },
  persistAndPublish(availability) {
    if (!this.canPublishAvailability()) throw new Error("Founder Candidate Move Availability cannot be published safely.");
    if (typeof CommanderSystem === "undefined" || typeof CommanderSystem.save !== "function") throw new Error("Founder persistence is unavailable.");
    const candidateFounder = this.clone(founder); candidateFounder.candidateMoveAvailability = availability;
    if (CommanderSystem.save(candidateFounder) !== true) throw new Error("Founder persistence was not confirmed.");
    founder.candidateMoveAvailability = availability;
  },
  requireCurrentRelationships(candidateMoveId, expectedCandidateMoveRevision, expectedSituationRevision) {
    const relationships = this.getRelationships();
    if (!relationships) throw new Error("Candidate Move Availability relationship is unavailable.");
    if (relationships.candidateMove.current.status !== "active") throw new Error("Candidate Move is withdrawn.");
    if (candidateMoveId !== relationships.candidateMove.current.id) throw new Error("Candidate Move does not match.");
    if (expectedCandidateMoveRevision !== relationships.candidateMove.current.revision || expectedSituationRevision !== relationships.situation.current.revision) throw new Error("Candidate Move Availability revisions do not match.");
    return relationships;
  },
  buildAssertion(candidateMoveRevision, situationRevision, conditionsConfirmed) { return { kind: "commander-operating-sufficiency", candidateMoveRevision, situationRevision, conditionsConfirmed }; },
  confirmAvailability({ candidateMoveId, expectedCandidateMoveRevision, expectedSituationRevision, conditionsConfirmed } = {}) {
    if (!this.getUsableStorageStatus()) throw new Error("Founder storage is unavailable.");
    if (typeof founder === "undefined") throw new Error("Founder data is unavailable.");
    if (Object.hasOwn(founder, "candidateMoveAvailability")) throw new Error("A Candidate Move Availability already exists or is unavailable.");
    const normalized = this.normalizeConditions(conditionsConfirmed); if (!normalized) throw new Error("Availability conditions are required.");
    const relationships = this.requireCurrentRelationships(candidateMoveId, expectedCandidateMoveRevision, expectedSituationRevision);
    const availability = { schemaVersion: this.SCHEMA_VERSION, id: `candidate_move_availability_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`, candidateMoveId, situationId: relationships.situation.current.id, revisions: [{ revision: 1, status: "confirmed", assertion: this.buildAssertion(expectedCandidateMoveRevision, expectedSituationRevision, normalized), provenance: { authority: "commander", operation: "confirm" }, recordedAt: new Date().toISOString() }] };
    this.persistAndPublish(availability); return this.clone(availability);
  },
  reconfirmAvailability({ id, expectedRevision, expectedCandidateMoveRevision, expectedSituationRevision, conditionsConfirmed } = {}) {
    const state = this.getAvailability(); if (state.status !== "available") throw new Error("Candidate Move Availability is unavailable.");
    if (id !== state.current.id || expectedRevision !== state.current.revision) throw new Error("Candidate Move Availability revision does not match.");
    const normalized = this.normalizeConditions(conditionsConfirmed); if (!normalized) throw new Error("Availability conditions are required.");
    this.requireCurrentRelationships(state.current.candidateMoveId, expectedCandidateMoveRevision, expectedSituationRevision);
    const assertion = this.buildAssertion(expectedCandidateMoveRevision, expectedSituationRevision, normalized);
    if (state.current.status === "confirmed" && JSON.stringify(assertion) === JSON.stringify(state.current.assertion)) return this.clone(state.availability);
    const availability = this.clone(state.availability); availability.revisions.push({ revision: state.current.revision + 1, status: "confirmed", assertion, provenance: { authority: "commander", operation: "reconfirm" }, recordedAt: new Date().toISOString() });
    this.persistAndPublish(availability); return this.clone(availability);
  },
  withdrawAvailability({ id, expectedRevision } = {}) {
    const state = this.getAvailability(); if (state.status !== "available") throw new Error("Candidate Move Availability is unavailable.");
    if (id !== state.current.id || expectedRevision !== state.current.revision) throw new Error("Candidate Move Availability revision does not match.");
    if (state.current.status !== "confirmed") throw new Error("Candidate Move Availability is already withdrawn.");
    const availability = this.clone(state.availability); availability.revisions.push({ revision: state.current.revision + 1, status: "withdrawn", assertion: this.clone(state.current.assertion), provenance: { authority: "commander", operation: "withdraw" }, recordedAt: new Date().toISOString() });
    this.persistAndPublish(availability); return this.clone(availability);
  },
};
