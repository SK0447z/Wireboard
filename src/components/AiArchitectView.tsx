"use client";

import React, { useState, useEffect } from "react";
import { Copy, Check, Send, ExternalLink } from "lucide-react";
import type { ArchitectureGraph } from "@/types/graph";
import { queryAiArchitect, type AiArchitectAnswer } from "@/engine/aiArchitect";

interface AiArchitectViewProps {
  graph: ArchitectureGraph;
  onNavigateToArchitecture: (filePath?: string) => void;
}

const QUICK_ASK_CHIPS = [
  "Why are contracts failing in this repo?",
  "What has the highest blast radius if changed?",
  "Which routes write to the database without error checks?",
  "Generate a master repair plan for all broken wires",
];

export function AiArchitectView({
  graph,
  onNavigateToArchitecture,
}: AiArchitectViewProps) {
  const [queryInput, setQueryInput] = useState("");
  const [activeAnswer, setActiveAnswer] = useState<AiArchitectAnswer | null>(null);
  const [copiedMasterPrompt, setCopiedMasterPrompt] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    if (!activeAnswer && graph) {
      const answer = queryAiArchitect(graph, QUICK_ASK_CHIPS[0]);
      setActiveAnswer(answer);
    }
  }, [graph, activeAnswer]);

  const handleAsk = (q: string) => {
    if (!q.trim()) return;
    setIsProcessing(true);
    setTimeout(() => {
      const answer = queryAiArchitect(graph, q.trim());
      setActiveAnswer(answer);
      setIsProcessing(false);
    }, 10);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (queryInput.trim()) {
      handleAsk(queryInput.trim());
      setQueryInput("");
    }
  };

  const handleCopyMasterPrompt = (promptText: string) => {
    navigator.clipboard.writeText(promptText);
    setCopiedMasterPrompt(true);
    setTimeout(() => setCopiedMasterPrompt(false), 2000);
  };

  return (
    <div className="flex-1 h-full overflow-y-auto p-5 bg-[#09090b] text-zinc-100 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-white/[0.07]">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-zinc-100">
            AI Architect: Contract & Blast Radius Intelligence
          </h1>
          <p className="text-xs font-mono text-zinc-500 mt-0.5">
            Deterministic AST compiler & topological dependency reasoning •{" "}
            <span className="text-zinc-400">&lt;10ms query latency</span>
          </p>
        </div>

        <span className="font-mono text-[10px] text-zinc-500 uppercase tracking-wider">
          AST Engine v2
        </span>
      </div>

      {/* Quick-Ask Chips */}
      <div className="space-y-1.5">
        <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">
          Quick-Ask Architecture Chips:
        </div>
        <div className="flex flex-wrap gap-1.5">
          {QUICK_ASK_CHIPS.map((chip) => (
            <button
              key={chip}
              onClick={() => handleAsk(chip)}
              className={`h-7 px-2.5 rounded-[4px] text-[11px] font-mono border transition-colors cursor-pointer text-left ${
                activeAnswer?.query === chip
                  ? "bg-white/[0.08] text-white border-white/[0.2] font-medium"
                  : "bg-[#0c0c0e] text-zinc-400 border-white/[0.07] hover:text-zinc-200 hover:bg-white/[0.03]"
              }`}
            >
              {chip}
            </button>
          ))}
        </div>
      </div>

      {/* Custom Query Input */}
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="text"
          value={queryInput}
          onChange={(e) => setQueryInput(e.target.value)}
          placeholder="Ask about contracts, blast radius, database errors, or file couplings..."
          className="flex-1 bg-[#070709] border border-white/[0.08] rounded-[4px] h-8 px-2.5 font-mono text-[11px] text-zinc-200 placeholder:text-zinc-600 focus:outline-none"
        />
        <button
          type="submit"
          disabled={isProcessing}
          className="h-8 px-3 rounded-[4px] bg-zinc-100 hover:bg-white text-zinc-950 font-medium text-[12px] font-sans flex items-center gap-1.5 transition-colors cursor-pointer"
        >
          <Send className="w-3 h-3" />
          <span>Ask</span>
        </button>
      </form>

      {/* Active Answer Card */}
      {activeAnswer && (
        <div className="border border-white/[0.07] rounded-[4px] bg-[#0c0c0e] divide-y divide-white/[0.06] overflow-hidden">
          <div className="px-4 py-2.5 bg-[#121215] flex items-center justify-between font-mono text-[11px]">
            <span className="text-zinc-300 font-medium truncate max-w-xl">
              &ldquo;{activeAnswer.query}&rdquo;
            </span>
            <span className="text-zinc-500 tabular-nums shrink-0">
              {activeAnswer.durationMs}ms
            </span>
          </div>

          {/* Answer Markdown Render */}
          <div className="p-4 text-[12px] font-mono leading-relaxed space-y-2.5 text-zinc-300">
            {activeAnswer.answerMarkdown.split("\n\n").map((paragraph, idx) => {
              if (paragraph.startsWith("### ")) {
                return (
                  <h3 key={idx} className="text-[13px] font-semibold text-zinc-100 tracking-tight pt-1">
                    {paragraph.replace("### ", "")}
                  </h3>
                );
              }
              if (paragraph.startsWith("#### ")) {
                return (
                  <h4 key={idx} className="text-[11px] font-semibold text-zinc-300 uppercase tracking-wider pt-1">
                    {paragraph.replace("#### ", "")}
                  </h4>
                );
              }
              return (
                <div key={idx} className="whitespace-pre-wrap leading-relaxed">
                  {paragraph}
                </div>
              );
            })}
          </div>

          {/* Cited Locations */}
          {activeAnswer.citedLocations.length > 0 && (
            <div className="px-4 py-3 space-y-1.5">
              <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">
                Cited Contract Anchors:
              </div>
              <div className="flex flex-wrap gap-1.5">
                {activeAnswer.citedLocations.map((loc, idx) => (
                  <button
                    key={`${loc.filePath}:${loc.line}-${idx}`}
                    onClick={() => onNavigateToArchitecture(loc.filePath)}
                    className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[3px] bg-[#070709] hover:bg-white/[0.04] border border-white/[0.06] text-[10px] font-mono text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
                    title={`Jump to ${loc.filePath}:${loc.line} in Architecture canvas`}
                  >
                    <ExternalLink className="w-2.5 h-2.5 text-zinc-600" />
                    <span>
                      {loc.filePath.split("/").slice(-2).join("/")}:{loc.line}
                    </span>
                    <span className="text-zinc-600">({loc.label})</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Master Repair Plan */}
          {activeAnswer.masterRepairPrompt && (
            <div className="px-4 py-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">
                  Master Multi-File IDE Prompt
                </span>

                <button
                  onClick={() => handleCopyMasterPrompt(activeAnswer.masterRepairPrompt!)}
                  className="h-7 px-2.5 rounded-[4px] bg-zinc-100 hover:bg-white text-zinc-950 font-medium text-[11px] font-sans flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  {copiedMasterPrompt ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Copied Master Prompt</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy Master Repair Prompt</span>
                    </>
                  )}
                </button>
              </div>

              <div className="bg-[#070709] border border-white/[0.07] rounded-[4px] p-3 font-mono text-[11px] text-zinc-400 leading-relaxed max-h-60 overflow-y-auto whitespace-pre-wrap select-all">
                {activeAnswer.masterRepairPrompt}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
