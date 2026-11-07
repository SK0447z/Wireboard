import { describe, it, expect } from "vitest";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { scanRepository } from "../buildGraph";
import { ArchitectureGraphSchema } from "../../types/graph";

describe("Deep AST Compiler v2 Real-World Tests", () => {
  it("matches query strings and dynamic param names positionally with zero MISSING_ENDPOINT false positives", () => {
    const tempDir = path.join(os.tmpdir(), "wb-test-routes-" + Date.now());
    const feDir = path.join(tempDir, "components");
    const beDir1 = path.join(tempDir, "app/api/projects");
    const beDir2 = path.join(tempDir, "app/api/projects/[id]");

    fs.mkdirSync(feDir, { recursive: true });
    fs.mkdirSync(beDir1, { recursive: true });
    fs.mkdirSync(beDir2, { recursive: true });

    // Frontend calls route with query params & dynamic parameter name
    fs.writeFileSync(
      path.join(feDir, "ProjectView.tsx"),
      `
      import React from "react";
      export function ProjectView() {
        async function load(projectId: string) {
          // Query string
          await fetch("/api/projects?page=1&limit=10");
          // Dynamic segment named projectId vs backend [id]
          await fetch(\`/api/projects/\${projectId}\`);
        }
        return <div onClick={() => load("p1")}>Projects</div>;
      }
      `
    );

    // Backend route /api/projects
    fs.writeFileSync(
      path.join(beDir1, "route.ts"),
      `
      import { NextResponse } from "next/server";
      export async function GET() {
        return NextResponse.json({ ok: true });
      }
      `
    );

    // Backend dynamic route /api/projects/[id]
    fs.writeFileSync(
      path.join(beDir2, "route.ts"),
      `
      import { NextResponse } from "next/server";
      export async function GET() {
        return NextResponse.json({ ok: true });
      }
      `
    );

    try {
      const graph = scanRepository(tempDir);
      expect(() => ArchitectureGraphSchema.parse(graph)).not.toThrow();

      // Zero MISSING_ENDPOINT errors
      const missingIssues = graph.issues.filter((i) => i.code === "MISSING_ENDPOINT");
      expect(missingIssues).toHaveLength(0);

      // Both wires are VERIFIED
      const queryWire = graph.wires.find((w) => w.targetId === "api:GET:/api/projects");
      expect(queryWire).toBeDefined();
      expect(queryWire?.status).toBe("VERIFIED");

      const dynamicWire = graph.wires.find((w) => w.targetId === "api:GET:/api/projects/[id]");
      expect(dynamicWire).toBeDefined();
      expect(dynamicWire?.status).toBe("VERIFIED");
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("catches FIELD_MISMATCH with destructured frontend response and backend variable return", () => {
    const tempDir = path.join(os.tmpdir(), "wb-test-destruct-" + Date.now());
    const feDir = path.join(tempDir, "components");
    const beDir = path.join(tempDir, "app/api/users");

    fs.mkdirSync(feDir, { recursive: true });
    fs.mkdirSync(beDir, { recursive: true });

    // Frontend destructuring { userId, role }
    fs.writeFileSync(
      path.join(feDir, "UserLoader.tsx"),
      `
      import React from "react";
      export function UserLoader() {
        async function fetchUser() {
          const res = await fetch("/api/users", { method: "POST" });
          const { userId, role } = await res.json();
          return { userId, role };
        }
        return <button onClick={fetchUser}>Load</button>;
      }
      `
    );

    // Backend returns variable { user_id, role }
    fs.writeFileSync(
      path.join(beDir, "route.ts"),
      `
      import { NextResponse } from "next/server";
      export async function POST() {
        const out = {
          user_id: 101,
          role: "admin",
        };
        return NextResponse.json(out);
      }
      `
    );

    try {
      const graph = scanRepository(tempDir);
      expect(() => ArchitectureGraphSchema.parse(graph)).not.toThrow();

      const issue = graph.issues.find((i) => i.code === "FIELD_MISMATCH");
      expect(issue).toBeDefined();
      expect(issue?.severity).toBe("BROKEN");
      expect(issue?.confidence).toBe("HIGH");
      expect(issue?.explanation).toContain("userId");
      expect(issue?.expectedShape).toHaveProperty("userId");
      expect(issue?.actualShape).toHaveProperty("user_id");
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("catches REQUEST_MISMATCH when frontend sends { userEmail } but backend expects { email }", () => {
    const tempDir = path.join(os.tmpdir(), "wb-test-req-mismatch-" + Date.now());
    const feDir = path.join(tempDir, "components");
    const beDir = path.join(tempDir, "app/api/auth/login");

    fs.mkdirSync(feDir, { recursive: true });
    fs.mkdirSync(beDir, { recursive: true });

    // Frontend sends { userEmail }
    fs.writeFileSync(
      path.join(feDir, "LoginForm.tsx"),
      `
      import React from "react";
      export function LoginForm() {
        async function login(userEmail: string) {
          await fetch("/api/auth/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userEmail }),
          });
        }
        return <button onClick={() => login("dev@example.com")}>Login</button>;
      }
      `
    );

    // Backend expects { email }
    fs.writeFileSync(
      path.join(beDir, "route.ts"),
      `
      import { NextResponse } from "next/server";
      export async function POST(req: Request) {
        const { email } = await req.json();
        return NextResponse.json({ ok: true });
      }
      `
    );

    try {
      const graph = scanRepository(tempDir);
      expect(() => ArchitectureGraphSchema.parse(graph)).not.toThrow();

      const issue = graph.issues.find((i) => i.code === "REQUEST_MISMATCH");
      expect(issue).toBeDefined();
      expect(issue?.severity).toBe("BROKEN");
      expect(issue?.confidence).toBe("HIGH");
      expect(issue?.explanation).toContain("email");
      expect(issue?.expectedShape).toHaveProperty("email");
      expect(issue?.actualShape).toHaveProperty("userEmail");
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("catches UNCHECKED_DB_ERROR when Supabase query ignores { error }", () => {
    const tempDir = path.join(os.tmpdir(), "wb-test-supabase-error-" + Date.now());
    const beDir = path.join(tempDir, "app/api/members");

    fs.mkdirSync(beDir, { recursive: true });

    // Backend route calling Supabase and ignoring error
    fs.writeFileSync(
      path.join(beDir, "route.ts"),
      `
      import { NextResponse } from "next/server";
      export async function POST(req: Request) {
        const { email } = await req.json();
        const { data } = await supabase.from("members").insert({ email });
        return NextResponse.json({ data });
      }
      `
    );

    try {
      const graph = scanRepository(tempDir);
      expect(() => ArchitectureGraphSchema.parse(graph)).not.toThrow();

      const issue = graph.issues.find((i) => i.code === "UNCHECKED_DB_ERROR");
      expect(issue).toBeDefined();
      expect(issue?.severity).toBe("SUSPICIOUS");
      expect(issue?.confidence).toBe("HIGH");
      expect(issue?.explanation).toContain("members");
      expect(issue?.explanation).toContain("error");
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("extracts real numbered source lines with > in sourceSnippet and targetSnippet", () => {
    const tempDir = path.join(os.tmpdir(), "wb-test-snippets-" + Date.now());
    const feDir = path.join(tempDir, "components");
    const beDir = path.join(tempDir, "app/api/items");

    fs.mkdirSync(feDir, { recursive: true });
    fs.mkdirSync(beDir, { recursive: true });

    const fePath = path.join(feDir, "ItemViewer.tsx");
    fs.writeFileSync(
      fePath,
      `import React from "react";
export function ItemViewer() {
  async function run() {
    const res = await fetch("/api/items", { method: "POST" });
    const { itemName } = await res.json();
    return itemName;
  }
  return <div onClick={run}>Click</div>;
}
`
    );

    const bePath = path.join(beDir, "route.ts");
    fs.writeFileSync(
      bePath,
      `import { NextResponse } from "next/server";
export async function POST() {
  const payload = {
    item_id: "itm_1",
    item_code: "ABC",
  };
  return NextResponse.json(payload);
}
`
    );

    try {
      const graph = scanRepository(tempDir);
      const issue = graph.issues.find((i) => i.code === "FIELD_MISMATCH");
      expect(issue).toBeDefined();

      // Check sourceSnippet formatting
      expect(issue?.sourceSnippet).toBeDefined();
      expect(issue?.sourceSnippet).toMatch(/>\s+\d+\s+\|/);
      expect(issue?.sourceSnippet).toContain("> ");
      expect(issue?.sourceSnippet).toContain("const { itemName } = await res.json();");

      // Check targetSnippet formatting
      expect(issue?.targetSnippet).toBeDefined();
      expect(issue?.targetSnippet).toMatch(/>\s+\d+\s+\|/);
      expect(issue?.targetSnippet).toContain("> ");

      // Check node codeSnippet
      const feNode = graph.nodes.find((n) => n.id === "fe:ItemViewer.tsx");
      expect(feNode?.codeSnippet).toBeDefined();
      expect(feNode?.codeSnippet).toMatch(/>\s+\d+\s+\|/);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
