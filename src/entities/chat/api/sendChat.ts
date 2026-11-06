import type { ChatMessage } from "@entities/chat/model/types";

export type SendChatInput = {
  model: string;
  messages: ChatMessage[];
};

export type SendChatResult =
  | { ok: true; reply: string }
  | { ok: false; error: string; network?: boolean };

export async function sendChat(
  input: SendChatInput,
): Promise<SendChatResult> {
  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: input.model,
        messages: input.messages,
      }),
    });

    const data = (await response.json()) as {
      reply?: string;
      error?: string;
    };

    if (!response.ok || !data.reply) {
      return {
        ok: false,
        error: data.error ?? "Не удалось получить ответ",
      };
    }

    return { ok: true, reply: data.reply };
  } catch {
    return {
      ok: false,
      error: "Сеть недоступна или сервер не отвечает",
      network: true,
    };
  }
}
