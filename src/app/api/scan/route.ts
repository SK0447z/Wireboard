import { NextResponse } from "next/server";
import { scanRepository } from "@/engine/buildGraph";
import { parseGitHubUrl, cloneOrUpdateGitHubRepo } from "@/lib/github";
import { validateScanPath } from "@/lib/security";
import type { ArchitectureGraph } from "@/types/graph";

async function handleScan(
  target?: string
): Promise<{ graph?: ArchitectureGraph; error?: string; status?: number }> {
  if (!target || target === "broken-app") {
    const defaultTarget = "test-fixtures/broken-app";
    const validation = validateScanPath(defaultTarget);
    if (!validation.valid || !validation.resolvedPath) {
      return {
        error: validation.error || `Directory does not exist: ${defaultTarget}`,
        status: validation.status || 400,
      };
    }
    const graph = scanRepository(validation.resolvedPath);
    return { graph };
  }

  // Check if input is a GitHub URL
  const isGitHub = /^(?:https?:\/\/)?github\.com\//i.test(target.trim());
  if (isGitHub) {
    const parsed = parseGitHubUrl(target);
    if (!parsed) {
      return {
        error:
          "Invalid GitHub repository URL. Format must be https://github.com/owner/repo with valid alphanumeric characters.",
        status: 400,
      };
    }

    try {
      const clonedDir = cloneOrUpdateGitHubRepo(parsed.owner, parsed.repo);
      const graph = scanRepository(clonedDir);
      graph.projectName = `github:${parsed.owner}/${parsed.repo}`;
      return { graph };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to clone repository";
      return {
        error: `Failed to clone GitHub repository https://github.com/${parsed.owner}/${parsed.repo}: ${msg}`,
        status: 400,
      };
    }
  }

  // Local directory path validation with strict filesystem workspace boundary enforcement
  const validation = validateScanPath(target);
  if (!validation.valid || !validation.resolvedPath) {
    return {
      error: validation.error || `Directory does not exist: ${target}`,
      status: validation.status || 400,
    };
  }

  const graph = scanRepository(validation.resolvedPath);
  return { graph };
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const target = searchParams.get("target") || searchParams.get("repoPath") || undefined;
    const result = await handleScan(target);

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: result.status || 400 });
    }

    return NextResponse.json(result.graph);
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

    const result = await handleScan(repoPath);

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: result.status || 400 });
    }

    return NextResponse.json(result.graph);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to scan repository";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
