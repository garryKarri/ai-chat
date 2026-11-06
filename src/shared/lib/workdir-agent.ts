import { z } from "zod";

import type { ChatMessage } from "@entities/chat/model/types";
import { runWorkdirTool, workdirTools } from "@shared/lib/tools/fs-tools";

const OLLAMA_URL = "http://127.0.0.1:11434/api/chat";
const MAX_ROUNDS = 8;

const SYSTEM_PROMPT =
  "Ты помощник с доступом к файловой системе внутри папки workdir. " +
  "Используй tools list_files, read_file и write_file. " +
  "Список дел обычно лежит в todo.json; сведения о пользователе могут быть в файлах вроде about-me.txt. " +
  "Отвечай кратко по-русски, без упоминания tools и внутренних деталей.";

const ollamaToolCallSchema = z.object({
  function: z
    .object({
      name: z.string().optional(),
      arguments: z
        .union([z.record(z.string(), z.unknown()), z.string()])
        .optional(),
    })
    .optional(),
});

const ollamaMessageSchema = z.object({
  role: z.string(),
  content: z.string().nullable().optional(),
  tool_calls: z.array(ollamaToolCallSchema).optional(),
});

const ollamaChatResponseSchema = z.object({
  message: ollamaMessageSchema.optional(),
  error: z.string().optional(),
});

type OllamaMessage = z.infer<typeof ollamaMessageSchema>;

async function chatWithOllama(messages: OllamaMessage[]): Promise<OllamaMessage> {
  
  const response = await fetch(OLLAMA_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: process.env.OLLAMA_MODEL,
      messages,
      tools: workdirTools,
      stream: false,
    }),
  });

  const raw: unknown = await response.json();
  const parsed = ollamaChatResponseSchema.safeParse(raw);

  if (!parsed.success) {
    throw new Error("Некорректный ответ Ollama");
  }

  const data = parsed.data;

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
