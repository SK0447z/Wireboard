import { describe, it, expect } from "vitest";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { extractCodeSnippet } from "../snippetExtractor";

describe("extractCodeSnippet", () => {
  it("formats snippet with line numbers and prefixes target line with >", () => {
    const tempFile = path.join(os.tmpdir(), `snippet-test-${Date.now()}.ts`);
    const content = [
      "import React from 'react';",
      "export function Component() {",
      "  const x = 1;",
      "  const y = 2;",
      "  return <div>{x + y}</div>;",
      "}",
    ].join("\n");

    fs.writeFileSync(tempFile, content, "utf-8");

    try {
      const snippet = extractCodeSnippet(tempFile, 3, 1);
      expect(snippet).toContain("> 3 |   const x = 1;");
      expect(snippet).toContain("  2 | export function Component() {");
      expect(snippet).toContain("  4 |   const y = 2;");
      expect(snippet).not.toContain("  1 | import");
    } finally {
      fs.unlinkSync(tempFile);
    }
  });

  it("returns empty string if file does not exist", () => {
    const snippet = extractCodeSnippet("non-existent-file.ts", 10);
    expect(snippet).toBe("");
  });
});

