"use client";

import React, { memo } from "react";
import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import type { AnchorNodeData } from "@/lib/layoutGraph";

function kindBadge(kind: string, httpMethod?: string) {
  if (httpMethod) return httpMethod;
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

  const isSelected = selected;
  const isBlast = data.isBlastRadius;

  const outerBorder = isSelected
    ? "border-white/30 ring-1 ring-white/20"
    : isBlast
    ? "border-amber-400/50 ring-1 ring-amber-400/20"
    : "border-white/[0.09] hover:border-white/[0.16]";

  const headerAccent =
    status === "BROKEN"
      ? "border-l-2 border-l-[#EF4444]"
      : status === "SUSPICIOUS"
      ? "border-l-2 border-l-[#F59E0B]"
      : "border-l-2 border-l-[#10B981]";

  const statusDotColor =
    status === "BROKEN"
      ? "bg-[#EF4444]"
      : status === "SUSPICIOUS"
      ? "bg-[#F59E0B]"
      : "bg-[#10B981]";

  return (
    <div
      className={`w-[260px] bg-[#0e0e11] border rounded-[6px] shadow-2xl overflow-hidden transition-colors ${outerBorder}`}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!w-2 !h-2 !-left-1 !bg-zinc-600 !border !border-zinc-950 hover:!bg-zinc-300 transition-colors"
      />
      <Handle
        type="source"
        position={Position.Right}
        className="!w-2 !h-2 !-right-1 !bg-zinc-600 !border !border-zinc-950 hover:!bg-zinc-300 transition-colors"
      />

      {/* Compact Edge-to-Edge Header */}
      <div className={`px-3 py-2 bg-[#141418] border-b border-white/[0.06] ${headerAccent}`}>
        <div className="flex items-center justify-between">
          <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-400 font-medium">
            {kindBadge(node.kind, node.httpMethod)}
          </span>
          <span
            className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusDotColor}`}
            title={`Status: ${status}`}
          />
        </div>
        <div className="text-[13px] font-medium text-zinc-100 truncate mt-1">
          {node.label}
        </div>
        <div className="font-mono text-[10px] text-zinc-500 truncate mt-0.5 tabular-nums">
          {node.filePath.split("/").slice(-2).join("/")}:{node.line}
        </div>
      </div>

      {/* Schematic Property Rows */}
      {(expectsEntries.length > 0 || returnsEntries.length > 0) && (
        <div className="text-zinc-200">
          {/* Expects Payload Rows */}
          {expectsEntries.length > 0 && (
            <div>
              <div className="px-3 py-1 bg-[#0b0b0d] text-[9px] font-mono text-zinc-500 uppercase tracking-wider border-b border-white/[0.04]">
                Expects ({expectsEntries.length})
              </div>
              <div className="divide-y divide-white/[0.04]">
                {expectsEntries.slice(0, 5).map(([key, type]) => (
                  <div
                    key={key}
                    className="flex items-center justify-between px-3 py-1 text-[11px] font-mono"
                  >
                    <span className="text-zinc-300 truncate max-w-[130px]">{key}</span>
                    <span className="text-zinc-500 truncate max-w-[90px] text-right font-normal">
                      {type}
                    </span>
                  </div>
                ))}
                {expectsEntries.length > 5 && (
                  <div className="px-3 py-0.5 text-[10px] font-mono text-zinc-600 bg-[#09090b]">
                    +{expectsEntries.length - 5} more
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Returns Payload Rows */}
          {returnsEntries.length > 0 && (
            <div>
              <div className="px-3 py-1 bg-[#0b0b0d] text-[9px] font-mono text-zinc-500 uppercase tracking-wider border-y border-white/[0.04]">
                Returns ({returnsEntries.length})
              </div>
              <div className="divide-y divide-white/[0.04]">
                {returnsEntries.slice(0, 5).map(([key, type]) => (
                  <div
                    key={key}
                    className="flex items-center justify-between px-3 py-1 text-[11px] font-mono"
                  >
                    <span className="text-zinc-300 truncate max-w-[130px]">{key}</span>
                    <span className="text-zinc-500 truncate max-w-[90px] text-right font-normal">
                      {type}
                    </span>
                  </div>
                ))}
                {returnsEntries.length > 5 && (
                  <div className="px-3 py-0.5 text-[10px] font-mono text-zinc-600 bg-[#09090b]">
                    +{returnsEntries.length - 5} more
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
});
