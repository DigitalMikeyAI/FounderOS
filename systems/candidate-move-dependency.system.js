// =====================================================
// FOUNDEROS
// CANDIDATE MOVE DEPENDENCY SYSTEM
// Commander-established external blocking condition only.
// =====================================================

const CandidateMoveDependencySystem = {
  version: "1.0.0",
  SCHEMA_VERSION: 1,
  MAX_DESCRIPTION_LENGTH: 2000,

  clone(value) { return JSON.parse(JSON.stringify(value)); },
  getStorageStatus() { return typeof getFounderStorageLoadStatus === "function" ? getFounderStorageLoadStatus() : null; },
  getUsableStorageStatus() { const status = this.getStorageStatus(); return status === "loaded" || status === "absent" ? status : null; },
  normalizeDescription(value) {
    if (typeof value !== "string") return null;
    const normalized = value.trim();
    return normalized.length > 0 && normalized.length <= this.MAX_DESCRIPTION_LENGTH ? normalized : null;
  },
  validateRecordedAt(value) { return typeof value === "string" && !Number.isNaN(new Date(value).getTime()); },

  validateDependency(dependency) {
    if (!dependency || typeof dependency !== "object" || Array.isArray(dependency)) return null;
    if (dependency.schemaVersion !== this.SCHEMA_VERSION) return null;
    if (typeof dependency.id !== "string" || !/^candidate_move_dependency_[a-z0-9]+_[a-z0-9]+$/.test(dependency.id)) return null;
    if (typeof dependency.candidateMoveId !== "string" || !/^candidate_move_[a-z0-9]+_[a-z0-9]+$/.test(dependency.candidateMoveId)) return null;
    if (!Array.isArray(dependency.revisions) || dependency.revisions.length === 0) return null;

    let description = null; let resolved = false;
    for (let index = 0; index < dependency.revisions.length; index += 1) {
      const revision = dependency.revisions[index];
      if (!revision || typeof revision !== "object" || Array.isArray(revision)) return null;
      if (revision.revision !== index + 1 || revision.kind !== "external-condition") return null;
      if (this.normalizeDescription(revision.description) !== revision.description) return null;
      if (!this.validateRecordedAt(revision.recordedAt)) return null;
      if (!revision.provenance || revision.provenance.authority !== "commander") return null;
      if (resolved) return null;
      if (index === 0) {
        if (revision.status !== "unresolved" || revision.provenance.operation !== "create") return null;
        description = revision.description;
      } else if (revision.provenance.operation === "correct") {
        if (revision.status !== "unresolved" || revision.description === description) return null;
        description = revision.description;
      } else if (revision.provenance.operation === "resolve") {
        if (revision.status !== "resolved" || revision.description !== description) return null;
        resolved = true;
      } else return null;
    }
    const latest = dependency.revisions[dependency.revisions.length - 1];
    return { id: dependency.id, candidateMoveId: dependency.candidateMoveId, revision: latest.revision, description, status: latest.status };
  },

  getLinkedCandidateMove() {
    if (typeof CandidateMoveSystem === "undefined" || typeof CandidateMoveSystem.getCandidateMove !== "function") return null;
    const state = CandidateMoveSystem.getCandidateMove();
    return state && state.status === "available" ? state : null;
  },

  getDependency() {
    const storageStatus = this.getStorageStatus();
    if (storageStatus === "not-loaded") return { status: "unavailable", reason: "founder-storage-not-loaded" };
    if (storageStatus === "failed") return { status: "unavailable", reason: "founder-storage-failed" };
    if ((storageStatus !== "loaded" && storageStatus !== "absent") || typeof founder === "undefined") return { status: "unavailable", reason: "founder-storage-unavailable" };
    if (!Object.hasOwn(founder, "candidateMoveDependency")) return { status: "absent", dependency: null };
    const current = this.validateDependency(founder.candidateMoveDependency);
    if (!current) return { status: "unavailable", reason: "candidate-move-dependency-corrupt" };
    const candidateMove = this.getLinkedCandidateMove();
    if (!candidateMove) return { status: "unavailable", reason: "candidate-move-dependency-candidate-move-unavailable" };
    if (candidateMove.current.id !== current.candidateMoveId) return { status: "unavailable", reason: "candidate-move-dependency-candidate-move-mismatch" };
    return { status: "available", dependency: this.clone(founder.candidateMoveDependency), current: this.clone(current) };
  },

  getDependencyHistory() {
    const state = this.getDependency();
    return state.status === "available" ? { status: "available", id: state.current.id, candidateMoveId: state.current.candidateMoveId, revisions: this.clone(state.dependency.revisions) } : state;
  },

  canPublishDependency() {
    if (typeof founder === "undefined" || !founder || typeof founder !== "object") return false;
    const own = Object.getOwnPropertyDescriptor(founder, "candidateMoveDependency");
    if (own) return "value" in own && own.writable !== false;
    for (let prototype = Object.getPrototypeOf(founder); prototype; prototype = Object.getPrototypeOf(prototype)) {
      const descriptor = Object.getOwnPropertyDescriptor(prototype, "candidateMoveDependency");
      if (!descriptor) continue;
      if (!("value" in descriptor) || descriptor.writable === false) return false;
      break;
    }
    return Object.isExtensible(founder);
  },

  persistAndPublish(dependency) {
    if (!this.canPublishDependency()) throw new Error("Founder Candidate Move Dependency cannot be published safely.");
    if (typeof CommanderSystem === "undefined" || typeof CommanderSystem.save !== "function") throw new Error("Founder persistence is unavailable.");
    const candidateFounder = this.clone(founder);
    candidateFounder.candidateMoveDependency = dependency;
    if (CommanderSystem.save(candidateFounder) !== true) throw new Error("Founder persistence was not confirmed.");
    founder.candidateMoveDependency = dependency;
  },

  createDependency({ candidateMoveId, description } = {}) {
    if (!this.getUsableStorageStatus()) throw new Error("Founder storage is unavailable.");
    if (typeof founder === "undefined") throw new Error("Founder data is unavailable.");
    if (Object.hasOwn(founder, "candidateMoveDependency")) throw new Error("A Candidate Move Dependency already exists or is unavailable.");
    const candidateMove = this.getLinkedCandidateMove();
    if (!candidateMove) throw new Error("Candidate Move is unavailable.");
    if (candidateMoveId !== candidateMove.current.id) throw new Error("Candidate Move does not match.");
    if (candidateMove.current.status !== "active") throw new Error("Candidate Move is withdrawn.");
    const normalizedDescription = this.normalizeDescription(description);
    if (!normalizedDescription) throw new Error("Dependency description is required.");
    const dependency = { schemaVersion: this.SCHEMA_VERSION, id: `candidate_move_dependency_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`, candidateMoveId: candidateMove.current.id, revisions: [{ revision: 1, kind: "external-condition", description: normalizedDescription, status: "unresolved", provenance: { authority: "commander", operation: "create" }, recordedAt: new Date().toISOString() }] };
    this.persistAndPublish(dependency);
    return this.clone(dependency);
  },

  correctDependency({ id, expectedRevision, description } = {}) {
    const state = this.getDependency();
    if (state.status !== "available") throw new Error("Candidate Move Dependency is unavailable.");
    if (id !== state.current.id || expectedRevision !== state.current.revision) throw new Error("Candidate Move Dependency revision does not match.");
    if (state.current.status !== "unresolved") throw new Error("Candidate Move Dependency is resolved.");
    const normalizedDescription = this.normalizeDescription(description);
    if (!normalizedDescription || normalizedDescription === state.current.description) throw new Error("Dependency correction must change description.");
    const dependency = this.clone(state.dependency);
    dependency.revisions.push({ revision: state.current.revision + 1, kind: "external-condition", description: normalizedDescription, status: "unresolved", provenance: { authority: "commander", operation: "correct" }, recordedAt: new Date().toISOString() });
    this.persistAndPublish(dependency);
    return this.clone(dependency);
  },

  resolveDependency({ id, expectedRevision } = {}) {
    const state = this.getDependency();
    if (state.status !== "available") throw new Error("Candidate Move Dependency is unavailable.");
    if (id !== state.current.id || expectedRevision !== state.current.revision) throw new Error("Candidate Move Dependency revision does not match.");
    if (state.current.status !== "unresolved") throw new Error("Candidate Move Dependency is already resolved.");
    const dependency = this.clone(state.dependency);
    dependency.revisions.push({ revision: state.current.revision + 1, kind: "external-condition", description: state.current.description, status: "resolved", provenance: { authority: "commander", operation: "resolve" }, recordedAt: new Date().toISOString() });
    this.persistAndPublish(dependency);
    return this.clone(dependency);
  },
};
