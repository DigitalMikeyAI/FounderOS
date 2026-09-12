// =====================================================
// FOUNDEROS
// CANDIDATE MOVE SYSTEM
// Commander-authorized possible move only.
// =====================================================

const CandidateMoveSystem = {
  version: "1.0.0",

  SCHEMA_VERSION: 1,
  MAX_ACTION_LENGTH: 2000,

  normalizeAction(value) {
    if (typeof value !== "string") return null;
    const normalized = value.trim();
    return normalized.length > 0 && normalized.length <= this.MAX_ACTION_LENGTH
      ? normalized
      : null;
  },

  clone(value) {
    return JSON.parse(JSON.stringify(value));
  },

  getUsableStorageStatus() {
    if (typeof getFounderStorageLoadStatus !== "function") return null;
    const status = getFounderStorageLoadStatus();
    return status === "loaded" || status === "absent" ? status : null;
  },

  getStorageStatus() {
    return typeof getFounderStorageLoadStatus === "function"
      ? getFounderStorageLoadStatus()
      : null;
  },

  validateRecordedAt(value) {
    return typeof value === "string" && !Number.isNaN(new Date(value).getTime());
  },

  validateCandidateMove(candidateMove) {
    if (!candidateMove || typeof candidateMove !== "object" || Array.isArray(candidateMove)) {
      return null;
    }
    if (candidateMove.schemaVersion !== this.SCHEMA_VERSION) return null;
    if (typeof candidateMove.id !== "string" || !/^candidate_move_[a-z0-9]+_[a-z0-9]+$/.test(candidateMove.id)) {
      return null;
    }
    if (typeof candidateMove.situationId !== "string" || !/^situation_[a-z0-9]+_[a-z0-9]+$/.test(candidateMove.situationId)) {
      return null;
    }
    if (!Array.isArray(candidateMove.revisions) || candidateMove.revisions.length === 0) {
      return null;
    }

    let action = null;
    let withdrawn = false;

    for (let index = 0; index < candidateMove.revisions.length; index += 1) {
      const revision = candidateMove.revisions[index];
      if (!revision || typeof revision !== "object" || Array.isArray(revision)) return null;
      if (revision.revision !== index + 1) return null;
      if (this.normalizeAction(revision.action) !== revision.action) return null;
      if (!["active", "withdrawn"].includes(revision.status)) return null;
      if (!this.validateRecordedAt(revision.recordedAt)) return null;
      if (
        !revision.provenance ||
        revision.provenance.authority !== "commander" ||
        !["create", "correct", "withdraw"].includes(revision.provenance.operation)
      ) return null;
      if (withdrawn) return null;

      if (index === 0) {
        if (revision.status !== "active" || revision.provenance.operation !== "create") {
          return null;
        }
        action = revision.action;
        continue;
      }

      if (revision.provenance.operation === "correct") {
        if (revision.status !== "active" || revision.action === action) return null;
        action = revision.action;
      } else if (revision.provenance.operation === "withdraw") {
        if (revision.status !== "withdrawn" || revision.action !== action) return null;
        withdrawn = true;
      } else {
        return null;
      }
    }

    const latest = candidateMove.revisions[candidateMove.revisions.length - 1];
    return {
      id: candidateMove.id,
      situationId: candidateMove.situationId,
      revision: latest.revision,
      action,
      status: latest.status,
    };
  },

  getLinkedSituation() {
    if (typeof SituationSystem === "undefined" || typeof SituationSystem.getSituation !== "function") {
      return null;
    }
    const state = SituationSystem.getSituation();
    return state && state.status === "available" ? state : null;
  },

  getCandidateMove() {
    const storageStatus = this.getStorageStatus();
    if (storageStatus === "not-loaded") {
      return { status: "unavailable", reason: "founder-storage-not-loaded" };
    }
    if (storageStatus === "failed") {
      return { status: "unavailable", reason: "founder-storage-failed" };
    }
    if (
      (storageStatus !== "loaded" && storageStatus !== "absent") ||
      typeof founder === "undefined"
    ) {
      return { status: "unavailable", reason: "founder-storage-unavailable" };
    }
    if (!Object.hasOwn(founder, "candidateMove")) {
      return { status: "absent", candidateMove: null };
    }

    const current = this.validateCandidateMove(founder.candidateMove);
    if (!current) return { status: "unavailable", reason: "candidate-move-corrupt" };

    const situation = this.getLinkedSituation();
    if (!situation) return { status: "unavailable", reason: "candidate-move-situation-unavailable" };
    if (situation.current.id !== current.situationId) {
      return { status: "unavailable", reason: "candidate-move-situation-mismatch" };
    }

    return {
      status: "available",
      candidateMove: this.clone(founder.candidateMove),
      current: this.clone(current),
    };
  },

  getCandidateMoveHistory() {
    const state = this.getCandidateMove();
    if (state.status !== "available") return state;
    return {
      status: "available",
      id: state.current.id,
      situationId: state.current.situationId,
      revisions: this.clone(state.candidateMove.revisions),
    };
  },

  canPublishCandidateMove() {
    if (typeof founder === "undefined" || !founder || typeof founder !== "object") {
      return false;
    }

    const ownDescriptor = Object.getOwnPropertyDescriptor(founder, "candidateMove");
    if (ownDescriptor) {
      if (!("value" in ownDescriptor) || ownDescriptor.writable === false) return false;
      return true;
    }

    for (let prototype = Object.getPrototypeOf(founder); prototype; prototype = Object.getPrototypeOf(prototype)) {
      const descriptor = Object.getOwnPropertyDescriptor(prototype, "candidateMove");
      if (!descriptor) continue;
      if (!("value" in descriptor) || descriptor.writable === false) return false;
      break;
    }

    return Object.isExtensible(founder);
  },

  persistAndPublish(candidateMove) {
    if (!this.canPublishCandidateMove()) {
      throw new Error("Founder Candidate Move cannot be published safely.");
    }
    if (typeof CommanderSystem === "undefined" || typeof CommanderSystem.save !== "function") {
      throw new Error("Founder persistence is unavailable.");
    }

    const candidateFounder = this.clone(founder);
    candidateFounder.candidateMove = candidateMove;
    const confirmed = CommanderSystem.save(candidateFounder);
    if (confirmed !== true) {
      throw new Error("Founder persistence was not confirmed.");
    }

    founder.candidateMove = candidateMove;
  },

  createCandidateMove({ situationId, action } = {}) {
    if (!this.getUsableStorageStatus()) {
      throw new Error("Founder storage is unavailable.");
    }
    if (typeof founder === "undefined") throw new Error("Founder data is unavailable.");
    if (Object.hasOwn(founder, "candidateMove")) {
      throw new Error("A Candidate Move already exists or is unavailable.");
    }

    const situation = this.getLinkedSituation();
    if (!situation) throw new Error("Situation is unavailable.");
    if (situationId !== situation.current.id) throw new Error("Situation does not match.");
    if (situation.current.carryStatus !== "active") throw new Error("Situation is closed.");

    const normalizedAction = this.normalizeAction(action);
    if (!normalizedAction) throw new Error("Candidate Move action is required.");

    const candidateMove = {
      schemaVersion: this.SCHEMA_VERSION,
      id: `candidate_move_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`,
      situationId: situation.current.id,
      revisions: [{
        revision: 1,
        action: normalizedAction,
        status: "active",
        provenance: { authority: "commander", operation: "create" },
        recordedAt: new Date().toISOString(),
      }],
    };

    this.persistAndPublish(candidateMove);
    return this.clone(candidateMove);
  },

  correctCandidateMove({ id, expectedRevision, action } = {}) {
    const state = this.getCandidateMove();
    if (state.status !== "available") throw new Error("Candidate Move is unavailable.");
    if (id !== state.current.id || expectedRevision !== state.current.revision) {
      throw new Error("Candidate Move revision does not match.");
    }
    if (state.current.status !== "active") throw new Error("Candidate Move is withdrawn.");

    const normalizedAction = this.normalizeAction(action);
    if (!normalizedAction || normalizedAction === state.current.action) {
      throw new Error("Candidate Move correction must change action.");
    }

    const candidateMove = this.clone(state.candidateMove);
    candidateMove.revisions.push({
      revision: state.current.revision + 1,
      action: normalizedAction,
      status: "active",
      provenance: { authority: "commander", operation: "correct" },
      recordedAt: new Date().toISOString(),
    });
    this.persistAndPublish(candidateMove);
    return this.clone(candidateMove);
  },

  withdrawCandidateMove({ id, expectedRevision } = {}) {
    const state = this.getCandidateMove();
    if (state.status !== "available") throw new Error("Candidate Move is unavailable.");
    if (id !== state.current.id || expectedRevision !== state.current.revision) {
      throw new Error("Candidate Move revision does not match.");
    }
    if (state.current.status !== "active") throw new Error("Candidate Move is already withdrawn.");

    const candidateMove = this.clone(state.candidateMove);
    candidateMove.revisions.push({
      revision: state.current.revision + 1,
      action: state.current.action,
      status: "withdrawn",
      provenance: { authority: "commander", operation: "withdraw" },
      recordedAt: new Date().toISOString(),
    });
    this.persistAndPublish(candidateMove);
    return this.clone(candidateMove);
  },
};
