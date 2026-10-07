"use strict";

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { createAiEndpoint } = require("./ai/ai-endpoint");
const { createOpenAiProvider } = require("./ai/providers/openai-provider");

const STATIC_ROOT = path.resolve(__dirname, "..");
const HOST = process.env.FOUNDEROS_HOST || "127.0.0.1";
const PORT = Number(process.env.FOUNDEROS_PORT || 5502);
const CONTENT_TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".ico": "image/x-icon", ".woff": "font/woff", ".woff2": "font/woff2" };

function safeStaticPath(pathname) {
  let decoded;
  try { decoded = decodeURIComponent(pathname); } catch (error) { return null; }
  if (decoded.includes("\0") || decoded.includes("\\")) return null;
  const segments = decoded.split("/").filter(Boolean);
  if (segments.some((segment) => segment === ".." || segment.startsWith(".")) || segments[0] === "server") return null;
  const relative = segments.length === 0 ? "index.html" : segments.join(path.sep);
  const candidate = path.resolve(STATIC_ROOT, relative);
  return candidate === STATIC_ROOT || candidate.startsWith(`${STATIC_ROOT}${path.sep}`) ? candidate : null;
}

function serveStatic(request, response, pathname) {
  if (!["GET", "HEAD"].includes(request.method)) { response.writeHead(405, { Allow: "GET, HEAD" }); response.end(); return; }
  const file = safeStaticPath(pathname);
  if (!file) { response.writeHead(404); response.end(); return; }
  fs.stat(file, (statError, stat) => {
    if (statError || !stat.isFile()) { response.writeHead(404); response.end(); return; }
    response.writeHead(200, { "Content-Type": CONTENT_TYPES[path.extname(file).toLowerCase()] || "application/octet-stream", "Content-Length": stat.size, "X-Content-Type-Options": "nosniff" });
    if (request.method === "HEAD") { response.end(); return; }
    const stream = fs.createReadStream(file); stream.on("error", () => { if (!response.headersSent) response.writeHead(500); response.end(); }); stream.pipe(response);
  });
}

function createFounderOsServer({ provider = createOpenAiProvider() } = {}) {
  const aiEndpoint = createAiEndpoint({ provider });
  return http.createServer((request, response) => {
    const rawPathname = String(request.url || "").split(/[?#]/, 1)[0];
    let url;
    try { url = new URL(request.url, "http://127.0.0.1"); } catch (error) { response.writeHead(400); response.end(); return; }
    if (url.pathname === "/api/ai/v1/invoke") { aiEndpoint(request, response); return; }
    if (url.pathname.startsWith("/api/")) { response.writeHead(404); response.end(); return; }
    serveStatic(request, response, rawPathname);
  });
}

if (require.main === module) {
  const server = createFounderOsServer();
  server.listen(PORT, HOST, () => { console.log(`FounderOS AI server listening at http://${HOST}:${PORT}/`); });
}

module.exports = { STATIC_ROOT, HOST, PORT, safeStaticPath, serveStatic, createFounderOsServer };