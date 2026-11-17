import { NextRequest, NextResponse } from "next/server";
import {
  ALLOWED_REPLAY_METHODS,
  MAX_REQUEST_BODY_SIZE,
  MAX_RESPONSE_BODY_SIZE,
  REPLAY_TIMEOUT_MS,
  validateReplayUrl,
} from "@/lib/security";

export async function POST(req: NextRequest) {
  let bodyJson: {
    url?: string;
    method?: string;
    body?: string | Record<string, unknown>;
    headers?: Record<string, string>;
  };

  try {
    bodyJson = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON request body" },
      { status: 400 }
    );
  }

  const { url, method = "GET", body, headers = {} } = bodyJson;

  if (!url || typeof url !== "string") {
    return NextResponse.json(
      { error: "url is required for wire replay" },
      { status: 400 }
    );
  }

  const uppercaseMethod = method.toUpperCase();
  if (!ALLOWED_REPLAY_METHODS.has(uppercaseMethod)) {
    return NextResponse.json(
      {
        error: `Method '${method}' is not permitted. Permitted methods: ${Array.from(
          ALLOWED_REPLAY_METHODS
        ).join(", ")}`,
      },
      { status: 400 }
    );
  }

  // Resolve URL: if relative path, resolve against current origin or localhost:3000
  let targetUrl = url;
  if (url.startsWith("/")) {
    const origin = req.nextUrl?.origin || "http://localhost:3000";
    targetUrl = `${origin}${url}`;
  }

  // Security validation (SSRF, metadata, private IP, protocol, DNS rebinding)
  const validation = await validateReplayUrl(targetUrl);
  if (!validation.valid || !validation.url) {
    return NextResponse.json(
      { error: validation.error || "Blocked URL destination" },
      { status: 403 }
    );
  }

  // Enforce request body size cap (64KB)
  let requestBodyString: string | undefined;
  if (uppercaseMethod !== "GET" && uppercaseMethod !== "HEAD" && body !== undefined) {
    requestBodyString = typeof body === "string" ? body : JSON.stringify(body);
    if (Buffer.byteLength(requestBodyString, "utf8") > MAX_REQUEST_BODY_SIZE) {
      return NextResponse.json(
        { error: "Request body exceeds maximum allowed size of 64KB" },
        { status: 400 }
      );
    }
  }

  const startTime = performance.now();

  try {
    const fetchHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      ...headers,
    };

    const fetchOptions: RequestInit = {
      method: uppercaseMethod,
      headers: fetchHeaders,
      redirect: "manual",
      signal: AbortSignal.timeout(REPLAY_TIMEOUT_MS),
    };

    if (requestBodyString !== undefined) {
      fetchOptions.body = requestBodyString;
    }

    const response = await fetch(targetUrl, fetchOptions);
    const durationMs = Math.round(performance.now() - startTime);

    // Enforce response body size cap (256KB)
    const contentLength = response.headers?.get?.("content-length");
    if (contentLength && parseInt(contentLength, 10) > MAX_RESPONSE_BODY_SIZE) {
      return NextResponse.json(
        { error: "Response body exceeds maximum allowed size of 256KB" },
        { status: 502 }
      );
    }

    const responseText = await response.text();
    if (Buffer.byteLength(responseText, "utf8") > MAX_RESPONSE_BODY_SIZE) {
      return NextResponse.json(
        { error: "Response body exceeds maximum allowed size of 256KB" },
        { status: 502 }
      );
    }

    let parsedData: unknown;
    try {
      parsedData = JSON.parse(responseText);
    } catch {
      parsedData = responseText;
    }

    return NextResponse.json({
      status: response.status,
      statusText: response.statusText || (response.status === 200 ? "OK" : `HTTP ${response.status}`),
      durationMs,
      data: parsedData,
      error: undefined,
    });
  } catch (err) {
    const durationMs = Math.round(performance.now() - startTime);
    const safeError =
      err instanceof Error && err.name === "TimeoutError"
        ? "Request timed out after 5000ms"
        : err instanceof Error
        ? err.message
        : "Failed to connect to target URL";

    return NextResponse.json(
      {
        status: 502,
        statusText: "Connection Error",
        durationMs,
        error: safeError,
        data: null,
      },
      { status: 502 }
    );
  }
}
