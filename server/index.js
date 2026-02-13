require("dotenv").config();

const http = require("http");
const path = require("path");

const cors = require("cors");
const express = require("express");
const { Server } = require("socket.io");
const { Chess } = require("chess.js");

const {
  initDb,
  getDb,
  saveDb,
  getUserById,
  upsertTelegramUser,
  upsertDevUser,
  getStatsByUserId,
  listUsers,
  listGames,
  listGamesByUser,
  getGameById,
  listActiveGames,
  createGame,
  touchGame,
  applyResultToStats,
} = require("./db");
const { verifyTelegramInitData } = require("./telegramAuth");
const { createAuthHelpers } = require("./auth");

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "0.0.0.0";
const JWT_SECRET = process.env.JWT_SECRET || "change-me";
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const APP_TIMEZONE = process.env.APP_TIMEZONE || "Europe/Moscow";
const ALLOW_DEV_AUTH = String(process.env.ALLOW_DEV_AUTH || "true").toLowerCase() === "true";

if (JWT_SECRET === "change-me" && process.env.NODE_ENV === "production") {
  console.warn("WARN: JWT_SECRET is default. Set JWT_SECRET in production.");
}
if (!ALLOW_DEV_AUTH && !TELEGRAM_BOT_TOKEN) {
  throw new Error("TELEGRAM_BOT_TOKEN is required when ALLOW_DEV_AUTH=false");
}

initDb();

const { signToken, verifyToken, authMiddleware } = createAuthHelpers(JWT_SECRET);

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: true,
    credentials: true,
  },
});

const queue = [];
const challenges = new Map();
const onlineSocketsByUser = new Map();
const activeGameByUser = new Map();

function nowIso() {
  return new Date().toISOString();
}

function normalizeDateKey(input) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(input || "")) ? input : null;
}

function toDateKey(iso, timeZone) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
  };
}

function isOnline(userId) {
  const set = onlineSocketsByUser.get(userId);
  return !!set && set.size > 0;
}

function isInQueue(userId) {
  return queue.includes(userId);
}

function isInGame(userId) {
  return activeGameByUser.has(userId);
}

function getPresenceStatus(userId) {
  if (isInGame(userId)) return "in_game";
  if (isInQueue(userId)) return "in_queue";
  if (isOnline(userId)) return "online";
  return "offline";
}

function removeFromQueue(userId) {
  let changed = false;
  while (true) {
    const idx = queue.indexOf(userId);
    if (idx === -1) break;
    queue.splice(idx, 1);
    changed = true;
  }
  return changed;
}

function cleanupChallenges() {
  const currentTs = Date.now();
  for (const [id, challenge] of challenges.entries()) {
    if (challenge.status !== "pending" || challenge.expiresAt <= currentTs) {
      challenges.delete(id);
    }
  }
}

function clearUserChallenges(userId) {
  for (const [id, challenge] of challenges.entries()) {
    if (challenge.fromUserId === userId || challenge.toUserId === userId) {
      challenges.delete(id);
    }
  }
}

function getWaitingList() {
  cleanupChallenges();
  const uniqueQueue = [...new Set(queue)];
  return uniqueQueue
    .map((userId) => {
      const user = getUserById(userId);
      if (!user) return null;
      return {
        ...publicUser(user),
        status: getPresenceStatus(userId),
      };
    })
    .filter(Boolean);
}

function buildPresenceSnapshot() {
  return [...onlineSocketsByUser.keys()].map((userId) => {
    const user = getUserById(userId);
    if (!user) return null;
    return {
      user: publicUser(user),
      status: getPresenceStatus(userId),
    };
  }).filter(Boolean);
}

function emitPresence() {
  io.emit("presence:update", buildPresenceSnapshot());
}

function emitWaitingList() {
  io.emit("lobby:waiting", getWaitingList());
}

function userRoom(userId) {
  return `user:${userId}`;
}

function otherPlayer(game, userId) {
  if (game.whiteUserId === userId) return game.blackUserId;
  if (game.blackUserId === userId) return game.whiteUserId;
  return null;
}

function playerColor(game, userId) {
  if (game.whiteUserId === userId) return "white";
  if (game.blackUserId === userId) return "black";
  return null;
}

function isParticipant(game, userId) {
  return game.whiteUserId === userId || game.blackUserId === userId;
}

function buildLegalMoves(game, viewerId) {
  if (game.status !== "active") return {};

  const chess = new Chess(game.fenCurrent);
  const turn = chess.turn() === "w" ? game.whiteUserId : game.blackUserId;
  if (turn !== viewerId) return {};

  const map = {};
  for (const m of chess.moves({ verbose: true })) {
    if (!map[m.from]) map[m.from] = [];
    map[m.from].push({ to: m.to, promotion: m.promotion || null });
  }
  return map;
}

function serializeMove(move) {
  return {
    moveNo: move.moveNo,
    side: move.side,
    from: move.from,
    to: move.to,
    promotion: move.promotion,
    uci: move.uci,
    san: move.san,
    fenAfter: move.fenAfter,
    createdAt: move.createdAt,
  };
}

function buildGameState(game, viewerId) {
  const chess = new Chess(game.fenCurrent);
  const viewer = getUserById(viewerId);
  const white = getUserById(game.whiteUserId);
  const black = getUserById(game.blackUserId);

  const drawOfferBy = game.drawOfferBy
    ? game.drawOfferBy === viewerId
      ? "self"
      : "opponent"
    : null;

  return {
    id: game.id,
    status: game.status,
    result: game.result,
    finishReason: game.finishReason,
    startedAt: game.startedAt,
    finishedAt: game.finishedAt,
    fen: game.fenCurrent,
    pgn: game.pgn,
    turnColor: chess.turn() === "w" ? "white" : "black",
    inCheck: game.status === "active" ? chess.isCheck() : false,
    drawOfferBy,
    rematchBy: Array.isArray(game.rematchBy)
      ? game.rematchBy.map((userId) => (userId === viewerId ? "self" : "opponent"))
      : [],
    viewer: publicUser(viewer),
    viewerColor: playerColor(game, viewerId),
    players: {
      white: publicUser(white),
      black: publicUser(black),
    },
    legalMoves: buildLegalMoves(game, viewerId),
    moves: Array.isArray(game.moves) ? game.moves.map(serializeMove) : [],
  };
}

function emitGameState(game) {
  io.to(userRoom(game.whiteUserId)).emit("game:state", buildGameState(game, game.whiteUserId));
  io.to(userRoom(game.blackUserId)).emit("game:state", buildGameState(game, game.blackUserId));
}

function emitMatchFound(game) {
  const white = getUserById(game.whiteUserId);
  const black = getUserById(game.blackUserId);

  io.to(userRoom(game.whiteUserId)).emit("match:found", {
    gameId: game.id,
    color: "white",
    opponent: publicUser(black),
  });

  io.to(userRoom(game.blackUserId)).emit("match:found", {
    gameId: game.id,
    color: "black",
    opponent: publicUser(white),
  });
}

function createAndStartGame(firstUserId, secondUserId, options = {}) {
  if (isInGame(firstUserId) || isInGame(secondUserId)) {
    return null;
  }

  const chess = new Chess();

  let whiteUserId;
  let blackUserId;

  if (options.whiteUserId && options.blackUserId) {
    whiteUserId = options.whiteUserId;
    blackUserId = options.blackUserId;
  } else {
    const randomWhite = Math.random() < 0.5 ? firstUserId : secondUserId;
    whiteUserId = randomWhite;
    blackUserId = randomWhite === firstUserId ? secondUserId : firstUserId;
  }

  removeFromQueue(firstUserId);
  removeFromQueue(secondUserId);
  clearUserChallenges(firstUserId);
  clearUserChallenges(secondUserId);

  const game = createGame({
    whiteUserId,
    blackUserId,
    fen: chess.fen(),
  });

  activeGameByUser.set(whiteUserId, game.id);
  activeGameByUser.set(blackUserId, game.id);

  emitMatchFound(game);
  emitGameState(game);
  emitWaitingList();
  emitPresence();

  return game;
}

function finishGame(game, { result, finishReason }) {
  if (game.status !== "active") return;

  game.status = "finished";
  game.result = result;
  game.finishReason = finishReason;
  game.finishedAt = nowIso();
  game.drawOfferBy = null;
  game.updatedAt = nowIso();

  activeGameByUser.delete(game.whiteUserId);
  activeGameByUser.delete(game.blackUserId);

  applyResultToStats(game);
  touchGame(game);

  io.to(userRoom(game.whiteUserId)).emit("game:finished", buildGameState(game, game.whiteUserId));
  io.to(userRoom(game.blackUserId)).emit("game:finished", buildGameState(game, game.blackUserId));

  emitPresence();
  emitWaitingList();
}

function finishByBoardState(game, chess) {
  let result = "1/2-1/2";
  let finishReason = "draw";

  if (chess.isCheckmate()) {
    const loserSide = chess.turn();
    result = loserSide === "w" ? "0-1" : "1-0";
    finishReason = "checkmate";
  } else if (chess.isStalemate()) {
    finishReason = "stalemate";
  } else if (chess.isThreefoldRepetition()) {
    finishReason = "repetition";
  } else if (chess.isDrawByFiftyMoves()) {
    finishReason = "fifty_move";
  } else if (chess.isInsufficientMaterial()) {
    finishReason = "insufficient_material";
  }

  finishGame(game, { result, finishReason });
}

function matchmakeQueue() {
  while (queue.length >= 2) {
    const first = queue.shift();
    if (!first) continue;
    if (isInGame(first) || !isOnline(first)) {
      continue;
    }

    let secondIndex = -1;
    for (let i = 0; i < queue.length; i += 1) {
      const candidate = queue[i];
      if (!candidate) continue;
      if (isInGame(candidate)) continue;
      if (!isOnline(candidate)) continue;
      secondIndex = i;
      break;
    }

    if (secondIndex === -1) {
      queue.unshift(first);
      break;
    }

    const second = queue.splice(secondIndex, 1)[0];
    createAndStartGame(first, second);
  }

  emitWaitingList();
  emitPresence();
}

function rebuildActiveGameMap() {
  for (const game of listActiveGames()) {
    activeGameByUser.set(game.whiteUserId, game.id);
    activeGameByUser.set(game.blackUserId, game.id);
  }
}

function requireUser(req, res) {
  const user = getUserById(req.auth.userId);
  if (!user) {
    res.status(401).json({ error: "User not found" });
    return null;
  }
  return user;
}

function buildGlobalLeaderboard() {
  const dbRef = getDb();
  const rows = Object.values(dbRef.stats).map((stats) => {
    const user = getUserById(stats.userId);
    return {
      user: publicUser(user),
      wins: stats.wins,
      losses: stats.losses,
      draws: stats.draws,
      gamesTotal: stats.gamesTotal,
      points: stats.pointsTotal,
      updatedAt: stats.updatedAt,
    };
  }).filter((row) => row.user);

  rows.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.wins !== a.wins) return b.wins - a.wins;
    if (a.losses !== b.losses) return a.losses - b.losses;
    return a.user.displayName.localeCompare(b.user.displayName, "ru");
  });

  return rows.map((row, idx) => ({
    rank: idx + 1,
    ...row,
  }));
}

function buildDailyLeaderboard(dayKey) {
  const games = listGames()
    .filter((g) => g.status === "finished" && !!g.finishedAt)
    .sort((a, b) => String(a.finishedAt).localeCompare(String(b.finishedAt)));

  const map = new Map();

  function ensure(userId) {
    if (!map.has(userId)) {
      map.set(userId, {
        userId,
        points: 0,
        wins: 0,
        losses: 0,
        draws: 0,
        lastPointGainAt: null,
      });
    }
    return map.get(userId);
  }

  for (const game of games) {
    if (toDateKey(game.finishedAt, APP_TIMEZONE) !== dayKey) continue;

    const white = ensure(game.whiteUserId);
    const black = ensure(game.blackUserId);

    if (game.result === "1-0") {
      white.wins += 1;
      white.points += 3;
      white.lastPointGainAt = game.finishedAt;
      black.losses += 1;
    } else if (game.result === "0-1") {
      black.wins += 1;
      black.points += 3;
      black.lastPointGainAt = game.finishedAt;
      white.losses += 1;
    } else if (game.result === "1/2-1/2") {
      white.draws += 1;
      black.draws += 1;
      white.points += 1;
      black.points += 1;
      white.lastPointGainAt = game.finishedAt;
      black.lastPointGainAt = game.finishedAt;
    }
  }

  const rows = [...map.values()]
    .map((item) => {
      const user = getUserById(item.userId);
      if (!user) return null;
      return {
        user: publicUser(user),
        points: item.points,
        wins: item.wins,
        losses: item.losses,
        draws: item.draws,
        lastPointGainAt: item.lastPointGainAt,
      };
    })
    .filter(Boolean);

  rows.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.wins !== a.wins) return b.wins - a.wins;
    if (a.losses !== b.losses) return a.losses - b.losses;

    const aTime = a.lastPointGainAt || "9999-12-31T23:59:59.999Z";
    const bTime = b.lastPointGainAt || "9999-12-31T23:59:59.999Z";
    if (aTime !== bTime) return aTime.localeCompare(bTime);

    return a.user.displayName.localeCompare(b.user.displayName, "ru");
  });

  return rows.map((row, idx) => ({
    rank: idx + 1,
    ...row,
  }));
}

app.get("/health", (_req, res) => {
  res.json({ ok: true, now: nowIso() });
});

app.get("/api/config", (_req, res) => {
  res.json({
    allowDevAuth: ALLOW_DEV_AUTH,
    timezone: APP_TIMEZONE,
  });
});

app.post("/api/auth/telegram", (req, res) => {
  const initData = req.body?.initData;
  if (!initData) {
    return res.status(400).json({ error: "initData is required" });
  }

  const verified = verifyTelegramInitData(initData, TELEGRAM_BOT_TOKEN);
  if (!verified.ok) {
    return res.status(401).json({ error: verified.error });
  }

  const user = upsertTelegramUser(verified.user);
  const stats = getStatsByUserId(user.id);
  const token = signToken(user.id);

  return res.json({
    token,
    user: publicUser(user),
    stats,
  });
});

app.post("/api/auth/dev", (req, res) => {
  if (!ALLOW_DEV_AUTH) {
    return res.status(403).json({ error: "Dev auth is disabled" });
  }

  const displayName = String(req.body?.displayName || "").trim();
  if (!displayName) {
    return res.status(400).json({ error: "displayName is required" });
  }

  const user = upsertDevUser(displayName);
  const stats = getStatsByUserId(user.id);
  const token = signToken(user.id);

  return res.json({
    token,
    user: publicUser(user),
    stats,
  });
});

app.get("/api/me", authMiddleware, (req, res) => {
  const user = requireUser(req, res);
  if (!user) return;

  const stats = getStatsByUserId(user.id);
  res.json({
    user: publicUser(user),
    stats,
    status: getPresenceStatus(user.id),
  });
});

app.get("/api/lobby/waiting", authMiddleware, (_req, res) => {
  res.json({ waiting: getWaitingList() });
});

app.post("/api/lobby/queue/join", authMiddleware, (req, res) => {
  const user = requireUser(req, res);
  if (!user) return;

  if (isInGame(user.id)) {
    return res.status(409).json({ error: "You are already in game" });
  }

  if (!isInQueue(user.id)) {
    queue.push(user.id);
  }

  matchmakeQueue();
  emitWaitingList();
  emitPresence();

  return res.json({
    ok: true,
    status: getPresenceStatus(user.id),
    waiting: getWaitingList(),
  });
});

app.post("/api/lobby/queue/leave", authMiddleware, (req, res) => {
  const user = requireUser(req, res);
  if (!user) return;

  removeFromQueue(user.id);
  emitWaitingList();
  emitPresence();

  return res.json({
    ok: true,
    status: getPresenceStatus(user.id),
    waiting: getWaitingList(),
  });
});

app.post("/api/lobby/challenge", authMiddleware, (req, res) => {
  const fromUser = requireUser(req, res);
  if (!fromUser) return;

  cleanupChallenges();

  const toUserId = String(req.body?.toUserId || "").trim();
  if (!toUserId) {
    return res.status(400).json({ error: "toUserId is required" });
  }

  if (toUserId === fromUser.id) {
    return res.status(400).json({ error: "Cannot challenge yourself" });
  }

  const toUser = getUserById(toUserId);
  if (!toUser) {
    return res.status(404).json({ error: "Target user not found" });
  }

  if (isInGame(fromUser.id) || isInGame(toUserId)) {
    return res.status(409).json({ error: "One of users is already in game" });
  }

  for (const challenge of challenges.values()) {
    if (
      challenge.status === "pending" &&
      ((challenge.fromUserId === fromUser.id && challenge.toUserId === toUserId) ||
        (challenge.fromUserId === toUserId && challenge.toUserId === fromUser.id))
    ) {
      return res.status(409).json({ error: "Challenge already pending" });
    }
  }

  const challenge = {
    id: cryptoRandomId(),
    fromUserId: fromUser.id,
    toUserId,
    status: "pending",
    createdAt: nowIso(),
    expiresAt: Date.now() + 60_000,
  };
  challenges.set(challenge.id, challenge);

  io.to(userRoom(toUserId)).emit("lobby:challenge:incoming", {
    id: challenge.id,
    fromUser: publicUser(fromUser),
    createdAt: challenge.createdAt,
    expiresAt: new Date(challenge.expiresAt).toISOString(),
  });

  return res.json({
    ok: true,
    challenge: {
      id: challenge.id,
      toUser: publicUser(toUser),
      createdAt: challenge.createdAt,
      expiresAt: new Date(challenge.expiresAt).toISOString(),
    },
  });
});

app.post("/api/lobby/challenge/respond", authMiddleware, (req, res) => {
  const toUser = requireUser(req, res);
  if (!toUser) return;

  cleanupChallenges();

  const challengeId = String(req.body?.challengeId || "").trim();
  const accept = Boolean(req.body?.accept);

  const challenge = challenges.get(challengeId);
  if (!challenge || challenge.status !== "pending") {
    return res.status(404).json({ error: "Challenge not found or expired" });
  }

  if (challenge.toUserId !== toUser.id) {
    return res.status(403).json({ error: "Not allowed" });
  }

  const fromUser = getUserById(challenge.fromUserId);
  if (!fromUser) {
    challenges.delete(challengeId);
    return res.status(404).json({ error: "Challenger not found" });
  }

  if (!accept) {
    challenge.status = "declined";
    challenges.delete(challengeId);

    io.to(userRoom(fromUser.id)).emit("lobby:challenge:declined", {
      id: challengeId,
      byUser: publicUser(toUser),
    });

    return res.json({ ok: true, declined: true });
  }

  if (isInGame(fromUser.id) || isInGame(toUser.id)) {
    challenges.delete(challengeId);
    return res.status(409).json({ error: "One of users already in game" });
  }

  challenge.status = "accepted";
  challenges.delete(challengeId);

  const game = createAndStartGame(fromUser.id, toUser.id);
  if (!game) {
    return res.status(409).json({ error: "Failed to create game" });
  }

  return res.json({ ok: true, gameId: game.id });
});

app.get("/api/games/:id", authMiddleware, (req, res) => {
  const user = requireUser(req, res);
  if (!user) return;

  const game = getGameById(req.params.id);
  if (!game) {
    return res.status(404).json({ error: "Game not found" });
  }

  if (!isParticipant(game, user.id)) {
    return res.status(403).json({ error: "Forbidden" });
  }

  return res.json({ game: buildGameState(game, user.id) });
});

app.get("/api/history", authMiddleware, (req, res) => {
  const user = requireUser(req, res);
  if (!user) return;

  const games = listGamesByUser(user.id).map((game) => {
    const color = playerColor(game, user.id);
    const opponentId = otherPlayer(game, user.id);
    const opponent = getUserById(opponentId);

    let perspectiveResult = "ongoing";
    if (game.result === "1/2-1/2") perspectiveResult = "draw";
    if (game.result === "1-0") perspectiveResult = color === "white" ? "win" : "loss";
    if (game.result === "0-1") perspectiveResult = color === "black" ? "win" : "loss";

    return {
      id: game.id,
      status: game.status,
      color,
      opponent: publicUser(opponent),
      result: game.result,
      perspectiveResult,
      finishReason: game.finishReason,
      startedAt: game.startedAt,
      finishedAt: game.finishedAt,
      movesCount: Array.isArray(game.moves) ? game.moves.length : 0,
    };
  });

  return res.json({ games });
});

app.get("/api/leaderboard/global", authMiddleware, (_req, res) => {
  return res.json({ leaderboard: buildGlobalLeaderboard() });
});

app.get("/api/leaderboard/daily", authMiddleware, (req, res) => {
  const queryDate = normalizeDateKey(req.query.date);
  const day = queryDate || toDateKey(nowIso(), APP_TIMEZONE);
  return res.json({
    date: day,
    timezone: APP_TIMEZONE,
    leaderboard: buildDailyLeaderboard(day),
  });
});

app.get("/api/leaderboard/daily/winner", authMiddleware, (req, res) => {
  const queryDate = normalizeDateKey(req.query.date);
  const day = queryDate || toDateKey(nowIso(), APP_TIMEZONE);
  const leaderboard = buildDailyLeaderboard(day);
  const winner = leaderboard.length ? leaderboard[0] : null;

  return res.json({
    date: day,
    timezone: APP_TIMEZONE,
    winner,
  });
});

app.use((err, _req, res, next) => {
  if (!err) return next();
  if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
    return res.status(400).json({ error: "Invalid JSON body" });
  }
  return next(err);
});

const publicDir = path.join(__dirname, "..", "public");
app.use(express.static(publicDir));

app.use((req, res, next) => {
  if (req.method !== "GET") return next();
  if (req.path.startsWith("/api") || req.path.startsWith("/socket.io") || req.path === "/health") {
    return next();
  }
  return res.sendFile(path.join(publicDir, "index.html"));
});

io.use((socket, next) => {
  const token = socket.handshake.auth?.token || socket.handshake.query?.token;
  if (!token) {
    return next(new Error("Unauthorized"));
  }

  try {
    const payload = verifyToken(String(token));
    const user = getUserById(payload.uid);
    if (!user) {
      return next(new Error("Unauthorized"));
    }
    socket.data.userId = user.id;
    return next();
  } catch {
    return next(new Error("Unauthorized"));
  }
});

io.on("connection", (socket) => {
  const userId = socket.data.userId;

  if (!onlineSocketsByUser.has(userId)) {
    onlineSocketsByUser.set(userId, new Set());
  }
  onlineSocketsByUser.get(userId).add(socket.id);
  socket.join(userRoom(userId));

  const currentGameId = activeGameByUser.get(userId);
  if (currentGameId) {
    const game = getGameById(currentGameId);
    if (game) {
      socket.emit("game:state", buildGameState(game, userId));
    }
  }

  socket.emit("lobby:waiting", getWaitingList());
  emitPresence();

  socket.on("game:move", (payload = {}) => {
    const gameId = String(payload.gameId || "").trim();
    const from = String(payload.from || "").trim();
    const to = String(payload.to || "").trim();
    const promotion = payload.promotion ? String(payload.promotion).trim() : undefined;

    if (!gameId || !from || !to) {
      socket.emit("error:message", { code: "bad_move_payload", message: "Некорректные данные хода" });
      return;
    }

    const game = getGameById(gameId);
    if (!game || game.status !== "active") {
      socket.emit("error:message", { code: "game_not_found", message: "Партия не найдена" });
      return;
    }

    if (!isParticipant(game, userId)) {
      socket.emit("error:message", { code: "forbidden", message: "Нет доступа к партии" });
      return;
    }

    const chess = new Chess(game.fenCurrent);
    const turnUserId = chess.turn() === "w" ? game.whiteUserId : game.blackUserId;
    if (turnUserId !== userId) {
      socket.emit("game:state", buildGameState(game, userId));
      return;
    }

    const move = chess.move({ from, to, promotion });
    if (!move) {
      socket.emit("error:message", { code: "illegal_move", message: "Нелегальный ход" });
      socket.emit("game:state", buildGameState(game, userId));
      return;
    }

    game.moves.push({
      moveNo: game.moves.length + 1,
      side: move.color,
      from: move.from,
      to: move.to,
      promotion: move.promotion || null,
      uci: `${move.from}${move.to}${move.promotion || ""}`,
      san: move.san,
      fenAfter: chess.fen(),
      createdAt: nowIso(),
    });

    game.fenCurrent = chess.fen();
    game.pgn = chess.pgn();
    game.drawOfferBy = null;
    touchGame(game);

    io.to(userRoom(game.whiteUserId)).emit("game:move:applied", {
      gameId: game.id,
      move: serializeMove(game.moves[game.moves.length - 1]),
    });
    io.to(userRoom(game.blackUserId)).emit("game:move:applied", {
      gameId: game.id,
      move: serializeMove(game.moves[game.moves.length - 1]),
    });

    if (chess.isGameOver()) {
      finishByBoardState(game, chess);
    } else {
      emitGameState(game);
    }
  });

  socket.on("game:draw:offer", (payload = {}) => {
    const gameId = String(payload.gameId || "").trim();
    const game = getGameById(gameId);
    if (!game || game.status !== "active" || !isParticipant(game, userId)) {
      return;
    }

    if (game.drawOfferBy && game.drawOfferBy !== userId) {
      return;
    }

    game.drawOfferBy = userId;
    touchGame(game);

    const opponentId = otherPlayer(game, userId);
    io.to(userRoom(opponentId)).emit("game:draw:offer", {
      gameId: game.id,
      fromUser: publicUser(getUserById(userId)),
    });

    emitGameState(game);
  });

  socket.on("game:draw:respond", (payload = {}) => {
    const gameId = String(payload.gameId || "").trim();
    const accept = Boolean(payload.accept);
    const game = getGameById(gameId);

    if (!game || game.status !== "active" || !isParticipant(game, userId)) {
      return;
    }

    if (!game.drawOfferBy || game.drawOfferBy === userId) {
      return;
    }

    if (accept) {
      finishGame(game, { result: "1/2-1/2", finishReason: "draw_agreed" });
      return;
    }

    game.drawOfferBy = null;
    touchGame(game);
    emitGameState(game);
  });

  socket.on("game:resign", (payload = {}) => {
    const gameId = String(payload.gameId || "").trim();
    const game = getGameById(gameId);

    if (!game || game.status !== "active" || !isParticipant(game, userId)) {
      return;
    }

    const result = userId === game.whiteUserId ? "0-1" : "1-0";
    finishGame(game, { result, finishReason: "resign" });
  });

  socket.on("game:rematch:offer", (payload = {}) => {
    const gameId = String(payload.gameId || "").trim();
    const game = getGameById(gameId);

    if (!game || game.status !== "finished" || !isParticipant(game, userId)) {
      return;
    }

    if (!Array.isArray(game.rematchBy)) {
      game.rematchBy = [];
    }

    if (!game.rematchBy.includes(userId)) {
      game.rematchBy.push(userId);
      touchGame(game);
    }

    const opponentId = otherPlayer(game, userId);

    if (game.rematchBy.includes(opponentId)) {
      const newGame = createAndStartGame(game.whiteUserId, game.blackUserId, {
        whiteUserId: game.blackUserId,
        blackUserId: game.whiteUserId,
      });

      if (newGame) {
        io.to(userRoom(game.whiteUserId)).emit("game:rematch:accepted", {
          fromGameId: game.id,
          newGameId: newGame.id,
        });
        io.to(userRoom(game.blackUserId)).emit("game:rematch:accepted", {
          fromGameId: game.id,
          newGameId: newGame.id,
        });
      }
      return;
    }

    io.to(userRoom(opponentId)).emit("game:rematch:offer", {
      gameId: game.id,
      fromUser: publicUser(getUserById(userId)),
    });

    emitGameState(game);
  });

  socket.on("disconnect", () => {
    const set = onlineSocketsByUser.get(userId);
    if (set) {
      set.delete(socket.id);
      if (set.size === 0) {
        onlineSocketsByUser.delete(userId);
        removeFromQueue(userId);
      }
    }

    emitWaitingList();
    emitPresence();
  });
});

function cryptoRandomId() {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

// ——— Запуск ———
rebuildActiveGameMap();
setInterval(cleanupChallenges, 10_000);

server.listen(PORT, HOST, () => {
  const base = `http://${HOST === "0.0.0.0" ? "localhost" : HOST}:${PORT}`;
  console.log(`Chess Mini App ready — ${base}`);
  console.log(`  Timezone: ${APP_TIMEZONE} | Dev auth: ${ALLOW_DEV_AUTH ? "on" : "off"} | Telegram: ${TELEGRAM_BOT_TOKEN ? "ok" : "not set"}`);
});
