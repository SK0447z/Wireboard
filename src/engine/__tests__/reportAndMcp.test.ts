import { describe, it, expect } from "vitest";
import { generateContractReport } from "../generateReport";
import { handleMcpToolCall } from "../../mcp/server";
import type { ArchitectureGraph } from "../../types/graph";

const mockGraph: ArchitectureGraph = {
  projectName: "test-project",
  scannedAt: "2026-11-07T12:00:00.000Z",
  nodes: [
    {
      id: "comp:src/app/page.tsx:Page",
      kind: "FRONTEND_COMPONENT",
      label: "Page",
      filePath: "src/app/page.tsx",
      line: 10,
    },
    {
      id: "api:GET:/api/users",
      kind: "BACKEND_ROUTE",
      label: "GET /api/users",
      filePath: "src/app/api/users/route.ts",
      line: 5,
      httpMethod: "GET",
      routePath: "/api/users",
      returnsPayload: { id: "string", username: "string" },
    },
    {
      id: "api:POST:/api/checkout",
      kind: "BACKEND_ROUTE",
      label: "POST /api/checkout",
      filePath: "src/app/api/checkout/route.ts",
      line: 8,
      httpMethod: "POST",
      routePath: "/api/checkout",
    },
  ],
  wires: [
    {
      id: "wire:verified",
      sourceId: "comp:src/app/page.tsx:Page",
      targetId: "api:GET:/api/users",
      status: "VERIFIED",
      issues: [],
    },
    {
      id: "wire:broken",
      sourceId: "comp:src/app/page.tsx:Page",
      targetId: "api:POST:/api/checkout",
      status: "BROKEN",
      issues: [
        {
          id: "issue:broken-1",
          wireId: "wire:broken",
          severity: "BROKEN",
          code: "FIELD_MISMATCH",
          title: "Payload key mismatch: Missing required fields",
          explanation: "Frontend expects 'userId' but backend returns 'user_id'.",
          sourceFile: "src/app/page.tsx",
          sourceLine: 42,
          targetFile: "src/app/api/checkout/route.ts",
          targetLine: 18,
          expectedShape: { userId: "string" },
          actualShape: { user_id: "string" },
          repairPrompt: "Update frontend in src/app/page.tsx:42 to use user_id",
        },
      ],
    },
  ],
  issues: [
    {
      id: "issue:broken-1",
      wireId: "wire:broken",
      severity: "BROKEN",
      code: "FIELD_MISMATCH",
      title: "Payload key mismatch: Missing required fields",
      explanation: "Frontend expects 'userId' but backend returns 'user_id'.",
      sourceFile: "src/app/page.tsx",
      sourceLine: 42,
      targetFile: "src/app/api/checkout/route.ts",
      targetLine: 18,
      expectedShape: { userId: "string" },
      actualShape: { user_id: "string" },
      repairPrompt: "Update frontend in src/app/page.tsx:42 to use user_id",
    },
  ],
  summary: {
    totalNodes: 3,
    verifiedWires: 1,
    suspiciousWires: 0,
    brokenWires: 1,
  },
};

describe("generateContractReport", () => {
  it("calculates deterministic integrity score and formats markdown", () => {
    const report = generateContractReport(mockGraph);
    expect(report.score).toBe(0); // 1 verified, 1 broken -> (1 - 1.0) / 2 = 0
    expect(report.markdown).toContain("# WIREBOARD Contract Integrity Report");
    expect(report.markdown).toContain("test-project");
    expect(report.markdown).toContain("Contract Integrity Score: 0%");
    expect(report.markdown).toContain("Total Nodes");
    expect(report.markdown).toContain("[BROKEN] FIELD_MISMATCH");
    expect(report.markdown).toContain("src/app/page.tsx:42");
    expect(report.markdown).toContain("repairPrompt");
    expect(report.markdown).toContain("Update frontend in src/app/page.tsx:42 to use user_id");
  });

  it("handles 100% verified graph score", () => {
    const perfectGraph: ArchitectureGraph = {
      ...mockGraph,
      wires: [mockGraph.wires[0]],
      issues: [],
      summary: {
        totalNodes: 2,
        verifiedWires: 1,
        suspiciousWires: 0,
        brokenWires: 0,
      },
    };
    const report = generateContractReport(perfectGraph);
    expect(report.score).toBe(100);
    expect(report.markdown).toContain("Contract Integrity Score: 100%");
    expect(report.markdown).toContain("All integration contracts are strictly verified");
  });

  it("calculates score with suspicious wires correctly", () => {
    const suspiciousGraph: ArchitectureGraph = {
      ...mockGraph,
      wires: [
        mockGraph.wires[0],
        {
          id: "wire:suspicious",
          sourceId: "comp:src/app/page.tsx:Page",
          targetId: "api:GET:/api/users",
          status: "SUSPICIOUS",
          issues: [
            {
              id: "issue:susp-1",
              wireId: "wire:suspicious",
              severity: "SUSPICIOUS",
              code: "TYPE_CHEAT",
              title: "Unsafe type assertion",
              explanation: "Frontend uses 'as any'",
              sourceFile: "src/app/page.tsx",
              sourceLine: 25,
              repairPrompt: "Remove 'as any' cast",
            },
          ],
        },
      ],
      issues: [],
      summary: {
        totalNodes: 2,
        verifiedWires: 1,
        suspiciousWires: 1,
        brokenWires: 0,
      },
    };
    // 2 wires: 1 verified, 1 suspicious (0.5 weight penalty). Score: (1 + 0.5) / 2 = 75%
    const report = generateContractReport(suspiciousGraph);
    expect(report.score).toBe(75);
    expect(report.markdown).toContain("Contract Integrity Score: 75%");
  });
});

describe("handleMcpToolCall", () => {
  it("handles wireboard_scan tool", async () => {
    const result = await handleMcpToolCall("wireboard_scan", { projectPath: "test-fixtures/broken-app" });
    expect(result.isError).toBeFalsy();
    expect(result.content).toBeDefined();
    expect(result.content[0].type).toBe("text");
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.score).toBeDefined();
    expect(parsed.summary).toBeDefined();
    expect(parsed.brokenWiresCount).toBeGreaterThan(0);
    expect(Array.isArray(parsed.brokenWires)).toBe(true);
  });

  it("handles wireboard_get_fixes tool", async () => {
    const result = await handleMcpToolCall("wireboard_get_fixes", { projectPath: "test-fixtures/broken-app" });
    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(result.content[0].text);
    expect(Array.isArray(parsed.issues)).toBe(true);
    expect(parsed.issues.length).toBeGreaterThan(0);
    expect(parsed.issues[0].repairPrompt).toBeDefined();
  });

  it("handles wireboard_blast_radius tool", async () => {
    const result = await handleMcpToolCall("wireboard_blast_radius", {
      projectPath: "test-fixtures/broken-app",
      targetNodeId: "api:POST:/api/register",
      proposedChange: "rename user_id -> id",
    });
    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.targetNodeId).toBe("api:POST:/api/register");
    expect(parsed.proposedChange).toBe("rename user_id -> id");
    expect(Array.isArray(parsed.affectedNodeIds)).toBe(true);
    expect(parsed.affectedNodeIds).toContain("db:User");
    expect(Array.isArray(parsed.affectedFiles)).toBe(true);
    expect(parsed.atomicExecutionPrompt).toContain("ATOMIC CONTRACT SYNCHRONIZATION PLAN");
  });

  it("returns error on wireboard_blast_radius if targetNodeId is missing", async () => {
    const result = await handleMcpToolCall("wireboard_blast_radius", {
      projectPath: "test-fixtures/broken-app",
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("targetNodeId is required");
  });

  it("returns error on unknown tool", async () => {
    const result = await handleMcpToolCall("unknown_tool", {});
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Unknown tool: unknown_tool");
  });
});
