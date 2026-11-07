import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";

describe("API: /api/replay", () => {
  it("returns 400 if url is missing", async () => {
    const req = new NextRequest("http://localhost:3000/api/replay", {
      method: "POST",
      body: JSON.stringify({}),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("url is required");
  });

  it("proxies a mock request and measures duration", async () => {
    // Mock global.fetch
    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockResolvedValue({
      status: 200,
      statusText: "OK",
      text: async () => JSON.stringify({ message: "replay success", user_id: "u123" }),
    });

    const req = new NextRequest("http://localhost:3000/api/replay", {
      method: "POST",
      body: JSON.stringify({
        url: "/api/register",
        method: "POST",
        body: { email: "test@example.com", password: "password" },
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe(200);
    expect(json.statusText).toBe("OK");
    expect(typeof json.durationMs).toBe("number");
    expect(json.data).toEqual({ message: "replay success", user_id: "u123" });

    global.fetch = originalFetch;
  });

  it("handles fetch network failure gracefully with 502 Connection Error", async () => {
    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));

    const req = new NextRequest("http://localhost:3000/api/replay", {
      method: "POST",
      body: JSON.stringify({
        url: "http://localhost:9999/api/nonexistent",
        method: "GET",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200); // Route handler returns JSON response with status 502
    const json = await res.json();
    expect(json.status).toBe(502);
    expect(json.statusText).toBe("Connection Error");
    expect(json.error).toContain("ECONNREFUSED");

    global.fetch = originalFetch;
  });
});

