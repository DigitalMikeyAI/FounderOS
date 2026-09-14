// =====================================================
// FOUNDEROS
// COMMANDER ATTENTION POLICY SYSTEM
// Commander-authorized awareness-classification rules only.
// =====================================================

const CommanderAttentionPolicySystem = {
  version: "1.0.0",
  SCHEMA_VERSION: 1,
  UTC_PATTERN: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
  CONDITIONS: ["move.actionable", "move.waiting", "move.hold", "move.clarify", "commitment.active", "commitment.deadline.open", "commitment.deadline.passed", "routine.current"],

  clone(value) { return JSON.parse(JSON.stringify(value)); },
  hasExactKeys(value, keys) { return value !== null && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === keys.length && Object.keys(value).every((key) => keys.includes(key)); },
  storageStatus() { return typeof getFounderStorageLoadStatus === "function" ? getFounderStorageLoadStatus() : null; },
  usableStorage() { const status = this.storageStatus(); return status === "loaded" || status === "absent"; },
  canonicalUtc(value) { return typeof value === "string" && this.UTC_PATTERN.test(value) && !Number.isNaN(new Date(value).getTime()) && new Date(value).toISOString() === value; },
  conditionIndex(value) { return this.CONDITIONS.indexOf(value); },
  canonicalConditions(conditions) {
    if (!Array.isArray(conditions) || conditions.length < 1 || conditions.length > 3 || conditions.some((value) => typeof value !== "string" || this.conditionIndex(value) < 0) || new Set(conditions).size !== conditions.length) return null;
    return [...conditions].sort((left, right) => this.conditionIndex(left) - this.conditionIndex(right));
  },
  ruleSignature(conditions) { return conditions.join("\u0000"); },
  canonicalInput(rules) {
    if (!Array.isArray(rules)) return null; const signatures = new Set(); const canonical = [];
    for (const conditions of rules) { const normalized = this.canonicalConditions(conditions); if (!normalized || signatures.has(this.ruleSignature(normalized))) return null; signatures.add(this.ruleSignature(normalized)); canonical.push(normalized); }
    return canonical.sort((left, right) => this.ruleSignature(left).localeCompare(this.ruleSignature(right)));
  },
  validRule(rule, ids, signatures) {
    if (!this.hasExactKeys(rule, ["id", "conditions"]) || typeof rule.id !== "string" || !/^attention_rule_[a-z0-9]+_[a-z0-9]+$/.test(rule.id) || ids.has(rule.id)) return false;
    const conditions = this.canonicalConditions(rule.conditions); if (!conditions || this.ruleSignature(conditions) !== this.ruleSignature(rule.conditions) || signatures.has(this.ruleSignature(conditions))) return false;
    ids.add(rule.id); signatures.add(this.ruleSignature(conditions)); return true;
  },
  validate(policy) {
    if (!this.hasExactKeys(policy, ["schemaVersion", "revisions"]) || policy.schemaVersion !== this.SCHEMA_VERSION || !Array.isArray(policy.revisions) || policy.revisions.length === 0) return null;
    let prior = null; let latest = null;
    for (let index = 0; index < policy.revisions.length; index += 1) {
      const revision = policy.revisions[index];
      if (!this.hasExactKeys(revision, ["revision", "status", "rules", "provenance", "recordedAt"]) || revision.revision !== index + 1 || !this.canonicalUtc(revision.recordedAt) || !this.hasExactKeys(revision.provenance, ["authority", "operation"]) || revision.provenance.authority !== "commander") return null;
      if (revision.status === "active") {
        if (!Array.isArray(revision.rules)) return null; const ids = new Set(); const signatures = new Set(); if (!revision.rules.every((rule) => this.validRule(rule, ids, signatures))) return null;
        const sorted = revision.rules.map((rule) => this.ruleSignature(rule.conditions)); if (sorted.some((signature, position) => position > 0 && sorted[position - 1].localeCompare(signature) > 0)) return null;
        if (index === 0 || prior.status === "cleared") { if (revision.provenance.operation !== "establish") return null; }
        else if (prior.status === "active") { if (revision.provenance.operation !== "replace") return null; }
        else return null;
      } else if (revision.status === "cleared") {
        if (revision.rules !== null || index === 0 || prior.status !== "active" || revision.provenance.operation !== "clear") return null;
      } else return null;
      prior = revision; latest = revision;
    }
    return { policy: this.clone(policy), current: this.clone(latest) };
  },
  state() {
    const status = this.storageStatus(); if (status !== "loaded" && status !== "absent") return { status: "unavailable", reason: "founder-storage-unavailable" };
    if (typeof founder === "undefined" || !founder || typeof founder !== "object") return { status: "unavailable", reason: "founder-storage-unavailable" };
    if (!Object.hasOwn(founder, "attentionPolicy")) return { status: "absent" };
    const valid = this.validate(founder.attentionPolicy); return valid ? { status: "available", ...valid } : { status: "unavailable", reason: "attention-policy-corrupt" };
  },
  getAttentionPolicy() { const state = this.state(); return state.status === "available" ? { status: "available", current: this.clone(state.current) } : state; },
  getAttentionPolicyHistory() { const state = this.state(); return state.status === "available" ? { status: "available", revisions: this.clone(state.policy.revisions) } : state; },
  canPublish() {
    if (typeof founder === "undefined" || !founder || typeof founder !== "object") return false;
    const own = Object.getOwnPropertyDescriptor(founder, "attentionPolicy"); if (own) return "value" in own && own.writable !== false;
    for (let prototype = Object.getPrototypeOf(founder); prototype; prototype = Object.getPrototypeOf(prototype)) { const descriptor = Object.getOwnPropertyDescriptor(prototype, "attentionPolicy"); if (!descriptor) continue; if (!("value" in descriptor) || descriptor.writable === false) return false; break; }
    return Object.isExtensible(founder);
  },
  persist(policy) {
    if (!this.canPublish()) throw new Error("Founder Attention Policy cannot be published safely.");
    if (typeof CommanderSystem === "undefined" || typeof CommanderSystem.save !== "function") throw new Error("Founder persistence is unavailable.");
    const candidateFounder = this.clone(founder); candidateFounder.attentionPolicy = policy;
    if (CommanderSystem.save(candidateFounder) !== true) throw new Error("Founder persistence was not confirmed.");
    founder.attentionPolicy = policy;
  },
  sameRules(current, rules) { return current.length === rules.length && current.every((rule, index) => this.ruleSignature(rule.conditions) === this.ruleSignature(rules[index].conditions)); },
  rulesFor(input) {
    const rules = this.canonicalInput(input); if (!rules) throw new Error("Attention Policy rules are invalid.");
    return rules.map((conditions, index) => ({ id: `attention_rule_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}${index.toString(36)}`, conditions }));
  },
  mutate({ rules, expectedRevision, operation } = {}) {
    if (!this.usableStorage()) throw new Error("Founder storage is unavailable."); const state = this.state(); if (state.status === "unavailable") throw new Error("Attention Policy is unavailable.");
    const actual = state.status === "absent" ? 0 : state.current.revision; if (expectedRevision !== actual) throw new Error("Attention Policy revision does not match.");
    if (!["establish", "replace", "clear"].includes(operation)) throw new Error("Attention Policy operation is invalid.");
    if (operation === "clear") {
      if (state.status === "absent") return { status: "absent" }; if (state.current.status === "cleared") return this.clone(state.policy); if (state.current.status !== "active") throw new Error("Attention Policy lifecycle is invalid.");
      const policy = this.clone(state.policy); policy.revisions.push({ revision: actual + 1, status: "cleared", rules: null, provenance: { authority: "commander", operation: "clear" }, recordedAt: new Date().toISOString() }); this.persist(policy); return this.clone(policy);
    }
    const nextRules = this.rulesFor(rules);
    if (operation === "establish" && !(state.status === "absent" || state.current.status === "cleared")) throw new Error("Attention Policy is already active.");
    if (operation === "replace" && !(state.status === "available" && state.current.status === "active")) throw new Error("Attention Policy is not active.");
    if (operation === "replace" && this.sameRules(state.current.rules, nextRules)) return this.clone(state.policy);
    const revisions = state.status === "absent" ? [] : this.clone(state.policy.revisions); revisions.push({ revision: actual + 1, status: "active", rules: nextRules, provenance: { authority: "commander", operation }, recordedAt: new Date().toISOString() }); const policy = { schemaVersion: this.SCHEMA_VERSION, revisions }; this.persist(policy); return this.clone(policy);
  },
  establishAttentionPolicy({ rules, expectedRevision } = {}) { return this.mutate({ rules, expectedRevision, operation: "establish" }); },
  replaceAttentionPolicy({ rules, expectedRevision } = {}) { return this.mutate({ rules, expectedRevision, operation: "replace" }); },
  clearAttentionPolicy({ expectedRevision } = {}) { return this.mutate({ expectedRevision, operation: "clear" }); },
};