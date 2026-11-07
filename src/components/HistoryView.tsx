"use client";

import React from "react";
import {
  History,
  RotateCcw,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  TrendingDown,
  TrendingUp,
  Minus,
} from "lucide-react";
import type { ScanHistoryItem } from "./OverviewView";

interface HistoryViewProps {
  history: ScanHistoryItem[];
  currentScanId?: string;
  onRestoreSnapshot: (item: ScanHistoryItem) => void;
  onDeleteSnapshot: (id: string) => void;
  onClearHistory: () => void;
}

export function HistoryView({
  history,
  currentScanId,
  onRestoreSnapshot,
  onDeleteSnapshot,
  onClearHistory,
}: HistoryViewProps) {
  return (
    <div className="flex-1 h-full overflow-y-auto p-6 bg-[#09090b] text-zinc-100 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-white/10">
        <div>
          <h1 className="text-xl font-bold font-mono tracking-tight text-zinc-100 flex items-center gap-2">
            <History className="w-5 h-5 text-emerald-400 stroke-[1.75]" />
            Persistent Scan History
          </h1>
          <p className="text-xs text-zinc-400 font-mono mt-1">
            Persisted in browser localStorage (`wireboard_scan_history`) • Keeping last 15 scans
          </p>
        </div>

        {history.length > 0 && (
          <button
            onClick={onClearHistory}
            className="h-7 px-2.5 rounded bg-[#111115] hover:bg-rose-950/30 text-rose-300 hover:text-rose-200 border border-zinc-800 hover:border-rose-800/60 text-xs font-mono flex items-center gap-1.5 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Clear History</span>
          </button>
        )}
      </div>

      {/* History Items */}
      {history.length === 0 ? (
        <div className="py-20 text-center space-y-2">
          <History className="w-8 h-8 text-zinc-600 mx-auto" />
          <div className="text-xs font-mono text-zinc-400">No previous scans recorded yet.</div>
          <div className="text-[11px] font-mono text-zinc-600">
            Every repository scan is automatically snapshotted here.
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {history.map((item, idx) => {
            // Delta against the scan right before this one in history
            const olderScan = history[idx + 1];
            let deltaBadge = null;
            if (olderScan) {
              const issueDiff = item.totalIssues - olderScan.totalIssues;
              if (issueDiff < 0) {
                deltaBadge = (
                  <span className="inline-flex items-center gap-1 font-mono text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                    <TrendingDown className="w-3 h-3" />
                    {Math.abs(issueDiff)} issue(s) resolved
                  </span>
                );
              } else if (issueDiff > 0) {
                deltaBadge = (
                  <span className="inline-flex items-center gap-1 font-mono text-[10px] px-2 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/30">
                    <TrendingUp className="w-3 h-3" />
                    +{issueDiff} new issue(s)
                  </span>
                );
              } else {
                deltaBadge = (
                  <span className="inline-flex items-center gap-1 font-mono text-[10px] px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700">
                    <Minus className="w-3 h-3" />
                    No change
                  </span>
                );
              }
            }

            const isCurrent = item.id === currentScanId;

            return (
              <div
                key={item.id}
                className={`p-4 rounded-md bg-[#111115] border transition-all space-y-2.5 ${
                  isCurrent
                    ? "border-emerald-500/40 ring-1 ring-emerald-500/20"
                    : "border-white/10 hover:border-zinc-700"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span
                      className={`font-mono text-xs font-bold px-2 py-0.5 rounded border tabular-nums ${
                        item.score === 100
                          ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                          : item.score >= 70
                          ? "bg-amber-500/10 text-amber-400 border-amber-500/30"
                          : "bg-rose-500/10 text-rose-400 border-rose-500/30"
                      }`}
                    >
                      {item.score}% Score
                    </span>

                    <div>
                      <div className="text-sm font-semibold font-mono text-zinc-100 flex items-center gap-2">
                        <span>{item.projectName}</span>
                        {isCurrent && (
                          <span className="text-[10px] font-mono font-medium px-1.5 py-0.2 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                            ACTIVE SNAPSHOT
                          </span>
                        )}
                      </div>
                      <div className="text-xs font-mono text-zinc-400 tabular-nums">
                        {item.scannedAt} • Path: <span className="text-zinc-300">{item.repoPath}</span>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2">
                    {deltaBadge}

                    <button
                      onClick={() => onRestoreSnapshot(item)}
                      disabled={isCurrent}
                      className="h-7 px-2.5 rounded bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-xs font-mono text-zinc-200 border border-zinc-700 flex items-center gap-1.5 transition-colors"
                      title="Load this snapshot into active workspace"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>{isCurrent ? "Loaded" : "Restore"}</span>
                    </button>

                    <button
                      onClick={() => onDeleteSnapshot(item.id)}
                      className="h-7 w-7 rounded bg-[#09090b] hover:bg-rose-950/40 text-zinc-500 hover:text-rose-400 border border-zinc-800 flex items-center justify-center transition-colors"
                      title="Delete snapshot"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Counters row */}
                <div className="flex items-center gap-3 pt-2 border-t border-zinc-800/80 font-mono text-xs">
                  <span className="text-zinc-400 tabular-nums">
                    {item.totalNodes} Nodes
                  </span>
                  <span className="text-zinc-600">•</span>
                  <span className="text-emerald-400 flex items-center gap-1 tabular-nums">
                    <CheckCircle2 className="w-3 h-3" />
                    {item.verifiedWires} Verified
                  </span>
                  <span className="text-zinc-600">•</span>
                  <span className="text-amber-400 flex items-center gap-1 tabular-nums">
                    <AlertTriangle className="w-3 h-3" />
                    {item.suspiciousWires} Suspicious
                  </span>
                  <span className="text-zinc-600">•</span>
                  <span className="text-rose-400 flex items-center gap-1 tabular-nums">
                    <AlertCircle className="w-3 h-3" />
                    {item.brokenWires} Broken
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

