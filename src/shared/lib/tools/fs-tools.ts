import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export const WORKDIR = path.join(process.cwd(), "workdir");

export type ListFilesEntry = {
  name: string;
  type: "file" | "directory";
};

/** Резолв пути внутри workdir с guard против выхода наружу. */
export function resolveInWorkdir(relativePath: string = "."): string {
  const target = path.resolve(WORKDIR, relativePath || ".");
  const relative = path.relative(WORKDIR, target);

  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Путь должен быть внутри workdir");
  }

  return target;
}

export async function listFiles(
  relativePath: string = ".",
): Promise<ListFilesEntry[]> {
  const target = resolveInWorkdir(relativePath);
  const entries = await readdir(target, { withFileTypes: true });

  return entries
    .map((entry) => ({
      name: entry.name,
      type: entry.isDirectory() ? ("directory" as const) : ("file" as const),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function readWorkdirFile(relativePath: string): Promise<string> {
  if (!relativePath?.trim()) {
    throw new Error("Нужен относительный путь к файлу");
  }
  const target = resolveInWorkdir(relativePath);
  return readFile(target, "utf8");
}

export async function writeWorkdirFile(
  relativePath: string,
  content: string,
): Promise<void> {
  if (!relativePath?.trim()) {
    throw new Error("Нужен относительный путь к файлу");
  }
  const target = resolveInWorkdir(relativePath);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, content, "utf8");
}

export const listFilesTool = {
  type: "function" as const,
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

export const readFileTool = {
  type: "function" as const,
  function: {
    name: "read_file",
    description:
      "Читает текстовый файл внутри workdir и возвращает его содержимое. " +
      "Для задач используй файл todo.json.",
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

export const writeFileTool = {
  type: "function" as const,
  function: {
    name: "write_file",
    description:
      "Записывает текст в файл внутри workdir (создаёт или перезаписывает). " +
      "Для задач пиши валидный JSON в todo.json.",
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

export const workdirTools = [listFilesTool, readFileTool, writeFileTool];

function parseArgs<T extends Record<string, unknown>>(
  args: T | string,
): T {
  return typeof args === "string"
    ? (JSON.parse(args || "{}") as T)
    : args;
}

export async function runListFilesTool(
  args: { path?: string } | string,
): Promise<string> {
  try {
    const parsed = parseArgs<{ path?: string }>(args);
    const files = await listFiles(parsed.path ?? ".");
    return JSON.stringify({ path: parsed.path ?? ".", files });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Неизвестная ошибка";
    return JSON.stringify({ error: message });
  }
}

export async function runReadFileTool(
  args: { path?: string } | string,
): Promise<string> {
  try {
    const parsed = parseArgs<{ path?: string }>(args);
    const content = await readWorkdirFile(parsed.path ?? "");
    return JSON.stringify({ path: parsed.path, content });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Неизвестная ошибка";
    return JSON.stringify({ error: message });
  }
}

export async function runWriteFileTool(
  args: { path?: string; content?: string } | string,
): Promise<string> {
  try {
    const parsed = parseArgs<{ path?: string; content?: string }>(args);
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
    const message = error instanceof Error ? error.message : "Неизвестная ошибка";
    return JSON.stringify({ error: message });
  }
}

export async function runWorkdirTool(
  name: string,
  args: Record<string, unknown> | string,
): Promise<string> {
  switch (name) {
    case "list_files":
      return runListFilesTool(args as { path?: string } | string);
    case "read_file":
      return runReadFileTool(args as { path?: string } | string);
    case "write_file":
      return runWriteFileTool(
        args as { path?: string; content?: string } | string,
      );
    default:
      return JSON.stringify({ error: `Неизвестный tool: ${name}` });
  }
}
