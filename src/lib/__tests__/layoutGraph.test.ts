import { describe, it, expect } from "vitest";
import path from "node:path";
import { scanRepository } from "@/engine/buildGraph";
import { layoutGraph, getEdgeStyle } from "../layoutGraph";

describe("layoutGraph with Dagre", () => {
  const brokenAppPath = path.resolve(__dirname, "../../../test-fixtures/broken-app");
  const graph = scanRepository(brokenAppPath);

  it("converts ArchitectureGraph into xyflow nodes and edges", () => {
    const { nodes, edges } = layoutGraph(graph);

    expect(nodes.length).toBe(graph.nodes.length);
    expect(edges.length).toBe(graph.wires.length);
  });

  it("enforces strict Left-to-Right column ordering (Frontend -> Backend -> DB)", () => {
    const { nodes } = layoutGraph(graph);

    const frontendNodes = nodes.filter((n) => n.data.node.kind === "FRONTEND_COMPONENT");
    const backendNodes = nodes.filter((n) => n.data.node.kind === "BACKEND_ROUTE");
    const dbNodes = nodes.filter((n) => n.data.node.kind === "DB_TABLE");

    expect(frontendNodes.length).toBeGreaterThan(0);
    expect(backendNodes.length).toBeGreaterThan(0);
    expect(dbNodes.length).toBeGreaterThan(0);

    const maxFrontendX = Math.max(...frontendNodes.map((n) => n.position.x));
    const minBackendX = Math.min(...backendNodes.map((n) => n.position.x));
    const maxBackendX = Math.max(...backendNodes.map((n) => n.position.x));
    const minDbX = Math.min(...dbNodes.map((n) => n.position.x));

    // Left column is strictly left of middle column
    expect(maxFrontendX).toBeLessThan(minBackendX);
    // Middle column is strictly left of right column
    expect(maxBackendX).toBeLessThan(minDbX);
  });

  it("positions SERVER_ACTION in middle column and EXTERNAL_SERVICE in right column", () => {
    const mockGraph = {
      ...graph,
      nodes: [
        ...graph.nodes,
        {
          id: "server-action-1",
          kind: "SERVER_ACTION" as const,
          label: "submitFormAction",
          filePath: "app/actions.ts",
          line: 10,
        },
        {
          id: "external-service-1",
          kind: "EXTERNAL_SERVICE" as const,
          label: "Stripe API",
          filePath: "lib/stripe.ts",
          line: 5,
        },
      ],
    };

    const { nodes } = layoutGraph(mockGraph);
    const actionNode = nodes.find((n) => n.id === "server-action-1")!;
    const externalNode = nodes.find((n) => n.id === "external-service-1")!;
    const frontendNode = nodes.find((n) => n.data.node.kind === "FRONTEND_COMPONENT")!;

    expect(actionNode.position.x).toBeGreaterThan(frontendNode.position.x);
    expect(externalNode.position.x).toBeGreaterThan(actionNode.position.x);
  });

  it("styles edges according to wire status", () => {
    const brokenStyle = getEdgeStyle("BROKEN");
    expect(brokenStyle.stroke).toBe("#EF4444");
    expect(brokenStyle.strokeWidth).toBe(2.5);
    expect(brokenStyle.animated).toBe(true);

    const suspiciousStyle = getEdgeStyle("SUSPICIOUS");
    expect(suspiciousStyle.stroke).toBe("#F59E0B");
    expect(suspiciousStyle.strokeWidth).toBe(2);
    expect(suspiciousStyle.strokeDasharray).toBe("6 4");
    expect(suspiciousStyle.animated).toBe(true);

    const verifiedStyle = getEdgeStyle("VERIFIED");
    expect(verifiedStyle.stroke).toBe("#10B981");
    expect(verifiedStyle.strokeWidth).toBe(1.75);
    expect(verifiedStyle.animated).toBe(false);
  });

  it("assigns correct status to nodes based on connected wires", () => {
    const { nodes } = layoutGraph(graph);

    // RegisterForm is connected to BROKEN wires
    const registerFormNode = nodes.find((n) => n.data.node.label.includes("RegisterForm"));
    expect(registerFormNode).toBeDefined();
    expect(registerFormNode?.data.status).toBe("BROKEN");
  });
});

