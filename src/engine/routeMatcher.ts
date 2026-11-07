/**
 * Route matching utilities for full-stack API contract verification.
 * Eliminates false-positive MISSING_ENDPOINT errors by handling query strings,
 * hash fragments, and dynamic Next.js route segments positionally.
 */

export function normalizeRoutePath(rawUrl: string): string {
  if (!rawUrl) return "";

  // Strip query string and hash fragment
  let cleaned = rawUrl.split("?")[0].split("#")[0].trim();

  // Normalize backslashes to forward slashes
  cleaned = cleaned.replace(/\\/g, "/");

  // Remove multiple consecutive slashes
  cleaned = cleaned.replace(/\/+/g, "/");

  // Ensure leading slash
  if (!cleaned.startsWith("/")) {
    cleaned = "/" + cleaned;
  }

  // Remove trailing slash if length > 1
  if (cleaned.length > 1 && cleaned.endsWith("/")) {
    cleaned = cleaned.slice(0, -1);
  }

  return cleaned;
}

function isDynamicSegment(segment: string): boolean {
  if (!segment) return false;
  // [id], [projectId], [...slug]
  if (segment.startsWith("[") && segment.endsWith("]")) return true;
  // ${item.id}, ${x}
  if (segment.startsWith("${") && segment.endsWith("}")) return true;
  // :id
  if (segment.startsWith(":")) return true;
  // $id
  if (segment.startsWith("$")) return true;
  return false;
}

/**
 * Checks whether a frontend request URL targets a backend route handler.
 * Strips query strings, hashes, and matches dynamic route segments positionally.
 */
export function routesMatch(frontendUrl: string, backendRoute: string): boolean {
  const normFront = normalizeRoutePath(frontendUrl);
  const normBack = normalizeRoutePath(backendRoute);

  if (normFront === normBack) {
    return true;
  }

  const frontSegments = normFront.split("/").filter(Boolean);
  const backSegments = normBack.split("/").filter(Boolean);

  if (frontSegments.length !== backSegments.length) {
    return false;
  }

  for (let i = 0; i < frontSegments.length; i++) {
    const fSeg = frontSegments[i];
    const bSeg = backSegments[i];

    if (fSeg === bSeg) {
      continue;
    }

    if (isDynamicSegment(fSeg) || isDynamicSegment(bSeg)) {
      continue;
    }

    return false;
  }

  return true;
}
