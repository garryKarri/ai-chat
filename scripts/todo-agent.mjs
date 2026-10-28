/**
 * Todo через файловую систему (ДЗ урока 3).
 *
 * Модель Ollama (llama3.2) управляет задачами в workdir/todo.json
 * через tools: list_files, read_file, write_file.
 *
 * Запуск:
 *   node scripts/todo-agent.mjs
 *   node scripts/todo-agent.mjs "добавь задачу: купить молоко"
 *   node scripts/todo-agent.mjs "покажи список задач"
 *   node scripts/todo-agent.mjs "отметь выполненным купить молоко"
 *
 * Нужны: ollama serve + ollama pull llama3.2
 */

import { mkdir, readdir, readFile, writeFile, access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { constants as fsConstants } from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const WORKDIR = path.join(ROOT, "workdir");
const TODO_PATH = "todo.json";
const OLLAMA_URL = "http://127.0.0.1:11434/api/chat";
const MODEL = "llama3.2";
const MAX_ROUNDS = 8;

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
      "Читает текстовый файл внутри workdir. Для задач используй todo.json.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Относительный путь к файлу, например 'todo.json'",
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
      "Записывает текст в файл внутри workdir (создаёт или перезаписывает). " +
      "Для задач пиши весь валидный JSON-массив в todo.json.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Относительный путь к файлу, например 'todo.json'",
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
  return readFile(resolveInWorkdir(relativePath), "utf8");
}

async function writeWorkdirFile(relativePath, content) {
  if (!relativePath?.trim()) {
    throw new Error("Нужен относительный путь к файлу");
  }
  if (content === undefined) {
    throw new Error("Нужен параметр content");
  }
  const target = resolveInWorkdir(relativePath);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, content, "utf8");
}

function parseArgs(args) {
  return typeof args === "string" ? JSON.parse(args || "{}") : args ?? {};
}

async function runTool(name, args) {
  try {
    const parsed = parseArgs(args);

    if (name === "list_files") {
      const files = await listFiles(parsed.path ?? ".");
      return JSON.stringify({ path: parsed.path ?? ".", files });
    }

    if (name === "read_file") {
      const content = await readWorkdirFile(parsed.path ?? "");
      return JSON.stringify({ path: parsed.path, content });
    }

    if (name === "write_file") {
      await writeWorkdirFile(parsed.path ?? "", parsed.content);
      return JSON.stringify({
        path: parsed.path,
        ok: true,
        bytes: Buffer.byteLength(String(parsed.content), "utf8"),
      });
    }

    return JSON.stringify({ error: `Неизвестный tool: ${name}` });
  } catch (error) {
    return JSON.stringify({
      error: error instanceof Error ? error.message : "Неизвестная ошибка",
    });
  }
}

async function ensureTodoFile() {
  await mkdir(WORKDIR, { recursive: true });
  const full = resolveInWorkdir(TODO_PATH);
  try {
    await access(full, fsConstants.F_OK);
  } catch {
    await writeFile(full, "[]\n", "utf8");
    console.log(`→ создан ${TODO_PATH}`);
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

const SYSTEM = [
  "Ты помощник по списку задач.",
  "Все задачи хранятся только в файле workdir/todo.json через инструменты.",
  "Формат todo.json — JSON-массив объектов:",
  '[{"id":"1","title":"текст задачи","done":false}]',
  "Правила:",
  "- Перед изменением всегда читай todo.json через read_file.",
  "- После изменения всегда пиши весь массив обратно через write_file.",
  "- id — строка; новые id увеличивай (1, 2, 3…).",
  "- Для списка задач: прочитай файл и кратко перечисли.",
  "- Для добавления: добавь объект с done:false.",
  "- Для выполнения: поставь done:true у нужной задачи.",
  "- Для удаления: убери объект из массива.",
  "- Не выдумывай содержимое файла — только то, что вернули tools.",
  "- В конце ответь пользователю коротко по-русски.",
].join("\n");

async function main() {
  const userText =
    process.argv.slice(2).join(" ").trim() ||
    "Покажи текущий список задач. Если файла ещё нет — создай пустой todo.json.";

  await ensureTodoFile();

  const messages = [
    { role: "system", content: SYSTEM },
    { role: "user", content: userText },
  ];

  console.log("→ запрос:", userText);
  let message = await chat(messages);
  let rounds = 0;

  while (message.tool_calls?.length && rounds < MAX_ROUNDS) {
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

      messages.push({
        role: "tool",
        tool_name: name,
        content,
      });
    }

    message = await chat(messages);
  }

  console.log("\nОтвет модели:\n");
  console.log(message.content?.trim() || "(пустой ответ)");

  try {
    const raw = await readWorkdirFile(TODO_PATH);
    console.log("\nСодержимое todo.json:");
    console.log(raw.trim());
  } catch {
    console.log("\n(todo.json пока нет)");
  }
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exit(1);
});
