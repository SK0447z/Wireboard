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
      ? "bg-red-500/15 text-red-300 border-l-2 border-red-500 pl-2"
      : severity === "SUSPICIOUS"
      ? "bg-amber-500/15 text-amber-300 border-l-2 border-amber-500 pl-2"
      : "bg-emerald-500/15 text-emerald-300 border-l-2 border-emerald-500 pl-2";

  return (
    <div className="space-y-1.5">
      {(title || filePath) && (
        <div className="flex items-center justify-between text-[10px] font-mono text-zinc-400">
          <span className="uppercase tracking-wider font-semibold text-zinc-300">
            {title || "Code Snippet"}
          </span>
          {filePath && (
            <span className="text-zinc-500 tabular-nums truncate max-w-[220px]">
              {filePath.split("/").slice(-2).join("/")}{line ? `:${line}` : ""}
            </span>
          )}
        </div>
      )}
      <div className="bg-[#070709] border border-white/10 rounded p-2.5 font-mono text-[11px] leading-relaxed overflow-x-auto">
        <div className="font-mono m-0 p-0 whitespace-pre">
          {lines.map((ln, idx) => {
            const isHighlight = ln.startsWith(">");
            return (
              <div
                key={idx}
                className={isHighlight ? `${highlightClass} py-0.5 rounded-r` : "text-zinc-400 py-0.5"}
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

