import { describe, it, expect } from "vitest";
import path from "node:path";
import { Project } from "ts-morph";
import { scanBackendRoutes } from "../scanBackend";

describe("scanBackendRoutes", () => {
  const fixtureRoot = path.resolve(__dirname, "../../../test-fixtures/broken-app");

  it("extracts backend route handlers with expectsPayload, returnsPayload, dbInteractions, and swallowedErrors", () => {
    const project = new Project({
      skipAddingFilesFromTsConfig: true,
      compilerOptions: { allowJs: true, jsx: 2 },
    });

    const result = scanBackendRoutes(project, fixtureRoot);

    expect(result.nodes).toHaveLength(3);

    // 1. POST /api/register
    const postRegister = result.routes.find(
      (r) => r.node.id === "api:POST:/api/register"
    );
    expect(postRegister).toBeDefined();
    expect(postRegister?.node.kind).toBe("BACKEND_ROUTE");
    expect(postRegister?.node.httpMethod).toBe("POST");
    expect(postRegister?.node.routePath).toBe("/api/register");
    expect(postRegister?.node.filePath).toBe("app/api/register/route.ts");
    expect(postRegister?.node.line).toBe(15);
    expect(postRegister?.node.expectsPayload).toEqual({
      email: "string",
      password: "string",
    });
    expect(postRegister?.node.returnsPayload).toEqual({
      user_id: "string",
      token: "string",
    });
    expect(postRegister?.dbInteractions).toEqual([
      {
        model: "user",
        operation: "create",
        dataKeys: ["email", "password_hash", "subscriptionTier"],
        line: expect.any(Number),
      },
    ]);
    expect(postRegister?.swallowedErrors).toHaveLength(0);

    // 2. GET /api/projects
    const getProjects = result.routes.find(
      (r) => r.node.id === "api:GET:/api/projects"
    );
    expect(getProjects).toBeDefined();
    expect(getProjects?.node.kind).toBe("BACKEND_ROUTE");
    expect(getProjects?.node.httpMethod).toBe("GET");
    expect(getProjects?.node.routePath).toBe("/api/projects");
    expect(getProjects?.node.filePath).toBe("app/api/projects/route.ts");
    expect(getProjects?.node.line).toBe(17);
    expect(getProjects?.node.returnsPayload).toHaveProperty("projects");
    expect(getProjects?.swallowedErrors).toHaveLength(0);

    // 3. POST /api/projects
    const postProjects = result.routes.find(
      (r) => r.node.id === "api:POST:/api/projects"
    );
    expect(postProjects).toBeDefined();
    expect(postProjects?.node.kind).toBe("BACKEND_ROUTE");
    expect(postProjects?.node.httpMethod).toBe("POST");
    expect(postProjects?.node.routePath).toBe("/api/projects");
    expect(postProjects?.node.filePath).toBe("app/api/projects/route.ts");
    expect(postProjects?.node.line).toBe(24);
    expect(postProjects?.node.expectsPayload).toEqual({
      name: "string",
      ownerId: "string",
    });
    expect(postProjects?.dbInteractions).toEqual([
      {
        model: "project",
        operation: "create",
        dataKeys: ["name", "owner_id"],
        line: expect.any(Number),
      },
    ]);
    expect(postProjects?.swallowedErrors).toHaveLength(1);
    expect(postProjects?.swallowedErrors[0].status).toBe(200);
    expect(postProjects?.swallowedErrors[0].line).toBe(34);
  });
});
