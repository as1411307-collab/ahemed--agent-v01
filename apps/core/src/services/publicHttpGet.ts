import { lookup } from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import { BlockList, isIP } from "node:net";

// Conservative public-web policy. Special-purpose ranges are not web destinations.
const blocked = new BlockList();
for (const [network, prefix] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10],
  ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12],
  ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.88.99.0", 24],
  ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24],
  ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
] as const) blocked.addSubnet(network, prefix, "ipv4");
// Azure platform virtual IP (not in RFC1918/link-local space).
blocked.addAddress("168.63.129.16", "ipv4");
const globalV6 = new BlockList();
globalV6.addSubnet("2000::", 3, "ipv6");
for (const [network, prefix] of [
  ["2001::", 23], ["2001:db8::", 32], ["2002::", 16], ["3fff::", 20],
] as const) blocked.addSubnet(network, prefix, "ipv6");

export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return !blocked.check(address, "ipv4");
  // Excludes mapped IPv4, NAT64, local, multicast and unspecified IPv6.
  return family === 6 && globalV6.check(address, "ipv6") && !blocked.check(address, "ipv6");
}

function parseUrl(input: string): URL {
  if (!input || input.length > 8192) throw new Error("Invalid HTTP URL");
  const url = new URL(input);
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Only HTTP(S) URLs are allowed");
  if (url.username || url.password) throw new Error("URL credentials are not allowed");
  // URL normalizes explicit default ports to an empty string.
  if (url.port) throw new Error("Only default HTTP(S) ports are allowed");
  const host = url.hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (!isIP(host) && (!host.includes(".") ||
    /(^|\.)(localhost|local|internal|lan|home|test|invalid|onion)$/.test(host) ||
    host.endsWith(".home.arpa") || host === "metadata.google.internal" ||
    host === "metadata.goog" || host.endsWith(".metadata.goog"))) {
    throw new Error("Local or reserved hostnames are not allowed");
  }
  url.hash = "";
  return url;
}

type Address = { address: string; family: number };
type Resolver = (hostname: string) => Promise<Address[]>;
const resolve: Resolver = (hostname) => lookup(hostname, { all: true, verbatim: true });
const redirects = new Set([301, 302, 303, 307, 308]);
export const HTTP_GET_LIMITS = Object.freeze({ timeoutMs: 10_000, maxBytes: 1_048_576, maxRedirects: 3 });

function withAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolvePromise, reject) => {
    const abort = () => reject(signal.reason);
    if (signal.aborted) return abort();
    signal.addEventListener("abort", abort, { once: true });
    promise.then(resolvePromise, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}

async function destination(url: URL, resolver: Resolver, signal: AbortSignal): Promise<Address> {
  const host = url.hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "");
  const family = isIP(host);
  const addresses = family ? [{ address: host, family }] : await withAbort(resolver(host), signal);
  signal.throwIfAborted();
  if (!addresses.length || addresses.some((entry) =>
    entry.family !== isIP(entry.address) || !isPublicAddress(entry.address))) {
    throw new Error("Destination is not a public IP address");
  }
  return addresses[0];
}

type Hop = { text: string; location?: string };
function requestHop(url: URL, address: Address, signal: AbortSignal): Promise<Hop> {
  return new Promise((resolvePromise, reject) => {
    const secure = url.protocol === "https:";
    const host = url.hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "");
    // Connect to the checked IP directly: no second DNS lookup / DNS rebinding.
    // Preserve the original Host and TLS identity, with normal certificate checks.
    const req = (secure ? https : http).request({
      protocol: url.protocol,
      hostname: address.address,
      family: address.family,
      port: secure ? 443 : 80,
      path: url.pathname + url.search,
      method: "GET",
      headers: { Host: url.host, "Accept-Encoding": "identity" },
      ...(secure ? { servername: isIP(host) ? "" : host } : {}),
      agent: false,
      signal,
      maxHeaderSize: 16_384,
    }, (res) => {
      res.on("error", reject);
      res.on("aborted", () => reject(new Error("HTTP response was aborted")));
      if (redirects.has(res.statusCode ?? 0)) {
        const location = res.headers.location;
        // Never consume redirect bodies or retain cookies/auth between hops.
        resolvePromise(location ? { text: "", location } : { text: "" });
        res.destroy();
        return;
      }
      const fail = (message: string) => {
        reject(new Error(message));
        res.destroy();
        req.destroy();
      };
      const encoding = res.headers["content-encoding"];
      if (encoding && encoding.toLowerCase() !== "identity") {
        fail("Compressed HTTP responses are not supported");
        return;
      }
      const declared = res.headers["content-length"];
      if (declared && (!/^\d+$/.test(declared) || Number(declared) > HTTP_GET_LIMITS.maxBytes)) {
        fail("HTTP response exceeds size limit");
        return;
      }
      const chunks: Buffer[] = [];
      let bytes = 0;
      res.on("data", (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > HTTP_GET_LIMITS.maxBytes) { fail("HTTP response exceeds size limit"); return; }
        chunks.push(chunk);
      });
      res.on("end", () => resolvePromise({ text: Buffer.concat(chunks).toString("utf8") }));
    });
    req.on("error", reject);
    req.end();
  });
}

/** Fixed policy applies to every caller, including direct /v1/tools/execute calls. */
export async function publicHttpGet(input: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error("HTTP request timed out")), HTTP_GET_LIMITS.timeoutMs);
  try {
    let url = parseUrl(input);
    for (let hops = 0; ; hops++) {
      const address = await destination(url, resolve, controller.signal);
      const result = await requestHop(url, address, controller.signal);
      if (!result.location) return result.text;
      if (hops >= HTTP_GET_LIMITS.maxRedirects) throw new Error("Too many HTTP redirects");
      const next = parseUrl(new URL(result.location, url).href);
      if (url.protocol === "https:" && next.protocol !== "https:") throw new Error("HTTPS downgrade redirect is not allowed");
      url = next;
    }
  } catch (error) {
    if (controller.signal.aborted) throw new Error("HTTP request timed out");
    throw error;
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}
