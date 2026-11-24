// Test-process guard: all Node TCP connections must stay on loopback.
// Loaded by the HTTP test driver and inherited by Next's child processes.
const net = require("node:net");
const http = require("node:http");
const https = require("node:https");
const { syncBuiltinESMExports } = require("node:module");
const allowedHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

function checkUrl(input) {
  const url = new URL(input);
  if (allowedHosts.has(url.hostname)) return;
  // Next dev has an optional dist-tag freshness check. Deny it locally before
  // fetch/proxy/socket I/O; Next already treats a failed check as "unknown".
  const optionalVersionCheck = url.hostname === "registry.npmjs.org"
    && url.pathname === "/-/package/next/dist-tags";
  const marker = optionalVersionCheck ? "connect-http-blocked-next-version-check" : "connect-http-egress-blocked";
  console.error(`[${marker}] Denied before network I/O: ${url.hostname}`);
  throw new Error(`[${marker}] Only loopback HTTP is permitted`);
}

const originalFetch = globalThis.fetch;
globalThis.fetch = function (input, init) {
  checkUrl(typeof input === "string" || input instanceof URL ? input : input.url);
  return originalFetch.call(this, input, init);
};

for (const protocol of [http, https]) {
  for (const method of ["request", "get"]) {
    const original = protocol[method];
    protocol[method] = function (...args) {
      for (const arg of args.slice(0, 2)) {
        if (typeof arg === "string" || arg instanceof URL) checkUrl(arg);
        else if (arg && typeof arg === "object") {
          if (arg.hostname || arg.host) checkUrl(`http://${arg.hostname || arg.host}`);
          if (typeof arg.path === "string" && /^https?:\/\//.test(arg.path)) checkUrl(arg.path);
          if (arg.method === "CONNECT") checkUrl(`http://${arg.path}`);
        }
      }
      return original.apply(this, args);
    };
  }
}
const originalConnect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  const first = Array.isArray(args[0]) ? args[0][0] : args[0];
  const options = first && typeof first === "object"
    ? first
    : typeof first === "number"
      ? { port: first, host: typeof args[1] === "string" ? args[1] : "localhost" }
      : { path: first };
  if (!options.path) {
    const host = options.host || options.hostname || "localhost";
    if (!allowedHosts.has(host)) {
      throw new Error(`[connect-http-egress-blocked] Non-loopback connection denied: ${host}`);
    }
  }
  return originalConnect.apply(this, args);
};
syncBuiltinESMExports();
