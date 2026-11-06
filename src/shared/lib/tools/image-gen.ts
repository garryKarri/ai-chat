import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

/**
 * Тул генерации картинки
 *
 * Контракт:
 * - на вход: текстовый промпт
 * - на выход: конечный URL (локальный /img/generated/… или stub)
 * - бинарник через LLM не гоняем
 *
 * По умолчанию: Polza Media API (Nano Banana).
 * IMAGE_GEN_MODE=stub — заглушка без сети.
 */

export type GenerateImageResult = {
  url: string;
  prompt: string;
  source: "stub" | "polza" | "file";
  model?: string;
  remoteUrl?: string;
};

const PUBLIC_IMG_DIR = path.join(process.cwd(), "public", "img");
const GENERATED_DIR = path.join(PUBLIC_IMG_DIR, "generated");
const STUB_PUBLIC_PATH = "/img/stub.png";

const POLZA_MEDIA_URL = "https://polza.ai/api/v1/media";
const DEFAULT_IMAGE_MODEL = "google/gemini-2.5-flash-image";
const POLL_INTERVAL_MS = 3000;
const POLL_MAX_ATTEMPTS = 40;

type PolzaMediaData = {
  url?: string;
  urls?: string[];
  b64_json?: string;
};

type PolzaMediaResponse = {
  id?: string;
  status?: "pending" | "processing" | "completed" | "failed" | string;
  model?: string;
  data?: PolzaMediaData | PolzaMediaData[];
  error?: { message?: string } | string;
  message?: string;
};

function publicBaseUrl(): string {
  const fromEnv = process.env.APP_URL?.trim().replace(/\/$/, "");
  return fromEnv || "http://localhost:3000";
}

function absolutePublicUrl(publicPath: string): string {
  const normalized = publicPath.startsWith("/") ? publicPath : `/${publicPath}`;
  return `${publicBaseUrl()}${normalized}`;
}

function imageModel(): string {
  return process.env.POLZA_IMAGE_MODEL?.trim() || DEFAULT_IMAGE_MODEL;
}

function imageGenMode(): "stub" | "polza" {
  const mode = process.env.IMAGE_GEN_MODE?.trim().toLowerCase();
  if (mode === "stub") {
    return "stub";
  }
  return "polza";
}

function polzaApiKey(): string {
  const key = process.env.POLZA_API_KEY?.trim();
  if (!key) {
    throw new Error("Нет POLZA_API_KEY в .env.local");
  }
  return key;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function errorMessage(data: PolzaMediaResponse, status: number): string {
  if (typeof data.error === "string" && data.error.trim()) {
    return data.error;
  }
  if (data.error && typeof data.error === "object" && data.error.message) {
    return data.error.message;
  }
  if (data.message?.trim()) {
    return data.message;
  }
  if (status === 401) {
    return "Неверный ключ Polza";
  }
  if (status === 402) {
    return "Недостаточно средств или лимит ключа Polza";
  }
  if (status === 502 || status === 503) {
    return "Модель картинок сейчас недоступна";
  }
  return `Ошибка Polza Media (${status})`;
}

function extractRemoteUrl(data: PolzaMediaResponse): string | null {
  const payload = data.data;
  if (!payload) {
    return null;
  }

  if (Array.isArray(payload)) {
    const first = payload[0];
    return first?.url ?? first?.urls?.[0] ?? null;
  }

  return payload.url ?? payload.urls?.[0] ?? null;
}

async function polzaGetMedia(
  id: string,
  apiKey: string,
): Promise<PolzaMediaResponse> {
  const response = await fetch(`${POLZA_MEDIA_URL}/${id}`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });
  const data = (await response.json()) as PolzaMediaResponse;
  if (!response.ok) {
    throw new Error(errorMessage(data, response.status));
  }
  return data;
}

async function waitForPolzaMedia(
  initial: PolzaMediaResponse,
  apiKey: string,
): Promise<PolzaMediaResponse> {
  let current = initial;

  for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt += 1) {
    const status = current.status ?? "completed";

    if (status === "completed" || extractRemoteUrl(current)) {
      return current;
    }

    if (status === "failed") {
      throw new Error(errorMessage(current, 502));
    }

    if (!current.id) {
      throw new Error("Polza вернула генерацию без id для polling");
    }

    await sleep(POLL_INTERVAL_MS);
    current = await polzaGetMedia(current.id, apiKey);
  }

  throw new Error("Таймаут ожидания картинки от Polza");
}

async function createPolzaMedia(
  prompt: string,
  apiKey: string,
  model: string,
): Promise<PolzaMediaResponse> {
  const response = await fetch(POLZA_MEDIA_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      input: {
        prompt,
        aspect_ratio: "1:1",
        output_format: "png",
      },
      // false — попробовать синхронно; при долгой генерации Polza может вернуть pending
      async: false,
    }),
  });

  const data = (await response.json()) as PolzaMediaResponse;

  if (!response.ok) {
    throw new Error(errorMessage(data, response.status));
  }

  return data;
}

function extensionFromUrlOrType(url: string, contentType: string | null): "png" | "jpg" | "webp" {
  const lower = `${url} ${contentType ?? ""}`.toLowerCase();
  if (lower.includes("webp")) {
    return "webp";
  }
  if (lower.includes("jpeg") || lower.includes("jpg")) {
    return "jpg";
  }
  return "png";
}

/**
 * Сохраняет байты в public/img/generated и возвращает URL на нашем сайте.
 */
export async function saveGeneratedImage(
  bytes: Uint8Array,
  options?: { extension?: "png" | "jpg" | "webp"; prompt?: string },
): Promise<GenerateImageResult> {
  const extension = options?.extension ?? "png";
  await mkdir(GENERATED_DIR, { recursive: true });
  const filename = `${randomUUID()}.${extension}`;
  await writeFile(path.join(GENERATED_DIR, filename), bytes);
  const publicPath = `/img/generated/${filename}`;
  return {
    url: absolutePublicUrl(publicPath),
    prompt: options?.prompt?.trim() ?? "",
    source: "file",
  };
}

async function downloadToPublic(
  remoteUrl: string,
  prompt: string,
  model: string,
): Promise<GenerateImageResult> {
  const response = await fetch(remoteUrl);
  if (!response.ok) {
    throw new Error(`Не удалось скачать картинку (${response.status})`);
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  const extension = extensionFromUrlOrType(
    remoteUrl,
    response.headers.get("content-type"),
  );
  const saved = await saveGeneratedImage(bytes, { extension, prompt });

  return {
    ...saved,
    source: "polza",
    model,
    remoteUrl,
  };
}

async function generateViaPolza(prompt: string): Promise<GenerateImageResult> {
  const apiKey = polzaApiKey();
  const model = imageModel();
  const created = await createPolzaMedia(prompt, apiKey, model);
  const finished = await waitForPolzaMedia(created, apiKey);
  const remoteUrl = extractRemoteUrl(finished);

  if (!remoteUrl) {
    throw new Error("Polza завершила генерацию без URL картинки");
  }

  // Как на уроке: байты кладём в public, наружу отдаём наш конечный адрес.
  return downloadToPublic(remoteUrl, prompt, finished.model ?? model);
}

/**
 * Async-функция «промпт → изображение» (URL).
 */
export async function generateImage(prompt: string): Promise<GenerateImageResult> {
  const trimmed = prompt.trim();
  if (!trimmed) {
    throw new Error("Нужен непустой промпт для генерации изображения");
  }

  if (imageGenMode() === "stub") {
    return {
      url: absolutePublicUrl(STUB_PUBLIC_PATH),
      prompt: trimmed,
      source: "stub",
    };
  }

  return generateViaPolza(trimmed);
}

/** Описание tool для будущего подключения к агенту (Ollama tools). */
export const generateImageTool = {
  type: "function" as const,
  function: {
    name: "generate_image",
    description:
      "Создаёт изображение по текстовому промпту через Polza и возвращает URL картинки. " +
      "В ответе пользователю используй этот URL (например в Markdown ![..](url)), " +
      "не пытайся пересказывать пиксели.",
    parameters: {
      type: "object",
      properties: {
        prompt: {
          type: "string",
          description: "Текстовое описание желаемой картинки",
        },
      },
      required: ["prompt"],
    },
  },
};

export async function runGenerateImageTool(
  args: { prompt?: string } | string,
): Promise<string> {
  try {
    const parsed =
      typeof args === "string"
        ? (JSON.parse(args || "{}") as { prompt?: string })
        : args;
    const result = await generateImage(parsed.prompt ?? "");
    return JSON.stringify(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Неизвестная ошибка";
    return JSON.stringify({ error: message });
  }
}
