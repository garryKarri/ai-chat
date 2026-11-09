export type ChatModel = {
  id: string;
  label: string;
};

/** Локальный FS-агент через Ollama (не Polza). */
export const WORKDIR_AGENT_MODEL_ID = "local/workdir-agent";

/** Генератор картинок напрямую (промпт → URL, без LLM). */
export const IMAGE_GEN_MODEL_ID = "local/image-gen";

/** Ollama-агент с tool generate_image (режим IMAGE_GEN_MODE: polza / comfy_ui / stub). */
export const IMAGE_GEN_AGENT_MODEL_ID = "local/image-gen-agent";

/** Подставь id моделей из кабинета Polza.ai; local/* — локальные режимы. */
export const MODELS: ChatModel[] = [
  { id: WORKDIR_AGENT_MODEL_ID, label: "Агент workdir (Ollama)" },
  { id: IMAGE_GEN_AGENT_MODEL_ID, label: "Агент картинок (Ollama)" },
  { id: IMAGE_GEN_MODEL_ID, label: "Генератор изображений" },
  { id: "openai/gpt-4o-mini", label: "GPT-4o mini" },
  { id: "anthropic/claude-sonnet-5.5", label: "Claude Sonnet 5.5" },
  { id: "google/gemini-3.8-flash", label: "Gemini 3.8 Flash" },
];

export function isWorkdirAgentModel(modelId: string): boolean {
  return modelId === WORKDIR_AGENT_MODEL_ID;
}

export function isImageGenAgentModel(modelId: string): boolean {
  return modelId === IMAGE_GEN_AGENT_MODEL_ID;
}

export function isImageGenModel(modelId: string): boolean {
  return modelId === IMAGE_GEN_MODEL_ID;
}
