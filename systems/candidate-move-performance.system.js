// Commander-reported action occurrence, not outcome, completion, or execution state.
const CandidateMovePerformanceSystem = {
  version: "1.0.0",
  SCHEMA_VERSION: 1,
  UTC_PATTERN: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,

  clone(value) { return JSON.parse(JSON.stringify(value)); },
  hasExactKeys(value, keys) { return value !== null && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === keys.length && Object.keys(value).every((key) => keys.includes(key)); },
  getStorageStatus() { return typeof getFounderStorageLoadStatus === "function" ? getFounderStorageLoadStatus() : null; },
  usableStorage() { return ["loaded", "absent"].includes(this.getStorageStatus()); },
  isCanonicalUtc(value) { return typeof value === "string" && this.UTC_PATTERN.test(value) && !Number.isNaN(new Date(value).getTime()) && new Date(value).toISOString() === value; },
  relationships() {
    if (typeof CandidateMoveSystem === "undefined" || !CandidateMoveSystem || typeof CandidateMoveSystem.getCandidateMove !== "function" || typeof CandidateMoveSystem.getCandidateMoveHistory !== "function") return null;
    try {
      const move = CandidateMoveSystem.getCandidateMove(); const history = CandidateMoveSystem.getCandidateMoveHistory();
      if (!move || !history || move.status !== "available" || history.status !== "available" || !move.current || !Array.isArray(history.revisions)) return null;
      return { move, history };
    } catch (error) { return null; }
  },
  actionForRevision(relationships, revision) {
    const found = relationships.history.revisions.find((item) => item.revision === revision);
    return found && found.status === "active" && typeof found.action === "string" && found.action.length ? found.action : null;
  },
  validateRecord(record, relationships) {
    if (!this.hasExactKeys(record, ["id", "candidateMoveId", "candidateMoveRevision", "revisions"])) return null;
    if (typeof record.id !== "string" || !/^performance_[a-z0-9]+_[a-z0-9]+$/.test(record.id)) return null;
    if (record.candidateMoveId !== relationships.move.current.id || !Number.isInteger(record.candidateMoveRevision) || record.candidateMoveRevision < 1) return null;
    const acceptedAction = this.actionForRevision(relationships, record.candidateMoveRevision);
    if (!acceptedAction || !Array.isArray(record.revisions) || !record.revisions.length) return null;
    let previous = null;
    for (let index = 0; index < record.revisions.length; index += 1) {
      const revision = record.revisions[index];
      if (!this.hasExactKeys(revision, ["revision", "status", "performedAt", "provenance", "recordedAt"]) || revision.revision !== index + 1 || !this.isCanonicalUtc(revision.performedAt) || !this.isCanonicalUtc(revision.recordedAt) || !this.hasExactKeys(revision.provenance, ["authority", "operation"]) || revision.provenance.authority !== "commander") return null;
      if (!previous) {
        if (revision.status !== "reported" || revision.provenance.operation !== "report") return null;
      } else {
        if (previous.status !== "reported" || revision.status !== "retracted" || revision.provenance.operation !== "retract" || revision.performedAt !== previous.performedAt) return null;
      }
      previous = revision;
    }
    return { id: record.id, candidateMoveId: record.candidateMoveId, candidateMoveRevision: record.candidateMoveRevision, acceptedAction, revision: previous.revision, status: previous.status, performedAt: previous.performedAt, recordedAt: previous.recordedAt, currentMoveRevision: relationships.move.current.revision, currentMoveStatus: relationships.move.current.status };
  },
  validateCollection(collection, relationships) {
    if (!this.hasExactKeys(collection, ["schemaVersion", "records"]) || collection.schemaVersion !== this.SCHEMA_VERSION || !Array.isArray(collection.records)) return null;
    const ids = new Set(); const records = [];
    for (const record of collection.records) {
      const current = this.validateRecord(record, relationships);
      if (!current || ids.has(current.id)) return null;
      ids.add(current.id); records.push(current);
    }
    return records;
  },
  getPerformances() {
    if (!this.usableStorage() || typeof founder === "undefined" || !founder || typeof founder !== "object") return { status: "unavailable", reason: "founder-storage-unavailable" };
    if (!Object.hasOwn(founder, "candidateMovePerformances")) return { status: "absent", performances: null };
    const relationships = this.relationships();
    if (!relationships) return { status: "unavailable", reason: "performance-candidate-move-unavailable" };
    const records = this.validateCollection(founder.candidateMovePerformances, relationships);
    if (!records) return { status: "unavailable", reason: "performance-collection-corrupt" };
    return { status: "available", performances: this.clone(founder.candidateMovePerformances), records: this.clone(records) };
  },
  getPerformance({ id } = {}) {
    const state = this.getPerformances(); if (state.status !== "available") return state;
    const current = state.records.find((record) => record.id === id);
    if (!current) return { status: "absent", performance: null };
    return { status: "available", performance: this.clone(state.performances.records.find((record) => record.id === id)), current: this.clone(current) };
  },
  getPerformanceHistory({ id } = {}) {
    const state = this.getPerformance({ id }); if (state.status !== "available") return state;
    return { status: "available", id: state.performance.id, candidateMoveId: state.performance.candidateMoveId, candidateMoveRevision: state.performance.candidateMoveRevision, acceptedAction: state.current.acceptedAction, revisions: this.clone(state.performance.revisions) };
  },
  canPublish() {
    if (typeof founder === "undefined" || !founder || typeof founder !== "object") return false;
    const own = Object.getOwnPropertyDescriptor(founder, "candidateMovePerformances");
    if (own) return "value" in own && own.writable !== false;
    for (let prototype = Object.getPrototypeOf(founder); prototype; prototype = Object.getPrototypeOf(prototype)) {
      const descriptor = Object.getOwnPropertyDescriptor(prototype, "candidateMovePerformances");
      if (!descriptor) continue;
      if (!("value" in descriptor) || descriptor.writable === false) return false;
      break;
    }
    return Object.isExtensible(founder);
  },
  persist(collection) {
    if (!this.canPublish()) throw new Error("Founder Performances cannot be published safely.");
    if (typeof CommanderSystem === "undefined" || !CommanderSystem || typeof CommanderSystem.save !== "function") throw new Error("Founder persistence is unavailable.");
    const candidate = this.clone(founder); candidate.candidateMovePerformances = this.clone(collection);
    if (CommanderSystem.save(candidate) !== true) throw new Error("Founder persistence was not confirmed.");
    founder.candidateMovePerformances = collection;
  },
  reportPerformance({ candidateMoveId, candidateMoveRevision, performedAt } = {}) {
    if (!this.usableStorage()) throw new Error("Founder storage is unavailable.");
    const relationships = this.relationships();
    if (!relationships || candidateMoveId !== relationships.move.current.id || !Number.isInteger(candidateMoveRevision) || !this.actionForRevision(relationships, candidateMoveRevision)) throw new Error("Candidate Move revision is unavailable.");
    if (!this.isCanonicalUtc(performedAt)) throw new Error("Performance instant is invalid.");
    const existing = this.getPerformances();
    if (!["available", "absent"].includes(existing.status)) throw new Error("Performance collection is unavailable.");
    const collection = existing.status === "available" ? existing.performances : { schemaVersion: this.SCHEMA_VERSION, records: [] };
    const id = `performance_${Date.now().toString(36)}_${Math.random().toString(36).slice(2) || "0"}`;
    if (collection.records.some((record) => record.id === id)) throw new Error("Performance identity collision.");
    const record = { id, candidateMoveId, candidateMoveRevision, revisions: [{ revision: 1, status: "reported", performedAt, provenance: { authority: "commander", operation: "report" }, recordedAt: new Date().toISOString() }] };
    collection.records.push(record); this.persist(collection); return this.clone(record);
  },
  retractPerformance({ id, expectedRevision } = {}) {
    if (!this.usableStorage()) throw new Error("Founder storage is unavailable.");
    const state = this.getPerformance({ id });
    if (state.status !== "available") throw new Error("Performance is unavailable.");
    if (state.current.revision !== expectedRevision || state.current.status !== "reported") throw new Error("Performance revision does not match.");
    const collection = this.clone(founder.candidateMovePerformances); const record = collection.records.find((item) => item.id === id);
    record.revisions.push({ revision: state.current.revision + 1, status: "retracted", performedAt: state.current.performedAt, provenance: { authority: "commander", operation: "retract" }, recordedAt: new Date().toISOString() });
    this.persist(collection); return this.clone(record);
  },
};