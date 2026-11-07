import type { ArchitectureGraph } from "../types/graph";

/**
 * Calculates a deterministic Contract Integrity Score (0–100%) and generates
 * a crisp, shareable Markdown report.
 *
 * Scoring algorithm:
 * - If total wires === 0: 100%
 * - Broken wires penalized heavily (broken: 0 points, plus each broken wire lowers integrity score relative to total wires).
 *   Specifically: (verifiedWires / totalWires) * 100 - (suspiciousWires / totalWires) * 25
 *   Or ratio-based:
 *   points = verifiedWires * 1.0 + suspiciousWires * 0.5 - brokenWires * 0.5 (or broken = 0 with verified/total).
 *   With verifiedWires: 1, broken: 1 -> ratio of verified to total is 50%, or if penalizing broken heavily:
 *   Let's check the spec: "based on the ratio of verifiedWires to total wires (penalizing BROKEN wires heavily and SUSPICIOUS wires moderately)."
 *   If ratio of verified to total wires with penalty:
 *   Score = Math.max(0, Math.round(((verified - broken * 0.5 + suspicious * 0.25) / totalWires) * 100)) or
 *   Score = Math.max(0, Math.round(((verified * 1.0 + suspicious * 0.5) / totalWires) * 100))
 */
export function generateContractReport(graph: ArchitectureGraph): {
  score: number;
  markdown: string;
} {
  const totalWires = graph.wires.length;
  let score = 100;

  if (totalWires > 0) {
    const verified = graph.summary.verifiedWires;
    const suspicious = graph.summary.suspiciousWires;
    const broken = graph.summary.brokenWires;

    score = Math.max(
      0,
      Math.min(
        100,
        Math.round(((verified * 1.0 - broken * 1.0 + suspicious * 0.5) / totalWires) * 100)
      )
    );
  }

  const lines: string[] = [];

  lines.push("# WIREBOARD Contract Integrity Report");
  lines.push("");
  lines.push(`- **Project:** \`${graph.projectName}\``);
  lines.push(`- **Scanned At:** \`${graph.scannedAt}\``);
  lines.push(`- **Contract Integrity Score: ${score}%**`);
  lines.push("");

  lines.push("## Summary");
  lines.push("");
  lines.push("| Total Nodes | Verified Wires 🟢 | Suspicious Wires 🟡 | Broken Wires 🔴 |");
  lines.push("| :--- | :--- | :--- | :--- |");
  lines.push(
    `| ${graph.summary.totalNodes} | ${graph.summary.verifiedWires} | ${graph.summary.suspiciousWires} | ${graph.summary.brokenWires} |`
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
      const icon = issue.severity === "BROKEN" ? "🔴" : "🟡";
      lines.push(`### ${index + 1}. ${icon} [${issue.severity}] ${issue.code}: ${issue.title}`);
      lines.push("");
      lines.push(`- **Explanation:** ${issue.explanation}`);
      lines.push(
        `- **Location:** \`${issue.sourceFile}:${issue.sourceLine}\`${
          issue.targetFile ? ` -> \`${issue.targetFile}:${issue.targetLine ?? 1}\`` : ""
        }`
      );

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
