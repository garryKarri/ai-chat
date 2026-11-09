/**
 * generateAudio(prompt) → { url }
 *
 * Запуск:
 *   pnpm audio "Привет, это тест озвучки"
 *   AUDIO_GEN_MODE=stub pnpm audio "тест без сети"
 *   AUDIO_GEN_MODE=comfy_ui pnpm audio "заглушка вместо ComfyUI"
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = path.join(import.meta.dirname, "..");

function loadEnvFile(filename) {
  const full = path.join(ROOT, filename);
  let text;
  try {
    text = readFileSync(full, "utf8");
  } catch {
    return;
  }

  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
      continue;
    }
    const eq = trimmed.indexOf("=");
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

loadEnvFile(".env.local");
loadEnvFile(".env");

const moduleUrl = pathToFileURL(
  path.join(ROOT, "src/shared/lib/tools/audio-gen.ts"),
).href;
const { generateAudio } = await import(moduleUrl);

const prompt = process.argv.slice(2).join(" ").trim();

if (!prompt) {
  console.error('Укажи текст: pnpm audio "фраза для озвучки"');
  process.exit(1);
}

try {
  const result = await generateAudio(prompt);
  console.log(JSON.stringify(result, null, 2));
  console.log(`\nАудио: ${result.url}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
