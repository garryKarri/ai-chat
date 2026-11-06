export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type ChatUiMessage = ChatMessage & {
  modelLabel?: string;
};
