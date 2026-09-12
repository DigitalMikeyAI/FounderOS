// =====================================================
// FOUNDEROS
// CANDIDATE MOVE HOLD SYSTEM
// Commander-authorized withholding only.
// =====================================================

const CandidateMoveHoldSystem = {
  version: "1.0.0",
  SCHEMA_VERSION: 1,

  clone(value) { return JSON.parse(JSON.stringify(value)); },

  getStorageStatus() {
    return typeof getFounderStorageLoadStatus === "function"
      ? getFounderStorageLoadStatus()
      : null;
  },

  getUsableStorageStatus() {
    const status = this.getStorageStatus();
    return status === "loaded" || status === "absent" ? status : null;
  },

  validateRecordedAt(value) {
    return typeof value === "string" && !Number.isNaN(new Date(value).getTime());
  },

  isReleaseCondition(value) {
    return value && typeof value === "object" && !Array.isArray(value) &&
      Object.keys(value).length === 1 && value.kind === "commander-release";
  },

  validateHold(hold) {
    if (!hold || typeof hold !== "object" || Array.isArray(hold)) return null;
    if (hold.schemaVersion !== this.SCHEMA_VERSION) return null;
    if (typeof hold.id !== "string" || !/^candidate_move_hold_[a-z0-9]+_[a-z0-9]+$/.test(hold.id)) return null;
    if (typeof hold.candidateMoveId !== "string" || !/^candidate_move_[a-z0-9]+_[a-z0-9]+$/.test(hold.candidateMoveId)) return null;
    if (!Array.isArray(hold.revisions) || hold.revisions.length === 0) return null;

    let released = false;
    for (let index = 0; index < hold.revisions.length; index += 1) {
      const revision = hold.revisions[index];
      if (!revision || typeof revision !== "object" || Array.isArray(revision)) return null;
      if (revision.revision !== index + 1) return null;
      if (!this.isReleaseCondition(revision.releaseCondition)) return null;
      if (!this.validateRecordedAt(revision.recordedAt)) return null;
      if (!revision.provenance || revision.provenance.authority !== "commander") return null;
      if (released) return null;
      if (index === 0) {
        if (revision.status !== "active" || revision.provenance.operation !== "create") return null;
      } else if (revision.status === "released" && revision.provenance.operation === "release") {
        released = true;
      } else {
        return null;
      }
    }

    const latest = hold.revisions[hold.revisions.length - 1];
    return { id: hold.id, candidateMoveId: hold.candidateMoveId, revision: latest.revision, status: latest.status };
  },

  getLinkedCandidateMove() {
    if (typeof CandidateMoveSystem === "undefined" || typeof CandidateMoveSystem.getCandidateMove !== "function") return null;
    const state = CandidateMoveSystem.getCandidateMove();
    return state && state.status === "available" ? state : null;
  },

  getHold() {
    const storageStatus = this.getStorageStatus();
    if (storageStatus === "not-loaded") return { status: "unavailable", reason: "founder-storage-not-loaded" };
    if (storageStatus === "failed") return { status: "unavailable", reason: "founder-storage-failed" };
    if ((storageStatus !== "loaded" && storageStatus !== "absent") || typeof founder === "undefined") {
      return { status: "unavailable", reason: "founder-storage-unavailable" };
    }
    if (!Object.hasOwn(founder, "candidateMoveHold")) return { status: "absent", hold: null };
    const current = this.validateHold(founder.candidateMoveHold);
    if (!current) return { status: "unavailable", reason: "candidate-move-hold-corrupt" };
    const candidateMove = this.getLinkedCandidateMove();
    if (!candidateMove) return { status: "unavailable", reason: "candidate-move-hold-candidate-move-unavailable" };
    if (candidateMove.current.id !== current.candidateMoveId) return { status: "unavailable", reason: "candidate-move-hold-candidate-move-mismatch" };
    return { status: "available", hold: this.clone(founder.candidateMoveHold), current: this.clone(current) };
  },

  getHoldHistory() {
    const state = this.getHold();
    if (state.status !== "available") return state;
    return { status: "available", id: state.current.id, candidateMoveId: state.current.candidateMoveId, revisions: this.clone(state.hold.revisions) };
  },

  canPublishHold() {
    if (typeof founder === "undefined" || !founder || typeof founder !== "object") return false;
    const own = Object.getOwnPropertyDescriptor(founder, "candidateMoveHold");
    if (own) return "value" in own && own.writable !== false;
    for (let prototype = Object.getPrototypeOf(founder); prototype; prototype = Object.getPrototypeOf(prototype)) {
      const descriptor = Object.getOwnPropertyDescriptor(prototype, "candidateMoveHold");
      if (!descriptor) continue;
      if (!("value" in descriptor) || descriptor.writable === false) return false;
      break;
    }
    return Object.isExtensible(founder);
  },

  persistAndPublish(hold) {
    if (!this.canPublishHold()) throw new Error("Founder Candidate Move Hold cannot be published safely.");
    if (typeof CommanderSystem === "undefined" || typeof CommanderSystem.save !== "function") throw new Error("Founder persistence is unavailable.");
    const candidateFounder = this.clone(founder);
    candidateFounder.candidateMoveHold = hold;
    if (CommanderSystem.save(candidateFounder) !== true) throw new Error("Founder persistence was not confirmed.");
    founder.candidateMoveHold = hold;
  },

  createHold({ candidateMoveId } = {}) {
    if (!this.getUsableStorageStatus()) throw new Error("Founder storage is unavailable.");
    if (typeof founder === "undefined") throw new Error("Founder data is unavailable.");
    if (Object.hasOwn(founder, "candidateMoveHold")) throw new Error("A Candidate Move Hold already exists or is unavailable.");
    const candidateMove = this.getLinkedCandidateMove();
    if (!candidateMove) throw new Error("Candidate Move is unavailable.");
    if (candidateMoveId !== candidateMove.current.id) throw new Error("Candidate Move does not match.");
    if (candidateMove.current.status !== "active") throw new Error("Candidate Move is withdrawn.");
    const hold = {
      schemaVersion: this.SCHEMA_VERSION,
      id: `candidate_move_hold_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`,
      candidateMoveId: candidateMove.current.id,
      revisions: [{ revision: 1, status: "active", releaseCondition: { kind: "commander-release" }, provenance: { authority: "commander", operation: "create" }, recordedAt: new Date().toISOString() }],
    };
    this.persistAndPublish(hold);
    return this.clone(hold);
  },

  releaseHold({ id, expectedRevision } = {}) {
    const state = this.getHold();
    if (state.status !== "available") throw new Error("Candidate Move Hold is unavailable.");
    if (id !== state.current.id || expectedRevision !== state.current.revision) throw new Error("Candidate Move Hold revision does not match.");
    if (state.current.status !== "active") throw new Error("Candidate Move Hold is already released.");
    const hold = this.clone(state.hold);
    hold.revisions.push({ revision: state.current.revision + 1, status: "released", releaseCondition: { kind: "commander-release" }, provenance: { authority: "commander", operation: "release" }, recordedAt: new Date().toISOString() });
    this.persistAndPublish(hold);
    return this.clone(hold);
  },
};
