# Чат с выбором модели

Учебный проект: Next.js + Polza.ai. Без Express и без базы. История диалога — в памяти клиента, лимит задаётся в `src/entities/chat/model/constants.ts`. Структура — FSD (`app` / `entities` / `shared`).

## Запуск

```bash
cp .env.example .env.local
# вставь ключ Polza в .env.local

pnpm install
pnpm dev
```

Открой [http://localhost:3000](http://localhost:3000).

## Как устроено

1. Страница держит `messages` и обрезает до `MESSAGE_LIMIT` (сейчас 10).
2. `POST /api/chat` принимает `{ model, messages }`. Модели Polza идут в Polza; пункт «Агент workdir» — локальный FS-агент через Ollama.
3. Ответ ассистента снова добавляется в `messages` с тем же лимитом.

Список моделей: `src/shared/lib/models.ts`. Подставь id из кабинета Polza.

## Генерация картинки (hme_cl_6)

Контракт тула: **промпт → URL**, без бинарника через LLM.

Логика: `src/shared/lib/tools/image-gen.ts` → `POST https://polza.ai/api/v1/media` (модель по умолчанию Nano Banana `google/gemini-2.5-flash-image`), при `pending` — polling `GET /api/v1/media/{id}`, затем скачивание в `public/img/generated/` и возврат локального URL.

Нужен `POLZA_API_KEY` в `.env.local`.

```bash
pnpm image "рыжий кот в космосе"
# → { "url": "http://localhost:3000/img/generated/….png", "source": "polza", ... }

IMAGE_GEN_MODE=stub pnpm image "без сети"
# → http://localhost:3000/img/stub.png
```

Опционально позже: [Krita](https://krita.org) + AI Diffusion / ComfyUI как локальная альтернатива Polza.

## Todo через файловую систему (Ollama tooling)

Задачи лежат в `workdir/todo.json`. Модель меняет их через tools `list_files`, `read_file`, `write_file` (без БД).

Нужны запущенные `ollama serve` и модель `llama3.2` (с tooling).

```bash
# список задач
pnpm todo
# или
node scripts/todo-agent.mjs "покажи задачи"

# добавить
node scripts/todo-agent.mjs "добавь задачу: купить молоко"

# отметить выполненной
node scripts/todo-agent.mjs "отметь выполненным: купить молоко"

# удалить
node scripts/todo-agent.mjs "удали задачу купить молоко"
```

Общая логика tools: `src/shared/lib/tools/fs-tools.ts`. Песочница — только `workdir/` (guard от `..`).
