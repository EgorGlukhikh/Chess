# Chess Mini App (MVP)

Мобильное web-приложение для Telegram: онлайн-шахматы 1v1, лобби, статистика и рейтинги.

## Что уже реализовано
- Telegram auth (`/api/auth/telegram`) с проверкой `initData`.
- Dev auth для локальной разработки (`/api/auth/dev`, отключается env-переменной).
- Лобби:
- автоочередь;
- список ожидающих;
- вызов игрока по нику.
- Realtime-игра через WebSocket (`socket.io`).
- Полные правила шахмат через `chess.js`.
- Кнопки `Ничья`, `Сдаться`, `Реванш`.
- История партий, личная статистика.
- Общий и суточный рейтинг.

## Структура
- `server/index.js` — backend + socket server
- `server/db.js` — файловое хранилище `data/db.json`
- `server/telegramAuth.js` — валидация Telegram initData
- `public/` — клиент (мобильный UI)

## Логика запуска

При старте сервер по порядку:

1. Читает `.env` (dotenv).
2. Проверяет конфиг: при `ALLOW_DEV_AUTH=false` обязательно нужен `TELEGRAM_BOT_TOKEN`.
3. Инициализирует БД (`data/db.json`), создаёт файл при отсутствии.
4. Поднимает Express + Socket.io, раздаёт `public/` и API.
5. Восстанавливает карту активных партий из БД (`rebuildActiveGameMap`).
6. Запускает интервал очистки просроченных вызовов (каждые 10 с).
7. Слушает `HOST:PORT` и пишет в консоль готовность.

Команды:

| Команда | Назначение |
|--------|------------|
| `npm run dev` | Разработка: автоперезапуск при изменении файлов |
| `npm start` | Обычный запуск |
| `npm run start:prod` | То же; для продакшена задай в `.env`: `NODE_ENV=production`, `JWT_SECRET=...`, `ALLOW_DEV_AUTH=false` |
| `npm run set:webapp -- https://твой-домен.com` | Выставить кнопку меню бота (Web App URL) |

## Локальный запуск

1. Установить зависимости:
```bash
npm install
```

2. Создать `.env` на основе `.env.example` (скопировать и при необходимости подставить значения).

3. Запустить:
```bash
npm run dev
```
или `npm start`.

4. Открыть в браузере: `http://localhost:3000`

## Запуск через Docker
1. Собрать образ:
```bash
docker build -t chess-mini-app .
```

2. Запустить контейнер:
```bash
$pwdPath = (Get-Location).Path
docker run --name chess-mini-app `
  -p 3000:3000 `
  --env-file .env `
  -v "${pwdPath}/data:/app/data" `
  -d chess-mini-app
```

## Деплой (Git → хостинг)

Заливай код в **GitHub** или **GitLab**. Файл `.env` в репозиторий не попадает (он в `.gitignore`); переменные окружения задаются в настройках сервиса или на сервере.

### Вариант 1: Railway
1. Зайди на [railway.app](https://railway.app), войди через GitHub.
2. **New Project** → **Deploy from GitHub repo** → выбери репозиторий.
3. В настройках сервиса: **Variables** — добавь `JWT_SECRET`, `TELEGRAM_BOT_TOKEN`, при необходимости `ALLOW_DEV_AUTH=false`, `NODE_ENV=production`.
4. Railway сам соберёт проект (Node) и выдаст HTTPS-URL вида `https://твой-проект.up.railway.app`.
5. В BotFather укажи этот URL как Web App. Для сохранения партий между редеплоями добавь **Volume** и примонтируй папку `data` (в Railway: Volumes → Mount Path `/app/data`).

### Вариант 2: Render
1. [render.com](https://render.com) → **New** → **Web Service**, подключи репозиторий.
2. **Build Command:** `npm install`, **Start Command:** `npm start`.
3. **Environment** — те же переменные: `JWT_SECRET`, `TELEGRAM_BOT_TOKEN`, `NODE_ENV=production`, `ALLOW_DEV_AUTH=false`.
4. Render выдаст URL типа `https://твой-сервис.onrender.com`. Для постоянного хранения данных используй **Disk** (persistent storage) и путь `data` в настройках сервиса, если доступен.

### Вариант 3: Свой VPS (Hetzner, DigitalOcean и т.п.)
1. На сервере: `git clone <твой-репо>`, `cd chess`, `npm ci`.
2. Создай `.env` с продакшен-значениями (или экспортируй переменные).
3. Запуск через **PM2:** `npm install -g pm2`, `pm2 start server/index.js --name chess`.
4. **Nginx** как обратный прокси + **Let's Encrypt** (HTTPS): проксировать на `http://127.0.0.1:3000`, выдать сертификат для домена.
5. В BotFather укажи домен как Web App URL. Каталог `data/` сохраняй между обновлениями (не удаляй при `git pull`).

После деплоя выполни один раз (подставив свой URL):
```bash
npm run set:webapp -- https://твой-реальный-домен.com
```

## Текущий рабочий режим в этом проекте
- `.env` уже создан.
- `TELEGRAM_BOT_TOKEN` уже задан.
- `ALLOW_DEV_AUTH=false`, то есть вход только через Telegram Mini App.

Для локального браузерного входа без Telegram временно поставь в `.env`:
```env
ALLOW_DEV_AUTH=true
```

## Подключение к Telegram Mini App
1. Создай бота через `@BotFather`.
2. Получи token бота и вставь в `.env`: `TELEGRAM_BOT_TOKEN=...`.
3. Задеплой приложение на **HTTPS**-домен (обязательно для Mini App).
4. В BotFather: **Bot Settings → Menu Button** или **Bot Settings → Configure** — укажи **Web App URL** (например `https://твой-домен.com`).
5. Пользователи открывают Mini App из меню бота или по кнопке в чате.

В Mini App приложение само разворачивается на весь экран, подстраивается под тему Telegram и показывает кнопку «Назад» на экране игры.

Альтернатива через скрипт (автоматически выставить кнопку меню):
```bash
npm run set:webapp -- https://твой-домен.com
```

## API (основное)
- `POST /api/auth/telegram`
- `POST /api/auth/dev`
- `GET /api/me`
- `GET /api/lobby/waiting`
- `POST /api/lobby/queue/join`
- `POST /api/lobby/queue/leave`
- `POST /api/lobby/challenge`
- `POST /api/lobby/challenge/respond`
- `GET /api/games/:id`
- `GET /api/history`
- `GET /api/leaderboard/global`
- `GET /api/leaderboard/daily`
- `GET /api/leaderboard/daily/winner`

## Важно
- Хранилище сейчас файловое (`data/db.json`) для быстрого MVP.
- Для продакшена: задай в `.env` `NODE_ENV=production`, `JWT_SECRET` (не дефолтный), при необходимости `ALLOW_DEV_AUTH=false`; рекомендован переход на PostgreSQL + Redis.
- Если бот-токен когда-либо утек, его нужно перевыпустить через `@BotFather`.
