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
  LayoutDashboard,
  ShieldAlert,
  History,
  Bot,
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

  // Load history from localStorage on mount
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
      // Ignore localStorage errors
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

        // Reset active selections
        setSelectedWire(null);
        setSelectedNode(null);
        setSelectedIssue(null);

        // Save scan snapshot into persistent history
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

  // Restore snapshot from history
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

  // Cross-view navigation helpers
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

  // Find previous scan for delta comparison
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

            {/* Filter Toggle (for Architecture view) */}
            {activeTab === "architecture" && (
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
            )}
          </div>
        )}
      </header>

      {/* Main Workspace: Left Navigation Rail + Active Control Room View */}
      <div className="flex flex-1 min-h-0 w-full relative overflow-hidden">
        {/* Sleek Left-Rail Control Room Navigation */}
        <nav className="w-44 border-r border-white/10 bg-[#0b0b0e] flex flex-col justify-between p-2 shrink-0 z-20">
          <div className="space-y-1">
            <div className="px-2.5 py-1 text-[10px] font-mono uppercase tracking-wider text-zinc-500 font-semibold">
              Control Room
            </div>

            {/* View 1: Architecture */}
            <button
              onClick={() => setActiveTab("architecture")}
              className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded text-xs font-mono transition-all text-left ${
                activeTab === "architecture"
                  ? "bg-[#18181f] text-zinc-100 font-semibold border-l-2 border-emerald-400"
                  : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60"
              }`}
            >
              <Network className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Architecture</span>
            </button>

            {/* View 2: Overview */}
            <button
              onClick={() => setActiveTab("overview")}
              className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded text-xs font-mono transition-all text-left ${
                activeTab === "overview"
                  ? "bg-[#18181f] text-zinc-100 font-semibold border-l-2 border-emerald-400"
                  : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60"
              }`}
            >
              <LayoutDashboard className="w-4 h-4 text-zinc-400 shrink-0" />
              <span>Overview</span>
            </button>

            {/* View 3: Diagnostics */}
            <button
              onClick={() => {
                setDiagnosticsFilterCode(null);
                setActiveTab("diagnostics");
              }}
              className={`w-full flex items-center justify-between px-2.5 py-2 rounded text-xs font-mono transition-all text-left ${
                activeTab === "diagnostics"
                  ? "bg-[#18181f] text-zinc-100 font-semibold border-l-2 border-emerald-400"
                  : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60"
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0" />
                <span className="truncate">Diagnostics</span>
              </div>
              {graph && graph.issues.length > 0 && (
                <span className="text-[10px] px-1 py-0.2 rounded bg-rose-500/10 text-rose-400 border border-rose-500/30 tabular-nums">
                  {graph.issues.length}
                </span>
              )}
            </button>

            {/* View 4: History */}
            <button
              onClick={() => setActiveTab("history")}
              className={`w-full flex items-center justify-between px-2.5 py-2 rounded text-xs font-mono transition-all text-left ${
                activeTab === "history"
                  ? "bg-[#18181f] text-zinc-100 font-semibold border-l-2 border-emerald-400"
                  : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60"
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <History className="w-4 h-4 text-zinc-400 shrink-0" />
                <span className="truncate">History</span>
              </div>
              {scanHistory.length > 0 && (
                <span className="text-[10px] px-1 py-0.2 rounded bg-zinc-800 text-zinc-400 border border-zinc-700 tabular-nums">
                  {scanHistory.length}
                </span>
              )}
            </button>

            {/* View 5: AI Architect */}
            <button
              onClick={() => setActiveTab("ai_architect")}
              className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded text-xs font-mono transition-all text-left ${
                activeTab === "ai_architect"
                  ? "bg-[#18181f] text-zinc-100 font-semibold border-l-2 border-emerald-400"
                  : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60"
              }`}
            >
              <Bot className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>AI Architect</span>
            </button>
          </div>

          {/* Rail Footer Telemetry */}
          <div className="p-2 rounded bg-[#09090b] border border-zinc-800/80 font-mono text-[10px] text-zinc-500 space-y-1">
            <div className="flex items-center justify-between">
              <span>AST ENGINE</span>
              <span className="text-emerald-400">ONLINE</span>
            </div>
            <div className="text-zinc-600 truncate">v2.0 • Pure TS</div>
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

              {/* Swimlane Column Labels Overlay */}
              <div className="absolute top-3 left-14 right-4 pointer-events-none z-10 flex gap-4 font-mono text-[10px] tracking-wider uppercase text-zinc-500 font-semibold select-none">
                <div className="w-[340px] px-2 py-1 rounded bg-[#09090b]/80 border border-zinc-800/60 backdrop-blur-xs">
                  1. FRONTEND CONSUMERS
                </div>
                <div className="w-[340px] px-2 py-1 rounded bg-[#09090b]/80 border border-zinc-800/60 backdrop-blur-xs ml-[120px]">
                  2. API ROUTES & ACTIONS
                </div>
                <div className="w-[340px] px-2 py-1 rounded bg-[#09090b]/80 border border-zinc-800/60 backdrop-blur-xs ml-[120px]">
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
