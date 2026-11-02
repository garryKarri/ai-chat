import type { ChatMessage } from "@/lib/chat";
import { runWorkdirTool, workdirTools } from "@/lib/tools/fs-tools";

const OLLAMA_URL = "http://127.0.0.1:11434/api/chat";
const DEFAULT_OLLAMA_MODEL = "qwen3.5:4b";
const MAX_ROUNDS = 8;

const SYSTEM_PROMPT =
  "Ты помощник с доступом к файловой системе внутри папки workdir. " +
  "Используй tools list_files, read_file и write_file. " +
  "Список дел обычно лежит в todo.json; сведения о пользователе могут быть в файлах вроде about-me.txt. " +
  "Отвечай кратко по-русски, без упоминания tools и внутренних деталей.";

type OllamaToolCall = {
  function?: {
    name?: string;
    arguments?: Record<string, unknown> | string;
  };
};

type OllamaMessage = {
  role: string;
  content?: string | null;
  tool_calls?: OllamaToolCall[];
};

type OllamaChatResponse = {
  message?: OllamaMessage;
  error?: string;
};

function ollamaModel(): string {
  return process.env.OLLAMA_MODEL?.trim() || DEFAULT_OLLAMA_MODEL;
}

async function chatWithOllama(messages: OllamaMessage[]): Promise<OllamaMessage> {
  const response = await fetch(OLLAMA_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: ollamaModel(),
      messages,
      tools: workdirTools,
      stream: false,
    }),
  });

  const data = (await response.json()) as OllamaChatResponse;

  if (!response.ok) {
    throw new Error(data.error ?? `Ошибка Ollama (${response.status})`);
  }

  if (!data.message) {
    throw new Error("Ollama вернула пустое сообщение");
  }

  return data.message;
}

/** Агентский цикл: messages + tools → tool_calls → исполнение → финальный текст. */
export async function runWorkdirAgent(
  history: ChatMessage[],
): Promise<string> {
  const messages: OllamaMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...history.map((message) => ({
      role: message.role,
      content: message.content,
    })),
  ];

  let message = await chatWithOllama(messages);
  let rounds = 0;

  while (message.tool_calls?.length && rounds < MAX_ROUNDS) {
    rounds += 1;
    messages.push({
      role: "assistant",
      content: message.content ?? "",
      tool_calls: message.tool_calls,
    });

    for (const call of message.tool_calls) {
      const name = call.function?.name ?? "";
      const args = call.function?.arguments ?? {};
      const content = await runWorkdirTool(name, args);
      messages.push({ role: "tool", content });
    }

    message = await chatWithOllama(messages);
  }

  const reply = message.content?.trim();

  if (!reply) {
    if (rounds >= MAX_ROUNDS) {
      throw new Error(
        "Агент исчерпал лимит шагов с tools и не дал текстовый ответ",
      );
    }
    throw new Error("Модель вернула пустой ответ");
  }

  return reply;
}
