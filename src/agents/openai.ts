import { addOpenAIDebugTrace } from "@/agents/debug";

const OPENAI_URL = "https://api.openai.com/v1/responses";

type OpenAIInputMessage = {
  role: "system" | "user";
  content: Array<{ type: "input_text"; text: string }>;
};

const extractText = (payload: unknown): string => {
  if (!payload || typeof payload !== "object") return "";
  const output = (payload as { output?: Array<{ content?: Array<{ type?: string; text?: string }> }> }).output ?? [];
  const parts: string[] = [];
  for (const item of output) {
    for (const content of item.content ?? []) {
      if (content.type === "output_text" && content.text) {
        parts.push(content.text);
      }
    }
  }
  return parts.join("\n").trim();
};

const extractJson = <T>(text: string): T => {
  const trimmed = text.trim();
  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fencedMatch?.[1]?.trim() ?? trimmed;
  return JSON.parse(candidate) as T;
};

const extractErrorMessage = (payload: unknown): string | null => {
  if (!payload || typeof payload !== "object") return null;
  const error = (payload as { error?: { message?: string } }).error;
  if (error?.message) return error.message;
  return null;
};

export const hasOpenAIKey = (): boolean => Boolean(process.env.OPENAI_API_KEY);

export const requestOpenAIText = async ({
  label = "OpenAI request",
  roomId = null,
  systemPrompt,
  userPrompt,
  model = process.env.AGENT_OPENAI_MODEL ?? "gpt-4.1-mini",
  maxOutputTokens = 220,
  temperature = 0.4,
}: {
  label?: string;
  roomId?: string | null;
  systemPrompt: string;
  userPrompt: string;
  model?: string;
  maxOutputTokens?: number;
  temperature?: number;
}): Promise<string | null> => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const input: OpenAIInputMessage[] = [
    { role: "system", content: [{ type: "input_text", text: systemPrompt }] },
    { role: "user", content: [{ type: "input_text", text: userPrompt }] },
  ];

  const response = await fetch(OPENAI_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      input,
      max_output_tokens: maxOutputTokens,
      temperature,
    }),
  });

  if (!response.ok) {
    let detail = "";
    const status = response.status;
    try {
      const payload = await response.json();
      detail = extractErrorMessage(payload) ?? JSON.stringify(payload);
    } catch {
      try {
        detail = await response.text();
      } catch {
        detail = "";
      }
    }
    addOpenAIDebugTrace({
      label,
      model,
      roomId,
      request: {
        systemPrompt,
        userPrompt,
        maxOutputTokens,
        temperature,
      },
      response: {
        ok: false,
        status,
        text: null,
        error: detail || `OpenAI request failed (${response.status})`,
      },
    });
    const suffix = detail ? `: ${detail}` : "";
    throw new Error(`OpenAI request failed (${response.status})${suffix}`);
  }

  const payload = await response.json();
  const text = extractText(payload);
  addOpenAIDebugTrace({
    label,
    model,
    roomId,
    request: {
      systemPrompt,
      userPrompt,
      maxOutputTokens,
      temperature,
    },
    response: {
      ok: true,
      status: response.status,
      text,
      error: null,
    },
  });
  return text || null;
};

export const requestOpenAIJson = async <T>({
  label,
  roomId,
  systemPrompt,
  userPrompt,
  model,
  maxOutputTokens = 300,
  temperature = 0.2,
}: {
  label?: string;
  roomId?: string | null;
  systemPrompt: string;
  userPrompt: string;
  model?: string;
  maxOutputTokens?: number;
  temperature?: number;
}): Promise<T | null> => {
  const text = await requestOpenAIText({
    label,
    roomId,
    systemPrompt,
    userPrompt,
    model,
    maxOutputTokens,
    temperature,
  });

  if (!text) return null;
  return extractJson<T>(text);
};
