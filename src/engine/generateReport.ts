import type { ArchitectureGraph } from "../types/graph";

/**
 * Calculates a deterministic Contract Integrity Score (0–100%) and generates
 * a crisp, shareable Markdown report.
 *
 * Scoring rules:
 * - If totalWires === 0 or verifiableWires === 0: score is strictly 0% (never 100%).
 * - UNKNOWN wires are excluded from verifiableWires.
 * - Based on ratio of verifiedWires to verifiable wires, penalizing BROKEN wires heavily.
 */
export function generateContractReport(graph: ArchitectureGraph): {
  score: number;
  markdown: string;
} {
  const totalWires = graph.wires.length;
  const unknownWires = graph.summary.unknownWires ?? 0;
  const verifiableWires =
    graph.summary.coverage?.verifiableWires ??
    Math.max(0, totalWires - unknownWires);
  const coveragePercent =
    graph.summary.coverage?.coveragePercent ??
    (totalWires > 0 ? Math.round((verifiableWires / totalWires) * 100) : 0);

  let score = 0;

  if (totalWires > 0 && verifiableWires > 0) {
    const verified = graph.summary.verifiedWires;
    const suspicious = graph.summary.suspiciousWires;
    const broken = graph.summary.brokenWires;

    score = Math.max(
      0,
      Math.min(
        100,
        Math.round(((verified * 1.0 - broken * 1.0 + suspicious * 0.5) / verifiableWires) * 100)
      )
    );
  }

  const lines: string[] = [];

  lines.push("# WIREBOARD Contract Integrity Report");
  lines.push("");
  lines.push(`- **Project:** \`${graph.projectName}\``);
  lines.push(`- **Scanned At:** \`${graph.scannedAt}\``);
  lines.push(`- **Contract Integrity Score: ${score}%**`);
  lines.push(`- **Scan Coverage: ${coveragePercent}%**`);
  lines.push(`- **Unknown Wires: ${unknownWires}**`);
  lines.push("");

  lines.push("## Summary");
  lines.push("");
  lines.push("| Total Nodes | Verified Wires 🟢 | Suspicious Wires 🟡 | Broken Wires 🔴 | Unknown Wires ⚪ |");
  lines.push("| :--- | :--- | :--- | :--- | :--- |");
  lines.push(
    `| ${graph.summary.totalNodes} | ${graph.summary.verifiedWires} | ${graph.summary.suspiciousWires} | ${graph.summary.brokenWires} | ${unknownWires} |`
  );
  lines.push("");

  // Collect all unique diagnostic issues
  const issues = graph.issues.length > 0
    ? graph.issues
    : graph.wires.flatMap((w) => w.issues);

  lines.push("## Diagnostics Breakdown");
  lines.push("");

  if (issues.length === 0) {
    lines.push("✅ All integration contracts are strictly verified. No broken or suspicious wires detected.");
    lines.push("");
  } else {
    for (const [index, issue] of issues.entries()) {
      const icon = issue.severity === "BROKEN" ? "🔴" : issue.severity === "SUSPICIOUS" ? "🟡" : "⚪";
      lines.push(`### ${index + 1}. ${icon} [${issue.severity}] ${issue.code}: ${issue.title}`);
      lines.push("");
      lines.push(`- **Explanation:** ${issue.explanation}`);
      lines.push(
        `- **Location:** \`${issue.sourceFile}:${issue.sourceLine}\`${
          issue.targetFile ? ` -> \`${issue.targetFile}:${issue.targetLine ?? 1}\`` : ""
        }`
      );

      if (issue.evidence && issue.evidence.length > 0) {
        lines.push("- **Evidence:**");
        for (const ev of issue.evidence) {
          lines.push(`  - ${ev}`);
        }
      }

      if (issue.expectedShape || issue.actualShape) {
        lines.push("- **Contract Diff:**");
        if (issue.expectedShape) {
          lines.push(
            `  - **Expected:** \`${JSON.stringify(issue.expectedShape)}\``
          );
        }
        if (issue.actualShape) {
          lines.push(
            `  - **Actual:** \`${JSON.stringify(issue.actualShape)}\``
          );
        }
      }

      lines.push("");
      lines.push("**repairPrompt:**");
      lines.push("```text");
      lines.push(issue.repairPrompt);
      lines.push("```");
      lines.push("");
    }
  }

  return {
    score,
    markdown: lines.join("\n"),
  };
}
