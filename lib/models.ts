export type ChatModel = {
  id: string;
  label: string;
};

/** Локальный FS-агент через Ollama (не Polza). */
export const WORKDIR_AGENT_MODEL_ID = "local/workdir-agent";

/** Подставь id моделей из кабинета Polza.ai; local/* — локальный агент. */
export const MODELS: ChatModel[] = [
  { id: WORKDIR_AGENT_MODEL_ID, label: "Агент workdir (Ollama)" },
  { id: "openai/gpt-4o-mini", label: "GPT-4o mini" },
  { id: "anthropic/claude-sonnet-5.5", label: "Claude Sonnet 5.5" },
  { id: "google/gemini-3.8-flash", label: "Gemini 3.8 Flash" },
];

export function isWorkdirAgentModel(modelId: string): boolean {
  return modelId === WORKDIR_AGENT_MODEL_ID;
}
