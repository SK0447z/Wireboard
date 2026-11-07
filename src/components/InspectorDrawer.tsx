"use client";

import React, { useState, useMemo } from "react";
import { Copy, Check, X, Terminal } from "lucide-react";
import type {
  ArchitectureGraph,
  AnchorNode,
  ContractWire,
  DiagnosticIssue,
} from "@/types/graph";
import { calculateBlastRadius } from "@/engine/blastRadius";
import { CodeSnippetViewer } from "./CodeSnippetViewer";
import { WireSimulator } from "./WireSimulator";

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

  const activeIssue =
    selectedIssue ||
    (selectedWire && selectedWire.issues.length > 0
      ? selectedWire.issues[0]
      : null);

  const sortedIssues = useMemo(() => {
    return [...graph.issues].sort((a, b) => {
      if (a.severity === "BROKEN" && b.severity !== "BROKEN") return -1;
      if (a.severity !== "BROKEN" && b.severity === "BROKEN") return 1;
      return a.code.localeCompare(b.code);
    });
  }, [graph.issues]);

  const brokenCount = graph.issues.filter((i) => i.severity === "BROKEN").length;
  const suspiciousCount = graph.issues.filter((i) => i.severity === "SUSPICIOUS").length;

  const blastRadius = useMemo(() => {
    if (!selectedNode) return null;
    return calculateBlastRadius(graph, selectedNode.id, proposedChange);
  }, [graph, selectedNode, proposedChange]);

  const nodeStatus = useMemo(() => {
    if (!selectedNode) return "VERIFIED";
    const connectedWires = graph.wires.filter(
      (w) => w.sourceId === selectedNode.id || w.targetId === selectedNode.id
    );
    if (connectedWires.some((w) => w.status === "BROKEN")) return "BROKEN";
    if (connectedWires.some((w) => w.status === "SUSPICIOUS")) return "SUSPICIOUS";
    return "VERIFIED";
  }, [graph.wires, selectedNode]);

  return (
    <aside className="w-[420px] h-full border-l border-white/[0.07] bg-[#0c0c0e] text-zinc-100 flex flex-col flex-shrink-0 z-20">
      {/* Drawer Header */}
      <div className="h-11 px-4 border-b border-white/[0.07] flex items-center justify-between bg-[#111114]">
        <div className="flex items-center gap-2">
          <Terminal className="w-3.5 h-3.5 text-zinc-400 stroke-[1.5]" />
          <span className="font-mono text-[11px] uppercase tracking-wider font-semibold text-zinc-300">
            {activeIssue
              ? "Surgical Inspector"
              : selectedWire
              ? "Wire Inspector"
              : selectedNode
              ? "Node & Blast Radius"
              : "Diagnostics"}
          </span>
        </div>

        {(activeIssue || selectedWire || selectedNode) && (
          <button
            onClick={onClearSelection}
            className="p-1 rounded-[4px] hover:bg-white/[0.06] text-zinc-400 hover:text-zinc-200 transition-colors"
            title="Back to all diagnostics"
          >
            <X className="w-3.5 h-3.5 stroke-[1.5]" />
          </button>
        )}
      </div>

      {/* Drawer Content */}
      <div className="flex-1 overflow-y-auto">
        {/* CASE 1: Active Issue Selected */}
        {activeIssue && (
          <div className="divide-y divide-white/[0.06]">
            {/* Section 1: Overview */}
            <div className="px-4 py-3.5 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      activeIssue.severity === "BROKEN" ? "bg-[#EF4444]" : "bg-[#F59E0B]"
                    }`}
                  />
                  <span className="font-mono text-[11px] font-semibold text-zinc-200">
                    {activeIssue.code}
                  </span>
                  <span
                    className={`font-mono text-[9px] uppercase px-1.5 py-0.2 rounded-[2px] ${
                      activeIssue.severity === "BROKEN"
                        ? "text-rose-400 bg-rose-500/10"
                        : "text-amber-400 bg-amber-500/10"
                    }`}
                  >
                    {activeIssue.severity}
                  </span>
                </div>
                <span className="font-mono text-[10px] text-zinc-500 uppercase tracking-wider">
                  {activeIssue.confidence} CONFIDENCE
                </span>
              </div>

              <h3 className="text-[13px] font-medium text-zinc-100 leading-snug">
                {activeIssue.title}
              </h3>
              <p className="text-[12px] text-zinc-400 leading-relaxed">
                {activeIssue.explanation}
              </p>

              <div className="font-mono text-[11px] text-zinc-400 flex items-center gap-1.5 tabular-nums pt-1">
                <span className="text-zinc-500 uppercase text-[9px]">Path:</span>
                <span className="text-zinc-200">
                  {activeIssue.sourceFile.split("/").slice(-2).join("/")}:{activeIssue.sourceLine}
                </span>
                {activeIssue.targetFile && (
                  <>
                    <span className="text-zinc-600">→</span>
                    <span className="text-zinc-200">
                      {activeIssue.targetFile.split("/").slice(-2).join("/")}:
                      {activeIssue.targetLine || 1}
                    </span>
                  </>
                )}
              </div>
            </div>

            {/* Section 2: Real Source Code Snippets */}
            {(activeIssue.sourceSnippet || activeIssue.targetSnippet) && (
              <div className="px-4 py-3.5 space-y-3">
                {activeIssue.sourceSnippet && (
                  <CodeSnippetViewer
                    title="Consumer Source Snippet"
                    filePath={activeIssue.sourceFile}
                    line={activeIssue.sourceLine}
                    snippet={activeIssue.sourceSnippet}
                    severity={activeIssue.severity}
                  />
                )}

                {activeIssue.targetSnippet && (
                  <CodeSnippetViewer
                    title="Producer Target Snippet"
                    filePath={activeIssue.targetFile}
                    line={activeIssue.targetLine}
                    snippet={activeIssue.targetSnippet}
                    severity={activeIssue.severity}
                  />
                )}
              </div>
            )}

            {/* Section 3: Contract Key Diff */}
            {(activeIssue.expectedShape || activeIssue.actualShape) && (
              <div className="px-4 py-3.5 space-y-1.5">
                <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">
                  Contract Key Diff
                </div>
                <div className="border border-white/[0.07] rounded-[4px] bg-[#08080a] font-mono text-[11px] overflow-hidden">
                  <div className="grid grid-cols-2 divide-x divide-white/[0.06] border-b border-white/[0.06] bg-[#121215] px-3 py-1.5 text-[10px] uppercase tracking-wider text-zinc-500 font-medium">
                    <div>Expected (Consumer)</div>
                    <div>Actual (Producer)</div>
                  </div>
                  <div className="divide-y divide-white/[0.04]">
                    {Array.from(
                      new Set([
                        ...Object.keys(activeIssue.expectedShape || {}),
                        ...Object.keys(activeIssue.actualShape || {}),
                      ])
                    ).map((key) => {
                      const expType = activeIssue.expectedShape?.[key];
                      const actType = activeIssue.actualShape?.[key];
                      const isMismatch = (expType && !actType) || (expType && actType && expType !== actType);

                      return (
                        <div
                          key={key}
                          className="grid grid-cols-2 divide-x divide-white/[0.04] px-3 py-1.5"
                        >
                          <div className="truncate pr-2">
                            {expType ? (
                              <span className="text-zinc-300">
                                {key}: <span className="text-zinc-500">{expType}</span>
                              </span>
                            ) : (
                              <span className="text-zinc-600">—</span>
                            )}
                          </div>
                          <div className="truncate pl-2">
                            {actType ? (
                              <span
                                className={
                                  isMismatch ? "text-rose-400 font-semibold" : "text-zinc-300"
                                }
                              >
                                {key}: <span className="text-zinc-500">{actType}</span>
                              </span>
                            ) : (
                              <span className="text-rose-400 font-semibold">(missing)</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* Section 4: Fix Prompt with High-Contrast Primary Button */}
            <div className="px-4 py-3.5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">
                  Surgical Fix Prompt
                </span>
                <button
                  onClick={() => handleCopyPrompt(activeIssue.repairPrompt)}
                  className="h-8 px-3 rounded-[4px] bg-zinc-100 hover:bg-white text-zinc-950 font-medium text-[12px] font-sans transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  {copied ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Copied Prompt</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy Fix Prompt for IDE</span>
                    </>
                  )}
                </button>
              </div>

              <div className="rounded-[4px] bg-[#070709] border border-white/[0.07] p-2.5 font-mono text-[11px] text-zinc-400 leading-relaxed whitespace-pre-wrap select-all max-h-48 overflow-y-auto">
                {activeIssue.repairPrompt}
              </div>
            </div>

            {/* Section 5: Wire Simulator */}
            <div className="px-4 py-3.5">
              <WireSimulator
                graph={graph}
                selectedWire={selectedWire}
                activeIssue={activeIssue}
                selectedNode={selectedNode}
              />
            </div>
          </div>
        )}

        {/* CASE 2: Verified Wire Selected */}
        {!activeIssue && selectedWire && (
          <div className="divide-y divide-white/[0.06]">
            <div className="px-4 py-3.5 space-y-2">
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[#10B981]" />
                <span className="font-mono text-[11px] font-semibold text-emerald-400">
                  VERIFIED WIRE
                </span>
                <span className="font-mono text-[10px] text-zinc-500">
                  {selectedWire.id}
                </span>
              </div>

              <h3 className="text-[13px] font-medium text-zinc-100">
                Integration Contract Verified
              </h3>
              <p className="text-[12px] text-zinc-400 leading-relaxed">
                Matching route signatures, synchronized database column types, and zero property mismatches.
              </p>

              <div className="border border-white/[0.07] rounded-[4px] bg-[#08080a] divide-y divide-white/[0.04] font-mono text-[11px]">
                <div className="flex items-center justify-between px-3 py-1.5 text-zinc-400">
                  <span className="text-zinc-500 uppercase text-[9px]">Source:</span>
                  <button
                    onClick={() => {
                      const node = graph.nodes.find((n) => n.id === selectedWire.sourceId);
                      if (node) onSelectNode(node);
                    }}
                    className="text-zinc-200 hover:text-white"
                  >
                    {selectedWire.sourceId}
                  </button>
                </div>
                <div className="flex items-center justify-between px-3 py-1.5 text-zinc-400">
                  <span className="text-zinc-500 uppercase text-[9px]">Target:</span>
                  <button
                    onClick={() => {
                      const node = graph.nodes.find((n) => n.id === selectedWire.targetId);
                      if (node) onSelectNode(node);
                    }}
                    className="text-zinc-200 hover:text-white"
                  >
                    {selectedWire.targetId}
                  </button>
                </div>
              </div>
            </div>

            <div className="px-4 py-3.5">
              <WireSimulator
                graph={graph}
                selectedWire={selectedWire}
                activeIssue={null}
                selectedNode={null}
              />
            </div>
          </div>
        )}

        {/* CASE 3: Node Selected */}
        {!activeIssue && !selectedWire && selectedNode && blastRadius && (
          <div className="divide-y divide-white/[0.06]">
            <div className="px-4 py-3.5 space-y-2">
              <div className="flex items-center gap-2">
                <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-400 font-medium">
                  {selectedNode.kind}
                </span>
                {selectedNode.httpMethod && (
                  <span className="font-mono text-[10px] font-semibold text-zinc-300">
                    {selectedNode.httpMethod}
                  </span>
                )}
              </div>

              <h3 className="text-[13px] font-medium text-zinc-100">
                {selectedNode.label}
              </h3>
              <div className="font-mono text-[10px] text-zinc-500 tabular-nums">
                {selectedNode.filePath}:{selectedNode.line}
              </div>
            </div>

            {selectedNode.codeSnippet && (
              <div className="px-4 py-3.5">
                <CodeSnippetViewer
                  title="Node Source Code"
                  filePath={selectedNode.filePath}
                  line={selectedNode.line}
                  snippet={selectedNode.codeSnippet}
                  severity={nodeStatus}
                />
              </div>
            )}

            {/* Connected Wires */}
            <div className="px-4 py-3.5 space-y-1.5">
              <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">
                Connected Wires
              </div>
              <div className="border border-white/[0.07] rounded-[4px] bg-[#08080a] divide-y divide-white/[0.04]">
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
                      className="w-full text-left px-3 py-1.5 hover:bg-white/[0.03] flex items-center justify-between text-[11px] font-mono transition-colors"
                    >
                      <span className="text-zinc-300 truncate max-w-[240px]">
                        {w.label || w.id}
                      </span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            w.status === "BROKEN"
                              ? "bg-[#EF4444]"
                              : w.status === "SUSPICIOUS"
                              ? "bg-[#F59E0B]"
                              : "bg-[#10B981]"
                          }`}
                        />
                        <span className="text-zinc-500 text-[10px] font-medium">
                          {w.status}
                        </span>
                      </div>
                    </button>
                  ))}
              </div>
            </div>

            {/* Blast Radius Section */}
            <div className="px-4 py-3.5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 font-medium">
                  Blast Radius Impact List
                </span>
                <span className="font-mono text-[10px] text-zinc-500 tabular-nums">
                  {blastRadius.affectedFiles.length} files
                </span>
              </div>

              <div className="border border-white/[0.07] rounded-[4px] bg-[#08080a] divide-y divide-white/[0.04] max-h-40 overflow-y-auto">
                {blastRadius.affectedFiles.map((file, idx) => (
                  <div
                    key={`${file.filePath}:${file.line}-${idx}`}
                    className="px-3 py-1.5 text-[11px] font-mono flex items-center justify-between gap-2"
                  >
                    <div className="truncate">
                      <span className="text-zinc-300">
                        {file.filePath.split("/").slice(-2).join("/")}
                      </span>
                      <span className="text-zinc-600 tabular-nums">:{file.line}</span>
                    </div>
                    <span className="text-[10px] text-zinc-500 shrink-0">
                      {file.role}
                    </span>
                  </div>
                ))}
              </div>

              <input
                type="text"
                value={proposedChange}
                onChange={(e) => setProposedChange(e.target.value)}
                placeholder="e.g. rename user_id -> id"
                className="w-full bg-[#070709] border border-white/[0.08] rounded-[4px] text-xs font-mono text-zinc-200 px-2 py-1 focus:outline-none placeholder:text-zinc-600"
              />

              <button
                onClick={() => handleCopyPlan(blastRadius.atomicExecutionPrompt)}
                className="w-full h-8 px-3 rounded-[4px] bg-zinc-100 hover:bg-white text-zinc-950 font-medium text-[12px] font-sans transition-colors flex items-center justify-center gap-1.5 cursor-pointer mt-1"
              >
                {copiedPlan ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Copied Execution Plan</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy Atomic Execution Plan</span>
                  </>
                )}
              </button>
            </div>

            <div className="px-4 py-3.5">
              <WireSimulator
                graph={graph}
                selectedWire={null}
                activeIssue={null}
                selectedNode={selectedNode}
              />
            </div>
          </div>
        )}

        {/* CASE 4: Nothing Selected -> Flat Edge-to-Edge Linear-Style Issue List */}
        {!activeIssue && !selectedWire && !selectedNode && (
          <div>
            <div className="px-4 py-2.5 bg-[#121215] border-b border-white/[0.06] flex items-center justify-between text-[11px] font-mono text-zinc-400">
              <span className="font-semibold text-zinc-300">
                {graph.issues.length} DETECTED ISSUES
              </span>
              <div className="flex items-center gap-3 tabular-nums">
                <span className="flex items-center gap-1 text-rose-400 font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#EF4444]" />
                  {brokenCount} Broken
                </span>
                <span className="flex items-center gap-1 text-amber-400 font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#F59E0B]" />
                  {suspiciousCount} Suspicious
                </span>
              </div>
            </div>

            <div className="divide-y divide-white/[0.06]">
              {sortedIssues.map((issue) => (
                <div
                  key={issue.id}
                  onClick={() => onSelectIssue(issue)}
                  className="px-4 py-3 hover:bg-white/[0.02] transition-colors cursor-pointer"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span
                        className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                          issue.severity === "BROKEN" ? "bg-[#EF4444]" : "bg-[#F59E0B]"
                        }`}
                      />
                      <span className="font-mono text-[11px] font-medium text-zinc-300">
                        {issue.code}
                      </span>
                    </div>
                    <span className="font-mono text-[10px] text-zinc-500 uppercase tracking-wider">
                      {issue.confidence}
                    </span>
                  </div>

                  <div className="text-[13px] font-medium text-zinc-100 mt-1 line-clamp-1">
                    {issue.title}
                  </div>

                  <div className="font-mono text-[11px] text-zinc-500 mt-1 truncate tabular-nums">
                    {issue.sourceFile.split("/").slice(-2).join("/")}:{issue.sourceLine}
                    {issue.targetFile && (
                      <>
                        {" "}
                        → {issue.targetFile.split("/").slice(-2).join("/")}:
                        {issue.targetLine || 1}
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
