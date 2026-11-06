import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  ArchitectureGraphSchema,
  AnchorNodeSchema,
  ContractWireSchema,
  DiagnosticIssueSchema,
  type ArchitectureGraph,
} from "../graph";

describe("ArchitectureGraph Schema", () => {
  it("successfully parses a valid sample ArchitectureGraph matching the broken-app scenario", () => {
    const sampleGraph: ArchitectureGraph = {
      projectName: "broken-app",
      scannedAt: new Date().toISOString(),
      nodes: [
        {
          id: "fe:RegisterForm.tsx",
          kind: "FRONTEND_COMPONENT",
          label: "RegisterForm",
          filePath: "app/register/RegisterForm.tsx",
          line: 5,
        },
        {
          id: "api:POST:/api/register",
          kind: "BACKEND_ROUTE",
          label: "POST /api/register",
          filePath: "app/api/register/route.ts",
          line: 16,
          httpMethod: "POST",
          routePath: "/api/register",
          expectsPayload: { email: "string", password: "string" },
          returnsPayload: { user_id: "string", token: "string" },
        },
        {
          id: "db:users",
          kind: "DB_TABLE",
          label: "users",
          filePath: "prisma/schema.prisma",
          line: 10,
          expectsPayload: {
            id: "string",
            email: "string",
            password_hash: "string",
            subscription_tier: "string",
          },
        },
        {
          id: "fe:ProjectList.tsx",
          kind: "FRONTEND_COMPONENT",
          label: "ProjectList",
          filePath: "app/dashboard/ProjectList.tsx",
          line: 11,
        },
        {
          id: "api:GET:/api/projects",
          kind: "BACKEND_ROUTE",
          label: "GET /api/projects",
          filePath: "app/api/projects/route.ts",
          line: 16,
          httpMethod: "GET",
          routePath: "/api/projects",
          returnsPayload: { "projects[]": "object" },
        },
        {
          id: "api:POST:/api/projects",
          kind: "BACKEND_ROUTE",
          label: "POST /api/projects",
          filePath: "app/api/projects/route.ts",
          line: 23,
          httpMethod: "POST",
          routePath: "/api/projects",
          expectsPayload: { name: "string", ownerId: "string" },
        },
      ],
      wires: [
        {
          id: "wire:fe-reg-api-reg",
          sourceId: "fe:RegisterForm.tsx",
          targetId: "api:POST:/api/register",
          status: "BROKEN",
          label: "POST /api/register",
          issues: [
            {
              id: "issue:field-mismatch-userid",
              wireId: "wire:fe-reg-api-reg",
              severity: "BROKEN",
              code: "FIELD_MISMATCH",
              title: "Payload key mismatch: userId vs user_id",
              explanation:
                "RegisterForm reads `userId` and `sessionToken` from response, but /api/register returns `user_id` and `token`.",
              sourceFile: "app/register/RegisterForm.tsx",
              sourceLine: 20,
              targetFile: "app/api/register/route.ts",
              targetLine: 28,
              expectedShape: { userId: "string", sessionToken: "string" },
              actualShape: { user_id: "string", token: "string" },
              repairPrompt:
                "In app/api/register/route.ts, update the return payload keys from `user_id` to `userId` and `token` to `sessionToken` to match the frontend contract.",
            },
            {
              id: "issue:type-cheat-any",
              wireId: "wire:fe-reg-api-reg",
              severity: "SUSPICIOUS",
              code: "TYPE_CHEAT",
              title: "Type assertion `as any` at network boundary",
              explanation:
                "RegisterForm casts response to `any`, masking contract drift.",
              sourceFile: "app/register/RegisterForm.tsx",
              sourceLine: 16,
              repairPrompt:
                "Define a typed interface for the response of POST /api/register and remove `as any`.",
            },
          ],
        },
        {
          id: "wire:api-reg-db-user",
          sourceId: "api:POST:/api/register",
          targetId: "db:users",
          status: "BROKEN",
          label: "prisma.user.create",
          issues: [
            {
              id: "issue:schema-drift-sub-tier",
              wireId: "wire:api-reg-db-user",
              severity: "BROKEN",
              code: "SCHEMA_DRIFT",
              title: "Column mismatch: subscriptionTier vs subscription_tier",
              explanation:
                "Backend route writes `subscriptionTier`, but Prisma schema defines `subscription_tier`.",
              sourceFile: "app/api/register/route.ts",
              sourceLine: 22,
              targetFile: "prisma/schema.prisma",
              targetLine: 14,
              expectedShape: { subscription_tier: "string" },
              actualShape: { subscriptionTier: "string" },
              repairPrompt:
                "In app/api/register/route.ts, change `subscriptionTier: \"free\"` to `subscription_tier: \"free\"`.",
            },
          ],
        },
        {
          id: "wire:fe-proj-api-proj-get",
          sourceId: "fe:ProjectList.tsx",
          targetId: "api:GET:/api/projects",
          status: "VERIFIED",
          label: "GET /api/projects",
          issues: [],
        },
        {
          id: "wire:fe-proj-api-delete",
          sourceId: "fe:ProjectList.tsx",
          targetId: "api:DELETE:/api/v1/projects/delete",
          status: "BROKEN",
          label: "DELETE /api/v1/projects/delete",
          issues: [
            {
              id: "issue:missing-endpoint-delete",
              wireId: "wire:fe-proj-api-delete",
              severity: "BROKEN",
              code: "MISSING_ENDPOINT",
              title: "Call to non-existent route /api/v1/projects/delete",
              explanation:
                "ProjectList calls DELETE /api/v1/projects/delete, but no matching route handler exists.",
              sourceFile: "app/dashboard/ProjectList.tsx",
              sourceLine: 26,
              repairPrompt:
                "Implement route handler for DELETE /api/v1/projects/delete or update frontend call.",
            },
          ],
        },
      ],
      issues: [],
      summary: {
        totalNodes: 6,
        verifiedWires: 1,
        brokenWires: 3,
        suspiciousWires: 0,
      },
    };

    // Flatten issues into graph.issues
    sampleGraph.issues = sampleGraph.wires.flatMap((w) => w.issues);

    const parsed = ArchitectureGraphSchema.parse(sampleGraph);
    expect(parsed.projectName).toBe("broken-app");
    expect(parsed.nodes).toHaveLength(6);
    expect(parsed.wires).toHaveLength(4);
    expect(parsed.issues).toHaveLength(4);
    expect(parsed.summary.verifiedWires).toBe(1);
    expect(parsed.summary.brokenWires).toBe(3);
  });

  it("fails validation when invalid wire status or kind is provided", () => {
    expect(() =>
      AnchorNodeSchema.parse({
        id: "bad:node",
        kind: "UNKNOWN_KIND",
        label: "Bad Node",
        filePath: "bad.ts",
        line: 1,
      })
    ).toThrow();

    expect(() =>
      ContractWireSchema.parse({
        id: "bad:wire",
        sourceId: "n1",
        targetId: "n2",
        status: "INVALID_STATUS",
        issues: [],
      })
    ).toThrow();

    expect(() =>
      DiagnosticIssueSchema.parse({
        id: "bad:issue",
        wireId: "w1",
        severity: "VERIFIED",
        code: "INVALID_CODE",
        title: "Bad",
        explanation: "Bad",
        sourceFile: "a.ts",
        sourceLine: 1,
        repairPrompt: "Fix",
      })
    ).toThrow();
  });
});

describe("Broken App Test Fixtures", () => {
  const fixtureDir = path.resolve(__dirname, "../../../test-fixtures/broken-app");

  const expectedFiles = [
    "prisma/schema.prisma",
    "app/api/register/route.ts",
    "app/register/RegisterForm.tsx",
    "app/api/projects/route.ts",
    "app/dashboard/ProjectList.tsx",
  ];

  it.each(expectedFiles)("fixture file exists: %s", (relPath) => {
    const fullPath = path.join(fixtureDir, relPath);
    expect(fs.existsSync(fullPath)).toBe(true);
    const content = fs.readFileSync(fullPath, "utf-8");
    expect(content.length).toBeGreaterThan(0);
  });

  it("verifies fixture files contain the required bug signatures", () => {
    // 1. Prisma schema
    const schemaContent = fs.readFileSync(
      path.join(fixtureDir, "prisma/schema.prisma"),
      "utf-8"
    );
    expect(schemaContent).toContain("model User");
    expect(schemaContent).toContain("subscription_tier String");
    expect(schemaContent).toContain("model Project");

    // 2. Register route (Bug 1: schema drift, Bug 2: field mismatch)
    const registerRoute = fs.readFileSync(
      path.join(fixtureDir, "app/api/register/route.ts"),
      "utf-8"
    );
    expect(registerRoute).toContain("subscriptionTier: \"free\"");
    expect(registerRoute).toContain("user_id: user.id");
    expect(registerRoute).toContain("token: \"jwt_123\"");

    // 3. RegisterForm (Bug 3: type cheat as any, Bug 2: consumer reads userId)
    const registerForm = fs.readFileSync(
      path.join(fixtureDir, "app/register/RegisterForm.tsx"),
      "utf-8"
    );
    expect(registerForm).toContain("as any");
    expect(registerForm).toContain("data.userId");
    expect(registerForm).toContain("data.sessionToken");

    // 4. Projects route (Bug 4: swallowed error 200, Healthy GET)
    const projectsRoute = fs.readFileSync(
      path.join(fixtureDir, "app/api/projects/route.ts"),
      "utf-8"
    );
    expect(projectsRoute).toContain("async function GET()");
    expect(projectsRoute).toContain("status: 200");
    expect(projectsRoute).toContain("catch (err)");
    expect(projectsRoute).toContain("{ error: \"Failed\" }, { status: 200 }");

    // 5. ProjectList (Healthy GET wire + Bug 5: missing endpoint)
    const projectList = fs.readFileSync(
      path.join(fixtureDir, "app/dashboard/ProjectList.tsx"),
      "utf-8"
    );
    expect(projectList).toContain("fetch(\"/api/projects\", { method: \"GET\" })");
    expect(projectList).toContain("data.projects");
    expect(projectList).toContain("/api/v1/projects/delete");
    expect(projectList).toContain("method: \"DELETE\"");
  });
});

