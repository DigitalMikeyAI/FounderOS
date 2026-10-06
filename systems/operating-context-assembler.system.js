// =====================================================
// FOUNDEROS
// OPERATING CONTEXT ASSEMBLER
// Read-only, source-labeled AI grounding above Operating Truth.
// =====================================================

const OperatingContextAssembler = {
  version: "1.0.0",
  SCHEMA_VERSION: 1,
  UTC_PATTERN: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
  AUTHORITATIVE_AUTHORITY: "authoritative-operating-truth",
  DERIVED_AUTHORITY: "derived-operating-state",
  SOURCE_ORDER: ["situation", "candidate-move", "hold", "dependency", "availability", "commitment", "routine", "move-state"],

  clone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  },

  isObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  },

  hasExactKeys(value, keys) {
    return this.isObject(value) && Object.keys(value).length === keys.length &&
      Object.keys(value).every((key) => keys.includes(key));
  },

  isCanonicalUtc(value) {
    return typeof value === "string" && this.UTC_PATTERN.test(value) &&
      !Number.isNaN(new Date(value).getTime()) && new Date(value).toISOString() === value;
  },

  isText(value, maximumLength = 2000) {
    return typeof value === "string" && value.trim() === value && value.length > 0 && value.length <= maximumLength;
  },

  validateRequest(request) {
    return this.hasExactKeys(request, ["requestType", "asOf"]) &&
      request.requestType === "situation-explanation" && this.isCanonicalUtc(request.asOf);
  },

  relationship(situationId = null, situationRevision = null, candidateMoveId = null, candidateMoveRevision = null) {
    return { situationId, situationRevision, candidateMoveId, candidateMoveRevision };
  },

  reference(authority, sourceType, recordId, revision, status, recordedAt, relationships) {
    return { authority, sourceType, recordId, revision, status, recordedAt, relationships };
  },

  availableSlot(authority, sourceType, facts) {
    return { authority, sourceType, status: "available", reason: null, facts };
  },

  emptySlot(authority, sourceType, status, reason = null) {
    return { authority, sourceType, status, reason, facts: [] };
  },

  unavailableSlot(authority, sourceType, reason) {
    return this.emptySlot(authority, sourceType, "unavailable", this.safeReason(reason, `${sourceType}-unavailable`));
  },

  safeReason(value, fallback) {
    return typeof value === "string" && value.trim() === value && value.length > 0 && value.length <= 160
      ? value
      : fallback;
  },

  latestRecordedAt(container, revision) {
    if (!this.isObject(container) || !Array.isArray(container.revisions)) return null;
    const latest = container.revisions[container.revisions.length - 1];
    return this.isObject(latest) && latest.revision === revision && this.isCanonicalUtc(latest.recordedAt)
      ? latest.recordedAt
      : null;
  },

  read(reader, sourceType) {
    try {
      const value = reader();
      return this.isObject(value) ? value : { status: "unavailable", reason: `${sourceType}-reader-invalid` };
    } catch (error) {
      return { status: "unavailable", reason: `${sourceType}-reader-threw` };
    }
  },

  readSituation() {
    if (typeof SituationSystem === "undefined" || typeof SituationSystem.getSituation !== "function") {
      return { status: "unavailable", reason: "situation-reader-missing" };
    }
    return this.read(() => SituationSystem.getSituation(), "situation");
  },

  readCandidateMove() {
    if (typeof CandidateMoveSystem === "undefined" || typeof CandidateMoveSystem.getCandidateMove !== "function") {
      return { status: "unavailable", reason: "candidate-move-reader-missing" };
    }
    return this.read(() => CandidateMoveSystem.getCandidateMove(), "candidate-move");
  },

  readHold() {
    if (typeof CandidateMoveHoldSystem === "undefined" || typeof CandidateMoveHoldSystem.getHold !== "function") {
      return { status: "unavailable", reason: "hold-reader-missing" };
    }
    return this.read(() => CandidateMoveHoldSystem.getHold(), "hold");
  },

  readDependency() {
    if (typeof CandidateMoveDependencySystem === "undefined" || typeof CandidateMoveDependencySystem.getDependency !== "function") {
      return { status: "unavailable", reason: "dependency-reader-missing" };
    }
    return this.read(() => CandidateMoveDependencySystem.getDependency(), "dependency");
  },

  readAvailability() {
    if (typeof CandidateMoveAvailabilitySystem === "undefined" || typeof CandidateMoveAvailabilitySystem.getAvailability !== "function") {
      return { status: "unavailable", reason: "availability-reader-missing" };
    }
    return this.read(() => CandidateMoveAvailabilitySystem.getAvailability(), "availability");
  },

  readCommitments() {
    if (typeof CandidateMoveCommitmentSystem === "undefined" || typeof CandidateMoveCommitmentSystem.getCommitments !== "function") {
      return { status: "unavailable", reason: "commitment-reader-missing" };
    }
    return this.read(() => CandidateMoveCommitmentSystem.getCommitments(), "commitment");
  },

  readRoutines() {
    if (typeof CandidateMoveRoutineSystem === "undefined" || typeof CandidateMoveRoutineSystem.getRoutines !== "function") {
      return { status: "unavailable", reason: "routine-reader-missing" };
    }
    return this.read(() => CandidateMoveRoutineSystem.getRoutines(), "routine");
  },

  readMoveState() {
    if (typeof MoveStateSystem === "undefined" || typeof MoveStateSystem.getMoveState !== "function") {
      return { status: "unavailable", reason: "move-state-reader-missing" };
    }
    return this.read(() => MoveStateSystem.getMoveState(), "move-state");
  },

  normalizeSituation(state) {
    const authority = this.AUTHORITATIVE_AUTHORITY;
    if (state.status === "absent" && state.situation === null) return this.emptySlot(authority, "situation", "absent");
    if (state.status !== "available") return this.unavailableSlot(authority, "situation", state.reason);
    const current = state.current;
    if (!this.isObject(current) || !this.isText(current.id, 200) || !Number.isInteger(current.revision) || current.revision < 1 ||
        !this.isText(current.subject, 160) || !this.isText(current.currentReality, 2000) || !["active", "closed"].includes(current.carryStatus)) {
      return this.unavailableSlot(authority, "situation", "situation-current-invalid");
    }
    const recordedAt = this.latestRecordedAt(state.situation, current.revision);
    if (!recordedAt) return this.unavailableSlot(authority, "situation", "situation-recorded-at-invalid");
    const reference = this.reference(authority, "situation", current.id, current.revision, current.carryStatus,
      recordedAt, this.relationship());
    return this.availableSlot(authority, "situation", [{ reference, data: {
      subject: current.subject, currentReality: current.currentReality, carryStatus: current.carryStatus,
    } }]);
  },

  normalizeCandidateMove(state, situationId) {
    const authority = this.AUTHORITATIVE_AUTHORITY;
    if (state.status === "absent" && state.candidateMove === null) return this.emptySlot(authority, "candidate-move", "absent");
    if (state.status !== "available") return this.unavailableSlot(authority, "candidate-move", state.reason);
    const current = state.current;
    if (!this.isObject(current) || !this.isText(current.id, 200) || current.situationId !== situationId ||
        !Number.isInteger(current.revision) || current.revision < 1 || !this.isText(current.action, 2000) ||
        !["active", "withdrawn"].includes(current.status)) {
      return this.unavailableSlot(authority, "candidate-move", "candidate-move-current-invalid");
    }
    const recordedAt = this.latestRecordedAt(state.candidateMove, current.revision);
    if (!recordedAt) return this.unavailableSlot(authority, "candidate-move", "candidate-move-recorded-at-invalid");
    const reference = this.reference(authority, "candidate-move", current.id, current.revision, current.status,
      recordedAt, this.relationship(situationId));
    return this.availableSlot(authority, "candidate-move", [{ reference, data: { action: current.action, status: current.status } }]);
  },

  normalizeHold(state, candidateMoveId) {
    const authority = this.AUTHORITATIVE_AUTHORITY;
    if (state.status === "absent") return this.emptySlot(authority, "hold", "absent");
    if (state.status !== "available") return this.unavailableSlot(authority, "hold", state.reason);
    const current = state.current;
    if (!this.isObject(current) || !this.isText(current.id, 200) || current.candidateMoveId !== candidateMoveId ||
        !Number.isInteger(current.revision) || current.revision < 1 || !["active", "released"].includes(current.status)) {
      return this.unavailableSlot(authority, "hold", "hold-current-invalid");
    }
    const recordedAt = this.latestRecordedAt(state.hold, current.revision);
    if (!recordedAt) return this.unavailableSlot(authority, "hold", "hold-recorded-at-invalid");
    const reference = this.reference(authority, "hold", current.id, current.revision, current.status,
      recordedAt, this.relationship(null, null, candidateMoveId));
    return this.availableSlot(authority, "hold", [{ reference, data: { status: current.status } }]);
  },

  normalizeDependency(state, candidateMoveId) {
    const authority = this.AUTHORITATIVE_AUTHORITY;
    if (state.status === "absent") return this.emptySlot(authority, "dependency", "absent");
    if (state.status !== "available") return this.unavailableSlot(authority, "dependency", state.reason);
    const current = state.current;
    if (!this.isObject(current) || !this.isText(current.id, 200) || current.candidateMoveId !== candidateMoveId ||
        !Number.isInteger(current.revision) || current.revision < 1 || !this.isText(current.description, 2000) ||
        !["unresolved", "resolved"].includes(current.status)) {
      return this.unavailableSlot(authority, "dependency", "dependency-current-invalid");
    }
    const recordedAt = this.latestRecordedAt(state.dependency, current.revision);
    if (!recordedAt) return this.unavailableSlot(authority, "dependency", "dependency-recorded-at-invalid");
    const reference = this.reference(authority, "dependency", current.id, current.revision, current.status,
      recordedAt, this.relationship(null, null, candidateMoveId));
    return this.availableSlot(authority, "dependency", [{ reference, data: {
      description: current.description, status: current.status,
    } }]);
  },

  normalizeAvailability(state, situationId, candidateMoveId) {
    const authority = this.AUTHORITATIVE_AUTHORITY;
    if (state.status === "absent") return this.emptySlot(authority, "availability", "absent");
    if (state.status !== "available") return this.unavailableSlot(authority, "availability", state.reason);
    const current = state.current;
    const assertion = current && current.assertion;
    if (!this.isObject(current) || !this.isText(current.id, 200) || current.candidateMoveId !== candidateMoveId ||
        current.situationId !== situationId || !Number.isInteger(current.revision) || current.revision < 1 ||
        !["confirmed", "withdrawn"].includes(current.status) || typeof current.isCurrent !== "boolean" ||
        !this.isObject(assertion) || assertion.kind !== "commander-operating-sufficiency" ||
        !Number.isInteger(assertion.candidateMoveRevision) || assertion.candidateMoveRevision < 1 ||
        !Number.isInteger(assertion.situationRevision) || assertion.situationRevision < 1 ||
        !this.isText(assertion.conditionsConfirmed, 2000)) {
      return this.unavailableSlot(authority, "availability", "availability-current-invalid");
    }
    const recordedAt = this.latestRecordedAt(state.availability, current.revision);
    if (!recordedAt) return this.unavailableSlot(authority, "availability", "availability-recorded-at-invalid");
    const reference = this.reference(authority, "availability", current.id, current.revision, current.status,
      recordedAt,
      this.relationship(situationId, assertion.situationRevision, candidateMoveId, assertion.candidateMoveRevision));
    return this.availableSlot(authority, "availability", [{ reference, data: {
      status: current.status, isCurrent: current.isCurrent, conditionsConfirmed: assertion.conditionsConfirmed,
    } }]);
  },

  commitmentRecordedAt(state, record) {
    if (!this.isObject(state.commitments) || !Array.isArray(state.commitments.records)) return null;
    const raw = state.commitments.records.find((item) => this.isObject(item) && item.id === record.id);
    return this.latestRecordedAt(raw, record.revision);
  },

  normalizeCommitments(state, candidateMoveId, candidateMoveRevision) {
    const authority = this.AUTHORITATIVE_AUTHORITY;
    if (state.status === "absent") return this.emptySlot(authority, "commitment", "absent");
    if (state.status !== "available") return this.unavailableSlot(authority, "commitment", state.reason);
    if (!Array.isArray(state.records)) return this.unavailableSlot(authority, "commitment", "commitment-collection-invalid");
    const facts = [];
    for (const record of state.records) {
      if (!this.isObject(record) || !this.isText(record.id, 200) || !this.isText(record.candidateMoveId, 200) ||
          !Number.isInteger(record.candidateMoveRevision) || record.candidateMoveRevision < 1 ||
          !Number.isInteger(record.revision) || record.revision < 1 || !this.isText(record.acceptedAction, 2000) ||
          !["active", "completed", "canceled"].includes(record.status) || !this.validWindow(record.window)) {
        return this.unavailableSlot(authority, "commitment", "commitment-collection-invalid");
      }
      if (record.candidateMoveId !== candidateMoveId || record.candidateMoveRevision !== candidateMoveRevision) continue;
      const recordedAt = this.commitmentRecordedAt(state, record);
      if (!recordedAt) return this.unavailableSlot(authority, "commitment", "commitment-recorded-at-invalid");
      const reference = this.reference(authority, "commitment", record.id, record.revision, record.status,
        recordedAt, this.relationship(null, null, candidateMoveId, candidateMoveRevision));
      facts.push({ reference, data: {
        acceptedAction: record.acceptedAction, status: record.status, window: this.clone(record.window),
      } });
    }
    facts.sort((left, right) => left.reference.recordId < right.reference.recordId ? -1 : left.reference.recordId > right.reference.recordId ? 1 : 0);
    return this.availableSlot(authority, "commitment", facts);
  },

  normalizeRoutines(state, candidateMoveId, candidateMoveRevision) {
    const authority = this.AUTHORITATIVE_AUTHORITY;
    if (state.status === "absent") return this.emptySlot(authority, "routine", "absent");
    if (state.status !== "available") return this.unavailableSlot(authority, "routine", state.reason);
    if (!Array.isArray(state.routines)) return this.unavailableSlot(authority, "routine", "routine-collection-invalid");
    const facts = [];
    for (const record of state.routines) {
      const status = record && (record.lifecycle || record.status);
      const revisions = record && record.revisions;
      const latest = Array.isArray(revisions) && revisions.length > 0 ? revisions[revisions.length - 1] : null;
      if (!this.isObject(record) || !this.isText(record.id, 200) || !this.isText(record.candidateMoveId, 200) ||
          !Number.isInteger(record.candidateMoveRevision) || record.candidateMoveRevision < 1 ||
          !this.isObject(latest) || !Number.isInteger(latest.revision) || latest.revision < 1 ||
          latest.status !== status || !this.isCanonicalUtc(latest.recordedAt) || !this.isText(record.action, 2000) ||
          !["active", "paused", "retired"].includes(status) || !this.validSchedule(record.schedule)) {
        return this.unavailableSlot(authority, "routine", "routine-collection-invalid");
      }
      if (record.candidateMoveId !== candidateMoveId || record.candidateMoveRevision !== candidateMoveRevision) continue;
      const reference = this.reference(authority, "routine", record.id, latest.revision, status,
        latest.recordedAt, this.relationship(null, null, candidateMoveId, candidateMoveRevision));
      facts.push({ reference, data: { action: record.action, status, schedule: this.clone(record.schedule) } });
    }
    facts.sort((left, right) => left.reference.recordId < right.reference.recordId ? -1 : left.reference.recordId > right.reference.recordId ? 1 : 0);
    return this.availableSlot(authority, "routine", facts);
  },

  normalizeMoveState(state, candidateMoveId, candidateMoveRevision) {
    const authority = this.DERIVED_AUTHORITY;
    if (state.status === "not-applicable") return this.emptySlot(authority, "move-state", "not-applicable", this.safeReason(state.reason, "move-state-not-applicable"));
    if (state.status !== "available") return this.unavailableSlot(authority, "move-state", state.reason);
    if (!this.isText(candidateMoveId, 200) || state.candidateMoveId !== candidateMoveId ||
        state.candidateMoveRevision !== candidateMoveRevision || !["hold", "waiting", "actionable", "clarify"].includes(state.state) ||
        !this.validMoveStateBasis(state.state, state.basis)) {
      return this.unavailableSlot(authority, "move-state", "move-state-current-invalid");
    }
    const reference = this.reference(authority, "move-state", null, null, state.state, null,
      this.relationship(null, null, candidateMoveId, candidateMoveRevision));
    return this.availableSlot(authority, "move-state", [{ reference, data: {
      state: state.state, basis: this.clone(state.basis),
    } }]);
  },

  validWindow(value) {
    return this.hasExactKeys(value, ["kind", "dueAt"]) && value.kind === "deadline" && this.isCanonicalUtc(value.dueAt);
  },

  validSchedule(value) {
    return this.hasExactKeys(value, ["kind", "weekday", "opensAtUtc", "closesAtUtc"]) && value.kind === "weekly-utc" &&
      Number.isInteger(value.weekday) && value.weekday >= 1 && value.weekday <= 7 &&
      /^(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\dZ$/.test(value.opensAtUtc) &&
      /^(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\dZ$/.test(value.closesAtUtc) && value.opensAtUtc < value.closesAtUtc;
  },

  validMoveStateBasis(state, basis) {
    if (!this.hasExactKeys(basis, ["kind", "references"]) || !Array.isArray(basis.references)) return false;
    const expected = { hold: "hold", waiting: "dependency", actionable: "availability", clarify: "insufficient-operating-truth" }[state];
    if (basis.kind !== expected) return false;
    if (state === "clarify") return basis.references.length === 0;
    if (basis.references.length !== 1) return false;
    const reference = basis.references[0];
    const type = { hold: "candidate-move-hold", waiting: "candidate-move-dependency", actionable: "candidate-move-availability" }[state];
    return this.hasExactKeys(reference, ["type", "id", "revision"]) && reference.type === type &&
      this.isText(reference.id, 200) && Number.isInteger(reference.revision) && reference.revision > 0;
  },

  assemble(request) {
    if (!this.validateRequest(request)) throw new TypeError("AI request is invalid.");
    const authority = this.AUTHORITATIVE_AUTHORITY;
    const derived = this.DERIVED_AUTHORITY;
    const situation = this.normalizeSituation(this.readSituation());
    const notApplicable = (sourceType, reason = "situation-absent") => this.emptySlot(
      sourceType === "move-state" ? derived : authority, sourceType, "not-applicable", reason,
    );

    let candidateMove; let hold; let dependency; let availability; let commitment; let routine; let moveState;
    let situationId = null; let candidateMoveId = null; let candidateMoveRevision = null;

    if (situation.status === "available") situationId = situation.facts[0].reference.recordId;
    if (situation.status === "unavailable") {
      candidateMove = notApplicable("candidate-move", "situation-unavailable");
      hold = notApplicable("hold", "situation-unavailable"); dependency = notApplicable("dependency", "situation-unavailable");
      availability = notApplicable("availability", "situation-unavailable"); commitment = notApplicable("commitment", "situation-unavailable");
      routine = notApplicable("routine", "situation-unavailable"); moveState = notApplicable("move-state", "situation-unavailable");
    } else if (situation.status === "absent") {
      candidateMove = notApplicable("candidate-move"); hold = notApplicable("hold"); dependency = notApplicable("dependency");
      availability = notApplicable("availability"); commitment = notApplicable("commitment"); routine = notApplicable("routine");
      moveState = notApplicable("move-state");
    } else {
      candidateMove = this.normalizeCandidateMove(this.readCandidateMove(), situationId);
      if (candidateMove.status === "available") {
        candidateMoveId = candidateMove.facts[0].reference.recordId;
        candidateMoveRevision = candidateMove.facts[0].reference.revision;
        hold = this.normalizeHold(this.readHold(), candidateMoveId);
        dependency = this.normalizeDependency(this.readDependency(), candidateMoveId);
        availability = this.normalizeAvailability(this.readAvailability(), situationId, candidateMoveId);
        commitment = this.normalizeCommitments(this.readCommitments(), candidateMoveId, candidateMoveRevision);
        routine = this.normalizeRoutines(this.readRoutines(), candidateMoveId, candidateMoveRevision);
        moveState = this.normalizeMoveState(this.readMoveState(), candidateMoveId, candidateMoveRevision);
      } else {
        const reason = candidateMove.status === "absent" ? "candidate-move-absent" : "candidate-move-unavailable";
        hold = notApplicable("hold", reason); dependency = notApplicable("dependency", reason);
        availability = notApplicable("availability", reason); commitment = notApplicable("commitment", reason);
        routine = notApplicable("routine", reason); moveState = notApplicable("move-state", reason);
      }
    }

    const authoritative = { situation, candidateMove, hold, dependency, availability, commitment, routine };
    const slots = [...Object.values(authoritative), moveState];
    const mandatoryUnavailable = situation.status === "unavailable" || candidateMove.status === "unavailable";
    const optionalUnavailable = slots.some((slot) => slot.status === "unavailable");
    const status = mandatoryUnavailable ? "unavailable" : optionalUnavailable ? "partial" : "available";
    const issues = slots.filter((slot) => slot.status === "unavailable").map((slot) => ({
      sourceType: slot.sourceType, status: "unavailable", reason: slot.reason,
    }));
    const context = {
      schemaVersion: this.SCHEMA_VERSION,
      type: "operating-context",
      requestType: request.requestType,
      asOf: request.asOf,
      status,
      scope: { situationId, candidateMoveId, candidateMoveRevision },
      authoritative,
      derived: { moveState },
      issues,
    };
    if (!this.validateContext(context)) throw new Error("Assembled Operating Context is invalid.");
    return this.clone(context);
  },

  validateRelationship(value) {
    if (!this.hasExactKeys(value, ["situationId", "situationRevision", "candidateMoveId", "candidateMoveRevision"])) return false;
    return (value.situationId === null || this.isText(value.situationId, 200)) &&
      (value.situationRevision === null || (Number.isInteger(value.situationRevision) && value.situationRevision > 0)) &&
      (value.candidateMoveId === null || this.isText(value.candidateMoveId, 200)) &&
      (value.candidateMoveRevision === null || (Number.isInteger(value.candidateMoveRevision) && value.candidateMoveRevision > 0));
  },

  validateReference(value, authority, sourceType) {
    if (!this.hasExactKeys(value, ["authority", "sourceType", "recordId", "revision", "status", "recordedAt", "relationships"]) ||
        value.authority !== authority || value.sourceType !== sourceType || !this.validateRelationship(value.relationships)) return false;
    if (sourceType === "move-state") {
      return value.recordId === null && value.revision === null && value.recordedAt === null &&
        ["hold", "waiting", "actionable", "clarify"].includes(value.status);
    }
    return this.validRecordId(sourceType, value.recordId) && Number.isInteger(value.revision) && value.revision > 0 &&
      this.isCanonicalUtc(value.recordedAt) && this.validReferenceStatus(sourceType, value.status);
  },

  validRecordId(sourceType, value) {
    if (typeof value !== "string") return false;
    const patterns = {
      situation: /^situation_[a-z0-9]+_[a-z0-9]+$/,
      "candidate-move": /^candidate_move_[a-z0-9]+_[a-z0-9]+$/,
      hold: /^candidate_move_hold_[a-z0-9]+_[a-z0-9]+$/,
      dependency: /^candidate_move_dependency_[a-z0-9]+_[a-z0-9]+$/,
      availability: /^candidate_move_availability_[a-z0-9]+_[a-z0-9]+$/,
      commitment: /^commitment_[a-z0-9]+_[a-z0-9]+$/,
      routine: /^routine_[a-z0-9]+_[a-z0-9]+$/,
    };
    return patterns[sourceType].test(value);
  },

  validReferenceStatus(sourceType, status) {
    return {
      situation: ["active", "closed"], "candidate-move": ["active", "withdrawn"], hold: ["active", "released"],
      dependency: ["unresolved", "resolved"], availability: ["confirmed", "withdrawn"],
      commitment: ["active", "completed", "canceled"], routine: ["active", "paused", "retired"],
    }[sourceType].includes(status);
  },

  validateFactData(sourceType, data) {
    if (sourceType === "situation") return this.hasExactKeys(data, ["subject", "currentReality", "carryStatus"]) && this.isText(data.subject, 160) && this.isText(data.currentReality, 2000) && ["active", "closed"].includes(data.carryStatus);
    if (sourceType === "candidate-move") return this.hasExactKeys(data, ["action", "status"]) && this.isText(data.action, 2000) && ["active", "withdrawn"].includes(data.status);
    if (sourceType === "hold") return this.hasExactKeys(data, ["status"]) && ["active", "released"].includes(data.status);
    if (sourceType === "dependency") return this.hasExactKeys(data, ["description", "status"]) && this.isText(data.description, 2000) && ["unresolved", "resolved"].includes(data.status);
    if (sourceType === "availability") return this.hasExactKeys(data, ["status", "isCurrent", "conditionsConfirmed"]) && ["confirmed", "withdrawn"].includes(data.status) && typeof data.isCurrent === "boolean" && this.isText(data.conditionsConfirmed, 2000);
    if (sourceType === "commitment") return this.hasExactKeys(data, ["acceptedAction", "status", "window"]) && this.isText(data.acceptedAction, 2000) && ["active", "completed", "canceled"].includes(data.status) && this.validWindow(data.window);
    if (sourceType === "routine") return this.hasExactKeys(data, ["action", "status", "schedule"]) && this.isText(data.action, 2000) && ["active", "paused", "retired"].includes(data.status) && this.validSchedule(data.schedule);
    return sourceType === "move-state" && this.hasExactKeys(data, ["state", "basis"]) && ["hold", "waiting", "actionable", "clarify"].includes(data.state) && this.validMoveStateBasis(data.state, data.basis);
  },

  validateSlot(slot, authority, sourceType) {
    if (!this.hasExactKeys(slot, ["authority", "sourceType", "status", "reason", "facts"]) ||
        slot.authority !== authority || slot.sourceType !== sourceType || !Array.isArray(slot.facts) ||
        !["available", "absent", "unavailable", "not-applicable"].includes(slot.status)) return false;
    if (slot.status !== "available") {
      return slot.facts.length === 0 && (slot.status === "absent" ? slot.reason === null : this.isText(slot.reason, 160));
    }
    if (slot.reason !== null || (!["commitment", "routine"].includes(sourceType) && slot.facts.length !== 1)) return false;
    const ids = new Set();
    for (const fact of slot.facts) {
      if (!this.hasExactKeys(fact, ["reference", "data"]) || !this.validateReference(fact.reference, authority, sourceType) ||
          !this.validateFactData(sourceType, fact.data) || fact.reference.status !== (sourceType === "situation" ? fact.data.carryStatus : sourceType === "move-state" ? fact.data.state : fact.data.status)) return false;
      const id = fact.reference.recordId;
      if (id !== null && ids.has(id)) return false;
      ids.add(id);
    }
    if (["commitment", "routine"].includes(sourceType)) {
      const sorted = slot.facts.map((fact) => fact.reference.recordId).sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
      if (slot.facts.some((fact, index) => fact.reference.recordId !== sorted[index])) return false;
    }
    return true;
  },

  validateContext(context) {
    if (!this.hasExactKeys(context, ["schemaVersion", "type", "requestType", "asOf", "status", "scope", "authoritative", "derived", "issues"]) ||
        context.schemaVersion !== 1 || context.type !== "operating-context" || context.requestType !== "situation-explanation" ||
        !this.isCanonicalUtc(context.asOf) || !["available", "partial", "unavailable"].includes(context.status) ||
        !this.hasExactKeys(context.scope, ["situationId", "candidateMoveId", "candidateMoveRevision"]) ||
        !this.hasExactKeys(context.authoritative, ["situation", "candidateMove", "hold", "dependency", "availability", "commitment", "routine"]) ||
        !this.hasExactKeys(context.derived, ["moveState"]) || !Array.isArray(context.issues)) return false;
    const authoritative = context.authoritative;
    for (const sourceType of ["situation", "candidate-move", "hold", "dependency", "availability", "commitment", "routine"]) {
      const key = sourceType === "candidate-move" ? "candidateMove" : sourceType;
      if (!this.validateSlot(authoritative[key], this.AUTHORITATIVE_AUTHORITY, sourceType)) return false;
    }
    if (!this.validateSlot(context.derived.moveState, this.DERIVED_AUTHORITY, "move-state")) return false;
    const situationFact = authoritative.situation.status === "available" ? authoritative.situation.facts[0] : null;
    const moveFact = authoritative.candidateMove.status === "available" ? authoritative.candidateMove.facts[0] : null;
    if (context.scope.situationId !== (situationFact ? situationFact.reference.recordId : null) ||
        context.scope.candidateMoveId !== (moveFact ? moveFact.reference.recordId : null) ||
        context.scope.candidateMoveRevision !== (moveFact ? moveFact.reference.revision : null)) return false;
    if (moveFact && moveFact.reference.relationships.situationId !== context.scope.situationId) return false;
    if (!this.validateContextRelationships(context)) return false;
    const slots = [...Object.values(authoritative), context.derived.moveState];
    const mandatoryUnavailable = authoritative.situation.status === "unavailable" || authoritative.candidateMove.status === "unavailable";
    const anyUnavailable = slots.some((slot) => slot.status === "unavailable");
    const expectedStatus = mandatoryUnavailable ? "unavailable" : anyUnavailable ? "partial" : "available";
    if (context.status !== expectedStatus) return false;
    const expectedIssues = slots.filter((slot) => slot.status === "unavailable").map((slot) => ({ sourceType: slot.sourceType, status: "unavailable", reason: slot.reason }));
    if (context.issues.length !== expectedIssues.length) return false;
    return context.issues.every((issue, index) => this.hasExactKeys(issue, ["sourceType", "status", "reason"]) &&
      issue.sourceType === expectedIssues[index].sourceType && issue.status === "unavailable" && issue.reason === expectedIssues[index].reason);
  },

  validateContextRelationships(context) {
    const moveId = context.scope.candidateMoveId; const moveRevision = context.scope.candidateMoveRevision;
    const situationId = context.scope.situationId;
    const situation = context.authoritative.situation;
    const candidateMove = context.authoritative.candidateMove;
    if (situation.status !== "available") {
      if (candidateMove.status !== "not-applicable") return false;
      for (const slot of [context.authoritative.hold, context.authoritative.dependency, context.authoritative.availability,
        context.authoritative.commitment, context.authoritative.routine, context.derived.moveState]) {
        if (slot.status !== "not-applicable") return false;
      }
      return true;
    }
    const situationRelationship = situation.facts[0].reference.relationships;
    if (Object.values(situationRelationship).some((value) => value !== null)) return false;
    if (candidateMove.status === "available") {
      const moveRelationship = candidateMove.facts[0].reference.relationships;
      if (moveRelationship.situationId !== situationId || moveRelationship.situationRevision !== null ||
          moveRelationship.candidateMoveId !== null || moveRelationship.candidateMoveRevision !== null) return false;
    } else {
      for (const slot of [context.authoritative.hold, context.authoritative.dependency, context.authoritative.availability,
        context.authoritative.commitment, context.authoritative.routine, context.derived.moveState]) {
        if (slot.status !== "not-applicable") return false;
      }
      return true;
    }
    for (const sourceType of ["hold", "dependency", "availability", "commitment", "routine"]) {
      const slot = context.authoritative[sourceType];
      for (const fact of slot.facts) {
        const relationship = fact.reference.relationships;
        if (relationship.candidateMoveId !== moveId) return false;
        if (["commitment", "routine"].includes(sourceType) && relationship.candidateMoveRevision !== moveRevision) return false;
        if (["hold", "dependency"].includes(sourceType) && relationship.candidateMoveRevision !== null) return false;
        if (sourceType === "availability" && relationship.situationId !== situationId) return false;
        if (sourceType !== "availability" && (relationship.situationId !== null || relationship.situationRevision !== null)) return false;
      }
    }
    const state = context.derived.moveState;
    if (state.status === "available") {
      const fact = state.facts[0];
      if (fact.reference.relationships.candidateMoveId !== moveId || fact.reference.relationships.candidateMoveRevision !== moveRevision) return false;
      const basis = fact.data.basis.references[0];
      if (basis) {
        const sourceType = { "candidate-move-hold": "hold", "candidate-move-dependency": "dependency", "candidate-move-availability": "availability" }[basis.type];
        const source = sourceType && context.authoritative[sourceType].facts.find((item) => item.reference.recordId === basis.id && item.reference.revision === basis.revision);
        if (!source) return false;
        if (sourceType === "hold" && source.data.status !== "active") return false;
        if (sourceType === "dependency" && source.data.status !== "unresolved") return false;
        if (sourceType === "availability" && (source.data.status !== "confirmed" || source.data.isCurrent !== true)) return false;
      }
    }
    return true;
  },
};