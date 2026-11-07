import path from "node:path";
import { Project } from "ts-morph";
import {
  ArchitectureGraphSchema,
  type AnchorNode,
  type ArchitectureGraph,
  type ContractWire,
  type DiagnosticIssue,
  type GraphSummary,
} from "../types/graph";
import { parsePrismaSchema } from "./parsePrisma";
import { parseEnvExample } from "./parseEnv";
import { scanBackendRoutes } from "./scanBackend";
import { scanFrontendComponents } from "./scanFrontend";

export function scanRepository(projectRoot: string): ArchitectureGraph {
  const resolvedRoot = path.resolve(projectRoot);
  const project = new Project({
    skipAddingFilesFromTsConfig: true,
    compilerOptions: { allowJs: true, jsx: 2 },
  });

  const prismaResult = parsePrismaSchema(resolvedRoot);
  const backendResult = scanBackendRoutes(project, resolvedRoot);
  const frontendResult = scanFrontendComponents(project, resolvedRoot);

  const nodesMap = new Map<string, AnchorNode>();

  // Add all discovered nodes
  for (const node of frontendResult.nodes) {
    nodesMap.set(node.id, node);
  }
  for (const node of backendResult.nodes) {
    nodesMap.set(node.id, node);
  }
  for (const node of prismaResult.nodes) {
    nodesMap.set(node.id, node);
  }

  const wires: ContractWire[] = [];
  const handledSwallowedErrorRoutes = new Set<string>();

  // 1. Wire Type B: Frontend Component -> Backend Route
  for (const fetchCall of frontendResult.fetchCalls) {
    const sourceNode = nodesMap.get(fetchCall.componentNodeId);
    if (!sourceNode) continue;

    const targetRoute = backendResult.routes.find(
      (r) =>
        r.node.routePath === fetchCall.url &&
        r.node.httpMethod === fetchCall.method
    );

    if (!targetRoute) {
      // Case 1 (MISSING_ENDPOINT - RED WIRE): Target backend route not found
      const targetNodeId = `api:${fetchCall.method}:${fetchCall.url}`;
      let targetNode = nodesMap.get(targetNodeId);

      if (!targetNode) {
        const expectedFilePath = `app${fetchCall.url}/route.ts`;
        targetNode = {
          id: targetNodeId,
          kind: "BACKEND_ROUTE",
          label: `${fetchCall.method} ${fetchCall.url}`,
          filePath: expectedFilePath,
          line: 1,
          httpMethod: fetchCall.method,
          routePath: fetchCall.url,
        };
        nodesMap.set(targetNodeId, targetNode);
      }

      const wireId = `wire:${sourceNode.id}->${targetNode.id}`;
      const issueId = `issue:missing-endpoint-${sourceNode.id}-${fetchCall.method}-${fetchCall.url.replace(/\//g, "-")}`;

      const issue: DiagnosticIssue = {
        id: issueId,
        wireId,
        severity: "BROKEN",
        code: "MISSING_ENDPOINT",
        title: `Call to non-existent route ${fetchCall.method} ${fetchCall.url}`,
        explanation: `${sourceNode.label} calls ${fetchCall.method} ${fetchCall.url}, but no matching route handler exists in the backend.`,
        sourceFile: sourceNode.filePath,
        sourceLine: fetchCall.fetchLine,
        targetFile: targetNode.filePath,
        targetLine: targetNode.line,
        repairPrompt: `In ${sourceNode.filePath} (line ${fetchCall.fetchLine}), update the endpoint URL or implement the route handler in ${targetNode.filePath} (line ${targetNode.line}).`,
      };

      wires.push({
        id: wireId,
        sourceId: sourceNode.id,
        targetId: targetNode.id,
        status: "BROKEN",
        label: `${fetchCall.method} ${fetchCall.url}`,
        issues: [issue],
      });
      continue;
    }

    // Matching backend route found
    const wireId = `wire:${sourceNode.id}->${targetRoute.node.id}`;
    const wireIssues: DiagnosticIssue[] = [];

    // Case 2 (FIELD_MISMATCH - RED WIRE): Frontend reads fields not in backend returnsPayload
    if (fetchCall.expectsResponseFields.length > 0) {
      const returnsPayload = targetRoute.node.returnsPayload || {};
      const missingFields = fetchCall.expectsResponseFields.filter(
        (f) => !(f in returnsPayload)
      );

      if (missingFields.length > 0) {
        const expectedShape: Record<string, string> = {};
        for (const f of fetchCall.expectsResponseFields) {
          expectedShape[f] = "string";
        }

        const issue: DiagnosticIssue = {
          id: `issue:field-mismatch-${sourceNode.id}-${targetRoute.node.id}`,
          wireId,
          severity: "BROKEN",
          code: "FIELD_MISMATCH",
          title: `Payload key mismatch: expected [${missingFields.join(", ")}]`,
          explanation: `${sourceNode.label} expects response fields [${missingFields.join(", ")}], but ${targetRoute.node.label} returns [${Object.keys(returnsPayload).join(", ")}].`,
          sourceFile: sourceNode.filePath,
          sourceLine: fetchCall.responseVarLine || fetchCall.fetchLine,
          targetFile: targetRoute.node.filePath,
          targetLine: targetRoute.node.line,
          expectedShape,
          actualShape: returnsPayload,
          repairPrompt: `In ${targetRoute.node.filePath} (line ${targetRoute.node.line}), update the return payload keys to include '${missingFields.join("', '")}' to match ${sourceNode.filePath} (line ${fetchCall.responseVarLine || fetchCall.fetchLine}).`,
        };
        wireIssues.push(issue);
      }
    }

    // Case 3 (TYPE_CHEAT - YELLOW WIRE): Frontend casts response with `as any` or `as unknown`
    if (fetchCall.hasTypeCheat) {
      const issue: DiagnosticIssue = {
        id: `issue:type-cheat-${sourceNode.id}-${targetRoute.node.id}`,
        wireId,
        severity: "SUSPICIOUS",
        code: "TYPE_CHEAT",
        title: "Type assertion `as any` at network boundary",
        explanation: `${sourceNode.label} casts response to \`any\`, masking contract drift.`,
        sourceFile: sourceNode.filePath,
        sourceLine: fetchCall.typeCheatLine || fetchCall.fetchLine,
        targetFile: targetRoute.node.filePath,
        targetLine: targetRoute.node.line,
        repairPrompt: `In ${sourceNode.filePath} (line ${fetchCall.typeCheatLine || fetchCall.fetchLine}), remove \`as any\` and define a typed interface matching ${targetRoute.node.filePath} (line ${targetRoute.node.line}).`,
      };
      wireIssues.push(issue);
    }

    // Case 4 (SWALLOWED_ERROR - YELLOW WIRE): Backend route has catch block returning HTTP 200
    if (targetRoute.swallowedErrors.length > 0) {
      handledSwallowedErrorRoutes.add(targetRoute.node.id);
      for (const err of targetRoute.swallowedErrors) {
        const issue: DiagnosticIssue = {
          id: `issue:swallowed-error-${targetRoute.node.id}-${err.line}`,
          wireId,
          severity: "SUSPICIOUS",
          code: "SWALLOWED_ERROR",
          title: `Swallowed error in catch block returns HTTP ${err.status}`,
          explanation: `Route handler ${targetRoute.node.label} catches errors and returns HTTP ${err.status} instead of a 4xx/5xx status code.`,
          sourceFile: targetRoute.node.filePath,
          sourceLine: err.line,
          targetFile: targetRoute.node.filePath,
          targetLine: targetRoute.node.line,
          repairPrompt: `In ${targetRoute.node.filePath} (line ${err.line}), update the error response status from ${err.status} to 500 for handler at ${targetRoute.node.filePath} (line ${targetRoute.node.line}).`,
        };
        wireIssues.push(issue);
      }
    }

    // Determine wire status precedence: BROKEN > SUSPICIOUS > VERIFIED
    let wireStatus: "VERIFIED" | "SUSPICIOUS" | "BROKEN" = "VERIFIED";
    if (wireIssues.some((i) => i.severity === "BROKEN")) {
      wireStatus = "BROKEN";
    } else if (wireIssues.some((i) => i.severity === "SUSPICIOUS")) {
      wireStatus = "SUSPICIOUS";
    }

    wires.push({
      id: wireId,
      sourceId: sourceNode.id,
      targetId: targetRoute.node.id,
      status: wireStatus,
      label: `${fetchCall.method} ${fetchCall.url}`,
      issues: wireIssues,
    });
  }

  // 2. Wire Type A: Backend Route -> DB Table (SCHEMA_DRIFT)
  for (const route of backendResult.routes) {
    if (route.dbInteractions.length === 0) continue;

    for (const interaction of route.dbInteractions) {
      const modelInfo = prismaResult.models[interaction.model];
      if (!modelInfo) continue;

      const targetDbNode = nodesMap.get(modelInfo.nodeId);
      if (!targetDbNode) continue;

      const wireId = `wire:${route.node.id}->${targetDbNode.id}`;
      const wireIssues: DiagnosticIssue[] = [];

      // Check schema drift
      for (const key of interaction.dataKeys) {
        if (!(key in modelInfo.columns)) {
          // Check for camelCase vs snake_case match
          const cleanKey = key.replace(/_/g, "").toLowerCase();
          const matchedCol = Object.keys(modelInfo.columns).find(
            (col) => col.replace(/_/g, "").toLowerCase() === cleanKey
          );

          const issue: DiagnosticIssue = {
            id: `issue:schema-drift-${route.node.id}-${key}`,
            wireId,
            severity: "BROKEN",
            code: "SCHEMA_DRIFT",
            title: `Column mismatch: ${key} vs ${matchedCol || "unknown"}`,
            explanation: `Backend route writes \`${key}\`, but Prisma model \`${modelInfo.modelName}\` defines \`${matchedCol || "unknown"}\`.`,
            sourceFile: route.node.filePath,
            sourceLine: interaction.line,
            targetFile: modelInfo.filePath,
            targetLine: modelInfo.line,
            expectedShape: matchedCol ? { [matchedCol]: "string" } : undefined,
            actualShape: { [key]: "string" },
            repairPrompt: `In ${route.node.filePath} (line ${interaction.line}), update \`${key}\` to \`${matchedCol || key}\` to match ${modelInfo.filePath} (line ${modelInfo.line}).`,
          };
          wireIssues.push(issue);
        }
      }

      // If route has unhandled swallowed errors, attach them here
      if (
        route.swallowedErrors.length > 0 &&
        !handledSwallowedErrorRoutes.has(route.node.id)
      ) {
        handledSwallowedErrorRoutes.add(route.node.id);
        for (const err of route.swallowedErrors) {
          const issue: DiagnosticIssue = {
            id: `issue:swallowed-error-${route.node.id}-${err.line}`,
            wireId,
            severity: "SUSPICIOUS",
            code: "SWALLOWED_ERROR",
            title: `Swallowed error in catch block returns HTTP ${err.status}`,
            explanation: `Route handler ${route.node.label} catches errors and returns HTTP ${err.status} instead of a 4xx/5xx status code.`,
            sourceFile: route.node.filePath,
            sourceLine: err.line,
            targetFile: route.node.filePath,
            targetLine: route.node.line,
            repairPrompt: `In ${route.node.filePath} (line ${err.line}), update the error response status in catch block from ${err.status} to 500 for handler at ${route.node.filePath} (line ${route.node.line}).`,
          };
          wireIssues.push(issue);
        }
      }

      let wireStatus: "VERIFIED" | "SUSPICIOUS" | "BROKEN" = "VERIFIED";
      if (wireIssues.some((i) => i.severity === "BROKEN")) {
        wireStatus = "BROKEN";
      } else if (wireIssues.some((i) => i.severity === "SUSPICIOUS")) {
        wireStatus = "SUSPICIOUS";
      }

      wires.push({
        id: wireId,
        sourceId: route.node.id,
        targetId: targetDbNode.id,
        status: wireStatus,
        label: `prisma.${interaction.model}.${interaction.operation}`,
        issues: wireIssues,
      });
    }
  }

  // 3. Wire Type C: Supabase Interactions (Frontend Component or Backend Route -> DB Table)
  const allSupabaseInteractions = [
    ...frontendResult.supabaseInteractions,
    ...backendResult.routes.flatMap((r) => r.supabaseInteractions),
  ];

  for (const interaction of allSupabaseInteractions) {
    const sourceNode = nodesMap.get(interaction.sourceNodeId);
    if (!sourceNode) continue;

    const modelInfo = prismaResult.models[interaction.table.toLowerCase()];
    let targetDbNode: AnchorNode;

    if (modelInfo) {
      const existingPrismaNode = nodesMap.get(modelInfo.nodeId);
      if (existingPrismaNode) {
        targetDbNode = existingPrismaNode;
      } else {
        const inferredId = `db:${interaction.table}`;
        targetDbNode = nodesMap.get(inferredId) || {
          id: inferredId,
          kind: "DB_TABLE",
          label: `${interaction.table} (Supabase)`,
          filePath: "supabase",
          line: 1,
        };
        nodesMap.set(inferredId, targetDbNode);
      }
    } else {
      const inferredId = `db:${interaction.table}`;
      targetDbNode = nodesMap.get(inferredId) || {
        id: inferredId,
        kind: "DB_TABLE",
        label: `${interaction.table} (Supabase)`,
        filePath: "supabase",
        line: 1,
      };
      nodesMap.set(inferredId, targetDbNode);
    }

    const wireId = `wire:${sourceNode.id}->${targetDbNode.id}`;
    const wireIssues: DiagnosticIssue[] = [];

    // Check for schema drift if model columns are available
    if (modelInfo && interaction.columns.length > 0) {
      for (const col of interaction.columns) {
        if (!(col in modelInfo.columns)) {
          const cleanKey = col.replace(/_/g, "").toLowerCase();
          const matchedCol = Object.keys(modelInfo.columns).find(
            (c) => c.replace(/_/g, "").toLowerCase() === cleanKey
          );

          const issue: DiagnosticIssue = {
            id: `issue:schema-drift-${sourceNode.id}-${targetDbNode.id}-${col}`,
            wireId,
            severity: "BROKEN",
            code: "SCHEMA_DRIFT",
            title: `Column mismatch: ${col} vs ${matchedCol || "unknown"}`,
            explanation: `${sourceNode.label} writes \`${col}\`, but model \`${modelInfo.modelName}\` defines \`${matchedCol || "unknown"}\`.`,
            sourceFile: interaction.sourceFile,
            sourceLine: interaction.line,
            targetFile: modelInfo.filePath,
            targetLine: modelInfo.line,
            expectedShape: matchedCol ? { [matchedCol]: "string" } : undefined,
            actualShape: { [col]: "string" },
            repairPrompt: `In ${interaction.sourceFile} (line ${interaction.line}), update \`${col}\` to \`${matchedCol || col}\` to match ${modelInfo.filePath} (line ${modelInfo.line}).`,
          };
          wireIssues.push(issue);
        }
      }
    }

    let wireStatus: "VERIFIED" | "SUSPICIOUS" | "BROKEN" = "VERIFIED";
    if (wireIssues.some((i) => i.severity === "BROKEN")) {
      wireStatus = "BROKEN";
    }

    // Deduplicate or append wire
    const existingWireIndex = wires.findIndex((w) => w.id === wireId);
    if (existingWireIndex >= 0) {
      const existingWire = wires[existingWireIndex];
      existingWire.issues.push(...wireIssues);
      if (wireStatus === "BROKEN") existingWire.status = "BROKEN";
    } else {
      wires.push({
        id: wireId,
        sourceId: sourceNode.id,
        targetId: targetDbNode.id,
        status: wireStatus,
        label: `supabase.${interaction.table}.${interaction.operation}`,
        issues: wireIssues,
      });
    }
  }

  // 4. Environment Contract Drift (ENV_DRIFT)
  const envResult = parseEnvExample(resolvedRoot);
  if (envResult) {
    const allEnvAccesses = [
      ...(backendResult.envUsages || []),
      ...(frontendResult.envUsages || []),
    ];

    for (const access of allEnvAccesses) {
      if (access.key === "NODE_ENV") continue;

      if (!envResult.keys.has(access.key)) {
        const node = nodesMap.get(access.nodeId);
        let targetWire =
          wires.find((w) => w.sourceId === access.nodeId) ||
          wires.find((w) => w.targetId === access.nodeId);

        let wireId: string;
        if (targetWire) {
          wireId = targetWire.id;
        } else {
          wireId = `wire:${access.nodeId}->env`;
          targetWire = {
            id: wireId,
            sourceId: access.nodeId,
            targetId: access.nodeId,
            status: "SUSPICIOUS",
            label: "process.env",
            issues: [],
          };
          wires.push(targetWire);
        }

        const issueId = `issue:env-drift-${access.nodeId}-${access.key}-${access.line}`;
        const issue: DiagnosticIssue = {
          id: issueId,
          wireId,
          severity: "SUSPICIOUS",
          code: "ENV_DRIFT",
          title: `Environment variable drift: ${access.key} not in .env.example`,
          explanation: `${node?.label || access.nodeId} references process.env.${access.key}, which is not declared in .env.example.`,
          sourceFile: access.filePath,
          sourceLine: access.line,
          targetFile: envResult.envPath,
          targetLine: 1,
          repairPrompt: `In ${access.filePath} (line ${access.line}), update process.env.${access.key} to match a declared variable in ${envResult.envPath} (such as ${Array.from(envResult.keys)[0] || "declared variable"}), or declare ${access.key} in ${envResult.envPath}.`,
        };

        targetWire.issues.push(issue);
        if (targetWire.status !== "BROKEN") {
          targetWire.status = "SUSPICIOUS";
        }
      }
    }
  }

  const nodes = Array.from(nodesMap.values());
  const allIssues = wires.flatMap((w) => w.issues);

  const summary: GraphSummary = {
    totalNodes: nodes.length,
    verifiedWires: wires.filter((w) => w.status === "VERIFIED").length,
    brokenWires: wires.filter((w) => w.status === "BROKEN").length,
    suspiciousWires: wires.filter((w) => w.status === "SUSPICIOUS").length,
  };

  const graph: ArchitectureGraph = {
    projectName: path.basename(projectRoot),
    scannedAt: new Date().toISOString(),
    nodes,
    wires,
    issues: allIssues,
    summary,
  };

  return ArchitectureGraphSchema.parse(graph);
}
