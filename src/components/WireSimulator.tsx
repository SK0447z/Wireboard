"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  Zap,
  Play,
  CheckCircle2,
  XCircle,
  Activity,
  Server,
} from "lucide-react";
import type {
  ArchitectureGraph,
  AnchorNode,
  ContractWire,
  DiagnosticIssue,
  HttpMethod,
} from "@/types/graph";

interface WireSimulatorProps {
  graph: ArchitectureGraph;
  selectedWire: ContractWire | null;
  activeIssue: DiagnosticIssue | null;
  selectedNode: AnchorNode | null;
}

interface PipelineStep {
  index: number;
  name: string;
  passed: boolean;
  reason: string;
}

export function WireSimulator({
  graph,
  selectedWire,
  activeIssue,
  selectedNode,
}: WireSimulatorProps) {
  const [activeTab, setActiveTab] = useState<"dry_run" | "live_replay">("dry_run");

  // Determine connected wire and issues
  const relevantWire = useMemo(() => {
    if (selectedWire) return selectedWire;
    if (activeIssue?.wireId) {
      return graph.wires.find((w) => w.id === activeIssue.wireId) || null;
    }
    if (selectedNode) {
      return (
        graph.wires.find(
          (w) => w.sourceId === selectedNode.id || w.targetId === selectedNode.id
        ) || null
      );
    }
    return null;
  }, [graph, selectedWire, activeIssue, selectedNode]);

  const relevantIssues = useMemo(() => {
    if (activeIssue) return [activeIssue];
    if (relevantWire) return relevantWire.issues;
    if (selectedNode) {
      return graph.issues.filter(
        (i) =>
          i.sourceFile === selectedNode.filePath ||
          i.targetFile === selectedNode.filePath
      );
    }
    return [];
  }, [graph, activeIssue, relevantWire, selectedNode]);

  // Compute 4-step pipeline trace
  const pipelineSteps: PipelineStep[] = useMemo(() => {
    // 1. Consumer Request Payload
    const reqIssue = relevantIssues.find(
      (i) => i.code === "REQUEST_MISMATCH" || i.code === "ENV_DRIFT"
    );
    const step1: PipelineStep = {
      index: 1,
      name: "Consumer Request Payload",
      passed: !reqIssue,
      reason: reqIssue
        ? reqIssue.explanation
        : "Consumer request parameters match expected route payload schema.",
    };

    // 2. Producer Route Handler
    const routeIssue = relevantIssues.find(
      (i) =>
        i.code === "MISSING_ENDPOINT" ||
        i.code === "DEAD_ENDPOINT" ||
        i.code === "SWALLOWED_ERROR"
    );
    const step2: PipelineStep = {
      index: 2,
      name: "Producer Route Handler",
      passed: !routeIssue,
      reason: routeIssue
        ? routeIssue.explanation
        : "Route handler exists, handles method, and avoids swallowed errors.",
    };

    // 3. Database Schema Check
    // Check direct issue or downstream db issues connected to the route
    let dbIssue = relevantIssues.find(
      (i) => i.code === "SCHEMA_DRIFT" || i.code === "UNCHECKED_DB_ERROR"
    );
    if (!dbIssue && relevantWire) {
      // Look for downstream wire from target node to a DB table
      const downstreamWires = graph.wires.filter(
        (w) => w.sourceId === relevantWire.targetId
      );
      for (const dw of downstreamWires) {
        const found = dw.issues.find(
          (i) => i.code === "SCHEMA_DRIFT" || i.code === "UNCHECKED_DB_ERROR"
        );
        if (found) {
          dbIssue = found;
          break;
        }
      }
    }
    const step3: PipelineStep = {
      index: 3,
      name: "Database Schema Check",
      passed: !dbIssue,
      reason: dbIssue
        ? dbIssue.explanation
        : "Database schema columns match model and query errors are checked.",
    };

    // 4. Consumer Response Read
    const respIssue = relevantIssues.find(
      (i) =>
        i.code === "FIELD_MISMATCH" ||
        i.code === "TYPE_CHEAT" ||
        i.code === "MISSING_ERROR_HANDLING"
    );
    const step4: PipelineStep = {
      index: 4,
      name: "Consumer Response Read",
      passed: !respIssue,
      reason: respIssue
        ? respIssue.explanation
        : "Response properties match consumer contract without forced type-casts.",
    };

    return [step1, step2, step3, step4];
  }, [relevantIssues, relevantWire, graph]);

  // Route metadata for live replay
  const backendNode = useMemo(() => {
    if (selectedNode && selectedNode.kind === "BACKEND_ROUTE") {
      return selectedNode;
    }
    if (relevantWire) {
      return (
        graph.nodes.find(
          (n) =>
            (n.id === relevantWire.targetId || n.id === relevantWire.sourceId) &&
            n.kind === "BACKEND_ROUTE"
        ) || null
      );
    }
    return null;
  }, [graph, selectedNode, relevantWire]);

  // Live replay state
  const [baseUrl, setBaseUrl] = useState("http://localhost:3000");
  const [method, setMethod] = useState<HttpMethod>(backendNode?.httpMethod || "POST");
  const [routePath, setRoutePath] = useState(backendNode?.routePath || "/api");
  const [bodyText, setBodyText] = useState(
    backendNode?.expectsPayload
      ? JSON.stringify(backendNode.expectsPayload, null, 2)
      : "{\n  \n}"
  );
  const [replayLoading, setReplayLoading] = useState(false);
  const [replayResult, setReplayResult] = useState<{
    status: number;
    statusText: string;
    durationMs: number;
    data: unknown;
    error?: string;
  } | null>(null);

  useEffect(() => {
    if (backendNode) {
      if (backendNode.httpMethod) setMethod(backendNode.httpMethod);
      if (backendNode.routePath) setRoutePath(backendNode.routePath);
      if (backendNode.expectsPayload) {
        setBodyText(JSON.stringify(backendNode.expectsPayload, null, 2));
      }
    }
  }, [backendNode]);

  const handleLiveReplay = async () => {
    setReplayLoading(true);
    try {
      let parsedBody: unknown = undefined;
      if (method !== "GET" && bodyText.trim()) {
        try {
          parsedBody = JSON.parse(bodyText);
        } catch {
          parsedBody = bodyText;
        }
      }

      // Combine baseUrl and routePath cleanly
      const normalizedBase = baseUrl.replace(/\/+$/, "");
      const normalizedPath = routePath.startsWith("/") ? routePath : `/${routePath}`;
      const targetUrl = `${normalizedBase}${normalizedPath}`;

      const res = await fetch("/api/replay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: targetUrl,
          method,
          body: parsedBody,
        }),
      });

      const data = await res.json();
      setReplayResult(data);
    } catch (err) {
      setReplayResult({
        status: 502,
        statusText: "Connection Failed",
        durationMs: 0,
        data: null,
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setReplayLoading(false);
    }
  };

  const allPassed = pipelineSteps.every((s) => s.passed);

  return (
    <div className="space-y-2.5 pt-3 border-t border-white/10">
      {/* Header & Mode Switcher */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Zap className="w-3.5 h-3.5 text-amber-400 stroke-[1.75]" />
          <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-300 font-semibold">
            Wire Simulator
          </span>
        </div>

        {/* Tab Toggle */}
        <div className="flex items-center rounded bg-[#111115] border border-zinc-800 p-0.5 text-[10px] font-mono">
          <button
            onClick={() => setActiveTab("dry_run")}
            className={`px-2 py-0.5 rounded transition-colors ${
              activeTab === "dry_run"
                ? "bg-zinc-800 text-zinc-100 font-medium"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            Dry-Run Trace
          </button>
          <button
            onClick={() => setActiveTab("live_replay")}
            className={`px-2 py-0.5 rounded transition-colors ${
              activeTab === "live_replay"
                ? "bg-zinc-800 text-zinc-100 font-medium"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            Live HTTP Ping
          </button>
        </div>
      </div>

      {/* MODE 1: Dry-Run Trace */}
      {activeTab === "dry_run" && (
        <div className="p-3 rounded bg-[#09090b] border border-white/10 space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-zinc-800/80">
            <div className="flex items-center gap-1.5 font-mono text-[10px] text-zinc-400">
              <Activity className="w-3 h-3 text-zinc-500" />
              <span>DETERMINISTIC PIPELINE TRACE</span>
            </div>
            <span
              className={`font-mono text-[10px] font-semibold px-1.5 py-0.5 rounded border ${
                allPassed
                  ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                  : "bg-rose-500/10 text-rose-400 border-rose-500/30"
              }`}
            >
              {allPassed ? "PASSING TRACE" : "CONTRACT DRIFT DETECTED"}
            </span>
          </div>

          {/* 4 Pipeline Steps */}
          <div className="space-y-2">
            {pipelineSteps.map((step, idx) => (
              <div key={step.index} className="relative">
                {/* Connecting Line between steps */}
                {idx < pipelineSteps.length - 1 && (
                  <div
                    className={`absolute left-[11px] top-[22px] w-[2px] h-[calc(100%+8px)] -z-0 ${
                      step.passed && pipelineSteps[idx + 1].passed
                        ? "bg-emerald-500/40"
                        : "bg-zinc-800"
                    }`}
                  />
                )}

                <div className="flex items-start gap-2.5 relative z-10">
                  {/* Step status pip */}
                  <div className="mt-0.5 shrink-0">
                    {step.passed ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-400 fill-[#09090b]" />
                    ) : (
                      <XCircle className="w-5 h-5 text-rose-400 fill-[#09090b]" />
                    )}
                  </div>

                  {/* Step details */}
                  <div className="flex-1 min-w-0 bg-[#111115] border border-zinc-800/80 rounded p-2 text-xs font-mono space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-zinc-200">
                        {step.index}. {step.name}
                      </span>
                      <span
                        className={`text-[9px] font-semibold uppercase px-1.5 py-0.2 rounded border ${
                          step.passed
                            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                            : "bg-rose-500/10 text-rose-400 border-rose-500/30"
                        }`}
                      >
                        {step.passed ? "PASSED" : "FAILED"}
                      </span>
                    </div>
                    <p
                      className={`text-[11px] leading-relaxed break-words ${
                        step.passed ? "text-zinc-400" : "text-rose-300"
                      }`}
                    >
                      {step.reason}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* MODE 2: Live HTTP Replay */}
      {activeTab === "live_replay" && (
        <div className="p-3 rounded bg-[#09090b] border border-white/10 space-y-2.5">
          {/* Target Base URL */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[10px] font-mono text-zinc-400">
              <span className="uppercase tracking-wider">Target Base URL</span>
              <span className="text-zinc-500">Default: localhost:3000</span>
            </div>
            <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-[#111115] border border-zinc-800 text-xs font-mono">
              <Server className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
              <input
                type="text"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="http://localhost:3000"
                className="w-full bg-transparent text-zinc-200 placeholder:text-zinc-600 focus:outline-none"
              />
            </div>
          </div>

          {/* Method and Route Path */}
          <div className="space-y-1">
            <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-400">
              HTTP Endpoint
            </div>
            <div className="flex items-center gap-2">
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value as HttpMethod)}
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
                value={routePath}
                onChange={(e) => setRoutePath(e.target.value)}
                placeholder="/api/..."
                className="flex-1 min-w-0 bg-[#111115] border border-zinc-800 text-xs font-mono text-zinc-200 px-2 py-1.5 rounded focus:outline-none focus:border-zinc-700"
              />
            </div>
          </div>

          {/* JSON Payload if not GET */}
          {method !== "GET" && (
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-wider text-zinc-400">
                <span>Payload Body (JSON)</span>
                <span className="text-zinc-500">Raw Body</span>
              </div>
              <textarea
                rows={3}
                value={bodyText}
                onChange={(e) => setBodyText(e.target.value)}
                className="w-full bg-[#111115] border border-zinc-800 text-xs font-mono text-zinc-200 p-2 rounded focus:outline-none focus:border-zinc-700 resize-y"
              />
            </div>
          )}

          {/* Trigger Probe Button */}
          <button
            onClick={handleLiveReplay}
            disabled={replayLoading}
            className="w-full py-1.5 px-3 rounded bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-xs font-mono font-medium text-zinc-100 border border-zinc-700 transition-colors flex items-center justify-center gap-1.5"
          >
            <Play className={`w-3.5 h-3.5 ${replayLoading ? "animate-spin" : ""}`} />
            <span>{replayLoading ? "Sending Probe..." : "Send Request (Replay Wire)"}</span>
          </button>

          {/* Replay Result Box */}
          {replayResult && (
            <div className="p-2.5 rounded bg-[#111115] border border-zinc-800/80 space-y-2 text-xs font-mono">
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
                <pre className="max-h-36 overflow-y-auto p-2 rounded bg-[#09090b] border border-zinc-800/60 text-[11px] text-zinc-300 whitespace-pre-wrap break-all">
                  {typeof replayResult.data === "object"
                    ? JSON.stringify(replayResult.data, null, 2)
                    : String(replayResult.data)}
                </pre>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
