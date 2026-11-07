"use client";

import React from "react";
import { RotateCcw, Trash2 } from "lucide-react";
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
    <div className="flex-1 h-full overflow-y-auto p-5 bg-[#09090b] text-zinc-100 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-white/[0.07]">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-zinc-100">
            Persistent Scan History
          </h1>
          <p className="text-xs font-mono text-zinc-500 mt-0.5">
            Persisted in browser localStorage (`wireboard_scan_history`) • Keeping last 15 scans
          </p>
        </div>

        {history.length > 0 && (
          <button
            onClick={onClearHistory}
            className="h-7 px-2.5 rounded-[4px] text-zinc-500 hover:text-rose-400 border border-white/[0.06] hover:bg-white/[0.03] text-[11px] font-mono flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Trash2 className="w-3 h-3" />
            <span>Clear History</span>
          </button>
        )}
      </div>

      {/* History Items Table */}
      {history.length === 0 ? (
        <div className="py-20 text-center space-y-1 text-xs font-mono text-zinc-600">
          <div>No previous scans recorded yet.</div>
          <div>Every repository scan is automatically snapshotted here.</div>
        </div>
      ) : (
        <div className="border border-white/[0.07] rounded-[4px] bg-[#0c0c0e] divide-y divide-white/[0.06] overflow-hidden">
          {history.map((item, idx) => {
            const olderScan = history[idx + 1];
            let deltaText = null;
            if (olderScan) {
              const issueDiff = item.totalIssues - olderScan.totalIssues;
              if (issueDiff < 0) {
                deltaText = (
                  <span className="flex items-center gap-1 text-emerald-400 font-mono text-[11px]">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#10B981]" />
                    {Math.abs(issueDiff)} resolved
                  </span>
                );
              } else if (issueDiff > 0) {
                deltaText = (
                  <span className="flex items-center gap-1 text-rose-400 font-mono text-[11px]">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#EF4444]" />
                    +{issueDiff} new
                  </span>
                );
              } else {
                deltaText = (
                  <span className="text-zinc-600 font-mono text-[11px]">
                    No change
                  </span>
                );
              }
            }

            const isCurrent = item.id === currentScanId;

            return (
              <div
                key={item.id}
                className="p-3.5 flex items-center justify-between gap-4 hover:bg-white/[0.02] transition-colors"
              >
                {/* Left: Score & Project info */}
                <div className="flex items-center gap-3 min-w-0">
                  <span
                    className={`font-mono text-xs font-bold tabular-nums shrink-0 ${
                      item.score === 100
                        ? "text-emerald-400"
                        : item.score >= 70
                        ? "text-amber-400"
                        : "text-rose-400"
                    }`}
                  >
                    {item.score}%
                  </span>

                  <div className="min-w-0">
                    <div className="text-[13px] font-medium text-zinc-100 flex items-center gap-2 truncate">
                      <span>{item.projectName}</span>
                      {isCurrent && (
                        <span className="text-[9px] font-mono uppercase px-1 py-0.2 rounded-[2px] bg-white/[0.08] text-zinc-400">
                          Active
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] font-mono text-zinc-500 tabular-nums truncate">
                      {item.scannedAt} • {item.repoPath}
                    </div>
                  </div>
                </div>

                {/* Middle: Delta & Counters */}
                <div className="flex items-center gap-4 shrink-0 font-mono text-[11px]">
                  {deltaText}

                  <div className="flex items-center gap-3 text-zinc-500 tabular-nums">
                    <span>{item.totalNodes} Nodes</span>
                    <span className="flex items-center gap-1 text-emerald-400">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#10B981]" />
                      {item.verifiedWires}
                    </span>
                    <span className="flex items-center gap-1 text-amber-400">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#F59E0B]" />
                      {item.suspiciousWires}
                    </span>
                    <span className="flex items-center gap-1 text-rose-400">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#EF4444]" />
                      {item.brokenWires}
                    </span>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => onRestoreSnapshot(item)}
                      disabled={isCurrent}
                      className="h-7 px-2.5 rounded-[4px] bg-zinc-100 hover:bg-white disabled:opacity-30 text-zinc-950 font-medium text-[11px] font-sans flex items-center gap-1 transition-colors cursor-pointer"
                      title="Load this snapshot into active workspace"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>{isCurrent ? "Active" : "Restore"}</span>
                    </button>

                    <button
                      onClick={() => onDeleteSnapshot(item.id)}
                      className="h-7 w-7 rounded-[4px] text-zinc-600 hover:text-rose-400 border border-white/[0.06] hover:bg-white/[0.03] flex items-center justify-center transition-colors cursor-pointer"
                      title="Delete snapshot"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
