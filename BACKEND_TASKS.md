# BACKEND TASKS (MVP)

## 1. Базовая инфраструктура
- Инициализировать backend-проект (Node.js + TypeScript).
- Подключить PostgreSQL.
- Подключить Redis.
- Настроить env-конфиг и валидацию переменных.
- Добавить healthcheck endpoint (`GET /health`).

## 2. Авторизация Telegram
- Реализовать `POST /auth/telegram`.
- Проверять подпись `initData` на сервере.
- Создавать/обновлять пользователя в `users`.
- Выдавать JWT с TTL.
- Добавить middleware проверки JWT для приватных endpoint.

## 3. Профиль и статистика
- Реализовать `GET /me`.
- Создавать запись в `player_stats` при первом входе.
- Возвращать профиль + агрегированную статистику.

## 4. Лобби и presence
- Реализовать статусы `online`, `in_queue`, `in_game`.
- Реализовать `GET /lobby/waiting`.
- Реализовать `POST /lobby/queue/join`.
- Реализовать `POST /lobby/queue/leave`.
- Защитить очередь от дублей.

## 5. Матчмейкинг
- Реализовать авто-подбор FIFO.
- Реализовать ручные инвайты:
- `POST /lobby/challenge`
- `POST /lobby/challenge/respond`
- При успешном матче создавать `games` и стартовое состояние.

## 6. Realtime (WebSocket)
- Настроить socket auth через JWT.
- Поддержать события:
- `queue:joined`, `queue:left`, `match:found`
- `game:state`, `game:move`, `game:move:applied`
- `game:draw:offer`, `game:draw:respond`
- `game:resign`
- `game:finished`
- `game:rematch:offer`, `game:rematch:accepted`
- `presence:update`
- Реализовать реконнект и отправку актуального состояния партии.

## 7. Игровая логика
- Встроить шахматный движок правил.
- Делать server-side валидацию каждого хода.
- Сохранять ходы в `moves` (uci/san/fen_after).
- Обновлять `games.fen_current` и `games.pgn`.
- Определять завершение партии и `finish_reason`.

## 8. Послематчевая обработка
- Обновлять `player_stats` после завершения.
- Начислять очки рейтинга (3/1/0).
- Реализовать реванш при согласии двух игроков.

## 9. Рейтинги
- Реализовать `GET /leaderboard/global`.
- Реализовать `GET /leaderboard/daily?date=YYYY-MM-DD`.
- Добавить daily-агрегацию (cron/job) в `daily_leaderboard`.
- Реализовать tie-break из `TECH_SPEC.md`.

## 10. История игр
- Реализовать `GET /history?userId=...`.
- Реализовать `GET /games/:id` с полным состоянием и логом.

## 11. Надежность и безопасность
- Идемпотентность приема ходов.
- Проверка, что игрок участвует в партии.
- Rate limit на auth/lobby endpoints.
- Централизованный error handler.
- Структурированные логи по матчам.

## 12. Тесты
- Unit: Telegram auth verify, scoring, tie-break.
- Unit: валидация ходов и завершения партий.
- Integration: lobby -> match -> game finish -> stats update.
- Integration: reconnect в активную партию.
