import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import type { Activity, SimulationType, Stage } from "@/lib/types";

export type AgentTraceContext = {
  activity: Activity | null;
  simulation: SimulationType | null;
  stage: Stage | null;
};

export type OpenAIDebugTrace = {
  id: string;
  label: string;
  model: string;
  roomId: string | null;
  context: AgentTraceContext;
  request: {
    maxOutputTokens: number;
    systemPrompt: string;
    temperature: number;
    userPrompt: string;
  };
  response: {
    ok: boolean;
    status: number | null;
    text: string | null;
    error: string | null;
  };
  createdAt: string;
};

const MAX_TRACES = 20;
const traces: OpenAIDebugTrace[] = [];

const persistAgentTraceRecord = async (trace: OpenAIDebugTrace) => {
  try {
    await prisma.agentTraceRecord.upsert({
      where: { id: trace.id },
      update: {},
      create: {
        id: trace.id,
        roomId: trace.roomId,
        label: trace.label,
        model: trace.model,
        activity: trace.context.activity,
        simulation: trace.context.simulation,
        stage: trace.context.stage,
        systemPrompt: trace.request.systemPrompt,
        userPrompt: trace.request.userPrompt,
        maxOutputTokens: trace.request.maxOutputTokens,
        temperature: trace.request.temperature,
        ok: trace.response.ok,
        status: trace.response.status,
        responseText: trace.response.text,
        responseError: trace.response.error,
        createdAt: new Date(trace.createdAt),
      },
    });
  } catch (error) {
    console.warn("Agent trace PostgreSQL persistence unavailable.", {
      traceId: trace.id,
      label: trace.label,
      roomId: trace.roomId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

export const addOpenAIDebugTrace = (
  trace: Omit<OpenAIDebugTrace, "createdAt" | "id">,
): OpenAIDebugTrace => {
  const record: OpenAIDebugTrace = {
    ...trace,
    id: randomUUID(),
    createdAt: new Date().toISOString(),
  };
  traces.unshift(record);
  if (traces.length > MAX_TRACES) {
    traces.length = MAX_TRACES;
  }
  void persistAgentTraceRecord(record);
  return record;
};

export const getOpenAIDebugTraces = (): OpenAIDebugTrace[] => traces;

export const getVisibleOpenAIDebugTraces = (roomId?: string): OpenAIDebugTrace[] =>
  traces.filter((trace) => trace.label !== "OpenAI health check" && (!roomId || trace.roomId === roomId));
