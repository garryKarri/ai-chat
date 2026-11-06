import type { ChatMessage } from "@entities/chat/model/types";
import { generateImage } from "@shared/lib/tools/image-gen";

/**
 * Режим чата «только картинка»: последний промпт пользователя → generateImage → Markdown URL.
 */
export async function runImageGenChat(history: ChatMessage[]): Promise<string> {
  const last = history[history.length - 1];

  if (!last || last.role !== "user") {
    throw new Error("Нужен промпт пользователя для генерации изображения");
  }

  const result = await generateImage(last.content);
  const alt = result.prompt.replace(/[[\]]/g, "");

  return `![${alt}](${result.url})`;
}
