import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

/**
 * Тул генерации аудио (TTS)
 *
 * Контракт:
 * - на вход: текстовый промпт
 * - на выход: конечный URL (локальный /audio/generated/… или stub)
 * - бинарник через LLM не гоняем
 *
 * AUDIO_GEN_MODE:
 * - polza (по умолчанию) — Polza Audio Speech API
 * - stub — заглушка без сети
 * - comfy_ui — заглушка (ComfyUI для аудио не подключён)
 */

export type AudioGenMode = "stub" | "polza" | "comfy_ui";

export type GenerateAudioResult = {
  url: string;
  prompt: string;
  source: "stub" | "polza" | "comfy_ui" | "file";
  model?: string;
  voice?: string;
  contentType?: string;
  duration?: number;
};

const PUBLIC_AUDIO_DIR = path.join(process.cwd(), "public", "audio");
const GENERATED_DIR = path.join(PUBLIC_AUDIO_DIR, "generated");
const STUB_PUBLIC_PATH = "/audio/stub.wav";

const POLZA_SPEECH_URL = "https://polza.ai/api/v1/audio/speech";
/** Конкретная модель Polza TTS (можно переопределить POLZA_AUDIO_MODEL). */
const DEFAULT_AUDIO_MODEL = "openai/tts-1";
const DEFAULT_VOICE = "alloy";
const DEFAULT_RESPONSE_FORMAT = "mp3";

type PolzaSpeechResponse = {
  audio?: string;
  contentType?: string;
  model?: string;
  duration?: number;
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

function audioModel(): string {
  return process.env.POLZA_AUDIO_MODEL?.trim() || DEFAULT_AUDIO_MODEL;
}

function audioVoice(): string {
  return process.env.POLZA_AUDIO_VOICE?.trim() || DEFAULT_VOICE;
}

function audioGenMode(): AudioGenMode {
  const mode = process.env.AUDIO_GEN_MODE?.trim().toLowerCase();
  if (mode === "stub") {
    return "stub";
  }
  if (mode === "comfy_ui" || mode === "comfyui") {
    return "comfy_ui";
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

function errorMessage(data: PolzaSpeechResponse, status: number): string {
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
    return "Модель аудио сейчас недоступна";
  }
  return `Ошибка Polza Audio (${status})`;
}

function extensionFromContentType(
  contentType: string | undefined,
  fallback: "mp3" | "wav" | "opus" | "aac" | "flac" = "mp3",
): "mp3" | "wav" | "opus" | "aac" | "flac" {
  const lower = (contentType ?? "").toLowerCase();
  if (lower.includes("wav")) {
    return "wav";
  }
  if (lower.includes("opus") || lower.includes("ogg")) {
    return "opus";
  }
  if (lower.includes("aac")) {
    return "aac";
  }
  if (lower.includes("flac")) {
    return "flac";
  }
  if (lower.includes("mpeg") || lower.includes("mp3")) {
    return "mp3";
  }
  return fallback;
}

/**
 * Сохраняет байты в public/audio/generated и возвращает URL на нашем сайте.
 */
export async function saveGeneratedAudio(
  bytes: Uint8Array,
  options?: {
    extension?: "mp3" | "wav" | "opus" | "aac" | "flac";
    prompt?: string;
    contentType?: string;
  },
): Promise<GenerateAudioResult> {
  const extension = options?.extension ?? "mp3";
  await mkdir(GENERATED_DIR, { recursive: true });
  const filename = `${randomUUID()}.${extension}`;
  await writeFile(path.join(GENERATED_DIR, filename), bytes);
  const publicPath = `/audio/generated/${filename}`;
  return {
    url: absolutePublicUrl(publicPath),
    prompt: options?.prompt?.trim() ?? "",
    source: "file",
    contentType: options?.contentType,
  };
}

function stubResult(
  prompt: string,
  source: "stub" | "comfy_ui",
): GenerateAudioResult {
  return {
    url: absolutePublicUrl(STUB_PUBLIC_PATH),
    prompt,
    source,
    contentType: "audio/wav",
  };
}

async function generateViaPolza(prompt: string): Promise<GenerateAudioResult> {
  const apiKey = polzaApiKey();
  const model = audioModel();
  const voice = audioVoice();

  const response = await fetch(POLZA_SPEECH_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      input: prompt,
      voice,
      response_format: DEFAULT_RESPONSE_FORMAT,
    }),
  });

  const data = (await response.json()) as PolzaSpeechResponse;

  if (!response.ok) {
    throw new Error(errorMessage(data, response.status));
  }

  if (!data.audio?.trim()) {
    throw new Error("Polza завершила генерацию без аудио");
  }

  const bytes = Uint8Array.from(Buffer.from(data.audio, "base64"));
  const extension = extensionFromContentType(
    data.contentType,
    DEFAULT_RESPONSE_FORMAT,
  );
  const saved = await saveGeneratedAudio(bytes, {
    extension,
    prompt,
    contentType: data.contentType,
  });

  return {
    ...saved,
    source: "polza",
    model: data.model ?? model,
    voice,
    duration: data.duration,
  };
}

/**
 * Async-функция «текст → аудио» (URL).
 */
export async function generateAudio(prompt: string): Promise<GenerateAudioResult> {
  const trimmed = prompt.trim();
  if (!trimmed) {
    throw new Error("Нужен непустой текст для генерации аудио");
  }

  const mode = audioGenMode();

  if (mode === "stub") {
    return stubResult(trimmed, "stub");
  }

  if (mode === "comfy_ui") {
    // ComfyUI для аудио пока не подключён — отдаём ту же заглушку.
    return stubResult(trimmed, "comfy_ui");
  }

  return generateViaPolza(trimmed);
}

/** Описание tool на будущее (агент аудио пока не подключаем). */
export const generateAudioTool = {
  type: "function" as const,
  function: {
    name: "generate_audio",
    description:
      "Озвучивает текст (TTS) и возвращает URL аудиофайла. " +
      "В ответе пользователю используй этот URL (ссылка или плеер), " +
      "не пытайся пересказывать звук.",
    parameters: {
      type: "object",
      properties: {
        prompt: {
          type: "string",
          description: "Текст для озвучки",
        },
      },
      required: ["prompt"],
    },
  },
};

export async function runGenerateAudioTool(
  args: { prompt?: string } | string,
): Promise<string> {
  try {
    const parsed =
      typeof args === "string"
        ? (JSON.parse(args || "{}") as { prompt?: string })
        : args;
    const result = await generateAudio(parsed.prompt ?? "");
    return JSON.stringify(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Неизвестная ошибка";
    return JSON.stringify({ error: message });
  }
}
