# MR Review

Locally-deployable AI-powered merge request review tool. Browse GitLab/GitHub MRs, send them to an AI for structured code review, edit the resulting comments, and post them back — all from a single dev machine.

## Навигация

| Раздел | Куда идти | Что внутри |
| --- | --- | --- |
| Backend service | [services/mr-review](services/mr-review/README.md) | Python FastAPI, SQLite, AI providers, VCS clients |
| Frontend | [services/web-app](services/web-app/README.md) | React 19, TypeScript, Feature-Sliced Design |
| Dev scripts | [scripts](scripts) | Dev server, test runner, migration tooling |
| Docs | [docs](docs) | Engineering documentation |

## Что это за система

MR Review — инструмент для AI-ревью мержреквестов, запускаемый локально. Разработчик открывает UI в браузере, выбирает хост (GitLab/GitHub), репозиторий и MR, составляет промпт для AI, получает структурированные комментарии и постит их в MR.

Ключевые особенности:
- **Никаких Docker-зависимостей** — запуск одной командой
- **Onion Architecture** в бэкенде: domain, use cases, infra, api
- **Feature-Sliced Design** во фронтенде
- **SQLite** для локального хранения конфигурации хостов и истории ревью
- **Поддержка Claude и OpenAI-compatible** AI-провайдеров

## Review Pipeline

```
PICK → BRIEF → DISPATCH → POLISH → POST
```

1. **PICK** — browse diff, pin lines of interest
2. **BRIEF** — configure AI prompt (preset + context toggles + custom instructions)
3. **DISPATCH** — stream AI review (Claude or OpenAI-compatible)
4. **POLISH** — edit, keep, or dismiss generated comments
5. **POST** — send approved comments to GitLab/GitHub

## Быстрый старт

Минимальные требования:

- Python 3.12+ и `uv`
- Node.js и `pnpm`

```bash
# Посмотреть все доступные команды
make help

# Запустить backend (:8000) + frontend (:5173)
make dev

# Запустить тесты
make run-tests

# Форматировать все сервисы
make fmt-services
```

Откройте [http://localhost:5173](http://localhost:5173), добавьте GitLab или GitHub хост с personal access token, выберите репозиторий и MR.

## Структура репозитория

```text
mr-review/
├── services/       # Backend и frontend сервисы
│   ├── mr-review/  # Python FastAPI backend
│   └── web-app/    # React TypeScript frontend
├── scripts/        # Dev, test и tooling automation
└── docs/           # Cross-cutting engineering documentation
```

## Development standards

- Новая бизнес-логика должна жить в use cases/domain, а не в transport handlers.
- Зависимости всегда направлены внутрь: core ← use_cases ← infra ← api.
- Перед отправкой изменений запускайте `make fmt-services`, `make run-tests`.
- Коммиты следуют [Conventional Commits](https://www.conventionalcommits.org/).
- Ветки именуются по схеме `<type>/<SLUG>-<ID>__<description>`.
