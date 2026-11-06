import fs from "node:fs";
import path from "node:path";
import type { AnchorNode } from "../types/graph";

export interface PrismaModelLookup {
  nodeId: string;
  modelName: string;
  columns: Record<string, string>;
  line: number;
  filePath: string;
}

export interface ParsePrismaResult {
  nodes: AnchorNode[];
  models: Record<string, PrismaModelLookup>;
}

export function parsePrismaSchema(projectRoot: string): ParsePrismaResult {
  const possiblePaths = [
    path.join(projectRoot, "prisma", "schema.prisma"),
    path.join(projectRoot, "schema.prisma"),
  ];

  const schemaPath = possiblePaths.find((p) => fs.existsSync(p));
  if (!schemaPath) {
    return { nodes: [], models: {} };
  }

  const content = fs.readFileSync(schemaPath, "utf-8");
  const relFilePath = path.relative(projectRoot, schemaPath).replace(/\\/g, "/");
  const lines = content.split(/\r?\n/);

  const nodes: AnchorNode[] = [];
  const models: Record<string, PrismaModelLookup> = {};

  let currentModel: { name: string; startLine: number; columns: Record<string, string> } | null = null;

  for (let i = 0; i < lines.length; i++) {
    const lineNumber = i + 1;
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    if (!trimmed || trimmed.startsWith("//")) {
      continue;
    }

    const modelMatch = trimmed.match(/^model\s+([A-Za-z0-9_]+)\s*\{/);
    if (modelMatch) {
      currentModel = {
        name: modelMatch[1],
        startLine: lineNumber,
        columns: {},
      };
      continue;
    }

    if (currentModel) {
      if (trimmed === "}" || trimmed.startsWith("}")) {
        const nodeId = `db:${currentModel.name}`;
        const node: AnchorNode = {
          id: nodeId,
          kind: "DB_TABLE",
          label: currentModel.name,
          filePath: relFilePath,
          line: currentModel.startLine,
          returnsPayload: currentModel.columns,
        };

        nodes.push(node);
        models[currentModel.name.toLowerCase()] = {
          nodeId,
          modelName: currentModel.name,
          columns: currentModel.columns,
          line: currentModel.startLine,
          filePath: relFilePath,
        };

        currentModel = null;
        continue;
      }

      // Ignore block attributes like @@map or @@index
      if (trimmed.startsWith("@@")) {
        continue;
      }

      // Field line: <name> <type> [attributes...]
      const fieldMatch = trimmed.match(/^([A-Za-z0-9_]+)\s+([A-Za-z0-9_?[\]]+)/);
      if (fieldMatch) {
        const fieldName = fieldMatch[1];
        const fieldType = fieldMatch[2];
        currentModel.columns[fieldName] = fieldType;
      }
    }
  }

  return { nodes, models };
}
