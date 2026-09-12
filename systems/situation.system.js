// =====================================================
// FOUNDEROS
// SITUATION SYSTEM
// Commander-authorized carried reality only.
// =====================================================

const SituationSystem = {
  version: "1.0.0",

  SCHEMA_VERSION: 1,
  MAX_SUBJECT_LENGTH: 160,
  MAX_CURRENT_REALITY_LENGTH: 2000,

  normalizeText(value, maximumLength) {
    if (typeof value !== "string") return null;
    const normalized = value.trim();
    return normalized.length > 0 && normalized.length <= maximumLength
      ? normalized
      : null;
  },

  clone(value) {
    return JSON.parse(JSON.stringify(value));
  },

  getUsableStorageStatus() {
    if (typeof getFounderStorageLoadStatus !== "function") {
      return null;
    }

    const status = getFounderStorageLoadStatus();
    return status === "loaded" || status === "absent" ? status : null;
  },

  validateRecordedAt(value) {
    return typeof value === "string" && !Number.isNaN(new Date(value).getTime());
  },

  validateSituation(situation) {
    if (!situation || typeof situation !== "object" || Array.isArray(situation)) {
      return null;
    }

    if (situation.schemaVersion !== this.SCHEMA_VERSION) return null;
    if (typeof situation.id !== "string" || !/^situation_[a-z0-9]+_[a-z0-9]+$/.test(situation.id)) {
      return null;
    }
    if (!Array.isArray(situation.revisions) || situation.revisions.length === 0) {
      return null;
    }

    let subject = null;
    let currentReality = null;
    let closed = false;

    for (let index = 0; index < situation.revisions.length; index += 1) {
      const revision = situation.revisions[index];
      const expectedRevision = index + 1;

      if (!revision || typeof revision !== "object" || Array.isArray(revision)) return null;
      if (revision.revision !== expectedRevision) return null;
      if (this.normalizeText(revision.subject, this.MAX_SUBJECT_LENGTH) !== revision.subject) return null;
      if (
        this.normalizeText(revision.currentReality, this.MAX_CURRENT_REALITY_LENGTH) !==
        revision.currentReality
      ) return null;
      if (!this.validateRecordedAt(revision.recordedAt)) return null;
      if (
        !revision.provenance ||
        revision.provenance.authority !== "commander" ||
        !["create", "correct", "close"].includes(revision.provenance.operation)
      ) return null;
      if (!["active", "closed"].includes(revision.carryStatus)) return null;
      if (closed) return null;

      if (index === 0) {
        if (
          revision.revision !== 1 ||
          revision.carryStatus !== "active" ||
          revision.provenance.operation !== "create"
        ) return null;
        subject = revision.subject;
        currentReality = revision.currentReality;
        continue;
      }

      if (revision.subject !== subject) return null;

      if (revision.provenance.operation === "correct") {
        if (revision.carryStatus !== "active" || revision.currentReality === currentReality) {
          return null;
        }
        currentReality = revision.currentReality;
      } else if (revision.provenance.operation === "close") {
        if (revision.carryStatus !== "closed" || revision.currentReality !== currentReality) {
          return null;
        }
        closed = true;
      } else {
        return null;
      }
    }

    const latest = situation.revisions[situation.revisions.length - 1];
    return {
      id: situation.id,
      revision: latest.revision,
      subject,
      currentReality,
      carryStatus: latest.carryStatus,
    };
  },

  getSituation() {
    const storageStatus = this.getUsableStorageStatus();
    if (!storageStatus || typeof founder === "undefined") {
      return { status: "unavailable", reason: "founder-storage-unavailable" };
    }

    if (!Object.hasOwn(founder, "situation")) {
      return { status: "absent", situation: null };
    }

    const current = this.validateSituation(founder.situation);
    if (!current) {
      return { status: "unavailable", reason: "situation-corrupt" };
    }

    return {
      status: "available",
      situation: this.clone(founder.situation),
      current: this.clone(current),
    };
  },

  getSituationHistory() {
    const state = this.getSituation();
    if (state.status !== "available") return state;
    return {
      status: "available",
      id: state.current.id,
      revisions: this.clone(state.situation.revisions),
    };
  },

  canPublishSituation() {
    if (typeof founder === "undefined" || !founder || typeof founder !== "object") {
      return false;
    }

    const ownDescriptor = Object.getOwnPropertyDescriptor(founder, "situation");
    if (ownDescriptor) {
      if (!("value" in ownDescriptor) || ownDescriptor.writable === false) return false;
      return true;
    }

    for (let prototype = Object.getPrototypeOf(founder); prototype; prototype = Object.getPrototypeOf(prototype)) {
      const descriptor = Object.getOwnPropertyDescriptor(prototype, "situation");
      if (!descriptor) continue;
      if (!("value" in descriptor) || descriptor.writable === false) return false;
      break;
    }

    return Object.isExtensible(founder);
  },

  persistAndPublish(situation) {
    if (!this.canPublishSituation()) {
      throw new Error("Founder Situation cannot be published safely.");
    }
    if (typeof CommanderSystem === "undefined" || typeof CommanderSystem.save !== "function") {
      throw new Error("Founder persistence is unavailable.");
    }

    const candidateFounder = this.clone(founder);
    candidateFounder.situation = situation;
    const confirmed = CommanderSystem.save(candidateFounder);

    if (confirmed !== true) {
      throw new Error("Founder persistence was not confirmed.");
    }

    founder.situation = situation;
  },

  createSituation({ subject, currentReality } = {}) {
    if (!this.getUsableStorageStatus()) {
      throw new Error("Founder storage is unavailable.");
    }
    if (typeof founder === "undefined") {
      throw new Error("Founder data is unavailable.");
    }
    if (Object.hasOwn(founder, "situation")) {
      throw new Error("A Situation already exists or is unavailable.");
    }

    const normalizedSubject = this.normalizeText(subject, this.MAX_SUBJECT_LENGTH);
    const normalizedReality = this.normalizeText(
      currentReality,
      this.MAX_CURRENT_REALITY_LENGTH,
    );
    if (!normalizedSubject || !normalizedReality) {
      throw new Error("Situation subject and current reality are required.");
    }

    const now = new Date().toISOString();
    const situation = {
      schemaVersion: this.SCHEMA_VERSION,
      id: `situation_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`,
      revisions: [{
        revision: 1,
        subject: normalizedSubject,
        currentReality: normalizedReality,
        carryStatus: "active",
        provenance: { authority: "commander", operation: "create" },
        recordedAt: now,
      }],
    };

    this.persistAndPublish(situation);
    return this.clone(situation);
  },

  correctSituation({ id, expectedRevision, currentReality } = {}) {
    const state = this.getSituation();
    if (state.status !== "available") {
      throw new Error("Situation is unavailable.");
    }
    if (id !== state.current.id || expectedRevision !== state.current.revision) {
      throw new Error("Situation revision does not match.");
    }
    if (state.current.carryStatus !== "active") {
      throw new Error("Closed Situations cannot be corrected.");
    }

    const normalizedReality = this.normalizeText(
      currentReality,
      this.MAX_CURRENT_REALITY_LENGTH,
    );
    if (!normalizedReality || normalizedReality === state.current.currentReality) {
      throw new Error("Situation correction must change current reality.");
    }

    const situation = this.clone(state.situation);
    situation.revisions.push({
      revision: state.current.revision + 1,
      subject: state.current.subject,
      currentReality: normalizedReality,
      carryStatus: "active",
      provenance: { authority: "commander", operation: "correct" },
      recordedAt: new Date().toISOString(),
    });

    this.persistAndPublish(situation);
    return this.clone(situation);
  },

  closeSituation({ id, expectedRevision } = {}) {
    const state = this.getSituation();
    if (state.status !== "available") {
      throw new Error("Situation is unavailable.");
    }
    if (id !== state.current.id || expectedRevision !== state.current.revision) {
      throw new Error("Situation revision does not match.");
    }
    if (state.current.carryStatus !== "active") {
      throw new Error("Situation is already closed.");
    }

    const situation = this.clone(state.situation);
    situation.revisions.push({
      revision: state.current.revision + 1,
      subject: state.current.subject,
      currentReality: state.current.currentReality,
      carryStatus: "closed",
      provenance: { authority: "commander", operation: "close" },
      recordedAt: new Date().toISOString(),
    });

    this.persistAndPublish(situation);
    return this.clone(situation);
  },
};
