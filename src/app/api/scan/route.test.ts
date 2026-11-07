import { describe, it, expect } from "vitest";
import { GET, POST } from "./route";
import { parseGitHubUrl } from "@/lib/github";
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

  it("POST with self-scan '.' scans the current repo", async () => {
    const req = new Request("http://localhost:3000/api/scan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ repoPath: "." }),
    });
    const response = await POST(req);
    expect(response.status).toBe(200);

    const json = await response.json();
    expect(json.projectName).toBe("Wireboard");
    expect(json.summary.verifiedWires).toBeGreaterThanOrEqual(1);
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

  describe("parseGitHubUrl", () => {
    it("parses valid GitHub URLs in various formats", () => {
      expect(parseGitHubUrl("https://github.com/owner/repo")).toEqual({
        owner: "owner",
        repo: "repo",
      });
      expect(parseGitHubUrl("https://github.com/owner/repo.git")).toEqual({
        owner: "owner",
        repo: "repo",
      });
      expect(parseGitHubUrl("github.com/owner/repo-name_1.0")).toEqual({
        owner: "owner",
        repo: "repo-name_1.0",
      });
      expect(parseGitHubUrl("https://github.com/owner/repo/")).toEqual({
        owner: "owner",
        repo: "repo",
      });
    });

    it("rejects malicious or invalid GitHub URLs", () => {
      expect(parseGitHubUrl("https://github.com/owner/repo;rm -rf /")).toBeNull();
      expect(parseGitHubUrl("https://github.com/../evil/repo")).toBeNull();
      expect(parseGitHubUrl("https://gitlab.com/owner/repo")).toBeNull();
      expect(parseGitHubUrl("not a url")).toBeNull();
    });
  });

  it("POST with invalid GitHub URL format returns 400 error", async () => {
    const req = new Request("http://localhost:3000/api/scan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ repoPath: "https://github.com/bad/repo;injection" }),
    });
    const response = await POST(req);
    expect(response.status).toBe(400);

    const json = await response.json();
    expect(json.error).toContain("Invalid GitHub repository URL");
  });
});

