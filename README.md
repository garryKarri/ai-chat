# Чат с выбором модели

Учебный проект: Next.js + Polza.ai. Без Express и без базы. История диалога — в памяти клиента, лимит задаётся в `lib/chat.ts`.

## Запуск

```bash
cp .env.example .env.local
# вставь ключ Polza в .env.local

pnpm install
pnpm dev
```

Открой [http://localhost:3000](http://localhost:3000).

## Как устроено

1. Страница держит `messages` и обрезает до `MESSAGE_LIMIT` (сейчас 3).
2. `POST /api/chat` принимает `{ model, messages }` и прокидывает их в Polza.
3. Ответ ассистента снова добавляется в `messages` с тем же лимитом.

Список моделей: `lib/models.ts`. Подставь id из кабинета Polza.

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

Общая логика tools: `lib/tools/fs-tools.ts`. Песочница — только `workdir/` (guard от `..`).
