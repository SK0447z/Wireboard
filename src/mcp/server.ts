import { scanRepository } from "../engine/buildGraph";
import { generateContractReport } from "../engine/generateReport";
import type { DiagnosticIssue } from "../types/graph";

export interface McpToolResult {
  content: Array<{
    type: "text";
    text: string;
  }>;
  isError?: boolean;
}

/**
 * Pure dispatcher for Wireboard MCP tool calls.
 */
export async function handleMcpToolCall(
  name: string,
  args: Record<string, unknown> = {}
): Promise<McpToolResult> {
  const projectPath =
    typeof args.projectPath === "string" && args.projectPath.trim() !== ""
      ? args.projectPath
      : ".";

  switch (name) {
    case "wireboard_scan": {
      try {
        const graph = scanRepository(projectPath);
        const { score, markdown } = generateContractReport(graph);

        const brokenWires = graph.wires
          .filter((w) => w.status === "BROKEN")
          .map((w) => ({
            id: w.id,
            sourceId: w.sourceId,
            targetId: w.targetId,
            issues: w.issues.map((i) => ({ code: i.code, title: i.title })),
          }));

        const suspiciousWires = graph.wires
          .filter((w) => w.status === "SUSPICIOUS")
          .map((w) => ({
            id: w.id,
            sourceId: w.sourceId,
            targetId: w.targetId,
            issues: w.issues.map((i) => ({ code: i.code, title: i.title })),
          }));

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  projectName: graph.projectName,
                  score,
                  summary: graph.summary,
                  brokenWiresCount: brokenWires.length,
                  suspiciousWiresCount: suspiciousWires.length,
                  brokenWires,
                  suspiciousWires,
                  reportMarkdown: markdown,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (err) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `wireboard_scan failed: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
        };
      }
    }

    case "wireboard_get_fixes": {
      try {
        const graph = scanRepository(projectPath);
        const issues: DiagnosticIssue[] =
          graph.issues.length > 0
            ? graph.issues
            : graph.wires.flatMap((w) => w.issues);

        const fixes = issues.map((issue) => ({
          id: issue.id,
          severity: issue.severity,
          code: issue.code,
          title: issue.title,
          explanation: issue.explanation,
          sourceFile: issue.sourceFile,
          sourceLine: issue.sourceLine,
          targetFile: issue.targetFile,
          targetLine: issue.targetLine,
          repairPrompt: issue.repairPrompt,
        }));

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  projectName: graph.projectName,
                  totalIssues: fixes.length,
                  issues: fixes,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (err) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `wireboard_get_fixes failed: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
        };
      }
    }

    default:
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: `Unknown tool: ${name}`,
          },
        ],
      };
  }
}

/**
 * Standard MCP JSON-RPC 2.0 stdio server.
 * Runs when executed directly via node / tsx.
 */
export function startMcpStdioServer() {
  process.stdin.setEncoding("utf8");

  let buffer = "";

  const sendResponse = (response: Record<string, unknown>) => {
    process.stdout.write(JSON.stringify(response) + "\n");
  };

  process.stdin.on("data", async (chunk: string) => {
    buffer += chunk;
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      try {
        const req = JSON.parse(trimmed);
        const { id, method, params } = req;

        if (method === "initialize") {
          sendResponse({
            jsonrpc: "2.0",
            id,
            result: {
              protocolVersion: "2024-11-05",
              capabilities: {
                tools: {},
              },
              serverInfo: {
                name: "wireboard",
                version: "0.1.0",
              },
            },
          });
        } else if (method === "notifications/initialized") {
          // No response needed for notification
        } else if (method === "tools/list") {
          sendResponse({
            jsonrpc: "2.0",
            id,
            result: {
              tools: [
                {
                  name: "wireboard_scan",
                  description:
                    "Scans the target codebase AST and returns the full integration architecture graph summary, Contract Integrity Score, and list of broken/suspicious wires.",
                  inputSchema: {
                    type: "object",
                    properties: {
                      projectPath: {
                        type: "string",
                        description:
                          "Path to the repository root to scan (defaults to current working directory '.')",
                      },
                    },
                  },
                },
                {
                  name: "wireboard_get_fixes",
                  description:
                    "Returns exact DiagnosticIssue breakdown with surgical repairPrompt instructions for all broken and suspicious integration contracts.",
                  inputSchema: {
                    type: "object",
                    properties: {
                      projectPath: {
                        type: "string",
                        description:
                          "Path to the repository root to scan (defaults to current working directory '.')",
                      },
                    },
                  },
                },
              ],
            },
          });
        } else if (method === "tools/call") {
          const toolName = params?.name;
          const toolArgs = params?.arguments ?? {};
          const toolResult = await handleMcpToolCall(toolName, toolArgs);

          sendResponse({
            jsonrpc: "2.0",
            id,
            result: toolResult,
          });
        } else {
          sendResponse({
            jsonrpc: "2.0",
            id,
            error: {
              code: -32601,
              message: `Method not found: ${method}`,
            },
          });
        }
      } catch (err) {
        sendResponse({
          jsonrpc: "2.0",
          id: null,
          error: {
            code: -32700,
            message: `Parse error: ${err instanceof Error ? err.message : String(err)}`,
          },
        });
      }
    }
  });
}

// Auto-start server if executed directly
if (typeof require !== "undefined" && require.main === module) {
  startMcpStdioServer();
} else if (process.argv[1] && process.argv[1].replace(/\\/g, "/").endsWith("src/mcp/server.ts")) {
  startMcpStdioServer();
}
