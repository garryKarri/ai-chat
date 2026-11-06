"use client";

import { FormEvent, useState } from "react";

import { MESSAGE_LIMIT } from "@entities/chat/model/constants";
import { trimMessages } from "@entities/chat/model/lib/trimMessages";
import type { ChatMessage } from "@entities/chat/model/types";
import { MessageBubble } from "@entities/chat/ui/messageBubble/messageBubble";
import { MODELS } from "@shared/lib/models";

import styles from "./chatPage.module.scss";

type UiMessage = ChatMessage & {
  modelLabel?: string;
};

export function ChatPage() {
  const [modelId, setModelId] = useState(MODELS[0]?.id ?? "");
  const [text, setText] = useState("");
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const selectedModel = MODELS.find((model) => model.id === modelId);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
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
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: modelId,
          messages: nextMessages.map(({ role, content }) => ({ role, content })),
        }),
      });

      const data = (await response.json()) as {
        reply?: string;
        error?: string;
      };

      if (!response.ok || !data.reply) {
        setError(data.error ?? "Не удалось получить ответ");
        setMessages(messages);
        return;
      }

      setMessages(
        trimMessages([
          ...nextMessages,
          {
            role: "assistant",
            content: data.reply,
            modelLabel: selectedModel?.label ?? modelId,
          },
        ]),
      );
    } catch {
      setError("Сеть недоступна или сервер не отвечает");
      setMessages(messages);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <div>
            <h1 className={styles.title}>Чат с выбором модели</h1>
            <p className={styles.subtitle}>
              История до {MESSAGE_LIMIT} сообщений · агент workdir ходит в
              папку workdir через Ollama
            </p>
          </div>

          <label className={styles.modelLabel}>
            <span className={styles.modelLabelText}>Модель</span>
            <select
              className={styles.modelSelect}
              value={modelId}
              onChange={(event) => setModelId(event.target.value)}
              disabled={loading}
            >
              {MODELS.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </header>

      <main className={styles.main}>
        <div className={styles.messages}>
          {messages.length === 0 && !error ? (
            <div className={styles.empty}>
              Выбери модель и напиши сообщение. Для «Агент workdir» нужны
              Ollama и папка workdir; остальные модели идут через Polza
              (история до {MESSAGE_LIMIT} сообщений).
            </div>
          ) : null}

          {messages.map((message, index) => (
            <MessageBubble
              key={`${message.role}-${index}-${message.content.slice(0, 24)}`}
              role={message.role}
              text={message.content}
              modelLabel={message.modelLabel}
            />
          ))}

          {error ? <div className={styles.error}>{error}</div> : null}

          {loading ? (
            <div className={styles.loading}>Модель думает…</div>
          ) : null}
        </div>

        <form onSubmit={onSubmit} className={styles.composer}>
          <div className={styles.composerInner}>
            <textarea
              className={styles.input}
              placeholder="Напиши сообщение…"
              value={text}
              rows={1}
              disabled={loading}
              onChange={(event) => setText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
            />
            <button
              type="submit"
              disabled={loading || !text.trim() || !modelId}
              className={styles.send}
            >
              Отправить
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
