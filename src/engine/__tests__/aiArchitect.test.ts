import { describe, it, expect } from "vitest";
import { queryAiArchitect } from "../aiArchitect";
import { scanRepository } from "../buildGraph";
import path from "node:path";

describe("Deterministic AI Architect Engine", () => {
  const brokenAppPath = path.resolve(process.cwd(), "test-fixtures/broken-app");

  it("answers 'Why are contracts failing in this repo?' citing exact locations", async () => {
    const graph = await scanRepository(brokenAppPath);
    const result = queryAiArchitect(graph, "Why are contracts failing in this repo?");

    expect(result.durationMs).toBeLessThan(100);
    expect(result.answerMarkdown).toContain("Architectural Diagnosis");
    expect(result.citedLocations.length).toBeGreaterThan(0);
    expect(result.citedLocations.some((c) => c.filePath.includes("RegisterForm.tsx"))).toBe(true);
  });

  it("answers 'What has the highest blast radius if changed?' with ranking", async () => {
    const graph = await scanRepository(brokenAppPath);
    const result = queryAiArchitect(graph, "What has the highest blast radius if changed?");

    expect(result.answerMarkdown).toContain("Highest Blast Radius Analysis");
    expect(result.citedLocations.length).toBeGreaterThan(0);
  });

  it("answers 'Which routes write to the database without error checks?'", async () => {
    const graph = await scanRepository(brokenAppPath);
    const result = queryAiArchitect(
      graph,
      "Which routes write to the database without error checks?"
    );

    expect(result.answerMarkdown).toContain("Database & Error Handling Inspection");
  });

  it("generates a master repair plan for all broken wires", async () => {
    const graph = await scanRepository(brokenAppPath);
    const result = queryAiArchitect(
      graph,
      "Generate a master repair plan for all broken wires"
    );

    expect(result.answerMarkdown).toContain("Master Multi-File Synchronization");
    expect(result.masterRepairPrompt).toBeDefined();
    expect(result.masterRepairPrompt).toContain("WIREBOARD SURGICAL MASTER REPAIR PROMPT");
  });
});
