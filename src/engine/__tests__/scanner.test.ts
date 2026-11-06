import { describe, it, expect } from "vitest";
import path from "node:path";
import { scanRepository } from "../buildGraph";
import { ArchitectureGraphSchema } from "../../types/graph";

describe("scanRepository Integration Test", () => {
  const brokenAppPath = path.resolve(__dirname, "../../../test-fixtures/broken-app");

  it("scans broken-app, detects all 5 deliberate bugs, and validates the schema", () => {
    const graph = scanRepository(brokenAppPath);

    // Schema validation
    expect(() => ArchitectureGraphSchema.parse(graph)).not.toThrow();

    // 1. All 5 deliberate bugs are detected
    const codes = graph.issues.map((i) => i.code);
    expect(codes).toContain("SCHEMA_DRIFT");
    expect(codes).toContain("FIELD_MISMATCH");
    expect(codes).toContain("TYPE_CHEAT");
    expect(codes).toContain("SWALLOWED_ERROR");
    expect(codes).toContain("MISSING_ENDPOINT");

    // Bug 1: SCHEMA_DRIFT on subscriptionTier
    const schemaDriftIssue = graph.issues.find((i) => i.code === "SCHEMA_DRIFT");
    expect(schemaDriftIssue).toBeDefined();
    expect(schemaDriftIssue?.severity).toBe("BROKEN");
    expect(schemaDriftIssue?.explanation).toContain("subscriptionTier");
    expect(schemaDriftIssue?.sourceFile).toContain("app/api/register/route.ts");
    expect(schemaDriftIssue?.targetFile).toContain("prisma/schema.prisma");

    // Bug 2: FIELD_MISMATCH on userId / sessionToken
    const fieldMismatchIssue = graph.issues.find((i) => i.code === "FIELD_MISMATCH");
    expect(fieldMismatchIssue).toBeDefined();
    expect(fieldMismatchIssue?.severity).toBe("BROKEN");
    expect(fieldMismatchIssue?.explanation).toContain("userId");
    expect(fieldMismatchIssue?.sourceFile).toContain("app/register/RegisterForm.tsx");
    expect(fieldMismatchIssue?.targetFile).toContain("app/api/register/route.ts");

    // Bug 3: TYPE_CHEAT on as any
    const typeCheatIssue = graph.issues.find((i) => i.code === "TYPE_CHEAT");
    expect(typeCheatIssue).toBeDefined();
    expect(typeCheatIssue?.severity).toBe("SUSPICIOUS");
    expect(typeCheatIssue?.sourceFile).toContain("app/register/RegisterForm.tsx");

    // Bug 4: SWALLOWED_ERROR on POST /api/projects
    const swallowedErrorIssue = graph.issues.find((i) => i.code === "SWALLOWED_ERROR");
    expect(swallowedErrorIssue).toBeDefined();
    expect(swallowedErrorIssue?.severity).toBe("SUSPICIOUS");
    expect(swallowedErrorIssue?.sourceFile).toContain("app/api/projects/route.ts");
    expect(swallowedErrorIssue?.explanation).toContain("200");

    // Bug 5: MISSING_ENDPOINT on DELETE /api/v1/projects/delete
    const missingEndpointIssue = graph.issues.find((i) => i.code === "MISSING_ENDPOINT");
    expect(missingEndpointIssue).toBeDefined();
    expect(missingEndpointIssue?.severity).toBe("BROKEN");
    expect(missingEndpointIssue?.explanation).toContain("/api/v1/projects/delete");
    expect(missingEndpointIssue?.sourceFile).toContain("app/dashboard/ProjectList.tsx");

    // 2. The GET /api/projects connection is VERIFIED (Green wire) with 0 issues
    const getProjectsWire = graph.wires.find(
      (w) =>
        w.sourceId === "fe:ProjectList.tsx" &&
        w.targetId === "api:GET:/api/projects"
    );
    expect(getProjectsWire).toBeDefined();
    expect(getProjectsWire?.status).toBe("VERIFIED");
    expect(getProjectsWire?.issues).toHaveLength(0);

    // 3. Every DiagnosticIssue contains a non-empty repairPrompt referencing file paths and line numbers
    for (const issue of graph.issues) {
      expect(issue.repairPrompt).toBeTruthy();
      expect(issue.repairPrompt.length).toBeGreaterThan(15);
      // Verify source file reference
      expect(issue.repairPrompt).toContain(issue.sourceFile);
      // Verify line number reference
      expect(issue.repairPrompt).toMatch(/line \d+/);
      // If targetFile is present, verify targetFile reference
      if (issue.targetFile) {
        expect(issue.repairPrompt).toContain(issue.targetFile);
      }
    }

    // Summary assertions
    expect(graph.summary.verifiedWires).toBeGreaterThanOrEqual(1);
    expect(graph.summary.brokenWires).toBe(3);
    expect(graph.summary.suspiciousWires).toBe(1);
  });
});
