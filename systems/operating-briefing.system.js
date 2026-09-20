// =====================================================
// FOUNDEROS
// OPERATING BRIEFING SYSTEM
// Read-only assembly of existing Operating Intelligence truth.
// =====================================================

const OperatingBriefingSystem = {
  UTC_PATTERN: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
  clone(value) { return JSON.parse(JSON.stringify(value)); },
  exact(value, keys) { return value !== null && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === keys.length && Object.keys(value).every((key) => keys.includes(key)); },
  canonicalUtc(value) { return typeof value === "string" && this.UTC_PATTERN.test(value) && !Number.isNaN(new Date(value).getTime()) && new Date(value).toISOString() === value; },
  unavailable(reason) { return { status: "unavailable", reason, data: null }; },
  section(status, reason, data = null) { return { status, reason, data: data === null ? null : this.clone(data) }; },
  owner(name, method) {
    const owners = {
      SituationSystem: typeof SituationSystem === "undefined" ? null : SituationSystem,
      CandidateMoveSystem: typeof CandidateMoveSystem === "undefined" ? null : CandidateMoveSystem,
      MoveStateSystem: typeof MoveStateSystem === "undefined" ? null : MoveStateSystem,
      AttentionSystem: typeof AttentionSystem === "undefined" ? null : AttentionSystem,
    };
    return owners[name] && typeof owners[name][method] === "function" ? owners[name] : null;
  },
  read(name, method, input) {
    const owner = this.owner(name, method);
    if (!owner) return { failed: true, reason: `${name}-reader-unavailable` };
    try { return { value: input === undefined ? owner[method]() : owner[method](input) }; } catch (error) { return { failed: true, reason: `${name}-reader-failed` }; }
  },
  situation(source) {
    if (!source || typeof source !== "object" || Array.isArray(source)) return this.unavailable("situation-invalid");
    if (source.status === "absent" && this.exact(source, ["status", "situation"]) && source.situation === null) return this.section("absent", null);
    if (source.status === "unavailable" && this.exact(source, ["status", "reason"]) && typeof source.reason === "string") return this.unavailable(source.reason);
    if (source.status !== "available" || !this.exact(source, ["status", "situation", "current"]) || !source.situation || typeof source.situation !== "object" || Array.isArray(source.situation) || !this.exact(source.current, ["id", "revision", "subject", "currentReality", "carryStatus"]) || typeof source.current.id !== "string" || !Number.isInteger(source.current.revision) || typeof source.current.subject !== "string" || typeof source.current.currentReality !== "string" || !["active", "closed"].includes(source.current.carryStatus)) return this.unavailable("situation-invalid");
    return this.section("available", null, source);
  },
  move(source) {
    if (!source || typeof source !== "object" || Array.isArray(source)) return this.unavailable("candidate-move-invalid");
    if (source.status === "absent" && this.exact(source, ["status", "candidateMove"]) && source.candidateMove === null) return this.section("absent", null);
    if (source.status === "unavailable" && this.exact(source, ["status", "reason"]) && typeof source.reason === "string") return this.unavailable(source.reason);
    if (source.status !== "available" || !this.exact(source, ["status", "candidateMove", "current"]) || !source.candidateMove || typeof source.candidateMove !== "object" || Array.isArray(source.candidateMove) || !this.exact(source.current, ["id", "situationId", "revision", "action", "status"]) || typeof source.current.id !== "string" || typeof source.current.situationId !== "string" || !Number.isInteger(source.current.revision) || typeof source.current.action !== "string" || !["active", "withdrawn"].includes(source.current.status)) return this.unavailable("candidate-move-invalid");
    return this.section("available", null, source);
  },
  moveState(source) {
    if (!source || typeof source !== "object" || Array.isArray(source)) return this.unavailable("move-state-invalid");
    if (source.status === "not-applicable" && this.exact(source, ["status", "reason"]) && typeof source.reason === "string") return this.section("not-applicable", source.reason);
    if (source.status === "not-applicable" && this.exact(source, ["status", "reason", "candidateMoveId"]) && typeof source.reason === "string" && typeof source.candidateMoveId === "string") return this.section("not-applicable", source.reason);
    if (source.status === "unavailable" && this.exact(source, ["status", "reason"]) && typeof source.reason === "string") return this.unavailable(source.reason);
    if (source.status !== "available" || !this.exact(source, ["status", "state", "candidateMoveId", "candidateMoveRevision", "basis"]) || !["actionable", "waiting", "hold", "clarify"].includes(source.state) || typeof source.candidateMoveId !== "string" || !Number.isInteger(source.candidateMoveRevision) || !source.basis || typeof source.basis !== "object" || Array.isArray(source.basis)) return this.unavailable("move-state-invalid");
    return this.section("available", null, source);
  },
  attentionBasis(basis) {
    return basis && typeof basis === "object" && !Array.isArray(basis) && ((basis.kind === "move" && this.exact(basis, ["kind", "moveState", "stateBasis"]) && ["actionable", "waiting", "hold", "clarify"].includes(basis.moveState) && basis.stateBasis && typeof basis.stateBasis === "object" && !Array.isArray(basis.stateBasis)) || (basis.kind === "commitment" && this.exact(basis, ["kind", "commitmentId", "commitmentRevision", "lifecycle", "dueAt", "deadlineState"]) && typeof basis.commitmentId === "string" && Number.isInteger(basis.commitmentRevision) && basis.lifecycle === "active" && this.canonicalUtc(basis.dueAt) && ["open", "passed"].includes(basis.deadlineState)) || (basis.kind === "routine-occurrence" && this.exact(basis, ["kind", "routineId", "routineRevision", "occurrenceKey", "opensAt", "closesAt"]) && typeof basis.routineId === "string" && Number.isInteger(basis.routineRevision) && typeof basis.occurrenceKey === "string" && this.canonicalUtc(basis.opensAt) && this.canonicalUtc(basis.closesAt)));
  },
  attentionItem(item) {
    if (!this.exact(item, ["candidate", "matchingRules"]) || !this.exact(item.candidate, ["candidateMoveId", "candidateMoveRevision", "situationId", "action", "bases"]) || typeof item.candidate.candidateMoveId !== "string" || !Number.isInteger(item.candidate.candidateMoveRevision) || typeof item.candidate.situationId !== "string" || typeof item.candidate.action !== "string" || !Array.isArray(item.candidate.bases) || !item.candidate.bases.every((basis) => this.attentionBasis(basis)) || !Array.isArray(item.matchingRules) || item.matchingRules.length < 1) return false;
    return item.matchingRules.every((rule) => this.exact(rule, ["ruleId", "conditions"]) && typeof rule.ruleId === "string" && Array.isArray(rule.conditions) && rule.conditions.length > 0 && rule.conditions.every((condition) => typeof condition === "string"));
  },
  radar(source, asOf) {
    if (!source || typeof source !== "object" || Array.isArray(source) || source.asOf !== asOf) return this.unavailable("attention-invalid");
    if (source.status === "unavailable" && this.exact(source, ["status", "reason", "asOf"]) && typeof source.reason === "string") return this.unavailable(source.reason);
    if (source.status === "undetermined" && this.exact(source, ["status", "reason", "asOf"]) && typeof source.reason === "string") return this.section("undetermined", source.reason);
    if (source.status === "undetermined" && this.exact(source, ["status", "reason", "asOf", "policyRevision"]) && typeof source.reason === "string" && Number.isInteger(source.policyRevision)) return this.section("undetermined", source.reason, { policyRevision: source.policyRevision });
    if (source.status === "undetermined" && this.exact(source, ["status", "reason", "asOf", "contextRevision"]) && typeof source.reason === "string" && Number.isInteger(source.contextRevision)) return this.section("undetermined", source.reason, { contextRevision: source.contextRevision });
    if (source.status !== "available" || !this.exact(source, ["status", "asOf", "policyRevision", "contextRevision", "items"]) || !Number.isInteger(source.policyRevision) || !Number.isInteger(source.contextRevision) || !Array.isArray(source.items) || !source.items.every((item) => this.attentionItem(item))) return this.unavailable("attention-invalid");
    return this.section("available", null, source);
  },
  getBriefing({ asOf } = {}) {
    const validAsOf = this.canonicalUtc(asOf);
    if (!validAsOf) return { status: "unavailable", asOf: null, reason: "operating-briefing-as-of-invalid", sections: { situation: this.unavailable("operating-briefing-as-of-invalid"), move: this.unavailable("operating-briefing-as-of-invalid"), moveState: this.unavailable("operating-briefing-as-of-invalid"), radar: this.unavailable("operating-briefing-as-of-invalid") } };
    const situationRead = this.read("SituationSystem", "getSituation");
    const moveRead = this.read("CandidateMoveSystem", "getCandidateMove");
    const moveStateRead = this.read("MoveStateSystem", "getMoveState");
    const radarRead = this.read("AttentionSystem", "getAttention", { asOf });
    const situation = situationRead.failed ? this.unavailable(situationRead.reason) : this.situation(situationRead.value);
    let move = moveRead.failed ? this.unavailable(moveRead.reason) : this.move(moveRead.value);
    let moveState = moveStateRead.failed ? this.unavailable(moveStateRead.reason) : this.moveState(moveStateRead.value);
    const radar = radarRead.failed ? this.unavailable(radarRead.reason) : this.radar(radarRead.value, asOf);
    if (situation.status === "available" && move.status === "available" && move.data.current.situationId !== situation.data.current.id) move = this.unavailable("candidate-move-situation-inconsistent");
    if (moveState.status === "available" && (move.status !== "available" || moveState.data.candidateMoveId !== move.data.current.id || moveState.data.candidateMoveRevision !== move.data.current.revision)) moveState = this.unavailable("move-state-candidate-move-inconsistent");
    const sections = { situation, move, moveState, radar };
    const statuses = Object.values(sections).map((section) => section.status);
    const unavailable = statuses.filter((status) => status === "unavailable").length;
    const status = unavailable === 0 ? "available" : unavailable === statuses.length ? "unavailable" : "partial";
    return { status, asOf, reason: status === "unavailable" ? "operating-briefing-sources-unavailable" : null, sections: this.clone(sections) };
  },
};