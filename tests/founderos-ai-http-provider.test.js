const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { root, clone, providerRequest, candidate } = require("./ai-2-fixture");

const source = fs.readFileSync(path.join(root, "js", "ai", "founderos-ai-http-provider.js"), "utf8");
function api() { const runtime = vm.createContext({ TextEncoder, AbortController, globalThis: {} }); vm.runInContext(source, runtime); return vm.runInContext("FounderOSAiHttpProvider", runtime); }
function response(ok, payload) { return { ok, async json() { return clone(payload); } }; }

test("browser provider posts the unchanged request once to the fixed relative endpoint", async () => {
  const contract = providerRequest(); const output = candidate(contract); const calls = [];
  const provider = api().create({ fetchImpl: async (...args) => { calls.push(args); return response(true, output); }, setTimer() { return 1; }, clearTimer() {} });
  assert.deepEqual(clone(await provider.invoke(contract)), output); assert.equal(calls.length, 1); assert.equal(calls[0][0], "/api/ai/v1/invoke");
  assert.equal(calls[0][1].method, "POST"); assert.deepEqual(clone(calls[0][1].headers), { "Content-Type": "application/json" }); assert.deepEqual(JSON.parse(calls[0][1].body), contract);
  assert.deepEqual(Object.keys(JSON.parse(calls[0][1].body)), ["schemaVersion", "type", "requestType", "asOf", "context"]);
});

test("browser provider enforces the UTF-8 body ceiling before fetch with no retry", async () => {
  let calls = 0; const oversized = providerRequest(); oversized.context.padding = "é".repeat(70000);
  const provider = api().create({ fetchImpl: async () => { calls += 1; }, setTimer() { return 1; }, clearTimer() {} });
  await assert.rejects(() => provider.invoke(oversized), (error) => error.code === "context-too-large"); assert.equal(calls, 0);
});

test("browser provider maps timeout, captured cancellation, and network failure without retry", async () => {
  const contract = providerRequest();
  let timeoutCalls = 0; const timeout = api().create({ fetchImpl: async (url, options) => { timeoutCalls += 1; return new Promise((resolve, reject) => options.signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true })); }, setTimer(callback) { queueMicrotask(callback); return 1; }, clearTimer() {} });
  await assert.rejects(() => timeout.invoke(contract), (error) => error.code === "provider-timeout"); assert.equal(timeoutCalls, 1);
  const controller = new AbortController(); let cancelCalls = 0; const canceled = api().create({ signal: controller.signal, fetchImpl: async (url, options) => { cancelCalls += 1; return new Promise((resolve, reject) => { options.signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true }); queueMicrotask(() => controller.abort()); }); }, setTimer() { return 1; }, clearTimer() {} });
  await assert.rejects(() => canceled.invoke(contract), (error) => error.code === "canceled"); assert.equal(cancelCalls, 1);
  let networkCalls = 0; const network = api().create({ fetchImpl: async () => { networkCalls += 1; throw new Error("private network detail"); }, setTimer() { return 1; }, clearTimer() {} });
  await assert.rejects(() => network.invoke(contract), (error) => error.code === "provider-unavailable" && !JSON.stringify(error).includes("private")); assert.equal(networkCalls, 1);
});

test("browser provider preserves the first abort cause across delayed fetch rejection", async () => {
  const contract = providerRequest();
  async function race(first) {
    const controller = new AbortController(); let deadline; let rejectFetch; let calls = 0;
    const provider = api().create({ signal: controller.signal,
      fetchImpl: async () => { calls += 1; return new Promise((resolve, reject) => { rejectFetch = reject; }); },
      setTimer(callback) { deadline = callback; return 1; }, clearTimer() {} });
    const pending = provider.invoke(contract);
    if (first === "caller") { controller.abort(); deadline(); } else { deadline(); controller.abort(); }
    rejectFetch(new Error("delayed abort rejection"));
    await assert.rejects(() => pending, (error) => error.code === (first === "caller" ? "canceled" : "provider-timeout"));
    assert.equal(calls, 1);
  }
  await race("caller"); await race("deadline");
});

test("browser provider accepts only exact bounded server errors and has no destination or credential API", async () => {
  for (const code of ["provider-unavailable", "provider-timeout", "provider-refusal", "context-too-large"]) {
    const provider = api().create({ fetchImpl: async () => response(false, { schemaVersion: 1, type: "ai-provider-error", code }), setTimer() { return 1; }, clearTimer() {} });
    await assert.rejects(() => provider.invoke(providerRequest()), (error) => error.code === code);
  }
  for (const payload of [{}, { schemaVersion: 1, type: "ai-provider-error", code: "canceled" }, { schemaVersion: 1, type: "ai-provider-error", code: "provider-timeout", detail: "secret" }]) {
    const provider = api().create({ endpoint: "https://attacker.invalid", apiKey: "secret", model: "override", fetchImpl: async (url) => { assert.equal(url, "/api/ai/v1/invoke"); return response(false, payload); }, setTimer() { return 1; }, clearTimer() {} });
    await assert.rejects(() => provider.invoke(providerRequest()), (error) => error.code === "provider-unavailable");
  }
  assert.doesNotMatch(source, /Authorization|Bearer|OPENAI|apiKey|model\s*:/i);
});