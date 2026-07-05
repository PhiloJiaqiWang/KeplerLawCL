import { readFileSync } from "node:fs";
import path from "node:path";
import { requestOpenAIText } from "@/agents/openai";
import { buildConversationWindow, getSenderLabel } from "@/agents/stuckMonitor";
import { agentIdentityByRole } from "@/lib/agentRoles";
import type { AgentRole, ChatMessage, MonitorDecision, RoomState, SimulationType } from "@/lib/types";

const hintDatabasePath = path.join(process.cwd(), "src/agents/config/hints.md");

const loadHintDatabase = () => readFileSync(hintDatabasePath, "utf8");

const extractSimulationHints = (simulation: SimulationType) => {
  const hintDatabase = loadHintDatabase();
  const escapedSimulation = simulation.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = hintDatabase.match(new RegExp(`## ${escapedSimulation}\\n([\\s\\S]*?)(?=\\n## |$)`));
  return match?.[1]?.trim() ?? hintDatabase;
};

export const buildSelfRegulationPrompt = async (
  room: RoomState,
  decision: MonitorDecision,
  agentRole: AgentRole,
): Promise<string | null> => {
  const systemPrompt = [
    agentIdentityByRole[agentRole],
    "The stuck monitor has identified a stuck type.",
    "Generate Agent Response Step 1: a self-regulation prompt.",
    "Ask both learners to explain their reasoning before continuing.",
    "If a Conceptual Problem includes a concept focus, ask about that specific concept.",
    "Encourage regulation of collaboration, reasoning, or emotion as appropriate.",
    "Do not provide the answer or a content hint.",
    "Keep the message concise, under 70 words.",
  ].join(" ");

  const userPrompt = [
    `Assigned agent role: ${agentRole}`,
    `Identified stuck type: ${decision.category ?? "unknown"}`,
    `Stuck rule: ${decision.ruleId ?? "unknown"}`,
    `Brief summary: ${decision.briefSummary ?? "unknown"}`,
    `Concept focus: ${decision.conceptFocus ?? "none"}`,
    `Rationale: ${decision.rationale}`,
    "",
    "Current task context and recent history:",
    JSON.stringify(buildConversationWindow(room), null, 2),
  ].join("\n");

  return requestOpenAIText({
    label: "Agent response step 1",
    roomId: room.roomId,
    context: {
      activity: room.currentActivity,
      simulation: room.currentSimulation,
      stage: room.progressBySimulation[room.currentSimulation].currentStage,
    },
    systemPrompt,
    userPrompt,
    maxOutputTokens: 180,
    temperature: 0.5,
  });
};

export const buildAdaptiveHintResponse = async (
  room: RoomState,
  decision: MonitorDecision,
  agentRole: AgentRole,
  explanationMessages: ChatMessage[],
): Promise<string | null> => {
  const systemPrompt = [
    agentIdentityByRole[agentRole],
    "Generate Agent Response Step 2.",
    "Use the hint database to decide whether a hint is needed.",
    "Choose the minimum guidance necessary for learners to continue independently.",
    "If no hint is useful or the learners are already recovering, respond with NONE.",
    "Do not reveal the final answer or solve the task.",
    "If giving a hint, keep it under 60 words.",
  ].join(" ");

  const userPrompt = [
    `Assigned agent role: ${agentRole}`,
    `Identified stuck type: ${decision.category ?? "unknown"}`,
    `Stuck rule: ${decision.ruleId ?? "unknown"}`,
    `Brief summary: ${decision.briefSummary ?? "unknown"}`,
    `Concept focus: ${decision.conceptFocus ?? "none"}`,
    `Rationale: ${decision.rationale}`,
    "",
    "Current task context and recent history:",
    JSON.stringify(buildConversationWindow(room), null, 2),
    "",
    "Learner explanations after Step 1:",
    JSON.stringify(
      explanationMessages.map((message) => ({
        sender: getSenderLabel(room, message.senderRole),
        createdAt: message.createdAt,
        content: message.content,
      })),
      null,
      2,
    ),
    "",
    `Hint database section for ${room.currentSimulation}:`,
    extractSimulationHints(room.currentSimulation),
  ].join("\n");

  const response = await requestOpenAIText({
    label: "Agent response step 2",
    roomId: room.roomId,
    context: {
      activity: room.currentActivity,
      simulation: room.currentSimulation,
      stage: room.progressBySimulation[room.currentSimulation].currentStage,
    },
    systemPrompt,
    userPrompt,
    maxOutputTokens: 180,
    temperature: 0.4,
  });

  if (!response) return null;
  return response.trim().toUpperCase() === "NONE" ? null : response;
};
