import { describe, it, expect } from "vitest";
import path from "node:path";
import { scanRepository } from "../buildGraph";
import { calculateBlastRadius } from "../blastRadius";

describe("calculateBlastRadius", () => {
  const brokenAppPath = path.resolve(__dirname, "../../../test-fixtures/broken-app");
  const graph = scanRepository(brokenAppPath);

  it("calculates blast radius for backend route in dependency order (DB -> Route -> Consumer)", () => {
    const targetNodeId = "api:POST:/api/register";
    const result = calculateBlastRadius(
      graph,
      targetNodeId,
      "rename subscriptionTier to subscription_tier and user_id to userId"
    );

    expect(result.targetNodeId).toBe(targetNodeId);
    expect(result.proposedChange).toContain("rename subscriptionTier");

    // All connected nodes in the chain
    expect(result.affectedNodeIds).toContain("db:User");
    expect(result.affectedNodeIds).toContain("api:POST:/api/register");
    expect(result.affectedNodeIds).toContain("fe:RegisterForm.tsx");

    // Wires connected
    expect(result.affectedWires.length).toBeGreaterThanOrEqual(2);

    // Strict dependency order: Database -> Backend Route -> Frontend Consumer
    const roles = result.affectedFiles.map((f) => f.role);
    const dbIndex = roles.indexOf("Database");
    const backendIndex = roles.indexOf("Backend Route");
    const frontendIndex = roles.indexOf("Frontend Consumer");

    expect(dbIndex).toBeGreaterThanOrEqual(0);
    expect(backendIndex).toBeGreaterThan(dbIndex);
    expect(frontendIndex).toBeGreaterThan(backendIndex);

    // Exact filePath:line presence
    expect(result.affectedFiles.some((f) => f.filePath.includes("schema.prisma"))).toBe(true);
    expect(result.affectedFiles.some((f) => f.filePath.includes("route.ts"))).toBe(true);
    expect(result.affectedFiles.some((f) => f.filePath.includes("RegisterForm.tsx"))).toBe(true);

    // Atomic execution prompt
    expect(result.atomicExecutionPrompt).toContain("ATOMIC CONTRACT SYNCHRONIZATION PLAN");
    expect(result.atomicExecutionPrompt).toContain("POST /api/register");
    expect(result.atomicExecutionPrompt).toContain("schema.prisma");
    expect(result.atomicExecutionPrompt).toContain("route.ts");
    expect(result.atomicExecutionPrompt).toContain("RegisterForm.tsx");
  });

  it("calculates blast radius starting from database table upstream to consumers", () => {
    const result = calculateBlastRadius(graph, "db:User");
    expect(result.affectedNodeIds).toContain("db:User");
    expect(result.affectedNodeIds).toContain("api:POST:/api/register");
    expect(result.affectedNodeIds).toContain("fe:RegisterForm.tsx");
    expect(result.affectedFiles[0].role).toBe("Database");
  });

  it("handles non-existent node gracefully", () => {
    const result = calculateBlastRadius(graph, "non-existent-node");
    expect(result.affectedNodeIds).toHaveLength(0);
    expect(result.affectedWires).toHaveLength(0);
    expect(result.affectedFiles).toHaveLength(0);
    expect(result.atomicExecutionPrompt).toBe("");
  });
});
