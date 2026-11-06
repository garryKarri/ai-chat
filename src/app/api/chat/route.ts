import { NextResponse } from "next/server";

import { MESSAGE_LIMIT } from "@entities/chat/model/constants";
import type { ChatMessage } from "@entities/chat/model/types";
import { isWorkdirAgentModel } from "@shared/lib/models";
import { runWorkdirAgent } from "@shared/lib/workdir-agent";

type ChatRequestBody = {
  model?: unknown;
  messages?: unknown;
};

type PolzaChoice = {
  message?: {
    content?: string | null;
  };
};

type PolzaResponse = {
  choices?: PolzaChoice[];
  error?: {
    message?: string;
  };
};

function parseMessages(value: unknown): ChatMessage[] | null {
  if (!Array.isArray(value) || value.length === 0) {
    return null;
  }

  if (value.length > MESSAGE_LIMIT) {
    return null;
  }

  const messages: ChatMessage[] = [];

  for (const item of value) {
    if (!item || typeof item !== "object") {
      return null;
    }

    const role = (item as { role?: unknown }).role;
    const content = (item as { content?: unknown }).content;

    if (role !== "user" && role !== "assistant") {
      return null;
    }

    if (typeof content !== "string" || !content.trim()) {
      return null;
    }

    messages.push({ role, content: content.trim() });
  }

  if (messages[messages.length - 1]?.role !== "user") {
    return null;
  }

  return messages;
}

async function replyWithPolza(
  model: string,
  messages: ChatMessage[],
  apiKey: string,
): Promise<NextResponse> {
  const polzaResponse = await fetch(
    "https://polza.ai/api/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages,
      }),
    },
  );

  const data = (await polzaResponse.json()) as PolzaResponse;

  if (!polzaResponse.ok) {
    const message =
      data.error?.message ??
      (polzaResponse.status === 401
        ? "Неверный ключ Polza"
        : polzaResponse.status === 402
          ? "Недостаточно средств или лимит ключа"
          : polzaResponse.status === 502 || polzaResponse.status === 503
            ? "Модель сейчас недоступна, попробуй другую"
            : `Ошибка Polza (${polzaResponse.status})`);

    return NextResponse.json(
      { error: message },
      { status: polzaResponse.status },
    );
  }

  const reply = data.choices?.[0]?.message?.content?.trim();

  if (!reply) {
    return NextResponse.json(
      { error: "Модель вернула пустой ответ" },
      { status: 502 },
    );
  }

  return NextResponse.json({ reply });
}

export async function POST(request: Request) {
  let body: ChatRequestBody;

  try {
    body = (await request.json()) as ChatRequestBody;
  } catch {
    return NextResponse.json({ error: "Некорректный JSON" }, { status: 400 });
  }

  const model = typeof body.model === "string" ? body.model.trim() : "";
  const messages = parseMessages(body.messages);

  if (!model) {
    return NextResponse.json({ error: "Выбери модель" }, { status: 400 });
  }

  if (!messages) {
    return NextResponse.json(
      {
        error: `Нужен массив messages (1–${MESSAGE_LIMIT}), последнее — от пользователя`,
      },
      { status: 400 },
    );
  }

  if (isWorkdirAgentModel(model)) {
    try {
      const reply = await runWorkdirAgent(messages);
      return NextResponse.json({ reply });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Ошибка агента workdir";
      const offline =
        message.includes("fetch") ||
        message.includes("ECONNREFUSED") ||
        message.includes("Failed to fetch");

      return NextResponse.json(
        {
          error: offline
            ? "Не удалось подключиться к Ollama. Запусти ollama serve и нужную модель (по умолчанию qwen3.5:4b)."
            : message,
        },
        { status: 502 },
      );
    }
  }

  const apiKey = process.env.POLZA_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: "Нет POLZA_API_KEY в .env.local" },
      { status: 500 },
    );
  }

  return replyWithPolza(model, messages, apiKey);
}
