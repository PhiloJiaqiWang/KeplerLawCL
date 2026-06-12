import { requestOpenAIText } from "@/agents/openai";

export type OpenAIStatus = {
  detail: string;
  state: "ready" | "unavailable" | "missing_key";
};

const STATUS_TTL_MS = 60 * 1000;

let cachedStatus: OpenAIStatus | null = null;
let lastCheckedAt = 0;
let inFlightCheck: Promise<OpenAIStatus> | null = null;

const checkOpenAIStatus = async (): Promise<OpenAIStatus> => {
  if (!process.env.OPENAI_API_KEY) {
    return {
      state: "missing_key",
      detail: "OPENAI_API_KEY is not configured.",
    };
  }

  try {
    const response = await requestOpenAIText({
      label: "OpenAI health check",
      roomId: null,
      systemPrompt: "Reply with OK only.",
      userPrompt: "Health check",
      maxOutputTokens: 16,
      temperature: 0,
    });

    if (!response) {
      return {
        state: "unavailable",
        detail: "OpenAI returned an empty response.",
      };
    }

    return {
      state: "ready",
      detail: "OpenAI responded successfully.",
    };
  } catch (error) {
    return {
      state: "unavailable",
      detail: error instanceof Error ? error.message : String(error),
    };
  }
};

export const getOpenAIStatus = async (): Promise<OpenAIStatus> => {
  const now = Date.now();
  if (cachedStatus && now - lastCheckedAt < STATUS_TTL_MS) {
    return cachedStatus;
  }

  if (!inFlightCheck) {
    inFlightCheck = checkOpenAIStatus().then((status) => {
      cachedStatus = status;
      lastCheckedAt = Date.now();
      inFlightCheck = null;
      return status;
    });
  }

  return inFlightCheck;
};
