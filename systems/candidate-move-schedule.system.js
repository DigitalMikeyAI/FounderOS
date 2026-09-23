// One-time Commander-authored planned instants, not deadlines or execution.
const CandidateMoveScheduleSystem = {
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
      const move = CandidateMoveSystem.getCandidateMove();
      const history = CandidateMoveSystem.getCandidateMoveHistory();
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
    if (typeof record.id !== "string" || !/^schedule_[a-z0-9]+_[a-z0-9]+$/.test(record.id)) return null;
    if (record.candidateMoveId !== relationships.move.current.id || !Number.isInteger(record.candidateMoveRevision) || record.candidateMoveRevision < 1) return null;
    const acceptedAction = this.actionForRevision(relationships, record.candidateMoveRevision);
    if (!acceptedAction || !Array.isArray(record.revisions) || !record.revisions.length) return null;
    let previous = null;
    for (let index = 0; index < record.revisions.length; index += 1) {
      const revision = record.revisions[index];
      if (!this.hasExactKeys(revision, ["revision", "status", "occursAt", "provenance", "recordedAt"]) || revision.revision !== index + 1 || !this.isCanonicalUtc(revision.occursAt) || !this.isCanonicalUtc(revision.recordedAt) || !this.hasExactKeys(revision.provenance, ["authority", "operation"]) || revision.provenance.authority !== "commander") return null;
      if (!previous) {
        if (revision.status !== "scheduled" || revision.provenance.operation !== "create") return null;
      } else {
        if (previous.status !== "scheduled") return null;
        if (revision.provenance.operation === "reschedule") {
          if (revision.status !== "scheduled" || revision.occursAt === previous.occursAt) return null;
        } else if (revision.provenance.operation === "cancel") {
          if (revision.status !== "canceled" || revision.occursAt !== previous.occursAt) return null;
        } else return null;
      }
      previous = revision;
    }
    return { id: record.id, candidateMoveId: record.candidateMoveId, candidateMoveRevision: record.candidateMoveRevision, acceptedAction, revision: previous.revision, status: previous.status, occursAt: previous.occursAt, currentMoveRevision: relationships.move.current.revision, currentMoveStatus: relationships.move.current.status };
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
  getSchedules() {
    if (!this.usableStorage() || typeof founder === "undefined" || !founder || typeof founder !== "object") return { status: "unavailable", reason: "founder-storage-unavailable" };
    if (!Object.hasOwn(founder, "candidateMoveSchedules")) return { status: "absent", schedules: null };
    const relationships = this.relationships();
    if (!relationships) return { status: "unavailable", reason: "schedule-candidate-move-unavailable" };
    const records = this.validateCollection(founder.candidateMoveSchedules, relationships);
    if (!records) return { status: "unavailable", reason: "schedule-collection-corrupt" };
    return { status: "available", schedules: this.clone(founder.candidateMoveSchedules), records: this.clone(records) };
  },
  getSchedule({ id } = {}) {
    const state = this.getSchedules(); if (state.status !== "available") return state;
    const current = state.records.find((record) => record.id === id);
    if (!current) return { status: "absent", schedule: null };
    return { status: "available", schedule: this.clone(state.schedules.records.find((record) => record.id === id)), current: this.clone(current) };
  },
  getScheduleHistory({ id } = {}) {
    const state = this.getSchedule({ id });
    return state.status === "available" ? { status: "available", id: state.current.id, candidateMoveId: state.current.candidateMoveId, candidateMoveRevision: state.current.candidateMoveRevision, acceptedAction: state.current.acceptedAction, revisions: this.clone(state.schedule.revisions) } : state;
  },
  canPublish() {
    if (typeof founder === "undefined" || !founder || typeof founder !== "object") return false;
    const own = Object.getOwnPropertyDescriptor(founder, "candidateMoveSchedules");
    if (own) return "value" in own && own.writable !== false;
    for (let prototype = Object.getPrototypeOf(founder); prototype; prototype = Object.getPrototypeOf(prototype)) {
      const descriptor = Object.getOwnPropertyDescriptor(prototype, "candidateMoveSchedules");
      if (!descriptor) continue;
      if (!("value" in descriptor) || descriptor.writable === false) return false;
      break;
    }
    return Object.isExtensible(founder);
  },
  persist(collection) {
    if (!this.canPublish()) throw new Error("Founder Planned Times cannot be published safely.");
    if (typeof CommanderSystem === "undefined" || !CommanderSystem || typeof CommanderSystem.save !== "function") throw new Error("Founder persistence is unavailable.");
    const candidate = this.clone(founder);
    candidate.candidateMoveSchedules = this.clone(collection);
    if (CommanderSystem.save(candidate) !== true) throw new Error("Founder persistence was not confirmed.");
    founder.candidateMoveSchedules = collection;
  },
  scheduleOccurrence({ candidateMoveId, expectedCandidateMoveRevision, occursAt } = {}) {
    if (!this.usableStorage()) throw new Error("Founder storage is unavailable.");
    const relationships = this.relationships();
    if (!relationships || relationships.move.current.status !== "active") throw new Error("Candidate Move is unavailable.");
    if (candidateMoveId !== relationships.move.current.id || expectedCandidateMoveRevision !== relationships.move.current.revision) throw new Error("Candidate Move revision does not match.");
    if (!this.isCanonicalUtc(occursAt)) throw new Error("Planned instant is invalid.");
    const existing = this.getSchedules();
    if (!["available", "absent"].includes(existing.status)) throw new Error("Planned Time collection is unavailable.");
    const collection = existing.status === "available" ? existing.schedules : { schemaVersion: this.SCHEMA_VERSION, records: [] };
    const id = `schedule_${Date.now().toString(36)}_${Math.random().toString(36).slice(2) || "0"}`;
    if (collection.records.some((record) => record.id === id)) throw new Error("Planned Time identity collision.");
    const record = { id, candidateMoveId, candidateMoveRevision: expectedCandidateMoveRevision, revisions: [{ revision: 1, status: "scheduled", occursAt, provenance: { authority: "commander", operation: "create" }, recordedAt: new Date().toISOString() }] };
    collection.records.push(record);
    this.persist(collection);
    return this.clone(record);
  },
  mutate({ id, expectedRevision, operation, occursAt } = {}) {
    if (!["reschedule", "cancel"].includes(operation)) throw new Error("Planned Time operation is invalid.");
    const state = this.getSchedule({ id });
    if (state.status !== "available") throw new Error("Planned Time is unavailable.");
    if (state.current.revision !== expectedRevision || state.current.status !== "scheduled") throw new Error("Planned Time revision does not match.");
    const nextTime = operation === "cancel" ? state.current.occursAt : occursAt;
    if (!this.isCanonicalUtc(nextTime)) throw new Error("Planned instant is invalid.");
    if (operation === "reschedule" && nextTime === state.current.occursAt) return this.clone(state.schedule);
    const collection = this.clone(founder.candidateMoveSchedules);
    const record = collection.records.find((item) => item.id === id);
    record.revisions.push({ revision: state.current.revision + 1, status: operation === "cancel" ? "canceled" : "scheduled", occursAt: nextTime, provenance: { authority: "commander", operation }, recordedAt: new Date().toISOString() });
    this.persist(collection);
    return this.clone(record);
  },
  rescheduleOccurrence({ id, expectedRevision, occursAt } = {}) { return this.mutate({ id, expectedRevision, operation: "reschedule", occursAt }); },
  cancelOccurrence({ id, expectedRevision } = {}) { return this.mutate({ id, expectedRevision, operation: "cancel" }); },
};
