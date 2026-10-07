// =====================================================
// FOUNDEROS
// BROWSER AI HTTP PROVIDER
// Fixed same-origin transport only. No vendor or credential knowledge.
// =====================================================

const FounderOSAiHttpProvider = {
  ENDPOINT: "/api/ai/v1/invoke",
  MAX_REQUEST_BYTES: 131072,
  TIMEOUT_MS: 30000,
  ERROR_CODES: ["provider-unavailable", "provider-timeout", "provider-refusal", "context-too-large"],

  providerError(code) {
    return { name: "FounderOSAiProviderError", code };
  },

  create(dependencies = {}) {
    const fetchImpl = dependencies.fetchImpl || globalThis.fetch;
    const setTimer = dependencies.setTimer || globalThis.setTimeout;
    const clearTimer = dependencies.clearTimer || globalThis.clearTimeout;
    const callerSignal = dependencies.signal || null;
    return {
      invoke: async (providerRequest) => {
        let body;
        try { body = JSON.stringify(providerRequest); } catch (error) { throw new TypeError("AI provider request is not serializable."); }
        if (new TextEncoder().encode(body).length > FounderOSAiHttpProvider.MAX_REQUEST_BYTES) {
          throw FounderOSAiHttpProvider.providerError("context-too-large");
        }
        if (typeof fetchImpl !== "function") throw FounderOSAiHttpProvider.providerError("provider-unavailable");
        if (callerSignal && callerSignal.aborted) throw FounderOSAiHttpProvider.providerError("canceled");

        const controller = new AbortController();
        let abortCause = null;
        const abort = (cause) => {
          if (abortCause !== null) return;
          abortCause = cause;
          controller.abort();
        };
        const cancel = () => abort("canceled");
        if (callerSignal) callerSignal.addEventListener("abort", cancel, { once: true });
        const timer = setTimer(() => abort("provider-timeout"), FounderOSAiHttpProvider.TIMEOUT_MS);
        try {
          const response = await fetchImpl(FounderOSAiHttpProvider.ENDPOINT, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body,
            signal: controller.signal,
          });
          let payload;
          try { payload = await response.json(); } catch (error) { throw FounderOSAiHttpProvider.providerError("provider-unavailable"); }
          if (response.ok) return payload;
          const keys = payload && typeof payload === "object" && !Array.isArray(payload) ? Object.keys(payload) : [];
          if (keys.length !== 3 || !keys.every((key) => ["schemaVersion", "type", "code"].includes(key)) ||
              payload.schemaVersion !== 1 || payload.type !== "ai-provider-error" ||
              !FounderOSAiHttpProvider.ERROR_CODES.includes(payload.code)) {
            throw FounderOSAiHttpProvider.providerError("provider-unavailable");
          }
          throw FounderOSAiHttpProvider.providerError(payload.code);
        } catch (error) {
          if (abortCause !== null) throw FounderOSAiHttpProvider.providerError(abortCause);
          if (error && error.name === "FounderOSAiProviderError") throw error;
          throw FounderOSAiHttpProvider.providerError("provider-unavailable");
        } finally {
          clearTimer(timer);
          if (callerSignal) callerSignal.removeEventListener("abort", cancel);
        }
      },
    };
  },
};