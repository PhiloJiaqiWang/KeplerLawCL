"use client";

import type { OpenAIDebugTrace } from "@/agents/debug";
import type { OpenAIStatus } from "@/agents/status";

type DeveloperPanelProps = {
  openAIStatus: OpenAIStatus;
  traces: OpenAIDebugTrace[];
};

const statusLabelByState: Record<OpenAIStatus["state"], string> = {
  ready: "OpenAI online",
  unavailable: "OpenAI unavailable",
  missing_key: "OpenAI not configured",
};

const statusClassesByState: Record<OpenAIStatus["state"], string> = {
  ready: "bg-emerald-500",
  unavailable: "bg-amber-500",
  missing_key: "bg-slate-400",
};

export function DeveloperPanel({ openAIStatus, traces }: DeveloperPanelProps) {
  return (
    <section className="rounded-lg border border-slate-300 bg-white p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700">Developer Mode</h3>
        <div
          className="flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-700"
          title={openAIStatus.detail}
        >
          <span className={`h-2.5 w-2.5 rounded-full ${statusClassesByState[openAIStatus.state]}`} />
          <span>{statusLabelByState[openAIStatus.state]}</span>
        </div>
      </div>
      <p className="mt-2 text-xs text-slate-500">{openAIStatus.detail}</p>
      <div className="mt-3 max-h-80 space-y-3 overflow-y-auto rounded border border-slate-200 bg-slate-50 p-2">
        {traces.length === 0 ? (
          <p className="text-sm text-slate-500">No OpenAI traces yet.</p>
        ) : (
          traces.map((trace) => (
            <article key={trace.id} className="rounded border border-slate-200 bg-white p-2 text-xs text-slate-700">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <strong className="text-slate-900">{trace.label}</strong>
                <span>{new Date(trace.createdAt).toLocaleTimeString()}</span>
              </div>
              <p className="mt-1 text-slate-500">
                Model: {trace.model} | Status: {trace.response.ok ? "ok" : `error ${trace.response.status ?? ""}`}
              </p>
              <details className="mt-2">
                <summary className="cursor-pointer font-medium text-slate-800">Request</summary>
                <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded bg-slate-900 p-2 text-[11px] text-slate-100">
                  {JSON.stringify(trace.request, null, 2)}
                </pre>
              </details>
              <details className="mt-2">
                <summary className="cursor-pointer font-medium text-slate-800">Response</summary>
                <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded bg-slate-900 p-2 text-[11px] text-slate-100">
                  {JSON.stringify(trace.response, null, 2)}
                </pre>
              </details>
            </article>
          ))
        )}
      </div>
    </section>
  );
}
