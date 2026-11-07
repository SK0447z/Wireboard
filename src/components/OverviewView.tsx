"use client";

import React, { useMemo } from "react";
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

  const delta = useMemo(() => {
    if (!priorScan) return null;
    const issueDiff = totalIssues - priorScan.totalIssues;
    const brokenDiff = currentBroken - priorScan.brokenWires;
    const scoreDiff = score - priorScan.score;
    return { issueDiff, brokenDiff, scoreDiff };
  }, [priorScan, totalIssues, currentBroken, score]);

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
    <div className="flex-1 h-full overflow-y-auto p-5 bg-[#09090b] text-zinc-100 space-y-4">
      {/* Header & Delta Banner */}
      <div className="space-y-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-zinc-100">
            Executive Health & Contract Overview
          </h1>
          <p className="text-xs font-mono text-zinc-500 mt-0.5">
            Deterministic AST audit for <span className="text-zinc-300">{graph.projectName}</span> • Scanned at{" "}
            <span className="tabular-nums">{graph.scannedAt}</span>
          </p>
        </div>

        {delta ? (
          <div className="border border-white/[0.07] rounded-[4px] bg-[#0c0c0e] px-3.5 py-2 flex items-center justify-between text-xs font-mono">
            <div className="flex items-center gap-2">
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  delta.issueDiff <= 0 ? "bg-[#10B981]" : "bg-[#EF4444]"
                }`}
              />
              <span className="text-zinc-300 font-medium">
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
              </span>
            </div>
            <span className="text-zinc-500 tabular-nums">
              Score: {priorScan?.score}% → <span className="text-zinc-200">{score}%</span> (
              {delta.scoreDiff >= 0 ? `+${delta.scoreDiff}%` : `${delta.scoreDiff}%`})
            </span>
          </div>
        ) : (
          <div className="border border-white/[0.07] rounded-[4px] bg-[#0c0c0e] px-3.5 py-2 flex items-center justify-between text-xs font-mono text-zinc-500">
            <span>First repository scan registered. Future scans will display delta metrics.</span>
            <span className="text-[10px] text-zinc-400 uppercase tracking-wider">
              Baseline Scan
            </span>
          </div>
        )}
      </div>

      {/* Top 4 Telemetry Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <div className="p-3.5 rounded-[4px] bg-[#0c0c0e] border border-white/[0.07] space-y-1">
          <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">
            Contract Integrity Score
          </div>
          <div className="text-2xl font-bold font-mono tabular-nums">
            <span
              className={
                score === 100
                  ? "text-emerald-400"
                  : score >= 70
                  ? "text-amber-400"
                  : "text-rose-400"
              }
            >
              {score}%
            </span>
            <span className="text-xs font-mono text-zinc-600 font-normal"> / 100%</span>
          </div>
          <div className="text-[11px] font-mono text-zinc-500">
            {score === 100 ? "Zero contract drift" : `${currentBroken} broken contract(s)`}
          </div>
        </div>

        <div className="p-3.5 rounded-[4px] bg-[#0c0c0e] border border-white/[0.07] space-y-1">
          <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 flex items-center justify-between">
            <span>Verified Wires</span>
            <span className="w-1.5 h-1.5 rounded-full bg-[#10B981]" />
          </div>
          <div className="text-2xl font-bold font-mono tabular-nums text-emerald-400">
            {currentVerified}
          </div>
          <div className="text-[11px] font-mono text-zinc-500">
            Synchronized route & DB schemas
          </div>
        </div>

        <div className="p-3.5 rounded-[4px] bg-[#0c0c0e] border border-white/[0.07] space-y-1">
          <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 flex items-center justify-between">
            <span>Suspicious Wires</span>
            <span className="w-1.5 h-1.5 rounded-full bg-[#F59E0B]" />
          </div>
          <div className="text-2xl font-bold font-mono tabular-nums text-amber-400">
            {currentSuspicious}
          </div>
          <div className="text-[11px] font-mono text-zinc-500">
            Type-cheats & swallowed errors
          </div>
        </div>

        <div className="p-3.5 rounded-[4px] bg-[#0c0c0e] border border-white/[0.07] space-y-1">
          <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 flex items-center justify-between">
            <span>Broken Wires</span>
            <span className="w-1.5 h-1.5 rounded-full bg-[#EF4444]" />
          </div>
          <div className="text-2xl font-bold font-mono tabular-nums text-rose-400">
            {currentBroken}
          </div>
          <div className="text-[11px] font-mono text-zinc-500">
            Missing endpoints & key mismatches
          </div>
        </div>
      </div>

      {/* Main Grid: Code Breakdown & Vulnerable Files */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Detector Code Breakdown */}
        <div className="border border-white/[0.07] rounded-[4px] bg-[#0c0c0e] overflow-hidden">
          <div className="px-3.5 py-2 bg-[#121215] border-b border-white/[0.06] flex items-center justify-between text-[11px] font-mono text-zinc-400 font-medium uppercase tracking-wider">
            <span>Detector Code Breakdown</span>
            <span className="text-zinc-600 tabular-nums">{codeBreakdown.length} codes</span>
          </div>

          {codeBreakdown.length === 0 ? (
            <div className="py-8 text-center text-xs font-mono text-zinc-600">
              Zero integration issues detected.
            </div>
          ) : (
            <div className="divide-y divide-white/[0.04]">
              {codeBreakdown.map(([code, counts]) => (
                <div
                  key={code}
                  onClick={() => onNavigateToDiagnostics(code)}
                  className="px-3.5 py-2 hover:bg-white/[0.02] flex items-center justify-between cursor-pointer transition-colors text-xs font-mono"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-zinc-200 font-medium">{code}</span>
                  </div>

                  <div className="flex items-center gap-3 text-[11px] tabular-nums">
                    {counts.broken > 0 && (
                      <span className="flex items-center gap-1 text-rose-400">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#EF4444]" />
                        {counts.broken}
                      </span>
                    )}
                    {counts.suspicious > 0 && (
                      <span className="flex items-center gap-1 text-amber-400">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#F59E0B]" />
                        {counts.suspicious}
                      </span>
                    )}
                    <span className="text-zinc-500">{counts.total} total</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Most Vulnerable Files */}
        <div className="border border-white/[0.07] rounded-[4px] bg-[#0c0c0e] overflow-hidden">
          <div className="px-3.5 py-2 bg-[#121215] border-b border-white/[0.06] flex items-center justify-between text-[11px] font-mono text-zinc-400 font-medium uppercase tracking-wider">
            <span>Most Vulnerable Files</span>
            <span className="text-zinc-600">Ranked by issues</span>
          </div>

          {vulnerableFiles.length === 0 ? (
            <div className="py-8 text-center text-xs font-mono text-zinc-600">
              No vulnerable files detected.
            </div>
          ) : (
            <div className="divide-y divide-white/[0.04]">
              {vulnerableFiles.map((file) => (
                <div
                  key={file.filePath}
                  onClick={() => onNavigateToArchitecture(file.nodeId)}
                  className="px-3.5 py-2 hover:bg-white/[0.02] flex items-center justify-between cursor-pointer transition-colors text-xs font-mono"
                >
                  <span className="text-zinc-300 truncate max-w-[240px]">
                    {file.filePath.split("/").slice(-2).join("/")}
                  </span>

                  <div className="flex items-center gap-3 text-[11px] tabular-nums shrink-0">
                    {file.broken > 0 && (
                      <span className="flex items-center gap-1 text-rose-400 font-medium">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#EF4444]" />
                        {file.broken} broken
                      </span>
                    )}
                    {file.suspicious > 0 && (
                      <span className="flex items-center gap-1 text-amber-400 font-medium">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#F59E0B]" />
                        {file.suspicious} susp
                      </span>
                    )}
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
