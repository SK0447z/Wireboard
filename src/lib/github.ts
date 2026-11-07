import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { execFileSync } from "node:child_process";

export function parseGitHubUrl(input: string): { owner: string; repo: string } | null {
  const trimmed = input.trim();
  const match = trimmed.match(
    /^(?:https?:\/\/)?github\.com\/([a-zA-Z0-9._-]+)\/([a-zA-Z0-9._-]+?)(?:\.git|\/)?$/i
  );
  if (!match) return null;
  const owner = match[1];
  const repo = match[2];
  const validName = /^[a-zA-Z0-9._-]+$/;
  if (!validName.test(owner) || !validName.test(repo)) {
    return null;
  }
  return { owner, repo };
}

export function cloneOrUpdateGitHubRepo(owner: string, repo: string): string {
  const scansDir = path.join(os.tmpdir(), "wireboard-scans");
  const targetDir = path.join(scansDir, `${owner}-${repo}`);
  const cloneUrl = `https://github.com/${owner}/${repo}.git`;

  if (fs.existsSync(targetDir)) {
    try {
      execFileSync("git", ["pull"], {
        cwd: targetDir,
        timeout: 30000,
        stdio: ["ignore", "pipe", "pipe"],
      });
      return targetDir;
    } catch {
      return targetDir;
    }
  }

  fs.mkdirSync(scansDir, { recursive: true });
  execFileSync("git", ["clone", "--depth", "1", cloneUrl, targetDir], {
    timeout: 60000,
    stdio: ["ignore", "pipe", "pipe"],
  });
  return targetDir;
}
