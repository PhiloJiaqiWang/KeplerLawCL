import { randomUUID } from "node:crypto";

export type OpenAIDebugTrace = {
  id: string;
  label: string;
  model: string;
  roomId: string | null;
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
  return record;
};

export const getOpenAIDebugTraces = (): OpenAIDebugTrace[] => traces;

export const getVisibleOpenAIDebugTraces = (roomId?: string): OpenAIDebugTrace[] =>
  traces.filter((trace) => trace.label !== "OpenAI health check" && (!roomId || trace.roomId === roomId));
