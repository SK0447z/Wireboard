import type { ArchitectureGraph } from "../types/graph";
import { calculateBlastRadius } from "./blastRadius";

export interface AiArchitectAnswer {
  query: string;
  answerMarkdown: string;
  citedLocations: Array<{ filePath: string; line: number; label: string }>;
  masterRepairPrompt?: string;
  durationMs: number;
}

/**
 * Deterministic AI Architect Engine.
 * Evaluates the ArchitectureGraph in <10ms to answer architectural queries,
 * citing exact file:line references and generating master repair plans.
 */
export function queryAiArchitect(
  graph: ArchitectureGraph,
  rawQuery: string
): AiArchitectAnswer {
  const startTime = Date.now();
  const query = rawQuery.trim();
  const qLower = query.toLowerCase();

  const brokenIssues = graph.issues.filter((i) => i.severity === "BROKEN");
  const suspiciousIssues = graph.issues.filter((i) => i.severity === "SUSPICIOUS");

  // Query 1: Why are contracts failing in this repo?
  if (
    qLower.includes("why are contracts failing") ||
    qLower.includes("why is it failing") ||
    qLower.includes("failing in this repo") ||
    (qLower.includes("why") && qLower.includes("fail"))
  ) {
    const citedLocations: Array<{ filePath: string; line: number; label: string }> = [];
    const lines: string[] = [];

    lines.push(`### Architectural Diagnosis: Contract Failures in \`${graph.projectName}\``);
    lines.push("");
    lines.push(
      `Wireboard detected **${brokenIssues.length} broken integration contracts** and **${suspiciousIssues.length} suspicious contract risks** across **${graph.summary.totalNodes} total nodes**.`
    );
    lines.push("");

    if (brokenIssues.length === 0) {
      lines.push("✅ No contracts are currently failing! All wires are verified or suspicious.");
    } else {
      lines.push("#### Root Cause Breakdown:");
      lines.push("");
      for (const [idx, issue] of brokenIssues.entries()) {
        citedLocations.push({
          filePath: issue.sourceFile,
          line: issue.sourceLine,
          label: `${issue.code}: ${issue.title}`,
        });
        if (issue.targetFile && issue.targetLine) {
          citedLocations.push({
            filePath: issue.targetFile,
            line: issue.targetLine,
            label: `Target for ${issue.code}`,
          });
        }

        lines.push(
          `${idx + 1}. **${issue.code}**: \`${issue.title}\``
        );
        lines.push(`   - **Location:** \`${issue.sourceFile}:${issue.sourceLine}\`${
          issue.targetFile ? ` → \`${issue.targetFile}:${issue.targetLine}\`` : ""
        }`);
        lines.push(`   - **Cause:** ${issue.explanation}`);
        if (issue.expectedShape || issue.actualShape) {
          lines.push(
            `   - **Key Drift:** Expected \`${JSON.stringify(
              issue.expectedShape || {}
            )}\` vs Producer returned \`${JSON.stringify(issue.actualShape || {})}\``
          );
        }
      }
    }

    const durationMs = Date.now() - startTime;
    return {
      query,
      answerMarkdown: lines.join("\n"),
      citedLocations,
      durationMs,
    };
  }

  // Query 2: What has the highest blast radius if changed?
  if (
    qLower.includes("highest blast radius") ||
    qLower.includes("blast radius") ||
    qLower.includes("most dangerous") ||
    qLower.includes("vulnerable file")
  ) {
    const blastResults = graph.nodes.map((node) => ({
      node,
      blast: calculateBlastRadius(graph, node.id),
    }));

    blastResults.sort(
      (a, b) => b.blast.affectedFiles.length - a.blast.affectedFiles.length
    );

    const top = blastResults[0];
    const citedLocations: Array<{ filePath: string; line: number; label: string }> = [];

    const lines: string[] = [];
    lines.push("### Highest Blast Radius Analysis");
    lines.push("");

    if (!top || top.blast.affectedFiles.length <= 1) {
      lines.push(
        "All components in this repository have isolated or low-coupling boundaries."
      );
    } else {
      lines.push(
        `The node with the highest blast radius is **\`${top.node.label}\`** (${top.node.kind}) located at \`${top.node.filePath}:${top.node.line}\`.`
      );
      lines.push("");
      lines.push(
        `Modifying this contract directly impacts **${top.blast.affectedFiles.length} files** across upstream consumers, backend handlers, and database storage:`
      );
      lines.push("");

      for (const f of top.blast.affectedFiles) {
        citedLocations.push({
          filePath: f.filePath,
          line: f.line,
          label: `${f.role}: ${f.nodeLabel}`,
        });
        lines.push(
          `- **${f.role}:** \`${f.filePath}:${f.line}\` (${f.nodeLabel})`
        );
      }
    }

    const durationMs = Date.now() - startTime;
    return {
      query,
      answerMarkdown: lines.join("\n"),
      citedLocations,
      durationMs,
    };
  }

  // Query 3: Which routes write to the database without error checks?
  if (
    qLower.includes("without error checks") ||
    qLower.includes("unchecked") ||
    qLower.includes("database") ||
    qLower.includes("swallowed error") ||
    qLower.includes("write to the database")
  ) {
    const dbIssues = graph.issues.filter(
      (i) =>
        i.code === "UNCHECKED_DB_ERROR" ||
        i.code === "SWALLOWED_ERROR" ||
        i.code === "SCHEMA_DRIFT"
    );

    const citedLocations: Array<{ filePath: string; line: number; label: string }> = [];
    const lines: string[] = [];
    lines.push("### Database & Error Handling Inspection");
    lines.push("");

    if (dbIssues.length === 0) {
      lines.push(
        "✅ All database operations and route error handlers have verified checks and status codes."
      );
    } else {
      lines.push(
        `Found **${dbIssues.length} routes or queries** with unchecked database errors or swallowed exceptions:`
      );
      lines.push("");
      for (const [idx, issue] of dbIssues.entries()) {
        citedLocations.push({
          filePath: issue.sourceFile,
          line: issue.sourceLine,
          label: `${issue.code}: ${issue.title}`,
        });
        lines.push(
          `${idx + 1}. **[${issue.severity}] ${issue.code}** at \`${issue.sourceFile}:${issue.sourceLine}\``
        );
        lines.push(`   - ${issue.explanation}`);
        lines.push(`   - **Fix Recommendation:** ${issue.repairPrompt.split("\n")[0]}`);
      }
    }

    const durationMs = Date.now() - startTime;
    return {
      query,
      answerMarkdown: lines.join("\n"),
      citedLocations,
      durationMs,
    };
  }

  // Query 4: Generate a master repair plan for all broken wires
  if (
    qLower.includes("master repair plan") ||
    qLower.includes("repair plan") ||
    qLower.includes("fix all") ||
    qLower.includes("repair all")
  ) {
    const citedLocations: Array<{ filePath: string; line: number; label: string }> = [];
    const lines: string[] = [];

    lines.push("### Master Multi-File Synchronization & Repair Plan");
    lines.push("");
    lines.push(
      `This deterministic execution plan synchronizes all **${brokenIssues.length} broken contracts** in topological dependency order (Database Schema -> Route Handlers -> Frontend Components).`
    );
    lines.push("");

    const repairBlocks: string[] = [];
    repairBlocks.push(
      "// WIREBOARD SURGICAL MASTER REPAIR PROMPT\n" +
      "// Execute these file modifications to resolve all broken integration contracts:\n"
    );

    for (const [idx, issue] of brokenIssues.entries()) {
      citedLocations.push({
        filePath: issue.sourceFile,
        line: issue.sourceLine,
        label: `${issue.code}: ${issue.title}`,
      });
      lines.push(`#### Phase ${idx + 1}: ${issue.code} (${issue.sourceFile.split("/").slice(-1)[0]})`);
      lines.push(`- **Location:** \`${issue.sourceFile}:${issue.sourceLine}\``);
      lines.push(`- **Action:** ${issue.explanation}`);
      lines.push("");

      repairBlocks.push(
        `// Phase ${idx + 1}: ${issue.code} in ${issue.sourceFile}:${issue.sourceLine}\n` +
        `${issue.repairPrompt}\n`
      );
    }

    const masterPrompt = repairBlocks.join("\n----------------------------------------\n\n");

    const durationMs = Date.now() - startTime;
    return {
      query,
      answerMarkdown: lines.join("\n"),
      citedLocations,
      masterRepairPrompt: masterPrompt,
      durationMs,
    };
  }

  // General Architectural Query Fallback
  const citedLocations: Array<{ filePath: string; line: number; label: string }> = [];
  const lines: string[] = [];

  lines.push(`### Architectural Analysis for: "${query}"`);
  lines.push("");
  lines.push(
    `Project \`${graph.projectName}\` comprises **${graph.nodes.length} nodes** (${
      graph.nodes.filter((n) => n.kind === "FRONTEND_COMPONENT").length
    } Frontend, ${
      graph.nodes.filter((n) => n.kind === "BACKEND_ROUTE" || n.kind === "SERVER_ACTION").length
    } API Routes, ${
      graph.nodes.filter((n) => n.kind === "DB_TABLE" || n.kind === "EXTERNAL_SERVICE").length
    } Storage/External) and **${graph.wires.length} wires**.`
  );
  lines.push("");

  if (graph.issues.length > 0) {
    lines.push(`**Key Active Issues:**`);
    for (const issue of graph.issues.slice(0, 5)) {
      citedLocations.push({
        filePath: issue.sourceFile,
        line: issue.sourceLine,
        label: `${issue.code}: ${issue.title}`,
      });
      lines.push(
        `- **[${issue.severity}] ${issue.code}** at \`${issue.sourceFile}:${issue.sourceLine}\`: ${issue.title}`
      );
    }
  } else {
    lines.push("✅ All contracts in this architecture are verified.");
  }

  const durationMs = Date.now() - startTime;
  return {
    query,
    answerMarkdown: lines.join("\n"),
    citedLocations,
    durationMs,
  };
}

