// =====================================================
// FOUNDEROS
// CANDIDATE MOVE ROUTINE SYSTEM
// Commander-established recurring rule; read-only occurrence projection.
// =====================================================

const CandidateMoveRoutineSystem = {
  version: "1.0.0",
  SCHEMA_VERSION: 1,
  UTC_PATTERN: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
  TIME_PATTERN: /^(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\dZ$/,

  clone(value) { return JSON.parse(JSON.stringify(value)); },
  hasExactKeys(value, keys) { return value !== null && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === keys.length && Object.keys(value).every((key) => keys.includes(key)); },
  getStorageStatus() { return typeof getFounderStorageLoadStatus === "function" ? getFounderStorageLoadStatus() : null; },
  usableStorage() { const status = this.getStorageStatus(); return status === "loaded" || status === "absent"; },
  isCanonicalUtc(value) { return typeof value === "string" && this.UTC_PATTERN.test(value) && !Number.isNaN(new Date(value).getTime()) && new Date(value).toISOString() === value; },
  same(value, other) { return JSON.stringify(value) === JSON.stringify(other); },
  sameSchedule(value, other) { return value.kind === other.kind && value.weekday === other.weekday && value.opensAtUtc === other.opensAtUtc && value.closesAtUtc === other.closesAtUtc; },
  validSchedule(schedule) {
    if (!this.hasExactKeys(schedule, ["kind", "weekday", "opensAtUtc", "closesAtUtc"])) return false;
    if (schedule.kind !== "weekly-utc" || !Number.isInteger(schedule.weekday) || schedule.weekday < 1 || schedule.weekday > 7) return false;
    if (!this.TIME_PATTERN.test(schedule.opensAtUtc) || !this.TIME_PATTERN.test(schedule.closesAtUtc)) return false;
    return schedule.opensAtUtc < schedule.closesAtUtc;
  },
  relationships() {
    if (typeof CandidateMoveSystem === "undefined" || typeof CandidateMoveSystem.getCandidateMove !== "function" || typeof CandidateMoveSystem.getCandidateMoveHistory !== "function") return null;
    const move = CandidateMoveSystem.getCandidateMove(); const history = CandidateMoveSystem.getCandidateMoveHistory();
    return move.status === "available" && history.status === "available" ? { move, history } : null;
  },
  actionForRevision(relationships, revision) {
    const found = relationships.history.revisions.find((item) => item.revision === revision);
    return found && found.status === "active" ? found.action : null;
  },
  validateRecord(record, relationships) {
    if (!this.hasExactKeys(record, ["id", "candidateMoveId", "candidateMoveRevision", "revisions"])) return null;
    if (typeof record.id !== "string" || !/^routine_[a-z0-9]+_[a-z0-9]+$/.test(record.id)) return null;
    if (record.candidateMoveId !== relationships.move.current.id || !Number.isInteger(record.candidateMoveRevision) || record.candidateMoveRevision < 1 || !this.actionForRevision(relationships, record.candidateMoveRevision)) return null;
    if (!Array.isArray(record.revisions) || record.revisions.length === 0) return null;
    let priorStatus = null; let schedule = null; let latest = null;
    for (let index = 0; index < record.revisions.length; index += 1) {
      const revision = record.revisions[index];
      if (!this.hasExactKeys(revision, ["revision", "status", "schedule", "provenance", "recordedAt"]) || revision.revision !== index + 1 || !this.validSchedule(revision.schedule) || !this.isCanonicalUtc(revision.recordedAt) || !this.hasExactKeys(revision.provenance, ["authority", "operation"]) || revision.provenance.authority !== "commander") return null;
      if (index === 0) {
        if (revision.status !== "active" || revision.provenance.operation !== "create") return null;
        schedule = revision.schedule;
      } else {
        if (!this.sameSchedule(revision.schedule, schedule)) return null;
        if (priorStatus === "active" && revision.status === "paused" && revision.provenance.operation === "pause") { /* valid */ }
        else if (priorStatus === "paused" && revision.status === "active" && revision.provenance.operation === "resume") { /* valid */ }
        else if ((priorStatus === "active" || priorStatus === "paused") && revision.status === "retired" && revision.provenance.operation === "retire") { /* valid */ }
        else return null;
      }
      priorStatus = revision.status; latest = revision;
    }
    return { id: record.id, candidateMoveId: record.candidateMoveId, candidateMoveRevision: record.candidateMoveRevision, action: this.actionForRevision(relationships, record.candidateMoveRevision), revision: latest.revision, status: latest.status, schedule: this.clone(latest.schedule), recordedAt: latest.recordedAt };
  },
  validateCollection(collection, relationships) {
    if (!this.hasExactKeys(collection, ["schemaVersion", "records"]) || collection.schemaVersion !== this.SCHEMA_VERSION || !Array.isArray(collection.records)) return null;
    const ids = new Set(); const activeByMove = new Set(); const records = [];
    for (const record of collection.records) {
      const current = this.validateRecord(record, relationships); if (!current || ids.has(current.id)) return null;
      if (current.status !== "retired" && activeByMove.has(current.candidateMoveId)) return null;
      ids.add(current.id); if (current.status !== "retired") activeByMove.add(current.candidateMoveId); records.push(current);
    }
    return records;
  },
  collectionState() {
    const storage = this.getStorageStatus();
    if (storage !== "loaded" && storage !== "absent") return { status: "unavailable", reason: "founder-storage-unavailable" };
    if (typeof founder === "undefined" || !founder || typeof founder !== "object") return { status: "unavailable", reason: "founder-storage-unavailable" };
    if (!Object.hasOwn(founder, "routines")) return { status: "absent" };
    if (!this.hasExactKeys(founder.routines, ["schemaVersion", "records"]) || founder.routines.schemaVersion !== this.SCHEMA_VERSION || !Array.isArray(founder.routines.records)) return { status: "unavailable", reason: "routine-collection-corrupt" };
    if (founder.routines.records.length === 0) return { status: "available", records: [], relationships: null };
    const relationships = this.relationships(); if (!relationships) return { status: "unavailable", reason: "routine-relationship-unavailable" };
    const records = this.validateCollection(founder.routines, relationships);
    return records ? { status: "available", records, relationships } : { status: "unavailable", reason: "routine-collection-corrupt" };
  },
  summary(record, current, relationships) {
    return { id: current.id, candidateMoveId: current.candidateMoveId, candidateMoveRevision: current.candidateMoveRevision, action: current.action, lifecycle: current.status, schedule: this.clone(current.schedule), currentCandidateMoveRevision: relationships.move.current.revision, currentCandidateMoveStatus: relationships.move.current.status, revisions: this.clone(record.revisions) };
  },
  getRoutines() {
    const state = this.collectionState(); if (state.status !== "available") return state;
    return { status: "available", routines: founder.routines.records.map((record, index) => this.summary(record, state.records[index], state.relationships)) };
  },
  getRoutine({ id } = {}) {
    const state = this.collectionState(); if (state.status !== "available") return state;
    const index = state.records.findIndex((record) => record.id === id); if (index < 0) return { status: "absent" };
    return { status: "available", routine: this.summary(founder.routines.records[index], state.records[index], state.relationships), current: this.clone(state.records[index]) };
  },
  getRoutineHistory({ id } = {}) {
    const state = this.getRoutine({ id }); if (state.status !== "available") return state;
    return { status: "available", id: state.routine.id, candidateMoveId: state.routine.candidateMoveId, candidateMoveRevision: state.routine.candidateMoveRevision, revisions: this.clone(state.routine.revisions) };
  },
  getRoutineOccurrence({ id, asOf } = {}) {
    const state = this.getRoutine({ id }); if (state.status !== "available") return state.status === "absent" ? { status: "absent" } : { status: "unavailable", reason: state.reason || "routine-unavailable" };
    const evaluatedAt = asOf === undefined ? new Date().toISOString() : asOf;
    if (!this.isCanonicalUtc(evaluatedAt)) return { status: "unavailable", reason: "routine-occurrence-as-of-invalid" };
    if (evaluatedAt < state.current.recordedAt) return { status: "unavailable", reason: "routine-occurrence-before-lifecycle" };
    const none = { status: "available", occurrence: "none", id: state.routine.id, evaluatedAt };
    if (state.current.status !== "active" || state.routine.currentCandidateMoveStatus !== "active" || state.routine.currentCandidateMoveRevision !== state.current.candidateMoveRevision) return none;
    const date = new Date(evaluatedAt); const weekday = ((date.getUTCDay() + 6) % 7) + 1;
    const milliseconds = (value) => { const [hours, minutes, seconds] = value.slice(0, 8).split(":").map(Number); return ((hours * 60 + minutes) * 60 + seconds) * 1000; };
    const currentMilliseconds = ((date.getUTCHours() * 60 + date.getUTCMinutes()) * 60 + date.getUTCSeconds()) * 1000 + date.getUTCMilliseconds();
    if (weekday !== state.current.schedule.weekday || currentMilliseconds < milliseconds(state.current.schedule.opensAtUtc) || currentMilliseconds > milliseconds(state.current.schedule.closesAtUtc)) return none;
    const scheduledDateUtc = date.toISOString().slice(0, 10);
    return { status: "available", occurrence: "current", routineId: state.routine.id, occurrenceKey: `${state.routine.id}:${scheduledDateUtc}`, scheduledDateUtc, opensAt: `${scheduledDateUtc}T${state.current.schedule.opensAtUtc.slice(0, 8)}.000Z`, closesAt: `${scheduledDateUtc}T${state.current.schedule.closesAtUtc.slice(0, 8)}.000Z` };
  },
  canPublish() {
    if (typeof founder === "undefined" || !founder || typeof founder !== "object") return false;
    const own = Object.getOwnPropertyDescriptor(founder, "routines"); if (own) return "value" in own && own.writable !== false;
    for (let prototype = Object.getPrototypeOf(founder); prototype; prototype = Object.getPrototypeOf(prototype)) { const descriptor = Object.getOwnPropertyDescriptor(prototype, "routines"); if (!descriptor) continue; if (!("value" in descriptor) || descriptor.writable === false) return false; break; }
    return Object.isExtensible(founder);
  },
  persist(collection) {
    if (!this.canPublish()) throw new Error("Founder Routines cannot be published safely.");
    if (typeof CommanderSystem === "undefined" || typeof CommanderSystem.save !== "function") throw new Error("Founder persistence is unavailable.");
    const candidateFounder = this.clone(founder); candidateFounder.routines = collection;
    if (CommanderSystem.save(candidateFounder) !== true) throw new Error("Founder persistence was not confirmed.");
    founder.routines = collection;
  },
  createRoutine({ candidateMoveId, expectedCandidateMoveRevision, schedule } = {}) {
    if (!this.usableStorage()) throw new Error("Founder storage is unavailable.");
    const relationships = this.relationships(); if (!relationships || relationships.move.current.status !== "active") throw new Error("Candidate Move is unavailable.");
    if (candidateMoveId !== relationships.move.current.id || expectedCandidateMoveRevision !== relationships.move.current.revision) throw new Error("Candidate Move revision does not match.");
    if (!this.validSchedule(schedule)) throw new Error("Routine schedule is invalid.");
    const existing = Object.hasOwn(founder, "routines") ? this.validateCollection(founder.routines, relationships) : [];
    if (!existing) throw new Error("Routine collection is unavailable.");
    if (existing.some((record) => record.candidateMoveId === candidateMoveId && record.status !== "retired")) throw new Error("A non-retired Routine already exists for this Candidate Move.");
    const record = { id: `routine_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`, candidateMoveId, candidateMoveRevision: expectedCandidateMoveRevision, revisions: [{ revision: 1, status: "active", schedule: this.clone(schedule), provenance: { authority: "commander", operation: "create" }, recordedAt: new Date().toISOString() }] };
    this.persist({ schemaVersion: this.SCHEMA_VERSION, records: [...(founder.routines?.records || []), record] }); return this.clone(record);
  },
  mutate({ id, expectedRevision, operation } = {}) {
    if (!this.usableStorage()) throw new Error("Founder storage is unavailable.");
    const state = this.getRoutine({ id }); if (state.status !== "available") throw new Error("Routine is unavailable.");
    if (expectedRevision !== state.current.revision) throw new Error("Routine revision does not match.");
    const validTransition = (operation === "pause" && state.current.status === "active") || (operation === "resume" && state.current.status === "paused") || (operation === "retire" && (state.current.status === "active" || state.current.status === "paused"));
    if (!validTransition) throw new Error("Routine lifecycle transition is invalid.");
    if (operation === "resume" && (state.routine.currentCandidateMoveStatus !== "active" || state.routine.currentCandidateMoveRevision !== state.current.candidateMoveRevision)) throw new Error("Candidate Move revision does not match.");
    const collection = this.clone(founder.routines); const record = collection.records.find((item) => item.id === id);
    record.revisions.push({ revision: state.current.revision + 1, status: operation === "pause" ? "paused" : operation === "resume" ? "active" : "retired", schedule: this.clone(state.current.schedule), provenance: { authority: "commander", operation }, recordedAt: new Date().toISOString() });
    this.persist(collection); return this.clone(record);
  },
  pauseRoutine({ id, expectedRevision } = {}) { return this.mutate({ id, expectedRevision, operation: "pause" }); },
  resumeRoutine({ id, expectedRevision } = {}) { return this.mutate({ id, expectedRevision, operation: "resume" }); },
  retireRoutine({ id, expectedRevision } = {}) { return this.mutate({ id, expectedRevision, operation: "retire" }); },
};