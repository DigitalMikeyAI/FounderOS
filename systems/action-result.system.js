// Commander-reported associated result, not success, causality, completion, or resolution.
const ActionResultSystem = {
  version: "1.0.0",
  SCHEMA_VERSION: 1,
  MAX_TEXT_LENGTH: 2000,
  UTC_PATTERN: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,

  clone(value) { return JSON.parse(JSON.stringify(value)); },
  hasExactKeys(value, keys) { return value !== null && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === keys.length && Object.keys(value).every((key) => keys.includes(key)); },
  getStorageStatus() { return typeof getFounderStorageLoadStatus === "function" ? getFounderStorageLoadStatus() : null; },
  usableStorage() { return ["loaded", "absent"].includes(this.getStorageStatus()); },
  isCanonicalUtc(value) { return typeof value === "string" && this.UTC_PATTERN.test(value) && !Number.isNaN(new Date(value).getTime()) && new Date(value).toISOString() === value; },
  normalizeText(value) { if (typeof value !== "string") return null; const normalized = value.trim(); return normalized.length > 0 && normalized.length <= this.MAX_TEXT_LENGTH ? normalized : null; },
  isPerformanceId(value) { return typeof value === "string" && /^performance_[a-z0-9]+_[a-z0-9]+$/.test(value); },
  isCandidateMoveId(value) { return typeof value === "string" && /^candidate_move_[a-z0-9]+_[a-z0-9]+$/.test(value); },

  performanceFor(performanceId) {
    if (!this.isPerformanceId(performanceId)) return null;
    if (typeof CandidateMovePerformanceSystem === "undefined" || !CandidateMovePerformanceSystem || typeof CandidateMovePerformanceSystem.getPerformance !== "function") return null;
    try {
      const state = CandidateMovePerformanceSystem.getPerformance({ id: performanceId });
      if (!state || state.status !== "available" || !this.hasExactKeys(state.performance, ["id", "candidateMoveId", "candidateMoveRevision", "revisions"]) || !Array.isArray(state.performance.revisions) || !state.performance.revisions.length) return null;
      const performance = state.performance;
      if (!this.isPerformanceId(performance.id) || performance.id !== performanceId || !this.isCandidateMoveId(performance.candidateMoveId) || !Number.isInteger(performance.candidateMoveRevision) || performance.candidateMoveRevision < 1) return null;
      let previous = null;
      for (let index = 0; index < performance.revisions.length; index += 1) {
        const revision = performance.revisions[index];
        if (!this.hasExactKeys(revision, ["revision", "status", "performedAt", "provenance", "recordedAt"]) || revision.revision !== index + 1 || !this.isCanonicalUtc(revision.performedAt) || !this.isCanonicalUtc(revision.recordedAt) || !this.hasExactKeys(revision.provenance, ["authority", "operation"]) || revision.provenance.authority !== "commander") return null;
        if (!previous) {
          if (revision.status !== "reported" || revision.provenance.operation !== "report") return null;
        } else if (previous.status !== "reported" || revision.status !== "retracted" || revision.provenance.operation !== "retract" || revision.performedAt !== previous.performedAt) return null;
        previous = revision;
      }
      const current = state.current;
      if (!current || typeof current !== "object" || Array.isArray(current) || !this.isPerformanceId(current.id) || current.id !== performance.id || !this.isCandidateMoveId(current.candidateMoveId) || current.candidateMoveId !== performance.candidateMoveId || current.candidateMoveRevision !== performance.candidateMoveRevision || current.revision !== previous.revision || current.status !== previous.status || current.performedAt !== previous.performedAt || current.recordedAt !== previous.recordedAt || this.normalizeText(current.acceptedAction) !== current.acceptedAction) return null;
      return { performance: this.clone(performance), current: this.clone(current) };
    } catch (error) { return null; }
  },

  validateRecord(record) {
    if (!this.hasExactKeys(record, ["id", "performanceId", "revisions"])) return null;
    if (typeof record.id !== "string" || !/^action_result_[a-z0-9]+_[a-z0-9]+$/.test(record.id) || typeof record.performanceId !== "string") return null;
    const relationship = this.performanceFor(record.performanceId);
    if (!relationship || !Array.isArray(record.revisions) || !record.revisions.length) return null;
    let previous = null;
    for (let index = 0; index < record.revisions.length; index += 1) {
      const revision = record.revisions[index];
      if (!this.hasExactKeys(revision, ["revision", "status", "text", "occurredAt", "provenance", "recordedAt"]) || revision.revision !== index + 1 || this.normalizeText(revision.text) !== revision.text || !this.isCanonicalUtc(revision.occurredAt) || !this.isCanonicalUtc(revision.recordedAt) || !this.hasExactKeys(revision.provenance, ["authority", "operation"]) || revision.provenance.authority !== "commander") return null;
      if (!previous) {
        if (revision.status !== "reported" || revision.provenance.operation !== "report") return null;
      } else if (previous.status !== "reported" || revision.status !== "retracted" || revision.provenance.operation !== "retract" || revision.text !== previous.text || revision.occurredAt !== previous.occurredAt) return null;
      previous = revision;
    }
    return { id: record.id, performanceId: record.performanceId, performanceStatus: relationship.current.status, candidateMoveId: relationship.current.candidateMoveId, candidateMoveRevision: relationship.current.candidateMoveRevision, acceptedAction: relationship.current.acceptedAction, revision: previous.revision, status: previous.status, text: previous.text, occurredAt: previous.occurredAt, recordedAt: previous.recordedAt };
  },

  validateCollection(collection) {
    if (!this.hasExactKeys(collection, ["schemaVersion", "records"]) || collection.schemaVersion !== this.SCHEMA_VERSION || !Array.isArray(collection.records)) return null;
    const ids = new Set(); const records = [];
    for (const record of collection.records) {
      const current = this.validateRecord(record);
      if (!current || ids.has(current.id)) return null;
      ids.add(current.id); records.push(current);
    }
    return records;
  },

  getActionResults() {
    if (!this.usableStorage() || typeof founder === "undefined" || !founder || typeof founder !== "object") return { status: "unavailable", reason: "founder-storage-unavailable" };
    if (!Object.hasOwn(founder, "actionResults")) return { status: "absent", actionResults: null };
    const records = this.validateCollection(founder.actionResults);
    if (!records) return { status: "unavailable", reason: "action-result-collection-corrupt" };
    return { status: "available", actionResults: this.clone(founder.actionResults), records: this.clone(records) };
  },
  getActionResult({ id } = {}) {
    const state = this.getActionResults(); if (state.status !== "available") return state;
    const current = state.records.find((record) => record.id === id);
    if (!current) return { status: "absent", actionResult: null };
    return { status: "available", actionResult: this.clone(state.actionResults.records.find((record) => record.id === id)), current: this.clone(current) };
  },
  getActionResultHistory({ id } = {}) {
    const state = this.getActionResult({ id });
    return state.status === "available" ? { status: "available", id: state.current.id, performanceId: state.current.performanceId, performanceStatus: state.current.performanceStatus, candidateMoveId: state.current.candidateMoveId, candidateMoveRevision: state.current.candidateMoveRevision, acceptedAction: state.current.acceptedAction, revisions: this.clone(state.actionResult.revisions) } : state;
  },

  canPublish() {
    if (typeof founder === "undefined" || !founder || typeof founder !== "object") return false;
    const own = Object.getOwnPropertyDescriptor(founder, "actionResults");
    if (own) return "value" in own && own.writable !== false;
    for (let prototype = Object.getPrototypeOf(founder); prototype; prototype = Object.getPrototypeOf(prototype)) {
      const descriptor = Object.getOwnPropertyDescriptor(prototype, "actionResults");
      if (!descriptor) continue;
      if (!("value" in descriptor) || descriptor.writable === false) return false;
      break;
    }
    return Object.isExtensible(founder);
  },
  persist(collection) {
    if (!this.canPublish()) throw new Error("Founder Action Results cannot be published safely.");
    if (typeof CommanderSystem === "undefined" || !CommanderSystem || typeof CommanderSystem.save !== "function") throw new Error("Founder persistence is unavailable.");
    const candidate = this.clone(founder); candidate.actionResults = this.clone(collection);
    if (CommanderSystem.save(candidate) !== true) throw new Error("Founder persistence was not confirmed.");
    founder.actionResults = collection;
  },

  reportActionResult({ performanceId, text, occurredAt } = {}) {
    if (!this.usableStorage()) throw new Error("Founder storage is unavailable.");
    const relationship = this.performanceFor(performanceId);
    if (!relationship || relationship.current.revision !== 1 || relationship.current.status !== "reported") throw new Error("Performance is unavailable for Action Result reporting.");
    const normalizedText = this.normalizeText(text);
    if (!normalizedText) throw new Error("Action Result text is required.");
    if (!this.isCanonicalUtc(occurredAt)) throw new Error("Action Result instant is invalid.");
    const existing = this.getActionResults();
    if (!["available", "absent"].includes(existing.status)) throw new Error("Action Result collection is unavailable.");
    const collection = existing.status === "available" ? existing.actionResults : { schemaVersion: this.SCHEMA_VERSION, records: [] };
    const id = `action_result_${Date.now().toString(36)}_${Math.random().toString(36).slice(2) || "0"}`;
    if (collection.records.some((record) => record.id === id)) throw new Error("Action Result identity collision.");
    const record = { id, performanceId, revisions: [{ revision: 1, status: "reported", text: normalizedText, occurredAt, provenance: { authority: "commander", operation: "report" }, recordedAt: new Date().toISOString() }] };
    collection.records.push(record); this.persist(collection); return this.clone(record);
  },
  retractActionResult({ id, expectedRevision } = {}) {
    if (!this.usableStorage()) throw new Error("Founder storage is unavailable.");
    const state = this.getActionResult({ id });
    if (state.status !== "available") throw new Error("Action Result is unavailable.");
    if (state.current.revision !== expectedRevision || state.current.status !== "reported") throw new Error("Action Result revision does not match.");
    const collection = this.clone(founder.actionResults); const record = collection.records.find((item) => item.id === id);
    record.revisions.push({ revision: state.current.revision + 1, status: "retracted", text: state.current.text, occurredAt: state.current.occurredAt, provenance: { authority: "commander", operation: "retract" }, recordedAt: new Date().toISOString() });
    this.persist(collection); return this.clone(record);
  },
};