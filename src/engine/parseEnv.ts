import fs from "node:fs";
import path from "node:path";

export interface ParsedEnv {
  keys: Set<string>;
  envPath: string;
}

/**
 * Parses .env.example in the project root (if it exists)
 * and returns declared environment variable keys.
 */
export function parseEnvExample(projectRoot: string): ParsedEnv | null {
  const envPath = path.join(projectRoot, ".env.example");
  if (!fs.existsSync(envPath)) {
    return null;
  }

  const content = fs.readFileSync(envPath, "utf-8");
  const keys = new Set<string>();
  const lines = content.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    const key = eqIdx >= 0 ? trimmed.slice(0, eqIdx).trim() : trimmed;
    if (key) {
      keys.add(key);
    }
  }

  return { keys, envPath: ".env.example" };
}
