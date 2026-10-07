"use strict";

const { MAX_REQUEST_BYTES, validateProviderRequest, errorEnvelope } = require("./ai-contract");

function writeJson(response, statusCode, value) {
  const body = JSON.stringify(value);
  response.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8", "Content-Length": Buffer.byteLength(body), "Cache-Control": "no-store" });
  response.end(body);
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = []; let bytes = 0; let settled = false;
    request.on("data", (chunk) => {
      if (settled) return;
      bytes += chunk.length;
      if (bytes > MAX_REQUEST_BYTES) { settled = true; reject(Object.assign(new Error("too-large"), { code: "context-too-large" })); request.resume(); return; }
      chunks.push(chunk);
    });
    request.on("end", () => {
      if (settled) return;
      try { settled = true; resolve(JSON.parse(Buffer.concat(chunks).toString("utf8"))); } catch (error) { settled = true; reject(new Error("invalid-json")); }
    });
    request.on("error", () => { if (!settled) { settled = true; reject(new Error("request-error")); } });
  });
}

function createAiEndpoint({ provider }) {
  return async function handleAiEndpoint(request, response) {
    if (request.method !== "POST") { response.writeHead(405, { Allow: "POST", "Cache-Control": "no-store" }); response.end(); return; }
    const contentType = request.headers["content-type"] || "";
    if (!/^application\/json(?:\s*;|$)/i.test(contentType)) { response.writeHead(415, { "Cache-Control": "no-store" }); response.end(); return; }
    let providerRequest;
    try { providerRequest = await readJsonBody(request); } catch (error) {
      if (error && error.code === "context-too-large") writeJson(response, 413, errorEnvelope("context-too-large"));
      else { response.writeHead(400, { "Cache-Control": "no-store" }); response.end(); }
      return;
    }
    if (!validateProviderRequest(providerRequest)) { response.writeHead(400, { "Cache-Control": "no-store" }); response.end(); return; }
    if (!provider || typeof provider.invoke !== "function") { writeJson(response, 503, errorEnvelope("provider-unavailable")); return; }
    const controller = new AbortController();
    const abort = () => controller.abort(); request.once("aborted", abort); response.once("close", abort);
    try {
      const candidate = await provider.invoke(providerRequest, { signal: controller.signal });
      writeJson(response, 200, candidate);
    } catch (error) {
      const code = error && ["provider-unavailable", "provider-timeout", "provider-refusal", "context-too-large"].includes(error.code) ? error.code : "provider-unavailable";
      const status = code === "provider-timeout" ? 504 : code === "provider-refusal" ? 422 : code === "context-too-large" ? 413 : 503;
      if (!response.writableEnded) writeJson(response, status, errorEnvelope(code));
    } finally {
      request.removeListener("aborted", abort); response.removeListener("close", abort);
    }
  };
}

module.exports = { createAiEndpoint, readJsonBody, writeJson };