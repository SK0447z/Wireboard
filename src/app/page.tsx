"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  RotateCw,
  FolderGit2,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Network,
  Filter,
  Copy,
  Check,
} from "lucide-react";
import { AnchorNodeCard } from "@/components/AnchorNodeCard";
import { InspectorDrawer } from "@/components/InspectorDrawer";
import { layoutGraph, type AnchorNodeData, type ContractEdgeData } from "@/lib/layoutGraph";
import { generateContractReport } from "@/engine/generateReport";
import { calculateBlastRadius } from "@/engine/blastRadius";
import type {
  ArchitectureGraph,
  AnchorNode,
  ContractWire,
  DiagnosticIssue,
} from "@/types/graph";

const DEFAULT_REPO_PATH = "test-fixtures/broken-app";

export default function WireboardPage() {
  const [repoPath, setRepoPath] = useState(DEFAULT_REPO_PATH);
  const [pathInput, setPathInput] = useState(DEFAULT_REPO_PATH);
  const [graph, setGraph] = useState<ArchitectureGraph | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedWire, setSelectedWire] = useState<ContractWire | null>(null);
  const [selectedNode, setSelectedNode] = useState<AnchorNode | null>(null);
  const [selectedIssue, setSelectedIssue] = useState<DiagnosticIssue | null>(null);
  const [filterMode, setFilterMode] = useState<"all" | "issues_only">("all");
  const [copiedAudit, setCopiedAudit] = useState(false);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node<AnchorNodeData>>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge<ContractEdgeData>>([]);

  const nodeTypes = useMemo(() => ({ anchorNode: AnchorNodeCard }), []);

  const runScan = useCallback(async (target: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repoPath: target }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${res.status}: Failed to scan`);
      }

      const data: ArchitectureGraph = await res.json();
      setGraph(data);

      const { nodes: layoutedNodes, edges: layoutedEdges } = layoutGraph(data);
      setNodes(layoutedNodes);
      setEdges(layoutedEdges);

      // Reset active selections
      setSelectedWire(null);
      setSelectedNode(null);
      setSelectedIssue(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Scanning failed");
    } finally {
      setLoading(false);
    }
  }, [setNodes, setEdges]);

  useEffect(() => {
    runScan(DEFAULT_REPO_PATH);
  }, [runScan]);

  const handleScanSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pathInput.trim()) {
      setRepoPath(pathInput.trim());
      runScan(pathInput.trim());
    }
  };

  const handlePresetClick = (presetPath: string) => {
    setPathInput(presetPath);
    setRepoPath(presetPath);
    runScan(presetPath);
  };

  // Node Click (Triggers Blast Radius Highlighting)
  const handleNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      const anchorNode = (node.data as unknown as AnchorNodeData)?.node;
      if (!anchorNode) return;
      setSelectedNode(anchorNode);
      setSelectedWire(null);
      setSelectedIssue(null);

      if (graph) {
        const blast = calculateBlastRadius(graph, anchorNode.id);
        setNodes((nds) =>
          nds.map((n) => {
            const isTarget = n.id === anchorNode.id;
            const isBlast = blast.affectedNodeIds.includes(n.id) && !isTarget;
            return {
              ...n,
              selected: isTarget,
              data: {
                ...n.data,
                isBlastRadius: isBlast,
              },
            };
          })
        );
        setEdges((eds) =>
          eds.map((e) => ({
            ...e,
            selected: blast.affectedWires.includes(e.id),
          }))
        );
      }
    },
    [graph, setNodes, setEdges]
  );

  // Edge Click
  const handleEdgeClick = useCallback(
    (_: React.MouseEvent, edge: Edge) => {
      const wire = (edge.data as unknown as ContractEdgeData)?.wire;
      if (wire) {
        setSelectedWire(wire);
        setSelectedNode(null);
        if (wire.issues.length > 0) {
          setSelectedIssue(wire.issues[0]);
        } else {
          setSelectedIssue(null);
        }
        setEdges((eds) =>
          eds.map((e) => ({ ...e, selected: e.id === wire.id }))
        );
        setNodes((nds) =>
          nds.map((n) => ({
            ...n,
            selected: n.id === wire.sourceId || n.id === wire.targetId,
            data: {
              ...n.data,
              isBlastRadius: false,
            },
          }))
        );
      }
    },
    [setEdges, setNodes]
  );

  // Canvas pane click -> deselect
  const handlePaneClick = useCallback(() => {
    setSelectedNode(null);
    setSelectedWire(null);
    setSelectedIssue(null);
    setEdges((eds) => eds.map((e) => ({ ...e, selected: false })));
    setNodes((nds) =>
      nds.map((n) => ({
        ...n,
        selected: false,
        data: {
          ...n.data,
          isBlastRadius: false,
        },
      }))
    );
  }, [setEdges, setNodes]);

  // Select Issue from Drawer or diagnostics
  const handleSelectIssue = useCallback(
    (issue: DiagnosticIssue) => {
      setSelectedIssue(issue);
      setSelectedNode(null);

      const matchingWire = graph?.wires.find((w) => w.id === issue.wireId);
      if (matchingWire) {
        setSelectedWire(matchingWire);
        setEdges((eds) =>
          eds.map((e) => ({ ...e, selected: e.id === matchingWire.id }))
        );
        setNodes((nds) =>
          nds.map((n) => ({
            ...n,
            selected:
              n.id === matchingWire.sourceId || n.id === matchingWire.targetId,
            data: {
              ...n.data,
              isBlastRadius: false,
            },
          }))
        );
      }
    },
    [graph, setEdges, setNodes]
  );

  // Clear Selection
  const handleClearSelection = useCallback(() => {
    setSelectedNode(null);
    setSelectedWire(null);
    setSelectedIssue(null);
    setEdges((eds) => eds.map((e) => ({ ...e, selected: false })));
    setNodes((nds) =>
      nds.map((n) => ({
        ...n,
        selected: false,
        data: {
          ...n.data,
          isBlastRadius: false,
        },
      }))
    );
  }, [setEdges, setNodes]);

  // Calculate Contract Integrity Score and report
  const auditReport = useMemo(() => {
    if (!graph) return null;
    return generateContractReport(graph);
  }, [graph]);

  const handleCopyAuditMd = useCallback(() => {
    if (!auditReport) return;
    navigator.clipboard.writeText(auditReport.markdown);
    setCopiedAudit(true);
    setTimeout(() => setCopiedAudit(false), 2000);
  }, [auditReport]);

  // Filter edges if "issues_only" active
  const filteredEdges = useMemo(() => {
    if (filterMode === "issues_only") {
      return edges.map((e) => ({
        ...e,
        hidden: e.data?.status === "VERIFIED",
      }));
    }
    return edges;
  }, [edges, filterMode]);

  return (
    <div
      className="flex flex-col h-screen w-screen bg-[#09090b] text-zinc-100 overflow-hidden font-sans select-none"
      style={{ height: "100vh", width: "100vw", display: "flex", flexDirection: "column", overflow: "hidden", backgroundColor: "#09090b" }}
    >
      {/* Top Control Bar */}
      <header className="h-12 border-b border-white/10 px-4 flex items-center justify-between bg-[#09090b] z-30 shrink-0">
        {/* Left: Brand & Path Controls */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 pr-2 border-r border-zinc-800">
            <Network className="w-4 h-4 text-emerald-400 stroke-[1.75]" />
            <span className="font-mono font-bold tracking-tight text-xs text-zinc-100">
              WIREBOARD
            </span>
          </div>

          <form onSubmit={handleScanSubmit} className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-[#111115] border border-zinc-800 text-zinc-300">
              <FolderGit2 className="w-3.5 h-3.5 text-zinc-400 stroke-[1.5]" />
              <input
                type="text"
                value={pathInput}
                onChange={(e) => setPathInput(e.target.value)}
                placeholder="Local path or https://github.com/owner/repo..."
                className="w-72 bg-transparent text-xs font-mono text-zinc-200 placeholder:text-zinc-600 focus:outline-none"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="h-7 px-2.5 rounded bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-xs font-mono text-zinc-200 border border-zinc-700 transition-colors flex items-center gap-1.5"
            >
              {loading ? (
                <>
                  <RotateCw className="w-3 h-3 animate-spin stroke-[1.5] text-zinc-400" />
                  <span>Scanning AST...</span>
                </>
              ) : (
                <span>Scan</span>
              )}
            </button>
          </form>

          {/* Preset Pills */}
          <div className="flex items-center gap-1.5 pl-1 border-l border-zinc-800">
            <button
              type="button"
              onClick={() => handlePresetClick("test-fixtures/broken-app")}
              disabled={loading}
              className={`h-7 px-2 rounded text-xs font-mono transition-colors border ${
                repoPath === "test-fixtures/broken-app"
                  ? "bg-zinc-800 text-zinc-100 border-zinc-700 font-medium"
                  : "bg-[#111115] text-zinc-400 border-zinc-800/80 hover:text-zinc-200 hover:border-zinc-700"
              }`}
            >
              Fixture: broken-app
            </button>
            <button
              type="button"
              onClick={() => handlePresetClick(".")}
              disabled={loading}
              className={`h-7 px-2 rounded text-xs font-mono transition-colors border ${
                repoPath === "."
                  ? "bg-zinc-800 text-zinc-100 border-zinc-700 font-medium"
                  : "bg-[#111115] text-zinc-400 border-zinc-800/80 hover:text-zinc-200 hover:border-zinc-700"
              }`}
            >
              Self-Scan: Wireboard
            </button>
          </div>

          <button
            onClick={() => runScan(repoPath)}
            disabled={loading}
            className="h-7 px-2.5 rounded bg-[#111115] hover:bg-zinc-800 disabled:opacity-50 text-xs font-mono text-zinc-300 border border-zinc-800 flex items-center gap-1.5 transition-colors"
            title="Re-Scan Active Project"
          >
            <RotateCw
              className={`w-3.5 h-3.5 stroke-[1.5] ${loading ? "animate-spin" : ""}`}
            />
            <span>Re-Scan</span>
          </button>
        </div>

        {/* Center / Right: Metrics & Filter Toggles */}
        {graph && (
          <div className="flex items-center gap-3">
            {/* Contract Integrity Score Badge */}
            {auditReport && (
              <span
                className={`font-mono text-xs tabular-nums px-2.5 py-0.5 rounded border font-semibold flex items-center gap-1.5 ${
                  auditReport.score === 100
                    ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                    : auditReport.score >= 70
                    ? "bg-amber-500/10 border-amber-500/30 text-amber-400"
                    : "bg-rose-500/10 border-rose-500/30 text-rose-400"
                }`}
                title="Contract Integrity Score"
              >
                Score: {auditReport.score}%
              </span>
            )}

            {/* Status Counters */}
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs text-zinc-400 tabular-nums px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800">
                {graph.summary.totalNodes} Nodes
              </span>

              <span className="font-mono text-xs text-emerald-400 tabular-nums px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3 stroke-[1.5]" />
                {graph.summary.verifiedWires} Verified
              </span>

              <span className="font-mono text-xs text-amber-400 tabular-nums px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3 stroke-[1.5]" />
                {graph.summary.suspiciousWires} Suspicious
              </span>

              <span className="font-mono text-xs text-rose-400 tabular-nums px-2 py-0.5 rounded bg-rose-500/10 border border-rose-500/20 flex items-center gap-1">
                <AlertCircle className="w-3 h-3 stroke-[1.5]" />
                {graph.summary.brokenWires} Broken
              </span>
            </div>

            {/* Copy Audit MD Button */}
            <button
              type="button"
              onClick={handleCopyAuditMd}
              className={`h-7 px-2.5 rounded text-xs font-mono transition-colors border flex items-center gap-1.5 ${
                copiedAudit
                  ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-400"
                  : "bg-[#111115] hover:bg-zinc-800 text-zinc-300 border-zinc-800 hover:text-zinc-100"
              }`}
              title="Copy Audit Report in Markdown format to clipboard"
            >
              {copiedAudit ? (
                <>
                  <Check className="w-3.5 h-3.5 stroke-[2] text-emerald-400" />
                  <span>Copied Audit MD</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 stroke-[1.5] text-zinc-400" />
                  <span>Copy Audit MD</span>
                </>
              )}
            </button>

            {/* Filter Toggle */}
            <div className="flex items-center rounded bg-[#111115] border border-zinc-800 p-0.5 text-xs font-mono">
              <button
                onClick={() => setFilterMode("all")}
                className={`px-2 py-0.5 rounded transition-colors ${
                  filterMode === "all"
                    ? "bg-zinc-800 text-zinc-100 font-medium"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                All Wires
              </button>
              <button
                onClick={() => setFilterMode("issues_only")}
                className={`px-2 py-0.5 rounded flex items-center gap-1 transition-colors ${
                  filterMode === "issues_only"
                    ? "bg-zinc-800 text-zinc-100 font-medium"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                <Filter className="w-3 h-3 stroke-[1.5]" />
                Issues Only
              </button>
            </div>
          </div>
        )}
      </header>

      {/* Main Content: Canvas & Inspector */}
      <div className="flex flex-1 min-h-0 w-full relative overflow-hidden">
        {/* React Flow Canvas */}
        <div
          className="flex-1 h-full min-h-0 relative"
          style={{ flex: 1, height: "100%", width: "100%", position: "relative" }}
        >
          {loading && (
            <div className="absolute inset-0 bg-[#09090b]/80 backdrop-blur-xs flex items-center justify-center z-20">
              <div className="flex items-center gap-2.5 font-mono text-xs text-zinc-300">
                <RotateCw className="w-4 h-4 animate-spin stroke-[1.5] text-zinc-400" />
                Scanning architecture contracts...
              </div>
            </div>
          )}

          {error && (
            <div className="absolute top-4 left-4 z-20 max-w-md p-3 rounded bg-[#181113]/95 border border-rose-800/60 text-rose-200 text-xs font-mono shadow-xl backdrop-blur-xs">
              <div className="font-bold flex items-center justify-between gap-2 mb-1.5 text-rose-300">
                <div className="flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 text-rose-400 stroke-[1.75]" />
                  <span>Scan Error</span>
                </div>
                <button
                  onClick={() => setError(null)}
                  className="text-zinc-500 hover:text-zinc-300 text-[10px] uppercase font-mono px-1 rounded hover:bg-zinc-800/50 transition-colors"
                >
                  Dismiss
                </button>
              </div>
              <div className="text-zinc-300 leading-relaxed break-words">{error}</div>
            </div>
          )}

          <ReactFlow
            nodes={nodes}
            edges={filteredEdges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={handleNodeClick}
            onEdgeClick={handleEdgeClick}
            onPaneClick={handlePaneClick}
            fitView
            minZoom={0.2}
            maxZoom={1.5}
            proOptions={{ hideAttribution: true }}
          >
            <Background color="#27272a" gap={20} size={1} />
            <Controls
              className="!bg-[#111115] !border-zinc-800 !fill-zinc-400 [&>button]:!border-zinc-800 hover:[&>button]:!bg-zinc-800 [&>button]:!bg-transparent"
              showInteractive={false}
            />
            <MiniMap
              nodeColor={(node) => {
                const status = (node.data as unknown as AnchorNodeData)?.status;
                if (status === "BROKEN") return "#EF4444";
                if (status === "SUSPICIOUS") return "#F59E0B";
                return "#27272a";
              }}
              nodeStrokeWidth={2}
              className="!bg-[#0d0d10] !border !border-zinc-800/80 !rounded"
              maskColor="rgba(9, 9, 11, 0.75)"
            />
          </ReactFlow>
        </div>

        {/* Right Inspector Drawer */}
        {graph && (
          <InspectorDrawer
            graph={graph}
            selectedWire={selectedWire}
            selectedNode={selectedNode}
            selectedIssue={selectedIssue}
            onSelectIssue={handleSelectIssue}
            onSelectWire={setSelectedWire}
            onSelectNode={setSelectedNode}
            onClearSelection={handleClearSelection}
          />
        )}
      </div>
    </div>
  );
}
