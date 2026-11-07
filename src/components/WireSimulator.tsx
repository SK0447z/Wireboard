"use client";

import React, { useState, useEffect, useMemo } from "react";
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
        : "Payload keys match expected route signature.",
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
        : "Route handler exists, handles method, avoids swallowed errors.",
    };

    // 3. Database Schema Check
    let dbIssue = relevantIssues.find(
      (i) => i.code === "SCHEMA_DRIFT" || i.code === "UNCHECKED_DB_ERROR"
    );
    if (!dbIssue && relevantWire) {
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
        : "Schema columns match model and query errors are checked.",
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
    <div className="space-y-3 pt-3 border-t border-white/[0.06]">
      {/* Header & Mode Switcher */}
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-500 font-medium">
          Wire Simulator
        </span>

        {/* Tab Toggle */}
        <div className="flex items-center rounded-[4px] bg-[#08080a] border border-white/[0.07] p-0.5 text-[10px] font-mono">
          <button
            onClick={() => setActiveTab("dry_run")}
            className={`px-2 py-0.5 rounded-[3px] transition-colors ${
              activeTab === "dry_run"
                ? "bg-white/[0.08] text-zinc-100 font-medium"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            Dry-Run Trace
          </button>
          <button
            onClick={() => setActiveTab("live_replay")}
            className={`px-2 py-0.5 rounded-[3px] transition-colors ${
              activeTab === "live_replay"
                ? "bg-white/[0.08] text-zinc-100 font-medium"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            Live HTTP Ping
          </button>
        </div>
      </div>

      {/* MODE 1: Dry-Run Trace */}
      {activeTab === "dry_run" && (
        <div className="border border-white/[0.07] rounded-[4px] bg-[#08080a] overflow-hidden">
          <div className="px-3 py-1.5 bg-[#121215] border-b border-white/[0.06] flex items-center justify-between font-mono text-[10px]">
            <span className="text-zinc-400">PIPELINE TRACE</span>
            <div className="flex items-center gap-1.5">
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  allPassed ? "bg-[#10B981]" : "bg-[#EF4444]"
                }`}
              />
              <span className={allPassed ? "text-emerald-400 font-medium" : "text-rose-400 font-medium"}>
                {allPassed ? "VERIFIED" : "DRIFT DETECTED"}
              </span>
            </div>
          </div>

          <div className="divide-y divide-white/[0.04]">
            {pipelineSteps.map((step) => (
              <div key={step.index} className="px-3 py-2 flex items-start gap-2.5">
                <span
                  className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${
                    step.passed ? "bg-[#10B981]" : "bg-[#EF4444]"
                  }`}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] font-medium text-zinc-200">
                      {step.index}. {step.name}
                    </span>
                    <span
                      className={`text-[9px] font-mono ${
                        step.passed ? "text-zinc-500" : "text-rose-400 font-semibold"
                      }`}
                    >
                      {step.passed ? "PASS" : "FAIL"}
                    </span>
                  </div>
                  <div
                    className={`text-[11px] font-mono leading-snug mt-0.5 break-words ${
                      step.passed ? "text-zinc-500" : "text-rose-300"
                    }`}
                  >
                    {step.reason}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* MODE 2: Live HTTP Replay */}
      {activeTab === "live_replay" && (
        <div className="border border-white/[0.07] rounded-[4px] bg-[#08080a] p-3 space-y-2.5">
          <div className="space-y-1">
            <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">
              Target Base URL
            </div>
            <input
              type="text"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="http://localhost:3000"
              className="w-full bg-[#070709] border border-white/[0.08] rounded-[4px] text-xs font-mono text-zinc-200 px-2 py-1.5 focus:border-zinc-500 focus:outline-none"
            />
          </div>

          <div className="space-y-1">
            <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">
              Endpoint
            </div>
            <div className="flex items-center gap-1.5">
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value as HttpMethod)}
                className="bg-[#070709] border border-white/[0.08] text-xs font-mono text-zinc-200 px-2 py-1.5 rounded-[4px] focus:outline-none shrink-0"
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
                className="flex-1 min-w-0 bg-[#070709] border border-white/[0.08] text-xs font-mono text-zinc-200 px-2 py-1.5 rounded-[4px] focus:outline-none"
              />
            </div>
          </div>

          {method !== "GET" && (
            <div className="space-y-1">
              <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">
                Payload Body (JSON)
              </div>
              <textarea
                rows={3}
                value={bodyText}
                onChange={(e) => setBodyText(e.target.value)}
                className="w-full bg-[#070709] border border-white/[0.08] text-xs font-mono text-zinc-200 p-2 rounded-[4px] focus:outline-none resize-y"
              />
            </div>
          )}

          <button
            onClick={handleLiveReplay}
            disabled={replayLoading}
            className="w-full h-8 rounded-[4px] bg-zinc-100 hover:bg-white text-zinc-950 font-medium text-[12px] font-sans disabled:opacity-40 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <span>{replayLoading ? "Probing Wire..." : "Send Request (Replay Wire)"}</span>
          </button>

          {replayResult && (
            <div className="p-2.5 rounded-[4px] bg-[#070709] border border-white/[0.07] space-y-1.5 text-xs font-mono">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      replayResult.status >= 200 && replayResult.status < 300
                        ? "bg-[#10B981]"
                        : replayResult.status >= 400 && replayResult.status < 500
                        ? "bg-[#F59E0B]"
                        : "bg-[#EF4444]"
                    }`}
                  />
                  <span className="font-semibold text-zinc-200">
                    {replayResult.status} {replayResult.statusText}
                  </span>
                </div>
                <span className="text-[11px] text-zinc-500 tabular-nums font-mono">
                  {replayResult.durationMs}ms
                </span>
              </div>

              {replayResult.error && (
                <div className="text-rose-400 text-xs">{replayResult.error}</div>
              )}

              {replayResult.data !== undefined && replayResult.data !== null && (
                <pre className="max-h-36 overflow-y-auto p-2 rounded-[3px] bg-[#0c0c0e] border border-white/[0.04] text-[11px] text-zinc-400 whitespace-pre-wrap break-all">
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
