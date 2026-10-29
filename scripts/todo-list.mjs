/**
 * Todo-лист: скрипт-имитация приложения с агентом (ДЗ).
 * Сейчас — шаги 1–11: … + системный промпт и пользовательский ввод.
 *
 * Формат workdir/todo.json — массив задач:
 *   [ { "id": 1, "text": "купить молоко", "done": false }, ... ]
 *
 * Запуск:
 *   node scripts/todo-list.mjs
 *   node scripts/todo-list.mjs "добавь задачу: купить хлеб"
 *   node scripts/todo-list.mjs "покажи список задач"
 *
 * Нужны: ollama serve + ollama pull llama3.2
 */

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url)); // абсолютный путь к папке scripts
// __dirname = '/home/igor/Desktop/Edu/AI Engineer/ai_chat/scripts'
const ROOT = path.join(__dirname, ".."); // убирает последний сегмент, то есть делает строку путём на уровень выше
// ROOT = '/home/igor/Desktop/Edu/AI Engineer/ai_chat'
const WORKDIR = path.join(ROOT, "workdir"); // Добавляет новый сегмент к строке - папку workdir
// WORKDIR = '/home/igor/Desktop/Edu/AI Engineer/ai_chat/workdir'
const TODO_FILE = path.join(WORKDIR, "todo.json"); // Добавляет к строке пути название файла
// TODO_FILE = '/home/igor/Desktop/Edu/AI Engineer/ai_chat/workdir/todo.json'

const OLLAMA_URL = "http://127.0.0.1:11434/api/chat";
const MODEL = "llama3.2";
const MAX_ROUNDS = 8;

/** Шаг 11. Скрытая затравка для модели — пользователь её не видит. */
const SYSTEM_PROMPT =
  "Ты помощник по списку дел. Задачи хранятся в файле todo.json. " +
  "Для работы со списком используй только tools: list_todos, add_todo, " +
  "rename_todo, complete_todo, delete_todo. " +
  "Отвечай пользователю кратко и по делу, без упоминания tools и внутренних деталей.";

/**
 * Шаг 2. Чтение todo-файла.
 * Путь известен: workdir/todo.json.
 * Нет файла → пустой список []. Файл на этом шаге не создаём.
 */
async function readTodos() {
  try {
    const raw = await readFile(TODO_FILE, "utf8");
    const data = JSON.parse(raw);

    if (!Array.isArray(data)) throw new Error("todo.json должен содержать массив задач");
  
    return data;

  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") 
      return [];
    
    throw error;
  }
}

/**
 * Шаг 3. Запись todo-файла.
 * Принимает массив задач из памяти → JSON-текст → writeFile на диск.
 * Если файла не было — он появится. Не «добавить задачу», а сохранить весь список.
 */
async function writeTodos(todos) {
  if (!Array.isArray(todos)) {
    throw new Error("writeTodos ожидает массив задач");
  }

  const raw = JSON.stringify(todos, null, 2);
  await writeFile(TODO_FILE, raw, "utf8");
}

/**
 * Шаг 4. Добавить задачу.
 * Прочитать список → дописать задачу в массив → записать файл обратно.
 */
async function addTodo(text) {
  const trimmed = String(text ?? "").trim();

  if (!trimmed) throw new Error("Текст задачи не должен быть пустым");
  

  const todos = await readTodos();

  const nextId =
    todos.reduce((max, todo) => Math.max(max, Number(todo.id) || 0), 0) + 1;

  const task = { id: nextId, text: trimmed, done: false };
  todos.push(task);
  await writeTodos(todos);

  return task;
}

/**
 * Шаг 5. Показать список задач.
 * Читает файл и возвращает понятный текст. Диск не меняет.
 */
async function listTodos() {
  const todos = await readTodos();

  if (todos.length === 0) return "Список задач пуст.";

  return todos
    .map((todo) => {
      const mark = todo.done ? "[x]" : "[ ]";
      return `${todo.id}. ${mark} ${todo.text}`;
    })
    .join("\n");
}

/** Найти задачу в массиве по id (число) или по точному тексту. */
function findTodo(todos, idOrText) {
  const asNumber = Number(idOrText);

  if (Number.isInteger(asNumber) && asNumber > 0) {
    return todos.find((todo) => todo.id === asNumber) ?? null;
  }

  const needle = String(idOrText ?? "").trim().toLowerCase();
  if (!needle) return null;

  return (
    todos.find((todo) => String(todo.text).toLowerCase() === needle) ?? null
  );
}

/**
 * Шаг 6. Переименовать задачу.
 * Прочитать → найти по id или по тексту → сменить text → записать.
 */
async function renameTodo(idOrText, newText) {
  const trimmed = String(newText ?? "").trim();

  if (!trimmed) throw new Error("Новый текст задачи не должен быть пустым");

  const todos = await readTodos();
  const todo = findTodo(todos, idOrText);

  if (!todo) throw new Error(`Задача не найдена: ${idOrText}`);

  todo.text = trimmed;
  await writeTodos(todos);

  return todo;
}

/**
 * Шаг 7. Отметить задачу выполненной.
 * Прочитать → найти → done: true → записать.
 */
async function completeTodo(idOrText) {
  const todos = await readTodos();
  const todo = findTodo(todos, idOrText);

  if (!todo) throw new Error(`Задача не найдена: ${idOrText}`);

  todo.done = true;
  await writeTodos(todos);

  return todo;
}

/**
 * Шаг 8. Удалить задачу.
 * Прочитать → найти → убрать из массива → записать.
 */
async function deleteTodo(idOrText) {
  const todos = await readTodos();
  const todo = findTodo(todos, idOrText);

  if (!todo) throw new Error(`Задача не найдена: ${idOrText}`);

  const updatedTodos = todos.filter((item) => item.id !== todo.id);
  await writeTodos(updatedTodos);

  return todo;
}

/**
 * Шаг 9. Tools для модели: JSON-описания + словарь имя → наша функция.
 * Модель видит только описания; код выполняет реальные функции.
 */
const listTodosTool = {
  type: "function",
  function: {
    name: "list_todos",
    description: "Показывает список задач из todo.json в читаемом виде.",
    parameters: { type: "object", properties: {} },
  },
};

const addTodoTool = {
  type: "function",
  function: {
    name: "add_todo",
    description: "Добавляет новую задачу в todo.json.",
    parameters: {
      type: "object",
      properties: {
        text: {
          type: "string",
          description: "Текст новой задачи",
        },
      },
      required: ["text"],
    },
  },
};

const renameTodoTool = {
  type: "function",
  function: {
    name: "rename_todo",
    description:
      "Переименовывает задачу. Можно указать id (число) или точный текущий текст.",
    parameters: {
      type: "object",
      properties: {
        id_or_text: {
          type: "string",
          description: "Id задачи или её текущий текст",
        },
        new_text: {
          type: "string",
          description: "Новый текст задачи",
        },
      },
      required: ["id_or_text", "new_text"],
    },
  },
};

const completeTodoTool = {
  type: "function",
  function: {
    name: "complete_todo",
    description:
      "Отмечает задачу выполненной. Можно указать id или точный текст.",
    parameters: {
      type: "object",
      properties: {
        id_or_text: {
          type: "string",
          description: "Id задачи или её текст",
        },
      },
      required: ["id_or_text"],
    },
  },
};

const deleteTodoTool = {
  type: "function",
  function: {
    name: "delete_todo",
    description: "Удаляет задачу. Можно указать id или точный текст.",
    parameters: {
      type: "object",
      properties: {
        id_or_text: {
          type: "string",
          description: "Id задачи или её текст",
        },
      },
      required: ["id_or_text"],
    },
  },
};

const TOOLS = [
  listTodosTool,
  addTodoTool,
  renameTodoTool,
  completeTodoTool,
  deleteTodoTool,
];

/** Словарь: имя tool → вызов нашей функции. Как обсуждали на уроке. */
const toolHandlers = {
  list_todos: async () => ({ list: await listTodos() }),
  add_todo: async ({ text }) => ({ task: await addTodo(text) }),
  rename_todo: async ({ id_or_text, new_text }) => ({
    task: await renameTodo(id_or_text, new_text),
  }),
  complete_todo: async ({ id_or_text }) => ({
    task: await completeTodo(id_or_text),
  }),
  delete_todo: async ({ id_or_text }) => ({
    task: await deleteTodo(id_or_text),
  }),
};

async function runTool(name, args) {
  const parsed = typeof args === "string" ? JSON.parse(args || "{}") : args ?? {};
  const handler = toolHandlers[name];

  if (!handler) {
    return JSON.stringify({ error: `Неизвестный tool: ${name}` });
  }

  try {
    const result = await handler(parsed);
    return JSON.stringify(result);
  } catch (error) {
    return JSON.stringify({
      error: error instanceof Error ? error.message : "Неизвестная ошибка",
    });
  }
}

/**
 * Шаг 10. Запрос к Ollama: messages + tools.
 * Ответ — message (content и/или tool_calls).
 */
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
  // Шаг 11. Инпут = аргументы запуска (имитация поля ввода в приложении)
  const userInput =
    process.argv.slice(2).join(" ").trim() || "Покажи мой список задач.";

  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: userInput },
  ];

  console.log("Инпут:", userInput);
  console.log("→ запрос к модели…");
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
