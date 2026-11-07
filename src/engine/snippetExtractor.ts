import fs from "node:fs";

/**
 * Extracts a formatted multi-line source code snippet around targetLine with line numbers.
 * The targetLine is prefixed with '> ' while surrounding context lines use '  '.
 */
export function extractCodeSnippet(
  filePath: string,
  targetLine: number,
  contextLines = 3
): string {
  try {
    if (!fs.existsSync(filePath)) {
      return "";
    }
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) {
      return "";
    }
    const content = fs.readFileSync(filePath, "utf-8");
    const lines = content.split(/\r?\n/);
    if (lines.length === 0) return "";

    const startLine = Math.max(1, targetLine - contextLines);
    const endLine = Math.min(lines.length, targetLine + contextLines);
    const maxLineNumWidth = String(endLine).length;

    const snippetLines: string[] = [];
    for (let lineNum = startLine; lineNum <= endLine; lineNum++) {
      const lineContent = lines[lineNum - 1];
      const isTarget = lineNum === targetLine;
      const prefix = isTarget ? "> " : "  ";
      const paddedNum = String(lineNum).padStart(maxLineNumWidth, " ");
      snippetLines.push(`${prefix}${paddedNum} | ${lineContent}`);
    }

    return snippetLines.join("\n");
  } catch {
    return "";
  }
}
