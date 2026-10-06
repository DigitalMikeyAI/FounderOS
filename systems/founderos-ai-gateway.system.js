// =====================================================
// FOUNDEROS
// PROVIDER-NEUTRAL AI GATEWAY
// Non-authoritative, read-only AI response validation only.
// =====================================================

const FounderOSAiGateway = {
  version: "1.0.0",
  SCHEMA_VERSION: 1,
  MAX_EXPLANATION_LENGTH: 4000,
  MAX_UNCERTAINTY_DETAIL_LENGTH: 500,
  FAILURE_CODES: [
    "context-unavailable", "provider-unavailable", "provider-timeout", "provider-refusal",
    "provider-invalid-response", "provider-unsupported-schema", "provider-empty-response", "canceled",
  ],
  ADAPTER_FAILURE_CODES: ["provider-unavailable", "provider-timeout", "provider-refusal", "canceled"],
  UNCERTAINTY_KINDS: ["source-absent", "source-unavailable", "relationship-not-witnessed", "unsupported-conclusion"],

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

  same(left, right) {
    if (left === right) return true;
    if (Array.isArray(left) || Array.isArray(right)) {
      return Array.isArray(left) && Array.isArray(right) && left.length === right.length &&
        left.every((item, index) => this.same(item, right[index]));
    }
    if (!this.isObject(left) || !this.isObject(right)) return false;
    const leftKeys = Object.keys(left).sort(); const rightKeys = Object.keys(right).sort();
    return leftKeys.length === rightKeys.length && leftKeys.every((key, index) => key === rightKeys[index] && this.same(left[key], right[key]));
  },

  text(value, maximumLength) {
    return typeof value === "string" && value.trim() === value && value.length > 0 && value.length <= maximumLength;
  },

  failure(requestType, code) {
    return {
      schemaVersion: 1, type: "ai-gateway-result", requestType, status: "failed",
      failure: { code }, response: null,
    };
  },

  success(requestType, response) {
    return {
      schemaVersion: 1, type: "ai-gateway-result", requestType, status: "available",
      failure: null, response: this.clone(response),
    };
  },

  createProviderError(code) {
    if (!this.ADAPTER_FAILURE_CODES.includes(code)) throw new TypeError("Provider failure code is invalid.");
    return { name: "FounderOSAiProviderError", code };
  },

  knownProviderError(error) {
    return this.hasExactKeys(error, ["name", "code"]) && error.name === "FounderOSAiProviderError" &&
      this.ADAPTER_FAILURE_CODES.includes(error.code);
  },

  createFakeProvider({ response = null, failure = null } = {}) {
    if (failure !== null && !this.ADAPTER_FAILURE_CODES.includes(failure)) throw new TypeError("Fake provider failure is invalid.");
    if (failure !== null && response !== null) throw new TypeError("Fake provider cannot return and fail.");
    const fixture = this.clone(response); let invocations = 0;
    return {
      invoke: async (providerRequest) => {
        invocations += 1;
        if (!this.hasExactKeys(providerRequest, ["schemaVersion", "type", "requestType", "asOf", "context"])) {
          throw new Error("Fake provider received an invalid request.");
        }
        if (failure !== null) throw this.createProviderError(failure);
        return this.clone(fixture);
      },
      getInvocationCount() { return invocations; },
    };
  },

  contextSlots(context) {
    return [
      context.authoritative.situation, context.authoritative.candidateMove, context.authoritative.hold,
      context.authoritative.dependency, context.authoritative.availability, context.authoritative.commitment,
      context.authoritative.routine, context.derived.moveState,
    ];
  },

  sourceSlot(context, sourceType) {
    return this.contextSlots(context).find((slot) => slot.sourceType === sourceType) || null;
  },

  suppliedReferences(context) {
    return this.contextSlots(context).flatMap((slot) => slot.facts.map((fact) => fact.reference));
  },

  validateCitation(citation, references) {
    if (!this.isObject(citation)) return false;
    return references.some((reference) => this.same(citation, reference));
  },

  validateUncertainty(entry, context) {
    if (!this.hasExactKeys(entry, ["kind", "sourceType", "detail"]) || !this.UNCERTAINTY_KINDS.includes(entry.kind) ||
        !this.text(entry.detail, this.MAX_UNCERTAINTY_DETAIL_LENGTH)) return false;
    if (entry.kind === "unsupported-conclusion") return entry.sourceType === null;
    if (typeof entry.sourceType !== "string") return false;
    const slot = this.sourceSlot(context, entry.sourceType);
    if (!slot) return false;
    if (entry.kind === "source-absent") return slot.status === "absent";
    if (entry.kind === "source-unavailable") return slot.status === "unavailable";
    return entry.kind === "relationship-not-witnessed" && slot.status === "available";
  },

  validActionSnapshots(context) {
    const move = context.authoritative.candidateMove;
    if (move.status !== "available") return true;
    const record = { fact: move.facts[0].data };
    const action = record.fact.action;
    return context.authoritative.commitment.facts.every((fact) => fact.data.acceptedAction === action) &&
      context.authoritative.routine.facts.every((fact) => fact.data.action === action);
  },

  availableFact(slot) {
    return slot.status === "available" && slot.facts.length === 1 ? slot.facts[0] : null;
  },

  sameMoveStateBasis(fact, state, sourceType) {
    const source = this.availableFact(fact);
    if (!source) return false;
    const expectedType = {
      hold: "candidate-move-hold",
      dependency: "candidate-move-dependency",
      availability: "candidate-move-availability",
    }[sourceType];
    return state.data.basis.references.length === 1 &&
      state.data.basis.references[0].type === expectedType &&
      state.data.basis.references[0].id === source.reference.recordId &&
      state.data.basis.references[0].revision === source.reference.revision;
  },

  validMoveStateDerivation(context) {
    const moveSlot = context.authoritative.candidateMove;
    const stateSlot = context.derived.moveState;
    if (moveSlot.status !== "available") return true;
    const move = moveSlot.facts[0];
    if (move.data.status === "withdrawn") {
      return stateSlot.status === "not-applicable" && stateSlot.reason === "candidate-move-withdrawn";
    }
    if (stateSlot.status === "unavailable") return true;
    if (stateSlot.status !== "available") return false;

    const state = stateSlot.facts[0];
    const holdSlot = context.authoritative.hold;
    if (!["available", "absent", "unavailable"].includes(holdSlot.status)) return false;
    if (holdSlot.status === "unavailable") return false;
    const dependencySlot = context.authoritative.dependency;
    if (!["available", "absent", "unavailable"].includes(dependencySlot.status)) return false;
    if (dependencySlot.status === "unavailable") return false;

    const hold = this.availableFact(holdSlot);
    if (hold && hold.data.status === "active") {
      return state.data.state === "hold" && this.sameMoveStateBasis(holdSlot, state, "hold");
    }
    const dependency = this.availableFact(dependencySlot);
    if (dependency && dependency.data.status === "unresolved") {
      return state.data.state === "waiting" && this.sameMoveStateBasis(dependencySlot, state, "dependency");
    }

    const availabilitySlot = context.authoritative.availability;
    if (!["available", "absent", "unavailable"].includes(availabilitySlot.status)) return false;
    if (availabilitySlot.status === "unavailable") return false;
    const availability = this.availableFact(availabilitySlot);
    if (availability && availability.data.status === "confirmed" && availability.data.isCurrent === true) {
      return state.data.state === "actionable" && this.sameMoveStateBasis(availabilitySlot, state, "availability");
    }
    return state.data.state === "clarify" && state.data.basis.kind === "insufficient-operating-truth" &&
      state.data.basis.references.length === 0;
  },

  validateResponse(response, request, context) {
    if (!this.hasExactKeys(response, ["schemaVersion", "type", "requestType", "status", "authority", "explanation", "uncertainties", "citations", "proposal"]) ||
        response.schemaVersion !== 1 || response.type !== "ai-response" || response.requestType !== request.requestType ||
        response.status !== "available" || response.authority !== "non-authoritative-ai-output" ||
        !this.text(response.explanation, this.MAX_EXPLANATION_LENGTH) || !Array.isArray(response.uncertainties) ||
        !Array.isArray(response.citations) || response.proposal !== null) return false;
    if (!response.uncertainties.every((entry) => this.validateUncertainty(entry, context))) return false;
    const references = this.suppliedReferences(context); const accepted = [];
    for (const citation of response.citations) {
      if (!this.validateCitation(citation, references) || accepted.some((existing) => this.same(existing, citation))) return false;
      accepted.push(citation);
    }
    return true;
  },

  classifyInvalidResponse(value) {
    if (value === null || value === undefined || (typeof value === "string" && value.trim() === "")) return "provider-empty-response";
    if (this.isObject(value) && Object.hasOwn(value, "schemaVersion") && value.schemaVersion !== 1) return "provider-unsupported-schema";
    return "provider-invalid-response";
  },

  async invoke({ request, context, provider } = {}) {
    if (typeof OperatingContextAssembler === "undefined" ||
        typeof OperatingContextAssembler.validateRequest !== "function" ||
        typeof OperatingContextAssembler.validateContext !== "function") {
      throw new Error("Operating Context validation is unavailable.");
    }
    if (!OperatingContextAssembler.validateRequest(request)) throw new TypeError("AI request is invalid.");
    if (!OperatingContextAssembler.validateContext(context) || !this.validActionSnapshots(context) ||
        !this.validMoveStateDerivation(context) || context.requestType !== request.requestType || context.asOf !== request.asOf) {
      throw new TypeError("Operating Context is invalid.");
    }
    if (context.status === "unavailable") return this.failure(request.requestType, "context-unavailable");
    if (!provider || typeof provider.invoke !== "function") return this.failure(request.requestType, "provider-unavailable");

    const detachedContext = this.clone(context);
    const providerRequest = this.clone({
      schemaVersion: 1, type: "ai-provider-request", requestType: request.requestType,
      asOf: request.asOf, context: detachedContext,
    });
    let output;
    try {
      output = await provider.invoke(providerRequest);
    } catch (error) {
      if (this.knownProviderError(error)) return this.failure(request.requestType, error.code);
      throw error;
    }
    let detached;
    try {
      detached = this.clone(output);
    } catch (error) {
      return this.failure(request.requestType, "provider-invalid-response");
    }
    if (!this.same(output, detached)) return this.failure(request.requestType, "provider-invalid-response");
    if (!this.validateResponse(detached, request, detachedContext)) {
      return this.failure(request.requestType, this.classifyInvalidResponse(detached));
    }
    return this.success(request.requestType, detached);
  },
};