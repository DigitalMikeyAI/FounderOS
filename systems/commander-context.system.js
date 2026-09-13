// =====================================================
// FOUNDEROS
// COMMANDER CONTEXT SYSTEM
// Commander-established Situation scope; eligibility only.
// =====================================================

const CommanderContextSystem = {
  version: "1.0.0",
  SCHEMA_VERSION: 1,
  UTC_PATTERN: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,

  clone(value) { return JSON.parse(JSON.stringify(value)); },
  hasExactKeys(value, keys) { return value !== null && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === keys.length && Object.keys(value).every((key) => keys.includes(key)); },
  getStorageStatus() { return typeof getFounderStorageLoadStatus === "function" ? getFounderStorageLoadStatus() : null; },
  usableStorage() { const status = this.getStorageStatus(); return status === "loaded" || status === "absent"; },
  isCanonicalUtc(value) { return typeof value === "string" && this.UTC_PATTERN.test(value) && !Number.isNaN(new Date(value).getTime()) && new Date(value).toISOString() === value; },
  situation() { if (typeof SituationSystem === "undefined" || typeof SituationSystem.getSituation !== "function" || typeof SituationSystem.getSituationHistory !== "function") return null; const current = SituationSystem.getSituation(); const history = SituationSystem.getSituationHistory(); return current.status === "available" && history.status === "available" ? { current, history } : null; },
  validScope(scope, situation = null) {
    if (!scope || typeof scope !== "object" || Array.isArray(scope)) return false;
    if (scope.mode === "open") return this.hasExactKeys(scope, ["mode"]);
    return this.hasExactKeys(scope, ["mode", "situationIds"]) && scope.mode === "scoped" && Array.isArray(scope.situationIds) && scope.situationIds.length === 1 && typeof scope.situationIds[0] === "string" && /^situation_[a-z0-9]+_[a-z0-9]+$/.test(scope.situationIds[0]) && !!situation && situation.current.current.id === scope.situationIds[0];
  },
  sameScope(left, right) { return left.mode === right.mode && (left.mode === "open" || left.situationIds[0] === right.situationIds[0]); },
  validateContext(context) {
    if (!this.hasExactKeys(context, ["schemaVersion", "revisions"]) || context.schemaVersion !== this.SCHEMA_VERSION || !Array.isArray(context.revisions) || context.revisions.length === 0) return null;
    let situation = null; let prior = null; let latest = null;
    for (let index = 0; index < context.revisions.length; index += 1) {
      const revision = context.revisions[index];
      if (!this.hasExactKeys(revision, ["revision", "status", "scope", "provenance", "recordedAt"]) || revision.revision !== index + 1 || !this.isCanonicalUtc(revision.recordedAt) || !this.hasExactKeys(revision.provenance, ["authority", "operation"]) || revision.provenance.authority !== "commander") return null;
      if (revision.status === "active") {
        if (revision.scope && revision.scope.mode === "scoped") { situation = situation || this.situation(); if (!situation || !this.validScope(revision.scope, situation)) return null; }
        else if (!this.validScope(revision.scope)) return null;
        if (index === 0) { if (revision.provenance.operation !== "set") return null; }
        else if (prior.status === "cleared") { if (revision.provenance.operation !== "set") return null; }
        else if (prior.status === "active") { if (revision.provenance.operation !== "switch" || this.sameScope(prior.scope, revision.scope)) return null; }
        else return null;
      } else if (revision.status === "cleared") {
        if (revision.scope !== null || index === 0 || prior.status !== "active" || revision.provenance.operation !== "clear") return null;
      } else return null;
      prior = revision; latest = revision;
    }
    return { context: this.clone(context), current: this.clone(latest) };
  },
  state() {
    const storage = this.getStorageStatus(); if (storage !== "loaded" && storage !== "absent") return { status: "unavailable", reason: "founder-storage-unavailable" };
    if (typeof founder === "undefined" || !founder || typeof founder !== "object") return { status: "unavailable", reason: "founder-storage-unavailable" };
    if (!Object.hasOwn(founder, "commanderContext")) return { status: "absent" };
    const valid = this.validateContext(founder.commanderContext); return valid ? { status: "available", ...valid } : { status: "unavailable", reason: "commander-context-corrupt" };
  },
  getContext() { const state = this.state(); return state.status === "available" ? { status: "available", current: this.clone(state.current) } : state; },
  getContextHistory() { const state = this.state(); return state.status === "available" ? { status: "available", revisions: this.clone(state.context.revisions) } : state; },
  getSituationEligibility({ situationId } = {}) {
    const situation = this.situation(); if (!situation || situation.current.current.id !== situationId) return { status: "unavailable", reason: "situation-unavailable" };
    const state = this.state(); if (state.status === "absent") return { status: "available", eligibility: "unknown", reason: "context-absent" };
    if (state.status !== "available") return state;
    if (state.current.status === "cleared") return { status: "available", eligibility: "unknown", reason: "context-cleared", contextRevision: state.current.revision };
    if (state.current.scope.mode === "open") return { status: "available", eligibility: "eligible", reason: "context-open", contextRevision: state.current.revision };
    return state.current.scope.situationIds.includes(situationId) ? { status: "available", eligibility: "eligible", reason: "context-scoped-match", contextRevision: state.current.revision } : { status: "available", eligibility: "not-eligible", reason: "context-scoped-mismatch", contextRevision: state.current.revision };
  },
  canPublish() { if (typeof founder === "undefined" || !founder || typeof founder !== "object") return false; const own = Object.getOwnPropertyDescriptor(founder, "commanderContext"); if (own) return "value" in own && own.writable !== false; for (let prototype = Object.getPrototypeOf(founder); prototype; prototype = Object.getPrototypeOf(prototype)) { const descriptor = Object.getOwnPropertyDescriptor(prototype, "commanderContext"); if (!descriptor) continue; if (!("value" in descriptor) || descriptor.writable === false) return false; break; } return Object.isExtensible(founder); },
  persist(context) { if (!this.canPublish()) throw new Error("Founder Context cannot be published safely."); if (typeof CommanderSystem === "undefined" || typeof CommanderSystem.save !== "function") throw new Error("Founder persistence is unavailable."); const candidate = this.clone(founder); candidate.commanderContext = context; if (CommanderSystem.save(candidate) !== true) throw new Error("Founder persistence was not confirmed."); founder.commanderContext = context; },
  set(scope, expectedRevision) {
    if (!this.usableStorage()) throw new Error("Founder storage is unavailable."); const state = this.state(); if (state.status === "unavailable") throw new Error("Commander Context is unavailable."); const actual = state.status === "absent" ? 0 : state.current.revision; if (expectedRevision !== actual) throw new Error("Commander Context revision does not match.");
    if (scope.mode === "scoped" && !this.validScope(scope, this.situation())) throw new Error("Commander Context Situation scope is invalid."); if (scope.mode === "open" && !this.validScope(scope)) throw new Error("Commander Context scope is invalid.");
    if (state.status === "available" && state.current.status === "active" && this.sameScope(state.current.scope, scope)) return this.clone(state.context);
    const operation = state.status === "available" && state.current.status === "active" ? "switch" : "set"; const revisions = state.status === "absent" ? [] : this.clone(state.context.revisions); revisions.push({ revision: actual + 1, status: "active", scope: this.clone(scope), provenance: { authority: "commander", operation }, recordedAt: new Date().toISOString() }); const context = { schemaVersion: this.SCHEMA_VERSION, revisions }; this.persist(context); return this.clone(context);
  },
  setScopedContext({ situationIds, expectedRevision } = {}) { return this.set({ mode: "scoped", situationIds }, expectedRevision); },
  setOpenContext({ expectedRevision } = {}) { return this.set({ mode: "open" }, expectedRevision); },
  clearContext({ expectedRevision } = {}) {
    if (!this.usableStorage()) throw new Error("Founder storage is unavailable."); const state = this.state(); if (state.status === "unavailable") throw new Error("Commander Context is unavailable."); const actual = state.status === "absent" ? 0 : state.current.revision; if (expectedRevision !== actual) throw new Error("Commander Context revision does not match."); if (state.status === "absent") return { status: "absent" }; if (state.current.status === "cleared") return this.clone(state.context);
    const context = this.clone(state.context); context.revisions.push({ revision: actual + 1, status: "cleared", scope: null, provenance: { authority: "commander", operation: "clear" }, recordedAt: new Date().toISOString() }); this.persist(context); return this.clone(context);
  },
};