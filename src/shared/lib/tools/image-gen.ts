import { mkdir, readFile, writeFile } from "node:fs/promises";
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
 * IMAGE_GEN_MODE:
 * - polza (по умолчанию) — Polza Media API
 * - stub — заглушка без сети
 * - comfy_ui — локальный ComfyUI + JSON-шаблон из templates/
 */

export type ImageGenMode = "stub" | "polza" | "comfy_ui";

export type GenerateImageResult = {
  url: string;
  prompt: string;
  source: "stub" | "polza" | "comfy_ui" | "file";
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

const DEFAULT_COMFYUI_URL = "http://127.0.0.1:8188";
const DEFAULT_COMFYUI_TEMPLATE = "templates/image_flux2_klein_4b_text_to_image.json";
const COMFY_POLL_INTERVAL_MS = 2000;
const COMFY_POLL_MAX_ATTEMPTS = 300;

type ComfyWorkflowNode = {
  inputs: Record<string, unknown>;
  class_type: string;
  _meta?: { title?: string };
};

type ComfyWorkflow = Record<string, ComfyWorkflowNode>;

type ComfyImageRef = {
  filename: string;
  subfolder?: string;
  type?: string;
};

type ComfyHistoryEntry = {
  status?: {
    completed?: boolean;
    status_str?: string;
  };
  outputs?: Record<string, { images?: ComfyImageRef[] }>;
};

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

function imageGenMode(): ImageGenMode {
  const mode = process.env.IMAGE_GEN_MODE?.trim().toLowerCase();
  if (mode === "stub") {
    return "stub";
  }
  if (mode === "comfy_ui" || mode === "comfyui") {
    return "comfy_ui";
  }
  return "polza";
}

function comfyUiBaseUrl(): string {
  return (
    process.env.COMFYUI_URL?.trim().replace(/\/$/, "") || DEFAULT_COMFYUI_URL
  );
}

function comfyUiTemplatePath(): string {
  const fromEnv = process.env.COMFYUI_TEMPLATE?.trim();
  if (fromEnv) {
    return path.isAbsolute(fromEnv)
      ? fromEnv
      : path.join(process.cwd(), fromEnv);
  }
  return path.join(process.cwd(), DEFAULT_COMFYUI_TEMPLATE);
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

function findWorkflowNodeId(
  workflow: ComfyWorkflow,
  classType: string,
): string | null {
  for (const [id, node] of Object.entries(workflow)) {
    if (node.class_type === classType) {
      return id;
    }
  }
  return null;
}

async function loadComfyWorkflow(): Promise<ComfyWorkflow> {
  const templatePath = comfyUiTemplatePath();
  let raw: string;
  try {
    raw = await readFile(templatePath, "utf8");
  } catch {
    throw new Error(`Не найден шаблон ComfyUI: ${templatePath}`);
  }

  const parsed = JSON.parse(raw) as ComfyWorkflow;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`Некорректный шаблон ComfyUI: ${templatePath}`);
  }
  return parsed;
}

function applyPromptToWorkflow(
  workflow: ComfyWorkflow,
  prompt: string,
): ComfyWorkflow {
  const clone = structuredClone(workflow) as ComfyWorkflow;
  const promptNodeId =
    Object.entries(clone).find(
      ([, node]) =>
        node.class_type === "CLIPTextEncode" && node._meta?.title === "Prompt",
    )?.[0] ?? findWorkflowNodeId(clone, "CLIPTextEncode");
  if (!promptNodeId) {
    throw new Error("В шаблоне ComfyUI нет ноды CLIPTextEncode для промпта");
  }
  clone[promptNodeId].inputs.text = prompt;

  const samplerId =
    findWorkflowNodeId(clone, "KSampler") ??
    findWorkflowNodeId(clone, "KSamplerAdvanced");
  if (samplerId && "seed" in clone[samplerId].inputs) {
    clone[samplerId].inputs.seed = Math.floor(Math.random() * 2 ** 32);
  } else if (samplerId && "noise_seed" in clone[samplerId].inputs) {
    clone[samplerId].inputs.noise_seed = Math.floor(Math.random() * 2 ** 32);
  }

  return clone;
}

function extractComfyImage(
  entry: ComfyHistoryEntry,
): ComfyImageRef | null {
  const outputs = entry.outputs;
  if (!outputs) {
    return null;
  }
  for (const nodeOutput of Object.values(outputs)) {
    const image = nodeOutput.images?.[0];
    if (image?.filename) {
      return image;
    }
  }
  return null;
}

async function queueComfyPrompt(
  workflow: ComfyWorkflow,
  baseUrl: string,
): Promise<string> {
  const response = await fetch(`${baseUrl}/prompt`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt: workflow,
      client_id: `ai-chat-${randomUUID()}`,
    }),
  });

  const data = (await response.json()) as {
    prompt_id?: string;
    error?: { message?: string; type?: string };
    node_errors?: Record<string, unknown>;
  };

  if (!response.ok || !data.prompt_id) {
    const details =
      data.error?.message ||
      (data.node_errors ? JSON.stringify(data.node_errors) : null) ||
      `HTTP ${response.status}`;
    throw new Error(`ComfyUI отклонила workflow: ${details}`);
  }

  return data.prompt_id;
}

async function waitForComfyHistory(
  promptId: string,
  baseUrl: string,
): Promise<ComfyHistoryEntry> {
  for (let attempt = 0; attempt < COMFY_POLL_MAX_ATTEMPTS; attempt += 1) {
    const response = await fetch(`${baseUrl}/history/${promptId}`);
    if (!response.ok) {
      throw new Error(`ComfyUI history ошибка (${response.status})`);
    }

    const history = (await response.json()) as Record<string, ComfyHistoryEntry>;
    const entry = history[promptId];
    if (entry) {
      const status = entry.status?.status_str;
      if (status === "error") {
        throw new Error("ComfyUI завершила генерацию с ошибкой");
      }
      if (entry.status?.completed || extractComfyImage(entry)) {
        return entry;
      }
    }

    await sleep(COMFY_POLL_INTERVAL_MS);
  }

  throw new Error("Таймаут ожидания картинки от ComfyUI");
}

async function downloadComfyImage(
  image: ComfyImageRef,
  baseUrl: string,
  prompt: string,
): Promise<GenerateImageResult> {
  const params = new URLSearchParams({
    filename: image.filename,
    subfolder: image.subfolder ?? "",
    type: image.type ?? "output",
  });
  const viewUrl = `${baseUrl}/view?${params.toString()}`;
  const response = await fetch(viewUrl);
  if (!response.ok) {
    throw new Error(`Не удалось скачать картинку из ComfyUI (${response.status})`);
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  const extension = extensionFromUrlOrType(
    image.filename,
    response.headers.get("content-type"),
  );
  const saved = await saveGeneratedImage(bytes, { extension, prompt });

  return {
    ...saved,
    source: "comfy_ui",
    model: "flux-2-klein-4b-gguf",
    remoteUrl: viewUrl,
  };
}

async function generateViaComfyUi(prompt: string): Promise<GenerateImageResult> {
  const baseUrl = comfyUiBaseUrl();
  const workflow = applyPromptToWorkflow(await loadComfyWorkflow(), prompt);
  const promptId = await queueComfyPrompt(workflow, baseUrl);
  const finished = await waitForComfyHistory(promptId, baseUrl);
  const image = extractComfyImage(finished);

  if (!image) {
    throw new Error("ComfyUI завершила генерацию без изображения");
  }

  return downloadComfyImage(image, baseUrl, prompt);
}

/**
 * Async-функция «промпт → изображение» (URL).
 */
export async function generateImage(prompt: string): Promise<GenerateImageResult> {
  const trimmed = prompt.trim();
  if (!trimmed) {
    throw new Error("Нужен непустой промпт для генерации изображения");
  }

  const mode = imageGenMode();

  if (mode === "stub") {
    return {
      url: absolutePublicUrl(STUB_PUBLIC_PATH),
      prompt: trimmed,
      source: "stub",
    };
  }

  if (mode === "comfy_ui") {
    return generateViaComfyUi(trimmed);
  }

  return generateViaPolza(trimmed);
}

/** Описание tool для будущего подключения к агенту (Ollama tools). */
export const generateImageTool = {
  type: "function" as const,
  function: {
    name: "generate_image",
    description:
      "Создаёт изображение по текстовому промпту и возвращает URL картинки. " +
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
