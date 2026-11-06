import type { ChatUiMessage } from "@entities/chat/model/types";
import { MessageBubble } from "@entities/chat/ui/messageBubble/messageBubble";

import styles from "./messageList.module.scss";

type MessageListProps = {
  messages: ChatUiMessage[];
  emptyText: string;
  error?: string | null;
  loading?: boolean;
};

export function MessageList({
  messages,
  emptyText,
  error = null,
  loading = false,
}: MessageListProps) {
  return (
    <div className={styles.messages}>
      {messages.length === 0 && !error ? (
        <div className={styles.empty}>{emptyText}</div>
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

      {loading ? <div className={styles.loading}>Модель думает…</div> : null}
    </div>
  );
}
