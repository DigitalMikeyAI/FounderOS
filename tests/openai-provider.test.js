const test = require("node:test");
const assert = require("node:assert/strict");
const { providerRequest, candidate } = require("./ai-2-fixture");
const { OPENAI_ENDPOINT, DEFAULT_MODEL, UPSTREAM_TIMEOUT_MS, MAX_VENDOR_RESPONSE_BYTES, createOpenAiProvider } = require("../server/ai/providers/openai-provider");

function stream(chunks, counters = {}) {
  let index = 0;
  return new ReadableStream({
    pull(controller) {
      if (index >= chunks.length) { controller.close(); return; }
      counters.reads = (counters.reads || 0) + 1; controller.enqueue(chunks[index]); index += 1;
    },
    cancel() { counters.canceled = (counters.canceled || 0) + 1; },
  }, { highWaterMark: 0 });
}
function vendor(payload, ok = true, status = 200) {
  const text = typeof payload === "string" ? payload : JSON.stringify(payload);
  return { ok, status, body: stream([new TextEncoder().encode(text)]) };
}
function success(value) { return { output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(value) }] }] }; }

test("OpenAI adapter uses the verified fixed Responses API structured-output contract once", async () => {
  const request = providerRequest(); const expected = candidate(request); const calls = [];
  const provider = createOpenAiProvider({ apiKey: "server-secret", fetchImpl: async (...args) => { calls.push(args); return vendor(success(expected)); }, setTimer() { return 1; }, clearTimer() {} });
  assert.deepEqual(await provider.invoke(request), expected); assert.equal(calls.length, 1); assert.equal(calls[0][0], OPENAI_ENDPOINT); assert.equal(OPENAI_ENDPOINT, "https://api.openai.com/v1/responses");
  const options = calls[0][1]; const body = JSON.parse(options.body);
  assert.equal(options.method, "POST"); assert.equal(options.headers.Authorization, "Bearer server-secret"); assert.equal(body.model, DEFAULT_MODEL); assert.equal(DEFAULT_MODEL, "gpt-6-luna");
  assert.equal(body.text.format.type, "json_schema"); assert.equal(body.text.format.name, "founderos_ai_response_v1"); assert.equal(body.text.format.strict, true); assert.equal(body.text.format.schema.additionalProperties, false);
  assert.equal(Object.hasOwn(body, "tools"), false); assert.equal(JSON.stringify(body).includes("provider"), false);
});

test("OpenAI adapter normalizes valid, refusal, empty, malformed, and unsupported candidate output", async () => {
  const request = providerRequest(); const expected = candidate(request);
  assert.deepEqual(await createOpenAiProvider({ apiKey: "x", fetchImpl: async () => vendor(success(expected)), setTimer() { return 1; }, clearTimer() {} }).invoke(request), expected);
  await assert.rejects(() => createOpenAiProvider({ apiKey: "x", fetchImpl: async () => vendor({ output: [{ type: "message", content: [{ type: "refusal", refusal: "no" }] }] }), setTimer() { return 1; }, clearTimer() {} }).invoke(request), (error) => error.code === "provider-refusal");
  assert.equal(await createOpenAiProvider({ apiKey: "x", fetchImpl: async () => vendor({ output: [] }), setTimer() { return 1; }, clearTimer() {} }).invoke(request), null);
  assert.deepEqual(await createOpenAiProvider({ apiKey: "x", fetchImpl: async () => vendor({ output: [{ type: "message", content: [{ type: "output_text", text: "{" }] }] }), setTimer() { return 1; }, clearTimer() {} }).invoke(request), {});
  const unsupported = { ...expected, schemaVersion: 2 }; assert.deepEqual(await createOpenAiProvider({ apiKey: "x", fetchImpl: async () => vendor(success(unsupported)), setTimer() { return 1; }, clearTimer() {} }).invoke(request), unsupported);
});

test("OpenAI adapter maps HTTP failures, missing credential, timeout, abort, and oversize without retry or leaks", async () => {
  for (const status of [400, 401, 429, 500, 503]) {
    let calls = 0; const provider = createOpenAiProvider({ apiKey: "server-secret", fetchImpl: async () => { calls += 1; return vendor({ private: "vendor detail" }, false, status); }, setTimer() { return 1; }, clearTimer() {} });
    await assert.rejects(() => provider.invoke(providerRequest()), (error) => error.code === "provider-unavailable" && !error.message.includes("vendor")); assert.equal(calls, 1);
  }
  let missingCalls = 0; await assert.rejects(() => createOpenAiProvider({ apiKey: "", fetchImpl: async () => { missingCalls += 1; } }).invoke(providerRequest()), (error) => error.code === "provider-unavailable"); assert.equal(missingCalls, 0);
  let timeoutCalls = 0; const timeout = createOpenAiProvider({ apiKey: "x", fetchImpl: async (url, options) => { timeoutCalls += 1; return new Promise((resolve, reject) => options.signal.addEventListener("abort", () => reject(new Error("abort")), { once: true })); }, setTimer(callback, delay) { assert.equal(delay, UPSTREAM_TIMEOUT_MS); queueMicrotask(callback); return 1; }, clearTimer() {} });
  await assert.rejects(() => timeout.invoke(providerRequest()), (error) => error.code === "provider-timeout"); assert.equal(timeoutCalls, 1);
  const controller = new AbortController(); let abortCalls = 0; const aborted = createOpenAiProvider({ apiKey: "x", fetchImpl: async (url, options) => { abortCalls += 1; return new Promise((resolve, reject) => { options.signal.addEventListener("abort", () => reject(new Error("abort")), { once: true }); queueMicrotask(() => controller.abort()); }); }, setTimer() { return 1; }, clearTimer() {} });
  await assert.rejects(() => aborted.invoke(providerRequest(), { signal: controller.signal }), (error) => error.code === "provider-unavailable"); assert.equal(abortCalls, 1);
});

test("OpenAI adapter starts no request for pre-aborted or registration-race cancellation", async () => {
  const controller = new AbortController(); controller.abort(); let preAbortedCalls = 0;
  const preAborted = createOpenAiProvider({ apiKey: "x", fetchImpl: async () => { preAbortedCalls += 1; }, setTimer() { return 1; }, clearTimer() {} });
  await assert.rejects(() => preAborted.invoke(providerRequest(), { signal: controller.signal }), (error) => error.code === "provider-unavailable"); assert.equal(preAbortedCalls, 0);

  let raceAborted = false; let raceCalls = 0;
  const raceSignal = { get aborted() { return raceAborted; }, addEventListener() { raceAborted = true; }, removeEventListener() {} };
  const raced = createOpenAiProvider({ apiKey: "x", fetchImpl: async () => { raceCalls += 1; }, setTimer() { return 1; }, clearTimer() {} });
  await assert.rejects(() => raced.invoke(providerRequest(), { signal: raceSignal }), (error) => error.code === "provider-unavailable"); assert.equal(raceCalls, 0);
});

test("OpenAI adapter reads vendor responses incrementally with an exact UTF-8 byte ceiling", async () => {
  const request = providerRequest(); const expected = candidate(request); const encoded = new TextEncoder();
  const valid = JSON.stringify(success(expected)); const split = Math.floor(valid.length / 2); const validCounters = {};
  const validProvider = createOpenAiProvider({ apiKey: "x", fetchImpl: async () => ({ ok: true, body: stream([encoded.encode(valid.slice(0, split)), encoded.encode(valid.slice(split))], validCounters) }), setTimer() { return 1; }, clearTimer() {} });
  assert.deepEqual(await validProvider.invoke(request), expected); assert.equal(validCounters.reads, 2);

  const exact = valid + " ".repeat(MAX_VENDOR_RESPONSE_BYTES - Buffer.byteLength(valid)); const exactCounters = {};
  const exactProvider = createOpenAiProvider({ apiKey: "x", fetchImpl: async () => ({ ok: true, body: stream([encoded.encode(exact)], exactCounters) }), setTimer() { return 1; }, clearTimer() {} });
  assert.deepEqual(await exactProvider.invoke(request), expected); assert.equal(exactCounters.reads, 1); assert.equal(exactCounters.canceled || 0, 0);

  const overCounters = {}; const oversizedChunks = [new Uint8Array(MAX_VENDOR_RESPONSE_BYTES), new Uint8Array([1]), new Uint8Array([2])];
  const oversized = createOpenAiProvider({ apiKey: "x", fetchImpl: async () => ({ ok: true, body: stream(oversizedChunks, overCounters) }), setTimer() { return 1; }, clearTimer() {} });
  await assert.rejects(() => oversized.invoke(request), (error) => error.code === "provider-unavailable");
  assert.equal(overCounters.reads, 2); assert.equal(overCounters.canceled, 1);

  const unicodeEnvelope = JSON.stringify(success({ ...expected, explanation: "Café 😀" })); const unicodeBytes = encoded.encode(unicodeEnvelope); const unicodeCounters = {};
  const unicodeProvider = createOpenAiProvider({ apiKey: "x", fetchImpl: async () => ({ ok: true, body: stream([unicodeBytes.slice(0, unicodeBytes.length - 3), unicodeBytes.slice(unicodeBytes.length - 3)], unicodeCounters) }), setTimer() { return 1; }, clearTimer() {} });
  assert.equal((await unicodeProvider.invoke(request)).explanation, "Café 😀"); assert.equal(unicodeCounters.reads, 2);
});