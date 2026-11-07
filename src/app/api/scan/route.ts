import { NextResponse } from "next/server";
import path from "node:path";
import fs from "node:fs";
import { scanRepository } from "@/engine/buildGraph";

function resolveTarget(targetPath?: string): string {
  if (!targetPath || targetPath === "broken-app") {
    return path.resolve(process.cwd(), "test-fixtures/broken-app");
  }
  return path.isAbsolute(targetPath)
    ? targetPath
    : path.resolve(process.cwd(), targetPath);
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const target = searchParams.get("target") || searchParams.get("repoPath") || undefined;
    const resolvedPath = resolveTarget(target);

    if (!fs.existsSync(resolvedPath)) {
      return NextResponse.json(
        { error: `Directory does not exist: ${resolvedPath}` },
        { status: 400 }
      );
    }

    const graph = scanRepository(resolvedPath);
    return NextResponse.json(graph);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to scan repository";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    let repoPath: string | undefined;
    try {
      const body = await request.json();
      repoPath = body?.repoPath;
    } catch {
      // Empty body is handled gracefully
    }

    const resolvedPath = resolveTarget(repoPath);

    if (!fs.existsSync(resolvedPath)) {
      return NextResponse.json(
        { error: `Directory does not exist: ${resolvedPath}` },
        { status: 400 }
      );
    }

    const graph = scanRepository(resolvedPath);
    return NextResponse.json(graph);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to scan repository";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

