"use client";

import React, { useState, useMemo } from "react";
import {
  AlertCircle,
  AlertTriangle,
  Copy,
  Check,
  Search,
  ExternalLink,
  Code2,
} from "lucide-react";
import type { ArchitectureGraph, DiagnosticIssue } from "@/types/graph";
import { CodeSnippetViewer } from "./CodeSnippetViewer";

interface DiagnosticsViewProps {
  graph: ArchitectureGraph;
  initialCodeFilter?: string | null;
  onSelectIssueInArchitecture: (issue: DiagnosticIssue) => void;
}

export function DiagnosticsView({
  graph,
  initialCodeFilter,
  onSelectIssueInArchitecture,
}: DiagnosticsViewProps) {
  const [severityFilter, setSeverityFilter] = useState<"ALL" | "BROKEN" | "SUSPICIOUS">("ALL");
  const [confidenceFilter, setConfidenceFilter] = useState<"ALL" | "HIGH" | "MEDIUM">("ALL");
  const [codeFilter, setCodeFilter] = useState<string>(initialCodeFilter || "ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopyPrompt = (issueId: string, promptText: string) => {
    navigator.clipboard.writeText(promptText);
    setCopiedId(issueId);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Distinct detector codes in graph
  const availableCodes = useMemo(() => {
    const set = new Set<string>();
    for (const issue of graph.issues) {
      set.add(issue.code);
    }
    return Array.from(set).sort();
  }, [graph.issues]);

  // Filtered issues
  const filteredIssues = useMemo(() => {
    return graph.issues.filter((issue) => {
      if (severityFilter !== "ALL" && issue.severity !== severityFilter) return false;
      if (confidenceFilter !== "ALL" && issue.confidence !== confidenceFilter) return false;
      if (codeFilter !== "ALL" && issue.code !== codeFilter) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesTitle = issue.title.toLowerCase().includes(q);
        const matchesExplanation = issue.explanation.toLowerCase().includes(q);
        const matchesSource = issue.sourceFile.toLowerCase().includes(q);
        const matchesTarget = (issue.targetFile || "").toLowerCase().includes(q);
        const matchesCode = issue.code.toLowerCase().includes(q);
        return matchesTitle || matchesExplanation || matchesSource || matchesTarget || matchesCode;
      }

      return true;
    });
  }, [graph.issues, severityFilter, confidenceFilter, codeFilter, searchQuery]);

  return (
    <div className="flex-1 h-full overflow-y-auto p-6 bg-[#09090b] text-zinc-100 space-y-4">
      {/* Header & Filter Controls */}
      <div className="space-y-3 pb-2 border-b border-white/10">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold font-mono tracking-tight text-zinc-100 flex items-center gap-2">
              <Code2 className="w-5 h-5 text-emerald-400 stroke-[1.75]" />
              Integration Diagnostics & Source Code Diffs
            </h1>
            <p className="text-xs text-zinc-400 font-mono mt-1">
              Showing <span className="tabular-nums font-semibold text-zinc-200">{filteredIssues.length}</span> of{" "}
              <span className="tabular-nums">{graph.issues.length}</span> detected issues
            </p>
          </div>

          {/* Search box */}
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-[#111115] border border-zinc-800 text-xs font-mono w-72">
            <Search className="w-3.5 h-3.5 text-zinc-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search file, title, or code..."
              className="w-full bg-transparent text-zinc-200 placeholder:text-zinc-600 focus:outline-none"
            />
          </div>
        </div>

        {/* Filter Pill Row */}
        <div className="flex items-center gap-4 flex-wrap text-xs font-mono">
          {/* Severity */}
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-zinc-500 uppercase tracking-wider">Severity:</span>
            <div className="flex rounded bg-[#111115] border border-zinc-800 p-0.5">
              {(["ALL", "BROKEN", "SUSPICIOUS"] as const).map((sev) => (
                <button
                  key={sev}
                  onClick={() => setSeverityFilter(sev)}
                  className={`px-2 py-0.5 rounded transition-colors ${
                    severityFilter === sev
                      ? "bg-zinc-800 text-zinc-100 font-medium"
                      : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  {sev}
                </button>
              ))}
            </div>
          </div>

          {/* Confidence */}
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-zinc-500 uppercase tracking-wider">Confidence:</span>
            <div className="flex rounded bg-[#111115] border border-zinc-800 p-0.5">
              {(["ALL", "HIGH", "MEDIUM"] as const).map((conf) => (
                <button
                  key={conf}
                  onClick={() => setConfidenceFilter(conf)}
                  className={`px-2 py-0.5 rounded transition-colors ${
                    confidenceFilter === conf
                      ? "bg-zinc-800 text-zinc-100 font-medium"
                      : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  {conf}
                </button>
              ))}
            </div>
          </div>

          {/* Detector Code */}
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-zinc-500 uppercase tracking-wider">Code:</span>
            <select
              value={codeFilter}
              onChange={(e) => setCodeFilter(e.target.value)}
              className="bg-[#111115] border border-zinc-800 text-xs text-zinc-200 px-2 py-1 rounded focus:outline-none focus:border-zinc-700"
            >
              <option value="ALL">ALL CODES ({availableCodes.length})</option>
              {availableCodes.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Issues List */}
      {filteredIssues.length === 0 ? (
        <div className="py-16 text-center text-xs font-mono text-zinc-500 space-y-1">
          <div>No contract issues match your filter criteria.</div>
          <div className="text-zinc-600">Try resetting filters to inspect all issues.</div>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredIssues.map((issue) => (
            <div
              key={issue.id}
              className="p-4 rounded-md bg-[#111115] border border-white/10 space-y-3"
            >
              {/* Header Badges & Actions */}
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    {issue.severity === "BROKEN" ? (
                      <span className="inline-flex items-center gap-1 font-mono text-[10px] font-semibold px-2 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/30">
                        <AlertCircle className="w-3.5 h-3.5 stroke-[1.5]" />
                        BROKEN
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 font-mono text-[10px] font-semibold px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/30">
                        <AlertTriangle className="w-3.5 h-3.5 stroke-[1.5]" />
                        SUSPICIOUS
                      </span>
                    )}

                    <span className="font-mono text-[10px] font-semibold tracking-wider uppercase px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700">
                      {issue.confidence} CONFIDENCE
                    </span>

                    <span className="font-mono text-xs text-zinc-300 bg-[#09090b] border border-zinc-800 px-2 py-0.5 rounded font-semibold">
                      {issue.code}
                    </span>
                  </div>

                  <h3 className="text-sm font-semibold text-zinc-100">{issue.title}</h3>
                  <p className="text-xs text-zinc-400 leading-relaxed max-w-3xl">
                    {issue.explanation}
                  </p>
                </div>

                {/* Actions: Copy Prompt & View in Architecture */}
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => handleCopyPrompt(issue.id, issue.repairPrompt)}
                    className={`h-7 px-2.5 rounded text-xs font-mono font-medium border transition-colors flex items-center gap-1.5 ${
                      copiedId === issue.id
                        ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                        : "bg-zinc-800 hover:bg-zinc-700 text-zinc-100 border-zinc-700"
                    }`}
                  >
                    {copiedId === issue.id ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy Fix Prompt</span>
                      </>
                    )}
                  </button>

                  <button
                    onClick={() => onSelectIssueInArchitecture(issue)}
                    className="h-7 px-2.5 rounded bg-[#09090b] hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-800 text-xs font-mono flex items-center gap-1.5 transition-colors"
                    title="View wire in Architecture Canvas"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>View Wire</span>
                  </button>
                </div>
              </div>

              {/* Integration Location path */}
              <div className="font-mono text-xs text-zinc-400 flex items-center gap-2 tabular-nums">
                <span className="text-[10px] uppercase tracking-wider text-zinc-500">Location:</span>
                <span className="text-zinc-200">
                  {issue.sourceFile}:{issue.sourceLine}
                </span>
                {issue.targetFile && (
                  <>
                    <span className="text-zinc-600">→</span>
                    <span className="text-zinc-200">
                      {issue.targetFile}:{issue.targetLine || 1}
                    </span>
                  </>
                )}
              </div>

              {/* Side-by-Side Source & Target Code Snippets with > highlighting */}
              {(issue.sourceSnippet || issue.targetSnippet) && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                  {issue.sourceSnippet && (
                    <CodeSnippetViewer
                      title="Consumer Source Snippet"
                      filePath={issue.sourceFile}
                      line={issue.sourceLine}
                      snippet={issue.sourceSnippet}
                      severity={issue.severity}
                    />
                  )}
                  {issue.targetSnippet && (
                    <CodeSnippetViewer
                      title="Producer Target Snippet"
                      filePath={issue.targetFile}
                      line={issue.targetLine}
                      snippet={issue.targetSnippet}
                      severity={issue.severity}
                    />
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
