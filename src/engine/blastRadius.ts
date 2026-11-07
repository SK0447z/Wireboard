import type { ArchitectureGraph, AnchorNode } from "../types/graph";

export interface AffectedFile {
  filePath: string;
  line: number;
  role: "Database" | "Backend Route" | "Frontend Consumer" | string;
  nodeLabel: string;
}

export interface BlastRadiusResult {
  targetNodeId: string;
  proposedChange?: string;
  affectedNodeIds: string[];
  affectedWires: string[];
  affectedFiles: AffectedFile[];
  atomicExecutionPrompt: string;
}

const ROLE_RANKS: Record<string, number> = {
  DB_TABLE: 1,
  EXTERNAL_SERVICE: 1,
  BACKEND_ROUTE: 2,
  SERVER_ACTION: 2,
  FRONTEND_COMPONENT: 3,
};

function getRoleLabel(kind: string): string {
  switch (kind) {
    case "DB_TABLE":
      return "Database";
    case "EXTERNAL_SERVICE":
      return "External Service";
    case "BACKEND_ROUTE":
      return "Backend Route";
    case "SERVER_ACTION":
      return "Server Action";
    case "FRONTEND_COMPONENT":
      return "Frontend Consumer";
    default:
      return "Integration Node";
  }
}

/**
 * Traces all connected integration wires upstream and downstream from targetNodeId.
 * Returns affected nodes, wires, files in dependency order (DB -> Route -> Consumer),
 * and generates a copy-pasteable atomic synchronization prompt for AI coding agents.
 */
export function calculateBlastRadius(
  graph: ArchitectureGraph,
  targetNodeId: string,
  proposedChange?: string
): BlastRadiusResult {
  const targetNode = graph.nodes.find((n) => n.id === targetNodeId);
  if (!targetNode) {
    return {
      targetNodeId,
      proposedChange,
      affectedNodeIds: [],
      affectedWires: [],
      affectedFiles: [],
      atomicExecutionPrompt: "",
    };
  }

  // Undirected graph traversal (upstream and downstream across all connected wires)
  const visitedNodes = new Set<string>([targetNodeId]);
  const affectedWiresSet = new Set<string>();
  const queue: string[] = [targetNodeId];

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    for (const wire of graph.wires) {
      if (wire.sourceId === currentId || wire.targetId === currentId) {
        affectedWiresSet.add(wire.id);
        const neighborId = wire.sourceId === currentId ? wire.targetId : wire.sourceId;
        if (!visitedNodes.has(neighborId)) {
          visitedNodes.add(neighborId);
          queue.push(neighborId);
        }
      }
    }
  }

  // Lookup node objects
  const nodeMap = new Map<string, AnchorNode>();
  for (const n of graph.nodes) {
    nodeMap.set(n.id, n);
  }

  const collectedNodes = Array.from(visitedNodes)
    .map((id) => nodeMap.get(id))
    .filter((n): n is AnchorNode => n !== undefined);

  // Sort nodes in strict dependency order: Database -> Backend Route -> Frontend Consumer
  collectedNodes.sort((a, b) => {
    const rankA = ROLE_RANKS[a.kind] ?? 4;
    const rankB = ROLE_RANKS[b.kind] ?? 4;
    if (rankA !== rankB) return rankA - rankB;
    if (a.filePath !== b.filePath) return a.filePath.localeCompare(b.filePath);
    return a.line - b.line;
  });

  const affectedNodeIds = collectedNodes.map((n) => n.id);
  const affectedWires = Array.from(affectedWiresSet);

  // Collect unique affected files preserving dependency order
  const affectedFiles: AffectedFile[] = [];
  const seenFiles = new Set<string>();

  for (const node of collectedNodes) {
    const key = `${node.filePath}:${node.line}`;
    if (!seenFiles.has(key)) {
      seenFiles.add(key);
      affectedFiles.push({
        filePath: node.filePath,
        line: node.line,
        role: getRoleLabel(node.kind),
        nodeLabel: node.label,
      });
    }
  }

  // Generate atomic multi-file prompt for an AI agent
  const changeDesc = proposedChange && proposedChange.trim()
    ? proposedChange.trim()
    : "Synchronize contract schema across integration boundary";

  const dbFiles = affectedFiles.filter((f) => f.role === "Database");
  const backendFiles = affectedFiles.filter((f) => f.role === "Backend Route");
  const frontendFiles = affectedFiles.filter((f) => f.role === "Frontend Consumer");

  let stepNumber = 1;
  const sections: string[] = [];

  if (dbFiles.length > 0) {
    const fileLines = dbFiles
      .map((f) => `   - File: \`${f.filePath}:${f.line}\` (${f.nodeLabel})\n     Action: Update database schema/model definitions and run migrations/prisma generate if applicable.`)
      .join("\n");
    sections.push(`${stepNumber++}. Database Layer:\n${fileLines}`);
  }

  if (backendFiles.length > 0) {
    const fileLines = backendFiles
      .map((f) => `   - File: \`${f.filePath}:${f.line}\` (${f.nodeLabel})\n     Action: Update request/response payload contracts and database query fields to align with database models.`)
      .join("\n");
    sections.push(`${stepNumber++}. Backend Route Layer:\n${fileLines}`);
  }

  if (frontendFiles.length > 0) {
    const fileLines = frontendFiles
      .map((f) => `   - File: \`${f.filePath}:${f.line}\` (${f.nodeLabel})\n     Action: Update fetch payload keys, typed response interfaces, and component state to match backend endpoints.`)
      .join("\n");
    sections.push(`${stepNumber++}. Frontend Consumer Layer:\n${fileLines}`);
  }

  const promptBody = sections.join("\n\n");

  const atomicExecutionPrompt = `### ATOMIC CONTRACT SYNCHRONIZATION PLAN

**Target Node:** ${targetNode.label} (${targetNode.kind})
**Proposed Change:** ${changeDesc}
**Total Affected Files:** ${affectedFiles.length}

Execute updates across the full-stack integration boundary in strict dependency order:

${promptBody}

**Verification Requirement:**
After applying all edits, run \`npm test\` and execute Wireboard contract scan to verify that all connected integration wires remain VERIFIED.`;

  return {
    targetNodeId,
    proposedChange,
    affectedNodeIds,
    affectedWires,
    affectedFiles,
    atomicExecutionPrompt,
  };
}

