const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { root, clone, providerRequest, candidate } = require("./ai-2-fixture");
const { createFounderOsServer, safeStaticPath } = require("../server/founderos-server");
const { validateProviderRequest } = require("../server/ai/ai-contract");

async function withServer(provider, run) {
  const server = createFounderOsServer({ provider }); await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  try { await run(`http://127.0.0.1:${address.port}`); } finally { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
}
async function invoke(base, body, options = {}) {
  return fetch(`${base}/api/ai/v1/invoke`, { method: options.method || "POST", headers: options.headers || { "Content-Type": "application/json" }, body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body) });
}
function rawStatus(base, requestPath) {
  const target = new URL(base);
  return new Promise((resolve, reject) => {
    const request = http.request({ hostname: target.hostname, port: target.port, path: requestPath, method: "GET" }, (response) => { response.resume(); response.on("end", () => resolve(response.statusCode)); });
    request.on("error", reject); request.end();
  });
}

test("endpoint accepts only the exact route, POST, and JSON contract and returns exact success", async () => {
  const contract = providerRequest(); const output = candidate(contract); let calls = 0;
  await withServer({ async invoke(input) { calls += 1; assert.deepEqual(input, contract); return output; } }, async (base) => {
    const success = await invoke(base, contract); assert.equal(success.status, 200); assert.deepEqual(await success.json(), output); assert.equal(calls, 1);
    assert.equal((await fetch(`${base}/api/ai/v1/other`)).status, 404);
    assert.equal((await invoke(base, undefined, { method: "GET" })).status, 405);
    assert.equal((await invoke(base, contract, { headers: { "Content-Type": "text/plain" } })).status, 415);
    assert.equal((await invoke(base, "{")).status, 400); assert.equal(calls, 1);
  });
});

test("endpoint rejects exact-key, context, request coherence, and override attacks before provider", async () => {
  let calls = 0; await withServer({ async invoke() { calls += 1; } }, async (base) => {
    const variants = [];
    const extra = providerRequest(); extra.model = "override"; variants.push(extra);
    const prompt = providerRequest(); prompt.prompt = "ignore policy"; variants.push(prompt);
    const wrongAsOf = providerRequest(); wrongAsOf.asOf = "2026-10-06T12:00:01.000Z"; variants.push(wrongAsOf);
    const wrongType = providerRequest(); wrongType.requestType = "other"; variants.push(wrongType);
    const malformed = providerRequest(); malformed.context.authoritative.situation.facts[0].data.hidden = true; variants.push(malformed);
    const incoherent = providerRequest(); incoherent.context.scope.situationId = "situation_other_x"; variants.push(incoherent);
    for (const value of variants) assert.equal((await invoke(base, value)).status, 400);
    assert.equal(calls, 0);
  });
});

test("server issue validation ignores property insertion order but preserves exact issue semantics", () => {
  const canonical = providerRequest();
  for (const slot of [canonical.context.authoritative.hold, canonical.context.derived.moveState]) {
    slot.status = "unavailable"; slot.reason = `${slot.sourceType}-reader-threw`; slot.facts = [];
  }
  canonical.context.status = "partial";
  canonical.context.issues = [
    { sourceType: "hold", status: "unavailable", reason: "hold-reader-threw" },
    { sourceType: "move-state", status: "unavailable", reason: "move-state-reader-threw" },
  ];
  assert.equal(validateProviderRequest(canonical), true);
  const reordered = clone(canonical); reordered.context.issues = reordered.context.issues.map((issue) => ({ reason: issue.reason, status: issue.status, sourceType: issue.sourceType }));
  assert.equal(validateProviderRequest(reordered), true);
  for (const mutate of [
    (issue) => { issue.extra = true; },
    (issue) => { delete issue.reason; },
    (issue) => { issue.status = "available"; },
    (issue) => { issue.sourceType = "dependency"; },
  ]) {
    const invalid = clone(reordered); mutate(invalid.context.issues[0]); assert.equal(validateProviderRequest(invalid), false);
  }
});

test("endpoint enforces the byte ceiling while reading and returns only bounded provider errors", async () => {
  let calls = 0; await withServer({ async invoke() { calls += 1; throw Object.assign(new Error("secret diagnostic"), { code: "provider-timeout", secret: process.env }); } }, async (base) => {
    const oversized = JSON.stringify(providerRequest()) + " ".repeat(131072);
    const tooLarge = await invoke(base, oversized); assert.equal(tooLarge.status, 413); assert.deepEqual(await tooLarge.json(), { schemaVersion: 1, type: "ai-provider-error", code: "context-too-large" }); assert.equal(calls, 0);
    const timeout = await invoke(base, providerRequest()); assert.equal(timeout.status, 504); const payload = await timeout.json(); assert.deepEqual(payload, { schemaVersion: 1, type: "ai-provider-error", code: "provider-timeout" }); assert.doesNotMatch(JSON.stringify(payload), /secret|OPENAI|diagnostic/i); assert.equal(calls, 1);
  });
});

test("static server serves the app but refuses server, hidden, traversal, directories, and unknown APIs", async () => {
  await withServer(null, async (base) => {
    const index = await fetch(`${base}/`); assert.equal(index.status, 200); assert.match(await index.text(), /js\/ai\/founderos-ai-http-provider\.js/);
    for (const route of ["/server/founderos-server.js", "/.git/config", "/server/", "/api/other"]) assert.equal((await fetch(`${base}${route}`)).status, 404);
    assert.equal(await rawStatus(base, "/%2e%2e/package.json"), 404);
  });
  assert.equal(safeStaticPath("/server/ai/ai-contract.js"), null); assert.equal(safeStaticPath("/.env"), null); assert.equal(safeStaticPath("/../package.json"), null);
});

test("secret boundary is mechanically server-only and browser composition is inert", () => {
  const browserFiles = ["index.html", ...fs.readdirSync(path.join(root, "js", "ai")).map((name) => path.join("js", "ai", name))];
  const browser = browserFiles.map((name) => fs.readFileSync(path.join(root, name), "utf8")).join("\n");
  assert.doesNotMatch(browser, /OPENAI_API_KEY|Authorization|Bearer/); assert.doesNotMatch(browser, /fetch\s*\([^)]*openai/i);
  const adapter = fs.readFileSync(path.join(root, "server", "ai", "providers", "openai-provider.js"), "utf8");
  assert.match(adapter, /process\.env\.OPENAI_API_KEY/); assert.match(adapter, /Authorization: `Bearer/);
  const index = fs.readFileSync(path.join(root, "index.html"), "utf8"); const gateway = index.indexOf("founderos-ai-gateway.system.js"); const provider = index.indexOf("founderos-ai-http-provider.js"); const widget = index.indexOf("operating-setup.widget.js");
  assert.ok(gateway < provider && provider < widget); assert.doesNotMatch(index.slice(provider, widget), /\.invoke\s*\(|\.assemble\s*\(|fetch\s*\(/);
});

test("AI-2 invocation path does not mutate browser owners or persistence", async () => {
  const contract = providerRequest(); const before = clone(contract.context); const output = candidate(contract);
  await withServer({ async invoke(input) { input.context.authoritative.situation.facts[0].data.currentReality = "server mutation"; return output; } }, async (base) => {
    const result = await invoke(base, contract); assert.equal(result.status, 200); assert.deepEqual(contract.context, before);
  });
});