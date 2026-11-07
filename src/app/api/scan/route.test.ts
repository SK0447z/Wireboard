import { describe, it, expect } from "vitest";
import { GET, POST } from "./route";
import { ArchitectureGraphSchema } from "@/types/graph";

describe("API: /api/scan", () => {
  it("GET returns ArchitectureGraph for broken-app by default", async () => {
    const req = new Request("http://localhost:3000/api/scan");
    const response = await GET(req);
    expect(response.status).toBe(200);

    const json = await response.json();
    expect(() => ArchitectureGraphSchema.parse(json)).not.toThrow();
    expect(json.projectName).toBe("broken-app");
    expect(json.nodes.length).toBeGreaterThan(0);
    expect(json.wires.length).toBeGreaterThan(0);
  });

  it("POST with empty body defaults to broken-app", async () => {
    const req = new Request("http://localhost:3000/api/scan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const response = await POST(req);
    expect(response.status).toBe(200);

    const json = await response.json();
    expect(json.projectName).toBe("broken-app");
    expect(json.summary.brokenWires).toBeGreaterThan(0);
  });

  it("POST with valid repoPath scans the target", async () => {
    const req = new Request("http://localhost:3000/api/scan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ repoPath: "test-fixtures/broken-app" }),
    });
    const response = await POST(req);
    expect(response.status).toBe(200);

    const json = await response.json();
    expect(json.projectName).toBe("broken-app");
  });

  it("POST with non-existent path returns 400 error", async () => {
    const req = new Request("http://localhost:3000/api/scan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ repoPath: "invalid-directory-path-does-not-exist" }),
    });
    const response = await POST(req);
    expect(response.status).toBe(400);

    const json = await response.json();
    expect(json.error).toBeDefined();
  });
});

