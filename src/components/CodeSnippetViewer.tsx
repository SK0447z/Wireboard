"use client";

import React from "react";

interface CodeSnippetViewerProps {
  snippet: string;
  severity?: "BROKEN" | "SUSPICIOUS" | "VERIFIED";
  title?: string;
  filePath?: string;
  line?: number;
}

export function CodeSnippetViewer({
  snippet,
  severity = "BROKEN",
  title,
  filePath,
  line,
}: CodeSnippetViewerProps) {
  if (!snippet) return null;

  const lines = snippet.split("\n");

  const highlightClass =
    severity === "BROKEN"
      ? "bg-[#EF4444]/10 text-rose-300 border-l-2 border-l-[#EF4444] pl-2"
      : severity === "SUSPICIOUS"
      ? "bg-[#F59E0B]/10 text-amber-300 border-l-2 border-l-[#F59E0B] pl-2"
      : "bg-[#10B981]/10 text-emerald-300 border-l-2 border-l-[#10B981] pl-2";

  return (
    <div className="space-y-1.5">
      {(title || filePath) && (
        <div className="flex items-center justify-between text-[10px] font-mono text-zinc-500">
          <span className="uppercase tracking-wider text-zinc-400 font-medium">
            {title || "Snippet"}
          </span>
          {filePath && (
            <span className="text-zinc-500 tabular-nums truncate max-w-[220px]">
              {filePath.split("/").slice(-2).join("/")}
              {line ? `:${line}` : ""}
            </span>
          )}
        </div>
      )}
      <div className="bg-[#070709] border border-white/[0.07] rounded-[4px] p-2.5 font-mono text-[11px] leading-relaxed overflow-x-auto">
        <div className="font-mono m-0 p-0 whitespace-pre">
          {lines.map((ln, idx) => {
            const isHighlight = ln.startsWith(">");
            return (
              <div
                key={idx}
                className={
                  isHighlight
                    ? `${highlightClass} py-0.5`
                    : "text-zinc-400 py-0.5"
                }
              >
                {ln}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
