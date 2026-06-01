"use client";

import type { AgentCondition } from "@/lib/types";

type AgentControllerProps = {
  value: AgentCondition;
  onChange: (condition: AgentCondition) => Promise<void>;
};

const options: AgentCondition[] = ["Control", "Assistive", "Observation"];
const labelByCondition: Record<AgentCondition, string> = {
  Control: "Summary",
  Assistive: "Assistive",
  Observation: "Observation",
};

export function AgentController({ value, onChange }: AgentControllerProps) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm font-medium text-slate-700">Agent:</span>
      <select
        className="rounded border border-slate-300 bg-white px-2 py-1 text-sm"
        value={value}
        onChange={(e) => onChange(e.target.value as AgentCondition)}
      >
        {options.map((condition) => (
          <option key={condition} value={condition}>
            {labelByCondition[condition]}
          </option>
        ))}
      </select>
    </div>
  );
}
