import { describe, it, expect } from "vitest";
import path from "node:path";
import { Project } from "ts-morph";
import { scanFrontendComponents } from "../scanFrontend";

describe("scanFrontendComponents", () => {
  const fixtureRoot = path.resolve(__dirname, "../../../test-fixtures/broken-app");

  it("extracts frontend components and fetch calls with type cheating detection and property tracing", () => {
    const project = new Project({
      skipAddingFilesFromTsConfig: true,
      compilerOptions: { allowJs: true, jsx: 2 },
    });

    const result = scanFrontendComponents(project, fixtureRoot);

    expect(result.nodes).toHaveLength(2);

    // 1. RegisterForm
    const regNode = result.nodes.find((n) => n.id === "fe:RegisterForm.tsx");
    expect(regNode).toBeDefined();
    expect(regNode?.kind).toBe("FRONTEND_COMPONENT");
    expect(regNode?.label).toBe("RegisterForm");
    expect(regNode?.filePath).toBe("app/register/RegisterForm.tsx");
    expect(regNode?.line).toBe(5);

    const regFetch = result.fetchCalls.find(
      (c) => c.componentNodeId === "fe:RegisterForm.tsx"
    );
    expect(regFetch).toBeDefined();
    expect(regFetch?.url).toBe("/api/register");
    expect(regFetch?.method).toBe("POST");
    expect(regFetch?.fetchLine).toBe(12);
    expect(regFetch?.hasTypeCheat).toBe(true);
    expect(regFetch?.typeCheatLine).toBe(20);
    expect(regFetch?.expectsResponseFields).toContain("userId");
    expect(regFetch?.expectsResponseFields).toContain("sessionToken");

    // 2. ProjectList
    const projNode = result.nodes.find((n) => n.id === "fe:ProjectList.tsx");
    expect(projNode).toBeDefined();
    expect(projNode?.kind).toBe("FRONTEND_COMPONENT");
    expect(projNode?.label).toBe("ProjectList");
    expect(projNode?.filePath).toBe("app/dashboard/ProjectList.tsx");
    expect(projNode?.line).toBe(11);

    const projCalls = result.fetchCalls.filter(
      (c) => c.componentNodeId === "fe:ProjectList.tsx"
    );
    expect(projCalls).toHaveLength(2);

    const getCall = projCalls.find((c) => c.method === "GET");
    expect(getCall).toBeDefined();
    expect(getCall?.url).toBe("/api/projects");
    expect(getCall?.fetchLine).toBe(17);
    expect(getCall?.hasTypeCheat).toBe(false);
    expect(getCall?.expectsResponseFields).toEqual(["projects"]);

    const deleteCall = projCalls.find((c) => c.method === "DELETE");
    expect(deleteCall).toBeDefined();
    expect(deleteCall?.url).toBe("/api/v1/projects/delete");
    expect(deleteCall?.fetchLine).toBe(29);
    expect(deleteCall?.hasTypeCheat).toBe(false);
    expect(deleteCall?.expectsResponseFields).toEqual([]);
  });
});
