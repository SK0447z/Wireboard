import { NextRequest, NextResponse } from "next/server";

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

  // Resolve URL: if relative path, resolve against current origin or localhost:3000
  let targetUrl = url;
  if (url.startsWith("/")) {
    const origin = req.nextUrl?.origin || "http://localhost:3000";
    targetUrl = `${origin}${url}`;
  }

  const startTime = performance.now();

  try {
    const uppercaseMethod = method.toUpperCase();
    const fetchHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      ...headers,
    };

    const fetchOptions: RequestInit = {
      method: uppercaseMethod,
      headers: fetchHeaders,
    };

    if (uppercaseMethod !== "GET" && uppercaseMethod !== "HEAD" && body !== undefined) {
      fetchOptions.body = typeof body === "string" ? body : JSON.stringify(body);
    }

    const response = await fetch(targetUrl, fetchOptions);
    const durationMs = Math.round(performance.now() - startTime);

    const responseText = await response.text();
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
    });
  } catch (err) {
    const durationMs = Math.round(performance.now() - startTime);
    return NextResponse.json({
      status: 502,
      statusText: "Connection Error",
      durationMs,
      error: err instanceof Error ? err.message : String(err),
      data: null,
    });
  }
}

