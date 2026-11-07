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

  it("resolves variable returns, request body accesses, unchecked Supabase errors, and server actions", () => {
    const project = new Project({
      skipAddingFilesFromTsConfig: true,
      compilerOptions: { allowJs: true, jsx: 2 },
    });

    // 1. API route with variable return, destructuring from body, and unchecked Supabase query
    project.createSourceFile(
      "src/app/api/advanced/route.ts",
      `
      import { NextResponse } from "next/server";

      export async function POST(req: Request) {
        const body = await req.json();
        const { email, password } = body;

        // Unchecked Supabase insert (only destructuring data, ignoring error)
        const { data } = await supabase.from("accounts").insert({ email });

        const payload = {
          accountId: "acc_1",
          status: "active",
        };

        return NextResponse.json(payload);
      }
      `
    );

    // 2. Server Action file
    project.createSourceFile(
      "src/app/actions/userActions.ts",
      `
      "use server";

      export async function updateUserRole(userId: string, role: string) {
        const { data, error } = await supabase.from("profiles").update({ role });
        return { success: true };
      }
      `
    );

    const result = scanBackendRoutes(project, path.resolve("src"));

    // Check POST /api/advanced
    const advRoute = result.routes.find((r) => r.node.id === "api:POST:/api/advanced");
    expect(advRoute).toBeDefined();
    expect(advRoute?.node.expectsPayload).toEqual({
      email: "string",
      password: "string",
    });
    expect(advRoute?.node.returnsPayload).toEqual({
      accountId: "string",
      status: "string",
    });
    expect(advRoute?.uncheckedDbErrors).toHaveLength(1);
    expect(advRoute?.uncheckedDbErrors[0].table).toBe("accounts");

    // Check Server Action
    const actionNode = result.nodes.find((n) => n.kind === "SERVER_ACTION");
    expect(actionNode).toBeDefined();
    expect(actionNode?.label).toBe("action updateUserRole()");

    const actionRoute = result.routes.find((r) => r.node.id === actionNode?.id);
    expect(actionRoute?.supabaseInteractions).toHaveLength(1);
    // Error was destructured ({ data, error }), so uncheckedDbErrors is 0
    expect(actionRoute?.uncheckedDbErrors).toHaveLength(0);
  });
});
