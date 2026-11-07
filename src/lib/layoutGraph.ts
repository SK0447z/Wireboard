import dagre from "dagre";
import { type Node, type Edge, MarkerType } from "@xyflow/react";
import type {
  ArchitectureGraph,
  AnchorNode,
  ContractWire,
  WireStatus,
} from "@/types/graph";

export interface AnchorNodeData {
  node: AnchorNode;
  status: WireStatus;
  connectedWireIds: string[];
  issuesCount: number;
  [key: string]: unknown;
}

export interface ContractEdgeData {
  wire: ContractWire;
  status: WireStatus;
  [key: string]: unknown;
}

export const NODE_WIDTH = 340;
export const NODE_HEIGHT = 160;
export const RANK_SEP = 180;
export const NODE_SEP = 60;
export const START_X = 60;
export const START_Y = 60;

export function getEdgeStyle(status: WireStatus) {
  switch (status) {
    case "BROKEN":
      return {
        stroke: "#EF4444",
        strokeWidth: 2.5,
        strokeDasharray: undefined,
        animated: true,
      };
    case "SUSPICIOUS":
      return {
        stroke: "#F59E0B",
        strokeWidth: 2,
        strokeDasharray: "6 4",
        animated: true,
      };
    case "VERIFIED":
      return {
        stroke: "#10B981",
        strokeWidth: 1.75,
        strokeDasharray: undefined,
        animated: false,
      };
  }
}

export function getNodeStatus(
  nodeId: string,
  wires: ContractWire[]
): { status: WireStatus; connectedWireIds: string[]; issuesCount: number } {
  const connected = wires.filter(
    (w) => w.sourceId === nodeId || w.targetId === nodeId
  );
  const connectedWireIds = connected.map((w) => w.id);
  const issuesCount = connected.reduce((acc, w) => acc + w.issues.length, 0);

  let status: WireStatus = "VERIFIED";
  if (connected.some((w) => w.status === "BROKEN")) {
    status = "BROKEN";
  } else if (connected.some((w) => w.status === "SUSPICIOUS")) {
    status = "SUSPICIOUS";
  }

  return { status, connectedWireIds, issuesCount };
}

export function layoutGraph(graph: ArchitectureGraph): {
  nodes: Node<AnchorNodeData>[];
  edges: Edge<ContractEdgeData>[];
} {
  const g = new dagre.graphlib.Graph();
  g.setGraph({
    rankdir: "LR",
    ranksep: RANK_SEP,
    nodesep: NODE_SEP,
  });
  g.setDefaultEdgeLabel(() => ({}));

  for (const node of graph.nodes) {
    g.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  }

  for (const wire of graph.wires) {
    g.setEdge(wire.sourceId, wire.targetId);
  }

  dagre.layout(g);

  // Group nodes by column based on kind
  const columnNodes: Record<number, AnchorNode[]> = {
    0: [],
    1: [],
    2: [],
  };

  for (const node of graph.nodes) {
    const colIndex =
      node.kind === "FRONTEND_COMPONENT"
        ? 0
        : node.kind === "BACKEND_ROUTE"
        ? 1
        : 2;
    columnNodes[colIndex].push(node);
  }

  const positions = new Map<string, { x: number; y: number }>();

  for (let col = 0; col < 3; col++) {
    const colX = START_X + col * (NODE_WIDTH + RANK_SEP);
    const sorted = [...columnNodes[col]].sort((a, b) => {
      const ya = g.node(a.id)?.y ?? 0;
      const yb = g.node(b.id)?.y ?? 0;
      return ya - yb;
    });

    let currentY = START_Y;
    for (const node of sorted) {
      const dagreNode = g.node(node.id);
      const targetY = dagreNode ? dagreNode.y - NODE_HEIGHT / 2 : currentY;
      const y = Math.max(currentY, targetY);
      positions.set(node.id, { x: colX, y });
      currentY = y + NODE_HEIGHT + NODE_SEP;
    }
  }

  const nodes: Node<AnchorNodeData>[] = graph.nodes.map((node) => {
    const pos = positions.get(node.id) || { x: 0, y: 0 };
    const { status, connectedWireIds, issuesCount } = getNodeStatus(
      node.id,
      graph.wires
    );

    return {
      id: node.id,
      type: "anchorNode",
      position: pos,
      data: {
        node,
        status,
        connectedWireIds,
        issuesCount,
      },
    };
  });

  const edges: Edge<ContractEdgeData>[] = graph.wires.map((wire) => {
    const style = getEdgeStyle(wire.status);

    return {
      id: wire.id,
      source: wire.sourceId,
      target: wire.targetId,
      type: "smoothstep",
      animated: style.animated,
      style: {
        stroke: style.stroke,
        strokeWidth: style.strokeWidth,
        strokeDasharray: style.strokeDasharray,
      },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: style.stroke,
        width: 14,
        height: 14,
      },
      data: {
        wire,
        status: wire.status,
      },
    };
  });

  return { nodes, edges };
}

