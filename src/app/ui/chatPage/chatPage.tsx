"use client";

import { SubmitEvent, useState } from "react";

import { sendChat } from "@entities/chat/api/sendChat";
import { MESSAGE_LIMIT } from "@entities/chat/model/constants";
import { trimMessages } from "@entities/chat/model/lib/trimMessages";
import type { ChatUiMessage } from "@entities/chat/model/types";
import { ChatRoom } from "@entities/chat/ui/chatRoom/chatRoom";
import { MODELS } from "@shared/lib/models";

export function ChatPage() {
  const [modelId, setModelId] = useState(MODELS[0]?.id ?? "");
  const [text, setText] = useState("");
  const [messages, setMessages] = useState<ChatUiMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const selectedModel = MODELS.find((model) => model.id === modelId);

  async function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmed = text.trim();

    if (!trimmed || !modelId || loading) {
      return;
    }

    const nextMessages = trimMessages([
      ...messages,
      { role: "user" as const, content: trimmed },
    ]);

    setLoading(true);
    setError(null);
    setMessages(nextMessages);
    setText("");

    try {
      const result = await sendChat({
        model: modelId,
        messages: nextMessages.map(({ role, content }) => ({ role, content })),
      });

      if (!result.ok) {
        setError(result.error);
        setMessages(messages);
        return;
      }

      setMessages(
        trimMessages([
          ...nextMessages,
          {
            role: "assistant",
            content: result.reply,
            modelLabel: selectedModel?.label ?? modelId,
          },
        ]),
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <ChatRoom
      title="Чат с выбором модели"
      subtitle={`История до ${MESSAGE_LIMIT} сообщений · workdir через Ollama · картинки через Polza Media`}
      models={MODELS}
      modelId={modelId}
      messages={messages}
      emptyText={`Выбери модель и напиши сообщение. «Агент workdir» — Ollama + workdir; «Генератор изображений» — промпт → картинка; остальные модели — Polza (история до ${MESSAGE_LIMIT} сообщений).`}
      text={text}
      error={error}
      loading={loading}
      onModelChange={setModelId}
      onTextChange={setText}
      onSubmit={onSubmit}
    />
  );
}
