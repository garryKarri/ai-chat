import { NextResponse } from "next/server";

const OLLAMA_URL = "http://127.0.0.1:11434/api/chat";
const MODEL = "llama3.2";
const PROMPT = "различают ли кошки цвета как люди?";

type OllamaChatResponse = {
  message?: {
    content?: string;
  };
  error?: string;
};

export async function GET() {
  try {
    const ollamaResponse = await fetch(OLLAMA_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: "user", content: PROMPT }],
        stream: false,
      }),
    });

    const data = (await ollamaResponse.json()) as OllamaChatResponse;

    if (!ollamaResponse.ok) {
      return NextResponse.json(
        {
          error: data.error ?? `Ошибка Ollama (${ollamaResponse.status})`,
        },
        { status: ollamaResponse.status },
      );
    }

    const reply = data.message?.content?.trim();

    if (!reply) {
      return NextResponse.json(
        { error: "Модель вернула пустой ответ" },
        { status: 502 },
      );
    }

    return NextResponse.json({
      model: MODEL,
      prompt: PROMPT,
      reply,
    });
  } catch {
    return NextResponse.json(
      {
        error:
          "Не удалось подключиться к Ollama. Убедись, что сервер запущен на localhost:11434",
      },
      { status: 502 },
    );
  }
}
