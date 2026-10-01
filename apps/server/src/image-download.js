import https from "node:https";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

// Deliberately conservative: only globally routable unicast addresses are accepted.
export function isPublicAddress(address) {
  if (isIP(address) === 4) {
    const [a, b, c] = address.split(".").map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && (b === 168 || b === 0 || (b === 88 && c === 99))) ||
      (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
      (a === 203 && b === 0 && c === 113));
  }
  if (isIP(address) !== 6 || address.includes(".")) return false;
  const canonical = new URL(`https://[${address}]/`).hostname.slice(1, -1);
  const [first, second = "0"] = canonical.split(":");
  const prefix = parseInt(first, 16);
  const next = parseInt(second || "0", 16);
  return prefix >= 0x2000 && prefix <= 0x3fff &&
    !(prefix === 0x2001 && (next < 0x200 || next === 0xdb8)) &&
    prefix !== 0x2002 && !(prefix === 0x3fff && next < 0x1000);
}

export function detectImageType(bytes) {
  if (bytes.length >= 24 && bytes.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex")) && bytes.toString("ascii", 12, 16) === "IHDR") return { mime: "image/png", extension: "png" };
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { mime: "image/jpeg", extension: "jpg" };
  if (bytes.length >= 10 && /^(GIF87a|GIF89a)$/.test(bytes.toString("ascii", 0, 6))) return { mime: "image/gif", extension: "gif" };
  if (bytes.length >= 16 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP" && /^(VP8 |VP8L|VP8X)$/.test(bytes.toString("ascii", 12, 16))) return { mime: "image/webp", extension: "webp" };
  throw new Error("图片格式不支持或内容无效");
}

function abortable(promise, signal) {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const abort = () => reject(new Error("图片下载超时"));
    signal.addEventListener("abort", abort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}

let activeDownloads = 0;
const waiters = new Set();
async function acquire(signal) {
  while (activeDownloads >= 2) {
    let wake;
    try { await abortable(new Promise((resolve) => { wake = resolve; waiters.add(wake); }), signal); }
    finally { waiters.delete(wake); }
  }
  signal.throwIfAborted();
  activeDownloads++;
  return () => { activeDownloads--; for (const wake of waiters) wake(); };
}

export async function downloadImage(rawUrl, { timeoutMs = 20000, resolveHost = lookup, request = https.request } = {}) {
  const signal = AbortSignal.timeout(Math.max(1, Math.min(timeoutMs, 20000)));
  const release = await acquire(signal);
  try {
    let target = rawUrl;
    for (let hop = 0; hop <= 3; hop++) {
      const url = new URL(target);
      if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) throw new Error("图片地址必须为公网 HTTPS 标准端口");
      const host = url.hostname.replace(/^\[|\]$/g, "");
      const addresses = isIP(host) ? [{ address: host, family: isIP(host) }] :
        await abortable(resolveHost(host, { all: true, verbatim: true }), signal);
      if (!addresses.length || addresses.some(({ address }) => !isPublicAddress(address))) throw new Error("图片地址不允许访问内网或特殊网络");
      const pinned = addresses[0];
      const response = await fetchPinned(url, pinned, signal, request);
      if (response.redirect) {
        if (hop === 3) throw new Error("图片重定向过多");
        target = new URL(response.redirect, url).href;
        continue;
      }
      return { bytes: response.bytes, ...detectImageType(response.bytes) };
    }
  } finally { release(); }
}

function canonicalAddress(address) {
  if (address?.startsWith("::ffff:") && isIP(address.slice(7)) === 4) return address.slice(7);
  return isIP(address) === 6 ? new URL(`https://[${address}]/`).hostname : address;
}

function fetchPinned(url, pinned, signal, request) {
  return new Promise((resolve, reject) => {
    const req = request(url, {
      method: "GET", agent: false, signal,
      headers: { Accept: "image/png,image/jpeg,image/webp,image/gif", "Accept-Encoding": "identity" },
      // Pin the validated address, including Node versions that request all addresses.
      lookup: (_host, options, callback) => options.all ? callback(null, [pinned]) : callback(null, pinned.address, pinned.family),
    }, (res) => {
      if (canonicalAddress(res.socket?.remoteAddress) !== canonicalAddress(pinned.address)) {
        res.destroy(); reject(new Error("图片连接地址校验失败")); return;
      }
      if ([301, 302, 303, 307, 308].includes(res.statusCode)) {
        const redirect = res.headers.location;
        res.destroy();
        if (redirect) resolve({ redirect }); else reject(new Error("图片重定向缺少地址"));
        return;
      }
      if (res.statusCode !== 200 || (res.headers["content-encoding"] && res.headers["content-encoding"] !== "identity")) {
        res.destroy(); reject(new Error(`图片下载失败（HTTP ${res.statusCode} 或不支持的压缩）`)); return;
      }
      if (Number(res.headers["content-length"]) > MAX_IMAGE_BYTES) {
        res.destroy(); reject(new Error("图片超过 20 MB")); return;
      }
      const parts = [];
      let size = 0;
      res.on("data", (part) => {
        size += part.length;
        if (size > MAX_IMAGE_BYTES) { res.destroy(); reject(new Error("图片超过 20 MB")); }
        else parts.push(part);
      });
      res.on("end", () => resolve({ bytes: Buffer.concat(parts) }));
      res.on("error", reject);
      res.on("aborted", () => reject(new Error("图片下载中断")));
    });
    req.on("error", () => reject(new Error(signal.aborted ? "图片下载超时" : "图片网络连接失败")));
    req.end();
  });
}
