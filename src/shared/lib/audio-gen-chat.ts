import type { ChatMessage } from "@entities/chat/model/types";
import { generateAudio } from "@shared/lib/tools/audio-gen";

/**
 * Режим чата «только аудио»: последний текст пользователя → generateAudio → Markdown-ссылка.
 */
export async function runAudioGenChat(history: ChatMessage[]): Promise<string> {
  const last = history[history.length - 1];

  if (!last || last.role !== "user") {
    throw new Error("Нужен текст пользователя для генерации аудио");
  }

  const result = await generateAudio(last.content);
  const label = result.prompt.replace(/[[\]]/g, "").slice(0, 80) || "Озвучка";

  return `[${label}](${result.url})`;
}
