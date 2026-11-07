"use client";

import React, { useState } from "react";
import {
  Copy,
  Check,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ArrowRight,
  X,
  Terminal,
} from "lucide-react";
import type {
  ArchitectureGraph,
  AnchorNode,
  ContractWire,
  DiagnosticIssue,
} from "@/types/graph";

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

  const handleCopyPrompt = (promptText: string) => {
    navigator.clipboard.writeText(promptText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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
              ? "Node Inspector"
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
          </div>
        )}

        {/* CASE 3: Node Selected */}
        {!activeIssue && !selectedWire && selectedNode && (
          <div className="space-y-4">
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
                        className={`text-[10px] font-semibold px-1.5 py-0.2 rounded border ${
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
