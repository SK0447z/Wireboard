"use client";

import React, { useState, useEffect } from "react";
import {
  Bot,
  Terminal,
  Zap,
  Copy,
  Check,
  Send,
  ExternalLink,
  FileCheck,
} from "lucide-react";
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

  // Initialize with the first quick-ask answer on first render
  useEffect(() => {
    if (!activeAnswer && graph) {
      const answer = queryAiArchitect(graph, QUICK_ASK_CHIPS[0]);
      setActiveAnswer(answer);
    }
  }, [graph, activeAnswer]);

  const handleAsk = (q: string) => {
    if (!q.trim()) return;
    setIsProcessing(true);
    // Instant deterministic engine call
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
    <div className="flex-1 h-full overflow-y-auto p-6 bg-[#09090b] text-zinc-100 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-white/10">
        <div>
          <h1 className="text-xl font-bold font-mono tracking-tight text-zinc-100 flex items-center gap-2">
            <Bot className="w-5 h-5 text-emerald-400 stroke-[1.75]" />
            AI Architect: Contract & Blast Radius Intelligence
          </h1>
          <p className="text-xs text-zinc-400 font-mono mt-1">
            Deterministic AST compiler & topological dependency reasoning •{" "}
            <span className="text-emerald-400">&lt;10ms query latency</span>
          </p>
        </div>

        <div className="flex items-center gap-2 font-mono text-[10px] text-zinc-400 px-2.5 py-1 rounded bg-[#111115] border border-zinc-800">
          <Zap className="w-3.5 h-3.5 text-amber-400" />
          <span>REAL-TIME AST MEMORY</span>
        </div>
      </div>

      {/* Quick-Ask Chips */}
      <div className="space-y-2">
        <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">
          Quick-Ask Architecture Chips:
        </div>
        <div className="flex flex-wrap gap-2">
          {QUICK_ASK_CHIPS.map((chip) => (
            <button
              key={chip}
              onClick={() => handleAsk(chip)}
              className={`px-3 py-1.5 rounded text-xs font-mono border transition-all text-left ${
                activeAnswer?.query === chip
                  ? "bg-zinc-800 text-zinc-100 border-zinc-600 font-semibold shadow-xs"
                  : "bg-[#111115] text-zinc-400 border-zinc-800/80 hover:text-zinc-200 hover:border-zinc-700"
              }`}
            >
              {chip}
            </button>
          ))}
        </div>
      </div>

      {/* Custom Query Input */}
      <form onSubmit={handleSubmit} className="flex gap-2">
        <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded bg-[#111115] border border-zinc-800 text-xs font-mono">
          <Terminal className="w-4 h-4 text-zinc-500" />
          <input
            type="text"
            value={queryInput}
            onChange={(e) => setQueryInput(e.target.value)}
            placeholder="Ask about contracts, blast radius, database errors, or file couplings..."
            className="w-full bg-transparent text-zinc-200 placeholder:text-zinc-600 focus:outline-none"
          />
        </div>
        <button
          type="submit"
          disabled={isProcessing}
          className="px-4 py-2 rounded bg-zinc-800 hover:bg-zinc-700 text-xs font-mono font-medium text-zinc-100 border border-zinc-700 flex items-center gap-1.5 transition-colors"
        >
          <Send className="w-3.5 h-3.5" />
          <span>Ask Engine</span>
        </button>
      </form>

      {/* Active Answer Card */}
      {activeAnswer && (
        <div className="p-5 rounded-md bg-[#111115] border border-white/10 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs uppercase tracking-wider font-semibold text-zinc-300">
                Architectural Response
              </span>
              <span className="text-zinc-500 font-mono text-xs">/</span>
              <span className="text-zinc-400 font-mono text-xs italic">&ldquo;{activeAnswer.query}&rdquo;</span>
            </div>

            <span className="font-mono text-[11px] text-zinc-400 tabular-nums px-2 py-0.5 rounded bg-[#09090b] border border-zinc-800">
              Resolved in {activeAnswer.durationMs}ms
            </span>
          </div>

          {/* Answer Markdown Render */}
          <div className="prose prose-invert max-w-none text-xs font-mono leading-relaxed space-y-3 text-zinc-300">
            {activeAnswer.answerMarkdown.split("\n\n").map((paragraph, idx) => {
              if (paragraph.startsWith("### ")) {
                return (
                  <h3 key={idx} className="text-sm font-bold text-zinc-100 tracking-tight pt-1">
                    {paragraph.replace("### ", "")}
                  </h3>
                );
              }
              if (paragraph.startsWith("#### ")) {
                return (
                  <h4 key={idx} className="text-xs font-bold text-zinc-200 uppercase tracking-wider pt-1">
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

          {/* Cited Locations Pills */}
          {activeAnswer.citedLocations.length > 0 && (
            <div className="space-y-1.5 pt-3 border-t border-zinc-800">
              <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">
                Cited Contract Anchors:
              </div>
              <div className="flex flex-wrap gap-1.5">
                {activeAnswer.citedLocations.map((loc, idx) => (
                  <button
                    key={`${loc.filePath}:${loc.line}-${idx}`}
                    onClick={() => onNavigateToArchitecture(loc.filePath)}
                    className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-[#09090b] hover:bg-zinc-800 border border-zinc-800 text-[11px] font-mono text-zinc-300 hover:text-white transition-colors"
                    title={`Jump to ${loc.filePath}:${loc.line} in Architecture canvas`}
                  >
                    <ExternalLink className="w-3 h-3 text-zinc-500" />
                    <span>
                      {loc.filePath.split("/").slice(-2).join("/")}:{loc.line}
                    </span>
                    <span className="text-zinc-500">({loc.label})</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Master Repair Plan (if generated) */}
          {activeAnswer.masterRepairPrompt && (
            <div className="space-y-2 pt-3 border-t border-zinc-800">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 font-mono text-xs font-semibold text-zinc-200">
                  <FileCheck className="w-4 h-4 text-emerald-400" />
                  <span>Master Multi-File IDE Prompt</span>
                </div>

                <button
                  onClick={() => handleCopyMasterPrompt(activeAnswer.masterRepairPrompt!)}
                  className={`h-7 px-2.5 rounded text-xs font-mono font-medium border transition-colors flex items-center gap-1.5 ${
                    copiedMasterPrompt
                      ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                      : "bg-zinc-800 hover:bg-zinc-700 text-zinc-100 border-zinc-700"
                  }`}
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

              <div className="bg-[#070709] border border-white/10 rounded p-3 font-mono text-xs text-zinc-300 leading-relaxed max-h-72 overflow-y-auto whitespace-pre-wrap select-all">
                {activeAnswer.masterRepairPrompt}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
