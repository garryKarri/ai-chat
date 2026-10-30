/**
 * Сценарий: модель llama3.2 через Ollama вызывает tool list_files
 * и получает список файлов в корне workdir.
 *
 * Запуск: node scripts/list-workdir.mjs
 * Нужны: ollama serve + ollama pull llama3.2
 */

import { readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const WORKDIR = path.join(ROOT, "workdir");
const OLLAMA_URL = "http://127.0.0.1:11434/api/chat";
const MODEL = "llama3.2";

const listFilesTool = {
  type: "function",
  function: {
    name: "list_files",
    description:
      "Возвращает список файлов и папок в выбранной директории внутри workdir. " +
      "Путь относительный: '.' или пустая строка — корень workdir.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description:
            "Относительный путь внутри workdir (например '.' или 'docs')",
        },
      },
    },
  },
};

async function listFiles(relativePath = ".") {
  const target = path.resolve(WORKDIR, relativePath || ".");
  const relative = path.relative(WORKDIR, target);

  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Путь должен быть внутри workdir");
  }

  const entries = await readdir(target, { withFileTypes: true });

  return entries
    .map((entry) => ({
      name: entry.name,
      type: entry.isDirectory() ? "directory" : "file",
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function runListFilesTool(args) {
  const parsed = typeof args === "string" ? JSON.parse(args || "{}") : args;

  try {
    const files = await listFiles(parsed.path ?? ".");
    return JSON.stringify({ path: parsed.path ?? ".", files });
  } catch (error) {
    return JSON.stringify({
      error: error instanceof Error ? error.message : "Неизвестная ошибка",
    });
  }
}

async function chat(messages) {
  const response = await fetch(OLLAMA_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      messages,
      tools: [listFilesTool],
      stream: false,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error ?? `Ошибка Ollama (${response.status})`);
  }

  return data.message;
}

async function main() {
  const messages = [
    {
      role: "user",
      content:
        "С помощью инструмента list_files получи список файлов в корне workdir " +
        "(path: '.') и кратко перечисли, что там есть.",
    },
  ];

  console.log("→ запрос к модели…");
  let message = await chat(messages);
  let rounds = 0;

  while (message.tool_calls?.length && rounds < 5) {
    rounds += 1;
    messages.push({
      role: "assistant",
      content: message.content ?? "",
      tool_calls: message.tool_calls,
    });

    for (const call of message.tool_calls) {
      const name = call.function?.name;
      const args = call.function?.arguments ?? {};
      console.log(`→ tool ${name}`, args);

      const content =
        name === "list_files"
          ? await runListFilesTool(args)
          : JSON.stringify({ error: `Неизвестный tool: ${name}` });

      console.log("← результат:", content);
      messages.push({ role: "tool", content });
    }

    message = await chat(messages);
  }

  console.log("\nОтвет модели:\n");
  console.log(message.content?.trim() || "(пустой ответ)");
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exit(1);
});
