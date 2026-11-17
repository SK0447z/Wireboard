import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { Project } from "ts-morph";
import { scanFrontendComponents } from "../scanFrontend";
import { scanRepository } from "../buildGraph";
import { generateContractReport } from "../generateReport";
import {
  isIpBlocked,
  validateReplayUrl,
  validateScanPath,
  validateGitHubRepo,
} from "../../lib/security";
import type { ArchitectureGraph } from "../../types/graph";

describe("Stage 1 (P0: Security & Core Correctness) Remediation Tests", () => {
  describe("P0.1 & P0.2 — Security: SSRF, Network & Filesystem Traversal", () => {
    const originalEnv = process.env.WIREBOARD_ALLOW_LOCAL_REPLAY;

    beforeEach(() => {
      delete process.env.WIREBOARD_ALLOW_LOCAL_REPLAY;
    });

    afterEach(() => {
      if (originalEnv !== undefined) {
        process.env.WIREBOARD_ALLOW_LOCAL_REPLAY = originalEnv;
      } else {
        delete process.env.WIREBOARD_ALLOW_LOCAL_REPLAY;
      }
    });

    it("blocks cloud metadata IPs unconditionally", async () => {
      expect(isIpBlocked("169.254.169.254")).toBe(true);
      expect(isIpBlocked("fd00:ec2::254")).toBe(true);
      expect(isIpBlocked("::169.254.169.254")).toBe(true); // IPv4-compatible IPv6
      expect(isIpBlocked("::ffff:169.254.169.254")).toBe(true); // IPv4-mapped IPv6
      expect(isIpBlocked("64:ff9b::169.254.169.254")).toBe(true); // NAT64 prefix

      const res1 = await validateReplayUrl("http://169.254.169.254/latest/meta-data");
      expect(res1.valid).toBe(false);
      expect(res1.error).toMatch(/blocked|forbidden|ssrf/i);

      // Cloud metadata domain (with and without trailing dot)
      const res2 = await validateReplayUrl("http://metadata.google.internal/computeMetadata/v1/");
      expect(res2.valid).toBe(false);

      const resTrailingDot = await validateReplayUrl("http://metadata.google.internal./computeMetadata/v1/");
      expect(resTrailingDot.valid).toBe(false);
      expect(resTrailingDot.error).toMatch(/cloud metadata/i);
    });

    it("blocks non-HTTP protocols like file://, gopher://, ftp://", async () => {
      const res1 = await validateReplayUrl("file:///etc/passwd");
      expect(res1.valid).toBe(false);
      expect(res1.error).toMatch(/protocol/i);

      const res2 = await validateReplayUrl("gopher://127.0.0.1:70/");
      expect(res2.valid).toBe(false);
    });

    it("blocks 0.0.0.0, link-local, and multicast unconditionally", async () => {
      expect(isIpBlocked("0.0.0.0")).toBe(true);
      expect(isIpBlocked("169.254.1.1")).toBe(true); // Link-local
      expect(isIpBlocked("224.0.0.1")).toBe(true); // Multicast
      expect(isIpBlocked("fe80::1")).toBe(true); // IPv6 Link-local
    });

    it("blocks private RFC1918 and loopback by default, allows only when WIREBOARD_ALLOW_LOCAL_REPLAY === 'true'", async () => {
      // Default: blocked
      expect(isIpBlocked("10.0.0.1")).toBe(true);
      expect(isIpBlocked("172.16.0.1")).toBe(true);
      expect(isIpBlocked("192.168.1.1")).toBe(true);
      expect(isIpBlocked("127.0.0.1")).toBe(true);
      expect(isIpBlocked("::1")).toBe(true);

      const resLoopback = await validateReplayUrl("http://localhost:3000/api/test");
      expect(resLoopback.valid).toBe(false);

      const resPrivate = await validateReplayUrl("http://192.168.1.50:8080/metrics");
      expect(resPrivate.valid).toBe(false);

      // Explicitly allowed via option or environment variable
      process.env.WIREBOARD_ALLOW_LOCAL_REPLAY = "true";
      expect(isIpBlocked("127.0.0.1", { allowLocal: true })).toBe(false);
      expect(isIpBlocked("192.168.1.1", { allowLocal: true })).toBe(false);

      const resAllowed = await validateReplayUrl("http://127.0.0.1:3000/api/test");
      expect(resAllowed.valid).toBe(true);

      // Cloud metadata must STILL be blocked even if local replay is enabled
      const resMeta = await validateReplayUrl("http://169.254.169.254/latest/meta-data");
      expect(resMeta.valid).toBe(false);
    });

    it("blocks path traversal outside allowed workspace boundaries with 403", () => {
      const traversalTarget = path.resolve(process.cwd(), "../../etc/passwd");
      const res = validateScanPath(traversalTarget);
      expect(res.valid).toBe(false);
      expect(res.status).toBe(403);
      expect(res.error).toMatch(/boundary|outside|forbidden|denied/i);
    });

    it("allows paths strictly within project workspace root or temporary scans dir", () => {
      const validLocal = path.resolve(process.cwd(), "test-fixtures/broken-app");
      const resLocal = validateScanPath(validLocal);
      expect(resLocal.valid).toBe(true);
      expect(resLocal.resolvedPath).toBeDefined();

      const scansDir = path.join(os.tmpdir(), "wireboard-scans");
      fs.mkdirSync(scansDir, { recursive: true });
      const resTmp = validateScanPath(scansDir);
      expect(resTmp.valid).toBe(true);
    });

    it("rejects non-directory file paths with 400 status", () => {
      const res = validateScanPath("package.json");
      expect(res.valid).toBe(false);
      expect(res.status).toBe(400);
      expect(res.error).toMatch(/not a directory/i);
    });

    it("strictly validates GitHub owner and repo rejecting directory traversal sequences", () => {
      expect(validateGitHubRepo("owner", "repo")).toBe(true);
      expect(validateGitHubRepo("owner", "repo.name-1_2")).toBe(true);
      expect(validateGitHubRepo(".", "repo")).toBe(false);
      expect(validateGitHubRepo("..", "repo")).toBe(false);
      expect(validateGitHubRepo("owner", "..")).toBe(false);
      expect(validateGitHubRepo("owner", "repo;rm -rf /")).toBe(false);
      expect(validateGitHubRepo("-owner", "repo")).toBe(false);
      expect(validateGitHubRepo("owner", "-repo")).toBe(false);
    });
  });

  describe("P0.3 — Frontend Node ID Collision Fix", () => {
    it("assigns unique fe:<relPath> IDs for multiple page.tsx files in different folders", () => {
      const project = new Project({
        skipAddingFilesFromTsConfig: true,
        compilerOptions: { allowJs: true, jsx: 2 },
      });

      const tempDir = path.join(os.tmpdir(), "wb-collision-test-" + Date.now());
      const loginDir = path.join(tempDir, "app/login");
      const dashboardDir = path.join(tempDir, "app/dashboard");

      fs.mkdirSync(loginDir, { recursive: true });
      fs.mkdirSync(dashboardDir, { recursive: true });

      fs.writeFileSync(
        path.join(loginDir, "page.tsx"),
        `
        import React from "react";
        export default function LoginPage() {
          return <div>Login</div>;
        }
        `
      );

      fs.writeFileSync(
        path.join(dashboardDir, "page.tsx"),
        `
        import React from "react";
        export default function DashboardPage() {
          return <div>Dashboard</div>;
        }
        `
      );

      try {
        const result = scanFrontendComponents(project, tempDir);
        expect(result.nodes).toHaveLength(2);

        const nodeIds = result.nodes.map((n) => n.id);
        expect(nodeIds).toContain("fe:app/login/page.tsx");
        expect(nodeIds).toContain("fe:app/dashboard/page.tsx");
        expect(new Set(nodeIds).size).toBe(2);

        // Check contextual label includes parent folder for generic router files
        const loginNode = result.nodes.find((n) => n.id === "fe:app/login/page.tsx");
        expect(loginNode?.label).toContain("login/page.tsx");

        const dashNode = result.nodes.find((n) => n.id === "fe:app/dashboard/page.tsx");
        expect(dashNode?.label).toContain("dashboard/page.tsx");
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });
  });

  describe("P0.4 — Accurate Verification States & Evidence-Based Confidence", () => {
    it("marks wires as UNKNOWN when static analysis lacks sufficient evidence on both sides", () => {
      const tempDir = path.join(os.tmpdir(), "wb-unknown-test-" + Date.now());
      const feDir = path.join(tempDir, "components");
      const beDir = path.join(tempDir, "app/api/opaque");

      fs.mkdirSync(feDir, { recursive: true });
      fs.mkdirSync(beDir, { recursive: true });

      // Frontend does not destructure or access response properties and sends no body
      fs.writeFileSync(
        path.join(feDir, "OpaqueConsumer.tsx"),
        `
        import React from "react";
        export function OpaqueConsumer() {
          async function ping() {
            await fetch("/api/opaque");
          }
          return <button onClick={ping}>Ping</button>;
        }
        `
      );

      // Backend returns void / empty response without return payload keys
      fs.writeFileSync(
        path.join(beDir, "route.ts"),
        `
        import { NextResponse } from "next/server";
        export async function GET() {
          return new Response(null, { status: 200 });
        }
        `
      );

      try {
        const graph = scanRepository(tempDir);
        expect(graph.wires).toHaveLength(1);
        const wire = graph.wires[0];
        // Must be marked UNKNOWN because neither side has verifiable contract schema/payload
        expect(wire.status).toBe("UNKNOWN");
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it("populates concrete file:line evidence[] and calculates dynamic confidence for issues", () => {
      const brokenAppPath = path.resolve(__dirname, "../../../test-fixtures/broken-app");
      const graph = scanRepository(brokenAppPath);

      expect(graph.issues.length).toBeGreaterThan(0);
      for (const issue of graph.issues) {
        expect(issue.evidence).toBeDefined();
        expect(Array.isArray(issue.evidence)).toBe(true);
        expect(issue.evidence.length).toBeGreaterThan(0);
        // Each evidence item should cite line or contract facts
        expect(issue.evidence[0]).toMatch(/\.(tsx|ts|prisma|env):\d+|route|payload|catch/i);
        expect(["HIGH", "MEDIUM", "LOW"]).toContain(issue.confidence);
      }
    });

    it("catches REQUEST_MISMATCH when frontend calls route with missing/empty body", () => {
      const tempDir = path.join(os.tmpdir(), "wb-missing-body-test-" + Date.now());
      const feDir = path.join(tempDir, "components");
      const beDir = path.join(tempDir, "app/api/auth");

      fs.mkdirSync(feDir, { recursive: true });
      fs.mkdirSync(beDir, { recursive: true });

      fs.writeFileSync(
        path.join(feDir, "LoginButton.tsx"),
        `
        import React from "react";
        export function LoginButton() {
          async function login() {
            // Sends POST without body
            await fetch("/api/auth", { method: "POST" });
          }
          return <button onClick={login}>Login</button>;
        }
        `
      );

      fs.writeFileSync(
        path.join(beDir, "route.ts"),
        `
        import { NextResponse } from "next/server";
        export async function POST(req: Request) {
          const { email, password } = await req.json();
          return NextResponse.json({ ok: true });
        }
        `
      );

      try {
        const graph = scanRepository(tempDir);
        expect(graph.wires).toHaveLength(1);
        const wire = graph.wires[0];
        expect(wire.status).toBe("BROKEN");
        expect(wire.issues.some((i) => i.code === "REQUEST_MISMATCH")).toBe(true);
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it("marks wire as UNKNOWN when frontend expects response properties but backend returns void", () => {
      const tempDir = path.join(os.tmpdir(), "wb-void-be-test-" + Date.now());
      const feDir = path.join(tempDir, "components");
      const beDir = path.join(tempDir, "app/api/status");

      fs.mkdirSync(feDir, { recursive: true });
      fs.mkdirSync(beDir, { recursive: true });

      fs.writeFileSync(
        path.join(feDir, "StatusWidget.tsx"),
        `
        import React from "react";
        export function StatusWidget() {
          async function check() {
            const res = await fetch("/api/status");
            const data = await res.json();
            console.log(data.status_code, data.latency);
          }
          return <button onClick={check}>Check</button>;
        }
        `
      );

      fs.writeFileSync(
        path.join(beDir, "route.ts"),
        `
        export async function GET() {
          return new Response(null, { status: 204 });
        }
        `
      );

      try {
        const graph = scanRepository(tempDir);
        expect(graph.wires).toHaveLength(1);
        const wire = graph.wires[0];
        // Must be UNKNOWN because backend provides no payload schema evidence
        expect(wire.status).toBe("UNKNOWN");
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });
  });

  describe("P0.5 — Honest Integrity Scoring & Scan Coverage", () => {
    it("yields 0% integrity score when totalWires === 0 or verifiableWires === 0 (never 100%)", () => {
      // 0 total wires
      const emptyGraph: ArchitectureGraph = {
        projectName: "empty-project",
        scannedAt: new Date().toISOString(),
        nodes: [],
        wires: [],
        issues: [],
        summary: {
          totalNodes: 0,
          verifiedWires: 0,
          brokenWires: 0,
          suspiciousWires: 0,
          unknownWires: 0,
          coverage: {
            filesScanned: 0,
            totalWires: 0,
            verifiableWires: 0,
            coveragePercent: 0,
          },
        },
      };

      const emptyReport = generateContractReport(emptyGraph);
      expect(emptyReport.score).toBe(0);
      expect(emptyReport.markdown).toContain("Contract Integrity Score: 0%");

      // Wires exist, but verifiableWires === 0 (all UNKNOWN)
      const unknownGraph: ArchitectureGraph = {
        projectName: "unknown-project",
        scannedAt: new Date().toISOString(),
        nodes: [],
        wires: [
          {
            id: "wire:unknown-1",
            sourceId: "fe:comp1",
            targetId: "ext:service",
            status: "UNKNOWN",
            issues: [],
          },
        ],
        issues: [],
        summary: {
          totalNodes: 2,
          verifiedWires: 0,
          brokenWires: 0,
          suspiciousWires: 0,
          unknownWires: 1,
          coverage: {
            filesScanned: 2,
            totalWires: 1,
            verifiableWires: 0,
            coveragePercent: 0,
          },
        },
      };

      const unknownReport = generateContractReport(unknownGraph);
      expect(unknownReport.score).toBe(0);
      expect(unknownReport.markdown).toContain("Contract Integrity Score: 0%");
      expect(unknownReport.markdown).toContain("Unknown Wires: 1");
    });
  });
});
