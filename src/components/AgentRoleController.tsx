"use client";

import type { AgentRole } from "@/lib/types";

type AgentRoleControllerProps = {
  value: AgentRole;
  onChange: (agentRole: AgentRole) => Promise<void>;
};

const options: AgentRole[] = ["Facilitator", "Knowledgeable peer", "Novice peer"];

export function AgentRoleController({ value, onChange }: AgentRoleControllerProps) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm font-medium text-slate-700">Agent Role:</span>
      <select
        className="rounded border border-slate-300 bg-white px-2 py-1 text-sm"
        value={value}
        onChange={(event) => onChange(event.target.value as AgentRole)}
      >
        {options.map((agentRole) => (
          <option key={agentRole} value={agentRole}>
            {agentRole}
          </option>
        ))}
      </select>
    </div>
  );
}
