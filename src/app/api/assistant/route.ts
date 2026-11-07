import { NextRequest, NextResponse } from "next/server";
import { queryAiArchitect } from "@/engine/aiArchitect";
import type { ArchitectureGraph } from "@/types/graph";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { query, graph } = body as { query?: string; graph?: ArchitectureGraph };

    if (!query || typeof query !== "string") {
      return NextResponse.json(
        { error: "Query string is required" },
        { status: 400 }
      );
    }

    if (!graph || !Array.isArray(graph.nodes) || !Array.isArray(graph.wires)) {
      return NextResponse.json(
        { error: "Valid ArchitectureGraph is required" },
        { status: 400 }
      );
    }

    // Deterministic engine
    const deterministicResult = queryAiArchitect(graph, query);

    // If GEMINI_API_KEY is configured in env, we could optionally call Gemini.
    // However, the deterministic AST response is always returned as primary or fallback.
    return NextResponse.json({
      success: true,
      result: deterministicResult,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
