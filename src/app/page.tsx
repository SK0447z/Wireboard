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
  Copy,
  Check,
  LayoutDashboard,
  ShieldAlert,
  History,
  Bot,
  Network,
} from "lucide-react";
import { AnchorNodeCard } from "@/components/AnchorNodeCard";
import { InspectorDrawer } from "@/components/InspectorDrawer";
import { OverviewView, type ScanHistoryItem } from "@/components/OverviewView";
import { DiagnosticsView } from "@/components/DiagnosticsView";
import { HistoryView } from "@/components/HistoryView";
import { AiArchitectView } from "@/components/AiArchitectView";
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
const HISTORY_STORAGE_KEY = "wireboard_scan_history";
const MAX_HISTORY_ITEMS = 15;

type ControlRoomTab =
  | "architecture"
  | "overview"
  | "diagnostics"
  | "history"
  | "ai_architect";

export default function WireboardPage() {
  const [activeTab, setActiveTab] = useState<ControlRoomTab>("architecture");
  const [diagnosticsFilterCode, setDiagnosticsFilterCode] = useState<string | null>(null);

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

  // Scan History
  const [scanHistory, setScanHistory] = useState<ScanHistoryItem[]>([]);
  const [currentScanId, setCurrentScanId] = useState<string | undefined>(undefined);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node<AnchorNodeData>>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge<ContractEdgeData>>([]);

  const nodeTypes = useMemo(() => ({ anchorNode: AnchorNodeCard }), []);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(HISTORY_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          setScanHistory(parsed);
        }
      }
    } catch {
      // ignore
    }
  }, []);

  const saveToHistory = useCallback((newGraph: ArchitectureGraph, targetPath: string) => {
    try {
      const report = generateContractReport(newGraph);
      const newScanId = `${Date.now()}-${newGraph.projectName}`;
      const newItem: ScanHistoryItem = {
        id: newScanId,
        scannedAt: new Date().toLocaleTimeString(),
        projectName: newGraph.projectName,
        repoPath: targetPath,
        score: report.score,
        totalNodes: newGraph.summary.totalNodes,
        verifiedWires: newGraph.summary.verifiedWires,
        suspiciousWires: newGraph.summary.suspiciousWires,
        brokenWires: newGraph.summary.brokenWires,
        totalIssues: newGraph.issues.length,
        brokenIssues: newGraph.issues.filter((i) => i.severity === "BROKEN").length,
        suspiciousIssues: newGraph.issues.filter((i) => i.severity === "SUSPICIOUS").length,
        graph: newGraph,
      };

      setCurrentScanId(newScanId);
      setScanHistory((prev) => {
        const updated = [newItem, ...prev.filter((i) => i.id !== newItem.id)].slice(
          0,
          MAX_HISTORY_ITEMS
        );
        try {
          localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(updated));
        } catch {
          // ignore
        }
        return updated;
      });
    } catch {
      // ignore
    }
  }, []);

  const runScan = useCallback(
    async (target: string) => {
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

        setSelectedWire(null);
        setSelectedNode(null);
        setSelectedIssue(null);

        saveToHistory(data, target);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Scanning failed");
      } finally {
        setLoading(false);
      }
    },
    [setNodes, setEdges, saveToHistory]
  );

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

  const handleRestoreSnapshot = useCallback(
    (item: ScanHistoryItem) => {
      setGraph(item.graph);
      setCurrentScanId(item.id);
      setRepoPath(item.repoPath);
      setPathInput(item.repoPath);

      const { nodes: layoutedNodes, edges: layoutedEdges } = layoutGraph(item.graph);
      setNodes(layoutedNodes);
      setEdges(layoutedEdges);

      setSelectedWire(null);
      setSelectedNode(null);
      setSelectedIssue(null);
      setActiveTab("architecture");
    },
    [setNodes, setEdges]
  );

  const handleDeleteSnapshot = useCallback((id: string) => {
    setScanHistory((prev) => {
      const updated = prev.filter((item) => item.id !== id);
      try {
        localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(updated));
      } catch {
        // ignore
      }
      return updated;
    });
  }, []);

  const handleClearHistory = useCallback(() => {
    setScanHistory([]);
    try {
      localStorage.removeItem(HISTORY_STORAGE_KEY);
    } catch {
      // ignore
    }
  }, []);

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

  const filteredEdges = useMemo(() => {
    if (filterMode === "issues_only") {
      return edges.map((e) => ({
        ...e,
        hidden: e.data?.status === "VERIFIED",
      }));
    }
    return edges;
  }, [edges, filterMode]);

  const handleNavigateToDiagnostics = (code?: string) => {
    setDiagnosticsFilterCode(code || null);
    setActiveTab("diagnostics");
  };

  const handleNavigateToArchitecture = (nodeId?: string) => {
    setActiveTab("architecture");
    if (nodeId && graph) {
      const matchNode = graph.nodes.find((n) => n.id === nodeId);
      if (matchNode) {
        setSelectedNode(matchNode);
        setSelectedWire(null);
        setSelectedIssue(null);
      }
    }
  };

  const handleNavigateByFilePath = (filePath?: string) => {
    setActiveTab("architecture");
    if (filePath && graph) {
      const matchNode = graph.nodes.find((n) => n.filePath === filePath);
      if (matchNode) {
        setSelectedNode(matchNode);
        setSelectedWire(null);
        setSelectedIssue(null);
      }
    }
  };

  const priorScan = useMemo(() => {
    if (scanHistory.length <= 1) return null;
    const currentIdx = scanHistory.findIndex((s) => s.id === currentScanId);
    if (currentIdx !== -1 && scanHistory[currentIdx + 1]) {
      return scanHistory[currentIdx + 1];
    }
    return scanHistory[1] || null;
  }, [scanHistory, currentScanId]);

  return (
    <div
      className="flex flex-col h-screen w-screen bg-[#09090b] text-zinc-100 overflow-hidden font-sans select-none"
      style={{
        height: "100vh",
        width: "100vw",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        backgroundColor: "#09090b",
      }}
    >
      {/* Top Command Bar */}
      <header className="h-11 border-b border-white/[0.07] px-3 flex items-center justify-between bg-[#0b0b0e] z-30 shrink-0">
        {/* Left: Brand & Unified Toolbar Group */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 pr-3 border-r border-white/[0.08]">
            <span className="font-mono font-bold tracking-tight text-[12px] text-zinc-100">
              WIREBOARD
            </span>
          </div>

          <form onSubmit={handleScanSubmit} className="flex items-center gap-1.5">
            <input
              type="text"
              value={pathInput}
              onChange={(e) => setPathInput(e.target.value)}
              placeholder="Local path or github repo..."
              className="bg-[#070709] border border-white/[0.08] rounded-[4px] h-7 px-2.5 font-mono text-[11px] text-zinc-200 placeholder:text-zinc-600 focus:outline-none w-60"
            />
            <button
              type="submit"
              disabled={loading}
              className="h-7 px-2.5 rounded-[4px] bg-zinc-100 hover:bg-white disabled:opacity-40 text-zinc-950 font-medium text-[11px] font-mono transition-colors cursor-pointer"
            >
              {loading ? "Scanning..." : "Scan"}
            </button>
          </form>

          {/* Compact Presets */}
          <div className="flex items-center gap-1 pl-1">
            <button
              type="button"
              onClick={() => handlePresetClick("test-fixtures/broken-app")}
              disabled={loading}
              className={`h-7 px-2 rounded-[4px] text-[11px] font-mono transition-colors border cursor-pointer ${
                repoPath === "test-fixtures/broken-app"
                  ? "bg-white/[0.08] text-zinc-100 border-white/[0.16] font-medium"
                  : "bg-transparent text-zinc-500 border-white/[0.06] hover:text-zinc-300 hover:bg-white/[0.03]"
              }`}
            >
              broken-app
            </button>
            <button
              type="button"
              onClick={() => handlePresetClick(".")}
              disabled={loading}
              className={`h-7 px-2 rounded-[4px] text-[11px] font-mono transition-colors border cursor-pointer ${
                repoPath === "."
                  ? "bg-white/[0.08] text-zinc-100 border-white/[0.16] font-medium"
                  : "bg-transparent text-zinc-500 border-white/[0.06] hover:text-zinc-300 hover:bg-white/[0.03]"
              }`}
            >
              self
            </button>
            <button
              onClick={() => runScan(repoPath)}
              disabled={loading}
              className="h-7 px-1.5 rounded-[4px] text-zinc-500 hover:text-zinc-300 border border-white/[0.06] hover:bg-white/[0.03] text-[11px] font-mono flex items-center transition-colors cursor-pointer"
              title="Re-Scan Active Project"
            >
              <RotateCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        {/* Right: Quiet Segmented Status Bar & Actions */}
        {graph && (
          <div className="flex items-center gap-2.5">
            {/* Single Quiet Segmented Status Bar */}
            <div className="flex items-center divide-x divide-white/[0.08] border border-white/[0.07] rounded-[4px] bg-[#070709] px-2 py-1 text-[11px] font-mono text-zinc-300 tabular-nums">
              <span className="pr-2">{graph.summary.totalNodes} Nodes</span>
              <span className="px-2 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#10B981]" />
                {graph.summary.verifiedWires} Verified
              </span>
              <span className="px-2 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#F59E0B]" />
                {graph.summary.suspiciousWires} Suspicious
              </span>
              <span className="px-2 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#EF4444]" />
                {graph.summary.brokenWires} Broken
              </span>
              {auditReport && (
                <span className="pl-2 font-medium">
                  Integrity{" "}
                  <span
                    className={
                      auditReport.score === 100
                        ? "text-emerald-400 font-semibold"
                        : auditReport.score >= 70
                        ? "text-amber-400 font-semibold"
                        : "text-rose-400 font-semibold"
                    }
                  >
                    {auditReport.score}%
                  </span>
                </span>
              )}
            </div>

            {/* Copy Audit MD Button */}
            <button
              type="button"
              onClick={handleCopyAuditMd}
              className="h-7 px-2 rounded-[4px] text-[11px] font-mono text-zinc-400 hover:text-zinc-200 border border-white/[0.06] bg-[#0e0e11] hover:bg-white/[0.04] transition-colors flex items-center gap-1 cursor-pointer"
              title="Copy Audit Report in Markdown format to clipboard"
            >
              {copiedAudit ? (
                <>
                  <Check className="w-3 h-3 text-emerald-400" />
                  <span>Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-3 h-3 text-zinc-500" />
                  <span>Report</span>
                </>
              )}
            </button>

            {/* Filter Toggle (when in architecture view) */}
            {activeTab === "architecture" && (
              <div className="flex items-center rounded-[4px] bg-[#070709] border border-white/[0.07] p-0.5 text-[10px] font-mono">
                <button
                  onClick={() => setFilterMode("all")}
                  className={`px-2 py-0.5 rounded-[3px] transition-colors cursor-pointer ${
                    filterMode === "all"
                      ? "bg-white/[0.08] text-zinc-100 font-medium"
                      : "text-zinc-500 hover:text-zinc-300"
                  }`}
                >
                  All
                </button>
                <button
                  onClick={() => setFilterMode("issues_only")}
                  className={`px-2 py-0.5 rounded-[3px] transition-colors cursor-pointer ${
                    filterMode === "issues_only"
                      ? "bg-white/[0.08] text-zinc-100 font-medium"
                      : "text-zinc-500 hover:text-zinc-300"
                  }`}
                >
                  Issues
                </button>
              </div>
            )}
          </div>
        )}
      </header>

      {/* Main Workspace */}
      <div className="flex flex-1 min-h-0 w-full relative overflow-hidden">
        {/* Left Navigation Rail */}
        <nav className="w-40 border-r border-white/[0.07] bg-[#0b0b0e] flex flex-col justify-between p-2 shrink-0 z-20">
          <div className="space-y-0.5">
            <div className="px-2 py-1 text-[10px] font-mono uppercase tracking-wider text-zinc-600 font-medium">
              Control Room
            </div>

            <button
              onClick={() => setActiveTab("architecture")}
              className={`w-full h-8 px-2.5 rounded-[4px] text-[12px] font-medium transition-colors flex items-center gap-2 cursor-pointer text-left ${
                activeTab === "architecture"
                  ? "bg-white/[0.06] text-zinc-100"
                  : "text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.02]"
              }`}
            >
              <Network className="w-3.5 h-3.5 shrink-0" />
              <span>Architecture</span>
            </button>

            <button
              onClick={() => setActiveTab("overview")}
              className={`w-full h-8 px-2.5 rounded-[4px] text-[12px] font-medium transition-colors flex items-center gap-2 cursor-pointer text-left ${
                activeTab === "overview"
                  ? "bg-white/[0.06] text-zinc-100"
                  : "text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.02]"
              }`}
            >
              <LayoutDashboard className="w-3.5 h-3.5 shrink-0" />
              <span>Overview</span>
            </button>

            <button
              onClick={() => {
                setDiagnosticsFilterCode(null);
                setActiveTab("diagnostics");
              }}
              className={`w-full h-8 px-2.5 rounded-[4px] text-[12px] font-medium transition-colors flex items-center justify-between cursor-pointer text-left ${
                activeTab === "diagnostics"
                  ? "bg-white/[0.06] text-zinc-100"
                  : "text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.02]"
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
                <span>Diagnostics</span>
              </div>
              {graph && graph.issues.length > 0 && (
                <span className="font-mono text-[10px] text-zinc-500 tabular-nums">
                  {graph.issues.length}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab("history")}
              className={`w-full h-8 px-2.5 rounded-[4px] text-[12px] font-medium transition-colors flex items-center justify-between cursor-pointer text-left ${
                activeTab === "history"
                  ? "bg-white/[0.06] text-zinc-100"
                  : "text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.02]"
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <History className="w-3.5 h-3.5 shrink-0" />
                <span>History</span>
              </div>
              {scanHistory.length > 0 && (
                <span className="font-mono text-[10px] text-zinc-500 tabular-nums">
                  {scanHistory.length}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab("ai_architect")}
              className={`w-full h-8 px-2.5 rounded-[4px] text-[12px] font-medium transition-colors flex items-center gap-2 cursor-pointer text-left ${
                activeTab === "ai_architect"
                  ? "bg-white/[0.06] text-zinc-100"
                  : "text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.02]"
              }`}
            >
              <Bot className="w-3.5 h-3.5 shrink-0" />
              <span>AI Architect</span>
            </button>
          </div>

          {/* Rail Footer */}
          <div className="px-2 py-1.5 font-mono text-[10px] text-zinc-600 flex items-center justify-between border-t border-white/[0.05]">
            <span>AST v2</span>
            <span>READY</span>
          </div>
        </nav>

        {/* View 1: Architecture Canvas & Inspector */}
        {activeTab === "architecture" && (
          <div className="flex flex-1 min-h-0 w-full relative overflow-hidden">
            <div
              className="flex-1 h-full min-h-0 relative"
              style={{ flex: 1, height: "100%", width: "100%", position: "relative" }}
            >
              {loading && (
                <div className="absolute inset-0 bg-[#09090b]/80 backdrop-blur-xs flex items-center justify-center z-20">
                  <div className="flex items-center gap-2 font-mono text-xs text-zinc-400">
                    <RotateCw className="w-3.5 h-3.5 animate-spin text-zinc-500" />
                    Scanning AST contracts...
                  </div>
                </div>
              )}

              {error && (
                <div className="absolute top-4 left-4 z-20 max-w-md p-3 rounded-[4px] bg-[#141418] border border-rose-500/30 text-rose-300 text-xs font-mono shadow-2xl">
                  <div className="font-semibold flex items-center justify-between gap-2 mb-1">
                    <span>Scan Error</span>
                    <button
                      onClick={() => setError(null)}
                      className="text-zinc-500 hover:text-zinc-300 text-[10px] uppercase font-mono px-1 rounded hover:bg-white/[0.04]"
                    >
                      Dismiss
                    </button>
                  </div>
                  <div className="text-zinc-400 leading-relaxed break-words">{error}</div>
                </div>
              )}

              {/* Minimal Swimlane Column Labels Overlay */}
              <div className="absolute top-3 left-14 right-4 pointer-events-none z-10 flex gap-4 font-mono text-[10px] tracking-wider uppercase text-zinc-500 font-medium select-none">
                <div className="w-[260px] px-2 py-0.5 rounded-[3px] bg-[#09090b]/90 border border-white/[0.06]">
                  1. FRONTEND CONSUMERS
                </div>
                <div className="w-[260px] px-2 py-0.5 rounded-[3px] bg-[#09090b]/90 border border-white/[0.06] ml-[140px]">
                  2. API ROUTES & ACTIONS
                </div>
                <div className="w-[260px] px-2 py-0.5 rounded-[3px] bg-[#09090b]/90 border border-white/[0.06] ml-[140px]">
                  3. DATABASE & STORAGE
                </div>
              </div>

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
                <Background color="#1e1e24" gap={20} size={1} />
                <Controls
                  className="!bg-[#0c0c0e] !border-white/[0.07] !fill-zinc-400 [&>button]:!border-white/[0.06] hover:[&>button]:!bg-white/[0.06] [&>button]:!bg-transparent"
                  showInteractive={false}
                />
                <MiniMap
                  nodeColor={(node) => {
                    const status = (node.data as unknown as AnchorNodeData)?.status;
                    if (status === "BROKEN") return "#EF4444";
                    if (status === "SUSPICIOUS") return "#F59E0B";
                    return "#1e1e24";
                  }}
                  nodeStrokeWidth={2}
                  className="!bg-[#0c0c0e] !border !border-white/[0.07] !rounded-[4px]"
                  maskColor="rgba(9, 9, 11, 0.8)"
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
        )}

        {/* View 2: Executive Overview */}
        {activeTab === "overview" && graph && (
          <OverviewView
            graph={graph}
            priorScan={priorScan}
            onNavigateToDiagnostics={handleNavigateToDiagnostics}
            onNavigateToArchitecture={handleNavigateToArchitecture}
          />
        )}

        {/* View 3: Engineering Diagnostics & Source Diffs */}
        {activeTab === "diagnostics" && graph && (
          <DiagnosticsView
            graph={graph}
            initialCodeFilter={diagnosticsFilterCode}
            onSelectIssueInArchitecture={(issue) => {
              handleSelectIssue(issue);
              setActiveTab("architecture");
            }}
          />
        )}

        {/* View 4: Persistent Scan History */}
        {activeTab === "history" && (
          <HistoryView
            history={scanHistory}
            currentScanId={currentScanId}
            onRestoreSnapshot={handleRestoreSnapshot}
            onDeleteSnapshot={handleDeleteSnapshot}
            onClearHistory={handleClearHistory}
          />
        )}

        {/* View 5: AI Architect */}
        {activeTab === "ai_architect" && graph && (
          <AiArchitectView
            graph={graph}
            onNavigateToArchitecture={handleNavigateByFilePath}
          />
        )}
      </div>
    </div>
  );
}
