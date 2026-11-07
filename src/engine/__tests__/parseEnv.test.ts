import { describe, it, expect } from "vitest";
import path from "node:path";
import { parseEnvExample } from "../parseEnv";

describe("parseEnvExample", () => {
  const brokenAppPath = path.resolve(__dirname, "../../../test-fixtures/broken-app");

  it("parses .env.example correctly and extracts declared keys", () => {
    const res = parseEnvExample(brokenAppPath);
    expect(res).not.toBeNull();
    expect(res?.keys.has("DATABASE_URL")).toBe(true);
    expect(res?.keys.has("JWT_SECRET")).toBe(true);
    expect(res?.keys.has("JWT_SIGNING_KEY")).toBe(false);
  });

  it("returns null if .env.example does not exist", () => {
    const res = parseEnvExample(__dirname);
    expect(res).toBeNull();
  });
});
