export type ChatModel = {
  id: string;
  label: string;
};

/** Локальный FS-агент через Ollama (не Polza). */
export const WORKDIR_AGENT_MODEL_ID = "local/workdir-agent";

/** Генератор картинок через Polza Media (промпт → URL). */
export const IMAGE_GEN_MODEL_ID = "local/image-gen";

/** Подставь id моделей из кабинета Polza.ai; local/* — локальные режимы. */
export const MODELS: ChatModel[] = [
  { id: WORKDIR_AGENT_MODEL_ID, label: "Агент workdir (Ollama)" },
  { id: IMAGE_GEN_MODEL_ID, label: "Генератор изображений" },
  { id: "openai/gpt-4o-mini", label: "GPT-4o mini" },
  { id: "anthropic/claude-sonnet-5.5", label: "Claude Sonnet 5.5" },
  { id: "google/gemini-3.8-flash", label: "Gemini 3.8 Flash" },
];

export function isWorkdirAgentModel(modelId: string): boolean {
  return modelId === WORKDIR_AGENT_MODEL_ID;
}

export function isImageGenModel(modelId: string): boolean {
  return modelId === IMAGE_GEN_MODEL_ID;
}
