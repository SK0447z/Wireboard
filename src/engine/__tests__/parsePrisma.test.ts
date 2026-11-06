import { describe, it, expect } from "vitest";
import path from "node:path";
import { parsePrismaSchema } from "../parsePrisma";

describe("parsePrismaSchema", () => {
  const fixtureRoot = path.resolve(__dirname, "../../../test-fixtures/broken-app");

  it("parses schema.prisma and returns AnchorNodes of kind DB_TABLE", () => {
    const result = parsePrismaSchema(fixtureRoot);

    expect(result.nodes).toHaveLength(2);

    const userNode = result.nodes.find((n) => n.id === "db:User");
    expect(userNode).toBeDefined();
    expect(userNode?.kind).toBe("DB_TABLE");
    expect(userNode?.label).toBe("User");
    expect(userNode?.filePath).toBe("prisma/schema.prisma");
    expect(userNode?.line).toBe(10);
    expect(userNode?.returnsPayload).toEqual({
      id: "String",
      email: "String",
      password_hash: "String",
      subscription_tier: "String",
    });

    const projectNode = result.nodes.find((n) => n.id === "db:Project");
    expect(projectNode).toBeDefined();
    expect(projectNode?.kind).toBe("DB_TABLE");
    expect(projectNode?.label).toBe("Project");
    expect(projectNode?.filePath).toBe("prisma/schema.prisma");
    expect(projectNode?.line).toBe(17);
    expect(projectNode?.returnsPayload).toEqual({
      id: "String",
      name: "String",
      owner_id: "String",
    });
  });

  it("returns lookup map with lowercased model names and column info", () => {
    const result = parsePrismaSchema(fixtureRoot);

    expect(result.models.user).toBeDefined();
    expect(result.models.user.nodeId).toBe("db:User");
    expect(result.models.user.modelName).toBe("User");
    expect(result.models.user.line).toBe(10);
    expect(result.models.user.filePath).toBe("prisma/schema.prisma");
    expect(result.models.user.columns).toEqual({
      id: "String",
      email: "String",
      password_hash: "String",
      subscription_tier: "String",
    });

    expect(result.models.project).toBeDefined();
    expect(result.models.project.nodeId).toBe("db:Project");
    expect(result.models.project.modelName).toBe("Project");
    expect(result.models.project.columns).toEqual({
      id: "String",
      name: "String",
      owner_id: "String",
    });
  });

  it("returns empty result when schema.prisma is missing", () => {
    const result = parsePrismaSchema(path.resolve(__dirname, "../../../non-existent-dir"));
    expect(result.nodes).toEqual([]);
    expect(result.models).toEqual({});
  });
});
