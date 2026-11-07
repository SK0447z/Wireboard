"use client";

import React, { useState, useMemo } from "react";
import { Copy, Check, Search, ExternalLink } from "lucide-react";
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

  const availableCodes = useMemo(() => {
    const set = new Set<string>();
    for (const issue of graph.issues) {
      set.add(issue.code);
    }
    return Array.from(set).sort();
  }, [graph.issues]);

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
    <div className="flex-1 h-full overflow-y-auto p-5 bg-[#09090b] text-zinc-100 space-y-4">
      {/* Top Header & Filters */}
      <div className="space-y-3 pb-3 border-b border-white/[0.07]">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-zinc-100">
              Integration Diagnostics & Source Code Diffs
            </h1>
            <p className="text-xs font-mono text-zinc-500 mt-0.5">
              Showing <span className="tabular-nums font-semibold text-zinc-300">{filteredIssues.length}</span> of{" "}
              <span className="tabular-nums">{graph.issues.length}</span> detected contract issues
            </p>
          </div>

          {/* Search box */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-[4px] bg-[#070709] border border-white/[0.08] text-xs font-mono w-72">
            <Search className="w-3.5 h-3.5 text-zinc-600" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search file, title, or code..."
              className="w-full bg-transparent text-zinc-200 placeholder:text-zinc-600 focus:outline-none text-[11px]"
            />
          </div>
        </div>

        {/* Filter Controls Row */}
        <div className="flex items-center gap-3 flex-wrap text-xs font-mono">
          {/* Severity */}
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-zinc-500 uppercase tracking-wider">Severity:</span>
            <div className="flex rounded-[4px] bg-[#08080a] border border-white/[0.07] p-0.5 text-[10px]">
              {(["ALL", "BROKEN", "SUSPICIOUS"] as const).map((sev) => (
                <button
                  key={sev}
                  onClick={() => setSeverityFilter(sev)}
                  className={`px-2 py-0.5 rounded-[3px] transition-colors ${
                    severityFilter === sev
                      ? "bg-white/[0.08] text-zinc-100 font-medium"
                      : "text-zinc-500 hover:text-zinc-300"
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
            <div className="flex rounded-[4px] bg-[#08080a] border border-white/[0.07] p-0.5 text-[10px]">
              {(["ALL", "HIGH", "MEDIUM"] as const).map((conf) => (
                <button
                  key={conf}
                  onClick={() => setConfidenceFilter(conf)}
                  className={`px-2 py-0.5 rounded-[3px] transition-colors ${
                    confidenceFilter === conf
                      ? "bg-white/[0.08] text-zinc-100 font-medium"
                      : "text-zinc-500 hover:text-zinc-300"
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
              className="bg-[#070709] border border-white/[0.08] text-[10px] text-zinc-300 px-2 h-6 rounded-[3px] focus:outline-none"
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

      {/* Issues List as Edge-to-Edge Hairline Table */}
      {filteredIssues.length === 0 ? (
        <div className="py-16 text-center text-xs font-mono text-zinc-600 space-y-1">
          <div>No contract issues match your filter criteria.</div>
          <div>Reset filters to inspect all issues.</div>
        </div>
      ) : (
        <div className="border border-white/[0.07] rounded-[4px] bg-[#0c0c0e] divide-y divide-white/[0.06] overflow-hidden">
          {filteredIssues.map((issue) => (
            <div key={issue.id} className="p-4 space-y-3">
              {/* Row Header & Actions */}
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                        issue.severity === "BROKEN" ? "bg-[#EF4444]" : "bg-[#F59E0B]"
                      }`}
                    />
                    <span className="font-mono text-[11px] font-semibold text-zinc-200">
                      {issue.code}
                    </span>
                    <span
                      className={`font-mono text-[9px] uppercase px-1.5 py-0.2 rounded-[2px] ${
                        issue.severity === "BROKEN"
                          ? "text-rose-400 bg-rose-500/10"
                          : "text-amber-400 bg-amber-500/10"
                      }`}
                    >
                      {issue.severity}
                    </span>
                    <span className="font-mono text-[10px] text-zinc-500 uppercase tracking-wider">
                      {issue.confidence} CONFIDENCE
                    </span>
                  </div>

                  <h3 className="text-[13px] font-medium text-zinc-100">{issue.title}</h3>
                  <p className="text-[12px] text-zinc-400 leading-relaxed max-w-3xl">
                    {issue.explanation}
                  </p>
                </div>

                {/* Actions: Copy Prompt & View Wire */}
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => handleCopyPrompt(issue.id, issue.repairPrompt)}
                    className="h-7 px-2.5 rounded-[4px] bg-zinc-100 hover:bg-white text-zinc-950 font-medium text-[11px] font-sans transition-colors flex items-center gap-1.5 cursor-pointer"
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
                    className="h-7 px-2.5 rounded-[4px] text-zinc-400 hover:text-zinc-200 border border-white/[0.06] hover:bg-white/[0.03] text-[11px] font-mono flex items-center gap-1.5 transition-colors cursor-pointer"
                    title="View wire in Architecture Canvas"
                  >
                    <ExternalLink className="w-3 h-3 text-zinc-500" />
                    <span>View Wire</span>
                  </button>
                </div>
              </div>

              {/* Location Path */}
              <div className="font-mono text-[11px] text-zinc-500 flex items-center gap-1.5 tabular-nums">
                <span className="text-zinc-600 uppercase text-[9px]">Location:</span>
                <span className="text-zinc-300">
                  {issue.sourceFile.split("/").slice(-2).join("/")}:{issue.sourceLine}
                </span>
                {issue.targetFile && (
                  <>
                    <span className="text-zinc-600">→</span>
                    <span className="text-zinc-300">
                      {issue.targetFile.split("/").slice(-2).join("/")}:{issue.targetLine || 1}
                    </span>
                  </>
                )}
              </div>

              {/* Side-by-Side Source & Target Code Snippets */}
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
