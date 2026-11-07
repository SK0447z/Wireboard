"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  Copy,
  Check,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ArrowRight,
  X,
  Terminal,
  Zap,
  Play,
  Radio,
} from "lucide-react";
import type {
  ArchitectureGraph,
  AnchorNode,
  ContractWire,
  DiagnosticIssue,
} from "@/types/graph";
import { calculateBlastRadius } from "@/engine/blastRadius";

interface InspectorDrawerProps {
  graph: ArchitectureGraph;
  selectedWire: ContractWire | null;
  selectedNode: AnchorNode | null;
  selectedIssue: DiagnosticIssue | null;
  onSelectIssue: (issue: DiagnosticIssue) => void;
  onSelectWire: (wire: ContractWire | null) => void;
  onSelectNode: (node: AnchorNode | null) => void;
  onClearSelection: () => void;
}

interface WireReplayProps {
  initialUrl: string;
  initialMethod: string;
  initialBody?: Record<string, string>;
}

function WireReplay({ initialUrl, initialMethod, initialBody }: WireReplayProps) {
  const [url, setUrl] = useState(initialUrl);
  const [method, setMethod] = useState(initialMethod);
  const [bodyText, setBodyText] = useState(
    initialBody ? JSON.stringify(initialBody, null, 2) : "{\n  \n}"
  );
  const [loading, setLoading] = useState(false);
  const [replayResult, setReplayResult] = useState<{
    status: number;
    statusText: string;
    durationMs: number;
    data: unknown;
    error?: string;
  } | null>(null);

  useEffect(() => {
    setUrl(initialUrl);
    setMethod(initialMethod);
    if (initialBody) {
      setBodyText(JSON.stringify(initialBody, null, 2));
    }
  }, [initialUrl, initialMethod, initialBody]);

  const handleSend = async () => {
    setLoading(true);
    try {
      let parsedBody: unknown = undefined;
      if (method !== "GET" && method !== "HEAD" && bodyText.trim()) {
        try {
          parsedBody = JSON.parse(bodyText);
        } catch {
          parsedBody = bodyText;
        }
      }

      const res = await fetch("/api/replay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url,
          method,
          body: parsedBody,
        }),
      });

      const data = await res.json();
      setReplayResult(data);
    } catch (err) {
      setReplayResult({
        status: 502,
        statusText: "Connection Error",
        durationMs: 0,
        data: null,
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-2 pt-3 border-t border-zinc-800">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Zap className="w-3.5 h-3.5 text-amber-400 stroke-[1.75]" />
          <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-300 font-semibold">
            ⚡ Replay Wire
          </span>
        </div>
        <span className="font-mono text-[10px] text-zinc-500 uppercase">Live HTTP Probe</span>
      </div>

      <div className="flex items-center gap-2">
        <select
          value={method}
          onChange={(e) => setMethod(e.target.value)}
          className="bg-[#111115] border border-zinc-800 text-xs font-mono text-zinc-200 px-2 py-1.5 rounded focus:outline-none focus:border-zinc-700 shrink-0"
        >
          <option value="GET">GET</option>
          <option value="POST">POST</option>
          <option value="PUT">PUT</option>
          <option value="PATCH">PATCH</option>
          <option value="DELETE">DELETE</option>
        </select>
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="/api/..."
          className="flex-1 min-w-0 bg-[#111115] border border-zinc-800 text-xs font-mono text-zinc-200 px-2 py-1.5 rounded focus:outline-none focus:border-zinc-700"
        />
      </div>

      {method !== "GET" && (
        <div className="space-y-1">
          <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-400">
            Payload Body (JSON)
          </div>
          <textarea
            rows={3}
            value={bodyText}
            onChange={(e) => setBodyText(e.target.value)}
            className="w-full bg-[#09090b] border border-zinc-800 text-xs font-mono text-zinc-200 p-2 rounded focus:outline-none focus:border-zinc-700 resize-y"
          />
        </div>
      )}

      <button
        onClick={handleSend}
        disabled={loading}
        className="w-full py-1.5 px-3 rounded bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-xs font-mono font-medium text-zinc-100 border border-zinc-700 transition-colors flex items-center justify-center gap-1.5"
      >
        <Play className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
        <span>{loading ? "Probing Wire..." : "Send Request (Replay Wire)"}</span>
      </button>

      {replayResult && (
        <div className="p-2.5 rounded bg-[#09090b] border border-zinc-800/80 space-y-2 text-xs font-mono">
          <div className="flex items-center justify-between">
            <span
              className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${
                replayResult.status >= 200 && replayResult.status < 300
                  ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                  : replayResult.status >= 400 && replayResult.status < 500
                  ? "bg-amber-500/10 text-amber-400 border-amber-500/30"
                  : "bg-rose-500/10 text-rose-400 border-rose-500/30"
              }`}
            >
              {replayResult.status} {replayResult.statusText}
            </span>
            <span className="text-[11px] text-zinc-400 tabular-nums font-mono">
              {replayResult.durationMs}ms
            </span>
          </div>

          {replayResult.error && (
            <div className="text-rose-400 text-xs">{replayResult.error}</div>
          )}

          {replayResult.data !== undefined && replayResult.data !== null && (
            <pre className="max-h-36 overflow-y-auto p-2 rounded bg-[#111115] border border-zinc-800/60 text-[11px] text-zinc-300 whitespace-pre-wrap break-all">
              {typeof replayResult.data === "object"
                ? JSON.stringify(replayResult.data, null, 2)
                : String(replayResult.data)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

export function InspectorDrawer({
  graph,
  selectedWire,
  selectedNode,
  selectedIssue,
  onSelectIssue,
  onSelectWire,
  onSelectNode,
  onClearSelection,
}: InspectorDrawerProps) {
  const [copied, setCopied] = useState(false);
  const [copiedPlan, setCopiedPlan] = useState(false);
  const [proposedChange, setProposedChange] = useState("");

  const handleCopyPrompt = (promptText: string) => {
    navigator.clipboard.writeText(promptText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyPlan = (planText: string) => {
    navigator.clipboard.writeText(planText);
    setCopiedPlan(true);
    setTimeout(() => setCopiedPlan(false), 2000);
  };

  // If a specific issue is selected, or if a broken/suspicious wire with issues is selected:
  const activeIssue =
    selectedIssue ||
    (selectedWire && selectedWire.issues.length > 0
      ? selectedWire.issues[0]
      : null);

  // Sort all issues: BROKEN first, then SUSPICIOUS
  const sortedIssues = [...graph.issues].sort((a, b) => {
    if (a.severity === "BROKEN" && b.severity !== "BROKEN") return -1;
    if (a.severity !== "BROKEN" && b.severity === "BROKEN") return 1;
    return a.code.localeCompare(b.code);
  });

  const brokenCount = graph.issues.filter((i) => i.severity === "BROKEN").length;
  const suspiciousCount = graph.issues.filter((i) => i.severity === "SUSPICIOUS").length;

  // Calculate blast radius for selectedNode
  const blastRadius = useMemo(() => {
    if (!selectedNode) return null;
    return calculateBlastRadius(graph, selectedNode.id, proposedChange);
  }, [graph, selectedNode, proposedChange]);

  // Find target backend route for Wire Replay if activeIssue or selectedWire
  const activeWireBackendRoute = useMemo(() => {
    if (selectedWire) {
      return (
        graph.nodes.find(
          (n) =>
            (n.id === selectedWire.targetId || n.id === selectedWire.sourceId) &&
            n.kind === "BACKEND_ROUTE"
        ) || null
      );
    }
    if (activeIssue?.wireId) {
      const wire = graph.wires.find((w) => w.id === activeIssue.wireId);
      if (wire) {
        return (
          graph.nodes.find(
            (n) =>
              (n.id === wire.targetId || n.id === wire.sourceId) &&
              n.kind === "BACKEND_ROUTE"
          ) || null
        );
      }
    }
    return null;
  }, [graph, selectedWire, activeIssue]);

  return (
    <aside className="w-[420px] h-full border-l border-white/10 bg-[#0d0d10] text-zinc-100 flex flex-col flex-shrink-0 z-20">
      {/* Drawer Header */}
      <div className="h-12 px-4 border-b border-white/10 flex items-center justify-between bg-[#111115]">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-zinc-400 stroke-[1.5]" />
          <span className="font-mono text-xs uppercase tracking-wider font-semibold text-zinc-200">
            {activeIssue
              ? "Surgical Inspector"
              : selectedWire
              ? "Wire Inspector"
              : selectedNode
              ? "Node & Blast Radius Mode"
              : "Diagnostics"}
          </span>
        </div>

        {(activeIssue || selectedWire || selectedNode) && (
          <button
            onClick={onClearSelection}
            className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors"
            title="Back to all diagnostics"
          >
            <X className="w-4 h-4 stroke-[1.5]" />
          </button>
        )}
      </div>

      {/* Drawer Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* CASE 1: Active Issue Selected */}
        {activeIssue && (
          <div className="space-y-4">
            {/* Severity & Code Badges */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {activeIssue.severity === "BROKEN" ? (
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/30 font-mono text-xs font-semibold">
                    <AlertCircle className="w-3.5 h-3.5 stroke-[1.5]" />
                    BROKEN
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/30 font-mono text-xs font-semibold">
                    <AlertTriangle className="w-3.5 h-3.5 stroke-[1.5]" />
                    SUSPICIOUS
                  </span>
                )}
                <span className="font-mono text-xs text-zinc-400 bg-zinc-900 border border-zinc-800 px-2 py-0.5 rounded">
                  {activeIssue.code}
                </span>
              </div>
            </div>

            {/* Issue Title & Explanation */}
            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-zinc-100 leading-snug">
                {activeIssue.title}
              </h3>
              <p className="text-xs text-zinc-400 leading-relaxed">
                {activeIssue.explanation}
              </p>
            </div>

            {/* Source -> Target Path Monospace Pills */}
            <div className="space-y-1.5">
              <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-400">
                Integration Path
              </div>
              <div className="p-2.5 rounded bg-[#111115] border border-zinc-800/80 space-y-2">
                <div className="flex items-start gap-2">
                  <span className="text-[10px] font-mono text-zinc-400 uppercase w-12 shrink-0 pt-0.5">
                    Source
                  </span>
                  <span className="font-mono text-xs text-zinc-200 break-all tabular-nums">
                    {activeIssue.sourceFile}:{activeIssue.sourceLine}
                  </span>
                </div>
                {activeIssue.targetFile && (
                  <div className="flex items-start gap-2 pt-2 border-t border-zinc-800/60">
                    <span className="text-[10px] font-mono text-zinc-400 uppercase w-12 shrink-0 pt-0.5">
                      Target
                    </span>
                    <span className="font-mono text-xs text-zinc-200 break-all tabular-nums">
                      {activeIssue.targetFile}
                      {activeIssue.targetLine ? `:${activeIssue.targetLine}` : ""}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Contract Diff Box (if expectedShape or actualShape present) */}
            {(activeIssue.expectedShape || activeIssue.actualShape) && (
              <div className="space-y-1.5">
                <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-400">
                  Contract Key Diff
                </div>
                <div className="rounded border border-zinc-800/80 bg-[#111115] overflow-hidden">
                  <div className="grid grid-cols-2 text-[10px] font-mono uppercase tracking-wider bg-zinc-900/60 border-b border-zinc-800 px-3 py-1.5 text-zinc-400">
                    <div>Expected (Consumer)</div>
                    <div>Actual (Producer)</div>
                  </div>
                  <div className="divide-y divide-zinc-800/60 font-mono text-xs">
                    {Array.from(
                      new Set([
                        ...Object.keys(activeIssue.expectedShape || {}),
                        ...Object.keys(activeIssue.actualShape || {}),
                      ])
                    ).map((key) => {
                      const expType = activeIssue.expectedShape?.[key];
                      const actType = activeIssue.actualShape?.[key];
                      const isMissing = expType && !actType;
                      const isExtra = !expType && actType;
                      const isMismatch = expType && actType && expType !== actType;

                      let rowBg = "";
                      if (isMissing || isMismatch) {
                        rowBg = "bg-rose-500/10 text-rose-300";
                      } else if (isExtra) {
                        rowBg = "text-zinc-400";
                      } else {
                        rowBg = "text-emerald-400/90";
                      }

                      return (
                        <div
                          key={key}
                          className={`grid grid-cols-2 px-3 py-1.5 ${rowBg}`}
                        >
                          <div className="truncate">
                            {expType ? (
                              <span>
                                {key}:{" "}
                                <span className="opacity-75">{expType}</span>
                              </span>
                            ) : (
                              <span className="text-zinc-600">—</span>
                            )}
                          </div>
                          <div className="truncate">
                            {actType ? (
                              <span>
                                {key}:{" "}
                                <span className="opacity-75">{actType}</span>
                              </span>
                            ) : (
                              <span className="text-rose-400 font-semibold">
                                (missing)
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* Surgical Fix Prompt with 1-Click Copy */}
            <div className="space-y-1.5 pt-2">
              <div className="flex items-center justify-between">
                <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-400">
                  Surgical Fix Prompt
                </div>
                <button
                  onClick={() => handleCopyPrompt(activeIssue.repairPrompt)}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-mono font-medium border transition-colors ${
                    copied
                      ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                      : "bg-zinc-800 hover:bg-zinc-700 text-zinc-100 border-zinc-700"
                  }`}
                >
                  {copied ? (
                    <>
                      <Check className="w-3.5 h-3.5 stroke-[1.5]" />
                      Copied to clipboard
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 stroke-[1.5]" />
                      Copy Fix Prompt for IDE
                    </>
                  )}
                </button>
              </div>

              <div className="relative rounded bg-[#09090b] border border-zinc-800 p-3 font-mono text-xs text-zinc-300 leading-relaxed whitespace-pre-wrap select-all">
                {activeIssue.repairPrompt}
              </div>
            </div>

            {/* Wire Replay if connected to backend route */}
            {activeWireBackendRoute && (
              <WireReplay
                initialUrl={activeWireBackendRoute.routePath || "/api"}
                initialMethod={activeWireBackendRoute.httpMethod || "POST"}
                initialBody={activeWireBackendRoute.expectsPayload}
              />
            )}
          </div>
        )}

        {/* CASE 2: Verified Wire Selected (No Issues) */}
        {!activeIssue && selectedWire && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-mono text-xs font-semibold">
                <CheckCircle2 className="w-3.5 h-3.5 stroke-[1.5]" />
                VERIFIED
              </span>
              <span className="font-mono text-xs text-zinc-400">
                {selectedWire.id}
              </span>
            </div>

            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-zinc-100">
                Integration Contract Verified
              </h3>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Wireboard confirmed zero property mismatches, matching route
                signatures, and synchronized database column types.
              </p>
            </div>

            <div className="p-3 rounded bg-[#111115] border border-zinc-800/80 space-y-2 text-xs font-mono">
              <div className="flex items-center justify-between text-zinc-400">
                <span>Source Node:</span>
                <button
                  onClick={() => {
                    const node = graph.nodes.find((n) => n.id === selectedWire.sourceId);
                    if (node) onSelectNode(node);
                  }}
                  className="text-zinc-200 hover:underline hover:text-white"
                >
                  {selectedWire.sourceId}
                </button>
              </div>
              <div className="flex items-center justify-between text-zinc-400 border-t border-zinc-800/60 pt-2">
                <span>Target Node:</span>
                <button
                  onClick={() => {
                    const node = graph.nodes.find((n) => n.id === selectedWire.targetId);
                    if (node) onSelectNode(node);
                  }}
                  className="text-zinc-200 hover:underline hover:text-white"
                >
                  {selectedWire.targetId}
                </button>
              </div>
            </div>

            {/* Wire Replay if connected to backend route */}
            {activeWireBackendRoute && (
              <WireReplay
                initialUrl={activeWireBackendRoute.routePath || "/api"}
                initialMethod={activeWireBackendRoute.httpMethod || "POST"}
                initialBody={activeWireBackendRoute.expectsPayload}
              />
            )}
          </div>
        )}

        {/* CASE 3: Node Selected (Node & Blast Radius Mode) */}
        {!activeIssue && !selectedWire && selectedNode && blastRadius && (
          <div className="space-y-4">
            {/* Header badges */}
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs uppercase tracking-wider px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700">
                {selectedNode.kind}
              </span>
              {selectedNode.httpMethod && (
                <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-zinc-800 text-zinc-200 border border-zinc-700 tabular-nums">
                  {selectedNode.httpMethod}
                </span>
              )}
            </div>

            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-zinc-100">
                {selectedNode.label}
              </h3>
              <div className="font-mono text-xs text-zinc-400 tabular-nums">
                {selectedNode.filePath}:{selectedNode.line}
              </div>
            </div>

            {/* Connected Wires */}
            <div className="space-y-1.5">
              <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-400">
                Connected Integration Wires
              </div>
              <div className="space-y-1">
                {graph.wires
                  .filter(
                    (w) =>
                      w.sourceId === selectedNode.id ||
                      w.targetId === selectedNode.id
                  )
                  .map((w) => (
                    <button
                      key={w.id}
                      onClick={() => onSelectWire(w)}
                      className="w-full text-left p-2 rounded bg-[#111115] hover:bg-zinc-800/80 border border-zinc-800 flex items-center justify-between text-xs font-mono transition-colors"
                    >
                      <span className="text-zinc-300 truncate">
                        {w.label || w.id}
                      </span>
                      <span
                        className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${
                          w.status === "BROKEN"
                            ? "text-rose-400 bg-rose-500/10 border-rose-500/30"
                            : w.status === "SUSPICIOUS"
                            ? "text-amber-400 bg-amber-500/10 border-amber-500/30"
                            : "text-emerald-400 bg-emerald-500/10 border-emerald-500/30"
                        }`}
                      >
                        {w.status}
                      </span>
                    </button>
                  ))}
              </div>
            </div>

            {/* Payloads */}
            {selectedNode.expectsPayload && (
              <div className="space-y-1.5">
                <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-400">
                  Expects Payload Schema
                </div>
                <div className="p-2.5 rounded bg-[#111115] border border-zinc-800/80 font-mono text-xs space-y-1">
                  {Object.entries(selectedNode.expectsPayload).map(([k, t]) => (
                    <div key={k} className="flex justify-between">
                      <span className="text-zinc-300">{k}:</span>
                      <span className="text-zinc-400">{t}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {selectedNode.returnsPayload && (
              <div className="space-y-1.5">
                <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-400">
                  Returns Payload Schema
                </div>
                <div className="p-2.5 rounded bg-[#111115] border border-zinc-800/80 font-mono text-xs space-y-1 max-h-48 overflow-y-auto">
                  {Object.entries(selectedNode.returnsPayload).map(([k, t]) => (
                    <div key={k} className="flex justify-between">
                      <span className="text-zinc-300">{k}:</span>
                      <span className="text-zinc-400">{t}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* BLAST RADIUS SECTION */}
            <div className="space-y-2.5 pt-3 border-t border-zinc-800">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Radio className="w-3.5 h-3.5 text-rose-400 stroke-[1.75]" />
                  <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-300 font-semibold">
                    Blast Radius Impact List
                  </span>
                </div>
                <span className="font-mono text-[10px] text-zinc-400 tabular-nums">
                  {blastRadius.affectedFiles.length} affected files
                </span>
              </div>

              <p className="text-[11px] text-zinc-400 leading-relaxed">
                Upstream and downstream components, routes, and schemas that will break if this node&apos;s contract changes:
              </p>

              <div className="space-y-1 max-h-44 overflow-y-auto pr-1">
                {blastRadius.affectedFiles.map((file, idx) => (
                  <div
                    key={`${file.filePath}:${file.line}-${idx}`}
                    className="p-2 rounded bg-[#111115] border border-zinc-800/80 text-xs font-mono flex items-center justify-between gap-2"
                  >
                    <div className="truncate">
                      <span className="text-zinc-200">
                        {file.filePath.split("/").slice(-2).join("/")}
                      </span>
                      <span className="text-zinc-500 tabular-nums">:{file.line}</span>
                      <span className="text-zinc-400 text-[10px] ml-1.5 truncate">
                        ({file.nodeLabel})
                      </span>
                    </div>
                    <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700/60 shrink-0 font-medium">
                      {file.role}
                    </span>
                  </div>
                ))}
              </div>

              {/* Proposed field change input */}
              <div className="space-y-1 pt-1">
                <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-400">
                  Proposed Field Change
                </div>
                <input
                  type="text"
                  value={proposedChange}
                  onChange={(e) => setProposedChange(e.target.value)}
                  placeholder="e.g. rename user_id -> id"
                  className="w-full px-2.5 py-1.5 rounded bg-[#09090b] border border-zinc-800 text-xs font-mono text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-700"
                />
              </div>

              {/* Copy Atomic Execution Plan button */}
              <button
                onClick={() => handleCopyPlan(blastRadius.atomicExecutionPrompt)}
                className={`w-full py-2 px-3 rounded text-xs font-mono font-medium border transition-colors flex items-center justify-center gap-2 ${
                  copiedPlan
                    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                    : "bg-zinc-800 hover:bg-zinc-700 text-zinc-100 border-zinc-700"
                }`}
              >
                {copiedPlan ? (
                  <>
                    <Check className="w-3.5 h-3.5 stroke-[1.5]" />
                    <span>Copied Atomic Execution Plan</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 stroke-[1.5]" />
                    <span>Copy Atomic Execution Plan</span>
                  </>
                )}
              </button>
            </div>

            {/* LIVE WIRE REPLAY SECTION (if Backend Route) */}
            {selectedNode.kind === "BACKEND_ROUTE" && (
              <WireReplay
                initialUrl={selectedNode.routePath || "/api"}
                initialMethod={selectedNode.httpMethod || "POST"}
                initialBody={selectedNode.expectsPayload}
              />
            )}
          </div>
        )}

        {/* CASE 4: Nothing Selected -> Full Diagnostics List */}
        {!activeIssue && !selectedWire && !selectedNode && (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs font-mono text-zinc-400 pb-1">
              <span>{graph.issues.length} DETECTED ISSUES</span>
              <div className="flex items-center gap-2">
                <span className="text-rose-400 tabular-nums font-semibold">
                  {brokenCount} Broken
                </span>
                <span>•</span>
                <span className="text-amber-400 tabular-nums font-semibold">
                  {suspiciousCount} Suspicious
                </span>
              </div>
            </div>

            <div className="space-y-2">
              {sortedIssues.map((issue) => (
                <div
                  key={issue.id}
                  onClick={() => onSelectIssue(issue)}
                  className="group p-3 rounded bg-[#111115] hover:bg-zinc-900 border border-zinc-800/80 hover:border-zinc-700 transition-all cursor-pointer space-y-1.5"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      {issue.severity === "BROKEN" ? (
                        <span className="inline-flex items-center gap-1 font-mono text-[10px] font-semibold px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/30">
                          <AlertCircle className="w-3 h-3 stroke-[1.5]" />
                          BROKEN
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 font-mono text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/30">
                          <AlertTriangle className="w-3 h-3 stroke-[1.5]" />
                          SUSPICIOUS
                        </span>
                      )}
                      <span className="font-mono text-[10px] text-zinc-400">
                        {issue.code}
                      </span>
                    </div>
                    <ArrowRight className="w-3.5 h-3.5 text-zinc-500 group-hover:text-zinc-300 transition-colors" />
                  </div>

                  <div className="text-xs font-medium text-zinc-200 leading-snug line-clamp-1">
                    {issue.title}
                  </div>

                  <div className="font-mono text-[10px] text-zinc-400 truncate tabular-nums">
                    {issue.sourceFile.split("/").slice(-2).join("/")}:
                    {issue.sourceLine}
                    {issue.targetFile && (
                      <>
                        {" "}
                        → {issue.targetFile.split("/").slice(-2).join("/")}
                        {issue.targetLine ? `:${issue.targetLine}` : ""}
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
