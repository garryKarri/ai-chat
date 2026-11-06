import { SubmitEvent } from "react";

import type { ChatUiMessage } from "@entities/chat/model/types";
import { ChatInput } from "@entities/chat/ui/chatInput/chatInput";
import { ChatRoomHeader } from "@entities/chat/ui/chatRoomHeader/chatRoomHeader";
import { MessageList } from "@entities/chat/ui/messageList/messageList";
import type { ChatModel } from "@shared/lib/models";

import styles from "./chatRoom.module.scss";

type ChatRoomProps = {
  title: string;
  subtitle: string;
  models: ChatModel[];
  modelId: string;
  messages: ChatUiMessage[];
  emptyText: string;
  text: string;
  error?: string | null;
  loading?: boolean;
  onModelChange: (modelId: string) => void;
  onTextChange: (value: string) => void;
  onSubmit: (event: SubmitEvent<HTMLFormElement>) => void;
};

export function ChatRoom({
  title,
  subtitle,
  models,
  modelId,
  messages,
  emptyText,
  text,
  error = null,
  loading = false,
  onModelChange,
  onTextChange,
  onSubmit,
}: ChatRoomProps) {
  return (
    <div className={styles.root}>
      <ChatRoomHeader
        title={title}
        subtitle={subtitle}
        models={models}
        modelId={modelId}
        disabled={loading}
        onModelChange={onModelChange}
      />

      <main className={styles.main}>
        <MessageList
          messages={messages}
          emptyText={emptyText}
          error={error}
          loading={loading}
        />

        <ChatInput
          value={text}
          disabled={loading}
          submitDisabled={loading || !text.trim() || !modelId}
          onChange={onTextChange}
          onSubmit={onSubmit}
        />
      </main>
    </div>
  );
}
