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
import { routesMatch } from "./routeMatcher";
import { extractCodeSnippet } from "./snippetExtractor";

export interface ScanOptions {
  detectDeadEndpoints?: boolean;
  detectMissingErrorHandling?: boolean;
}

export function scanRepository(
  projectRoot: string,
  options?: ScanOptions
): ArchitectureGraph {
  const resolvedRoot = path.resolve(projectRoot);
  const project = new Project({
    skipAddingFilesFromTsConfig: true,
    compilerOptions: { allowJs: true, jsx: 2 },
  });

  const prismaResult = parsePrismaSchema(resolvedRoot);
  const backendResult = scanBackendRoutes(project, resolvedRoot);
  const frontendResult = scanFrontendComponents(project, resolvedRoot);

  const nodesMap = new Map<string, AnchorNode>();

  // Helper to attach code snippets
  const getSnippet = (filePath: string, line: number) => {
    const absPath = path.isAbsolute(filePath) ? filePath : path.resolve(resolvedRoot, filePath);
    const snippet = extractCodeSnippet(absPath, line, 2);
    return snippet ? snippet : undefined;
  };

  // Add all discovered nodes
  for (const node of frontendResult.nodes) {
    node.codeSnippet = getSnippet(node.filePath, node.line);
    nodesMap.set(node.id, node);
  }
  for (const node of backendResult.nodes) {
    node.codeSnippet = getSnippet(node.filePath, node.line);
    nodesMap.set(node.id, node);
  }
  for (const node of prismaResult.nodes) {
    node.codeSnippet = getSnippet(node.filePath, node.line);
    nodesMap.set(node.id, node);
  }

  // Add external service nodes
  for (const ext of frontendResult.externalServices || []) {
    const extNodeId = `ext:${ext.serviceName}`;
    if (!nodesMap.has(extNodeId)) {
      const extNode: AnchorNode = {
        id: extNodeId,
        kind: "EXTERNAL_SERVICE",
        label: `${ext.serviceName.toUpperCase()} API`,
        filePath: ext.filePath,
        line: ext.line,
        codeSnippet: getSnippet(ext.filePath, ext.line),
      };
      nodesMap.set(extNodeId, extNode);
    }
  }

  const wires: ContractWire[] = [];
  const handledSwallowedErrorRoutes = new Set<string>();
  const calledBackendRouteIds = new Set<string>();

  // 1. Wire Type B: Frontend Component -> Backend Route
  for (const fetchCall of frontendResult.fetchCalls) {
    const sourceNode = nodesMap.get(fetchCall.componentNodeId);
    if (!sourceNode) continue;

    // Use routesMatch to handle query strings, hash fragments, and dynamic segments positionally
    const targetRoute = backendResult.routes.find(
      (r) =>
        r.node.routePath &&
        routesMatch(fetchCall.url, r.node.routePath) &&
        r.node.httpMethod === fetchCall.method
    );

    if (!targetRoute) {
      // Case 1 (MISSING_ENDPOINT - RED WIRE): Target backend route not found
      const targetNodeId = `api:${fetchCall.method}:${fetchCall.url}`;
      let targetNode = nodesMap.get(targetNodeId);

      if (!targetNode) {
        const cleanUrl = fetchCall.url.split("?")[0].split("#")[0];
        const expectedFilePath = `app${cleanUrl}/route.ts`;
        targetNode = {
          id: targetNodeId,
          kind: "BACKEND_ROUTE",
          label: `${fetchCall.method} ${fetchCall.url}`,
          filePath: expectedFilePath,
          line: 1,
          httpMethod: fetchCall.method,
          routePath: cleanUrl,
        };
        nodesMap.set(targetNodeId, targetNode);
      }

      const wireId = `wire:${sourceNode.id}->${targetNode.id}`;
      const issueId = `issue:missing-endpoint-${sourceNode.id}-${fetchCall.method}-${fetchCall.url.replace(/[\/?#=&]/g, "-")}`;

      const issue: DiagnosticIssue = {
        id: issueId,
        wireId,
        severity: "BROKEN",
        code: "MISSING_ENDPOINT",
        confidence: "HIGH",
        title: `Call to non-existent route ${fetchCall.method} ${fetchCall.url}`,
        explanation: `${sourceNode.label} calls ${fetchCall.method} ${fetchCall.url}, but no matching route handler exists in the backend.`,
        sourceFile: sourceNode.filePath,
        sourceLine: fetchCall.fetchLine,
        targetFile: targetNode.filePath,
        targetLine: targetNode.line,
        sourceSnippet: getSnippet(sourceNode.filePath, fetchCall.fetchLine),
        targetSnippet: getSnippet(targetNode.filePath, targetNode.line),
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
    calledBackendRouteIds.add(targetRoute.node.id);
    const wireId = `wire:${sourceNode.id}->${targetRoute.node.id}`;
    const wireIssues: DiagnosticIssue[] = [];

    // Case 2 (REQUEST_MISMATCH - RED WIRE): Frontend sends request body keys missing from what Backend expects
    if (
      targetRoute.node.expectsPayload &&
      fetchCall.sentBodyFields &&
      fetchCall.sentBodyFields.length > 0
    ) {
      const expectedKeys = Object.keys(targetRoute.node.expectsPayload);
      const sentKeys = fetchCall.sentBodyFields;
      const missingKeys = expectedKeys.filter((k) => !sentKeys.includes(k));

      if (missingKeys.length > 0) {
        const sentShape: Record<string, string> = {};
        for (const k of sentKeys) sentShape[k] = "string";

        const issue: DiagnosticIssue = {
          id: `issue:request-mismatch-${sourceNode.id}-${targetRoute.node.id}`,
          wireId,
          severity: "BROKEN",
          code: "REQUEST_MISMATCH",
          confidence: "HIGH",
          title: `Request body mismatch: missing [${missingKeys.join(", ")}]`,
          explanation: `${sourceNode.label} sends [${sentKeys.join(", ")}], but ${targetRoute.node.label} expects [${expectedKeys.join(", ")}].`,
          sourceFile: sourceNode.filePath,
          sourceLine: fetchCall.fetchLine,
          targetFile: targetRoute.node.filePath,
          targetLine: targetRoute.node.line,
          sourceSnippet: getSnippet(sourceNode.filePath, fetchCall.fetchLine),
          targetSnippet: getSnippet(targetRoute.node.filePath, targetRoute.node.line),
          expectedShape: targetRoute.node.expectsPayload,
          actualShape: sentShape,
          repairPrompt: `In ${sourceNode.filePath} (line ${fetchCall.fetchLine}), update request body to include '${missingKeys.join("', '")}' to match ${targetRoute.node.filePath} (line ${targetRoute.node.line}).`,
        };
        wireIssues.push(issue);
      }
    }

    // Case 3 (FIELD_MISMATCH - RED WIRE): Frontend reads fields not in backend returnsPayload
    if (
      fetchCall.expectsResponseFields.length > 0 &&
      targetRoute.node.returnsPayload &&
      Object.keys(targetRoute.node.returnsPayload).length > 0
    ) {
      const returnsPayload = targetRoute.node.returnsPayload;
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
          confidence: "HIGH",
          title: `Payload key mismatch: expected [${missingFields.join(", ")}]`,
          explanation: `${sourceNode.label} expects response fields [${missingFields.join(", ")}], but ${targetRoute.node.label} returns [${Object.keys(returnsPayload).join(", ")}].`,
          sourceFile: sourceNode.filePath,
          sourceLine: fetchCall.responseVarLine || fetchCall.fetchLine,
          targetFile: targetRoute.node.filePath,
          targetLine: targetRoute.node.line,
          sourceSnippet: getSnippet(sourceNode.filePath, fetchCall.responseVarLine || fetchCall.fetchLine),
          targetSnippet: getSnippet(targetRoute.node.filePath, targetRoute.node.line),
          expectedShape,
          actualShape: returnsPayload,
          repairPrompt: `In ${targetRoute.node.filePath} (line ${targetRoute.node.line}), update the return payload keys to include '${missingFields.join("', '")}' to match ${sourceNode.filePath} (line ${fetchCall.responseVarLine || fetchCall.fetchLine}).`,
        };
        wireIssues.push(issue);
      }
    }

    // Case 4 (TYPE_CHEAT - YELLOW WIRE): Frontend casts response with `as any` or `as unknown`
    if (fetchCall.hasTypeCheat) {
      const issue: DiagnosticIssue = {
        id: `issue:type-cheat-${sourceNode.id}-${targetRoute.node.id}`,
        wireId,
        severity: "SUSPICIOUS",
        code: "TYPE_CHEAT",
        confidence: "HIGH",
        title: "Type assertion `as any` at network boundary",
        explanation: `${sourceNode.label} casts response to \`any\`, masking contract drift.`,
        sourceFile: sourceNode.filePath,
        sourceLine: fetchCall.typeCheatLine || fetchCall.fetchLine,
        targetFile: targetRoute.node.filePath,
        targetLine: targetRoute.node.line,
        sourceSnippet: getSnippet(sourceNode.filePath, fetchCall.typeCheatLine || fetchCall.fetchLine),
        targetSnippet: getSnippet(targetRoute.node.filePath, targetRoute.node.line),
        repairPrompt: `In ${sourceNode.filePath} (line ${fetchCall.typeCheatLine || fetchCall.fetchLine}), remove \`as any\` and define a typed interface matching ${targetRoute.node.filePath} (line ${targetRoute.node.line}).`,
      };
      wireIssues.push(issue);
    }

    // Case 5 (SWALLOWED_ERROR - YELLOW WIRE): Backend route has catch block returning HTTP 200
    if (targetRoute.swallowedErrors.length > 0) {
      handledSwallowedErrorRoutes.add(targetRoute.node.id);
      for (const err of targetRoute.swallowedErrors) {
        const issue: DiagnosticIssue = {
          id: `issue:swallowed-error-${targetRoute.node.id}-${err.line}`,
          wireId,
          severity: "SUSPICIOUS",
          code: "SWALLOWED_ERROR",
          confidence: "HIGH",
          title: `Swallowed error in catch block returns HTTP ${err.status}`,
          explanation: `Route handler ${targetRoute.node.label} catches errors and returns HTTP ${err.status} instead of a 4xx/5xx status code.`,
          sourceFile: targetRoute.node.filePath,
          sourceLine: err.line,
          targetFile: targetRoute.node.filePath,
          targetLine: targetRoute.node.line,
          sourceSnippet: getSnippet(targetRoute.node.filePath, err.line),
          targetSnippet: getSnippet(targetRoute.node.filePath, targetRoute.node.line),
          repairPrompt: `In ${targetRoute.node.filePath} (line ${err.line}), update the error response status from ${err.status} to 500 for handler at ${targetRoute.node.filePath} (line ${targetRoute.node.line}).`,
        };
        wireIssues.push(issue);
      }
    }

    // Optional Check: MISSING_ERROR_HANDLING
    if (options?.detectMissingErrorHandling && !fetchCall.hasErrorHandling) {
      const issue: DiagnosticIssue = {
        id: `issue:missing-error-handling-${sourceNode.id}-${targetRoute.node.id}`,
        wireId,
        severity: "SUSPICIOUS",
        code: "MISSING_ERROR_HANDLING",
        confidence: "MEDIUM",
        title: `Missing error handling for ${fetchCall.method} ${fetchCall.url}`,
        explanation: `${sourceNode.label} executes fetch without wrapping in a try/catch block or checking res.ok.`,
        sourceFile: sourceNode.filePath,
        sourceLine: fetchCall.fetchLine,
        targetFile: targetRoute.node.filePath,
        targetLine: targetRoute.node.line,
        sourceSnippet: getSnippet(sourceNode.filePath, fetchCall.fetchLine),
        targetSnippet: getSnippet(targetRoute.node.filePath, targetRoute.node.line),
        repairPrompt: `In ${sourceNode.filePath} (line ${fetchCall.fetchLine}), wrap fetch in try/catch or verify res.ok before parsing JSON.`,
      };
      wireIssues.push(issue);
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
          const cleanKey = key.replace(/_/g, "").toLowerCase();
          const matchedCol = Object.keys(modelInfo.columns).find(
            (col) => col.replace(/_/g, "").toLowerCase() === cleanKey
          );

          const issue: DiagnosticIssue = {
            id: `issue:schema-drift-${route.node.id}-${key}`,
            wireId,
            severity: "BROKEN",
            code: "SCHEMA_DRIFT",
            confidence: "HIGH",
            title: `Column mismatch: ${key} vs ${matchedCol || "unknown"}`,
            explanation: `Backend route writes \`${key}\`, but Prisma model \`${modelInfo.modelName}\` defines \`${matchedCol || "unknown"}\`.`,
            sourceFile: route.node.filePath,
            sourceLine: interaction.line,
            targetFile: modelInfo.filePath,
            targetLine: modelInfo.line,
            sourceSnippet: getSnippet(route.node.filePath, interaction.line),
            targetSnippet: getSnippet(modelInfo.filePath, modelInfo.line),
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
            confidence: "HIGH",
            title: `Swallowed error in catch block returns HTTP ${err.status}`,
            explanation: `Route handler ${route.node.label} catches errors and returns HTTP ${err.status} instead of a 4xx/5xx status code.`,
            sourceFile: route.node.filePath,
            sourceLine: err.line,
            targetFile: route.node.filePath,
            targetLine: route.node.line,
            sourceSnippet: getSnippet(route.node.filePath, err.line),
            targetSnippet: getSnippet(route.node.filePath, route.node.line),
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
            confidence: "HIGH",
            title: `Column mismatch: ${col} vs ${matchedCol || "unknown"}`,
            explanation: `${sourceNode.label} writes \`${col}\`, but model \`${modelInfo.modelName}\` defines \`${matchedCol || "unknown"}\`.`,
            sourceFile: interaction.sourceFile,
            sourceLine: interaction.line,
            targetFile: modelInfo.filePath,
            targetLine: modelInfo.line,
            sourceSnippet: getSnippet(interaction.sourceFile, interaction.line),
            targetSnippet: getSnippet(modelInfo.filePath, modelInfo.line),
            expectedShape: matchedCol ? { [matchedCol]: "string" } : undefined,
            actualShape: { [col]: "string" },
            repairPrompt: `In ${interaction.sourceFile} (line ${interaction.line}), update \`${col}\` to \`${matchedCol || col}\` to match ${modelInfo.filePath} (line ${modelInfo.line}).`,
          };
          wireIssues.push(issue);
        }
      }
    }

    // Check for UNCHECKED_DB_ERROR from backend route
    const matchingRoute = backendResult.routes.find((r) => r.node.id === sourceNode.id);
    if (matchingRoute && matchingRoute.uncheckedDbErrors.length > 0) {
      for (const err of matchingRoute.uncheckedDbErrors) {
        if (err.table.toLowerCase() === interaction.table.toLowerCase()) {
          const issue: DiagnosticIssue = {
            id: `issue:unchecked-db-error-${sourceNode.id}-${err.table}-${err.line}`,
            wireId,
            severity: "SUSPICIOUS",
            code: "UNCHECKED_DB_ERROR",
            confidence: "HIGH",
            title: `Unchecked Supabase query error on ${err.table}`,
            explanation: `${sourceNode.label} calls supabase.from("${err.table}").${err.operation}(...) without destructuring or checking \`{ error }\`.`,
            sourceFile: sourceNode.filePath,
            sourceLine: err.line,
            targetFile: targetDbNode.filePath,
            targetLine: targetDbNode.line,
            sourceSnippet: getSnippet(sourceNode.filePath, err.line),
            targetSnippet: getSnippet(targetDbNode.filePath, targetDbNode.line),
            repairPrompt: `In ${sourceNode.filePath} (line ${err.line}), destructure or check \`{ error }\` from the Supabase query to handle database errors safely.`,
          };
          wireIssues.push(issue);
        }
      }
    }

    let wireStatus: "VERIFIED" | "SUSPICIOUS" | "BROKEN" = "VERIFIED";
    if (wireIssues.some((i) => i.severity === "BROKEN")) {
      wireStatus = "BROKEN";
    } else if (wireIssues.some((i) => i.severity === "SUSPICIOUS")) {
      wireStatus = "SUSPICIOUS";
    }

    const existingWireIndex = wires.findIndex((w) => w.id === wireId);
    if (existingWireIndex >= 0) {
      const existingWire = wires[existingWireIndex];
      existingWire.issues.push(...wireIssues);
      if (wireStatus === "BROKEN") existingWire.status = "BROKEN";
      else if (wireStatus === "SUSPICIOUS" && existingWire.status !== "BROKEN") {
        existingWire.status = "SUSPICIOUS";
      }
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

  // 4. Wire Type D: External Services Wires
  for (const ext of frontendResult.externalServices || []) {
    const extNodeId = `ext:${ext.serviceName}`;
    const extNode = nodesMap.get(extNodeId);
    if (extNode) {
      const wireId = `wire:${ext.sourceNodeId}->${extNode.id}`;
      if (!wires.some((w) => w.id === wireId)) {
        wires.push({
          id: wireId,
          sourceId: ext.sourceNodeId,
          targetId: extNode.id,
          status: "VERIFIED",
          label: ext.urlOrTarget,
          issues: [],
        });
      }
    }
  }

  // 5. Environment Contract Drift (ENV_DRIFT)
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
          confidence: "HIGH",
          title: `Environment variable drift: ${access.key} not in .env.example`,
          explanation: `${node?.label || access.nodeId} references process.env.${access.key}, which is not declared in .env.example.`,
          sourceFile: access.filePath,
          sourceLine: access.line,
          targetFile: envResult.envPath,
          targetLine: 1,
          sourceSnippet: getSnippet(access.filePath, access.line),
          targetSnippet: getSnippet(envResult.envPath, 1),
          repairPrompt: `In ${access.filePath} (line ${access.line}), update process.env.${access.key} to match a declared variable in ${envResult.envPath} (such as ${Array.from(envResult.keys)[0] || "declared variable"}), or declare ${access.key} in ${envResult.envPath}.`,
        };

        targetWire.issues.push(issue);
        if (targetWire.status !== "BROKEN") {
          targetWire.status = "SUSPICIOUS";
        }
      }
    }
  }

  // 6. Optional Check: DEAD_ENDPOINT (Backend route with 0 frontend callers)
  if (options?.detectDeadEndpoints) {
    for (const route of backendResult.routes) {
      if (route.node.kind === "BACKEND_ROUTE" && !calledBackendRouteIds.has(route.node.id)) {
        const wireId = `wire:dead-endpoint->${route.node.id}`;
        const issue: DiagnosticIssue = {
          id: `issue:dead-endpoint-${route.node.id}`,
          wireId,
          severity: "SUSPICIOUS",
          code: "DEAD_ENDPOINT",
          confidence: "MEDIUM",
          title: `Dead route endpoint: ${route.node.label} has 0 callers`,
          explanation: `Route handler ${route.node.label} exists in backend but is not called by any discovered frontend component.`,
          sourceFile: route.node.filePath,
          sourceLine: route.node.line,
          sourceSnippet: getSnippet(route.node.filePath, route.node.line),
          repairPrompt: `Verify if ${route.node.filePath} is still required or remove unused endpoint ${route.node.label}.`,
        };

        wires.push({
          id: wireId,
          sourceId: route.node.id,
          targetId: route.node.id,
          status: "SUSPICIOUS",
          label: "dead endpoint",
          issues: [issue],
        });
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
