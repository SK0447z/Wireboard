#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { scanRepository } from "./engine/buildGraph";
import { generateContractReport } from "./engine/generateReport";

function runCli() {
  const args = process.argv.slice(2);
  let targetPath = ".";
  let shouldWrite = false;

  for (const arg of args) {
    if (arg === "--write" || arg === "-w") {
      shouldWrite = true;
    } else if (!arg.startsWith("-")) {
      targetPath = arg;
    }
  }

  const resolvedTarget = path.resolve(targetPath);
  console.log(`\n🔍 Wireboard AST Contract Inspector`);
  console.log(`   Target: ${resolvedTarget}\n`);

  try {
    const graph = scanRepository(resolvedTarget);
    const { score, markdown } = generateContractReport(graph);

    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`Contract Integrity Score: ${score}%`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`Total Nodes:      ${graph.summary.totalNodes}`);
    console.log(`Verified Wires:   🟢 ${graph.summary.verifiedWires}`);
    console.log(`Suspicious Wires: 🟡 ${graph.summary.suspiciousWires}`);
    console.log(`Broken Wires:     🔴 ${graph.summary.brokenWires}`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

    const issues = graph.issues.length > 0 ? graph.issues : graph.wires.flatMap((w) => w.issues);

    if (issues.length > 0) {
      console.log(`Found ${issues.length} contract issue(s):\n`);
      for (const [idx, issue] of issues.entries()) {
        const badge = issue.severity === "BROKEN" ? "🔴 [BROKEN]" : "🟡 [SUSPICIOUS]";
        console.log(`${idx + 1}. ${badge} ${issue.code} — ${issue.title}`);
        console.log(`   Location: ${issue.sourceFile}:${issue.sourceLine}${issue.targetFile ? ` -> ${issue.targetFile}:${issue.targetLine ?? 1}` : ""}`);
        console.log(`   Fix: ${issue.repairPrompt}\n`);
      }
    } else {
      console.log(`✅ All integration contracts are strictly verified!\n`);
    }

    if (shouldWrite) {
      const outputPath = path.join(process.cwd(), "CONTRACT_REPORT.md");
      fs.writeFileSync(outputPath, markdown, "utf8");
      console.log(`📄 Wrote contract report to ${outputPath}\n`);
    }

    // Exit with code 1 if any broken wires exist (CI/Git gatekeeper)
    if (graph.summary.brokenWires > 0) {
      console.error(`❌ Check failed: ${graph.summary.brokenWires} broken wire(s) detected.\n`);
      process.exit(1);
    }

    process.exit(0);
  } catch (err) {
    console.error(`\n❌ Error scanning repository:`, err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

runCli();
