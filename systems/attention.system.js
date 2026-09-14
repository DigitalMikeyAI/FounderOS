// =====================================================
// FOUNDEROS
// ATTENTION SYSTEM
// Pure derived Commander awareness classification.
// =====================================================

const AttentionSystem = {
  UTC_PATTERN: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
  CONDITIONS: ["move.actionable", "move.waiting", "move.hold", "move.clarify", "commitment.active", "commitment.deadline.open", "commitment.deadline.passed", "routine.current"],

  clone(value) { return JSON.parse(JSON.stringify(value)); },
  exact(value, keys) { return value !== null && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === keys.length && Object.keys(value).every((key) => keys.includes(key)); },
  canonicalUtc(value) { return typeof value === "string" && this.UTC_PATTERN.test(value) && !Number.isNaN(new Date(value).getTime()) && new Date(value).toISOString() === value; },
  result(status, reason, asOf, extra = {}) { return { status, reason, asOf, ...extra }; },
  candidate(candidate) {
    if (!this.exact(candidate, ["candidateMoveId", "candidateMoveRevision", "situationId", "action", "bases"]) || typeof candidate.candidateMoveId !== "string" || !Number.isInteger(candidate.candidateMoveRevision) || typeof candidate.situationId !== "string" || typeof candidate.action !== "string" || !Array.isArray(candidate.bases) || candidate.bases.length === 0) return null;
    const predicates = new Set();
    for (const basis of candidate.bases) {
      if (!basis || typeof basis !== "object" || Array.isArray(basis)) return null;
      if (basis.kind === "move" && this.exact(basis, ["kind", "moveState", "stateBasis"]) && ["actionable", "waiting", "hold", "clarify"].includes(basis.moveState) && basis.stateBasis && typeof basis.stateBasis === "object") predicates.add(`move.${basis.moveState}`);
      else if (basis.kind === "commitment" && this.exact(basis, ["kind", "commitmentId", "commitmentRevision", "lifecycle", "dueAt", "deadlineState"]) && typeof basis.commitmentId === "string" && Number.isInteger(basis.commitmentRevision) && basis.lifecycle === "active" && this.canonicalUtc(basis.dueAt) && ["open", "passed"].includes(basis.deadlineState)) { predicates.add("commitment.active"); predicates.add(`commitment.deadline.${basis.deadlineState}`); }
      else if (basis.kind === "routine-occurrence" && this.exact(basis, ["kind", "routineId", "routineRevision", "occurrenceKey", "opensAt", "closesAt"]) && typeof basis.routineId === "string" && Number.isInteger(basis.routineRevision) && typeof basis.occurrenceKey === "string" && this.canonicalUtc(basis.opensAt) && this.canonicalUtc(basis.closesAt)) predicates.add("routine.current");
      else return null;
    }
    return { snapshot: this.clone(candidate), predicates };
  },
  policy(current) {
    if (!this.exact(current, ["revision", "status", "rules", "provenance", "recordedAt"]) || !Number.isInteger(current.revision) || current.status !== "active" || !Array.isArray(current.rules) || !this.exact(current.provenance, ["authority", "operation"]) || current.provenance.authority !== "commander" || !["establish", "replace"].includes(current.provenance.operation) || !this.canonicalUtc(current.recordedAt)) return null;
    const ids = new Set(); const rules = []; let prior = null;
    for (const rule of current.rules) { if (!this.exact(rule, ["id", "conditions"]) || typeof rule.id !== "string" || !Array.isArray(rule.conditions) || rule.conditions.length < 1 || rule.conditions.length > 3 || new Set(rule.conditions).size !== rule.conditions.length || rule.conditions.some((condition) => !this.CONDITIONS.includes(condition)) || rule.conditions.some((condition, index) => index > 0 && this.CONDITIONS.indexOf(rule.conditions[index - 1]) > this.CONDITIONS.indexOf(condition)) || ids.has(rule.id)) return null; const signature = rule.conditions.join("\u0000"); if (prior !== null && prior.localeCompare(signature) > 0) return null; prior = signature; ids.add(rule.id); rules.push({ ruleId: rule.id, conditions: this.clone(rule.conditions) }); }
    return { revision: current.revision, rules };
  },
  context(current) { if (!this.exact(current, ["revision", "status", "scope", "provenance", "recordedAt"]) || !Number.isInteger(current.revision) || current.status !== "active" || !this.exact(current.provenance, ["authority", "operation"]) || current.provenance.authority !== "commander" || !["set", "switch"].includes(current.provenance.operation) || !this.canonicalUtc(current.recordedAt)) return null; const scope = current.scope; return this.exact(scope, ["mode"]) && scope.mode === "open" || this.exact(scope, ["mode", "situationIds"]) && scope.mode === "scoped" && Array.isArray(scope.situationIds) && scope.situationIds.length === 1 && typeof scope.situationIds[0] === "string" ? current.revision : null; },
  getAttention({ asOf } = {}) {
    const invalidAsOf = typeof asOf === "string" ? asOf : null; if (!this.canonicalUtc(asOf)) return this.result("unavailable", "attention-as-of-invalid", invalidAsOf);
    if (typeof AttentionCandidateSystem === "undefined" || !AttentionCandidateSystem || typeof AttentionCandidateSystem.getCandidates !== "function") return this.result("unavailable", "attention-candidates-unavailable", asOf);
    let candidateResult; try { candidateResult = AttentionCandidateSystem.getCandidates({ asOf }); } catch (error) { return this.result("unavailable", "attention-candidates-unavailable", asOf); }
    if (!this.exact(candidateResult, ["status", "asOf", "candidates"]) || candidateResult.status !== "available" || candidateResult.asOf !== asOf || !Array.isArray(candidateResult.candidates)) return this.result("unavailable", "attention-candidates-unavailable", asOf);
    const candidates = candidateResult.candidates.map((candidate) => this.candidate(candidate)); if (candidates.some((candidate) => !candidate)) return this.result("unavailable", "attention-candidates-unavailable", asOf);
    if (typeof CommanderAttentionPolicySystem === "undefined" || !CommanderAttentionPolicySystem || typeof CommanderAttentionPolicySystem.getAttentionPolicy !== "function") return this.result("unavailable", "attention-policy-unavailable", asOf);
    let policyResult; try { policyResult = CommanderAttentionPolicySystem.getAttentionPolicy(); } catch (error) { return this.result("unavailable", "attention-policy-unavailable", asOf); }
    if (!policyResult || typeof policyResult !== "object" || Array.isArray(policyResult)) return this.result("unavailable", "attention-policy-unavailable", asOf);
    if (policyResult.status === "absent" && this.exact(policyResult, ["status"])) return this.result("undetermined", "attention-policy-absent", asOf);
    if (policyResult.status === "available" && this.exact(policyResult, ["status", "current"]) && policyResult.current && policyResult.current.status === "cleared" && Number.isInteger(policyResult.current.revision)) return this.result("undetermined", "attention-policy-cleared", asOf, { policyRevision: policyResult.current.revision });
    if (policyResult.status !== "available" || !this.exact(policyResult, ["status", "current"])) return this.result("unavailable", "attention-policy-unavailable", asOf);
    const policy = this.policy(policyResult.current); if (!policy) return this.result("unavailable", "attention-policy-unavailable", asOf);
    if (typeof CommanderContextSystem === "undefined" || !CommanderContextSystem || typeof CommanderContextSystem.getContext !== "function" || typeof CommanderContextSystem.getSituationEligibility !== "function") return this.result("unavailable", "context-unavailable", asOf);
    let contextResult; try { contextResult = CommanderContextSystem.getContext(); } catch (error) { return this.result("unavailable", "context-unavailable", asOf); }
    if (!contextResult || typeof contextResult !== "object" || Array.isArray(contextResult)) return this.result("unavailable", "context-unavailable", asOf);
    if (contextResult.status === "absent" && this.exact(contextResult, ["status"])) return this.result("undetermined", "context-absent", asOf);
    if (contextResult.status === "available" && this.exact(contextResult, ["status", "current"]) && contextResult.current && contextResult.current.status === "cleared" && Number.isInteger(contextResult.current.revision)) return this.result("undetermined", "context-cleared", asOf, { contextRevision: contextResult.current.revision });
    if (contextResult.status !== "available" || !this.exact(contextResult, ["status", "current"])) return this.result("unavailable", "context-unavailable", asOf);
    const contextRevision = this.context(contextResult.current); if (contextRevision === null) return this.result("unavailable", "context-unavailable", asOf);
    const items = [];
    for (const candidate of candidates) {
      let eligibility; try { eligibility = CommanderContextSystem.getSituationEligibility({ situationId: candidate.snapshot.situationId }); } catch (error) { return this.result("unavailable", "context-unavailable", asOf); }
      if (!eligibility || !this.exact(eligibility, ["status", "eligibility", "reason", "contextRevision"]) || eligibility.status !== "available" || !["eligible", "not-eligible", "unknown"].includes(eligibility.eligibility) || eligibility.contextRevision !== contextRevision) return eligibility && eligibility.contextRevision !== undefined && eligibility.contextRevision !== contextRevision ? this.result("unavailable", "context-revision-inconsistent", asOf) : this.result("unavailable", "context-unavailable", asOf);
      if (eligibility.eligibility === "unknown") return this.result("undetermined", "context-eligibility-unknown", asOf, { policyRevision: policy.revision, contextRevision });
      if (eligibility.eligibility === "not-eligible") continue;
      const matchingRules = policy.rules.filter((rule) => rule.conditions.every((condition) => candidate.predicates.has(condition))); if (matchingRules.length) items.push({ candidate: candidate.snapshot, matchingRules });
    }
    items.sort((left, right) => left.candidate.candidateMoveId.localeCompare(right.candidate.candidateMoveId) || left.candidate.candidateMoveRevision - right.candidate.candidateMoveRevision);
    return { status: "available", asOf, policyRevision: policy.revision, contextRevision, items: this.clone(items) };
  },
};