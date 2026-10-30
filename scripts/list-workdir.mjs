/**
 * Сценарий: модель llama3.2 через Ollama вызывает tools list_files,
 * read_file, write_file для работы с файлами внутри workdir.
 *
 * Запуск: node scripts/list-workdir.mjs
 * Нужны: ollama serve + ollama pull llama3.2
 */

import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const WORKDIR = path.join(ROOT, "workdir");
const OLLAMA_URL = "http://127.0.0.1:11434/api/chat";
const MODEL = "qwen3.5:4b";

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

const readFileTool = {
  type: "function",
  function: {
    name: "read_file",
    description:
      "Читает текстовый файл внутри workdir и возвращает его содержимое.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Относительный путь к файлу, например 'notes.txt'",
        },
      },
      required: ["path"],
    },
  },
};

const writeFileTool = {
  type: "function",
  function: {
    name: "write_file",
    description:
      "Записывает текст в файл внутри workdir (создаёт или перезаписывает).",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Относительный путь к файлу, например 'notes.txt'",
        },
        content: {
          type: "string",
          description: "Полное новое содержимое файла",
        },
      },
      required: ["path", "content"],
    },
  },
};

const TOOLS = [listFilesTool, readFileTool, writeFileTool];

function resolveInWorkdir(relativePath = ".") {
  const target = path.resolve(WORKDIR, relativePath || ".");
  const relative = path.relative(WORKDIR, target);

  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Путь должен быть внутри workdir");
  }

  return target;
}

async function listFiles(relativePath = ".") {
  const target = resolveInWorkdir(relativePath);
  const entries = await readdir(target, { withFileTypes: true });

  return entries
    .map((entry) => ({
      name: entry.name,
      type: entry.isDirectory() ? "directory" : "file",
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function readWorkdirFile(relativePath) {
  if (!relativePath?.trim()) {
    throw new Error("Нужен относительный путь к файлу");
  }
  const target = resolveInWorkdir(relativePath);
  return readFile(target, "utf8");
}

async function writeWorkdirFile(relativePath, content) {
  if (!relativePath?.trim()) {
    throw new Error("Нужен относительный путь к файлу");
  }
  const target = resolveInWorkdir(relativePath);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, content, "utf8");
}

function parseArgs(args) {
  return typeof args === "string" ? JSON.parse(args || "{}") : args;
}

async function runListFilesTool(args) {
  try {
    const parsed = parseArgs(args);
    const files = await listFiles(parsed.path ?? ".");
    return JSON.stringify({ path: parsed.path ?? ".", files });
  } catch (error) {
    return JSON.stringify({
      error: error instanceof Error ? error.message : "Неизвестная ошибка",
    });
  }
}

async function runReadFileTool(args) {
  try {
    const parsed = parseArgs(args);
    const content = await readWorkdirFile(parsed.path ?? "");
    return JSON.stringify({ path: parsed.path, content });
  } catch (error) {
    return JSON.stringify({
      error: error instanceof Error ? error.message : "Неизвестная ошибка",
    });
  }
}

async function runWriteFileTool(args) {
  try {
    const parsed = parseArgs(args);
    if (parsed.content === undefined) {
      throw new Error("Нужен параметр content");
    }
    await writeWorkdirFile(parsed.path ?? "", parsed.content);
    return JSON.stringify({
      path: parsed.path,
      ok: true,
      bytes: Buffer.byteLength(parsed.content, "utf8"),
    });
  } catch (error) {
    return JSON.stringify({
      error: error instanceof Error ? error.message : "Неизвестная ошибка",
    });
  }
}

async function runTool(name, args) {
  switch (name) {
    case "list_files":
      return runListFilesTool(args);
    case "read_file":
      return runReadFileTool(args);
    case "write_file":
      return runWriteFileTool(args);
    default:
      return JSON.stringify({ error: `Неизвестный tool: ${name}` });
  }
}

async function chat(messages) {
  const response = await fetch(OLLAMA_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      messages,
      tools: TOOLS,
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
        // "С помощью инструмента list_files получи список файлов в корне workdir " +
        // "(path: '.') и кратко перечисли, что там есть.",
        // "Зампмши в файл hello.txt привет, мир!",
        // `Добавь в todo лист задачу: погулять с котом.`
        `как меня зовут? Посмотри в файлах`
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

      const content = await runTool(name, args);

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
