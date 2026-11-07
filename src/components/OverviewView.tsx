"use client";

import React, { useMemo } from "react";
import {
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  FileCode,
  ArrowRight,
  TrendingDown,
  TrendingUp,
  Minus,
} from "lucide-react";
import type { ArchitectureGraph } from "@/types/graph";
import { generateContractReport } from "@/engine/generateReport";

export interface ScanHistoryItem {
  id: string;
  scannedAt: string;
  projectName: string;
  repoPath: string;
  score: number;
  totalNodes: number;
  verifiedWires: number;
  suspiciousWires: number;
  brokenWires: number;
  totalIssues: number;
  brokenIssues: number;
  suspiciousIssues: number;
  graph: ArchitectureGraph;
}

interface OverviewViewProps {
  graph: ArchitectureGraph;
  priorScan?: ScanHistoryItem | null;
  onNavigateToDiagnostics: (filterCode?: string) => void;
  onNavigateToArchitecture: (nodeId?: string) => void;
}

export function OverviewView({
  graph,
  priorScan,
  onNavigateToDiagnostics,
  onNavigateToArchitecture,
}: OverviewViewProps) {
  const report = useMemo(() => generateContractReport(graph), [graph]);
  const score = report.score;

  const currentBroken = graph.summary.brokenWires;
  const currentSuspicious = graph.summary.suspiciousWires;
  const currentVerified = graph.summary.verifiedWires;
  const totalIssues = graph.issues.length;

  // Scan Delta comparison against prior scan
  const delta = useMemo(() => {
    if (!priorScan) return null;
    const issueDiff = totalIssues - priorScan.totalIssues;
    const brokenDiff = currentBroken - priorScan.brokenWires;
    const scoreDiff = score - priorScan.score;
    return { issueDiff, brokenDiff, scoreDiff };
  }, [priorScan, totalIssues, currentBroken, score]);

  // Breakdown by issue code
  const codeBreakdown = useMemo(() => {
    const counts: Record<string, { broken: number; suspicious: number; total: number }> = {};
    for (const issue of graph.issues) {
      if (!counts[issue.code]) {
        counts[issue.code] = { broken: 0, suspicious: 0, total: 0 };
      }
      counts[issue.code].total++;
      if (issue.severity === "BROKEN") {
        counts[issue.code].broken++;
      } else {
        counts[issue.code].suspicious++;
      }
    }
    return Object.entries(counts).sort((a, b) => b[1].total - a[1].total);
  }, [graph.issues]);

  // Most Vulnerable Files list
  const vulnerableFiles = useMemo(() => {
    const fileStats = new Map<
      string,
      { filePath: string; broken: number; suspicious: number; total: number; nodeId?: string }
    >();

    for (const issue of graph.issues) {
      const sf = issue.sourceFile;
      if (!fileStats.has(sf)) {
        fileStats.set(sf, { filePath: sf, broken: 0, suspicious: 0, total: 0 });
      }
      const item = fileStats.get(sf)!;
      item.total++;
      if (issue.severity === "BROKEN") item.broken++;
      else item.suspicious++;
    }

    // Associate node IDs
    for (const [path, stat] of fileStats.entries()) {
      const matchNode = graph.nodes.find((n) => n.filePath === path);
      if (matchNode) {
        stat.nodeId = matchNode.id;
      }
    }

    const list = Array.from(fileStats.values());
    list.sort((a, b) => {
      if (b.broken !== a.broken) return b.broken - a.broken;
      return b.total - a.total;
    });

    return list.slice(0, 8);
  }, [graph]);

  return (
    <div className="flex-1 h-full overflow-y-auto p-6 bg-[#09090b] text-zinc-100 space-y-6">
      {/* Title & Scan Delta Banner */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold font-mono tracking-tight text-zinc-100 flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-emerald-400 stroke-[1.75]" />
              Executive Health & Contract Overview
            </h1>
            <p className="text-xs text-zinc-400 font-mono mt-1">
              Deterministic AST audit for <span className="text-zinc-200">{graph.projectName}</span> • Scanned at{" "}
              <span className="tabular-nums">{graph.scannedAt}</span>
            </p>
          </div>
        </div>

        {/* Scan Delta Banner */}
        {delta ? (
          <div className="p-3.5 rounded bg-[#111115] border border-white/10 flex items-center justify-between">
            <div className="flex items-center gap-3">
              {delta.issueDiff < 0 ? (
                <div className="w-8 h-8 rounded bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                  <TrendingDown className="w-4 h-4" />
                </div>
              ) : delta.issueDiff > 0 ? (
                <div className="w-8 h-8 rounded bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400">
                  <TrendingUp className="w-4 h-4" />
                </div>
              ) : (
                <div className="w-8 h-8 rounded bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-400">
                  <Minus className="w-4 h-4" />
                </div>
              )}

              <div>
                <div className="text-xs font-mono font-semibold text-zinc-200">
                  Delta since prior scan:{" "}
                  {delta.issueDiff < 0
                    ? `${Math.abs(delta.issueDiff)} issue(s) resolved`
                    : delta.issueDiff > 0
                    ? `+${delta.issueDiff} new issue(s)`
                    : "Zero issue variance"}
                  {", "}
                  {delta.brokenDiff <= 0
                    ? `${Math.abs(delta.brokenDiff)} broken wire(s) eliminated`
                    : `+${delta.brokenDiff} new broken wire(s)`}
                </div>
                <div className="text-[11px] font-mono text-zinc-400">
                  Integrity Score shifted from{" "}
                  <span className="tabular-nums font-semibold">{priorScan?.score}%</span> to{" "}
                  <span className="tabular-nums font-semibold text-zinc-200">{score}%</span>
                </div>
              </div>
            </div>

            <span
              className={`font-mono text-xs font-semibold px-2 py-0.5 rounded border ${
                delta.scoreDiff >= 0
                  ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                  : "bg-rose-500/10 text-rose-400 border-rose-500/30"
              }`}
            >
              {delta.scoreDiff >= 0 ? `+${delta.scoreDiff}%` : `${delta.scoreDiff}%`}
            </span>
          </div>
        ) : (
          <div className="p-3 rounded bg-[#111115] border border-white/10 flex items-center justify-between text-xs font-mono text-zinc-400">
            <span>First repository scan registered. Future scans will calculate contract deltas.</span>
            <span className="px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700">
              BASELINE SCAN
            </span>
          </div>
        )}
      </div>

      {/* Top Telemetry Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Score Card */}
        <div className="p-4 rounded-md bg-[#111115] border border-white/10 space-y-1">
          <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-400">
            Contract Integrity Score
          </div>
          <div className="flex items-baseline gap-2">
            <span
              className={`text-3xl font-bold font-mono tabular-nums ${
                score === 100
                  ? "text-emerald-400"
                  : score >= 70
                  ? "text-amber-400"
                  : "text-rose-400"
              }`}
            >
              {score}%
            </span>
            <span className="text-xs font-mono text-zinc-500">/ 100%</span>
          </div>
          <div className="text-[11px] font-mono text-zinc-400 pt-1">
            {score === 100
              ? "All integration wires fully verified"
              : `${currentBroken} critical contract mismatch(es)`}
          </div>
        </div>

        {/* Verified Wires Card */}
        <div className="p-4 rounded-md bg-[#111115] border border-white/10 space-y-1">
          <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-400 flex items-center justify-between">
            <span>Verified Wires</span>
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <div className="text-3xl font-bold font-mono tabular-nums text-emerald-400">
            {currentVerified}
          </div>
          <div className="text-[11px] font-mono text-zinc-400 pt-1">
            Matching route signatures & DB schemas
          </div>
        </div>

        {/* Suspicious Wires Card */}
        <div className="p-4 rounded-md bg-[#111115] border border-white/10 space-y-1">
          <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-400 flex items-center justify-between">
            <span>Suspicious Wires</span>
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
          </div>
          <div className="text-3xl font-bold font-mono tabular-nums text-amber-400">
            {currentSuspicious}
          </div>
          <div className="text-[11px] font-mono text-zinc-400 pt-1">
            Type-cheats (`as any`) & swallowed errors
          </div>
        </div>

        {/* Broken Wires Card */}
        <div className="p-4 rounded-md bg-[#111115] border border-white/10 space-y-1">
          <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-400 flex items-center justify-between">
            <span>Broken Wires</span>
            <AlertCircle className="w-3.5 h-3.5 text-rose-400" />
          </div>
          <div className="text-3xl font-bold font-mono tabular-nums text-rose-400">
            {currentBroken}
          </div>
          <div className="text-[11px] font-mono text-zinc-400 pt-1">
            Missing endpoints or mismatched keys
          </div>
        </div>
      </div>

      {/* Main Grid: Issue Code Breakdown & Most Vulnerable Files */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Breakdown by Issue Code */}
        <div className="p-4 rounded-md bg-[#111115] border border-white/10 space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
            <div className="font-mono text-xs uppercase tracking-wider font-semibold text-zinc-200">
              Detector Code Breakdown
            </div>
            <span className="font-mono text-[10px] text-zinc-400 tabular-nums">
              {codeBreakdown.length} active codes
            </span>
          </div>

          {codeBreakdown.length === 0 ? (
            <div className="py-8 text-center text-xs font-mono text-zinc-400">
              Zero integration issues detected across repository.
            </div>
          ) : (
            <div className="space-y-2">
              {codeBreakdown.map(([code, counts]) => (
                <div
                  key={code}
                  onClick={() => onNavigateToDiagnostics(code)}
                  className="group p-2.5 rounded bg-[#09090b] hover:bg-zinc-900 border border-zinc-800 flex items-center justify-between cursor-pointer transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-semibold text-zinc-200 group-hover:text-white">
                      {code}
                    </span>
                    {counts.broken > 0 && (
                      <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/30">
                        {counts.broken} Broken
                      </span>
                    )}
                    {counts.suspicious > 0 && (
                      <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/30">
                        {counts.suspicious} Suspicious
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 text-xs font-mono text-zinc-400 group-hover:text-zinc-200">
                    <span className="tabular-nums">{counts.total} total</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Most Vulnerable Files List */}
        <div className="p-4 rounded-md bg-[#111115] border border-white/10 space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
            <div className="font-mono text-xs uppercase tracking-wider font-semibold text-zinc-200">
              Most Vulnerable Files
            </div>
            <span className="font-mono text-[10px] text-zinc-400">
              Ranked by issue density
            </span>
          </div>

          {vulnerableFiles.length === 0 ? (
            <div className="py-8 text-center text-xs font-mono text-zinc-400">
              No vulnerable files found in this scan.
            </div>
          ) : (
            <div className="space-y-2">
              {vulnerableFiles.map((file) => (
                <div
                  key={file.filePath}
                  onClick={() => onNavigateToArchitecture(file.nodeId)}
                  className="group p-2.5 rounded bg-[#09090b] hover:bg-zinc-900 border border-zinc-800 flex items-center justify-between cursor-pointer transition-colors"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <FileCode className="w-4 h-4 text-zinc-400 shrink-0" />
                    <span className="font-mono text-xs text-zinc-200 truncate group-hover:text-white">
                      {file.filePath.split("/").slice(-2).join("/")}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {file.broken > 0 && (
                      <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/30 tabular-nums font-semibold">
                        {file.broken} Broken
                      </span>
                    )}
                    {file.suspicious > 0 && (
                      <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/30 tabular-nums font-semibold">
                        {file.suspicious} Suspicious
                      </span>
                    )}
                    <ArrowRight className="w-3.5 h-3.5 text-zinc-500 group-hover:text-zinc-200" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
