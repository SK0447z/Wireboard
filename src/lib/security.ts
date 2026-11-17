import dns from "node:dns";
import net from "node:net";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";

export const ALLOWED_REPLAY_METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);
export const MAX_REQUEST_BODY_SIZE = 64 * 1024; // 64KB
export const MAX_RESPONSE_BODY_SIZE = 256 * 1024; // 256KB
export const REPLAY_TIMEOUT_MS = 5000; // 5s

/**
 * Expands an IPv6 address string into 8 16-bit integer blocks.
 */
function parseIPv6Blocks(ip: string): number[] | null {
  const cleanIp = ip.replace(/^\[|\]$/g, "").toLowerCase();

  // Handle IPv4-mapped IPv6 like ::ffff:192.168.1.1
  if (cleanIp.includes(".")) {
    const lastColon = cleanIp.lastIndexOf(":");
    if (lastColon >= 0) {
      const v4Part = cleanIp.slice(lastColon + 1);
      const v4Octets = v4Part.split(".").map(Number);
      if (v4Octets.length === 4 && v4Octets.every((o) => !isNaN(o) && o >= 0 && o <= 255)) {
        const hexHigh = ((v4Octets[0] << 8) | v4Octets[1]).toString(16);
        const hexLow = ((v4Octets[2] << 8) | v4Octets[3]).toString(16);
        const prefix = cleanIp.slice(0, lastColon);
        return parseIPv6Blocks(`${prefix}:${hexHigh}:${hexLow}`);
      }
    }
  }

  const parts = cleanIp.split("::");
  if (parts.length > 2) return null;

  let leftBlocks: number[] = [];
  let rightBlocks: number[] = [];

  if (parts[0]) {
    leftBlocks = parts[0].split(":").map((h) => parseInt(h || "0", 16));
  }
  if (parts.length === 2 && parts[1]) {
    rightBlocks = parts[1].split(":").map((h) => parseInt(h || "0", 16));
  }

  const missingCount = 8 - (leftBlocks.length + rightBlocks.length);
  if (parts.length === 1 && missingCount !== 0) return null;
  if (missingCount < 0) return null;

  const middle = new Array(missingCount).fill(0);
  return [...leftBlocks, ...middle, ...rightBlocks];
}

/**
 * Validates an IP address against forbidden SSRF ranges.
 */
export function isIpBlocked(
  ip: string,
  options?: { allowLocal?: boolean }
): boolean {
  const allowLocal =
    options?.allowLocal ?? (process.env.WIREBOARD_ALLOW_LOCAL_REPLAY === "true");

  const cleanIp = ip.replace(/^\[|\]$/g, "").trim();

  // IPv4 validation
  if (net.isIPv4(cleanIp)) {
    const octets = cleanIp.split(".").map(Number);
    if (octets.length !== 4 || octets.some((o) => isNaN(o) || o < 0 || o > 255)) {
      return true;
    }

    const [o0, o1] = octets;

    // Unconditional block: 0.0.0.0
    if (octets.every((o) => o === 0)) return true;

    // Unconditional block: Cloud Metadata 169.254.169.254
    if (cleanIp === "169.254.169.254") return true;

    // Unconditional block: Link-local 169.254.0.0/16
    if (o0 === 169 && o1 === 254) return true;

    // Unconditional block: Multicast 224.0.0.0/4
    if (o0 >= 224 && o0 <= 239) return true;

    // Unconditional block: Broadcast/Reserved 240.0.0.0/4
    if (o0 >= 240) return true;

    // Loopback 127.0.0.0/8
    if (o0 === 127) {
      return !allowLocal;
    }

    // RFC1918 Private Ranges
    // 10.0.0.0/8
    if (o0 === 10) {
      return !allowLocal;
    }
    // 172.16.0.0/12
    if (o0 === 172 && o1 >= 16 && o1 <= 31) {
      return !allowLocal;
    }
    // 192.168.0.0/16
    if (o0 === 192 && o1 === 168) {
      return !allowLocal;
    }

    return false;
  }

  // IPv6 validation
  if (net.isIPv6(cleanIp)) {
    const blocks = parseIPv6Blocks(cleanIp);
    if (!blocks) return true;

    // Unconditional block: :: (unspecified)
    if (blocks.every((b) => b === 0)) return true;

    // Unconditional block: AWS IMDSv6 metadata fd00:ec2::254
    if (
      blocks[0] === 0xfd00 &&
      blocks[1] === 0x0ec2 &&
      blocks[2] === 0 &&
      blocks[3] === 0 &&
      blocks[4] === 0 &&
      blocks[5] === 0 &&
      blocks[6] === 0 &&
      blocks[7] === 0x0254
    ) {
      return true;
    }

    // Unconditional block: Link-local fe80::/10 (0xfe80 - 0xfebf)
    if (blocks[0] >= 0xfe80 && blocks[0] <= 0xfebf) return true;

    // Unconditional block: Multicast ff00::/8 (0xff00 - 0xffff)
    if (blocks[0] >= 0xff00 && blocks[0] <= 0xffff) return true;

    // IPv4-mapped IPv6 (::ffff:x.x.x.x)
    if (
      blocks[0] === 0 &&
      blocks[1] === 0 &&
      blocks[2] === 0 &&
      blocks[3] === 0 &&
      blocks[4] === 0 &&
      blocks[5] === 0xffff
    ) {
      const v4_0 = blocks[6] >> 8;
      const v4_1 = blocks[6] & 0xff;
      const v4_2 = blocks[7] >> 8;
      const v4_3 = blocks[7] & 0xff;
      return isIpBlocked(`${v4_0}.${v4_1}.${v4_2}.${v4_3}`, options);
    }

    // Loopback ::1
    if (blocks.slice(0, 7).every((b) => b === 0) && blocks[7] === 1) {
      return !allowLocal;
    }

    // Unique Local Address fc00::/7 (0xfc00 - 0xfdff)
    if (blocks[0] >= 0xfc00 && blocks[0] <= 0xfdff) {
      return !allowLocal;
    }

    return false;
  }

  // Invalid IP
  return true;
}

/**
 * Validates a URL for replay safety, preventing SSRF and DNS rebinding attacks.
 */
export async function validateReplayUrl(
  rawUrl: string,
  options?: { allowLocal?: boolean }
): Promise<{ valid: boolean; url?: URL; error?: string }> {
  const allowLocal =
    options?.allowLocal ?? (process.env.WIREBOARD_ALLOW_LOCAL_REPLAY === "true");

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { valid: false, error: "Invalid URL format" };
  }

  // Only permit http: and https: protocols
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return {
      valid: false,
      error: `Forbidden protocol '${parsed.protocol}'. Only http: and https: are allowed.`,
    };
  }

  // Reject credentials in URL
  if (parsed.username || parsed.password) {
    return { valid: false, error: "Credentials in URL are strictly forbidden" };
  }

  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");

  // Unconditional domain block: Google Cloud metadata
  if (
    hostname === "metadata.google.internal" ||
    hostname.endsWith(".metadata.google.internal")
  ) {
    return { valid: false, error: "Access to cloud metadata endpoints is forbidden" };
  }

  // Loopback domain check
  if (!allowLocal && (hostname === "localhost" || hostname.endsWith(".localhost"))) {
    return {
      valid: false,
      error: "Access to loopback/localhost is blocked by default in replay",
    };
  }

  // Literal IP address check
  if (net.isIP(hostname)) {
    if (isIpBlocked(hostname, { allowLocal })) {
      return {
        valid: false,
        error: `Target IP address '${hostname}' is in a blocked SSRF range`,
      };
    }
    return { valid: true, url: parsed };
  }

  // Domain name: resolve DNS and validate all returned IP addresses
  try {
    const addresses = await dns.promises.lookup(hostname, { all: true });
    if (!addresses || addresses.length === 0) {
      return { valid: false, error: `Failed to resolve hostname '${hostname}'` };
    }

    for (const record of addresses) {
      if (isIpBlocked(record.address, { allowLocal })) {
        return {
          valid: false,
          error: `DNS resolution for '${hostname}' returned blocked IP '${record.address}'`,
        };
      }
    }
  } catch (err) {
    return {
      valid: false,
      error: `DNS lookup failed for '${hostname}': ${
        err instanceof Error ? err.message : String(err)
      }`,
    };
  }

  return { valid: true, url: parsed };
}

/**
 * Validates scan directory path strictly against allowed roots.
 */
export function validateScanPath(
  requestedPath: string
): { valid: boolean; resolvedPath?: string; error?: string; status?: number } {
  let allowedWorkspaceRoot: string;
  try {
    allowedWorkspaceRoot = fs.realpathSync(process.cwd());
  } catch {
    allowedWorkspaceRoot = path.resolve(process.cwd());
  }

  const isInside = (parent: string, child: string) => {
    const normParent = path.resolve(parent).toLowerCase();
    const normChild = path.resolve(child).toLowerCase();
    const rel = path.relative(normParent, normChild);
    return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
  };

  const tempScansDir = path.join(os.tmpdir(), "wireboard-scans");
  let canonicalTemp: string | null = null;
  if (fs.existsSync(tempScansDir)) {
    try {
      canonicalTemp = fs.realpathSync(tempScansDir);
    } catch {
      canonicalTemp = path.resolve(tempScansDir);
    }
  }

  const isAllowedRoot = (target: string) => {
    if (isInside(allowedWorkspaceRoot, target)) return true;
    if (canonicalTemp && isInside(canonicalTemp, target)) return true;
    return false;
  };

  const candidate = path.isAbsolute(requestedPath)
    ? requestedPath
    : path.resolve(process.cwd(), requestedPath);

  // 1. Check if the path escapes workspace boundaries lexically
  if (!isAllowedRoot(candidate)) {
    return {
      valid: false,
      error: "Access denied: Path is outside allowed workspace boundaries",
      status: 403,
    };
  }

  // 2. Check existence
  if (!fs.existsSync(candidate)) {
    return {
      valid: false,
      error: `Directory does not exist: ${requestedPath}`,
      status: 400,
    };
  }

  // 3. Check canonical realpath (protecting against symlinks escaping root)
  let canonicalCandidate: string;
  try {
    canonicalCandidate = fs.realpathSync(candidate);
  } catch {
    return {
      valid: false,
      error: `Failed to resolve real path: ${requestedPath}`,
      status: 400,
    };
  }

  if (!isAllowedRoot(canonicalCandidate)) {
    return {
      valid: false,
      error: "Access denied: Path is outside allowed workspace boundaries",
      status: 403,
    };
  }

  return { valid: true, resolvedPath: canonicalCandidate };
}

/**
 * Validates GitHub owner and repo strings against strict identifier rules.
 */
export function validateGitHubRepo(owner: string, repo: string): boolean {
  if (
    owner === "." ||
    owner === ".." ||
    repo === "." ||
    repo === ".." ||
    owner.includes("/") ||
    owner.includes("\\") ||
    repo.includes("/") ||
    repo.includes("\\")
  ) {
    return false;
  }
  const validRegex = /^[a-zA-Z0-9._-]+$/;
  return validRegex.test(owner) && validRegex.test(repo);
}
