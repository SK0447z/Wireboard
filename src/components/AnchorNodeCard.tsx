"use client";

import React, { memo } from "react";
import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import type { AnchorNodeData } from "@/lib/layoutGraph";

function kindBadge(kind: string) {
  switch (kind) {
    case "FRONTEND_COMPONENT":
      return "FRONTEND";
    case "BACKEND_ROUTE":
      return "API ROUTE";
    case "SERVER_ACTION":
      return "SERVER ACTION";
    case "DB_TABLE":
      return "DB TABLE";
    case "EXTERNAL_SERVICE":
      return "EXTERNAL API";
    default:
      return kind;
  }
}

export const AnchorNodeCard = memo(function AnchorNodeCard({
  data,
  selected,
}: NodeProps<Node<AnchorNodeData>>) {
  const { node, status } = data;

  const expectsEntries = node.expectsPayload
    ? Object.entries(node.expectsPayload)
    : [];
  const returnsEntries = node.returnsPayload
    ? Object.entries(node.returnsPayload)
    : [];

  const borderClass =
    status === "BROKEN"
      ? "border-rose-500/70 shadow-[0_0_12px_rgba(239,68,68,0.12)]"
      : status === "SUSPICIOUS"
      ? "border-amber-500/70 shadow-[0_0_12px_rgba(245,158,11,0.12)]"
      : "border-zinc-800 hover:border-zinc-700";

  const isBlast = data.isBlastRadius;
  const selectedClass = selected
    ? "ring-2 ring-zinc-200 shadow-[0_0_14px_rgba(255,255,255,0.12)]"
    : isBlast
    ? "ring-1 ring-amber-400/80 bg-[#141419]"
    : "";

  return (
    <div
      className={`w-[340px] rounded-md bg-[#111114] text-zinc-100 border transition-all duration-150 ${borderClass} ${selectedClass}`}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!w-2.5 !h-2.5 !-left-1.5 !bg-zinc-600 !border-2 !border-zinc-950 hover:!bg-zinc-400"
      />
      <Handle
        type="source"
        position={Position.Right}
        className="!w-2.5 !h-2.5 !-right-1.5 !bg-zinc-600 !border-2 !border-zinc-950 hover:!bg-zinc-400"
      />

      {/* Header Bar */}
      <div className="px-3 py-2 border-b border-zinc-800/80 flex items-center justify-between bg-zinc-900/50">
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-[10px] tracking-wider uppercase px-1.5 py-0.5 rounded bg-zinc-800/80 text-zinc-300 border border-zinc-700/50">
            {kindBadge(node.kind)}
          </span>
          {node.httpMethod && (
            <span className="font-mono text-[10px] font-semibold px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-200 border border-zinc-700/50 tabular-nums">
              {node.httpMethod}
            </span>
          )}
        </div>

        {/* Status Indicator Pip */}
        <div className="flex items-center gap-1.5">
          {status === "BROKEN" && (
            <span className="inline-flex items-center gap-1 font-mono text-[10px] font-medium text-rose-400">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
              BROKEN
            </span>
          )}
          {status === "SUSPICIOUS" && (
            <span className="inline-flex items-center gap-1 font-mono text-[10px] font-medium text-amber-400">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
              SUSPICIOUS
            </span>
          )}
          {status === "VERIFIED" && (
            <span className="inline-flex items-center gap-1 font-mono text-[10px] font-medium text-emerald-400">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              VERIFIED
            </span>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="p-3 space-y-2">
        <div>
          <div className="text-sm font-medium text-zinc-100 truncate">
            {node.label}
          </div>
          <div className="font-mono text-[11px] text-zinc-400 truncate tabular-nums mt-0.5">
            {node.filePath}:{node.line}
          </div>
        </div>

        {/* Expects Payload Preview */}
        {expectsEntries.length > 0 && (
          <div className="pt-2 border-t border-zinc-800/60">
            <div className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider mb-1">
              Expects ({expectsEntries.length})
            </div>
            <div className="flex flex-wrap gap-1">
              {expectsEntries.map(([key, type]) => (
                <span
                  key={key}
                  className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-300 tabular-nums"
                >
                  {key}: <span className="text-zinc-400">{type}</span>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Returns Payload Preview */}
        {returnsEntries.length > 0 && (
          <div className="pt-2 border-t border-zinc-800/60">
            <div className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider mb-1">
              Returns ({returnsEntries.length})
            </div>
            <div className="flex flex-wrap gap-1">
              {returnsEntries.slice(0, 6).map(([key, type]) => (
                <span
                  key={key}
                  className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-300 tabular-nums"
                >
                  {key}: <span className="text-zinc-400">{type}</span>
                </span>
              ))}
              {returnsEntries.length > 6 && (
                <span className="font-mono text-[10px] px-1.5 py-0.5 text-zinc-400 tabular-nums">
                  +{returnsEntries.length - 6} more
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
});

