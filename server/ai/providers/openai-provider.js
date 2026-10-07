"use strict";

const { buildSituationExplanationPrompt } = require("../ai-prompt");

const OPENAI_ENDPOINT = "https://api.openai.com/v1/responses";
const DEFAULT_MODEL = "gpt-6-luna";
const UPSTREAM_TIMEOUT_MS = 25000;
const MAX_VENDOR_RESPONSE_BYTES = 262144;

function failure(code) { const error = new Error("AI provider operation failed."); error.name = "FounderOSServerAiProviderError"; error.code = code; return error; }
async function readBoundedBody(response) {
  if (!response || !response.body || typeof response.body.getReader !== "function") throw failure("provider-unavailable");
  const reader = response.body.getReader(); const chunks = []; let bytes = 0;
  try {
    while (true) {
      const item = await reader.read();
      if (item.done) break;
      if (!(item.value instanceof Uint8Array)) throw failure("provider-unavailable");
      bytes += item.value.byteLength;
      if (bytes > MAX_VENDOR_RESPONSE_BYTES) {
        try { await reader.cancel(); } catch (error) {}
        throw failure("provider-unavailable");
      }
      chunks.push(Buffer.from(item.value.buffer, item.value.byteOffset, item.value.byteLength));
    }
    return Buffer.concat(chunks, bytes).toString("utf8");
  } finally {
    if (typeof reader.releaseLock === "function") reader.releaseLock();
  }
}
function responseSchema() {
  const relationship = { type: "object", additionalProperties: false, properties: { situationId: { type: ["string", "null"] }, situationRevision: { type: ["integer", "null"] }, candidateMoveId: { type: ["string", "null"] }, candidateMoveRevision: { type: ["integer", "null"] } }, required: ["situationId", "situationRevision", "candidateMoveId", "candidateMoveRevision"] };
  const reference = { type: "object", additionalProperties: false, properties: { authority: { type: "string", enum: ["authoritative-operating-truth", "derived-operating-state"] }, sourceType: { type: "string", enum: ["situation", "candidate-move", "hold", "dependency", "availability", "commitment", "routine", "move-state"] }, recordId: { type: ["string", "null"] }, revision: { type: ["integer", "null"] }, status: { type: "string" }, recordedAt: { type: ["string", "null"] }, relationships: relationship }, required: ["authority", "sourceType", "recordId", "revision", "status", "recordedAt", "relationships"] };
  return { type: "object", additionalProperties: false, properties: {
    schemaVersion: { type: "integer", enum: [1] }, type: { type: "string", enum: ["ai-response"] }, requestType: { type: "string", enum: ["situation-explanation"] }, status: { type: "string", enum: ["available"] }, authority: { type: "string", enum: ["non-authoritative-ai-output"] }, explanation: { type: "string", minLength: 1, maxLength: 4000 },
    uncertainties: { type: "array", items: { type: "object", additionalProperties: false, properties: { kind: { type: "string", enum: ["source-absent", "source-unavailable", "relationship-not-witnessed", "unsupported-conclusion"] }, sourceType: { type: ["string", "null"] }, detail: { type: "string", minLength: 1, maxLength: 500 } }, required: ["kind", "sourceType", "detail"] } },
    citations: { type: "array", items: reference }, proposal: { type: "null" },
  }, required: ["schemaVersion", "type", "requestType", "status", "authority", "explanation", "uncertainties", "citations", "proposal"] };
}
function createOpenAiProvider({ fetchImpl = globalThis.fetch, apiKey = process.env.OPENAI_API_KEY, model = DEFAULT_MODEL, setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  return {
    async invoke(providerRequest, { signal } = {}) {
      if (typeof apiKey !== "string" || apiKey.length === 0 || typeof fetchImpl !== "function") throw failure("provider-unavailable");
      if (signal && signal.aborted) throw failure("provider-unavailable");
      const prompt = buildSituationExplanationPrompt(providerRequest);
      const controller = new AbortController(); let timedOut = false;
      const abort = () => controller.abort();
      if (signal) { signal.addEventListener("abort", abort, { once: true }); if (signal.aborted) controller.abort(); }
      let timer = null;
      try {
        if (controller.signal.aborted) throw failure("provider-unavailable");
        timer = setTimer(() => { timedOut = true; controller.abort(); }, UPSTREAM_TIMEOUT_MS);
        const response = await fetchImpl(OPENAI_ENDPOINT, { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, signal: controller.signal, body: JSON.stringify({ model, instructions: prompt.instructions, input: prompt.input, text: { format: { type: "json_schema", name: "founderos_ai_response_v1", description: "FounderOS non-authoritative situation explanation response", schema: responseSchema(), strict: true } } }) });
        if (!response.ok) throw failure("provider-unavailable");
        const raw = await readBoundedBody(response);
        let envelope; try { envelope = JSON.parse(raw); } catch (error) { return {}; }
        const content = Array.isArray(envelope.output) ? envelope.output.flatMap((item) => item && item.type === "message" && Array.isArray(item.content) ? item.content : []) : [];
        if (content.some((item) => item && item.type === "refusal")) throw failure("provider-refusal");
        const outputs = content.filter((item) => item && item.type === "output_text" && typeof item.text === "string").map((item) => item.text);
        if (outputs.length === 0 || outputs.join("").trim() === "") return null;
        try { return JSON.parse(outputs.join("")); } catch (error) { return {}; }
      } catch (error) {
        if (timedOut) throw failure("provider-timeout");
        if (error && error.name === "FounderOSServerAiProviderError") throw error;
        throw failure("provider-unavailable");
      } finally {
        if (timer !== null) clearTimer(timer); if (signal) signal.removeEventListener("abort", abort);
      }
    },
  };
}

module.exports = { OPENAI_ENDPOINT, DEFAULT_MODEL, UPSTREAM_TIMEOUT_MS, MAX_VENDOR_RESPONSE_BYTES, readBoundedBody, responseSchema, createOpenAiProvider };